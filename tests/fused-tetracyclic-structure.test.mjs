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
  assert.deepEqual(actual.functionalGroups.map((item) => item.kind).sort(), expected.functionalGroups.map((item) => item.kind).sort());
});

test("selects the same descriptor when the fusion chain is constructed from the opposite end", () => {
  const forward = getFusedTetracyclicSystem(makeTetracycle([6, 6, 6, 5], ["linear", "linear"]));
  const reverse = getFusedTetracyclicSystem(makeTetracycle([5, 6, 6, 6], ["linear", "linear"]));
  assert.equal(reverse?.vonBaeyerDescriptor, forward?.vonBaeyerDescriptor);
  assert.equal(reverse?.systematicName, forward?.systematicName);
  assert.deepEqual(reverse?.secondaryBridges.map((bridge) => bridge.attachmentLocants), forward?.secondaryBridges.map((bridge) => bridge.attachmentLocants));
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

test("integrates structural analysis bilingually without emitting a provisional name", () => {
  const molecule = decoratedTetracycle();
  const analysis = analyzeMolecule(molecule);
  assert.ok(analysis.fusedTetracyclic);
  assert.equal(analysis.name, "Nombre no disponible para estructuras complejas");
  assert.equal(analysis.numberedAtoms.size, 0);
  assert.match(analysis.ringSystem, /Sistema tetracíclico fusionado 6-6-6-6/);
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.match(spanish.map((step) => step.explanation).join(" "), /no se nombra porque contiene/);
  assert.match(english.map((step) => step.explanation).join(" "), /no derivative name is emitted/);
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
