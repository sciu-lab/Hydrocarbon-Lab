import assert from "node:assert/strict";
import test from "node:test";

import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { buildOpenChainSkeletalPositions } from "../app/skeletal-layout.ts";

const distance = (left, right) => Math.hypot(right.x - left.x, right.y - left.y);
const cross = (first, middle, last) =>
  (middle.x - first.x) * (last.y - middle.y)
  - (middle.y - first.y) * (last.x - middle.x);
const segmentsCross = (firstStart, firstEnd, secondStart, secondEnd) => {
  const side = (origin, end, point) =>
    (end.x - origin.x) * (point.y - origin.y)
    - (end.y - origin.y) * (point.x - origin.x);
  return side(firstStart, firstEnd, secondStart) * side(firstStart, firstEnd, secondEnd) < 0
    && side(secondStart, secondEnd, firstStart) * side(secondStart, secondEnd, firstEnd) < 0;
};

function makeSubstitutedBenzene(substitutions) {
  const atoms = Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    return { id: index + 1, x: Math.cos(angle) * 1.35, y: Math.sin(angle) * 1.65 };
  });
  const bonds = Array.from({ length: 6 }, (_, index) => [index + 1, (index + 1) % 6 + 1]);
  let nextId = 7;
  for (const { ringIndex, length } of substitutions) {
    let parentId = ringIndex + 1;
    const ringAtom = atoms[ringIndex];
    for (let index = 0; index < length; index += 1) {
      atoms.push({ id: nextId, x: ringAtom.x * (1.65 + index * .65), y: ringAtom.y * (1.65 + index * .65) });
      bonds.push([parentId, nextId]);
      parentId = nextId++;
    }
  }
  return { atoms, bonds, rings: [{ atomIds: [1, 2, 3, 4, 5, 6] }] };
}

test("the canonical open-chain layout is exactly the skeletal layout", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
      { id: 4, x: 1, y: -1 },
      { id: 5, x: 1, y: 1 },
      { id: 6, x: 4, y: 0 },
    ],
    bonds: [[1, 2], [2, 3], [2, 4], [2, 5], [3, 6]],
  };
  const mainChain = [1, 2, 3, 6];

  assert.deepEqual(
    [...calculateMolecule2DLayout(molecule, mainChain)],
    [...buildOpenChainSkeletalPositions(molecule, mainChain)],
  );
});

test("the canonical ring layout retains the renderer's existing polygon vertices", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: -1 }, { id: 2, x: 1, y: -0.5 },
      { id: 3, x: 1, y: 0.5 }, { id: 4, x: 0, y: 1 },
      { id: 5, x: -1, y: 0.5 }, { id: 6, x: -1, y: -0.5 },
    ],
    bonds: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]],
    rings: [{ id: 1, kind: "aromatic", atomIds: [1, 2, 3, 4, 5, 6] }],
  };

  assert.deepEqual([...calculateMolecule2DLayout(molecule, [1, 2, 3])], [
    [1, { x: 0, y: -106 }], [2, { x: 130, y: -53 }],
    [3, { x: 130, y: 53 }], [4, { x: 0, y: 106 }],
    [5, { x: -130, y: 53 }], [6, { x: -130, y: -53 }],
  ]);
});

test("a ring-attached ethyl group leaves radially and bends on its second bond", () => {
  const molecule = makeSubstitutedBenzene([{ ringIndex: 1, length: 2 }]);
  const positions = calculateMolecule2DLayout(molecule, [1, 2, 3, 4, 5, 6]);
  const ringCenter = [1, 2, 3, 4, 5, 6].reduce((sum, atomId) => {
    const point = positions.get(atomId);
    return { x: sum.x + point.x / 6, y: sum.y + point.y / 6 };
  }, { x: 0, y: 0 });
  const ringAtom = positions.get(2);
  const first = positions.get(7);
  const second = positions.get(8);
  const outwardDot = (first.x - ringAtom.x) * (ringAtom.x - ringCenter.x)
    + (first.y - ringAtom.y) * (ringAtom.y - ringCenter.y);

  assert.ok(outwardDot > 0, "the attachment bond points away from the ring center");
  assert.ok(Math.abs(cross(ringAtom, first, second)) > 1, "the ethyl C-C bond is not collinear");
  assert.ok(Math.abs(distance(ringAtom, first) - 130) < 1e-8);
  assert.ok(Math.abs(distance(first, second) - 130) < 1e-8);
});

test("a ring-attached methyl group stays on its single radial bond", () => {
  const molecule = makeSubstitutedBenzene([{ ringIndex: 4, length: 1 }]);
  const positions = calculateMolecule2DLayout(molecule, [1, 2, 3, 4, 5, 6]);
  const center = [1, 2, 3, 4, 5, 6].reduce((sum, atomId) => {
    const point = positions.get(atomId);
    return { x: sum.x + point.x / 6, y: sum.y + point.y / 6 };
  }, { x: 0, y: 0 });
  const ringAtom = positions.get(5);
  const methyl = positions.get(7);
  const radialCross = (ringAtom.x - center.x) * (methyl.y - ringAtom.y)
    - (ringAtom.y - center.y) * (methyl.x - ringAtom.x);
  assert.ok(Math.abs(radialCross) < 1e-8);
  assert.ok(Math.abs(distance(ringAtom, methyl) - 130) < 1e-8);
});

test("a ring-attached propyl group continues with alternating zigzag turns", () => {
  const molecule = makeSubstitutedBenzene([{ ringIndex: 0, length: 3 }]);
  const positions = calculateMolecule2DLayout(molecule, [1, 2, 3, 4, 5, 6]);
  const firstTurn = cross(positions.get(1), positions.get(7), positions.get(8));
  const secondTurn = cross(positions.get(7), positions.get(8), positions.get(9));

  assert.ok(Math.abs(firstTurn) > 1 && Math.abs(secondTurn) > 1);
  assert.ok(firstTurn * secondTurn < 0, "successive turns alternate direction");
});

test("multiple ring substituents use deterministic, non-overlapping layouts", () => {
  const molecule = makeSubstitutedBenzene([
    { ringIndex: 0, length: 2 },
    { ringIndex: 2, length: 1 },
    { ringIndex: 3, length: 2 },
  ]);
  const first = calculateMolecule2DLayout(molecule, [1, 2, 3, 4, 5, 6]);
  const second = calculateMolecule2DLayout(molecule, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...first], [...second]);

  const substituentPoints = [7, 8, 9, 10, 11].map((atomId) => first.get(atomId));
  for (let left = 0; left < substituentPoints.length; left += 1) {
    for (let right = left + 1; right < substituentPoints.length; right += 1) {
      assert.ok(distance(substituentPoints[left], substituentPoints[right]) > 75);
    }
  }

  const drawnBonds = molecule.bonds.map(([leftId, rightId]) => ({
    ids: new Set([leftId, rightId]),
    start: first.get(leftId),
    end: first.get(rightId),
  }));
  for (let left = 0; left < drawnBonds.length; left += 1) {
    for (let right = left + 1; right < drawnBonds.length; right += 1) {
      if ([...drawnBonds[left].ids].some((atomId) => drawnBonds[right].ids.has(atomId))) continue;
      assert.equal(
        segmentsCross(
          drawnBonds[left].start, drawnBonds[left].end,
          drawnBonds[right].start, drawnBonds[right].end,
        ),
        false,
        "non-adjacent bonds do not cross",
      );
    }
  }
});
