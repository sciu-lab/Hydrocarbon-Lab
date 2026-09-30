import type { AppLanguage } from "./i18n.ts";
import type { MultipleChoiceQuestion as ExerciseMultipleChoiceMetadata } from "./exercise-model.ts";
import type { ReviewIssueCode } from "./practice-review.ts";
import { matchesHydrocarbonReferenceName, normalizeReferenceNameTypography } from "./practice-reference-answer.ts";

export type LocalizedOptionName = Readonly<Record<AppLanguage, string>>;

/** Existing Reviewer codes are the recipe taxonomy; UNKNOWN is intentionally absent. */
export type DistractorDiagnosticCode = Exclude<ReviewIssueCode, "UNKNOWN_MISMATCH">;
export type DistractorRecipeStatus = "SUPPORTED" | "SUPPORTED_WITH_RESTRICTIONS" | "NOT_SAFE_AS_DISTRACTOR";

export const DISTRACTOR_RECIPE_SUPPORT: Readonly<Record<DistractorDiagnosticCode, DistractorRecipeStatus>> = {
  WRONG_PARENT_CHAIN: "NOT_SAFE_AS_DISTRACTOR",
  WRONG_PARENT_LENGTH: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_NUMBERING_DIRECTION: "SUPPORTED_WITH_RESTRICTIONS",
  MISSING_SUBSTITUENT: "SUPPORTED_WITH_RESTRICTIONS",
  EXTRA_SUBSTITUENT: "NOT_SAFE_AS_DISTRACTOR",
  WRONG_SUBSTITUENT_LOCANT: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_ALPHABETICAL_ORDER: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_FUNCTIONAL_GROUP: "NOT_SAFE_AS_DISTRACTOR",
  WRONG_FUNCTIONAL_GROUP_LOCANT: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_UNSATURATION_LOCANT: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_SUFFIX: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_EZ_DESCRIPTOR: "SUPPORTED",
};

export type DistractorTransformation =
  | Readonly<{ kind: "opposite-ez-descriptor"; locant: number; from: "E" | "Z"; to: "E" | "Z" }>
  | Readonly<{ kind: "replace-locant"; component: "substituent" | "function" | "unsaturation"; from: number; to: number }>
  | Readonly<{ kind: "reverse-numbering"; locants: readonly Readonly<{ component: "substituent" | "function" | "unsaturation"; from: number; to: number }>[] }>
  | Readonly<{ kind: "omit-substituent"; name: string; locant: number }>
  | Readonly<{ kind: "swap-prefix-order"; prefixes: readonly [string, string] }>
  | Readonly<{ kind: "replace-parent-length"; from: number; to: number }>
  | Readonly<{ kind: "replace-suffix"; from: string; to: string }>;

export type MultipleChoiceReferenceOption = Readonly<{
  id: string;
  kind: "reference";
  name: LocalizedOptionName;
  correct: true;
  origin: Readonly<{ kind: "reference" }>;
}>;

export type MultipleChoiceDistractorOption = Readonly<{
  id: string;
  kind: "distractor";
  name: LocalizedOptionName;
  correct: false;
  origin: Readonly<{
    kind: "recipe";
    recipeId: string;
    diagnosticCode: DistractorDiagnosticCode;
    transformation: DistractorTransformation;
  }>;
}>;

/** Text is localized on one locale-independent option identity. */
export type MultipleChoiceOption = MultipleChoiceReferenceOption | MultipleChoiceDistractorOption;

/** Payload composition for a future generated question; no session behavior is implied. */
export type PopulatedMultipleChoiceQuestion = ExerciseMultipleChoiceMetadata & Readonly<{
  referenceNames: LocalizedOptionName;
  options: readonly MultipleChoiceOption[];
}>;

export type MultipleChoiceOptionValidationCode =
  | "EMPTY_OPTIONS" | "ZERO_CORRECT_OPTIONS" | "MULTIPLE_CORRECT_OPTIONS"
  | "DUPLICATE_OPTION_ID" | "EMPTY_OPTION_NAME" | "DUPLICATE_NORMALIZED_OPTIONS"
  | "REFERENCE_NAME_MISMATCH" | "DISTRACTOR_MATCHES_REFERENCE" | "INVALID_OPTION_KIND"
  | "INVALID_OPTION_ORIGIN" | "UNKNOWN_DIAGNOSTIC_CODE" | "UNSAFE_RECIPE" | "RECIPE_REQUIRES_RESTRICTIONS"
  | "DIAGNOSTIC_RECIPE_MISMATCH" | "INVALID_TRANSFORMATION_METADATA";

export type MultipleChoiceOptionValidationIssue = Readonly<{
  code: MultipleChoiceOptionValidationCode;
  optionId?: string;
  locale?: AppLanguage;
}>;

export type MultipleChoiceOptionValidation = Readonly<{
  valid: boolean;
  issues: readonly MultipleChoiceOptionValidationIssue[];
}>;

const transformationForDiagnostic: Readonly<Partial<Record<DistractorDiagnosticCode, DistractorTransformation["kind"]>>> = {
  WRONG_PARENT_LENGTH: "replace-parent-length",
  WRONG_NUMBERING_DIRECTION: "reverse-numbering",
  MISSING_SUBSTITUENT: "omit-substituent",
  WRONG_SUBSTITUENT_LOCANT: "replace-locant",
  WRONG_ALPHABETICAL_ORDER: "swap-prefix-order",
  WRONG_FUNCTIONAL_GROUP_LOCANT: "replace-locant",
  WRONG_UNSATURATION_LOCANT: "replace-locant",
  WRONG_SUFFIX: "replace-suffix",
  WRONG_EZ_DESCRIPTOR: "opposite-ez-descriptor",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLocalizedNames(value: unknown): value is LocalizedOptionName {
  return isRecord(value) && typeof value.es === "string" && typeof value.en === "string";
}

function validTransformation(code: DistractorDiagnosticCode, value: unknown): boolean {
  const expectedKind = transformationForDiagnostic[code];
  if (!expectedKind || !isRecord(value) || value.kind !== expectedKind) return false;
  if (value.kind === "opposite-ez-descriptor") {
    return Number.isSafeInteger(value.locant) && Number(value.locant) > 0
      && (value.from === "E" || value.from === "Z") && (value.to === "E" || value.to === "Z")
      && value.from !== value.to;
  }
  if (value.kind === "replace-locant") {
    const expectedComponent = code === "WRONG_SUBSTITUENT_LOCANT" ? "substituent"
      : code === "WRONG_FUNCTIONAL_GROUP_LOCANT" ? "function"
        : code === "WRONG_UNSATURATION_LOCANT" ? "unsaturation" : null;
    return value.component === expectedComponent && Number.isSafeInteger(value.from) && Number(value.from) > 0
      && Number.isSafeInteger(value.to) && Number(value.to) > 0 && value.from !== value.to;
  }
  if (value.kind === "reverse-numbering") {
    return code === "WRONG_NUMBERING_DIRECTION" && Array.isArray(value.locants) && value.locants.length >= 2
      && value.locants.every((entry) => isRecord(entry)
        && ["substituent", "function", "unsaturation"].includes(String(entry.component))
        && Number.isSafeInteger(entry.from) && Number(entry.from) > 0
        && Number.isSafeInteger(entry.to) && Number(entry.to) > 0 && entry.from !== entry.to);
  }
  if (value.kind === "omit-substituent") {
    return code === "MISSING_SUBSTITUENT" && typeof value.name === "string" && value.name.trim().length > 0
      && Number.isSafeInteger(value.locant) && Number(value.locant) > 0;
  }
  if (value.kind === "swap-prefix-order") {
    return code === "WRONG_ALPHABETICAL_ORDER" && Array.isArray(value.prefixes) && value.prefixes.length === 2
      && value.prefixes.every((prefix) => typeof prefix === "string" && prefix.trim().length > 0)
      && value.prefixes[0] !== value.prefixes[1];
  }
  if (value.kind === "replace-parent-length") {
    return code === "WRONG_PARENT_LENGTH" && Number.isSafeInteger(value.from) && Number(value.from) > 0
      && Number.isSafeInteger(value.to) && Number(value.to) > 0 && value.from !== value.to;
  }
  if (value.kind === "replace-suffix") {
    return code === "WRONG_SUFFIX" && typeof value.from === "string" && value.from.length > 0
      && typeof value.to === "string" && value.to.length > 0 && value.from !== value.to;
  }
  return false;
}

function matchesOppositeEzTransformation(reference: string, candidate: string, locale: AppLanguage,
  locant: number, from: "E" | "Z", to: "E" | "Z"): boolean {
  const normalizedReference = normalizeOption(reference, locale);
  const normalizedCandidate = normalizeOption(candidate, locale);
  const prefix = /^(\()([^)]+)(\)-)/u.exec(normalizedReference);
  if (!prefix) return false;
  const descriptors = prefix[2].split(",");
  let matches = 0;
  const changed = descriptors.map((descriptor) => {
    const item = /^(\d+)([ez])$/u.exec(descriptor);
    if (!item || Number(item[1]) !== locant || item[2].toUpperCase() !== from) return descriptor;
    matches++;
    return `${item[1]}${to.toLowerCase()}`;
  });
  if (matches !== 1) return false;
  const expected = `${prefix[1]}${changed.join(",")}${prefix[3]}${normalizedReference.slice(prefix[0].length)}`;
  return normalizedCandidate === expected;
}

/**
 * Contract validation only: recipe producers remain responsible for checking their
 * chemistry-specific restrictions before they attach the declared provenance.
 */
export function validateMultipleChoiceOptions(input: unknown): MultipleChoiceOptionValidation {
  const issues: MultipleChoiceOptionValidationIssue[] = [];
  const add = (code: MultipleChoiceOptionValidationCode, optionId?: string, locale?: AppLanguage) =>
    issues.push({ code, ...(optionId ? { optionId } : {}), ...(locale ? { locale } : {}) });
  if (!isRecord(input) || !hasLocalizedNames(input.referenceNames) || !Array.isArray(input.options)) {
    return { valid: false, issues: [{ code: "EMPTY_OPTIONS" }] };
  }
  const referenceNames = input.referenceNames;
  const options = input.options;
  if (!options.length) add("EMPTY_OPTIONS");

  const seenIds = new Set<string>();
  const seenNames: Record<AppLanguage, Map<string, string>> = { es: new Map(), en: new Map() };
  const correctlyTyped: Record<string, unknown>[] = [];
  let correctCount = 0;
  for (const candidate of options) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id.trim()
      || !hasLocalizedNames(candidate.name) || typeof candidate.kind !== "string") {
      add("INVALID_OPTION_KIND");
      continue;
    }
    correctlyTyped.push(candidate);
    const { id, name } = candidate;
    if (seenIds.has(id)) add("DUPLICATE_OPTION_ID", id);
    seenIds.add(id);
    for (const locale of ["es", "en"] as const) {
      const localizedName = name[locale];
      const normalized = normalizeOption(localizedName, locale);
      if (!normalized) add("EMPTY_OPTION_NAME", id, locale);
      else if (seenNames[locale].has(normalized)) add("DUPLICATE_NORMALIZED_OPTIONS", id, locale);
      else seenNames[locale].set(normalized, id);
    }
    if (candidate.correct === true) correctCount++;
    if (candidate.kind === "reference") {
      if (candidate.correct !== true || !isRecord(candidate.origin) || candidate.origin.kind !== "reference") {
        add("INVALID_OPTION_ORIGIN", id);
      }
      for (const locale of ["es", "en"] as const) {
        if (!matchesHydrocarbonReferenceName(name[locale], referenceNames[locale], locale)) {
          add("REFERENCE_NAME_MISMATCH", id, locale);
        }
      }
    } else if (candidate.kind === "distractor") {
      if (candidate.correct !== false || !isRecord(candidate.origin) || candidate.origin.kind !== "recipe") {
        add("INVALID_OPTION_ORIGIN", id);
        continue;
      }
      const origin = candidate.origin;
      if (typeof origin.recipeId !== "string" || !origin.recipeId.trim()) add("INVALID_OPTION_ORIGIN", id);
      if (typeof origin.diagnosticCode !== "string" || !Object.hasOwn(DISTRACTOR_RECIPE_SUPPORT, origin.diagnosticCode)) {
        add("UNKNOWN_DIAGNOSTIC_CODE", id);
        continue;
      }
      const code = origin.diagnosticCode as DistractorDiagnosticCode;
      if (DISTRACTOR_RECIPE_SUPPORT[code] === "NOT_SAFE_AS_DISTRACTOR") add("UNSAFE_RECIPE", id);
      if (DISTRACTOR_RECIPE_SUPPORT[code] === "SUPPORTED_WITH_RESTRICTIONS") add("RECIPE_REQUIRES_RESTRICTIONS", id);
      if (!validTransformation(code, origin.transformation)) add("INVALID_TRANSFORMATION_METADATA", id);
      if (code === "WRONG_EZ_DESCRIPTOR" && isRecord(origin.transformation)
        && origin.transformation.kind === "opposite-ez-descriptor"
        && (origin.transformation.from === "E" || origin.transformation.from === "Z")
        && (origin.transformation.to === "E" || origin.transformation.to === "Z")
        && Number.isSafeInteger(origin.transformation.locant)) {
        for (const locale of ["es", "en"] as const) {
          if (!matchesOppositeEzTransformation(referenceNames[locale], name[locale], locale,
            Number(origin.transformation.locant), origin.transformation.from, origin.transformation.to)) {
            add("DIAGNOSTIC_RECIPE_MISMATCH", id, locale);
          }
        }
      }
      for (const locale of ["es", "en"] as const) {
        if (matchesHydrocarbonReferenceName(name[locale], referenceNames[locale], locale)) {
          add("DISTRACTOR_MATCHES_REFERENCE", id, locale);
        }
      }
    } else {
      add("INVALID_OPTION_KIND", id);
    }
  }
  if (correctCount === 0) add("ZERO_CORRECT_OPTIONS");
  if (correctCount > 1) add("MULTIPLE_CORRECT_OPTIONS");
  const correctOptions = correctlyTyped.filter((option) => option.correct === true);
  if (correctOptions.length === 1 && correctOptions[0].kind !== "reference") add("INVALID_OPTION_ORIGIN", String(correctOptions[0].id));
  return { valid: issues.length === 0, issues };
}

function normalizeOption(value: string, locale: AppLanguage): string {
  return normalizeReferenceNameTypography(value, locale);
}
