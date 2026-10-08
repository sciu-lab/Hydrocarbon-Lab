export type ManualDisplayDirection = "up" | "down" | "left" | "right";

export type ManualDisplayPlacement = {
  parentAtomId: number;
  childAtomId: number;
  direction: ManualDisplayDirection;
};

export type ManualDisplayDirectionGraph = {
  atoms: readonly { id: number }[];
  bonds: readonly (readonly [number, number, ...unknown[]])[];
  manualDisplayDirections?: readonly ManualDisplayPlacement[];
  isMirrored?: boolean;
};

const DIRECTIONS = new Set<ManualDisplayDirection>(["up", "down", "left", "right"]);

export function manualDisplayDirectionFromVector(x: number, y: number): ManualDisplayDirection | null {
  if (x === 0 && y < 0) return "up";
  if (x === 0 && y > 0) return "down";
  if (x < 0 && y === 0) return "left";
  if (x > 0 && y === 0) return "right";
  return null;
}

export function manualDisplayDirectionVector(direction: ManualDisplayDirection) {
  switch (direction) {
    case "up": return { x: 0, y: -1 };
    case "down": return { x: 0, y: 1 };
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
  }
}

export function normalizeManualDisplayPlacements(
  value: unknown,
  graph: Pick<ManualDisplayDirectionGraph, "atoms" | "bonds">,
): ManualDisplayPlacement[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const atomIds = new Set(graph.atoms.map(({ id }) => id));
  const edges = new Set(graph.bonds.map(([left, right]) => edgeKey(left, right)));
  const children = new Set<number>();
  const placements: ManualDisplayPlacement[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return undefined;
    const placement = candidate as Record<string, unknown>;
    if (!Number.isSafeInteger(placement.parentAtomId)
      || !Number.isSafeInteger(placement.childAtomId)
      || placement.parentAtomId === placement.childAtomId
      || !atomIds.has(placement.parentAtomId as number)
      || !atomIds.has(placement.childAtomId as number)
      || !edges.has(edgeKey(placement.parentAtomId as number, placement.childAtomId as number))
      || !DIRECTIONS.has(placement.direction as ManualDisplayDirection)
      || children.has(placement.childAtomId as number)) return undefined;
    children.add(placement.childAtomId as number);
    placements.push({
      parentAtomId: placement.parentAtomId as number,
      childAtomId: placement.childAtomId as number,
      direction: placement.direction as ManualDisplayDirection,
    });
  }
  return placements;
}

export function retainValidManualDisplayPlacements(
  value: readonly ManualDisplayPlacement[] | undefined,
  graph: Pick<ManualDisplayDirectionGraph, "atoms" | "bonds">,
) {
  if (!value?.length) return undefined;
  const atomIds = new Set(graph.atoms.map(({ id }) => id));
  const edges = new Set(graph.bonds.map(([left, right]) => edgeKey(left, right)));
  const children = new Set<number>();
  const placements = value.filter((placement) => {
    if (!DIRECTIONS.has(placement.direction)
      || !atomIds.has(placement.parentAtomId)
      || !atomIds.has(placement.childAtomId)
      || placement.parentAtomId === placement.childAtomId
      || !edges.has(edgeKey(placement.parentAtomId, placement.childAtomId))
      || children.has(placement.childAtomId)) return false;
    children.add(placement.childAtomId);
    return true;
  });
  return placements.length ? placements.map((placement) => ({ ...placement })) : undefined;
}

export function hasManualDisplayDirection(
  graph: ManualDisplayDirectionGraph,
  parentAtomId: number,
  direction: ManualDisplayDirection,
) {
  return graph.manualDisplayDirections?.some((placement) =>
    placement.parentAtomId === parentAtomId
      && canonicalManualDisplayDirection(placement.direction, graph.isMirrored) === direction,
  ) ?? false;
}

export function manualPlacementDirectionForEdge(
  graph: ManualDisplayDirectionGraph,
  parentAtomId: number,
  childAtomId: number,
) {
  return graph.manualDisplayDirections?.find((placement) =>
    placement.parentAtomId === parentAtomId && placement.childAtomId === childAtomId,
  )?.direction;
}

export function canonicalManualDisplayDirection(
  direction: ManualDisplayDirection,
  isMirrored = false,
): ManualDisplayDirection {
  if (!isMirrored) return direction;
  if (direction === "left") return "right";
  if (direction === "right") return "left";
  return direction;
}

function edgeKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}
