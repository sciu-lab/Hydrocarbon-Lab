import type { GeneratedExerciseMolecule } from "./exercise-chemical-generator.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import type { LegacyEnglishNameModel } from "./legacy-english-nomenclature.ts";
import { englishStructuralSubstituentName, formatName } from "./legacy-english-nomenclature.ts";
import { englishIupacRoot, iupacRootForCarbonCount } from "./iupac-prefixes.ts";
import { normalizeReferenceNameTypography } from "./practice-reference-answer.ts";
import type { PracticeNamingAnalysis, ReviewIssue, ReviewIssueCode, ReviewStep, ReviewParams } from "./practice-review.ts";

export const REVIEW_DIAGNOSIS_SUPPORT: Readonly<Record<ReviewIssueCode,
  "SUPPORTED" | "SUPPORTED_WITH_RESTRICTIONS" | "NOT_YET_DIAGNOSABLE">> = {
  WRONG_PARENT_CHAIN: "NOT_YET_DIAGNOSABLE", WRONG_PARENT_LENGTH: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_NUMBERING_DIRECTION: "SUPPORTED_WITH_RESTRICTIONS", MISSING_SUBSTITUENT: "SUPPORTED_WITH_RESTRICTIONS",
  EXTRA_SUBSTITUENT: "NOT_YET_DIAGNOSABLE", WRONG_SUBSTITUENT_LOCANT: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_ALPHABETICAL_ORDER: "SUPPORTED_WITH_RESTRICTIONS", WRONG_FUNCTIONAL_GROUP: "NOT_YET_DIAGNOSABLE",
  WRONG_FUNCTIONAL_GROUP_LOCANT: "SUPPORTED_WITH_RESTRICTIONS", WRONG_UNSATURATION_LOCANT: "SUPPORTED_WITH_RESTRICTIONS",
  WRONG_SUFFIX: "SUPPORTED_WITH_RESTRICTIONS", WRONG_EZ_DESCRIPTOR: "SUPPORTED_WITH_RESTRICTIONS", UNKNOWN_MISMATCH: "SUPPORTED",
};

type Slot = { start: number; end: number; locant: number; kind: "substituent" | "function" | "unsaturation"; step: ReviewStep };
const replace = (text: string, start: number, end: number, replacement: string) => text.slice(0, start) + replacement + text.slice(end);

/**
 * Recognize bounded, one-component edits of the official reference. No answer parser,
 * synonym equivalence, intent inference, or reconstruction of a student's molecule.
 * Unchanged components must match the entire remaining normalized reference exactly.
 */
export function diagnosePracticeAnswer(question: GeneratedExerciseMolecule, attempt: AttemptRecord,
  analysis: PracticeNamingAnalysis, legacy: LegacyEnglishNameModel, steps: readonly ReviewStep[]): ReviewIssue[] {
  if (attempt.correct) return [];
  const locale = attempt.localeAtSubmission;
  const normalize = (text: string) => normalizeReferenceNameTypography(text, locale);
  const reference = normalize(question.reference.names[locale]), answer = normalize(attempt.answer);
  const parentStep = steps.find((s) => s.kind === "parent")!;
  const issue = (code: ReviewIssueCode, step = parentStep, params: ReviewParams = {}): ReviewIssue[] => [{
    code, messageKey: `review.issue.${code}`, params,
    relatedAtomIds: [...step.highlightAtomIds], relatedBondIds: [...step.highlightBondIds],
  }];

  // A descriptor-only mismatch is causal before any lower-level component check.
  for (const stereo of steps.filter((s) => s.kind === "ez")) {
    const locant = stereo.params.locant, descriptor = stereo.params.descriptor;
    const token = `(${locant}${String(descriptor).toLowerCase()})`;
    if (reference.startsWith(token) && answer === replace(reference, 0, token.length,
      `(${locant}${descriptor === "E" ? "z" : "e"})`)) {
      return issue("WRONG_EZ_DESCRIPTOR", stereo, { descriptor: String(descriptor), locant: Number(locant) });
    }
  }

  const slots: Slot[] = [];
  const prefixes: { start: number; end: number; text: string; step: ReviewStep }[] = [];
  for (const substituent of analysis.substituents) {
    if (substituent.complex || analysis.substituents.filter((s) => s.name === substituent.name).length !== 1) continue;
    const name = normalize(locale === "es" ? substituent.name : englishStructuralSubstituentName(substituent.name));
    const token = `${substituent.locant}-${name}`;
    const start = reference.indexOf(token);
    const step = steps.find((s) => s.id === `substituent:${substituent.name}`)!;
    // Numeric boundaries prevent borrowing '2-' from a written '12-'.
    if (start < 0 || (start > 0 && /\d/.test(reference[start - 1])) || reference.indexOf(token, start + 1) >= 0) continue;
    slots.push({ start, end: start + String(substituent.locant).length, locant: substituent.locant, kind: "substituent", step });
    prefixes.push({ start, end: start + token.length, text: token, step });
  }

  const bareParent = normalize(locale === "es" ? analysis.chainName
    : formatName({ ...legacy, substituents: [], stereochemicalPrefix: undefined }));
  const parentStart = reference.lastIndexOf(bareParent);
  if (parentStart >= 0 && reference.endsWith(bareParent) && analysis.family === "acyclic") {
    const group = analysis.primaryFunctionalGroup;
    const functional = analysis.functionalGroups.filter((g) => g.kind === group);
    const multiple = [...analysis.doubleBondLocants, ...analysis.tripleBondLocants];
    const suffixLocant = locale === "es" ? /-(\d+)-(?:ol|ona|amina)$/.exec(bareParent) : /^(\d+)-/.exec(bareParent);
    if (functional.length === 1 && ["alcohol", "ketone", "amine"].includes(group ?? "") && suffixLocant) {
      const locant = analysis.numberedAtoms.get(functional[0].carbonId);
      if (locant === Number(suffixLocant[1])) {
        const start = parentStart + suffixLocant.index + (locale === "es" ? 1 : 0);
        slots.push({ start, end: start + suffixLocant[1].length, locant, kind: "function", step: steps.find((s) => s.kind === "function")! });
      }
    } else if (!group && multiple.length === 1) {
      const match = locale === "es" ? /-(\d+)-(?:eno|ino)$/.exec(bareParent) : /^(\d+)-/.exec(bareParent);
      if (match && multiple[0] === Number(match[1])) {
        const start = parentStart + match.index + (locale === "es" ? 1 : 0);
        slots.push({ start, end: start + match[1].length, locant: multiple[0], kind: "unsaturation", step: steps.find((s) => s.kind === "unsaturation")! });
      }
    }
  }

  // Two independent explicit locant components must both reverse. A lone changed
  // locant (including 3-methylhexane -> 4-methylhexane) cannot prove the chosen direction.
  if (analysis.family === "acyclic" && slots.length >= 2 && !steps.some((s) => s.kind === "ez")
    && analysis.substituents.length === slots.filter((s) => s.kind === "substituent").length) {
    let reversed = reference;
    let changed = 0;
    for (const slot of [...slots].sort((a, b) => b.start - a.start)) {
      const reverseLocant = analysis.mainChain.length + (slot.kind === "unsaturation" ? 0 : 1) - slot.locant;
      if (reverseLocant !== slot.locant) changed++;
      reversed = replace(reversed, slot.start, slot.end, String(reverseLocant));
    }
    if (changed >= 2 && answer === reversed) return issue("WRONG_NUMBERING_DIRECTION", steps.find((s) => s.kind === "numbering")!);
  }

  for (const kind of ["function", "unsaturation", "substituent"] as const) {
    for (const slot of slots.filter((s) => s.kind === kind)) {
      for (let n = 1; n <= analysis.mainChain.length - (kind === "unsaturation" ? 1 : 0); n++) {
        if (n !== slot.locant && answer === replace(reference, slot.start, slot.end, String(n))) {
          const code = kind === "function" ? "WRONG_FUNCTIONAL_GROUP_LOCANT"
            : kind === "unsaturation" ? "WRONG_UNSATURATION_LOCANT" : "WRONG_SUBSTITUENT_LOCANT";
          return issue(code, slot.step, { expected: slot.locant, actual: n });
        }
      }
    }
  }

  if (analysis.substituents.length === 1 && !analysis.substituents[0].complex && answer === bareParent) {
    return issue("MISSING_SUBSTITUENT", steps.find((s) => s.kind === "substituent")!, { name: {
      es: analysis.substituents[0].name, en: englishStructuralSubstituentName(analysis.substituents[0].name),
    } });
  }

  if (prefixes.length === 2 && analysis.substituents.length === 2) {
    const [a, b] = [...prefixes].sort((a, b) => a.start - b.start);
    if (reference.slice(a.end, b.start) === "-" && answer === reference.slice(0, a.start)
      + b.text + "-" + a.text + reference.slice(b.end)) return issue("WRONG_ALPHABETICAL_ORDER", steps.find((s) => s.kind === "alphabetical")!);
  }

  if (analysis.family === "acyclic" && !analysis.primaryFunctionalGroup && !analysis.substituents.length
    && !analysis.doubleBondLocants.length && !analysis.tripleBondLocants.length) {
    for (let count = 1; count <= 100; count++) {
      const root = iupacRootForCarbonCount(count)!;
      if (count !== analysis.mainChain.length && answer === (locale === "es" ? `${root}ano` : `${englishIupacRoot(root)}ane`)) {
        return issue("WRONG_PARENT_LENGTH", parentStep, { expected: analysis.mainChain.length, actual: count });
      }
    }
  }

  // Literal terminal suffix substitution only; no claim about an inferred functional graph.
  const suffixTerms = [
    { es: "nitrilo", en: "nitrile" }, { es: "amida", en: "amide" }, { es: "amina", en: "amine" },
    { es: "oico", en: "oic acid" }, { es: "oato", en: "oate" }, { es: "ano", en: "ane" },
    { es: "eno", en: "ene" }, { es: "ino", en: "yne" }, { es: "ona", en: "one" }, { es: "ol", en: "ol" }, { es: "al", en: "al" },
  ];
  const suffixes = suffixTerms.map((s) => s[locale]);
  const suffix = suffixes.find((s) => reference.endsWith(s));
  if (suffix && suffixes.some((s) => s !== suffix && answer === reference.slice(0, -suffix.length) + s)) {
    return issue("WRONG_SUFFIX", steps.find((s) => s.kind === "function") ?? parentStep,
      { suffix: suffixTerms.find((s) => s[locale] === suffix)! });
  }
  return issue("UNKNOWN_MISMATCH", steps.find((s) => s.kind === "assembly")!);
}
