import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { currentEnglishName, evaluateName, interpretedStructure, loadCorpus, loadSnapshots, mismatchMessage, structuralIdentity } from "./helpers/reference-corpus.mjs";

const records = loadCorpus();
const snapshots = loadSnapshots();
let chemistry;
before(async () => {
  mock.method(globalThis, "fetch", () => { throw new Error("Reference CI tests prohibit network requests"); });
  chemistry = await loadExerciseChemistry();
});
after(async () => { await chemistry?.close(); mock.restoreAll(); });

test("canonical identity compares graphs and preserves charge, bond order, positional isomers and unspecified stereo", () => {
  assert.equal(structuralIdentity("CCO"), structuralIdentity("OCC"));
  assert.equal(structuralIdentity("c1ccccc1"), structuralIdentity("C1=CC=CC=C1"));
  for (const [left, right] of [["CCO", "COC"], ["CC", "C=C"], ["CN", "C[NH3+]"],
    ["Cc1ccccc1C", "Cc1cccc(C)c1"], ["CC=CC", "C/C=C/C"], ["C/C=C/C", "C/C=C\\C"]]) {
    assert.notEqual(structuralIdentity(left), structuralIdentity(right), `${left} / ${right}`);
  }
});

for (const record of records) {
  test(`${record.id} [${record.category}]: frozen OPSIN expected name vs input graph`, () => {
    const interpreted = interpretedStructure(record.expected.en, snapshots);
    // Missing independent reference evidence is an integrity failure, not a
    // silent skip. Actual names added by future engine changes may be skipped.
    assert.equal(interpreted.status, "PASS", `${record.id}: ${interpreted.reason}`);
    assert.equal(interpreted.identity, structuralIdentity(record.smiles), `${record.id}: expected name describes another graph`);
    assert.equal(record.verification.opsinRoundTrip, true, `${record.id}: reviewed verification flag missing`);
  });
  test(`${record.id} [${record.category}]: actual name vs expected structure (offline)`, (context) => {
    const result = evaluateName(record, currentEnglishName(record, chemistry), snapshots);
    if (result.structure === "SKIP") return context.skip(mismatchMessage(result));
    assert.equal(result.structure, "PASS", mismatchMessage(result));
  });
  for (const alternative of record.acceptedAlternatives?.en ?? []) {
    test(`${record.id}: independently interpreted alternative ${alternative}`, () => {
      const interpreted = interpretedStructure(alternative, snapshots);
      assert.equal(interpreted.status, "PASS", interpreted.reason);
      assert.equal(interpreted.identity, structuralIdentity(record.smiles));
    });
  }
}
test("reference structural tests made no network requests", () => {
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
