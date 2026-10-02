import { loadExerciseChemistry } from "./exercise-chemistry.mjs";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig } from "../../app/class-assignment.ts";
import { createRestrictedChemicalGenerator } from "../../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../../app/practice-distractor-engine.ts";
import { createExamQuestionPlan } from "../../app/exam-session.ts";
import { EXERCISE_CATEGORIES } from "../../app/exercise-model.ts";

const chemistry = await loadExerciseChemistry();
try {
  const generator = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  const manifest = generateClassAssignments(createClassAssignmentConfig({ mode: "exam", questionCount: 15,
    categories: EXERCISE_CATEGORIES, questionTypes: ["naming", "multiple-choice", "build"] }, "CHEM-4B-2026"), ["001"]);
  const config = participantSessionConfig(manifest.config, manifest.participants[0], process.argv[2] ?? "es");
  const plan = createExamQuestionPlan(config, generator);
  console.log("CLASS_PLAN=" + JSON.stringify({ assignment: manifest.participants[0], plan }));
} finally { await chemistry.close(); }
