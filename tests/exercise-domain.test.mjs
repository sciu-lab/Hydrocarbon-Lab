import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
before(async () => { chemistry = await loadExerciseChemistry(); });
after(async () => { await chemistry?.close(); });
const graph = (count, bonds, rings = []) => ({
  atoms: Array.from({ length: count }, (_, index) => ({ id: index + 1, x: index * 60, y: (index % 2) * 35, element: "C" })),
  bonds, rings,
});
const fromSmiles = (smiles) => {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.error);
  return result.molecule;
};

test("chemical validation rejects malformed IDs, bonds, endpoints, coordinates and overvalence", () => {
  const cases = [
    [{ atoms: [], bonds: [] }, "empty-atoms"],
    [{ ...graph(1, []), bonds: null }, "invalid-bonds"],
    [{ ...graph(2, [[1, 2]]), atoms: [{ id: 1, x: 0, y: 0 }, { id: 1, x: 1, y: 0 }] }, "invalid-atom-id"],
    [{ ...graph(1, []), atoms: [{ id: 0, x: 0, y: 0 }] }, "invalid-atom-id"],
    [{ ...graph(1, []), atoms: [{ id: 1, x: NaN, y: 0 }] }, "invalid-coordinates"],
    [{ ...graph(1, []), atoms: [{ id: 1, x: 0, y: 0, charge: 0.5 }] }, "invalid-charge"],
    [graph(2, [[1, 3]]), "missing-endpoint"],
    [graph(1, [[1, 1]]), "self-bond"],
    [graph(2, [[1, 2, 1], [2, 1, 2]]), "duplicate-bond"],
    [graph(2, [[1, 2, 4]]), "unsupported-bond-order"],
    [graph(2, [[1, 2, 1, true]]), "invalid-stereo-metadata"],
    [graph(2, [[1, 2, 2, "yes"]]), "invalid-stereo-metadata"],
    [graph(3, [[1, 2, 3], [1, 3, 2]]), "invalid-valence"],
  ];
  for (const [molecule, reason] of cases) assert.deepEqual(validateExerciseChemistry(molecule, chemistry.oracles), { valid: false, reason });
});

test("DOM-001 boundary: disconnected graphs fail even without ring metadata or naming", () => {
  const disconnected = graph(4, [[1, 2], [3, 4]]);
  assert.deepEqual(validateExerciseChemistry(disconnected, chemistry.oracles), { valid: false, reason: "disconnected" });
  assert.deepEqual(validateExerciseDomain(disconnected, "alkane", chemistry.oracles), { valid: false, reason: "disconnected" });
});

const excludedTopologies = {
  spiro: graph(9, [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1], [1, 6], [6, 7], [7, 8], [8, 9], [9, 1]]),
  bridged: graph(7, [[1, 3], [3, 2], [1, 4], [4, 5], [5, 2], [1, 6], [6, 7], [7, 2]]),
  fused: graph(10, [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [1, 7], [7, 8], [8, 9], [9, 10], [10, 2]]),
  "multiple-connected-rings": graph(6, [[1, 2], [2, 3], [3, 1], [3, 4], [4, 5], [5, 6], [6, 4]]),
};
for (const [topology, molecule] of Object.entries(excludedTopologies)) {
  test(`domain rejects ${topology} based on graph cycles even if rings are missing`, () => {
    assert.equal(validateExerciseChemistry(molecule, chemistry.oracles).valid, true);
    assert.deepEqual(validateExerciseDomain(molecule, "simple-carbocycle", chemistry.oracles), { valid: false, reason: "polycycle-outside-domain" });
  });
}

test("domain rejects sulfur and unknown elements independently of render/import support", () => {
  assert.deepEqual(validateExerciseDomain(fromSmiles("CSC"), "ether", chemistry.oracles), { valid: false, reason: "excluded-element" });
  const phosphorus = graph(1, []);
  phosphorus.atoms[0].element = "P";
  assert.deepEqual(validateExerciseDomain(phosphorus, "alkane", chemistry.oracles), { valid: false, reason: "unsupported-element" });
});

test("domain rejects arbitrary charges, incorrect nitro motifs and explicit R/S", () => {
  const chargedAmine = fromSmiles("CCN");
  chargedAmine.atoms.find((atom) => atom.element === "N").charge = 1;
  assert.deepEqual(validateExerciseDomain(chargedAmine, "amine", chemistry.oracles), { valid: false, reason: "unsupported-charge" });
  const incorrectNitro = fromSmiles("C[N+]([O-])=O");
  incorrectNitro.atoms.find((atom) => atom.charge === -1).charge = 0;
  assert.deepEqual(validateExerciseDomain(incorrectNitro, "nitro", chemistry.oracles), { valid: false, reason: "unsupported-nitro-pattern" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("C[C@H](O)CC"), "alcohol", chemistry.oracles), { valid: false, reason: "rs-outside-domain" });
});

test("domain rejects arbitrary heterocycles, false ring metadata and unsaturated cyclic recipes", () => {
  assert.deepEqual(validateExerciseDomain(fromSmiles("C1CCOC1"), "simple-carbocycle", chemistry.oracles), { valid: false, reason: "heterocycle-outside-domain" });
  const missing = fromSmiles("C1CCCCC1");
  missing.rings = [];
  assert.deepEqual(validateExerciseDomain(missing, "simple-carbocycle", chemistry.oracles), { valid: false, reason: "invalid-ring-metadata" });
  const fake = graph(3, [[1, 2], [2, 3]], [{ id: 1, kind: "cycloalkane", atomIds: [1, 2, 3] }]);
  assert.deepEqual(validateExerciseDomain(fake, "simple-carbocycle", chemistry.oracles), { valid: false, reason: "invalid-ring-metadata" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("C1=CCCCC1"), "simple-carbocycle", chemistry.oracles), { valid: false, reason: "unsupported-ring-unsaturation" });
});

test("domain requires the requested group and excludes competing groups, peroxides and N substitution", () => {
  assert.deepEqual(validateExerciseDomain(fromSmiles("CCO"), "ketone", chemistry.oracles), { valid: false, reason: "category-group-mismatch" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("CC(=O)CCO"), "alcohol", chemistry.oracles), { valid: false, reason: "category-group-mismatch" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("COOC"), "ether", chemistry.oracles), { valid: false, reason: "category-group-mismatch" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("CNCC"), "amine", chemistry.oracles), { valid: false, reason: "unsupported-n-substitution" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("CC(=O)NC"), "amide", chemistry.oracles), { valid: false, reason: "unsupported-n-substitution" });
});

test("domain excludes unsupported functional/unsaturation combinations and absent or false E/Z", () => {
  assert.deepEqual(validateExerciseDomain(fromSmiles("C=CCO"), "alcohol", chemistry.oracles), { valid: false, reason: "unsupported-combination" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("C=CC=C"), "alkene", chemistry.oracles), { valid: false, reason: "category-unsaturation-mismatch" });
  assert.deepEqual(validateExerciseDomain(fromSmiles("CC=CC"), "ez", chemistry.oracles), { valid: false, reason: "missing-ez-configuration" });
  const falseStereo = fromSmiles("C=CC");
  falseStereo.bonds.find((bond) => bond[2] === 2)[3] = true;
  assert.deepEqual(validateExerciseDomain(falseStereo, "ez", chemistry.oracles), { valid: false, reason: "invalid-ez-configuration" });
});

test("chemical/domain validators expose oracle failures rather than accepting candidates", () => {
  const methane = graph(1, []);
  assert.deepEqual(validateExerciseChemistry(methane, {
    ...chemistry.oracles, findMoleculeValenceViolation() { throw new Error("fault"); },
  }), { valid: false, reason: "valence-oracle-failed" });
  assert.deepEqual(validateExerciseDomain(methane, "alkane", {
    ...chemistry.oracles, detectFunctionalGroups() { throw new Error("fault"); },
  }), { valid: false, reason: "group-oracle-failed" });
});
