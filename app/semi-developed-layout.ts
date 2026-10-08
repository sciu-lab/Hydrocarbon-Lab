import {
  inspectDoubleBondStereochemistry,
  setDoubleBondGeometry,
  type StereoConfiguration,
} from "./double-bond-stereochemistry.ts";
import { findOrderedSimpleMonocycle } from "./simple-cycle.ts";
import type { ManualDisplayDirection } from "./manual-display-direction.ts";

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
  manualDisplayDirections?: readonly {
    parentAtomId: number;
    childAtomId: number;
    direction: ManualDisplayDirection;
  }[];
};

export type SemiDevelopedStereoBond = {
  leftAtomId: number;
  rightAtomId: number;
  configuration: StereoConfiguration;
};

const BOND = 142;
const BRANCH_LANE = 142;
const BACKBONE_SPACING = BOND;
const BRANCH_SPACING = BOND;
const BRANCH_LANE_SPACING = BRANCH_LANE;
const LABEL_COLLISION_GAP = 104;

function makeAdjacency(graph: SemiDevelopedGraph) {
  const adjacency = new Map(graph.atoms.map(({ id }) => [id, [] as number[]]));
  for (const [left, right] of graph.bonds) {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  }
  adjacency.forEach((neighbors) => neighbors.sort((a, b) => a - b));
  return adjacency;
}

function hasCycle(adjacency: ReadonlyMap<number, readonly number[]>) {
  const visited = new Set<number>();
  const visit = (current: number, parent: number | null): boolean => {
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (neighbor === parent) continue;
      if (visited.has(neighbor) || visit(neighbor, current)) return true;
    }
    return false;
  };
  for (const atomId of adjacency.keys()) {
    if (!visited.has(atomId) && visit(atomId, null)) return true;
  }
  return false;
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

function atomElement(graph: SemiDevelopedGraph, atomId: number) {
  return (graph.atoms.find((atom) => atom.id === atomId) as { element?: string } | undefined)?.element ?? "C";
}

function edgeKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function isTerminalMultipleBondOxygen(graph: SemiDevelopedGraph, atomId: number) {
  if (atomElement(graph, atomId) !== "O") return false;
  return graph.bonds.some(([left, right, order = 1]) => order === 2
    && ((left === atomId && ["C", "N"].includes(atomElement(graph, right)))
      || (right === atomId && ["C", "N"].includes(atomElement(graph, left)))));
}

function isNitroNitrogen(graph: SemiDevelopedGraph, atomId: number) {
  if (atomElement(graph, atomId) !== "N") return false;
  const attachedOxygens = graph.bonds
    .filter(([left, right]) => left === atomId || right === atomId)
    .map(([left, right]) => left === atomId ? right : left)
    .filter((id) => atomElement(graph, id) === "O");
  return attachedOxygens.length >= 2;
}

function isNitroOxygen(graph: SemiDevelopedGraph, atomId: number) {
  if (atomElement(graph, atomId) !== "O") return false;
  const nitrogen = graph.bonds
    .filter(([left, right]) => left === atomId || right === atomId)
    .map(([left, right]) => left === atomId ? right : left)
    .find((id) => isNitroNitrogen(graph, id));
  return nitrogen !== undefined;
}

function excludeFromDisplayPath(graph: SemiDevelopedGraph, atomId: number) {
  return isHalogen(atomElement(graph, atomId))
    || isTerminalMultipleBondOxygen(graph, atomId)
    || isNitroNitrogen(graph, atomId)
    || isNitroOxygen(graph, atomId);
}

function isHalogen(element: string) {
  return element === "F" || element === "Cl" || element === "Br" || element === "I";
}

function displayPathAdjacency(graph: SemiDevelopedGraph, excludedPathEdges: ReadonlySet<string> = new Set()) {
  const adjacency = makeAdjacency(graph);
  for (const [left, right] of graph.bonds) {
    if (excludedPathEdges.has(edgeKey(left, right))
      || isTerminalMultipleBondOxygen(graph, left) || isTerminalMultipleBondOxygen(graph, right)
      || isNitroNitrogen(graph, left) || isNitroNitrogen(graph, right)
      || isNitroOxygen(graph, left) || isNitroOxygen(graph, right)
      || isHalogen(atomElement(graph, left)) || isHalogen(atomElement(graph, right))) {
      const leftNeighbors = adjacency.get(left) ?? [];
      const rightNeighbors = adjacency.get(right) ?? [];
      const rightIndex = leftNeighbors.indexOf(right), leftIndex = rightNeighbors.indexOf(left);
      if (rightIndex >= 0) leftNeighbors.splice(rightIndex, 1);
      if (leftIndex >= 0) rightNeighbors.splice(leftIndex, 1);
    }
  }
  return adjacency;
}

function orientDisplayPath(path: readonly number[], graph: SemiDevelopedGraph, preferred: readonly number[]) {
  const preferredIndex = new Map(preferred.map((id, index) => [id, index]));
  for (let index = 1; index < path.length; index += 1) {
    const previous = preferredIndex.get(path[index - 1]);
    const current = preferredIndex.get(path[index]);
    if (previous !== undefined && current !== undefined && previous !== current) {
      return current > previous ? [...path] : [...path].reverse();
    }
  }
  const atoms = new Map(graph.atoms.map((atom) => [atom.id, atom]));
  const first = atoms.get(path[0])!, last = atoms.get(path.at(-1)!);
  const leftToRight = first.x < last.x || first.x === last.x && first.y <= last.y;
  return leftToRight ? [...path] : [...path].reverse();
}

function compareDisplayPaths(
  left: readonly number[],
  right: readonly number[],
  graph: SemiDevelopedGraph,
  preferred: readonly number[],
) {
  if (left.length !== right.length) return right.length - left.length;
  const preferredIds = new Set(preferred);
  const leftPreferred = left.filter((id) => preferredIds.has(id)).length;
  const rightPreferred = right.filter((id) => preferredIds.has(id)).length;
  if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
  const terminalExclusions = (path: readonly number[]) => Number(excludeFromDisplayPath(graph, path[0]))
    + Number(excludeFromDisplayPath(graph, path.at(-1)!));
  const exclusionDifference = terminalExclusions(left) - terminalExclusions(right);
  if (exclusionDifference) return exclusionDifference;
  const orientedLeft = orientDisplayPath(left, graph, preferred);
  const orientedRight = orientDisplayPath(right, graph, preferred);
  const leftAtoms = new Map(graph.atoms.map((atom) => [atom.id, atom]));
  const leftStart = leftAtoms.get(orientedLeft[0])!, rightStart = leftAtoms.get(orientedRight[0])!;
  return leftStart.x - rightStart.x || leftStart.y - rightStart.y
    || orientedLeft.join(",").localeCompare(orientedRight.join(","));
}

/** Selects a presentation-only terminal-to-terminal path, independent of IUPAC naming. */
export function selectSemiDevelopedDisplayPath(
  graph: SemiDevelopedGraph,
  preferredBackbone: readonly number[] = [],
  excludedPathEdges: ReadonlySet<string> = new Set(),
) {
  if (graph.atoms.length <= 1) return graph.atoms.map(({ id }) => id);
  const adjacency = displayPathAdjacency(graph, excludedPathEdges);
  if (hasCycle(adjacency)) return validBackbone(graph, adjacency, preferredBackbone);
  const candidates: number[][] = [];
  for (const { id } of graph.atoms) {
    const visit = (current: number, parent: number | null, path: number[]) => {
      const next = (adjacency.get(current) ?? []).filter((neighbor) => neighbor !== parent);
      if (!next.length) {
        candidates.push(path);
        return;
      }
      for (const neighbor of next) visit(neighbor, current, [...path, neighbor]);
    };
    visit(id, null, [id]);
  }
  if (!candidates.length) return validBackbone(graph, adjacency, preferredBackbone);
  candidates.sort((left, right) => compareDisplayPaths(left, right, graph, preferredBackbone));
  return orientDisplayPath(candidates[0], graph, preferredBackbone);
}

type LayoutEdge = { from: number; to: number; start: SemiDevelopedPoint; end: SemiDevelopedPoint };

function edgeIntersection(left: LayoutEdge, right: LayoutEdge): SemiDevelopedPoint | null {
  const leftHorizontal = Math.abs(left.start.y - left.end.y) < 0.001;
  const rightHorizontal = Math.abs(right.start.y - right.end.y) < 0.001;
  if (leftHorizontal && rightHorizontal) {
    if (Math.abs(left.start.y - right.start.y) > 0.001) return null;
    const low = Math.max(Math.min(left.start.x, left.end.x), Math.min(right.start.x, right.end.x));
    const high = Math.min(Math.max(left.start.x, left.end.x), Math.max(right.start.x, right.end.x));
    return high < low ? null : { x: (low + high) / 2, y: left.start.y };
  }
  if (!leftHorizontal && !rightHorizontal) {
    if (Math.abs(left.start.x - right.start.x) > 0.001) return null;
    const low = Math.max(Math.min(left.start.y, left.end.y), Math.min(right.start.y, right.end.y));
    const high = Math.min(Math.max(left.start.y, left.end.y), Math.max(right.start.y, right.end.y));
    return high < low ? null : { x: left.start.x, y: (low + high) / 2 };
  }
  const horizontal = leftHorizontal ? left : right;
  const vertical = leftHorizontal ? right : left;
  const point = { x: vertical.start.x, y: horizontal.start.y };
  const within = (value: number, start: number, end: number) => value >= Math.min(start, end) - 0.001 && value <= Math.max(start, end) + 0.001;
  return within(point.x, horizontal.start.x, horizontal.end.x)
    && within(point.y, vertical.start.y, vertical.end.y) ? point : null;
}

function sharesAtom(left: LayoutEdge, right: LayoutEdge) {
  return left.from === right.from || left.from === right.to || left.to === right.from || left.to === right.to;
}

function pointNearEdge(point: SemiDevelopedPoint, edge: LayoutEdge) {
  const horizontal = Math.abs(edge.start.y - edge.end.y) < 0.001;
  if (horizontal) {
    return Math.abs(point.y - edge.start.y) < LABEL_COLLISION_GAP / 2
      && point.x >= Math.min(edge.start.x, edge.end.x) - LABEL_COLLISION_GAP / 2
      && point.x <= Math.max(edge.start.x, edge.end.x) + LABEL_COLLISION_GAP / 2;
  }
  return Math.abs(point.x - edge.start.x) < LABEL_COLLISION_GAP / 2
    && point.y >= Math.min(edge.start.y, edge.end.y) - LABEL_COLLISION_GAP / 2
    && point.y <= Math.max(edge.start.y, edge.end.y) + LABEL_COLLISION_GAP / 2;
}

function pathFromRoot(
  graph: SemiDevelopedGraph,
  root: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
  visited: ReadonlySet<number>,
) {
  const candidates: number[][] = [];
  const visit = (current: number, parent: number | null, path: number[]) => {
    const next = (adjacency.get(current) ?? []).filter((neighbor) => neighbor !== parent && !visited.has(neighbor));
    if (!next.length) {
      candidates.push(path);
      return;
    }
    for (const neighbor of next) visit(neighbor, current, [...path, neighbor]);
  };
  visit(root, null, [root]);
  // Path length is the primary criterion; the atom ID tie-break makes the
  // branch continuation stable when imported bond order changes.
  return candidates.sort((left, right) => {
    if (left.length !== right.length) return right.length - left.length;
    const leftHalogen = Number(isHalogen(atomElement(graph, left.at(-1)!)));
    const rightHalogen = Number(isHalogen(atomElement(graph, right.at(-1)!)));
    return leftHalogen - rightHalogen || left.at(-1)! - right.at(-1)!;
  })[0] ?? [root];
}

function calculateAcyclicPositions(
  graph: SemiDevelopedGraph,
  preferredBackbone: readonly number[],
  stereoBonds: readonly SemiDevelopedStereoBond[],
) {
  const positions = new Map<number, SemiDevelopedPoint>();
  const adjacency = makeAdjacency(graph);
  const stereoSides = new Map<string, { endpointId: number; priorityId: number; side: -1 | 1 }>();
  const stereoPriorityEdges = new Set<string>();
  const manualDirections = new Map<string, { parentAtomId: number; childAtomId: number; direction: ManualDisplayDirection }>();
  for (const placement of graph.manualDisplayDirections ?? []) {
    if (!adjacency.get(placement.parentAtomId)?.includes(placement.childAtomId)) continue;
    manualDirections.set(edgeKey(placement.parentAtomId, placement.childAtomId), {
      ...placement,
    });
  }
  const stereoSource = graph as Parameters<typeof inspectDoubleBondStereochemistry>[0];
  for (const target of stereoBonds) {
    const inspection = inspectDoubleBondStereochemistry(stereoSource, target.leftAtomId, target.rightAtomId);
    if (!inspection.stereogenic || !inspection.priorityAtomIds) continue;
    stereoPriorityEdges.add(edgeKey(target.leftAtomId, inspection.priorityAtomIds[0]));
    stereoPriorityEdges.add(edgeKey(target.rightAtomId, inspection.priorityAtomIds[1]));
    stereoSides.set(edgeKey(target.leftAtomId, inspection.priorityAtomIds[0]), {
      endpointId: target.leftAtomId,
      priorityId: inspection.priorityAtomIds[0],
      side: 1,
    });
    stereoSides.set(edgeKey(target.rightAtomId, inspection.priorityAtomIds[1]), {
      endpointId: target.rightAtomId,
      priorityId: inspection.priorityAtomIds[1],
      side: target.configuration === "E" ? -1 : 1,
    });
  }
  const excludedPathEdges = new Set(stereoPriorityEdges);
  for (const [key, placement] of manualDirections) {
    if (placement.direction === "up" || placement.direction === "down") excludedPathEdges.add(key);
  }
  const backbone = selectSemiDevelopedDisplayPath(graph, preferredBackbone, excludedPathEdges);
  for (const { parentAtomId, childAtomId, direction } of manualDirections.values()) {
    if (direction !== "left" && direction !== "right") continue;
    const parentIndex = backbone.indexOf(parentAtomId), childIndex = backbone.indexOf(childAtomId);
    if (parentIndex < 0 || childIndex < 0 || Math.abs(parentIndex - childIndex) !== 1) continue;
    const pathDirection = childIndex > parentIndex ? "right" : "left";
    if (pathDirection !== direction) backbone.reverse();
    break;
  }
  const stereoChildSide = (parentId: number, childId: number) => {
    const constraint = stereoSides.get(edgeKey(parentId, childId));
    if (!constraint) return undefined;
    if (parentId === constraint.endpointId && childId === constraint.priorityId) return constraint.side;
    if (childId === constraint.endpointId && parentId === constraint.priorityId) return -constraint.side as -1 | 1;
    return undefined;
  };
  const manualDirectionBetween = (parentId: number, childId: number) => {
    const placement = manualDirections.get(edgeKey(parentId, childId));
    if (!placement) return undefined;
    if (placement.parentAtomId === parentId && placement.childAtomId === childId) return placement.direction;
    switch (placement.direction) {
      case "up": return "down";
      case "down": return "up";
      case "left": return "right";
      case "right": return "left";
    }
  };

  backbone.forEach((id, index) => {
    if (index === 0) positions.set(id, { x: 0, y: 0 });
    else {
      const previousId = backbone[index - 1];
      const previous = positions.get(previousId)!;
      positions.set(id, { x: previous.x + BACKBONE_SPACING, y: previous.y });
    }
  });
  const visited = new Set(backbone);
  const occupiedEdges: LayoutEdge[] = backbone.slice(1).map((id, index) => ({
    from: backbone[index], to: id,
    start: positions.get(backbone[index])!, end: positions.get(id)!,
  }));
  const queuedPaths: number[][] = [backbone];

  const fits = (candidatePositions: ReadonlyMap<number, SemiDevelopedPoint>, candidateEdges: readonly LayoutEdge[]) => {
    for (const [id, point] of candidatePositions) {
      for (const [otherId, other] of positions) {
        if (id === otherId) continue;
        if (Math.abs(point.x - other.x) < LABEL_COLLISION_GAP && Math.abs(point.y - other.y) < LABEL_COLLISION_GAP) return false;
      }
      for (const edge of occupiedEdges) {
        if (edge.from !== id && edge.to !== id && pointNearEdge(point, edge)) return false;
      }
    }
    for (const candidate of candidateEdges) {
      for (const existing of occupiedEdges) {
        if (sharesAtom(candidate, existing)) continue;
        const intersection = edgeIntersection(candidate, existing);
        if (intersection) return false;
      }
    }
    return true;
  };

  while (queuedPaths.length) {
    const currentPath = queuedPaths.shift()!;
    for (const parentId of currentPath) {
      const parent = positions.get(parentId)!;
      const children = (adjacency.get(parentId) ?? []).filter((id) => !visited.has(id));
      for (const childId of children) {
        const branchPath = pathFromRoot(graph, childId, adjacency, visited);
        const forcedSide = stereoChildSide(parentId, childId);
        const manualRootDirection = manualDirectionBetween(parentId, childId);
        let placement: { points: Map<number, SemiDevelopedPoint>; edges: LayoutEdge[] } | null = null;
        const laneCandidates: number[] = [];
        if (forcedSide) {
          for (let lane = 1; lane <= graph.atoms.length + 1; lane += 1) laneCandidates.push(forcedSide * lane);
        } else if (manualRootDirection === "up" || manualRootDirection === "down") {
          const side = manualRootDirection === "up" ? -1 : 1;
          for (let lane = 1; lane <= graph.atoms.length + 1; lane += 1) laneCandidates.push(side * lane);
        } else if (manualRootDirection === "left" || manualRootDirection === "right") {
          for (let lane = 1; lane <= graph.atoms.length + 1; lane += 1) laneCandidates.push(lane);
        } else {
          // SVG Y increases downward, so negative lanes are the visual UP side.
          for (let lane = 1; lane <= graph.atoms.length + 1; lane += 1) laneCandidates.push(-lane, lane);
        }
        for (const lane of laneCandidates) {
          for (const direction of [1, -1] as const) {
            const candidatePoints = new Map<number, SemiDevelopedPoint>();
            const candidateEdges: LayoutEdge[] = [];
            for (let index = 0; index < branchPath.length; index += 1) {
              const id = branchPath[index];
              let point: SemiDevelopedPoint;
              if (index === 0 && (manualRootDirection === "left" || manualRootDirection === "right")) {
                const side = manualRootDirection === "left" ? -1 : 1;
                point = { x: parent.x + side * lane * BRANCH_SPACING, y: parent.y };
              } else if (index === 0) point = { x: parent.x, y: parent.y + lane * BRANCH_LANE_SPACING };
              else {
                const previousId = branchPath[index - 1];
                const previous = candidatePoints.get(previousId)!;
                const targetSide = stereoChildSide(previousId, id);
                const manualDirection = manualDirectionBetween(previousId, id);
                if (targetSide !== undefined) point = { x: previous.x, y: previous.y + targetSide * BRANCH_SPACING };
                else if (manualDirection === "up" || manualDirection === "down") {
                  point = { x: previous.x, y: previous.y + (manualDirection === "up" ? -1 : 1) * BRANCH_SPACING };
                } else if (manualDirection === "left" || manualDirection === "right") {
                  point = { x: previous.x + (manualDirection === "left" ? -1 : 1) * BRANCH_SPACING, y: previous.y };
                } else point = { x: previous.x + direction * BRANCH_SPACING, y: previous.y };
              }
              candidatePoints.set(id, point);
              const previousId = index === 0 ? parentId : branchPath[index - 1];
              const previousPoint = index === 0 ? parent : candidatePoints.get(previousId)!;
              candidateEdges.push({ from: previousId, to: id, start: previousPoint, end: point });
            }
            if (fits(candidatePoints, candidateEdges)) {
              placement = { points: candidatePoints, edges: candidateEdges };
              break;
            }
          }
          if (placement) break;
        }
        if (!placement) continue;
        for (const [id, point] of placement.points) {
          positions.set(id, point);
          visited.add(id);
        }
        occupiedEdges.push(...placement.edges);
        queuedPaths.push(branchPath);
      }
    }
  }

  // Keep disconnected malformed components visible on separate horizontal rows.
  for (const atom of graph.atoms) {
    if (visited.has(atom.id)) continue;
    const component = pathFromRoot(graph, atom.id, adjacency, visited);
    const y = Math.max(...[...positions.values()].map((point) => point.y), 0) + BRANCH_LANE_SPACING;
    component.forEach((id, index) => {
      positions.set(id, { x: index * BACKBONE_SPACING, y });
      visited.add(id);
    });
    queuedPaths.push(component);
  }

  if (graph.isMirrored) {
    const xs = [...positions.values()].map(({ x }) => x);
    const center = (Math.min(...xs) + Math.max(...xs)) / 2;
    positions.forEach(({ x, y }, id) => positions.set(id, { x: center - (x - center), y }));
  }
  return positions;
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
  if (!ringAtomIds.size && !hasCycle(adjacency)) {
    return calculateAcyclicPositions(graph, preferredBackbone, stereoBonds);
  }
  const backbone = validBackbone(graph, adjacency, preferredBackbone);

  // Ring systems keep their existing polygon-based display convention.

  const visited = new Set(positions.keys());

  // Branches get explicit lanes. The first atom leaves its parent vertically;
  // descendants continue horizontally on that lane, with sub-branches placed
  // on alternating parallel lanes. No complexity threshold changes renderer.
  const queue: { id: number; parentId: number | null; lane: number; direction: -1 | 1 }[] = [];
  const manualDirections = new Map((graph.manualDisplayDirections ?? []).map((placement) => [
    edgeKey(placement.parentAtomId, placement.childAtomId),
    { ...placement },
  ]));
  const manualDirectionBetween = (parentAtomId: number, childAtomId: number) => {
    const placement = manualDirections.get(edgeKey(parentAtomId, childAtomId));
    if (!placement) return undefined;
    if (placement.parentAtomId === parentAtomId && placement.childAtomId === childAtomId) return placement.direction;
    switch (placement.direction) {
      case "up": return "down";
      case "down": return "up";
      case "left": return "right";
      case "right": return "left";
    }
  };
  const queueParents = ringAtomIds.size ? [...ringAtomIds].sort((a, b) => a - b) : backbone;
  for (const parentId of queueParents) {
    const parent = positions.get(parentId);
    if (!parent) continue;
    const unplaced = (adjacency.get(parentId) ?? []).filter((id) => !visited.has(id));
    unplaced.forEach((childId, index) => {
      let lane = (index % 2 === 0 ? 1 : -1) as -1 | 1;
      let direction: -1 | 1 = parentId === backbone[0] && backbone.length > 1 && parent.x > positions.get(backbone[1])!.x ? -1 : 1;
      let childPoint: SemiDevelopedPoint;
      const manualDirection = manualDirectionBetween(parentId, childId);
      if (manualDirection === "up" || manualDirection === "down") {
        lane = manualDirection === "up" ? -1 : 1;
        childPoint = { x: parent.x, y: parent.y + lane * BOND };
      } else if (manualDirection === "left" || manualDirection === "right") {
        direction = manualDirection === "left" ? -1 : 1;
        childPoint = { x: parent.x + direction * BOND, y: parent.y };
      } else if (ringAtomIds.has(parentId)) {
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
      const manualDirection = manualDirectionBetween(current.id, childId);
      const direction = manualDirection === "left" ? -1 : manualDirection === "right" ? 1 : current.direction;
      positions.set(childId, manualDirection === "up" || manualDirection === "down"
        ? { x: origin.x, y: origin.y + (manualDirection === "up" ? -1 : 1) * BOND }
        : manualDirection === "left" || manualDirection === "right"
          ? { x: origin.x + direction * BOND, y: origin.y }
          : {
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
