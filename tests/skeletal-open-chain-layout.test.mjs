import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildOpenChainSkeletalPositions,
  skeletalInternalAngle,
} from "../app/skeletal-layout.ts";

function makeChain(length) {
  return {
    atoms: Array.from({ length }, (_, index) => ({ id: index + 1, x: index, y: 0 })),
    bonds: Array.from({ length: length - 1 }, (_, index) => [index + 1, index + 2, 1]),
  };
}

function assertClassicZigZag(length) {
  const molecule = makeChain(length);
  const snapshot = JSON.stringify(molecule);
  const mainChain = molecule.atoms.map((atom) => atom.id);
  const positions = buildOpenChainSkeletalPositions(molecule, mainChain);

  assert.equal(positions.size, length);
  assert.equal(JSON.stringify(molecule), snapshot, "layout must never mutate chemical coordinates");

  const ys = mainChain.map((atomId) => positions.get(atomId).y);
  assert.ok(new Set(ys.map((value) => Math.round(value))).size > 1, "chain must not be a straight line");

  for (let index = 1; index < mainChain.length - 1; index += 1) {
    const angle = skeletalInternalAngle(
      positions.get(mainChain[index - 1]),
      positions.get(mainChain[index]),
      positions.get(mainChain[index + 1]),
    );
    assert.ok(Math.abs(angle - 120) < 1e-9, `expected 120°, received ${angle}°`);
  }

  for (let index = 0; index < mainChain.length - 1; index += 1) {
    const left = positions.get(mainChain[index]);
    const right = positions.get(mainChain[index + 1]);
    assert.ok(Math.abs(Math.hypot(right.x - left.x, right.y - left.y) - 130) < 1e-9);
  }
}

test("pentane uses the classic 120-degree skeletal zig-zag", () => {
  assertClassicZigZag(5);
});

test("ethane retains the canonical bond length", () => {
  const positions = buildOpenChainSkeletalPositions(makeChain(2), [1, 2]);
  const left = positions.get(1);
  const right = positions.get(2);
  assert.ok(Math.abs(Math.hypot(right.x - left.x, right.y - left.y) - 130) < 1e-9);
});

test("propane begins the zig-zag and butane alternates it", () => {
  assertClassicZigZag(3);
  assertClassicZigZag(4);
});

test("hexane uses the classic 120-degree skeletal zig-zag", () => {
  assertClassicZigZag(6);
});

test("branched open chains choose separate free lattice directions", () => {
  const molecule = makeChain(4);
  molecule.atoms.push({ id: 5, x: 1, y: -1 }, { id: 6, x: 2, y: 1 });
  molecule.bonds.push([2, 5], [3, 6]);
  const positions = buildOpenChainSkeletalPositions(molecule, [1, 2, 3, 4]);
  const points = [...positions.values()];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      assert.ok(
        Math.hypot(points[right].x - points[left].x, points[right].y - points[left].y) > 75,
        "branch atoms remain separated",
      );
    }
  }
});

test("bond focus is visual only and does not draw an SVG bounding rectangle", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.bond-control:focus-visible\s*\{\s*outline:\s*none;/s);
  assert.match(css, /\.bond-control:focus-visible \.bond\s*\{[^}]*drop-shadow/s);
});
