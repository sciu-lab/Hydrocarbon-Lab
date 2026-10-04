import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery, reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { createPracticeClock } from "../app/practice-timing.ts";
import { createPracticeConfig, endPractice, localizePracticeState, markPracticeQuestionAvailable, nextPracticeQuestion,
  retryPracticeGeneration, startPractice, startPracticeCorrections, submitPracticeAnswer, updatePracticeAnswer } from "../app/practice-session.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry, generate;
before(async () => { chemistry = await loadExerciseChemistry(); generate = createRestrictedChemicalGenerator(chemistry.oracles); });
after(async () => { await chemistry?.close(); });
const time = (now) => ({ monotonicMs: now, wallTimeMs: 1700000000000 + now });
const config = (count = 5, categories = ["alkane", "alcohol"]) => createPracticeConfig(categories, count, "es", "PHASE5-CORRECTIONS", ["naming"], "basic", 1);
const submit = (state, correct, locale = "es", start = 1000, end = 5500) => submitPracticeAnswer(
  updatePracticeAnswer(markPracticeQuestionAvailable(state, time(start)), correct ? state.question.reference.names[locale] : "wrong"), locale, time(end));
function complete(cfg = config(), wrong = [1, 3]) {
  let state = startPractice(cfg, generate);
  const originals = [];
  for (let index = 0; index < cfg.questionCount; index += 1) {
    originals.push(state.question);
    state = nextPracticeQuestion(submit(state, !wrong.includes(index)), generate);
  }
  return { state, originals };
}

test("finite round recovers only initial mistakes, same full graphs and records, then stops at summary", () => {
  const { state: summary, originals } = complete();
  const initial = calculatePracticeMetrics(summary.attempts);
  let state = startPracticeCorrections(summary, generate);
  assert.equal(state.phase, "CORRECTION_QUESTION");
  assert.deepEqual(state.queue.map((entry) => entry.displayOrdinal), [2, 4]);
  for (const ordinal of [2, 4]) {
    assert.equal(state.original, summary.attempts[ordinal - 1]);
    assert.deepEqual(state.question, originals[ordinal - 1]);
    assert.equal(state.answer, "");
    assert.equal(state.timing, null);
    state = submit(state, true);
    assert.equal(state.phase, "CORRECTION_FEEDBACK");
    assert.equal(state.attempts.at(-1).attemptNumber, 2);
    assert.equal(submitPracticeAnswer(state, "en", time(9000)), state);
    assert.equal(updatePracticeAnswer(state, "replacement"), state);
    state = nextPracticeQuestion(state, generate);
  }
  assert.equal(state.phase, "CORRECTION_SUMMARY");
  assert.equal(state.attempts.length, 7);
  assert.deepEqual(calculatePracticeMetrics(state.attempts), initial);
  assert.equal(calculatePracticeMastery(state.attempts).finalMastery, 100);
  assert.equal(startPracticeCorrections(state, () => { throw new Error("must not generate"); }), state);
  assert.equal(nextPracticeQuestion(state, generate), state);
});

test("explicit retry contains only remaining questions and appends attempt 3 after failed attempt 2", () => {
  const { state: summary } = complete();
  let state = startPracticeCorrections(summary, generate);
  state = nextPracticeQuestion(submit(state, true), generate);
  state = nextPracticeQuestion(submit(state, false), generate);
  assert.equal(state.phase, "CORRECTION_SUMMARY");
  assert.equal(calculatePracticeMastery(state.attempts).remainingMistakes, 1);
  assert.equal(calculatePracticeMastery(state.attempts).finalMastery, 80);
  state = startPracticeCorrections(state, generate);
  assert.deepEqual(state.queue.map((entry) => entry.displayOrdinal), [4]);
  state = nextPracticeQuestion(submit(state, true), generate);
  assert.equal(state.phase, "CORRECTION_SUMMARY");
  assert.deepEqual(state.attempts.filter((entry) => entry.displayOrdinal === 4).map((entry) => [entry.attemptNumber, entry.correct]),
    [[1, false], [2, false], [3, true]]);
  assert.equal(calculatePracticeMetrics(state.attempts).firstAttemptAccuracy, 60);
  assert.equal(calculatePracticeMastery(state.attempts).correctionAttempts, 3);
  assert.equal(calculatePracticeMastery(state.attempts).finalMastery, 100);
});

test("frozen real duplicate avoidance: display ordinal 6 reconstructs generationIndex 6, never index 5", () => {
  const cfg = createPracticeConfig(["alkane"], 10, "es", "PHASE5-DUPLICATE", ["naming"], "basic", 1);
  const { state: summary, originals } = complete(cfg, [5]);
  const original = summary.attempts[5];
  assert.equal(original.displayOrdinal, 6);
  assert.equal(original.generationIndex, 6);
  assert.equal(original.structuralIdentity, "dgl@@LdbbRqRUUUUT@@");
  assert.equal(original.questionId, generate(cfg, 6).question.id);
  const calls = [];
  const state = startPracticeCorrections(summary, (config, index) => { calls.push(index); return generate(config, index); });
  assert.deepEqual(calls, [6]);
  assert.equal(state.generationIndex, 6);
  assert.deepEqual(state.question, originals[5]);
  assert.equal(exerciseStructuralIdentity(state.question.molecule), original.structuralIdentity);
  assert.equal(state.question.reference.names.es, "4-etil-3-metilundecano");
  assert.notEqual(generate(cfg, 5).reference.structuralIdentity, original.structuralIdentity);
});

for (const field of ["structuralIdentity", "questionId", "questionSeed", "category", "generatorVersion"]) {
  test(`reconstruction rejects changed ${field}, presents no molecule, and preserves the log`, () => {
    const { state: summary } = complete(config(), [0]);
    const original = summary.attempts[0];
    const changed = { ...original, [field]: field === "generatorVersion" ? 2 : "changed" };
    const context = { ...summary, attempts: [changed, ...summary.attempts.slice(1)] };
    assert.throws(() => reconstructPracticeCorrection(context.config, changed, generate));
    const error = startPracticeCorrections(context, generate);
    assert.equal(error.phase, "CORRECTION_ERROR");
    assert.equal(Object.hasOwn(error, "question"), false);
    assert.equal(error.attempts, context.attempts);
    assert.equal(endPractice(error).phase, "CORRECTION_SUMMARY");
    assert.equal(endPractice(error).attempts, context.attempts);
  });
}

test("transient reconstruction failure retries exactly the same context, without an attempt or timer", () => {
  const { state: summary } = complete(config(), [0]);
  const error = startPracticeCorrections(summary, () => { throw new Error("private error"); });
  assert.equal(error.phase, "CORRECTION_ERROR");
  const recovered = retryPracticeGeneration(error, generate);
  assert.equal(recovered.phase, "CORRECTION_QUESTION");
  assert.equal(recovered.timing, null);
  assert.equal(recovered.attempts, summary.attempts);
  assert.equal(recovered.original, summary.attempts[0]);
});

test("correction fake clock starts at presentation, excludes feedback and measures each round independently", () => {
  const { state: summary } = complete(config(), [0]);
  let now = 20000;
  const clock = createPracticeClock(() => now, () => 1700000000000 + now);
  let state = startPracticeCorrections(summary, generate);
  assert.equal(state.timing, null);
  now = 25000;
  state = markPracticeQuestionAvailable(state, clock.read());
  now = 32400;
  state = submitPracticeAnswer(updatePracticeAnswer(state, "wrong"), "es", clock.read());
  now = 100000;
  state = nextPracticeQuestion(state, generate);
  state = startPracticeCorrections(state, generate);
  assert.equal(state.timing, null);
  now = 110000;
  state = markPracticeQuestionAvailable(state, clock.read());
  now = 112000;
  state = submitPracticeAnswer(updatePracticeAnswer(state, state.question.reference.names.es), "es", clock.read());
  assert.deepEqual(state.attempts.filter((entry) => entry.displayOrdinal === 1).map((entry) => entry.responseTimeMs), [4500, 7400, 2000]);
});

test("locale/theme commits preserve correction queue, graph, draft, timer and past submission outcomes", () => {
  const { state: summary } = complete(config(), [0]);
  const state = updatePracticeAnswer(markPracticeQuestionAvailable(startPracticeCorrections(summary, generate), time(20000)), "draft");
  const en = localizePracticeState(state, "en");
  assert.equal(en.queue, state.queue);
  assert.equal(en.question.molecule, state.question.molecule);
  assert.equal(en.question.reference.structuralIdentity, state.original.structuralIdentity);
  assert.equal(en.answer, "draft");
  assert.equal(en.timing, state.timing);
  assert.equal(en.attempts, state.attempts);
  assert.equal(en.question.reference.name, state.question.reference.names.en);
  assert.equal(markPracticeQuestionAvailable(en, time(25000)), en);
  const feedback = submitPracticeAnswer(updatePracticeAnswer(en, en.question.reference.name), "en", time(27400));
  const es = localizePracticeState(feedback, "es");
  assert.equal(es.correct, true);
  assert.equal(es.attempts, feedback.attempts);
  assert.equal(es.attempts.at(-1).localeAtSubmission, "en");
  assert.equal(es.attempts.at(-1).responseTimeMs, 7400);
  assert.equal(es.attempts[0].correct, false);
});

test("Endless corrections exclude the open unsent question and use only submitted answers as mastery denominator", () => {
  let state = startPractice(config("endless"), generate);
  for (const correct of [true, false, false]) state = nextPracticeQuestion(submit(state, correct), generate);
  const unanswered = state.question.question.id;
  state = endPractice(updatePracticeAnswer(state, "unsent"));
  state = startPracticeCorrections(state, generate);
  assert.deepEqual(state.queue.map((entry) => entry.displayOrdinal), [2, 3]);
  assert.ok(state.queue.every((entry) => entry.questionId !== unanswered));
  while (state.phase === "CORRECTION_QUESTION") state = nextPracticeQuestion(submit(state, true), generate);
  assert.equal(state.phase, "CORRECTION_SUMMARY");
  assert.equal(calculatePracticeMastery(state.attempts).initialAnswered, 3);
  assert.equal(calculatePracticeMastery(state.attempts).finalMasteredQuestions, 3);
  assert.equal(calculatePracticeMetrics(state.attempts).correctAnswers, 1);
});

test("Finish review abandons an unsent correction safely; blank/unavailable/stale submits create no records", () => {
  const { state: summary } = complete(config(), [0]);
  const state = startPracticeCorrections(summary, generate);
  const draft = updatePracticeAnswer(state, "draft");
  assert.equal(submitPracticeAnswer(draft, "es", time(5500)), draft);
  assert.equal(markPracticeQuestionAvailable(state, time(1000), { questionId: "stale", index: state.index }), state);
  const blank = markPracticeQuestionAvailable(state, time(1000));
  assert.equal(submitPracticeAnswer(blank, "es", time(5500)), blank);
  const ended = endPractice(draft);
  assert.equal(ended.phase, "CORRECTION_SUMMARY");
  assert.equal(ended.attempts, summary.attempts);
  assert.equal(calculatePracticeMastery(ended.attempts).remainingMistakes, 1);
  assert.equal(startPracticeCorrections(startPractice(config(), generate), generate).phase, "QUESTION");
});

test("all admitted categories reconstruct ES/EN chemistry, full graphs and their original references", () => {
  for (const category of EXERCISE_CATEGORIES) {
    const cfg = config(5, [category]);
    const question = startPractice(cfg, generate);
    const summary = endPractice(submit(question, false));
    for (const locale of ["es", "en"]) {
      const correction = startPracticeCorrections(localizePracticeState(summary, locale), generate);
      assert.equal(correction.phase, "CORRECTION_QUESTION");
      assert.deepEqual(correction.question.molecule, question.question.molecule);
      assert.equal(correction.question.reference.structuralIdentity, summary.attempts[0].structuralIdentity);
      assert.equal(correction.question.reference.formula, question.question.reference.formula);
      assert.equal(correction.question.reference.smiles, question.question.reference.smiles);
      assert.equal(correction.question.reference.name, question.question.reference.names[locale]);
    }
  }
});

test("Correction Loop uses the shared Naming evaluator for an unaccented answer to a real Spanish reference", () => {
  const cfg = createPracticeConfig(["carboxylic-acid"], 5, "es", "PRACTICE-005-accent-reference", ["naming"], "basic", 1);
  const question = startPractice(cfg, generate);
  assert.equal(question.question.reference.names.es, "ácido octanoico");
  const first = submitPracticeAnswer(updatePracticeAnswer(markPracticeQuestionAvailable(question, time(1000)), "respuesta errónea"), "es", time(2000));
  assert.equal(first.correct, false);
  const summary = endPractice(first);
  const correction = startPracticeCorrections(summary, generate);
  assert.equal(correction.phase, "CORRECTION_QUESTION");
  assert.equal(correction.question.reference.name, "ácido octanoico");
  const ready = markPracticeQuestionAvailable(correction, time(3000));
  const feedback = submitPracticeAnswer(updatePracticeAnswer(ready, "acido octanoico"), "es", time(5000));
  assert.equal(feedback.phase, "CORRECTION_FEEDBACK");
  assert.equal(feedback.correct, true);
  assert.equal(feedback.attempts.at(-1).attemptNumber, 2);
});
