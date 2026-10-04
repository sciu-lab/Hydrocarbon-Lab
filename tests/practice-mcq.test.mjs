import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createPracticeQuestionGenerator, evaluateMultipleChoiceEligibility, assembleMultipleChoiceQuestion, schedulePracticeQuestionType, InsufficientSafeDistractorsError } from "../app/practice-question.ts";
import { validateMultipleChoiceOptions } from "../app/practice-multiple-choice.ts";
import { matchesHydrocarbonReferenceName } from "../app/practice-reference-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, submitPracticeAnswer, nextPracticeQuestion, localizePracticeState, endPractice, startPracticeCorrections, PRACTICE_MCQ_SEARCH_LIMIT } from "../app/practice-session.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery, reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
let chemistry, chemical, distractors, generate, review;
const recipeFixtures = new Map();
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  distractors = createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, distractors); review = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());
const config = (category = "alkane", seed = "MCQ-V1", types = ["multiple-choice"], count = 5, locale = "es") => createPracticeConfig([category], count, locale, seed, types, "basic", 1);
const submit = (state, answer, elapsed = 7000) => submitPracticeAnswer(updatePracticeAnswer(markPracticeQuestionAvailable(state,
  { monotonicMs: 1000, wallTimeMs: 100000 }), answer), state.config.locale, { monotonicMs: 1000 + elapsed, wallTimeMs: 100000 + elapsed });

test("544 real graphs: safe bilingual distractors, eligibility, assembly, provenance and unchanged chemistry", () => {
  const start = performance.now(), stats = {}, recipes = new Set();
  for (const category of EXERCISE_CATEGORIES) {
    const stat = { zero: 0, one: 0, two: 0, eligible: 0, max: 0, failures: 0 };
    for (let seed = 0; seed < 32; seed++) {
      const g = chemical(config(category, `MCQ-SWEEP-${seed}`), 0), original = structuredClone(g);
      const candidates = distractors({ generatedMolecule: g, questionSeed: g.question.seed });
      const n = candidates.length;
      stat[n === 0 ? "zero" : n === 1 ? "one" : n === 2 ? "two" : "eligible"]++;
      stat.max = Math.max(stat.max, n);
      assert.deepEqual(g, original);
      for (const option of candidates) {
        recipes.add(option.origin.diagnosticCode);
        if (n >= 3 && !recipeFixtures.has(option.origin.diagnosticCode)) recipeFixtures.set(option.origin.diagnosticCode, { g, candidates, option });
        for (const locale of ["es", "en"]) assert.equal(matchesHydrocarbonReferenceName(option.name[locale], g.reference.names[locale], locale), false);
      }
      const eligibility = evaluateMultipleChoiceEligibility(g, candidates);
      assert.equal(eligibility.eligible, n >= 3);
      if (n >= 3) {
        const q = assembleMultipleChoiceQuestion(g, candidates);
        assert.equal(q.options.length, 4); assert.equal(q.options.filter((option) => option.correct).length, 1);
        assert.equal(new Set(q.options.filter((option) => !option.correct).map((option) => option.origin.diagnosticCode)).size,
          Math.min(3, new Set(candidates.map((option) => option.origin.diagnosticCode)).size));
        assert.equal(validateMultipleChoiceOptions({ referenceNames: q.reference.names, referenceStructuralIdentity: q.reference.structuralIdentity, options: q.options }).valid, true);
        if (seed % 8 === 0) {
          const en = generate(config(category, `MCQ-SWEEP-${seed}`, ["multiple-choice"], 5, "en"), 0);
          assert.equal(en.optionSetIdentity, q.optionSetIdentity);
          assert.deepEqual(en.molecule, q.molecule);
        }
      } else assert.throws(() => assembleMultipleChoiceQuestion(g, candidates), InsufficientSafeDistractorsError);
    }
    assert.ok(stat.eligible > 0, `${category} requires category config gating if no eligible graphs`);
    stats[category] = stat;
    console.log("MCQ_CATEGORY", category, JSON.stringify(stat));
  }
  assert.deepEqual([...recipes].sort(), ["WRONG_EZ_DESCRIPTOR", "WRONG_PARENT_LENGTH", "WRONG_SUBSTITUENT_LOCANT", "MISSING_SUBSTITUENT", "WRONG_FUNCTIONAL_GROUP_LOCANT", "WRONG_UNSATURATION_LOCANT"].sort());
  console.log("MCQ_SWEEP", JSON.stringify(stats), "elapsedMs", Math.round(performance.now() - start));
});

for (const code of ["WRONG_EZ_DESCRIPTOR", "WRONG_PARENT_LENGTH", "WRONG_SUBSTITUENT_LOCANT", "MISSING_SUBSTITUENT", "WRONG_FUNCTIONAL_GROUP_LOCANT", "WRONG_UNSATURATION_LOCANT"]) {
  test(`${code}: structured positive, known reviewer provenance, bilingual messages and blocked proof`, () => {
    const { g, candidates, option } = recipeFixtures.get(code);
    // Force the known distractor into the three candidates, then assemble normally.
    const alternatives = [option, ...candidates.filter((item) => item.id !== option.id)].slice(0, 3);
    const q = assembleMultipleChoiceQuestion(g, alternatives);
    const state = submit({ phase: "QUESTION", config: config(g.category), index: 0, generationIndex: 0, recentIdentities: [],
      attempts: [], question: q, answer: "", timing: null }, option.id);
    const attempt = { ...state.attempts[0], answer: "Unrelated audit text: provenance determines diagnosis" };
    const model = review(q, attempt);
    assert.equal(model.issues[0].code, code);
    for (const locale of ["es", "en"]) assert.ok(formatPracticeReviewMessage(model.issues[0].messageKey, model.issues[0].params, locale));
    const invalid = { ...option, origin: { ...option.origin, transformation: { ...option.origin.transformation, kind: "wrong" } } };
    assert.equal(evaluateMultipleChoiceEligibility(g, [invalid, ...alternatives.slice(1)]).eligible, false);
    if (code !== "WRONG_EZ_DESCRIPTOR") {
      const unbound = { ...option, origin: { ...option.origin, verification: { ...option.origin.verification, referenceStructuralIdentity: "other" } } };
      assert.equal(evaluateMultipleChoiceEligibility(g, [unbound, ...alternatives.slice(1)]).eligible, false);
    }
  });
}

test("balanced seeded blocks preserve naming-only and work for Endless", () => {
  for (const count of [10, "endless"]) {
    const c = config("alkane", "BALANCE", ["naming", "multiple-choice"], count);
    for (let i = 0; i < 20; i += 2) assert.deepEqual([schedulePracticeQuestionType(c, i), schedulePracticeQuestionType(c, i + 1)].sort(), ["multiple-choice", "naming"]);
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => schedulePracticeQuestionType(c, i)), Array.from({ length: 20 }, (_, i) => schedulePracticeQuestionType({ ...c, locale: "en" }, i)));
  }
  const c = config("alkane", "OLD-NAMING", ["naming"]);
  assert.deepEqual(generate(c, 0), chemical(c, 0));
});

test("bounded eligibility search fails safely and never substitutes a naming question", () => {
  let calls = 0;
  const state = startPractice(config(), () => { calls++; throw new InsufficientSafeDistractorsError(); });
  assert.equal(calls, PRACTICE_MCQ_SEARCH_LIMIT); assert.equal(state.phase, "ERROR"); assert.equal(state.reason, "insufficient-safe-distractors");
  assert.equal(startPractice(config(), (c, i) => chemical(c, i)).phase, "ERROR");
});

test("MCQ correction 1/2/3 keeps exact options, timing, locale, initial metrics and mastery", () => {
  let state = startPractice(config("alcohol", "CORRECTIONS", ["multiple-choice"], "endless"), generate);
  assert.equal(state.phase, "QUESTION");
  const first = state.question;
  state = submit(state, first.options.find((item) => !item.correct).id, 8000);
  assert.equal(state.attempts[0].questionType, "multiple-choice");
  const initial = calculatePracticeMetrics(state.attempts);
  assert.equal(review(first, state.attempts[0]).status, "INCORRECT");
  state = nextPracticeQuestion(state, generate); state = endPractice(state); // unanswered is excluded
  state = startPracticeCorrections(state, generate);
  assert.equal(state.question.optionSetIdentity, first.optionSetIdentity); assert.equal(state.answer, "");
  state = markPracticeQuestionAvailable(state, { monotonicMs: 1000, wallTimeMs: 100000 });
  state = localizePracticeState(updatePracticeAnswer(state, first.options.find((item) => !item.correct).id), "en");
  assert.deepEqual(state.question.molecule, first.molecule);
  assert.equal(state.timing.monotonicMs, 1000); assert.equal(state.question.optionSetIdentity, first.optionSetIdentity);
  state = submitPracticeAnswer(state, "en", { monotonicMs: 4000, wallTimeMs: 103000 });
  assert.equal(state.attempts[1].attemptNumber, 2); assert.equal(state.attempts[1].responseTimeMs, 3000);
  state = nextPracticeQuestion(state, generate); state = startPracticeCorrections(state, generate);
  state = submit(state, state.question.correctOptionId, 2000);
  assert.equal(state.attempts[2].attemptNumber, 3); assert.equal(state.attempts[2].responseTimeMs, 2000);
  assert.deepEqual(calculatePracticeMetrics(state.attempts), initial);
  assert.equal(calculatePracticeMastery(state.attempts).finalMastery, 100);
  assert.equal(review(state.question, state.attempts[2]).status, "CORRECT");
  assert.throws(() => reconstructPracticeCorrection(state.config, { ...state.attempts[0], optionSetIdentity: "tampered" }, generate));
});

test("10-question mixed finite session shares one log and metrics by type", () => {
  let state = startPractice(config("alkane", "MIXED", ["naming", "multiple-choice"], 10), generate);
  for (let i = 0; i < 10; i++) {
    assert.equal(state.phase, "QUESTION");
    const answer = state.question.type === "multiple-choice" ? state.question.correctOptionId : state.question.reference.name;
    state = nextPracticeQuestion(submit(state, answer), generate);
  }
  assert.equal(state.phase, "COMPLETE");
  assert.equal(state.attempts.filter((item) => item.questionType === "naming").length, 5);
  assert.equal(state.attempts.filter((item) => item.questionType === "multiple-choice").length, 5);
  assert.equal(calculatePracticeMastery(state.attempts).finalMastery, 100);
});

test("frozen real eligibility skip reconstructs generationIndex 1, never displayOrdinal 1", () => {
  const c = config("aromatic", "MCQ-SKIP");
  let state = startPractice(c, generate);
  assert.equal(state.generationIndex, 1); assert.equal(state.index, 0);
  assert.equal(state.question.reference.name, "1,2,3-trietilbenceno");
  assert.equal(createHash("sha256").update(state.question.optionSetIdentity).digest("hex"), "8a8d1005311969b048dbd59e3015c84a4f6880ed8e20aaace73340ce62777bd8");
  const original = state.question;
  state = submit(state, original.options.find((option) => !option.correct).id);
  const rebuilt = reconstructPracticeCorrection({ ...c, locale: "en" }, state.attempts[0], generate);
  assert.deepEqual(rebuilt.options, original.options); assert.deepEqual(rebuilt.molecule, original.molecule);
  assert.equal(rebuilt.correctOptionId, original.correctOptionId); assert.equal(rebuilt.question.id, original.question.id);
});

test("empty, duplicate, unverified and equivalent candidates never become eligible", () => {
  const g = chemical(config("alkane", "GUARDS"), 0), candidates = distractors({ generatedMolecule: g, questionSeed: g.question.seed });
  assert.ok(candidates.length >= 3);
  for (const input of [[], [candidates[0], candidates[0], candidates[0]], candidates.map((item) => ({ ...item, origin: { ...item.origin, verification: undefined } })),
    candidates.map((item) => ({ ...item, name: g.reference.names }))]) assert.equal(evaluateMultipleChoiceEligibility(g, input).eligible, false);
  assert.throws(() => distractors({ generatedMolecule: g, questionSeed: "wrong" }));
  const changed = structuredClone(g); changed.reference.structuralIdentity = "wrong";
  assert.deepEqual(distractors({ generatedMolecule: changed, questionSeed: changed.question.seed }), []);
});

test("complete frozen MCQ is identical in a fresh process; expanded generation uses no clock or global entropy", () => {
  const c = config("aromatic", "MCQ-SKIP");
  const q = generate(c, 1);
  const random = Math.random, now = Date.now;
  try {
    Math.random = () => { throw new Error("ambient randomness forbidden"); };
    Date.now = () => { throw new Error("wall clock forbidden"); };
    assert.deepEqual(generate(c, 1), q);
  } finally { Math.random = random; Date.now = now; }
  const script = `import {loadExerciseChemistry} from './tests/helpers/exercise-chemistry.mjs';
    import {createRestrictedChemicalGenerator} from './app/exercise-chemical-generator.ts';
    import {createDeterministicDistractorEngine} from './app/practice-distractor-engine.ts';
    import {createPracticeQuestionGenerator} from './app/practice-question.ts';
    import {createHash} from 'node:crypto';
    const chemistry=await loadExerciseChemistry();
    const generate=createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),createDeterministicDistractorEngine(chemistry.engine,chemistry.oracles));
    console.log(createHash('sha256').update(JSON.stringify(generate(${JSON.stringify(c)},1))).digest('hex'));
    await chemistry.close();`;
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8" }).trim();
  assert.equal(output, createHash("sha256").update(JSON.stringify(q)).digest("hex"));
});

test("MCQ rejects stale selections without starting a submission or changing metrics", () => {
  const state = markPracticeQuestionAvailable(startPractice(config("alcohol", "INVALID-SELECTION"), generate), { monotonicMs: 0, wallTimeMs: 0 });
  const invalid = updatePracticeAnswer(state, "not-an-option-id");
  assert.equal(submitPracticeAnswer(invalid, "es", { monotonicMs: 1, wallTimeMs: 1 }), invalid);
  assert.equal(invalid.attempts.length, 0);
});

test("reconstruction rejects changed actual order/provenance/correct ID even with an unchanged claimed signature", () => {
  const c = config("alcohol", "PAYLOAD-INTEGRITY"), original = startPractice(c, generate);
  const attempt = submit(original, original.question.options.find((option) => !option.correct).id).attempts[0];
  for (const mutate of [q => ({ ...q, options: [...q.options].reverse() }), q => ({ ...q, correctOptionId: "other" }),
    q => ({ ...q, options: q.options.map(option => option.kind === "reference" ? option : { ...option, origin: { ...option.origin, recipeId: "changed" } }) })]) {
    assert.throws(() => reconstructPracticeCorrection(c, attempt, (config, index, context) => mutate(generate(config, index, context))));
  }
});

test("restricted producers reject unavailable or inconsistent oracles", () => {
  const g = chemical(config("alkane", "ORACLE-GUARDS"), 0), input = { generatedMolecule: g, questionSeed: g.question.seed };
  for (const reference of [() => { throw new Error("unavailable"); }, molecule => ({ ...chemistry.oracles.reference(molecule), namingSupported: false }),
    molecule => ({ ...chemistry.oracles.reference(molecule), names: { es: "wrong", en: "wrong" } })]) {
    assert.deepEqual(createDeterministicDistractorEngine(chemistry.engine, { ...chemistry.oracles, reference })(input), []);
  }
});

test("Phase 7 core passes strict TypeScript checking", async () => {
  const ts = await import("typescript"), { fileURLToPath } = await import("node:url");
  const paths = ["practice-question.ts", "practice-distractor-recipes.ts", "practice-session.ts", "practice-attempt.ts", "practice-corrections.ts", "practice-review.ts", "practice-multiple-choice.ts"]
    .map(name => fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const program = ts.createProgram(paths, { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => !d.file || paths.includes(d.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
