import type { AppLanguage } from "./i18n.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { isBuildQuestion, isMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion } from "./practice-question.ts";
import { matchesHydrocarbonReferenceName } from "./practice-reference-answer.ts";
import type { StructuralAnswerEvaluator, StructuralEvaluation } from "./practice-structural-answer.ts";

export type SessionAnswerEvaluation =
  | { ok: false; reason: "INCOMPLETE" | "INVALID_SUBMISSION" | "UNSUPPORTED_COMPARISON" }
  | { ok: true; answer: string; correct: boolean; selectedOptionId?: string; structuralAnswer?: StructuralEvaluation };

/** One grading boundary. Naming questions must be localized before evaluation;
 * reference.name is the exact answer projection shown to the student.
 * Policies decide when this boundary may be invoked.
 */
export function evaluateSessionAnswer(question: PracticeQuestion, answer: string, locale: AppLanguage,
  studentMolecule?: GeneratedMolecule, evaluateStructure?: StructuralAnswerEvaluator): SessionAnswerEvaluation {
  if (isBuildQuestion(question)) {
    if (!studentMolecule || !evaluateStructure) return { ok: false, reason: "INCOMPLETE" };
    try {
      const structuralAnswer = evaluateStructure({ referenceMolecule: question.molecule, submittedMolecule: studentMolecule, category: question.category });
      if (structuralAnswer.status === "INVALID_SUBMISSION" || structuralAnswer.status === "UNSUPPORTED_COMPARISON") {
        return { ok: false, reason: structuralAnswer.status };
      }
      if (!structuralAnswer.checks.submissionValid || !structuralAnswer.submittedSmiles) return { ok: false, reason: "UNSUPPORTED_COMPARISON" };
      return { ok: true, answer: structuralAnswer.submittedSmiles, correct: structuralAnswer.correct, structuralAnswer };
    } catch { return { ok: false, reason: "UNSUPPORTED_COMPARISON" }; }
  }
  if (isMultipleChoiceQuestion(question)) {
    const selected = question.options.find((option) => option.id === answer);
    return selected ? { ok: true, answer: selected.name[locale], correct: selected.correct, selectedOptionId: selected.id }
      : { ok: false, reason: "INCOMPLETE" };
  }
  return answer.trim() ? { ok: true, answer, correct: matchesHydrocarbonReferenceName(answer, question.reference.name, locale) }
    : { ok: false, reason: "INCOMPLETE" };
}
