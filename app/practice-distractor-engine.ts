import { exerciseStructuralIdentity, type GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { getMainChainStereoDescriptors, type StereoConfiguration } from "./double-bond-stereochemistry.ts";
import { generateLegacyEnglishName } from "./legacy-english-nomenclature.ts";
import type { PracticeNamingAnalysis } from "./practice-review.ts";
import { validateMultipleChoiceOptions } from "./practice-multiple-choice.ts";
import type { LocalizedOptionName, MultipleChoiceDistractorOption } from "./practice-multiple-choice.ts";
import { matchesHydrocarbonReferenceName, normalizeReferenceNameTypography } from "./practice-reference-answer.ts";
import { createSeededRng, deriveSeed } from "./seeded-rng.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import { generateGraphDistractors } from "./practice-distractor-recipes.ts";
import { VERIFIED_GRAPH_RECIPES } from "./practice-multiple-choice.ts";
import { validateExerciseDomain } from "./exercise-domain.ts";

export const DISTRACTOR_RECIPE_ORDER = Object.freeze(["WRONG_EZ_DESCRIPTOR", ...VERIFIED_GRAPH_RECIPES] as const);

export type DistractorNamingEngine = {
  analyzeMolecule(molecule: GeneratedMolecule): PracticeNamingAnalysis;
  buildLegacyEnglishNameModel(molecule: GeneratedMolecule, analysis: PracticeNamingAnalysis): Parameters<typeof generateLegacyEnglishName>[0];
};

export type DistractorCandidate = MultipleChoiceDistractorOption;

export type DistractorEngineInput = Readonly<{
  generatedMolecule: GeneratedExerciseMolecule;
  questionSeed: string;
}>;

export type DeterministicDistractorEngine = (input: DistractorEngineInput) => DistractorCandidate[];

function sameReference(actual: LocalizedOptionName, expected: LocalizedOptionName) {
  return actual.es === expected.es && actual.en === expected.en;
}

/**
 * Keeps first-seen options in canonical producer order. A collision in either
 * locale rejects the later candidate, matching the shared option validator.
 */
export function dedupeDistractorCandidates(
  candidates: readonly MultipleChoiceDistractorOption[],
): MultipleChoiceDistractorOption[] {
  const seen: Record<"es" | "en", Set<string>> = { es: new Set(), en: new Set() };
  const result: MultipleChoiceDistractorOption[] = [];
  for (const candidate of candidates) {
    const es = normalizeReferenceNameTypography(candidate.name.es, "es");
    const en = normalizeReferenceNameTypography(candidate.name.en, "en");
    if (!es || !en || seen.es.has(es) || seen.en.has(en)) continue;
    seen.es.add(es);
    seen.en.add(en);
    result.push(candidate);
  }
  return result;
}

/** Pure deterministic candidate producer; it neither mutates nor replaces chemistry. */
export function createDeterministicDistractorEngine(engine: DistractorNamingEngine, oracles?: ExerciseChemistryOracles): DeterministicDistractorEngine {
  const generateEz: DeterministicDistractorEngine = function generateDistractorCandidates({ generatedMolecule, questionSeed }: DistractorEngineInput) {
    const question = generatedMolecule.question;
    if (typeof questionSeed !== "string" || !questionSeed || questionSeed !== question.seed) {
      throw new Error("Distractor question seed does not match the generated question.");
    }
    if (generatedMolecule.category !== "ez") return [];

    let analysis: PracticeNamingAnalysis;
    let names: LocalizedOptionName;
    try {
      if (exerciseStructuralIdentity(generatedMolecule.molecule) !== generatedMolecule.reference.structuralIdentity) return [];
      analysis = engine.analyzeMolecule(generatedMolecule.molecule);
      const english = generateLegacyEnglishName(engine.buildLegacyEnglishNameModel(generatedMolecule.molecule, analysis)).name;
      names = { es: analysis.name, en: english };
      if (!sameReference(names, generatedMolecule.reference.names)
        || (generatedMolecule.reference.name !== names.es && generatedMolecule.reference.name !== names.en)) return [];
    } catch {
      return [];
    }

    const descriptors = getMainChainStereoDescriptors(
      generatedMolecule.molecule,
      analysis.mainChain,
      true,
    ).sort((left, right) => left.locant - right.locant);
    if (!descriptors.length || new Set(descriptors.map(({ locant }) => locant)).size !== descriptors.length) return [];

    const descriptorPrefix = `(${descriptors.map(({ locant, configuration }) => `${locant}${configuration}`).join(",")})-`;
    if (!names.es.startsWith(descriptorPrefix) || !names.en.startsWith(descriptorPrefix)) return [];

    const variants = descriptors.map((descriptor) => {
      const to: StereoConfiguration = descriptor.configuration === "E" ? "Z" : "E";
      const changedPrefix = `(${descriptors.map((item) => `${item.locant}${item.locant === descriptor.locant ? to : item.configuration}`).join(",")})-`;
      return {
        descriptor,
        to,
        names: {
          es: `${changedPrefix}${names.es.slice(descriptorPrefix.length)}`,
          en: `${changedPrefix}${names.en.slice(descriptorPrefix.length)}`,
        },
      };
    }).sort((left, right) => left.descriptor.locant - right.descriptor.locant);

    // Recipe-specific entropy is isolated so later recipes cannot perturb it.
    const variantSeed = deriveSeed(questionSeed, "mcq:distractor:WRONG_EZ_DESCRIPTOR:variant");
    const selected = variants[createSeededRng(variantSeed).int(0, variants.length - 1)];
    const { descriptor, to, names: candidateNames } = selected;
    const candidate: MultipleChoiceDistractorOption = {
      id: deriveSeed(questionSeed, `mcq:distractor:WRONG_EZ_DESCRIPTOR:${descriptor.locant}`),
      kind: "distractor",
      name: candidateNames,
      correct: false,
      origin: {
        kind: "recipe",
        recipeId: "wrong-ez-descriptor",
        diagnosticCode: "WRONG_EZ_DESCRIPTOR",
        transformation: {
          kind: "opposite-ez-descriptor",
          locant: descriptor.locant,
          from: descriptor.configuration,
          to,
        },
      },
    };

    if (candidate.origin.diagnosticCode !== DISTRACTOR_RECIPE_ORDER[0]
      || (matchesHydrocarbonReferenceName(candidateNames.es, names.es, "es")
        || matchesHydrocarbonReferenceName(candidateNames.en, names.en, "en"))) return [];

    const referenceOption = {
      id: deriveSeed(questionSeed, "mcq:reference"),
      kind: "reference" as const,
      name: names,
      correct: true as const,
      origin: { kind: "reference" as const },
    };
    const deduped = dedupeDistractorCandidates([candidate]);
    if (!deduped.length) return [];
    const validation = validateMultipleChoiceOptions({ referenceNames: names, options: [referenceOption, ...deduped] });
    return validation.valid ? deduped : [];
  };
  return (input) => {
    const ez = generateEz(input);
    if (!oracles) return ez;
    try {
      const source = input.generatedMolecule;
      if (!validateExerciseDomain(source.molecule, source.category, oracles).valid) return [];
      const reference = oracles.reference(source.molecule);
      if (exerciseStructuralIdentity(source.molecule) !== source.reference.structuralIdentity
        || !reference.namingSupported || !sameReference(reference.names, source.reference.names)) return [];
      const candidates = dedupeDistractorCandidates([...ez, ...generateGraphDistractors(input, engine, oracles)])
        .sort((a, b) => DISTRACTOR_RECIPE_ORDER.indexOf(a.origin.diagnosticCode as typeof DISTRACTOR_RECIPE_ORDER[number])
          - DISTRACTOR_RECIPE_ORDER.indexOf(b.origin.diagnosticCode as typeof DISTRACTOR_RECIPE_ORDER[number]));
      return validateMultipleChoiceOptions({ referenceNames: source.reference.names,
        referenceStructuralIdentity: source.reference.structuralIdentity,
        options: [{ id: deriveSeed(input.questionSeed, "mcq:reference"), kind: "reference", name: source.reference.names,
          correct: true, origin: { kind: "reference" } }, ...candidates] }).valid ? candidates : [];
    } catch { return []; }
  };
}

