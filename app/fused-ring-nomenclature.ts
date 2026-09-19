export type FusedRingBond = readonly [number, number, number?];

export type FusedRing = {
  id: number;
  kind: "cycloalkane" | "aromatic";
  atomIds: number[];
};

export type FusedRingMolecule = {
  atoms: { id: number; element?: string }[];
  bonds: FusedRingBond[];
  rings?: FusedRing[];
};

export type FusedBicyclicSystem = {
  bridgeheads: [number, number];
  paths: [number, number, 0];
  atomIds: number[];
  systematicName: string;
  traditionalName?: string;
};

export type SteroidLikeRingSystem = {
  ringSizes: [6, 6, 6, 5];
  atomIds: number[];
};

function hasRingBond(ring: FusedRing, a: number, b: number) {
  return ring.atomIds.some((id, index) => id === a && (
    ring.atomIds[(index + 1) % ring.atomIds.length] === b
    || ring.atomIds[(index + ring.atomIds.length - 1) % ring.atomIds.length] === b
  ));
}

function isSaturatedCarbocycle(molecule: FusedRingMolecule, ring: FusedRing) {
  const atoms = new Set(ring.atomIds);
  return ring.kind === "cycloalkane"
    && ring.atomIds.every((id) => (molecule.atoms.find((atom) => atom.id === id)?.element ?? "C") === "C")
    && molecule.bonds
      .filter(([a, b]) => atoms.has(a) && atoms.has(b))
      .every(([, , order = 1]) => order === 1);
}

const alkaneParents: Record<number, string> = {
  6: "hexano", 7: "heptano", 8: "octano", 9: "nonano", 10: "decano",
  11: "undecano", 12: "dodecano", 13: "tridecano", 14: "tetradecano",
};

/**
 * Recognises two saturated carbocycles sharing exactly one complete edge.
 * It deliberately rejects external ring-to-ring bonds, spiro systems and
 * bridged graphs: their ring records do not share this single edge.
 */
export function getFusedBicyclicSystem(molecule: FusedRingMolecule): FusedBicyclicSystem | null {
  const rings = molecule.rings ?? [];
  if (rings.length !== 2 || !rings.every((ring) => isSaturatedCarbocycle(molecule, ring))) return null;
  const [left, right] = rings;
  const shared = left.atomIds.filter((id) => right.atomIds.includes(id));
  if (shared.length !== 2 || !hasRingBond(left, shared[0], shared[1]) || !hasRingBond(right, shared[0], shared[1])) return null;

  const paths = [left.atomIds.length - 2, right.atomIds.length - 2].sort((a, b) => b - a);
  const total = paths[0] + paths[1] + 2;
  const parent = alkaneParents[total];
  if (!parent) return null;
  const atomIds = [...new Set([...left.atomIds, ...right.atomIds])];
  return {
    bridgeheads: [shared[0], shared[1]],
    paths: [paths[0], paths[1], 0],
    atomIds,
    systematicName: `biciclo[${paths[0]}.${paths[1]}.0]${parent}`,
    traditionalName: paths[0] === 4 && paths[1] === 4 ? "decalina" : undefined,
  };
}

/**
 * Structural-only benchmark for the linearly fused 6-6-6-5 nucleus. It does
 * not name a steroid or infer stereochemistry; it merely proves that the
 * fusion graph and the 17-carbon ring nucleus are present.
 */
export function getSteroidLike6565System(molecule: FusedRingMolecule): SteroidLikeRingSystem | null {
  const rings = molecule.rings ?? [];
  if (rings.length !== 4 || !rings.every((ring) => isSaturatedCarbocycle(molecule, ring))) return null;
  const sortedSizes = rings.map((ring) => ring.atomIds.length).sort((a, b) => b - a);
  if (sortedSizes.join(",") !== "6,6,6,5") return null;

  const linked = rings.map(() => new Set<number>());
  let fusedEdges = 0;
  for (let leftIndex = 0; leftIndex < rings.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < rings.length; rightIndex++) {
      const shared = rings[leftIndex].atomIds.filter((id) => rings[rightIndex].atomIds.includes(id));
      if (!shared.length) continue;
      if (shared.length !== 2 || !hasRingBond(rings[leftIndex], shared[0], shared[1]) || !hasRingBond(rings[rightIndex], shared[0], shared[1])) return null;
      linked[leftIndex].add(rightIndex);
      linked[rightIndex].add(leftIndex);
      fusedEdges++;
    }
  }
  const degrees = linked.map((items) => items.size).sort((a, b) => a - b);
  const visited = new Set<number>([0]);
  const pending = [0];
  while (pending.length) {
    const current = pending.pop()!;
    for (const neighbor of linked[current]) if (!visited.has(neighbor)) {
      visited.add(neighbor);
      pending.push(neighbor);
    }
  }
  const atomIds = [...new Set(rings.flatMap((ring) => ring.atomIds))];
  if (fusedEdges !== 3 || visited.size !== 4 || degrees.join(",") !== "1,1,2,2" || atomIds.length !== 17) return null;
  return { ringSizes: [6, 6, 6, 5], atomIds };
}
