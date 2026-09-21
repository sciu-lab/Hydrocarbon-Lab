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

export function sanitizeTetrahedralStereochemistry<T extends GeneratedMolecule>(source: T): T {
  const validIds = new Set(getTetrahedralStereoCenters(source).map((center) => center.atomId));
  let changed = false;
  const atoms = source.atoms.map((atom) => {
    if (!atom.tetrahedralParity || validIds.has(atom.id)) return atom;
    const rest: GeneratedAtom = { ...atom };
    delete rest.tetrahedralParity;
    changed = true;
    return rest;
  });
  return changed ? { ...source, atoms } : source;
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

export function getTetrahedralStereoBonds(source: GeneratedMolecule): TetrahedralStereoBond[] {
  const graph = buildOpenChemLibStereoGraph(source);
  const configured = getTetrahedralStereoCenters(source);
  if (!configured.length) return [];
  graph.molecule.setStereoBondsFromParity();

  return configured.flatMap((center) => {
    const atomIndex = graph.atomIdToIndex.get(center.atomId);
    if (atomIndex === undefined) return [];
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
