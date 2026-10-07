import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { calculateSemiDevelopedLayout, selectSemiDevelopedDisplayPath } from "../app/semi-developed-layout.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
before(async () => { chemistry = await loadExerciseChemistry(); });
after(async () => { await chemistry?.close(); });

function imported(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.error);
  return result.molecule;
}

function layout(molecule) {
  const preferred = chemistry.engine.analyzeMolecule(molecule).mainChain;
  const stereoBonds = molecule.bonds.flatMap(([leftAtomId, rightAtomId, order = 1, explicitEZ]) => {
    if (order !== 2 || explicitEZ !== true) return [];
    const inspection = inspectDoubleBondStereochemistry(molecule, leftAtomId, rightAtomId);
    return inspection.stereogenic && inspection.configuration
      ? [{ leftAtomId, rightAtomId, configuration: inspection.configuration }]
      : [];
  });
  return calculateSemiDevelopedLayout(molecule, preferred, stereoBonds);
}

function assertOrthogonal(molecule, positions) {
  for (const [left, right] of molecule.bonds) {
    const start = positions.get(left), end = positions.get(right);
    assert.ok(start && end, `both endpoints for ${left}-${right} are laid out`);
    const horizontal = Math.abs(start.y - end.y) < 0.001;
    const vertical = Math.abs(start.x - end.x) < 0.001;
    assert.ok(horizontal || vertical, `bond ${left}-${right} is orthogonal: ${JSON.stringify({ start, end })}`);
  }
}

const supportedAcyclic = [
  ["propane", "CCC"],
  ["hexane", "CCCCCC"],
  ["decane", "CCCCCCCCCC"],
  ["2-methylbutane", "CC(C)CC"],
  ["highly branched alkane", "CC(C)(C)C"],
  ["alkene", "CC=CC"],
  ["alkyne", "CC#CC"],
  ["terminal alcohol", "CCO"],
  ["internal alcohol", "CC(O)C"],
  ["halogen", "CC(Cl)C"],
  ["ether", "CCOCC"],
  ["ketone", "CCC(=O)CC"],
  ["carboxylic acid", "CCC(=O)O"],
  ["ester", "CC(=O)OCC"],
  ["amine", "CCNC"],
  ["amide", "CC(=O)NC"],
  ["nitrile", "CCC#N"],
  ["nitro", "CC[N+](=O)[O-]"],
  ["E alkene", "C/C=C/C"],
  ["Z alkene", "C/C=C\\C"],
];

test("acyclic supported structures use horizontal or vertical atom-to-atom bonds", () => {
  for (const [name, smiles] of supportedAcyclic) {
    const molecule = imported(smiles);
    const snapshot = structuredClone(molecule);
    const preferred = chemistry.engine.analyzeMolecule(molecule).mainChain;
    const positions = layout(molecule);
    assertOrthogonal(molecule, positions);
    if (name !== "E alkene" && name !== "Z alkene") {
      const path = selectSemiDevelopedDisplayPath(molecule, preferred);
      assert.ok(path.every((id) => Math.abs(positions.get(id).y - positions.get(path[0]).y) < 0.001), `${name} display path stays horizontal`);
    }
    const displayPath = new Set(selectSemiDevelopedDisplayPath(molecule, preferred));
    for (const [left, right] of molecule.bonds) {
      const parent = displayPath.has(left) ? left : displayPath.has(right) ? right : null;
      const child = parent === left ? right : parent === right ? left : null;
      if (parent === null || child === null || displayPath.has(child)) continue;
      assert.equal(positions.get(parent).x, positions.get(child).x, `${name} branch root is vertical`);
    }
    const points = [...positions.values()];
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        assert.ok(Math.abs(points[left].x - points[right].x) >= 104 || Math.abs(points[left].y - points[right].y) >= 104,
          `${name} label anchors keep collision spacing`);
      }
    }
    assert.deepEqual(molecule, snapshot, `${name} layout does not mutate its graph`);
  }
});

test("the ester display path continues through carbonyl carbon, ester oxygen and alkoxy chain", () => {
  const molecule = imported("CC(=O)OCC");
  const preferred = chemistry.engine.analyzeMolecule(molecule).mainChain;
  const path = selectSemiDevelopedDisplayPath(molecule, preferred);
  const carbonylBond = molecule.bonds.find(([left, right, order]) => order === 2
    && molecule.atoms.find((atom) => atom.id === left)?.element === "O"
    && molecule.atoms.find((atom) => atom.id === right)?.element === "C")
    ?? molecule.bonds.find(([left, right, order]) => order === 2
      && molecule.atoms.find((atom) => atom.id === right)?.element === "O"
      && molecule.atoms.find((atom) => atom.id === left)?.element === "C");
  assert.ok(carbonylBond, "ester has a carbonyl bond");
  const elementOf = (id) => molecule.atoms.find((atom) => atom.id === id)?.element;
  const carbonylO = carbonylBond.find((id) => elementOf(id) === "O");
  const carbonylC = carbonylO === carbonylBond[0] ? carbonylBond[1] : carbonylBond[0];
  const esterO = molecule.bonds
    .filter(([left, right, order = 1]) => order === 1 && (left === carbonylC || right === carbonylC))
    .map(([left, right]) => left === carbonylC ? right : left)
    .find((id) => molecule.atoms.find((atom) => atom.id === id)?.element === "O");
  assert.ok(esterO, "ester has a single-bond connector oxygen");
  assert.ok(path.includes(carbonylC));
  assert.ok(path.includes(esterO));
  assert.ok(!path.includes(carbonylO));
  const positions = layout(molecule);
  assert.equal(path.length, 5, "display path goes from alkyl carbon through carbonyl carbon and ester oxygen to alkoxy terminal carbon");
  assert.ok(path.every((id) => Math.abs(positions.get(id).y - positions.get(path[0]).y) < 0.001));
  const carbonylPosition = positions.get(carbonylC), oxygenPosition = positions.get(carbonylO);
  assert.ok(Math.abs(carbonylPosition.x - oxygenPosition.x) < 0.001);
  assert.ok(Math.abs(carbonylPosition.y - oxygenPosition.y) > 100);
  assertOrthogonal(molecule, positions);
});

test("terminal OH can continue the display path while internal OH and halogens branch vertically", () => {
  const terminalAlcohol = imported("CCO");
  const terminalPath = selectSemiDevelopedDisplayPath(terminalAlcohol, chemistry.engine.analyzeMolecule(terminalAlcohol).mainChain);
  const terminalO = terminalAlcohol.atoms.find((atom) => atom.element === "O").id;
  assert.ok(terminalPath.includes(terminalO));
  const terminalPositions = layout(terminalAlcohol);
  assert.equal(terminalPositions.get(terminalO).y, terminalPositions.get(terminalPath.at(-2)).y);

  for (const smiles of ["CC(O)C", "CC(Cl)C"]) {
    const molecule = imported(smiles);
    const positions = layout(molecule);
    const substituent = molecule.atoms.find((atom) => atom.element === "O" || atom.element === "Cl");
    const bond = molecule.bonds.find(([left, right]) => left === substituent.id || right === substituent.id);
    const parent = bond[0] === substituent.id ? bond[1] : bond[0];
    assert.equal(positions.get(substituent.id).x, positions.get(parent).x);
    assert.ok(Math.abs(positions.get(substituent.id).y - positions.get(parent).y) > 100);
  }
});

test("E and Z stay distinguishable with an orthogonal horizontal C=C", () => {
  const results = ["C/C=C/C", "C/C=C\\C"].map((smiles) => {
    const molecule = imported(smiles);
    const positions = layout(molecule);
    const displayed = {
      ...molecule,
      atoms: molecule.atoms.map((atom) => ({ ...atom, ...positions.get(atom.id) })),
    };
    const alkene = molecule.bonds.find((bond) => bond[2] === 2);
    assert.equal(positions.get(alkene[0]).y, positions.get(alkene[1]).y, "the stereogenic C=C stays horizontal");
    const expected = inspectDoubleBondStereochemistry(molecule, alkene[0], alkene[1]);
    for (const priorityId of expected.priorityAtomIds) {
      const parentId = alkene.includes(priorityId) ? null : molecule.bonds
        .find(([left, right]) => (left === priorityId && alkene.includes(right)) || (right === priorityId && alkene.includes(left)))
        ?.find((id) => id !== priorityId);
      assert.ok(parentId !== undefined && parentId !== null);
      assert.equal(positions.get(priorityId).x, positions.get(parentId).x, "stereogenic substituent is a vertical branch");
    }
    const actual = inspectDoubleBondStereochemistry(displayed, alkene[0], alkene[1]);
    assert.equal(actual.configuration, expected.configuration);
    assertOrthogonal(molecule, positions);
    return actual.configuration;
  });
  assert.notEqual(results[0], results[1]);
});
