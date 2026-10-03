import { GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty, GeneratorVersion, SessionConfig } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { PRACTICE_LENGTHS } from "./practice-session.ts";
import { selectSessionQuestion } from "./session-question-selection.ts";
import type { SessionSelectionFailure } from "./session-question-selection.ts";
import { evaluateSessionAnswer } from "./session-answer-evaluation.ts";
import { isMultipleChoiceQuestion, schedulePracticeQuestionType } from "./practice-question.ts";
import type { PracticeQuestion, PracticeQuestionGenerator, PracticeQuestionType } from "./practice-question.ts";
import { createInitialAttempt } from "./practice-attempt.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { validatePracticeTime, practiceResponseTimeMs } from "./practice-timing.ts";
import type { PracticeTime } from "./practice-timing.ts";
import type { BuildSubmissionValidator, StructuralAnswerEvaluator } from "./practice-structural-answer.ts";

export const EXAM_LENGTHS = PRACTICE_LENGTHS.filter((length) => typeof length === "number");
export type ExamConfig = Extract<SessionConfig, { mode: "exam" }>;
export type ExamSlot = Readonly<{
  displayOrdinal: number; questionType: PracticeQuestionType; generationIndex: number;
  questionIdentity: string; question: PracticeQuestion;
}>;
export type ExamQuestionPlan = Readonly<{ slots: readonly ExamSlot[] }>;
function freezeSnapshot<T>(source: T): T {
  const freeze = <V,>(value: V): V => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  return freeze(structuredClone(source));
}
export type ExamDraft =
  | Readonly<{ type: "naming"; rawText: string }>
  | Readonly<{ type: "multiple-choice"; selectedOptionId: string | null }>
  | Readonly<{ type: "build"; studentMolecule?: GeneratedMolecule; validForGrading: boolean;
      validationError?: "INVALID_SUBMISSION" | "UNSUPPORTED_COMPARISON" }>;
type VisitTiming = Readonly<{ activeMs: number; firstPresented: PracticeTime | null }>;
type ExamContext = {
  config: ExamConfig; plan: ExamQuestionPlan; drafts: readonly ExamDraft[];
  timings: readonly VisitTiming[]; attempts: readonly AttemptRecord[];
};
type EditableExam = ExamContext & { index: number; activeVisit: { index: number; start: PracticeTime } | null };
export type ExamState =
  | { phase: "CONFIG" }
  | { phase: "EXAM_ERROR"; config: ExamConfig; attempts: readonly AttemptRecord[]; reason?: SessionSelectionFailure }
  | (EditableExam & { phase: "EXAM_QUESTION" })
  | (EditableExam & { phase: "EXAM_REVIEW"; locked?: boolean; gradingError?: boolean })
  | (ExamContext & { phase: "EXAM_RESULTS" })
  | (ExamContext & { phase: "EXAM_POST_REVIEW"; index: number });

export function createExamConfig(categories: readonly ExerciseCategory[], questionCount: number,
  locale: AppLanguage, seed: string, questionTypes: readonly PracticeQuestionType[] = ["naming"],
  difficulty: ExerciseDifficulty = "basic", generatorVersion: GeneratorVersion = GENERATOR_VERSION): ExamConfig {
  return normalizeSessionConfig({ mode: "exam", categories, questionCount, questionTypes,
    difficulty, locale, seed, generatorVersion }) as ExamConfig;
}

/** Full plan uses the SAME generator/search/scheduler. No student evaluator runs. */
export function createExamQuestionPlan(config: ExamConfig, generate: PracticeQuestionGenerator): ExamQuestionPlan {
  const canonical = normalizeSessionConfig(config);
  if (canonical.mode !== "exam") {
    throw new TypeError("Unsupported Exam configuration.");
  }
  const slots: ExamSlot[] = [];
  let generationIndex = 0;
  let recentIdentities: readonly string[] = [];
  let usedExerciseKeys: readonly string[] = [];
  for (let index = 0; index < canonical.questionCount; index++) {
    const selected = selectSessionQuestion({ config: canonical, index, generationIndex, recentIdentities, usedExerciseKeys }, generate);
    if (!selected.ok) throw new ExamPlanUnavailable(selected.reason);
    slots.push(Object.freeze({ displayOrdinal: index + 1, generationIndex: selected.generationIndex,
      questionType: schedulePracticeQuestionType(canonical, index), questionIdentity: selected.question.question.id,
      question: freezeSnapshot({ ...selected.question,
        reference: { ...selected.question.reference, name: selected.question.reference.names.es } }) }));
    generationIndex = selected.generationIndex + 1;
    recentIdentities = selected.recentIdentities;
    usedExerciseKeys = selected.usedExerciseKeys;
  }
  return Object.freeze({ slots: Object.freeze(slots) });
}

class ExamPlanUnavailable extends Error {
  readonly reason?: SessionSelectionFailure;
  constructor(reason?: SessionSelectionFailure) { super("Exam plan unavailable."); this.reason = reason; }
}

export function startExam(config: ExamConfig, generate: PracticeQuestionGenerator): ExamState {
  const canonical = normalizeSessionConfig(config);
  if (canonical.mode !== "exam") throw new TypeError("Exam mode required.");
  try {
    const plan = createExamQuestionPlan(canonical, generate);
    const drafts: ExamDraft[] = plan.slots.map((slot) => slot.questionType === "build"
      ? { type: "build", validForGrading: false } : slot.questionType === "multiple-choice"
        ? { type: "multiple-choice", selectedOptionId: null } : { type: "naming", rawText: "" });
    return { phase: "EXAM_QUESTION", config: canonical, plan, drafts,
      timings: drafts.map(() => ({ activeMs: 0, firstPresented: null })), attempts: [], index: 0, activeVisit: null };
  } catch (error) { return { phase: "EXAM_ERROR", config: canonical, attempts: [],
    ...(error instanceof ExamPlanUnavailable && error.reason ? { reason: error.reason } : {}) }; }
}

/** Locale is presentation only. Plan, drafts, visits and submitted outcomes stay shared. */
export function localizeExamState(state: ExamState, locale: AppLanguage): ExamState {
  return state.phase === "CONFIG" ? state : { ...state, config: { ...state.config, locale } };
}

export function examQuestion(state: ExamContext & { index: number }, locale: AppLanguage): PracticeQuestion {
  const question = state.plan.slots[state.index].question;
  return { ...question, reference: { ...question.reference, name: question.reference.names[locale] } };
}

export function isExamDraftComplete(slot: ExamSlot, draft: ExamDraft): boolean {
  if (slot.questionType !== draft.type) return false;
  if (draft.type === "naming") return draft.rawText.trim().length > 0;
  if (draft.type === "build") return Boolean(draft.studentMolecule && draft.validForGrading);
  return isMultipleChoiceQuestion(slot.question) && slot.question.options.some((option) => option.id === draft.selectedOptionId);
}
export function examAnsweredCount(state: ExamContext): number {
  return state.plan.slots.filter((slot, index) => isExamDraftComplete(slot, state.drafts[index])).length;
}
export function hasExamDrafts(state: ExamState): boolean {
  return "drafts" in state && state.drafts.some((draft) => draft.type === "build" ? Boolean(draft.studentMolecule)
    : draft.type === "naming" ? draft.rawText.length > 0 : draft.selectedOptionId !== null);
}

export function markExamQuestionAvailable(state: ExamState, time: PracticeTime,
  expected: { questionId: string; index: number }): ExamState {
  if (state.phase !== "EXAM_QUESTION" || state.activeVisit || expected.index !== state.index
    || expected.questionId !== state.plan.slots[state.index].questionIdentity) return state;
  const start = validatePracticeTime(time);
  const timings = state.timings.map((timing, index) => index === state.index
    ? { ...timing, firstPresented: timing.firstPresented ?? start } : timing);
  return { ...state, timings, activeVisit: { index: state.index, start } };
}

function pauseExamVisit(state: EditableExam, time: PracticeTime): EditableExam {
  if (!state.activeVisit) return state;
  const { index, start } = state.activeVisit;
  const elapsed = practiceResponseTimeMs(start, time);
  return { ...state, activeVisit: null, timings: state.timings.map((timing, i) => i === index
    ? { ...timing, activeMs: timing.activeMs + elapsed } : timing) };
}

export function updateExamAnswer(state: ExamState, answer: string): ExamState {
  if (state.phase !== "EXAM_QUESTION") return state;
  const current = state.drafts[state.index];
  if (current.type === "build") return state;
  const draft: ExamDraft = current.type === "naming" ? { type: "naming", rawText: answer }
    : { type: "multiple-choice", selectedOptionId: answer };
  return { ...state, drafts: state.drafts.map((value, index) => index === state.index ? draft : value) };
}

export function updateExamStructure(state: ExamState, molecule: GeneratedMolecule, validate: BuildSubmissionValidator,
  expected?: { questionId: string; index: number }): ExamState {
  if (state.phase !== "EXAM_QUESTION" || state.drafts[state.index].type !== "build"
    || (expected && (expected.index !== state.index || expected.questionId !== state.plan.slots[state.index].questionIdentity))) return state;
  const studentMolecule = structuredClone(molecule);
  let validation;
  try { validation = validate(studentMolecule); } catch { validation = { valid: false as const, reason: "UNSUPPORTED_COMPARISON" as const }; }
  const draft: ExamDraft = { type: "build", studentMolecule, validForGrading: validation.valid,
    ...(!validation.valid ? { validationError: validation.reason } : {}) };
  return { ...state, drafts: state.drafts.map((value, index) => index === state.index ? draft : value) };
}

export function navigateExam(state: ExamState, index: number, time: PracticeTime): ExamState {
  if (state.phase === "EXAM_POST_REVIEW") return Number.isSafeInteger(index) && index >= 0 && index < state.plan.slots.length
    ? { ...state, index } : state;
  if (state.phase !== "EXAM_QUESTION" && state.phase !== "EXAM_REVIEW") return state;
  if (state.phase === "EXAM_REVIEW" && state.locked) return state;
  if (!Number.isSafeInteger(index) || index < 0 || index > state.plan.slots.length) return state;
  if (state.phase === "EXAM_QUESTION" && index === state.index) return state;
  const paused = pauseExamVisit(state, time);
  return index === state.plan.slots.length ? { ...paused, phase: "EXAM_REVIEW" }
    : { ...paused, phase: "EXAM_QUESTION", index };
}

function freezeDrafts(drafts: readonly ExamDraft[]): readonly ExamDraft[] {
  return freezeSnapshot(drafts);
}

/** One explicit commit after ALL grades/records succeed. Retry cannot append a partial log. */
export function submitExam(state: ExamState, locale: AppLanguage, submitted: PracticeTime,
  evaluateStructure?: StructuralAnswerEvaluator): ExamState {
  if (state.phase !== "EXAM_REVIEW" || examAnsweredCount(state) !== state.plan.slots.length) return state;
  const drafts = freezeDrafts(state.drafts);
  try {
    validatePracticeTime(submitted);
    const attempts = state.plan.slots.map((slot, index) => {
      const draft = drafts[index];
      const timing = state.timings[index];
      if (!timing.firstPresented) throw new Error("Unavailable visit timing.");
      const question = { ...slot.question,
        reference: { ...slot.question.reference, name: slot.question.reference.names[locale] } };
      const graded = evaluateSessionAnswer(question, draft.type === "naming" ? draft.rawText
        : draft.type === "multiple-choice" ? draft.selectedOptionId ?? "" : "", locale,
        draft.type === "build" ? draft.studentMolecule : undefined, evaluateStructure);
      if (!graded.ok) throw new Error("Grade unavailable.");
      return createInitialAttempt({ question, displayOrdinal: slot.displayOrdinal,
        generationIndex: slot.generationIndex, ...graded, started: timing.firstPresented,
        submitted, locale, responseTimeMs: timing.activeMs });
    });
    return { phase: "EXAM_RESULTS", config: { ...state.config, locale }, plan: state.plan,
      drafts, timings: state.timings, attempts: freezeSnapshot(attempts) };
  } catch { return { ...state, drafts, locked: true, gradingError: true, attempts: [] }; }
}

export function openExamPostReview(state: ExamState): ExamState {
  return state.phase === "EXAM_RESULTS" ? { ...state, phase: "EXAM_POST_REVIEW", index: 0 } : state;
}
export function backToExamResults(state: ExamState): ExamState {
  if (state.phase !== "EXAM_POST_REVIEW") return state;
  return { phase: "EXAM_RESULTS", config: state.config, plan: state.plan,
    drafts: state.drafts, timings: state.timings, attempts: state.attempts };
}
