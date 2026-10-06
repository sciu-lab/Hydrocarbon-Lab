import { EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES, GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty, GeneratorVersion, SessionConfig } from "./exercise-model.ts";
import { evaluateSessionAnswer } from "./session-answer-evaluation.ts";
import { uiText } from "./i18n.ts";
import { isMultipleChoiceQuestion, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion } from "./practice-question.ts";

export const NAMING_ASSESSMENT_COUNTS = Object.freeze([5, 10, 20, 30] as const);
export const DEFAULT_NAMING_CATEGORIES = Object.freeze(["alkane", "alkene", "alkyne"] as const);
export const DEFAULT_MULTIPLE_CHOICE_CATEGORIES = Object.freeze(["alkane", "alkene", "alkyne"] as const);

type AssessmentConfigBase = Readonly<{
  locale: "es" | "en";
  questionCount: typeof NAMING_ASSESSMENT_COUNTS[number];
  difficulty: ExerciseDifficulty;
  categories: readonly ExerciseCategory[];
  seed: string;
  generatorVersion: GeneratorVersion;
}>;

export type NamingAssessmentConfig = AssessmentConfigBase & Readonly<{ questionType: "naming" }>;
export type MultipleChoiceAssessmentConfig = AssessmentConfigBase & Readonly<{ questionType: "multiple-choice" }>;
export type DocxAssessmentConfig = NamingAssessmentConfig | MultipleChoiceAssessmentConfig;

export type DocxPngAsset = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
}>;

type DocxQuestionBase = Readonly<{
  number: number;
  exerciseId: string;
  structuralIdentity: string;
  category: ExerciseCategory;
  difficulty: ExerciseDifficulty;
  generatorVersion: GeneratorVersion;
  prompt: string;
  structure: DocxPngAsset;
}>;

export type DocxNamingQuestion = DocxQuestionBase & Readonly<{
  questionType: "naming";
  referenceAnswer: string;
}>;

export type DocxMcqOption = Readonly<{
  optionId: string;
  text: string;
}>;

export type DocxMultipleChoiceQuestion = DocxQuestionBase & Readonly<{
  questionType: "multiple-choice";
  options: readonly [DocxMcqOption, DocxMcqOption, DocxMcqOption, DocxMcqOption];
  correctOptionIndex: number;
  referenceAnswer: string;
}>;

export type DocxQuestion = DocxNamingQuestion | DocxMultipleChoiceQuestion;

type DocxAssessmentBase = Readonly<{
  title: string;
  locale: DocxAssessmentConfig["locale"];
}>;

type DocxAssessmentMetadataBase = Readonly<{
  seed: string;
  locale: DocxAssessmentConfig["locale"];
  generatorVersion: GeneratorVersion;
  difficulty: ExerciseDifficulty;
  categories: readonly ExerciseCategory[];
  questionCount: DocxAssessmentConfig["questionCount"];
}>;

export type DocxNamingAssessment = DocxAssessmentBase & Readonly<{
  metadata: DocxAssessmentMetadataBase & Readonly<{ questionType: "naming" }>;
  questions: readonly DocxNamingQuestion[];
}>;

export type DocxMultipleChoiceAssessment = DocxAssessmentBase & Readonly<{
  metadata: DocxAssessmentMetadataBase & Readonly<{ questionType: "multiple-choice" }>;
  questions: readonly DocxMultipleChoiceQuestion[];
}>;

export type DocxAssessment = DocxNamingAssessment | DocxMultipleChoiceAssessment;

export type DocxAssessmentConfigInput = Readonly<{
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

export function createNamingAssessmentConfig(input: DocxAssessmentConfigInput): NamingAssessmentConfig {
  if (input.questionType !== undefined && input.questionType !== "naming") {
    throw new TypeError("Naming assessment configuration requires questionType 'naming'.");
  }
  return normalizeDocxAssessmentConfig({ ...input, questionType: "naming" }) as NamingAssessmentConfig;
}

export function createMultipleChoiceAssessmentConfig(input: DocxAssessmentConfigInput): MultipleChoiceAssessmentConfig {
  if (input.questionType !== undefined && input.questionType !== "multiple-choice") {
    throw new TypeError("Multiple Choice assessment configuration requires questionType 'multiple-choice'.");
  }
  return normalizeDocxAssessmentConfig({ ...input, questionType: "multiple-choice" }) as MultipleChoiceAssessmentConfig;
}

export function normalizeNamingAssessmentConfig(value: unknown): NamingAssessmentConfig {
  const config = normalizeDocxAssessmentConfig(value);
  if (config.questionType !== "naming") throw new TypeError("Expected a Naming assessment configuration.");
  return config;
}

export function normalizeMultipleChoiceAssessmentConfig(value: unknown): MultipleChoiceAssessmentConfig {
  const config = normalizeDocxAssessmentConfig(value);
  if (config.questionType !== "multiple-choice") throw new TypeError("Expected a Multiple Choice assessment configuration.");
  return config;
}

export function normalizeDocxAssessmentConfig(value: unknown): DocxAssessmentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("DOCX assessment configuration must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !configFields.includes(key))) {
    throw new TypeError("Unexpected DOCX assessment configuration field.");
  }
  if (typeof input.seed !== "string" || input.seed.trim().length === 0) {
    throw new TypeError("A nonempty seed is required for a DOCX assessment.");
  }
  const questionCount = input.questionCount === undefined ? 10 : input.questionCount;
  if (!NAMING_ASSESSMENT_COUNTS.includes(questionCount as typeof NAMING_ASSESSMENT_COUNTS[number])) {
    throw new RangeError("questionCount must be one of 5, 10, 20, or 30.");
  }
  const questionType = input.questionType === undefined ? "naming" : input.questionType;
  if (questionType !== "naming" && questionType !== "multiple-choice") {
    throw new TypeError("DOCX supports Naming or Multiple Choice assessments.");
  }
  if (input.generatorVersion !== undefined && input.generatorVersion !== GENERATOR_VERSION) {
    throw new RangeError(`DOCX assessments require the current generatorVersion ${GENERATOR_VERSION}.`);
  }
  const defaultCategories = questionType === "naming" ? DEFAULT_NAMING_CATEGORIES : DEFAULT_MULTIPLE_CHOICE_CATEGORIES;
  const categories = input.categories === undefined ? [...defaultCategories] : input.categories;
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
    questionTypes: [questionType],
    categories,
    difficulty,
    locale,
    seed: input.seed,
    generatorVersion: GENERATOR_VERSION,
  });
  return Object.freeze({
    locale: session.locale,
    questionCount: session.questionCount as DocxAssessmentConfig["questionCount"],
    difficulty: session.difficulty,
    categories: Object.freeze([...session.categories]),
    seed: session.seed,
    questionType,
    generatorVersion: session.generatorVersion,
  }) as DocxAssessmentConfig;
}

export function docxAssessmentSessionConfig(config: DocxAssessmentConfig): SessionConfig {
  return normalizeSessionConfig({
    mode: "practice",
    questionCount: config.questionCount,
    questionTypes: [config.questionType],
    categories: config.categories,
    difficulty: config.difficulty,
    locale: config.locale,
    seed: config.seed,
    generatorVersion: config.generatorVersion,
  });
}

export function namingAssessmentSessionConfig(config: NamingAssessmentConfig): SessionConfig {
  return docxAssessmentSessionConfig(config);
}

export function multipleChoiceAssessmentSessionConfig(config: MultipleChoiceAssessmentConfig): SessionConfig {
  return docxAssessmentSessionConfig(config);
}

function validPngAsset(asset: DocxPngAsset | undefined, index: number): asserts asset is DocxPngAsset {
  if (!asset || !(asset.data instanceof Uint8Array) || asset.data.length <= pngSignature.length
    || !pngSignature.every((byte, signatureIndex) => asset.data[signatureIndex] === byte)
    || !Number.isSafeInteger(asset.width) || asset.width <= 0
    || !Number.isSafeInteger(asset.height) || asset.height <= 0) {
    throw new TypeError(`Question ${index + 1} is missing a valid PNG structure asset.`);
  }
}

function validateQuestionMetadata(question: PracticeQuestion, config: DocxAssessmentConfig) {
  if (question.question.generatorVersion !== config.generatorVersion || !config.categories.includes(question.category)) {
    throw new TypeError("Question metadata does not match the configured generator version or categories.");
  }
  const exerciseId = question.question.id;
  const structuralIdentity = question.reference.structuralIdentity;
  if (typeof exerciseId !== "string" || !exerciseId || typeof structuralIdentity !== "string" || !structuralIdentity) {
    throw new TypeError("Questions must include exercise and structural identities.");
  }
  return { exerciseId, structuralIdentity };
}

function makeBaseQuestion(question: PracticeQuestion, config: DocxAssessmentConfig, index: number,
  asset: DocxPngAsset, prompt: string): DocxQuestionBase {
  const { exerciseId, structuralIdentity } = validateQuestionMetadata(question, config);
  return Object.freeze({
    number: index + 1,
    exerciseId,
    structuralIdentity,
    category: question.category,
    difficulty: config.difficulty,
    generatorVersion: question.question.generatorVersion,
    prompt,
    structure: Object.freeze({ data: new Uint8Array(asset.data), width: asset.width, height: asset.height }),
  });
}

function localizedReference(question: PracticeQuestion, config: DocxAssessmentConfig, index: number) {
  const answer = question.reference.names?.[config.locale];
  if (typeof answer !== "string" || !answer.trim()) {
    throw new TypeError(`Question ${index + 1} has no ${config.locale} reference answer.`);
  }
  return answer;
}

function createNamingQuestion(question: PracticeQuestion, config: NamingAssessmentConfig, index: number,
  asset: DocxPngAsset): DocxNamingQuestion {
  if (question.type === "build" || question.type === "multiple-choice") {
    throw new TypeError("Naming assessments can contain Naming questions only.");
  }
  const referenceAnswer = localizedReference(question, config, index);
  const prompt = config.locale === "en" ? "Name the following structure." : "Nombra la siguiente estructura.";
  return Object.freeze({ ...makeBaseQuestion(question, config, index, asset, prompt), questionType: "naming", referenceAnswer });
}

function createMcqQuestion(question: PracticeQuestion, config: MultipleChoiceAssessmentConfig, index: number,
  asset: DocxPngAsset): DocxMultipleChoiceQuestion {
  if (!isMultipleChoiceQuestion(question) || !validateMultipleChoiceQuestion(question)) {
    throw new TypeError(`Question ${index + 1} is not a valid real Multiple Choice question.`);
  }
  const referenceAnswer = localizedReference(question, config, index);
  const accepted = question.options.map((option) => {
    const result = evaluateSessionAnswer(question, option.id, config.locale);
    if (!result.ok || result.selectedOptionId !== option.id || result.answer !== option.name[config.locale]) {
      throw new TypeError(`Question ${index + 1} contains an option that the real evaluator cannot evaluate.`);
    }
    return result.correct;
  });
  const correctIndices = accepted.flatMap((correct, optionIndex) => correct ? [optionIndex] : []);
  if (correctIndices.length !== 1 || question.options[correctIndices[0]].id !== question.correctOptionId
    || question.options[correctIndices[0]].kind !== "reference") {
    throw new TypeError(`Question ${index + 1} must have exactly one evaluator-accepted option matching its engine identity.`);
  }
  const options = question.options.map((option) => Object.freeze({ optionId: option.id, text: option.name[config.locale] })) as
    unknown as DocxMultipleChoiceQuestion["options"];
  if (new Set(options.map(({ optionId }) => optionId)).size !== 4
    || new Set(options.map(({ text }) => text)).size !== 4) {
    throw new TypeError(`Question ${index + 1} must contain four unique alternatives in their engine order.`);
  }
  const prompt = uiText(config.locale, "¿Cuál es el nombre IUPAC correcto?");
  return Object.freeze({ ...makeBaseQuestion(question, config, index, asset, prompt), questionType: "multiple-choice",
    options: Object.freeze(options) as DocxMultipleChoiceQuestion["options"], correctOptionIndex: correctIndices[0], referenceAnswer });
}

export function createDocxAssessmentModel(input: Readonly<{
  config: DocxAssessmentConfig;
  questions: readonly PracticeQuestion[];
  structureAssets: readonly DocxPngAsset[];
  title?: string;
}>): DocxAssessment {
  const config = normalizeDocxAssessmentConfig(input.config);
  if (input.questions.length !== config.questionCount || input.structureAssets.length !== config.questionCount) {
    throw new RangeError("The assessment needs exactly one selected question and PNG asset per configured question.");
  }
  const defaultTitle = config.questionType === "naming"
    ? config.locale === "en" ? "Organic Nomenclature" : "Nomenclatura orgánica"
    : config.locale === "en" ? "IUPAC Multiple Choice" : "Opción múltiple de nomenclatura IUPAC";
  const title = input.title ?? defaultTitle;
  if (typeof title !== "string" || !title.trim()) throw new TypeError("Assessment title must be nonempty.");

  const identities = new Set<string>();
  const questions = input.questions.map((question, index) => {
    const asset = input.structureAssets[index];
    validPngAsset(asset, index);
    const docQuestion = config.questionType === "naming"
      ? createNamingQuestion(question, config, index, asset)
      : createMcqQuestion(question, config, index, asset);
    if (identities.has(docQuestion.structuralIdentity)) throw new TypeError("Assessment questions must have unique structural identities.");
    identities.add(docQuestion.structuralIdentity);
    return docQuestion;
  });

  const metadata = Object.freeze({
    seed: config.seed,
    locale: config.locale,
    generatorVersion: config.generatorVersion,
    difficulty: config.difficulty,
    categories: Object.freeze([...config.categories]),
    questionCount: config.questionCount,
    questionType: config.questionType,
  });
  return Object.freeze({ title, locale: config.locale, metadata, questions: Object.freeze(questions) }) as DocxAssessment;
}

export function namingAssessmentFilename(audience: "student" | "teacher"): string {
  if (audience !== "student" && audience !== "teacher") throw new TypeError("Invalid assessment audience.");
  return `hydrocarbon-lab-naming-${audience}.docx`;
}

export function multipleChoiceAssessmentFilename(audience: "student" | "teacher"): string {
  if (audience !== "student" && audience !== "teacher") throw new TypeError("Invalid assessment audience.");
  return `hydrocarbon-lab-mcq-${audience}.docx`;
}
