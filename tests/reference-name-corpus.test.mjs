import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { currentEnglishName, evaluateName, loadCorpus, loadSnapshots, mismatchMessage } from "./helpers/reference-corpus.mjs";

const records = loadCorpus();
const snapshots = loadSnapshots();
let chemistry;
before(async () => {
  mock.method(globalThis, "fetch", () => { throw new Error("Reference CI tests prohibit network requests"); });
  chemistry = await loadExerciseChemistry();
});
after(async () => { await chemistry?.close(); mock.restoreAll(); });

for (const record of records) {
  test(`${record.id} [${record.category}] exact EN / ${record.profile}`, {
    skip: record.authority !== "gold" ? `${record.authority}: not an exact naming oracle` : false,
  }, () => {
    const result = evaluateName(record, currentEnglishName(record, chemistry), snapshots);
    // Byte-for-byte equality: no lowercasing, punctuation/locant removal,
    // sorting, synonyms or acceptedAlternative can make this test pass.
    assert.equal(result.actual, result.expected, mismatchMessage(result));
  });
}

test("an independently interpreted accepted alternative remains an exact-name failure", () => {
  const record = records.find((item) => item.expected.en === "ethanol");
  const result = evaluateName(record, "ethan-1-ol", snapshots);
  assert.equal(result.exact, "FAIL");
  assert.equal(result.structure, "PASS");
  assert.equal(result.acceptedAlternative, true);
  assert.equal(result.classification, "CANONICAL_NAME_MISMATCH");
});
test("a name for a different structure is a structural failure", () => {
  const record = records.find((item) => item.expected.en === "ethanol");
  const result = evaluateName(record, "methanol", snapshots);
  assert.equal(result.exact, "FAIL");
  assert.equal(result.structure, "FAIL");
  assert.equal(result.classification, "NAME_STRUCTURE_MISMATCH");
});
test("an uncaptured actual name reports SKIP, never presumed structural equivalence", () => {
  const record = records.find((item) => item.expected.en === "ethanol");
  const result = evaluateName(record, "no independent evidence", snapshots);
  assert.equal(result.structure, "SKIP");
  assert.equal(result.classification, "NAME_MISMATCH_STRUCTURE_UNVERIFIED");
});
test("reference exact-name tests made no network requests", () => {
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
