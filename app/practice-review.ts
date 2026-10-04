import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { isBuildQuestion, isMultipleChoiceQuestion, validateMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestion, GeneratedMultipleChoiceQuestion } from "./practice-question.ts";
import { exerciseStructuralIdentity } from "./exercise-chemical-generator.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import type { AppLanguage } from "./i18n.ts";
import { formatName, generateLegacyEnglishName, englishStructuralSubstituentName, compareLocantSets } from "./legacy-english-nomenclature.ts";
import type { LegacyEnglishNameModel } from "./legacy-english-nomenclature.ts";
import { inspectDoubleBondStereochemistry } from "./double-bond-stereochemistry.ts";
import { diagnosePracticeAnswer } from "./practice-review-diagnosis.ts";

export type ReviewTerm = { es: string; en: string };
export type ReviewParams = Record<string, string | number | readonly number[] | ReviewTerm>;
export type ReviewHighlights = {
  highlightAtomIds: readonly number[];
  highlightBondIds: readonly string[];
  numbering?: readonly { atomId: number; locant: number }[];
};
export type ReviewStep = ReviewHighlights & {
  id: string;
  kind: "parent" | "function" | "numbering" | "unsaturation" | "substituent" | "alphabetical" | "ester-alkyl" | "ez" | "assembly";
  titleKey: string;
  messageKey: string;
  params: ReviewParams;
};
export type ReviewIssueCode =
  | "WRONG_PARENT_CHAIN" | "WRONG_PARENT_LENGTH" | "WRONG_NUMBERING_DIRECTION"
  | "MISSING_SUBSTITUENT" | "EXTRA_SUBSTITUENT" | "WRONG_SUBSTITUENT_LOCANT"
  | "WRONG_ALPHABETICAL_ORDER" | "WRONG_FUNCTIONAL_GROUP" | "WRONG_FUNCTIONAL_GROUP_LOCANT"
  | "WRONG_UNSATURATION_LOCANT" | "WRONG_SUFFIX" | "WRONG_EZ_DESCRIPTOR" | "UNKNOWN_MISMATCH" | "UNKNOWN_STRUCTURAL_MISMATCH";
export type ReviewIssue = {
  code: ReviewIssueCode; messageKey: string; params: ReviewParams;
  relatedAtomIds: readonly number[]; relatedBondIds: readonly string[];
};
export type ReviewModel = {
  version: 1;
  questionId: string; generationIndex: number; attemptNumber: number;
  status: "CORRECT" | "INCORRECT";
  submittedLocale: AppLanguage; studentAnswer: string;
  reference: { names: ReviewTerm; structuralIdentity: string };
  steps: readonly ReviewStep[]; issues: readonly ReviewIssue[];
};

/** Structural data already exposed by analyzeMolecule, before its prose reasoning. */
export type PracticeNamingAnalysis = {
  name: string; formula: string; family: string; chainName: string;
  mainChain: number[]; numberedAtoms: ReadonlyMap<number, number>;
  primaryFunctionalGroup?: string;
  doubleBondLocants: number[]; tripleBondLocants: number[];
  substituents: { locant: number; name: string; complex: boolean; atomIds: number[] }[];
  functionalGroups: { kind: string; atomIds: number[]; carbonIds: number[]; carbonId: number;
    heteroAtomId: number; alkylCarbonId?: number }[];
};
export type PracticeReviewer = (question: PracticeQuestion, attempt: AttemptRecord) => ReviewModel;
export const reviewBondId = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
const unique = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
const term = (name: string): ReviewTerm => ({ es: name, en: englishStructuralSubstituentName(name) });

function bondsWithin(molecule: GeneratedMolecule, atoms: readonly number[]) {
  const set = new Set(atoms);
  return molecule.bonds.filter(([a, b]) => set.has(a) && set.has(b)).map(([a, b]) => reviewBondId(a, b)).sort();
}

/** Connectivity for visual provenance only; the engine has already selected the parent. */
function sideAtoms(molecule: GeneratedMolecule, seeds: readonly number[], parent: readonly number[]) {
  const blocked = new Set(parent), seen = new Set<number>();
  const pending = seeds.filter((id) => !blocked.has(id));
  while (pending.length) {
    const id = pending.pop()!;
    if (blocked.has(id) || seen.has(id)) continue;
    seen.add(id);
    for (const [a, b] of molecule.bonds) {
      if (a === id && !blocked.has(b)) pending.push(b);
      if (b === id && !blocked.has(a)) pending.push(a);
    }
  }
  return unique([...seen]);
}

export function buildPracticeReviewSteps(molecule: GeneratedMolecule, analysis: PracticeNamingAnalysis,
  legacy: LegacyEnglishNameModel, names: ReviewTerm): ReviewStep[] {
  const steps: ReviewStep[] = [];
  const parent = [...analysis.mainChain];
  const bareEnglishParent = formatName({ ...legacy, substituents: [], stereochemicalPrefix: undefined });
  function add(id: string, kind: ReviewStep["kind"], messageKey: string, params: ReviewParams, atoms: readonly number[],
    numbering?: ReviewHighlights["numbering"]) {
    const highlightAtomIds = unique(atoms);
    steps.push({ id, kind, titleKey: `review.title.${kind}`, messageKey, params,
      highlightAtomIds, highlightBondIds: bondsWithin(molecule, highlightAtomIds), ...(numbering ? { numbering } : {}) });
  }
  add("parent", "parent", `review.parent.${analysis.primaryFunctionalGroup === "ester" ? "ester"
    : analysis.family === "aromatic" ? "aromatic" : analysis.family === "cycloalkane" ? "ring" : "chain"}`,
    { count: parent.length, name: { es: analysis.chainName, en: bareEnglishParent } }, parent);

  const principal = analysis.functionalGroups.filter((g) => g.kind === analysis.primaryFunctionalGroup);
  const principalLocants = unique(principal.flatMap((g) => g.carbonIds
    .map((id) => analysis.numberedAtoms.get(id)).filter((n): n is number => n !== undefined)));
  if (principal.length) add("function", "function", "review.function",
    { group: analysis.primaryFunctionalGroup!, locants: principalLocants }, principal.flatMap((g) => g.atomIds));
  else if (analysis.functionalGroups.some((g) => g.kind === "ether")) {
    add("ether", "function", "review.ether", {}, analysis.functionalGroups.filter((g) => g.kind === "ether").flatMap((g) => g.atomIds));
  }

  const substituentLocants = analysis.substituents.map((s) => s.locant).sort((a, b) => a - b);
  const multipleLocants = unique([...analysis.doubleBondLocants, ...analysis.tripleBondLocants]);
  if (principalLocants.length || substituentLocants.length || multipleLocants.length) {
    const numbering = parent.map((atomId) => ({ atomId, locant: analysis.numberedAtoms.get(atomId)! }));
    if (analysis.family !== "acyclic") {
      add("numbering", "numbering", "review.numbering.ring", { selected: substituentLocants }, parent, numbering);
    } else {
      // The same graph-derived hierarchy and lexicographic locant comparison used by the Lab.
      const criteria = [
        { key: "function", locants: principalLocants, reverse: principalLocants.map((n) => parent.length + 1 - n).sort((a, b) => a - b) },
        { key: "unsaturation", locants: multipleLocants, reverse: multipleLocants.map((n) => parent.length - n).sort((a, b) => a - b) },
        { key: "substituent", locants: substituentLocants, reverse: substituentLocants.map((n) => parent.length + 1 - n).sort((a, b) => a - b) },
      ];
      const decisive = criteria.find((c) => c.locants.length && compareLocantSets(c.locants, c.reverse) !== 0);
      const criterion = decisive ?? criteria.find((c) => c.locants.length)!;
      // Do not assert that an arbitrary drawn end won, or that a tie decided the direction.
      add("numbering", "numbering", decisive && compareLocantSets(decisive.locants, decisive.reverse) < 0
        ? `review.numbering.${decisive.key}` : decisive ? "review.numbering.selected" : "review.numbering.tie",
      { selected: criterion.locants, reverse: criterion.reverse }, parent, numbering);
    }
  }

  for (const [order, locants] of [[2, analysis.doubleBondLocants], [3, analysis.tripleBondLocants]] as const) {
    for (const locant of locants) {
      const ids = parent.slice(locant - 1, locant + 1);
      add(`unsaturation:${order}:${locant}`, "unsaturation", "review.unsaturation", { order, locant, next: locant + 1 }, ids);
    }
  }

  const groups = new Map<string, typeof analysis.substituents>();
  for (const substituent of analysis.substituents) groups.set(substituent.name, [...groups.get(substituent.name) ?? [], substituent]);
  for (const [name, items] of groups) {
    const branch = sideAtoms(molecule, items.flatMap((s) => s.atomIds), parent);
    const anchors = molecule.bonds.flatMap(([a, b]) => parent.includes(a) && branch.includes(b) ? [a]
      : parent.includes(b) && branch.includes(a) ? [b] : []);
    add(`substituent:${name}`, "substituent", items.length > 1 ? "review.substituent.multiple" : "review.substituent",
      { name: term(name), locants: items.map((s) => s.locant).sort((a, b) => a - b), count: items.length }, [...branch, ...anchors]);
  }
  if (groups.size > 1) {
    const ordered = (language: AppLanguage) => [...groups.keys()].map((name) => term(name)[language])
      .sort((a, b) => names[language].indexOf(a) - names[language].indexOf(b)).join(", ");
    add("alphabetical", "alphabetical", "review.alphabetical", { names: { es: ordered("es"), en: ordered("en") } },
      steps.filter((s) => s.kind === "substituent").flatMap((s) => s.highlightAtomIds));
  }

  const esters = analysis.functionalGroups.filter((g) => g.kind === "ester");
  esters.forEach((group, index) => {
    const attachedName = legacy.functionalGroups.filter((g) => g.kind === "ester")[index]?.attachedAlkylName;
    if (group.alkylCarbonId !== undefined && attachedName) {
      const alkyl = sideAtoms(molecule, [group.alkylCarbonId], [...parent, ...group.atomIds.filter((id) => id !== group.alkylCarbonId)]);
      const linkage = group.atomIds.filter((id) => molecule.atoms.find((a) => a.id === id)?.element === "O"
        && molecule.bonds.some(([a, b, order = 1]) => order === 1 && ((a === id && alkyl.includes(b)) || (b === id && alkyl.includes(a)))));
      add(`ester-alkyl:${index}`, "ester-alkyl", "review.ester-alkyl", { name: term(attachedName), count: parent.length }, [...alkyl, ...linkage]);
    }
  });

  for (const locant of analysis.doubleBondLocants) {
    const [a, b] = parent.slice(locant - 1, locant + 1);
    if (!molecule.bonds.some(([left, right, order, explicit]) => explicit && order === 2
      && ((left === a && right === b) || (left === b && right === a)))) continue;
    const inspection = inspectDoubleBondStereochemistry(molecule, a, b);
    if (inspection.stereogenic && inspection.configuration && inspection.priorityAtomIds) {
      add(`ez:${locant}`, "ez", `review.ez.${inspection.configuration}`, { locant, descriptor: inspection.configuration },
        [a, b, ...inspection.priorityAtomIds]);
    }
  }
  add("assembly", "assembly", "review.assembly", { name: { ...names } }, molecule.atoms.map((a) => a.id));
  return steps;
}

/** Bind the existing engine once. Review consumes a frozen outcome; it never evaluates again. */
export function createPracticeReviewer<A extends PracticeNamingAnalysis>(engine: {
  analyzeMolecule(molecule: GeneratedMolecule): A;
  buildLegacyEnglishNameModel(molecule: GeneratedMolecule, analysis: A): LegacyEnglishNameModel;
}): PracticeReviewer {
  return (question, attempt) => {
    if (attempt.questionId !== question.question.id || attempt.structuralIdentity !== question.reference.structuralIdentity
      || attempt.generatorVersion !== question.question.generatorVersion || attempt.category !== question.category
      || attempt.questionSeed !== question.question.seed
      || exerciseStructuralIdentity(question.molecule) !== question.reference.structuralIdentity) {
      throw new Error("Review question/attempt identity mismatch.");
    }
    const analysis = engine.analyzeMolecule(question.molecule);
    const legacy = engine.buildLegacyEnglishNameModel(question.molecule, analysis);
    if (analysis.name !== question.reference.names.es || generateLegacyEnglishName(legacy).name !== question.reference.names.en) {
      throw new Error("Review reference analysis mismatch.");
    }
    const steps = buildPracticeReviewSteps(question.molecule, analysis, legacy, question.reference.names);
    let issues: readonly ReviewIssue[];
    if (isBuildQuestion(question)) {
      if (attempt.questionType !== "build" || !attempt.structuralAnswer?.checks.submissionValid
        || attempt.structuralAnswer.correct !== attempt.correct) throw new Error("Review Build type mismatch.");
      issues = attempt.correct ? [] : [{ code: "UNKNOWN_STRUCTURAL_MISMATCH", messageKey: "review.build.mismatch",
        params: {}, relatedAtomIds: [], relatedBondIds: [] }];
    } else if (isMultipleChoiceQuestion(question)) {
      issues = reviewMultipleChoiceSelection(question, attempt, steps);
    } else {
      if (attempt.questionType !== "naming") throw new Error("Review type mismatch.");
      issues = attempt.correct ? [] : diagnosePracticeAnswer(question, attempt, analysis, legacy, steps);
    }
    return {
      version: 1, questionId: attempt.questionId, generationIndex: attempt.generationIndex, attemptNumber: attempt.attemptNumber,
      status: attempt.correct ? "CORRECT" : "INCORRECT", submittedLocale: attempt.localeAtSubmission,
      studentAnswer: attempt.answer, reference: { names: { ...question.reference.names }, structuralIdentity: attempt.structuralIdentity },
      steps, issues,
    };
  };
}

function reviewMultipleChoiceSelection(question: GeneratedMultipleChoiceQuestion, attempt: AttemptRecord,
  steps: readonly ReviewStep[]): readonly ReviewIssue[] {
  const option = question.options.find((item) => item.id === attempt.selectedOptionId);
  if (!validateMultipleChoiceQuestion(question) || attempt.questionType !== "multiple-choice" || attempt.optionSetIdentity !== question.optionSetIdentity
    || !option || option.correct !== attempt.correct) throw new Error("Review option identity mismatch.");
  if (option.kind === "reference") return [];
  const { diagnosticCode: code, transformation: transform } = option.origin;
  let params: ReviewParams = {}, step: ReviewStep | undefined;
  if (transform.kind === "replace-parent-length") {
    params = { expected: transform.from, actual: transform.to }; step = steps.find((item) => item.kind === "parent");
  } else if (transform.kind === "replace-locant") {
    params = { expected: transform.from, actual: transform.to };
    step = steps.find((item) => item.kind === (transform.component === "function" ? "function" : transform.component)
      && (transform.component !== "substituent" || !transform.name || item.id === `substituent:${transform.name}`));
  } else if (transform.kind === "omit-substituent") {
    params = { name: term(transform.name) }; step = steps.find((item) => item.id === `substituent:${transform.name}`);
  } else if (transform.kind === "opposite-ez-descriptor") {
    params = { descriptor: transform.from, locant: transform.locant }; step = steps.find((item) => item.id === `ez:${transform.locant}`);
  } else throw new Error("Unsupported review provenance.");
  if (!step) throw new Error("Review provenance has no structural step.");
  return [{ code, messageKey: code === "WRONG_PARENT_LENGTH" ? "review.mcq.parent-length"
    : code === "MISSING_SUBSTITUENT" ? "review.mcq.omitted-substituent" : `review.issue.${code}`,
  params, relatedAtomIds: step.highlightAtomIds, relatedBondIds: step.highlightBondIds }];
}
