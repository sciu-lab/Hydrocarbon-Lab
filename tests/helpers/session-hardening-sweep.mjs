import { EXERCISE_CATEGORIES } from "../../app/exercise-model.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  updatePracticeStructure, submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion } from "../../app/practice-session.ts";
import { createExamConfig, startExam } from "../../app/exam-session.ts";
import { getExerciseUniquenessKey } from "../../app/session-question-selection.ts";
import { createStructuralAnswerEvaluator } from "../../app/practice-structural-answer.ts";

export const HARDENING_TYPES = [["naming"], ["multiple-choice"], ["build"], ["naming", "multiple-choice", "build"]];
export function runFiniteSession(mode, count, types, seed, generate, oracles, categories = EXERCISE_CATEGORIES) {
  let calls = 0;
  const counted = (...args) => { calls++; return generate(...args); };
  const config = mode === "exam" ? createExamConfig(categories, count, "en", seed, types)
    : createPracticeConfig(categories, count, "en", seed, types);
  const accepted = [];
  let state = mode === "exam" ? startExam(config, counted) : startPractice(config, counted);
  const evaluate = createStructuralAnswerEvaluator(oracles);
  if (mode === "exam" && "plan" in state) {
    accepted.push(...state.plan.slots.map((slot) => ({ generationIndex: slot.generationIndex, question: slot.question })));
  }
  while (mode === "practice" && state.phase === "QUESTION") {
    accepted.push({ generationIndex: state.generationIndex, question: state.question });
    state = markPracticeQuestionAvailable(state, { monotonicMs: accepted.length * 1000, wallTimeMs: 1700000000000 });
    if (state.question.type === "build") {
      state = submitPracticeStructure(updatePracticeStructure(state, state.question.molecule), "en",
        { monotonicMs: accepted.length * 1000 + 100, wallTimeMs: 1700000000100 }, evaluate);
    } else {
      const answer = state.question.type === "multiple-choice" ? state.question.correctOptionId : state.question.reference.names.en;
      state = submitPracticeAnswer(updatePracticeAnswer(state, answer), "en",
        { monotonicMs: accepted.length * 1000 + 100, wallTimeMs: 1700000000100 });
    }
    if (state.phase !== "FEEDBACK") throw new Error("Sweep submission did not commit.");
    state = nextPracticeQuestion(state, counted);
  }
  const keys = accepted.map(({ question }) => getExerciseUniquenessKey(question));
  const retries = accepted.map((slot, i) => slot.generationIndex - (i ? accepted[i - 1].generationIndex + 1 : 0));
  return { mode, count, types, seed, accepted, config, state, calls, keys, retries,
    duplicates: keys.length - new Set(keys).size,
    exhausted: state.phase === "ERROR" || state.phase === "EXAM_ERROR" };
}
