import type { AppLanguage } from "./i18n.ts";
import { generateClassAssignments, normalizeClassAssignmentConfig, participantSessionConfig } from "./class-assignment.ts";
import type { ClassAssignmentManifest } from "./class-assignment.ts";
import type { SessionConfig } from "./exercise-model.ts";

export const CLASS_ASSIGNMENT_CSV_FILENAME = "hydrocarbon-lab-class-assignments.csv";
export const CLASS_ASSIGNMENT_CSV_COLUMNS = Object.freeze([
  "schema_version", "derivation_version", "class_seed", "config_fingerprint", "participant_id", "session_seed",
  "mode", "generator_version", "question_count", "question_types", "categories", "locale",
] as const);
export type ClassAssignmentCsvRow = Record<typeof CLASS_ASSIGNMENT_CSV_COLUMNS[number], string>;

// A visible, reversible alphabetic prefix avoids formula interpretation and loss of 001's leading zeros.
// Always prefix both user-controlled columns; an original "text:" is preserved by decoding exactly once.
const encodeText = (value: string) => `text:${value}`;
function decodeText(value: string): string {
  if (!value.startsWith("text:")) throw new TypeError("Missing v1 CSV text encoding.");
  return value.slice(5);
}
const quote = (value: string) => `"${value.replace(/"/gu, '""')}"`;

export function classAssignmentCsvRows(manifest: ClassAssignmentManifest, locale: AppLanguage): ClassAssignmentCsvRow[] {
  if (locale !== "es" && locale !== "en") throw new TypeError("Invalid delivery locale.");
  const canonical = generateClassAssignments(manifest.config, manifest.participants.map((row) => row.participantId));
  if (canonical.participants.length !== manifest.participants.length
    || canonical.participants.some((row, index) => row.sessionSeed !== manifest.participants[index].sessionSeed
    || row.configFingerprint !== manifest.participants[index].configFingerprint
    || row.participantId !== manifest.participants[index].participantId)) throw new TypeError("Invalid class manifest.");
  return canonical.participants.map((assignment) => ({
    schema_version: String(canonical.config.schemaVersion), derivation_version: String(canonical.config.derivationVersion),
    class_seed: encodeText(canonical.config.classSeed), config_fingerprint: assignment.configFingerprint,
    participant_id: encodeText(assignment.participantId), session_seed: assignment.sessionSeed,
    mode: canonical.config.mode, generator_version: String(canonical.config.generatorVersion),
    question_count: String(canonical.config.questionCount), question_types: JSON.stringify(canonical.config.questionTypes),
    categories: JSON.stringify(canonical.config.categories), locale,
  }));
}

/** UTF-8 BOM for spreadsheet Unicode detection; RFC 4180 quoting, CRLF and fixed column order. */
export function serializeClassAssignmentCsv(manifest: ClassAssignmentManifest, locale: AppLanguage): string {
  const rows = classAssignmentCsvRows(manifest, locale);
  return "\uFEFF" + [CLASS_ASSIGNMENT_CSV_COLUMNS.map(quote).join(","),
    ...rows.map((row) => CLASS_ASSIGNMENT_CSV_COLUMNS.map((key) => quote(row[key])).join(","))].join("\r\n") + "\r\n";
}

/** Internal reproduction boundary for a parsed CSV row; no CSV import UI or chemistry generation. */
export function reconstructClassSessionFromCsvRow(row: ClassAssignmentCsvRow): SessionConfig {
  const integer = (value: string) => /^\d+$/u.test(value) ? Number(value) : NaN;
  const config = normalizeClassAssignmentConfig({ schemaVersion: integer(row.schema_version),
    derivationVersion: integer(row.derivation_version), classSeed: decodeText(row.class_seed), mode: row.mode,
    generatorVersion: integer(row.generator_version), questionCount: integer(row.question_count),
    categories: JSON.parse(row.categories), questionTypes: JSON.parse(row.question_types) });
  const participantId = decodeText(row.participant_id);
  return participantSessionConfig(config, { participantId, sessionSeed: row.session_seed,
    configFingerprint: row.config_fingerprint }, row.locale as AppLanguage);
}
