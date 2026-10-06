import { selectSessionQuestion } from "./session-question-selection.ts";
import type { PracticeQuestion, PracticeQuestionGenerator } from "./practice-question.ts";
import { namingAssessmentSessionConfig } from "./docx-export-model.ts";
import type { NamingAssessmentConfig } from "./docx-export-model.ts";

/** Uses Practice's established seeded category/type and duplicate selection before document modeling. */
export function selectNamingAssessmentQuestions(config: NamingAssessmentConfig,
  generate: PracticeQuestionGenerator): readonly PracticeQuestion[] {
  const sessionConfig = namingAssessmentSessionConfig(config);
  const questions: PracticeQuestion[] = [];
  let generationIndex = 0;
  let recentIdentities: readonly string[] = [];
  let usedExerciseKeys: readonly string[] = [];
  for (let index = 0; index < config.questionCount; index += 1) {
    const selected = selectSessionQuestion({ config: sessionConfig, index, generationIndex, recentIdentities, usedExerciseKeys }, generate);
    if (!selected.ok) {
      throw new Error(`Could not select Naming question ${index + 1}: ${selected.reason ?? "invalid generated question"}.`);
    }
    if (selected.question.type === "build" || selected.question.type === "multiple-choice") {
      throw new TypeError("The question generator returned a non-Naming question.");
    }
    questions.push(selected.question);
    generationIndex = selected.generationIndex + 1;
    recentIdentities = selected.recentIdentities;
    usedExerciseKeys = selected.usedExerciseKeys;
  }
  return Object.freeze(questions);
}
