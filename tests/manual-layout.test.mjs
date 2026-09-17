import assert from "node:assert/strict";
import test from "node:test";

import { getAutoPlacedCarbonPosition } from "../app/manual-layout.ts";

function extendWithArrow(source, selectedId, direction, count) {
  const molecule = {
    ...source,
    atoms: source.atoms.map((atom) => ({ ...atom })),
    bonds: source.bonds.map((bond) => [...bond]),
    rings: source.rings?.map((ring) => ({ ...ring, atomIds: [...ring.atomIds] })),
  };
  const added = [];
  let currentId = selectedId;
  for (let index = 0; index < count; index += 1) {
    const point = getAutoPlacedCarbonPosition(molecule, currentId, direction);
    const nextId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
    molecule.atoms.push({ id: nextId, ...point });
    molecule.bonds.push([currentId, nextId, 1]);
    added.push({ id: nextId, ...point });
    currentId = nextId;
  }
  return { molecule, added };
}

function assertArrowGrowth(source, selectedId, direction) {
  const start = source.atoms.find((atom) => atom.id === selectedId);
  assert.ok(start);
  const { molecule, added } = extendWithArrow(source, selectedId, direction, 6);
  const end = added.at(-1);
  const main = Math.hypot(direction.x, direction.y) === 0
    ? { x: 1, y: 0 }
    : {
        x: direction.x / Math.hypot(direction.x, direction.y),
        y: direction.y / Math.hypot(direction.x, direction.y),
      };
  const perpendicular = { x: -main.y, y: main.x };
  const total = { x: end.x - start.x, y: end.y - start.y };
  const mainTravel = total.x * main.x + total.y * main.y;
  const perpendicularTravel = total.x * perpendicular.x + total.y * perpendicular.y;

  assert.ok(mainTravel > 0, "the chain grows in the requested arrow direction");
  assert.ok(mainTravel > Math.abs(perpendicularTravel), "main-axis travel dominates drift");

  const chain = [start, ...added];
  const lengths = chain.slice(1).map((point, index) =>
    Math.hypot(point.x - chain[index].x, point.y - chain[index].y));
  lengths.forEach((length) => assert.ok(Math.abs(length - lengths[0]) < 1e-9));

  for (let left = 0; left < molecule.atoms.length; left += 1) {
    for (let right = left + 1; right < molecule.atoms.length; right += 1) {
      const distance = Math.hypot(
        molecule.atoms[left].x - molecule.atoms[right].x,
        molecule.atoms[left].y - molecule.atoms[right].y,
      );
      assert.ok(distance > 1e-6, `atoms ${left} and ${right} do not overlap`);
    }
  }

  const perpendicularSteps = chain.slice(1).map((point, index) => {
    const delta = { x: point.x - chain[index].x, y: point.y - chain[index].y };
    return delta.x * perpendicular.x + delta.y * perpendicular.y;
  }).filter((value) => Math.abs(value) > 1e-9);
  assert.ok(perpendicularSteps.some((value) => value > 0));
  assert.ok(perpendicularSteps.some((value) => value < 0));
  perpendicularSteps.slice(1).forEach((value, index) => {
    assert.ok(value * perpendicularSteps[index] < 0, "zigzag side alternates");
  });
}

const singleCarbon = { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [] };

test("ArrowRight grows a linear chain rightward with a balanced zigzag", () => {
  assertArrowGrowth(singleCarbon, 1, { x: 1, y: 0 });
});

test("the shared vector algorithm handles left, up and down", () => {
  assertArrowGrowth(singleCarbon, 1, { x: -1, y: 0 });
  assertArrowGrowth(singleCarbon, 1, { x: 0, y: -1 });
  assertArrowGrowth(singleCarbon, 1, { x: 0, y: 1 });
});

test("ArrowRight exits the right side of cyclohexane and remains globally horizontal", () => {
  const atoms = Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    return { id: index + 1, x: Math.cos(angle) * 2, y: Math.sin(angle) * 2 };
  });
  const ring = {
    atoms,
    bonds: atoms.map((atom, index) => [atom.id, atoms[(index + 1) % atoms.length].id, 1]),
    rings: [{ atomIds: atoms.map((atom) => atom.id) }],
  };
  const { added } = extendWithArrow(ring, 1, { x: 1, y: 0 }, 6);
  const chain = [ring.atoms[0], ...added];
  const steps = chain.slice(1).map((point, index) => ({
    x: point.x - chain[index].x,
    y: point.y - chain[index].y,
  }));

  assertArrowGrowth(ring, 1, { x: 1, y: 0 });
  assert.ok(steps[0].x > 0, "the first ring substituent bond advances right");
  assert.ok(Math.abs(steps[0].y) > 1e-9, "the first ring substituent bond starts the zigzag");
  steps.slice(1).forEach((step, index) => {
    assert.ok(step.y * steps[index].y < 0, "the zigzag phase alternates from the first bond");
  });
  assert.ok(added.every((atom) => atom.x > ring.atoms[0].x), "the substituent stays outside the ring");
  assert.ok(new Set(added.map((atom) => Math.round(atom.y * 1e6))).size > 1, "the chain is not straight");
});

test("ring substituents start the zigzag for every arrow direction", () => {
  const ring = {
    atoms: [
      { id: 1, x: 2, y: 0 },
      { id: 2, x: 0, y: 2 },
      { id: 3, x: -2, y: 0 },
      { id: 4, x: 0, y: -2 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 1, 1]],
    rings: [{ atomIds: [1, 2, 3, 4] }],
  };
  for (const [selectedId, direction] of [
    [1, { x: 1, y: 0 }],
    [3, { x: -1, y: 0 }],
    [4, { x: 0, y: -1 }],
    [2, { x: 0, y: 1 }],
  ]) {
    const start = ring.atoms.find((atom) => atom.id === selectedId);
    const { added } = extendWithArrow(ring, selectedId, direction, 2);
    const perpendicular = { x: -direction.y, y: direction.x };
    const first = { x: added[0].x - start.x, y: added[0].y - start.y };
    const second = { x: added[1].x - added[0].x, y: added[1].y - added[0].y };
    const firstMain = first.x * direction.x + first.y * direction.y;
    const firstSide = first.x * perpendicular.x + first.y * perpendicular.y;
    const secondSide = second.x * perpendicular.x + second.y * perpendicular.y;

    assert.ok(firstMain > 0);
    assert.ok(Math.abs(firstSide) > 1e-9);
    assert.ok(firstSide * secondSide < 0);
  }
});
