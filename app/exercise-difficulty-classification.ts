import type { ExerciseCategory, ExerciseDifficulty } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import { validateExerciseChemistry } from "./exercise-domain.ts";
import { validateEasyExercise, validateEasyParent } from "./exercise-easy-profile.ts";
import { validateIntermediateExercise, validateIntermediateParent } from "./exercise-intermediate-profile.ts";
import { validateHardFoundationExercise } from "./exercise-advanced-profile.ts";

/** Minimum eligible structural profile for a supplied pedagogical anchor.
 * Unsupported is explicit; advanced is never a catch-all. No production routing. */
export function classifyMinimumExerciseDifficulty(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles): ExerciseDifficulty | "unsupported" {
  if (!validateExerciseChemistry(molecule, oracles).valid) return "unsupported";
  try {
    const reference = oracles.reference(molecule);
    if (!reference.namingSupported) return "unsupported";
    if (validateEasyExercise(molecule, category, oracles).valid && validateEasyParent(molecule, category, reference).valid) return "basic";
    if (validateIntermediateExercise(molecule, category, oracles).valid && validateIntermediateParent(molecule, category, reference).valid) return "intermediate";
    return validateHardFoundationExercise(molecule, category, oracles, reference).valid ? "advanced" : "unsupported";
  } catch { return "unsupported"; }
}
