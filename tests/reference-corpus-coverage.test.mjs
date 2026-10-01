import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { digest, loadCorpus, loadSnapshots } from "./helpers/reference-corpus.mjs";
import { coverageFeatures, coverageSummary } from "./helpers/reference-coverage.mjs";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/reference-corpus-v1-manifest.json", import.meta.url), "utf8"));
const records = loadCorpus();
const originalIDs = new Set(manifest.records.map((record) => record.id));
const added = records.filter((record) => !originalIDs.has(record.id));

test("all 102 Phase-1 records retain every original field, including ESTER-0007 silver", () => {
  assert.equal(manifest.records.length, 102);
  const byID = new Map(records.map((record) => [record.id, record]));
  for (const original of manifest.records) {
    assert.ok(byID.has(original.id), `${original.id}: protected record removed`);
    assert.equal(digest(JSON.stringify(byID.get(original.id))), original.sha256, `${original.id}: protected content changed`);
  }
  assert.equal(byID.get("ESTER-0007").authority, "silver");
});

test("all 118 original OPSIN receipts retain their raw body and provenance", () => {
  const snapshots = loadSnapshots();
  assert.equal(manifest.responses.length, 118);
  for (const original of manifest.responses) {
    assert.ok(snapshots.has(original.name), `${original.name}: protected receipt removed`);
    assert.equal(digest(JSON.stringify(snapshots.get(original.name))), original.sha256, `${original.name}: protected evidence changed`);
  }
});

for (const [label, aliases] of Object.entries(coverageFeatures)) {
  test(`reference coverage: ${label} has admitted hardening cases and traceable IDs`, () => {
    const result = coverageSummary(added)[label];
    assert.ok(result.count > 0, `${label}: no new coverage`);
    assert.equal(result.count, new Set(result.ids).size);
    // Independent set enumeration verifies union counting (a record with two
    // matching tags must count once), including selection of actual records.
    const expected = new Set(aliases.flatMap((tag) => added.filter((record) => record.features.includes(tag)).map((record) => record.id)));
    assert.deepEqual(new Set(result.ids), expected);
    for (const id of result.ids) assert.ok(!originalIDs.has(id));
  });
}

test("coverage is empty for unannotated data and does not double-count aliases", () => {
  const empty = coverageSummary([{ id: "untagged", features: [] }]);
  assert.ok(Object.values(empty).every((row) => row.count === 0));
  const repeated = coverageSummary([{ id: "both", features: ["multiple-substituents", "repeated-substituents"] }]);
  assert.deepEqual(repeated["multiple-substituents"], { count: 1, ids: ["both"] });
});
