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

const radians = (degrees: number) => degrees * Math.PI / 180;

const rotate = (vector: Point, angle: number): Point => ({
  x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
  y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle),
});

const normalized = (vector: Point): Point => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};

function carbonNeighbors(molecule: ManualLayoutMolecule, atomId: number) {
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  return molecule.bonds.flatMap(([left, right]) => {
    const neighborId = left === atomId ? right : right === atomId ? left : undefined;
    const neighbor = neighborId === undefined ? undefined : atomsById.get(neighborId);
    return neighbor && (neighbor.element ?? "C") === "C" ? [neighbor] : [];
  });
}

/**
 * Chooses the conventional 120 degree continuation for a new manually-added
 * carbon. This changes only automatically proposed coordinates; dragging a
 * node remains unrestricted.
 */
export function getAutoPlacedCarbonPosition(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  requestedDirection: Point,
): Point {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected) return requestedDirection;
  if (molecule.rings?.some((ring) => ring.atomIds.includes(selectedId))) {
    return { x: selected.x + requestedDirection.x, y: selected.y + requestedDirection.y };
  }

  const neighbors = carbonNeighbors(molecule, selectedId);
  if (neighbors.length !== 1) {
    return { x: selected.x + requestedDirection.x, y: selected.y + requestedDirection.y };
  }

  const parent = neighbors[0];
  const desired = normalized(requestedDirection);
  const incoming = normalized({ x: selected.x - parent.x, y: selected.y - parent.y });
  const candidates = [rotate(incoming, radians(60)), rotate(incoming, radians(-60))];
  const scores = candidates.map((candidate) => candidate.x * desired.x + candidate.y * desired.y);
  let choice = scores[0] > scores[1] + 1e-9 ? 0 : scores[1] > scores[0] + 1e-9 ? 1 : 0;

  // If both conventional directions fit the requested arrow equally well,
  // alternate the next turn relative to the preceding chain segment.
  const grandparents = carbonNeighbors(molecule, parent.id).filter((atom) => atom.id !== selectedId);
  if (Math.abs(scores[0] - scores[1]) <= 1e-9 && grandparents.length === 1) {
    const previous = normalized({ x: parent.x - grandparents[0].x, y: parent.y - grandparents[0].y });
    const previousTurn = previous.x * incoming.y - previous.y * incoming.x;
    if (Math.abs(previousTurn) > 1e-9) {
      const turns = candidates.map((candidate) => incoming.x * candidate.y - incoming.y * candidate.x);
      choice = turns[0] * previousTurn < turns[1] * previousTurn ? 0 : 1;
    }
  }

  const length = Math.hypot(requestedDirection.x, requestedDirection.y) || 1;
  return {
    x: selected.x + candidates[choice].x * length,
    y: selected.y + candidates[choice].y * length,
  };
}
