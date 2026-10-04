import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { HARDENING_TYPES, runFiniteSession } from "./helpers/session-hardening-sweep.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { EXERCISE_CATEGORIES, parseFiniteQuestionCount } from "../app/exercise-model.ts";
import { getExerciseUniquenessKey, selectSessionQuestion, PRACTICE_RECENT_LIMIT } from "../app/session-question-selection.ts";
import { createPracticeConfig, startPractice, nextPracticeQuestion, markPracticeQuestionAvailable,
  updatePracticeAnswer, submitPracticeAnswer, endPractice, startPracticeCorrections } from "../app/practice-session.ts";
import { createExamConfig, startExam, createExamQuestionPlan } from "../app/exam-session.ts";

let chemistry, generate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
});
after(async () => chemistry?.close());
function answer(state, text = state.question.reference.names.en) {
  return submitPracticeAnswer(updatePracticeAnswer(markPracticeQuestionAvailable(state,
    { monotonicMs: 100, wallTimeMs: 1700000000000 }), text), "en", { monotonicMs: 200, wallTimeMs: 1700000000100 });
}

test("literal identity depends only on type and target identity, never MCQ options, IDs, locale or ordering", () => {
  const q = generate(createPracticeConfig(["alkane"], 5, "en", "KEY", ["naming"], "basic", 1), 0);
  const changed = { ...q, question: { ...q.question, id: "other", seed: "other" },
    molecule: { ...q.molecule, atoms: [...q.molecule.atoms].reverse() }, reference: { ...q.reference, name: "localized" } };
  assert.equal(getExerciseUniquenessKey(q), getExerciseUniquenessKey(changed));
  assert.notEqual(getExerciseUniquenessKey(q), getExerciseUniquenessKey({ ...q, type: "build" }));
  assert.equal(getExerciseUniquenessKey({ ...q, type: "multiple-choice", options: [1, 2] }),
    getExerciseUniquenessKey({ ...changed, type: "multiple-choice", options: [2, 1] }));
});

test("whole-session history rejects a literal repeat after more than eight questions; no last-candidate fallback", () => {
  const config = createPracticeConfig(["alkane"], 15, "en", "FROZEN-REPEAT", ["naming"], "basic", 1);
  const q = generate(config, 0), calls = [];
  const duplicateKey = getExerciseUniquenessKey(q);
  const usedExerciseKeys = [duplicateKey, ...Array.from({ length: 9 }, (_, i) => JSON.stringify(["naming", `identity-${i}`]))];
  const selected = selectSessionQuestion({ config, index: 10, generationIndex: 10, recentIdentities: [], usedExerciseKeys },
    (_config, index) => { calls.push(index); return { ...q, reference: { ...q.reference, structuralIdentity: "identity-0" } }; });
  assert.deepEqual(calls, [10, 11, 12, 13]); assert.equal(selected.ok, false);
  assert.equal(selected.reason, "insufficient-unique-questions");
});

test("frozen duplicate fixture accepts real index 4, reconstructs it exactly, and corrections are exempt", () => {
  const config = createPracticeConfig(["alkane", "alcohol", "ester"], 5, "en", "PRACTICE-PHASE3", ["naming"], "basic", 1);
  const q0 = generate(config, 0), q4 = generate(config, 4);
  assert.notEqual(q0.reference.structuralIdentity, q4.reference.structuralIdentity);
  const calls = [];
  const fixture = (c, i, context) => { calls.push(i); return i > 0 && i < 4 ? q0 : generate(c, i, context); };
  const first = startPractice(config, fixture);
  let second = nextPracticeQuestion(answer(first), fixture);
  assert.deepEqual(calls, [0, 1, 2, 3, 4]); assert.equal(second.index, 1); assert.equal(second.generationIndex, 4);
  assert.deepEqual(second.question, q4);
  second = answer(second, "wrong");
  const correction = startPracticeCorrections(endPractice(second), fixture);
  assert.equal(correction.phase, "CORRECTION_QUESTION"); assert.equal(correction.generationIndex, 4);
  assert.deepEqual(correction.question, q4); assert.equal(correction.attempts.length, 2);
});

test("same molecule is allowed across Naming and Build; finite exhaustion never begins a partial Exam", () => {
  const config = createExamConfig(["alkane"], 3, "en", "TYPES", ["naming", "build"], "basic", 1);
  const base = generate(config, 0, { questionType: "naming", displayIndex: 0 });
  const fixture = (_c, _i, context) => ({ ...base, type: context.questionType });
  const two = createExamQuestionPlan({ ...config, questionCount: 2 }, fixture);
  assert.equal(two.slots.length, 2); assert.equal(new Set(two.slots.map((s) => getExerciseUniquenessKey(s.question))).size, 2);
  const failed = startExam(config, fixture); assert.equal(failed.phase, "EXAM_ERROR");
  assert.equal(failed.reason, "insufficient-unique-questions"); assert.deepEqual(failed.attempts, []); assert.ok(!("plan" in failed));
});

test("Endless excludes the previous eight literal exercises with bounded memory, allowing later reuse", () => {
  const config = createPracticeConfig(["alkane"], "endless", "en", "ENDLESS-WINDOW", ["naming"], "basic", 1);
  const cycle = [], identities = new Set();
  for (let i = 0; i < 32 && cycle.length < PRACTICE_RECENT_LIMIT + 1; i += 1) {
    const question = generate(config, i);
    const identity = getExerciseUniquenessKey(question);
    if (!identities.has(identity)) { identities.add(identity); cycle.push(question); }
  }
  assert.equal(cycle.length, PRACTICE_RECENT_LIMIT + 1);
  const fixture = (_c, i) => ({ ...cycle[i % cycle.length], question: { ...cycle[i % cycle.length].question, id: `endless-${i}` } });
  let state = startPractice(config, fixture); const keys = [];
  for (let i = 0; i < 30; i++) {
    assert.equal(state.phase, "QUESTION"); const key = getExerciseUniquenessKey(state.question);
    assert.ok(!keys.slice(-PRACTICE_RECENT_LIMIT).includes(key)); keys.push(key);
    assert.ok(state.usedExerciseKeys.length <= 8); state = nextPracticeQuestion(answer(state), fixture);
  }
  assert.ok(new Set(keys).size < keys.length);
});

test("numeric input and both session boundaries share the positive safe integer contract", () => {
  for (const n of [1, 5, 7, 15, 23, 30, 37, Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseFiniteQuestionCount(String(n)), n);
    assert.equal(createPracticeConfig(["alkane"], n, "en", "COUNT", ["naming"], "basic", 1).questionCount, n);
    assert.equal(createExamConfig(["alkane"], n, "en", "COUNT", ["naming"], "basic", 1).questionCount, n);
  }
  for (const text of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "invalid", "9007199254740992"]) assert.equal(parseFiniteQuestionCount(text), null);
});

for (const mode of ["practice", "exam"]) for (const count of [5, 15, 30]) for (const types of HARDENING_TYPES) {
  test(`${mode} ${count} ${types.join("+")}: two fixed seeds, no literal duplicates and exact accepted reconstruction`, () => {
    for (const seed of ["HARDENING-1", "HARDENING-2"]) {
      const run = runFiniteSession(mode, count, types, seed, generate, chemistry.oracles);
      assert.equal(run.duplicates, 0);
      if (run.exhausted) { assert.equal(run.state.reason, "insufficient-unique-questions"); continue; }
      assert.equal(run.accepted.length, count);
      if (mode === "practice") { assert.equal(run.state.phase, "COMPLETE"); assert.equal(run.state.attempts.length, count); }
      for (const [displayIndex, slot] of run.accepted.entries()) {
        const reconstructed = generate(run.config, slot.generationIndex, { questionType: slot.question.type ?? "naming", displayIndex });
        if (mode === "exam") reconstructed.reference.name = reconstructed.reference.names.es;
        assert.deepEqual(slot.question, reconstructed);
      }
      if (count === 15 && types.length === 3) for (const type of types) assert.equal(run.accepted.filter((s) => (s.question.type ?? "naming") === type).length, 5);
    }
  });
}

test("37-question plans are accepted beyond the old cap when unique candidates are available", () => {
  for (const mode of ["practice", "exam"]) {
    const run = runFiniteSession(mode, 37, ["naming", "multiple-choice", "build"], "HARDENING-37", generate, chemistry.oracles);
    assert.equal(run.duplicates, 0); assert.equal(run.exhausted, false); assert.equal(run.accepted.length, 37);
  }
});

test("15-question frozen plan is deterministic in a fresh Node process and across locales", () => {
  const config = createExamConfig(EXERCISE_CATEGORIES, 15, "es", "HARDENING-PROCESS", ["naming", "multiple-choice", "build"], "basic", 1);
  const plan = createExamQuestionPlan(config, generate);
  assert.deepEqual(plan, createExamQuestionPlan({ ...config, locale: "en" }, generate));
  const child = spawnSync(process.execPath, ["tests/helpers/exam-plan-process.mjs", "en", "hardening"], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.split("EXAM_PLAN=")[1].trim()), JSON.parse(JSON.stringify(plan)));
});
