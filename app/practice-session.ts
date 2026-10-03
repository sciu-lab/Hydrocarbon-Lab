import { GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty, SessionConfig } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import { isBuildQuestion } from "./practice-question.ts";
import type { StructuralAnswerEvaluator } from "./practice-structural-answer.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { PracticeQuestion, PracticeQuestionGenerator, PracticeQuestionType } from "./practice-question.ts";
import { getExerciseUniquenessKey, PRACTICE_RECENT_LIMIT, selectSessionQuestion } from "./session-question-selection.ts";
import type { SessionSelectionFailure } from "./session-question-selection.ts";
import { evaluateSessionAnswer } from "./session-answer-evaluation.ts";
import { appendPracticeAttempt, createInitialAttempt } from "./practice-attempt.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { validatePracticeTime } from "./practice-timing.ts";
import type { PracticeTime } from "./practice-timing.ts";
import { createCorrectionAttempt, createCorrectionQueue, reconstructPracticeCorrection } from "./practice-corrections.ts";

export const PRACTICE_LENGTHS = [5, 10, 20, 30, "endless"] as const;
export { PRACTICE_RECENT_LIMIT, PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT } from "./session-question-selection.ts";
export type PracticeGenerator = PracticeQuestionGenerator;

type Context = {
  config: SessionConfig;
  /** Display ordinal; generationIndex is the actual Phase 2 seed context. */
  index: number;
  generationIndex: number;
  recentIdentities: readonly string[];
  usedExerciseKeys?: readonly string[];
  attempts: readonly AttemptRecord[];
};
type BuildWorkingState = { studentMolecule?: GeneratedMolecule; buildError?: "INVALID_SUBMISSION" | "UNSUPPORTED_COMPARISON" };
type CurrentQuestion = Context & BuildWorkingState & { question: PracticeQuestion; answer: string; timing: PracticeTime | null };
type CorrectionContext = {
  config: SessionConfig; attempts: readonly AttemptRecord[];
  queue: readonly AttemptRecord[]; correctionIndex: number;
};
type CorrectionQuestion = CorrectionContext & BuildWorkingState & {
  original: AttemptRecord; index: number; generationIndex: number;
  question: PracticeQuestion; answer: string; timing: PracticeTime | null;
};
export type PracticeState =
  | { phase: "CONFIG" }
  | (CurrentQuestion & { phase: "QUESTION" })
  | (CurrentQuestion & { phase: "FEEDBACK"; correct: boolean; submittedLocale: AppLanguage })
  | (Context & { phase: "ERROR"; reason?: SessionSelectionFailure })
  | { phase: "COMPLETE"; config: SessionConfig; attempts: readonly AttemptRecord[] }
  | { phase: "CORRECTION_SUMMARY"; config: SessionConfig; attempts: readonly AttemptRecord[] }
  | (CorrectionQuestion & { phase: "CORRECTION_QUESTION" })
  | (CorrectionQuestion & { phase: "CORRECTION_FEEDBACK"; correct: boolean; submittedLocale: AppLanguage })
  | (CorrectionContext & { phase: "CORRECTION_ERROR" });

export function isPracticeAnswerState(state: PracticeState): state is Extract<PracticeState,
  { phase: "QUESTION" | "CORRECTION_QUESTION" }> {
  return state.phase === "QUESTION" || state.phase === "CORRECTION_QUESTION";
}

export function hasPracticeQuestion(state: PracticeState): state is Extract<PracticeState,
  { phase: "QUESTION" | "FEEDBACK" | "CORRECTION_QUESTION" | "CORRECTION_FEEDBACK" }> {
  return isPracticeAnswerState(state) || state.phase === "FEEDBACK" || state.phase === "CORRECTION_FEEDBACK";
}

/** The optional seed is resolved only at the session boundary, never per question. */
export function resolvePracticeSeed(seed: string, createPublicSeed: () => string): string {
  const resolved = seed === "" ? createPublicSeed() : seed;
  if (typeof resolved !== "string" || resolved.length === 0) throw new TypeError("Invalid public seed.");
  return resolved;
}

export function createPracticeConfig(
  categories: readonly ExerciseCategory[], questionCount: number | "endless", locale: AppLanguage, seed: string,
  questionTypes: readonly PracticeQuestionType[] = ["naming"],
  difficulty: ExerciseDifficulty = "basic",
): SessionConfig {
  return normalizeSessionConfig({
    mode: "practice", questionTypes, categories, difficulty,
    locale, seed, generatorVersion: GENERATOR_VERSION, questionCount,
  });
}

function loadQuestion(context: Context, generate: PracticeGenerator): PracticeState {
  // Older in-memory callers can reconstruct history from initial attempts.
  let usedExerciseKeys = context.usedExerciseKeys;
  if (!usedExerciseKeys) {
    const keys = context.attempts.filter((attempt) => attempt.attemptNumber === 1)
      .map((attempt) => getExerciseUniquenessKey({ type: attempt.questionType,
        reference: { structuralIdentity: attempt.structuralIdentity } }));
    usedExerciseKeys = context.config.questionCount === "endless" ? keys.slice(-PRACTICE_RECENT_LIMIT) : keys;
  }
  const selection = selectSessionQuestion({ ...context, usedExerciseKeys }, generate);
  if (!selection.ok) return { ...context, phase: "ERROR", generationIndex: selection.generationIndex,
    ...(selection.reason ? { reason: selection.reason } : {}) };
  return { ...context, phase: "QUESTION", generationIndex: selection.generationIndex,
    recentIdentities: selection.recentIdentities, usedExerciseKeys: selection.usedExerciseKeys,
    question: selection.question, answer: "", timing: null };
}

export function startPractice(config: SessionConfig, generate: PracticeGenerator): PracticeState {
  const canonical = normalizeSessionConfig(config);
  if (canonical.mode !== "practice") {
    throw new TypeError("Unsupported Practice configuration.");
  }
  return loadQuestion({ config: canonical, index: 0, generationIndex: 0, recentIdentities: [], attempts: [] }, generate);
}

/** Called at the UI commit that makes the answer input available. Idempotent
 * across theme/locale renders and Strict Mode. A stale presentation cannot
 * start a timer for another displayed question.
 */
export function markPracticeQuestionAvailable(state: PracticeState, time: PracticeTime,
  expected?: { questionId: string; index: number }): PracticeState {
  if (!isPracticeAnswerState(state) || state.timing !== null
    || (expected && (expected.questionId !== state.question.question.id || expected.index !== state.index))) return state;
  return { ...state, timing: validatePracticeTime(time) };
}

export function updatePracticeAnswer(state: PracticeState, answer: string): PracticeState {
  return isPracticeAnswerState(state) ? { ...state, answer } : state;
}

/** Relocalize the current reference only; no generator invocation or graph copy. */
export function localizePracticeState(state: PracticeState, locale: AppLanguage): PracticeState {
  if (state.phase === "CONFIG") return state;
  const config = normalizeSessionConfig({ ...state.config, locale });
  if (!hasPracticeQuestion(state)) return { ...state, config };
  return { ...state, config, question: {
    ...state.question, reference: { ...state.question.reference, name: state.question.reference.names[locale] },
  } };
}

export function submitPracticeAnswer(state: PracticeState, locale: AppLanguage, submitted: PracticeTime): PracticeState {
  if (hasPracticeQuestion(state) && isBuildQuestion(state.question)) return state;
  if (!isPracticeAnswerState(state) || !state.answer.trim() || !state.timing) return state;
  const config = normalizeSessionConfig({ ...state.config, locale });
  const question = { ...state.question, reference: { ...state.question.reference, name: state.question.reference.names[locale] } };
  const graded = evaluateSessionAnswer(question, state.answer, locale);
  if (!graded.ok) return state;
  const { correct, answer } = graded;
  if (state.phase === "CORRECTION_QUESTION") {
    const record = createCorrectionAttempt(state.original, state.attempts,
      { answer, correct, started: state.timing, submitted, locale, ...(graded.selectedOptionId ? { selectedOptionId: graded.selectedOptionId } : {}) });
    const attempts = appendPracticeAttempt(state.attempts, record);
    return { ...state, config, question, phase: "CORRECTION_FEEDBACK", submittedLocale: locale, correct, attempts };
  }
  const record = createInitialAttempt({ question: state.question, displayOrdinal: state.index + 1,
    generationIndex: state.generationIndex, answer, correct, started: state.timing, submitted, locale,
    ...(graded.selectedOptionId ? { selectedOptionId: graded.selectedOptionId } : {}) });
  const attempts = appendPracticeAttempt(state.attempts, record);
  if (attempts === state.attempts) return state;
  return { ...state, config, question, phase: "FEEDBACK", submittedLocale: locale, correct, attempts };
}

/** Builder commits only its isolated working graph. Locale/reset preserve timing. */
export function updatePracticeStructure(state: PracticeState, molecule: GeneratedMolecule): PracticeState {
  return isPracticeAnswerState(state) && isBuildQuestion(state.question)
    ? { ...state, studentMolecule: structuredClone(molecule), buildError: undefined } : state;
}

export function submitPracticeStructure(state: PracticeState, locale: AppLanguage, submitted: PracticeTime,
  evaluate: StructuralAnswerEvaluator): PracticeState {
  if (!isPracticeAnswerState(state) || !isBuildQuestion(state.question) || !state.timing || !state.studentMolecule) return state;
  const graded = evaluateSessionAnswer(state.question, "", locale, state.studentMolecule, evaluate);
  if (!graded.ok) return { ...state, buildError: graded.reason === "INVALID_SUBMISSION" ? "INVALID_SUBMISSION" : "UNSUPPORTED_COMPARISON" };
  const structuralAnswer = graded.structuralAnswer!;
  const input = { answer: structuralAnswer.submittedSmiles!, correct: structuralAnswer.correct, structuralAnswer,
    started: state.timing, submitted, locale };
  const record = state.phase === "CORRECTION_QUESTION" ? createCorrectionAttempt(state.original, state.attempts, input)
    : createInitialAttempt({ ...input, question: state.question, displayOrdinal: state.index + 1, generationIndex: state.generationIndex });
  const attempts = appendPracticeAttempt(state.attempts, record);
  const feedback = { correct: structuralAnswer.correct, submittedLocale: locale, attempts, answer: input.answer, buildError: undefined };
  return state.phase === "CORRECTION_QUESTION"
    ? { ...state, ...feedback, phase: "CORRECTION_FEEDBACK" }
    : { ...state, ...feedback, phase: "FEEDBACK" };
}

export function nextPracticeQuestion(state: PracticeState, generate: PracticeGenerator): PracticeState {
  if (state.phase === "CORRECTION_FEEDBACK") {
    const correctionIndex = state.correctionIndex + 1;
    return correctionIndex >= state.queue.length
      ? { phase: "CORRECTION_SUMMARY", config: state.config, attempts: state.attempts }
      : loadCorrection({ config: state.config, attempts: state.attempts, queue: state.queue, correctionIndex }, generate);
  }
  if (state.phase !== "FEEDBACK") return state;
  const index = state.index + 1;
  if (state.config.questionCount !== "endless" && index >= state.config.questionCount) {
    return { phase: "COMPLETE", config: state.config, attempts: state.attempts };
  }
  return loadQuestion({ config: state.config, index, generationIndex: state.generationIndex + 1,
    recentIdentities: state.recentIdentities, usedExerciseKeys: state.usedExerciseKeys, attempts: state.attempts }, generate);
}

export function retryPracticeGeneration(state: PracticeState, generate: PracticeGenerator): PracticeState {
  if (state.phase === "CORRECTION_ERROR") return loadCorrection(state, generate);
  return state.phase === "ERROR" ? loadQuestion(state, generate) : state;
}

export function endPractice(state: PracticeState): PracticeState {
  if (state.phase === "CORRECTION_QUESTION" || state.phase === "CORRECTION_FEEDBACK" || state.phase === "CORRECTION_ERROR") {
    return { phase: "CORRECTION_SUMMARY", config: state.config, attempts: state.attempts };
  }
  if (state.phase === "CORRECTION_SUMMARY") return state;
  return state.phase === "CONFIG" || state.phase === "COMPLETE" ? state
    : { phase: "COMPLETE", config: state.config, attempts: state.attempts };
}

function loadCorrection(context: CorrectionContext, generate: PracticeGenerator): PracticeState {
  const original = context.queue[context.correctionIndex];
  try {
    const question = reconstructPracticeCorrection(context.config, original, generate);
    return { ...context, phase: "CORRECTION_QUESTION", original,
      index: original.displayOrdinal - 1, generationIndex: original.generationIndex, question, answer: "", timing: null };
  } catch {
    return { ...context, phase: "CORRECTION_ERROR" };
  }
}

/** Explicit user action starts each finite round. Successes never return to the queue. */
export function startPracticeCorrections(state: PracticeState, generate: PracticeGenerator): PracticeState {
  if (state.phase !== "COMPLETE" && state.phase !== "CORRECTION_SUMMARY") return state;
  const queue = createCorrectionQueue(state.attempts);
  return queue.length ? loadCorrection({ config: state.config, attempts: state.attempts, queue, correctionIndex: 0 }, generate) : state;
}
