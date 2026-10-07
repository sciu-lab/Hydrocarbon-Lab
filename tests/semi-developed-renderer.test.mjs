import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateSemiDevelopedLayout } from "../app/semi-developed-layout.ts";
import { buildSemiDevelopedRenderModel } from "../app/semi-developed-renderer.ts";

const chain = (length, bonds = []) => ({
  atoms: Array.from({ length }, (_, index) => ({ id: index + 1, x: index, y: 0, element: "C" })),
  bonds: [...Array.from({ length: Math.max(0, length - 1) }, (_, index) => [index + 1, index + 2, 1]), ...bonds],
});

test("unbranched semi-developed chains keep every backbone group on a horizontal axis", () => {
  for (const length of [2, 3, 6, 10]) {
    const molecule = chain(length);
    const before = structuredClone(molecule);
    const positions = calculateSemiDevelopedLayout(molecule, molecule.atoms.map(({ id }) => id));
    const ys = [...positions.values()].map(({ y }) => y);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-8);
    assert.deepEqual(molecule, before, "display layout must not mutate graph coordinates or bonds");
    assert.equal(positions.size, molecule.atoms.length);
  }
});

test("render glyphs use supplied chemical hydrogen counts and preserve every bond order", () => {
  const molecule = {
    atoms: [
      { id: 1, x: 0, y: 0, element: "C" }, { id: 2, x: 1, y: 0, element: "C" },
      { id: 3, x: 2, y: 0, element: "C" }, { id: 4, x: 3, y: 0, element: "O" },
    ],
    bonds: [[1, 2, 2], [2, 3, 1], [3, 4, 1]],
  };
  const hydrogens = new Map([[1, 2], [2, 0], [3, 2], [4, 1]]);
  const positions = calculateSemiDevelopedLayout(molecule, [1, 2, 3, 4]);
  const model = buildSemiDevelopedRenderModel(molecule, positions, (id) => hydrogens.get(id));
  assert.deepEqual(model.atoms.map(({ carbonGroup }) => carbonGroup), ["CH2", "C", "CH2", null]);
  assert.deepEqual(model.bonds.map(({ order }) => order), [2, 1, 1]);
  assert.deepEqual(model.bonds.map(({ atomIds }) => atomIds), [[1, 2], [2, 3], [3, 4]]);
});

test("branches attach to the connected parent and receive distinct display lanes", () => {
  const molecule = chain(5, [[3, 6, 1], [6, 7, 1], [3, 8, 1]]);
  molecule.atoms.push({ id: 6, x: 2, y: 1, element: "C" }, { id: 7, x: 2, y: 2, element: "C" }, { id: 8, x: 2, y: -1, element: "C" });
  const positions = calculateSemiDevelopedLayout(molecule, [1, 2, 3, 4, 5]);
  assert.ok(positions.get(6).y !== positions.get(3).y);
  assert.ok(positions.get(8).y !== positions.get(3).y);
  assert.ok(molecule.bonds.some(([left, right]) => left === 3 && right === 6));
  assert.equal(positions.size, molecule.atoms.length);
});

test("ring layout keeps the cycle closed and supplies its own bounds", async () => {
  const molecule = {
    atoms: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, x: index, y: index % 2, element: "C" })),
    bonds: Array.from({ length: 6 }, (_, index) => [index + 1, (index + 1) % 6 + 1, index % 2 ? 1 : 2]),
    rings: [{ atomIds: [1, 2, 3, 4, 5, 6] }],
  };
  const positions = calculateSemiDevelopedLayout(molecule, [1, 2, 3, 4, 5, 6]);
  for (const [left, right] of molecule.bonds) {
    assert.ok(Math.hypot(positions.get(left).x - positions.get(right).x, positions.get(left).y - positions.get(right).y) > 0);
  }
  const rendererSource = await readFile(new URL("../app/semi-developed-layout.ts", import.meta.url), "utf8");
  assert.match(rendererSource, /getSemiDevelopedBounds/);
  assert.doesNotMatch(rendererSource, /skeletal-layout|buildOpenChainSkeletalPositions/);
});

test("ring substituents leave the ring through the local exterior sector", () => {
  const molecule = {
    atoms: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, x: index, y: 0, element: "C" })),
    bonds: [[1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 1, 1], [1, 7, 1], [7, 8, 1]],
    rings: [{ atomIds: [1, 2, 3, 4, 5, 6] }],
  };
  const positions = calculateSemiDevelopedLayout(molecule, [1, 2, 3, 4, 5, 6]);
  const ringCenter = molecule.rings[0].atomIds.reduce((sum, id) => ({
    x: sum.x + positions.get(id).x / 6,
    y: sum.y + positions.get(id).y / 6,
  }), { x: 0, y: 0 });
  const ringRadius = Math.hypot(positions.get(1).x - ringCenter.x, positions.get(1).y - ringCenter.y);
  const branchRadius = Math.hypot(positions.get(7).x - ringCenter.x, positions.get(7).y - ringCenter.y);
  assert.ok(branchRadius > ringRadius + 50, "ring branch extends outside the ring perimeter");
  assert.equal(positions.size, molecule.atoms.length);
});

test("semi-developed glyph and geometry modules have no skeletal-layout dependency", async () => {
  const [layout, renderer] = await Promise.all([
    readFile(new URL("../app/semi-developed-layout.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/semi-developed-renderer.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /from ["']\.\/skeletal-layout/);
  assert.doesNotMatch(renderer, /from ["']\.\/skeletal-layout/);
});
