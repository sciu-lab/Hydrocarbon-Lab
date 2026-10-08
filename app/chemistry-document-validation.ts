import type { GeneratedMolecule } from "./name-to-molecule";
import {
  normalizeManualDisplayPlacements,
  type ManualDisplayPlacement,
} from "./manual-display-direction.ts";
import { normalizeViewMode, type LegacyPersistedViewMode, type ViewMode } from "./view-mode.ts";

export type PortableMolecule = GeneratedMolecule & {
  isMirrored?: boolean;
  manualDisplayDirections?: ManualDisplayPlacement[];
};

export type PortableStructure = {
  name: string;
  formula: string;
  family: string;
  molecule: PortableMolecule;
  viewMode: ViewMode;
  atomCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializedPortableStructure = Omit<PortableStructure, "viewMode"> & {
  viewMode: LegacyPersistedViewMode;
};

type ChemistryChecks = {
  calculateFormula: (molecule: PortableMolecule) => string;
  isValenceValid: (molecule: PortableMolecule) => boolean;
  isSupportedElement: (element: string) => boolean;
};

const MAX_IMPORT_ATOMS = 180;
const MAX_IMPORT_BONDS = 360;
const MAX_IMPORT_RINGS = 20;
const subscriptDigits: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function edgeKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function formulaComposition(value: string, isSupportedElement: (element: string) => boolean): string | null {
  const formula = value.replace(/[₀-₉]/g, (digit) => subscriptDigits[digit] ?? digit).replace(/\s+/g, "");
  if (!formula) return null;

  const counts = new Map<string, number>();
  const tokenPattern = /([A-Z][a-z]?)(\d*)/g;
  let cursor = 0;
  for (const match of formula.matchAll(tokenPattern)) {
    const [token, element, countText] = match;
    const index = match.index ?? -1;
    const count = countText ? Number(countText) : 1;
    if (
      index !== cursor
      || (element !== "H" && !isSupportedElement(element))
      || !Number.isSafeInteger(count)
      || count < 1
    ) {
      return null;
    }
    counts.set(element, (counts.get(element) ?? 0) + count);
    cursor += token.length;
  }
  if (cursor !== formula.length) return null;
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([element, count]) => `${element}:${count}`).join("|");
}

function formulasMatch(declared: string, calculated: string, isSupportedElement: (element: string) => boolean) {
  const declaredComposition = formulaComposition(declared, isSupportedElement);
  return declaredComposition !== null && declaredComposition === formulaComposition(calculated, isSupportedElement);
}

function normalizePortableMolecule(
  value: unknown,
  isSupportedElement: (element: string) => boolean,
): PortableMolecule | null {
  if (
    !isRecord(value)
    || !Array.isArray(value.atoms)
    || !Array.isArray(value.bonds)
    || !value.atoms.length
    || value.atoms.length > MAX_IMPORT_ATOMS
    || value.bonds.length > MAX_IMPORT_BONDS
  ) return null;

  const atomIds = new Set<number>();
  const atoms: PortableMolecule["atoms"] = [];
  for (const candidate of value.atoms) {
    if (!isRecord(candidate)) return null;
    const atom = candidate;
    if (
      !Number.isSafeInteger(atom.id)
      || !isFiniteNumber(atom.x)
      || !isFiniteNumber(atom.y)
      || (atom.element !== undefined && (typeof atom.element !== "string" || !isSupportedElement(atom.element)))
      || (atom.charge !== undefined && (
        !Number.isSafeInteger(atom.charge)
        // These are the non-neutral states represented by the current canvas valence rules.
        || (atom.charge !== 0 && !(atom.element === "N" && atom.charge === 1) && !(atom.element === "O" && atom.charge === -1))
      ))
      || (atom.tetrahedralParity !== undefined && atom.tetrahedralParity !== "R" && atom.tetrahedralParity !== "S")
      || (atom.tetrahedralBondTo !== undefined
        && (!Number.isSafeInteger(atom.tetrahedralBondTo) || atom.tetrahedralBondTo === atom.id))
      || atomIds.has(atom.id as number)
    ) {
      return null;
    }
    atomIds.add(atom.id as number);
    atoms.push({
      id: atom.id as number,
      x: atom.x,
      y: atom.y,
      ...(atom.element !== undefined ? { element: atom.element as NonNullable<PortableMolecule["atoms"][number]["element"]> } : {}),
      ...(atom.charge !== undefined ? { charge: atom.charge as number } : {}),
      ...(atom.tetrahedralParity !== undefined ? { tetrahedralParity: atom.tetrahedralParity as "R" | "S" } : {}),
      ...(atom.tetrahedralBondTo !== undefined ? { tetrahedralBondTo: atom.tetrahedralBondTo as number } : {}),
    });
  }

  const bonds: PortableMolecule["bonds"] = [];
  const edges = new Set<string>();
  for (const candidate of value.bonds) {
    if (!Array.isArray(candidate) || candidate.length < 2 || candidate.length > 4) return null;
    const [left, right, order, explicitStereo] = candidate;
    if (
      !Number.isSafeInteger(left)
      || !Number.isSafeInteger(right)
      || left === right
      || !atomIds.has(left as number)
      || !atomIds.has(right as number)
      || (order !== undefined && order !== 1 && order !== 2 && order !== 3)
      || (explicitStereo !== undefined && typeof explicitStereo !== "boolean")
      || (explicitStereo === true && order !== 2)
    ) {
      return null;
    }
    const key = edgeKey(left as number, right as number);
    if (edges.has(key)) return null;
    edges.add(key);
    const bond = [left as number, right as number, ...(order !== undefined ? [order] : [])] as PortableMolecule["bonds"][number];
    if (explicitStereo !== undefined) bond[3] = explicitStereo;
    bonds.push(bond);
  }

  for (const atom of atoms) {
    if (atom.tetrahedralBondTo === undefined) continue;
    if (!atom.tetrahedralParity) return null;
    const carrierKey = edgeKey(atom.id, atom.tetrahedralBondTo);
    const carrier = bonds.find(([left, right]) => edgeKey(left, right) === carrierKey);
    if (!carrier || (carrier[2] ?? 1) !== 1) return null;
  }

  let rings: NonNullable<PortableMolecule["rings"]> | undefined;
  if (value.rings !== undefined) {
    if (!Array.isArray(value.rings) || value.rings.length > MAX_IMPORT_RINGS) return null;
    const ringIds = new Set<number>();
    rings = [];
    for (const candidate of value.rings) {
      if (!isRecord(candidate) || !Array.isArray(candidate.atomIds)) return null;
      const ring = candidate;
      if (
        !Number.isSafeInteger(ring.id)
        || ringIds.has(ring.id as number)
        || (ring.kind !== "cycloalkane" && ring.kind !== "aromatic")
        || ring.atomIds.length < 3
        || ring.atomIds.length > 20
        || ring.atomIds.some((id) => !Number.isSafeInteger(id) || !atomIds.has(id as number))
        || new Set(ring.atomIds).size !== ring.atomIds.length
      ) {
        return null;
      }
      for (let index = 0; index < ring.atomIds.length; index += 1) {
        const left = ring.atomIds[index] as number;
        const right = ring.atomIds[(index + 1) % ring.atomIds.length] as number;
        if (!edges.has(edgeKey(left, right))) return null;
      }
      ringIds.add(ring.id as number);
      rings.push({
        id: ring.id as number,
        kind: ring.kind as "cycloalkane" | "aromatic",
        atomIds: [...ring.atomIds] as number[],
      });
    }
  }

  if (value.isMirrored !== undefined && typeof value.isMirrored !== "boolean") return null;
  const manualDisplayDirections = normalizeManualDisplayPlacements(value.manualDisplayDirections, { atoms, bonds });
  if (value.manualDisplayDirections !== undefined && manualDisplayDirections === undefined) return null;
  return {
    atoms,
    bonds,
    ...(rings !== undefined ? { rings } : {}),
    ...(value.isMirrored !== undefined ? { isMirrored: value.isMirrored } : {}),
    ...(manualDisplayDirections?.length ? { manualDisplayDirections } : {}),
  };
}

function normalizePortableStructure(value: unknown, checks: ChemistryChecks): PortableStructure | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== "string"
    || typeof value.formula !== "string"
    || typeof value.family !== "string"
    || !normalizeViewMode(value.viewMode)
    || !Number.isSafeInteger(value.atomCount)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const molecule = normalizePortableMolecule(value.molecule, checks.isSupportedElement);
  if (!molecule || value.atomCount !== molecule.atoms.length) return null;
  try {
    if (
      !checks.isValenceValid(molecule)
      || !formulasMatch(value.formula, checks.calculateFormula(molecule), checks.isSupportedElement)
    ) return null;
  } catch {
    return null;
  }

  return {
    name: value.name,
    formula: value.formula,
    family: value.family,
    molecule,
    viewMode: normalizeViewMode(value.viewMode)!,
    atomCount: value.atomCount as number,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function readChemistryDocument(value: unknown, checks: ChemistryChecks): PortableStructure[] {
  if (!isRecord(value)) {
    throw new Error("El archivo no contiene un documento químico válido.");
  }
  if (value.format !== "laboratorio-quimica-organica" || value.version !== 1) {
    throw new Error("Este archivo no pertenece a una versión compatible del laboratorio.");
  }

  const structures = value.kind === "structure"
    ? value.structure ? [value.structure] : []
    : value.kind === "library" && Array.isArray(value.structures)
      ? value.structures.slice(0, 50)
      : [];

  const validated = structures.map((structure) => normalizePortableStructure(structure, checks));
  if (!validated.length || validated.some((structure) => structure === null)) {
    throw new Error("El documento no contiene estructuras orgánicas válidas.");
  }
  return validated as PortableStructure[];
}
