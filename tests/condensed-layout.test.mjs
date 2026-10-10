import assert from "node:assert/strict";
import test from "node:test";

import { buildCondensedRenderModel, isCondensedGraphAvailable } from "../app/condensed-layout.ts";

function graph(elements, bonds, options = {}) {
  return {
    atoms: elements.map((element, index) => ({ id: index + 1, element, ...options.atoms?.[index] })),
    bonds: bonds.map(([left, right, order = 1]) => [left, right, order]),
    ...(options.rings ? { rings: options.rings } : {}),
  };
}

function render(molecule, hydrogens, options) {
  return buildCondensedRenderModel(molecule, (atomId) => hydrogens[atomId] ?? 0, options);
}

const fixtures = [
  ["ethane", graph(["C", "C"], [[1, 2]]), { 1: 3, 2: 3 }, "CH3–CH3"],
  ["butane", graph(["C", "C", "C", "C"], [[1, 2], [2, 3], [3, 4]]), { 1: 3, 2: 2, 3: 2, 4: 3 }, "CH3–CH2–CH2–CH3"],
  ["2-methylbutane", graph(["C", "C", "C", "C", "C"], [[1, 2], [2, 3], [3, 4], [2, 5]]), { 1: 3, 2: 1, 3: 2, 4: 3, 5: 3 }, "CH3–CH(CH3)–CH2–CH3"],
  ["2,2-dimethylbutane", graph(["C", "C", "C", "C", "C", "C"], [[1, 2], [2, 3], [3, 4], [2, 5], [2, 6]]), { 1: 3, 2: 0, 3: 2, 4: 3, 5: 3, 6: 3 }, "CH3–C(CH3)(CH3)–CH2–CH3"],
  ["but-2-ene", graph(["C", "C", "C", "C"], [[1, 2], [2, 3, 2], [3, 4]]), { 1: 3, 2: 1, 3: 1, 4: 3 }, "CH3–CH=CH–CH3"],
  ["but-2-yne", graph(["C", "C", "C", "C"], [[1, 2], [2, 3, 3], [3, 4]]), { 1: 3, 2: 0, 3: 0, 4: 3 }, "CH3–C≡C–CH3"],
  ["2-chloropropane", graph(["C", "C", "C", "Cl"], [[1, 2], [2, 3], [2, 4]]), { 1: 3, 2: 1, 3: 3, 4: 0 }, "CH3–CH(Cl)–CH3"],
  ["propan-2-ol", graph(["C", "C", "C", "O"], [[1, 2], [2, 3], [2, 4]]), { 1: 3, 2: 1, 3: 3, 4: 1 }, "CH3–CH(OH)–CH3"],
  ["ethyl methyl ether", graph(["C", "O", "C", "C"], [[1, 2], [2, 3], [3, 4]]), { 1: 3, 2: 0, 3: 2, 4: 3 }, "CH3–O–CH2–CH3"],
  ["aldehyde", graph(["C", "C", "C", "O"], [[1, 2], [2, 3], [3, 4, 2]]), { 1: 3, 2: 2, 3: 1, 4: 0 }, "CH3–CH2–C(=O)H"],
  ["ketone", graph(["C", "C", "C", "O"], [[1, 2], [2, 3], [2, 4, 2]]), { 1: 3, 2: 0, 3: 3, 4: 0 }, "CH3–C(=O)–CH3"],
  ["carboxylic acid", graph(["C", "C", "O", "O"], [[1, 2], [2, 3, 2], [2, 4]]), { 1: 3, 2: 0, 3: 0, 4: 1 }, "CH3–C(=O)–OH"],
  ["ester", graph(["C", "C", "O", "O", "C", "C"], [[1, 2], [2, 3, 2], [2, 4], [4, 5], [5, 6]]), { 1: 3, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3 }, "CH3–C(=O)–O–CH2–CH3"],
  ["amine", graph(["C", "N"], [[1, 2]]), { 1: 3, 2: 2 }, "CH3–NH2"],
  ["amide", graph(["C", "C", "O", "N"], [[1, 2], [2, 3, 2], [2, 4]]), { 1: 3, 2: 0, 3: 0, 4: 2 }, "CH3–C(=O)–NH2"],
  ["nitrile", graph(["C", "C", "N"], [[1, 2], [2, 3, 3]]), { 1: 3, 2: 0, 3: 0 }, "CH3–C≡N"],
  ["nitro", graph(["C", "N", "O", "O"], [[1, 2], [2, 3, 2], [2, 4]], {
    atoms: [{}, { charge: 1 }, {}, { charge: -1 }],
  }), { 1: 3, 2: 0, 3: 0, 4: 0 }, "CH3–N(=O)–O"],
];

test("acyclic structural formulas cover representative groups with atom- and bond-linked tokens", () => {
  for (const [name, molecule, hydrogens, expected] of fixtures) {
    const model = render(molecule, hydrogens);
    assert.equal(model.available, true, name);
    assert.equal(model.formulaText, expected, name);
    const atoms = model.tokens.filter((token) => token.type === "atom");
    const bonds = model.tokens.filter((token) => token.type === "bond");
    assert.equal(atoms.length, molecule.atoms.length, `${name}: every atom appears once`);
    assert.deepEqual(new Set(atoms.map((token) => token.atomId)), new Set(molecule.atoms.map((atom) => atom.id)), `${name}: atom identity`);
    assert.equal(bonds.length, molecule.bonds.length, `${name}: every graph bond appears once`);
    for (const [left, right, order = 1] of molecule.bonds) {
      assert.ok(bonds.some((token) => token.bondId === `${Math.min(left, right)}:${Math.max(left, right)}`
        && token.order === order && token.atomIds.includes(left) && token.atomIds.includes(right)), `${name}: bond ${left}-${right}`);
    }
  }
});

test("canonical token order is independent of atom and bond insertion order and IDs", () => {
  const original = fixtures.find(([name]) => name === "2-methylbutane");
  const [, molecule, hydrogenCounts] = original;
  const expected = render(molecule, hydrogenCounts).formulaText;
  const idMap = new Map([[1, 91], [2, 34], [3, 72], [4, 18], [5, 55]]);
  const remapped = {
    atoms: [...molecule.atoms].reverse().map((atom) => ({ ...atom, id: idMap.get(atom.id) })),
    bonds: [...molecule.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
  };
  const hydrogens = Object.fromEntries([...idMap].map(([oldId, newId]) => [newId, hydrogenCounts[oldId]]));
  assert.equal(render(remapped, hydrogens).formulaText, expected);
});

test("atom locants, tetrahedral badges, E/Z badges, and bond identity stay attached to graph IDs", () => {
  const molecule = graph(["C", "C", "C", "C"], [[1, 2], [2, 3, 2], [3, 4]], {
    atoms: [{}, { tetrahedralParity: "R" }, {}, {}],
  });
  const model = render(molecule, { 1: 3, 2: 0, 3: 1, 4: 3 }, {
    numbering: new Map([[1, 1], [2, 2], [3, 3], [4, 4]]),
    stereoBonds: [{ atomIds: [2, 3], configuration: "E" }],
    includeTetrahedralParity: true,
  });
  assert.equal(model.tokens.find((token) => token.type === "atom" && token.atomId === 2).locant, 2);
  assert.equal(model.tokens.find((token) => token.type === "atom" && token.atomId === 2).tetrahedralParity, "R");
  assert.ok(model.tokens.some((token) => token.type === "ez-badge" && token.bondId === "2:3" && token.configuration === "E"));
});

test("branch atom token widths leave deterministic side bearings for parentheses", () => {
  const molecule = fixtures.find(([name]) => name === "2,2-dimethylbutane")[1];
  const model = render(molecule, { 1: 3, 2: 0, 3: 2, 4: 3, 5: 3, 6: 3 });
  const branches = model.tokens.filter((token) => token.type === "atom" && token.branchDepth > 0);
  assert.equal(branches.length, 2);
  for (const token of branches) {
    const subscriptLength = token.text.match(/[0-9]+$/)?.[0].length ?? 0;
    const baseLength = token.text.length - subscriptLength;
    const conservativeTextWidth = baseLength * 21 + subscriptLength * 13;
    assert.ok(token.width - conservativeTextWidth >= 14, "both sides reserve room for branch delimiters");
  }
});

test("rings, aromatic cycles, and disconnected graphs are unavailable instead of formula fallbacks", () => {
  const ring = graph(["C", "C", "C"], [[1, 2], [2, 3], [3, 1]], { rings: [{ atomIds: [1, 2, 3] }] });
  const inferredRing = graph(["C", "C", "C"], [[1, 2], [2, 3], [3, 1]]);
  const disconnected = graph(["C", "C"], []);
  for (const molecule of [ring, inferredRing]) {
    assert.deepEqual(render(molecule, () => 0), { available: false, reason: "cyclic" });
    assert.equal(isCondensedGraphAvailable(molecule), false);
  }
  assert.deepEqual(render(disconnected, () => 0), { available: false, reason: "disconnected" });
});
