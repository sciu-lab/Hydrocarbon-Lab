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
let detectFunctionalGroups;
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
    detectFunctionalGroups,
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

function addOxygenGroup(molecule, carbonId, order) {
  const next = structuredClone(molecule);
  const oxygenId = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  next.atoms.push({ id: oxygenId, element: "O" });
  next.bonds.push([carbonId, oxygenId, order]);
  return next;
}

function getDetectedFusedSystem(molecule) {
  return getFusedBicyclicSystem(molecule, detectFunctionalGroups(molecule));
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

test("names fused bicyclic alcohols, ketones, diols and diones", () => {
  const parent = makeCanonicalDecalin();
  const alcohol = getDetectedFusedSystem(addOxygenGroup(parent, 2, 1));
  assert.equal(alcohol?.systematicName, "biciclo[4.4.0]decan-2-ol");
  assert.equal(alcohol?.primaryFunctionalGroup, "alcohol");
  assert.equal(alcohol?.functionalGroups[0].locant, 2);

  const ketone = getDetectedFusedSystem(addOxygenGroup(parent, 2, 2));
  assert.equal(ketone?.systematicName, "biciclo[4.4.0]decan-2-ona");
  assert.equal(ketone?.primaryFunctionalGroup, "ketone");

  const diol = getDetectedFusedSystem(
    addOxygenGroup(addOxygenGroup(parent, 2, 1), 7, 1),
  );
  assert.equal(diol?.systematicName, "biciclo[4.4.0]decano-2,7-diol");
  assert.equal(
    translateSpanishIupacToOpsin(diol.systematicName),
    "bicyclo[4.4.0]decane-2,7-diol",
  );

  const dione = getDetectedFusedSystem(
    addOxygenGroup(addOxygenGroup(parent, 2, 2), 7, 2),
  );
  assert.equal(dione?.systematicName, "biciclo[4.4.0]decano-2,7-diona");
  assert.equal(
    translateSpanishIupacToOpsin(dione.systematicName),
    "bicyclo[4.4.0]decane-2,7-dione",
  );
});

test("uses ketone as suffix and alcohol as hydroxy prefix", () => {
  const molecule = addOxygenGroup(
    addOxygenGroup(makeCanonicalDecalin(), 2, 2),
    3,
    1,
  );
  const system = getDetectedFusedSystem(molecule);
  assert.equal(system?.systematicName, "3-hidroxibiciclo[4.4.0]decan-2-ona");
  assert.equal(system?.primaryFunctionalGroup, "ketone");
  assert.deepEqual(
    system?.functionalGroups.map(({ kind, locant }) => ({ kind, locant })),
    [{ kind: "ketone", locant: 2 }, { kind: "alcohol", locant: 3 }],
  );
  assert.equal(
    translateSpanishIupacToOpsin(system.systematicName),
    "3-hydroxybicyclo[4.4.0]decan-2-one",
  );
});

test("combines the principal group with unsaturation and alkyl prefixes", () => {
  let molecule = setBondOrder(makeCanonicalDecalin(), 3, 4, 2);
  molecule = addOxygenGroup(molecule, 2, 2);
  const enone = getDetectedFusedSystem(molecule);
  assert.equal(enone?.systematicName, "biciclo[4.4.0]dec-3-en-2-ona");
  assert.deepEqual(enone?.doubleBondLocants, [3]);

  molecule = addOxygenGroup(molecule, 5, 1);
  molecule = addLinearAlkyl(molecule, 7, 1);
  const combined = getDetectedFusedSystem(molecule);
  assert.equal(
    combined?.systematicName,
    "5-hidroxi-7-metilbiciclo[4.4.0]dec-3-en-2-ona",
  );
  assert.equal(
    translateSpanishIupacToOpsin(combined.systematicName),
    "5-hydroxy-7-methylbicyclo[4.4.0]dec-3-en-2-one",
  );

  const ynone = getDetectedFusedSystem(addOxygenGroup(
    setBondOrder(makeCanonicalDecalin(), 3, 4, 3),
    2,
    2,
  ));
  assert.equal(ynone?.systematicName, "biciclo[4.4.0]dec-3-in-2-ona");
  assert.equal(
    translateSpanishIupacToOpsin(ynone.systematicName),
    "bicyclo[4.4.0]dec-3-yn-2-one",
  );
});

test("gives the principal functional group priority over unsaturation and prefixes", () => {
  let molecule = setBondOrder(makeCanonicalDecalin(), 9, 10, 2);
  molecule = addOxygenGroup(molecule, 2, 2);
  molecule = addLinearAlkyl(molecule, 3, 2);
  const system = getDetectedFusedSystem(molecule);
  assert.equal(system?.functionalGroups.find((group) => group.kind === "ketone")?.locant, 2);
  assert.equal(system?.doubleBondLocants[0], 9);
  assert.match(system?.systematicName ?? "", /^3-etilbiciclo\[4\.4\.0\]dec-9-en-2-ona$/);
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
  assert.ok(englishReasoning.some((step) => step.explanation.includes("Multiple bonds are considered next")));
});

test("integrates fused functional groups in analysis, numbering and bilingual reasoning", () => {
  const molecule = addOxygenGroup(
    addOxygenGroup(makeCanonicalDecalin(), 2, 2),
    3,
    1,
  );
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "3-hidroxibiciclo[4.4.0]decan-2-ona");
  assert.equal(analysis.primaryFunctionalGroup, "ketone");
  assert.equal(analysis.primaryFunctionalLabel, "Cetona");
  assert.equal(analysis.functionalGroups.length, 2);
  assert.equal(analysis.numberedAtoms.get(2), 2);
  const reasoning = buildIupacReasoningSteps(molecule, analysis);
  assert.ok(reasoning.some((step) => step.explanation.includes("La cetona es la función principal")));
  assert.ok(reasoning.some((step) => step.explanation.includes("hidroxi en C3")));
  const englishReasoning = buildEnglishReasoningSteps(reasoning, molecule, analysis);
  assert.ok(englishReasoning.some((step) => step.explanation.includes("Ketone is the principal group")));
  assert.ok(englishReasoning.some((step) => step.explanation.includes("hydroxy at C3")));
  assert.ok(englishReasoning.some((step) => (
    step.explanation.includes("3-hydroxybicyclo[4.4.0]decan-2-one")
  )));
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

test("functional numbering is invariant under IDs, coordinates and construction order", () => {
  let source = setBondOrder(makeCanonicalDecalin(), 3, 4, 2);
  source = addOxygenGroup(source, 2, 2);
  source = addOxygenGroup(source, 5, 1);
  source = addLinearAlkyl(source, 7, 1);
  const expected = analyzeMolecule(source).name;
  const idMap = new Map(
    source.atoms.map((atom, index) => [atom.id, 301 + ((index * 7) % source.atoms.length)]),
  );
  const remapped = {
    atoms: [...source.atoms].reverse().map((atom, index) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: -900 + index * 47,
      y: 640 - index * 29,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [
      idMap.get(right),
      idMap.get(left),
      order,
    ]),
    rings: [...source.rings].reverse().map((ring) => ({
      ...ring,
      id: ring.id + 40,
      atomIds: [...ring.atomIds].reverse().map((id) => idMap.get(id)),
    })),
  };
  assert.equal(analyzeMolecule(remapped).name, expected);
  assert.equal(expected, "5-hidroxi-7-metilbiciclo[4.4.0]dec-3-en-2-ona");
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

test("rejects unsupported functional placement without inventing a fused name", () => {
  const sideChainAlcohol = addOxygenGroup(
    addLinearAlkyl(makeCanonicalDecalin(), 2, 2),
    12,
    1,
  );
  assert.equal(getDetectedFusedSystem(sideChainAlcohol), null);
  assert.equal(analyzeMolecule(sideChainAlcohol).name, "Nombre no disponible para estructuras complejas");

  const ether = addOxygenGroup(makeCanonicalDecalin(), 2, 1);
  const carbonId = Math.max(...ether.atoms.map((atom) => atom.id)) + 1;
  const oxygenId = ether.atoms.find((atom) => atom.element === "O").id;
  ether.atoms.push({ id: carbonId });
  ether.bonds.push([oxygenId, carbonId, 1]);
  assert.equal(getDetectedFusedSystem(ether), null);
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
  assert.equal(system?.isGonaneTopology, false);
  assert.equal(system?.numbering, undefined);

  assert.deepEqual(system?.ringSizes, [6, 6, 6, 5]);
  assert.equal(system?.atomIds.length, 17);
  assert.deepEqual(
  system?.ringsByLabel.A,
  nucleus.rings[0].atomIds
);

assert.deepEqual(
  system?.ringsByLabel.B,
  nucleus.rings[1].atomIds
);

assert.deepEqual(
  system?.ringsByLabel.C,
  nucleus.rings[2].atomIds
);

assert.deepEqual(
  system?.ringsByLabel.D,
  nucleus.rings[3].atomIds
);
const sharedAtoms = (left, right) =>
  left.atomIds.filter((id) => right.atomIds.includes(id));

assert.deepEqual(
  new Set(system.junctions.AB),
  new Set(sharedAtoms(nucleus.rings[0], nucleus.rings[1]))
);

assert.deepEqual(
  new Set(system.junctions.BC),
  new Set(sharedAtoms(nucleus.rings[1], nucleus.rings[2]))
);

assert.deepEqual(
  new Set(system.junctions.CD),
  new Set(sharedAtoms(nucleus.rings[2], nucleus.rings[3]))
);

assert.equal(
  new Set(Object.values(system.junctions).flat()).size,
  6
);});

test("steroid ring labels are invariant under atom IDs, ring order and orientation", () => {
  let nucleus = fuseRingOnBond(makeRing(6), 1, 2, 6);

  const secondRing = nucleus.rings[1];

  nucleus = fuseRingOnBond(
    nucleus,
    secondRing.atomIds[2],
    secondRing.atomIds[3],
    6
  );

  const thirdRing = nucleus.rings[2];

  nucleus = fuseRingOnBond(
    nucleus,
    thirdRing.atomIds[2],
    thirdRing.atomIds[3],
    5
  );

  const original = getSteroidLike6565System(nucleus);

  assert.ok(original);

  // Cambiar todos los identificadores internos.
  const idMap = new Map(
    nucleus.atoms.map((atom, index) => [
      atom.id,
      101 + index * 11
    ])
  );

  // Crear una copia con diferente orden y orientación.
  const remapped = {
    atoms: [...nucleus.atoms].reverse().map((atom, index) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: index * 37,
      y: -index * 23
    })),

    bonds: [...nucleus.bonds].reverse().map(
      ([left, right, order]) => [
        idMap.get(right),
        idMap.get(left),
        order
      ]
    ),

    rings: [...nucleus.rings].reverse().map((ring) => ({
      ...ring,
      id: ring.id + 100,
      atomIds: [...ring.atomIds]
        .reverse()
        .map((id) => idMap.get(id))
    }))
  };

  const result = getSteroidLike6565System(remapped);

  assert.ok(result);

  // Los cuatro anillos deben conservar su identidad.
  for (const label of ["A", "B", "C", "D"]) {
    const expected = original.ringsByLabel[label]
      .map((id) => idMap.get(id))
      .sort((a, b) => a - b);

    const actual = [...result.ringsByLabel[label]]
      .sort((a, b) => a - b);

    assert.deepEqual(actual, expected);
  }

  // Comprobar que las uniones A/B, B/C y C/D
  // conservan sus átomos aunque cambien los IDs.
  for (const junction of ["AB", "BC", "CD"]) {
    const expected = original.junctions[junction]
      .map((id) => idMap.get(id))
      .sort((a, b) => a - b);

    const actual = [...result.junctions[junction]]
      .sort((a, b) => a - b);

    assert.deepEqual(actual, expected);
  }

  assert.equal(result.atomIds.length, 17);
  assert.deepEqual(result.ringSizes, [6, 6, 6, 5]);
});
function makeGonaneReference() {
  // Núcleo de gonano sin especificar estereoquímica.
  // Anillos en orden A, B, C y D.
  const ringAtomIds = [
    [1, 17, 16, 4, 3, 2],
    [5, 6, 7, 15, 16, 4],
    [13, 14, 15, 7, 8, 12],
    [9, 8, 12, 11, 10],
  ];

  const bonds = [];
  const edgeKeys = new Set();

  for (const ids of ringAtomIds) {
    ids.forEach((atomId, index) => {
      const nextId = ids[(index + 1) % ids.length];

      const key = [atomId, nextId]
        .sort((a, b) => a - b)
        .join("-");

      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        bonds.push([atomId, nextId, 1]);
      }
    });
  }

  return {
    atoms: Array.from({ length: 17 }, (_, index) => ({
      id: index + 1,
    })),

    bonds,

    rings: ringAtomIds.map((atomIds, index) => ({
      id: index + 1,
      kind: "cycloalkane",
      atomIds,
    })),
  };
}

test("recognises the gonane ring connectivity", () => {
  const nucleus = makeGonaneReference();
  const ringAtomIds = nucleus.rings.map((ring) => ring.atomIds);

const system = getSteroidLike6565System(nucleus);

assert.equal(system?.isGonaneTopology, true);

assert.ok(system);
assert.equal(system.atomIds.length, 17);

// El núcleo debe seguir reconociéndose si contiene un enlace doble.
const unsaturated = structuredClone(nucleus);

const doubleBond = unsaturated.bonds.find(
  ([left, right]) =>
    (left === 2 && right === 3) ||
    (left === 3 && right === 2)
);

assert.ok(doubleBond);

doubleBond[2] = 2;

const unsaturatedSystem = getSteroidLike6565System(unsaturated);

assert.ok(unsaturatedSystem);
assert.equal(unsaturatedSystem.isGonaneTopology, true);
// Un carbono de fusión no puede superar cuatro enlaces de valencia.
const invalid = structuredClone(nucleus);

const junctionBond = invalid.bonds.find(
  ([left, right]) =>
    (left === 4 && right === 16) ||
    (left === 16 && right === 4)
);

assert.ok(junctionBond);

// Ambos carbonos ya participan en tres enlaces simples.
// Convertir uno de ellos en triple excedería su valencia.
junctionBond[2] = 3;

assert.equal(
  getSteroidLike6565System(invalid),
  null
);

  // Debe reconocer los cuatro anillos.
  for (const [index, label] of ["A", "B", "C", "D"].entries()) {
    assert.deepEqual(
      system.ringsByLabel[label],
      ringAtomIds[index]
    );
  }

  // Comprobar los seis carbonos de fusión.
  const expectedJunctions = {
    AB: [4, 16],
    BC: [7, 15],
    CD: [8, 12],
  };

  for (const junction of ["AB", "BC", "CD"]) {
    assert.deepEqual(
      [...system.junctions[junction]].sort((a, b) => a - b),
      expectedJunctions[junction].sort((a, b) => a - b)
    );
  }
});
test("does not confuse partially angular fusion with gonane topology", () => {
  let nucleus = fuseRingOnBond(makeRing(6), 1, 2, 6);

  const secondRing = nucleus.rings[1];

  // Fusion angular en B.
  nucleus = fuseRingOnBond(
    nucleus,
    secondRing.atomIds[1],
    secondRing.atomIds[2],
    6
  );

  const thirdRing = nucleus.rings[2];

  // Fusion opuesta en C.
  nucleus = fuseRingOnBond(
    nucleus,
    thirdRing.atomIds[2],
    thirdRing.atomIds[3],
    5
  );

  const system = getSteroidLike6565System(nucleus);

  assert.ok(system);
  assert.equal(system.atomIds.length, 17);
  assert.equal(system.isGonaneTopology, false);
  assert.equal(system.numbering, undefined);
});

test("numbers the gonane core C1-C17 independently of atom IDs", () => {
  const nucleus = makeGonaneReference();
  const system = getSteroidLike6565System(nucleus);
  assert.equal(system?.isGonaneTopology, true);
  // Molecule IDs in this fixture are intentionally NOT steroid locants.
  assert.deepEqual(system?.numbering, [
    17, 1, 2, 3, 4, 5, 6, 7, 15, 16, 14, 13, 12, 8, 9, 10, 11,
  ]);
  const numbered = system.numbering;
  const sameSet = (actual, expected) => {
    assert.deepEqual([...actual].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
  };
  sameSet(system.junctions.AB, [numbered[4], numbered[9]]); // C5 and C10
  sameSet(system.junctions.BC, [numbered[7], numbered[8]]); // C8 and C9
  sameSet(system.junctions.CD, [numbered[12], numbered[13]]); // C13 and C14

  // Unsaturation and exocyclic oxygen are permitted if carbon valence remains valid.
  let derivative = setBondOrder(nucleus, numbered[3], numbered[4], 2); // C4=C5
  derivative = addOxygenGroup(derivative, numbered[2], 2); // C3 ketone
  derivative = addOxygenGroup(derivative, numbered[16], 1); // C17 alcohol
  derivative = addLinearAlkyl(derivative, numbered[9], 1); // C10 methyl
  derivative = addLinearAlkyl(derivative, numbered[12], 1); // C13 methyl
  assert.deepEqual(getSteroidLike6565System(derivative)?.numbering, numbered);
});

test("gonane numbering is invariant under atom IDs, ring order and coordinates", () => {
  const nucleus = makeGonaneReference();
  const numbering = getSteroidLike6565System(nucleus)?.numbering;
  assert.ok(numbering);
  const remap = new Map(nucleus.atoms.map((atom, index) => [atom.id, 1009 + index * 23]));
  const scrambled = {
    atoms: [...nucleus.atoms].reverse().map((atom, index) => ({
      ...atom, id: remap.get(atom.id), x: -500 + index * 37, y: 400 - index * 31,
    })),
    bonds: [...nucleus.bonds].reverse().map(([a, b, order]) => [remap.get(b), remap.get(a), order]),
    rings: [...nucleus.rings].reverse().map((ring) => ({
      ...ring, id: ring.id + 100, atomIds: [...ring.atomIds].reverse().map((id) => remap.get(id)),
    })),
  };
  assert.deepEqual(
    getSteroidLike6565System(scrambled)?.numbering,
    numbering.map((id) => remap.get(id)),
  );
});


test("recognises angular C18 and C19 methyls without confusing their atom IDs with locants", () => {
  const core = makeGonaneReference();
  const numbered = getSteroidLike6565System(core)?.numbering;
  assert.ok(numbered);
  let androstane = addLinearAlkyl(core, numbered[12], 1); // C13 -> C18
  androstane = addLinearAlkyl(androstane, numbered[9], 1); // C10 -> C19
  const system = getSteroidLike6565System(androstane);
  assert.equal(system?.isGonaneTopology, true);
  assert.deepEqual(system?.angularMethyls, { C18: 18, C19: 19 });
  assert.equal(system?.constitutionNameEs, undefined);
  assert.equal(getSteroidLike6565System(core)?.angularMethyls, undefined);

  const wrongPosition = addLinearAlkyl(core, numbered[4], 1); // C5, not C10
  assert.equal(getSteroidLike6565System(wrongPosition)?.angularMethyls, undefined);
});

test("recognises the exact testosterone constitution without assigning stereochemistry", () => {
  const core = makeGonaneReference();
  const n = getSteroidLike6565System(core)?.numbering;
  assert.ok(n);
  let molecule = setBondOrder(core, n[3], n[4], 2); // C4=C5
  molecule = addOxygenGroup(molecule, n[2], 2); // C3 ketone
  molecule = addOxygenGroup(molecule, n[16], 1); // C17 OH
  molecule = addLinearAlkyl(molecule, n[12], 1); // C13 -> C18
  molecule = addLinearAlkyl(molecule, n[9], 1); // C10 -> C19
  const result = getSteroidLike6565System(molecule);
  assert.equal(result?.isGonaneTopology, true);
  assert.deepEqual(result?.angularMethyls, { C18: 20, C19: 21 });
  assert.equal(result?.constitutionNameEs, "17-hidroxiandrost-4-en-3-ona");
  assert.equal(result?.constitutionNameEn, "17-hydroxyandrost-4-en-3-one");

  // The matching formula alone does not justify this name: change the
  // position of the double bond while keeping the atom/bond counts identical.
  const otherAlkene = structuredClone(molecule);
  const changeBond = (a, b, order) => {
    const bond = otherAlkene.bonds.find(([left, right]) => (
      (left === a && right === b) || (left === b && right === a)
    ));
    assert.ok(bond);
    bond[2] = order;
  };
  changeBond(n[3], n[4], 1); // revert C4=C5
  changeBond(n[1], n[2], 2); // C2=C3 (different constitution)
  // C3 already has a carbonyl: this intentionally exceeds valence and is rejected.
  assert.equal(getSteroidLike6565System(otherAlkene), null);
  changeBond(n[1], n[2], 1);
  changeBond(n[5], n[6], 2); // valid C6=C7 instead
  assert.equal(getSteroidLike6565System(otherAlkene)?.constitutionNameEs, undefined);
});

test("steroid constitutional naming survives shuffled graph IDs and rejects extra groups", () => {
  const core = makeGonaneReference();
  const n = getSteroidLike6565System(core)?.numbering;
  assert.ok(n);
  let molecule = setBondOrder(core, n[3], n[4], 2);
  molecule = addOxygenGroup(molecule, n[2], 2);
  molecule = addOxygenGroup(molecule, n[16], 1);
  molecule = addLinearAlkyl(molecule, n[12], 1);
  molecule = addLinearAlkyl(molecule, n[9], 1);
  const remap = new Map(molecule.atoms.map((atom, index) => [atom.id, 600 + index * 19]));
  const scrambled = {
    atoms: [...molecule.atoms].reverse().map((atom) => ({ ...atom, id: remap.get(atom.id) })),
    bonds: [...molecule.bonds].reverse().map(([a, b, order]) => [remap.get(b), remap.get(a), order]),
    rings: [...molecule.rings].reverse().map((ring) => ({
      ...ring, atomIds: [...ring.atomIds].reverse().map((id) => remap.get(id)),
    })),
  };
  const renamed = getSteroidLike6565System(scrambled);
  assert.equal(renamed?.constitutionNameEs, "17-hidroxiandrost-4-en-3-ona");
  assert.deepEqual(renamed?.angularMethyls, { C18: remap.get(20), C19: remap.get(21) });
  const extra = addOxygenGroup(molecule, n[6], 1);
  assert.equal(getSteroidLike6565System(extra)?.constitutionNameEs, undefined);
});

test("integrates a structural tricyclic descriptor without inventing an IUPAC name", () => {
  let molecule = fuseRingOnBond(makeRing(6), 1, 2, 6);
  const centralRing = molecule.rings[1];
  molecule = fuseRingOnBond(molecule, centralRing.atomIds[2], centralRing.atomIds[3], 6);
  const anchorId = molecule.rings[2].atomIds[2];
  molecule = addLinearAlkyl(molecule, anchorId, 2);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "Nombre no disponible para estructuras complejas");
  assert.equal(analysis.fusedTricyclic?.topology, "linear");
  assert.deepEqual(analysis.fusedTricyclic?.ringSizes, [6, 6, 6]);
  assert.equal(analysis.fusedTricyclic?.atomIds.length, 14);
  assert.equal(analysis.fusedTricyclic?.externalAtomIds.length, 2);
  assert.equal(analysis.fusedTricyclic?.numbering, null);
  assert.equal(analysis.fusedTricyclic?.systematicName, null);
  assert.match(analysis.ringSystem, /Sistema tricíclico fusionado 6-6-6 \(lineal\)/);
});
