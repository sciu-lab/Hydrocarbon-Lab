import { Molecule as OCLMolecule, CanonizerUtil } from "openchemlib";
import { EXERCISE_CATEGORIES } from "./exercise-model.ts";
import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import { validateExerciseChemistry, validateExerciseComparison, validateExerciseDomain } from "./exercise-domain.ts";
import { inspectDoubleBondStereochemistry } from "./double-bond-stereochemistry.ts";
import { moleculeToSmiles } from "./openchemlib-adapter.ts";

export const BUILD_CATEGORIES = EXERCISE_CATEGORIES;
export type StructuralStatus = "EQUIVALENT" | "DIFFERENT_ELEMENTS" | "DIFFERENT_BOND_ORDERS"
  | "DIFFERENT_FORMAL_CHARGE" | "DIFFERENT_STRUCTURE" | "DIFFERENT_STEREOCHEMISTRY"
  | "INVALID_SUBMISSION" | "UNSUPPORTED_COMPARISON";
export type StructuralEvaluation = {
  version: 1; correct: boolean; status: StructuralStatus;
  referenceIdentity: string | null; submittedIdentity: string | null;
  submittedSmiles: string | null;
  checks: { referenceValid: boolean; submissionValid: boolean; constitutionEqual: boolean; stereoEqual: boolean };
};
export type StructuralAnswerEvaluator = (input: {
  referenceMolecule: GeneratedMolecule; submittedMolecule: GeneratedMolecule; category: ExerciseCategory;
}) => StructuralEvaluation;
export type BuildSubmissionValidation = { valid: true } | { valid: false; reason: "INVALID_SUBMISSION" | "UNSUPPORTED_COMPARISON" };
export type BuildSubmissionValidator = (molecule: GeneratedMolecule) => BuildSubmissionValidation;

/** Submission-only validation: no target, identity comparison or correctness. */
export function createBuildSubmissionValidator(oracles: ExerciseChemistryOracles): BuildSubmissionValidator {
  return (molecule) => {
    try {
      if (!molecule || molecule.atoms?.length > 120 || molecule.bonds?.length > 150) return { valid: false, reason: "INVALID_SUBMISSION" };
      const chemical = validateExerciseChemistry(molecule, oracles);
      if (!chemical.valid) return { valid: false, reason: chemical.reason.endsWith("oracle-failed") ? "UNSUPPORTED_COMPARISON" : "INVALID_SUBMISSION" };
      return (EXERCISE_CATEGORIES.some((category) => validateExerciseDomain(molecule, category, oracles).valid)
        || EXERCISE_CATEGORIES.some((category) => validateExerciseDomain(molecule, category, oracles, "intermediate").valid))
        ? { valid: true } : { valid: false, reason: "INVALID_SUBMISSION" };
    } catch { return { valid: false, reason: "UNSUPPORTED_COMPARISON" }; }
  };
}

const atomicNumbers = { C: 6, O: 8, N: 7, F: 9, Cl: 17, Br: 35, I: 53 };
/** Coordinates never enter constitutional canonicalization. No tautomer, salt,
 * charge-neutralization or formula-only equivalence is requested from OCL. */
export function buildConstitutionalIdentity(source: GeneratedMolecule, omit: "none" | "charge" | "order" = "none") {
  const m = new OCLMolecule(source.atoms.length, source.bonds.length);
  const ids = new Map<number, number>();
  for (const atom of source.atoms) {
    const index = m.addAtom(atomicNumbers[(atom.element ?? "C") as keyof typeof atomicNumbers]);
    ids.set(atom.id, index);
    m.setAtomCharge(index, omit === "charge" ? 0 : atom.charge ?? 0);
  }
  for (const [a, b, order = 1] of source.bonds) {
    const index = m.addBond(ids.get(a)!, ids.get(b)!);
    m.setBondOrder(index, omit === "order" ? 1 : order);
  }
  m.setFragment(false);
  return CanonizerUtil.getIDCode(m, CanonizerUtil.NOSTEREO);
}

function stereo(source: GeneratedMolecule) {
  const configured = source.bonds.filter((bond) => bond[3]);
  if (!configured.length) return "unspecified";
  // Domain v1 contains exactly one configured, acyclic C=C. Inspect its
  // chemical E/Z descriptor; never compare canvas coordinates numerically.
  if (configured.length !== 1) throw new Error("Unsupported stereo count.");
  const [a, b] = configured[0];
  const inspected = inspectDoubleBondStereochemistry(source, a, b);
  if (!inspected.stereogenic || !inspected.configuration) throw new Error("Unavailable stereo.");
  return inspected.configuration;
}

/** Uses the real validation oracles, never their generated names. An invalid
 * drawing is recoverable without an AttemptRecord; toolkit failures are technical. */
export function createStructuralAnswerEvaluator(oracles: ExerciseChemistryOracles): StructuralAnswerEvaluator {
  const validateSubmission = createBuildSubmissionValidator(oracles);
  return ({ referenceMolecule, submittedMolecule, category }) => {
    const result: StructuralEvaluation = { version: 1, correct: false, status: "UNSUPPORTED_COMPARISON",
      referenceIdentity: null, submittedIdentity: null, submittedSmiles: null,
      checks: { referenceValid: false, submissionValid: false, constitutionEqual: false, stereoEqual: false } };
    try {
      if (!validateExerciseComparison(referenceMolecule, category, oracles).valid) return result;
      result.checks.referenceValid = true;
      const validation = validateSubmission(submittedMolecule);
      if (!validation.valid) return { ...result, status: validation.reason };
      result.checks.submissionValid = true;
      const reference = buildConstitutionalIdentity(referenceMolecule), submission = buildConstitutionalIdentity(submittedMolecule);
      const refStereo = stereo(referenceMolecule), subStereo = stereo(submittedMolecule);
      result.referenceIdentity = `${reference}|ez:${refStereo}`;
      result.submittedIdentity = `${submission}|ez:${subStereo}`;
      result.checks.constitutionEqual = reference === submission;
      result.checks.stereoEqual = refStereo === subStereo;
      const exported = moleculeToSmiles(submittedMolecule);
      if (!exported.ok) return result;
      result.submittedSmiles = exported.smiles;
      if (reference === submission) {
        return { ...result, correct: refStereo === subStereo,
          status: refStereo === subStereo ? "EQUIVALENT" : "DIFFERENT_STEREOCHEMISTRY" };
      }
      const elements = (m: GeneratedMolecule) => JSON.stringify(m.atoms.map((a) => a.element ?? "C").sort());
      let status: StructuralStatus = "DIFFERENT_STRUCTURE";
      if (elements(referenceMolecule) !== elements(submittedMolecule)) status = "DIFFERENT_ELEMENTS";
      else if (buildConstitutionalIdentity(referenceMolecule, "charge") === buildConstitutionalIdentity(submittedMolecule, "charge")) status = "DIFFERENT_FORMAL_CHARGE";
      else if (buildConstitutionalIdentity(referenceMolecule, "order") === buildConstitutionalIdentity(submittedMolecule, "order")) status = "DIFFERENT_BOND_ORDERS";
      return { ...result, status };
    } catch { return result; }
  };
}
