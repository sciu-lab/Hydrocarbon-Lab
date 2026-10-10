export type CondensedElement = "C" | "O" | "N" | "S" | "F" | "Cl" | "Br" | "I";
export type CondensedBondOrder = 1 | 2 | 3;
export type CondensedPoint = { x: number; y: number };

export type CondensedGraph = {
  atoms: readonly {
    id: number;
    element?: CondensedElement;
    charge?: number;
    tetrahedralParity?: "R" | "S";
  }[];
  bonds: readonly (readonly [number, number, CondensedBondOrder?])[];
  rings?: readonly { atomIds: readonly number[] }[];
};

export type CondensedToken =
  | {
      type: "atom";
      atomId: number;
      element: CondensedElement;
      hydrogenCount: number;
      charge: number;
      text: string;
      x: number;
      y: number;
      width: number;
      branchDepth: number;
      locant?: number;
      tetrahedralParity?: "R" | "S";
    }
  | {
      type: "bond";
      atomIds: readonly [number, number];
      bondId: string;
      order: CondensedBondOrder;
      text: string;
      x: number;
      y: number;
      width: number;
      branchDepth: number;
    }
  | {
      type: "branch-open" | "branch-close";
      text: "(" | ")";
      x: number;
      y: number;
      width: number;
      branchDepth: number;
    }
  | {
      type: "hydrogen-suffix";
      atomId: number;
      count: number;
      x: number;
      y: number;
      width: number;
      branchDepth: number;
    }
  | {
      type: "ez-badge";
      atomIds: readonly [number, number];
      bondId: string;
      configuration: "E" | "Z";
      x: number;
      y: number;
      width: number;
      branchDepth: number;
    };

export type CondensedBounds = { x: number; y: number; width: number; height: number };

export type CondensedRenderModel = {
  available: true;
  tokens: readonly CondensedToken[];
  backboneAtomIds: readonly number[];
  bounds: CondensedBounds;
  formulaText: string;
};

export type CondensedUnavailable = {
  available: false;
  reason: "cyclic" | "disconnected" | "empty";
};

export type CondensedStereoBond = {
  atomIds: readonly [number, number];
  configuration: "E" | "Z";
};

export function getCondensedUnavailableReason(graph: CondensedGraph): CondensedUnavailable["reason"] | null {
  if (!graph.atoms.length) return "empty";
  const adjacency = graphAdjacency(graph);
  if ((graph.rings?.length ?? 0) > 0 || hasCycle(adjacency)) return "cyclic";
  const seen = new Set<number>();
  const pending = [graph.atoms[0].id];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    (adjacency.get(current) ?? []).forEach(({ id }) => pending.push(id));
  }
  return seen.size === graph.atoms.length ? null : "disconnected";
}

const bondGlyph = (order: CondensedBondOrder) => order === 1 ? "–" : order === 2 ? "=" : "≡";
const edgeKey = (left: number, right: number) => `${Math.min(left, right)}:${Math.max(left, right)}`;

function graphAdjacency(graph: CondensedGraph) {
  const adjacency = new Map(graph.atoms.map(({ id }) => [id, [] as { id: number; order: CondensedBondOrder }[]]));
  for (const [left, right, order = 1] of graph.bonds) {
    adjacency.get(left)?.push({ id: right, order });
    adjacency.get(right)?.push({ id: left, order });
  }
  return adjacency;
}

function hasCycle(adjacency: ReadonlyMap<number, readonly { id: number }[]>) {
  const seen = new Set<number>();
  const visit = (id: number, parent: number | null): boolean => {
    seen.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (neighbor.id === parent) continue;
      if (seen.has(neighbor.id) || visit(neighbor.id, id)) return true;
    }
    return false;
  };
  for (const id of adjacency.keys()) if (!seen.has(id) && visit(id, null)) return true;
  return false;
}

function rootedSignature(
  graph: CondensedGraph,
  adjacency: ReadonlyMap<number, readonly { id: number; order: CondensedBondOrder }[]>,
  atomId: number,
  parentId: number | null,
): string {
  const atom = graph.atoms.find((candidate) => candidate.id === atomId)!;
  const children = (adjacency.get(atomId) ?? [])
    .filter(({ id }) => id !== parentId)
    .map(({ id, order }) => `${order}:${rootedSignature(graph, adjacency, id, atomId)}`)
    .sort();
  return `${atom.element ?? "C"}${atom.charge ?? 0}[${children.join(",")}]`;
}

function chooseBackbone(
  graph: CondensedGraph,
  adjacency: ReadonlyMap<number, readonly { id: number; order: CondensedBondOrder }[]>,
) {
  const leaves = [...adjacency.keys()].sort((left, right) => left - right);
  const paths: number[][] = [];
  for (let leftIndex = 0; leftIndex < leaves.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < leaves.length; rightIndex += 1) {
      const start = leaves[leftIndex], target = leaves[rightIndex];
      const parents = new Map<number, number | null>([[start, null]]);
      const pending = [start];
      for (let index = 0; index < pending.length && !parents.has(target); index += 1) {
        const current = pending[index];
        for (const neighbor of adjacency.get(current) ?? []) {
          if (parents.has(neighbor.id)) continue;
          parents.set(neighbor.id, current);
          pending.push(neighbor.id);
        }
      }
      if (!parents.has(target)) continue;
      const path: number[] = [];
      for (let id: number | null = target; id !== null; id = parents.get(id) ?? null) path.push(id);
      paths.push(path.reverse());
    }
  }
  if (!paths.length && graph.atoms.length === 1) return [graph.atoms[0].id];
  const atomById = new Map(graph.atoms.map((atom) => [atom.id, atom]));
  const directedPathKey = (path: readonly number[]) => path.map((id, index) => {
    const previous = path[index - 1] ?? null;
    const next = path[index + 1] ?? null;
    const branches = (adjacency.get(id) ?? [])
      .filter(({ id: neighborId }) => neighborId !== previous && neighborId !== next)
      .map(({ id: neighborId, order }) => `${order}:${rootedSignature(graph, adjacency, neighborId, id)}`)
      .sort();
    const forwardOrder = next === null ? "" : (adjacency.get(id) ?? []).find(({ id: neighborId }) => neighborId === next)?.order ?? 1;
    return `${atomById.get(id)?.element ?? "C"}{${branches.join(",")}}>${forwardOrder}`;
  }).join("/");
  const canonicalPathKey = (path: readonly number[]) => {
    const forward = directedPathKey(path);
    const reverse = directedPathKey([...path].reverse());
    return forward <= reverse ? forward : reverse;
  };
  const score = (path: readonly number[]) => {
    const carbonCount = path.filter((id) => (atomById.get(id)?.element ?? "C") === "C").length;
    const endpointPenalty = Number([path[0], path.at(-1)].some((id) => {
      const atom = atomById.get(id)!;
      const neighbors = adjacency.get(id) ?? [];
      return ["F", "Cl", "Br", "I"].includes(atom.element ?? "C")
        || atom.element === "O" && neighbors.length === 1 && neighbors[0].order > 1;
    }));
    return { carbonCount, length: path.length, endpointPenalty, key: canonicalPathKey(path) };
  };
  const chosen = paths.sort((left, right) => {
    const a = score(left), b = score(right);
    return b.carbonCount - a.carbonCount || a.endpointPenalty - b.endpointPenalty
      || b.length - a.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  })[0] ?? [];
  return chosen;
}

function orientBackbone(
  graph: CondensedGraph,
  adjacency: ReadonlyMap<number, readonly { id: number; order: CondensedBondOrder }[]>,
  path: readonly number[],
  getImplicitHydrogens: (atomId: number) => number,
) {
  if (path.length < 2) return [...path];
  const atomById = new Map(graph.atoms.map((atom) => [atom.id, atom]));
  const rank = (atomId: number, neighborId: number) => {
    const atom = atomById.get(atomId)!;
    const neighbor = atomById.get(neighborId)!;
    return [
      Math.max(0, getImplicitHydrogens(atomId)),
      Number((atom.element ?? "C") === "C"),
      adjacency.get(neighborId)?.length ?? 0,
      Number((neighbor.element ?? "C") !== "C"),
      rootedSignature(graph, adjacency, atomId, neighborId),
    ] as const;
  };
  const left = rank(path[0], path[1]);
  const right = rank(path.at(-1)!, path.at(-2)!);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    const leftWins = typeof left[index] === "number"
      ? (left[index] as number) > (right[index] as number)
      : (left[index] as string) < (right[index] as string);
    return leftWins ? [...path] : [...path].reverse();
  }
  return [...path];
}

function atomLabel(element: CondensedElement, hydrogens: number) {
  if (hydrogens < 1) return element;
  return `${element}H${hydrogens > 1 ? hydrogens : ""}`;
}

function atomLabelWidth(text: string, charge: number) {
  const subscriptLength = text.match(/[0-9]+$/)?.[0].length ?? 0;
  const baseLength = text.length - subscriptLength;
  // The renderer uses 34px text and a 70% subscript. Include side bearings so
  // branch parentheses and adjacent bond tokens cannot collide with glyphs.
  return Math.max(34, baseLength * 21 + subscriptLength * 13 + 14 + (charge ? 10 : 0));
}

/**
 * Builds a deterministic, identity-preserving horizontal formula for a
 * connected acyclic graph. It does not use IUPAC numbering or names.
 */
export function buildCondensedRenderModel(
  graph: CondensedGraph,
  getImplicitHydrogens: (atomId: number) => number,
  options: {
    numbering?: ReadonlyMap<number, number>;
    stereoBonds?: readonly CondensedStereoBond[];
    includeTetrahedralParity?: boolean;
  } = {},
): CondensedRenderModel | CondensedUnavailable {
  const unavailableReason = getCondensedUnavailableReason(graph);
  if (unavailableReason) return { available: false, reason: unavailableReason };
  const adjacency = graphAdjacency(graph);

  const backbone = orientBackbone(graph, adjacency, chooseBackbone(graph, adjacency), getImplicitHydrogens);
  const backboneEdges = new Set(backbone.slice(1).map((id, index) => edgeKey(backbone[index], id)));
  const atomById = new Map(graph.atoms.map((atom) => [atom.id, atom]));
  const branchSignature = (id: number, parentId: number) => rootedSignature(graph, adjacency, id, parentId);
  const tokens: CondensedToken[] = [];
  let cursorX = 0;
  const pushToken = <T extends CondensedToken>(token: Omit<T, "x" | "y" | "width"> & { width: number }) => {
    const positioned = { ...token, x: cursorX, y: 0 } as T;
    tokens.push(positioned);
    cursorX += token.width;
    return positioned;
  };
  const emitBond = (left: number, right: number, branchDepth: number) => {
    const edge = (adjacency.get(left) ?? []).find(({ id }) => id === right);
    if (!edge) return;
    const branch = !backboneEdges.has(edgeKey(left, right));
    const text = branch && edge.order === 1 ? "" : bondGlyph(edge.order);
    pushToken<Extract<CondensedToken, { type: "bond" }>>({
      type: "bond", atomIds: [left, right], bondId: edgeKey(left, right), order: edge.order,
      text, width: text ? edge.order === 1 ? 25 : 30 : 10, branchDepth,
    });
  };
  const emitAtom = (atomId: number, parentId: number | null, branchDepth: number, blockedPathId: number | null) => {
    const atom = atomById.get(atomId)!;
    const element = atom.element ?? "C";
    const hydrogenCount = Math.max(0, getImplicitHydrogens(atomId));
    const formyl = element === "C" && hydrogenCount === 1
      && (adjacency.get(atomId) ?? []).some(({ order, id }) => order === 2 && atomById.get(id)?.element === "O");
    const text = atomLabel(element, formyl ? 0 : hydrogenCount);
    const positionedAtom = pushToken<Extract<CondensedToken, { type: "atom" }>>({
      type: "atom", atomId, element, hydrogenCount, charge: atom.charge ?? 0, text,
      width: atomLabelWidth(text, atom.charge ?? 0), branchDepth,
      ...(options.numbering?.has(atomId) ? { locant: options.numbering.get(atomId) } : {}),
      ...(options.includeTetrahedralParity && atom.tetrahedralParity
        ? { tetrahedralParity: atom.tetrahedralParity } : {}),
    });
    const excluded = new Set([parentId, blockedPathId].filter((id): id is number => id !== null));
    const branches = (adjacency.get(atomId) ?? [])
      .filter(({ id }) => !excluded.has(id))
      .sort((left, right) => branchSignature(left.id, atomId).localeCompare(branchSignature(right.id, atomId)));
    for (const branch of branches) {
      pushToken<Extract<CondensedToken, { type: "branch-open" }>>({
        type: "branch-open", text: "(", width: 12, branchDepth: branchDepth + 1,
      });
      emitBond(atomId, branch.id, branchDepth + 1);
      emitAtom(branch.id, atomId, branchDepth + 1, null);
      pushToken<Extract<CondensedToken, { type: "branch-close" }>>({
        type: "branch-close", text: ")", width: 12, branchDepth: branchDepth + 1,
      });
    }
    if (formyl) {
      pushToken<Extract<CondensedToken, { type: "hydrogen-suffix" }>>({
        type: "hydrogen-suffix", atomId, count: 1, width: 17, branchDepth,
      });
    }
    return positionedAtom;
  };

  for (let index = 0; index < backbone.length; index += 1) {
    emitAtom(backbone[index], backbone[index - 1] ?? null, 0, backbone[index + 1] ?? null);
    if (index < backbone.length - 1) emitBond(backbone[index], backbone[index + 1], 0);
  }

  const atomPositions = new Map(tokens.filter((token): token is Extract<CondensedToken, { type: "atom" }> => token.type === "atom")
    .map((token) => [token.atomId, token.x + token.width / 2]));
  for (const stereo of options.stereoBonds ?? []) {
    const left = atomPositions.get(stereo.atomIds[0]);
    const right = atomPositions.get(stereo.atomIds[1]);
    if (left === undefined || right === undefined) continue;
    const x = (left + right) / 2;
    const bondToken = tokens.find((token): token is Extract<CondensedToken, { type: "bond" }> =>
      token.type === "bond" && token.bondId === edgeKey(...stereo.atomIds),
    );
    if (!bondToken) continue;
    tokens.push({
      type: "ez-badge", atomIds: stereo.atomIds, bondId: bondToken.bondId,
      configuration: stereo.configuration, x: x - 14, y: -48, width: 28, branchDepth: 0,
    });
  }
  const totalWidth = Math.max(1, cursorX);
  const centered = tokens.map((token) => ({ ...token, x: token.x - totalWidth / 2 }));
  const bounds = {
    x: -totalWidth / 2 - 24,
    y: -72,
    width: totalWidth + 48,
    height: 144,
  };
  const formulaText = tokens
    .filter((token) => token.type !== "ez-badge")
    .map((token) => token.type === "hydrogen-suffix" ? "H" : token.text)
    .join("");
  return { available: true, tokens: centered, backboneAtomIds: backbone, bounds, formulaText };
}

export function isCondensedGraphAvailable(graph: CondensedGraph) {
  return buildCondensedRenderModel(graph, () => 0).available;
}
