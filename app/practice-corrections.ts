import type { SessionConfig } from "./exercise-model.ts";
import type { GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import { practiceQuestionKey } from "./practice-attempt.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import type { AppLanguage } from "./i18n.ts";
import { practiceResponseTimeMs } from "./practice-timing.ts";
import type { PracticeTime } from "./practice-timing.ts";

function initialQuestions(log: readonly AttemptRecord[]): AttemptRecord[] {
  const initial = new Map<string, AttemptRecord>();
  for (const record of log) {
    const key = practiceQuestionKey(record);
    if (record.attemptNumber === 1 && !initial.has(key)) initial.set(key, record);
  }
  return [...initial.values()].sort((a, b) => a.displayOrdinal - b.displayOrdinal);
}

function correctedKeys(log: readonly AttemptRecord[]): Set<string> {
  return new Set(log.filter((record) => record.attemptNumber > 1 && record.correct).map(practiceQuestionKey));
}

/** A round snapshots only still-unmastered initial mistakes, in original order.
 * Queue entries are the original records, never copies of molecular graphs.
 */
export function createCorrectionQueue(log: readonly AttemptRecord[]): readonly AttemptRecord[] {
  const corrected = correctedKeys(log);
  return initialQuestions(log).filter((record) => !record.correct && !corrected.has(practiceQuestionKey(record)));
}

export type MasteryMetrics = Readonly<{
  originalQuestionsToReview: number;
  correctedQuestions: number;
  remainingMistakes: number;
  correctionAttempts: number;
  finalMasteredQuestions: number;
  initialAnswered: number;
  finalMastery: number;
}>;

/** Separate from initial metrics; every count is derived from the append-only log. */
export function calculatePracticeMastery(log: readonly AttemptRecord[]): MasteryMetrics {
  const initial = initialQuestions(log);
  const mistakes = initial.filter((record) => !record.correct);
  const mistakeKeys = new Set(mistakes.map(practiceQuestionKey));
  const corrected = correctedKeys(log);
  const correctedQuestions = mistakes.filter((record) => corrected.has(practiceQuestionKey(record))).length;
  const finalMasteredQuestions = initial.length - mistakes.length + correctedQuestions;
  return {
    originalQuestionsToReview: mistakes.length, correctedQuestions,
    remainingMistakes: mistakes.length - correctedQuestions,
    correctionAttempts: log.filter((record) => record.attemptNumber > 1 && mistakeKeys.has(practiceQuestionKey(record))).length,
    finalMasteredQuestions, initialAnswered: initial.length,
    finalMastery: initial.length ? finalMasteredQuestions / initial.length * 100 : 0,
  };
}

/** Direct reconstruction: no duplicate avoidance and no displayOrdinal-derived seed.
 * Reject any changed chemical identity or exercise context before presentation.
 */
export function reconstructPracticeCorrection(config: SessionConfig, original: AttemptRecord,
  generate: (config: SessionConfig, index: number) => GeneratedExerciseMolecule): GeneratedExerciseMolecule {
  if (original.attemptNumber !== 1 || original.correct || original.questionType !== "naming"
    || original.generatorVersion !== config.generatorVersion) throw new Error("Invalid correction context.");
  const generated = generate(config, original.generationIndex);
  if (generated.reference.structuralIdentity !== original.structuralIdentity
    || generated.question.id !== original.questionId || generated.question.seed !== original.questionSeed
    || generated.question.generatorVersion !== original.generatorVersion || generated.category !== original.category) {
    throw new Error("Correction reconstruction mismatch.");
  }
  return generated;
}

export function createCorrectionAttempt(original: AttemptRecord, log: readonly AttemptRecord[], input: {
  answer: string; correct: boolean; started: PracticeTime; submitted: PracticeTime; locale: AppLanguage;
}): AttemptRecord {
  const history = log.filter((record) => practiceQuestionKey(record) === practiceQuestionKey(original));
  const first = history.find((record) => record.attemptNumber === 1);
  if (original.attemptNumber !== 1 || original.correct || !first || first.correct) {
    throw new Error("Correction requires its original first attempt.");
  }
  const attemptNumber = history.reduce((maximum, record) => Math.max(maximum, record.attemptNumber), 1) + 1;
  if (!Number.isSafeInteger(attemptNumber)) throw new RangeError("Invalid correction attempt number.");
  return {
    ...first, attemptNumber, answer: input.answer, correct: input.correct,
    startedAt: input.started.wallTimeMs, submittedAt: input.submitted.wallTimeMs,
    responseTimeMs: practiceResponseTimeMs(input.started, input.submitted), localeAtSubmission: input.locale,
  };
}
