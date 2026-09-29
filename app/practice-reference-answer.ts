/** Typography only: this is not an IUPAC equivalence or synonym evaluator. */
export function normalizeReferenceNameTypography(value: string): string {
  return value.normalize("NFC").toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s*,\s*/gu, ",")
    .trim();
}

export function matchesHydrocarbonReferenceName(answer: string, referenceName: string): boolean {
  const normalized = normalizeReferenceNameTypography(answer);
  return normalized.length > 0 && normalized === normalizeReferenceNameTypography(referenceName);
}
