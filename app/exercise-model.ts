import type { AppLanguage } from "./i18n";

/** Changes to RNG, seed framing, canonicalization or generation require a new version. */
export const GENERATOR_VERSION = 1;
export type GeneratorVersion = typeof GENERATOR_VERSION;

export type ExerciseMode = "practice" | "exam";

export const QUESTION_TYPES = Object.freeze(["naming", "multiple-choice", "build"] as const);
export type QuestionType = typeof QUESTION_TYPES[number];

export const EXERCISE_CATEGORIES = Object.freeze([
  "alkane", "alkene", "alkyne", "halogenated", "alcohol", "aldehyde", "ketone",
  "carboxylic-acid", "ether", "ester", "amine", "amide", "simple-carbocycle",
  "aromatic", "ez", "nitrile", "nitro",
] as const);
export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number];

export const EXERCISE_DIFFICULTIES = Object.freeze(["basic", "intermediate", "advanced"] as const);
export type ExerciseDifficulty = typeof EXERCISE_DIFFICULTIES[number];

type SessionSelection = Readonly<{
  questionTypes: readonly QuestionType[];
  categories: readonly ExerciseCategory[];
  difficulty: ExerciseDifficulty;
  locale: AppLanguage;
  seed: string;
  generatorVersion: GeneratorVersion;
}>;

export type SessionConfig = SessionSelection & (
  | Readonly<{ mode: "practice"; questionCount: number | "endless" }>
  | Readonly<{ mode: "exam"; questionCount: number }>
);

/** Exercise identity only; it is unrelated to atom IDs or chemical identity. */
export type QuestionIdentity = Readonly<{
  id: string;
  seed: string;
  generatorVersion: GeneratorVersion;
}>;

export type QuestionMetadata = QuestionIdentity & Readonly<{
  category: ExerciseCategory;
  difficulty: ExerciseDifficulty;
}>;

export type NamingQuestion = QuestionMetadata & Readonly<{ type: "naming" }>;
export type MultipleChoiceQuestion = QuestionMetadata & Readonly<{ type: "multiple-choice" }>;
export type BuildQuestion = QuestionMetadata & Readonly<{ type: "build" }>;
export type Question = NamingQuestion | MultipleChoiceQuestion | BuildQuestion;

const configKeys = [
  "mode", "questionCount", "questionTypes", "categories", "difficulty", "locale", "seed", "generatorVersion",
];

function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`Invalid ${field}.`);
  }
  return value as T;
}

function selection<T extends string>(value: unknown, allowed: readonly T[], field: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${field} must be a nonempty array.`);
  }
  const selected = new Set<T>();
  for (const entry of value) selected.add(choice(entry, allowed, field));
  return allowed.filter((entry) => selected.has(entry));
}

/** Validates configuration IDs and scalars only; it does not validate chemistry. */
export function normalizeSessionConfig(value: unknown): SessionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A session configuration must be an object.");
  }
  if (Object.keys(value).some((key) => !configKeys.includes(key))) {
    throw new TypeError("Unexpected session configuration field.");
  }
  const config = value as Record<string, unknown>;
  const mode = choice(config.mode, ["practice", "exam"], "mode");
  const questionCount = config.questionCount;
  if (questionCount !== "endless" && (typeof questionCount !== "number"
    || !Number.isSafeInteger(questionCount) || questionCount < 1)) {
    throw new RangeError("questionCount must be a positive safe integer or endless for practice.");
  }
  if (typeof config.seed !== "string" || config.seed.length === 0) {
    throw new TypeError("A seed must be a nonempty string.");
  }
  if (config.generatorVersion !== GENERATOR_VERSION) {
    throw new RangeError("Unsupported generatorVersion.");
  }

  const common: SessionSelection = {
    questionTypes: selection(config.questionTypes, QUESTION_TYPES, "questionTypes"),
    categories: selection(config.categories, EXERCISE_CATEGORIES, "categories"),
    difficulty: choice(config.difficulty, EXERCISE_DIFFICULTIES, "difficulty"),
    locale: choice(config.locale, ["en", "es"], "locale"),
    seed: config.seed,
    generatorVersion: GENERATOR_VERSION,
  };

  if (mode === "exam") {
    if (questionCount === "endless") {
      throw new RangeError("Exam configurations require a finite questionCount.");
    }
    return { mode, questionCount, ...common };
  }
  return { mode, questionCount, ...common };
}

/** v1 fixes key order above and catalog order for set-like arrays; no locale sorting. */
export function serializeSessionConfig(config: SessionConfig): string {
  return JSON.stringify(normalizeSessionConfig(config));
}
