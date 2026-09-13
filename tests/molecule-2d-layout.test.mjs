import assert from "node:assert/strict";
import test from "node:test";

import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { buildOpenChainSkeletalPositions } from "../app/skeletal-layout.ts";

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
