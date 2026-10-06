import assert from "node:assert/strict";
import { before, after, test as nodeTest } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES, GENERATOR_VERSION, SUPPORTED_GENERATOR_VERSIONS, normalizeSessionConfig } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity, ChemicalGenerationError } from "../app/exercise-chemical-generator.ts";
import { validateExerciseChemistry } from "../app/exercise-domain.ts";
import { validateEasyExercise, validateEasyParent } from "../app/exercise-easy-profile.ts";
import { validateIntermediateExercise, validateIntermediateParent } from "../app/exercise-intermediate-profile.ts";
import { validateHardFoundationExercise, HARD_FOUNDATION_FAMILIES } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion, InsufficientSafeDistractorsError } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator, createBuildSubmissionValidator } from "../app/practice-structural-answer.ts";
import { evaluateSessionAnswer } from "../app/session-answer-evaluation.ts";
import { normalizeReferenceNameTypography } from "../app/practice-reference-answer.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, updatePracticeStructure,
  submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion, localizePracticeState, startPracticeCorrections, endPractice, retryPracticeGeneration } from "../app/practice-session.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure, navigateExam, submitExam, localizeExamState } from "../app/exam-session.ts";
import { PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT, getExerciseUniquenessKey } from "../app/session-question-selection.ts";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";

// CI retains a small cross-level sample. D8_DEEP=1 runs the reproducible release
// audit without adding its stress matrix to every npm test invocation.
const deep = process.env.D8_DEEP === "1", types = ["naming", "multiple-choice", "build"];
const categories = deep ? EXERCISE_CATEGORIES : ["alkane", "alcohol", "aromatic", "ez"];
// D8 release captures: three fresh processes agreed ES/ES/EN before freezing.
const CURRENT_MIXED_PLAN_DIGESTS = {
  "basic": {
    "practice": "35ed2b9289ab1c720e360bf60b6bb8b47737e773ce90ecdbbf0ed069a06a979f",
    "exam": "07cdd66f332578b442f6acd306173d1dbe96ee952cf3b60a62ab9b24d0be06ec"
  },
  "intermediate": {
    "practice": "19f3e8d00057ae1bdfd8753a988ea7bfc7c73ebb5783b312fa2cd7f6b9555fe8",
    "exam": "9040cc00c9be312b665caa824bcc776d07086a898750abb5419fb1390c2f9e10"
  },
  "advanced": {
    "practice": "69e77011a73379ba12cc518f32e752f4acc7caede194ac61f5bed479b498de95",
    "exam": "2f72500a796fc4830291fcde922103e26f649f7ad83fb0fd8b44f9c6284039b4"
  }
};
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const time = ms => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
const stats = { deep, generatorVersion: 4, cells: [], families: {}, generationContexts: 0, localePairs: 0,
  namingChecks: 0, mcqQuestions: 0, localizedOptions: 0, mcqCapabilityRejects: 0, mcqExhaustions: [],
  buildComparisons: 0, reviewerModels: 0, fragmentNames: 0, sessions: [], endlessExhaustions: [], finiteExhaustions: [], violations: [] };
let chemistry, chemical, generate, evaluate, validate, review, examUI, begin;
let context = {};
function test(name, run) {
  nodeTest(name, () => {
    try { run(); }
    catch (error) {
      stats.violations.push({ ...context, test: name, expected: error.expected, actual: error.actual, message: error.message });
      throw error;
    }
  });
}
before(async () => {
  begin = performance.now(); chemistry = await loadExerciseChemistry();
  chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
  review = createPracticeReviewer(chemistry.engine); examUI = await chemistry.loadModule("/app/exam-panel.tsx");
});
after(async () => {
  stats.elapsedMs = performance.now() - begin;
  mkdirSync("outputs/difficulty-d8", { recursive: true });
  writeFileSync(`outputs/difficulty-d8/${deep ? "deep" : "permanent"}-sweep.json`, JSON.stringify(stats, null, 2));
  await chemistry?.close();
});
const configFor = (category, difficulty, seed, count = 5) => createPracticeConfig([category], count, "es", seed, ["naming"], difficulty, 4);
const neutralPayload = q => ({ ...q, reference: { ...q.reference, name: q.reference.names.es } });
function target(q, c, generationIndex = 0) {
  context = { mode: c.mode, difficulty: c.difficulty, generatorVersion: c.generatorVersion, category: q.category,
    questionType: q.type ?? "naming", locale: c.locale, seed: c.seed, generationIndex, questionId: q.question.id };
  assert.equal(q.question.generatorVersion, 4); assert.ok(c.categories.includes(q.category));
  assert.ok(validateExerciseChemistry(q.molecule, chemistry.oracles).valid);
  assert.equal(q.reference.structuralIdentity, exerciseStructuralIdentity(q.molecule));
  assert.equal(classifyMinimumExerciseDifficulty(q.molecule, q.category, chemistry.oracles), c.difficulty);
  const reference = chemistry.oracles.reference(q.molecule);
  assert.deepEqual(q.reference.names, reference.names);
  if (c.difficulty === "basic") {
    assert.ok(validateEasyExercise(q.molecule, q.category, chemistry.oracles).valid);
    assert.ok(validateEasyParent(q.molecule, q.category, reference).valid);
  } else if (c.difficulty === "intermediate") {
    assert.ok(validateIntermediateExercise(q.molecule, q.category, chemistry.oracles).valid);
    assert.ok(validateIntermediateParent(q.molecule, q.category, reference).valid);
  } else {
    const hard = validateHardFoundationExercise(q.molecule, q.category, chemistry.oracles);
    assert.ok(hard.valid); assert.equal(q.generation.family, hard.evidence.family);
    stats.families[q.generation.family] ??= { category: q.category, seed: c.seed, generationIndex };
  }
}
function modelCheck(q, attempt, locale) {
  const model = review(q, attempt), atoms = new Set(q.molecule.atoms.map(a => a.id));
  const bonds = new Set(q.molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
  assert.ok(model.steps.length); assert.equal(model.reference.structuralIdentity, q.reference.structuralIdentity);
  for (const item of [...model.steps, ...model.issues]) {
    const copy = formatPracticeReviewMessage(item.messageKey, item.params, locale);
    assert.ok(copy); assert.doesNotMatch(copy, /review\.|WRONG_|UNKNOWN_|undefined|NaN|\{\w+\}/);
    assert.ok((item.highlightAtomIds ?? item.relatedAtomIds).every(id => atoms.has(id)));
    assert.ok((item.highlightBondIds ?? item.relatedBondIds).every(id => bonds.has(id)));
  }
  stats.reviewerModels++;
  return model;
}
function fragments(q, locale) {
  const analysis = chemistry.engine.analyzeMolecule(q.molecule);
  const es = chemistry.engine.buildIupacReasoningSteps(q.molecule, analysis);
  const steps = locale === "en" ? chemistry.engine.buildEnglishReasoningSteps(es, q.molecule, analysis) : es;
  const name = q.reference.names[locale], raw = deriveReasoningNameFragments({ analysis, displayedName: name,
    generatedNames: Object.values(q.reference.names), language: locale, steps, canHighlight: true });
  const parts = buildReasoningNameLinkParts(name, raw, steps);
  assert.equal(parts.map(p => p.text).join(""), name);
  for (const f of Object.values(raw).flatMap(f => [f, ...f.additionalFragments ?? []])) {
    const start = f.start ?? name.indexOf(f.text); assert.ok(start >= 0); assert.ok(f.text);
    assert.equal(name.slice(start, start + f.text.length), f.text); assert.ok(start + f.text.length <= name.length);
  }
  stats.fragmentNames++;
}
function redraw(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 4000 + i * 17]));
  return { atoms: m.atoms.map(a => ({ ...a, id: ids.get(a.id), x: -2 * a.y + 8, y: 2 * a.x - 7 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
    rings: m.rings.map(r => ({ ...r, atomIds: r.atomIds.map(id => ids.get(id)).reverse() })) };
}
function answer(s, correct = true, ms = 0) {
  s = markPracticeQuestionAvailable(s, time(ms)); const q = s.question;
  if (q.type === "build") {
    const wrong = moleculeFromSmiles("CC"); assert.ok(wrong.ok);
    return submitPracticeStructure(updatePracticeStructure(s, correct ? q.molecule : wrong.molecule), s.config.locale, time(ms + 100), evaluate);
  }
  return submitPracticeAnswer(updatePracticeAnswer(s, q.type === "multiple-choice" ? q.options.find(o => o.correct === correct).id
    : correct ? q.reference.names[s.config.locale] : q.reference.names[s.config.locale] + "x"), s.config.locale, time(ms + 100));
}
function finite(c) {
  let calls = [];
  const tracked = (config, index, selection) => { const q = generate(config, index, selection); calls.push({ index, key: getExerciseUniquenessKey(q) }); return q; };
  let s = startPractice(c, tracked); const seen = new Set();
  for (let i = 0; i < c.questionCount && s.phase === "QUESTION"; i++) {
    target(s.question, c, s.generationIndex); const key = getExerciseUniquenessKey(s.question); assert.ok(!seen.has(key)); seen.add(key);
    assert.equal(s.index, i); calls = []; s = nextPracticeQuestion(answer(s, true, i * 1000), tracked);
  }
  if (s.phase === "ERROR") {
    assert.equal(s.reason, "insufficient-unique-questions"); assert.equal(calls.length, PRACTICE_DUPLICATE_LIMIT);
    assert.ok(calls.every(call => s.usedExerciseKeys.includes(call.key))); assert.equal(s.index, s.attempts.length);
    assert.equal(calls.at(-1).index + 1, s.generationIndex); assert.deepEqual(s.config, c);
    stats.finiteExhaustions.push({ mode: "practice", difficulty: c.difficulty, categories: c.categories, seed: c.seed,
      displayOrdinal: s.index + 1, generationIndex: s.generationIndex, rejectedIndices: calls.map(call => call.index) });
  }
  stats.sessions.push({ mode: "practice", difficulty: c.difficulty, categories: c.categories, count: c.questionCount, seed: c.seed,
    phase: s.phase, questions: s.attempts.length, reason: s.reason });
  assert.ok(s.attempts.every(a => a.correct));
  return s;
}

test("D8 defaults, canonical IDs, versions and malformed selections fail closed", () => {
  assert.equal(GENERATOR_VERSION, 4); assert.deepEqual(SUPPORTED_GENERATOR_VERSIONS, [1, 2, 3, 4]);
  for (const build of [createPracticeConfig, createExamConfig]) {
    const c = build(["alcohol"], 5, "es", "D8-DEFAULT");
    assert.equal(c.difficulty, "basic"); assert.equal(c.generatorVersion, 4);
    const legacy = { ...c }; delete legacy.difficulty; assert.deepEqual(normalizeSessionConfig(legacy), c);
    for (const difficulty of ["easy", "hard", "expert", "", undefined]) assert.throws(() => normalizeSessionConfig({ ...c, difficulty }));
    for (const generatorVersion of [0, 5, "4"]) assert.throws(() => normalizeSessionConfig({ ...c, generatorVersion }));
    for (const categories of [["mixed"], ["unknown"], []]) assert.throws(() => normalizeSessionConfig({ ...c, categories }));
    assert.throws(() => normalizeSessionConfig({ ...c, questionTypes: ["unknown"] }));
  }
});

for (const difficulty of EXERCISE_DIFFICULTIES) test(`D8 ${difficulty}: production profiles, locale, grading, MCQ, Build and Reviewer`, () => {
  for (const category of categories) {
    if (difficulty === "basic" && category === "ez") {
      assert.throws(() => chemical(configFor(category, difficulty, "D8-UNSUPPORTED"), 0), e => e instanceof ChemicalGenerationError && e.code === "unsupported-request");
      stats.cells.push({ difficulty, category, status: "N/A: Easy excludes explicit E/Z" }); continue;
    }
    const cell = { difficulty, category, seedPrefix: "D8-HEALTH", generated: 0, mcqAccepted: 0, chemicalAttempts: 0, maxChemicalAttempts: 0 };
    const start = performance.now();
    for (let seed = 0; seed < (deep ? 8 : 1); seed++) {
      const c = configFor(category, difficulty, `D8-HEALTH:${seed}`), q = chemical(c, 11); target(q, c, 11);
      cell.generated++; stats.generationContexts++; cell.chemicalAttempts += q.generation.attempt + 1;
      cell.maxChemicalAttempts = Math.max(cell.maxChemicalAttempts, q.generation.attempt + 1);
      assert.deepEqual(chemical(c, 11), q);
      if (seed < (deep ? 3 : 1)) {
        assert.deepEqual(neutralPayload(chemical({ ...c, locale: "en" }, 11)), neutralPayload(q)); stats.localePairs++;
      }
      for (const locale of ["es", "en"]) {
        const localized = { ...q, reference: { ...q.reference, name: q.reference.names[locale] } };
        assert.equal(evaluateSessionAnswer(localized, q.reference.names[locale], locale).correct, true);
        assert.equal(evaluateSessionAnswer(localized, q.reference.names[locale] + "x", locale).correct, false); stats.namingChecks += 2;
        if (seed === 0) {
          for (const correct of [true, false]) {
            const attempt = createInitialAttempt({ question: q, generationIndex: 11, displayOrdinal: 7, locale, correct,
              answer: correct ? q.reference.names[locale] : "uninterpretable answer with several errors", started: time(0), submitted: time(100) });
            const model = modelCheck(q, attempt, locale);
            if (correct) assert.deepEqual(model.issues, []); else assert.equal(model.issues[0].code, "UNKNOWN_MISMATCH");
          }
          fragments(q, locale);
        }
      }
      if (seed === 0) {
        const compare = m => { stats.buildComparisons++; return evaluate({ referenceMolecule: q.molecule, submittedMolecule: m, category, config: c }); };
        assert.equal(compare(q.molecule).status, "EQUIVALENT"); assert.equal(compare(redraw(q.molecule)).status, "EQUIVALENT");
        const wrong = moleculeFromSmiles(q.molecule.atoms.length === 2 ? "CCC" : "CC"); assert.ok(wrong.ok);
        const result = compare(wrong.molecule); assert.ok(result.checks.submissionValid); assert.equal(result.correct, false);
      }
    }
    for (let seed = 0; seed < (deep ? 5 : 1); seed++) {
      const c = configFor(category, difficulty, `D8-MCQ:${seed}`); let q, index = 0;
      for (; index < PRACTICE_MCQ_SEARCH_LIMIT; index++) {
        try { q = generate(c, index, { questionType: "multiple-choice", displayIndex: 0 }); break; }
        catch (e) { if (!(e instanceof InsufficientSafeDistractorsError)) throw e; stats.mcqCapabilityRejects++; }
      }
      if (!q) {
        // Easy's tiny benzene/toluene space is a documented capability boundary.
        assert.equal(difficulty, "basic"); assert.equal(category, "aromatic");
        stats.mcqExhaustions.push({ difficulty, category, seed: c.seed, attempts: index }); continue;
      }
      target(q, c, index); assert.ok(validateMultipleChoiceQuestion(q)); assert.equal(q.options.length, 4);
      assert.equal(q.options.filter(o => o.correct).length, 1); stats.mcqQuestions++; cell.mcqAccepted++;
      assert.deepEqual(generate(c, index, { questionType: "multiple-choice", displayIndex: 0 }), q);
      assert.deepEqual(generate({ ...c, locale: "en" }, index, { questionType: "multiple-choice", displayIndex: 0 }).options, q.options);
      for (const locale of ["es", "en"]) {
        assert.equal(new Set(q.options.map(o => normalizeReferenceNameTypography(o.name[locale], locale))).size, 4);
        for (const o of q.options) {
          assert.equal(evaluateSessionAnswer(q, o.id, locale).correct, o.correct);
          const naming = { ...q, type: "naming", reference: { ...q.reference, name: q.reference.names[locale] } };
          assert.equal(evaluateSessionAnswer(naming, o.name[locale], locale).correct, o.correct); stats.localizedOptions++;
        }
      }
    }
    cell.elapsedMs = performance.now() - start; stats.cells.push(cell);
  }
});

test("D8 all levels: finite sessions, bounded Endless, atomic Exam, corrections and stored Review", () => {
  for (const difficulty of EXERCISE_DIFFICULTIES) {
    if (deep) for (const category of EXERCISE_CATEGORIES.filter(c => difficulty !== "basic" || c !== "ez")) {
      // Easy aromatic contains only benzene/toluene; request its actual capacity.
      const count = difficulty === "basic" && category === "aromatic" ? 2 : 5;
      const c = configFor(category, difficulty, "D8-FINITE", count), practice = finite(c);
      if (practice.phase !== "COMPLETE") {
        assert.ok(["simple-carbocycle", "aromatic"].includes(category));
        assert.equal(practice.phase, "ERROR"); assert.equal(practice.reason, "insufficient-unique-questions");
      }
      const examCalls = [];
      const exam = startExam({ ...c, mode: "exam" }, (config, index, selection) => {
        const q = generate(config, index, selection); examCalls.push({ index, ordinal: selection.displayIndex, key: getExerciseUniquenessKey(q) }); return q;
      });
      stats.sessions.push({ mode: "exam", difficulty, categories: c.categories, count, seed: c.seed,
        phase: exam.phase, questions: exam.phase === "EXAM_QUESTION" ? exam.plan.slots.length : 0, reason: exam.reason });
      assert.deepEqual(exam.attempts, []);
      if (exam.phase !== "EXAM_QUESTION") {
        assert.ok(["simple-carbocycle", "aromatic"].includes(category)); assert.equal(exam.reason, "insufficient-unique-questions");
        assert.ok(!("plan" in exam)); const rejected = examCalls.slice(-PRACTICE_DUPLICATE_LIMIT), ordinal = rejected[0].ordinal;
        const accepted = new Map(); for (const call of examCalls.filter(call => call.ordinal < ordinal)) accepted.set(call.ordinal, call.key);
        assert.equal(rejected.length, PRACTICE_DUPLICATE_LIMIT); assert.ok(rejected.every(call => call.ordinal === ordinal && [...accepted.values()].includes(call.key)));
        stats.finiteExhaustions.push({ mode: "exam", difficulty, categories: c.categories, seed: c.seed,
          displayOrdinal: ordinal + 1, rejectedIndices: rejected.map(call => call.index) });
      } else assert.equal(new Set(exam.plan.slots.map(s => getExerciseUniquenessKey(s.question))).size, count);
    }
    if (deep) for (const count of [10, 20, 30]) {
      const c = createPracticeConfig(["alkane", "alcohol", "ester", "nitrile"], count, "es", "D8-LENGTH", ["naming"], difficulty, 4);
      assert.equal(finite(c).phase, "COMPLETE");
    }
    if (deep) {
      const c = createPracticeConfig(["alkane", "alcohol", "ester"], "endless", "es", "D8-ENDLESS", ["naming"], difficulty, 4);
      let calls = [];
      const tracked = (config, index, selection) => {
        const q = generate(config, index, selection); calls.push({ index, key: getExerciseUniquenessKey(q) }); return q;
      };
      const recover = state => {
        // Emulate the existing explicit Retry action; never enlarge the engine's
        // duplicate budget or replace the seed/configuration to obtain a pass.
        for (let retry = 0; state.phase === "ERROR" && retry < 4; retry++) {
          context = { difficulty, generatorVersion: 4, categories: c.categories, questionType: "naming", locale: c.locale,
            seed: c.seed, generationIndex: state.generationIndex, displayOrdinal: state.index + 1 };
          assert.equal(state.reason, "insufficient-unique-questions"); assert.deepEqual(state.config, c);
          assert.equal(calls.length, PRACTICE_DUPLICATE_LIMIT);
          assert.ok(calls.every(call => state.usedExerciseKeys.includes(call.key)));
          assert.equal(calls.at(-1).index + 1, state.generationIndex);
          stats.endlessExhaustions.push({ ...context, reason: state.reason, rejectedIndices: calls.map(call => call.index),
            acceptedAttempts: state.attempts.length, retry });
          const previous = state; calls = []; state = retryPracticeGeneration(state, tracked);
          assert.equal(state.index, previous.index); assert.equal(state.attempts, previous.attempts); assert.deepEqual(state.config, c);
        }
        assert.equal(state.phase, "QUESTION"); return state;
      };
      let s = recover(startPractice(c, tracked));
      for (let i = 0; i < 60; i++) {
        target(s.question, c, s.generationIndex); assert.equal(s.attempts.length, i);
        assert.ok(s.usedExerciseKeys.length <= PRACTICE_RECENT_LIMIT); assert.ok(s.recentIdentities.length <= PRACTICE_RECENT_LIMIT);
        assert.equal(new Set(s.usedExerciseKeys).size, s.usedExerciseKeys.length);
        calls = []; s = recover(nextPracticeQuestion(answer(s, true, i * 1000), tracked));
      }
      assert.equal(s.phase, "QUESTION"); assert.equal(endPractice(s).phase, "COMPLETE");
      stats.sessions.push({ mode: "practice", difficulty, categories: c.categories, count: "endless", seed: c.seed, phase: s.phase, questions: 60 });
    }
    const c = createPracticeConfig(["alkane", "alcohol", "ester"], 6, "es", "D8-LIFECYCLE", types, difficulty, 4);
    let s = startPractice(c, generate); const saved = [];
    for (let i = 0; i < 6; i++) {
      assert.equal(s.phase, "QUESTION"); saved.push(s.question); target(s.question, c, s.generationIndex);
      const localized = localizePracticeState(s, "en"); assert.deepEqual(neutralPayload(localized.question), neutralPayload(s.question));
      assert.equal(localized.config.difficulty, difficulty); assert.equal(localized.generationIndex, s.generationIndex);
      s = nextPracticeQuestion(answer(localized, false, i * 1000), generate);
    }
    assert.equal(s.phase, "COMPLETE");
    assert.equal(digest(saved.map(q => digest(neutralPayload(q)))), CURRENT_MIXED_PLAN_DIGESTS[difficulty].practice);
    const initial = structuredClone(s.attempts);
    const original = buildCompletedSessionReview(s); assert.ok(original.ok);
    s = startPracticeCorrections(s, generate);
    for (let i = 0; i < 6; i++) {
      assert.equal(s.phase, "CORRECTION_QUESTION"); assert.equal(s.config.difficulty, difficulty); assert.equal(s.config.generatorVersion, 4);
      assert.deepEqual(neutralPayload(s.question), neutralPayload(saved[i]));
      s = nextPracticeQuestion(answer(s, true, 10000 + i * 1000), generate);
    }
    assert.equal(s.phase, "CORRECTION_SUMMARY"); assert.deepEqual(s.attempts.slice(0, 6), initial);
    assert.ok(s.attempts.slice(6).every(a => a.correct && a.attemptNumber === 2));
    const completed = buildCompletedSessionReview(s); assert.ok(completed.ok);
    assert.deepEqual(completed.model.initialResults, original.model.initialResults);
    for (const entry of completed.model.questions) {
      const restored = reconstructSessionReviewQuestion(normalizeSessionConfig(JSON.parse(JSON.stringify(completed.model.config))), entry, generate);
      assert.ok(restored.ok); assert.deepEqual(neutralPayload(restored.detail.question), neutralPayload(saved[entry.displayOrdinal - 1]));
    }
    stats.sessions.push({ mode: "practice", difficulty, categories: c.categories, count: 6, seed: c.seed, phase: s.phase, questions: 6, corrections: 6 });
    let exam = startExam({ ...c, mode: "exam" }, generate); assert.equal(exam.phase, "EXAM_QUESTION");
    const plan = exam.plan; assert.ok(Object.isFrozen(plan));
    assert.equal(digest(plan.slots.map(slot => digest(neutralPayload(slot.question)))), CURRENT_MIXED_PLAN_DIGESTS[difficulty].exam);
    for (let i = 0; i < 6; i++) {
      const slot = plan.slots[i], q = slot.question; target(q, { ...c, mode: "exam" }, slot.generationIndex);
      exam = markExamQuestionAvailable(exam, time(i * 1000), { index: i, questionId: slot.questionIdentity });
      exam = q.type === "build" ? updateExamStructure(exam, q.molecule, validate)
        : updateExamAnswer(exam, q.type === "multiple-choice" ? q.correctOptionId : q.reference.names.es);
      const draft = exam.drafts[i], timings = exam.timings, visit = exam.activeVisit;
      exam = localizeExamState(exam, "en"); assert.equal(exam.plan, plan); assert.deepEqual(exam.drafts[i], draft);
      assert.equal(exam.timings, timings); assert.equal(exam.activeVisit, visit);
      exam = localizeExamState(exam, "es"); assert.deepEqual(exam.attempts, []);
      if (i > 0) { exam = navigateExam(exam, i - 1, time(i * 1000 + 200)); exam = navigateExam(exam, i, time(i * 1000 + 300)); assert.deepEqual(exam.drafts[i], draft); }
      exam = navigateExam(exam, i + 1, time(i * 1000 + 500));
    }
    assert.equal(exam.phase, "EXAM_REVIEW");
    const failed = submitExam(exam, "es", time(7000), () => { throw Error("D8 controlled grading failure"); });
    assert.equal(failed.phase, "EXAM_REVIEW"); assert.deepEqual(failed.attempts, []);
    exam = submitExam(failed, "es", time(8000), evaluate); assert.equal(exam.phase, "EXAM_RESULTS");
    assert.ok(exam.attempts.every(a => a.correct)); assert.equal(submitExam(exam, "es", time(9000), evaluate), exam);
    const final = buildCompletedSessionReview(exam); assert.ok(final.ok);
    for (const entry of final.model.questions) assert.ok(reconstructSessionReviewQuestion(final.model.config, entry,
      () => { throw Error("Exam must use frozen plan"); }, plan.slots[entry.displayOrdinal - 1].question).ok);
    stats.sessions.push({ mode: "exam", difficulty, categories: c.categories, count: 6, seed: c.seed, phase: exam.phase, questions: 6 });
  }
});

test("D8 all current levels Exam renderer hides answers and correctness before Submit for all types/locales", () => {
  const noop = () => {}, actions = { answer: noop, structure: noop, available: noop, go: noop, submit: noop, configure: noop, back: noop, review: noop, results: noop };
  for (const difficulty of EXERCISE_DIFFICULTIES) for (const locale of ["es", "en"]) for (const type of types) {
    let s = startExam(createExamConfig(["amide"], 1, locale, "D8-PRIVACY", [type], difficulty, 4), generate);
    assert.equal(s.phase, "EXAM_QUESTION"); const q = s.plan.slots[0].question, plan = structuredClone(s.plan); let editor;
    context = { mode: "exam", difficulty, generatorVersion: 4, category: "amide", questionType: type, locale, seed: "D8-PRIVACY",
      generationIndex: s.plan.slots[0].generationIndex, questionId: q.question.id };
    const render = () => renderToStaticMarkup(React.createElement(examUI.ExamSessionView, { state: s, language: locale, actions,
      review, renderStructure: () => { assert.notEqual(type, "build"); return React.createElement("div"); },
      renderBuilder: props => { editor = props; return React.createElement("div", { "data-student-editor": true }); } }));
    const html = render(); assert.doesNotMatch(html, /practice-feedback|practice-review|is-correct|is-incorrect|correctOptionId|data-correct|diagnosticCode|WRONG_|UNKNOWN_|mcq:reference/);
    if (type === "naming") for (const name of Object.values(q.reference.names)) assert.ok(!html.includes(name));
    if (type === "multiple-choice") { assert.equal((html.match(/type="radio"/g) ?? []).length, 4); assert.doesNotMatch(html, /checked=""/); }
    if (type === "build") { assert.equal(editor.initialMolecule, undefined); assert.equal(editor.hideCategory, true); assert.ok(!("target" in editor)); assert.ok(!("referenceMolecule" in editor)); }
    s = markExamQuestionAvailable(s, time(0), { index: 0, questionId: s.plan.slots[0].questionIdentity });
    s = type === "build" ? updateExamStructure(s, q.molecule, validate) : updateExamAnswer(s, type === "multiple-choice" ? q.correctOptionId : "D8 draft");
    s = navigateExam(s, 1, time(100)); assert.equal(s.phase, "EXAM_REVIEW");
    const neutral = render(); for (const name of Object.values(q.reference.names)) assert.ok(!neutral.includes(name));
    assert.doesNotMatch(neutral, /practice-feedback|is-correct|is-incorrect|correctOptionId|data-correct|WRONG_|UNKNOWN_/);
    assert.deepEqual(s.attempts, []); assert.deepEqual(s.plan, plan);
  }
});

test("D8 forced chemical failure remains bounded and never falls back between levels", () => {
  for (const difficulty of EXERCISE_DIFFICULTIES) {
    context = { mode: "practice", difficulty, generatorVersion: 4, category: "alcohol", questionType: "naming", locale: "es", seed: "D8-EXHAUSTION", generationIndex: 0 };
    const failing = createRestrictedChemicalGenerator({ ...chemistry.oracles, findMoleculeValenceViolation: () => "D8 forced invalid valence" });
    assert.throws(() => failing(configFor("alcohol", difficulty, "D8-EXHAUSTION"), 0), e => {
      assert.equal(e.code, "attempts-exhausted"); assert.equal(e.rejections.length, 16); return true;
    });
  }
});

if (deep) test("D8 deep sweep accounts for all 17 Hard routes and 22 certified families", () => {
  assert.equal(stats.cells.filter(c => c.difficulty === "advanced").length, 17);
  assert.deepEqual(Object.keys(stats.families).sort(), HARD_FOUNDATION_FAMILIES.map(f => f.id).sort());
});
