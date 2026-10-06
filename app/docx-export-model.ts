import { EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES, GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty, GeneratorVersion, SessionConfig } from "./exercise-model.ts";
import type { PracticeQuestion } from "./practice-question.ts";

export const NAMING_ASSESSMENT_COUNTS = Object.freeze([5, 10, 20, 30] as const);
export const DEFAULT_NAMING_CATEGORIES = Object.freeze(["alkane", "alkene", "alkyne"] as const);

export type NamingAssessmentConfig = Readonly<{
  locale: "es" | "en";
  questionCount: typeof NAMING_ASSESSMENT_COUNTS[number];
  difficulty: ExerciseDifficulty;
  categories: readonly ExerciseCategory[];
  seed: string;
  questionType: "naming";
  generatorVersion: GeneratorVersion;
}>;

export type DocxPngAsset = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
}>;

export type DocxQuestion = Readonly<{
  number: number;
  questionType: "naming";
  exerciseId: string;
  structuralIdentity: string;
  category: ExerciseCategory;
  difficulty: ExerciseDifficulty;
  generatorVersion: GeneratorVersion;
  prompt: string;
  structure: DocxPngAsset;
  referenceAnswer: string;
}>;

export type DocxAssessment = Readonly<{
  title: string;
  locale: NamingAssessmentConfig["locale"];
  metadata: Readonly<{
    seed: string;
    locale: NamingAssessmentConfig["locale"];
    generatorVersion: GeneratorVersion;
    difficulty: ExerciseDifficulty;
    categories: readonly ExerciseCategory[];
    questionCount: NamingAssessmentConfig["questionCount"];
    questionType: "naming";
  }>;
  questions: readonly DocxQuestion[];
}>;

export type NamingAssessmentConfigInput = Readonly<{
  seed: string;
  locale?: "es" | "en";
  questionCount?: number;
  difficulty?: ExerciseDifficulty;
  categories?: readonly ExerciseCategory[];
  questionType?: string;
  generatorVersion?: number;
}>;

const configFields = ["seed", "locale", "questionCount", "difficulty", "categories", "questionType", "generatorVersion"];
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function createNamingAssessmentConfig(input: NamingAssessmentConfigInput): NamingAssessmentConfig {
  return normalizeNamingAssessmentConfig(input);
}

export function normalizeNamingAssessmentConfig(value: unknown): NamingAssessmentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Naming assessment configuration must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !configFields.includes(key))) {
    throw new TypeError("Unexpected Naming assessment configuration field.");
  }
  if (typeof input.seed !== "string" || input.seed.trim().length === 0) {
    throw new TypeError("A nonempty seed is required for a Naming assessment.");
  }
  const questionCount = input.questionCount === undefined ? 10 : input.questionCount;
  if (!NAMING_ASSESSMENT_COUNTS.includes(questionCount as typeof NAMING_ASSESSMENT_COUNTS[number])) {
    throw new RangeError("questionCount must be one of 5, 10, 20, or 30.");
  }
  const questionType = input.questionType === undefined ? "naming" : input.questionType;
  if (questionType !== "naming") throw new TypeError("DOCX-1 supports Naming questions only.");
  if (input.generatorVersion !== undefined && input.generatorVersion !== GENERATOR_VERSION) {
    throw new RangeError(`DOCX-1 requires the current generatorVersion ${GENERATOR_VERSION}.`);
  }
  const categories = input.categories === undefined ? [...DEFAULT_NAMING_CATEGORIES] : input.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new TypeError("At least one canonical category ID is required.");
  }
  if (new Set(categories).size !== categories.length) {
    throw new TypeError("Category IDs must be unique.");
  }
  const locale = input.locale === undefined ? "en" : input.locale;
  if (locale !== "en" && locale !== "es") throw new TypeError("locale must be 'en' or 'es'.");
  const difficulty = input.difficulty === undefined ? "basic" : input.difficulty;
  if (!EXERCISE_DIFFICULTIES.includes(difficulty as ExerciseDifficulty)) {
    throw new TypeError("difficulty must be one of the canonical difficulty IDs.");
  }
  if (!categories.every((category) => typeof category === "string" && EXERCISE_CATEGORIES.includes(category as ExerciseCategory))) {
    throw new TypeError("categories must contain canonical category IDs.");
  }

  const session = normalizeSessionConfig({
    mode: "practice",
    questionCount,
    questionTypes: ["naming"],
    categories,
    difficulty,
    locale,
    seed: input.seed,
    generatorVersion: GENERATOR_VERSION,
  });
  return Object.freeze({
    locale: session.locale,
    questionCount: session.questionCount as NamingAssessmentConfig["questionCount"],
    difficulty: session.difficulty,
    categories: Object.freeze([...session.categories]),
    seed: session.seed,
    questionType: "naming",
    generatorVersion: session.generatorVersion,
  });
}

export function namingAssessmentSessionConfig(config: NamingAssessmentConfig): SessionConfig {
  return normalizeSessionConfig({
    mode: "practice",
    questionCount: config.questionCount,
    questionTypes: ["naming"],
    categories: config.categories,
    difficulty: config.difficulty,
    locale: config.locale,
    seed: config.seed,
    generatorVersion: config.generatorVersion,
  });
}

export function createDocxAssessmentModel(input: Readonly<{
  config: NamingAssessmentConfig;
  questions: readonly PracticeQuestion[];
  structureAssets: readonly DocxPngAsset[];
  title?: string;
}>): DocxAssessment {
  const config = normalizeNamingAssessmentConfig(input.config);
  if (input.questions.length !== config.questionCount || input.structureAssets.length !== config.questionCount) {
    throw new RangeError("The assessment needs exactly one selected question and PNG asset per configured question.");
  }
  const title = input.title ?? (config.locale === "en" ? "Organic Nomenclature" : "Nomenclatura orgánica");
  if (typeof title !== "string" || !title.trim()) throw new TypeError("Assessment title must be nonempty.");

  const identities = new Set<string>();
  const docQuestions = input.questions.map((question, index): DocxQuestion => {
    if (question.type === "build" || question.type === "multiple-choice") {
      throw new TypeError("DOCX-1 supports Naming questions only.");
    }
    if (question.question.generatorVersion !== config.generatorVersion
      || !config.categories.includes(question.category)) {
      throw new TypeError("Question metadata does not match the configured generator version or categories.");
    }
    const exerciseId = question.question.id;
    const structuralIdentity = question.reference.structuralIdentity;
    if (typeof exerciseId !== "string" || !exerciseId || typeof structuralIdentity !== "string" || !structuralIdentity) {
      throw new TypeError("Naming questions must include exercise and structural identities.");
    }
    if (identities.has(structuralIdentity)) throw new TypeError("Assessment questions must have unique structural identities.");
    identities.add(structuralIdentity);

    const asset = input.structureAssets[index];
    if (!(asset.data instanceof Uint8Array) || asset.data.length <= pngSignature.length
      || !pngSignature.every((byte, signatureIndex) => asset.data[signatureIndex] === byte)
      || !Number.isSafeInteger(asset.width) || asset.width <= 0
      || !Number.isSafeInteger(asset.height) || asset.height <= 0) {
      throw new TypeError(`Question ${index + 1} is missing a valid PNG structure asset.`);
    }
    const referenceAnswer = question.reference.names?.[config.locale];
    if (typeof referenceAnswer !== "string" || !referenceAnswer.trim()) {
      throw new TypeError(`Question ${index + 1} has no ${config.locale} reference answer.`);
    }
    const prompt = config.locale === "en" ? "Name the following structure." : "Nombra la siguiente estructura.";
    return Object.freeze({
      number: index + 1,
      questionType: "naming",
      exerciseId,
      structuralIdentity,
      category: question.category,
      difficulty: config.difficulty,
      generatorVersion: question.question.generatorVersion,
      prompt,
      structure: Object.freeze({ data: new Uint8Array(asset.data), width: asset.width, height: asset.height }),
      referenceAnswer,
    });
  });

  return Object.freeze({
    title,
    locale: config.locale,
    metadata: Object.freeze({
      seed: config.seed,
      locale: config.locale,
      generatorVersion: config.generatorVersion,
      difficulty: config.difficulty,
      categories: Object.freeze([...config.categories]),
      questionCount: config.questionCount,
      questionType: "naming",
    }),
    questions: Object.freeze(docQuestions),
  });
}

export function namingAssessmentFilename(audience: "student" | "teacher"): string {
  if (audience !== "student" && audience !== "teacher") throw new TypeError("Invalid assessment audience.");
  return `hydrocarbon-lab-naming-${audience}.docx`;
}
