import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { runFiniteSession } from "./helpers/session-hardening-sweep.mjs";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";
import { createClassAssignmentConfig, generateClassAssignments, automaticParticipantIds, participantSessionConfig } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow } from "../app/class-assignment-csv.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createExamQuestionPlan, startExam } from "../app/exam-session.ts";
import { startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, submitPracticeAnswer, createPracticeConfig } from "../app/practice-session.ts";
import { getExerciseUniquenessKey } from "../app/session-question-selection.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";

let chemistry, generate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
});
after(async () => chemistry?.close());
const selection = { mode: "exam", questionCount: 15, categories: EXERCISE_CATEGORIES,
  questionTypes: ["naming", "multiple-choice", "build"] };
const manifest = (classSeed = "CHEM-4B-2026", ids = ["001", "002", "003"], change = {}) =>
  generateClassAssignments(createClassAssignmentConfig({ ...selection, ...change }, classSeed), ids);
const snapshot = (question) => ({ questionId: question.question.id, questionSeed: question.question.seed,
  type: question.type ?? "naming", structuralIdentity: question.reference.structuralIdentity,
  formula: question.reference.formula, smiles: question.reference.smiles, molecule: question.molecule,
  options: question.type === "multiple-choice" ? question.options.map((option) => ({ id: option.id, name: option.name })) : null });

test("CHEM-4B-2026: three distinct seeds reproduce 15-question existing Exam plans from parsed CSV", () => {
  const assignment = manifest();
  assert.equal(new Set(assignment.participants.map((row) => row.sessionSeed)).size, 3);
  const rows = parseClassCsv(serializeClassAssignmentCsv(assignment, "es")).rows;
  for (const [index, row] of rows.entries()) {
    const config = participantSessionConfig(assignment.config, assignment.participants[index], "es");
    const reconstructed = reconstructClassSessionFromCsvRow(row);
    assert.deepEqual(reconstructed, config);
    const state = startExam(config, generate);
    assert.equal(state.phase, "EXAM_QUESTION");
    assert.deepEqual(state.attempts, []);
    assert.equal(state.plan.slots.length, 15);
    assert.equal(new Set(state.plan.slots.map((slot) => getExerciseUniquenessKey(slot.question))).size, 15);
    assert.deepEqual(createExamQuestionPlan(reconstructed, generate), state.plan);
    for (const slot of state.plan.slots) {
      const question = generate(reconstructed, slot.generationIndex,
        { questionType: slot.questionType, displayIndex: slot.displayOrdinal - 1 });
      assert.deepEqual(snapshot(question), snapshot(slot.question));
      if (slot.questionType === "multiple-choice") assert.equal(validateMultipleChoiceQuestion(slot.question), true);
    }
    if (index === 0) console.log("CLASS_RECONSTRUCTION=" + JSON.stringify({ participantId: row.participant_id,
      questionCount: state.plan.slots.length, accepted: state.plan.slots.map((slot) => ({ displayOrdinal: slot.displayOrdinal,
        generationIndex: slot.generationIndex, structuralIdentity: slot.question.reference.structuralIdentity, type: slot.questionType })) }));
  }
});
test("same assignment ES/EN preserves complete plan, MCQ identity/order and Build targets", () => {
  const assignment = manifest("LOCALE-CLASS", ["017"]);
  const es = participantSessionConfig(assignment.config, assignment.participants[0], "es");
  const en = participantSessionConfig(assignment.config, assignment.participants[0], "en");
  assert.equal(es.seed, en.seed);
  assert.deepEqual(createExamQuestionPlan(es, generate), createExamQuestionPlan(en, generate));
});
test("class-derived Naming reaches the shared evaluator, correct Attempt Log and metrics; normal Endless remains available", () => {
  for (const locale of ["es", "en"]) {
    const assignment = manifest("NAMING-CLASS", ["001"], { mode: "practice", questionCount: 5, questionTypes: ["naming"] });
    const config = participantSessionConfig(assignment.config, assignment.participants[0], locale);
    let state = startPractice(config, generate);
    assert.equal(state.phase, "QUESTION");
    const question = state.question;
    state = markPracticeQuestionAvailable(state, { monotonicMs: 100, wallTimeMs: 1700000000100 });
    state = submitPracticeAnswer(updatePracticeAnswer(state, question.reference.name), locale,
      { monotonicMs: 200, wallTimeMs: 1700000000200 });
    assert.equal(state.phase, "FEEDBACK"); assert.equal(state.correct, true);
    assert.equal(state.attempts[0].correct, true);
    assert.equal(state.attempts[0].generationIndex, state.generationIndex);
    assert.equal(state.attempts[0].structuralIdentity, question.reference.structuralIdentity);
    assert.equal(calculatePracticeMetrics(state.attempts).questionsToReview, 0);
  }
  assert.equal(startPractice(createPracticeConfig(["alkane"], "endless", "es", "INDIVIDUAL-ENDLESS"), generate).phase, "QUESTION");
});
test("separate fresh Node processes reproduce identical class seed and complete finite session in ES/EN", () => {
  const children = ["es", "en"].map((locale) => spawnSync(process.execPath, ["tests/helpers/class-session-process.mjs", locale],
    { encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024 }));
  for (const child of children) assert.equal(child.status, 0, child.stderr);
  const outputs = children.map((child) => JSON.parse(child.stdout.split("CLASS_PLAN=")[1].trim()));
  assert.deepEqual(outputs[0], outputs[1]);
  const assignment = manifest("CHEM-4B-2026", ["001"]);
  const config = participantSessionConfig(assignment.config, assignment.participants[0], "es");
  assert.deepEqual(outputs[0], JSON.parse(JSON.stringify({ assignment: assignment.participants[0], plan: createExamQuestionPlan(config, generate) })));
});

for (const [mode, types, questionCount] of [["practice", ["naming"], 5], ["practice", ["naming", "multiple-choice", "build"], 7],
  ["exam", ["naming"], 5], ["exam", ["naming", "multiple-choice", "build"], 7]]) {
  test(`bounded class sweep: ${mode} ${types.join("+")} across 3 classes x 12 participants`, () => {
    const metrics = { mode, config: types.join("+"), classes: 3, participants: 12, assignments: 0,
      seedCollisions: 0, reconstructionMismatches: 0, withinSessionDuplicates: 0, failures: 0 };
    const seeds = new Set();
    for (const classSeed of ["CLASS-SWEEP-A", "CLASS-SWEEP-B", "CLASS-SWEEP-C"]) {
      const assignment = manifest(classSeed, automaticParticipantIds(12), { mode, questionCount, questionTypes: types });
      for (const participant of assignment.participants) {
        metrics.assignments++;
        if (seeds.has(participant.sessionSeed)) metrics.seedCollisions++;
        seeds.add(participant.sessionSeed);
        const config = participantSessionConfig(assignment.config, participant, "en");
        const run = runFiniteSession(mode, questionCount, types, config.seed, generate, chemistry.oracles, config.categories);
        metrics.withinSessionDuplicates += run.duplicates;
        if (run.exhausted || run.accepted.length !== questionCount) { metrics.failures++; continue; }
        if (mode === "practice") {
          assert.equal(run.state.phase, "COMPLETE");
          assert.equal(run.state.attempts.length, questionCount);
          assert.ok(run.state.attempts.every((attempt) => attempt.correct));
        } else assert.deepEqual(run.state.attempts, []);
        for (const [displayIndex, slot] of run.accepted.entries()) {
          const rebuilt = generate(config, slot.generationIndex, { questionType: slot.question.type ?? "naming", displayIndex });
          if (JSON.stringify(snapshot(rebuilt)) !== JSON.stringify(snapshot(slot.question))) metrics.reconstructionMismatches++;
        }
      }
    }
    console.log("CLASS_SESSION_SWEEP=" + JSON.stringify(metrics));
    assert.equal(metrics.assignments, 36);
    for (const key of ["seedCollisions", "reconstructionMismatches", "withinSessionDuplicates", "failures"]) assert.equal(metrics[key], 0, JSON.stringify(metrics));
  });
}
