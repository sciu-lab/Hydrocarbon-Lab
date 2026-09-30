import type { GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import { deriveGenerationIdentity } from "./exercise-seed.ts";
import type { SessionConfig } from "./exercise-model.ts";
import { createSeededRng, deriveSeed } from "./seeded-rng.ts";
import { dedupeDistractorCandidates, DISTRACTOR_RECIPE_ORDER } from "./practice-distractor-engine.ts";
import type { DeterministicDistractorEngine, DistractorCandidate } from "./practice-distractor-engine.ts";
import { validateMultipleChoiceOptions } from "./practice-multiple-choice.ts";
import type { MultipleChoiceOption } from "./practice-multiple-choice.ts";

export type PracticeQuestionType = "naming" | "multiple-choice" | "build";
export type PracticeQuestionContext = { questionType: PracticeQuestionType; displayIndex: number };
export type GeneratedMultipleChoiceQuestion = GeneratedExerciseMolecule & {
  type: "multiple-choice"; options: readonly MultipleChoiceOption[]; correctOptionId: string; optionSetIdentity: string;
};
export type PracticeQuestion = (GeneratedExerciseMolecule & { type?: "naming" | "build" }) | GeneratedMultipleChoiceQuestion;
export type PracticeQuestionGenerator = (config: SessionConfig, generationIndex: number, context?: PracticeQuestionContext) => PracticeQuestion;
export const isMultipleChoiceQuestion = (question: PracticeQuestion): question is GeneratedMultipleChoiceQuestion => question.type === "multiple-choice";
export const isBuildQuestion = (question: PracticeQuestion) => question.type === "build";
export class InsufficientSafeDistractorsError extends Error {
  constructor() { super("insufficient-safe-distractors"); }
}
export function schedulePracticeQuestionType(config: SessionConfig, displayIndex: number): PracticeQuestionType {
  if (!Number.isSafeInteger(displayIndex) || displayIndex < 0) throw new RangeError("Invalid scheduling position.");
  const types = config.questionTypes;
  if (!types.length) throw new Error("No question types.");
  if (types.length === 1) return types[0];
  const block = Math.floor(displayIndex / types.length);
  const seed = deriveSeed(deriveGenerationIdentity(config, block).seed, "practice:question-types:block:v1");
  return createSeededRng(seed).shuffle(types)[displayIndex % types.length];
}

/** Verify the signature against the actual payload before trusting reconstruction. */
export function validateMultipleChoiceQuestion(question: GeneratedMultipleChoiceQuestion): boolean {
  return question.options.length === 4 && question.optionSetIdentity === JSON.stringify(question.options)
    && question.correctOptionId === question.options.find((option) => option.kind === "reference")?.id
    && validateMultipleChoiceOptions({ referenceNames: question.reference.names,
      referenceStructuralIdentity: question.reference.structuralIdentity, options: question.options }).valid;
}

function referenceOption(question: GeneratedExerciseMolecule): MultipleChoiceOption {
  return { id: deriveSeed(question.question.seed, "mcq:reference"), kind: "reference", correct: true,
    name: question.reference.names, origin: { kind: "reference" } };
}
export function evaluateMultipleChoiceEligibility(question: GeneratedExerciseMolecule, input: readonly DistractorCandidate[]) {
  const candidates = dedupeDistractorCandidates(input);
  const valid = validateMultipleChoiceOptions({ referenceNames: question.reference.names,
    referenceStructuralIdentity: question.reference.structuralIdentity, options: [referenceOption(question), ...candidates] }).valid;
  return valid && candidates.length >= 3 ? { eligible: true as const, candidates }
    : { eligible: false as const, reason: "insufficient-safe-distractors" as const, candidateCount: candidates.length };
}
export function assembleMultipleChoiceQuestion(question: GeneratedExerciseMolecule, input: readonly DistractorCandidate[]): GeneratedMultipleChoiceQuestion {
  const eligibility = evaluateMultipleChoiceEligibility(question, input);
  if (!eligibility.eligible) throw new InsufficientSafeDistractorsError();
  const groups = DISTRACTOR_RECIPE_ORDER.map((recipe) => createSeededRng(deriveSeed(question.question.seed, `mcq:selection:${recipe}:v1`))
    .shuffle(eligibility.candidates.filter((item) => item.origin.diagnosticCode === recipe))).filter((group) => group.length);
  const selected = groups.map((group) => group[0]).slice(0, 3);
  for (const group of groups) for (const candidate of group.slice(1)) {
    if (selected.length < 3) selected.push(candidate);
  }
  const reference = referenceOption(question);
  const options = createSeededRng(deriveSeed(question.question.seed, "mcq:option-order:v1")).shuffle([reference, ...selected]);
  return { ...question, type: "multiple-choice", options, correctOptionId: reference.id,
    optionSetIdentity: JSON.stringify(options) };
}
export function createPracticeQuestionGenerator(generate: (config: SessionConfig, index: number) => GeneratedExerciseMolecule,
  distractors: DeterministicDistractorEngine): PracticeQuestionGenerator {
  return (config, index, context) => {
    const question = generate(config, index);
    const type = context?.questionType ?? schedulePracticeQuestionType(config, index);
    if (type === "build") return { ...question, type: "build" };
    return type === "naming" ? question : assembleMultipleChoiceQuestion(question,
      distractors({ generatedMolecule: question, questionSeed: question.question.seed }));
  };
}
