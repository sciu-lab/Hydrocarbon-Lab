import { EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import { resolvePracticeSeed } from "./practice-session.ts";
import type { DocxAssessmentConfigInput } from "./docx-export-model.ts";
import type { WorksheetOutput } from "./docx-browser-export.ts";

export const DOCX_EXPORT_QUESTION_COUNTS = Object.freeze([5, 10, 20, 30] as const);
export type DocxExportQuestionType = "naming" | "multiple-choice";
export type DocxExportQuestionCount = typeof DOCX_EXPORT_QUESTION_COUNTS[number];

export type DocxExportUiSettings = Readonly<{
  questionType: DocxExportQuestionType;
  questionCount: DocxExportQuestionCount;
  difficulty: ExerciseDifficulty;
  categories: readonly ExerciseCategory[];
  documentLanguage: AppLanguage;
  seed: string;
  output: WorksheetOutput;
}>;

export function createDefaultDocxExportUiSettings(language: AppLanguage): DocxExportUiSettings {
  return Object.freeze({ questionType: "naming", questionCount: 10, difficulty: "basic",
    categories: Object.freeze([...EXERCISE_CATEGORIES]), documentLanguage: language, seed: "", output: "both" });
}

/** UI-only values are mapped to the exact core IDs and one stable seed at the request boundary. */
export function createDocxExportRequest(settings: DocxExportUiSettings, createPublicSeed: () => string): Readonly<{
  config: DocxAssessmentConfigInput;
  output: WorksheetOutput;
  generatedSeed: boolean;
}> {
  if (!DOCX_EXPORT_QUESTION_COUNTS.includes(settings.questionCount)) throw new RangeError("Unsupported worksheet question count.");
  if (settings.questionType !== "naming" && settings.questionType !== "multiple-choice") throw new TypeError("Unsupported worksheet question type.");
  if (!EXERCISE_DIFFICULTIES.includes(settings.difficulty)) throw new TypeError("Unsupported worksheet Difficulty.");
  if (settings.categories.length === 0 || settings.categories.some((category) => !EXERCISE_CATEGORIES.includes(category))) {
    throw new TypeError("Select one or more supported worksheet categories.");
  }
  if (settings.documentLanguage !== "es" && settings.documentLanguage !== "en") throw new TypeError("Unsupported worksheet document language.");
  if (settings.output !== "student" && settings.output !== "teacher" && settings.output !== "both") throw new TypeError("Unsupported worksheet output.");
  const generatedSeed = settings.seed.trim() === "";
  const seed = resolvePracticeSeed(generatedSeed ? "" : settings.seed, createPublicSeed);
  return Object.freeze({
    config: Object.freeze({ questionType: settings.questionType, questionCount: settings.questionCount,
      difficulty: settings.difficulty, categories: Object.freeze([...settings.categories]),
      locale: settings.documentLanguage, seed }),
    output: settings.output,
    generatedSeed,
  });
}
