import { createHash } from "node:crypto";
import { loadExerciseChemistry } from "./exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator } from "../../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  updatePracticeStructure, submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion } from "../../app/practice-session.ts";
import { createExamConfig, createExamQuestionPlan } from "../../app/exam-session.ts";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const time = (ms) => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
const questionSnapshot = (question, generationIndex) => ({
  type: question.type ?? "naming", generationIndex,
  structuralIdentity: question.reference.structuralIdentity,
  // Freeze the complete target, identities, generation metadata and bilingual
  // options/provenance/order. Only the display-name projection depends on locale.
  payloadSha256: digest({ ...question, reference: { ...question.reference, name: question.reference.names.es } }),
  ...(question.type === "multiple-choice" ? { optionIdsSha256: digest(question.options.map((option) => option.id)) } : {}),
});

/** Historical captures default explicitly to v1; v2 has its own new fixture. */
export async function captureDifficultySessions(difficulty = "basic", locale = "es", generatorVersion = 1) {
  const chemistry = await loadExerciseChemistry();
  const random = Math.random, now = Date.now;
  try {
    const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
      createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
    const evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
    Math.random = Date.now = () => { throw new Error("Generation used time or unseeded entropy."); };
    const practiceRuns = [];
    for (const types of [["naming"], ["naming", "multiple-choice", "build"]]) {
      const config = { ...createPracticeConfig(["alkane", "alcohol", "ester"], types.length === 1 ? 10 : 6,
        locale, "PRACTICE-PHASE3", types, difficulty, generatorVersion), difficulty };
      let state = startPractice(config, generate);
      const questions = [];
      while (state.phase === "QUESTION") {
        const q = state.question;
        questions.push(questionSnapshot(q, state.generationIndex));
        state = markPracticeQuestionAvailable(state, time(state.index * 1000));
        state = q.type === "build" ? submitPracticeStructure(updatePracticeStructure(state, q.molecule), locale,
          time(state.index * 1000 + 100), evaluate)
          : submitPracticeAnswer(updatePracticeAnswer(state, q.type === "multiple-choice" ? q.correctOptionId : q.reference.names[locale]),
            locale, time(state.index * 1000 + 100));
        if (state.phase !== "FEEDBACK" || !state.correct) throw new Error("Snapshot submission failed.");
        state = nextPracticeQuestion(state, generate);
      }
      if (state.phase !== "COMPLETE") throw new Error("Snapshot Practice failed.");
      practiceRuns.push(questions);
    }
    const examConfig = { ...createExamConfig(["alkane", "alcohol", "ether"], 10, locale, "EXAM-PROCESS",
      ["naming", "multiple-choice", "build"], difficulty, generatorVersion), difficulty };
    const exam = createExamQuestionPlan(examConfig, generate).slots.map((slot) =>
      questionSnapshot(slot.question, slot.generationIndex));
    return { practiceNaming: practiceRuns[0], practiceMixed: practiceRuns[1], examMixed: exam };
  } finally {
    Math.random = random; Date.now = now;
    await chemistry.close();
  }
}
