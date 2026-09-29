import assert from "node:assert/strict";
import { test } from "node:test";
import { appendPracticeAttempt } from "../app/practice-attempt.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery, createCorrectionAttempt, createCorrectionQueue } from "../app/practice-corrections.ts";

const record = (ordinal, correct = false, attemptNumber = 1) => ({
  questionId: `question-${ordinal}`, displayOrdinal: ordinal, generationIndex: ordinal + 3,
  questionSeed: `seed-${ordinal}`, generatorVersion: 1, category: "alcohol", questionType: "naming",
  structuralIdentity: "same-structure", attemptNumber, answer: "original answer", correct,
  startedAt: 1700000000000, submittedAt: 1700000004500, responseTimeMs: 4500, localeAtSubmission: "es",
});
const input = (correct) => ({ answer: "new answer", correct, locale: "en",
  started: { monotonicMs: 20000, wallTimeMs: 1700000020000 },
  submitted: { monotonicMs: 27400, wallTimeMs: 1700000027400 } });

test("queue contains only unique initial incorrect questions in original display order", () => {
  const first = record(2), last = record(5), correct = record(1, true);
  const log = [last, correct, first, record(8, false, 2), first, { ...correct, correct: false, attemptNumber: 2 }];
  const snapshot = structuredClone(log);
  assert.deepEqual(createCorrectionQueue(log), [first, last]);
  assert.equal(createCorrectionQueue(log)[0], first);
  assert.deepEqual(log, snapshot);
  assert.deepEqual(createCorrectionQueue([]), []);
});

test("matching chemical identities do not collapse different question IDs/generation indices", () => {
  const a = record(2), b = record(5);
  const log = [a, b, { ...a, attemptNumber: 2, correct: true }];
  assert.equal(a.structuralIdentity, b.structuralIdentity);
  assert.deepEqual(createCorrectionQueue(log), [b]);
  assert.equal(calculatePracticeMastery(log).correctedQuestions, 1);
  assert.equal(calculatePracticeMastery(log).remainingMistakes, 1);
});

test("attempt 1 incorrect, 2 incorrect, 3 correct append separate immutable records and fresh times", () => {
  const first = Object.freeze(record(2));
  const second = createCorrectionAttempt(first, [first], input(false));
  const log = appendPracticeAttempt([first], second);
  const third = createCorrectionAttempt({ ...first }, log, input(true));
  const final = appendPracticeAttempt(log, third);
  assert.deepEqual(final.map((entry) => entry.attemptNumber), [1, 2, 3]);
  assert.deepEqual(final.map((entry) => entry.correct), [false, false, true]);
  assert.deepEqual(final.map((entry) => entry.responseTimeMs), [4500, 7400, 7400]);
  for (const entry of final) for (const field of ["questionId", "generationIndex", "questionSeed", "category", "structuralIdentity", "displayOrdinal", "generatorVersion"])
    assert.equal(entry[field], first[field]);
  assert.equal(first.answer, "original answer");
  assert.equal(first.localeAtSubmission, "es");
  assert.equal(third.localeAtSubmission, "en");
  assert.equal(appendPracticeAttempt(final, third), final);
  assert.deepEqual(createCorrectionQueue(final), []);
});

test("attempt numbers derive from maximum history, and invalid origins cannot create corrections", () => {
  const first = record(1);
  assert.equal(createCorrectionAttempt(first, [first, record(1, false, 4), record(1, false, 2)], input(true)).attemptNumber, 5);
  assert.throws(() => createCorrectionAttempt(first, [], input(true)));
  assert.throws(() => createCorrectionAttempt(record(1, true), [record(1, true)], input(true)));
  assert.throws(() => createCorrectionAttempt(record(1, false, 2), [first], input(true)));
});

test("initial 6/10 and all initial metrics remain exactly identical after 4/4 corrections", () => {
  const initial = Array.from({ length: 10 }, (_, index) => Object.freeze(record(index + 1, index < 6)));
  const before = calculatePracticeMetrics(initial);
  const corrections = initial.filter((entry) => !entry.correct).map((entry) => createCorrectionAttempt(entry, initial, input(true)));
  const log = [...initial, ...corrections];
  assert.deepEqual(calculatePracticeMetrics(log), before);
  assert.equal(before.correctAnswers, 6);
  assert.equal(before.answeredQuestions, 10);
  assert.equal(before.firstAttemptAccuracy, 60);
  assert.deepEqual(calculatePracticeMastery(log), {
    originalQuestionsToReview: 4, correctedQuestions: 4, remainingMistakes: 0, correctionAttempts: 4,
    finalMasteredQuestions: 10, initialAnswered: 10, finalMastery: 100,
  });
});

for (const fixed of [0, 2, 4]) test(`mastery derives ${fixed} corrected out of 4 without changing initial score`, () => {
  const initial = Array.from({ length: 10 }, (_, index) => record(index + 1, index < 6));
  const log = [...initial, ...initial.slice(6).map((entry, index) => ({ ...entry, attemptNumber: 2, correct: index < fixed }))];
  const metrics = calculatePracticeMastery(log);
  assert.equal(metrics.correctedQuestions, fixed);
  assert.equal(metrics.remainingMistakes, 4 - fixed);
  assert.equal(metrics.finalMasteredQuestions, 6 + fixed);
  assert.equal(metrics.finalMastery, (6 + fixed) * 10);
  assert.equal(metrics.correctionAttempts, 4);
  assert.equal(calculatePracticeMetrics(log).firstAttemptAccuracy, 60);
});

test("mastery survives failed intermediate attempts and counts multiple successes only once", () => {
  const first = record(2);
  const log = [first, record(2, false, 2), record(2, true, 3), record(2, true, 4), record(2, false, 5), record(9, true, 2)];
  assert.deepEqual(calculatePracticeMastery(log), {
    originalQuestionsToReview: 1, correctedQuestions: 1, remainingMistakes: 0, correctionAttempts: 4,
    finalMasteredQuestions: 1, initialAnswered: 1, finalMastery: 100,
  });
  assert.deepEqual(createCorrectionQueue(log), []);
});

test("empty mastery is finite, and initial successes are mastered without correction records", () => {
  assert.deepEqual(calculatePracticeMastery([]), { originalQuestionsToReview: 0, correctedQuestions: 0,
    remainingMistakes: 0, correctionAttempts: 0, finalMasteredQuestions: 0, initialAnswered: 0, finalMastery: 0 });
  assert.equal(calculatePracticeMastery([record(1, true)]).finalMastery, 100);
});
