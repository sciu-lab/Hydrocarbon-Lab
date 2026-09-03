export type SkeletalPoint = { x: number; y: number };

type LayoutAtom = {
  id: number;
  x: number;
  y: number;
};

type LayoutBond = readonly [number, number, ...unknown[]];

type LayoutMolecule = {
  atoms: readonly LayoutAtom[];
  bonds: readonly LayoutBond[];
  /** UI-only state: mirror the generated display coordinates horizontally. */
  isMirrored?: boolean;
};

const SKELETAL_BOND_LENGTH = 130;
const DEG = Math.PI / 180;
const MAIN_CHAIN_ANGLE = 30 * DEG;
const CANDIDATE_ANGLES = [30, 90, 150, 210, 270, 330].map((value) => value * DEG);

function normalizeAngle(angle: number) {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

function angularDistance(left: number, right: number) {
  const difference = Math.abs(normalizeAngle(left) - normalizeAngle(right));
  return Math.min(difference, Math.PI * 2 - difference);
}

function rawDirection(
  parent: LayoutAtom | undefined,
  child: LayoutAtom | undefined,
  fallback: number,
) {
  if (!parent || !child) return fallback;
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  if (Math.hypot(dx, dy) < 1e-6) return fallback;
  return Math.atan2(dy, dx);
}

function pointFromAngle(origin: SkeletalPoint, angle: number): SkeletalPoint {
  return {
    x: origin.x + Math.cos(angle) * SKELETAL_BOND_LENGTH,
    y: origin.y + Math.sin(angle) * SKELETAL_BOND_LENGTH,
  };
}

function chooseBranchAngle(
  parentId: number,
  childId: number,
  molecule: LayoutMolecule,
  positions: ReadonlyMap<number, SkeletalPoint>,
  adjacency: ReadonlyMap<number, readonly number[]>,
) {
  const origin = positions.get(parentId)!;
  const positionedNeighborAngles = (adjacency.get(parentId) ?? [])
    .map((neighborId) => positions.get(neighborId))
    .filter((point): point is SkeletalPoint => Boolean(point))
    .map((point) => Math.atan2(point.y - origin.y, point.x - origin.x));

  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const preferred = rawDirection(atomsById.get(parentId), atomsById.get(childId), 0);

  // For a branch growing away from a single already positioned bond, prefer
  // +/-120 degrees. This gives the conventional trigonal zig-zag geometry
  // instead of continuing as a 180-degree straight line.
  if (positionedNeighborAngles.length === 1) {
    const incoming = positionedNeighborAngles[0];
    const candidates = [incoming + (120 * DEG), incoming - (120 * DEG)];
    return candidates.sort(
      (left, right) => angularDistance(left, preferred) - angularDistance(right, preferred),
    )[0];
  }

  // At an internal backbone carbon, choose the free direction that maximizes
  // its angular separation from the bonds already present. On the 30/90/...°
  // lattice this naturally yields 120° around a classic skeletal vertex.
  return [...CANDIDATE_ANGLES].sort((left, right) => {
    const leftClearance = positionedNeighborAngles.length
      ? Math.min(...positionedNeighborAngles.map((angle) => angularDistance(left, angle)))
      : Math.PI;
    const rightClearance = positionedNeighborAngles.length
      ? Math.min(...positionedNeighborAngles.map((angle) => angularDistance(right, angle)))
      : Math.PI;
    if (Math.abs(leftClearance - rightClearance) > 1e-8) return rightClearance - leftClearance;
    return angularDistance(left, preferred) - angularDistance(right, preferred);
  })[0];
}

/**
 * Generates display-only coordinates for an open skeletal structure.
 *
 * The chemical/editing coordinates are never mutated. The chosen parent chain
 * is laid out with alternating +30°/-30° bond directions, which gives a 120°
 * C-C-C internal angle. Remaining branches are then added recursively on the
 * same trigonal lattice.
 */
export function buildOpenChainSkeletalPositions(
  molecule: LayoutMolecule,
  mainChain: readonly number[],
): Map<number, SkeletalPoint> {
  const positions = new Map<number, SkeletalPoint>();
  const atomIds = new Set(molecule.atoms.map((atom) => atom.id));
  const backbone = mainChain.filter((atomId) => atomIds.has(atomId));
  if (!backbone.length && molecule.atoms.length) backbone.push(molecule.atoms[0].id);
  if (!backbone.length) return positions;

  const adjacency = new Map<number, number[]>(molecule.atoms.map((atom) => [atom.id, []]));
  molecule.bonds.forEach(([left, right]) => {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  });

  positions.set(backbone[0], { x: 0, y: 0 });
  for (let index = 1; index < backbone.length; index += 1) {
    const previous = positions.get(backbone[index - 1])!;
    const angle = (index - 1) % 2 === 0 ? MAIN_CHAIN_ANGLE : -MAIN_CHAIN_ANGLE;
    positions.set(backbone[index], pointFromAngle(previous, angle));
  }

  const visited = new Set(positions.keys());
  const queue = [...backbone];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const childId of adjacency.get(parentId) ?? []) {
      if (visited.has(childId)) continue;
      const parentPoint = positions.get(parentId)!;
      const angle = chooseBranchAngle(parentId, childId, molecule, positions, adjacency);
      positions.set(childId, pointFromAngle(parentPoint, angle));
      visited.add(childId);
      queue.push(childId);
    }
  }

  // Defensive fallback for malformed/disconnected data. Keep it deterministic
  // and display-only rather than letting a missing coordinate crash the SVG.
  molecule.atoms.forEach((atom, index) => {
    if (!positions.has(atom.id)) {
      positions.set(atom.id, {
        x: atom.x * SKELETAL_BOND_LENGTH,
        y: atom.y * (SKELETAL_BOND_LENGTH * 0.82) + index * 2,
      });
    }
  });

  // Open-chain skeletal geometry is generated from connectivity so it remains
  // tidy. Reflect that generated geometry only at the display layer when the
  // user has requested a redraw.
  if (molecule.isMirrored && positions.size) {
    const xValues = [...positions.values()].map((point) => point.x);
    const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2;
    positions.forEach((point, atomId) => {
      positions.set(atomId, { ...point, x: centerX - (point.x - centerX) });
    });
  }

  return positions;
}

export function skeletalInternalAngle(
  previous: SkeletalPoint,
  vertex: SkeletalPoint,
  next: SkeletalPoint,
) {
  const left = Math.atan2(previous.y - vertex.y, previous.x - vertex.x);
  const right = Math.atan2(next.y - vertex.y, next.x - vertex.x);
  return angularDistance(left, right) / DEG;
}
