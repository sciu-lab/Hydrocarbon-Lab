import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { buildSessionReview, buildCompletedSessionReview, medianReviewResponseTime, filterSessionReviewQuestions } from "../app/session-review.ts";
import { EXERCISE_CATEGORIES, QUESTION_TYPES } from "../app/exercise-model.ts";
import { practiceReviewFixture, examReviewFixture, reviewAttempt, reviewConfig } from "./helpers/session-review-fixtures.mjs";
const model = (input) => { const result = buildSessionReview(input); assert.equal(result.ok, true, JSON.stringify(result)); return result.model; };

test("Practice fixture: 6 questions, 3 initial correct, 5 mastered, 2 corrected, 1 unresolved, 9 attempts", () => {
  const m = model(practiceReviewFixture());
  assert.deepEqual(m.overview, { mode: "practice", totalQuestions: 6, initialCorrect: 3, initialAccuracy: 0.5,
    masteredQuestions: 5, mastery: 5 / 6, correctedQuestions: 2, unresolvedQuestions: 1, totalAttempts: 9, correctionAttempts: 3 });
  assert.deepEqual(m.timing.initial, { attempts: 6, totalMs: 21000, averageMs: 3500, medianMs: 3500 });
  assert.deepEqual(m.timing.corrections, { attempts: 3, totalMs: 24000, averageMs: 8000, medianMs: 8000 });
  assert.deepEqual(m.questions.map((q) => q.reviewStatus), ["CORRECT_FIRST_TRY", "CORRECTED", "UNRESOLVED", "CORRECT_FIRST_TRY", "CORRECTED", "CORRECT_FIRST_TRY"]);
});
test("Exam fixture: 4/6, six attempt-one records; no mastery/correction fields anywhere in review summaries", () => {
  const m = model(examReviewFixture());
  assert.deepEqual(m.overview, { mode: "exam", totalQuestions: 6, correctQuestions: 4, incorrectQuestions: 2,
    accuracy: 4 / 6, score: { correct: 4, total: 6 }, totalAttempts: 6 });
  assert.equal(m.timing.initial.averageMs, 3500); assert.equal(m.timing.initial.medianMs, 3500);
  for (const value of [m, m.overview, m.timing, ...m.questions, ...m.byCategory, ...m.byQuestionType])
    for (const field of ["mastery", "mastered", "masteryResults", "correctedQuestions", "corrections", "correctionAttempts"]) assert.ok(!(field in value));
});
test("breakdowns reconcile original question counts, correctness, mastery and first-response means in canonical order", () => {
  for (const fixture of [practiceReviewFixture(), examReviewFixture()]) {
    const m = model(fixture);
    for (const [rows, ids] of [[m.byQuestionType, QUESTION_TYPES], [m.byCategory, EXERCISE_CATEGORIES]]) {
      assert.equal(rows.reduce((sum, row) => sum + row.questions, 0), 6);
      assert.equal(rows.reduce((sum, row) => sum + row.initialCorrect, 0), m.initialResults.correctAnswers);
      assert.deepEqual(rows.map((row) => row.id), ids.filter((id) => rows.some((row) => row.id === id)));
      if (m.mode === "practice") assert.equal(rows.reduce((sum, row) => sum + row.mastered, 0), 5);
    }
    assert.equal(m.byQuestionType[0].averageInitialResponseTimeMs, 2500);
  }
});
test("corrections preserve every initial metric while mastery increases; repeated success counts once", () => {
  const fixture = practiceReviewFixture(), before = model({ ...fixture, attempts: fixture.attempts.filter((a) => a.attemptNumber === 1) });
  const after = model(fixture);
  assert.deepEqual(before.initialResults, after.initialResults); assert.deepEqual(before.timing.initial, after.timing.initial);
  assert.equal(before.overview.mastery, 0.5); assert.equal(after.overview.mastery, 5 / 6);
  const all = model({ ...fixture, attempts: [...fixture.attempts, reviewAttempt(3, true, 3, 1200), reviewAttempt(2, true, 3, 100)] });
  assert.equal(all.overview.mastery, 1); assert.equal(all.overview.correctedQuestions, 3);
  assert.equal(all.overview.initialAccuracy, 0.5); assert.deepEqual(all.questions[2].attempts.map((a) => a.attemptNumber), [1, 2, 3]);
});
test("grouping preserves distinct pedagogical questions sharing a chemical identity and original order despite shuffled log", () => {
  const fixture = practiceReviewFixture(); fixture.attempts.forEach((a) => { a.structuralIdentity = "shared"; if (a.structuralAnswer) a.structuralAnswer.referenceIdentity = "shared"; });
  const m = model({ ...fixture, attempts: [...fixture.attempts].reverse() });
  assert.equal(m.questions.length, 6); assert.deepEqual(m.questions.map((q) => q.displayOrdinal), [1, 2, 3, 4, 5, 6]);
  assert.equal(m.questions[1].attempts[0].answer, "  Raw answer 2/1  ");
});
for (const [label, values, expected] of [["empty", [], null], ["one", [12], 12], ["odd", [90, 10, 20], 20],
  ["even", [4, 2, 8, 6], 5], ["zero", [0, 0], 0], ["large finite", [1e308, 1e308], 1e308]]) {
  test(`pure median ${label} uses a copy and never timestamps`, () => { const before = [...values]; assert.equal(medianReviewResponseTime(values), expected); assert.deepEqual(values, before); });
}
test("malformed median durations are explicitly rejected", () => {
  for (const value of [NaN, Infinity, -1, undefined]) assert.throws(() => medianReviewResponseTime([value]), /Invalid review timing/);
});
for (const [label, corrupt] of [
  ["missing attempt 1", (f) => { f.attempts = f.attempts.filter((a) => a.displayOrdinal !== 2 || a.attemptNumber !== 1); }],
  ["duplicate attempt number", (f) => f.attempts.push({ ...f.attempts[0] })],
  ["question count mismatch", (f) => { f.config = { ...f.config, questionCount: 7 }; }],
  ["structural identity drift", (f) => { f.attempts[2].structuralIdentity = "other"; }],
  ["generation context drift", (f) => { f.attempts[2].generationIndex++; }],
  ["missing duration", (f) => { delete f.attempts[0].responseTimeMs; }],
  ["non-finite duration", (f) => { f.attempts[0].responseTimeMs = Infinity; }],
  ["negative duration", (f) => { f.attempts[0].responseTimeMs = -1; }],
  ["ordinal gap", (f) => { f.attempts.at(-1).displayOrdinal = 7; }],
  ["unknown category", (f) => { f.attempts[0].category = "unknown"; }],
  ["attempt gap", (f) => { f.attempts[2].attemptNumber = 3; }],
  ["non-boolean correctness", (f) => { f.attempts[0].correct = "true"; }],
  ["missing Build checks", (f) => { delete f.attempts.find((a) => a.questionType === "build").structuralAnswer.checks; }],
  ["cyclic invalid Build identity", (f) => { const value = {}; value.self = value; f.attempts.find((a) => a.questionType === "build").structuralAnswer.referenceIdentity = value; }],
]) test(`malformed log fails safely: ${label}; never repairs history`, () => {
  const fixture = practiceReviewFixture(); corrupt(fixture); const before = structuredClone(fixture);
  const result = buildSessionReview(fixture); assert.equal(result.ok, false); assert.equal(result.code, "INCOMPLETE_DATA");
  assert.ok(result.issues.length); assert.ok(!("model" in result)); assert.deepEqual(fixture, before);
});
test("a nonnumeric Symbol duration returns a typed error without arithmetic or history changes", () => {
  const fixture = practiceReviewFixture(), invalid = Symbol("duration"); fixture.attempts[0].responseTimeMs = invalid;
  const result = buildSessionReview(fixture); assert.equal(result.ok, false); assert.ok(result.issues.includes("INVALID_TIMING"));
  assert.equal(fixture.attempts[0].responseTimeMs, invalid);
});
test("Exam rejects corrections and malformed timing without a partial dashboard", () => {
  const f = examReviewFixture(); f.attempts.push(reviewAttempt(1, true, 2));
  assert.ok(buildSessionReview(f).issues.includes("EXAM_CORRECTION"));
  for (const state of [{ phase: "CONFIG" }, { phase: "EXAM_QUESTION" }, { phase: "EXAM_REVIEW", attempts: [], locked: true, gradingError: true }])
    assert.equal(buildCompletedSessionReview(state).code, "NOT_COMPLETED");
});
test("closed Practice prefixes and Endless exclude open unsent questions; default finite validation remains strict", () => {
  const config = reviewConfig("practice", 15), attempts = [reviewAttempt(1, true), reviewAttempt(2, false)];
  assert.equal(buildSessionReview({ config, attempts }).ok, false);
  const completed = buildCompletedSessionReview({ phase: "COMPLETE", config, attempts });
  assert.equal(completed.ok, true); assert.equal(completed.model.questionCount, 2); assert.equal(completed.model.config.questionCount, 15);
  assert.equal(buildCompletedSessionReview({ phase: "COMPLETE", config: { ...config, questionCount: "endless" }, attempts }).model.questionCount, 2);
  const empty = buildCompletedSessionReview({ phase: "COMPLETE", config, attempts: [] }).model;
  assert.equal(empty.timing.initial.averageMs, null); assert.equal(empty.timing.initial.medianMs, null);
});
test("filters are read-only and never change overview or grouped attempts", () => {
  const m = model(practiceReviewFixture()), before = JSON.stringify(m);
  assert.equal(filterSessionReviewQuestions(m, { status: "CORRECTED" }).length, 2);
  assert.equal(filterSessionReviewQuestions(m, { status: "UNRESOLVED", questionType: "build", category: "alkane" }).length, 1);
  assert.equal(filterSessionReviewQuestions(m, { status: "CORRECTED", questionType: "naming" }).length, 0);
  assert.equal(JSON.stringify(m), before);
});
test("model is serializable, isolated from caller mutation, locale-neutral in metrics, and independent of time/entropy", () => {
  const f = practiceReviewFixture(), before = structuredClone(f), oldNow = Date.now, oldRandom = Math.random;
  try {
    Date.now = Math.random = () => { throw new Error("Unexpected clock/entropy"); };
    const m = model(f); assert.deepEqual(JSON.parse(JSON.stringify(m)), m); assert.deepEqual(f, before);
    const en = model({ ...f, config: { ...f.config, locale: "en" } });
    assert.deepEqual(en.overview, m.overview); assert.deepEqual(en.questions, m.questions); assert.deepEqual(en.timing, m.timing);
    f.attempts[0].answer = "mutated"; assert.notEqual(m.questions[0].firstAttempt.answer, "mutated");
  } finally { Date.now = oldNow; Math.random = oldRandom; }
});
test("15/37/100-question pure analytics measurements include no chemical generation", () => {
  const measurements = [];
  for (const count of [15, 37, 100]) {
    const f = { config: reviewConfig("practice", count), attempts: Array.from({ length: count }, (_, i) => reviewAttempt(i + 1, i % 2 === 0)) };
    const before = performance.now(), m = model(f);
    measurements.push({ questions: count, analyticsMs: performance.now() - before });
    assert.equal(m.questionCount, count); assert.equal(m.questions.length, count); assert.equal(m.overview.totalAttempts, count);
  }
  console.log("SESSION_REVIEW_ANALYTICS=" + JSON.stringify(measurements));
});
