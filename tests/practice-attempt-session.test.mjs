import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { deriveGenerationIdentity } from "../app/exercise-seed.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { createPracticeClock } from "../app/practice-timing.ts";
import { createPracticeConfig, endPractice, localizePracticeState, markPracticeQuestionAvailable,
  nextPracticeQuestion, retryPracticeGeneration, startPractice, submitPracticeAnswer, updatePracticeAnswer } from "../app/practice-session.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry, generate;
before(async () => { chemistry = await loadExerciseChemistry(); generate = createRestrictedChemicalGenerator(chemistry.oracles); });
after(async () => { await chemistry?.close(); });
const config = (count = 5) => createPracticeConfig(["alkane", "alcohol", "ez"], count, "es", "PHASE4-ATTEMPTS");
const time = (monotonicMs, wallTimeMs = 1700000000000 + monotonicMs) => ({ monotonicMs, wallTimeMs });
const ready = (state, at = 1000) => markPracticeQuestionAvailable(state, time(at));
const answer = (state, correct = true, at = 5500, locale = "es") => submitPracticeAnswer(
  updatePracticeAnswer(state, correct ? `  ${state.question.reference.names[locale]}  ` : "respuesta incorrecta real"), locale, time(at));

for (const correct of [true, false]) test(`actual ${correct ? "correct" : "incorrect"} naming submission creates exactly one matching initial record`, () => {
  const state = ready(startPractice(config(), generate));
  const feedback = answer(state, correct);
  assert.equal(feedback.phase, "FEEDBACK");
  assert.equal(feedback.correct, correct);
  assert.equal(feedback.attempts.length, 1);
  const record = feedback.attempts[0];
  assert.equal(record.answer, feedback.answer);
  assert.equal(record.attemptNumber, 1);
  assert.equal(record.category, state.question.category);
  assert.equal(record.questionId, state.question.question.id);
  assert.equal(record.questionSeed, state.question.question.seed);
  assert.equal(record.structuralIdentity, state.question.reference.structuralIdentity);
  assert.equal(record.generationIndex, state.generationIndex);
  assert.equal(record.displayOrdinal, 1);
  assert.equal(record.responseTimeMs, 4500);
  assert.equal(submitPracticeAnswer(feedback, "en", time(20000)), feedback);
  assert.equal(feedback.attempts.length, 1);
});

test("unavailable, blank, abandoned questions and generation errors never create records", () => {
  const state = startPractice(config(), generate);
  assert.equal(state.timing, null);
  const draft = updatePracticeAnswer(state, "draft");
  assert.equal(submitPracticeAnswer(draft, "es", time(5500)), draft);
  const blank = ready(updatePracticeAnswer(state, " \n "));
  assert.equal(submitPracticeAnswer(blank, "es", time(5500)), blank);
  assert.deepEqual(endPractice(draft).attempts, []);
  const failed = startPractice(config(), () => { throw new Error("generation failure"); });
  assert.equal(failed.phase, "ERROR");
  assert.deepEqual(failed.attempts, []);
  assert.equal(submitPracticeAnswer(failed, "es", time(5500)), failed);
  assert.deepEqual(endPractice(failed).attempts, []);
});

test("fake-clock presentation 1000 to Submit 5500 is frozen at 4500 even with Next at 20000", () => {
  let now = 1000;
  const clock = createPracticeClock(() => now, () => 1700000000000 + now);
  const unready = startPractice(config(), generate);
  assert.equal(unready.timing, null, "generation itself never starts the timer");
  const state = markPracticeQuestionAvailable(unready, clock.read());
  now = 5500;
  const feedback = submitPracticeAnswer(updatePracticeAnswer(state, state.question.reference.name), "es", clock.read());
  now = 20000;
  const next = nextPracticeQuestion(feedback, generate);
  assert.equal(next.attempts[0].responseTimeMs, 4500);
  assert.equal(next.attempts, feedback.attempts);
  assert.equal(next.timing, null);
  const displayed = markPracticeQuestionAvailable(next, clock.read());
  now = 20500;
  const second = submitPracticeAnswer(updatePracticeAnswer(displayed, displayed.question.reference.name), "es", clock.read());
  assert.deepEqual(second.attempts.map((record) => record.responseTimeMs), [4500, 500]);
});

test("live locale changes and repeated presentation/theme commits preserve the timer and submitted outcome", () => {
  const state = ready(startPractice(config(), generate));
  const en = localizePracticeState(state, "en");
  assert.equal(en.timing, state.timing);
  assert.equal(en.question.question.id, state.question.question.id);
  assert.equal(markPracticeQuestionAvailable(en, time(4000)), en);
  const feedback = answer(en, true, 5500, "en");
  const metrics = calculatePracticeMetrics(feedback.attempts);
  const es = localizePracticeState(feedback, "es");
  assert.equal(es.attempts, feedback.attempts);
  assert.equal(es.correct, true);
  assert.equal(es.attempts[0].localeAtSubmission, "en");
  assert.equal(es.attempts[0].responseTimeMs, 4500);
  assert.deepEqual(calculatePracticeMetrics(es.attempts), metrics);
  assert.equal(markPracticeQuestionAvailable(es, time(20000)), es);
});

test("five finite questions produce five initial attempts and a summary after the fifth Next", () => {
  let state = startPractice(config(), generate);
  const durations = [4500, 1000, 8000, 2000, 3000];
  for (let index = 0; index < 5; index += 1) {
    state = ready(state, index * 20000 + 1000);
    const feedback = answer(state, index % 2 === 0, index * 20000 + 1000 + durations[index]);
    assert.equal(feedback.attempts.length, index + 1);
    state = nextPracticeQuestion(feedback, generate);
  }
  assert.equal(state.phase, "COMPLETE");
  assert.equal(state.attempts.length, 5);
  assert.deepEqual(state.attempts.map((entry) => entry.displayOrdinal), [1, 2, 3, 4, 5]);
  assert.ok(state.attempts.every((entry) => entry.attemptNumber === 1));
  const metrics = calculatePracticeMetrics(state.attempts);
  assert.equal(metrics.correctAnswers, 3);
  assert.equal(metrics.initialScore, 3 / 5);
  assert.equal(metrics.firstAttemptAccuracy, 60);
  assert.equal(metrics.averageResponseTimeMs, 3700);
  assert.equal(metrics.medianResponseTimeMs, 3000);
  assert.equal(metrics.questionsToReview, 2);
});

test("Endless end includes only submitted questions and a fresh practice cannot mix logs", () => {
  const sessionConfig = config("endless");
  let state = startPractice(sessionConfig, generate);
  for (let index = 0; index < 3; index += 1) state = nextPracticeQuestion(answer(ready(state), index !== 1), generate);
  const ended = endPractice(updatePracticeAnswer(ready(state), "unsent draft"));
  assert.equal(ended.phase, "COMPLETE");
  assert.equal(ended.attempts.length, 3);
  assert.equal(calculatePracticeMetrics(ended.attempts).correctAnswers, 2);
  assert.equal(endPractice(ended), ended);
  assert.deepEqual(startPractice(sessionConfig, generate).attempts, []);
  assert.equal(ended.attempts.length, 3);
});

test("duplicate skips record actual generationIndex independently from displayOrdinal and reconstruct the graph", () => {
  const sessionConfig = config("endless"), first = generate(sessionConfig, 0);
  const duplicates = (cfg, index) => index > 0 && index < 4
    ? { ...first, question: deriveGenerationIdentity(cfg, index) } : generate(cfg, index);
  const next = nextPracticeQuestion(answer(ready(startPractice(sessionConfig, duplicates))), duplicates);
  assert.equal(next.generationIndex, 4);
  assert.equal(next.index, 1);
  const second = answer(ready(next));
  assert.equal(second.attempts[1].displayOrdinal, 2);
  assert.equal(second.attempts[1].generationIndex, 4);
  const reconstructed = generate(sessionConfig, second.attempts[1].generationIndex);
  assert.equal(reconstructed.question.id, second.attempts[1].questionId);
  assert.equal(reconstructed.question.seed, second.attempts[1].questionSeed);
  assert.equal(reconstructed.reference.structuralIdentity, second.attempts[1].structuralIdentity);
});

test("generation error/recovery preserves existing attempts and starts no timer until presentation", () => {
  const feedback = answer(ready(startPractice(config(), generate)));
  const failed = nextPracticeQuestion(feedback, () => { throw new Error("failure"); });
  assert.equal(failed.phase, "ERROR");
  assert.equal(failed.attempts, feedback.attempts);
  const recovered = retryPracticeGeneration(failed, generate);
  assert.equal(recovered.timing, null);
  assert.equal(recovered.attempts.length, 1);
  assert.equal(endPractice(recovered).attempts.length, 1);
});

test("stale presentation events cannot start a timer for the wrong identity or display ordinal", () => {
  const state = startPractice(config(), generate);
  assert.equal(markPracticeQuestionAvailable(state, time(1000), { questionId: "stale", index: state.index }), state);
  assert.equal(markPracticeQuestionAvailable(state, time(1000), { questionId: state.question.question.id, index: 999 }), state);
  assert.equal(ready(state).timing.monotonicMs, 1000);
});
