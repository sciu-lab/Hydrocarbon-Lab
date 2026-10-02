import { EXERCISE_CATEGORIES, QUESTION_TYPES, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, QuestionType, SessionConfig } from "./exercise-model.ts";
import { practiceQuestionKey } from "./practice-attempt.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { calculatePracticeMetrics } from "./practice-metrics.ts";
import type { SessionMetrics } from "./practice-metrics.ts";
import { calculatePracticeMastery } from "./practice-corrections.ts";
import type { MasteryMetrics } from "./practice-corrections.ts";
import type { PracticeState } from "./practice-session.ts";
import type { ExamState } from "./exam-session.ts";

export const SESSION_REVIEW_SCHEMA_VERSION = 1;
export type ReviewStatus = "CORRECT_FIRST_TRY" | "CORRECTED" | "UNRESOLVED" | "CORRECT" | "INCORRECT";
export type ReviewTiming = Readonly<{ attempts: number; totalMs: number; averageMs: number | null; medianMs: number | null }>;
export type ReviewOverview = Readonly<{ mode: "practice"; totalQuestions: number; initialCorrect: number;
  initialAccuracy: number; masteredQuestions: number; mastery: number; correctedQuestions: number;
  unresolvedQuestions: number; totalAttempts: number; correctionAttempts: number }>
  | Readonly<{ mode: "exam"; totalQuestions: number; correctQuestions: number; incorrectQuestions: number;
    accuracy: number; score: Readonly<{ correct: number; total: number }>; totalAttempts: number }>;
export type ReviewBreakdown<T> = Readonly<{ id: T; questions: number; initialCorrect: number;
  initialAccuracy: number; averageInitialResponseTimeMs: number }> &
  (Readonly<{ mode: "practice"; mastered: number; mastery: number }> | Readonly<{ mode: "exam" }>);
export type QuestionReviewEntry = Readonly<Pick<AttemptRecord, "questionId" | "displayOrdinal" | "generationIndex"
  | "questionSeed" | "category" | "questionType" | "structuralIdentity" | "generatorVersion"> & {
  key: string; firstAttempt: AttemptRecord; attempts: readonly AttemptRecord[];
  initialCorrect: boolean; finalCorrect: boolean; initialResponseTimeMs: number;
  reviewStatus: ReviewStatus; mastered?: boolean; correctionResponseTimeMs?: number;
}>;
type CommonModel = Readonly<{ schemaVersion: typeof SESSION_REVIEW_SCHEMA_VERSION; config: SessionConfig;
  seed: string; generatorVersion: number; questionCount: number; initialResults: SessionMetrics;
  byQuestionType: readonly ReviewBreakdown<QuestionType>[]; byCategory: readonly ReviewBreakdown<ExerciseCategory>[];
  questions: readonly QuestionReviewEntry[] }>;
export type SessionReviewModel = CommonModel & (
  Readonly<{ mode: "practice"; overview: Extract<ReviewOverview, { mode: "practice" }>; masteryResults: MasteryMetrics;
    timing: Readonly<{ initial: ReviewTiming; corrections: ReviewTiming }> }>
  | Readonly<{ mode: "exam"; overview: Extract<ReviewOverview, { mode: "exam" }>;
    timing: Readonly<{ initial: ReviewTiming }> }>);
export type SessionReviewIssue = "INVALID_CONFIG" | "INVALID_RECORD" | "INVALID_TIMING" | "MISSING_INITIAL"
  | "DUPLICATE_ATTEMPT" | "CONTEXT_MISMATCH" | "QUESTION_COUNT_MISMATCH" | "ORDER_MISMATCH" | "EXAM_CORRECTION";
export type SessionReviewResult = { ok: true; model: SessionReviewModel }
  | { ok: false; code: "NOT_COMPLETED" | "INCOMPLETE_DATA"; issues: readonly SessionReviewIssue[] };

/** Empty data is unavailable, never a synthetic zero-duration response. */
export function medianReviewResponseTime(values: readonly number[]): number | null {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError("Invalid review timing.");
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return !ordered.length ? null : ordered.length % 2 ? ordered[middle] : ordered[middle - 1] + (ordered[middle] - ordered[middle - 1]) / 2;
}
function timing(records: readonly AttemptRecord[]): ReviewTiming {
  const values = records.map((record) => record.responseTimeMs), totalMs = values.reduce((sum, value) => sum + value, 0);
  return { attempts: records.length, totalMs, averageMs: records.length ? totalMs / records.length : null,
    medianMs: medianReviewResponseTime(values) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const ratio = (correct: number, total: number) => total ? correct / total : 0;
function addRecord<K>(map: Map<K, AttemptRecord[]>, key: K, record: AttemptRecord) {
  const group = map.get(key) ?? []; group.push(record); map.set(key, group);
}
const text = (value: unknown) => typeof value === "string" && value.length > 0;
const position = (value: unknown, minimum: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

/** Metadata only. No chemistry, evaluator, clock, entropy or React is invoked.
 * The declared finalized count is checked, including ended Practice snapshots.
 * Grouping is one map pass; attempt/ordinal and numeric median sorting use copies.
 */
export function buildSessionReview(input: { config: SessionConfig; attempts: readonly AttemptRecord[];
  finalizedQuestionCount?: number }): SessionReviewResult {
  const issues = new Set<SessionReviewIssue>();
  let config: SessionConfig;
  try { config = normalizeSessionConfig(input.config); } catch { return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_CONFIG"] }; }
  const expected = input.finalizedQuestionCount ?? config.questionCount;
  if (!position(expected, config.mode === "exam" ? 1 : 0)
    || (config.questionCount !== "endless" && (config.mode === "exam" ? expected !== config.questionCount : Number(expected) > config.questionCount))) {
    issues.add("QUESTION_COUNT_MISMATCH");
  }
  if (!Array.isArray(input.attempts)) return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_RECORD"] };
  const groups = new Map<string, AttemptRecord[]>(), contexts = new Map<string, string>();
  for (const record of input.attempts) {
    if (!record || !text(record.questionId) || !text(record.questionSeed) || !text(record.structuralIdentity)
      || !position(record.displayOrdinal, 1) || !position(record.generationIndex, 0) || !position(record.attemptNumber, 1)
      || record.generatorVersion !== config.generatorVersion || !config.categories.includes(record.category)
      || !config.questionTypes.includes(record.questionType) || typeof record.correct !== "boolean"
      || typeof record.answer !== "string" || !record.answer.trim() || !["es", "en"].includes(record.localeAtSubmission)
      || !Number.isFinite(record.startedAt) || !Number.isFinite(record.submittedAt)) {
      issues.add("INVALID_RECORD"); continue;
    }
    if (!Number.isFinite(record.responseTimeMs) || record.responseTimeMs < 0) issues.add("INVALID_TIMING");
    if (config.mode === "exam" && record.attemptNumber !== 1) issues.add("EXAM_CORRECTION");
    if (record.questionType === "multiple-choice" && (!text(record.selectedOptionId) || !text(record.optionSetIdentity))) { issues.add("INVALID_RECORD"); continue; }
    if (record.questionType === "build" && (!record.structuralAnswer?.checks?.submissionValid
      || !text(record.structuralAnswer.submittedSmiles) || record.structuralAnswer.correct !== record.correct
      || !record.structuralAnswer.checks?.referenceValid || !text(record.structuralAnswer.referenceIdentity)
      || !text(record.structuralAnswer.submittedIdentity))) { issues.add("INVALID_RECORD"); continue; }
    const context = JSON.stringify([record.displayOrdinal, record.generationIndex, record.questionSeed,
      record.generatorVersion, record.category, record.questionType, record.structuralIdentity, record.optionSetIdentity ?? null,
      record.structuralAnswer?.referenceIdentity ?? null]);
    if (contexts.has(record.questionId) && contexts.get(record.questionId) !== context) issues.add("CONTEXT_MISMATCH");
    contexts.set(record.questionId, context);
    const key = practiceQuestionKey(record), group = groups.get(key) ?? [];
    group.push(record); groups.set(key, group);
  }
  const originals: AttemptRecord[] = [];
  for (const group of groups.values()) {
    const numbers = new Set(group.map((record) => record.attemptNumber));
    if (numbers.size !== group.length) issues.add("DUPLICATE_ATTEMPT");
    const initial = group.find((record) => record.attemptNumber === 1);
    if (!initial) issues.add("MISSING_INITIAL"); else originals.push(initial);
    if ([...numbers].reduce((maximum, number) => Math.max(maximum, number), 0) !== numbers.size) issues.add("MISSING_INITIAL");
  }
  originals.sort((a, b) => a.displayOrdinal - b.displayOrdinal);
  if (originals.length !== expected) issues.add("QUESTION_COUNT_MISMATCH");
  if (originals.some((record, index) => record.displayOrdinal !== index + 1
    || (index > 0 && record.generationIndex <= originals[index - 1].generationIndex))) issues.add("ORDER_MISMATCH");
  if (issues.size) return { ok: false, code: "INCOMPLETE_DATA", issues: [...issues] };
  if (!Number.isFinite(input.attempts.reduce((sum, record) => sum + record.responseTimeMs, 0)))
    return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_TIMING"] };
  let records: readonly AttemptRecord[];
  try { JSON.stringify(input.attempts); records = structuredClone(input.attempts); }
  catch { return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_RECORD"] }; }
  const copiedGroups = new Map<string, AttemptRecord[]>();
  const categories = new Map<ExerciseCategory, AttemptRecord[]>(), types = new Map<QuestionType, AttemptRecord[]>();
  for (const record of records) {
    addRecord(copiedGroups, practiceQuestionKey(record), record);
    addRecord(categories, record.category, record); addRecord(types, record.questionType, record);
  }
  const initialResults = calculatePracticeMetrics(records);
  const breakdown = <T extends string>(ids: readonly T[], map: Map<T, AttemptRecord[]>): ReviewBreakdown<T>[] => ids.flatMap((id) => {
    const group = map.get(id); if (!group) return [];
    const metrics = calculatePracticeMetrics(group);
    const row = { id, questions: metrics.answeredQuestions, initialCorrect: metrics.correctAnswers,
      initialAccuracy: metrics.initialScore, averageInitialResponseTimeMs: metrics.averageResponseTimeMs };
    const mastery = config.mode === "practice" ? calculatePracticeMastery(group) : null;
    return [mastery ? { ...row, mode: "practice" as const, mastered: mastery.finalMasteredQuestions, mastery: ratio(mastery.finalMasteredQuestions, mastery.initialAnswered) }
      : { ...row, mode: "exam" as const }];
  });
  const questions = originals.map((original): QuestionReviewEntry => {
    const attempts = copiedGroups.get(practiceQuestionKey(original))!.sort((a, b) => a.attemptNumber - b.attemptNumber);
    const first = attempts[0], mastered = attempts.some((attempt) => attempt.correct);
    return { key: practiceQuestionKey(first), questionId: first.questionId, displayOrdinal: first.displayOrdinal,
      generationIndex: first.generationIndex, questionSeed: first.questionSeed, category: first.category,
      questionType: first.questionType, structuralIdentity: first.structuralIdentity, generatorVersion: first.generatorVersion,
      firstAttempt: first, attempts, initialCorrect: first.correct, finalCorrect: config.mode === "practice" ? mastered : first.correct,
      initialResponseTimeMs: first.responseTimeMs,
      ...(config.mode === "practice" ? { mastered, correctionResponseTimeMs: attempts.slice(1).reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) } : {}),
      reviewStatus: config.mode === "exam" ? first.correct ? "CORRECT" : "INCORRECT"
        : first.correct ? "CORRECT_FIRST_TRY" : mastered ? "CORRECTED" : "UNRESOLVED" };
  });
  const common: CommonModel = { schemaVersion: SESSION_REVIEW_SCHEMA_VERSION, config, seed: config.seed,
    generatorVersion: config.generatorVersion, questionCount: originals.length, initialResults,
    byQuestionType: breakdown(QUESTION_TYPES, types), byCategory: breakdown(EXERCISE_CATEGORIES, categories), questions };
  const initial = timing(records.filter((record) => record.attemptNumber === 1));
  let model: SessionReviewModel;
  if (config.mode === "practice") {
    const masteryResults = calculatePracticeMastery(records);
    model = { ...common, mode: "practice", masteryResults, timing: { initial, corrections: timing(records.filter((record) => record.attemptNumber > 1)) },
      overview: { mode: "practice", totalQuestions: originals.length, initialCorrect: initialResults.correctAnswers,
        initialAccuracy: initialResults.initialScore, masteredQuestions: masteryResults.finalMasteredQuestions,
        mastery: ratio(masteryResults.finalMasteredQuestions, masteryResults.initialAnswered), correctedQuestions: masteryResults.correctedQuestions,
        unresolvedQuestions: masteryResults.remainingMistakes, totalAttempts: records.length, correctionAttempts: masteryResults.correctionAttempts } };
  } else model = { ...common, mode: "exam", timing: { initial }, overview: { mode: "exam", totalQuestions: originals.length,
    correctQuestions: initialResults.correctAnswers, incorrectQuestions: initialResults.incorrectAnswers,
    accuracy: initialResults.initialScore, score: { correct: initialResults.correctAnswers, total: originals.length }, totalAttempts: records.length } };
  return { ok: true, model: freeze(model) };
}

/** The public lifecycle boundary excludes drafts and atomic grading failures. */
export function buildCompletedSessionReview(state: PracticeState | ExamState): SessionReviewResult {
  if ("attempts" in state && !Array.isArray(state.attempts)) return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_RECORD"] };
  if (state.phase === "EXAM_RESULTS" || state.phase === "EXAM_POST_REVIEW") {
    const result = buildSessionReview({ config: state.config, attempts: state.attempts, finalizedQuestionCount: state.plan.slots.length });
    if (result.ok && result.model.questions.some((entry, index) => {
      const slot = state.plan.slots[index];
      return !slot || slot.questionIdentity !== entry.questionId || slot.displayOrdinal !== entry.displayOrdinal
        || slot.generationIndex !== entry.generationIndex || slot.questionType !== entry.questionType
        || slot.question.reference.structuralIdentity !== entry.structuralIdentity;
    })) return { ok: false, code: "INCOMPLETE_DATA", issues: ["CONTEXT_MISMATCH"] };
    return result;
  }
  if (state.phase === "COMPLETE" || state.phase === "CORRECTION_SUMMARY") {
    if (state.config.mode !== "practice") return { ok: false, code: "INCOMPLETE_DATA", issues: ["INVALID_CONFIG"] };
    // Existing End practice closes the submitted prefix, including finite early exits and Endless.
    return buildSessionReview({ config: state.config, attempts: state.attempts,
      finalizedQuestionCount: state.attempts.filter((record) => record?.attemptNumber === 1).length });
  }
  return { ok: false, code: "NOT_COMPLETED", issues: [] };
}
export type SessionReviewFilters = Readonly<{ status?: ReviewStatus | "all"; questionType?: QuestionType | "all"; category?: ExerciseCategory | "all" }>;
export function filterSessionReviewQuestions(model: SessionReviewModel, filters: SessionReviewFilters): readonly QuestionReviewEntry[] {
  return model.questions.filter((entry) => (!filters.status || filters.status === "all" || entry.reviewStatus === filters.status)
    && (!filters.questionType || filters.questionType === "all" || entry.questionType === filters.questionType)
    && (!filters.category || filters.category === "all" || entry.category === filters.category));
}
