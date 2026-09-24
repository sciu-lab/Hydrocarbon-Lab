import assert from "node:assert/strict";
import test from "node:test";

import { clipCondensedBondSegments, CONDENSED_NODE_RADIUS } from "../app/condensed-bond-geometry.ts";
import {
  clipSkeletalParallelBondSegments,
  getParallelBondSegments,
  getSkeletalNumberBadgeGeometry,
  getSkeletalNumberBadgeOffsetWithClearance,
} from "../app/skeletal-bond-geometry.ts";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} ≠ ${expected}`);
const distanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
};

test("single, double and triple condensed strokes enter both atom circles in every orientation", () => {
  for (const end of [{ x: 130, y: 0 }, { x: -130, y: 0 }, { x: 0, y: 130 }, { x: 0, y: -130 }, { x: 104, y: -78 }, { x: -104, y: -78 }]) {
    const start = { x: 0, y: 0 };
    for (const order of [1, 2, 3]) {
      const raw = getParallelBondSegments(start, end, order);
      const clipped = clipCondensedBondSegments(raw, start, end);
      assert.equal(clipped.length, order);
      for (const [index, segment] of clipped.entries()) {
        const startDistance = Math.hypot(segment.x - start.x, segment.y - start.y);
        const endDistance = Math.hypot(segment.x2 - end.x, segment.y2 - end.y);
        assert.ok(startDistance >= CONDENSED_NODE_RADIUS - 3 - 1e-8 && startDistance < CONDENSED_NODE_RADIUS - 1, `start ${order}/${index}`);
        assert.ok(endDistance >= CONDENSED_NODE_RADIUS - 3 - 1e-8 && endDistance < CONDENSED_NODE_RADIUS - 1, `end ${order}/${index}`);
        assert.ok(Math.hypot(segment.x2 - segment.x, segment.y2 - segment.y) > 8);
      }
      if (order > 1) {
        const tangent = { x: end.x / Math.hypot(end.x, end.y), y: end.y / Math.hypot(end.x, end.y) };
        const projections = clipped.map((segment) => segment.x * tangent.x + segment.y * tangent.y);
        near(projections[0], projections.at(-1), `symmetric outer caps ${order}`);
        assert.ok(Math.max(...projections) - Math.min(...projections) < 2, `caps meet the same circular atom ${order}`);
      }
    }
  }
});

test("unobstructed skeletal double and triple strokes reach carbon vertices", () => {
  const start = { x: 0, y: 0 };
  for (const end of [{ x: 130, y: 0 }, { x: -130, y: 0 }, { x: 0, y: 130 }, { x: 0, y: -130 }, { x: 104, y: -78 }, { x: -104, y: -78 }]) {
    for (const order of [2, 3]) {
      const raw = getParallelBondSegments(start, end, order);
      const visible = clipSkeletalParallelBondSegments(raw, start, end);
      visible.forEach((segment, index) => {
        for (const coordinate of ["x", "y", "x2", "y2"]) near(segment[coordinate], raw[index][coordinate], `${order}/${index}/${coordinate}`);
      });
      assert.equal(visible.length, order);
    }
  }
});

test("a scaled number badge moves clear of a triple bond instead of trimming its three strokes", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 112, y: -56 };
  const previous = { x: -112, y: -56 };
  const raw = getParallelBondSegments(start, end, 3);
  for (const scale of [0.6, 1, 1.5, 2]) {
    const geometry = getSkeletalNumberBadgeGeometry(scale);
    const strokes = [
      { start, end, radius: 8 + 5.5 / 2 + 2 },
      { start, end: previous, radius: 5.5 / 2 + 2 },
    ];
    const offset = getSkeletalNumberBadgeOffsetWithClearance(geometry.offset, geometry.radius + geometry.strokeWidth / 2, [], strokes);
    const badge = { x: offset.x, y: offset.y };
    for (const stroke of strokes) {
      assert.ok(distanceToSegment(badge, stroke.start, stroke.end) >= geometry.radius + geometry.strokeWidth / 2 + stroke.radius - 1e-8, `${scale}: badge clears connected bonds`);
    }
    assert.deepEqual(clipSkeletalParallelBondSegments(raw, start, end, {
      startObstacle: { center: badge, radius: geometry.clearance },
    }), raw, `${scale}: no line is severed at C2`);
  }
});

test("the same numbered junction keeps both double-bond strokes attached", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 112, y: -56 };
  const raw = getParallelBondSegments(start, end, 2);
  for (const scale of [0.6, 1, 2]) {
    const geometry = getSkeletalNumberBadgeGeometry(scale);
    const offset = getSkeletalNumberBadgeOffsetWithClearance(geometry.offset, geometry.radius + geometry.strokeWidth / 2, [], [
      { start, end, radius: 5 + 5.5 / 2 + 2 },
      { start, end: { x: -112, y: -56 }, radius: 5.5 / 2 + 2 },
    ]);
    const visible = clipSkeletalParallelBondSegments(raw, start, end, {
      startObstacle: { center: offset, radius: geometry.clearance },
    });
    visible.forEach((segment, index) => {
      for (const coordinate of ["x", "y", "x2", "y2"]) near(segment[coordinate], raw[index][coordinate], `double ${scale}/${coordinate}`);
    });
  }
});

test("shorter and longer canvas coordinates preserve the rendered connection", () => {
  for (const zoom of [0.78, 1, 1.25]) {
    const start = { x: 0, y: 0 };
    const end = { x: 104 * zoom, y: 78 * zoom };
    for (const order of [2, 3]) {
      const raw = getParallelBondSegments(start, end, order);
      const condensed = clipCondensedBondSegments(raw, start, end);
      const skeletal = clipSkeletalParallelBondSegments(raw, start, end);
      assert.equal(condensed.length, order);
      assert.equal(skeletal.length, order);
      condensed.forEach((segment) => {
        assert.ok(Math.hypot(segment.x - start.x, segment.y - start.y) < CONDENSED_NODE_RADIUS);
        assert.ok(Math.hypot(segment.x2 - end.x, segment.y2 - end.y) < CONDENSED_NODE_RADIUS);
      });
      skeletal.forEach((segment, index) => {
        for (const coordinate of ["x", "y", "x2", "y2"]) near(segment[coordinate], raw[index][coordinate], `zoom ${zoom}/${coordinate}`);
      });
    }
  }
});

test("pent-2-yne, pent-2-ene and but-2-ene retain their graph bond orders", () => {
  for (const [name, expected] of [
    ["pent-2-ino", [1, 3, 1, 1]],
    ["pent-2-eno", [1, 2, 1, 1]],
    ["but-2-eno", [1, 2, 1]],
  ]) {
    const result = buildHydrocarbonFromIupacName(name);
    assert.equal(result.ok, true, result.ok ? name : result.error);
    assert.equal(result.molecule.atoms.length, expected.length + 1);
    assert.deepEqual(result.molecule.bonds.map((bond) => bond[2] ?? 1), expected, name);
  }
});
