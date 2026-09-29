import assert from "node:assert/strict";
import { test } from "node:test";
import { appendPracticeAttempt, createInitialAttempt } from "../app/practice-attempt.ts";
import { createPracticeClock, practiceResponseTimeMs, validatePracticeTime } from "../app/practice-timing.ts";

const input = () => ({
  question: { question: { id: "question-7", seed: "chemical-seed-7", generatorVersion: 1 }, category: "alcohol",
    molecule: { atoms: [], bonds: [] }, reference: { structuralIdentity: "structure-7" } },
  displayOrdinal: 2, generationIndex: 7, answer: "  Etanol  ", correct: true,
  started: { monotonicMs: 1000, wallTimeMs: 1700000001000 },
  submitted: { monotonicMs: 5500, wallTimeMs: 1700000005500 }, locale: "es",
});

test("initial attempt records exact answer, chemical context, ordinal and evaluator outcome without a graph copy", () => {
  const source = input(), snapshot = structuredClone(source);
  assert.deepEqual(createInitialAttempt(source), {
    questionId: "question-7", questionSeed: "chemical-seed-7", generatorVersion: 1,
    displayOrdinal: 2, generationIndex: 7, category: "alcohol", questionType: "naming",
    structuralIdentity: "structure-7", attemptNumber: 1, answer: "  Etanol  ", correct: true,
    startedAt: 1700000001000, submittedAt: 1700000005500, responseTimeMs: 4500, localeAtSubmission: "es",
  });
  assert.deepEqual(source, snapshot);
  assert.equal(Object.hasOwn(createInitialAttempt(source), "molecule"), false);
});

test("incorrect attempts preserve the submitted language and incorrect outcome", () => {
  const record = createInitialAttempt({ ...input(), correct: false, answer: "actual wrong answer", locale: "en" });
  assert.equal(record.correct, false);
  assert.equal(record.answer, "actual wrong answer");
  assert.equal(record.localeAtSubmission, "en");
  assert.equal(record.attemptNumber, 1);
});

test("append is immutable and protects duplicate delivery from overwriting an initial attempt", () => {
  const original = [], record = createInitialAttempt(input());
  const log = appendPracticeAttempt(original, record);
  assert.deepEqual(original, []);
  assert.deepEqual(log, [record]);
  assert.equal(appendPracticeAttempt(log, { ...record, answer: "replacement", correct: false }), log);
  assert.equal(appendPracticeAttempt(log, { ...record, displayOrdinal: 3 }).length, 2);
});

test("the log contract can distinguish future attempt numbers without creating corrections in Practice", () => {
  const record = createInitialAttempt(input());
  const laterFixture = { ...record, attemptNumber: 2 };
  const log = appendPracticeAttempt([record], laterFixture);
  assert.deepEqual(log, [record, laterFixture]);
  assert.equal(appendPracticeAttempt(log, laterFixture), log);
  for (const attemptNumber of [0, -1, 1.5, NaN]) assert.throws(() => appendPracticeAttempt([], { ...record, attemptNumber }));
});

test("attempt positions reject invalid ordinals or generation contexts", () => {
  for (const change of [{ displayOrdinal: 0 }, { displayOrdinal: 1.5 }, { generationIndex: -1 }, { generationIndex: Infinity }]) {
    assert.throws(() => createInitialAttempt({ ...input(), ...change }));
  }
});

test("injected monotonic/absolute sources are read separately and only when requested", () => {
  let monotonic = 1000, wall = 1700000001000, calls = 0;
  const clock = createPracticeClock(() => { calls += 1; return monotonic; }, () => wall);
  assert.equal(calls, 0);
  const start = clock.read();
  monotonic = 5500; wall = 1700000005500;
  const submitted = clock.read();
  assert.equal(calls, 2);
  assert.equal(practiceResponseTimeMs(start, submitted), 4500);
});

test("wall-clock adjustments never determine response duration", () => {
  const source = input();
  assert.equal(createInitialAttempt({ ...source, submitted: { monotonicMs: 5500, wallTimeMs: 0 } }).responseTimeMs, 4500);
  assert.equal(practiceResponseTimeMs(source.started, source.started), 0);
});

test("invalid or backwards monotonic readings are rejected", () => {
  assert.throws(() => validatePracticeTime({ monotonicMs: NaN, wallTimeMs: 0 }));
  assert.throws(() => validatePracticeTime({ monotonicMs: 0, wallTimeMs: Infinity }));
  assert.throws(() => practiceResponseTimeMs(input().submitted, input().started));
});

test("validated presentation readings are copied to protect against a mutable clock fixture", () => {
  const reading = input().started;
  const stored = validatePracticeTime(reading);
  reading.monotonicMs = 9999;
  assert.equal(stored.monotonicMs, 1000);
});
