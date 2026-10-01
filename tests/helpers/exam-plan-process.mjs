import { loadExerciseChemistry } from "./exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../../app/practice-distractor-engine.ts";
import { createExamConfig, createExamQuestionPlan } from "../../app/exam-session.ts";
import { EXERCISE_CATEGORIES } from "../../app/exercise-model.ts";
const chemistry = await loadExerciseChemistry();
try {
  const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  const hardening = process.argv[3] === "hardening";
  const plan = createExamQuestionPlan(createExamConfig(hardening ? EXERCISE_CATEGORIES : ["alkane", "alcohol", "ether"], hardening ? 15 : 10,
    process.argv[2] ?? "es", hardening ? "HARDENING-PROCESS" : "EXAM-PROCESS", ["naming", "multiple-choice", "build"]), generate);
  console.log("EXAM_PLAN=" + JSON.stringify(plan));
} finally { await chemistry.close(); }
