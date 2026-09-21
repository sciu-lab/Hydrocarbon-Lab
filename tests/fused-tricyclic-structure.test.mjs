import assert from "node:assert/strict";
import test from "node:test";
import { fuseRingOnBond } from "../app/fused-ring.ts";
import { getFusedTricyclicSystem } from "../app/fused-ring-nomenclature.ts";

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
  molecule = fuseRingOnBond(
    molecule,
    middle.atomIds[edgeIndex],
    middle.atomIds[edgeIndex + 1],
    terminalSize,
  );
  return molecule;
}

function makeTricycleFromOppositeTerminal(middleSize, firstTerminalSize) {
  let molecule = fuseRingOnBond(makeRing(firstTerminalSize), 1, 2, middleSize);
  const middle = molecule.rings[1];
  molecule = fuseRingOnBond(molecule, middle.atomIds[1], middle.atomIds[2], 6);
  return molecule;
}

function peripheralCoreAtom(molecule) {
  const fusionAtoms = new Set();
  for (let left = 0; left < molecule.rings.length; left++) {
    for (let right = left + 1; right < molecule.rings.length; right++) {
      molecule.rings[left].atomIds
        .filter((id) => molecule.rings[right].atomIds.includes(id))
        .forEach((id) => fusionAtoms.add(id));
    }
  }
  return molecule.rings[2].atomIds.find((id) => !fusionAtoms.has(id));
}

function addExternalChain(molecule, length) {
  const next = structuredClone(molecule);
  let anchorId = peripheralCoreAtom(next);
  for (let index = 0; index < length; index++) {
    const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
    next.atoms.push({ id, x: index + 10, y: 10 });
    next.bonds.push([anchorId, id, 1]);
    anchorId = id;
  }
  return next;
}

function addExternalChainAt(molecule, anchorId, length) {
  const next = structuredClone(molecule);
  let previousId = anchorId;
  for (let index = 0; index < length; index++) {
    const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
    next.atoms.push({ id, x: 20 + index, y: -10 - index });
    next.bonds.push([previousId, id, 1]);
    previousId = id;
  }
  return next;
}

function addOxygen(molecule, order) {
  const next = structuredClone(molecule);
  const carbonId = peripheralCoreAtom(next);
  const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  next.atoms.push({ id, x: 10, y: 10, element: "O" });
  next.bonds.push([carbonId, id, order]);
  return next;
}

function addOxygenAt(molecule, carbonId, order) {
  const next = structuredClone(molecule);
  const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  next.atoms.push({ id, x: 10 + id, y: 10 - id, element: "O" });
  next.bonds.push([carbonId, id, order]);
  return next;
}

function detectedOxygenGroups(molecule) {
  return molecule.atoms.filter((atom) => atom.element === "O").map((oxygen) => {
    const attachment = molecule.bonds.find(([left, right]) => left === oxygen.id || right === oxygen.id);
    const attachedCarbonId = attachment[0] === oxygen.id ? attachment[1] : attachment[0];
    return {
      kind: (attachment[2] ?? 1) === 2 ? "ketone" : "alcohol",
      carbonId: attachedCarbonId,
      heteroAtomId: oxygen.id,
      atomIds: [attachedCarbonId, oxygen.id],
    };
  });
}

function getDetectedTricyclicSystem(molecule) {
  return getFusedTricyclicSystem(molecule, detectedOxygenGroups(molecule));
}

function addCoreDoubleBond(molecule) {
  const next = structuredClone(molecule);
  const fusionAtoms = new Set(getFusedTricyclicSystem(next).sharedAtomPairs.flat());
  const bond = next.bonds.find(([left, right]) => (
    !fusionAtoms.has(left)
    && !fusionAtoms.has(right)
    && next.rings.some((ring) => ring.atomIds.includes(left) && ring.atomIds.includes(right))
  ));
  assert.ok(bond);
  bond[2] = 2;
  return next;
}

function setCoreBondOrder(molecule, leftId, rightId, order) {
  const next = structuredClone(molecule);
  const bond = next.bonds.find(([left, right]) => (
    (left === leftId && right === rightId) || (left === rightId && right === leftId)
  ));
  assert.ok(bond, `expected bond ${leftId}-${rightId}`);
  bond[2] = order;
  return next;
}

function hasBond(molecule, left, right) {
  return molecule.bonds.some(([a, b]) => (
    (a === left && b === right) || (a === right && b === left)
  ));
}

function hydrocarbonFormula(molecule) {
  const valence = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  molecule.bonds.forEach(([left, right, order = 1]) => {
    valence.set(left, valence.get(left) + order);
    valence.set(right, valence.get(right) + order);
  });
  const hydrogens = molecule.atoms.reduce((total, atom) => total + 4 - valence.get(atom.id), 0);
  return `C${molecule.atoms.length}H${hydrogens}`;
}

function assertCoherentVonBaeyerNumbering(molecule, system) {
  assert.ok(system);
  assert.equal(system.numbering.length, system.atomIds.length);
  assert.equal(new Set(system.numbering).size, system.atomIds.length);
  assert.deepEqual(
    [...system.numbering].sort((a, b) => a - b),
    [...system.atomIds].sort((a, b) => a - b),
  );
  assert.equal(system.mainRing.length, system.atomIds.length);
  system.mainRing.forEach((atomId, index) => {
    assert.ok(hasBond(molecule, atomId, system.mainRing[(index + 1) % system.mainRing.length]));
  });
  assert.equal(system.mainBridge.length, 0);
  assert.ok(hasBond(molecule, ...system.mainBridge.bridgeheads));
  assert.equal(system.secondaryBridges.length, 1);
  const secondary = system.secondaryBridges[0];
  assert.equal(secondary.length, 0);
  assert.ok(hasBond(molecule, ...secondary.bridgeheads));
  const locants = new Map(system.numbering.map((atomId, index) => [atomId, index + 1]));
  assert.deepEqual(
    secondary.bridgeheads.map((atomId) => locants.get(atomId)).sort((a, b) => a - b),
    secondary.attachmentLocants,
  );
  const descriptorNumbers = system.vonBaeyerDescriptor
    .slice(1, system.vonBaeyerDescriptor.indexOf("^"))
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  assert.equal(descriptorNumbers.reduce((sum, value) => sum + value, 0) + 2, system.atomIds.length);
}

test("recognises linear and angular fused 6-6-6 systems", () => {
  const linearMolecule = makeTricycle(6, 6, "linear");
  const angularMolecule = makeTricycle(6, 6, "angular");
  const linear = getFusedTricyclicSystem(linearMolecule);
  const angular = getFusedTricyclicSystem(angularMolecule);
  assert.equal(linear?.topology, "linear");
  assert.equal(angular?.topology, "angular");
  for (const [molecule, system] of [[linearMolecule, linear], [angularMolecule, angular]]) {
    assert.deepEqual(system?.ringSizes, [6, 6, 6]);
    assert.equal(system?.atomIds.length, 14);
    assert.equal(system?.fusionBonds.length, 2);
    assert.deepEqual(system?.fusionBonds.map((bond) => bond.order), [1, 1]);
    assert.equal(system?.sharedAtomPairs.length, 2);
    assert.equal(system?.ringConnectivity.centralRingAtomIds.length, 6);
    assert.deepEqual(system?.ringConnectivity.terminalRingAtomIds.map((ids) => ids.length), [6, 6]);
    assert.equal(system?.externalAtomIds.length, 0);
    assertCoherentVonBaeyerNumbering(molecule, system);
  }
  assert.equal(linear?.vonBaeyerDescriptor, "[8.4.0.0^{3,8}]");
  assert.equal(linear?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecano");
  assert.equal(linear?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradecane");
  assert.equal(angular?.vonBaeyerDescriptor, "[8.4.0.0^{2,7}]");
  assert.equal(angular?.systematicName, "triciclo[8.4.0.0^{2,7}]tetradecano");
  assert.equal(angular?.systematicNameEn, "tricyclo[8.4.0.0^{2,7}]tetradecane");
});

test("distinguishes 6-6-5 and 6-5-6 by the central ring", () => {
  const sixSixFiveMolecule = makeTricycle(6, 5, "angular");
  const sixFiveSixMolecule = makeTricycle(5, 6, "angular");
  const sixSixFive = getFusedTricyclicSystem(sixSixFiveMolecule);
  const sixFiveSix = getFusedTricyclicSystem(sixFiveSixMolecule);
  assert.deepEqual(sixSixFive?.ringSizes, [6, 6, 5]);
  assert.equal(sixSixFive?.centralRingSize, 6);
  assert.equal(sixSixFive?.systematicName, "triciclo[7.4.0.0^{2,6}]tridecano");
  assert.equal(sixSixFive?.systematicNameEn, "tricyclo[7.4.0.0^{2,6}]tridecane");
  assert.deepEqual(sixFiveSix?.ringSizes, [6, 5, 6]);
  assert.equal(sixFiveSix?.centralRingSize, 5);
  assert.equal(sixFiveSix?.systematicName, "triciclo[7.4.0.0^{2,7}]tridecano");
  assert.equal(sixFiveSix?.systematicNameEn, "tricyclo[7.4.0.0^{2,7}]tridecane");
  assertCoherentVonBaeyerNumbering(sixSixFiveMolecule, sixSixFive);
  assertCoherentVonBaeyerNumbering(sixFiveSixMolecule, sixFiveSix);
});

test("descriptor is independent of which terminal ring is constructed first", () => {
  const sixSixFive = getFusedTricyclicSystem(makeTricycle(6, 5, "angular"));
  const reversedConstruction = getFusedTricyclicSystem(makeTricycleFromOppositeTerminal(6, 5));
  assert.equal(reversedConstruction?.topology, sixSixFive?.topology);
  assert.deepEqual(reversedConstruction?.ringSizes, sixSixFive?.ringSizes);
  assert.equal(reversedConstruction?.vonBaeyerDescriptor, sixSixFive?.vonBaeyerDescriptor);
  assert.equal(reversedConstruction?.systematicName, sixSixFive?.systematicName);
});

test("keeps methyl and ethyl atoms outside the recognised core", () => {
  for (const length of [1, 2]) {
    const molecule = addExternalChain(makeTricycle(), length);
    const system = getFusedTricyclicSystem(molecule);
    assert.equal(system?.atomIds.length, 14);
    assert.equal(system?.externalAtomIds.length, length);
    assert.equal(system?.externalAttachments.length, 1);
    assert.equal(system?.externalAttachments[0].order, 1);
    assert.match(system?.systematicName ?? "", new RegExp(`^\\d+-${length === 1 ? "metil" : "etil"}triciclo`));
    assert.equal(system?.parentName, "triciclo[8.4.0.0^{3,8}]tetradecano");
    assertCoherentVonBaeyerNumbering(molecule, system);
  }
});

test("names linear alkyl substituents from methyl through hexyl", () => {
  const expectedNames = ["metil", "etil", "propil", "butil", "pentil", "hexil"];
  const expectedNamesEn = ["methyl", "ethyl", "propyl", "butyl", "pentyl", "hexyl"];
  expectedNames.forEach((name, index) => {
    const molecule = addExternalChainAt(makeTricycle(6, 6, "linear"), 12, index + 1);
    const system = getFusedTricyclicSystem(molecule);
    assert.equal(system?.systematicName, `5-${name}triciclo[8.4.0.0^{3,8}]tetradecano`);
    assert.equal(system?.systematicNameEn, `5-${expectedNamesEn[index]}tricyclo[8.4.0.0^{3,8}]tetradecane`);
    assert.deepEqual(system?.substituents.map((substituent) => substituent.locant), [5]);
  });
});

test("selects substituent locants across equivalent linear and angular numberings", () => {
  const linear = getFusedTricyclicSystem(addExternalChainAt(makeTricycle(6, 6, "linear"), 12, 1));
  const angular = getFusedTricyclicSystem(addExternalChainAt(makeTricycle(6, 6, "angular"), 12, 1));
  assert.equal(linear?.numberingCandidates.length, 4);
  assert.equal(linear?.systematicName, "5-metiltriciclo[8.4.0.0^{3,8}]tetradecano");
  assert.equal(angular?.numberingCandidates.length, 2);
  assert.equal(angular?.systematicName, "4-metiltriciclo[8.4.0.0^{2,7}]tetradecano");
});

test("names alkyl derivatives of the supported 6-6-5 and 6-5-6 parents", () => {
  const sixSixFive = getFusedTricyclicSystem(addExternalChainAt(makeTricycle(6, 5, "angular"), 11, 1));
  const sixFiveSix = getFusedTricyclicSystem(addExternalChainAt(makeTricycle(5, 6, "angular"), 11, 1));
  assert.equal(sixSixFive?.systematicName, "3-metiltriciclo[7.4.0.0^{2,6}]tridecano");
  assert.equal(sixSixFive?.systematicNameEn, "3-methyltricyclo[7.4.0.0^{2,6}]tridecane");
  assert.equal(sixFiveSix?.systematicName, "4-metiltriciclo[7.4.0.0^{2,7}]tridecano");
  assert.equal(sixFiveSix?.systematicNameEn, "4-methyltricyclo[7.4.0.0^{2,7}]tridecane");
});

test("groups repeated alkyls and uses alphabetical order to break locant ties", () => {
  let dimethyl = addExternalChainAt(makeTricycle(6, 6, "linear"), 12, 1);
  dimethyl = addExternalChainAt(dimethyl, 4, 1);
  const dimethylSystem = getFusedTricyclicSystem(dimethyl);
  assert.equal(dimethylSystem?.systematicName, "5,12-dimetiltriciclo[8.4.0.0^{3,8}]tetradecano");
  assert.equal(dimethylSystem?.systematicNameEn, "5,12-dimethyltricyclo[8.4.0.0^{3,8}]tetradecane");

  let ethylMethyl = addExternalChainAt(makeTricycle(6, 6, "linear"), 12, 2);
  ethylMethyl = addExternalChainAt(ethylMethyl, 13, 1);
  const mixedSystem = getFusedTricyclicSystem(ethylMethyl);
  assert.equal(mixedSystem?.systematicName, "5-etil-6-metiltriciclo[8.4.0.0^{3,8}]tetradecano");
  assert.equal(mixedSystem?.systematicNameEn, "5-ethyl-6-methyltricyclo[8.4.0.0^{3,8}]tetradecane");
});

test("names a methyl on a fusion carbon when valence permits it", () => {
  const molecule = addExternalChainAt(makeTricycle(6, 6, "linear"), 1, 1);
  const system = getFusedTricyclicSystem(molecule);
  assert.equal(system?.systematicName, "1-metiltriciclo[8.4.0.0^{3,8}]tetradecano");
  assert.equal(system?.substituents[0].anchorId, 1);
  assert.equal(system?.substituents[0].locant, 1);
  assertCoherentVonBaeyerNumbering(molecule, system);
});

test("names one and several double or triple bonds on a tricyclic core", () => {
  const alkene = getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(), 11, 12, 2));
  const diene = getFusedTricyclicSystem(setCoreBondOrder(
    setCoreBondOrder(makeTricycle(), 11, 12, 2),
    13,
    14,
    2,
  ));
  const alkyne = getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(), 11, 12, 3));
  const diyne = getFusedTricyclicSystem(setCoreBondOrder(
    setCoreBondOrder(makeTricycle(), 11, 12, 3),
    13,
    14,
    3,
  ));
  assert.equal(alkene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-4-eno");
  assert.equal(alkene?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-4-ene");
  assert.equal(diene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradeca-4,6-dieno");
  assert.deepEqual(diene?.doubleBondLocants, [4, 6]);
  assert.equal(alkyne?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-4-ino");
  assert.equal(alkyne?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-4-yne");
  assert.equal(diyne?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradeca-4,6-diino");
  assert.equal(diyne?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradeca-4,6-diyne");
});

test("gives double bonds priority when an enyne locant set ties", () => {
  let molecule = setCoreBondOrder(makeTricycle(), 11, 12, 2);
  molecule = setCoreBondOrder(molecule, 13, 14, 3);
  const system = getFusedTricyclicSystem(molecule);
  assert.equal(system?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-4-en-6-ino");
  assert.equal(system?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-4-en-6-yne");
  assert.deepEqual(system?.doubleBondLocants, [4]);
  assert.deepEqual(system?.tripleBondLocants, [6]);
});

test("multiple bonds outrank alkyl prefixes and combine with repeated substituents", () => {
  let methyl = setCoreBondOrder(makeTricycle(), 11, 12, 2);
  methyl = addExternalChainAt(methyl, 13, 1);
  assert.equal(
    getFusedTricyclicSystem(methyl)?.systematicName,
    "6-metiltriciclo[8.4.0.0^{3,8}]tetradec-4-eno",
  );

  let ethyl = setCoreBondOrder(makeTricycle(), 11, 12, 2);
  ethyl = addExternalChainAt(ethyl, 13, 2);
  assert.equal(
    getFusedTricyclicSystem(ethyl)?.systematicNameEn,
    "6-ethyltricyclo[8.4.0.0^{3,8}]tetradec-4-ene",
  );

  let mixed = setCoreBondOrder(makeTricycle(), 11, 12, 2);
  mixed = addExternalChainAt(mixed, 13, 1);
  mixed = addExternalChainAt(mixed, 14, 2);
  const mixedSystem = getFusedTricyclicSystem(mixed);
  assert.equal(mixedSystem?.systematicName, "7-etil-6-metiltriciclo[8.4.0.0^{3,8}]tetradec-4-eno");
  assert.equal(mixedSystem?.systematicNameEn, "7-ethyl-6-methyltricyclo[8.4.0.0^{3,8}]tetradec-4-ene");
});

test("names simple unsaturation in all four supported tricyclic topologies", () => {
  const angular = getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(6, 6, "angular"), 11, 12, 2));
  const sixSixFive = getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(6, 5, "angular"), 11, 12, 2));
  const sixFiveSix = getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(5, 6, "angular"), 10, 11, 2));
  assert.equal(angular?.systematicName, "triciclo[8.4.0.0^{2,7}]tetradec-3-eno");
  assert.equal(sixSixFive?.systematicName, "triciclo[7.4.0.0^{2,6}]tridec-3-eno");
  assert.equal(sixFiveSix?.systematicName, "triciclo[7.4.0.0^{2,7}]tridec-3-eno");
});

test("names a fusion-bond double bond with a compound locant", () => {
  const molecule = setCoreBondOrder(makeTricycle(), 1, 2, 2);
  const system = getFusedTricyclicSystem(molecule);
  assert.ok(system);
  assert.equal(system.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-1(10)-eno");
  assert.equal(system.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-1(10)-ene");
  assert.equal(system.vonBaeyerDescriptor, "[8.4.0.0^{3,8}]");
  assert.deepEqual(system.coreMultipleBonds, [{ atomIds: [1, 2], order: 2 }]);
  assert.deepEqual(system.doubleBondLocations, [{
    atomIds: [1, 2], locants: [1, 10], lower: 1, higher: 10, compound: true,
  }]);
  assert.equal(system.atomIds.length, 14);
  assert.equal(getFusedTricyclicSystem(setCoreBondOrder(makeTricycle(), 1, 2, 3)), null);
});

test("selects the preferred numbering for the angular C14H18 triene independently of visible locants", () => {
  let molecule = makeTricycle(6, 6, "angular");
  molecule = setCoreBondOrder(molecule, 11, 12, 2);
  molecule = setCoreBondOrder(molecule, 13, 14, 2);
  molecule = setCoreBondOrder(molecule, 7, 8, 2);
  const system = getFusedTricyclicSystem(molecule);
  assert.equal(hydrocarbonFormula(molecule), "C14H18");
  assert.equal(system?.coreMultipleBonds.length, 3);
  assert.equal(system?.systematicName, "triciclo[8.4.0.0^{2,7}]tetradeca-1(10),11,13-trieno");
  assert.equal(system?.systematicNameEn, "tricyclo[8.4.0.0^{2,7}]tetradeca-1(10),11,13-triene");
  assert.deepEqual(system?.doubleBondLocations.map(({ locants, compound }) => ({ locants, compound })), [
    { locants: [1, 10], compound: true },
    { locants: [11, 12], compound: false },
    { locants: [13, 14], compound: false },
  ]);
  assert.deepEqual(system?.doubleBondLocants, [1, 11, 13]);
  assertCoherentVonBaeyerNumbering(molecule, system);
});

test("keeps the angular diene name without an unnecessary compound locant", () => {
  let molecule = makeTricycle(6, 6, "angular");
  molecule = setCoreBondOrder(molecule, 11, 12, 2);
  molecule = setCoreBondOrder(molecule, 13, 14, 2);
  const system = getFusedTricyclicSystem(molecule);
  assert.equal(hydrocarbonFormula(molecule), "C14H20");
  assert.equal(system?.systematicName, "triciclo[8.4.0.0^{2,7}]tetradeca-3,5-dieno");
  assert.equal(system?.systematicNameEn, "tricyclo[8.4.0.0^{2,7}]tetradeca-3,5-diene");
  assert.ok(system?.doubleBondLocations.every((location) => !location.compound));
});

test("combines methyl or ethyl prefixes with a compound unsaturation locant", () => {
  const parent = setCoreBondOrder(makeTricycle(), 1, 2, 2);
  const methyl = getFusedTricyclicSystem(addExternalChainAt(parent, 12, 1));
  const ethyl = getFusedTricyclicSystem(addExternalChainAt(parent, 12, 2));
  assert.equal(
    methyl?.systematicName,
    "5-metiltriciclo[8.4.0.0^{3,8}]tetradec-1(10)-eno",
  );
  assert.equal(
    ethyl?.systematicNameEn,
    "5-ethyltricyclo[8.4.0.0^{3,8}]tetradec-1(10)-ene",
  );
  assert.equal(methyl?.doubleBondLocations[0].compound, true);
  assert.equal(ethyl?.doubleBondLocations[0].compound, true);
});

test("supports compound alkene locants across the 6-6-5 and 6-5-6 cores", () => {
  for (const [middleSize, terminalSize] of [[6, 5], [5, 6]]) {
    const base = makeTricycle(middleSize, terminalSize, "angular");
    const [left, right] = getFusedTricyclicSystem(base).sharedAtomPairs[0];
    const system = getFusedTricyclicSystem(setCoreBondOrder(base, left, right, 2));
    assert.ok(system?.systematicName);
    assert.ok(system.doubleBondLocations.some((location) => location.compound));
    assert.match(system.systematicName, /\d+\(\d+\)-eno$/);
  }
});

test("names tricyclic alcohols, ketones, diols, triols and diones", () => {
  const parent = makeTricycle();
  const alcohol = getDetectedTricyclicSystem(addOxygenAt(parent, 12, 1));
  const diol = getDetectedTricyclicSystem(addOxygenAt(addOxygenAt(parent, 12, 1), 13, 1));
  const triol = getDetectedTricyclicSystem(
    addOxygenAt(addOxygenAt(addOxygenAt(parent, 11, 1), 12, 1), 13, 1),
  );
  const ketone = getDetectedTricyclicSystem(addOxygenAt(parent, 12, 2));
  const dione = getDetectedTricyclicSystem(addOxygenAt(addOxygenAt(parent, 12, 2), 13, 2));
  assert.equal(alcohol?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecan-5-ol");
  assert.equal(alcohol?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradecan-5-ol");
  assert.equal(diol?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecano-5,6-diol");
  assert.equal(triol?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecano-4,5,6-triol");
  assert.equal(ketone?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecan-5-ona");
  assert.equal(ketone?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradecan-5-one");
  assert.equal(dione?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradecano-5,6-diona");
  assert.equal(dione?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradecane-5,6-dione");
});

test("uses ketone as suffix and alcohol as hydroxy prefix in tricycles", () => {
  const parent = makeTricycle();
  const hydroxyKetone = getDetectedTricyclicSystem(
    addOxygenAt(addOxygenAt(parent, 12, 2), 13, 1),
  );
  const dihydroxyKetone = getDetectedTricyclicSystem(
    addOxygenAt(addOxygenAt(addOxygenAt(parent, 11, 1), 12, 2), 13, 1),
  );
  assert.equal(
    hydroxyKetone?.systematicName,
    "6-hidroxitriciclo[8.4.0.0^{3,8}]tetradecan-5-ona",
  );
  assert.equal(
    hydroxyKetone?.systematicNameEn,
    "6-hydroxytricyclo[8.4.0.0^{3,8}]tetradecan-5-one",
  );
  assert.equal(
    dihydroxyKetone?.systematicName,
    "4,6-dihidroxitriciclo[8.4.0.0^{3,8}]tetradecan-5-ona",
  );
  assert.equal(hydroxyKetone?.primaryFunctionalGroup, "ketone");
});

test("combines tricyclic functional groups with alkyls and unsaturation", () => {
  let dialkylKetone = addOxygenAt(makeTricycle(), 11, 2);
  dialkylKetone = addExternalChainAt(dialkylKetone, 12, 1);
  dialkylKetone = addExternalChainAt(dialkylKetone, 13, 2);
  assert.equal(
    getDetectedTricyclicSystem(dialkylKetone)?.systematicName,
    "6-etil-5-metiltriciclo[8.4.0.0^{3,8}]tetradecan-4-ona",
  );

  const alcoholAlkene = getDetectedTricyclicSystem(setCoreBondOrder(
    addOxygenAt(makeTricycle(), 11, 1), 13, 14, 2,
  ));
  const ketoneAlkene = getDetectedTricyclicSystem(setCoreBondOrder(
    addOxygenAt(makeTricycle(), 11, 2), 13, 14, 2,
  ));
  let ketoneDieneMolecule = addOxygenAt(makeTricycle(), 11, 2);
  ketoneDieneMolecule = setCoreBondOrder(ketoneDieneMolecule, 13, 14, 2);
  ketoneDieneMolecule = setCoreBondOrder(ketoneDieneMolecule, 3, 4, 2);
  const ketoneDiene = getDetectedTricyclicSystem(ketoneDieneMolecule);
  assert.equal(alcoholAlkene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-6-en-4-ol");
  assert.equal(ketoneAlkene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-6-en-4-ona");
  assert.equal(ketoneDiene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradeca-6,11-dien-4-ona");

  const alcoholAlkyne = getDetectedTricyclicSystem(setCoreBondOrder(
    addOxygenAt(makeTricycle(), 11, 1), 13, 14, 3,
  ));
  const ketoneAlkyne = getDetectedTricyclicSystem(setCoreBondOrder(
    addOxygenAt(makeTricycle(), 11, 2), 13, 14, 3,
  ));
  assert.equal(alcoholAlkyne?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-6-in-4-ol");
  assert.equal(ketoneAlkyne?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-6-yn-4-one");
});

test("combines a principal group with a compound unsaturation locant", () => {
  const molecule = setCoreBondOrder(addOxygenAt(makeTricycle(), 12, 2), 1, 2, 2);
  const system = getDetectedTricyclicSystem(molecule);
  assert.equal(system?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-1(10)-en-5-ona");
  assert.equal(system?.systematicNameEn, "tricyclo[8.4.0.0^{3,8}]tetradec-1(10)-en-5-one");
  assert.equal(system?.doubleBondLocations[0].compound, true);
});

test("names the complete general tricyclic ketone-alcohol-methyl-alkene combination", () => {
  let molecule = addOxygenAt(makeTricycle(), 11, 2);
  molecule = addOxygenAt(molecule, 12, 1);
  molecule = addExternalChainAt(molecule, 13, 1);
  molecule = setCoreBondOrder(molecule, 3, 4, 2);
  const system = getDetectedTricyclicSystem(molecule);
  assert.equal(
    system?.systematicName,
    "5-hidroxi-6-metiltriciclo[8.4.0.0^{3,8}]tetradec-11-en-4-ona",
  );
  assert.equal(
    system?.systematicNameEn,
    "5-hydroxy-6-methyltricyclo[8.4.0.0^{3,8}]tetradec-11-en-4-one",
  );
});

test("gives the principal tricyclic function priority over unsaturation and alkyl prefixes", () => {
  let molecule = addOxygenAt(makeTricycle(), 3, 2);
  molecule = setCoreBondOrder(molecule, 11, 12, 2);
  molecule = addExternalChainAt(molecule, 13, 1);
  const system = getDetectedTricyclicSystem(molecule);
  assert.equal(system?.functionalGroups[0].locant, 4);
  assert.deepEqual(system?.doubleBondLocants, [11]);
  assert.equal(system?.substituents[0].locant, 13);
  assert.equal(system?.systematicName, "13-metiltriciclo[8.4.0.0^{3,8}]tetradec-11-en-4-ona");
  assert.equal(system?.numbering[3], 3);
});

test("rejects unsupported or invalid tricyclic functional placement safely", () => {
  let sideChainAlcohol = addExternalChainAt(makeTricycle(), 12, 1);
  sideChainAlcohol = addOxygenAt(sideChainAlcohol, 15, 1);
  const sideChainSystem = getFusedTricyclicSystem(sideChainAlcohol, detectedOxygenGroups(sideChainAlcohol));
  assert.ok(sideChainSystem);
  assert.equal(sideChainSystem.systematicName, null);

  const amine = structuredClone(makeTricycle());
  amine.atoms.push({ id: 15, x: 20, y: 20, element: "N" });
  amine.bonds.push([12, 15, 1]);
  const unsupported = getFusedTricyclicSystem(amine, [{
    kind: "amine", carbonId: 12, heteroAtomId: 15, atomIds: [12, 15],
  }]);
  assert.ok(unsupported);
  assert.equal(unsupported.systematicName, null);

  assert.equal(getDetectedTricyclicSystem(addOxygenAt(makeTricycle(), 1, 2)), null);
});

test("does not mistake side-chain unsaturation for parent unsaturation", () => {
  let molecule = addExternalChainAt(makeTricycle(), 12, 3);
  molecule = setCoreBondOrder(molecule, 15, 16, 2);
  const system = getFusedTricyclicSystem(molecule);
  assert.ok(system);
  assert.equal(system.systematicName, null);
  assert.deepEqual(system.coreMultipleBonds, []);
  assert.equal(system.externalAtomIds.length, 3);
});

test("recognises the same core with ketone, alcohol or a double bond", () => {
  const ketone = getFusedTricyclicSystem(addOxygen(makeTricycle(), 2));
  const alcohol = getFusedTricyclicSystem(addOxygen(makeTricycle(), 1));
  const alkene = getFusedTricyclicSystem(addCoreDoubleBond(makeTricycle()));
  assert.equal(ketone?.externalAtomIds.length, 1);
  assert.equal(ketone?.externalAttachments[0].order, 2);
  assert.equal(alcohol?.externalAtomIds.length, 1);
  assert.equal(alcohol?.externalAttachments[0].order, 1);
  assert.deepEqual(alkene?.coreMultipleBonds.map((bond) => bond.order), [2]);
  assert.equal(ketone?.systematicName, null);
  assert.equal(alcohol?.systematicName, null);
  assert.equal(alkene?.systematicName, "triciclo[8.4.0.0^{3,8}]tetradec-4-eno");
});

test("recognition is invariant under IDs, coordinates and ring record order", () => {
  const source = addExternalChain(addCoreDoubleBond(makeTricycle(6, 5, "angular")), 2);
  const expected = getFusedTricyclicSystem(source);
  const idMap = new Map(source.atoms.map((atom, index) => [atom.id, 1001 + index * 29]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom, index) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: 500 - index * 37,
      y: -900 + index * 13,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 700 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => idMap.get(id)),
    })),
  };
  const actual = getFusedTricyclicSystem(transformed);
  assert.equal(actual?.topology, expected?.topology);
  assert.deepEqual(actual?.ringSizes, expected?.ringSizes);
  assert.equal(actual?.centralRingSize, expected?.centralRingSize);
  assert.equal(actual?.atomIds.length, expected?.atomIds.length);
  assert.equal(actual?.externalAtomIds.length, expected?.externalAtomIds.length);
  assert.equal(actual?.fusionBonds.length, expected?.fusionBonds.length);
  assert.equal(actual?.vonBaeyerDescriptor, expected?.vonBaeyerDescriptor);
  assert.equal(actual?.parentName, expected?.parentName);
  assert.deepEqual(actual?.secondaryBridges[0].attachmentLocants, expected?.secondaryBridges[0].attachmentLocants);
  assert.deepEqual(actual?.coreMultipleBonds.map((bond) => bond.order), [2]);
  assertCoherentVonBaeyerNumbering(transformed, actual);
  assert.deepEqual(
    [...actual.atomIds].sort((left, right) => left - right),
    expected.atomIds.map((id) => idMap.get(id)).sort((left, right) => left - right),
  );
  assert.deepEqual(
    [...actual.externalAtomIds].sort((left, right) => left - right),
    expected.externalAtomIds.map((id) => idMap.get(id)).sort((left, right) => left - right),
  );
  const normalizedPairs = (pairs) => pairs
    .map((pair) => [...pair].sort((left, right) => left - right).join("-"))
    .sort();
  assert.deepEqual(
    normalizedPairs(actual.sharedAtomPairs),
    normalizedPairs(expected.sharedAtomPairs.map((pair) => pair.map((id) => idMap.get(id)))),
  );
  const candidateKeys = (candidates) => candidates.map((candidate) => candidate.join(",")).sort();
  assert.deepEqual(
    candidateKeys(actual.numberingCandidates),
    candidateKeys(expected.numberingCandidates.map((candidate) => candidate.map((id) => idMap.get(id)))),
  );
});

test("compound-locant naming is invariant under IDs, coordinates and record order", () => {
  let source = makeTricycle(6, 6, "angular");
  source = setCoreBondOrder(source, 11, 12, 2);
  source = setCoreBondOrder(source, 13, 14, 2);
  source = setCoreBondOrder(source, 7, 8, 2);
  source = addExternalChainAt(source, 9, 2);
  const expected = getFusedTricyclicSystem(source);
  const idMap = new Map(source.atoms.map((atom, index) => [atom.id, 2003 + index * 31]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: -atom.y * 17 + 400,
      y: atom.x * 17 - 250,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 900 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => idMap.get(id)),
    })),
  };
  const actual = getFusedTricyclicSystem(transformed);
  assert.equal(actual?.systematicName, expected?.systematicName);
  assert.equal(actual?.systematicNameEn, expected?.systematicNameEn);
  assert.deepEqual(
    actual?.doubleBondLocations.map(({ locants, compound }) => ({ locants, compound })),
    expected?.doubleBondLocations.map(({ locants, compound }) => ({ locants, compound })),
  );
  assert.deepEqual(
    actual?.substituents.map((substituent) => [substituent.locant, substituent.name]).sort(),
    expected?.substituents.map((substituent) => [substituent.locant, substituent.name]).sort(),
  );
  assert.deepEqual(
    actual?.numbering,
    expected?.numbering.map((id) => idMap.get(id)),
  );
});

test("functional tricyclic naming is invariant under IDs, reflection and record order", () => {
  let source = addOxygenAt(makeTricycle(), 11, 2);
  source = addOxygenAt(source, 12, 1);
  source = addExternalChainAt(source, 13, 1);
  source = setCoreBondOrder(source, 3, 4, 2);
  const expected = getDetectedTricyclicSystem(source);
  const idMap = new Map(source.atoms.map((atom, index) => [atom.id, 5003 + index * 37]));
  const transformed = {
    atoms: [...source.atoms].reverse().map((atom) => ({
      ...atom,
      id: idMap.get(atom.id),
      x: -atom.x * 23 + 700,
      y: atom.y * 23 - 310,
    })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
    rings: [...source.rings].reverse().map((ring, index) => ({
      ...ring,
      id: 1200 + index,
      atomIds: [...ring.atomIds].reverse().map((id) => idMap.get(id)),
    })),
  };
  const actual = getDetectedTricyclicSystem(transformed);
  assert.equal(actual?.systematicName, expected?.systematicName);
  assert.equal(actual?.systematicNameEn, expected?.systematicNameEn);
  const functionalLocants = (system) => system?.functionalGroups
    .map(({ kind, locant }) => ({ kind, locant }))
    .sort((left, right) => left.locant - right.locant || left.kind.localeCompare(right.kind));
  assert.deepEqual(
    functionalLocants(actual),
    functionalLocants(expected),
  );
  assert.deepEqual(actual?.numbering, expected?.numbering.map((id) => idMap.get(id)));
});

function disjointRingsConnectedByBonds() {
  const rings = [makeRing(6, 1), makeRing(6, 7), makeRing(6, 13)];
  return {
    atoms: rings.flatMap((ring) => ring.atoms),
    bonds: [...rings.flatMap((ring) => ring.bonds), [1, 7, 1], [7, 13, 1]],
    rings: rings.map((ring, index) => ({ ...ring.rings[0], id: index + 1 })),
  };
}

test("rejects spiro and externally connected ring assemblies", () => {
  const spiro = {
    atoms: Array.from({ length: 16 }, (_, index) => ({ id: index + 1 })),
    bonds: [],
    rings: [
      { id: 1, kind: "cycloalkane", atomIds: [1, 2, 3, 4, 5, 6] },
      { id: 2, kind: "cycloalkane", atomIds: [1, 7, 8, 9, 10, 11] },
      { id: 3, kind: "cycloalkane", atomIds: [11, 12, 13, 14, 15, 16] },
    ],
  };
  spiro.bonds = spiro.rings.flatMap((ring) => ring.atomIds.map(
    (id, index) => [id, ring.atomIds[(index + 1) % ring.atomIds.length], 1],
  ));
  assert.equal(getFusedTricyclicSystem(spiro), null);
  assert.equal(getFusedTricyclicSystem(disjointRingsConnectedByBonds()), null);
});

test("rejects a nominal tricycle when an extra core chord creates a fourth independent cycle", () => {
  const molecule = makeTricycle(6, 6, "linear");
  molecule.bonds.push([3, 5, 1]);

  assert.equal(getFusedTricyclicSystem(molecule), null);
});
