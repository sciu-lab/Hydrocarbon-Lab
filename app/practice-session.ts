import { GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, SessionConfig } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import type { GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import { matchesHydrocarbonReferenceName } from "./practice-reference-answer.ts";
import { appendPracticeAttempt, createInitialAttempt } from "./practice-attempt.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { validatePracticeTime } from "./practice-timing.ts";
import type { PracticeTime } from "./practice-timing.ts";
import { createCorrectionAttempt, createCorrectionQueue, reconstructPracticeCorrection } from "./practice-corrections.ts";

export const PRACTICE_LENGTHS = [5, 10, 20, 30, "endless"] as const;
export const PRACTICE_RECENT_LIMIT = 8;
export const PRACTICE_DUPLICATE_LIMIT = 4;
export type PracticeGenerator = (config: SessionConfig, index: number) => GeneratedExerciseMolecule;

type Context = {
  config: SessionConfig;
  /** Display ordinal; generationIndex is the actual Phase 2 seed context. */
  index: number;
  generationIndex: number;
  recentIdentities: readonly string[];
  attempts: readonly AttemptRecord[];
};
type CurrentQuestion = Context & { question: GeneratedExerciseMolecule; answer: string; timing: PracticeTime | null };
type CorrectionContext = {
  config: SessionConfig; attempts: readonly AttemptRecord[];
  queue: readonly AttemptRecord[]; correctionIndex: number;
};
type CorrectionQuestion = CorrectionContext & {
  original: AttemptRecord; index: number; generationIndex: number;
  question: GeneratedExerciseMolecule; answer: string; timing: PracticeTime | null;
};
export type PracticeState =
  | { phase: "CONFIG" }
  | (CurrentQuestion & { phase: "QUESTION" })
  | (CurrentQuestion & { phase: "FEEDBACK"; correct: boolean; submittedLocale: AppLanguage })
  | (Context & { phase: "ERROR" })
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
): SessionConfig {
  if (!(PRACTICE_LENGTHS as readonly (number | string)[]).includes(questionCount)) {
    throw new RangeError("Unsupported Practice length.");
  }
  return normalizeSessionConfig({
    mode: "practice", questionTypes: ["naming"], categories, difficulty: "basic",
    locale, seed, generatorVersion: GENERATOR_VERSION, questionCount,
  });
}

function loadQuestion(context: Context, generate: PracticeGenerator): PracticeState {
  // Search at most four independent Phase 2 contexts. If the domain/selection
  // is too small, accept a repeat rather than hang. Never alter the public seed.
  for (let offset = 0; offset < PRACTICE_DUPLICATE_LIMIT; offset += 1) {
    const generationIndex = context.generationIndex + offset;
    try {
      const question = generate(context.config, generationIndex);
      const identity = question.reference.structuralIdentity;
      if (context.recentIdentities.includes(identity) && offset < PRACTICE_DUPLICATE_LIMIT - 1) continue;
      const recentIdentities = [...context.recentIdentities.filter((item) => item !== identity), identity]
        .slice(-PRACTICE_RECENT_LIMIT);
      return { ...context, phase: "QUESTION", generationIndex, recentIdentities, question, answer: "", timing: null };
    } catch {
      // No stack, exception text or partially generated graph enters the UI.
      return { ...context, phase: "ERROR", generationIndex };
    }
  }
  throw new Error("Unreachable bounded question search.");
}

export function startPractice(config: SessionConfig, generate: PracticeGenerator): PracticeState {
  const canonical = normalizeSessionConfig(config);
  if (canonical.mode !== "practice" || canonical.questionTypes.length !== 1
    || canonical.questionTypes[0] !== "naming" || canonical.difficulty !== "basic") {
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
  if (!isPracticeAnswerState(state) || !state.answer.trim() || !state.timing) return state;
  const config = normalizeSessionConfig({ ...state.config, locale });
  const question = { ...state.question, reference: { ...state.question.reference, name: state.question.reference.names[locale] } };
  const correct = matchesHydrocarbonReferenceName(state.answer, question.reference.name, locale);
  if (state.phase === "CORRECTION_QUESTION") {
    const record = createCorrectionAttempt(state.original, state.attempts,
      { answer: state.answer, correct, started: state.timing, submitted, locale });
    const attempts = appendPracticeAttempt(state.attempts, record);
    return { ...state, config, question, phase: "CORRECTION_FEEDBACK", submittedLocale: locale, correct, attempts };
  }
  const record = createInitialAttempt({ question: state.question, displayOrdinal: state.index + 1,
    generationIndex: state.generationIndex, answer: state.answer, correct, started: state.timing, submitted, locale });
  const attempts = appendPracticeAttempt(state.attempts, record);
  if (attempts === state.attempts) return state;
  return { ...state, config, question, phase: "FEEDBACK", submittedLocale: locale, correct, attempts };
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
    recentIdentities: state.recentIdentities, attempts: state.attempts }, generate);
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
