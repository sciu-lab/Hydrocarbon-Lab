import type { SessionConfig } from "./exercise-model.ts";
import type { QuestionReviewEntry } from "./session-review.ts";
import { isBuildQuestion, isMultipleChoiceQuestion, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion, PracticeQuestionGenerator } from "./practice-question.ts";
import { exerciseStructuralIdentity } from "./exercise-chemical-generator.ts";
import { moleculeFromSmiles } from "./openchemlib-adapter.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { buildConstitutionalIdentity } from "./practice-structural-answer.ts";
import { inspectDoubleBondStereochemistry } from "./double-bond-stereochemistry.ts";

export type SessionQuestionReview = Readonly<{ entry: QuestionReviewEntry; question: PracticeQuestion;
  studentStructures: readonly Readonly<{ attemptNumber: number; molecule: GeneratedMolecule }>[] }>;
export type SessionQuestionReviewResult = { ok: true; detail: SessionQuestionReview }
  | { ok: false; code: "RECONSTRUCTION_FAILED" };

/** Called only on Review. Exam supplies its frozen question; Practice uses the real seed context.
 * Display ordinal is used ONLY for the existing type scheduler's display context.
 * Neither this boundary nor the Reviewer re-grades the historical submission.
 */
export function reconstructSessionReviewQuestion(config: SessionConfig, entry: QuestionReviewEntry,
  generate?: PracticeQuestionGenerator, frozenQuestion?: PracticeQuestion): SessionQuestionReviewResult {
  try {
    const question = frozenQuestion ?? generate?.(config, entry.generationIndex,
      { questionType: entry.questionType, displayIndex: entry.displayOrdinal - 1 });
    if (!question || config.generatorVersion !== entry.generatorVersion
      || question.question.id !== entry.questionId || question.question.seed !== entry.questionSeed
      || question.question.generatorVersion !== entry.generatorVersion || question.category !== entry.category
      || question.reference.structuralIdentity !== entry.structuralIdentity
      || exerciseStructuralIdentity(question.molecule) !== entry.structuralIdentity
      || isMultipleChoiceQuestion(question) !== (entry.questionType === "multiple-choice")
      || isBuildQuestion(question) !== (entry.questionType === "build")) throw new Error("Context mismatch.");
    const studentStructures: { attemptNumber: number; molecule: GeneratedMolecule }[] = [];
    for (const attempt of entry.attempts) {
      validateAttempt(question, attempt);
      if (attempt.questionType === "build") {
        const result = moleculeFromSmiles(attempt.structuralAnswer!.submittedSmiles!);
        if (!result.ok || !matchesRecordedStructure(result.molecule, attempt.structuralAnswer!.submittedIdentity)) throw new Error("Submission mismatch.");
        studentStructures.push({ attemptNumber: attempt.attemptNumber, molecule: result.molecule });
      }
    }
    return { ok: true, detail: { entry, question, studentStructures } };
  } catch { return { ok: false, code: "RECONSTRUCTION_FAILED" }; }
}
function validateAttempt(question: PracticeQuestion, attempt: AttemptRecord) {
  if (attempt.questionId !== question.question.id || attempt.questionSeed !== question.question.seed
    || attempt.generatorVersion !== question.question.generatorVersion || attempt.category !== question.category
    || attempt.structuralIdentity !== question.reference.structuralIdentity) throw new Error("Attempt mismatch.");
  if (isMultipleChoiceQuestion(question)) {
    const selected = question.options.find((option) => option.id === attempt.selectedOptionId);
    if (!validateMultipleChoiceQuestion(question) || attempt.optionSetIdentity !== question.optionSetIdentity
      || !selected || selected.correct !== attempt.correct) throw new Error("Options mismatch.");
  }
  if (isBuildQuestion(question) && (!attempt.structuralAnswer?.checks.submissionValid
    || attempt.structuralAnswer.correct !== attempt.correct || !matchesRecordedStructure(question.molecule, attempt.structuralAnswer.referenceIdentity))) {
    throw new Error("Structural record mismatch.");
  }
}

/** Verify the existing Build snapshot format, which is NOT the generator's OCL IDCode.
 * This checks the saved representation with existing identity/stereo primitives;
 * it never compares student vs target or produces a new grade.
 */
function matchesRecordedStructure(molecule: GeneratedMolecule, identity: string | null): boolean {
  const prefix = `${buildConstitutionalIdentity(molecule)}|ez:`;
  if (!identity?.startsWith(prefix)) return false;
  const descriptor = identity.slice(prefix.length), configured = molecule.bonds.filter((bond) => bond[3]);
  if (descriptor === "unspecified") return configured.length === 0;
  if (configured.length !== 1 || (descriptor !== "E" && descriptor !== "Z")) return false;
  return inspectDoubleBondStereochemistry(molecule, configured[0][0], configured[0][1]).configuration === descriptor;
}
