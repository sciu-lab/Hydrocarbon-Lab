import assert from "node:assert/strict";
import test from "node:test";

import {
  clipSkeletalBondSegment,
  clipSkeletalParallelBondSegments,
  clipSkeletalRingDoubleBondSegments,
  getSkeletalNumberBadgeGeometry,
  getSkeletalRingNumberBadgeOffset,
  getSkeletalRingDoubleBondSegments,
  SKELETAL_BOND_END_CLEARANCE,
  SKELETAL_NUMBER_BADGE_CLEARANCE,
  SKELETAL_NUMBER_BADGE_OFFSET,
  SKELETAL_RING_NUMBER_BADGE_DISTANCE,
  normalizeNumberingScale,
} from "../app/skeletal-bond-geometry.ts";

const hexagon = Array.from({ length: 6 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
  return {
    x: Math.cos(angle) * 175,
    y: Math.sin(angle) * 175,
  };
});

const projectedInset = (segment, start, end) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  let normalX = -deltaY / length;
  let normalY = deltaX / length;
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (normalX * -midpoint.x + normalY * -midpoint.y < 0) {
    normalX *= -1;
    normalY *= -1;
  }
  return (segment.x - start.x) * normalX + (segment.y - start.y) * normalY;
};

test("keeps the outer cyclic stroke on the polygon edge and the second one inside", () => {
  const start = hexagon[0];
  const end = hexagon[1];
  const originalStart = { ...start };
  const originalEnd = { ...end };
  const [edge, inner] = getSkeletalRingDoubleBondSegments(start, end, hexagon);

  assert.ok(Math.abs(projectedInset(edge, start, end)) < 1e-9);
  assert.ok(projectedInset(inner, start, end) > projectedInset(edge, start, end));
  assert.ok(projectedInset(inner, start, end) >= 4.55 - 1e-9);
  assert.ok(projectedInset(inner, start, end) <= 5.95 + 1e-9);
  assert.deepEqual(
    { x: edge.x, y: edge.y, x2: edge.x2, y2: edge.y2 },
    { x: start.x, y: start.y, x2: end.x, y2: end.y },
  );
  assert.deepEqual(start, originalStart);
  assert.deepEqual(end, originalEnd);
});

test("trims the inner Kekulé stroke symmetrically at both endpoints", () => {
  const start = hexagon[0];
  const end = hexagon[1];
  const [edge, inner] = getSkeletalRingDoubleBondSegments(start, end, hexagon);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  const startTrim = (inner.x - start.x) * tangentX + (inner.y - start.y) * tangentY;
  const endTrim = (end.x - inner.x2) * tangentX + (end.y - inner.y2) * tangentY;
  const edgeLength = Math.hypot(edge.x2 - edge.x, edge.y2 - edge.y);
  const innerLength = Math.hypot(inner.x2 - inner.x, inner.y2 - inner.y);

  assert.ok(Math.abs(startTrim - endTrim) < 1e-9);
  assert.ok(innerLength < edgeLength);
  assert.equal(edge.role, "edge");
  assert.equal(inner.role, "inner");
});

test("places every cyclic number badge radially outside the ring", () => {
  for (const vertex of hexagon) {
    const offset = getSkeletalRingNumberBadgeOffset(vertex, hexagon);
    const badgeCenter = { x: vertex.x + offset.x, y: vertex.y + offset.y };
    const distance = Math.hypot(offset.x, offset.y);
    const pointsAwayFromCenter = offset.x * -vertex.x + offset.y * -vertex.y;

    assert.ok(Math.abs(distance - SKELETAL_RING_NUMBER_BADGE_DISTANCE) < 1e-9);
    assert.ok(pointsAwayFromCenter < 0);
    assert.ok(
      Math.min(
        distanceFromPointToSegment(badgeCenter, {
          x: vertex.x,
          y: vertex.y,
          x2: hexagon[(hexagon.indexOf(vertex) + 1) % hexagon.length].x,
          y2: hexagon[(hexagon.indexOf(vertex) + 1) % hexagon.length].y,
        }),
        distanceFromPointToSegment(badgeCenter, {
          x: vertex.x,
          y: vertex.y,
          x2: hexagon[(hexagon.indexOf(vertex) + hexagon.length - 1) % hexagon.length].x,
          y2: hexagon[(hexagon.indexOf(vertex) + hexagon.length - 1) % hexagon.length].y,
        }),
      ) >= SKELETAL_NUMBER_BADGE_CLEARANCE,
    );
  }
});

test("numbering scale is the single source for badge paint, offsets and clearance", () => {
  for (const scale of [0.6, 1, 1.5, 2]) {
    const geometry = getSkeletalNumberBadgeGeometry(scale);
    assert.equal(geometry.scale, scale);
    assert.equal(geometry.radius, 12 * scale);
    assert.equal(geometry.fontSize, 10 * scale);
    assert.equal(geometry.clearance, SKELETAL_NUMBER_BADGE_CLEARANCE * scale);
    assert.equal(geometry.offset.x, SKELETAL_NUMBER_BADGE_OFFSET.x * scale);
    assert.equal(geometry.offset.y, SKELETAL_NUMBER_BADGE_OFFSET.y * scale);

    const offset = getSkeletalRingNumberBadgeOffset(hexagon[0], hexagon, scale);
    assert.ok(Math.abs(Math.hypot(offset.x, offset.y) - SKELETAL_RING_NUMBER_BADGE_DISTANCE * scale) < 1e-9);
  }
});

test("invalid persisted numbering scales fall back to 100 percent", () => {
  for (const value of ["corrupt", "", 0.5, 2.1, Infinity, null]) {
    assert.equal(normalizeNumberingScale(value), 1);
  }
  assert.equal(normalizeNumberingScale("1.49"), 1.5);
});

const projectedEndpointClearance = (segment, start, end) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  return {
    start: (segment.x - start.x) * tangentX + (segment.y - start.y) * tangentY,
    end: (end.x - segment.x2) * tangentX + (end.y - segment.y2) * tangentY,
  };
};

const distanceFromPointToSegment = (point, segment) => {
  const deltaX = segment.x2 - segment.x;
  const deltaY = segment.y2 - segment.y;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  const parameter = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
        (point.x - segment.x) * deltaX + (point.y - segment.y) * deltaY
      ) / lengthSquared));
  return Math.hypot(
    point.x - (segment.x + deltaX * parameter),
    point.y - (segment.y + deltaY * parameter),
  );
};

test("clips both open-chain double-bond strokes by the node radius plus buffer", () => {
  const start = { x: 102, y: -32 };
  const end = { x: 232, y: 32 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const normalX = -(end.y - start.y) / length;
  const normalY = (end.x - start.x) / length;
  const originalStart = { ...start };
  const originalEnd = { ...end };

  for (const offset of [-5, 5]) {
    const segment = {
      x: start.x + normalX * offset,
      y: start.y + normalY * offset,
      x2: end.x + normalX * offset,
      y2: end.y + normalY * offset,
      role: null,
    };
    const clipped = clipSkeletalBondSegment(segment, start, end);
    const clearance = projectedEndpointClearance(clipped, start, end);

    assert.ok(Math.abs(clearance.start - SKELETAL_BOND_END_CLEARANCE) < 1e-9);
    assert.ok(Math.abs(clearance.end - SKELETAL_BOND_END_CLEARANCE) < 1e-9);
  }

  assert.deepEqual(start, originalStart);
  assert.deepEqual(end, originalEnd);
});

test("aligns the outer ring stroke with a simple edge while keeping the inner cap", () => {
  const start = hexagon[0];
  const end = hexagon[1];
  const [edge, inner] = clipSkeletalRingDoubleBondSegments(
    getSkeletalRingDoubleBondSegments(start, end, hexagon),
    start,
    end,
  );
  const edgeClearance = projectedEndpointClearance(edge, start, end);
  const innerClearance = projectedEndpointClearance(inner, start, end);

  assert.ok(Math.abs(edgeClearance.start) < 1e-9);
  assert.ok(Math.abs(edgeClearance.end) < 1e-9);
  assert.ok(innerClearance.start >= 10 - 1e-9);
  assert.ok(innerClearance.end >= 10 - 1e-9);
});

test("keeps parallel open-chain strokes clear of the offset number badge", () => {
  const start = { x: 140.583302491977, y: 7.75 };
  const end = { x: 253.16660498395404, y: -45.25 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const normalX = -(end.y - start.y) / length;
  const normalY = (end.x - start.x) / length;
  const startBadge = {
    x: start.x + SKELETAL_NUMBER_BADGE_OFFSET.x,
    y: start.y + SKELETAL_NUMBER_BADGE_OFFSET.y,
  };
  const endBadge = {
    x: end.x + SKELETAL_NUMBER_BADGE_OFFSET.x,
    y: end.y + SKELETAL_NUMBER_BADGE_OFFSET.y,
  };
  const rawSegments = [-5, 5].map((offset) => ({
    x: start.x + normalX * offset,
    y: start.y + normalY * offset,
    x2: end.x + normalX * offset,
    y2: end.y + normalY * offset,
    role: null,
  }));
  const clipped = clipSkeletalParallelBondSegments(rawSegments, start, end, {
    startObstacle: { center: startBadge, radius: SKELETAL_NUMBER_BADGE_CLEARANCE },
    endObstacle: { center: endBadge, radius: SKELETAL_NUMBER_BADGE_CLEARANCE },
  });

  for (const segment of clipped) {
    assert.ok(
      distanceFromPointToSegment(startBadge, segment) >= SKELETAL_NUMBER_BADGE_CLEARANCE - 1e-9,
    );
    assert.ok(
      distanceFromPointToSegment(endBadge, segment) >= SKELETAL_NUMBER_BADGE_CLEARANCE - 1e-9,
    );
  }
  assert.ok(Math.abs(clipped[0].x - clipped[1].x) > 0, "parallel offsets stay distinct");
  const firstClearance = projectedEndpointClearance(clipped[0], start, end);
  const secondClearance = projectedEndpointClearance(clipped[1], start, end);
  assert.ok(Math.abs(firstClearance.start - secondClearance.start) < 1e-9);
  assert.ok(Math.abs(firstClearance.end - secondClearance.end) < 1e-9);
});

test("scaled number obstacles keep multiple bonds clear at 60, 100, 150 and 200 percent", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 130, y: 0 };
  const rawSegments = [-5, 5].map((offset) => ({
    x: start.x,
    y: start.y + offset,
    x2: end.x,
    y2: end.y + offset,
    role: null,
  }));

  for (const scale of [0.6, 1, 1.5, 2]) {
    const geometry = getSkeletalNumberBadgeGeometry(scale);
    const badge = {
      x: start.x + geometry.offset.x,
      y: start.y + geometry.offset.y,
    };
    const clipped = clipSkeletalParallelBondSegments(rawSegments, start, end, {
      startObstacle: { center: badge, radius: geometry.clearance },
    });
    for (const segment of clipped) {
      assert.ok(
        distanceFromPointToSegment(badge, segment) >= geometry.clearance - 1e-9,
        `${scale * 100}% badge remains clear`,
      );
    }
  }
});

test("keeps both ring strokes clear of the numbered carbon circles", () => {
  const start = { x: -112.58330249197701, y: -53 };
  const end = { x: -112.58330249197701, y: 53 };
  const ringPoints = [
    start,
    end,
    { x: 0, y: 106 },
    { x: 112.58330249197704, y: 53 },
    { x: 112.58330249197701, y: -53 },
    { x: 0, y: -106 },
  ];
  const startOffset = getSkeletalRingNumberBadgeOffset(start, ringPoints);
  const endOffset = getSkeletalRingNumberBadgeOffset(end, ringPoints);
  const startBadge = { x: start.x + startOffset.x, y: start.y + startOffset.y };
  const endBadge = { x: end.x + endOffset.x, y: end.y + endOffset.y };
  const rawSegments = getSkeletalRingDoubleBondSegments(start, end, ringPoints);
  const clipped = clipSkeletalRingDoubleBondSegments(rawSegments, start, end, {
    startObstacle: { center: startBadge, radius: SKELETAL_NUMBER_BADGE_CLEARANCE },
    endObstacle: { center: endBadge, radius: SKELETAL_NUMBER_BADGE_CLEARANCE },
  });

  for (const segment of clipped) {
    assert.ok(
      distanceFromPointToSegment(startBadge, segment) >= SKELETAL_NUMBER_BADGE_CLEARANCE - 1e-9,
    );
    assert.ok(
      distanceFromPointToSegment(endBadge, segment) >= SKELETAL_NUMBER_BADGE_CLEARANCE - 1e-9,
    );
  }
  const edgeClearance = projectedEndpointClearance(clipped[0], start, end);
  assert.ok(Math.abs(edgeClearance.start) < 1e-9);
  assert.ok(Math.abs(edgeClearance.end) < 1e-9);
});
