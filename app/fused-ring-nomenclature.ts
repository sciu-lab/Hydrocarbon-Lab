import { iupacAlkylNameForCarbonCount, iupacRootForCarbonCount } from "./iupac-prefixes.ts";
import { translateSpanishIupacToOpsin } from "./iupac-name-normalization.ts";

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
  functionalGroups: FusedBicyclicFunctionalGroup[];
  primaryFunctionalGroup?: FusedBicyclicFunctionalKind;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
  systematicName: string;
  traditionalName?: string;
};

export type FusedBicyclicFunctionalKind = "alcohol" | "ketone";

export type FusedBicyclicFunctionalGroupInput = {
  kind: string;
  carbonId: number;
  heteroAtomId: number;
  atomIds: readonly number[];
};

export type FusedBicyclicFunctionalGroup = {
  kind: FusedBicyclicFunctionalKind;
  carbonId: number;
  heteroAtomId: number;
  atomIds: number[];
  locant: number;
};

export type FusedBicyclicSubstituent = {
  anchorId: number;
  atomIds: number[];
  locant: number;
  name: string;
};

export type FusedMultipleBondLocant = {
  atomIds: [number, number];
  locants: [number, number];
  lower: number;
  higher: number;
  compound: boolean;
};

export type FusedTricyclicSystem = {
  atomIds: number[];
  externalAtomIds: number[];
  ringSizes: [number, number, number];
  centralRingSize: number;
  topology: "linear" | "angular";
  ringConnectivity: {
    centralRingAtomIds: number[];
    terminalRingAtomIds: [number[], number[]];
  };
  fusionBonds: {
    atomIds: [number, number];
    order: number;
    terminalRingSize: number;
    centralRingSize: number;
  }[];
  sharedAtomPairs: [number, number][];
  externalAttachments: {
    coreAtomId: number;
    externalAtomId: number;
    order: number;
  }[];
  coreMultipleBonds: {
    atomIds: [number, number];
    order: 2 | 3;
  }[];
  numbering: number[];
  numberingCandidates: number[][];
  substituents: FusedBicyclicSubstituent[];
  functionalGroups: FusedBicyclicFunctionalGroup[];
  primaryFunctionalGroup?: FusedBicyclicFunctionalKind;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
  doubleBondLocations: FusedMultipleBondLocant[];
  tripleBondLocations: FusedMultipleBondLocant[];
  vonBaeyerDescriptor: string;
  mainRing: number[];
  mainBridge: {
    bridgeheads: [number, number];
    atomIds: number[];
    length: number;
  };
  mainRingBranches: [{ atomIds: number[]; length: number }, { atomIds: number[]; length: number }];
  secondaryBridges: {
    bridgeheads: [number, number];
    atomIds: number[];
    length: number;
    attachmentLocants: [number, number];
  }[];
  parentName: string;
  parentNameEn: string;
  /** Full name for supported alkyl derivatives and simply locanted core unsaturation. */
  systematicName: string | null;
  systematicNameEn: string | null;
};

export type FusedTetracyclicRingLabel = "A" | "B" | "C" | "D";

export type FusedTetracyclicSystem = {
  atomIds: number[];
  externalAtomIds: number[];
  ringSizes: [number, number, number, number];
  rings: {
    label: FusedTetracyclicRingLabel;
    atomIds: number[];
    size: number;
    adjacentLabels: FusedTetracyclicRingLabel[];
  }[];
  fusionBonds: {
    ringLabels: [FusedTetracyclicRingLabel, FusedTetracyclicRingLabel];
    atomIds: [number, number];
    order: number;
  }[];
  fusionAtomIds: number[];
  adjacency: Record<FusedTetracyclicRingLabel, FusedTetracyclicRingLabel[]>;
  junctionTopologies: {
    ringLabel: "B" | "C";
    topology: "linear" | "angular";
    edgeSeparation: number;
  }[];
  topology: "linear" | "angular" | "mixed";
  independentCycleCount: number;
  externalAttachments: {
    coreAtomId: number;
    externalAtomId: number;
    order: number;
  }[];
  coreMultipleBonds: {
    atomIds: [number, number];
    order: 2 | 3;
  }[];
  substituents: FusedBicyclicSubstituent[];
  functionalGroups: FusedBicyclicFunctionalGroup[];
  primaryFunctionalGroup?: FusedBicyclicFunctionalKind;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
  doubleBondLocations: FusedMultipleBondLocant[];
  tripleBondLocations: FusedMultipleBondLocant[];
  numbering: number[];
  numberingCandidates: number[][];
  vonBaeyerDescriptor: string | null;
  mainRing: number[];
  mainBridge: {
    bridgeheads: [number, number];
    atomIds: [];
    length: 0;
  } | null;
  mainRingBranches: [{ atomIds: number[]; length: number }, { atomIds: number[]; length: number }];
  secondaryBridges: {
    bridgeheads: [number, number];
    atomIds: [];
    length: 0;
    attachmentLocants: [number, number];
  }[];
  parentName: string | null;
  parentNameEn: string | null;
  systematicName: string | null;
  systematicNameEn: string | null;
};

export type SteroidLikeRingSystem = {
  ringSizes: [6, 6, 6, 5];
  atomIds: number[];
  isGonaneTopology: boolean;
  /** Atom IDs in conventional steroid order C1 through C17; only for a matching gonane core. */
  numbering?: number[];
  /** IDs of the angular methyl carbons, equivalent to C18 at C13 and C19 at C10. */
  angularMethyls?: { C18: number; C19: number };
  /** An explicitly constitutional name; does not assign stereochemistry or identify natural testosterone. */
  constitutionNameEs?: string;
  constitutionNameEn?: string;

  ringsByLabel: {
    A: number[];
    B: number[];
    C: number[];
    D: number[];
  };

  junctions: {
    AB: [number, number];
    BC: [number, number];
    CD: [number, number];
  };
};

type ZeroLengthBridgeVonBaeyerCandidate = {
  score: number[];
  numbering: number[];
  mainRing: number[];
  mainBridgeheads: [number, number];
  branches: [number[], number[]];
  secondaryBridges: {
    bridgeheads: [number, number];
    locants: [number, number];
  }[];
};

const edgeKey = (left: number, right: number) => (
  left < right ? `${left}-${right}` : `${right}-${left}`
);

function enumerateCoreCycles(
  atomIds: readonly number[],
  bonds: readonly FusedRingBond[],
) {
  const core = new Set(atomIds);
  const adjacency = new Map(atomIds.map((atomId) => [atomId, [] as number[]]));
  for (const [left, right] of bonds) {
    if (!core.has(left) || !core.has(right)) continue;
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  }
  const cycles = new Map<string, number[]>();
  for (const start of atomIds) {
    const visit = (current: number, path: number[], visited: Set<number>) => {
      for (const neighbor of adjacency.get(current) ?? []) {
        if (neighbor === start && path.length >= 3) {
          const edges = path.map((atomId, index) => edgeKey(atomId, path[(index + 1) % path.length]));
          const key = edges.sort().join("|");
          if (!cycles.has(key)) cycles.set(key, [...path]);
          continue;
        }
        if (visited.has(neighbor) || path.length >= atomIds.length) continue;
        visited.add(neighbor);
        path.push(neighbor);
        visit(neighbor, path, visited);
        path.pop();
        visited.delete(neighbor);
      }
    };
    visit(start, [start], new Set([start]));
  }
  return [...cycles.values()];
}

function pathsAroundCycle(cycle: readonly number[], start: number, end: number) {
  const startIndex = cycle.indexOf(start);
  const walk = (step: 1 | -1) => {
    const path = [start];
    for (
      let index = (startIndex + step + cycle.length) % cycle.length;
      cycle[index] !== end;
      index = (index + step + cycle.length) % cycle.length
    ) path.push(cycle[index]);
    path.push(end);
    return path;
  };
  return [walk(1), walk(-1)] as const;
}

function compareCandidateScores(left: readonly number[], right: readonly number[]) {
  return compareNumberLists(left, right);
}

function buildZeroLengthBridgeVonBaeyerDescriptor(
  molecule: FusedRingMolecule,
  atomIds: readonly number[],
  bridgeCount: number,
) {
  const core = new Set(atomIds);
  const coreBonds = molecule.bonds.filter(([left, right]) => core.has(left) && core.has(right));
  const cycles = enumerateCoreCycles(atomIds, coreBonds);
  const maximumCycleLength = Math.max(0, ...cycles.map((cycle) => cycle.length));
  const mainRings = cycles.filter((cycle) => cycle.length === maximumCycleLength);
  const candidates: ZeroLengthBridgeVonBaeyerCandidate[] = [];

  for (const mainRing of mainRings) {
    const mainRingEdges = new Set(mainRing.map(
      (atomId, index) => edgeKey(atomId, mainRing[(index + 1) % mainRing.length]),
    ));
    const bridges = coreBonds.filter(([left, right]) => !mainRingEdges.has(edgeKey(left, right)));
    // The supported ortho-fused chains have a Hamiltonian main ring and one
    // zero-length graph edge for the main bridge plus the secondary bridges.
    if (mainRing.length !== atomIds.length || bridges.length !== bridgeCount) continue;

    for (let mainBridgeIndex = 0; mainBridgeIndex < bridges.length; mainBridgeIndex++) {
      const [left, right] = bridges[mainBridgeIndex];
      const secondary = bridges.filter((_bridge, index) => index !== mainBridgeIndex);
      const ringPaths = pathsAroundCycle(mainRing, left, right);
      const branchLengths = ringPaths.map((path) => path.length - 2);
      const longest = Math.max(...branchLengths);
      const shortest = Math.min(...branchLengths);
      const symmetryDifference = longest - shortest;

      for (const start of [left, right]) {
        const orientedPaths = ringPaths.map((path) => (
          path[0] === start ? [...path] : [...path].reverse()
        ));
        const admissibleOrders = branchLengths[0] === branchLengths[1]
          ? [[0, 1], [1, 0]] as const
          : [branchLengths[0] > branchLengths[1] ? [0, 1] : [1, 0]] as const;
        for (const [firstIndex, secondIndex] of admissibleOrders) {
          const first = orientedPaths[firstIndex];
          const second = orientedPaths[secondIndex];
          const numbering = [
            start,
            ...first.slice(1, -1),
            first.at(-1)!,
            ...second.slice(1, -1).reverse(),
          ];
          if (numbering.length !== atomIds.length || new Set(numbering).size !== atomIds.length) continue;
          const locants = new Map(numbering.map((atomId, index) => [atomId, index + 1]));
          const secondaryBridges = secondary.map(([secondaryLeft, secondaryRight]) => ({
            bridgeheads: [secondaryLeft, secondaryRight] as [number, number],
            locants: [
              locants.get(secondaryLeft)!,
              locants.get(secondaryRight)!,
            ].sort((a, b) => a - b) as [number, number],
          })).sort((firstBridge, secondBridge) => (
            compareNumberLists(firstBridge.locants, secondBridge.locants)
          ));
          const secondaryLocantSet = secondaryBridges
            .flatMap((bridge) => bridge.locants)
            .sort((a, b) => a - b);
          candidates.push({
            // P-23.2.1, P-23.2.4 and P-23.2.6.2: largest main ring,
            // longest main bridge, most symmetric division, then lowest
            // secondary-bridge locants. Zero bridges tie on their lengths.
            score: [
              -mainRing.length,
              0,
              symmetryDifference,
              ...secondaryBridges.map(() => 0),
              0,
              ...secondaryLocantSet,
              ...secondaryBridges.flatMap((bridge) => bridge.locants),
            ],
            numbering,
            mainRing: [...mainRing],
            mainBridgeheads: [left, right],
            branches: [first.slice(1, -1), second.slice(1, -1)],
            secondaryBridges,
          });
        }
      }
    }
  }

  candidates.sort((left, right) => compareCandidateScores(left.score, right.score));
  const best = candidates[0];
  if (!best) return null;
  const equallyPreferred = candidates.filter((candidate) => (
    compareCandidateScores(candidate.score, best.score) === 0
  ));
  const branchLengths = best.branches.map((branch) => branch.length) as [number, number];
  const descriptor = `[${branchLengths[0]}.${branchLengths[1]}.0${best.secondaryBridges.map(
    (bridge) => `.0^{${bridge.locants.join(",")}}`,
  ).join("")}]`;
  const descriptorAtomCount = branchLengths[0] + branchLengths[1] + 2;
  if (descriptorAtomCount !== atomIds.length) return null;
  return {
    descriptor,
    numbering: best.numbering,
    numberingCandidates: equallyPreferred.map((candidate) => candidate.numbering),
    mainRing: best.mainRing,
    mainBridgeheads: best.mainBridgeheads,
    branches: best.branches,
    candidates: equallyPreferred,
  };
}

function buildTricyclicVonBaeyerDescriptor(
  molecule: FusedRingMolecule,
  atomIds: readonly number[],
) {
  const descriptor = buildZeroLengthBridgeVonBaeyerDescriptor(molecule, atomIds, 2);
  const best = descriptor?.candidates[0];
  const secondary = best?.secondaryBridges[0];
  if (!descriptor || !best || !secondary) return null;
  const candidates = descriptor.candidates.map((candidate) => ({
    ...candidate,
    secondaryBridgeheads: candidate.secondaryBridges[0].bridgeheads,
    secondaryLocants: candidate.secondaryBridges[0].locants,
  }));
  return {
    ...descriptor,
    candidates,
    secondaryBridgeheads: secondary.bridgeheads,
    secondaryLocants: secondary.locants,
  };
}

/** Recognises and numbers the supported chain of three ortho-fused aliphatic rings. */
export function getFusedTricyclicSystem(
  molecule: FusedRingMolecule,
  detectedGroups: readonly FusedBicyclicFunctionalGroupInput[] = [],
): FusedTricyclicSystem | null {
  const rings = molecule.rings ?? [];
  if (
    rings.length !== 3
    || !rings.every((ring) => isSupportedCarbocycle(molecule, ring))
    || !hasValidCarbonValence(molecule)
  ) return null;

  const sortedSizes = rings.map((ring) => ring.atomIds.length).sort((left, right) => right - left);
  if (sortedSizes.join(",") !== "6,6,6" && sortedSizes.join(",") !== "6,6,5") return null;

  const linked = rings.map(() => new Set<number>());
  const relations: { left: number; right: number; shared: [number, number] }[] = [];
  for (let left = 0; left < rings.length; left++) {
    for (let right = left + 1; right < rings.length; right++) {
      const shared = rings[left].atomIds.filter((atomId) => rings[right].atomIds.includes(atomId));
      if (!shared.length) continue;
      if (
        shared.length !== 2
        || !hasRingBond(rings[left], shared[0], shared[1])
        || !hasRingBond(rings[right], shared[0], shared[1])
      ) return null;
      linked[left].add(right);
      linked[right].add(left);
      relations.push({ left, right, shared: [shared[0], shared[1]] });
    }
  }

  const centralIndex = linked.findIndex((neighbors) => neighbors.size === 2);
  if (
    relations.length !== 2
    || centralIndex < 0
    || linked.filter((neighbors) => neighbors.size === 1).length !== 2
  ) return null;

  const centralRing = rings[centralIndex];
  const centralRelations = relations.filter((relation) => (
    relation.left === centralIndex || relation.right === centralIndex
  ));
  if (centralRelations.length !== 2) return null;
  const fusionEdgeIndices = centralRelations.map((relation) => centralRing.atomIds.findIndex(
    (atomId, index) => {
      const nextId = centralRing.atomIds[(index + 1) % centralRing.atomIds.length];
      return relation.shared.includes(atomId) && relation.shared.includes(nextId);
    },
  ));
  if (fusionEdgeIndices.some((index) => index < 0)) return null;
  const rawSeparation = Math.abs(fusionEdgeIndices[0] - fusionEdgeIndices[1]);
  const edgeSeparation = Math.min(rawSeparation, centralRing.atomIds.length - rawSeparation);
  if (edgeSeparation < 2) return null;
  const topology = centralRing.atomIds.length % 2 === 0
    && edgeSeparation === centralRing.atomIds.length / 2
    ? "linear"
    : "angular";

  const terminalIndices = [...linked[centralIndex]];
  const terminalRings = terminalIndices.map((index) => rings[index]);
  const terminalSizes = terminalRings.map((ring) => ring.atomIds.length).sort((left, right) => right - left);
  const ringSizes: [number, number, number] = centralRing.atomIds.length === 5
    ? [terminalSizes[0], 5, terminalSizes[1]]
    : [terminalSizes[0], centralRing.atomIds.length, terminalSizes[1]];
  const atomIds = [...new Set(rings.flatMap((ring) => ring.atomIds))];
  const core = new Set(atomIds);
  const externalAtomIds = molecule.atoms.map((atom) => atom.id).filter((atomId) => !core.has(atomId));
  const externalAttachments = molecule.bonds.flatMap(([left, right, order = 1]) => {
    if (core.has(left) === core.has(right)) return [];
    return [{
      coreAtomId: core.has(left) ? left : right,
      externalAtomId: core.has(left) ? right : left,
      order,
    }];
  });
  const coreMultipleBonds = molecule.bonds.flatMap(([left, right, order = 1]) => (
    core.has(left) && core.has(right) && (order === 2 || order === 3)
      ? [{ atomIds: [left, right] as [number, number], order: order as 2 | 3 }]
      : []
  ));
  const fusionBonds = centralRelations.map((relation) => {
    const terminalIndex = relation.left === centralIndex ? relation.right : relation.left;
    const bond = molecule.bonds.find(([left, right]) => (
      (left === relation.shared[0] && right === relation.shared[1])
      || (left === relation.shared[1] && right === relation.shared[0])
    ));
    return {
      atomIds: relation.shared,
      order: bond?.[2] ?? 1,
      terminalRingSize: rings[terminalIndex].atomIds.length,
      centralRingSize: centralRing.atomIds.length,
    };
  });
  const vonBaeyer = buildTricyclicVonBaeyerDescriptor(molecule, atomIds);
  const parentRoot = iupacRootForCarbonCount(atomIds.length);
  if (!vonBaeyer || !parentRoot) return null;
  const unnumberedFunctionalGroups = findDirectFunctionalGroups(molecule, atomIds, detectedGroups);
  const functionalHeteroAtomIds = new Set(
    (unnumberedFunctionalGroups ?? []).map((group) => group.heteroAtomId),
  );
  const unnumberedSubstituents = findSimpleAlkylSubstituents(
    molecule,
    atomIds,
    functionalHeteroAtomIds,
  );
  const primaryFunctionalGroup: FusedBicyclicFunctionalKind | undefined = unnumberedFunctionalGroups
    ?.some((group) => group.kind === "ketone")
    ? "ketone"
    : unnumberedFunctionalGroups?.some((group) => group.kind === "alcohol")
      ? "alcohol"
      : undefined;
  const rankedNumberings = unnumberedFunctionalGroups && unnumberedSubstituents
    ? vonBaeyer.candidates.flatMap((candidate) => {
      const unsaturation = multipleBondLocations(molecule, atomIds, candidate.numbering);
      if (!unsaturation) return [];
      const locants = new Map(candidate.numbering.map((atomId, index) => [atomId, index + 1]));
      const substituents = unnumberedSubstituents.map((substituent) => ({
        ...substituent,
        locant: locants.get(substituent.anchorId)!,
      }));
      const functionalGroups = unnumberedFunctionalGroups.map((group) => ({
        ...group,
        locant: locants.get(group.carbonId)!,
      }));
      const primaryLocants = functionalGroups
        .filter((group) => group.kind === primaryFunctionalGroup)
        .map((group) => group.locant)
        .sort((left, right) => left - right);
      const functionalPrefixes: LocantedPrefix[] = functionalGroups
        .filter((group) => group.kind !== primaryFunctionalGroup)
        .map((group) => ({ name: "hidroxi", locant: group.locant }));
      const prefixes: LocantedPrefix[] = [...substituents, ...functionalPrefixes];
      const prefixLocants = prefixes.map((prefix) => prefix.locant)
        .sort((left, right) => left - right);
      const citationLocants = [...new Set(prefixes.map((prefix) => prefix.name))]
        .sort((left, right) => left.localeCompare(right, "es"))
        .flatMap((name) => prefixes
          .filter((prefix) => prefix.name === name)
          .map((prefix) => prefix.locant)
          .sort((left, right) => left - right));
      const combinedLocations = [
        ...unsaturation.doubleBondLocations,
        ...unsaturation.tripleBondLocations,
      ];
      const multipleLocants = combinedLocations.map((location) => location.lower)
        .sort((left, right) => left - right);
      const doubleBondLocants = unsaturation.doubleBondLocations.map((location) => location.lower);
      const tripleBondLocants = unsaturation.tripleBondLocations.map((location) => location.lower);
      const allMultipleLocants = combinedLocations.flatMap((location) => location.locants)
        .sort((left, right) => left - right);
      return [{
        candidate,
        substituents,
        functionalGroups,
        primaryLocants,
        prefixes,
        prefixLocants,
        citationLocants,
        multipleLocants,
        doubleBondLocants,
        tripleBondLocants,
        allMultipleLocants,
        compoundLocantCount: combinedLocations.filter((location) => location.compound).length,
        ...unsaturation,
      }];
    }).sort((left, right) => (
      // IUPAC P-14.4 and VB-8.3: principal suffix groups precede unsaturation;
      // within unsaturation minimize compound locants, then compare the cited
      // locants without their parenthesized second numbers before later ties.
      compareNumberLists(left.primaryLocants, right.primaryLocants)
      || left.compoundLocantCount - right.compoundLocantCount
      || compareNumberLists(left.multipleLocants, right.multipleLocants)
      || compareNumberLists(left.doubleBondLocants, right.doubleBondLocants)
      || compareNumberLists(left.allMultipleLocants, right.allMultipleLocants)
      || compareNumberLists(left.prefixLocants, right.prefixLocants)
      || compareNumberLists(left.citationLocants, right.citationLocants)
    ))
    : [];
  const selected = rankedNumberings[0];
  const selectedCandidate = selected?.candidate ?? vonBaeyer.candidates[0];
  if (!selectedCandidate) return null;
  const selectedLocants = new Map(selectedCandidate.numbering.map((atomId, index) => [atomId, index + 1]));
  const substituents = selected?.substituents ?? (unnumberedSubstituents ?? []).map((substituent) => ({
    ...substituent,
    locant: selectedLocants.get(substituent.anchorId)!,
  }));
  const functionalGroups = selected?.functionalGroups ?? (unnumberedFunctionalGroups ?? []).map((group) => ({
    ...group,
    locant: selectedLocants.get(group.carbonId)!,
  }));
  const primaryLocants = selected?.primaryLocants ?? [];
  const doubleBondLocants = selected?.doubleBondLocants ?? [];
  const tripleBondLocants = selected?.tripleBondLocants ?? [];
  const doubleBondLocations = selected?.doubleBondLocations ?? [];
  const tripleBondLocations = selected?.tripleBondLocations ?? [];
  const [firstBranch, secondBranch] = selectedCandidate.branches;
  if (firstBranch.length + secondBranch.length + 2 !== atomIds.length) return null;
  const saturatedParentName = `triciclo${vonBaeyer.descriptor}${parentRoot}ano`;
  const hydrocarbonParentName = selected
    ? unsaturatedParentName(
      `triciclo${vonBaeyer.descriptor}`,
      atomIds.length,
      `${parentRoot}ano`,
      doubleBondLocations.map(formatMultipleBondLocant),
      tripleBondLocations.map(formatMultipleBondLocant),
    )
    : null;
  const functionalizedParentName = hydrocarbonParentName
    ? functionalParentName(hydrocarbonParentName, primaryFunctionalGroup, primaryLocants)
    : null;
  const parentName = functionalizedParentName ?? hydrocarbonParentName ?? saturatedParentName;
  const parentNameEn = translateSpanishIupacToOpsin(parentName);
  const substituentPrefix = selected && functionalizedParentName
    ? formatSubstituentPrefixes(selected.prefixes)
    : null;
  const systematicName = substituentPrefix === null
    ? null
    : substituentPrefix ? `${substituentPrefix}${parentName}` : parentName;

  return {
    atomIds,
    externalAtomIds,
    ringSizes,
    centralRingSize: centralRing.atomIds.length,
    topology,
    ringConnectivity: {
      centralRingAtomIds: [...centralRing.atomIds],
      terminalRingAtomIds: terminalRings.map((ring) => [...ring.atomIds]) as [number[], number[]],
    },
    fusionBonds,
    sharedAtomPairs: fusionBonds.map((fusion) => fusion.atomIds),
    externalAttachments,
    coreMultipleBonds,
    numbering: selectedCandidate.numbering,
    numberingCandidates: vonBaeyer.numberingCandidates,
    substituents,
    functionalGroups,
    primaryFunctionalGroup,
    doubleBondLocants,
    tripleBondLocants,
    doubleBondLocations,
    tripleBondLocations,
    vonBaeyerDescriptor: vonBaeyer.descriptor,
    mainRing: selectedCandidate.mainRing,
    mainBridge: {
      bridgeheads: selectedCandidate.mainBridgeheads,
      atomIds: [],
      length: 0,
    },
    mainRingBranches: [
      { atomIds: firstBranch, length: firstBranch.length },
      { atomIds: secondBranch, length: secondBranch.length },
    ],
    secondaryBridges: [{
      bridgeheads: selectedCandidate.secondaryBridgeheads,
      atomIds: [],
      length: 0,
      attachmentLocants: selectedCandidate.secondaryLocants,
    }],
    parentName,
    parentNameEn,
    systematicName,
    systematicNameEn: systematicName ? translateSpanishIupacToOpsin(systematicName) : null,
  };
}

function hasRingBond(ring: FusedRing, a: number, b: number) {
  return ring.atomIds.some((id, index) => id === a && (
    ring.atomIds[(index + 1) % ring.atomIds.length] === b
    || ring.atomIds[(index + ring.atomIds.length - 1) % ring.atomIds.length] === b
  ));
}

function isSupportedCarbocycle(molecule: FusedRingMolecule, ring: FusedRing) {
  return ring.kind === "cycloalkane"
    && ring.atomIds.every((id) => (molecule.atoms.find((atom) => atom.id === id)?.element ?? "C") === "C")
    && ring.atomIds.every((id, index) => {
      const nextId = ring.atomIds[(index + 1) % ring.atomIds.length];
      return molecule.bonds.some(([left, right, order = 1]) => (
        (left === id && right === nextId) || (left === nextId && right === id)
      ) && order >= 1 && order <= 3);
    });
}

const alkaneParents: Record<number, string> = {
  6: "hexano", 7: "heptano", 8: "octano", 9: "nonano", 10: "decano",
  11: "undecano", 12: "dodecano", 13: "tridecano", 14: "tetradecano",
};

const substituentMultipliers = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa"];

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

function findSimpleAlkylSubstituents(
  molecule: FusedRingMolecule,
  coreAtomIds: readonly number[],
  excludedAtomIds: ReadonlySet<number>,
) {
  const core = new Set(coreAtomIds);
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const adjacency = new Map<number, { id: number; order: number }[]>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const [left, right, order = 1] of molecule.bonds) {
    adjacency.get(left)?.push({ id: right, order });
    adjacency.get(right)?.push({ id: left, order });
  }

  const outsideIds = molecule.atoms.map((atom) => atom.id)
    .filter((id) => !core.has(id) && !excludedAtomIds.has(id));
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
        if (!core.has(neighbor.id) && !excludedAtomIds.has(neighbor.id) && !visited.has(neighbor.id)) {
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
    ) return null;
    substituents.push({
      anchorId: attachments[0].anchorId,
      atomIds: component,
      name,
    });
  }
  return substituents;
}

function findDirectFunctionalGroups(
  molecule: FusedRingMolecule,
  coreAtomIds: readonly number[],
  detectedGroups: readonly FusedBicyclicFunctionalGroupInput[],
) {
  const core = new Set(coreAtomIds);
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const directGroups = detectedGroups.filter((group) => core.has(group.carbonId));
  const seenHeteroAtoms = new Set<number>();
  const groups: Omit<FusedBicyclicFunctionalGroup, "locant">[] = [];
  for (const group of directGroups) {
    if (group.kind !== "alcohol" && group.kind !== "ketone") return null;
    if (seenHeteroAtoms.has(group.heteroAtomId)) return null;
    const carbon = atomsById.get(group.carbonId);
    const oxygen = atomsById.get(group.heteroAtomId);
    const expectedOrder = group.kind === "ketone" ? 2 : 1;
    const oxygenBonds = molecule.bonds.filter(([left, right]) => (
      left === group.heteroAtomId || right === group.heteroAtomId
    ));
    const attachment = oxygenBonds.find(([left, right]) => (
      (left === group.carbonId && right === group.heteroAtomId)
      || (right === group.carbonId && left === group.heteroAtomId)
    ));
    if (
      (carbon?.element ?? "C") !== "C"
      || oxygen?.element !== "O"
      || oxygenBonds.length !== 1
      || !attachment
      || (attachment[2] ?? 1) !== expectedOrder
    ) return null;
    seenHeteroAtoms.add(group.heteroAtomId);
    groups.push({
      kind: group.kind,
      carbonId: group.carbonId,
      heteroAtomId: group.heteroAtomId,
      atomIds: [...group.atomIds],
    });
  }
  return groups;
}

function multipleBondLocations(
  molecule: FusedRingMolecule,
  coreAtomIds: readonly number[],
  numbering: readonly number[],
) {
  const core = new Set(coreAtomIds);
  const locants = new Map(numbering.map((atomId, index) => [atomId, index + 1]));
  const doubleBondLocations: FusedMultipleBondLocant[] = [];
  const tripleBondLocations: FusedMultipleBondLocant[] = [];
  for (const [left, right, order = 1] of molecule.bonds) {
    if (!core.has(left) || !core.has(right) || order === 1) continue;
    if (order !== 2 && order !== 3) return null;
    const leftLocant = locants.get(left);
    const rightLocant = locants.get(right);
    if (leftLocant === undefined || rightLocant === undefined) return null;
    const lower = Math.min(leftLocant, rightLocant);
    const higher = Math.max(leftLocant, rightLocant);
    const location: FusedMultipleBondLocant = {
      atomIds: leftLocant <= rightLocant ? [left, right] : [right, left],
      locants: [lower, higher],
      lower,
      higher,
      compound: higher - lower !== 1,
    };
    (order === 2 ? doubleBondLocations : tripleBondLocations).push(location);
  }
  const compareLocations = (left: FusedMultipleBondLocant, right: FusedMultipleBondLocant) => (
    left.lower - right.lower || left.higher - right.higher
  );
  return {
    doubleBondLocations: doubleBondLocations.sort(compareLocations),
    tripleBondLocations: tripleBondLocations.sort(compareLocations),
  };
}

function formatMultipleBondLocant(location: FusedMultipleBondLocant) {
  return location.compound ? `${location.lower}(${location.higher})` : String(location.lower);
}

function multipleBondLocants(
  molecule: FusedRingMolecule,
  coreAtomIds: readonly number[],
  numbering: readonly number[],
) {
  const locations = multipleBondLocations(molecule, coreAtomIds, numbering);
  if (
    !locations
    || locations.doubleBondLocations.some((location) => location.compound)
    || locations.tripleBondLocations.some((location) => location.compound)
  ) return null;
  return {
    doubleBondLocants: locations.doubleBondLocations.map((location) => location.lower),
    tripleBondLocants: locations.tripleBondLocations.map((location) => location.lower),
  };
}

function hasValidCarbonValence(molecule: FusedRingMolecule) {
  const bondOrderTotals = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  for (const [left, right, order = 1] of molecule.bonds) {
    if (order < 1 || order > 3) return false;
    bondOrderTotals.set(left, (bondOrderTotals.get(left) ?? 0) + order);
    bondOrderTotals.set(right, (bondOrderTotals.get(right) ?? 0) + order);
  }
  return molecule.atoms.every((atom) => (
    (atom.element ?? "C") !== "C" || (bondOrderTotals.get(atom.id) ?? 0) <= 4
  ));
}

type OrthoFusedRingRelation = {
  left: number;
  right: number;
  shared: [number, number];
};

function orthoFusedRingRelations(rings: readonly FusedRing[]) {
  const adjacency = rings.map(() => new Set<number>());
  const relations: OrthoFusedRingRelation[] = [];
  for (let left = 0; left < rings.length; left++) {
    for (let right = left + 1; right < rings.length; right++) {
      const shared = rings[left].atomIds.filter((atomId) => rings[right].atomIds.includes(atomId));
      if (!shared.length) continue;
      if (
        shared.length !== 2
        || !hasRingBond(rings[left], shared[0], shared[1])
        || !hasRingBond(rings[right], shared[0], shared[1])
      ) return null;
      adjacency[left].add(right);
      adjacency[right].add(left);
      relations.push({ left, right, shared: [shared[0], shared[1]] });
    }
  }
  return { adjacency, relations };
}

function fusionEdgeIndex(ring: FusedRing, shared: readonly number[]) {
  return ring.atomIds.findIndex((atomId, index) => {
    const nextId = ring.atomIds[(index + 1) % ring.atomIds.length];
    return shared.includes(atomId) && shared.includes(nextId);
  });
}

/** Recognises four ortho-fused carbocycles whose ring-fusion graph is A-B-C-D. */
export function getFusedTetracyclicSystem(
  molecule: FusedRingMolecule,
  detectedGroups: readonly FusedBicyclicFunctionalGroupInput[] = [],
): FusedTetracyclicSystem | null {
  const sourceRings = molecule.rings ?? [];
  if (
    sourceRings.length !== 4
    || !sourceRings.every((ring) => isSupportedCarbocycle(molecule, ring))
    || !hasValidCarbonValence(molecule)
  ) return null;

  const graph = orthoFusedRingRelations(sourceRings);
  if (!graph || graph.relations.length !== 3) return null;
  const degrees = graph.adjacency.map((neighbors) => neighbors.size).sort((left, right) => left - right);
  if (degrees.join(",") !== "1,1,2,2") return null;

  const endpoints = graph.adjacency
    .map((neighbors, index) => ({ index, degree: neighbors.size }))
    .filter(({ degree }) => degree === 1)
    .map(({ index }) => index);
  const walkFrom = (start: number) => {
    const order = [start];
    let previous = -1;
    let current = start;
    while (order.length < sourceRings.length) {
      const next = [...graph.adjacency[current]].find((index) => index !== previous);
      if (next === undefined || order.includes(next)) return null;
      order.push(next);
      previous = current;
      current = next;
    }
    return order;
  };
  const relationBetween = (left: number, right: number) => graph.relations.find((relation) => (
    relation.left === left && relation.right === right
  ) || (
    relation.left === right && relation.right === left
  ));
  const describeOrder = (order: number[]) => {
    const junctionTopologies = ([1, 2] as const).map((position) => {
      const ring = sourceRings[order[position]];
      const previousRelation = relationBetween(order[position - 1], order[position]);
      const nextRelation = relationBetween(order[position], order[position + 1]);
      if (!previousRelation || !nextRelation) return null;
      const firstIndex = fusionEdgeIndex(ring, previousRelation.shared);
      const secondIndex = fusionEdgeIndex(ring, nextRelation.shared);
      if (firstIndex < 0 || secondIndex < 0) return null;
      const rawSeparation = Math.abs(firstIndex - secondIndex);
      const edgeSeparation = Math.min(rawSeparation, ring.atomIds.length - rawSeparation);
      if (edgeSeparation < 2) return null;
      return {
        topology: ring.atomIds.length % 2 === 0 && edgeSeparation === ring.atomIds.length / 2
          ? "linear" as const
          : "angular" as const,
        edgeSeparation,
      };
    });
    if (junctionTopologies.some((junction) => !junction)) return null;
    const sizes = order.map((index) => sourceRings[index].atomIds.length);
    const signature = `${sizes.join(",")}|${junctionTopologies.map((junction) => junction!.topology).join(",")}`;
    return { order, sizes, junctionTopologies: junctionTopologies as NonNullable<typeof junctionTopologies[number]>[], signature };
  };

  const orientations = endpoints
    .map(walkFrom)
    .filter((order): order is number[] => Boolean(order))
    .map(describeOrder)
    .filter((description): description is NonNullable<typeof description> => Boolean(description))
    .sort((left, right) => right.signature.localeCompare(left.signature, "en"));
  const selected = orientations[0];
  if (!selected) return null;
  const ringSizeKey = selected.sizes.join(",");
  if (!["6,6,6,6", "6,6,6,5", "6,6,5,6"].includes(ringSizeKey)) return null;

  const labels: FusedTetracyclicRingLabel[] = ["A", "B", "C", "D"];
  const labelBySourceIndex = new Map(selected.order.map((sourceIndex, index) => [sourceIndex, labels[index]]));
  const orderedRings = selected.order.map((sourceIndex) => sourceRings[sourceIndex]);
  const atomIds = [...new Set(orderedRings.flatMap((ring) => ring.atomIds))];
  const core = new Set(atomIds);
  const coreBondKeys = new Set(molecule.bonds.flatMap(([left, right]) => (
    core.has(left) && core.has(right) ? [edgeKey(left, right)] : []
  )));
  const independentCycleCount = coreBondKeys.size - atomIds.length + 1;
  if (independentCycleCount !== 4) return null;

  const fusionBonds = graph.relations.map((relation) => {
    const leftLabel = labelBySourceIndex.get(relation.left)!;
    const rightLabel = labelBySourceIndex.get(relation.right)!;
    const ringLabels = labels.indexOf(leftLabel) < labels.indexOf(rightLabel)
      ? [leftLabel, rightLabel] as [FusedTetracyclicRingLabel, FusedTetracyclicRingLabel]
      : [rightLabel, leftLabel] as [FusedTetracyclicRingLabel, FusedTetracyclicRingLabel];
    const bond = molecule.bonds.find(([left, right]) => (
      (left === relation.shared[0] && right === relation.shared[1])
      || (left === relation.shared[1] && right === relation.shared[0])
    ));
    return { ringLabels, atomIds: relation.shared, order: bond?.[2] ?? 1 };
  }).sort((left, right) => labels.indexOf(left.ringLabels[0]) - labels.indexOf(right.ringLabels[0]));

  const externalAtomIds = molecule.atoms.map((atom) => atom.id).filter((atomId) => !core.has(atomId));
  const externalAttachments = molecule.bonds.flatMap(([left, right, order = 1]) => {
    if (core.has(left) === core.has(right)) return [];
    return [{
      coreAtomId: core.has(left) ? left : right,
      externalAtomId: core.has(left) ? right : left,
      order,
    }];
  });
  const coreMultipleBonds = molecule.bonds.flatMap(([left, right, order = 1]) => (
    core.has(left) && core.has(right) && (order === 2 || order === 3)
      ? [{ atomIds: [left, right] as [number, number], order: order as 2 | 3 }]
      : []
  ));
  const unnumberedFunctionalGroups = findDirectFunctionalGroups(molecule, atomIds, detectedGroups);
  if (!unnumberedFunctionalGroups) return null;
  const functionalHeteroAtomIds = new Set(
    unnumberedFunctionalGroups.map((group) => group.heteroAtomId),
  );
  const unnumberedSubstituents = findSimpleAlkylSubstituents(
    molecule,
    atomIds,
    functionalHeteroAtomIds,
  );
  if (!unnumberedSubstituents) return null;
  const vonBaeyer = buildZeroLengthBridgeVonBaeyerDescriptor(molecule, atomIds, 3);
  const parentRoot = iupacRootForCarbonCount(atomIds.length);
  const parentName = vonBaeyer && parentRoot
    ? `tetraciclo${vonBaeyer.descriptor}${parentRoot}ano`
    : null;
  const primaryFunctionalGroup: FusedBicyclicFunctionalKind | undefined = unnumberedFunctionalGroups
    .some((group) => group.kind === "ketone")
    ? "ketone"
    : unnumberedFunctionalGroups.some((group) => group.kind === "alcohol")
      ? "alcohol"
      : undefined;
  const rankedNumberings = vonBaeyer
    ? vonBaeyer.candidates.flatMap((candidate) => {
      const unsaturation = multipleBondLocations(molecule, atomIds, candidate.numbering);
      if (!unsaturation) return [];
      const locants = new Map(candidate.numbering.map((atomId, index) => [atomId, index + 1]));
      const substituents = unnumberedSubstituents.map((substituent) => ({
        ...substituent,
        locant: locants.get(substituent.anchorId)!,
      }));
      const functionalGroups = unnumberedFunctionalGroups.map((group) => ({
        ...group,
        locant: locants.get(group.carbonId)!,
      }));
      const primaryLocants = functionalGroups
        .filter((group) => group.kind === primaryFunctionalGroup)
        .map((group) => group.locant)
        .sort((left, right) => left - right);
      const functionalPrefixes: LocantedPrefix[] = functionalGroups
        .filter((group) => group.kind !== primaryFunctionalGroup)
        .map((group) => ({ name: "hidroxi", locant: group.locant }));
      const prefixes: LocantedPrefix[] = [...substituents, ...functionalPrefixes];
      const prefixLocants = prefixes
        .map((prefix) => prefix.locant)
        .sort((left, right) => left - right);
      const citationLocants = [...new Set(prefixes.map((prefix) => prefix.name))]
        .sort((left, right) => left.localeCompare(right, "es"))
        .flatMap((name) => prefixes
          .filter((prefix) => prefix.name === name)
          .map((prefix) => prefix.locant)
          .sort((left, right) => left - right));
      const combinedLocations = [
        ...unsaturation.doubleBondLocations,
        ...unsaturation.tripleBondLocations,
      ];
      const multipleLocants = combinedLocations
        .map((location) => location.lower)
        .sort((left, right) => left - right);
      const doubleBondLocants = unsaturation.doubleBondLocations.map((location) => location.lower);
      const tripleBondLocants = unsaturation.tripleBondLocations.map((location) => location.lower);
      const allMultipleLocants = combinedLocations
        .flatMap((location) => location.locants)
        .sort((left, right) => left - right);
      return [{
        candidate,
        substituents,
        functionalGroups,
        primaryLocants,
        prefixes,
        prefixLocants,
        citationLocants,
        multipleLocants,
        doubleBondLocants,
        tripleBondLocants,
        allMultipleLocants,
        compoundLocantCount: combinedLocations.filter((location) => location.compound).length,
        ...unsaturation,
      }];
    }).sort((left, right) => (
      // P-14.4 gives the principal suffix function first priority. P-31.1.4
      // then ranks unsaturation; detachable prefixes follow under P-14.5.
      compareNumberLists(left.primaryLocants, right.primaryLocants)
      || left.compoundLocantCount - right.compoundLocantCount
      || compareNumberLists(left.multipleLocants, right.multipleLocants)
      || compareNumberLists(left.doubleBondLocants, right.doubleBondLocants)
      || compareNumberLists(left.allMultipleLocants, right.allMultipleLocants)
      || compareNumberLists(left.prefixLocants, right.prefixLocants)
      || compareNumberLists(left.citationLocants, right.citationLocants)
    ))
    : [];
  const selectedNumbering = rankedNumberings[0];
  const selectedCandidate = selectedNumbering?.candidate ?? vonBaeyer?.candidates[0];
  const selectedLocants = new Map(
    (selectedCandidate?.numbering ?? []).map((atomId, index) => [atomId, index + 1]),
  );
  const substituents = selectedNumbering?.substituents ?? unnumberedSubstituents.map((substituent) => ({
    ...substituent,
    locant: selectedLocants.get(substituent.anchorId)!,
  }));
  const functionalGroups = selectedNumbering?.functionalGroups ?? unnumberedFunctionalGroups.map((group) => ({
    ...group,
    locant: selectedLocants.get(group.carbonId)!,
  }));
  const primaryLocants = selectedNumbering?.primaryLocants ?? [];
  const doubleBondLocations = selectedNumbering?.doubleBondLocations ?? [];
  const tripleBondLocations = selectedNumbering?.tripleBondLocations ?? [];
  const doubleBondLocants = selectedNumbering?.doubleBondLocants ?? [];
  const tripleBondLocants = selectedNumbering?.tripleBondLocants ?? [];
  const hydrocarbonParentName = vonBaeyer && parentRoot && selectedNumbering
    ? unsaturatedParentName(
      `tetraciclo${vonBaeyer.descriptor}`,
      atomIds.length,
      `${parentRoot}ano`,
      doubleBondLocations.map(formatMultipleBondLocant),
      tripleBondLocations.map(formatMultipleBondLocant),
    )
    : null;
  const functionalizedParentName = hydrocarbonParentName
    ? functionalParentName(hydrocarbonParentName, primaryFunctionalGroup, primaryLocants)
    : null;
  const substituentPrefix = selectedNumbering && functionalizedParentName
    ? formatSubstituentPrefixes(selectedNumbering.prefixes)
    : null;
  const alkylAtomCount = substituents.reduce((count, substituent) => count + substituent.atomIds.length, 0);
  const namedExternalAtomCount = alkylAtomCount + functionalHeteroAtomIds.size;
  const namesSupported = Boolean(
    functionalizedParentName
    && selectedCandidate
    && namedExternalAtomCount === externalAtomIds.length
    && substituentPrefix !== null
  );
  const systematicName = namesSupported
    ? substituentPrefix ? `${substituentPrefix}${functionalizedParentName}` : functionalizedParentName
    : null;

  const topologyKinds = selected.junctionTopologies.map((junction) => junction.topology);
  const topology = topologyKinds.every((value) => value === "linear")
    ? "linear" as const
    : topologyKinds.every((value) => value === "angular")
      ? "angular" as const
      : "mixed" as const;
  const adjacency = Object.fromEntries(labels.map((label) => [label, []])) as Record<
    FusedTetracyclicRingLabel,
    FusedTetracyclicRingLabel[]
  >;
  for (const fusion of fusionBonds) {
    adjacency[fusion.ringLabels[0]].push(fusion.ringLabels[1]);
    adjacency[fusion.ringLabels[1]].push(fusion.ringLabels[0]);
  }

  return {
    atomIds,
    externalAtomIds,
    ringSizes: selected.sizes as [number, number, number, number],
    rings: orderedRings.map((ring, index) => ({
      label: labels[index],
      atomIds: [...ring.atomIds],
      size: ring.atomIds.length,
      adjacentLabels: [...adjacency[labels[index]]],
    })),
    fusionBonds,
    fusionAtomIds: [...new Set(fusionBonds.flatMap((fusion) => fusion.atomIds))],
    adjacency,
    junctionTopologies: selected.junctionTopologies.map((junction, index) => ({
      ringLabel: labels[index + 1] as "B" | "C",
      ...junction,
    })),
    topology,
    independentCycleCount,
    externalAttachments,
    coreMultipleBonds,
    substituents,
    functionalGroups,
    primaryFunctionalGroup,
    doubleBondLocants,
    tripleBondLocants,
    doubleBondLocations,
    tripleBondLocations,
    numbering: selectedCandidate?.numbering ?? [],
    numberingCandidates: vonBaeyer?.numberingCandidates ?? [],
    vonBaeyerDescriptor: vonBaeyer?.descriptor ?? null,
    mainRing: selectedCandidate?.mainRing ?? [],
    mainBridge: selectedCandidate ? {
      bridgeheads: selectedCandidate.mainBridgeheads,
      atomIds: [],
      length: 0,
    } : null,
    mainRingBranches: selectedCandidate ? [
      { atomIds: selectedCandidate.branches[0], length: selectedCandidate.branches[0].length },
      { atomIds: selectedCandidate.branches[1], length: selectedCandidate.branches[1].length },
    ] : [
      { atomIds: [], length: 0 },
      { atomIds: [], length: 0 },
    ],
    secondaryBridges: (selectedCandidate?.secondaryBridges ?? []).map((bridge) => ({
      bridgeheads: bridge.bridgeheads,
      atomIds: [],
      length: 0,
      attachmentLocants: bridge.locants,
    })),
    parentName: functionalizedParentName ?? hydrocarbonParentName ?? parentName,
    parentNameEn: translateSpanishIupacToOpsin(
      functionalizedParentName ?? hydrocarbonParentName ?? parentName ?? "",
    ) || null,
    systematicName,
    systematicNameEn: systematicName ? translateSpanishIupacToOpsin(systematicName) : null,
  };
}

function unsaturatedParentName(
  descriptor: string,
  carbonCount: number,
  saturatedParent: string,
  doubleBondLocants: readonly (number | string)[],
  tripleBondLocants: readonly (number | string)[],
) {
  if (!doubleBondLocants.length && !tripleBondLocants.length) return `${descriptor}${saturatedParent}`;
  const root = iupacRootForCarbonCount(carbonCount);
  if (!root) return null;
  const multiplier = (count: number) => substituentMultipliers[count];
  if (doubleBondLocants.length && !tripleBondLocants.length) {
    if (doubleBondLocants.length === 1) return `${descriptor}${root}-${doubleBondLocants[0]}-eno`;
    const prefix = multiplier(doubleBondLocants.length);
    return prefix ? `${descriptor}${root}a-${doubleBondLocants.join(",")}-${prefix}eno` : null;
  }
  if (tripleBondLocants.length && !doubleBondLocants.length) {
    if (tripleBondLocants.length === 1) return `${descriptor}${root}-${tripleBondLocants[0]}-ino`;
    const prefix = multiplier(tripleBondLocants.length);
    return prefix ? `${descriptor}${root}a-${tripleBondLocants.join(",")}-${prefix}ino` : null;
  }
  const doublePrefix = multiplier(doubleBondLocants.length);
  const triplePrefix = multiplier(tripleBondLocants.length);
  if (
    (doubleBondLocants.length > 1 && !doublePrefix)
    || (tripleBondLocants.length > 1 && !triplePrefix)
  ) return null;
  const alkenePart = doubleBondLocants.length === 1
    ? `${doubleBondLocants[0]}-en`
    : `${doubleBondLocants.join(",")}-${doublePrefix}en`;
  const alkynePart = tripleBondLocants.length === 1
    ? `${tripleBondLocants[0]}-ino`
    : `${tripleBondLocants.join(",")}-${triplePrefix}ino`;
  const stem = doubleBondLocants.length > 1 || tripleBondLocants.length > 1 ? `${root}a` : root;
  return `${descriptor}${stem}-${alkenePart}-${alkynePart}`;
}

function functionalParentName(
  hydrocarbonParent: string,
  kind: FusedBicyclicFunctionalKind | undefined,
  locants: readonly number[],
) {
  if (!kind) return hydrocarbonParent;
  const stem = hydrocarbonParent.endsWith("o") ? hydrocarbonParent.slice(0, -1) : hydrocarbonParent;
  const ordered = [...locants].sort((left, right) => left - right);
  if (!ordered.length) return null;
  const suffix = kind === "ketone" ? "ona" : "ol";
  if (ordered.length === 1) return `${stem}-${ordered[0]}-${suffix}`;
  let multiplier = substituentMultipliers[ordered.length];
  if (!multiplier) return null;
  if (kind === "alcohol" && multiplier.endsWith("a")) multiplier = multiplier.slice(0, -1);
  return `${hydrocarbonParent}-${ordered.join(",")}-${multiplier}${suffix}`;
}

type LocantedPrefix = { name: string; locant: number };

function formatSubstituentPrefixes(
  substituents: readonly LocantedPrefix[],
  locale: "es" | "en" = "es",
): string | null {
  const groups = new Map<string, number[]>();
  for (const substituent of substituents) {
    const locants = groups.get(substituent.name) ?? [];
    locants.push(substituent.locant);
    groups.set(substituent.name, locants);
  }
  const prefixes: string[] = [];
  for (const [name, locants] of [...groups].sort(([left], [right]) => left.localeCompare(right, locale))) {
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
 * Recognises two carbocycles sharing exactly one complete edge.
 * It deliberately rejects external ring-to-ring bonds, spiro systems and
 * bridged graphs: their ring records do not share this single edge.
 */
export function getFusedBicyclicSystem(
  molecule: FusedRingMolecule,
  detectedGroups: readonly FusedBicyclicFunctionalGroupInput[] = [],
): FusedBicyclicSystem | null {
  const rings = molecule.rings ?? [];
  if (
    rings.length !== 2
    || !rings.every((ring) => isSupportedCarbocycle(molecule, ring))
    || !hasValidCarbonValence(molecule)
  ) return null;
  const [left, right] = rings;
  const shared = left.atomIds.filter((id) => right.atomIds.includes(id));
  if (shared.length !== 2 || !hasRingBond(left, shared[0], shared[1]) || !hasRingBond(right, shared[0], shared[1])) return null;

  const paths = [left.atomIds.length - 2, right.atomIds.length - 2].sort((a, b) => b - a);
  const total = paths[0] + paths[1] + 2;
  const parent = alkaneParents[total];
  if (!parent) return null;
  const atomIds = [...new Set([...left.atomIds, ...right.atomIds])];
  const unnumberedFunctionalGroups = findDirectFunctionalGroups(molecule, atomIds, detectedGroups);
  if (!unnumberedFunctionalGroups) return null;
  const functionalHeteroAtomIds = new Set(
    unnumberedFunctionalGroups.map((group) => group.heteroAtomId),
  );
  const unnumberedSubstituents = findSimpleAlkylSubstituents(
    molecule,
    atomIds,
    functionalHeteroAtomIds,
  );
  if (!unnumberedSubstituents) return null;
  const primaryFunctionalGroup: FusedBicyclicFunctionalKind | undefined = unnumberedFunctionalGroups
    .some((group) => group.kind === "ketone")
    ? "ketone"
    : unnumberedFunctionalGroups.some((group) => group.kind === "alcohol")
      ? "alcohol"
      : undefined;
  const numberedCandidates = bicyclicNumberingCandidates(
    [left, right],
    [shared[0], shared[1]],
  ).flatMap((numbering) => {
    const unsaturation = multipleBondLocants(molecule, atomIds, numbering);
    if (!unsaturation) return [];
    const locants = new Map(numbering.map((atomId, index) => [atomId, index + 1]));
    const substituents = unnumberedSubstituents.map((substituent) => ({
      ...substituent,
      locant: locants.get(substituent.anchorId)!,
    }));
    const functionalGroups = unnumberedFunctionalGroups.map((group) => ({
      ...group,
      locant: locants.get(group.carbonId)!,
    }));
    const primaryLocants = functionalGroups
      .filter((group) => group.kind === primaryFunctionalGroup)
      .map((group) => group.locant)
      .sort((a, b) => a - b);
    const functionalPrefixes: LocantedPrefix[] = functionalGroups
      .filter((group) => group.kind !== primaryFunctionalGroup)
      .map((group) => ({ name: "hidroxi", locant: group.locant }));
    const prefixes: LocantedPrefix[] = [...substituents, ...functionalPrefixes];
    const prefixLocants = prefixes.map((prefix) => prefix.locant).sort((a, b) => a - b);
    const citationLocants = [...new Set(prefixes.map((prefix) => prefix.name))]
      .sort((a, b) => a.localeCompare(b, "es"))
      .flatMap((name) => prefixes
        .filter((prefix) => prefix.name === name)
        .map((prefix) => prefix.locant)
        .sort((a, b) => a - b));
    const multipleLocants = [
      ...unsaturation.doubleBondLocants,
      ...unsaturation.tripleBondLocants,
    ].sort((a, b) => a - b);
    return [{
      numbering,
      substituents,
      functionalGroups,
      primaryLocants,
      prefixes,
      prefixLocants,
      citationLocants,
      multipleLocants,
      ...unsaturation,
    }];
  }).sort((leftCandidate, rightCandidate) =>
    compareNumberLists(leftCandidate.primaryLocants, rightCandidate.primaryLocants)
    || compareNumberLists(leftCandidate.multipleLocants, rightCandidate.multipleLocants)
    || compareNumberLists(leftCandidate.doubleBondLocants, rightCandidate.doubleBondLocants)
    || compareNumberLists(leftCandidate.prefixLocants, rightCandidate.prefixLocants)
    || compareNumberLists(leftCandidate.citationLocants, rightCandidate.citationLocants),
  );
  const chosen = numberedCandidates[0];
  if (!chosen) return null;
  const descriptor = `biciclo[${paths[0]}.${paths[1]}.0]`;
  const hydrocarbonParentName = unsaturatedParentName(
    descriptor,
    total,
    parent,
    chosen.doubleBondLocants,
    chosen.tripleBondLocants,
  );
  if (!hydrocarbonParentName) return null;
  const parentName = functionalParentName(
    hydrocarbonParentName,
    primaryFunctionalGroup,
    chosen.primaryLocants,
  );
  if (!parentName) return null;
  const substituentPrefix = formatSubstituentPrefixes(chosen.prefixes);
  if (substituentPrefix === null) return null;
  return {
    bridgeheads: [shared[0], shared[1]],
    paths: [paths[0], paths[1], 0],
    atomIds,
    numbering: chosen.numbering,
    parentName,
    substituents: chosen.substituents,
    functionalGroups: chosen.functionalGroups,
    primaryFunctionalGroup,
    doubleBondLocants: chosen.doubleBondLocants,
    tripleBondLocants: chosen.tripleBondLocants,
    systematicName: substituentPrefix ? `${substituentPrefix}${parentName}` : parentName,
    traditionalName: !chosen.substituents.length
      && !chosen.functionalGroups.length
      && !chosen.doubleBondLocants.length
      && !chosen.tripleBondLocants.length
      && paths[0] === 4 && paths[1] === 4
      ? "decalina"
      : undefined,
  };
}

/** Conventional C1-C17 steroid numbering as a labelled, connectivity-only graph.
 * Ring membership disambiguates A/B/C/D while graph edges resolve each atom.
 * These reference numbers are chemical locants, never molecule atom IDs.
 */
const steroidNumberedRings = {
  A: [1, 2, 3, 4, 5, 10],
  B: [5, 6, 7, 8, 9, 10],
  C: [8, 9, 11, 12, 13, 14],
  D: [13, 14, 15, 16, 17],
} as const;

type SteroidRingLabel = keyof typeof steroidNumberedRings;
const steroidRingLabels: readonly SteroidRingLabel[] = ["A", "B", "C", "D"];

function numberedGonaneAtoms(
  molecule: FusedRingMolecule,
  ringsByLabel: SteroidLikeRingSystem["ringsByLabel"],
): number[] | null {
  const coreIds = new Set(steroidRingLabels.flatMap((label) => ringsByLabel[label]));
  if (coreIds.size !== 17) return null;

  const membership = (rings: Record<SteroidRingLabel, readonly number[]>, id: number) =>
    steroidRingLabels.filter((label) => rings[label].includes(id)).join("");

  const referenceMembership = new Map<number, string>();
  for (let locant = 1; locant <= 17; locant++) {
    referenceMembership.set(locant, membership(steroidNumberedRings, locant));
  }

  const actualAdjacency = new Map<number, Set<number>>(
    [...coreIds].map((id) => [id, new Set<number>()]),
  );
  const actualEdges = new Set<string>();
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  let actualCoreBondCount = 0;
  for (const [a, b] of molecule.bonds) {
    if (!coreIds.has(a) || !coreIds.has(b)) continue;
    actualCoreBondCount++;
    actualEdges.add(edgeKey(a, b));
    actualAdjacency.get(a)!.add(b);
    actualAdjacency.get(b)!.add(a);
  }

  const referenceEdges = new Set<string>();
  const referenceAdjacency = new Map<number, Set<number>>(
    Array.from({ length: 17 }, (_, index) => [index + 1, new Set<number>()]),
  );
  for (const label of steroidRingLabels) {
    const ring = steroidNumberedRings[label];
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      referenceEdges.add(edgeKey(a, b));
      referenceAdjacency.get(a)!.add(b);
      referenceAdjacency.get(b)!.add(a);
    }
  }
  // Extra chords, duplicated bonds or absent bonds disqualify this exact core.
  if (actualCoreBondCount !== referenceEdges.size || actualEdges.size !== referenceEdges.size) {
    return null;
  }

  const choices = new Map<number, number[]>();
  for (let locant = 1; locant <= 17; locant++) {
    const candidates = [...coreIds].filter((id) =>
      membership(ringsByLabel, id) === referenceMembership.get(locant)
      && actualAdjacency.get(id)!.size === referenceAdjacency.get(locant)!.size,
    );
    if (!candidates.length) return null;
    choices.set(locant, candidates);
  }

  const searchOrder = Array.from({ length: 17 }, (_, index) => index + 1)
    .sort((a, b) => choices.get(a)!.length - choices.get(b)!.length);
  const assignment = new Map<number, number>();
  const used = new Set<number>();
  let solution: number[] | null = null;
  let ambiguous = false;

  const search = (index: number): void => {
    if (ambiguous) return;
    if (index === searchOrder.length) {
      const candidate = Array.from({ length: 17 }, (_, locant) => assignment.get(locant + 1)!);
      if (solution) ambiguous = true;
      else solution = candidate;
      return;
    }
    const locant = searchOrder[index];
    for (const atomId of choices.get(locant)!) {
      if (used.has(atomId)) continue;
      let compatible = true;
      for (const [assignedLocant, assignedId] of assignment) {
        if (referenceAdjacency.get(locant)!.has(assignedLocant)
          !== actualAdjacency.get(atomId)!.has(assignedId)) {
          compatible = false;
          break;
        }
      }
      if (!compatible) continue;
      assignment.set(locant, atomId);
      used.add(atomId);
      search(index + 1);
      used.delete(atomId);
      assignment.delete(locant);
    }
  };
  search(0);
  return ambiguous ? null : solution;
}

/** Finds only terminal single-bonded carbon substituents at the conventional
 * C13 (C18) and C10 (C19) positions. Other substituents are not interpreted.
 */
function gonaneAngularMethyls(
  molecule: FusedRingMolecule,
  numbering: readonly number[],
): { C18: number; C19: number } | null {
  const core = new Set(numbering);
  const findAttachedMethyl = (locant: 10 | 13): number | null => {
    const anchor = numbering[locant - 1];
    const candidates = molecule.bonds.flatMap(([left, right, order = 1]) => {
      if (order !== 1 || (left !== anchor && right !== anchor)) return [];
      const externalId = left === anchor ? right : left;
      if (core.has(externalId)) return [];
      const externalAtom = molecule.atoms.find((atom) => atom.id === externalId);
      if (!externalAtom || (externalAtom.element ?? "C") !== "C") return [];
      const contacts = molecule.bonds.filter(([a, b]) => a === externalId || b === externalId);
      return contacts.length === 1 ? [externalId] : [];
    });
    return candidates.length === 1 ? candidates[0] : null;
  };
  const C18 = findAttachedMethyl(13);
  const C19 = findAttachedMethyl(10);
  return C18 !== null && C19 !== null && C18 !== C19 ? { C18, C19 } : null;
}

/** Only the precisely supported C19H28O2 constitutional profile is named:
 * C10/C13 angular methyls, C4=C5, C3=O and C17-OH. This intentionally
 * declines other steroid derivatives rather than guessing their names.
 */
function gonaneTestosteroneConstitution(
  molecule: FusedRingMolecule,
  numbering: readonly number[],
  methyls: { C18: number; C19: number },
): boolean {
  const core = new Set(numbering);
  const externalAtoms = molecule.atoms.filter((atom) => !core.has(atom.id));
  if (externalAtoms.length !== 4 || molecule.atoms.length !== 21) return false;
  const expectedExternalIds = new Set([methyls.C18, methyls.C19]);
  const oxygenAtoms = externalAtoms.filter((atom) => atom.element === "O");
  if (oxygenAtoms.length !== 2 || externalAtoms.some((atom) => (
    !expectedExternalIds.has(atom.id) && atom.element !== "O"
  ))) return false;

  const bondMatches = (left: number, right: number, expectedOrder: number) => (
    molecule.bonds.filter(([a, b, order = 1]) => (
      ((a === left && b === right) || (a === right && b === left))
      && order === expectedOrder
    )).length === 1
  );
  const c3 = numbering[2];
  const c17 = numbering[16];
  const carbonylOxygens = oxygenAtoms.filter((atom) => bondMatches(c3, atom.id, 2));
  const hydroxylOxygens = oxygenAtoms.filter((atom) => bondMatches(c17, atom.id, 1));
  if (carbonylOxygens.length !== 1 || hydroxylOxygens.length !== 1
    || carbonylOxygens[0].id === hydroxylOxygens[0].id) return false;

  // The only non-single core bond must be C4=C5. All four external atoms
  // must have precisely their expected attachment and no external crosslinks.
  const exceptionalCoreBonds = molecule.bonds.filter(([a, b, order = 1]) => (
    core.has(a) && core.has(b) && order !== 1
  ));
  if (exceptionalCoreBonds.length !== 1
    || !bondMatches(numbering[3], numbering[4], 2)) return false;
  const externalBonds = molecule.bonds.filter(([a, b]) => !core.has(a) || !core.has(b));
  return externalBonds.length === 4
    && bondMatches(numbering[9], methyls.C19, 1)
    && bondMatches(numbering[12], methyls.C18, 1);
}

/**
 * Finds the 17-carbon connected 6-6-6-5 nucleus. Only a unique match to
 * the labelled gonane graph receives conventional C1-C17 numbering.
 * Naming, when supported, is constitutional only; stereochemistry is not inferred.
 */
export function getSteroidLike6565System(molecule: FusedRingMolecule): SteroidLikeRingSystem | null {
  const rings = molecule.rings ?? [];
  if (
    rings.length !== 4
    || !rings.every((ring) => isSupportedCarbocycle(molecule, ring))
    || !hasValidCarbonValence(molecule)
  ) return null;
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

if (
  fusedEdges !== 3 ||
  visited.size !== 4 ||
  degrees.join(",") !== "1,1,2,2" ||
  atomIds.length !== 17
) {
  return null;
}

// D: anillo terminal de cinco miembros.
const dIndex = rings.findIndex(
  (ring) => ring.atomIds.length === 5
);

if (dIndex < 0 || linked[dIndex].size !== 1) {
  return null;
}

// C: hexágono directamente fusionado con D.
const cIndex = [...linked[dIndex]][0];

if (
  rings[cIndex].atomIds.length !== 6 ||
  linked[cIndex].size !== 2
) {
  return null;
}

// B: hexágono fusionado con C, distinto de D.
const bIndex = [...linked[cIndex]].find(
  (index) => index !== dIndex
);

if (
  bIndex === undefined ||
  rings[bIndex].atomIds.length !== 6 ||
  linked[bIndex].size !== 2
) {
  return null;
}

// A: hexágono terminal fusionado con B.
const aIndex = [...linked[bIndex]].find(
  (index) => index !== cIndex
);

if (
  aIndex === undefined ||
  rings[aIndex].atomIds.length !== 6 ||
  linked[aIndex].size !== 1
) {
  return null;
}

// Carbonos compartidos entre los anillos A y B.
const abShared = rings[aIndex].atomIds.filter(
  (id) => rings[bIndex].atomIds.includes(id)
);

// Carbonos compartidos entre los anillos B y C.
const bcShared = rings[bIndex].atomIds.filter(
  (id) => rings[cIndex].atomIds.includes(id)
);

// Carbonos compartidos entre los anillos C y D.
const cdShared = rings[cIndex].atomIds.filter(
  (id) => rings[dIndex].atomIds.includes(id)
);

// Cada unión debe compartir exactamente dos carbonos.
if (
  abShared.length !== 2 ||
  bcShared.length !== 2 ||
  cdShared.length !== 2
) {
  return null;
}

// Encuentra la posición de un enlace compartido
// dentro de la secuencia de átomos de un anillo.
const sharedEdgeIndex = (
  ring: FusedRing,
  shared: readonly number[],
): number => {
  return ring.atomIds.findIndex((id, index) => {
    const next = ring.atomIds[
      (index + 1) % ring.atomIds.length
    ];

    return (
      (id === shared[0] && next === shared[1]) ||
      (id === shared[1] && next === shared[0])
    );
  });
};

// Comprueba la separación entre dos enlaces de fusión
// dentro de un hexágono.
const hasAngularJunctions = (
  ring: FusedRing,
  first: readonly number[],
  second: readonly number[],
): boolean => {
  const firstIndex = sharedEdgeIndex(ring, first);
  const secondIndex = sharedEdgeIndex(ring, second);

  if (firstIndex < 0 || secondIndex < 0) {
    return false;
  }

  const distance = Math.abs(firstIndex - secondIndex);

  return Math.min(
    distance,
    ring.atomIds.length - distance
  ) === 2;
};

// En nuestra referencia del gonano, las fusiones
// de los anillos B y C presentan esta separación.
const isGonaneTopology =
  hasAngularJunctions(
    rings[bIndex],
    abShared,
    bcShared
  ) &&
  hasAngularJunctions(
    rings[cIndex],
    bcShared,
    cdShared
  );

const ringsByLabel = {
  A: [...rings[aIndex].atomIds],
  B: [...rings[bIndex].atomIds],
  C: [...rings[cIndex].atomIds],
  D: [...rings[dIndex].atomIds],
};
const numbering = isGonaneTopology ? numberedGonaneAtoms(molecule, ringsByLabel) : null;
const angularMethyls = numbering ? gonaneAngularMethyls(molecule, numbering) : null;
const hasTestosteroneConstitution = numbering && angularMethyls
  ? gonaneTestosteroneConstitution(molecule, numbering, angularMethyls)
  : false;

return {
  ringSizes: [6, 6, 6, 5],
  atomIds,
  isGonaneTopology: numbering !== null,
  ...(numbering ? { numbering } : {}),
  ...(angularMethyls ? { angularMethyls } : {}),
  ...(hasTestosteroneConstitution ? {
    constitutionNameEs: "17-hidroxiandrost-4-en-3-ona",
    constitutionNameEn: "17-hydroxyandrost-4-en-3-one",
  } : {}),

  ringsByLabel,

  junctions: {
    AB: [abShared[0], abShared[1]],
    BC: [bcShared[0], bcShared[1]],
    CD: [cdShared[0], cdShared[1]],
  },
};
}
