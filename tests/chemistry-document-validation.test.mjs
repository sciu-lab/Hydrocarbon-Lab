import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let readChemistryDocument;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, readChemistryDocument } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function makeStructure(molecule, overrides = {}) {
  return {
    name: "test structure",
    formula: analyzeMolecule(molecule).formula,
    family: "acyclic",
    molecule,
    viewMode: "skeletal",
    atomCount: molecule.atoms.length,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    ...overrides,
  };
}

function documentFor(structures, kind = "structure") {
  return {
    format: "laboratorio-quimica-organica",
    version: 1,
    kind,
    exportedAt: "2026-09-28T00:00:00.000Z",
    ...(kind === "structure" ? { structure: structures[0] } : { structures }),
  };
}

function mustRead(structure) {
  return readChemistryDocument(documentFor([structure]))[0];
}

function simpleEthanol() {
  const result = moleculeFromSmiles("CCO");
  assert.equal(result.ok, true);
  return result.molecule;
}

test("accepts a valid current .quimica structure and returns a safe graph copy", () => {
  const molecule = simpleEthanol();
  const structure = makeStructure(molecule);
  const restored = mustRead(structure);

  assert.deepEqual(restored.molecule, molecule);
  assert.equal(restored.formula, structure.formula);
  const ring = moleculeFromSmiles("C1CCCCC1");
  assert.equal(ring.ok, true);
  assert.deepEqual(mustRead(makeStructure(ring.molecule)).molecule, ring.molecule);
});

test("rejects duplicate atom IDs, missing bond endpoints, self-bonds and duplicate edges", () => {
  const duplicateIds = { atoms: [{ id: 1, x: 0, y: 0 }, { id: 1, x: 1, y: 0 }], bonds: [[1, 1, 1]] };
  const missingEndpoint = { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [[1, 2, 1]] };
  const selfBond = { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [[1, 1, 1]] };
  const duplicateBond = { atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }], bonds: [[1, 2, 1], [2, 1, 1]] };

  for (const molecule of [duplicateIds, missingEndpoint, selfBond, duplicateBond]) {
    assert.throws(() => readChemistryDocument(documentFor([makeStructure(molecule, { formula: "CH4" })])));
  }
});

test("rejects unsupported bond orders, elements, non-finite coordinates and malformed charges", () => {
  const cases = [
    { atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }], bonds: [[1, 2, 4]] },
    { atoms: [{ id: 1, x: 0, y: 0, element: "P" }], bonds: [] },
    { atoms: [{ id: 1, x: Number.NaN, y: 0 }], bonds: [] },
    { atoms: [{ id: 1, x: Number.POSITIVE_INFINITY, y: 0 }], bonds: [] },
    { atoms: [{ id: 1, x: 0, y: 0, charge: 0.5 }], bonds: [] },
    { atoms: [{ id: 1, x: 0, y: 0, charge: 1 }], bonds: [] },
  ];

  for (const molecule of cases) {
    assert.throws(() => readChemistryDocument(documentFor([makeStructure(molecule, { formula: "CH4" })])));
  }
});

test("rejects a carbon whose total bond order is five", () => {
  const impossible = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 0, y: 1 }],
    bonds: [[1, 2, 3], [1, 3, 2]],
  };
  assert.throws(() => readChemistryDocument(documentFor([makeStructure(impossible, { formula: "C3H8" })])));
});

test("rejects a declared molecular formula that contradicts the graph", () => {
  const ethanol = simpleEthanol();
  const correctFormula = analyzeMolecule(ethanol).formula;
  assert.throws(() => readChemistryDocument(documentFor([
    makeStructure(ethanol, { formula: "C3H8O" }),
  ])));
  assert.equal(mustRead(makeStructure(ethanol, { formula: correctFormula })).formula, correctFormula);
});

test("rejects atom-count metadata that contradicts the graph", () => {
  const ethanol = simpleEthanol();
  assert.throws(() => readChemistryDocument(documentFor([
    makeStructure(ethanol, { atomCount: ethanol.atoms.length + 1 }),
  ])));
});

test("compares ASCII and Unicode subscripts and accepts old files missing optional graph metadata", () => {
  const legacyMethane = {
    atoms: [{ id: 1, x: 0, y: 0 }],
    bonds: [],
  };
  const oldStructure = makeStructure(legacyMethane, { formula: "CH4" });
  const oldDocument = {
    ...documentFor([oldStructure]),
    profile: "traditional",
    structure: { ...oldStructure, molecule: legacyMethane },
  };

  const [restored] = readChemistryDocument(oldDocument);
  assert.deepEqual(restored.molecule, legacyMethane);
  assert.equal(restored.formula, "CH4");
});

test("preserves supported charged nitro and specified stereochemistry", () => {
  for (const smiles of ["C[N+](=O)[O-]", "C/C=C/C", "N[C@@](C)C(=O)O", "CS"]) {
    const result = moleculeFromSmiles(smiles);
    assert.equal(result.ok, true, smiles);
    assert.deepEqual(mustRead(makeStructure(result.molecule)).molecule, result.molecule, smiles);
  }
});

test("a library is validated in full before its structures are returned for import", () => {
  const valid = makeStructure(simpleEthanol());
  const invalid = makeStructure(simpleEthanol(), { formula: "C3H8O" });
  assert.throws(() => readChemistryDocument(documentFor([valid, invalid], "library")));
});
