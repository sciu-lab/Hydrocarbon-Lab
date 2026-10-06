import { selectSessionQuestion } from "./session-question-selection.ts";
import { isMultipleChoiceQuestion, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion, PracticeQuestionGenerator } from "./practice-question.ts";
import { docxAssessmentSessionConfig } from "./docx-export-model.ts";
import type { DocxAssessmentConfig, MultipleChoiceAssessmentConfig, NamingAssessmentConfig } from "./docx-export-model.ts";

function selectQuestions(config: DocxAssessmentConfig, generate: PracticeQuestionGenerator): readonly PracticeQuestion[] {
  const sessionConfig = docxAssessmentSessionConfig(config);
  const questions: PracticeQuestion[] = [];
  let generationIndex = 0;
  let recentIdentities: readonly string[] = [];
  let usedExerciseKeys: readonly string[] = [];
  for (let index = 0; index < config.questionCount; index += 1) {
    const selected = selectSessionQuestion({ config: sessionConfig, index, generationIndex, recentIdentities, usedExerciseKeys }, generate);
    if (!selected.ok) {
      throw new Error(`Could not select ${config.questionType} question ${index + 1}: ${selected.reason ?? "invalid generated question"}.`);
    }
    if (config.questionType === "naming") {
      if (selected.question.type === "build" || selected.question.type === "multiple-choice") {
        throw new TypeError("The question generator returned a non-Naming question.");
      }
    } else if (!isMultipleChoiceQuestion(selected.question) || !validateMultipleChoiceQuestion(selected.question)) {
      throw new TypeError("The question generator returned an invalid Multiple Choice question.");
    }
    questions.push(selected.question);
    generationIndex = selected.generationIndex + 1;
    recentIdentities = selected.recentIdentities;
    usedExerciseKeys = selected.usedExerciseKeys;
  }
  return Object.freeze(questions);
}

/** Uses Practice's established seeded category/type and duplicate selection before document modeling. */
export function selectNamingAssessmentQuestions(config: NamingAssessmentConfig,
  generate: PracticeQuestionGenerator): readonly PracticeQuestion[] {
  return selectQuestions(config, generate);
}

/** MCQs are selected from the same production Exercise Engine path as Practice. */
export function selectMultipleChoiceAssessmentQuestions(config: MultipleChoiceAssessmentConfig,
  generate: PracticeQuestionGenerator): readonly PracticeQuestion[] {
  return selectQuestions(config, generate);
}
