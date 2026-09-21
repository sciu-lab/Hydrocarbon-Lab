import { Molecule as OCLMolecule } from "openchemlib";
import type { GeneratedAtom, GeneratedMolecule } from "./name-to-molecule.ts";

export type TetrahedralConfiguration = NonNullable<GeneratedAtom["tetrahedralParity"]>;

export type TetrahedralStereoCenter = {
  atomId: number;
  configuration: TetrahedralConfiguration;
};

export type TetrahedralStereoBond = TetrahedralStereoCenter & {
  neighborAtomId: number;
  style: "wedge" | "hash";
};

export type MainChainTetrahedralDescriptor = TetrahedralStereoCenter & {
  locant: number;
};

export type TetrahedralAssignmentSummary = {
  detected: number;
  assigned: number;
  complete: boolean;
};

// SVG coordinates are scaled by the canvas viewBox. These values yield an
// approximately 30–32 px visible badge and a 36–40 px pointer target in the
// real editor viewport while keeping the marker clear of its carrier bond.
export const TETRAHEDRAL_BADGE_RADIUS = 24;
export const TETRAHEDRAL_BADGE_HIT_RADIUS = 30;
export const TETRAHEDRAL_BADGE_DISTANCE = 48;

export type TetrahedralBadgeExtent = { x: number; y: number; width: number; height: number };

const atomicNumberByElement: Record<NonNullable<GeneratedAtom["element"]>, number> = {
  C: 6,
  N: 7,
  O: 8,
  S: 16,
  F: 9,
  Cl: 17,
  Br: 35,
  I: 53,
};

type OpenChemLibStereoGraph = {
  molecule: OCLMolecule;
  atomIdToIndex: Map<number, number>;
  atomIndexToId: Map<number, number>;
};

function cipConfiguration(molecule: OCLMolecule, atomIndex: number): TetrahedralConfiguration | null {
  const parity = molecule.getAtomCIPParity(atomIndex);
  if (parity === OCLMolecule.cAtomCIPParityRorM) return "R";
  if (parity === OCLMolecule.cAtomCIPParitySorP) return "S";
  return null;
}

/**
 * Builds the OpenChemLib graph used by import, export and rendering. Stored R/S
 * is converted to OCL atom parity only after OCL has established real CIP
 * priorities; coordinates never define the configuration.
 */
export function buildOpenChemLibStereoGraph(
  source: GeneratedMolecule,
  applyStoredParity = true,
): OpenChemLibStereoGraph {
  const molecule = new OCLMolecule(
    Math.max(64, source.atoms.length + 16),
    Math.max(64, source.bonds.length + 16),
  );
  const atomIdToIndex = new Map<number, number>();
  const atomIndexToId = new Map<number, number>();
  let hasStoredParity = false;
  const rawParityByAtomIndex = new Map<number, number>();

  for (const atom of source.atoms) {
    const atomIndex = molecule.addAtom(atomicNumberByElement[atom.element ?? "C"]);
    atomIdToIndex.set(atom.id, atomIndex);
    atomIndexToId.set(atomIndex, atom.id);
    if (atom.charge) molecule.setAtomCharge(atomIndex, atom.charge);
  }

  for (const [leftId, rightId, order = 1] of source.bonds) {
    const left = atomIdToIndex.get(leftId);
    const right = atomIdToIndex.get(rightId);
    if (left === undefined || right === undefined) continue;
    const bondIndex = molecule.addBond(left, right);
    molecule.setBondOrder(bondIndex, order);
  }

  molecule.setFragment(false);

  if (applyStoredParity) {
    const requested = source.atoms.flatMap((atom) => {
      const atomIndex = atomIdToIndex.get(atom.id);
      return atom.tetrahedralParity && atomIndex !== undefined
        ? [{ atomIndex, configuration: atom.tetrahedralParity }]
        : [];
    });

    for (const { atomIndex } of requested) {
      molecule.setAtomParity(atomIndex, OCLMolecule.cAtomParity1, false);
    }
    if (requested.length) {
      hasStoredParity = true;
      molecule.setParitiesValid(0);
      molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
      for (const { atomIndex, configuration } of requested) {
        if (cipConfiguration(molecule, atomIndex) !== configuration) {
          molecule.setAtomParity(atomIndex, OCLMolecule.cAtomParity2, false);
        }
        rawParityByAtomIndex.set(atomIndex, molecule.getAtomParity(atomIndex));
      }
      molecule.setParitiesValid(0);
    }
  } else {
    molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
  }

  for (const atom of source.atoms) {
    const atomIndex = atomIdToIndex.get(atom.id)!;
    molecule.setAtomX(atomIndex, atom.x);
    molecule.setAtomY(atomIndex, -atom.y);
  }
  if (hasStoredParity) {
    // First retain any E/Z parity encoded by the existing 2D coordinates,
    // then restore the explicit tetrahedral parity. Neither overwrites the other.
    molecule.ensureHelperArrays(OCLMolecule.cHelperParities);
    for (const [atomIndex, parity] of rawParityByAtomIndex) {
      molecule.setAtomParity(atomIndex, parity, false);
    }
    molecule.setParitiesValid(0);
  }

  return { molecule, atomIdToIndex, atomIndexToId };
}

export function getTetrahedralStereoCenters(source: GeneratedMolecule): TetrahedralStereoCenter[] {
  const graph = buildOpenChemLibStereoGraph(source, false);
  return source.atoms.flatMap((atom) => {
    const atomIndex = graph.atomIdToIndex.get(atom.id);
    return atom.tetrahedralParity && atomIndex !== undefined && graph.molecule.isAtomStereoCenter(atomIndex)
      ? [{ atomId: atom.id, configuration: atom.tetrahedralParity }]
      : [];
  });
}

export function getPotentialTetrahedralStereoCenterIds(source: GeneratedMolecule): number[] {
  const graph = buildOpenChemLibStereoGraph(source, false);
  return source.atoms.flatMap((atom) => {
    const atomIndex = graph.atomIdToIndex.get(atom.id);
    return atomIndex !== undefined && graph.molecule.isAtomStereoCenter(atomIndex) ? [atom.id] : [];
  });
}

export function getTetrahedralAssignmentSummary(
  source: GeneratedMolecule,
): TetrahedralAssignmentSummary {
  const detected = getPotentialTetrahedralStereoCenterIds(source).length;
  const assigned = getTetrahedralStereoCenters(source).length;
  return { detected, assigned, complete: detected > 0 && assigned === detected };
}

export function getTetrahedralCandidatesForBond(
  source: GeneratedMolecule,
  leftAtomId: number,
  rightAtomId: number,
) {
  const bond = source.bonds.find(([left, right]) =>
    (left === leftAtomId && right === rightAtomId) || (left === rightAtomId && right === leftAtomId),
  );
  if (!bond || (bond[2] ?? 1) !== 1) return [];
  const potential = new Set(getPotentialTetrahedralStereoCenterIds(source));
  return [leftAtomId, rightAtomId].filter((atomId) => potential.has(atomId));
}

export function sanitizeTetrahedralStereochemistry<T extends GeneratedMolecule>(source: T): T {
  const validIds = new Set(getTetrahedralStereoCenters(source).map((center) => center.atomId));
  let changed = false;
  const atoms = source.atoms.map((atom) => {
    const carrierValid = atom.tetrahedralBondTo === undefined || source.bonds.some(
      ([left, right, order = 1]) => order === 1 && (
        (left === atom.id && right === atom.tetrahedralBondTo)
        || (right === atom.id && left === atom.tetrahedralBondTo)
      ),
    );
    if (!atom.tetrahedralParity && atom.tetrahedralBondTo === undefined) return atom;
    if (atom.tetrahedralParity && validIds.has(atom.id) && carrierValid) return atom;
    const rest: GeneratedAtom = { ...atom };
    if (!atom.tetrahedralParity || !validIds.has(atom.id)) delete rest.tetrahedralParity;
    delete rest.tetrahedralBondTo;
    changed = true;
    return rest;
  });
  return changed ? { ...source, atoms } : source;
}

export function setTetrahedralConfiguration<T extends GeneratedMolecule>(
  source: T,
  atomId: number,
  configuration: TetrahedralConfiguration,
  carrierNeighborAtomId?: number,
): { ok: true; molecule: T; configuration: TetrahedralConfiguration } | { ok: false; error: string } {
  const potential = new Set(getPotentialTetrahedralStereoCenterIds(source));
  if (!potential.has(atomId)) {
    return { ok: false, error: "El átomo no tiene cuatro sustituyentes CIP diferentes." };
  }
  if (carrierNeighborAtomId !== undefined && !source.bonds.some(
    ([left, right, order = 1]) => order === 1 && (
      (left === atomId && right === carrierNeighborAtomId)
      || (right === atomId && left === carrierNeighborAtomId)
    ),
  )) {
    return { ok: false, error: "El enlace elegido no puede portar el wedge/hash de este centro." };
  }
  return {
    ok: true,
    configuration,
    molecule: {
      ...source,
      atoms: source.atoms.map((atom) => {
        if (atom.id === atomId) {
          return {
            ...atom,
            tetrahedralParity: configuration,
            ...(carrierNeighborAtomId === undefined ? {} : { tetrahedralBondTo: carrierNeighborAtomId }),
          };
        }
        if (carrierNeighborAtomId === atom.id && atom.tetrahedralBondTo === atomId) {
          const copy: GeneratedAtom = { ...atom };
          delete copy.tetrahedralBondTo;
          return copy;
        }
        return { ...atom };
      }),
    },
  };
}

export function clearTetrahedralConfiguration<T extends GeneratedMolecule>(
  source: T,
  atomId: number,
): T {
  return {
    ...source,
    atoms: source.atoms.map((atom) => {
      if (atom.id !== atomId) return { ...atom };
      const copy: GeneratedAtom = { ...atom };
      delete copy.tetrahedralParity;
      delete copy.tetrahedralBondTo;
      return copy;
    }),
  };
}

export function toggleTetrahedralConfiguration<T extends GeneratedMolecule>(
  source: T,
  atomId: number,
): { ok: true; molecule: T; configuration: TetrahedralConfiguration } | { ok: false; error: string } {
  const graph = buildOpenChemLibStereoGraph(source, false);
  const atomIndex = graph.atomIdToIndex.get(atomId);
  const atom = source.atoms.find((candidate) => candidate.id === atomId);
  if (!atom?.tetrahedralParity || atomIndex === undefined || !graph.molecule.isAtomStereoCenter(atomIndex)) {
    return { ok: false, error: "El átomo no es un centro tetraédrico configurado." };
  }
  const configuration = atom.tetrahedralParity === "R" ? "S" : "R";
  return {
    ok: true,
    molecule: {
      ...source,
      atoms: source.atoms.map((candidate) => candidate.id === atomId
        ? { ...candidate, tetrahedralParity: configuration }
        : { ...candidate }),
    },
    configuration,
  };
}

function preferredStereoBondStyle(
  source: GeneratedMolecule,
  atomId: number,
  neighborAtomId: number,
  configuration: TetrahedralConfiguration,
): TetrahedralStereoBond["style"] | null {
  for (const [bondType, style] of [
    [OCLMolecule.cBondTypeUp, "wedge"],
    [OCLMolecule.cBondTypeDown, "hash"],
  ] as const) {
    const graph = buildOpenChemLibStereoGraph(source, false);
    const atomIndex = graph.atomIdToIndex.get(atomId);
    const neighborIndex = graph.atomIdToIndex.get(neighborAtomId);
    if (atomIndex === undefined || neighborIndex === undefined) return null;
    let selectedBond = -1;
    for (let bondIndex = 0; bondIndex < graph.molecule.getAllBonds(); bondIndex += 1) {
      const first = graph.molecule.getBondAtom(0, bondIndex);
      const second = graph.molecule.getBondAtom(1, bondIndex);
      if ((first === atomIndex && second === neighborIndex)
        || (first === neighborIndex && second === atomIndex)) {
        selectedBond = bondIndex;
        break;
      }
    }
    if (selectedBond < 0 || graph.molecule.getBondOrder(selectedBond) !== 1) return null;
    graph.molecule.setBondAtom(0, selectedBond, atomIndex);
    graph.molecule.setBondAtom(1, selectedBond, neighborIndex);
    graph.molecule.setBondType(selectedBond, bondType);
    graph.molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
    if (cipConfiguration(graph.molecule, atomIndex) === configuration) return style;
  }
  return null;
}

export function getTetrahedralBadgePosition(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  distance = TETRAHEDRAL_BADGE_DISTANCE,
) {
  const deltaX = neighbor.x - center.x;
  const deltaY = neighbor.y - center.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  return {
    x: center.x + deltaY / length * distance,
    y: center.y - deltaX / length * distance,
  };
}

function badgeIntersectsExtent(
  point: { x: number; y: number },
  radius: number,
  extent: TetrahedralBadgeExtent,
) {
  const closestX = Math.max(extent.x, Math.min(point.x, extent.x + extent.width));
  const closestY = Math.max(extent.y, Math.min(point.y, extent.y + extent.height));
  return Math.hypot(point.x - closestX, point.y - closestY) < radius + 4;
}

/**
 * Keeps the visual R/S labels readable without changing the carrier bond or
 * the stored atom configuration. Candidate directions are relative to the
 * carrier vector, so the result survives rotation and reflection.
 */
export function layoutTetrahedralBadgePositions(
  descriptors: readonly TetrahedralStereoBond[],
  positions: ReadonlyMap<number, { x: number; y: number }>,
  scale = 1,
  obstacles: readonly TetrahedralBadgeExtent[] = [],
) {
  const placed = new Map<number, { x: number; y: number }>();
  const radius = TETRAHEDRAL_BADGE_RADIUS * scale;
  const minimumSeparation = radius * 2 + 7 * scale;
  const angleOffsets = [0, Math.PI, Math.PI / 3, -Math.PI / 3, Math.PI * 2 / 3, -Math.PI * 2 / 3];
  const distanceFactors = [1, 1.4, 1.8];

  for (const descriptor of descriptors) {
    const center = positions.get(descriptor.atomId);
    const neighbor = positions.get(descriptor.neighborAtomId);
    if (!center || !neighbor) continue;
    const carrierAngle = Math.atan2(neighbor.y - center.y, neighbor.x - center.x);
    const preferredAngle = carrierAngle - Math.PI / 2;
    const candidates = distanceFactors.flatMap((factor) => angleOffsets.map((offset, angleIndex) => {
      const distance = TETRAHEDRAL_BADGE_DISTANCE * scale * factor;
      const angle = preferredAngle + offset;
      return {
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        preference: (factor - 1) * 20 + angleIndex * 2,
      };
    }));
    const score = (candidate: { x: number; y: number; preference: number }) => {
      const obstaclePenalty = obstacles.reduce(
        (sum, obstacle) => sum + (badgeIntersectsExtent(candidate, radius, obstacle) ? 100_000 : 0),
        0,
      );
      const badgePenalty = [...placed.values()].reduce((sum, prior) => {
        const separation = Math.hypot(candidate.x - prior.x, candidate.y - prior.y);
        return sum + (separation < minimumSeparation
          ? 100_000 + (minimumSeparation - separation) * 1_000
          : 0);
      }, 0);
      return obstaclePenalty + badgePenalty + candidate.preference;
    };
    candidates.sort((left, right) => score(left) - score(right));
    placed.set(descriptor.atomId, candidates[0]);
  }
  return placed;
}

export function getTetrahedralStereoBonds(source: GeneratedMolecule): TetrahedralStereoBond[] {
  const graph = buildOpenChemLibStereoGraph(source);
  const configured = getTetrahedralStereoCenters(source);
  if (!configured.length) return [];
  graph.molecule.setStereoBondsFromParity();

  return configured.flatMap((center) => {
    const atomIndex = graph.atomIdToIndex.get(center.atomId);
    if (atomIndex === undefined) return [];
    const sourceAtom = source.atoms.find((atom) => atom.id === center.atomId);
    if (sourceAtom?.tetrahedralBondTo !== undefined) {
      const style = preferredStereoBondStyle(
        source,
        center.atomId,
        sourceAtom.tetrahedralBondTo,
        center.configuration,
      );
      if (style) {
        return [{
          ...center,
          neighborAtomId: sourceAtom.tetrahedralBondTo,
          style,
        }];
      }
    }
    for (let bondIndex = 0; bondIndex < graph.molecule.getAllBonds(); bondIndex += 1) {
      const bondType = graph.molecule.getBondType(bondIndex);
      if (bondType !== OCLMolecule.cBondTypeUp && bondType !== OCLMolecule.cBondTypeDown) continue;
      const first = graph.molecule.getBondAtom(0, bondIndex);
      const second = graph.molecule.getBondAtom(1, bondIndex);
      if (first !== atomIndex && second !== atomIndex) continue;
      const neighborAtomId = graph.atomIndexToId.get(first === atomIndex ? second : first);
      if (neighborAtomId === undefined) continue;
      return [{
        ...center,
        neighborAtomId,
        style: bondType === OCLMolecule.cBondTypeUp ? "wedge" as const : "hash" as const,
      }];
    }
    return [];
  });
}

export function getMainChainTetrahedralDescriptors(
  source: GeneratedMolecule,
  mainChain: readonly number[],
): MainChainTetrahedralDescriptor[] {
  const locantByAtomId = new Map(mainChain.map((atomId, index) => [atomId, index + 1]));
  return getTetrahedralStereoCenters(source)
    .flatMap((center) => {
      const locant = locantByAtomId.get(center.atomId);
      return locant === undefined ? [] : [{ ...center, locant }];
    })
    .sort((left, right) => left.locant - right.locant);
}

export function tetrahedralConfigurationFromOpenChemLib(
  molecule: OCLMolecule,
  atomIndex: number,
): TetrahedralConfiguration | null {
  molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
  return cipConfiguration(molecule, atomIndex);
}
