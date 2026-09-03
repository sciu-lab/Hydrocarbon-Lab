import assert from "node:assert/strict";
import test from "node:test";

import { flipCoordinates } from "../app/coordinate-flip.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { buildOpenChainSkeletalPositions } from "../app/skeletal-layout.ts";

test("flips only horizontal coordinates and remains reversible", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0, element: "Br" },
    ],
    bonds: [[1, 2], [2, 3]],
  };

  const mirrored = flipCoordinates(molecule);
  assert.deepEqual(mirrored.atoms.map(({ x, y }) => ({ x, y })), [
    { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 },
  ]);
  assert.deepEqual(mirrored.bonds, molecule.bonds, "connectivity is unchanged");
  assert.equal(mirrored.isMirrored, true);
  assert.deepEqual(flipCoordinates(mirrored), molecule, "a second redraw restores the coordinates");
});

test("a redraw preserves E/Z geometry and mirrors the skeletal layout", () => {
  const alkene = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: -0.6, y: 1 },
      { id: 4, x: 1.6, y: -1, element: "Br" },
    ],
    bonds: [[1, 2, 2], [1, 3], [2, 4]],
  };
  const before = inspectDoubleBondStereochemistry(alkene, 1, 2);
  const mirrored = flipCoordinates(alkene);
  const after = inspectDoubleBondStereochemistry(mirrored, 1, 2);
  assert.equal(before.configuration, "E");
  assert.equal(after.configuration, before.configuration);

  const chain = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 2, y: 0 }],
    bonds: [[1, 2], [2, 3]],
  };
  const originalPositions = buildOpenChainSkeletalPositions(chain, [1, 2, 3]);
  const mirroredPositions = buildOpenChainSkeletalPositions(flipCoordinates(chain), [1, 2, 3]);
  assert.equal(mirroredPositions.get(1)?.x, originalPositions.get(3)?.x);
  assert.equal(mirroredPositions.get(3)?.x, originalPositions.get(1)?.x);
  assert.equal(mirroredPositions.get(2)?.y, originalPositions.get(2)?.y);
});
