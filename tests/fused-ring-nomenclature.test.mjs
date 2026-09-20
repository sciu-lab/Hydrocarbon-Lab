import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { fuseRingOnBond } from "../app/fused-ring.ts";
import {
  getFusedBicyclicSystem,
  getSteroidLike6565System,
} from "../app/fused-ring-nomenclature.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, buildIupacReasoningSteps, buildEnglishReasoningSteps } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function makeRing(size) {
  const atoms = Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    x: Math.cos(index * Math.PI * 2 / size),
    y: Math.sin(index * Math.PI * 2 / size),
  }));
  return {
    atoms,
    bonds: atoms.map((atom, index) => [atom.id, atoms[(index + 1) % size].id, 1]),
    rings: [{ id: 1, kind: "cycloalkane", atomIds: atoms.map((atom) => atom.id) }],
  };
}

function makeCanonicalDecalin() {
  const atomIds = Array.from({ length: 10 }, (_, index) => index + 1);
  const ringAtomIds = [
    [1, 2, 3, 4, 5, 6],
    [1, 6, 7, 8, 9, 10],
  ];
  const edgeKeys = new Set();
  const bonds = [];
  for (const ring of ringAtomIds) {
    ring.forEach((atomId, index) => {
      const nextId = ring[(index + 1) % ring.length];
      const key = [atomId, nextId].sort((left, right) => left - right).join("-");
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        bonds.push([atomId, nextId, 1]);
      }
    });
  }
  return {
    atoms: atomIds.map((id) => ({ id })),
    bonds,
    rings: ringAtomIds.map((ids, index) => ({ id: index + 1, kind: "cycloalkane", atomIds: ids })),
  };
}

function addLinearAlkyl(molecule, anchorId, length) {
  const next = structuredClone(molecule);
  let previousId = anchorId;
  for (let index = 0; index < length; index += 1) {
    const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
    next.atoms.push({ id });
    next.bonds.push([previousId, id, 1]);
    previousId = id;
  }
  return next;
}

test("names two fused cyclohexanes from their shared graph edge", () => {
  const decalin = fuseRingOnBond(makeRing(6), 1, 2, 6);
  const system = getFusedBicyclicSystem(decalin);
  assert.deepEqual(system?.paths, [4, 4, 0]);
  assert.equal(system?.systematicName, "biciclo[4.4.0]decano");
  assert.equal(system?.traditionalName, "decalina");
  assert.equal(system?.atomIds.length, 10);
});

test("names a fused 6+5 system as biciclo[4.3.0]nonano", () => {
  const hydrindane = fuseRingOnBond(makeRing(6), 1, 2, 5);
  const system = getFusedBicyclicSystem(hydrindane);
  assert.deepEqual(system?.paths, [4, 3, 0]);
  assert.equal(system?.systematicName, "biciclo[4.3.0]nonano");
});

test("preserves the three supported unsubstituted fused-bicycle parents", () => {
  const cases = [
    [makeRing(6), 6, "biciclo[4.4.0]decano"],
    [makeRing(6), 5, "biciclo[4.3.0]nonano"],
    [makeRing(5), 5, "biciclo[3.3.0]octano"],
  ];
  for (const [source, fusedSize, expected] of cases) {
    assert.equal(getFusedBicyclicSystem(fuseRingOnBond(source, 1, 2, fusedSize))?.systematicName, expected);
  }
});

test("names methyl, dimethyl and mixed ethyl-methyl fused bicycles", () => {
  const parent = makeCanonicalDecalin();
  const methyl = getFusedBicyclicSystem(addLinearAlkyl(parent, 2, 1));
  assert.equal(methyl?.systematicName, "2-metilbiciclo[4.4.0]decano");
  assert.equal(methyl?.substituents[0].locant, 2);

  const dimethylMolecule = addLinearAlkyl(addLinearAlkyl(parent, 2, 1), 3, 1);
  assert.equal(
    getFusedBicyclicSystem(dimethylMolecule)?.systematicName,
    "2,3-dimetilbiciclo[4.4.0]decano",
  );

  const mixedMolecule = addLinearAlkyl(addLinearAlkyl(parent, 2, 1), 10, 2);
  assert.equal(
    getFusedBicyclicSystem(mixedMolecule)?.systematicName,
    "2-etil-10-metilbiciclo[4.4.0]decano",
  );
});

test("integrates substituted fused-bicycle naming, numbering, English and reasoning", () => {
  const molecule = addLinearAlkyl(makeCanonicalDecalin(), 2, 1);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "2-metilbiciclo[4.4.0]decano");
  assert.equal(analysis.chainName, "biciclo[4.4.0]decano");
  assert.equal(analysis.substituents[0].locant, 2);
  assert.equal(analysis.numberedAtoms.get(2), 2);
  assert.equal(
    translateSpanishIupacToOpsin(analysis.name),
    "2-methylbicyclo[4.4.0]decane",
  );
  const reasoning = buildIupacReasoningSteps(molecule, analysis);
  assert.ok(reasoning.some((step) => step.title === "Numeración bicíclica"));
  assert.ok(reasoning.some((step) => step.title === "Sustituyentes y localizadores"));
  const englishReasoning = buildEnglishReasoningSteps(reasoning, molecule, analysis);
  assert.ok(englishReasoning.some((step) => step.title === "Bicyclic numbering"));
  assert.ok(englishReasoning.some((step) => step.explanation.includes("2-methylbicyclo[4.4.0]decane")));
});

test("numbering is invariant under atom IDs, construction order and ring orientation", () => {
  const source = addLinearAlkyl(addLinearAlkyl(makeCanonicalDecalin(), 2, 1), 10, 2);
  const expected = getFusedBicyclicSystem(source)?.systematicName;
  const idMap = new Map(source.atoms.map((atom, index) => [atom.id, 101 + ((index * 7) % source.atoms.length)]));
  const remapped = {
    atoms: [...source.atoms].reverse().map((atom, index) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: 500 - index * 31,
      y: -250 + index * 17,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
    rings: [...source.rings].reverse().map((ring) => ({
      ...ring,
      id: ring.id + 20,
      atomIds: [...ring.atomIds].reverse().map((id) => idMap.get(id)),
    })),
  };
  assert.equal(getFusedBicyclicSystem(remapped)?.systematicName, expected);
});

test("rejects substituents and fused systems outside phase-one coverage", () => {
  const parent = makeCanonicalDecalin();
  const propyl = addLinearAlkyl(parent, 2, 3);
  assert.equal(getFusedBicyclicSystem(propyl), null);

  const unsaturated = addLinearAlkyl(parent, 2, 2);
  unsaturated.bonds.at(-1)[2] = 2;
  assert.equal(getFusedBicyclicSystem(unsaturated), null);

  const hetero = addLinearAlkyl(parent, 2, 1);
  hetero.atoms.at(-1).element = "O";
  assert.equal(getFusedBicyclicSystem(hetero), null);
});

test("does not confuse externally connected rings with fused rings", () => {
  const left = makeRing(6);
  const right = makeRing(6);
  right.atoms.forEach((atom) => { atom.id += 6; });
  right.bonds.forEach((bond) => { bond[0] += 6; bond[1] += 6; });
  right.rings[0].atomIds = right.rings[0].atomIds.map((id) => id + 6);
  const connected = {
    atoms: [...left.atoms, ...right.atoms],
    bonds: [...left.bonds, ...right.bonds, [1, 7, 1]],
    rings: [...left.rings, { ...right.rings[0], id: 2 }],
  };
  assert.equal(getFusedBicyclicSystem(connected), null);
});

test("recognises the connected, linearly fused 6-6-6-5 nucleus", () => {
  let nucleus = fuseRingOnBond(makeRing(6), 1, 2, 6);
  const secondRing = nucleus.rings[1];
  nucleus = fuseRingOnBond(nucleus, secondRing.atomIds[2], secondRing.atomIds[3], 6);
  const thirdRing = nucleus.rings[2];
  nucleus = fuseRingOnBond(nucleus, thirdRing.atomIds[2], thirdRing.atomIds[3], 5);
  const system = getSteroidLike6565System(nucleus);
  assert.deepEqual(system?.ringSizes, [6, 6, 6, 5]);
  assert.equal(system?.atomIds.length, 17);
});
