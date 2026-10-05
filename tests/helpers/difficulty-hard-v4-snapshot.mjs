import { createHash } from "node:crypto";
import { loadExerciseChemistry } from "./exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES } from "../../app/exercise-model.ts";
import { createRestrictedChemicalGenerator } from "../../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator } from "../../app/practice-structural-answer.ts";
import { createExamConfig, createExamQuestionPlan } from "../../app/exam-session.ts";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Real three-type Exam plans, all seventeen anchors. Only locale presentation
 * is projected to ES; the entire graph/options/metadata payload is hashed. */
export async function captureHardV4Snapshot(locale = "es") {
  const chemistry = await loadExerciseChemistry(), random = Math.random, now = Date.now;
  try {
    const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
      createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
    const evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
    Math.random = Date.now = () => { throw Error("Unseeded entropy during v4 capture."); };
    const runs = EXERCISE_CATEGORIES.map(category => {
      const config = createExamConfig([category], 3, locale, `D5-V4-FIXTURE:${category}`,
        ["naming", "multiple-choice", "build"], "advanced", 4);
      const questions = createExamQuestionPlan(config, generate).slots.map(slot => {
        const q = slot.question;
        return { type: slot.questionType, displayOrdinal: slot.displayOrdinal, generationIndex: slot.generationIndex,
          structuralIdentity: q.reference.structuralIdentity, names: q.reference.names, formula: q.reference.formula,
          family: q.generation.family, payloadSha256: hash(q),
          ...(q.type === "multiple-choice" ? { optionIdsSha256: hash(q.options.map(o => o.id)), optionSetSha256: hash(q.options) } : {}),
          ...(q.type === "build" ? { buildTargetIdentity: evaluate({ referenceMolecule: q.molecule,
            submittedMolecule: q.molecule, category, config }).referenceIdentity } : {}) };
      });
      return { config: { ...config, locale: "es" }, questions };
    });
    return { generatorVersion: 4, difficulty: "advanced", runs };
  } finally { Math.random = random; Date.now = now; await chemistry.close(); }
}
