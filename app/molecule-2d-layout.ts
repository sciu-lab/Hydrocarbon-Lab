import {
  buildOpenChainSkeletalPositions,
  type SkeletalPoint,
} from "./skeletal-layout.ts";

type LayoutAtom = {
  id: number;
  x: number;
  y: number;
};

type LayoutBond = readonly [number, number, ...unknown[]];

type LayoutMolecule = {
  atoms: readonly LayoutAtom[];
  bonds: readonly LayoutBond[];
  rings?: readonly { atomIds: readonly number[] }[];
  isMirrored?: boolean;
};

const BOND_LENGTH = 130;
const X_SCALE = 130;
const Y_SCALE = 106;
const TURN_ANGLE = Math.PI / 3;

function pointAt(origin: SkeletalPoint, angle: number): SkeletalPoint {
  return {
    x: origin.x + Math.cos(angle) * BOND_LENGTH,
    y: origin.y + Math.sin(angle) * BOND_LENGTH,
  };
}

function distanceToSegment(
  point: SkeletalPoint,
  start: SkeletalPoint,
  end: SkeletalPoint,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy),
  );
}

function segmentDistance(
  firstStart: SkeletalPoint,
  firstEnd: SkeletalPoint,
  secondStart: SkeletalPoint,
  secondEnd: SkeletalPoint,
) {
  const cross = (origin: SkeletalPoint, left: SkeletalPoint, right: SkeletalPoint) =>
    (left.x - origin.x) * (right.y - origin.y)
    - (left.y - origin.y) * (right.x - origin.x);
  const firstSideA = cross(firstStart, firstEnd, secondStart);
  const firstSideB = cross(firstStart, firstEnd, secondEnd);
  const secondSideA = cross(secondStart, secondEnd, firstStart);
  const secondSideB = cross(secondStart, secondEnd, firstEnd);
  if (firstSideA * firstSideB <= 0 && secondSideA * secondSideB <= 0) return 0;
  return Math.min(
    distanceToSegment(firstStart, secondStart, secondEnd),
    distanceToSegment(firstEnd, secondStart, secondEnd),
    distanceToSegment(secondStart, firstStart, firstEnd),
    distanceToSegment(secondEnd, firstStart, firstEnd),
  );
}

function candidateClearance(
  candidate: SkeletalPoint,
  origin: SkeletalPoint,
  positions: ReadonlyMap<number, SkeletalPoint>,
  segments: readonly [SkeletalPoint, SkeletalPoint][],
) {
  const atomClearance = Math.min(
    BOND_LENGTH * 2,
    ...[...positions.values()]
      .filter((point) => point !== origin)
      .map((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y)),
  );
  const bondClearance = Math.min(
    BOND_LENGTH,
    ...segments
      .filter(([start, end]) => start !== origin && end !== origin)
      .map(([start, end]) => segmentDistance(origin, candidate, start, end)),
  );
  return Math.min(atomClearance, bondClearance * 1.35);
}

function buildRingAwarePositions(molecule: LayoutMolecule) {
  const positions = new Map<number, SkeletalPoint>();
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const ringAtomIds = new Set(molecule.rings?.flatMap((ring) => ring.atomIds) ?? []);
  const adjacency = new Map<number, number[]>(molecule.atoms.map((atom) => [atom.id, []]));
  molecule.bonds.forEach(([left, right]) => {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  });
  adjacency.forEach((neighbors) => neighbors.sort((left, right) => left - right));

  // Ring vertices retain their established polygon geometry exactly.
  for (const atom of molecule.atoms) {
    if (ringAtomIds.has(atom.id)) {
      positions.set(atom.id, { x: atom.x * X_SCALE, y: atom.y * Y_SCALE });
    }
  }

  const ringCenters = new Map<number, SkeletalPoint>();
  for (const ring of molecule.rings ?? []) {
    const vertices = ring.atomIds.map((atomId) => positions.get(atomId)).filter(Boolean) as SkeletalPoint[];
    if (!vertices.length) continue;
    const center = vertices.reduce(
      (sum, point) => ({ x: sum.x + point.x / vertices.length, y: sum.y + point.y / vertices.length }),
      { x: 0, y: 0 },
    );
    ring.atomIds.forEach((atomId) => ringCenters.set(atomId, center));
  }

  const segments: [SkeletalPoint, SkeletalPoint][] = molecule.bonds.flatMap(([left, right]) => {
    const start = positions.get(left);
    const end = positions.get(right);
    return start && end ? [[start, end] as [SkeletalPoint, SkeletalPoint]] : [];
  });
  const visited = new Set(positions.keys());

  const placeDescendants = (
    parentId: number,
    atomId: number,
    incomingAngle: number,
    preferredTurn: 1 | -1,
  ) => {
    const origin = positions.get(atomId)!;
    const children = (adjacency.get(atomId) ?? []).filter((id) => !visited.has(id));
    children.forEach((childId, childIndex) => {
      const rawChild = atomsById.get(childId);
      const rawAtom = atomsById.get(atomId);
      const rawAngle = rawChild && rawAtom
        ? Math.atan2((rawChild.y - rawAtom.y) * Y_SCALE, (rawChild.x - rawAtom.x) * X_SCALE)
        : incomingAngle;
      const alternatingTurn = childIndex === 0 ? preferredTurn : (preferredTurn * -1) as 1 | -1;
      const candidates = [
        incomingAngle + alternatingTurn * TURN_ANGLE,
        incomingAngle - alternatingTurn * TURN_ANGLE,
        incomingAngle + Math.PI * 2 / 3,
        incomingAngle - Math.PI * 2 / 3,
      ];
      const ranked = candidates.map((angle, index) => {
        const point = pointAt(origin, angle);
        return {
          angle,
          index,
          point,
          clearance: candidateClearance(point, origin, positions, segments),
          rawDifference: Math.abs(Math.atan2(Math.sin(angle - rawAngle), Math.cos(angle - rawAngle))),
        };
      }).sort((left, right) =>
        right.clearance - left.clearance
        || left.index - right.index
        || left.rawDifference - right.rawDifference
        || childId - parentId,
      );
      const chosen = ranked[0];
      positions.set(childId, chosen.point);
      visited.add(childId);
      segments.push([origin, chosen.point]);
      const chosenDelta = Math.atan2(
        Math.sin(chosen.angle - incomingAngle),
        Math.cos(chosen.angle - incomingAngle),
      );
      const nextTurn: 1 | -1 = chosenDelta >= 0 ? -1 : 1;
      placeDescendants(atomId, childId, chosen.angle, nextTurn);
    });
  };

  // Start each acyclic substituent radially. Its second bond begins the zigzag.
  for (const ringAtomId of [...ringAtomIds].sort((left, right) => left - right)) {
    const ringPoint = positions.get(ringAtomId);
    const center = ringCenters.get(ringAtomId);
    if (!ringPoint || !center) continue;
    const outwardAngle = Math.atan2(ringPoint.y - center.y, ringPoint.x - center.x);
    for (const childId of adjacency.get(ringAtomId) ?? []) {
      if (visited.has(childId)) continue;
      const childPoint = pointAt(ringPoint, outwardAngle);
      positions.set(childId, childPoint);
      visited.add(childId);
      segments.push([ringPoint, childPoint]);
      placeDescendants(ringAtomId, childId, outwardAngle, childId % 2 === 0 ? 1 : -1);
    }
  }

  // Keep malformed or disconnected imported fragments visible and deterministic.
  molecule.atoms.forEach((atom) => {
    if (!positions.has(atom.id)) {
      positions.set(atom.id, { x: atom.x * X_SCALE, y: atom.y * Y_SCALE });
    }
  });
  return positions;
}

/**
 * The one display-coordinate source for every molecular representation.
 *
 * Open molecules deliberately reuse the established skeletal layout. Ring
 * vertices retain their editor/imported polygons while attached acyclic
 * components are laid out radially and then zigzag. This is display-only: no
 * chemical or editor coordinates are mutated here.
 */
export function calculateMolecule2DLayout(
  molecule: LayoutMolecule,
  mainChain: readonly number[],
): Map<number, SkeletalPoint> {
  if (!molecule.rings?.length) {
    return buildOpenChainSkeletalPositions(molecule, mainChain);
  }

  return buildRingAwarePositions(molecule);
}
