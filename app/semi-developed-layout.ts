import {
  inspectDoubleBondStereochemistry,
  setDoubleBondGeometry,
  type StereoConfiguration,
} from "./double-bond-stereochemistry.ts";
import { findOrderedSimpleMonocycle } from "./simple-cycle.ts";

/** Display-only geometry for the semi-developed representation.
 *
 * This module deliberately has no dependency on the skeletal layout. It uses
 * graph connectivity and optional ring/stereo metadata supplied by chemistry
 * callers; it does not infer chemistry or mutate atom coordinates.
 */
export type SemiDevelopedPoint = { x: number; y: number };

export type SemiDevelopedGraph = {
  atoms: readonly { id: number; x: number; y: number }[];
  bonds: readonly (readonly [number, number, ...unknown[]])[];
  rings?: readonly { atomIds: readonly number[] }[];
  isMirrored?: boolean;
};

export type SemiDevelopedStereoBond = {
  leftAtomId: number;
  rightAtomId: number;
  configuration: StereoConfiguration;
};

const BOND = 142;
const BRANCH_LANE = 142;

function makeAdjacency(graph: SemiDevelopedGraph) {
  const adjacency = new Map(graph.atoms.map(({ id }) => [id, [] as number[]]));
  for (const [left, right] of graph.bonds) {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  }
  adjacency.forEach((neighbors) => neighbors.sort((a, b) => a - b));
  return adjacency;
}

function longestTreePath(graph: SemiDevelopedGraph, adjacency: ReadonlyMap<number, readonly number[]>) {
  const endpoints = graph.atoms
    .filter(({ id }) => (adjacency.get(id)?.length ?? 0) <= 1)
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
    .map(({ id }) => id);
  const roots = endpoints.length ? endpoints : [...graph.atoms]
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
    .map(({ id }) => id);
  let best: number[] = [];
  for (const root of roots) {
    const pending = [root];
    const parent = new Map<number, number | null>([[root, null]]);
    for (let index = 0; index < pending.length; index += 1) {
      const current = pending[index];
      for (const child of adjacency.get(current) ?? []) {
        if (parent.has(child)) continue;
        parent.set(child, current);
        pending.push(child);
      }
    }
    const endpoint = pending.at(-1);
    if (endpoint === undefined) continue;
    const path: number[] = [];
    for (let id: number | null = endpoint; id !== null; id = parent.get(id) ?? null) path.push(id);
    path.reverse();
    if (path.length > best.length) best = path;
  }
  return best;
}

function validBackbone(graph: SemiDevelopedGraph, adjacency: ReadonlyMap<number, readonly number[]>, proposed: readonly number[]) {
  const atomIds = new Set(graph.atoms.map(({ id }) => id));
  const path = proposed.filter((id, index) => atomIds.has(id) && (index === 0 || id !== proposed[index - 1]));
  const visualPath = longestTreePath(graph, adjacency);
  if (path.length < 2 && graph.atoms.length > 1) return visualPath;
  if (!path.length) return visualPath;
  for (let index = 1; index < path.length; index += 1) {
    if (!(adjacency.get(path[index - 1]) ?? []).includes(path[index])) return visualPath;
  }
  const allCarbon = graph.atoms.every((atom) => (atom as { element?: string }).element === undefined
    || (atom as { element?: string }).element === "C");
  return allCarbon && visualPath.length > path.length ? visualPath : path;
}

function regularRingPositions(atomIds: readonly number[], origin: SemiDevelopedPoint, firstAngle = -Math.PI / 2) {
  const count = atomIds.length;
  if (count < 3) return new Map<number, SemiDevelopedPoint>();
  const radius = BOND / (2 * Math.sin(Math.PI / count));
  return new Map(atomIds.map((id, index) => {
    const angle = firstAngle + index * Math.PI * 2 / count;
    return [id, { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius }];
  }));
}

function placeRingSystems(
  graph: SemiDevelopedGraph,
  positions: Map<number, SemiDevelopedPoint>,
) {
  const declared = graph.rings?.filter(({ atomIds }) => atomIds.length >= 3) ?? [];
  const rings = declared.length ? declared : (() => {
    const cycle = findOrderedSimpleMonocycle(graph);
    return cycle?.length ? [{ atomIds: cycle }] : [];
  })();
  if (!rings.length) return new Set<number>();

  const ringAtomIds = new Set(rings.flatMap(({ atomIds }) => atomIds));
  const first = rings[0].atomIds;
  for (const [id, point] of regularRingPositions(first, { x: 0, y: 0 })) positions.set(id, point);

  // Fused rings reuse their shared vertices and are placed on the free side of
  // their shared edge. This keeps every ring edge cyclic and avoids importing
  // line-angle coordinates from the editor or skeletal view.
  for (const ring of rings.slice(1)) {
    const shared = ring.atomIds.filter((id) => positions.has(id));
    if (shared.length < 2) continue;
    const start = positions.get(shared[0])!;
    const end = positions.get(shared[1])!;
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || BOND;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const offset = Math.sqrt(Math.max(0, BOND * BOND - length * length / 4));
    const normal = { x: -dy / length, y: dx / length };
    const candidates = [
      { x: midpoint.x + normal.x * offset, y: midpoint.y + normal.y * offset },
      { x: midpoint.x - normal.x * offset, y: midpoint.y - normal.y * offset },
    ];
    const occupied = [...positions.values()];
    const center = candidates.sort((a, b) => {
      const clearance = (point: SemiDevelopedPoint) => Math.min(...occupied.map((other) => Math.hypot(point.x - other.x, point.y - other.y)));
      return clearance(b) - clearance(a);
    })[0];
    const centerAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const polygon = regularRingPositions(ring.atomIds, center, centerAngle);
    for (const [id, point] of polygon) if (!positions.has(id)) positions.set(id, point);
  }
  return ringAtomIds;
}

/** Produces deterministic display coordinates without changing the graph. */
export function calculateSemiDevelopedLayout(
  graph: SemiDevelopedGraph,
  preferredBackbone: readonly number[] = [],
  stereoBonds: readonly SemiDevelopedStereoBond[] = [],
): Map<number, SemiDevelopedPoint> {
  const positions = new Map<number, SemiDevelopedPoint>();
  if (!graph.atoms.length) return positions;
  const adjacency = makeAdjacency(graph);
  const ringAtomIds = placeRingSystems(graph, positions);
  const backbone = validBackbone(graph, adjacency, preferredBackbone);

  if (!ringAtomIds.size) {
    backbone.forEach((id, index) => positions.set(id, { x: index * BOND, y: 0 }));
  }

  const visited = new Set(positions.keys());

  // Branches get explicit lanes. The first atom leaves its parent vertically;
  // descendants continue horizontally on that lane, with sub-branches placed
  // on alternating parallel lanes. No complexity threshold changes renderer.
  const queue: { id: number; parentId: number | null; lane: number; direction: -1 | 1 }[] = [];
  const queueParents = ringAtomIds.size ? [...ringAtomIds].sort((a, b) => a - b) : backbone;
  for (const parentId of queueParents) {
    const parent = positions.get(parentId);
    if (!parent) continue;
    const unplaced = (adjacency.get(parentId) ?? []).filter((id) => !visited.has(id));
    unplaced.forEach((childId, index) => {
      let lane = (index % 2 === 0 ? 1 : -1) as -1 | 1;
      let direction: -1 | 1 = parentId === backbone[0] && backbone.length > 1 && parent.x > positions.get(backbone[1])!.x ? -1 : 1;
      let childPoint: SemiDevelopedPoint;
      if (ringAtomIds.has(parentId)) {
        const ringUnitVectors = (adjacency.get(parentId) ?? [])
          .filter((neighborId) => ringAtomIds.has(neighborId))
          .map((neighborId) => {
            const neighbor = positions.get(neighborId)!;
            const dx = neighbor.x - parent.x, dy = neighbor.y - parent.y;
            const length = Math.hypot(dx, dy) || 1;
            return { x: dx / length, y: dy / length };
          });
        let outward = ringUnitVectors.reduce((sum, vector) => ({ x: sum.x - vector.x, y: sum.y - vector.y }), { x: 0, y: 0 });
        const outwardLength = Math.hypot(outward.x, outward.y);
        outward = outwardLength > 1e-6 ? { x: outward.x / outwardLength, y: outward.y / outwardLength } : { x: 0, y: -1 };
        direction = outward.x < -0.25 ? -1 : 1;
        lane = outward.y < 0 ? -1 : 1;
        const tangent = { x: -outward.y, y: outward.x };
        childPoint = {
          x: parent.x + outward.x * BOND + tangent.x * index * BRANCH_LANE,
          y: parent.y + outward.y * BOND + tangent.y * index * BRANCH_LANE,
        };
      } else {
        childPoint = { x: parent.x + direction * BOND * 0.12, y: parent.y + lane * BRANCH_LANE * (index + 1) };
      }
      positions.set(childId, childPoint);
      visited.add(childId);
      queue.push({ id: childId, parentId, lane, direction });
    });
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const origin = positions.get(current.id)!;
    const children = (adjacency.get(current.id) ?? []).filter((id) => !visited.has(id));
    children.forEach((childId, childIndex) => {
      const lane = childIndex === 0 ? current.lane : current.lane * -1;
      const direction = current.direction;
      positions.set(childId, {
        x: origin.x + direction * BOND,
        y: origin.y + (childIndex === 0 ? 0 : lane * BRANCH_LANE),
      });
      visited.add(childId);
      queue.push({ id: childId, parentId: current.id, lane, direction });
    });
  }

  // Disconnected or malformed components stay visible in deterministic rows.
  graph.atoms.forEach((atom, index) => {
    if (!positions.has(atom.id)) positions.set(atom.id, { x: index * BOND, y: (Math.floor(index / 4) + 1) * BRANCH_LANE });
  });

  if (graph.isMirrored) {
    const xs = [...positions.values()].map(({ x }) => x);
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    positions.forEach(({ x, y }, id) => positions.set(id, { x: center - (x - center), y }));
  }

  // Restore explicitly defined alkene geometry on this renderer's own points.
  // The chemistry helper is shared; only the resulting display coordinates
  // change, while the MolecularGraph passed by the caller remains untouched.
  if (stereoBonds.length) {
    let displayed = {
      ...graph,
      atoms: graph.atoms.map((atom) => ({ ...atom, ...(positions.get(atom.id) ?? {}) })),
      bonds: graph.bonds.map(([left, right, order = 1]) => [left, right, order as 1 | 2 | 3] as [number, number, 1 | 2 | 3]),
    } as Parameters<typeof inspectDoubleBondStereochemistry>[0];
    for (const target of stereoBonds) {
      const adjusted = setDoubleBondGeometry(displayed, target.leftAtomId, target.rightAtomId, target.configuration);
      if (adjusted.ok) displayed = adjusted.molecule;
    }
    displayed.atoms.forEach((atom) => positions.set(atom.id, { x: atom.x, y: atom.y }));
  }
  return positions;
}

/** Geometry metadata consumed by the independent semi-developed SVG layer. */
export function getSemiDevelopedBounds(
  positions: Iterable<SemiDevelopedPoint>,
  options: { labelRadius?: number; padding?: number; extents?: readonly { x: number; y: number; width: number; height: number }[] } = {},
) {
  const labelRadius = options.labelRadius ?? 48;
  const padding = options.padding ?? 32;
  const points = [...positions];
  const extents = options.extents ?? [];
  if (!points.length && !extents.length) return { x: -labelRadius - padding, y: -labelRadius - padding, width: (labelRadius + padding) * 2, height: (labelRadius + padding) * 2 };
  const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
  const pointMinX = points.length ? Math.min(...xs) - labelRadius : Infinity;
  const pointMaxX = points.length ? Math.max(...xs) + labelRadius : -Infinity;
  const pointMinY = points.length ? Math.min(...ys) - labelRadius : Infinity;
  const pointMaxY = points.length ? Math.max(...ys) + labelRadius : -Infinity;
  const minX = Math.min(pointMinX, ...extents.map(({ x }) => x)) - padding;
  const maxX = Math.max(pointMaxX, ...extents.map(({ x, width }) => x + width)) + padding;
  const minY = Math.min(pointMinY, ...extents.map(({ y }) => y)) - padding;
  const maxY = Math.max(pointMaxY, ...extents.map(({ y, height }) => y + height)) + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
