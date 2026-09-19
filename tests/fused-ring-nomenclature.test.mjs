import assert from "node:assert/strict";
import test from "node:test";
import { fuseRingOnBond } from "../app/fused-ring.ts";
import {
  getFusedBicyclicSystem,
  getSteroidLike6565System,
} from "../app/fused-ring-nomenclature.ts";

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
