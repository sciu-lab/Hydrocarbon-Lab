import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { fuseRingOnBond } from "../app/fused-ring.ts";
import {
  getFusedBicyclicSystem,
  getFusedTetracyclicSystem,
  getFusedTricyclicSystem,
  getSteroidLike6565System,
} from "../app/fused-ring-nomenclature.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;
let ChemicalNameText;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, buildIupacReasoningSteps, buildEnglishReasoningSteps, ChemicalNameText } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function makeRing(size, firstId = 1) {
  const atoms = Array.from({ length: size }, (_, index) => ({
    id: firstId + index,
    x: Math.cos(index * Math.PI * 2 / size) * 100,
    y: Math.sin(index * Math.PI * 2 / size) * 100,
  }));
  return {
    atoms,
    bonds: atoms.map((atom, index) => [atom.id, atoms[(index + 1) % size].id, 1]),
    rings: [{ id: 1, kind: "cycloalkane", atomIds: atoms.map((atom) => atom.id) }],
  };
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
  molecule = fuseNext(molecule, sizes[3], dispositions[1]);
  return molecule;
}

function makeGonaneReference() {
  const ringAtomIds = [
    [1, 17, 16, 4, 3, 2],
    [5, 6, 7, 15, 16, 4],
    [13, 14, 15, 7, 8, 12],
    [9, 8, 12, 11, 10],
  ];
  const bonds = [];
  const seen = new Set();
  for (const atomIds of ringAtomIds) {
    atomIds.forEach((atomId, index) => {
      const nextId = atomIds[(index + 1) % atomIds.length];
      const key = [atomId, nextId].sort((left, right) => left - right).join("-");
      if (!seen.has(key)) {
        seen.add(key);
        bonds.push([atomId, nextId, 1]);
      }
    });
  }
  return {
    atoms: Array.from({ length: 17 }, (_, index) => ({ id: index + 1 })),
    bonds,
    rings: ringAtomIds.map((atomIds, index) => ({ id: index + 1, kind: "cycloalkane", atomIds })),
  };
}

function detectedOxygenGroups(molecule) {
  return molecule.atoms.filter((atom) => atom.element === "O").map((oxygen) => {
    const attachment = molecule.bonds.find(([left, right]) => left === oxygen.id || right === oxygen.id);
    const carbonId = attachment[0] === oxygen.id ? attachment[1] : attachment[0];
    return {
      kind: (attachment[2] ?? 1) === 2 ? "ketone" : "alcohol",
      carbonId,
      heteroAtomId: oxygen.id,
      atomIds: [carbonId, oxygen.id],
    };
  });
}

function addAtom(molecule, carbonId, element, order = 1) {
  const next = structuredClone(molecule);
  const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  next.atoms.push({ id, x: id * 7, y: -id * 5, ...(element === "C" ? {} : { element }) });
  next.bonds.push([carbonId, id, order]);
  return next;
}

function addCoreOxygenFunction(molecule, carbonId, kind) {
  return addAtom(molecule, carbonId, "O", kind === "ketone" ? 2 : 1);
}

function addLinearAlkyl(molecule, anchorId, carbonCount) {
  const next = structuredClone(molecule);
  let previousId = anchorId;
  let nextId = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  for (let index = 0; index < carbonCount; index++, nextId++) {
    next.atoms.push({ id: nextId, x: nextId * 7, y: -nextId * 5 });
    next.bonds.push([previousId, nextId, 1]);
    previousId = nextId;
  }
  return next;
}

function setCoreBondOrder(molecule, leftId, rightId, order) {
  const next = structuredClone(molecule);
  const bond = next.bonds.find(([left, right]) => (
    (left === leftId && right === rightId) || (left === rightId && right === leftId)
  ));
  assert.ok(bond, `missing core bond ${leftId}-${rightId}`);
  bond[2] = order;
  return next;
}

function setBondOrderAtParentLocants(molecule, firstLocant, secondLocant, order) {
  const parent = getFusedTetracyclicSystem(molecule);
  assert.ok(parent);
  return setCoreBondOrder(
    molecule,
    parent.numbering[firstLocant - 1],
    parent.numbering[secondLocant - 1],
    order,
  );
}

function decoratedTetracycle() {
  let molecule = makeTetracycle([6, 6, 6, 6], ["angular", "linear"]);
  const system = getFusedTetracyclicSystem(molecule);
  const fusionAtoms = new Set(system.fusionAtomIds);
  const peripheralAtoms = system.atomIds.filter((atomId) => !fusionAtoms.has(atomId));
  molecule = addAtom(molecule, peripheralAtoms[0], "C");
  molecule = addAtom(molecule, peripheralAtoms[2], "O", 1);
  molecule = addAtom(molecule, peripheralAtoms[4], "O", 2);
  const excluded = new Set([peripheralAtoms[0], peripheralAtoms[2], peripheralAtoms[4]]);
  const multipleBond = molecule.bonds.find(([left, right, order = 1]) => (
    order === 1
    && system.atomIds.includes(left)
    && system.atomIds.includes(right)
    && !fusionAtoms.has(left)
    && !fusionAtoms.has(right)
    && !excluded.has(left)
    && !excluded.has(right)
  ));
  assert.ok(multipleBond);
  multipleBond[2] = 2;
  return molecule;
}

function structuralSummary(system) {
  return {
    ringSizes: system.ringSizes,
    topology: system.topology,
    junctions: system.junctionTopologies.map(({ topology, edgeSeparation }) => ({ topology, edgeSeparation })),
    adjacencyDegrees: Object.values(system.adjacency).map((neighbors) => neighbors.length).sort(),
    atomCount: system.atomIds.length,
    fusionBondCount: system.fusionBonds.length,
    fusionAtomCount: system.fusionAtomIds.length,
    independentCycleCount: system.independentCycleCount,
    externalCount: system.externalAtomIds.length,
    descriptor: system.vonBaeyerDescriptor,
    systematicName: system.systematicName,
    secondaryLocants: system.secondaryBridges.map((bridge) => bridge.attachmentLocants),
  };
}

function assertDescriptorCoherent(molecule, system) {
  assert.equal(system.numbering.length, system.atomIds.length);
  assert.equal(new Set(system.numbering).size, system.atomIds.length);
  assert.deepEqual(new Set(system.numbering), new Set(system.atomIds));
  assert.ok(system.mainBridge);
  assert.equal(system.secondaryBridges.length, 2);
  const locants = new Map(system.numbering.map((atomId, index) => [atomId, index + 1]));
  for (const bridge of [system.mainBridge, ...system.secondaryBridges]) {
    assert.ok(molecule.bonds.some(([left, right]) => (
      left === bridge.bridgeheads[0] && right === bridge.bridgeheads[1]
    ) || (
      left === bridge.bridgeheads[1] && right === bridge.bridgeheads[0]
    )), "every selected zero-length bridge is a real graph bond");
    if ("attachmentLocants" in bridge) {
      assert.deepEqual(
        bridge.attachmentLocants,
        bridge.bridgeheads.map((atomId) => locants.get(atomId)).sort((left, right) => left - right),
      );
    }
  }
  const bridgeLengths = [...system.vonBaeyerDescriptor.matchAll(/[.\[]([0-9]+)/g)]
    .map((match) => Number(match[1]));
  assert.equal(bridgeLengths.length, 5);
  assert.equal(bridgeLengths.reduce((sum, length) => sum + length, 2), system.atomIds.length);
  for (const candidate of system.numberingCandidates) {
    assert.deepEqual(new Set(candidate), new Set(system.atomIds));
  }
}

test("recognises linear, angular and mixed 6-6-6-6 fusion chains", () => {
  const linear = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 6], ["linear", "linear"]));
  const angular = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 6], ["angular", "angular"]));
  const mixed = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 6], ["angular", "linear"]));
  assert.equal(linear?.topology, "linear");
  assert.equal(angular?.topology, "angular");
  assert.equal(mixed?.topology, "mixed");
  for (const system of [linear, angular, mixed]) {
    assert.deepEqual(system?.ringSizes, [6, 6, 6, 6]);
    assert.equal(system?.fusionBonds.length, 3);
    assert.equal(system?.fusionAtomIds.length, 6);
    assert.equal(system?.independentCycleCount, 4);
    assert.deepEqual(Object.fromEntries(Object.entries(system.adjacency).map(([label, neighbors]) => [label, neighbors.length])), { A: 1, B: 2, C: 2, D: 1 });
  }
});

test("recognises canonical 6-6-6-5 and 6-6-5-6 chains", () => {
  const terminalFive = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 5], ["angular", "angular"]));
  const internalFive = getFusedTetracyclicSystem(makeTetracycle([6, 6, 5, 6], ["angular", "angular"]));
  assert.deepEqual(terminalFive?.ringSizes, [6, 6, 6, 5]);
  assert.deepEqual(internalFive?.ringSizes, [6, 6, 5, 6]);
});

test("generates graph-derived tetracyclic descriptors, complete numbering and bilingual parent names", () => {
  const cases = [
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"],
      descriptor: "[8.8.0.0^{3,8}.0^{12,17}]",
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
    },
    {
      sizes: [6, 6, 6, 6], dispositions: ["angular", "angular"],
      descriptor: "[8.8.0.0^{2,7}.0^{13,18}]",
      es: "tetraciclo[8.8.0.0^{2,7}.0^{13,18}]octadecano",
      en: "tetracyclo[8.8.0.0^{2,7}.0^{13,18}]octadecane",
    },
    {
      sizes: [6, 6, 6, 6], dispositions: ["angular", "linear"],
      descriptor: "[8.8.0.0^{2,7}.0^{12,17}]",
      es: "tetraciclo[8.8.0.0^{2,7}.0^{12,17}]octadecano",
      en: "tetracyclo[8.8.0.0^{2,7}.0^{12,17}]octadecane",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"],
      descriptor: "[8.7.0.0^{3,8}.0^{12,16}]",
      es: "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecano",
      en: "tetracyclo[8.7.0.0^{3,8}.0^{12,16}]heptadecane",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"],
      descriptor: "[8.7.0.0^{2,7}.0^{12,17}]",
      es: "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecano",
      en: "tetracyclo[8.7.0.0^{2,7}.0^{12,17}]heptadecane",
    },
  ];
  for (const expected of cases) {
    const molecule = makeTetracycle(expected.sizes, expected.dispositions);
    const system = getFusedTetracyclicSystem(molecule);
    assert.equal(system?.vonBaeyerDescriptor, expected.descriptor);
    assert.equal(system?.systematicName, expected.es);
    assert.equal(system?.systematicNameEn, expected.en);
    assertDescriptorCoherent(molecule, system);
  }
});

test("renders both secondary-bridge locant pairs as safe superscripts", () => {
  const name = "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano";
  const markup = renderToStaticMarkup(createElement(ChemicalNameText, { name }));
  assert.equal((markup.match(/class="chemical-name-superscript"/g) ?? []).length, 2);
  assert.match(markup, />3,8<\/sup>/);
  assert.match(markup, />12,17<\/sup>/);
  assert.doesNotMatch(markup, /\^\{/);
});

test("integrates the saturated parent name, visual numbering and bilingual explanation", () => {
  const molecule = makeTetracycle([6, 6, 6, 6], ["linear", "linear"]);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano");
  assert.equal(analysis.numberedAtoms.size, 18);
  assert.deepEqual([...analysis.numberedAtoms.values()].sort((left, right) => left - right), Array.from({ length: 18 }, (_, index) => index + 1));
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.match(spanish.map((step) => step.explanation).join(" "), /tetraciclo\[8\.8\.0\.0\^\{3,8\}\.0\^\{12,17\}\]octadecano/);
  assert.match(english.map((step) => step.explanation).join(" "), /tetracyclo\[8\.8\.0\.0\^\{3,8\}\.0\^\{12,17\}\]octadecane/);
});

test("names linear alkyl substituents across the three supported tetracyclic cores", () => {
  const cases = [
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"], anchorId: 7, carbonCount: 1,
      es: "2-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
      en: "2-methyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
    },
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"], anchorId: 4, carbonCount: 2,
      es: "5-etiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
      en: "5-ethyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
    },
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"], anchorId: 16, carbonCount: 3,
      es: "5-propiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
      en: "5-propyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], anchorId: 7, carbonCount: 4,
      es: "2-butiltetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecano",
      en: "2-butyltetracyclo[8.7.0.0^{3,8}.0^{12,16}]heptadecane",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"], anchorId: 4, carbonCount: 5,
      es: "5-pentiltetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecano",
      en: "5-pentyltetracyclo[8.7.0.0^{2,7}.0^{12,17}]heptadecane",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], anchorId: 7, carbonCount: 6,
      es: "2-hexiltetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecano",
      en: "2-hexyltetracyclo[8.7.0.0^{3,8}.0^{12,16}]heptadecane",
    },
  ];
  for (const expected of cases) {
    const parent = makeTetracycle(expected.sizes, expected.dispositions);
    const molecule = addLinearAlkyl(parent, expected.anchorId, expected.carbonCount);
    const system = getFusedTetracyclicSystem(molecule);
    assert.equal(system?.systematicName, expected.es);
    assert.equal(system?.systematicNameEn, expected.en);
    assert.equal(system?.substituents[0].atomIds.length, expected.carbonCount);
    assertDescriptorCoherent(molecule, system);
  }
});

test("groups repeated alkyls and uses alphabetical order after a tied locant set", () => {
  let dimethyl = makeTetracycle();
  dimethyl = addLinearAlkyl(dimethyl, 7, 1);
  dimethyl = addLinearAlkyl(dimethyl, 18, 1);
  assert.equal(
    getFusedTetracyclicSystem(dimethyl)?.systematicName,
    "2,13-dimetiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
  );

  // The two admissible orientations give the same {3,8} locant set. Etil,
  // cited before metil, receives locant 3 at the first point of difference.
  let mixed = makeTetracycle();
  mixed = addLinearAlkyl(mixed, 1, 2);
  mixed = addLinearAlkyl(mixed, 2, 1);
  const system = getFusedTetracyclicSystem(mixed);
  assert.equal(
    system?.systematicName,
    "3-etil-8-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano",
  );
  assert.equal(
    system?.systematicNameEn,
    "3-ethyl-8-methyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane",
  );
  assert.deepEqual(system?.substituents.map(({ name, locant }) => ({ name, locant })), [
    { name: "etil", locant: 3 },
    { name: "metil", locant: 8 },
  ]);
});

test("names a valid methyl substituent on a tetracyclic fusion carbon", () => {
  const parent = makeTetracycle();
  const parentSystem = getFusedTetracyclicSystem(parent);
  assert.ok(parentSystem?.fusionAtomIds.includes(8));
  const system = getFusedTetracyclicSystem(addLinearAlkyl(parent, 8, 1));
  assert.equal(system?.systematicName, "1-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano");
  assert.equal(system?.substituents[0].locant, 1);
});

test("integrates tetracyclic alkyl names, numbering and educational explanation", () => {
  const molecule = addLinearAlkyl(makeTetracycle(), 7, 1);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "2-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano");
  assert.equal(analysis.substituents[0].locant, 2);
  assert.equal(analysis.numberedAtoms.size, 18);
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.match(spanish.map((step) => step.explanation).join(" "), /metil en C2/);
  assert.match(spanish.map((step) => step.explanation).join(" "), /2-metiltetraciclo/);
  assert.match(english.map((step) => step.explanation).join(" "), /methyl at C2/);
  assert.match(english.map((step) => step.explanation).join(" "), /2-methyltetracyclo/);
});

test("names monoenes, dienes and trienes on a 6-6-6-6 tetracyclic core", () => {
  const cases = [
    {
      bonds: [[7, 8]],
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1-eno",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1-ene",
    },
    {
      bonds: [[7, 8], [3, 4]],
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadeca-1,6-dieno",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadeca-1,6-diene",
    },
    {
      bonds: [[7, 8], [3, 4], [16, 17]],
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadeca-1,6,14-trieno",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadeca-1,6,14-triene",
    },
  ];
  for (const expected of cases) {
    let molecule = makeTetracycle();
    for (const [left, right] of expected.bonds) {
      molecule = setCoreBondOrder(molecule, left, right, 2);
    }
    const system = getFusedTetracyclicSystem(molecule);
    assert.equal(system?.systematicName, expected.es);
    assert.equal(system?.systematicNameEn, expected.en);
    assert.equal(system?.doubleBondLocations.length, expected.bonds.length);
    assertDescriptorCoherent(molecule, system);
  }
});

test("names a valid tetracyclic alkyne and an enyne", () => {
  const alkyne = getFusedTetracyclicSystem(setCoreBondOrder(makeTetracycle(), 4, 5, 3));
  assert.equal(alkyne?.systematicName, "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-5-ino");
  assert.equal(alkyne?.systematicNameEn, "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-5-yne");

  let enyneMolecule = setCoreBondOrder(makeTetracycle(), 7, 8, 2);
  enyneMolecule = setCoreBondOrder(enyneMolecule, 4, 5, 3);
  const enyne = getFusedTetracyclicSystem(enyneMolecule);
  assert.equal(enyne?.systematicName, "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1-en-5-ino");
  assert.equal(enyne?.systematicNameEn, "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1-en-5-yne");
});

test("uses a compound locant for a nonconsecutive fusion-bond alkene", () => {
  const molecule = setCoreBondOrder(makeTetracycle(), 8, 9, 2);
  const system = getFusedTetracyclicSystem(molecule);
  assert.equal(system?.doubleBondLocations[0].compound, true);
  assert.deepEqual(system?.doubleBondLocations[0].locants, [1, 10]);
  assert.equal(system?.systematicName, "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-eno");
  assert.equal(system?.systematicNameEn, "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-ene");
});

test("integrates compound unsaturation into visual numbering and bilingual reasoning", () => {
  const molecule = setCoreBondOrder(makeTetracycle(), 8, 9, 2);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-eno");
  assert.deepEqual(analysis.doubleBondLocants, [1]);
  assert.equal(analysis.numberedAtoms.get(8), 1);
  assert.equal(analysis.numberedAtoms.get(9), 10);
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.match(spanish.map((step) => step.explanation).join(" "), /dobles enlaces en 1\(10\)/);
  assert.match(spanish.map((step) => step.explanation).join(" "), /octadec-1\(10\)-eno/);
  assert.match(english.map((step) => step.explanation).join(" "), /double bonds at 1\(10\)/);
  assert.match(english.map((step) => step.explanation).join(" "), /octadec-1\(10\)-ene/);
});

test("combines alkyl prefixes with unsaturation after applying multiple-bond priority", () => {
  let methyl = setCoreBondOrder(makeTetracycle(), 7, 8, 2);
  methyl = addLinearAlkyl(methyl, 4, 1);
  const methylSystem = getFusedTetracyclicSystem(methyl);
  assert.equal(
    methylSystem?.systematicName,
    "6-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1-eno",
  );
  assert.equal(methylSystem?.substituents[0].locant, 6);

  let ethyl = setCoreBondOrder(makeTetracycle(), 4, 5, 2);
  ethyl = addLinearAlkyl(ethyl, 7, 2);
  const ethylSystem = getFusedTetracyclicSystem(ethyl);
  assert.equal(
    ethylSystem?.systematicName,
    "2-etiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-5-eno",
  );
  assert.equal(
    ethylSystem?.systematicNameEn,
    "2-ethyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-5-ene",
  );
});

test("supports unsaturation on the 6-6-6-5 and 6-6-5-6 cores", () => {
  const terminalFive = getFusedTetracyclicSystem(setCoreBondOrder(
    makeTetracycle([6, 6, 6, 5], ["linear", "linear"]),
    7, 8, 2,
  ));
  assert.equal(
    terminalFive?.systematicName,
    "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadec-1-eno",
  );

  const internalFive = getFusedTetracyclicSystem(setCoreBondOrder(
    makeTetracycle([6, 6, 5, 6], ["angular", "angular"]),
    1, 7, 2,
  ));
  assert.equal(
    internalFive?.systematicName,
    "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadec-1-eno",
  );
});

test("keeps unsaturated names invariant when the fusion chain is built from the other end", () => {
  const forward = setBondOrderAtParentLocants(
    makeTetracycle([6, 6, 6, 5], ["linear", "linear"]), 1, 2, 2,
  );
  const reverse = setBondOrderAtParentLocants(
    makeTetracycle([5, 6, 6, 6], ["linear", "linear"]), 1, 2, 2,
  );
  assert.equal(
    getFusedTetracyclicSystem(reverse)?.systematicName,
    getFusedTetracyclicSystem(forward)?.systematicName,
  );
});

test("rejects a triple bond that exceeds fusion-carbon valence", () => {
  assert.equal(getFusedTetracyclicSystem(setCoreBondOrder(makeTetracycle(), 8, 9, 3)), null);
});

test("names tetracyclic alcohols and ketones on all supported cores", () => {
  const cases = [
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"], kind: "alcohol", anchorId: 7,
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-2-ol",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-2-ol",
    },
    {
      sizes: [6, 6, 6, 6], dispositions: ["linear", "linear"], kind: "ketone", anchorId: 4,
      es: "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-5-ona",
      en: "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-5-one",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], kind: "alcohol", anchorId: 7,
      es: "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecan-2-ol",
      en: "tetracyclo[8.7.0.0^{3,8}.0^{12,16}]heptadecan-2-ol",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], kind: "ketone", anchorId: 4,
      es: "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecan-5-ona",
      en: "tetracyclo[8.7.0.0^{3,8}.0^{12,16}]heptadecan-5-one",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"], kind: "alcohol", anchorId: 6,
      es: "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecan-3-ol",
      en: "tetracyclo[8.7.0.0^{2,7}.0^{12,17}]heptadecan-3-ol",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"], kind: "ketone", anchorId: 4,
      es: "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecan-5-ona",
      en: "tetracyclo[8.7.0.0^{2,7}.0^{12,17}]heptadecan-5-one",
    },
  ];
  for (const expected of cases) {
    const molecule = addCoreOxygenFunction(
      makeTetracycle(expected.sizes, expected.dispositions),
      expected.anchorId,
      expected.kind,
    );
    const system = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
    assert.equal(system?.systematicName, expected.es);
    assert.equal(system?.systematicNameEn, expected.en);
    assert.equal(system?.primaryFunctionalGroup, expected.kind);
  }
});

test("names tetracyclic diols, triols and diones", () => {
  let diol = addCoreOxygenFunction(makeTetracycle(), 7, "alcohol");
  diol = addCoreOxygenFunction(diol, 18, "alcohol");
  const diolSystem = getFusedTetracyclicSystem(diol, detectedOxygenGroups(diol));
  assert.equal(
    diolSystem?.systematicName,
    "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano-2,13-diol",
  );
  assert.equal(
    diolSystem?.systematicNameEn,
    "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane-2,13-diol",
  );

  let triol = addCoreOxygenFunction(diol, 4, "alcohol");
  const triolSystem = getFusedTetracyclicSystem(triol, detectedOxygenGroups(triol));
  assert.equal(
    triolSystem?.systematicName,
    "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano-2,6,13-triol",
  );

  let dione = addCoreOxygenFunction(makeTetracycle(), 7, "ketone");
  dione = addCoreOxygenFunction(dione, 18, "ketone");
  const dioneSystem = getFusedTetracyclicSystem(dione, detectedOxygenGroups(dione));
  assert.equal(
    dioneSystem?.systematicName,
    "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecano-2,13-diona",
  );
  assert.equal(
    dioneSystem?.systematicNameEn,
    "tetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecane-2,13-dione",
  );
});

test("names diols and diones on the 6-6-6-5 and 6-6-5-6 cores", () => {
  const cases = [
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], anchors: [7, 16], kind: "alcohol",
      name: "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecano-2,14-diol",
    },
    {
      sizes: [6, 6, 6, 5], dispositions: ["linear", "linear"], anchors: [7, 16], kind: "ketone",
      name: "tetraciclo[8.7.0.0^{3,8}.0^{12,16}]heptadecano-2,14-diona",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"], anchors: [6, 4], kind: "alcohol",
      name: "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecano-3,5-diol",
    },
    {
      sizes: [6, 6, 5, 6], dispositions: ["angular", "angular"], anchors: [6, 4], kind: "ketone",
      name: "tetraciclo[8.7.0.0^{2,7}.0^{12,17}]heptadecano-3,5-diona",
    },
  ];
  for (const expected of cases) {
    let molecule = makeTetracycle(expected.sizes, expected.dispositions);
    for (const anchorId of expected.anchors) {
      molecule = addCoreOxygenFunction(molecule, anchorId, expected.kind);
    }
    assert.equal(
      getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule))?.systematicName,
      expected.name,
    );
  }
});

test("uses ketone as suffix and alcohol as a hydroxy prefix", () => {
  let molecule = addCoreOxygenFunction(makeTetracycle(), 4, "ketone");
  molecule = addCoreOxygenFunction(molecule, 7, "alcohol");
  const system = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
  assert.equal(
    system?.systematicName,
    "9-hidroxitetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-5-ona",
  );
  assert.equal(
    system?.systematicNameEn,
    "9-hydroxytetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadecan-5-one",
  );
  assert.equal(system?.primaryFunctionalGroup, "ketone");
});

test("combines a principal function with alkyl and simple or compound unsaturation", () => {
  let molecule = setCoreBondOrder(makeTetracycle(), 7, 8, 2);
  molecule = addCoreOxygenFunction(molecule, 4, "ketone");
  molecule = addLinearAlkyl(molecule, 16, 1);
  const methylEnone = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
  assert.equal(
    methylEnone?.systematicName,
    "14-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-ona",
  );

  molecule = addCoreOxygenFunction(molecule, 7, "alcohol");
  const complete = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
  assert.equal(
    complete?.systematicName,
    "9-hidroxi-14-metiltetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-ona",
  );
  assert.equal(
    complete?.systematicNameEn,
    "9-hydroxy-14-methyltetracyclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-one",
  );

  let compound = setCoreBondOrder(makeTetracycle(), 8, 9, 2);
  compound = addCoreOxygenFunction(compound, 4, "ketone");
  const compoundSystem = getFusedTetracyclicSystem(compound, detectedOxygenGroups(compound));
  assert.equal(
    compoundSystem?.systematicName,
    "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-1(10)-en-5-ona",
  );
});

test("gives the principal function priority over a lower alkene locant", () => {
  let molecule = setCoreBondOrder(makeTetracycle(), 7, 8, 2);
  molecule = addCoreOxygenFunction(molecule, 4, "ketone");
  const system = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
  assert.equal(system?.functionalGroups[0].locant, 5);
  assert.equal(system?.doubleBondLocations[0].lower, 9);
  assert.equal(
    system?.systematicName,
    "tetraciclo[8.8.0.0^{3,8}.0^{12,17}]octadec-9-en-5-ona",
  );
});

test("preserves alkyl, direct alcohol, ketone and core-unsaturation recognition", () => {
  const molecule = decoratedTetracycle();
  const system = getFusedTetracyclicSystem(molecule, detectedOxygenGroups(molecule));
  assert.equal(system?.substituents.length, 1);
  assert.equal(system?.substituents[0].name, "metil");
  assert.deepEqual(system?.functionalGroups.map((group) => group.kind).sort(), ["alcohol", "ketone"]);
  assert.equal(system?.coreMultipleBonds.length, 1);
  assert.equal(system?.externalAtomIds.length, 3);
});

test("is invariant under atom IDs, coordinates, construction records and orientation", () => {
  const source = decoratedTetracycle();
  const expected = getFusedTetracyclicSystem(source, detectedOxygenGroups(source));
  const ids = source.atoms.map((atom) => atom.id);
  const remap = new Map(ids.map((id, index) => [id, 500 + (ids.length - index) * 13]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom) => ({
      ...atom,
      id: remap.get(atom.id),
      x: -atom.y + 41,
      y: atom.x - 73,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [remap.get(right), remap.get(left), order]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 90 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => remap.get(id)),
    })),
  };
  const actual = getFusedTetracyclicSystem(transformed, detectedOxygenGroups(transformed));
  assert.deepEqual(structuralSummary(actual), structuralSummary(expected));
  assert.deepEqual(actual.substituents.map((item) => item.name), expected.substituents.map((item) => item.name));
  assert.deepEqual(
    actual.functionalGroups.map(({ kind, locant }) => ({ kind, locant })).sort((left, right) => left.locant - right.locant),
    expected.functionalGroups.map(({ kind, locant }) => ({ kind, locant })).sort((left, right) => left.locant - right.locant),
  );
  assert.equal(actual.systematicNameEn, expected.systematicNameEn);
});

test("keeps alkyl and unsaturation locants invariant under IDs, reflection and record order", () => {
  const source = setCoreBondOrder(addLinearAlkyl(makeTetracycle(), 7, 3), 4, 5, 2);
  const expected = getFusedTetracyclicSystem(source);
  const ids = source.atoms.map((atom) => atom.id);
  const remap = new Map(ids.map((id, index) => [id, 900 + (ids.length - index) * 17]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom) => ({
      ...atom,
      id: remap.get(atom.id),
      x: -atom.x + 83,
      y: atom.y - 29,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [
      remap.get(right), remap.get(left), order,
    ]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 140 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => remap.get(id)),
    })),
  };
  const actual = getFusedTetracyclicSystem(transformed);
  assert.equal(actual?.systematicName, expected?.systematicName);
  assert.equal(actual?.systematicNameEn, expected?.systematicNameEn);
  assert.deepEqual(
    actual?.substituents.map(({ name, locant }) => ({ name, locant })),
    expected?.substituents.map(({ name, locant }) => ({ name, locant })),
  );
  assert.deepEqual(actual?.doubleBondLocations, expected?.doubleBondLocations.map((location) => ({
    ...location,
    atomIds: location.atomIds.map((atomId) => remap.get(atomId)),
  })));
  assert.deepEqual(actual?.secondaryBridges.map((bridge) => bridge.attachmentLocants), expected?.secondaryBridges.map((bridge) => bridge.attachmentLocants));
});

test("selects the same descriptor when the fusion chain is constructed from the opposite end", () => {
  const forward = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 5], ["linear", "linear"]));
  const reverse = getFusedTetracyclicSystem(makeTetracycle([5, 6, 6, 6], ["linear", "linear"]));
  assert.equal(reverse?.vonBaeyerDescriptor, forward?.vonBaeyerDescriptor);
  assert.equal(reverse?.systematicName, forward?.systematicName);
  assert.deepEqual(reverse?.secondaryBridges.map((bridge) => bridge.attachmentLocants), forward?.secondaryBridges.map((bridge) => bridge.attachmentLocants));
});

test("keeps a principal-function name when the fusion chain is built from the opposite end", () => {
  const functionalize = (molecule) => {
    const parent = getFusedTetracyclicSystem(molecule);
    assert.ok(parent);
    return addCoreOxygenFunction(molecule, parent.numbering[3], "ketone");
  };
  const forward = functionalize(makeTetracycle([6, 6, 6, 5], ["linear", "linear"]));
  const reverse = functionalize(makeTetracycle([5, 6, 6, 6], ["linear", "linear"]));
  assert.equal(
    getFusedTetracyclicSystem(reverse, detectedOxygenGroups(reverse))?.systematicName,
    getFusedTetracyclicSystem(forward, detectedOxygenGroups(forward))?.systematicName,
  );
});

test("rejects side-chain functions and unsupported direct functions safely", () => {
  let sideChain = addLinearAlkyl(makeTetracycle(), 7, 2);
  const sideChainTerminal = Math.max(...sideChain.atoms.map((atom) => atom.id));
  sideChain = addCoreOxygenFunction(sideChain, sideChainTerminal, "alcohol");
  assert.equal(
    getFusedTetracyclicSystem(sideChain, detectedOxygenGroups(sideChain)),
    null,
  );

  const unsupported = addAtom(makeTetracycle(), 6, "N", 1);
  const nitrogenId = Math.max(...unsupported.atoms.map((atom) => atom.id));
  assert.equal(getFusedTetracyclicSystem(unsupported, [{
    kind: "amine",
    carbonId: 6,
    heteroAtomId: nitrogenId,
    atomIds: [6, nitrogenId],
  }]), null);

  const invalidFusionKetone = addCoreOxygenFunction(makeTetracycle(), 8, "ketone");
  assert.equal(
    getFusedTetracyclicSystem(invalidFusionKetone, detectedOxygenGroups(invalidFusionKetone)),
    null,
  );
});

test("rejects spiro, externally connected and branched four-ring assemblies", () => {
  const spiroRings = Array.from({ length: 4 }, (_, ringIndex) => ({
    id: ringIndex + 1,
    kind: "cycloalkane",
    atomIds: [1, ...Array.from({ length: 5 }, (_, offset) => 2 + ringIndex * 5 + offset)],
  }));
  const spiro = {
    atoms: Array.from({ length: 21 }, (_, index) => ({ id: index + 1 })),
    bonds: spiroRings.flatMap((ring) => ring.atomIds.map((id, index) => [id, ring.atomIds[(index + 1) % ring.atomIds.length], 1])),
    rings: spiroRings,
  };

  const separate = [0, 1, 2, 3].map((index) => makeRing(6, index * 10 + 1));
  const external = {
    atoms: separate.flatMap((part) => part.atoms),
    bonds: [
      ...separate.flatMap((part) => part.bonds),
      [1, 11, 1], [11, 21, 1], [21, 31, 1],
    ],
    rings: separate.flatMap((part, index) => part.rings.map((ring) => ({ ...ring, id: index + 1 }))),
  };

  let branched = makeRing(6);
  branched = fuseRingOnBond(branched, 1, 2, 6);
  branched = fuseRingOnBond(branched, 3, 4, 6);
  branched = fuseRingOnBond(branched, 5, 6, 6);
  assert.equal(getFusedTetracyclicSystem(spiro), null);
  assert.equal(getFusedTetracyclicSystem(external), null);
  assert.equal(getFusedTetracyclicSystem(branched), null);
});

test("integrates the complete tetracyclic functional name and explanation bilingually", () => {
  const molecule = decoratedTetracycle();
  const analysis = analyzeMolecule(molecule);
  assert.ok(analysis.fusedTetracyclic);
  assert.equal(
    analysis.name,
    "14-hidroxi-16-metiltetraciclo[8.8.0.0^{2,7}.0^{12,17}]octadec-5-en-18-ona",
  );
  assert.equal(analysis.numberedAtoms.size, 18);
  assert.equal(analysis.primaryFunctionalGroup, "ketone");
  assert.match(analysis.ringSystem, /Sistema tetracíclico fusionado 6-6-6-6/);
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.match(spanish.map((step) => step.explanation).join(" "), /cetona en C18 e hidroxi en C14/);
  assert.match(spanish.map((step) => step.explanation).join(" "), /metil en C16/);
  assert.match(english.map((step) => step.explanation).join(" "), /ketone at C18 and hydroxy at C14/);
  assert.match(english.map((step) => step.explanation).join(" "), /14-hydroxy-16-methyltetracyclo/);
});

test("preserves bicyclic, tricyclic and specialised steroid recognition", () => {
  const bicycle = fuseRingOnBond(makeRing(6), 1, 2, 6);
  const tricycle = fuseNext(bicycle, 6, "linear");
  const gonaneLike = makeGonaneReference();
  assert.ok(getFusedBicyclicSystem(bicycle));
  assert.ok(getFusedTricyclicSystem(tricycle));
  assert.equal(getSteroidLike6565System(gonaneLike)?.isGonaneTopology, true);
  assert.equal(analyzeMolecule(gonaneLike).fusedTetracyclic, undefined, "the specialised gonane path retains priority");
});
