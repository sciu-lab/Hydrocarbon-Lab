import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator, ChemicalGenerationError } from "../app/exercise-chemical-generator.ts";
import {
  createPracticeConfig, endPractice, localizePracticeState, markPracticeQuestionAvailable, nextPracticeQuestion,
  PRACTICE_DUPLICATE_LIMIT, PRACTICE_RECENT_LIMIT, resolvePracticeSeed, retryPracticeGeneration,
  startPractice, submitPracticeAnswer, updatePracticeAnswer,
} from "../app/practice-session.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry, generate;
before(async () => { chemistry = await loadExerciseChemistry(); generate = createRestrictedChemicalGenerator(chemistry.oracles); });
after(async () => { await chemistry?.close(); });
const configFor = (count = 5, categories = ["alkane"], locale = "es") => createPracticeConfig(categories, count, locale, "PRACTICE-PHASE3");
const submit = (state, locale = "es") => submitPracticeAnswer(
  markPracticeQuestionAvailable(state, { monotonicMs: 1000, wallTimeMs: 1700000000000 }), locale,
  { monotonicMs: 5500, wallTimeMs: 1700000004500 });
const answerCorrectly = (state, locale = "es") => submit(updatePracticeAnswer(state, state.question.reference.names[locale]), locale);

test("Practice constructs the existing SessionConfig with Naming/basic and canonical category IDs", () => {
  assert.deepEqual(createPracticeConfig(["alcohol", "alkane", "alcohol"], 10, "en", " exact seed "), {
    mode: "practice", questionCount: 10, questionTypes: ["naming"], categories: ["alkane", "alcohol"],
    difficulty: "basic", locale: "en", seed: " exact seed ", generatorVersion: 1,
  });
  for (const count of [5, 10, 20, 30, "endless"]) assert.equal(configFor(count).questionCount, count);
  assert.throws(() => createPracticeConfig([], 5, "es", "seed"));
  assert.throws(() => createPracticeConfig(["sulfur"], 5, "es", "seed"));
  for (const count of [0, 1, 6, 12, "5"]) assert.throws(() => configFor(count));
});

test("the seed factory runs once at start for empty input and never modifies supplied seeds", () => {
  let calls = 0;
  const factory = () => { calls += 1; return "public-seed"; };
  assert.equal(resolvePracticeSeed("", factory), "public-seed");
  assert.equal(calls, 1);
  for (const seed of [" provided ", " ", "0", "química🧪"]) assert.equal(resolvePracticeSeed(seed, factory), seed);
  assert.equal(calls, 1);
  assert.throws(() => resolvePracticeSeed("", () => ""));
});

for (const count of [5, 10]) test(`finite Practice ${count}: one submission, Next, exact completion and no history`, () => {
  const config = configFor(count, ["alkane", "alcohol", "ester"]);
  let state = startPractice(config, generate);
  for (let index = 0; index < count; index += 1) {
    assert.equal(state.phase, "QUESTION");
    assert.equal(state.index, index);
    assert.deepEqual(state.question, generate(config, state.generationIndex));
    assert.equal(nextPracticeQuestion(state, generate), state);
    assert.equal(submitPracticeAnswer(state, "es", { monotonicMs: 5500, wallTimeMs: 5500 }), state);
    const feedback = answerCorrectly(state);
    assert.equal(feedback.phase, "FEEDBACK");
    assert.equal(feedback.correct, true);
    assert.equal(submit(feedback, "en"), feedback);
    assert.equal(updatePracticeAnswer(feedback, "changed"), feedback);
    assert.ok(feedback.recentIdentities.length <= PRACTICE_RECENT_LIMIT);
    assert.equal(Object.hasOwn(feedback, "history"), false);
    state = nextPracticeQuestion(feedback, generate);
  }
  assert.equal(state.phase, "COMPLETE");
  assert.deepEqual(state.config, config);
  assert.equal(state.attempts.length, count);
  assert.equal(nextPracticeQuestion(state, generate), state);
});

test("incorrect feedback evaluates against the current locale without a correction loop", () => {
  const state = startPractice(configFor(5, ["ester"]), generate);
  const feedback = submit(updatePracticeAnswer(state, "unrelated-name"), "es");
  assert.equal(feedback.phase, "FEEDBACK");
  assert.equal(feedback.correct, false);
  assert.equal(feedback.submittedLocale, "es");
  assert.equal(updatePracticeAnswer(feedback, feedback.question.reference.name), feedback);
  assert.equal(nextPracticeQuestion(feedback, generate).index, 1);
});

test("Endless advances repeatedly, keeps bounded identity memory and ends only explicitly", () => {
  let state = startPractice(configFor("endless", ["alcohol", "ester"]), generate);
  for (let index = 0; index < 24; index += 1) {
    assert.equal(state.phase, "QUESTION");
    assert.equal(state.index, index);
    assert.ok(state.recentIdentities.length <= PRACTICE_RECENT_LIMIT);
    state = nextPracticeQuestion(answerCorrectly(state), generate);
  }
  assert.equal(state.phase, "QUESTION");
  assert.equal(endPractice(state).phase, "COMPLETE");
  assert.deepEqual(endPractice({ phase: "CONFIG" }), { phase: "CONFIG" });
});

test("same config and public seed reconstruct the complete multi-category sequence", () => {
  const config = configFor(10, ["halogenated", "alkane", "ez", "nitro"]);
  const run = () => {
    let state = startPractice(JSON.parse(JSON.stringify(config)), generate);
    const sequence = [];
    while (state.phase === "QUESTION") {
      assert.ok(config.categories.includes(state.question.category));
      sequence.push({ index: state.index, generationIndex: state.generationIndex, question: state.question });
      state = nextPracticeQuestion(answerCorrectly(state), generate);
    }
    assert.equal(state.phase, "COMPLETE");
    return sequence;
  };
  assert.deepEqual(run(), run());
});

test("live locale changes preserve graph, seed, index, draft and submitted outcome without generation", () => {
  let calls = 0;
  const counted = (config, index) => { calls += 1; return generate(config, index); };
  const state = updatePracticeAnswer(startPractice(configFor(5, ["ester"]), counted), "draft");
  const en = localizePracticeState(state, "en");
  assert.equal(calls, 1);
  assert.equal(en.index, state.index);
  assert.equal(en.generationIndex, state.generationIndex);
  assert.equal(en.config.seed, state.config.seed);
  assert.equal(en.config.locale, "en");
  assert.equal(en.question.molecule, state.question.molecule);
  assert.deepEqual(en.question.question, state.question.question);
  assert.deepEqual(en.question.generation, state.question.generation);
  assert.equal(en.question.reference.name, state.question.reference.names.en);
  assert.equal(en.answer, "draft");
  const feedback = answerCorrectly(en, "en");
  const es = localizePracticeState(feedback, "es");
  assert.equal(calls, 1);
  assert.equal(es.correct, true);
  assert.equal(es.submittedLocale, "en");
  assert.equal(es.question.molecule, feedback.question.molecule);
  assert.equal(es.question.reference.name, state.question.reference.names.es);
});

test("ES/EN session sequences preserve chemistry and deduplication for all categories", () => {
  const config = configFor(5, [...EXERCISE_CATEGORIES]);
  let es = startPractice(config, generate), en = startPractice({ ...config, locale: "en" }, generate);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(es.generationIndex, en.generationIndex);
    assert.deepEqual(es.question.molecule, en.question.molecule);
    assert.equal(es.question.reference.structuralIdentity, en.question.reference.structuralIdentity);
    assert.equal(es.question.reference.name, es.question.reference.names.es);
    assert.equal(en.question.reference.name, en.question.reference.names.en);
    es = nextPracticeQuestion(answerCorrectly(es), generate);
    en = nextPracticeQuestion(answerCorrectly(en, "en"), generate);
  }
  assert.equal(es.phase, "COMPLETE");
  assert.equal(en.phase, "COMPLETE");
});

test("duplicate search is deterministic, bounded and falls back when the domain repeats", () => {
  const config = configFor("endless");
  const repeated = generate(config, 0);
  const indices = [];
  const repeatingGenerator = (_config, index) => { indices.push(index); return repeated; };
  const first = startPractice(config, repeatingGenerator);
  const next = nextPracticeQuestion(answerCorrectly(first), repeatingGenerator);
  assert.deepEqual(indices, [0, 1, 2, 3, 4]);
  assert.equal(next.generationIndex, PRACTICE_DUPLICATE_LIMIT);
  assert.equal(next.index, 1);
  assert.equal(next.phase, "QUESTION");
  assert.deepEqual(next.recentIdentities, [repeated.reference.structuralIdentity]);
});

test("generator failure hides exception data, retries the same context and permits reset/end", () => {
  const config = configFor();
  let requested;
  const broken = (_config, index) => { requested = index; throw new ChemicalGenerationError("attempts-exhausted", "SECRET STACK"); };
  const failure = startPractice(config, broken);
  assert.equal(failure.phase, "ERROR");
  assert.equal(requested, 0);
  assert.doesNotMatch(JSON.stringify(failure), /SECRET|STACK/);
  assert.equal(Object.hasOwn(failure, "question"), false);
  assert.equal(Object.hasOwn(failure, "answer"), false);
  const recovered = retryPracticeGeneration(failure, generate);
  assert.equal(recovered.phase, "QUESTION");
  assert.deepEqual(recovered.question, generate(config, 0));
  assert.equal(retryPracticeGeneration(recovered, broken), recovered);
  assert.equal(endPractice(failure).phase, "COMPLETE");
  assert.equal(nextPracticeQuestion(failure, generate), failure);
});

test("Practice does not activate Exam, future question types or misleading difficulty", () => {
  for (const change of [{ mode: "exam" }, { questionTypes: ["build"] }, { questionTypes: ["naming", "multiple-choice"] }, { difficulty: "advanced" }]) {
    assert.throws(() => startPractice({ ...configFor(), ...change }, generate));
  }
});
