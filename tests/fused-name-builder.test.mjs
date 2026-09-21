import assert from "node:assert/strict";
import test from "node:test";

import { fuseRingOnBond, removeFusedRingAtom } from "../app/fused-ring.ts";
import {
  getFusedBicyclicSystem,
  getFusedTetracyclicSystem,
  getFusedTricyclicSystem,
} from "../app/fused-ring-nomenclature.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import { dynamicUiText } from "../app/i18n.ts";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";

function makeRing(size, firstId = 1) {
  const atoms = Array.from({ length: size }, (_, index) => ({
    id: firstId + index,
    x: Math.cos(index * Math.PI * 2 / size),
    y: Math.sin(index * Math.PI * 2 / size),
  }));
  return {
    atoms,
    bonds: atoms.map((atom, index) => [atom.id, atoms[(index + 1) % size].id, 1]),
    rings: [{ id: 1, kind: "cycloalkane", atomIds: atoms.map((atom) => atom.id) }],
  };
}

function makeTricycle(middleSize = 6, terminalSize = 6, topology = "linear") {
  let molecule = fuseRingOnBond(makeRing(6), 1, 2, middleSize);
  const middle = molecule.rings[1];
  const edgeIndex = middleSize === 6 && topology === "linear" ? 2 : 1;
  return fuseRingOnBond(
    molecule,
    middle.atomIds[edgeIndex],
    middle.atomIds[edgeIndex + 1],
    terminalSize,
  );
}

function fuseNext(molecule, ringSize, disposition) {
  const terminal = molecule.rings.at(-1);
  const edgeIndex = terminal.atomIds.length === 6 && disposition === "linear" ? 2 : 1;
  return fuseRingOnBond(
    molecule,
    terminal.atomIds[edgeIndex],
    terminal.atomIds[(edgeIndex + 1) % terminal.atomIds.length],
    ringSize,
  );
}

function makeTetracycle(sizes = [6, 6, 6, 6], dispositions = ["linear", "linear"]) {
  let molecule = fuseRingOnBond(makeRing(sizes[0]), 1, 2, sizes[1]);
  molecule = fuseNext(molecule, sizes[2], dispositions[0]);
  return fuseNext(molecule, sizes[3], dispositions[1]);
}

function atomSignature(molecule, atomId) {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  const bonds = molecule.bonds.filter(([left, right]) => left === atomId || right === atomId);
  return `${atom?.element ?? "C"}|${bonds.length}|${bonds.map((bond) => bond[2] ?? 1).sort().join(",")}`;
}

function molecularGraphsAreIsomorphic(left, right) {
  if (left.atoms.length !== right.atoms.length || left.bonds.length !== right.bonds.length) return false;
  const adjacency = (molecule) => new Map(molecule.atoms.map((atom) => [
    atom.id,
    new Map(molecule.bonds.flatMap(([first, second, order = 1]) => {
      if (first === atom.id) return [[second, order]];
      if (second === atom.id) return [[first, order]];
      return [];
    })),
  ]));
  const leftAdjacency = adjacency(left);
  const rightAdjacency = adjacency(right);
  const candidates = new Map(left.atoms.map((atom) => [
    atom.id,
    right.atoms
      .filter((candidate) => atomSignature(left, atom.id) === atomSignature(right, candidate.id))
      .map((candidate) => candidate.id),
  ]));
  if ([...candidates.values()].some((values) => values.length === 0)) return false;
  const order = left.atoms.map((atom) => atom.id).sort((first, second) => (
    candidates.get(first).length - candidates.get(second).length
    || rightAdjacency.get(second)?.size - rightAdjacency.get(first)?.size
  ));
  const mapping = new Map();
  const used = new Set();
  const visit = (index) => {
    if (index === order.length) return true;
    const leftId = order[index];
    for (const rightId of candidates.get(leftId)) {
      if (used.has(rightId)) continue;
      const compatible = [...mapping].every(([mappedLeft, mappedRight]) => (
        leftAdjacency.get(leftId).get(mappedLeft) === rightAdjacency.get(rightId).get(mappedRight)
      ));
      if (!compatible) continue;
      mapping.set(leftId, rightId);
      used.add(rightId);
      if (visit(index + 1)) return true;
      mapping.delete(leftId);
      used.delete(rightId);
    }
    return false;
  };
  return visit(0);
}

function detectedOxygenGroups(molecule) {
  return molecule.atoms.filter((atom) => atom.element === "O").flatMap((oxygen) => {
    const bond = molecule.bonds.find(([left, right]) => left === oxygen.id || right === oxygen.id);
    if (!bond) return [];
    const carbonId = bond[0] === oxygen.id ? bond[1] : bond[0];
    return [{
      kind: (bond[2] ?? 1) === 2 ? "ketone" : "alcohol",
      carbonId,
      heteroAtomId: oxygen.id,
      atomIds: [carbonId, oxygen.id],
    }];
  });
}

function fusedSystem(molecule) {
  const groups = detectedOxygenGroups(molecule);
  if (molecule.rings?.length === 2) return getFusedBicyclicSystem(molecule, groups);
  if (molecule.rings?.length === 3) return getFusedTricyclicSystem(molecule, groups);
  return getFusedTetracyclicSystem(molecule, groups);
}

function molecularFormula(molecule) {
  const valence = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  molecule.bonds.forEach(([left, right, order = 1]) => {
    valence.set(left, valence.get(left) + order);
    valence.set(right, valence.get(right) + order);
  });
  const carbons = molecule.atoms.filter((atom) => (atom.element ?? "C") === "C").length;
  const oxygens = molecule.atoms.filter((atom) => atom.element === "O").length;
  const hydrogens = molecule.atoms.reduce((total, atom) => (
    total + Math.max(0, (atom.element === "O" ? 2 : 4) - valence.get(atom.id))
  ), 0);
  return `C${carbons}H${hydrogens}${oxygens ? `O${oxygens === 1 ? "" : oxygens}` : ""}`;
}

function remapMolecule(molecule) {
  const remap = new Map(molecule.atoms.map((atom, index) => [
    atom.id,
    2000 + (molecule.atoms.length - index) * 19,
  ]));
  return {
    atoms: [...molecule.atoms].reverse().map((atom) => ({
      ...atom,
      id: remap.get(atom.id),
      x: atom.y,
      y: -atom.x,
    })),
    bonds: [...molecule.bonds].reverse().map(([left, right, order]) => [
      remap.get(right), remap.get(left), order,
    ]),
    rings: [...molecule.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 80 + index,
      atomIds: [...ring.atomIds].reverse().map((atomId) => remap.get(atomId)),
    })),
  };
}

function build(name) {
  const result = buildHydrocarbonFromIupacName(name);
  assert.equal(result.ok, true, result.ok ? undefined : `${name}: ${result.error}`);
  assert.equal(result.inputFamily, "fused-von-baeyer");
  return result.molecule;
}

function superscriptDescriptor(name) {
  const digits = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return name.replace(/\^\{(\d+),(\d+)\}/g, (_match, left, right) => (
    `${[...left].map((digit) => digits[digit]).join("")},${[...right].map((digit) => digits[digit]).join("")}`
  ));
}

function parenthesizedSuperscriptDescriptor(name) {
  const digits = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return name.replace(/\^\{(\d+),(\d+)\}/g, (_match, left, right) => (
    `⁽${[...left].map((digit) => digits[digit]).join("")},${[...right].map((digit) => digits[digit]).join("")}⁾`
  ));
}

function assertRoundTrip(source, spanishName, englishName) {
  for (const name of [
    spanishName,
    englishName,
    superscriptDescriptor(englishName),
    parenthesizedSuperscriptDescriptor(spanishName),
  ]) {
    const rebuilt = build(name);
    assert.equal(molecularGraphsAreIsomorphic(source, rebuilt), true, name);
    assert.equal(rebuilt.rings?.length, source.rings?.length, name);
    const reconstructedName = rebuilt.rings?.length === 2
      ? getFusedBicyclicSystem(rebuilt)?.systematicName
      : rebuilt.rings?.length === 3
        ? getFusedTricyclicSystem(rebuilt)?.systematicName
        : getFusedTetracyclicSystem(rebuilt)?.systematicName;
    assert.equal(reconstructedName, spanishName, name);
  }
}

function assertDerivedRoundTrip(spanishName, englishName, expectedFormula) {
  const source = build(spanishName);
  const system = fusedSystem(source);
  assert.ok(system?.systematicName, spanishName);
  assert.equal(system.systematicName, spanishName);
  if ("systematicNameEn" in system) assert.equal(system.systematicNameEn, englishName);
  assert.equal(molecularFormula(source), expectedFormula, spanishName);

  const fromGeneratedName = build(system.systematicName);
  const fromEnglish = build(englishName);
  const fromUnicode = build(parenthesizedSuperscriptDescriptor(englishName));
  assert.equal(molecularGraphsAreIsomorphic(source, fromGeneratedName), true, spanishName);
  assert.equal(molecularGraphsAreIsomorphic(source, fromEnglish), true, englishName);
  assert.equal(molecularGraphsAreIsomorphic(source, fromUnicode), true, `${englishName} unicode`);

  const remapped = remapMolecule(source);
  const remappedSystem = fusedSystem(remapped);
  assert.equal(remappedSystem?.systematicName, spanishName);
  assert.equal(molecularGraphsAreIsomorphic(remapped, fromGeneratedName), true, `${spanishName} remapped`);
  assert.equal(new Set(system.numbering).size, system.atomIds.length);
}

test("round-trips the three supported fused bicyclic parents by graph isomorphism", () => {
  const cases = [
    [fuseRingOnBond(makeRing(6), 1, 2, 6), "biciclo[4.4.0]decano"],
    [fuseRingOnBond(makeRing(6), 1, 2, 5), "biciclo[4.3.0]nonano"],
    [fuseRingOnBond(makeRing(5), 1, 2, 5), "biciclo[3.3.0]octano"],
  ];
  for (const [source, expected] of cases) {
    assert.equal(getFusedBicyclicSystem(source)?.systematicName, expected);
    assertRoundTrip(source, expected, translateSpanishIupacToOpsin(expected));
  }
});

test("round-trips every supported tricyclic topology and notation", () => {
  const sources = [
    makeTricycle(6, 6, "linear"),
    makeTricycle(6, 6, "angular"),
    makeTricycle(6, 5, "angular"),
    makeTricycle(5, 6, "angular"),
  ];
  for (const source of sources) {
    const system = getFusedTricyclicSystem(source);
    assert.ok(system?.systematicName && system.systematicNameEn);
    assertRoundTrip(source, system.systematicName, system.systematicNameEn);
  }
});

test("round-trips the supported tetracyclic parents, including angular and mixed chains", () => {
  const sources = [
    makeTetracycle([6, 6, 6, 6], ["linear", "linear"]),
    makeTetracycle([6, 6, 6, 6], ["angular", "angular"]),
    makeTetracycle([6, 6, 6, 5], ["linear", "linear"]),
    makeTetracycle([6, 6, 5, 6], ["angular", "angular"]),
  ];
  for (const source of sources) {
    const system = getFusedTetracyclicSystem(source);
    assert.ok(system?.systematicName && system.systematicNameEn);
    assertRoundTrip(source, system.systematicName, system.systematicNameEn);
  }
});

test("keeps reconstruction independent of source IDs, records and orientation", () => {
  const source = makeTetracycle([6, 6, 6, 5], ["angular", "linear"]);
  const ids = source.atoms.map((atom) => atom.id);
  const remap = new Map(ids.map((id, index) => [id, 900 + (ids.length - index) * 17]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom) => ({
      ...atom,
      id: remap.get(atom.id),
      x: -atom.y,
      y: atom.x,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [remap.get(right), remap.get(left), order]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 50 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => remap.get(id)),
    })),
  };
  const expected = getFusedTetracyclicSystem(source)?.systematicName;
  assert.equal(getFusedTetracyclicSystem(transformed)?.systematicName, expected);
  assert.equal(molecularGraphsAreIsomorphic(transformed, build(expected)), true);
});

test("returns editable ring metadata and finite layout coordinates", () => {
  const molecule = build("triciclo[8.4.0.0^{3,8}]tetradecano");
  assert.ok(molecule.atoms.every((atom) => Number.isFinite(atom.x) && Number.isFinite(atom.y)));
  assert.equal(new Set(molecule.atoms.map((atom) => `${atom.x.toFixed(6)},${atom.y.toFixed(6)}`)).size, 14);
  const removable = molecule.rings[0].atomIds.find((atomId) => (
    molecule.rings.filter((ring) => ring.atomIds.includes(atomId)).length === 1
  ));
  assert.ok(removable);
  const edited = removeFusedRingAtom(molecule, removable);
  assert.ok(edited);
  assert.equal(molecule.atoms.length, 14, "editing must not mutate the constructed snapshot used by undo");
  assert.equal(edited.atoms.length, 13);
});

test("round-trips linear alkyl derivatives, including repeated and mixed substituents", () => {
  const cases = [
    [
      "2-hexilbiciclo[4.4.0]decano",
      "2-hexylbicyclo[4.4.0]decane",
      "C16H30",
    ],
    [
      "2,3-dimetilbiciclo[4.4.0]decano",
      "2,3-dimethylbicyclo[4.4.0]decane",
      "C12H22",
    ],
    [
      "5-propiltriciclo[8.4.0.0^{3,8}]tetradecano",
      "5-propyltricyclo[8.4.0.0^{3,8}]tetradecane",
      "C17H30",
    ],
    [
      "5-etil-6-metiltriciclo[8.4.0.0^{3,8}]tetradecano",
      "5-ethyl-6-methyltricyclo[8.4.0.0^{3,8}]tetradecane",
      "C17H30",
    ],
    [
      "3-etil-8-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
      "3-ethyl-8-methyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
      "C21H36",
    ],
  ];
  for (const expected of cases) assertDerivedRoundTrip(...expected);
});

test("accepts an equivalent valid numbering without requiring textual name equality", () => {
  const preferred = build("2-metilbiciclo[4.4.0]decano");
  const equivalent = build("10-metilbiciclo[4.4.0]decano");
  assert.equal(molecularGraphsAreIsomorphic(preferred, equivalent), true);
  assert.equal(fusedSystem(equivalent)?.systematicName, "2-metilbiciclo[4.4.0]decano");
});

test("round-trips simple and compound unsaturation, including a valid alkyne", () => {
  const cases = [
    [
      "biciclo[4.4.0]deca-2,7-dieno",
      "bicyclo[4.4.0]deca-2,7-diene",
      "C10H14",
    ],
    [
      "biciclo[4.4.0]dec-2-ino",
      "bicyclo[4.4.0]dec-2-yne",
      "C10H14",
    ],
    [
      "biciclo[4.4.0]dec-2-en-7-ino",
      "bicyclo[4.4.0]dec-2-en-7-yne",
      "C10H12",
    ],
    [
      "triciclo[8.4.0.0^{2,7}]tetradeca-1(10),11,13-trieno",
      "tricyclo[8.4.0.0^{2,7}]tetradeca-1(10),11,13-triene",
      "C14H18",
    ],
    [
      "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-eno",
      "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-ene",
      "C18H28",
    ],
  ];
  for (const expected of cases) assertDerivedRoundTrip(...expected);
});

test("round-trips alcohols, ketones and complete polycyclic combinations", () => {
  const cases = [
    [
      "biciclo[4.4.0]decano-2,7-diol",
      "bicyclo[4.4.0]decane-2,7-diol",
      "C10H18O2",
    ],
    [
      "triciclo[8.4.0.0^{3,8}]tetradecano-4,5,6-triol",
      "tricyclo[8.4.0.0^{3,8}]tetradecane-4,5,6-triol",
      "C14H24O3",
    ],
    [
      "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano-2,13-diona",
      "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane-2,13-dione",
      "C18H26O2",
    ],
    [
      "5-hidroxi-7-metilbiciclo[4.4.0]dec-3-en-2-ona",
      "5-hydroxy-7-methylbicyclo[4.4.0]dec-3-en-2-one",
      "C11H16O2",
    ],
    [
      "5-hidroxi-6-metiltriciclo[8.4.0.0^{3,8}]tetradec-11-en-4-ona",
      "5-hydroxy-6-methyltricyclo[8.4.0.0^{3,8}]tetradec-11-en-4-one",
      "C15H22O2",
    ],
    [
      "9-hidroxi-14-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-ona",
      "9-hydroxy-14-methyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-one",
      "C19H28O2",
    ],
    [
      "triciclo[8.4.0.0^{3,8}]tetradec-1(10)-en-5-ona",
      "tricyclo[8.4.0.0^{3,8}]tetradec-1(10)-en-5-one",
      "C14H20O",
    ],
  ];
  for (const expected of cases) assertDerivedRoundTrip(...expected);
});

test("rejects malformed, impossible, noncanonical and out-of-coverage von Baeyer parents clearly", () => {
  const invalid = [
    "triciclo[8.4.0.0^{3,8]tetradecano",
    "triciclo[8.4.0]tetradecano",
    "triciclo[8.4.0.0^{3,8}]tridecano",
    "triciclo[7.4.1.0^{2,6}]tetradecano",
    "tetraciclo[8.8.0.0^{3,12}.0^{8,17}]octadecano",
    "biciclo[3.2.1]octano",
    "2,3,4-dimetilbiciclo[4.4.0]decano",
    "3-hidroxibiciclo[4.4.0]decan-2-ol",
    "biciclo[4.4.0]dec-10-eno",
    "biciclo[4.4.0]dec-1(7)-eno",
    "biciclo[4.4.0]decan-1-ona",
    "2-fenilbiciclo[4.4.0]decano",
  ];
  for (const name of invalid) {
    const result = buildHydrocarbonFromIupacName(name);
    assert.equal(result.ok, false, name);
    assert.match(
      result.error,
      /descriptor|progenitor|policiclo|puente|ortofusionada|cadena|ciclo|nombre|localizador|insaturación|valencia|conectividad/i,
      name,
    );
  }
  assert.equal(
    dynamicUiText("en", "El descriptor von Baeyer está incompleto o malformado."),
    "The von Baeyer descriptor is incomplete or malformed.",
  );
  assert.equal(
    dynamicUiText("en", "Un tetraciclo necesita 5 longitudes de puente en su descriptor."),
    "A tetracyclo descriptor requires 5 bridge lengths.",
  );
  assert.equal(
    dynamicUiText("en", "La combinación indicada produce una conectividad o valencia no válida."),
    "The specified combination produces invalid connectivity or valence.",
  );
});
