import { EXERCISE_CATEGORIES } from "./exercise-model.ts";
import type { ExerciseCategory } from "./exercise-model.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { inspectDoubleBondStereochemistry } from "./double-bond-stereochemistry.ts";

export type ExerciseTopology = "acyclic" | "simple-carbocycle" | "benzene-monocycle";
export type ExerciseValidation =
  | { valid: true }
  | { valid: false; reason: string };
export type ExerciseDomainValidation =
  | { valid: true; topology: ExerciseTopology }
  | { valid: false; reason: string };

export const EXERCISE_DOMAIN_VERSION = 1;
export const EXERCISE_ALLOWED_ELEMENTS = Object.freeze(["C", "O", "N", "F", "Cl", "Br", "I"] as const);
const reject = (reason: string): { valid: false; reason: string } => ({ valid: false, reason });
const element = (atom: GeneratedMolecule["atoms"][number]) => atom.element ?? "C";

/** Schema, connectivity and the production valence oracle, before any naming. */
export function validateExerciseChemistry(
  molecule: GeneratedMolecule,
  oracles: ExerciseChemistryOracles,
): ExerciseValidation {
  if (!molecule || !Array.isArray(molecule.atoms) || !molecule.atoms.length) return reject("empty-atoms");
  if (!Array.isArray(molecule.bonds)) return reject("invalid-bonds");
  const ids = new Set<number>();
  for (const atom of molecule.atoms) {
    if (!atom || !Number.isSafeInteger(atom.id) || atom.id < 1 || ids.has(atom.id)) return reject("invalid-atom-id");
    if (!Number.isFinite(atom.x) || !Number.isFinite(atom.y)) return reject("invalid-coordinates");
    if (![...EXERCISE_ALLOWED_ELEMENTS, "S"].includes(element(atom))) return reject("unsupported-element");
    if (atom.charge !== undefined && !Number.isSafeInteger(atom.charge)) return reject("invalid-charge");
    ids.add(atom.id);
  }
  const edges = new Set<string>();
  const neighbors = new Map([...ids].map((id) => [id, [] as number[]]));
  for (const bond of molecule.bonds) {
    if (!Array.isArray(bond) || bond.length < 2 || bond.length > 4) return reject("invalid-bond");
    const [left, right, order = 1, explicitStereo] = bond;
    if (!ids.has(left) || !ids.has(right)) return reject("missing-endpoint");
    if (left === right) return reject("self-bond");
    if (![1, 2, 3].includes(order)) return reject("unsupported-bond-order");
    if (explicitStereo !== undefined && typeof explicitStereo !== "boolean") return reject("invalid-stereo-metadata");
    if (explicitStereo && order !== 2) return reject("invalid-stereo-metadata");
    const edge = left < right ? `${left}:${right}` : `${right}:${left}`;
    if (edges.has(edge)) return reject("duplicate-bond");
    edges.add(edge);
    neighbors.get(left)!.push(right);
    neighbors.get(right)!.push(left);
  }
  const visited = new Set<number>();
  const pending = [molecule.atoms[0].id];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...neighbors.get(id)!);
  }
  if (visited.size !== ids.size) return reject("disconnected");
  try {
    if (oracles.findMoleculeValenceViolation(molecule) !== null) return reject("invalid-valence");
  } catch {
    return reject("valence-oracle-failed");
  }
  return { valid: true };
}

const expectedGroup: Partial<Record<ExerciseCategory, string>> = {
  halogenated: "halogen", alcohol: "alcohol", aldehyde: "aldehyde", ketone: "ketone",
  "carboxylic-acid": "carboxylicAcid", ether: "ether", ester: "ester", amine: "amine",
  amide: "amide", nitrile: "nitrile", nitro: "nitro",
};

/**
 * Conservative generation envelope within DomainProfile v1. One function family,
 * no competing functions; cyclic recipes are hydrocarbons only. Graph cycle rank
 * is checked independently of ring metadata, including when that metadata is absent.
 */
export function validateExerciseDomain(
  molecule: GeneratedMolecule,
  category: ExerciseCategory,
  oracles: ExerciseChemistryOracles,
): ExerciseDomainValidation {
  if (!EXERCISE_CATEGORIES.includes(category)) return reject("unsupported-category");
  const chemical = validateExerciseChemistry(molecule, oracles);
  if (!chemical.valid) return chemical;
  if (molecule.atoms.some((atom) => !EXERCISE_ALLOWED_ELEMENTS.includes(element(atom) as typeof EXERCISE_ALLOWED_ELEMENTS[number]))) {
    return reject("excluded-element");
  }
  if (molecule.atoms.some((atom) => atom.tetrahedralParity !== undefined || atom.tetrahedralBondTo !== undefined)) {
    return reject("rs-outside-domain");
  }
  const atoms = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const adjacent = (id: number) => molecule.bonds.flatMap(([left, right, order = 1]) =>
    left === id ? [{ id: right, order }] : right === id ? [{ id: left, order }] : []);
  const at = (id: number) => element(atoms.get(id)!);
  if (!molecule.atoms.some((atom) => element(atom) === "C")) return reject("no-carbon");

  let topology: ExerciseTopology = "acyclic";
  const cycleRank = molecule.bonds.length - molecule.atoms.length + 1;
  if (molecule.rings !== undefined && !Array.isArray(molecule.rings)) return reject("invalid-ring-metadata");
  const rings = molecule.rings ?? [];
  if (!Array.isArray(rings)) return reject("invalid-ring-metadata");
  if (cycleRank > 1) return reject("polycycle-outside-domain");
  if (cycleRank === 0 && rings.length) return reject("invalid-ring-metadata");
  if (cycleRank === 1) {
    if (rings.length !== 1) return reject("invalid-ring-metadata");
    const ring = rings[0];
    if (!ring || !Number.isSafeInteger(ring.id) || ring.id < 1 || !Array.isArray(ring.atomIds)
      || ring.atomIds.length < 3 || new Set(ring.atomIds).size !== ring.atomIds.length
      || ring.atomIds.some((id) => !atoms.has(id))) return reject("invalid-ring-metadata");
    if (ring.atomIds.some((id) => at(id) !== "C")) return reject("heterocycle-outside-domain");
    const ringEdges = ring.atomIds.map((id, index) => molecule.bonds.find(([left, right]) =>
      (left === id && right === ring.atomIds[(index + 1) % ring.atomIds.length])
      || (right === id && left === ring.atomIds[(index + 1) % ring.atomIds.length])));
    if (ringEdges.some((bond) => !bond)) return reject("invalid-ring-metadata");
    if (ring.kind === "aromatic") {
      const orders = ringEdges.map((bond) => bond![2] ?? 1);
      if (orders.length !== 6 || orders.some((order, index) => ![1, 2].includes(order)
        || order === orders[(index + 1) % orders.length])) return reject("unsupported-aromatic-pattern");
      topology = "benzene-monocycle";
    } else if (ring.kind === "cycloalkane") {
      if (ringEdges.some((bond) => (bond![2] ?? 1) !== 1)) return reject("unsupported-ring-unsaturation");
      topology = "simple-carbocycle";
    } else return reject("invalid-ring-metadata");
  }
  const requiredTopology = category === "aromatic" ? "benzene-monocycle"
    : category === "simple-carbocycle" ? "simple-carbocycle" : "acyclic";
  if (topology !== requiredTopology) return reject("category-topology-mismatch");

  // Only the explicit, charge-balanced nitro motif permits nonzero charges.
  if (category !== "nitro" && molecule.atoms.some((atom) => (atom.charge ?? 0) !== 0)) return reject("unsupported-charge");
  if (category === "nitro") {
    const nitrogen = molecule.atoms.filter((atom) => element(atom) === "N");
    const oxygen = molecule.atoms.filter((atom) => element(atom) === "O");
    if (nitrogen.length !== 1 || oxygen.length !== 2 || nitrogen[0].charge !== 1) return reject("unsupported-nitro-pattern");
    const neighbors = adjacent(nitrogen[0].id);
    const doubleO = neighbors.find((neighbor) => at(neighbor.id) === "O" && neighbor.order === 2);
    const singleO = neighbors.find((neighbor) => at(neighbor.id) === "O" && neighbor.order === 1);
    if (neighbors.length !== 3 || !doubleO || !singleO
      || neighbors.filter((neighbor) => at(neighbor.id) === "C" && neighbor.order === 1).length !== 1
      || (atoms.get(doubleO.id)!.charge ?? 0) !== 0 || atoms.get(singleO.id)!.charge !== -1
      || adjacent(doubleO.id).length !== 1 || adjacent(singleO.id).length !== 1
      || molecule.atoms.some((atom) => element(atom) === "C" && (atom.charge ?? 0) !== 0)) return reject("unsupported-nitro-pattern");
  }

  let groups;
  try { groups = oracles.detectFunctionalGroups(molecule); } catch { return reject("group-oracle-failed"); }
  const requiredGroup = expectedGroup[category];
  if (requiredGroup) {
    if (!groups.length || groups.some((group) => group.kind !== requiredGroup)
      || (category !== "halogenated" && groups.length !== 1)) return reject("category-group-mismatch");
  } else if (groups.length) return reject("unexpected-functional-group");
  const covered = new Set(groups.flatMap((group) => group.atomIds));
  if (molecule.atoms.some((atom) => element(atom) !== "C" && !covered.has(atom.id))) return reject("unrecognized-heteroatom");

  // Initial N recipes are primary amines/amides, never general N substitution.
  if ((category === "amine" || category === "amide") && molecule.atoms.some((atom) =>
    element(atom) === "N" && (adjacent(atom.id).length !== 1 || adjacent(atom.id)[0].order !== 1))) {
    return reject("unsupported-n-substitution");
  }
  const carbonMultiple = molecule.bonds.filter(([left, right, order = 1]) => at(left) === "C" && at(right) === "C" && order > 1);
  if (category === "alkene" || category === "ez" || category === "alkyne") {
    const requiredOrder = category === "alkyne" ? 3 : 2;
    if (carbonMultiple.length !== 1 || carbonMultiple[0][2] !== requiredOrder) return reject("category-unsaturation-mismatch");
  } else if (category !== "aromatic" && carbonMultiple.length) return reject("unsupported-combination");
  else if (category === "aromatic" && carbonMultiple.length !== 3) return reject("unsupported-aromatic-pattern");

  const explicit = molecule.bonds.filter((bond) => bond[3]);
  if (category === "ez") {
    if (explicit.length !== 1 || explicit[0] !== carbonMultiple[0]) return reject("missing-ez-configuration");
    const inspection = inspectDoubleBondStereochemistry(molecule, explicit[0][0], explicit[0][1]);
    if (!inspection.stereogenic || !inspection.configuration) return reject("invalid-ez-configuration");
  } else if (explicit.length) return reject("unexpected-ez-configuration");
  return { valid: true, topology };
}
