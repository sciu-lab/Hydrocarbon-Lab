import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import { createClassAssignmentConfig, normalizeClassAssignmentConfig, classConfigFingerprint, normalizeClassSeed,
  deriveClassParticipantSeed, automaticParticipantIds, customParticipantIds, generateClassAssignments,
  participantSessionConfig, classVariantInputSignature, MAX_CLASS_PARTICIPANTS } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv } from "../app/class-assignment-csv.ts";

const selection = { mode: "exam", questionCount: 15, categories: ["alcohol", "alkane"],
  questionTypes: ["build", "naming", "multiple-choice"] };
const config = () => createClassAssignmentConfig(selection, "CHEM-4B-2026", 1);
const mapping = (manifest) => Object.fromEntries(manifest.participants.map((row) => [row.participantId, row.sessionSeed]));
const code = (expected) => (error) => error.code === expected;

test("v1 freezes explicit fingerprint framing and per-participant seed context", () => {
  const fingerprint = '["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]';
  assert.equal(classConfigFingerprint(config()), fingerprint);
  const seed = deriveClassParticipantSeed(config(), "001");
  assert.deepEqual(JSON.parse(seed), ["hydrocarbon-lab-seed", "CHEM-4B-2026",
    '["class-participant",1,"[\\"class-config-v1\\",\\"exam\\",15,[\\"alkane\\",\\"alcohol\\"],[\\"naming\\",\\"multiple-choice\\",\\"build\\"],1]","001"]']);
  assert.equal(deriveClassParticipantSeed(config(), "001"), seed);
});

for (const [field, change] of Object.entries({ mode: "practice", questionCount: 20,
  categories: ["alkane", "alcohol", "ketone"], questionTypes: ["naming"], generatorVersion: 2 })) {
  test(`${field} changes the participant seed; returning restores it`, () => {
    const original = config();
    assert.notEqual(deriveClassParticipantSeed(normalizeClassAssignmentConfig({ ...original, [field]: change }), "001"),
      deriveClassParticipantSeed(original, "001"));
    assert.equal(deriveClassParticipantSeed(config(), "001"), deriveClassParticipantSeed(original, "001"));
  });
}
test("class seed and participant ID independently change seeds without a random salt", () => {
  const original = deriveClassParticipantSeed(config(), "001");
  assert.notEqual(original, deriveClassParticipantSeed({ ...config(), classSeed: "CHEM-4B-2026-B" }, "001"));
  assert.notEqual(original, deriveClassParticipantSeed(config(), "001A"));
  assert.equal(original, deriveClassParticipantSeed(config(), " 001 "));
});
test("NFC and outer trim preserve meaningful internal text, case and opaque ID characters", () => {
  assert.equal(normalizeClassSeed("  Café  A\nB  "), "Café  A\nB");
  assert.equal(deriveClassParticipantSeed({ ...config(), classSeed: " Cafe\u0301 " }, " A\u0301 "),
    deriveClassParticipantSeed({ ...config(), classSeed: "Café" }, "Á"));
  assert.notEqual(deriveClassParticipantSeed(config(), "A01"), deriveClassParticipantSeed(config(), "a01"));
  assert.equal(normalizeClassSeed("Clase 🧪"), "Clase 🧪");
  for (const value of ["A\u0000B", "\uD800"]) assert.throws(() => normalizeClassSeed(value), code("INVALID_TEXT"));
});
test("set selection and object insertion order are irrelevant; input objects remain unchanged", () => {
  const original = config(), before = JSON.stringify(original);
  const reordered = Object.fromEntries(Object.entries({ ...original,
    categories: ["alkane", "alcohol", "alkane"], questionTypes: ["naming", "multiple-choice", "build", "naming"] }).reverse());
  assert.equal(deriveClassParticipantSeed(original, "A01"), deriveClassParticipantSeed(reordered, "A01"));
  assert.equal(classConfigFingerprint(original), classConfigFingerprint(reordered));
  assert.equal(JSON.stringify(original), before);
});
test("delivery locale changes only normal SessionConfig presentation", () => {
  const manifest = generateClassAssignments(config(), ["001"]);
  const es = participantSessionConfig(manifest.config, manifest.participants[0], "es");
  const en = participantSessionConfig(manifest.config, manifest.participants[0], "en");
  assert.equal(es.seed, en.seed);
  assert.deepEqual({ ...es, locale: "en" }, en);
  assert.equal(es.generatorVersion, 1);
  assert.throws(() => normalizeClassAssignmentConfig({ ...config(), locale: "es" }), code("INVALID_CONFIGURATION"));
});
for (const count of [1, 9, 15, 36, 100, 1001]) test(`automatic IDs: ${count} participants, stable numeric/generated order`, () => {
  const ids = automaticParticipantIds(count);
  assert.equal(ids.length, count);
  assert.equal(ids[0], "001");
  assert.equal(ids.at(-1), String(count).padStart(3, "0"));
  assert.equal(new Set(ids).size, count);
  if (count > 999) assert.equal(ids[998], "999");
});
test("36 -> 37 -> 36 and 999 -> 1000 preserve every prior ID and seed", () => {
  for (const count of [36, 999]) {
    const original = generateClassAssignments(config(), automaticParticipantIds(count));
    const extended = generateClassAssignments(config(), automaticParticipantIds(count + 1));
    assert.deepEqual(extended.participants.slice(0, count), original.participants);
    assert.deepEqual(generateClassAssignments(config(), automaticParticipantIds(count)).participants, original.participants);
  }
});
test("custom roster order changes only row order, adding a participant changes no prior mapping", () => {
  const ids = customParticipantIds("\n A01 \r\nA02\n\nA03\r");
  assert.deepEqual(ids, ["A01", "A02", "A03"]);
  const first = generateClassAssignments(config(), ids);
  const reordered = generateClassAssignments(config(), ["A03", "A01", "A02"]);
  assert.deepEqual(mapping(first), mapping(reordered));
  assert.deepEqual(reordered.participants.map((row) => row.participantId), ["A03", "A01", "A02"]);
  const extended = generateClassAssignments(config(), ["A03", "A04", "A01", "A02"]);
  for (const row of first.participants) assert.equal(mapping(extended)[row.participantId], row.sessionSeed);
});
test("empty and duplicate canonical custom IDs are rejected, not silently deduplicated", () => {
  for (const text of ["", " \n\t"]) assert.throws(() => customParticipantIds(text), code("EMPTY_ROSTER"));
  for (const text of ["A01\n A01 ", "Á\nA\u0301"]) assert.throws(() => customParticipantIds(text), code("DUPLICATE_PARTICIPANT_ID"));
});
test("positive safe counts, finite class sessions, explicit versions and materialization guards", () => {
  for (const questionCount of [1, 5, 15, 23, 37, Number.MAX_SAFE_INTEGER]) {
    const c = createClassAssignmentConfig({ ...selection, questionCount }, "COUNT");
    const manifest = generateClassAssignments(c, ["001"]);
    assert.equal(participantSessionConfig(c, manifest.participants[0], "es").questionCount, questionCount);
  }
  for (const questionCount of ["endless", null, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createClassAssignmentConfig({ ...selection, mode: "practice", questionCount }, "COUNT"), code("INVALID_CONFIGURATION"));
  }
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => automaticParticipantIds(count), code("INVALID_PARTICIPANT_COUNT"));
  assert.throws(() => automaticParticipantIds(MAX_CLASS_PARTICIPANTS + 1), code("RESOURCE_LIMIT"));
  assert.throws(() => generateClassAssignments({ ...config(), classSeed: "X".repeat(100_000) }, automaticParticipantIds(36)), code("RESOURCE_LIMIT"));
  assert.throws(() => normalizeClassAssignmentConfig({ ...config(), derivationVersion: 2 }), code("UNSUPPORTED_VERSION"));
  const future = normalizeClassAssignmentConfig({ ...config(), generatorVersion: 3 });
  const manifest = generateClassAssignments(future, ["001"]);
  assert.throws(() => participantSessionConfig(future, manifest.participants[0], "es"), /Unsupported generatorVersion/);
});
test("10,000 deterministic participants have distinct exported seed strings without roster mutation", () => {
  const roster = automaticParticipantIds(10_000);
  const seeds = roster.map((id) => deriveClassParticipantSeed(config(), id));
  assert.equal(new Set(seeds).size, roster.length);
});
test("derivation and metadata generation never use time or entropy", () => {
  const random = Math.random, now = Date.now;
  try {
    Math.random = Date.now = () => { throw new Error("Time/entropy used"); };
    assert.deepEqual(generateClassAssignments(config(), ["001", "002"]), generateClassAssignments(config(), ["001", "002"]));
  } finally { Math.random = random; Date.now = now; }
});
test("preview input signature ignores locale and set order; tracks material changes", () => {
  const signature = classVariantInputSignature(selection, "CLASS", "automatic", "36", "");
  assert.equal(signature, classVariantInputSignature({ ...selection, categories: [...selection.categories].reverse() }, "CLASS", "automatic", "36", ""));
  assert.notEqual(signature, classVariantInputSignature(selection, "CLASS", "automatic", "37", ""));
  assert.notEqual(signature, classVariantInputSignature({ ...selection, questionCount: 20 }, "CLASS", "automatic", "36", ""));
});
test("metadata plus CSV performance for 1/36/100 participants (no chemistry)", () => {
  const timings = [];
  for (const count of [1, 36, 100]) {
    const started = performance.now();
    const manifest = generateClassAssignments(config(), automaticParticipantIds(count));
    const derivedMs = performance.now() - started;
    const exportStarted = performance.now();
    const csv = serializeClassAssignmentCsv(manifest, "es");
    timings.push({ participants: count, derivedMs, csvMs: performance.now() - exportStarted, bytes: Buffer.byteLength(csv, "utf8") });
    assert.equal(manifest.participants.length, count); assert.ok(csv.length > 0);
  }
  console.log("CLASS_METADATA_PERFORMANCE=" + JSON.stringify(timings));
});
