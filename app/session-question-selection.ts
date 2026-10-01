import type { SessionConfig } from "./exercise-model.ts";
import { isBuildQuestion, isMultipleChoiceQuestion, schedulePracticeQuestionType,
  InsufficientSafeDistractorsError, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion, PracticeQuestionGenerator } from "./practice-question.ts";

export const PRACTICE_RECENT_LIMIT = 8;
export const PRACTICE_DUPLICATE_LIMIT = 4;
export const PRACTICE_MCQ_SEARCH_LIMIT = 12;
type SelectionContext = {
  config: SessionConfig; index: number; generationIndex: number; recentIdentities: readonly string[];
};
export type SessionQuestionSelection =
  | { ok: true; generationIndex: number; recentIdentities: readonly string[]; question: PracticeQuestion }
  | { ok: false; generationIndex: number; reason?: "insufficient-safe-distractors" };

/** The existing bounded Practice search, shared by both session policies. */
export function selectSessionQuestion(context: SelectionContext, generate: PracticeQuestionGenerator): SessionQuestionSelection {
  const questionType = schedulePracticeQuestionType(context.config, context.index);
  const limit = questionType === "multiple-choice" ? PRACTICE_MCQ_SEARCH_LIMIT : PRACTICE_DUPLICATE_LIMIT;
  let repeat: Extract<SessionQuestionSelection, { ok: true }> | null = null;
  for (let offset = 0; offset < limit; offset += 1) {
    const generationIndex = context.generationIndex + offset;
    try {
      const question = generate(context.config, generationIndex, { questionType, displayIndex: context.index });
      if (isMultipleChoiceQuestion(question) !== (questionType === "multiple-choice")) throw new Error("Question type mismatch.");
      if (isBuildQuestion(question) !== (questionType === "build")) throw new Error("Question type mismatch.");
      if (isMultipleChoiceQuestion(question) && !validateMultipleChoiceQuestion(question)) throw new Error("Invalid option payload.");
      const identity = question.reference.structuralIdentity;
      const recentIdentities = [...context.recentIdentities.filter((item) => item !== identity), identity]
        .slice(-PRACTICE_RECENT_LIMIT);
      const accepted = { ok: true as const, generationIndex, recentIdentities, question };
      if (context.recentIdentities.includes(identity) && offset < limit - 1) { repeat = accepted; continue; }
      return accepted;
    } catch (error) {
      if (error instanceof InsufficientSafeDistractorsError) continue;
      return { ok: false, generationIndex };
    }
  }
  return repeat ?? { ok: false, generationIndex: context.generationIndex, reason: "insufficient-safe-distractors" };
}
