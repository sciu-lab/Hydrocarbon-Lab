import { iupacAlkylNameForCarbonCount } from "./iupac-prefixes.ts";

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
  numbering: number[];
  parentName: string;
  substituents: FusedBicyclicSubstituent[];
  systematicName: string;
  traditionalName?: string;
};

export type FusedBicyclicSubstituent = {
  anchorId: number;
  atomIds: number[];
  locant: number;
  name: string;
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

const substituentMultipliers = ["", "", "di", "tri", "tetra", "penta", "hexa"];

function compareNumberLists(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? Infinity) - (right[index] ?? Infinity);
    if (difference) return difference;
  }
  return 0;
}

function nonSharedRingPath(ring: FusedRing, start: number, end: number) {
  const startIndex = ring.atomIds.indexOf(start);
  const endIndex = ring.atomIds.indexOf(end);
  const walk = (step: 1 | -1) => {
    const path = [start];
    for (
      let index = (startIndex + step + ring.atomIds.length) % ring.atomIds.length;
      index !== endIndex;
      index = (index + step + ring.atomIds.length) % ring.atomIds.length
    ) path.push(ring.atomIds[index]);
    return [...path, end];
  };
  const forward = walk(1);
  return forward.length > 2 ? forward : walk(-1);
}

function bicyclicNumberingCandidates(
  rings: readonly [FusedRing, FusedRing],
  bridgeheads: readonly [number, number],
) {
  const paths = rings.map((ring) => nonSharedRingPath(ring, bridgeheads[0], bridgeheads[1]));
  const pathOrders = paths[0].length === paths[1].length
    ? [[paths[0], paths[1]], [paths[1], paths[0]]]
    : [[...paths].sort((left, right) => right.length - left.length)];
  const candidates: number[][] = [];
  for (const start of bridgeheads) {
    for (const [firstPath, secondPath] of pathOrders) {
      const first = firstPath[0] === start ? firstPath : [...firstPath].reverse();
      const second = secondPath[0] === start ? secondPath : [...secondPath].reverse();
      candidates.push([
        start,
        ...first.slice(1, -1),
        first.at(-1)!,
        ...second.slice(1, -1).reverse(),
      ]);
    }
  }
  return candidates;
}

function findSimpleAlkylSubstituents(molecule: FusedRingMolecule, coreAtomIds: readonly number[]) {
  const core = new Set(coreAtomIds);
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const adjacency = new Map<number, { id: number; order: number }[]>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const [left, right, order = 1] of molecule.bonds) {
    adjacency.get(left)?.push({ id: right, order });
    adjacency.get(right)?.push({ id: left, order });
  }

  const outsideIds = molecule.atoms.map((atom) => atom.id).filter((id) => !core.has(id));
  const visited = new Set<number>();
  const substituents: Omit<FusedBicyclicSubstituent, "locant">[] = [];
  for (const outsideId of outsideIds) {
    if (visited.has(outsideId)) continue;
    const component: number[] = [];
    const pending = [outsideId];
    visited.add(outsideId);
    while (pending.length) {
      const current = pending.pop()!;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!core.has(neighbor.id) && !visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          pending.push(neighbor.id);
        }
      }
    }

    const componentSet = new Set(component);
    const attachments = component.flatMap((id) => (adjacency.get(id) ?? [])
      .filter((neighbor) => core.has(neighbor.id))
      .map((neighbor) => ({ anchorId: neighbor.id, rootId: id, order: neighbor.order })));
    const internalBonds = molecule.bonds.filter(([left, right]) => componentSet.has(left) && componentSet.has(right));
    const rootId = attachments[0]?.rootId;
    const name = iupacAlkylNameForCarbonCount(component.length);
    const isLinear = component.every((id) => (adjacency.get(id) ?? [])
      .filter((neighbor) => componentSet.has(neighbor.id)).length <= 2)
      && (rootId === undefined || (adjacency.get(rootId) ?? [])
        .filter((neighbor) => componentSet.has(neighbor.id)).length <= 1);
    if (
      attachments.length !== 1
      || attachments[0].order !== 1
      || internalBonds.length !== component.length - 1
      || internalBonds.some(([, , order = 1]) => order !== 1)
      || component.some((id) => (atomsById.get(id)?.element ?? "C") !== "C")
      || !isLinear
      || !name
      || component.length > 2
    ) return null;
    substituents.push({
      anchorId: attachments[0].anchorId,
      atomIds: component,
      name,
    });
  }
  return substituents;
}

function formatSubstituentPrefixes(substituents: readonly FusedBicyclicSubstituent[]): string | null {
  const groups = new Map<string, number[]>();
  for (const substituent of substituents) {
    const locants = groups.get(substituent.name) ?? [];
    locants.push(substituent.locant);
    groups.set(substituent.name, locants);
  }
  const prefixes: string[] = [];
  for (const [name, locants] of [...groups].sort(([left], [right]) => left.localeCompare(right, "es"))) {
    const ordered = locants.sort((left, right) => left - right);
    if (ordered.length === 1) {
      prefixes.push(`${ordered[0]}-${name}`);
      continue;
    }
    const multiplier = substituentMultipliers[ordered.length];
    if (!multiplier) return null;
    prefixes.push(`${ordered.join(",")}-${multiplier}${name}`);
  }
  return prefixes.join("-");
}

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
  const unnumberedSubstituents = findSimpleAlkylSubstituents(molecule, atomIds);
  if (!unnumberedSubstituents) return null;
  const numberedCandidates = bicyclicNumberingCandidates(
    [left, right],
    [shared[0], shared[1]],
  ).map((numbering) => {
    const locants = new Map(numbering.map((atomId, index) => [atomId, index + 1]));
    const substituents = unnumberedSubstituents.map((substituent) => ({
      ...substituent,
      locant: locants.get(substituent.anchorId)!,
    }));
    const locantSet = substituents.map((substituent) => substituent.locant).sort((a, b) => a - b);
    const citationLocants = [...new Set(substituents.map((substituent) => substituent.name))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .flatMap((name) => substituents
        .filter((substituent) => substituent.name === name)
        .map((substituent) => substituent.locant)
        .sort((a, b) => a - b));
    return { numbering, substituents, locantSet, citationLocants };
  }).sort((leftCandidate, rightCandidate) =>
    compareNumberLists(leftCandidate.locantSet, rightCandidate.locantSet)
    || compareNumberLists(leftCandidate.citationLocants, rightCandidate.citationLocants),
  );
  const chosen = numberedCandidates[0];
  const parentName = `biciclo[${paths[0]}.${paths[1]}.0]${parent}`;
  const substituentPrefix = formatSubstituentPrefixes(chosen.substituents);
  if (substituentPrefix === null) return null;
  return {
    bridgeheads: [shared[0], shared[1]],
    paths: [paths[0], paths[1], 0],
    atomIds,
    numbering: chosen.numbering,
    parentName,
    substituents: chosen.substituents,
    systematicName: substituentPrefix ? `${substituentPrefix}${parentName}` : parentName,
    traditionalName: !chosen.substituents.length && paths[0] === 4 && paths[1] === 4
      ? "decalina"
      : undefined,
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
