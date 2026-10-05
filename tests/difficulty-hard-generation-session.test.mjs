import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES, normalizeSessionConfig } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { validateHardFoundationExercise } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { createPracticeQuestionGenerator, InsufficientSafeDistractorsError } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator, createBuildSubmissionValidator } from "../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, updatePracticeStructure,
  submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion, localizePracticeState, startPracticeCorrections, endPractice } from "../app/practice-session.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure,
  navigateExam, submitExam, localizeExamState } from "../app/exam-session.ts";
import { getExerciseUniquenessKey, PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT } from "../app/session-question-selection.ts";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig, classConfigFingerprint,
  CLASS_SCHEMA_VERSION, CLASS_DERIVATION_VERSION } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow, CLASS_ASSIGNMENT_CSV_COLUMNS } from "../app/class-assignment-csv.ts";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";

const types = ["naming", "multiple-choice", "build"], time = ms => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
let chemistry, chemical, generate, evaluate, validate, distractors;
const stats = {}, performanceRows = [], classRows = [];
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  distractors = createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, distractors);
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
});
after(async () => {
  mkdirSync("outputs/difficulty-d5-v4", { recursive: true });
  writeFileSync("outputs/difficulty-d5-v4/session-sweep.json", JSON.stringify({ stats, performanceRows, classRows }, null, 2));
  await chemistry?.close();
});
function hard(q) {
  assert.equal(q.question.generatorVersion, 4);
  assert.equal(classifyMinimumExerciseDifficulty(q.molecule, q.category, chemistry.oracles), "advanced");
  assert.ok(validateHardFoundationExercise(q.molecule, q.category, chemistry.oracles).valid);
  assert.equal(q.reference.structuralIdentity, exerciseStructuralIdentity(q.molecule));
}
function omitMethyl(q) {
  const parent = new Set(chemistry.oracles.reference(q.molecule).parent.atomIds);
  const atom = q.molecule.atoms.find(a => (a.element ?? "C") === "C" && !parent.has(a.id)
    && q.molecule.bonds.filter(([x, y]) => x === a.id || y === a.id).length === 1
    && q.molecule.bonds.some(([x, y]) => x === a.id && parent.has(y) || y === a.id && parent.has(x)));
  assert.ok(atom);
  return { ...structuredClone(q.molecule), atoms: q.molecule.atoms.filter(a => a.id !== atom.id),
    bonds: q.molecule.bonds.filter(([a, b]) => a !== atom.id && b !== atom.id) };
}
function submit(s, correct = true, ms = 1000) {
  s = markPracticeQuestionAvailable(s, time(ms)); const q = s.question;
  if (q.type === "build") return submitPracticeStructure(updatePracticeStructure(s, correct ? q.molecule : omitMethyl(q)), s.config.locale, time(ms + 100), evaluate);
  return submitPracticeAnswer(updatePracticeAnswer(s, q.type === "multiple-choice" ? q.options.find(o => o.correct === correct).id
    : correct ? q.reference.names[s.config.locale] : "wrong"), s.config.locale, time(ms + 100));
}
function runPractice(c, producer = generate) {
  let s = startPractice(c, producer);
  while (s.phase === "QUESTION") {
    hard(s.question); s = submit(s, true, s.index * 1000);
    assert.equal(s.phase, "FEEDBACK"); assert.equal(s.correct, true);
    s = nextPracticeQuestion(s, producer);
  }
  return s;
}

for (const category of EXERCISE_CATEGORIES) test(`v4 ${category}: real finite Naming/MCQ/Build Practice and Exam sweeps`, () => {
  const s = stats[category] = { sessions: 0, candidates: 0, accepted: 0, chemistryRejects: 0, hardRejects: 0,
    capabilityRejects: 0, oracleRejects: 0, duplicateRejects: 0, exhaustions: 0, violations: 0,
    maxChemicalAttempts: 0, maxQuestionAttempts: 0, chemicalMs: 0, elapsedMs: 0 };
  const start = performance.now();
  for (const type of types) for (const mode of ["practice", "exam"]) for (const seed of type === "naming" ? [0, 1] : [0]) {
    s.sessions++; const seen = new Set(), builder = mode === "exam" ? createExamConfig : createPracticeConfig;
    const c = builder([category], 5, "en", `D5-FINITE:${type}:${seed}`, [type], "advanced", 4);
    const trackedChemical = (...args) => {
      const begin = performance.now(), q = chemical(...args); s.chemicalMs += performance.now() - begin;
      s.candidates += q.generation.attempt + 1; s.maxChemicalAttempts = Math.max(s.maxChemicalAttempts, q.generation.attempt + 1);
      for (const r of q.generation.rejections) {
        if (r.stage === "chemical") s.chemistryRejects++; else if (r.stage === "advanced") s.hardRejects++; else s.oracleRejects++;
      }
      hard(q); return q;
    };
    const producer = createPracticeQuestionGenerator(trackedChemical, distractors);
    const tracked = (...args) => {
      let q;
      try { q = producer(...args); } catch (error) { if (error instanceof InsufficientSafeDistractorsError) s.capabilityRejects++; throw error; }
      const key = getExerciseUniquenessKey(q);
      if (seen.has(key)) s.duplicateRejects++; else { seen.add(key); s.accepted++; }
      return q;
    };
    const state = mode === "exam" ? startExam(c, tracked) : runPractice(c, tracked);
    if (state.phase === "ERROR" || state.phase === "EXAM_ERROR") { s.exhaustions++; }
    assert.equal(state.phase, mode === "exam" ? "EXAM_QUESTION" : "COMPLETE", `${category}/${type}/${mode}/${seed}: ${state.reason}`);
    assert.equal(seen.size, 5);
    const indices = mode === "exam" ? state.plan.slots.map(slot => slot.generationIndex) : state.attempts.map(a => a.generationIndex);
    let previous = -1;
    for (const index of indices) { s.maxQuestionAttempts = Math.max(s.maxQuestionAttempts, index - previous); previous = index; }
    if (mode === "practice") assert.ok(state.attempts.every(a => a.correct && a.generatorVersion === 4 && a.questionType === type));
    else { assert.deepEqual(state.attempts, []); assert.ok(Object.isFrozen(state.plan)); state.plan.slots.forEach(slot => hard(slot.question)); }
  }
  s.elapsedMs = performance.now() - start; assert.equal(s.exhaustions, 0); assert.equal(s.violations, 0);
});

test("v4 representative finite counts 5/10/20/30 complete without duplicates or changed search limits", () => {
  for (const category of ["alkane", "alcohol", "ester", "nitrile"]) for (const count of [5, 10, 20, 30]) {
    const c = createPracticeConfig([category], count, "es", "D5-NORMAL-COUNTS", ["naming"], "advanced", 4);
    const begin = performance.now(), s = runPractice(c);
    assert.equal(s.phase, "COMPLETE", `${category}/${count}: ${s.reason}`); assert.equal(s.attempts.length, count);
    assert.equal(new Set(s.attempts.map(a => JSON.stringify([a.questionType, a.structuralIdentity]))).size, count);
    performanceRows.push({ category, count, elapsedMs: performance.now() - begin });
  }
  assert.deepEqual([PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT], [4, 12, 8]);
});

test("v4 small ring space exhausts safely after its actual unique space, never changes topic/type/level", () => {
  const c = createPracticeConfig(["aromatic"], 11, "es", "D5-FORCED-EXHAUSTION", ["naming"], "advanced", 4);
  const state = runPractice(c); assert.equal(state.phase, "ERROR"); assert.equal(state.reason, "insufficient-unique-questions");
  assert.equal(state.attempts.length, 10); assert.equal(new Set(state.attempts.map(a => a.structuralIdentity)).size, 10);
  assert.ok(state.attempts.every(a => a.category === "aromatic" && a.questionType === "naming")); assert.equal(state.config.difficulty, "advanced");
  const exam = startExam({ ...c, mode: "exam" }, generate);
  assert.equal(exam.phase, "EXAM_ERROR"); assert.equal(exam.reason, "insufficient-unique-questions"); assert.deepEqual(exam.attempts, []);
});

test("v4 Endless cycles the small certified ring space with at most eight recent identities", () => {
  let s = startPractice(createPracticeConfig(["aromatic"], "endless", "es", "D5-ENDLESS", ["naming"], "advanced", 4), generate);
  for (let i = 0; i < 40; i++) {
    assert.equal(s.phase, "QUESTION"); hard(s.question);
    assert.ok(s.recentIdentities.length <= 8); assert.ok(s.usedExerciseKeys.length <= 8);
    assert.equal(new Set(s.recentIdentities).size, s.recentIdentities.length);
    assert.equal(new Set(s.usedExerciseKeys).size, s.usedExerciseKeys.length);
    s = nextPracticeQuestion(submit(s, true, i * 1000), generate);
  }
  assert.equal(endPractice(s).phase, "COMPLETE");
});

test("v4 mixed corrections preserve original targets, attempt numbers, initial score, locale and Session Review", () => {
  const config = createPracticeConfig(["alcohol", "ester", "ez"], 6, "es", "D5-CORRECTIONS", types, "advanced", 4);
  let s = startPractice(config, generate);
  while (s.phase === "QUESTION") { s = nextPracticeQuestion(submit(s, false, s.index * 1000), generate); }
  assert.equal(s.phase, "COMPLETE"); assert.equal(s.attempts.length, 6); assert.ok(s.attempts.every(a => !a.correct));
  const initial = structuredClone(s.attempts), original = buildCompletedSessionReview(s); assert.ok(original.ok);
  s = localizePracticeState(s, "en"); s = startPracticeCorrections(s, generate);
  while (s.phase === "CORRECTION_QUESTION") {
    hard(s.question); assert.equal(s.config.difficulty, "advanced"); assert.equal(s.config.generatorVersion, 4);
    assert.equal(s.question.reference.structuralIdentity, s.original.structuralIdentity);
    s = nextPracticeQuestion(submit(s, true, 10000 + s.correctionIndex * 1000), generate);
  }
  assert.equal(s.phase, "CORRECTION_SUMMARY"); assert.deepEqual(s.attempts.slice(0, 6), initial);
  assert.ok(s.attempts.slice(6).every(a => a.correct && a.attemptNumber === 2));
  const completed = buildCompletedSessionReview(s); assert.ok(completed.ok);
  assert.deepEqual(completed.model.initialResults, original.model.initialResults);
  const restored = normalizeSessionConfig(JSON.parse(JSON.stringify(completed.model.config)));
  for (const entry of completed.model.questions) {
    const result = reconstructSessionReviewQuestion(restored, entry, generate); assert.ok(result.ok); hard(result.detail.question);
    assert.equal(result.detail.question.reference.structuralIdentity, entry.firstAttempt.structuralIdentity);
  }
});

test("v4 reconstruction uses display ordinal 7 / real generationIndex 11 and rejects the wrong version or difficulty", () => {
  const c = createPracticeConfig(["amide"], 7, "es", "D5-REPLAY", ["naming"], "advanced", 4), q = generate(c, 11);
  const attempt = createInitialAttempt({ question: q, displayOrdinal: 7, generationIndex: 11, answer: "wrong", correct: false,
    started: time(0), submitted: time(100), locale: "es" });
  assert.deepEqual(reconstructPracticeCorrection(normalizeSessionConfig(JSON.parse(JSON.stringify(c))), attempt, generate), q);
  const entry = { ...attempt, attempts: [attempt] };
  assert.ok(reconstructSessionReviewQuestion(c, entry, generate).ok);
  assert.equal(reconstructSessionReviewQuestion({ ...c, generatorVersion: 3 }, entry, generate).ok, false);
  assert.equal(reconstructSessionReviewQuestion({ ...c, difficulty: "intermediate" }, entry, generate).ok, false);
});

test("v4 Exam preserves neutral validation, navigation/drafts/locale, atomic grading and frozen post-review", () => {
  let s = startExam(createExamConfig(["alcohol", "nitrile", "aromatic", "ez"], 6, "es", "D5-EXAM", types, "advanced", 4), generate);
  assert.equal(s.phase, "EXAM_QUESTION"); const plan = s.plan; s = localizeExamState(s, "en"); assert.equal(s.plan, plan);
  const neutralCalls = [];
  for (let i = 0; i < 6; i++) {
    const slot = plan.slots[i], q = slot.question; hard(q);
    s = markExamQuestionAvailable(s, time(i * 1000), { index: i, questionId: slot.questionIdentity });
    s = q.type === "build" ? updateExamStructure(s, q.molecule, (m, context) => { neutralCalls.push(context); return validate(m, context); })
      : updateExamAnswer(s, q.type === "multiple-choice" ? q.correctOptionId : q.reference.names.en);
    assert.deepEqual(s.attempts, []);
    if (i === 1) { const draft = s.drafts[i]; s = navigateExam(s, 0, time(1100)); s = navigateExam(s, 1, time(1200)); assert.equal(s.drafts[i], draft); }
    s = navigateExam(s, i + 1, time(i * 1000 + 500));
  }
  assert.equal(s.phase, "EXAM_REVIEW"); assert.deepEqual(s.attempts, []); assert.equal(neutralCalls.length, 2);
  assert.ok(neutralCalls.every(c => c.difficulty === "advanced" && c.generatorVersion === 4));
  let grades = 0;
  const failed = submitExam(s, "en", time(7000), () => { grades++; throw Error("technical failure"); });
  assert.equal(failed.phase, "EXAM_REVIEW"); assert.deepEqual(failed.attempts, []); assert.ok(grades >= 1);
  s = submitExam(failed, "en", time(8000), evaluate); assert.equal(s.phase, "EXAM_RESULTS");
  assert.ok(s.attempts.every(a => a.correct && a.generatorVersion === 4)); assert.equal(submitExam(s, "en", time(9000), evaluate), s);
  const completed = buildCompletedSessionReview(s); assert.ok(completed.ok);
  for (const entry of completed.model.questions) {
    const result = reconstructSessionReviewQuestion(completed.model.config, entry, () => { throw Error("Use frozen Exam plan"); }, plan.slots[entry.displayOrdinal - 1].question);
    assert.ok(result.ok); hard(result.detail.question);
  }
});

test("v4 Class Seed and CSV distinguish levels deterministically and reconstruct the original Hard participant plan", () => {
  const namespaces = new Set(); assert.equal(CLASS_SCHEMA_VERSION, 1); assert.equal(CLASS_DERIVATION_VERSION, 1);
  for (const difficulty of ["basic", "intermediate", "advanced"]) {
    const c = createClassAssignmentConfig({ mode: "exam", questionCount: 6, categories: ["alkane", "alcohol", "ester"], questionTypes: types, difficulty }, "CHEM-4B-2026", 4);
    const manifest = generateClassAssignments(c, ["001", "002"]), fingerprint = classConfigFingerprint(c);
    assert.deepEqual(generateClassAssignments(c, ["001", "002"]), manifest); namespaces.add(manifest.participants[0].sessionSeed);
    const row = { difficulty, fingerprint, seedSha256: createHash("sha256").update(manifest.participants[0].sessionSeed).digest("hex"), csv: [] };
    for (const locale of ["es", "en"]) {
      const csv = serializeClassAssignmentCsv(manifest, locale), parsed = parseClassCsv(csv);
      assert.ok(csv.startsWith('\uFEFF"schema_version"')); assert.ok(csv.endsWith("\r\n")); assert.equal(csv.replaceAll("\r\n", "").includes("\n"), false);
      assert.deepEqual(parsed.header, [...CLASS_ASSIGNMENT_CSV_COLUMNS]); assert.equal(parsed.header.length, 12);
      for (const [i, record] of parsed.rows.entries()) assert.deepEqual(reconstructClassSessionFromCsvRow(record), participantSessionConfig(c, manifest.participants[i], locale));
      row.csv.push({ locale, sha256: createHash("sha256").update(csv).digest("hex") });
    }
    for (const participant of manifest.participants) {
      const a = startExam(participantSessionConfig(c, participant, "es"), generate), b = startExam(participantSessionConfig(c, participant, "en"), generate);
      assert.equal(a.phase, "EXAM_QUESTION"); assert.equal(b.phase, "EXAM_QUESTION");
      assert.deepEqual(a.plan, b.plan);
      if (difficulty === "advanced") a.plan.slots.forEach(slot => hard(slot.question));
    }
    classRows.push(row);
  }
  assert.equal(namespaces.size, 3);
});
