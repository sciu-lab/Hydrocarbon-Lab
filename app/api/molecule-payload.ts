import type {
  GeneratedAtom,
  GeneratedBond,
  GeneratedMolecule,
  GeneratedRing,
} from "../name-to-molecule";
import {
  normalizeManualDisplayPlacements,
  type ManualDisplayPlacement,
} from "../manual-display-direction.ts";

export type PersistedMolecule = Pick<GeneratedMolecule, "atoms" | "bonds"> & {
  rings?: GeneratedRing[];
  manualDisplayDirections?: ManualDisplayPlacement[];
  /** Display orientation is retained for backwards compatibility with the editor. */
  isMirrored?: boolean;
};

const ALLOWED_ELEMENTS = new Set<NonNullable<GeneratedAtom["element"]>>([
  "C",
  "O",
  "N",
  "S",
  "F",
  "Cl",
  "Br",
  "I",
]);

const MAX_ATOMS = 180;
const MAX_BONDS = 360;
const MAX_ABS_FORMAL_CHARGE = 4;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates and copies the editable molecule graph for cloud persistence.
 * Chemical fields are retained exactly; old payloads that omit optional fields
 * remain valid and are not assigned invented defaults.
 */
export function normalizeMoleculePayload(value: unknown): PersistedMolecule | null {
  if (!isRecord(value)) return null;
  const candidate = value as Partial<PersistedMolecule>;
  if (
    !Array.isArray(candidate.atoms)
    || !Array.isArray(candidate.bonds)
    || candidate.atoms.length < 1
    || candidate.atoms.length > MAX_ATOMS
    || candidate.bonds.length > MAX_BONDS
    || (candidate.isMirrored !== undefined && typeof candidate.isMirrored !== "boolean")
  ) {
    return null;
  }

  const ids = new Set<number>();
  const atoms: GeneratedAtom[] = [];
  for (const valueAtom of candidate.atoms) {
    if (!isRecord(valueAtom)) return null;
    const atom = valueAtom as unknown as GeneratedAtom;
    if (
      !Number.isSafeInteger(atom.id)
      || !isFiniteNumber(atom.x)
      || !isFiniteNumber(atom.y)
      || Math.abs(atom.x) > 200
      || Math.abs(atom.y) > 200
      || (atom.element !== undefined && !ALLOWED_ELEMENTS.has(atom.element))
      || (atom.charge !== undefined && (
        !Number.isSafeInteger(atom.charge)
        || Math.abs(atom.charge) > MAX_ABS_FORMAL_CHARGE
      ))
      || (atom.tetrahedralParity !== undefined
        && atom.tetrahedralParity !== "R"
        && atom.tetrahedralParity !== "S")
      || (atom.tetrahedralBondTo !== undefined
        && (!Number.isSafeInteger(atom.tetrahedralBondTo) || atom.tetrahedralBondTo === atom.id))
      || ids.has(atom.id)
    ) {
      return null;
    }
    ids.add(atom.id);
    atoms.push({
      id: atom.id,
      x: atom.x,
      y: atom.y,
      ...(atom.element !== undefined ? { element: atom.element } : {}),
      ...(atom.charge !== undefined ? { charge: atom.charge } : {}),
      ...(atom.tetrahedralParity !== undefined ? { tetrahedralParity: atom.tetrahedralParity } : {}),
      ...(atom.tetrahedralBondTo !== undefined ? { tetrahedralBondTo: atom.tetrahedralBondTo } : {}),
    });
  }

  const bonds: GeneratedBond[] = [];
  for (const valueBond of candidate.bonds) {
    if (
      !Array.isArray(valueBond)
      || valueBond.length < 2
      || valueBond.length > 4
      || !Number.isSafeInteger(valueBond[0])
      || !Number.isSafeInteger(valueBond[1])
      || valueBond[0] === valueBond[1]
      || !ids.has(valueBond[0])
      || !ids.has(valueBond[1])
      || (valueBond[2] !== undefined && valueBond[2] !== 1 && valueBond[2] !== 2 && valueBond[2] !== 3)
      || (valueBond[3] !== undefined && typeof valueBond[3] !== "boolean")
      || (valueBond[3] === true && valueBond[2] !== 2)
    ) {
      return null;
    }
    const bond = [
      valueBond[0],
      valueBond[1],
      ...(valueBond[2] !== undefined ? [valueBond[2]] : []),
    ] as GeneratedBond;
    if (valueBond[3] !== undefined) bond[3] = valueBond[3];
    bonds.push(bond);
  }

  for (const atom of atoms) {
    if (atom.tetrahedralBondTo === undefined) continue;
    const carrierBond = bonds.find(([left, right]) =>
      (left === atom.id && right === atom.tetrahedralBondTo)
      || (right === atom.id && left === atom.tetrahedralBondTo),
    );
    if (!atom.tetrahedralParity || !carrierBond || (carrierBond[2] ?? 1) !== 1) return null;
  }

  let rings: GeneratedRing[] | undefined;
  if (candidate.rings !== undefined) {
    if (!Array.isArray(candidate.rings) || candidate.rings.length > 20) return null;
    rings = [];
    for (const valueRing of candidate.rings) {
      if (!isRecord(valueRing)) return null;
      const ring = valueRing as unknown as GeneratedRing;
      if (
        !Number.isSafeInteger(ring.id)
        || (ring.kind !== "cycloalkane" && ring.kind !== "aromatic")
        || !Array.isArray(ring.atomIds)
        || ring.atomIds.length < 3
        || ring.atomIds.length > 20
        || ring.atomIds.some((id) => !Number.isSafeInteger(id) || !ids.has(id))
      ) {
        return null;
      }
      rings.push({ id: ring.id, kind: ring.kind, atomIds: [...ring.atomIds] });
    }
  }

  const manualDisplayDirections = normalizeManualDisplayPlacements(candidate.manualDisplayDirections, { atoms, bonds });
  if (candidate.manualDisplayDirections !== undefined && manualDisplayDirections === undefined) return null;

  return {
    atoms,
    bonds,
    ...(rings?.length ? { rings } : {}),
    ...(candidate.isMirrored === true ? { isMirrored: true } : {}),
    ...(manualDisplayDirections?.length ? { manualDisplayDirections } : {}),
  };
}
