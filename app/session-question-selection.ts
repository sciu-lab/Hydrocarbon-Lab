import type { SessionConfig } from "./exercise-model.ts";
import { exerciseStructuralIdentity } from "./exercise-chemical-generator.ts";
import { isBuildQuestion, isMultipleChoiceQuestion, schedulePracticeQuestionType,
  InsufficientSafeDistractorsError, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion, PracticeQuestionGenerator } from "./practice-question.ts";

export const PRACTICE_RECENT_LIMIT = 8;
export const PRACTICE_DUPLICATE_LIMIT = 4;
export const PRACTICE_MCQ_SEARCH_LIMIT = 12;
type SelectionContext = {
  config: SessionConfig; index: number; generationIndex: number; recentIdentities: readonly string[];
  usedExerciseKeys?: readonly string[];
};
export type SessionSelectionFailure = "insufficient-unique-questions" | "insufficient-safe-distractors";
type ExerciseIdentitySource = { type?: PracticeQuestion["type"]; reference: { structuralIdentity: string };
  molecule?: PracticeQuestion["molecule"] };

/** Prefer identity from the final target graph; reference metadata is a cached
 * value and can drift from the molecule a question ultimately presents. */
export function getExerciseTargetIdentity(question: ExerciseIdentitySource): string {
  return question.molecule ? exerciseStructuralIdentity(question.molecule) : question.reference.structuralIdentity;
}

/** Literal exercise identity excludes seeds, ordinals, locale and MCQ options. */
export function getExerciseUniquenessKey(question: ExerciseIdentitySource): string {
  return JSON.stringify([question.type ?? "naming", getExerciseTargetIdentity(question)]);
}
export type SessionQuestionSelection =
  | { ok: true; generationIndex: number; recentIdentities: readonly string[]; usedExerciseKeys: readonly string[]; question: PracticeQuestion }
  | { ok: false; generationIndex: number; reason?: SessionSelectionFailure };

/** The existing bounded Practice search, shared by both session policies. */
export function selectSessionQuestion(context: SelectionContext, generate: PracticeQuestionGenerator): SessionQuestionSelection {
  const questionType = schedulePracticeQuestionType(context.config, context.index);
  const limit = questionType === "multiple-choice" ? PRACTICE_MCQ_SEARCH_LIMIT : PRACTICE_DUPLICATE_LIMIT;
  const keys = context.usedExerciseKeys ?? [];
  const used = new Set(keys);
  let duplicate = false;
  let invalidTargetIdentity = false;
  for (let offset = 0; offset < limit; offset += 1) {
    const generationIndex = context.generationIndex + offset;
    try {
      const question = generate(context.config, generationIndex, { questionType, displayIndex: context.index });
      if (isMultipleChoiceQuestion(question) !== (questionType === "multiple-choice")) throw new Error("Question type mismatch.");
      if (isBuildQuestion(question) !== (questionType === "build")) throw new Error("Question type mismatch.");
      if (isMultipleChoiceQuestion(question) && !validateMultipleChoiceQuestion(question)) throw new Error("Invalid option payload.");
      const identity = getExerciseTargetIdentity(question);
      const key = JSON.stringify([questionType, identity]);
      if (used.has(key)) { duplicate = true; continue; }
      // The accepted/reconstructed target must agree with the cached identity
      // used by attempts and review. Reject a stale candidate safely.
      if (identity !== question.reference.structuralIdentity) { invalidTargetIdentity = true; continue; }
      const recentIdentities = [...context.recentIdentities.filter((item) => item !== identity), identity]
        .slice(-PRACTICE_RECENT_LIMIT);
      const allKeys = [...keys, key];
      const usedExerciseKeys = context.config.questionCount === "endless" ? allKeys.slice(-PRACTICE_RECENT_LIMIT) : allKeys;
      return { ok: true, generationIndex, recentIdentities, usedExerciseKeys, question };
    } catch (error) {
      if (error instanceof InsufficientSafeDistractorsError) continue;
      return { ok: false, generationIndex };
    }
  }
  return { ok: false, generationIndex: duplicate ? context.generationIndex + limit : context.generationIndex,
    ...(duplicate ? { reason: "insufficient-unique-questions" as const }
      : invalidTargetIdentity ? {} : { reason: "insufficient-safe-distractors" as const }) };
}
