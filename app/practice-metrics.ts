import { EXERCISE_CATEGORIES, QUESTION_TYPES } from "./exercise-model.ts";
import type { ExerciseCategory, QuestionType } from "./exercise-model.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import type { AppLanguage } from "./i18n.ts";

export type AccuracyGroup<T> = Readonly<{ id: T; correct: number; answered: number; accuracy: number }>;
export type SessionMetrics = Readonly<{
  answeredQuestions: number; correctAnswers: number; incorrectAnswers: number;
  initialScore: number; firstAttemptAccuracy: number;
  averageResponseTimeMs: number; medianResponseTimeMs: number;
  questionsToReview: number; initialErrors: readonly AttemptRecord[];
  byCategory: readonly AccuracyGroup<ExerciseCategory>[];
  byQuestionType: readonly AccuracyGroup<QuestionType>[];
}>;

/** Initial results exclusively. Later corrections cannot rewrite these metrics.
 * Empty logs yield zero counts/rates/durations, never NaN or Infinity.
 */
export function calculatePracticeMetrics(log: readonly AttemptRecord[]): SessionMetrics {
  const initial = log.filter((entry) => entry.attemptNumber === 1);
  const answeredQuestions = initial.length;
  const initialErrors = initial.filter((entry) => !entry.correct);
  const correctAnswers = answeredQuestions - initialErrors.length;
  const initialScore = answeredQuestions ? correctAnswers / answeredQuestions : 0;
  const times = initial.map((entry) => entry.responseTimeMs).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const groups = <T extends string>(ids: readonly T[], field: "category" | "questionType"): AccuracyGroup<T>[] =>
    ids.flatMap((id) => {
      const records = initial.filter((entry) => entry[field] === id);
      if (!records.length) return [];
      const correct = records.filter((entry) => entry.correct).length;
      return [{ id, correct, answered: records.length, accuracy: correct / records.length * 100 }];
    });
  return {
    answeredQuestions, correctAnswers, incorrectAnswers: initialErrors.length,
    initialScore, firstAttemptAccuracy: initialScore * 100,
    averageResponseTimeMs: answeredQuestions ? times.reduce((sum, time) => sum + time, 0) / answeredQuestions : 0,
    medianResponseTimeMs: !times.length ? 0 : times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2,
    questionsToReview: initialErrors.length, initialErrors,
    byCategory: groups(EXERCISE_CATEGORIES, "category"), byQuestionType: groups(QUESTION_TYPES, "questionType"),
  };
}

export function formatPracticePercentage(value: number, locale: AppLanguage): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

export function formatPracticeResponseTime(milliseconds: number, locale: AppLanguage): string {
  // Round only for display, before splitting units to handle minute rollover.
  const seconds = Math.round(milliseconds / 100) / 10;
  const minutes = Math.floor(seconds / 60);
  const remaining = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .format(seconds - minutes * 60);
  return `${minutes ? `${new Intl.NumberFormat(locale).format(minutes)} min ` : ""}${remaining} s`;
}
