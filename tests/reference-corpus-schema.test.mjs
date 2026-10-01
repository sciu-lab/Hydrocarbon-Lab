import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { ajv, families, loadCorpus, readCorpusJson, validateFamily, structuralIdentity, importRecord } from "./helpers/reference-corpus.mjs";

const records = loadCorpus();
let chemistry;
before(async () => {
  mock.method(globalThis, "fetch", () => { throw new Error("Reference CI tests prohibit network requests"); });
  chemistry = await loadExerciseChemistry();
});
after(async () => { await chemistry?.close(); mock.restoreAll(); });

for (const category of Object.keys(families)) {
  test(`reference schema: ${category}.json`, () => {
    assert.equal(validateFamily(readCorpusJson(`${category}.json`)), true, ajv.errorsText(validateFamily.errors));
  });
}

test("reference integrity: stable IDs, unique structures across every family, alternatives separate from expected", () => {
  const ids = new Set(), identities = new Map();
  for (const record of records) {
    assert.equal(ids.has(record.id), false, `Duplicate ID: ${record.id}`);
    ids.add(record.id);
    const identity = structuralIdentity(record.smiles);
    assert.equal(identities.has(identity), false, `${record.id}: same structure as ${identities.get(identity)}`);
    identities.set(identity, record.id);
    for (const language of ["en", "es"]) {
      assert.equal(record.acceptedAlternatives?.[language]?.includes(record.expected[language]) ?? false, false,
        `${record.id}: expected is repeated as an alternative`);
      if (record.acceptedAlternatives?.[language]?.length) assert.ok(record.expected[language], `${record.id}: missing language expected`);
    }
    // Phase 1 has no PubChem capture. A flag cannot claim a check never performed.
    assert.equal(record.verification.pubchemCrossCheck, false, `${record.id}: add frozen PubChem evidence before claiming cross-check`);
  }
});

for (const record of records) {
  test(`${record.id} [${record.category}]: production DomainProfile v1 and lossless import`, () => {
    const molecule = importRecord(record, chemistry);
    const exported = moleculeToSmiles(molecule);
    assert.equal(exported.ok, true, exported.error);
    assert.equal(structuralIdentity(exported.smiles), structuralIdentity(record.smiles),
      `${record.id} ${record.smiles}: production import/export changed structure or unspecified stereo`);
  });
}

const mutations = {
  "missing ID": (item) => { delete item.id; },
  "unknown version": (item) => { item.schemaVersion = 2; },
  "blank SMILES": (item) => { item.smiles = " "; },
  "invalid category": (item) => { item.category = "spiro"; },
  "invalid authority": (item) => { item.authority = "trusted"; },
  "missing source": (item) => { item.source = []; },
  "invented profile": (item) => { item.profile = "anything"; },
  "gold without review": (item) => { delete item.review; },
  "gold without rule source": (item) => { item.source.forEach((source) => { source.type = "opsin"; }); },
  "gold without manual review": (item) => { item.verification.manual = false; },
  "string verification": (item) => { item.verification.opsinRoundTrip = "true"; },
  "unknown field": (item) => { item.expectd = "typo"; },
};
for (const [label, mutate] of Object.entries(mutations)) {
  test(`reference schema rejects ${label}`, () => {
    const item = structuredClone(records[0]);
    mutate(item);
    assert.equal(validateFamily([item]), false);
  });
}
test("reference schema supports independently reviewed Spanish and non-gold provenance", () => {
  const item = structuredClone(records[0]);
  item.expected.es = "metano";
  assert.equal(validateFamily([item]), true);
  item.authority = "generated";
  item.verification.manual = false;
  delete item.review;
  assert.equal(validateFamily([item]), true);
});
test("reference integrity and domain validation made no network requests", () => {
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
