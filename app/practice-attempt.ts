import type { ExerciseCategory, GeneratorVersion, QuestionType } from "./exercise-model.ts";
import { isMultipleChoiceQuestion, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion } from "./practice-question.ts";
import type { AppLanguage } from "./i18n.ts";
import type { PracticeTime } from "./practice-timing.ts";
import { practiceResponseTimeMs } from "./practice-timing.ts";

export type AttemptRecord = Readonly<{
  questionId: string;
  /** One-based position presented to the student, independent of seed skips. */
  displayOrdinal: number;
  /** Actual Phase 2 context; reconstruct with the session's SessionConfig. */
  generationIndex: number;
  questionSeed: string;
  generatorVersion: GeneratorVersion;
  category: ExerciseCategory;
  questionType: QuestionType;
  structuralIdentity: string;
  /** Initial submission is 1; corrections append increasing numbers. */
  attemptNumber: number;
  answer: string;
  selectedOptionId?: string;
  /** Bilingual order, identities and provenance; never a molecular graph. */
  optionSetIdentity?: string;
  correct: boolean;
  /** Absolute epoch milliseconds for audit; not used to calculate duration. */
  startedAt: number;
  submittedAt: number;
  responseTimeMs: number;
  localeAtSubmission: AppLanguage;
}>;

export function createInitialAttempt(input: {
  question: PracticeQuestion; displayOrdinal: number; generationIndex: number;
  selectedOptionId?: string;
  answer: string; correct: boolean; started: PracticeTime; submitted: PracticeTime; locale: AppLanguage;
}): AttemptRecord {
  if (!Number.isSafeInteger(input.displayOrdinal) || input.displayOrdinal < 1
    || !Number.isSafeInteger(input.generationIndex) || input.generationIndex < 0) {
    throw new RangeError("Invalid Practice attempt position.");
  }
  const { question, reference } = input.question;
  if (isMultipleChoiceQuestion(input.question)) {
    const selected = input.question.options.find((option) => option.id === input.selectedOptionId);
    if (!validateMultipleChoiceQuestion(input.question) || !selected || selected.correct !== input.correct) throw new Error("Invalid MCQ submission.");
  }
  return {
    questionId: question.id, displayOrdinal: input.displayOrdinal, generationIndex: input.generationIndex,
    questionSeed: question.seed, generatorVersion: question.generatorVersion,
    category: input.question.category, questionType: isMultipleChoiceQuestion(input.question) ? "multiple-choice" : "naming", structuralIdentity: reference.structuralIdentity,
    ...(isMultipleChoiceQuestion(input.question) ? { selectedOptionId: input.selectedOptionId, optionSetIdentity: input.question.optionSetIdentity } : {}),
    attemptNumber: 1, answer: input.answer, correct: input.correct,
    startedAt: input.started.wallTimeMs, submittedAt: input.submitted.wallTimeMs,
    responseTimeMs: practiceResponseTimeMs(input.started, input.submitted), localeAtSubmission: input.locale,
  };
}

/** Immutable and idempotent: duplicate delivery never overwrites a submission. */
export function appendPracticeAttempt(log: readonly AttemptRecord[], record: AttemptRecord): readonly AttemptRecord[] {
  if (!Number.isSafeInteger(record.attemptNumber) || record.attemptNumber < 1) {
    throw new RangeError("Invalid attempt number.");
  }
  return log.some((entry) => practiceQuestionKey(entry) === practiceQuestionKey(record)
    && entry.attemptNumber === record.attemptNumber)
    ? log : [...log, record];
}

/** Pedagogical identity within one session; identical molecules are not merged. */
export function practiceQuestionKey(record: AttemptRecord): string {
  return JSON.stringify([record.questionId, record.generationIndex, record.displayOrdinal]);
}
