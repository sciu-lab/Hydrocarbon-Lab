import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
let fusedBicyclicTraditionalDisplayName;
let splitChemicalNameForWrapping;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({
    analyzeMolecule,
    buildIupacReasoningSteps,
    buildEnglishReasoningSteps,
    fusedBicyclicTraditionalDisplayName,
    splitChemicalNameForWrapping,
  } = await server.ssrLoadModule("/app/page.tsx"));
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

function makeCanonicalEqualFusedBicycle(ringSize) {
  const atomCount = ringSize * 2 - 2;
  const atomIds = Array.from({ length: atomCount }, (_, index) => index + 1);
  const ringAtomIds = [
    Array.from({ length: ringSize }, (_, index) => index + 1),
    [1, ringSize, ...Array.from({ length: ringSize - 2 }, (_, index) => ringSize + index + 1)],
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

function makeCanonicalDecalin() {
  return makeCanonicalEqualFusedBicycle(6);
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

function setBondOrder(molecule, leftId, rightId, order) {
  const next = structuredClone(molecule);
  const bond = next.bonds.find(([left, right]) => (
    (left === leftId && right === rightId) || (left === rightId && right === leftId)
  ));
  assert.ok(bond, `expected bond ${leftId}-${rightId}`);
  bond[2] = order;
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

test("generalizes linear alkyl substituents from propyl through hexyl", () => {
  const parent = makeCanonicalDecalin();
  const cases = [
    [3, "propil"],
    [4, "butil"],
    [5, "pentil"],
    [6, "hexil"],
  ];
  for (const [length, name] of cases) {
    const system = getFusedBicyclicSystem(addLinearAlkyl(parent, 2, length));
    assert.equal(system?.systematicName, `2-${name}biciclo[4.4.0]decano`);
    assert.equal(system?.substituents[0].atomIds.length, length);
  }

  const mixed = addLinearAlkyl(addLinearAlkyl(parent, 2, 3), 10, 6);
  assert.equal(
    getFusedBicyclicSystem(mixed)?.systematicName,
    "2-hexil-10-propilbiciclo[4.4.0]decano",
  );
});

test("names fused bicyclic alkenes, dienes, alkynes and mixed unsaturation", () => {
  const parent = makeCanonicalDecalin();
  const alkene = getFusedBicyclicSystem(setBondOrder(parent, 2, 3, 2));
  assert.equal(alkene?.systematicName, "biciclo[4.4.0]dec-2-eno");
  assert.deepEqual(alkene?.doubleBondLocants, [2]);

  const dieneMolecule = setBondOrder(setBondOrder(parent, 2, 3, 2), 7, 8, 2);
  const diene = getFusedBicyclicSystem(dieneMolecule);
  assert.equal(diene?.systematicName, "biciclo[4.4.0]deca-2,7-dieno");
  assert.deepEqual(diene?.doubleBondLocants, [2, 7]);
  assert.equal(
    translateSpanishIupacToOpsin(diene.systematicName),
    "bicyclo[4.4.0]deca-2,7-diene",
  );

  const largerParent = makeCanonicalEqualFusedBicycle(8);
  const alkyne = getFusedBicyclicSystem(setBondOrder(largerParent, 2, 3, 3));
  assert.equal(alkyne?.systematicName, "biciclo[6.6.0]tetradec-2-ino");
  assert.deepEqual(alkyne?.tripleBondLocants, [2]);
  assert.equal(translateSpanishIupacToOpsin(alkyne.systematicName), "bicyclo[6.6.0]tetradec-2-yne");

  const enyneMolecule = setBondOrder(setBondOrder(largerParent, 2, 3, 3), 9, 10, 2);
  assert.equal(
    getFusedBicyclicSystem(enyneMolecule)?.systematicName,
    "biciclo[6.6.0]tetradec-2-en-9-ino",
  );
});

test("gives multiple bonds priority over substituent locants", () => {
  const unsaturated = setBondOrder(makeCanonicalDecalin(), 2, 3, 2);
  const substituted = addLinearAlkyl(unsaturated, 10, 6);
  const system = getFusedBicyclicSystem(substituted);
  assert.equal(system?.systematicName, "10-hexilbiciclo[4.4.0]dec-2-eno");
  assert.deepEqual(system?.doubleBondLocants, [2]);

  const tiedUnsaturation = setBondOrder(makeCanonicalDecalin(), 3, 4, 2);
  assert.equal(
    getFusedBicyclicSystem(addLinearAlkyl(tiedUnsaturation, 2, 2))?.systematicName,
    "2-etilbiciclo[4.4.0]dec-3-eno",
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

test("integrates unsaturated fused bicycles in Spanish and English", () => {
  const molecule = addLinearAlkyl(
    setBondOrder(makeCanonicalDecalin(), 3, 4, 2),
    2,
    6,
  );
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "2-hexilbiciclo[4.4.0]dec-3-eno");
  assert.deepEqual(analysis.doubleBondLocants, [3]);
  assert.equal(
    translateSpanishIupacToOpsin(analysis.name),
    "2-hexylbicyclo[4.4.0]dec-3-ene",
  );
  const reasoning = buildIupacReasoningSteps(molecule, analysis);
  assert.ok(reasoning.some((step) => step.explanation.includes("C3=C4")));
  const englishReasoning = buildEnglishReasoningSteps(reasoning, molecule, analysis);
  assert.ok(englishReasoning.some((step) => step.explanation.includes("multiple bonds receive the lowest locant set")));
});

test("numbering is invariant under atom IDs, construction order and ring orientation", () => {
  const source = setBondOrder(
    addLinearAlkyl(addLinearAlkyl(makeCanonicalDecalin(), 2, 3), 10, 6),
    3,
    4,
    2,
  );
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

test("rejects fused systems outside phase-two coverage without inventing a name", () => {
  const parent = makeCanonicalDecalin();
  const unsaturatedSubstituent = addLinearAlkyl(parent, 2, 2);
  unsaturatedSubstituent.bonds.at(-1)[2] = 2;
  assert.equal(getFusedBicyclicSystem(unsaturatedSubstituent), null);

  const hetero = addLinearAlkyl(parent, 2, 1);
  hetero.atoms.at(-1).element = "O";
  assert.equal(getFusedBicyclicSystem(hetero), null);

  const branched = addLinearAlkyl(parent, 2, 2);
  const branchId = Math.max(...branched.atoms.map((atom) => atom.id)) + 1;
  branched.atoms.push({ id: branchId });
  branched.bonds.push([11, branchId, 1]);
  assert.equal(getFusedBicyclicSystem(branched), null);

  assert.equal(getFusedBicyclicSystem(setBondOrder(parent, 1, 6, 2)), null);

  const overValent = setBondOrder(parent, 1, 6, 3);
  assert.equal(getFusedBicyclicSystem(overValent), null);
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

test("keeps long bicyclic names wrap-safe and does not invent traditional synonyms", () => {
  const longName = "2-hexil-10-propilbiciclo[4.4.0]deca-2,7-dieno";
  const segments = splitChemicalNameForWrapping(longName);
  assert.equal(segments.join(""), longName);
  assert.ok(segments.includes("biciclo[4.4.0]"));
  assert.ok(segments.includes("deca-"));

  const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(stylesheet, /\.chemical-name-text\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*normal;/s);
  assert.match(stylesheet, /\.sticky-iupac-name strong\s*\{[^}]*white-space:\s*normal;/s);

  const decalin = getFusedBicyclicSystem(makeCanonicalDecalin());
  assert.equal(decalin?.traditionalName, "decalina");
  assert.equal(fusedBicyclicTraditionalDisplayName(decalin, "es"), "decalina");

  const derivative = getFusedBicyclicSystem(addLinearAlkyl(makeCanonicalDecalin(), 2, 1));
  assert.equal(derivative?.traditionalName, undefined);
  assert.equal(
    fusedBicyclicTraditionalDisplayName(derivative, "en"),
    "No recognized common name",
  );
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
