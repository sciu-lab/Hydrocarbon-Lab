import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePracticeMetrics, formatPracticePercentage, formatPracticeResponseTime } from "../app/practice-metrics.ts";

const record = (id, correct, responseTimeMs, category = "alkane", questionType = "naming", attemptNumber = 1) => ({
  questionId: `q-${id}`, questionSeed: `seed-${id}`, generatorVersion: 1, displayOrdinal: id, generationIndex: id - 1,
  structuralIdentity: `structure-${id}`, category, questionType, attemptNumber, answer: "raw answer", correct,
  startedAt: 1700000000000, submittedAt: 1700000000000 + responseTimeMs, responseTimeMs, localeAtSubmission: "es",
});

test("zero attempts produce defined finite initial metrics and no phantom groups", () => {
  assert.deepEqual(calculatePracticeMetrics([]), {
    answeredQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, initialScore: 0, firstAttemptAccuracy: 0,
    averageResponseTimeMs: 0, medianResponseTimeMs: 0, questionsToReview: 0, initialErrors: [], byCategory: [], byQuestionType: [],
  });
});

for (const correct of [true, false]) test(`one ${correct ? "correct" : "incorrect"} attempt has the expected score/time/review set`, () => {
  const first = record(1, correct, 4500), metrics = calculatePracticeMetrics([first]);
  assert.equal(metrics.answeredQuestions, 1);
  assert.equal(metrics.correctAnswers, +correct);
  assert.equal(metrics.incorrectAnswers, +!correct);
  assert.equal(metrics.initialScore, +correct);
  assert.equal(metrics.firstAttemptAccuracy, +correct * 100);
  assert.equal(metrics.averageResponseTimeMs, 4500);
  assert.equal(metrics.medianResponseTimeMs, 4500);
  assert.equal(metrics.questionsToReview, +!correct);
  assert.deepEqual(metrics.initialErrors, correct ? [] : [first]);
});

test("known mixed fixture calculates even median, arithmetic mean, counts and canonical group order", () => {
  const log = [record(1, false, 9000, "ez"), record(2, true, 1000, "alkane"),
    record(3, true, 4000, "alcohol"), record(4, false, 2000, "alkane")];
  const snapshot = structuredClone(log), metrics = calculatePracticeMetrics(log);
  assert.equal(metrics.answeredQuestions, 4);
  assert.equal(metrics.correctAnswers, 2);
  assert.equal(metrics.incorrectAnswers, 2);
  assert.equal(metrics.initialScore, 0.5);
  assert.equal(metrics.firstAttemptAccuracy, 50);
  assert.equal(metrics.averageResponseTimeMs, 4000);
  assert.equal(metrics.medianResponseTimeMs, 3000);
  assert.equal(metrics.questionsToReview, 2);
  assert.deepEqual(metrics.initialErrors.map((entry) => entry.questionId), ["q-1", "q-4"]);
  assert.deepEqual(metrics.byCategory, [
    { id: "alkane", correct: 1, answered: 2, accuracy: 50 },
    { id: "alcohol", correct: 1, answered: 1, accuracy: 100 },
    { id: "ez", correct: 0, answered: 1, accuracy: 0 },
  ]);
  assert.deepEqual(metrics.byQuestionType, [{ id: "naming", correct: 2, answered: 4, accuracy: 50 }]);
  assert.deepEqual(log, snapshot);
});

test("odd median and internal rates retain full precision rather than display rounding", () => {
  const metrics = calculatePracticeMetrics([record(1, true, 1), record(2, true, 4), record(3, false, 2)]);
  assert.equal(metrics.medianResponseTimeMs, 2);
  assert.equal(metrics.averageResponseTimeMs, 7 / 3);
  assert.equal(metrics.initialScore, 2 / 3);
  assert.equal(metrics.firstAttemptAccuracy, 2 / 3 * 100);
  assert.equal(metrics.byCategory[0].accuracy, 2 / 3 * 100);
});

test("initial results stay identical when a later correction fixture is appended", () => {
  const first = record(1, false, 4500);
  const initial = calculatePracticeMetrics([first]);
  assert.deepEqual(calculatePracticeMetrics([first, { ...first, correct: true, responseTimeMs: 99999, attemptNumber: 2 }]), initial);
  assert.deepEqual(calculatePracticeMetrics([{ ...first, attemptNumber: 2 }]), calculatePracticeMetrics([]));
});

test("question-type grouping uses the catalog, supports every type and omits unanswered types", () => {
  const metrics = calculatePracticeMetrics([
    record(1, false, 100, "alkane", "build"), record(2, true, 100, "alkane", "multiple-choice"),
    record(3, true, 100, "alkane", "naming"), record(4, false, 100, "alkane", "naming"),
  ]);
  assert.deepEqual(metrics.byQuestionType, [
    { id: "naming", correct: 1, answered: 2, accuracy: 50 },
    { id: "multiple-choice", correct: 1, answered: 1, accuracy: 100 },
    { id: "build", correct: 0, answered: 1, accuracy: 0 },
  ]);
});

test("metric results and deterministic grouping do not depend on submission language", () => {
  const log = [record(1, true, 1200), record(2, false, 8000, "ez")];
  const en = calculatePracticeMetrics(log.map((entry) => ({ ...entry, localeAtSubmission: "en" })));
  const es = calculatePracticeMetrics(log);
  assert.deepEqual({ ...en, initialErrors: en.initialErrors.map((entry) => ({ ...entry, localeAtSubmission: "es" })) }, es);
});

test("duration display localizes decimal separators and handles minute rounding without altering milliseconds", () => {
  assert.equal(formatPracticeResponseTime(12400, "en"), "12.4 s");
  assert.equal(formatPracticeResponseTime(12400, "es"), "12,4 s");
  assert.equal(formatPracticeResponseTime(72500, "en"), "1 min 12.5 s");
  assert.equal(formatPracticeResponseTime(72500, "es"), "1 min 12,5 s");
  assert.equal(formatPracticeResponseTime(59999, "en"), "1 min 0.0 s");
  assert.equal(formatPracticeResponseTime(0, "en"), "0.0 s");
});

test("percentage display is consistent and bounded to one decimal without changing the ratio", () => {
  const percentage = 2 / 3 * 100;
  assert.equal(formatPracticePercentage(percentage, "en"), "66.7%");
  assert.match(formatPracticePercentage(percentage, "es"), /66,7\s*%/);
  assert.equal(formatPracticePercentage(0, "en"), "0%");
  assert.equal(formatPracticePercentage(100, "en"), "100%");
  assert.equal(percentage, 2 / 3 * 100);
});
