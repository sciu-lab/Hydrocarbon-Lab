import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { createPracticeQuestionGenerator, InsufficientSafeDistractorsError, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  updatePracticeStructure, submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion,
  localizePracticeState, startPracticeCorrections, endPractice } from "../app/practice-session.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure,
  navigateExam, submitExam, localizeExamState } from "../app/exam-session.ts";
import { getExerciseUniquenessKey, PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT } from "../app/session-question-selection.ts";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig,
  classConfigFingerprint, CLASS_SCHEMA_VERSION, CLASS_DERIVATION_VERSION } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow, CLASS_ASSIGNMENT_CSV_COLUMNS } from "../app/class-assignment-csv.ts";

const categories = EXERCISE_CATEGORIES.filter((c) => c !== "ez"), types = ["naming", "multiple-choice", "build"];
const time = (ms) => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
let chemistry, chemical, generate, evaluate, validate;
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
});
after(async () => chemistry?.close());
function submit(state, correct = true, ms = 1000) {
  state = markPracticeQuestionAvailable(state, time(ms));
  const q = state.question;
  if (q.type === "build") {
    const answer = correct ? q.molecule : moleculeFromSmiles(q.molecule.atoms.length === 1 ? "CC" : "C").molecule;
    return submitPracticeStructure(updatePracticeStructure(state, answer), state.config.locale, time(ms + 100), evaluate);
  }
  return submitPracticeAnswer(updatePracticeAnswer(state, q.type === "multiple-choice"
    ? q.options.find((o) => o.correct === correct).id : correct ? q.reference.names[state.config.locale] : "wrong"), state.config.locale, time(ms + 100));
}
function assertTarget(q, version = 2) {
  assert.equal(q.question.generatorVersion, version);
  if (version === 2) assert.ok(validateEasyExercise(q.molecule, q.category, chemistry.oracles).valid);
  if (q.type === "multiple-choice") assert.ok(validateMultipleChoiceQuestion(q));
  if (q.type === "build") assert.ok(validate(q.molecule).valid);
}

test("v2 frozen mixed Practice/Exam snapshot repeats in fresh processes and ES/EN, without time or entropy", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d2-easy-session.json", import.meta.url)));
  const capture = (locale) => {
    const source = `import {captureDifficultySessions} from './tests/helpers/difficulty-session-snapshot.mjs';
      console.log('D2_SNAPSHOT='+JSON.stringify(await captureDifficultySessions('basic','${locale}',2)));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 60000 });
    return JSON.parse(out.split("D2_SNAPSHOT=")[1].trim());
  };
  assert.equal(fixture.generatorVersion, 2);
  const a = capture("es"); assert.deepEqual(a, fixture.sessions);
  assert.deepEqual(capture("es"), a); assert.deepEqual(capture("en"), a);
});

for (const version of [1, 2]) test(`v${version}: Practice preserves targets through mixed grading, locale, corrections and completed Review`, () => {
  const c = createPracticeConfig(["alkane", "alcohol", "ether"], 6, "es", "D2-LIFECYCLE", types, "basic", version);
  let s = startPractice(c, generate), beforeCorrection;
  const questions = [];
  while (s.phase === "QUESTION") {
    assertTarget(s.question, version); questions.push(s.question);
    const i = s.index; s = localizePracticeState(s, "en");
    s = submit(s, i !== 0, i * 1000);
    assert.equal(s.phase, "FEEDBACK"); s = nextPracticeQuestion(s, generate);
  }
  assert.equal(s.phase, "COMPLETE"); assert.equal(s.attempts.length, 6);
  assert.equal(new Set(questions.map(getExerciseUniquenessKey)).size, 6);
  assert.deepEqual([...new Set(s.attempts.map((a) => a.questionType))].sort(), [...types].sort());
  assert.ok(s.attempts.some((a) => !a.correct), "Fixture must exercise a correction");
  beforeCorrection = buildCompletedSessionReview(s); assert.ok(beforeCorrection.ok);
  const originals = structuredClone(s.attempts);
  s = startPracticeCorrections(s, (config, ...args) => { assert.equal(config.generatorVersion, version); return generate(config, ...args); });
  assert.equal(s.phase, "CORRECTION_QUESTION"); assertTarget(s.question, version);
  assert.equal(s.question.reference.structuralIdentity, originals[0].structuralIdentity);
  s = nextPracticeQuestion(submit(s, true, 10000), generate);
  assert.equal(s.phase, "CORRECTION_SUMMARY");
  assert.deepEqual(s.attempts.slice(0, 6), originals); assert.equal(s.attempts.at(-1).attemptNumber, 2);
  const model = buildCompletedSessionReview(s); assert.ok(model.ok);
  assert.deepEqual(model.model.initialResults, beforeCorrection.model.initialResults);
  for (const entry of model.model.questions) {
    const rebuilt = reconstructSessionReviewQuestion(model.model.config, entry, generate);
    assert.ok(rebuilt.ok); assertTarget(rebuilt.detail.question, version);
    assert.equal(rebuilt.detail.question.reference.structuralIdentity, entry.firstAttempt.structuralIdentity);
  }
});

test("v2 Exam retains neutral drafts and plan through navigation/locale, then grades atomically and reconstructs Review", () => {
  let s = startExam(createExamConfig(["alkane", "alcohol", "ether"], 6, "es", "D2-EXAM", types), generate);
  assert.equal(s.phase, "EXAM_QUESTION"); const plan = s.plan;
  s = localizeExamState(s, "en"); assert.equal(s.plan, plan);
  for (let i = 0; i < 6; i++) {
    const q = plan.slots[i].question; assertTarget(q);
    s = markExamQuestionAvailable(s, time(i * 1000), { index: i, questionId: plan.slots[i].questionIdentity });
    s = q.type === "build" ? updateExamStructure(s, q.molecule, validate)
      : updateExamAnswer(s, q.type === "multiple-choice" ? q.correctOptionId : q.reference.names.en);
    assert.deepEqual(s.attempts, []);
    if (i === 1) { const draft = s.drafts[i]; s = navigateExam(s, 0, time(1100)); s = navigateExam(s, 1, time(1200)); assert.equal(s.drafts[i], draft); }
    s = navigateExam(s, i + 1, time(i * 1000 + 500));
  }
  assert.equal(s.phase, "EXAM_REVIEW"); assert.deepEqual(s.attempts, []);
  s = submitExam(s, "en", time(7000), evaluate);
  assert.equal(s.phase, "EXAM_RESULTS"); assert.ok(s.attempts.every((a) => a.correct && a.generatorVersion === 2));
  assert.equal(submitExam(s, "en", time(8000), evaluate), s);
  const review = buildCompletedSessionReview(s); assert.ok(review.ok);
  for (const entry of review.model.questions) {
    const result = reconstructSessionReviewQuestion(review.model.config, entry, () => { throw Error("Frozen plan required"); }, plan.slots[entry.displayOrdinal - 1].question);
    assert.ok(result.ok); assertTarget(result.detail.question);
  }
});

test("v2 Endless has Easy targets and bounded recent history; explicit ez selections fail safely in both modes", () => {
  let s = startPractice(createPracticeConfig(["alkane", "alcohol", "ester"], "endless", "es", "D2-ENDLESS"), generate);
  for (let i = 0; i < 24; i++) {
    assert.equal(s.phase, "QUESTION"); assertTarget(s.question);
    assert.ok(s.recentIdentities.length <= 8); assert.ok(s.usedExerciseKeys.length <= 8);
    s = nextPracticeQuestion(submit(s, true, i * 1000), generate);
  }
  assert.equal(endPractice(s).phase, "COMPLETE");
  assert.equal(startPractice(createPracticeConfig(["alkane", "ez"], 5, "es", "D2-EZ"), generate).phase, "ERROR");
  const exam = startExam(createExamConfig(["ez"], 5, "en", "D2-EZ"), generate);
  assert.equal(exam.phase, "EXAM_ERROR"); assert.deepEqual(exam.attempts, []);
  assert.deepEqual([PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT], [4, 12, 8]);
});

test("16 categories × 2 modes × 2 seeds: finite Easy session sweep counts attempts, duplicates and safe exhaustion", () => {
  const start = performance.now(), stats = {};
  for (const category of categories) {
    const stat = stats[category] = { sessions: 0, candidates: 0, accepted: 0, easyRejects: 0, duplicateRejects: 0,
      exhaustions: 0, violations: 0, maxChemicalRetries: 0, maxQuestionRetries: 0 };
    for (const mode of ["practice", "exam"]) for (let seed = 0; seed < 2; seed++) {
      stat.sessions++; const seen = new Set();
      const builder = mode === "exam" ? createExamConfig : createPracticeConfig;
      const c = builder([category], 5, "en", `D2-FINITE-${seed}`);
      const tracked = (...args) => {
        const q = chemical(...args); stat.candidates += q.generation.attempt + 1;
        stat.easyRejects += q.generation.rejections.filter((r) => r.stage === "easy").length;
        stat.maxChemicalRetries = Math.max(stat.maxChemicalRetries, q.generation.attempt);
        assertTarget(q); const key = getExerciseUniquenessKey(q);
        if (seen.has(key)) stat.duplicateRejects++; else { seen.add(key); stat.accepted++; }
        return q;
      };
      let s = mode === "exam" ? startExam(c, tracked) : startPractice(c, tracked);
      let previous = -1;
      if (mode === "practice") while (s.phase === "QUESTION") {
        stat.maxQuestionRetries = Math.max(stat.maxQuestionRetries, s.generationIndex - previous - 1);
        previous = s.generationIndex;
        s = nextPracticeQuestion(submit(s, true, s.index * 1000), tracked);
      }
      else if (s.phase === "EXAM_QUESTION") for (const slot of s.plan.slots) {
        stat.maxQuestionRetries = Math.max(stat.maxQuestionRetries, slot.generationIndex - previous - 1);
        previous = slot.generationIndex;
      }
      if (s.phase === "ERROR" || s.phase === "EXAM_ERROR") {
        stat.exhaustions++; assert.equal(s.reason, "insufficient-unique-questions");
        if (mode === "exam") assert.deepEqual(s.attempts, []);
      } else {
        assert.equal(seen.size, 5);
        assert.equal(s.phase, mode === "practice" ? "COMPLETE" : "EXAM_QUESTION");
      }
      assert.ok(seen.size <= 5);
    }
  }
  // Only benzene/toluene graphs: three Naming questions cannot be filled.
  assert.equal(stats.aromatic.exhaustions, 4);
  mkdirSync("outputs/difficulty-d2", { recursive: true });
  writeFileSync("outputs/difficulty-d2/session-sweep.json", JSON.stringify({ elapsedMs: performance.now() - start, stats }, null, 2));
});

test("v2 Class Seed + CSV reconstruct all difficulties/version; three participant plans remain deterministic Easy", () => {
  const fingerprints = new Set(), seeds = new Set();
  for (const difficulty of ["basic", "intermediate", "advanced"]) {
    const config = createClassAssignmentConfig({ mode: "exam", questionCount: 3, categories, questionTypes: types, difficulty }, "CHEM-4B-2026");
    assert.equal(config.generatorVersion, 2);
    const manifest = generateClassAssignments(config, ["001", "002", "003"]);
    assert.deepEqual(manifest, generateClassAssignments(config, ["001", "002", "003"]));
    fingerprints.add(classConfigFingerprint(config)); seeds.add(manifest.participants[0].sessionSeed);
    for (const locale of ["es", "en"]) {
      const csv = serializeClassAssignmentCsv(manifest, locale), parsed = parseClassCsv(csv);
      assert.ok(csv.startsWith('\uFEFF"schema_version"')); assert.ok(csv.endsWith("\r\n"));
      assert.deepEqual(parsed.header, [...CLASS_ASSIGNMENT_CSV_COLUMNS]);
      for (const [i, row] of parsed.rows.entries()) {
        const c = reconstructClassSessionFromCsvRow(row);
        assert.equal(c.difficulty, difficulty); assert.equal(c.generatorVersion, 2);
        assert.deepEqual(c, participantSessionConfig(config, manifest.participants[i], locale));
        if (difficulty !== "basic") continue;
        const s = startExam(c, generate), repeat = startExam(c, generate);
        assert.equal(s.phase, "EXAM_QUESTION"); assert.deepEqual(s.plan, repeat.plan);
        for (const slot of s.plan.slots) assertTarget(slot.question);
      }
    }
  }
  assert.equal(fingerprints.size, 3); assert.equal(seeds.size, 3);
  assert.equal(CLASS_SCHEMA_VERSION, 1); assert.equal(CLASS_DERIVATION_VERSION, 1);
});

test("v2 MCQ targets in every compatible category remain Easy; insufficient distractors are explicit and bounded", () => {
  const stats = {};
  for (const category of categories) {
    const stat = stats[category] = { accepted: 0, insufficient: 0 };
    for (let i = 0; i < 2; i++) {
      const c = createPracticeConfig([category], 1, "en", `D2-MCQ-${i}`, ["multiple-choice"]);
      const target = chemical(c, 0), copy = structuredClone(target);
      try {
        const q = generate(c, 0, { questionType: "multiple-choice", displayIndex: 0 }); assertTarget(q); stat.accepted++;
        assert.deepEqual(q.molecule, target.molecule); assert.equal(q.reference.structuralIdentity, target.reference.structuralIdentity);
      } catch (error) { assert.ok(error instanceof InsufficientSafeDistractorsError); stat.insufficient++; }
      assert.deepEqual(target, copy);
    }
  }
  writeFileSync("outputs/difficulty-d2/mcq-sweep.json", JSON.stringify(stats, null, 2));
});
