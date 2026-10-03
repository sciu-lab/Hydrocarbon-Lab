import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles, ExerciseFunctionalGroup, ExerciseReference } from "./exercise-chemistry-oracles.ts";
import { validateExerciseDomain } from "./exercise-domain.ts";
import type { ExerciseDomainValidation, ExerciseValidation } from "./exercise-domain.ts";

export type EasyChemicalFeatures = Readonly<{
  functionalGroupInstances: number;
  carbonDoubleBondCount: number;
  carbonTripleBondCount: number;
  explicitEZ: boolean;
  branchCenters: readonly number[];
  simpleMethylBranch: boolean;
  externalRingCarbons: readonly number[];
}>;

/** Graph/motif facts, never a difficulty score or a parser of names. */
export function describeEasyChemistry(molecule: GeneratedMolecule,
  groups: readonly ExerciseFunctionalGroup[]): EasyChemicalFeatures {
  const carbons = new Set(molecule.atoms.filter((atom) => (atom.element ?? "C") === "C").map((atom) => atom.id));
  const edges = molecule.bonds.filter(([a, b]) => carbons.has(a) && carbons.has(b));
  const neighbors = (id: number) => edges.flatMap(([a, b, order = 1]) =>
    a === id ? [{ id: b, order }] : b === id ? [{ id: a, order }] : []);
  const branchCenters = [...carbons].filter((id) => neighbors(id).length > 2);
  const center = branchCenters[0];
  const centerNeighbors = center === undefined ? [] : neighbors(center);
  const simpleMethylBranch = branchCenters.length === 1 && centerNeighbors.length === 3
    && centerNeighbors.every((item) => item.order === 1)
    && centerNeighbors.some((item) => neighbors(item.id).length === 1);
  const ringCarbons = new Set((molecule.rings ?? []).flatMap((ring) => ring.atomIds));
  return {
    functionalGroupInstances: groups.length,
    carbonDoubleBondCount: edges.filter((bond) => bond[2] === 2).length,
    carbonTripleBondCount: edges.filter((bond) => bond[2] === 3).length,
    explicitEZ: molecule.bonds.some((bond) => Boolean(bond[3])),
    branchCenters, simpleMethylBranch,
    externalRingCarbons: ringCarbons.size ? [...carbons].filter((id) => !ringCarbons.has(id)) : [],
  };
}

const reject = (reason: string): { valid: false; reason: string } => ({ valid: false, reason });

/** Target admission only. Build submissions and distractors keep DomainProfile v1. */
export function validateEasyExercise(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles): ExerciseDomainValidation {
  if (category === "ez") return reject("easy-ez-incompatible");
  const domain = validateExerciseDomain(molecule, category, oracles);
  if (!domain.valid) return domain;
  let groups: ExerciseFunctionalGroup[];
  try { groups = oracles.detectFunctionalGroups(molecule); } catch { return reject("group-oracle-failed"); }
  const features = describeEasyChemistry(molecule, groups);
  // Domain already checks the required motif, its charge/heteroatom coverage,
  // primary N, carbonyl vs C-C unsaturation, and the benzene exception.
  if (features.functionalGroupInstances > 1) return reject("easy-multiple-functional-instances");
  if (features.explicitEZ) return reject("easy-explicit-ez");
  if (category === "aromatic" || category === "simple-carbocycle") {
    if (category === "simple-carbocycle" && ![5, 6].includes(molecule.rings![0].atomIds.length)) {
      return reject("easy-ring-size");
    }
    const external = features.externalRingCarbons;
    if (external.length > 1) return reject("easy-ring-substitution");
    if (external.length === 1 && molecule.bonds.filter(([a, b]) => a === external[0] || b === external[0]).length !== 1) {
      return reject("easy-ring-substitution");
    }
  } else {
    if (category === "ether") {
      const atoms = new Map(molecule.atoms.map((atom) => [atom.id, atom.element ?? "C"]));
      const oxygen = molecule.atoms.find((atom) => atom.element === "O")!;
      const anchors = molecule.bonds.flatMap(([a, b]) => a === oxygen.id ? [b] : b === oxygen.id ? [a] : []);
      if (anchors.some((id) => molecule.bonds.filter(([a, b]) =>
        (a === id && atoms.get(b) === "C") || (b === id && atoms.get(a) === "C")).length > 1)) {
        return reject("easy-branched-ether-portion");
      }
    }
    const mayBranch = category === "alkane" || category === "alkene" || category === "alkyne";
    if (features.branchCenters.length && (!mayBranch || !features.simpleMethylBranch)) {
      return reject("easy-branch-complexity");
    }
  }
  return domain;
}

/** Verify the analyzed parent of the reviewed hydrocarbon templates. The
 * constructed chain is all carbons, minus the one terminal methyl when branched;
 * a ring remains the parent. No written name is inspected here.
 */
export function validateEasyParent(molecule: GeneratedMolecule, category: ExerciseCategory,
  reference: ExerciseReference): ExerciseValidation {
  if (!["alkane", "alkene", "alkyne", "aromatic", "simple-carbocycle"].includes(category)) return { valid: true };
  if (!reference.parent) return reject("easy-parent-evidence-missing");
  const carbons = new Set(molecule.atoms.filter((atom) => (atom.element ?? "C") === "C").map((atom) => atom.id));
  const features = describeEasyChemistry(molecule, []);
  const cyclic = category === "aromatic" || category === "simple-carbocycle";
  const expectedCount = cyclic ? molecule.rings![0].atomIds.length : carbons.size - (features.branchCenters.length ? 1 : 0);
  const parent = new Set(reference.parent.atomIds);
  if (reference.parent.carbonCount !== expectedCount || parent.size !== expectedCount
    || [...parent].some((id) => !carbons.has(id))) return reject("easy-parent-mismatch");
  const outside = [...carbons].filter((id) => !parent.has(id));
  if (outside.length > 1 || outside.some((id) => {
    const bonds = molecule.bonds.filter(([a, b]) => a === id || b === id);
    return bonds.length !== 1 || (bonds[0][2] ?? 1) !== 1 || !parent.has(bonds[0][0] === id ? bonds[0][1] : bonds[0][0]);
  })) return reject("easy-parent-mismatch");
  if (!cyclic && molecule.bonds.some(([a, b, order = 1]) => order > 1 && carbons.has(a) && carbons.has(b)
    && (!parent.has(a) || !parent.has(b)))) return reject("easy-parent-mismatch");
  return { valid: true };
}
