import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as geometry from "../app/skeletal-bond-geometry.ts";
import { clipCondensedBondSegments } from "../app/condensed-bond-geometry.ts";

// Exercise the actual badge placement and bond-rendering expressions, including
// the obstacle radii passed by the canvas, rather than only the central stroke.
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const compile = (source) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(`${compiled}; return run;`)();
};
const placeBadges = compile(`function run(scope) {
  const { molecule, analysis, displayPositions, numberingScale, viewMode,
    effectiveShowNumbering, functionalGroupScale,
    getSkeletalNumberBadgeGeometry, getSkeletalRingNumberBadgeOffset,
    getSkeletalNumberBadgeOffsetWithClearance } = scope;
  const isCarbonAtom = atom => !atom.element || atom.element === 'C';
  const getBondOrder = bond => bond[2] ?? 1;
  ${page.slice(
    page.indexOf("  const numberingGeometry = getSkeletalNumberBadgeGeometry(numberingScale);"),
    page.indexOf("  const numberingBadgeExtents = effectiveShowNumbering"),
  )}
  return { numberingGeometry, paintedNumberBadgeRadius, skeletalNumberBadgeOffsets };
}`);
const renderBond = compile(`function run(scope) {
  const { a, b, order, atomA, atomB, positionA, positionB, viewMode,
    effectiveShowNumbering, carbonCount, analysis, numberingGeometry,
    paintedNumberBadgeRadius, skeletalNumberBadgeOffsets,
    getParallelBondSegments, clipSkeletalTripleBondSegments,
    clipSkeletalParallelBondSegments, clipSkeletalRingDoubleBondSegments,
    clipCondensedBondSegments } = scope;
  const isCarbonAtom = atom => !atom.element || atom.element === 'C';
  const ringDoubleBondSegments = null;
  ${page.slice(
    page.indexOf("                const parallelBondSegments = getParallelBondSegments(positionA, positionB, order);"),
    page.indexOf("                const lockedBond = isFunctionalBond"),
  )}
  return { segments: visibleBondSegments, options: bondClipOptions };
}`);

// Actual pent-2-yne canvas coordinates: an implicit C2, its adjacent C1–C2
// single bond, and the ascending C2≡C3. At 200%, badge placement finds a clear
// position, but the old scaled clipping buffer still cuts outer A by 52.067 px.
const pent2yne = {
  atoms: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 112.58330249197704, y: 64.99999999999999 },
    { id: 3, x: 225.16660498395407, y: 0 },
    { id: 4, x: 337.7499074759311, y: 64.99999999999999 },
    { id: 5, x: 450.33320996790815, y: 0 },
  ],
  bonds: [[1, 2, 1], [2, 3, 3], [3, 4, 1], [4, 5, 1]],
};
const orientations = [
  ["horizontal", Math.PI / 6],
  ["ascending diagonal", 0],
  ["descending diagonal", Math.PI / 3],
];
const makeScope = (angle = 0, scale = 2, numbering = true) => {
  const molecule = {
    ...pent2yne,
    atoms: pent2yne.atoms.map((atom) => ({
      ...atom,
      x: atom.x * Math.cos(angle) - atom.y * Math.sin(angle),
      y: atom.x * Math.sin(angle) + atom.y * Math.cos(angle),
    })),
  };
  const scope = {
    ...geometry, clipCondensedBondSegments, molecule,
    viewMode: "skeletal", effectiveShowNumbering: numbering,
    functionalGroupScale: 1, numberingScale: scale, carbonCount: 5,
    analysis: { numberedAtoms: new Map(molecule.atoms.map((atom, i) => [atom.id, i + 1])) },
    displayPositions: new Map(molecule.atoms.map((atom) => [atom.id, { x: atom.x, y: atom.y }])),
    a: 2, b: 3, order: 3,
  };
  Object.assign(scope, placeBadges(scope));
  scope.atomA = molecule.atoms[1];
  scope.atomB = molecule.atoms[2];
  scope.positionA = scope.displayPositions.get(scope.a);
  scope.positionB = scope.displayPositions.get(scope.b);
  return scope;
};
const projections = (segment, start, end) => {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  return {
    start: (segment.x - start.x) * ux + (segment.y - start.y) * uy,
    end: (end.x - segment.x2) * ux + (end.y - segment.y2) * uy,
    offset: -(segment.x - start.x) * uy + (segment.y - start.y) * ux,
  };
};
const distanceToStroke = (point, segment) => {
  const dx = segment.x2 - segment.x;
  const dy = segment.y2 - segment.y;
  const t = Math.max(0, Math.min(1,
    ((point.x - segment.x) * dx + (point.y - segment.y) * dy) / (dx * dx + dy * dy),
  ));
  return Math.hypot(point.x - segment.x - t * dx, point.y - segment.y - t * dy);
};
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual}`);
const assertConnected = (scope, segments) => {
  assert.equal(segments.length, 3);
  const measurements = segments.map((segment, index) => {
    const label = ["outer A", "center", "outer B"][index];
    const projection = projections(segment, scope.positionA, scope.positionB);
    near(projection.start, 0, `${label} start is attached`);
    near(projection.end, 0, `${label} end is attached`);
    near(projection.offset, [-8, 0, 8][index], `${label} keeps its perpendicular offset`);
    near(Math.hypot(segment.x2 - segment.x, segment.y2 - segment.y), 130, `${label} keeps its axial length`);
    return projection;
  });
  for (const endpoint of ["start", "end"]) {
    const axial = measurements.map((m) => m[endpoint]);
    assert.ok(Math.max(...axial) - Math.min(...axial) < 1e-8, "only floating-point error can separate unobstructed caps");
  }
};

for (const [label, angle] of orientations) {
  test(`all three skeletal triple strokes remain connected ${label} with scaled numbering`, () => {
    for (const scale of [0.6, 1, 1.5, 2]) {
      const scope = makeScope(angle, scale);
      const { segments } = renderBond(scope);
      assertConnected(scope, segments);
      for (const atomId of [scope.a, scope.b]) {
        const position = scope.displayPositions.get(atomId);
        const offset = scope.skeletalNumberBadgeOffsets.get(atomId);
        const badge = { x: position.x + offset.x, y: position.y + offset.y };
        for (const segment of segments) {
          assert.ok(distanceToStroke(badge, segment) >= scope.paintedNumberBadgeRadius + 5.5 / 2 + 2 - 1e-8,
            "every chemical stroke keeps the actual painted badge and a 2 px gap clear");
        }
      }
    }
  });
  test(`all three skeletal triple strokes remain connected ${label} without numbering`, () => {
    const scope = makeScope(angle, 2, false);
    assertConnected(scope, renderBond(scope).segments);
  });
}

test("the exact residual fixture reproduces the old outer A recut and clears it without moving paint", () => {
  const scope = makeScope();
  const { segments, options } = renderBond(scope);
  near(scope.skeletalNumberBadgeOffsets.get(2).x, 18.645406010368827, "original badge x");
  near(scope.skeletalNumberBadgeOffsets.get(2).y, -56.46546585930644, "original badge y");
  const raw = geometry.getParallelBondSegments(scope.positionA, scope.positionB, 3);
  const oldOptions = Object.fromEntries(Object.entries(options).map(([key, obstacle]) => [
    key, { ...obstacle, radius: scope.numberingGeometry.clearance },
  ]));
  const oldSegments = geometry.clipSkeletalTripleBondSegments(raw, scope.positionA, scope.positionB, oldOptions);
  near(projections(oldSegments[0], scope.positionA, scope.positionB).start, 52.067193748113894, "old outer A gap");
  near(projections(oldSegments[1], scope.positionA, scope.positionB).start, 0, "old center already correct");
  near(projections(oldSegments[2], scope.positionA, scope.positionB).start, 0, "old outer B already correct");
  assertConnected(scope, segments);
});

test("reversing the exact fixture also protects outer B at the end endpoint", () => {
  const scope = makeScope();
  [scope.a, scope.b] = [scope.b, scope.a];
  [scope.atomA, scope.atomB] = [scope.atomB, scope.atomA];
  [scope.positionA, scope.positionB] = [scope.positionB, scope.positionA];
  assertConnected(scope, renderBond(scope).segments);
});

test("selected and unselected canvas states produce identical chemical segments in every orientation", () => {
  for (const [, angle] of orientations) {
    const scope = makeScope(angle);
    assert.deepEqual(renderBond({ ...scope, selectedId: 2 }).segments,
      renderBond({ ...scope, selectedId: null }).segments);
  }
});

test("real numbered-badge collisions still clip each triple stroke independently", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 130, y: 0 };
  const raw = geometry.getParallelBondSegments(start, end, 3);
  for (const offset of [-8, 8]) {
    const scope = makeScope(Math.PI / 6, 0.6);
    scope.positionA = start;
    scope.positionB = end;
    scope.skeletalNumberBadgeOffsets = new Map([[2, { x: 18, y: offset }], [3, { x: 40, y: -44 }]]);
    const { segments, options } = renderBond(scope);
    const hit = offset === -8 ? 0 : 2;
    assert.ok(projections(segments[hit], start, end).start > 18, "the outer stroke clears a real obstacle");
    assert.deepEqual(segments[2 - hit], raw[2 - hit], "the opposite outer stroke remains attached");
    for (const segment of segments) {
      assert.ok(distanceToStroke(options.startObstacle.center, segment) >= options.startObstacle.radius - 1e-8);
    }
  }
});

test("explicit endpoint labels retain legitimate per-stroke triple clipping", () => {
  const scope = makeScope(0, 2, false);
  scope.atomB = { ...scope.atomB, element: "N" };
  const raw = geometry.getParallelBondSegments(scope.positionA, scope.positionB, 3);
  const { segments, options } = renderBond(scope);
  assert.equal(options.endObstacle.radius, 22);
  assert.deepEqual(segments, geometry.clipSkeletalTripleBondSegments(raw, scope.positionA, scope.positionB, options));
  segments.forEach((segment, i) => {
    const projection = projections(segment, scope.positionA, scope.positionB);
    near(projection.start, 0, "implicit carbon creates no obstacle");
    near(projection.end, Math.sqrt(22 ** 2 - [-8, 0, 8][i] ** 2), "explicit label has a real chord constraint");
  });
});

for (const order of [1, 2]) {
  test(`bond order ${order} retains the original canvas geometry and obstacle radii`, () => {
    for (const [, angle] of orientations) {
      for (const scale of [0.6, 1, 1.5, 2]) {
        const scope = { ...makeScope(angle, scale), order };
        const raw = geometry.getParallelBondSegments(scope.positionA, scope.positionB, order);
        const { segments, options } = renderBond(scope);
        for (const obstacle of Object.values(options)) assert.equal(obstacle.radius, scope.numberingGeometry.clearance);
        const before = order === 1 ? raw : geometry.clipSkeletalParallelBondSegments(raw, scope.positionA, scope.positionB, options);
        assert.deepEqual(segments, before, "all coordinates and segment properties are exactly unchanged");
      }
    }
  });
}
