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

function addOxygen(molecule, order) {
  const next = structuredClone(molecule);
  const carbonId = peripheralCoreAtom(next);
  const id = Math.max(...next.atoms.map((atom) => atom.id)) + 1;
  next.atoms.push({ id, x: 10, y: 10, element: "O" });
  next.bonds.push([carbonId, id, order]);
  return next;
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

test("recognises linear and angular fused 6-6-6 systems", () => {
  const linear = getFusedTricyclicSystem(makeTricycle(6, 6, "linear"));
  const angular = getFusedTricyclicSystem(makeTricycle(6, 6, "angular"));
  assert.equal(linear?.topology, "linear");
  assert.equal(angular?.topology, "angular");
  for (const system of [linear, angular]) {
    assert.deepEqual(system?.ringSizes, [6, 6, 6]);
    assert.equal(system?.atomIds.length, 14);
    assert.equal(system?.fusionBonds.length, 2);
    assert.deepEqual(system?.fusionBonds.map((bond) => bond.order), [1, 1]);
    assert.equal(system?.sharedAtomPairs.length, 2);
    assert.equal(system?.ringConnectivity.centralRingAtomIds.length, 6);
    assert.deepEqual(system?.ringConnectivity.terminalRingAtomIds.map((ids) => ids.length), [6, 6]);
    assert.equal(system?.externalAtomIds.length, 0);
    assert.equal(system?.numbering, null);
    assert.equal(system?.systematicName, null);
  }
});

test("distinguishes 6-6-5 and 6-5-6 by the central ring", () => {
  const sixSixFive = getFusedTricyclicSystem(makeTricycle(6, 5, "angular"));
  const sixFiveSix = getFusedTricyclicSystem(makeTricycle(5, 6, "angular"));
  assert.deepEqual(sixSixFive?.ringSizes, [6, 6, 5]);
  assert.equal(sixSixFive?.centralRingSize, 6);
  assert.deepEqual(sixFiveSix?.ringSizes, [6, 5, 6]);
  assert.equal(sixFiveSix?.centralRingSize, 5);
});

test("keeps methyl and ethyl atoms outside the recognised core", () => {
  for (const length of [1, 2]) {
    const molecule = addExternalChain(makeTricycle(), length);
    const system = getFusedTricyclicSystem(molecule);
    assert.equal(system?.atomIds.length, 14);
    assert.equal(system?.externalAtomIds.length, length);
    assert.equal(system?.externalAttachments.length, 1);
    assert.equal(system?.externalAttachments[0].order, 1);
  }
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
  assert.deepEqual(actual?.coreMultipleBonds.map((bond) => bond.order), [2]);
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
