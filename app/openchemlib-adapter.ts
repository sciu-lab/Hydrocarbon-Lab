import { Molecule as OCLMolecule, SmilesParser } from "openchemlib";
import type {
  GeneratedAtom,
  GeneratedBond,
  GeneratedMolecule,
  GeneratedRing,
} from "./name-to-molecule";

type SupportedElement = NonNullable<GeneratedAtom["element"]>;

export type OpenChemLibBuildResult =
  | { ok: true; molecule: GeneratedMolecule }
  | { ok: false; error: string };

export type OpenChemLibSmilesExportResult =
  | { ok: true; smiles: string }
  | { ok: false; error: string };


const atomicNumberByElement: Record<SupportedElement, number> = {
  C: 6,
  N: 7,
  O: 8,
  S: 16,
  F: 9,
  Cl: 17,
  Br: 35,
  I: 53,
};

/**
 * Converts the editable SciU molecular graph into an isomeric SMILES string.
 * OpenChemLib derives implicit hydrogens from the editable graph. If stereo
 * parity is present in the OpenChemLib molecule, toIsomericSmiles preserves it.
 */
export function moleculeToSmiles(molecule: GeneratedMolecule): OpenChemLibSmilesExportResult {
  if (!molecule.atoms.length) {
    return { ok: false, error: "No hay una molécula para exportar como SMILES." };
  }

  try {
    const oclMolecule = new OCLMolecule(
      Math.max(64, molecule.atoms.length + 16),
      Math.max(64, molecule.bonds.length + 16),
    );
    const atomIdToIndex = new Map<number, number>();

    for (const atom of molecule.atoms) {
      const element = atom.element ?? "C";
      const atomicNumber = atomicNumberByElement[element];
      if (!atomicNumber) {
        return { ok: false, error: `El elemento ${element} no puede exportarse como SMILES desde este canvas.` };
      }
      const atomIndex = oclMolecule.addAtom(atomicNumber);
      atomIdToIndex.set(atom.id, atomIndex);
      // The canvas uses a downward-positive Y axis. Mirroring Y keeps the
      // chemical drawing orientation conventional without changing E/Z.
      oclMolecule.setAtomX(atomIndex, atom.x);
      oclMolecule.setAtomY(atomIndex, -atom.y);
      if (atom.charge) oclMolecule.setAtomCharge(atomIndex, atom.charge);
    }

    for (const [leftId, rightId, order = 1] of molecule.bonds) {
      const left = atomIdToIndex.get(leftId);
      const right = atomIdToIndex.get(rightId);
      if (left === undefined || right === undefined) {
        return { ok: false, error: "La estructura contiene un enlace con átomos inexistentes." };
      }
      const bondIndex = oclMolecule.addBond(left, right);
      oclMolecule.setBondOrder(bondIndex, order);
    }

    oclMolecule.setFragment(false);
    oclMolecule.ensureHelperArrays(OCLMolecule.cHelperParities);
    oclMolecule.validate();
    const smiles = oclMolecule.toIsomericSmiles().trim();
    if (!smiles) {
      return { ok: false, error: "OpenChemLib no pudo generar el SMILES de esta estructura." };
    }
    return { ok: true, smiles };
  } catch {
    return { ok: false, error: "OpenChemLib no pudo generar el SMILES de esta estructura." };
  }
}

const supportedElements = new Map<number, SupportedElement>([
  [6, "C"],
  [7, "N"],
  [8, "O"],
  [16, "S"],
  [9, "F"],
  [17, "Cl"],
  [35, "Br"],
  [53, "I"],
]);

function connectedAtomCount(atomIds: number[], bonds: GeneratedBond[]) {
  if (!atomIds.length) return 0;
  const adjacency = new Map(atomIds.map((id) => [id, [] as number[]]));
  bonds.forEach(([left, right]) => {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  });
  const seen = new Set<number>();
  const pending = [atomIds[0]];
  while (pending.length) {
    const atomId = pending.pop()!;
    if (seen.has(atomId)) continue;
    seen.add(atomId);
    pending.push(...(adjacency.get(atomId) ?? []));
  }
  return seen.size;
}

export function moleculeFromSmiles(smiles: string): OpenChemLibBuildResult {
  let oclMolecule;
  try {
    const parser = new SmilesParser();
    parser.setRandomSeed(20260814);
    oclMolecule = parser.parseMolecule(smiles);
  } catch {
    return { ok: false, error: "OpenChemLib no pudo convertir la estructura recibida." };
  }

  if (oclMolecule.getAllAtoms() > 120 || oclMolecule.getAllBonds() > 150) {
    return {
      ok: false,
      error: "La molécula es demasiado grande para editarla con claridad en este canvas.",
    };
  }

  const bondedNeighbors = (atomIndex: number) => {
    const neighbors: Array<{ atomIndex: number; order: number }> = [];
    for (let bondIndex = 0; bondIndex < oclMolecule.getAllBonds(); bondIndex += 1) {
      const left = oclMolecule.getBondAtom(0, bondIndex);
      const right = oclMolecule.getBondAtom(1, bondIndex);
      if (left === atomIndex) neighbors.push({ atomIndex: right, order: oclMolecule.getBondOrder(bondIndex) });
      if (right === atomIndex) neighbors.push({ atomIndex: left, order: oclMolecule.getBondOrder(bondIndex) });
    }
    return neighbors;
  };

  const isNitroNitrogen = (atomIndex: number) => {
    if (oclMolecule.getAtomicNo(atomIndex) !== 7 || oclMolecule.getAtomCharge(atomIndex) !== 1) return false;
    const neighbors = bondedNeighbors(atomIndex);
    const oxygenNeighbors = neighbors.filter(({ atomIndex: neighborIndex }) => oclMolecule.getAtomicNo(neighborIndex) === 8);
    const carbonNeighbors = neighbors.filter(({ atomIndex: neighborIndex }) => oclMolecule.getAtomicNo(neighborIndex) === 6);
    return carbonNeighbors.length >= 1
      && oxygenNeighbors.length === 2
      && oxygenNeighbors.some(({ order }) => order === 2)
      && oxygenNeighbors.some(({ atomIndex: neighborIndex, order }) => order === 1 && oclMolecule.getAtomCharge(neighborIndex) === -1);
  };

  const isSupportedFormalCharge = (atomIndex: number) => {
    const charge = oclMolecule.getAtomCharge(atomIndex);
    if (charge === 0) return true;
    if (charge === 1) return isNitroNitrogen(atomIndex);
    if (charge === -1 && oclMolecule.getAtomicNo(atomIndex) === 8) {
      return bondedNeighbors(atomIndex).some(({ atomIndex: neighborIndex, order }) =>
        order === 1 && isNitroNitrogen(neighborIndex),
      );
    }
    return false;
  };

  const atomIndexToId = new Map<number, number>();
  const rawAtoms: Array<GeneratedAtom & { rawX: number; rawY: number }> = [];
  for (let atomIndex = 0; atomIndex < oclMolecule.getAllAtoms(); atomIndex += 1) {
    const atomicNumber = oclMolecule.getAtomicNo(atomIndex);
    if (atomicNumber === 1) continue;
    const element = supportedElements.get(atomicNumber);
    if (!element) {
      return {
        ok: false,
        error: `La estructura contiene ${oclMolecule.getAtomLabel(atomIndex)}. Por ahora el laboratorio admite C, O, N, S y halógenos.`,
      };
    }
    if (!isSupportedFormalCharge(atomIndex)) {
      return {
        ok: false,
        error: "La estructura contiene cargas formales que este canvas todavía no representa fuera de grupos nitro.",
      };
    }
    const id = rawAtoms.length + 1;
    atomIndexToId.set(atomIndex, id);
    rawAtoms.push({
      id,
      x: 0,
      y: 0,
      element,
      ...(oclMolecule.getAtomCharge(atomIndex) ? { charge: oclMolecule.getAtomCharge(atomIndex) } : {}),
      rawX: oclMolecule.getAtomX(atomIndex),
      rawY: oclMolecule.getAtomY(atomIndex),
    });
  }

  if (!rawAtoms.some((atom) => atom.element === "C")) {
    return { ok: false, error: "El laboratorio necesita una estructura orgánica con carbono." };
  }

  const bonds: GeneratedBond[] = [];
  for (let bondIndex = 0; bondIndex < oclMolecule.getAllBonds(); bondIndex += 1) {
    const left = atomIndexToId.get(oclMolecule.getBondAtom(0, bondIndex));
    const right = atomIndexToId.get(oclMolecule.getBondAtom(1, bondIndex));
    if (!left || !right) continue;
    const order = oclMolecule.getBondOrder(bondIndex);
    if (!(order === 1 || order === 2 || order === 3)) {
      return { ok: false, error: "La estructura contiene un tipo de enlace aún no editable." };
    }
    bonds.push([left, right, order]);
  }

  const atomIds = rawAtoms.map((atom) => atom.id);
  if (connectedAtomCount(atomIds, bonds) !== atomIds.length) {
    return {
      ok: false,
      error: "El nombre describe varias especies separadas; construye una molécula orgánica a la vez.",
    };
  }

  const centerX = rawAtoms.reduce((sum, atom) => sum + atom.rawX, 0) / rawAtoms.length;
  const centerY = rawAtoms.reduce((sum, atom) => sum + atom.rawY, 0) / rawAtoms.length;
  const bondLengths = bonds.map(([leftId, rightId]) => {
    const left = rawAtoms[leftId - 1];
    const right = rawAtoms[rightId - 1];
    return Math.hypot(left.rawX - right.rawX, left.rawY - right.rawY);
  }).filter((length) => length > 0.001);
  const averageBondLength = bondLengths.length
    ? bondLengths.reduce((sum, length) => sum + length, 0) / bondLengths.length
    : 1;
  const atoms: GeneratedAtom[] = rawAtoms.map(({ rawX, rawY, ...atom }) => ({
    ...atom,
    x: (rawX - centerX) / averageBondLength,
    y: (rawY - centerY) / averageBondLength,
  }));

  const ringSet = oclMolecule.getRingSet();
  const rings: GeneratedRing[] = [];
  for (let ringIndex = 0; ringIndex < ringSet.getSize(); ringIndex += 1) {
    const ringAtomIds = Array.from(ringSet.getRingAtoms(ringIndex), (atomIndex) =>
      atomIndexToId.get(atomIndex),
    ).filter((id): id is number => typeof id === "number");
    if (ringAtomIds.length < 3) continue;
    rings.push({
      id: rings.length + 1,
      kind: ringSet.isAromatic(ringIndex) ? "aromatic" : "cycloalkane",
      atomIds: ringAtomIds,
    });
  }

  for (let left = 0; left < rings.length; left += 1) {
    for (let right = left + 1; right < rings.length; right += 1) {
      const sharedAtoms = rings[left].atomIds.filter((id) => rings[right].atomIds.includes(id));
      if (sharedAtoms.length > 1) {
        return {
          ok: false,
          error: "OpenChemLib reconoció un sistema de anillos fusionados. Su análisis y edición se incorporarán en una próxima ampliación.",
        };
      }
    }
  }

  return {
    ok: true,
    molecule: {
      atoms,
      bonds,
      ...(rings.length ? { rings } : {}),
    },
  };
}
