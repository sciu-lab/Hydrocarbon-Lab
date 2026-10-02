import { createPracticeConfig } from "../../app/practice-session.ts";
import { createExamConfig } from "../../app/exam-session.ts";
export const reviewConfig = (mode = "practice", count = 6) => (mode === "exam" ? createExamConfig : createPracticeConfig)(
  ["alkane", "alcohol"], count, "es", "SESSION-REVIEW-FIXTURE", ["naming", "multiple-choice", "build"]);
export function reviewAttempt(ordinal, correct, number = 1, duration = ordinal * 1000) {
  const type = ["naming", "multiple-choice", "build"][(ordinal - 1) % 3];
  return { questionId: `question-${ordinal}`, displayOrdinal: ordinal, generationIndex: ordinal + 2,
    questionSeed: `seed-${ordinal}`, generatorVersion: 1, category: ordinal % 2 ? "alkane" : "alcohol",
    questionType: type, structuralIdentity: `structure-${ordinal}`, attemptNumber: number,
    answer: type === "build" ? "C" : `  Raw answer ${ordinal}/${number}  `, correct,
    startedAt: 1700000000000, submittedAt: 1700009999999, responseTimeMs: duration, localeAtSubmission: "es",
    ...(type === "multiple-choice" ? { selectedOptionId: `option-${ordinal}/${number}`, optionSetIdentity: "original-options" } : {}),
    ...(type === "build" ? { structuralAnswer: { version: 1, correct, status: correct ? "EQUIVALENT" : "DIFFERENT_STRUCTURE",
      referenceIdentity: `structure-${ordinal}`, submittedIdentity: correct ? `structure-${ordinal}` : "other",
      submittedSmiles: "C", checks: { referenceValid: true, submissionValid: true, constitutionEqual: correct, stereoEqual: correct } } } : {}) };
}
export function practiceReviewFixture() {
  return { config: reviewConfig(), attempts: [reviewAttempt(1, true), reviewAttempt(2, false), reviewAttempt(2, true, 2, 9000),
    reviewAttempt(3, false), reviewAttempt(3, false, 2, 8000), reviewAttempt(4, true),
    reviewAttempt(5, false), reviewAttempt(5, true, 2, 7000), reviewAttempt(6, true)] };
}
export function examReviewFixture() { return { config: reviewConfig("exam"), attempts: Array.from({ length: 6 }, (_, i) => reviewAttempt(i + 1, i < 4)) }; }
