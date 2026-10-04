import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles, ExerciseReference } from "./exercise-chemistry-oracles.ts";
import { expectedExerciseGroup, validateExerciseDomain } from "./exercise-domain.ts";
import type { ExerciseDomainValidation, ExerciseValidation } from "./exercise-domain.ts";
import { describeEasyChemistry } from "./exercise-easy-profile.ts";

const reject = (reason: string): { valid: false; reason: string } => ({ valid: false, reason });

/** Admission is graph-derived. The neutral comparison domain does not require
 * this pedagogical trigger, so an elementary wrong Build answer stays valid. */
export function validateIntermediateExercise(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles): ExerciseDomainValidation {
  const domain = validateExerciseDomain(molecule, category, oracles, "intermediate");
  if (!domain.valid) return domain;
  let groups;
  try { groups = oracles.detectFunctionalGroups(molecule); } catch { return reject("group-oracle-failed"); }
  const f = describeEasyChemistry(molecule, groups);
  const carbons = new Set(molecule.atoms.filter((a) => (a.element ?? "C") === "C").map((a) => a.id));
  const neighbors = (id: number) => molecule.bonds.flatMap(([a, b]) =>
    a === id && carbons.has(b) ? [b] : b === id && carbons.has(a) ? [a] : []);
  if (f.branchCenters.length > 2 || f.branchCenters.some((id) => neighbors(id).length !== 3)) {
    return reject("intermediate-branch-budget");
  }
  const prefixes = groups.filter((g) => g.kind === "halogen" || g.kind === "nitro").length;
  if (f.branchCenters.length + prefixes > 3) return reject("intermediate-prefix-budget");
  if (category === "aromatic" || category === "simple-carbocycle") {
    if (![5, 6].includes(molecule.rings![0].atomIds.length)) return reject("intermediate-ring-size");
    const ring = new Set(molecule.rings![0].atomIds), outside = new Set(f.externalRingCarbons);
    if (f.branchCenters.length !== 2 || f.externalRingCarbons.length > 4) return reject("intermediate-ring-substitution");
    while (outside.size) {
      const component = new Set<number>(), pending = [outside.values().next().value!];
      while (pending.length) {
        const id = pending.pop()!;
        if (!outside.delete(id)) continue;
        component.add(id); pending.push(...neighbors(id).filter((other) => outside.has(other)));
      }
      const edges = molecule.bonds.filter(([a, b]) => component.has(a) || component.has(b));
      const attachments = edges.filter(([a, b]) => component.has(a) && ring.has(b) || component.has(b) && ring.has(a));
      if (component.size > 2 || attachments.length !== 1 || edges.some((bond) => (bond[2] ?? 1) !== 1)) return reject("intermediate-ring-substitution");
    }
  } else if (category === "ez") {
    // Domain checks an explicit, genuinely stereogenic C=C, never geometry alone.
  } else if (["alkane", "alkene", "alkyne"].includes(category)) {
    if (f.branchCenters.length !== 2) return reject("intermediate-hydrocarbon-trigger-missing");
  } else if (f.carbonDoubleBondCount + f.carbonTripleBondCount !== 1) {
    return reject("intermediate-function-unsaturation-required");
  }
  return domain;
}

/** Evidence from the existing analyzed parent, not the constructed chain or
 * text. Only simple methyl/ethyl carbon branches and the ether/ester O-alkyl
 * portion may remain outside it; all C-C multiple bonds stay on the parent. */
export function validateIntermediateParent(molecule: GeneratedMolecule, category: ExerciseCategory,
  reference: ExerciseReference): ExerciseValidation {
  if (!reference.parent) return reject("intermediate-parent-evidence-missing");
  const required = expectedExerciseGroup[category];
  if (required && !["halogen", "nitro", "ether"].includes(required)
    && reference.principalFunctionalGroup !== required) return reject("intermediate-principal-anchor-mismatch");
  const carbons = new Set(molecule.atoms.filter((a) => (a.element ?? "C") === "C").map((a) => a.id));
  const parent = new Set(reference.parent.atomIds);
  const cyclic = category === "aromatic" || category === "simple-carbocycle";
  if (parent.size !== reference.parent.carbonCount || parent.size < (cyclic ? 5 : 6)
    || [...parent].some((id) => !carbons.has(id))) return reject("intermediate-parent-mismatch");
  if (!cyclic && molecule.bonds.some(([a, b, order = 1]) => order > 1 && carbons.has(a) && carbons.has(b)
    && (!parent.has(a) || !parent.has(b)))) return reject("intermediate-unsaturation-outside-parent");
  const outside = new Set([...carbons].filter((id) => !parent.has(id)));
  let branches = 0, alkylPortions = 0;
  while (outside.size) {
    const component = new Set<number>(), pending = [outside.values().next().value!];
    while (pending.length) {
      const id = pending.pop()!;
      if (!outside.delete(id)) continue;
      component.add(id);
      for (const [a, b, order = 1] of molecule.bonds) {
        const other = a === id ? b : b === id ? a : undefined;
        if (other !== undefined && outside.has(other)) {
          if (order !== 1) return reject("intermediate-complex-branch");
          pending.push(other);
        }
      }
    }
    const boundary = molecule.bonds.filter(([a, b]) => component.has(a) !== component.has(b));
    if (component.size > 2 || boundary.length !== 1 || (boundary[0][2] ?? 1) !== 1) return reject("intermediate-complex-branch");
    const [a, b] = boundary[0], anchor = component.has(a) ? b : a;
    if (parent.has(anchor)) branches++;
    else if (["ether", "ester"].includes(category) && molecule.atoms.find((atom) => atom.id === anchor)?.element === "O") alkylPortions++;
    else return reject("intermediate-function-outside-parent");
  }
  if (branches > 2 || alkylPortions !== (["ether", "ester"].includes(category) ? 1 : 0)) return reject("intermediate-parent-branch-budget");
  return { valid: true };
}
