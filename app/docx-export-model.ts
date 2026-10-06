import type { ExerciseCategory, ExerciseDifficulty, SessionConfig } from "./exercise-model.ts";
import type { PracticeQuestion } from "./practice-question.ts";
import { uiText } from "./i18n.ts";

export type DocxPngAsset = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
  altText: string;
}>;

export type DocxQuestion = Readonly<{
  number: number;
  questionType: "naming";
  category: ExerciseCategory;
  difficulty: ExerciseDifficulty;
  generatorVersion: number;
  prompt: string;
  structure: DocxPngAsset;
  referenceAnswer: string;
}>;

export type DocxAssessment = Readonly<{
  title: string;
  locale: SessionConfig["locale"];
  metadata: Readonly<{
    seed: string;
    generatorVersion: SessionConfig["generatorVersion"];
    difficulty: SessionConfig["difficulty"];
    categories: readonly ExerciseCategory[];
  }>;
  questions: readonly DocxQuestion[];
  includeAnswerKey: boolean;
}>;

export function createDocxAssessmentModel(input: Readonly<{
  config: SessionConfig;
  questions: readonly PracticeQuestion[];
  structureAssets: readonly DocxPngAsset[];
  title?: string;
  includeAnswerKey?: boolean;
}>): DocxAssessment {
  const { config, questions, structureAssets } = input;
  if (config.questionTypes.length !== 1 || config.questionTypes[0] !== "naming") {
    throw new TypeError("DOCX-0 supports Naming questions only.");
  }
  if (questions.length === 0 || questions.length !== structureAssets.length) {
    throw new RangeError("Every document question needs one structure image.");
  }

  const locale = config.locale;
  const prompt = uiText(locale, "¿Cuál es el nombre IUPAC?");
  const title = input.title ?? (locale === "en"
    ? "Hydrocarbon Lab — Organic Nomenclature"
    : "Hydrocarbon Lab — Nomenclatura orgánica");

  const docQuestions = questions.map((question, index): DocxQuestion => {
    if (question.type === "build" || question.type === "multiple-choice") {
      throw new TypeError("DOCX-0 supports Naming questions only.");
    }
    if (question.question.generatorVersion !== config.generatorVersion
      || !config.categories.includes(question.category)) {
      throw new TypeError("Question metadata does not match its session configuration.");
    }
    const asset = structureAssets[index];
    if (!(asset.data instanceof Uint8Array) || asset.data.length === 0
      || !Number.isFinite(asset.width) || asset.width <= 0
      || !Number.isFinite(asset.height) || asset.height <= 0) {
      throw new TypeError("Invalid PNG structure asset.");
    }
    const referenceAnswer = question.reference.names[locale];
    if (!referenceAnswer.trim()) throw new TypeError("Naming question has no reference answer.");
    return Object.freeze({
      number: index + 1,
      questionType: "naming",
      category: question.category,
      difficulty: question.question.difficulty,
      generatorVersion: question.question.generatorVersion,
      prompt,
      structure: Object.freeze({
        ...asset,
        data: new Uint8Array(asset.data),
      }),
      referenceAnswer,
    });
  });

  return Object.freeze({
    title,
    locale,
    metadata: Object.freeze({
      seed: config.seed,
      generatorVersion: config.generatorVersion,
      difficulty: config.difficulty,
      categories: Object.freeze([...config.categories]),
    }),
    questions: Object.freeze(docQuestions),
    includeAnswerKey: input.includeAnswerKey ?? true,
  });
}
