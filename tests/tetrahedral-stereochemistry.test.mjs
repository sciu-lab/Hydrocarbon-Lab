import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import {
  formatStereochemicalName,
  inspectDoubleBondStereochemistry,
} from "../app/double-bond-stereochemistry.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { resolveChemicalName } from "../app/name-structure-resolver.ts";
import {
  inspectSmilesStructure,
  moleculeFromSmiles,
  moleculeToSmiles,
} from "../app/openchemlib-adapter.ts";
import {
  getMainChainTetrahedralDescriptors,
  getTetrahedralStereoBonds,
  getTetrahedralStereoCenters,
  sanitizeTetrahedralStereochemistry,
  toggleTetrahedralConfiguration,
} from "../app/tetrahedral-stereochemistry.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => { await server?.close(); });

function imported(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.molecule;
}

function exported(molecule) {
  const result = moleculeToSmiles(molecule);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.smiles;
}

function displayedMolecule(molecule) {
  const positions = calculateMolecule2DLayout(
    molecule,
    molecule.atoms.map((atom) => atom.id),
  );
  return {
    ...molecule,
    atoms: molecule.atoms.map((atom) => ({ ...atom, ...positions.get(atom.id) })),
  };
}

function constitution(molecule) {
  return {
    atoms: molecule.atoms.map(({ id, element = "C", charge = 0 }) => ({ id, element, charge })),
    bonds: molecule.bonds.map(([left, right, order = 1]) => [left, right, order]),
  };
}

test("imports, names and draws (2R)- and (2S)-butan-2-ol as opposite configurations", () => {
  const r = imported("C[C@@H](O)CC");
  const s = imported("C[C@H](O)CC");
  const rCenter = getTetrahedralStereoCenters(r)[0];
  const sCenter = getTetrahedralStereoCenters(s)[0];
  assert.equal(rCenter.configuration, "R");
  assert.equal(sCenter.configuration, "S");
  assert.deepEqual(constitution(r), constitution(s));
  assert.equal(inspectSmilesStructure(exported(r)).formula, inspectSmilesStructure(exported(s)).formula);
  assert.notEqual(exported(r), exported(s));
  assert.equal(formatStereochemicalName(r, [1, 2, 4, 5], "butan-2-ol"), "(2R)-butan-2-ol");
  assert.equal(formatStereochemicalName(s, [1, 2, 4, 5], "butan-2-ol"), "(2S)-butan-2-ol");

  const rBond = getTetrahedralStereoBonds(displayedMolecule(r))[0];
  const sBond = getTetrahedralStereoBonds(displayedMolecule(s))[0];
  assert.equal(rBond.configuration, "R");
  assert.equal(sBond.configuration, "S");
  assert.equal(rBond.neighborAtomId, sBond.neighborAtomId);
  assert.notEqual(rBond.style, sBond.style, "fixed coordinates require opposite wedge/hash parity");
});

test("supports the real stereogenic C3 of (3R)- and (3S)-3-methylhexane", () => {
  const r = imported("CC[C@@H](C)CCC");
  const s = imported("CC[C@H](C)CCC");
  assert.deepEqual(getMainChainTetrahedralDescriptors(r, [1, 2, 3, 5, 6, 7]), [
    { atomId: 3, configuration: "R", locant: 3 },
  ]);
  assert.deepEqual(getMainChainTetrahedralDescriptors(s, [1, 2, 3, 5, 6, 7]), [
    { atomId: 3, configuration: "S", locant: 3 },
  ]);
  assert.deepEqual(constitution(r), constitution(s));
  assert.notEqual(exported(r), exported(s));
});

test("preserves two tetrahedral centers and simultaneous R/S plus E/Z", () => {
  const twoCenters = imported("C[C@H](O)[C@@H](F)C");
  assert.equal(getTetrahedralStereoCenters(twoCenters).length, 2);
  assert.equal(getTetrahedralStereoBonds(displayedMolecule(twoCenters)).length, 2);
  assert.equal(getTetrahedralStereoCenters(imported(exported(twoCenters))).length, 2);

  const mixed = imported("F/C=C/[C@H](Cl)Br");
  const alkene = mixed.bonds.find(([, , order = 1]) => order === 2);
  assert.ok(alkene);
  assert.equal(inspectDoubleBondStereochemistry(mixed, alkene[0], alkene[1]).configuration, "E");
  assert.equal(getTetrahedralStereoCenters(mixed)[0].configuration, "R");
  const roundTrip = imported(exported(mixed));
  const roundTripAlkene = roundTrip.bonds.find(([, , order = 1]) => order === 2);
  assert.equal(inspectDoubleBondStereochemistry(roundTrip, roundTripAlkene[0], roundTripAlkene[1]).configuration, "E");
  assert.equal(getTetrahedralStereoCenters(roundTrip)[0].configuration, "R");
});

test("R to S to R interaction and undo/redo snapshots change configuration only", () => {
  const original = imported("C[C@@H](O)CC");
  const atomId = getTetrahedralStereoCenters(original)[0].atomId;
  const undoSnapshot = structuredClone(original);
  const toS = toggleTetrahedralConfiguration(original, atomId);
  assert.equal(toS.ok, true);
  assert.equal(toS.configuration, "S");
  assert.deepEqual(constitution(toS.molecule), constitution(original));
  assert.notEqual(exported(toS.molecule), exported(original));
  const redoSnapshot = structuredClone(toS.molecule);
  const backToR = toggleTetrahedralConfiguration(toS.molecule, atomId);
  assert.equal(backToR.ok, true);
  assert.equal(backToR.configuration, "R");
  assert.equal(exported(backToR.molecule), exported(original));
  assert.equal(getTetrahedralStereoCenters(undoSnapshot)[0].configuration, "R");
  assert.equal(getTetrahedralStereoCenters(redoSnapshot)[0].configuration, "S");
});

test("absolute configuration survives atom-ID remapping and coordinate changes", () => {
  const source = imported("CC[C@@H](C)CCC");
  const remap = new Map(source.atoms.map((atom, index) => [atom.id, 101 + index * 17]));
  const transformed = {
    ...source,
    atoms: source.atoms.toReversed().map((atom, index) => ({
      ...atom,
      id: remap.get(atom.id),
      x: atom.y * 3.7 + index,
      y: -atom.x * 2.1 - index * 0.4,
    })),
    bonds: source.bonds.toReversed().map(([left, right, order]) => [
      remap.get(right),
      remap.get(left),
      order,
    ]),
    rings: source.rings?.map((ring) => ({
      ...ring,
      atomIds: ring.atomIds.map((atomId) => remap.get(atomId)),
    })),
  };
  const roundTrip = imported(exported(transformed));
  assert.equal(getTetrahedralStereoCenters(roundTrip)[0].configuration, "R");
  assert.equal(inspectSmilesStructure(exported(transformed)).formula, "C7H16");
  assert.equal(getTetrahedralStereoBonds(transformed)[0].configuration, "R");
});

test("removes a stored descriptor when equivalent substituents make the atom achiral", () => {
  const achiral = imported("CCC(C)CC");
  const candidate = achiral.atoms.find((atom) =>
    achiral.bonds.filter(([left, right]) => left === atom.id || right === atom.id).length === 3,
  );
  const invalid = {
    ...achiral,
    atoms: achiral.atoms.map((atom) => atom.id === candidate.id
      ? { ...atom, tetrahedralParity: "R" }
      : atom),
  };
  assert.equal(getTetrahedralStereoCenters(invalid).length, 0);
  assert.equal(
    sanitizeTetrahedralStereochemistry(invalid).atoms.some((atom) => atom.tetrahedralParity),
    false,
  );
});

test("name resolution flows through OPSIN, import, final layout and R/S analysis", async () => {
  const smilesByDescriptor = new Map([
    ["2R", "C[C@@H](O)CC"],
    ["2S", "C[C@H](O)CC"],
    ["3R", "CC[C@@H](C)CCC"],
    ["3S", "CC[C@H](C)CCC"],
  ]);
  const fetchImpl = async (input) => {
    const decoded = decodeURIComponent(String(input));
    const descriptor = [...smilesByDescriptor.keys()].find((key) => decoded.includes(`(${key})`));
    return descriptor
      ? new Response(JSON.stringify({ status: "SUCCESS", smiles: smilesByDescriptor.get(descriptor) }), { status: 200 })
      : new Response(JSON.stringify({ status: "FAILURE" }), { status: 404 });
  };
  for (const [name, expected, mainChain] of [
    ["(2R)-butan-2-ol", "R", [1, 2, 4, 5]],
    ["(2S)-butan-2-ol", "S", [1, 2, 4, 5]],
    ["(3R)-3-metilhexano", "R", [1, 2, 3, 5, 6, 7]],
    ["(3S)-3-metilhexano", "S", [1, 2, 3, 5, 6, 7]],
  ]) {
    const resolution = await resolveChemicalName(name, { fetchImpl, timeoutMs: 1_000 });
    assert.equal(resolution.ok, true, name);
    const molecule = displayedMolecule(imported(resolution.value.smiles));
    const analysis = analyzeMolecule(molecule);
    assert.deepEqual(analysis.mainChain, mainChain, `${name}: final analysis numbering`);
    assert.equal(getMainChainTetrahedralDescriptors(molecule, analysis.mainChain)[0].configuration, expected, name);
    assert.match(formatStereochemicalName(molecule, analysis.mainChain, analysis.name), new RegExp(`\\(${expected === "R" || expected === "S" ? mainChain.indexOf(getTetrahedralStereoCenters(molecule)[0].atomId) + 1 : ""}${expected}\\)-`), name);
    assert.equal(getTetrahedralStereoBonds(molecule)[0].configuration, expected, name);
  }
});

test("testosterone and cholesterol preserve every imported tetrahedral center after final layout", () => {
  const steroids = new Map([
    ["testosterone", "C[C@]12CC[C@H]3[C@@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C"],
    ["cholesterol", "CC(C)CCC[C@@H](C)[C@H]1CC[C@@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C"],
  ]);
  for (const [name, smiles] of steroids) {
    const inspection = inspectSmilesStructure(smiles);
    assert.equal(inspection.ok, true, name);
    assert.equal(inspection.unpreservedTetrahedralStereoCenterCount, 0, name);
    const molecule = displayedMolecule(imported(smiles));
    const centers = getTetrahedralStereoCenters(molecule);
    assert.equal(centers.length, inspection.tetrahedralStereoCenterCount, name);
    assert.equal(getTetrahedralStereoBonds(molecule).length, centers.length, name);
    const roundTrip = inspectSmilesStructure(exported(molecule));
    assert.equal(roundTrip.preservedTetrahedralStereoCenterCount, centers.length, name);
    assert.equal(roundTrip.formula, inspection.formula, name);
  }
});
