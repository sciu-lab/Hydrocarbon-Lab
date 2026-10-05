import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES, GENERATOR_VERSION, SUPPORTED_GENERATOR_VERSIONS, normalizeSessionConfig, serializeSessionConfig } from "../app/exercise-model.ts";
import { exerciseGenerationProfile } from "../app/exercise-generation-profile.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity, ChemicalGenerationError, MAX_CHEMICAL_GENERATION_ATTEMPTS } from "../app/exercise-chemical-generator.ts";
import { buildAdvancedChemicalCandidate, ADVANCED_RECIPE_FAMILIES } from "../app/exercise-advanced-candidate.ts";
import { validateHardFoundationExercise, HARD_FOUNDATION_FAMILIES } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { validateExerciseChemistry } from "../app/exercise-domain.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { validateIntermediateExercise } from "../app/exercise-intermediate-profile.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { evaluateSessionAnswer } from "../app/session-answer-evaluation.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { deriveUnsaturationNameContributions } from "../app/reasoning-name-fragments.ts";
import { inspectDoubleBondStereochemistry, setDoubleBondGeometry } from "../app/double-bond-stereochemistry.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, chemical, generate, evaluate, validate, review;
const stats = {}, families = new Set();
const config = (category, seed = "D5-CONTRACT", difficulty = "advanced") =>
  createPracticeConfig([category], 5, "es", seed, ["naming"], difficulty, 4);
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
  review = createPracticeReviewer(chemistry.engine);
});
after(async () => {
  mkdirSync("outputs/difficulty-d5-v4", { recursive: true });
  writeFileSync("outputs/difficulty-d5-v4/chemical-sweep.json", JSON.stringify({ stats, families: [...families].sort() }, null, 2));
  await chemistry?.close();
});
function assertHard(q) {
  const h = validateHardFoundationExercise(q.molecule, q.category, chemistry.oracles);
  assert.ok(h.valid, h.reason); assert.equal(h.evidence.family, q.generation.family);
  assert.equal(classifyMinimumExerciseDifficulty(q.molecule, q.category, chemistry.oracles), "advanced");
  assert.equal(validateEasyExercise(q.molecule, q.category, chemistry.oracles).valid, false);
  assert.equal(validateIntermediateExercise(q.molecule, q.category, chemistry.oracles).valid, false);
  assert.ok(validateExerciseChemistry(q.molecule, chemistry.oracles).valid);
  assert.equal(q.reference.structuralIdentity, exerciseStructuralIdentity(q.molecule));
  assert.equal(q.generation.domainVersion, 3); assert.equal(q.question.generatorVersion, 4);
  assert.ok(q.reference.names.es && q.reference.names.en); families.add(h.evidence.family);
  return h.evidence;
}
function redraw(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 2000 + i * 17]));
  return { atoms: m.atoms.map(a => ({ ...a, id: ids.get(a.id), x: -2 * a.y + 8, y: 2 * a.x - 7 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
    rings: m.rings.map(r => ({ ...r, atomIds: r.atomIds.map(id => ids.get(id)).reverse() })) };
}

test("v4 is the single current version; strict IDs, serialization and historical dispatch remain explicit", () => {
  assert.equal(GENERATOR_VERSION, 4); assert.deepEqual(SUPPORTED_GENERATOR_VERSIONS, [1, 2, 3, 4]);
  for (const difficulty of ["basic", "intermediate", "advanced"]) {
    const c = config("alcohol", "D5-MODEL", difficulty);
    assert.deepEqual(normalizeSessionConfig(JSON.parse(serializeSessionConfig(c))), c);
    assert.equal(exerciseGenerationProfile(c), { basic: "easy", intermediate: "intermediate", advanced: "advanced" }[difficulty]);
    for (const generatorVersion of [1, 2, 3]) if (difficulty === "advanced")
      assert.equal(exerciseGenerationProfile({ generatorVersion, difficulty }), "legacy");
  }
  const legacy = { ...config("alkane") }; delete legacy.difficulty;
  assert.equal(normalizeSessionConfig(legacy).difficulty, "basic");
  for (const difficulty of ["easy", "hard", "expert", "", null, undefined]) assert.throws(() => normalizeSessionConfig({ ...legacy, difficulty }));
  assert.throws(() => normalizeSessionConfig({ ...legacy, generatorVersion: 5 }));
});

for (const category of EXERCISE_CATEGORIES) test(`v4 ${category}: constructive Hard, repeat/locale, Naming/MCQ/Build and Review`, () => {
  const start = performance.now(), s = stats[category] = { accepted: 0, candidates: 0, chemistryRejects: 0, hardRejects: 0,
    oracleRejects: 0, maxAttempts: 0, families: [], elapsedMs: 0, mcqMs: 0 };
  for (let seed = 0; seed < 4; seed++) for (const index of [0, 11]) {
    const c = config(category, `D5-CHEMICAL:${seed}`), q = chemical(c, index);
    const original = structuredClone(q); assertHard(q); s.accepted++; s.candidates += q.generation.attempt + 1;
    s.maxAttempts = Math.max(s.maxAttempts, q.generation.attempt + 1); s.families.push(q.generation.family);
    for (const r of q.generation.rejections) {
      if (r.stage === "chemical") s.chemistryRejects++; else if (r.stage === "advanced") s.hardRejects++; else s.oracleRejects++;
    }
    assert.deepEqual(chemical(c, index), q);
    const en = chemical({ ...c, locale: "en" }, index);
    assert.deepEqual({ ...en, reference: { ...en.reference, name: en.reference.names.es } }, q);
    for (const locale of ["es", "en"]) {
      const localized = { ...q, reference: { ...q.reference, name: q.reference.names[locale] } };
      assert.equal(evaluateSessionAnswer(localized, q.reference.names[locale], locale).correct, true);
      const attempt = createInitialAttempt({ question: localized, displayOrdinal: 7, generationIndex: index, answer: q.reference.names[locale],
        correct: true, locale, started: { monotonicMs: 0, wallTimeMs: 1700000000000 }, submitted: { monotonicMs: 100, wallTimeMs: 1700000000100 } });
      const model = review(localized, attempt); assert.equal(model.status, "CORRECT"); assert.deepEqual(model.issues, []);
      const bonds = new Set(q.molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
      for (const step of model.steps) {
        assert.ok(step.highlightAtomIds.every(id => q.molecule.atoms.some(a => a.id === id)));
        assert.ok(step.highlightBondIds.every(id => bonds.has(id)));
      }
      assert.equal(model.steps.filter(step => step.kind === "ez").length, category === "ez" ? 1 : 0);
    }
    assert.ok(validate(q.molecule, c).valid);
    assert.equal(evaluate({ referenceMolecule: q.molecule, submittedMolecule: redraw(q.molecule), category, config: c }).status, "EQUIVALENT");
    assert.deepEqual(q, original);
  }
  const c = config(category, "D5-TYPE-CAPABILITY"), mcqStart = performance.now();
  const mcq = generate(c, 0, { questionType: "multiple-choice", displayIndex: 0 });
  assertHard(mcq); assert.ok(validateMultipleChoiceQuestion(mcq)); assert.equal(mcq.options.length, 4);
  assert.equal(mcq.options.filter(o => o.correct).length, 1);
  assert.deepEqual(generate({ ...c, locale: "en" }, 0, { questionType: "multiple-choice", displayIndex: 0 }).options, mcq.options);
  assert.equal(new Set(mcq.options.map(o => o.name.es)).size, 4); assert.equal(new Set(mcq.options.map(o => o.name.en)).size, 4);
  for (const o of mcq.options.filter(o => !o.correct)) if (o.origin.verification)
    assert.notEqual(o.origin.verification.alternativeStructuralIdentity, mcq.reference.structuralIdentity);
  s.mcqMs = performance.now() - mcqStart; s.elapsedMs = performance.now() - start;
});

test("every one of the 22 certified families has a seeded production constructor and valid raw legal parameters", () => {
  const covered = new Set();
  assert.deepEqual([...new Set(Object.values(ADVANCED_RECIPE_FAMILIES).flat())].sort(), HARD_FOUNDATION_FAMILIES.map(f => f.id).sort());
  for (const category of EXERCISE_CATEGORIES) {
    const required = new Set(ADVANCED_RECIPE_FAMILIES[category]);
    for (let i = 0; i < 80 && (i < 8 || required.size); i++) {
      const m = buildAdvancedChemicalCandidate(category, `D5-LEGAL:${i}`), h = validateHardFoundationExercise(m, category, chemistry.oracles);
      assert.ok(h.valid, `${category}/${i}: ${h.reason}`); assert.equal(classifyMinimumExerciseDifficulty(m, category, chemistry.oracles), "advanced");
      required.delete(h.evidence.family); covered.add(h.evidence.family);
    }
    assert.equal(required.size, 0, `${category} did not exercise all its families`);
  }
  assert.deepEqual([...covered].sort(), HARD_FOUNDATION_FAMILIES.map(f => f.id).sort());
  const production = new Set();
  for (const category of EXERCISE_CATEGORIES) {
    const required = new Set(ADVANCED_RECIPE_FAMILIES[category]);
    for (let seed = 0; seed < 80 && required.size; seed++) {
      const c = config(category, `D5-FAMILY-CAPABILITY:${seed}`), q = chemical(c, 0);
      if (!required.has(q.generation.family)) continue;
      const mcq = generate(c, 0, { questionType: "multiple-choice", displayIndex: 0 });
      assert.ok(validateMultipleChoiceQuestion(mcq)); assert.equal(mcq.reference.structuralIdentity, q.reference.structuralIdentity);
      assert.equal(evaluate({ referenceMolecule: q.molecule, submittedMolecule: redraw(q.molecule), category, config: c }).status, "EQUIVALENT");
      for (const locale of ["es", "en"]) assert.equal(evaluateSessionAnswer({ ...q, reference: { ...q.reference, name: q.reference.names[locale] } },
        q.reference.names[locale], locale).correct, true);
      production.add(q.generation.family); required.delete(q.generation.family);
    }
    assert.equal(required.size, 0, `${category} lacks a real question-type capability proof`);
  }
  assert.deepEqual([...production].sort(), HARD_FOUNDATION_FAMILIES.map(f => f.id).sort());
});

test("v4 lower levels retain their own graph contracts and never call Hard recipes", () => {
  for (const category of EXERCISE_CATEGORIES) for (const difficulty of ["basic", "intermediate"]) {
    const c = config(category, "D5-LEVEL-GUARD", difficulty);
    if (category === "ez" && difficulty === "basic") { assert.throws(() => chemical(c, 0), { code: "unsupported-request" }); continue; }
    const q = chemical(c, 11); assert.equal(classifyMinimumExerciseDifficulty(q.molecule, category, chemistry.oracles), difficulty);
    assert.equal(q.generation.family, undefined); assert.deepEqual(chemical(c, 11), q);
    const en = chemical({ ...c, locale: "en" }, 11);
    assert.deepEqual({ ...en, reference: { ...en.reference, name: en.reference.names.es } }, q);
  }
  const boundary = moleculeFromSmiles("OCC=CC(C)C([N+](=O)[O-])C"); assert.ok(boundary.ok);
  assert.equal(classifyMinimumExerciseDifficulty(boundary.molecule, "alcohol", chemistry.oracles), "intermediate");
});

test("generated Build targets reject missing branches and moved locants with neutral valid submissions", () => {
  for (const category of EXERCISE_CATEGORIES) {
    const c = config(category, "D5-BUILD-NEGATIVES"), q = chemical(c, 0), r = chemistry.oracles.reference(q.molecule), parent = new Set(r.parent.atomIds);
    const branch = q.molecule.atoms.find(a => (a.element ?? "C") === "C" && !parent.has(a.id)
      && q.molecule.bonds.filter(([x, y]) => x === a.id || y === a.id).length === 1
      && q.molecule.bonds.some(([x, y]) => x === a.id && parent.has(y) || y === a.id && parent.has(x)));
    assert.ok(branch, category);
    const removed = structuredClone(q.molecule); removed.atoms = removed.atoms.filter(a => a.id !== branch.id);
    removed.bonds = removed.bonds.filter(([a, b]) => a !== branch.id && b !== branch.id);
    const missing = evaluate({ referenceMolecule: q.molecule, submittedMolecule: removed, category, config: c });
    assert.ok(missing.checks.submissionValid, `${category}: ${missing.status}`); assert.equal(missing.correct, false); assert.equal(missing.status, "DIFFERENT_ELEMENTS");
    const edge = q.molecule.bonds.find(([a, b]) => a === branch.id || b === branch.id);
    const root = edge[0] === branch.id ? edge[1] : edge[0];
    let found = false;
    for (const target of r.parent.atomIds.filter(id => id !== root)) {
      const moved = structuredClone(q.molecule); moved.bonds = moved.bonds.filter(([a, b]) => !(a === edge[0] && b === edge[1]));
      moved.bonds.push([target, branch.id, 1]);
      const answer = evaluate({ referenceMolecule: q.molecule, submittedMolecule: moved, category, config: c });
      if (answer.status === "DIFFERENT_STRUCTURE") { assert.ok(answer.checks.submissionValid); found = true; break; }
    }
    assert.ok(found, `${category} must have a valid wrong-locant isomer`);
  }
});

test("generated Build rejects missing secondary functions, changed function and lost enyne axes", () => {
  for (const category of ["ether", "aldehyde"]) {
    const c = config(category, "D5-SECONDARY"), q = chemical(c, 0), a = chemistry.engine.analyzeMolecule(q.molecule);
    const group = a.functionalGroups.find(g => g.kind === "alcohol"); assert.ok(group);
    const missing = structuredClone(q.molecule); missing.atoms = missing.atoms.filter(atom => atom.id !== group.heteroAtomId);
    missing.bonds = missing.bonds.filter(([left, right]) => left !== group.heteroAtomId && right !== group.heteroAtomId);
    const answer = evaluate({ referenceMolecule: q.molecule, submittedMolecule: missing, category, config: c });
    assert.equal(answer.status, "DIFFERENT_ELEMENTS"); assert.ok(answer.checks.submissionValid); assert.equal(answer.correct, false);
  }
  let diol;
  for (let i = 0; i < 30 && !diol; i++) {
    const c = config("alcohol", `D5-REPEATED:${i}`), q = chemical(c, 0);
    // Amino-alcohol certification permits zero/one C=C, not the diol-only
    // triple-bond variant. Choose a genuinely comparable wrong-function graph.
    if (q.generation.family === "diol" && !q.molecule.bonds.some(([, , order]) => order === 3)) diol = { c, q };
  }
  assert.ok(diol);
  const different = structuredClone(diol.q.molecule), group = chemistry.engine.analyzeMolecule(different).functionalGroups[0];
  different.atoms.find(a => a.id === group.heteroAtomId).element = "N";
  const changed = evaluate({ referenceMolecule: diol.q.molecule, submittedMolecule: different, category: "alcohol", config: diol.c });
  assert.equal(changed.status, "DIFFERENT_ELEMENTS"); assert.ok(changed.checks.submissionValid); assert.equal(changed.correct, false);
  const c = config("ester", "D5-AXIS-NEGATIVE"), q = chemical(c, 0), carbons = new Set(q.molecule.atoms.filter(a => a.element === "C").map(a => a.id));
  for (const edge of q.molecule.bonds.filter(([a, b, order]) => carbons.has(a) && carbons.has(b) && order > 1)) {
    const lost = structuredClone(q.molecule); lost.bonds.find(([a, b]) => a === edge[0] && b === edge[1])[2] = 1;
    const answer = evaluate({ referenceMolecule: q.molecule, submittedMolecule: lost, category: "ester", config: c });
    assert.equal(answer.status, "DIFFERENT_BOND_ORDERS"); assert.ok(answer.checks.submissionValid); assert.equal(answer.correct, false);
  }
});

test("Hard enyne has individual graph-derived ES/EN contributions and rejects unverified text", () => {
  for (const category of ["alkene", "alkyne", "ester", "amine", "amide", "nitrile", "nitro"]) {
    const q = chemical(config(category, "D5-REASON"), 0), a = chemistry.engine.analyzeMolecule(q.molecule);
    const expected = [`unsaturation:double:${a.doubleBondLocants[0]}`, `unsaturation:triple:${a.tripleBondLocants[0]}`].sort();
    for (const locale of ["es", "en"]) {
      const name = q.reference.names[locale], fragments = deriveUnsaturationNameContributions(a, name, locale, Object.values(q.reference.names));
      assert.deepEqual([...new Set(fragments.map(f => f.semanticId))].sort(), expected, `${category}/${locale}: ${name}`);
      for (const f of fragments) { assert.equal(name.slice(f.start, f.start + f.text.length), f.text); assert.equal(f.atomIds.length, 2); }
    }
    assert.deepEqual(deriveUnsaturationNameContributions(a, q.reference.names.en.replace(/\d/, "99"), "en", Object.values(q.reference.names)), []);
  }
});

test("Hard E/Z graph, reference, Review and Build agree; opposite or absent flags cannot be equivalent", () => {
  const c = config("ez", "D5-STEREO"), q = chemical(c, 0), edge = q.molecule.bonds.find(b => b[3]);
  const stereo = inspectDoubleBondStereochemistry(q.molecule, edge[0], edge[1]); assert.ok(stereo.stereogenic);
  assert.ok(q.reference.names.es.includes(stereo.configuration)); assert.ok(q.reference.names.en.includes(stereo.configuration));
  const opposite = setDoubleBondGeometry(q.molecule, edge[0], edge[1], stereo.configuration === "E" ? "Z" : "E"); assert.ok(opposite.ok);
  const answer = evaluate({ referenceMolecule: q.molecule, submittedMolecule: opposite.molecule, category: "ez", config: c });
  assert.equal(answer.status, "DIFFERENT_STEREOCHEMISTRY"); assert.equal(answer.checks.constitutionEqual, true); assert.equal(answer.correct, false);
  const unspecified = structuredClone(q.molecule); unspecified.bonds.forEach(b => { delete b[3]; });
  assert.equal(evaluate({ referenceMolecule: q.molecule, submittedMolecule: unspecified, category: "ez", config: c }).status, "DIFFERENT_STEREOCHEMISTRY");
});

test("unsupported chemistry exhausts the unchanged limit without level/category/type fallback", () => {
  const calls = [], rejecting = { ...chemistry.oracles, findMoleculeValenceViolation: m => { calls.push(m); return { invalid: true }; } };
  assert.equal(MAX_CHEMICAL_GENERATION_ATTEMPTS, 16);
  assert.throws(() => createRestrictedChemicalGenerator(rejecting)(config("alkane"), 0), e =>
    e instanceof ChemicalGenerationError && e.code === "attempts-exhausted" && e.rejections.length === 16 && e.rejections.every(r => r.stage === "chemical"));
  assert.equal(calls.length, 16);
  for (const m of calls) assert.equal(classifyMinimumExerciseDifficulty(m, "alkane", chemistry.oracles), "advanced");
});
