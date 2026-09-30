import { Molecule as OCLMolecule, SmilesParser } from "openchemlib";
import { EXERCISE_CATEGORIES, GENERATOR_VERSION, normalizeSessionConfig } from "./exercise-model.ts";
import type { ExerciseCategory, QuestionIdentity, SessionConfig } from "./exercise-model.ts";
import { deriveGenerationIdentity } from "./exercise-seed.ts";
import { createSeededRng, deriveSeed } from "./seeded-rng.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import { EXERCISE_DOMAIN_VERSION, validateExerciseChemistry, validateExerciseDomain } from "./exercise-domain.ts";
import { buildExerciseChemicalCandidate } from "./exercise-chemical-candidate.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "./openchemlib-adapter.ts";
import { parseMolecularFormula } from "./formula-isomers.ts";
import type { ExerciseTopology } from "./exercise-domain.ts";

export const MAX_CHEMICAL_GENERATION_ATTEMPTS = 16;
export type CandidateRejection = { attempt: number; stage: "construction" | "chemical" | "domain" | "oracle"; reason: string };

export class ChemicalGenerationError extends Error {
  readonly code: "unsupported-request" | "attempts-exhausted";
  readonly rejections: readonly CandidateRejection[];
  constructor(code: ChemicalGenerationError["code"], message: string, rejections: readonly CandidateRejection[] = []) {
    super(message);
    this.name = "ChemicalGenerationError";
    this.code = code;
    this.rejections = rejections;
  }
}

export type GeneratedExerciseMolecule = {
  /** Locale-independent generation context, separate from the session identity. */
  question: QuestionIdentity;
  category: ExerciseCategory;
  /** Structural source of truth: the production editable molecular graph. */
  molecule: GeneratedMolecule;
  /** Derived from the real engine; these are references, not student evaluators. */
  reference: {
    name: string;
    names: { es: string; en: string };
    profiles: { es: "local-systematic-es"; en: "iupac-1979-legacy-en" };
    formula: string;
    smiles: string;
    structuralIdentity: string;
  };
  generation: {
    domainVersion: typeof EXERCISE_DOMAIN_VERSION;
    candidateSeed: string;
    attempt: number;
    topology: ExerciseTopology;
    rejections: CandidateRejection[];
  };
};

/** Existing tuple framing; candidate streams are isolated from all other indices. */
export function deriveChemicalCandidateSeed(questionSeed: string, category: ExerciseCategory, attempt: number) {
  if (!EXERCISE_CATEGORIES.includes(category) || !Number.isSafeInteger(attempt) || attempt < 0) {
    throw new RangeError("Invalid chemical candidate context.");
  }
  return deriveSeed(questionSeed, `chemical:${category}:candidate:${attempt}`);
}

/** Canonical OCL identity for duplicates in this generated domain, including E/Z.
 * It is not a general molecule comparator or a Build evaluator. No coordinates
 * or editor atom IDs enter the parsed SMILES graph's IDCode.
 */
export function exerciseStructuralIdentity(molecule: GeneratedMolecule): string {
  const exported = moleculeToSmiles(molecule);
  if (!exported.ok) throw new Error(exported.error);
  return parseDeterministicSmiles(exported.smiles).getIDCode();
}

function parseDeterministicSmiles(smiles: string) {
  const parser = new SmilesParser();
  // Match the existing editable SMILES adapter's fixed layout seed. Default
  // OCL parsing initializes its coordinate RNG from the clock, even though
  // coordinates are irrelevant to the formula and canonical structural ID.
  parser.setRandomSeed(20260814);
  return parser.parseMolecule(smiles);
}

function sameFormula(left: string, right: string) {
  const a = parseMolecularFormula(left);
  const b = parseMolecularFormula(right);
  return a.ok && b.ok && a.asciiFormula === b.asciiFormula;
}

function usableName(name: string) {
  return typeof name === "string" && Boolean(name.trim()) && name !== "-"
    && !/no disponible|unavailable|error|\?|grupo policíclico|cicloalcano de|\balquil\b|\balkyl\b/i.test(name);
}

/** Stateless synchronous core. Callers bind the existing engine via the oracle
 * adapter; this module imports no React or page.tsx. Difficulty has no recipe
 * thresholds. Generation seeds retain v1 difficulty semantics and exclude the
 * requested presentation locale.
 */
export function createRestrictedChemicalGenerator(oracles: ExerciseChemistryOracles) {
  return function generate(
    config: SessionConfig,
    questionIndex: number,
    options: { category?: ExerciseCategory; maxAttempts?: number } = {},
  ): GeneratedExerciseMolecule {
    const canonical = normalizeSessionConfig(config);
    if (canonical.generatorVersion !== GENERATOR_VERSION
      || !canonical.questionTypes.some((type) => type === "naming" || type === "multiple-choice" || type === "build")) {
      throw new ChemicalGenerationError("unsupported-request", "Chemical generation requires a supported question type.");
    }
    const question = deriveGenerationIdentity(canonical, questionIndex);
    const category = createSeededRng(deriveSeed(question.seed, "chemical-category")).pick(canonical.categories);
    // An optional requested category is an assertion, not an override of the
    // seed's selection. Otherwise one question identity could describe two graphs.
    if (options.category !== undefined && options.category !== category) {
      throw new ChemicalGenerationError("unsupported-request", "The requested category differs from this question's deterministic selection.");
    }
    const maxAttempts = options.maxAttempts ?? MAX_CHEMICAL_GENERATION_ATTEMPTS;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_CHEMICAL_GENERATION_ATTEMPTS) {
      throw new ChemicalGenerationError("unsupported-request", "Invalid chemical generation attempt limit.");
    }
    const rejections: CandidateRejection[] = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateSeed = deriveChemicalCandidateSeed(question.seed, category, attempt);
      let stage: CandidateRejection["stage"] = "construction";
      try {
        const molecule = buildExerciseChemicalCandidate(category, candidateSeed);
        stage = "chemical";
        const chemical = validateExerciseChemistry(molecule, oracles);
        if (!chemical.valid) { rejections.push({ attempt, stage, reason: chemical.reason }); continue; }
        stage = "domain";
        const domain = validateExerciseDomain(molecule, category, oracles);
        if (!domain.valid) { rejections.push({ attempt, stage, reason: domain.reason }); continue; }
        stage = "oracle";
        const reference = oracles.reference(molecule);
        if (!reference.namingSupported || !usableName(reference.names.es) || !usableName(reference.names.en)) {
          rejections.push({ attempt, stage, reason: "naming-unavailable" }); continue;
        }
        const expectedFamily = domain.topology === "acyclic" ? "acyclic"
          : domain.topology === "simple-carbocycle" ? "cycloalkane" : "aromatic";
        if (reference.family !== expectedFamily) {
          rejections.push({ attempt, stage, reason: "analysis-topology-mismatch" }); continue;
        }
        const exported = moleculeToSmiles(molecule);
        if (!exported.ok) { rejections.push({ attempt, stage, reason: "smiles-export-failed" }); continue; }
        const parsed = parseDeterministicSmiles(exported.smiles);
        parsed.ensureHelperArrays(OCLMolecule.cHelperCIP);
        const hasTetrahedralStereo = Array.from({ length: parsed.getAllAtoms() }, (_, index) => parsed.getAtomParity(index))
          .some((parity) => parity === OCLMolecule.cAtomParity1 || parity === OCLMolecule.cAtomParity2);
        if (!sameFormula(reference.formula, parsed.getMolecularFormula().formula) || hasTetrahedralStereo) {
          rejections.push({ attempt, stage, reason: "formula-or-stereo-mismatch" }); continue;
        }
        const restored = moleculeFromSmiles(exported.smiles);
        if (!restored.ok || !validateExerciseDomain(restored.molecule, category, oracles).valid) {
          rejections.push({ attempt, stage, reason: "round-trip-domain-loss" }); continue;
        }
        const identity = exerciseStructuralIdentity(molecule);
        const restoredReference = oracles.reference(restored.molecule);
        if (identity !== exerciseStructuralIdentity(restored.molecule)
          || !sameFormula(reference.formula, restoredReference.formula)
          || !restoredReference.namingSupported
          || reference.names.es !== restoredReference.names.es || reference.names.en !== restoredReference.names.en) {
          rejections.push({ attempt, stage, reason: "round-trip-oracle-loss" }); continue;
        }
        if (category === "ez" && [reference.names.es, reference.names.en].some((name) => !/\(\d+[EZ]\)/.test(name))) {
          rejections.push({ attempt, stage, reason: "ez-name-missing" }); continue;
        }
        return {
          question, category, molecule,
          reference: {
            name: reference.names[canonical.locale], names: { ...reference.names },
            profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" },
            formula: reference.formula, smiles: exported.smiles, structuralIdentity: identity,
          },
          generation: { domainVersion: EXERCISE_DOMAIN_VERSION, candidateSeed, attempt, topology: domain.topology, rejections },
        };
      } catch (error) {
        rejections.push({ attempt, stage, reason: error instanceof Error ? error.message : "candidate-failed" });
      }
    }
    throw new ChemicalGenerationError("attempts-exhausted", `No valid ${category} molecule after ${maxAttempts} attempts.`, rejections);
  };
}
