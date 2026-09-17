export type ManualLayoutAtom = {
  id: number;
  x: number;
  y: number;
  element?: string;
};

export type ManualLayoutMolecule = {
  atoms: readonly ManualLayoutAtom[];
  bonds: readonly (readonly [number, number, ...unknown[]])[];
  rings?: readonly { atomIds: readonly number[] }[];
};

type Point = { x: number; y: number };

const normalized = (vector: Point): Point => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};

const dot = (left: Point, right: Point) => left.x * right.x + left.y * right.y;

function axisZigzagCandidates(direction: Point) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const longitudinal = Math.cos(Math.PI / 3);
  const alternating = Math.sin(Math.PI / 3);
  return [1, -1].map((sign) => ({
    x: direction.x * longitudinal + perpendicular.x * alternating * sign,
    y: direction.y * longitudinal + perpendicular.y * alternating * sign,
  }));
}

function ringZigzagDirection(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  requestedDirection: Point,
) {
  const ring = molecule.rings?.find((candidate) => candidate.atomIds.includes(selectedId));
  if (!ring) return requestedDirection;
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const vertices = ring.atomIds.map((atomId) => atomsById.get(atomId)).filter(Boolean) as ManualLayoutAtom[];
  const selected = atomsById.get(selectedId);
  if (!selected || !vertices.length) return requestedDirection;
  const center = vertices.reduce(
    (sum, atom) => ({ x: sum.x + atom.x / vertices.length, y: sum.y + atom.y / vertices.length }),
    { x: 0, y: 0 },
  );
  const outward = normalized({ x: selected.x - center.x, y: selected.y - center.y });
  const length = Math.hypot(requestedDirection.x, requestedDirection.y) || 1;
  const candidates = axisZigzagCandidates(normalized(requestedDirection)).map((candidate) => ({
    x: candidate.x * length,
    y: candidate.y * length,
  }));
  return candidates
    .map((candidate, index) => {
      const point = { x: selected.x + candidate.x, y: selected.y + candidate.y };
      const clearance = Math.min(...molecule.atoms
        .filter((atom) => atom.id !== selectedId)
        .map((atom) => Math.hypot(point.x - atom.x, point.y - atom.y)));
      return {
        candidate,
        index,
        outwardProgress: dot(normalized(candidate), outward),
        clearance,
      };
    })
    .sort((left, right) =>
      Number(right.outwardProgress > 0.05) - Number(left.outwardProgress > 0.05)
      || right.outwardProgress - left.outwardProgress
      || right.clearance - left.clearance
      || left.index - right.index,
    )[0].candidate;
}

function carbonNeighbors(molecule: ManualLayoutMolecule, atomId: number) {
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  return molecule.bonds.flatMap(([left, right]) => {
    const neighborId = left === atomId ? right : right === atomId ? left : undefined;
    const neighbor = neighborId === undefined ? undefined : atomsById.get(neighborId);
    return neighbor && (neighbor.element ?? "C") === "C" ? [neighbor] : [];
  });
}

/**
 * Chooses a conventional zigzag around the global axis requested by the
 * arrow. Keeping both candidates on opposite sides of that axis prevents a
 * sequence of locally-good turns from accumulating perpendicular drift.
 */
export function getAutoPlacedCarbonPosition(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  requestedDirection: Point,
): Point {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected) return requestedDirection;
  if (molecule.rings?.some((ring) => ring.atomIds.includes(selectedId))) {
    const firstZigzagStep = ringZigzagDirection(molecule, selectedId, requestedDirection);
    return { x: selected.x + firstZigzagStep.x, y: selected.y + firstZigzagStep.y };
  }

  const neighbors = carbonNeighbors(molecule, selectedId);
  if (neighbors.length !== 1) {
    return { x: selected.x + requestedDirection.x, y: selected.y + requestedDirection.y };
  }

  const parent = neighbors[0];
  const desired = normalized(requestedDirection);
  const perpendicular = { x: -desired.y, y: desired.x };
  const incoming = normalized({ x: selected.x - parent.x, y: selected.y - parent.y });
  const candidates = axisZigzagCandidates(desired);
  const incomingSide = dot(incoming, perpendicular);
  let choice = incomingSide > 1e-9 ? 1 : incomingSide < -1e-9 ? 0 : 0;

  // When entering from an unrelated angle (for example after selecting a
  // branch), prefer the candidate closest to a 120° internal bond angle.
  if (Math.abs(dot(incoming, desired)) < 0.45) {
    const angleScores = candidates.map((candidate) => Math.abs(dot(incoming, candidate) - 0.5));
    choice = angleScores[0] <= angleScores[1] ? 0 : 1;
  }

  const length = Math.hypot(requestedDirection.x, requestedDirection.y) || 1;
  return {
    x: selected.x + candidates[choice].x * length,
    y: selected.y + candidates[choice].y * length,
  };
}
