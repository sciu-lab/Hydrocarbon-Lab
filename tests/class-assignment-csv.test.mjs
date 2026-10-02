import assert from "node:assert/strict";
import { test } from "node:test";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig } from "../app/class-assignment.ts";
import { CLASS_ASSIGNMENT_CSV_COLUMNS, CLASS_ASSIGNMENT_CSV_FILENAME, classAssignmentCsvRows,
  serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow } from "../app/class-assignment-csv.ts";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";
const config = (classSeed = "CHEM-4B-2026") => createClassAssignmentConfig({ mode: "exam", questionCount: 15,
  categories: ["alkane", "alcohol"], questionTypes: ["naming", "multiple-choice", "build"] }, classSeed);

test("CSV schema/header, BOM, CRLF, filename and byte determinism are frozen", () => {
  const manifest = generateClassAssignments(config(), ["001", "002"]);
  const csv = serializeClassAssignmentCsv(manifest, "es");
  assert.ok(csv.startsWith('\uFEFF"schema_version","derivation_version","class_seed","config_fingerprint","participant_id","session_seed","mode","generator_version","question_count","question_types","categories","locale"\r\n'));
  assert.ok(csv.endsWith("\r\n")); assert.equal(csv, serializeClassAssignmentCsv(manifest, "es"));
  assert.deepEqual(parseClassCsv(csv).header, [...CLASS_ASSIGNMENT_CSV_COLUMNS]);
  assert.equal(CLASS_ASSIGNMENT_CSV_FILENAME, "hydrocarbon-lab-class-assignments.csv");
});
test("quoted commas, double quotes, embedded newlines and Unicode roundtrip exactly", () => {
  const manifest = generateClassAssignments(config('Clase, "química"\n🧪'), ['A,"01"', "B\n02", "Á03"]);
  const csv = serializeClassAssignmentCsv(manifest, "es");
  assert.equal(Buffer.from(csv, "utf8").toString("utf8"), csv);
  assert.ok(csv.includes('""química""')); assert.ok(csv.includes("\n🧪"));
  const parsed = parseClassCsv(csv);
  assert.equal(parsed.rows.length, 3);
  for (const [index, row] of parsed.rows.entries()) assert.deepEqual(reconstructClassSessionFromCsvRow(row),
    participantSessionConfig(manifest.config, manifest.participants[index], "es"));
});
test("spreadsheet text prefix handles formula starters, controls, numeric IDs and original text: prefixes without mutation", () => {
  for (const value of ["=1+1", "+SUM(1,2)", "-1+1", "@SUM(A1)", "\t=1+1", "＝1+1", "text:001", "'original", "001"]) {
    const manifest = generateClassAssignments(config(value), [value]);
    const before = JSON.stringify(manifest);
    const row = parseClassCsv(serializeClassAssignmentCsv(manifest, "es")).rows[0];
    assert.ok(row.class_seed.startsWith("text:")); assert.ok(row.participant_id.startsWith("text:"));
    assert.doesNotMatch(row.class_seed, /^[\s=+\-@＝＋－＠]/u);
    assert.doesNotMatch(row.participant_id, /^[\s=+\-@＝＋－＠]/u);
    assert.equal(reconstructClassSessionFromCsvRow(row).seed, manifest.participants[0].sessionSeed);
    assert.equal(JSON.stringify(manifest), before);
  }
});
test("CSV row order preserves custom roster order, while exported participant mapping is independent", () => {
  const a = generateClassAssignments(config(), ["A03", "A01", "A02"]);
  const b = generateClassAssignments(config(), ["A02", "A03", "A01"]);
  const rows = parseClassCsv(serializeClassAssignmentCsv(a, "es")).rows;
  assert.deepEqual(rows.map((row) => row.participant_id), ["text:A03", "text:A01", "text:A02"]);
  const seeds = (manifest) => Object.fromEntries(classAssignmentCsvRows(manifest, "es").map((row) => [row.participant_id, row.session_seed]));
  assert.deepEqual(seeds(a), seeds(b));
});
test("ES/EN exports differ only in delivery locale, preserving seeds, fingerprint and configuration", () => {
  const manifest = generateClassAssignments(config(), ["001", "002"]);
  const es = parseClassCsv(serializeClassAssignmentCsv(manifest, "es")).rows;
  const en = parseClassCsv(serializeClassAssignmentCsv(manifest, "en")).rows;
  assert.deepEqual(es.map((row) => ({ ...row, locale: "en" })), en);
  assert.equal(reconstructClassSessionFromCsvRow(es[0]).seed, reconstructClassSessionFromCsvRow(en[0]).seed);
});
test("manifest whitelist contains no answers, correct option, structural target, attempt or score", () => {
  const row = classAssignmentCsvRows(generateClassAssignments(config(), ["001"]), "es")[0];
  assert.deepEqual(Object.keys(row), [...CLASS_ASSIGNMENT_CSV_COLUMNS]);
  for (const key of ["reference", "correctOptionId", "molecule", "structuralIdentity", "answer", "score", "attempts"]) assert.ok(!(key in row));
});
test("row reconstruction rejects mismatched fingerprint/seed and unsupported or damaged metadata", () => {
  const manifest = generateClassAssignments(config(), ["001"]);
  const row = classAssignmentCsvRows(manifest, "es")[0];
  for (const change of [{ session_seed: "other" }, { config_fingerprint: "other" }, { participant_id: "text:002" },
    { schema_version: "2" }, { derivation_version: "2" }, { question_count: "endless" }, { locale: "fr" }, { class_seed: "raw" }]) {
    assert.throws(() => reconstructClassSessionFromCsvRow({ ...row, ...change }));
  }
  assert.throws(() => serializeClassAssignmentCsv({ ...manifest, participants: [{ ...manifest.participants[0], sessionSeed: "wrong" }] }, "es"));
});
