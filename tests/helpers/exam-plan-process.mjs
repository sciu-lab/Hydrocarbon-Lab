import { loadExerciseChemistry } from "./exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../../app/practice-distractor-engine.ts";
import { createExamConfig, createExamQuestionPlan } from "../../app/exam-session.ts";
const chemistry = await loadExerciseChemistry();
try {
  const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  const plan = createExamQuestionPlan(createExamConfig(["alkane", "alcohol", "ether"], 10,
    process.argv[2] ?? "es", "EXAM-PROCESS", ["naming", "multiple-choice", "build"]), generate);
  console.log("EXAM_PLAN=" + JSON.stringify(plan));
} finally { await chemistry.close(); }
