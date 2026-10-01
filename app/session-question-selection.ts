import type { SessionConfig } from "./exercise-model.ts";
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
/** Literal exercise identity excludes seeds, ordinals, locale and MCQ options. */
export function getExerciseUniquenessKey(question: { type?: PracticeQuestion["type"]; reference: { structuralIdentity: string } }): string {
  return JSON.stringify([question.type ?? "naming", question.reference.structuralIdentity]);
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
  for (let offset = 0; offset < limit; offset += 1) {
    const generationIndex = context.generationIndex + offset;
    try {
      const question = generate(context.config, generationIndex, { questionType, displayIndex: context.index });
      if (isMultipleChoiceQuestion(question) !== (questionType === "multiple-choice")) throw new Error("Question type mismatch.");
      if (isBuildQuestion(question) !== (questionType === "build")) throw new Error("Question type mismatch.");
      if (isMultipleChoiceQuestion(question) && !validateMultipleChoiceQuestion(question)) throw new Error("Invalid option payload.");
      const identity = question.reference.structuralIdentity;
      const key = getExerciseUniquenessKey(question);
      if (used.has(key)) { duplicate = true; continue; }
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
    reason: duplicate ? "insufficient-unique-questions" : "insufficient-safe-distractors" };
}
