import { GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, SessionConfig } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import type { GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import { matchesHydrocarbonReferenceName } from "./practice-reference-answer.ts";

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
};
type CurrentQuestion = Context & { question: GeneratedExerciseMolecule; answer: string };
export type PracticeState =
  | { phase: "CONFIG" }
  | (CurrentQuestion & { phase: "QUESTION" })
  | (CurrentQuestion & { phase: "FEEDBACK"; correct: boolean; submittedLocale: AppLanguage })
  | (Context & { phase: "ERROR" })
  | { phase: "COMPLETE"; config: SessionConfig };

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
      return { ...context, phase: "QUESTION", generationIndex, recentIdentities, question, answer: "" };
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
  return loadQuestion({ config: canonical, index: 0, generationIndex: 0, recentIdentities: [] }, generate);
}

export function updatePracticeAnswer(state: PracticeState, answer: string): PracticeState {
  return state.phase === "QUESTION" ? { ...state, answer } : state;
}

/** Relocalize the current reference only; no generator invocation or graph copy. */
export function localizePracticeState(state: PracticeState, locale: AppLanguage): PracticeState {
  if (state.phase === "CONFIG") return state;
  const config = normalizeSessionConfig({ ...state.config, locale });
  if (state.phase !== "QUESTION" && state.phase !== "FEEDBACK") return { ...state, config };
  return { ...state, config, question: {
    ...state.question, reference: { ...state.question.reference, name: state.question.reference.names[locale] },
  } };
}

export function submitPracticeAnswer(state: PracticeState, locale: AppLanguage): PracticeState {
  if (state.phase !== "QUESTION" || !state.answer.trim()) return state;
  const localized = localizePracticeState(state, locale) as Extract<PracticeState, { phase: "QUESTION" }>;
  return { ...localized, phase: "FEEDBACK", submittedLocale: locale,
    correct: matchesHydrocarbonReferenceName(state.answer, localized.question.reference.name) };
}

export function nextPracticeQuestion(state: PracticeState, generate: PracticeGenerator): PracticeState {
  if (state.phase !== "FEEDBACK") return state;
  const index = state.index + 1;
  if (state.config.questionCount !== "endless" && index >= state.config.questionCount) {
    return { phase: "COMPLETE", config: state.config };
  }
  return loadQuestion({ config: state.config, index, generationIndex: state.generationIndex + 1,
    recentIdentities: state.recentIdentities }, generate);
}

export function retryPracticeGeneration(state: PracticeState, generate: PracticeGenerator): PracticeState {
  return state.phase === "ERROR" ? loadQuestion(state, generate) : state;
}

export function endPractice(state: PracticeState): PracticeState {
  return state.phase === "CONFIG" ? state : { phase: "COMPLETE", config: state.config };
}
