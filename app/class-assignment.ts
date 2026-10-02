import { EXERCISE_CATEGORIES, GENERATOR_VERSION, QUESTION_TYPES, isFiniteQuestionCount,
  normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseMode, QuestionType, SessionConfig } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import { deriveSeed } from "./seeded-rng.ts";

export const CLASS_SCHEMA_VERSION = 1;
export const CLASS_DERIVATION_VERSION = 1;
// Materialization guards, not pedagogical limits. Preview never builds sessions.
export const MAX_CLASS_PARTICIPANTS = 100_000;
export const MAX_CLASS_MANIFEST_CHARACTERS = 16_000_000;

export type ClassAssignmentConfig = Readonly<{
  schemaVersion: typeof CLASS_SCHEMA_VERSION;
  derivationVersion: typeof CLASS_DERIVATION_VERSION;
  classSeed: string;
  mode: ExerciseMode;
  questionCount: number;
  categories: readonly ExerciseCategory[];
  questionTypes: readonly QuestionType[];
  generatorVersion: number;
}>;
export type ParticipantAssignment = Readonly<{
  participantId: string;
  sessionSeed: string;
  configFingerprint: string;
}>;
export type ClassAssignmentManifest = Readonly<{
  config: ClassAssignmentConfig;
  participants: readonly ParticipantAssignment[];
}>;
export type ClassSessionSelection = Readonly<{
  mode: ExerciseMode;
  questionCount: number | "endless" | null;
  categories: readonly ExerciseCategory[];
  questionTypes: readonly QuestionType[];
}>;
export type ClassAssignmentErrorCode = "EMPTY_CLASS_SEED" | "INVALID_CONFIGURATION" | "UNSUPPORTED_VERSION"
  | "INVALID_PARTICIPANT_COUNT" | "EMPTY_ROSTER" | "DUPLICATE_PARTICIPANT_ID" | "RESOURCE_LIMIT" | "INVALID_TEXT";
export class ClassAssignmentError extends Error {
  readonly code: ClassAssignmentErrorCode;
  constructor(code: ClassAssignmentErrorCode) { super(code); this.code = code; }
}

function canonicalText(value: unknown): string {
  if (typeof value !== "string") throw new ClassAssignmentError("INVALID_TEXT");
  const text = value.trim().normalize("NFC");
  // UTF-8 export must preserve the exact value; lone surrogates and binary controls cannot do so reliably.
  if (/[\uD800-\uDFFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throw new ClassAssignmentError("INVALID_TEXT");
  }
  return text;
}
export function normalizeClassSeed(value: unknown): string {
  const seed = canonicalText(value);
  if (!seed) throw new ClassAssignmentError("EMPTY_CLASS_SEED");
  return seed;
}

/** Locale is deliberately absent. Catalog order canonicalizes set-like selections. */
export function normalizeClassAssignmentConfig(value: unknown): ClassAssignmentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClassAssignmentError("INVALID_CONFIGURATION");
  const input = value as Record<string, unknown>;
  const keys = ["schemaVersion", "derivationVersion", "classSeed", "mode", "questionCount", "categories", "questionTypes", "generatorVersion"];
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new ClassAssignmentError("INVALID_CONFIGURATION");
  if (input.schemaVersion !== CLASS_SCHEMA_VERSION || input.derivationVersion !== CLASS_DERIVATION_VERSION) {
    throw new ClassAssignmentError("UNSUPPORTED_VERSION");
  }
  if (!isFiniteQuestionCount(input.questionCount) || !isFiniteQuestionCount(input.generatorVersion)) {
    throw new ClassAssignmentError("INVALID_CONFIGURATION");
  }
  const classSeed = normalizeClassSeed(input.classSeed);
  let canonical: SessionConfig;
  try {
    canonical = normalizeSessionConfig({ mode: input.mode, questionCount: input.questionCount,
      categories: input.categories, questionTypes: input.questionTypes, difficulty: "basic", locale: "es",
      seed: classSeed, generatorVersion: GENERATOR_VERSION });
  } catch { throw new ClassAssignmentError("INVALID_CONFIGURATION"); }
  return Object.freeze({ schemaVersion: CLASS_SCHEMA_VERSION, derivationVersion: CLASS_DERIVATION_VERSION,
    classSeed, mode: canonical.mode, questionCount: input.questionCount,
    categories: Object.freeze([...canonical.categories]), questionTypes: Object.freeze([...canonical.questionTypes]),
    generatorVersion: input.generatorVersion });
}

export function createClassAssignmentConfig(selection: ClassSessionSelection, classSeed: string,
  generatorVersion: number = GENERATOR_VERSION): ClassAssignmentConfig {
  return normalizeClassAssignmentConfig({ ...selection, classSeed, generatorVersion,
    schemaVersion: CLASS_SCHEMA_VERSION, derivationVersion: CLASS_DERIVATION_VERSION });
}

function fingerprint(config: ClassAssignmentConfig): string {
  return JSON.stringify(["class-config-v1", config.mode, config.questionCount,
    config.categories, config.questionTypes, config.generatorVersion]);
}
export function classConfigFingerprint(config: ClassAssignmentConfig): string {
  return fingerprint(normalizeClassAssignmentConfig(config));
}
function participantSeed(config: ClassAssignmentConfig, participantId: string, configFingerprint: string): string {
  // Full tuple framing retains distinct exported strings; downstream RNG state is still finite/non-cryptographic.
  return deriveSeed(config.classSeed, JSON.stringify(["class-participant", config.derivationVersion,
    configFingerprint, participantId]));
}
export function deriveClassParticipantSeed(config: ClassAssignmentConfig, participantId: string): string {
  const canonical = normalizeClassAssignmentConfig(config);
  const id = canonicalText(participantId);
  if (!id) throw new ClassAssignmentError("EMPTY_ROSTER");
  return participantSeed(canonical, id, fingerprint(canonical));
}

export function automaticParticipantIds(count: number): string[] {
  if (!isFiniteQuestionCount(count)) throw new ClassAssignmentError("INVALID_PARTICIPANT_COUNT");
  if (count > MAX_CLASS_PARTICIPANTS) throw new ClassAssignmentError("RESOURCE_LIMIT");
  // Width belongs to each ID, not the roster size: 999 -> 1000 never renames 001.
  return Array.from({ length: count }, (_, index) => String(index + 1).padStart(3, "0"));
}
export function canonicalParticipantIds(values: readonly string[]): string[] {
  if (!Array.isArray(values)) throw new ClassAssignmentError("EMPTY_ROSTER");
  if (values.length > MAX_CLASS_PARTICIPANTS) throw new ClassAssignmentError("RESOURCE_LIMIT");
  const ids = values.map(canonicalText).filter(Boolean);
  if (!ids.length) throw new ClassAssignmentError("EMPTY_ROSTER");
  if (new Set(ids).size !== ids.length) throw new ClassAssignmentError("DUPLICATE_PARTICIPANT_ID");
  return ids;
}
export function customParticipantIds(text: string): string[] {
  return canonicalParticipantIds(text.split(/\r\n|\r|\n/u));
}

export function generateClassAssignments(config: ClassAssignmentConfig, participantIds: readonly string[]): ClassAssignmentManifest {
  const canonical = normalizeClassAssignmentConfig(config);
  const ids = canonicalParticipantIds(participantIds);
  const configFingerprint = fingerprint(canonical);
  // Conservative bound for repeated UTF-16 context, JSON escaping and CSV duplication.
  const estimatedCharacters = ids.length * (canonical.classSeed.length + configFingerprint.length + 256) * 8
    + ids.reduce((total, id) => total + id.length * 8, 0);
  if (estimatedCharacters > MAX_CLASS_MANIFEST_CHARACTERS) throw new ClassAssignmentError("RESOURCE_LIMIT");
  return Object.freeze({ config: canonical, participants: Object.freeze(ids.map((participantId) => Object.freeze({
    participantId, configFingerprint, sessionSeed: participantSeed(canonical, participantId, configFingerprint),
  }))) });
}

/** The ordinary SessionConfig is the only bridge to chemistry. Unsupported generator versions fail here. */
export function participantSessionConfig(config: ClassAssignmentConfig, assignment: ParticipantAssignment,
  locale: AppLanguage): SessionConfig {
  const canonical = normalizeClassAssignmentConfig(config);
  if (assignment.configFingerprint !== fingerprint(canonical)
    || assignment.sessionSeed !== deriveClassParticipantSeed(canonical, assignment.participantId)) {
    throw new TypeError("Class assignment does not match its configuration.");
  }
  return normalizeSessionConfig({ mode: canonical.mode, questionCount: canonical.questionCount,
    categories: canonical.categories, questionTypes: canonical.questionTypes, difficulty: "basic", locale,
    seed: assignment.sessionSeed, generatorVersion: canonical.generatorVersion });
}

/** Input signature for stale-preview detection. Locale and individual seed are presentation-only. */
export function classVariantInputSignature(selection: ClassSessionSelection, classSeed: string,
  rosterMode: "automatic" | "custom", countText: string, customText: string): string {
  return JSON.stringify([selection.mode, selection.questionCount,
    EXERCISE_CATEGORIES.filter((id) => selection.categories.includes(id)),
    QUESTION_TYPES.filter((id) => selection.questionTypes.includes(id)), classSeed.trim().normalize("NFC"),
    rosterMode, rosterMode === "automatic" ? countText : customText]);
}
