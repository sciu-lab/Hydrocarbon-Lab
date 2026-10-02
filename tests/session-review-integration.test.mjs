import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { performance } from "node:perf_hooks";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  updatePracticeStructure, submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion, endPractice, startPracticeCorrections } from "../app/practice-session.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure,
  navigateExam, submitExam } from "../app/exam-session.ts";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig } from "../app/class-assignment.ts";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, generate, evaluate, validate, reviewer;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles), createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles); reviewer = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());
const time = (ms) => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
export function submitPractice(state, correct = true, tick = 1000) {
  const q = state.question;
  state = markPracticeQuestionAvailable(state, time(tick));
  if (q.type === "build") return submitPracticeStructure(updatePracticeStructure(state,
    correct ? q.molecule : moleculeFromSmiles("C").molecule), "en", time(tick + 100), evaluate);
  return submitPracticeAnswer(updatePracticeAnswer(state, q.type === "multiple-choice"
    ? q.options.find((o) => o.correct === correct).id : correct ? q.reference.names.en : " wrong raw answer "), "en", time(tick + 100));
}
function complete(mode, count, types, seed, configOverride) {
  const config = configOverride ?? (mode === "exam" ? createExamConfig : createPracticeConfig)(EXERCISE_CATEGORIES, count, "en", seed, types);
  let state = mode === "exam" ? startExam(config, generate) : startPractice(config, generate);
  assert.equal(state.phase, mode === "exam" ? "EXAM_QUESTION" : "QUESTION");
  for (let i = 0; i < count; i++) {
    if (mode === "practice") state = nextPracticeQuestion(submitPractice(state, i % 2 === 0, i * 1000), generate);
    else {
      state = markExamQuestionAvailable(state, time(i * 1000), { index: i, questionId: state.plan.slots[i].questionIdentity });
      const q = state.plan.slots[i].question;
      if (q.type === "build") state = updateExamStructure(state, i % 2 === 0 ? q.molecule : moleculeFromSmiles("C").molecule, validate);
      else state = updateExamAnswer(state, q.type === "multiple-choice" ? q.options.find((o) => o.correct === (i % 2 === 0)).id
        : i % 2 === 0 ? q.reference.names.en : " wrong raw answer ");
      state = navigateExam(state, i + 1, time(i * 1000 + 100));
    }
  }
  if (mode === "exam") state = submitExam(state, "en", time(count * 1000), evaluate);
  assert.equal(state.phase, mode === "exam" ? "EXAM_RESULTS" : "COMPLETE");
  return state;
}
const reviewModel = (state) => { const result = buildCompletedSessionReview(state); assert.equal(result.ok, true, JSON.stringify(result)); return result.model; };
const detail = (state, entry, generator = generate) => {
  const frozen = "plan" in state ? state.plan.slots.find((s) => s.questionIdentity === entry.questionId).question : undefined;
  const result = reconstructSessionReviewQuestion(state.config, entry, generator, frozen);
  assert.equal(result.ok, true, `${entry.questionType}/${entry.displayOrdinal}`); return result.detail;
};

test("Naming, MCQ and Build details reuse frozen outcomes and the existing Reviewer without mutating a completed session", () => {
  for (const mode of ["practice", "exam"]) {
    const state = complete(mode, 6, ["naming", "multiple-choice", "build"], "SESSION-DETAILS"), before = structuredClone(state);
    const m = reviewModel(state), types = new Set();
    for (const entry of m.questions) {
      const d = detail(state, entry); types.add(entry.questionType);
      const r = reviewer(d.question, entry.firstAttempt);
      assert.equal(r.status, entry.initialCorrect ? "CORRECT" : "INCORRECT");
      assert.equal(r.studentAnswer, entry.firstAttempt.answer);
      if (entry.questionType === "multiple-choice") {
        assert.equal(d.question.optionSetIdentity, entry.firstAttempt.optionSetIdentity);
        assert.equal(d.question.options.find((o) => o.id === entry.firstAttempt.selectedOptionId).correct, entry.firstAttempt.correct);
      }
      if (entry.questionType === "build") {
        assert.equal(d.studentStructures.length, 1); assert.ok(entry.firstAttempt.structuralAnswer.submittedSmiles);
        // Build snapshots and generator identity use intentionally different existing formats.
        assert.notEqual(entry.firstAttempt.structuralAnswer.referenceIdentity, entry.structuralIdentity);
      }
    }
    assert.deepEqual([...types].sort(), ["build", "multiple-choice", "naming"]);
    assert.deepEqual(state, before); assert.deepEqual(reviewModel(state), m);
  }
});
test("Exam review uses its frozen MCQ order/IDs/provenance without generating fresh distractors", () => {
  const state = complete("exam", 5, ["multiple-choice"], "FROZEN-SESSION-MCQ"), m = reviewModel(state);
  for (const entry of m.questions) {
    const d = detail(state, entry, () => { throw new Error("Fresh generation forbidden"); });
    assert.deepEqual(d.question, state.plan.slots[entry.displayOrdinal - 1].question);
  }
  const entry = m.questions[0], damaged = structuredClone(state.plan.slots[0].question);
  damaged.options.reverse();
  assert.equal(reconstructSessionReviewQuestion(state.config, entry, undefined, damaged).ok, false);
});
test("frozen skipped-index fixture: ordinal 2 reconstructs generationIndex 4, never index 1", () => {
  const config = createPracticeConfig(["alkane", "alcohol", "ester"], 5, "en", "PRACTICE-PHASE3");
  const q0 = generate(config, 0), calls = [];
  const fixture = (c, i, context) => { calls.push(i); return i > 0 && i < 4 ? q0 : generate(c, i, context); };
  const first = startPractice(config, fixture);
  const second = nextPracticeQuestion(submitPractice(first), fixture);
  const state = endPractice(submitPractice(second, false, 2000)), m = reviewModel(state), entry = m.questions[1];
  assert.equal(entry.displayOrdinal, 2); assert.equal(entry.generationIndex, 4);
  calls.length = 0;
  const d = detail(state, entry, fixture);
  assert.deepEqual(calls, [4]); assert.deepEqual(d.question, second.question);
  console.log("SESSION_REVIEW_SKIPPED=" + JSON.stringify({ displayOrdinal: entry.displayOrdinal, generationIndex: entry.generationIndex, structuralIdentity: entry.structuralIdentity }));
  assert.equal(reconstructSessionReviewQuestion(config, entry, () => generate(config, 1)).ok, false);
});
test("Practice corrections update mastery/status/history while initial accuracy and timing stay immutable; attempt 3 remains separate", () => {
  let state = complete("practice", 6, ["naming", "multiple-choice", "build"], "REVIEW-CORRECTIONS"), initial = reviewModel(state);
  state = startPracticeCorrections(state, generate);
  state = nextPracticeQuestion(submitPractice(state, true, 10000), generate);
  state = nextPracticeQuestion(submitPractice(state, false, 11000), generate);
  state = endPractice(state);
  const after = reviewModel(state);
  assert.deepEqual(after.initialResults, initial.initialResults); assert.deepEqual(after.timing.initial, initial.timing.initial);
  assert.equal(after.overview.correctedQuestions, 1); assert.equal(after.overview.unresolvedQuestions, 2);
  const corrected = after.questions.find((q) => q.reviewStatus === "CORRECTED"), d = detail(state, corrected);
  assert.equal(reviewer(d.question, corrected.firstAttempt).status, "INCORRECT");
  assert.deepEqual(corrected.attempts.map((a) => a.attemptNumber), [1, 2]);
  state = startPracticeCorrections(state, generate);
  state = endPractice(nextPracticeQuestion(submitPractice(state, true, 12000), generate));
  const final = reviewModel(state);
  assert.ok(final.questions.some((q) => q.attempts.map((a) => a.attemptNumber).join() === "1,2,3"));
  assert.deepEqual(final.initialResults, initial.initialResults);
});
test("recorded accumulated Exam visit time survives review; wall-clock and review time are excluded", () => {
  let s = startExam(createExamConfig(["alkane"], 1, "en", "REVIEW-VISITS"), generate);
  const q = s.plan.slots[0].question, expected = { index: 0, questionId: q.question.id };
  s = markExamQuestionAvailable(s, time(0), expected); s = updateExamAnswer(s, q.reference.names.en);
  s = navigateExam(s, 1, time(20)); s = navigateExam(s, 0, time(100));
  s = markExamQuestionAvailable(s, time(100), expected); s = navigateExam(s, 1, time(130)); s = submitExam(s, "en", time(10000));
  const m = reviewModel(s); assert.equal(m.timing.initial.totalMs, 50); assert.equal(m.questions[0].initialResponseTimeMs, 50);
  detail(s, m.questions[0]); assert.equal(reviewModel(s).timing.initial.totalMs, 50);
});
test("atomic Exam grading failure yields no dashboard, partial model or history", () => {
  let s = startExam(createExamConfig(["alkane"], 2, "en", "REVIEW-ATOMIC", ["build"]), generate);
  for (let i = 0; i < 2; i++) {
    s = markExamQuestionAvailable(s, time(i * 1000), { index: i, questionId: s.plan.slots[i].questionIdentity });
    s = updateExamStructure(s, s.plan.slots[i].question.molecule, validate); s = navigateExam(s, i + 1, time(i * 1000 + 100));
  }
  let calls = 0; s = submitExam(s, "en", time(3000), (input) => { if (++calls === 2) throw new Error("Atomic failure"); return evaluate(input); });
  assert.equal(s.phase, "EXAM_REVIEW"); assert.equal(s.gradingError, true); assert.deepEqual(s.attempts, []);
  assert.equal(buildCompletedSessionReview(s).code, "NOT_COMPLETED");
});
test("Class Seed participant launches an ordinary 15-question Exam and shared dashboard", () => {
  const manifest = generateClassAssignments(createClassAssignmentConfig({ mode: "exam", questionCount: 15,
    categories: EXERCISE_CATEGORIES, questionTypes: ["naming", "multiple-choice", "build"] }, "CHEM-4B-2026"), ["001"]);
  const config = participantSessionConfig(manifest.config, manifest.participants[0], "en");
  const state = complete("exam", 15, config.questionTypes, config.seed, config), m = reviewModel(state);
  assert.equal(m.questionCount, 15); assert.equal(m.seed, config.seed); assert.ok(!("participantId" in m));
  assert.ok(!("mastery" in m.overview)); detail(state, m.questions[0]);
});
test("localized reference display can change without generation or re-evaluation of past answers", () => {
  const state = complete("practice", 5, ["naming"], "REVIEW-LOCALE"), before = structuredClone(state), m = reviewModel(state);
  let calls = 0; const d = detail(state, m.questions[0], (...args) => { calls++; return generate(...args); });
  const r = reviewer(d.question, m.questions[0].firstAttempt);
  assert.equal(calls, 1); assert.ok(d.question.reference.names.es); assert.ok(d.question.reference.names.en);
  assert.equal(r.submittedLocale, "en"); assert.equal(r.studentAnswer, m.questions[0].firstAttempt.answer);
  const es = reviewModel({ ...state, config: { ...state.config, locale: "es" } });
  assert.deepEqual(es.overview, m.overview); assert.deepEqual(es.questions, m.questions); assert.deepEqual(state, before);
});
test("one lazy reconstruction measurement is separate from analytics and full-session generation", () => {
  const state = complete("practice", 5, ["naming"], "REVIEW-PERFORMANCE"), m = reviewModel(state);
  const before = performance.now(); detail(state, m.questions[0]);
  console.log("SESSION_REVIEW_LAZY=" + JSON.stringify({ questionType: "naming", reconstructionMs: performance.now() - before }));
});

for (const mode of ["practice", "exam"]) for (const types of [["naming"], ["naming", "multiple-choice", "build"]]) {
  test(`Session Review sweep: ${mode} ${types.join("+")} at 5/15/37 questions across two seeds`, () => {
    for (const count of [5, 15, 37]) {
      const metric = { mode, config: types.join("+"), count, sessions: 0, metricMismatches: 0, reconstructionFailures: 0, mutations: 0 };
      for (const seed of ["REVIEW-SWEEP-A", "REVIEW-SWEEP-B"]) {
        const s = complete(mode, count, types, seed), snapshot = JSON.stringify(s), m = reviewModel(s);
        metric.sessions++;
        const initial = s.attempts.filter((a) => a.attemptNumber === 1), correct = initial.filter((a) => a.correct).length;
        const rawRatio = correct / count, totalMs = initial.reduce((sum, a) => sum + a.responseTimeMs, 0);
        if (m.questionCount !== count || m.initialResults.correctAnswers !== correct || m.initialResults.initialScore !== rawRatio
          || m.timing.initial.totalMs !== totalMs || m.timing.initial.averageMs !== totalMs / count
          || m.byCategory.reduce((sum, row) => sum + row.questions, 0) !== count
          || m.byQuestionType.reduce((sum, row) => sum + row.questions, 0) !== count
          || (mode === "practice" && m.overview.mastery !== rawRatio)) metric.metricMismatches++;
        for (const entry of m.questions) {
          const frozen = mode === "exam" ? s.plan.slots[entry.displayOrdinal - 1].question : undefined;
          if (!reconstructSessionReviewQuestion(s.config, entry, generate, frozen).ok) metric.reconstructionFailures++;
        }
        if (JSON.stringify(s) !== snapshot) metric.mutations++;
      }
      console.log("SESSION_REVIEW_SWEEP=" + JSON.stringify(metric));
      for (const field of ["metricMismatches", "reconstructionFailures", "mutations"]) assert.equal(metric[field], 0, JSON.stringify(metric));
    }
  });
}
