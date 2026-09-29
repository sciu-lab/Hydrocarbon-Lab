import type { AppLanguage } from "./i18n.ts";

/** Typography only: this is not an IUPAC equivalence or synonym evaluator. */
export function normalizeReferenceNameTypography(value: string, locale: AppLanguage = "en"): string {
  const normalized = value.normalize("NFC").toLowerCase();
  const localized = locale === "es"
    ? normalized.replace(/[áéíóú]/gu, (vowel) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" })[vowel]!)
    : normalized;
  return localized
    .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s*,\s*/gu, ",")
    .trim();
}

export function matchesHydrocarbonReferenceName(answer: string, referenceName: string, locale: AppLanguage = "en"): boolean {
  const normalized = normalizeReferenceNameTypography(answer, locale);
  return normalized.length > 0 && normalized === normalizeReferenceNameTypography(referenceName, locale);
}
