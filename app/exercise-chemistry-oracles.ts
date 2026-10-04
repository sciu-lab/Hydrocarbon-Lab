import { generateLegacyEnglishName } from "./legacy-english-nomenclature.ts";
import type { LegacyEnglishNameModel, LegacyFunctionalGroup } from "./legacy-english-nomenclature.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";

export type ExerciseFunctionalGroup = { kind: string; atomIds: number[] };

/** The existing analysis can carry additional fields; no molecular model is duplicated. */
type AnalysisSource = {
  name: string;
  formula: string;
  family: "acyclic" | "cycloalkane" | "aromatic" | "polycyclic";
};

export type ExerciseReference = AnalysisSource & {
  names: { es: string; en: string };
  namingSupported: boolean;
  /** Structural parent evidence already computed for the EN reference. */
  parent?: Pick<LegacyEnglishNameModel["parent"], "carbonCount" | "atomIds">;
  principalFunctionalGroup?: string;
  /** Existing nomenclature evidence, not part of generated question payloads. */
  functionalGroups?: readonly LegacyFunctionalGroup[];
};

export type ExerciseChemistryOracles = {
  findMoleculeValenceViolation(molecule: GeneratedMolecule): unknown | null;
  detectFunctionalGroups(molecule: GeneratedMolecule): ExerciseFunctionalGroup[];
  reference(molecule: GeneratedMolecule): ExerciseReference;
};

/**
 * Bind the application's existing pure chemistry functions once at the caller.
 * The engine currently exports these from page.tsx. Dependency injection keeps
 * React, UI state and that module's initialization out of the generator core.
 * ES uses the graph-derived system name; EN uses the established 1979 profile.
 */
export function createExerciseChemistryOracles<A extends AnalysisSource>(engine: {
  analyzeMolecule(molecule: GeneratedMolecule): A;
  findMoleculeValenceViolation(molecule: GeneratedMolecule): unknown | null;
  detectFunctionalGroups(molecule: GeneratedMolecule): ExerciseFunctionalGroup[];
  buildLegacyEnglishNameModel(molecule: GeneratedMolecule, analysis: A): LegacyEnglishNameModel;
  localNamerCannotSafelyName(molecule: GeneratedMolecule, analysis: A): boolean;
}): ExerciseChemistryOracles {
  return {
    findMoleculeValenceViolation: (molecule) => engine.findMoleculeValenceViolation(molecule),
    detectFunctionalGroups: (molecule) => engine.detectFunctionalGroups(molecule),
    reference(molecule) {
      const analysis = engine.analyzeMolecule(molecule);
      const model = engine.buildLegacyEnglishNameModel(molecule, analysis);
      const english = generateLegacyEnglishName(model);
      return {
        name: analysis.name,
        formula: analysis.formula,
        family: analysis.family,
        names: {
          es: analysis.name,
          en: english.name,
        },
        namingSupported: !engine.localNamerCannotSafelyName(molecule, analysis),
        parent: { carbonCount: model.parent.carbonCount, atomIds: [...model.parent.atomIds] },
        principalFunctionalGroup: english.reasoning.principalFunctionalGroup,
        functionalGroups: model.functionalGroups.map((group) => ({ ...group })),
      };
    },
  };
}
