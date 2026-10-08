import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMoleculePayload } from "../app/api/molecule-payload.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";

function roundTrip(molecule) {
  const accepted = normalizeMoleculePayload(molecule);
  assert.ok(accepted, "valid supported molecule should be accepted for persistence");
  const stored = JSON.stringify(accepted);
  const recovered = normalizeMoleculePayload(JSON.parse(stored));
  assert.ok(recovered, "stored molecule should be accepted when recovered");
  return recovered;
}

function assertSameIsomericSmiles(molecule) {
  const before = moleculeToSmiles(molecule);
  const recovered = roundTrip(molecule);
  const after = moleculeToSmiles(recovered);
  assert.equal(before.ok, true);
  assert.equal(after.ok, true);
  assert.equal(after.smiles, before.smiles);
  return recovered;
}

test("cloud molecule persistence preserves formal charges and the nitro graph", () => {
  const nitro = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0, element: "N", charge: 1 },
      { id: 3, x: 2, y: 1, element: "O" },
      { id: 4, x: 2, y: -1, element: "O", charge: -1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 2], [2, 4, 1]],
  };

  const recovered = assertSameIsomericSmiles(nitro);
  assert.deepEqual(recovered, nitro);
  assert.equal(recovered.atoms.find(({ id }) => id === 2).charge, 1);
  assert.equal(recovered.atoms.find(({ id }) => id === 4).charge, -1);
});

test("cloud molecule persistence preserves explicit E/Z bond metadata and connectivity", () => {
  const eButene = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 1 },
      { id: 4, x: -1, y: -1 },
      { id: 5, x: 3, y: 1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 2, true], [1, 4, 1], [3, 5, 1]],
  };

  const recovered = assertSameIsomericSmiles(eButene);
  assert.deepEqual(recovered, eButene);
  assert.deepEqual(recovered.bonds, eButene.bonds);
  assert.equal(recovered.bonds[1][3], true);
});

test("cloud molecule persistence preserves R/S parity and its tetrahedral carrier reference", () => {
  const rCenter = {
    atoms: [
      { id: 1, x: 0, y: 0, element: "C", tetrahedralParity: "R", tetrahedralBondTo: 2 },
      { id: 2, x: 1, y: 0, element: "O" },
      { id: 3, x: -1, y: 0, element: "N" },
      { id: 4, x: 0, y: 1, element: "F" },
      { id: 5, x: 0, y: -1 },
    ],
    bonds: [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1]],
  };

  const recovered = assertSameIsomericSmiles(rCenter);
  assert.deepEqual(recovered, rCenter);
  assert.equal(recovered.atoms[0].tetrahedralParity, "R");
  assert.equal(recovered.atoms[0].tetrahedralBondTo, 2);
});

test("cloud persistence retains editor-only directional placement without changing chemical identity", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
      { id: 4, x: 1, y: -1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1], [2, 4, 1]],
    manualDisplayDirections: [{ parentAtomId: 2, childAtomId: 4, direction: "up" }],
  };

  const recovered = assertSameIsomericSmiles(molecule);
  assert.deepEqual(recovered.manualDisplayDirections, molecule.manualDisplayDirections);
  assert.deepEqual(recovered.atoms, molecule.atoms);
  assert.deepEqual(recovered.bonds, molecule.bonds);
  assert.equal(normalizeMoleculePayload({
    ...molecule,
    manualDisplayDirections: [{ parentAtomId: 1, childAtomId: 4, direction: "up" }],
  }), null);
});

test("sulfur is accepted and preserved because the molecule model and chemistry adapter support it", () => {
  const thioether = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0, element: "S" },
      { id: 3, x: 2, y: 0 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1]],
  };

  assert.deepEqual(assertSameIsomericSmiles(thioether), thioether);
});

test("elements and charge states accepted by the actual OpenChemLib adapter remain persistable", () => {
  for (const smiles of ["C[N+](=O)[O-]", "C/C=C/C", "N[C@@](C)C(=O)O", "CS"]) {
    const parsed = moleculeFromSmiles(smiles);
    assert.equal(parsed.ok, true, `${smiles} should be supported by the chemistry adapter`);
    assertSameIsomericSmiles(parsed.molecule);
  }
});

test("legacy payloads without optional chemistry fields remain valid without invented values", () => {
  const legacyMolecule = {
    atoms: [{ id: 7, x: 0, y: 0 }, { id: 8, x: 1, y: 0, element: "O" }],
    bonds: [[7, 8]],
  };

  assert.deepEqual(roundTrip(legacyMolecule), legacyMolecule);
});

test("an explicit neutral charge stays distinct from an omitted charge field", () => {
  const neutral = {
    atoms: [{ id: 1, x: 0, y: 0, charge: 0 }],
    bonds: [],
  };

  const recovered = roundTrip(neutral);
  assert.equal(recovered.atoms[0].charge, 0);
  assert.equal(Object.hasOwn(recovered.atoms[0], "charge"), true);
});

test("invalid chemical metadata is rejected instead of being silently discarded", () => {
  const base = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }],
    bonds: [[1, 2, 2, true]],
  };

  assert.equal(normalizeMoleculePayload({
    ...base,
    atoms: [{ id: 1, x: 0, y: 0, charge: 0.5 }, base.atoms[1]],
  }), null);
  assert.equal(normalizeMoleculePayload({
    ...base,
    atoms: [{ id: 1, x: 0, y: 0, tetrahedralParity: "R", tetrahedralBondTo: 99 }, base.atoms[1]],
  }), null);
  assert.equal(normalizeMoleculePayload({
    ...base,
    bonds: [[1, 2, 1, true]],
  }), null);
  assert.equal(normalizeMoleculePayload({
    ...base,
    atoms: [{ id: 1, x: 0, y: 0, element: "P" }, base.atoms[1]],
  }), null);
});
