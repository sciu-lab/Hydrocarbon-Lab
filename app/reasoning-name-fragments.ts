import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import { translateSpanishIupacForDisplay } from "./iupac-name-normalization.ts";
import { functionalNameEvidence, matchFunctionalParentSuffix, type FunctionalContribution, type FunctionalReasoningAnalysis } from "./reasoning-functional-groups.ts";
import type { StereoDescriptor } from "./double-bond-stereochemistry.ts";

export type ReasoningNameEvidence = {
  text: string;
  label: string;
  kind: "function" | "parent" | "numbering" | "substituent" | "unsaturation" | "stereo";
  start?: number;
  atomIds?: readonly number[];
  semanticId?: string;
  bondType?: "double" | "triple";
  locant?: number;
  bondIds?: readonly (readonly [number, number])[];
  explanation?: string;
  contributions?: FunctionalContribution[];
};

export type UnsaturationNameContribution = Required<Pick<ReasoningNameEvidence,
  "semanticId" | "bondType" | "locant" | "atomIds" | "bondIds" | "text" | "start" | "label" | "kind" | "explanation">>;

export type ReasoningNameFragment = ReasoningNameEvidence & {
  additionalFragments?: ReasoningNameEvidence[];
};

type FragmentAnalysis = FunctionalReasoningAnalysis & {
  mainChain: number[];
  primaryFunctionalLabel?: string;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
};

type FragmentInput = {
  analysis: FragmentAnalysis;
  displayedName: string;
  /** Available local profile outputs supplied by the existing naming pipeline. */
  generatedNames?: readonly string[];
  language: AppLanguage;
  steps: readonly { number: string; nameRole?: ReasoningNameFragment["kind"]; stereoDescriptors?: readonly StereoDescriptor[] }[];
  canHighlight: boolean;
};

/** The existing CIP inspection supplies E/Z. Text only verifies its written span;
 * an arbitrary descriptor, R/S or a different local name supplies no evidence. */
function verifiedStereoPrefix(input: FragmentInput) {
  const descriptors = input.steps.find(step => step.nameRole === "stereo")?.stereoDescriptors;
  if (descriptors?.length !== 1) return;
  const descriptor = descriptors[0], name = input.displayedName.trim();
  if (descriptor.atomIds.length !== 2 || !input.analysis.doubleBondLocants.includes(descriptor.locant)
    || descriptor.atomIds.some((id, index) => input.analysis.mainChain[descriptor.locant - 1 + index] !== id)
    || !["E", "Z"].includes(descriptor.configuration)
    || name !== input.analysis.name && !input.generatedNames?.includes(name)) return;
  const text = `(${descriptor.locant}${descriptor.configuration})`;
  return name.startsWith(`${text}-`) ? { descriptor, text } : undefined;
}

function unsaturationMorpheme(token: string, bondType: "double" | "triple") {
  const normalized = token.toLocaleLowerCase("en");
  const marker = bondType === "double" ? /^(?:di|tri|tetra|penta|hexa|hepta|octa)?en(?:o|e)?/ : /^(?:di|tri|tetra|penta|hexa|hepta|octa)?(?:in|yn)(?:o|e)?/;
  return marker.exec(normalized)?.[0] ?? "";
}

/** Map analyzed parent-chain bonds onto the exact visible unsaturation morpheme. */
export function deriveUnsaturationNameContributions(
  analysis: FragmentAnalysis,
  displayedName: string,
  language: AppLanguage,
  generatedNames?: readonly string[],
): UnsaturationNameContribution[] {
  const name = displayedName.trim();
  const parent = localizedName(analysis.chainName, language).replace(/^(?:ácido|acid) /, "");
  const root = /^[a-záéíóúüñ]+/i.exec(parent)?.[0] ?? "";
  if (!root) return [];
  // D4-REASON-001: the verified legacy EN enyne output moves the double
  // locant before the root. Preserve each analyzed bond's semantic identity;
  // this presentation adapter copies spans and never constructs a name.
  if (language === "en" && generatedNames?.includes(name)
    && analysis.doubleBondLocants.length === 1 && analysis.tripleBondLocants.length === 1) {
    const double = analysis.doubleBondLocants[0], triple = analysis.tripleBondLocants[0];
    const systematic = analysis.chainName.replace(/^ácido /, "");
    const stem = /^[a-záéíóúüñ]+/i.exec(systematic)?.[0] ?? "";
    const written = `${double}-${stem}en-${triple}-yn`;
    const start = name.lastIndexOf(written);
    if (stem && systematic.startsWith(`${stem}-${double}-en-${triple}-in`)
      && start >= 0 && (start === 0 || /[ -]/.test(name[start - 1]))) {
      const spans = [{ type: "double" as const, locant: double, text: String(double), start },
        { type: "double" as const, locant: double, text: "en", start: start + String(double).length + 1 + stem.length },
        { type: "triple" as const, locant: triple, text: `${triple}-yn`,
          start: start + String(double).length + 1 + stem.length + 3 }];
      return spans.map(span => {
        const atoms = analysis.mainChain.slice(span.locant - 1, span.locant + 1);
        return { semanticId: `unsaturation:${span.type}:${span.locant}`, bondType: span.type, locant: span.locant,
          atomIds: atoms, bondIds: [[Math.min(...atoms), Math.max(...atoms)]] as [number, number][],
          text: span.text, start: span.start, kind: "unsaturation" as const,
          label: `${span.type === "double" ? "Double" : "Triple"} bond at position ${span.locant}`,
          explanation: `The ${span.type} bond C${span.locant}${span.type === "double" ? "=" : "≡"}C${span.locant + 1} contributes its locant and parent unsaturation form.` };
      });
    }
  }
  // The available EN legacy profile puts the single multiple-bond locant before
  // the parent root (3-hexen-2-ol). Copy its two disjoint written spans only when
  // the naming pipeline supplied that exact name; never guess a new variant.
  if (!name.endsWith(parent) && language === "en" && generatedNames?.includes(name)
    && analysis.doubleBondLocants.length + analysis.tripleBondLocants.length === 1) {
    const bondType = analysis.doubleBondLocants.length ? "double" as const : "triple" as const;
    const locant = (bondType === "double" ? analysis.doubleBondLocants : analysis.tripleBondLocants)[0];
    const marker = bondType === "double" ? "en" : "yn";
    const prefix = `${root}-${locant}-${marker}`;
    const legacyParent = `${locant}-${root}${marker}${parent.slice(prefix.length)}`;
    if (parent.startsWith(prefix) && name.endsWith(legacyParent)) {
      const atoms = analysis.mainChain.slice(locant - 1, locant + 1);
      if (atoms.length !== 2) return [];
      const start = name.length - legacyParent.length;
      const common = { semanticId: `unsaturation:${bondType}:${locant}`, bondType, locant, atomIds: atoms,
        bondIds: [[Math.min(...atoms), Math.max(...atoms)]] as [number, number][],
        label: `${bondType === "double" ? "Double" : "Triple"} bond at position ${locant}`,
        kind: "unsaturation" as const,
        explanation: `The ${bondType} bond C${locant}${bondType === "double" ? "=" : "≡"}C${locant + 1} contributes locant ${locant} and the parent form “${marker}”.` };
      return [{ ...common, text: String(locant), start },
        { ...common, text: marker, start: start + String(locant).length + 1 + root.length }];
    }
  }
  if (!name.endsWith(parent)) return [];
  const parentStart = name.length - parent.length;
  const parentTail = parent.slice(root.length);
  const tokens: { value: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const part of parentTail.split("-")) {
    tokens.push({ value: part, start: parentStart + root.length + cursor, end: parentStart + root.length + cursor + part.length });
    cursor += part.length + 1;
  }

  const output: UnsaturationNameContribution[] = [];
  const groups: { bondType: "double" | "triple"; locant: number }[] = [
    ...analysis.doubleBondLocants.map((locant) => ({ bondType: "double" as const, locant })),
    ...analysis.tripleBondLocants.map((locant) => ({ bondType: "triple" as const, locant })),
  ].sort((left, right) => left.locant - right.locant || left.bondType.localeCompare(right.bondType));

  for (const item of groups) {
    const firstAtom = analysis.mainChain[item.locant - 1];
    const secondAtom = analysis.mainChain[item.locant];
    if (firstAtom === undefined || secondAtom === undefined) continue;
    const tokenIndex = tokens.findIndex(({ value }) => /^\d+(?:,\d+)*$/.test(value) && value.split(",").includes(String(item.locant)));
    if (tokenIndex < 0 || tokenIndex + 1 >= tokens.length) continue;
    const locantToken = tokens[tokenIndex];
    const markerToken = tokens[tokenIndex + 1];
    const morpheme = unsaturationMorpheme(markerToken.value, item.bondType);
    if (!morpheme) continue;
    const locantsInToken = locantToken.value.split(",");
    const isGrouped = locantsInToken.length > 1;
    const itemOffset = locantsInToken.slice(0, locantsInToken.indexOf(String(item.locant))).reduce((sum, value) => sum + value.length + 1, 0);
    const start = isGrouped ? locantToken.start + itemOffset : locantToken.start;
    const end = isGrouped ? start + String(item.locant).length : markerToken.start + morpheme.length;
    const text = name.slice(start, end);
    const bondLabel = language === "en" ? item.bondType === "double" ? "Double bond" : "Triple bond"
      : item.bondType === "double" ? "Enlace doble" : "Enlace triple";
    const suffixText = isGrouped ? markerToken.value.slice(0, morpheme.length) : text.slice(String(item.locant).length + 1);
    const bondDescription = item.bondType === "double"
      ? `C${item.locant}=C${item.locant + 1}`
      : `C${item.locant}≡C${item.locant + 1}`;
    const explanation = language === "en"
      ? `${bondLabel} ${bondDescription} has locant ${item.locant} and contributes locant ${item.locant} to the parent unsaturation form “${suffixText}”.`
      : `${bondLabel} ${bondDescription} tiene el localizador ${item.locant} y aporta el localizador ${item.locant} a la forma de insaturación del padre «${suffixText}».`;
    output.push({
      semanticId: `unsaturation:${item.bondType}:${item.locant}`,
      bondType: item.bondType,
      locant: item.locant,
      atomIds: [firstAtom, secondAtom],
      bondIds: [[Math.min(firstAtom, secondAtom), Math.max(firstAtom, secondAtom)]],
      text,
      start,
      label: language === "en" ? `${bondLabel} at position ${item.locant}` : `${bondLabel} en la posición ${item.locant}`,
      kind: "unsaturation",
      explanation,
    });
  }
  return output;
}

function localizedName(name: string, language: AppLanguage) {
  return language === "en" ? translateSpanishIupacForDisplay(name) : name;
}

/** Presentation only: every emitted text is copied from the currently displayed name. */
function deriveExistingReasoningNameFragments({
  analysis,
  displayedName,
  language,
  steps,
  canHighlight,
}: FragmentInput): Record<string, ReasoningNameFragment> {
  const fragments: Record<string, ReasoningNameFragment> = {};
  const name = displayedName.trim();
  if (!canHighlight || !/^[a-záéíóúüñ0-9, -]+$/i.test(name)) return fragments;
  const stepNumbers = new Set(steps.map((step) => step.number));
  const add = (number: string, text: string, label: string, kind: ReasoningNameFragment["kind"], start?: number) => {
    const literalMatches = start === undefined
      ? name.includes(text)
      : name.slice(start, start + text.length) === text;
    if (stepNumbers.has(number) && text && literalMatches) {
      fragments[number] = { text, label, kind, ...(start === undefined ? {} : { start }) };
    }
  };

  // These standard steps declare their roles; specialized ring-system steps
  // with the same numbers do not automatically acquire unrelated evidence.
  if (analysis.family === "cycloalkane"
    || (analysis.family === "aromatic" && analysis.primaryFunctionalGroup)) {
    const addRole = (role: ReasoningNameFragment["kind"], text: string, label: string,
      kind = role, start?: number) => {
      const step = steps.find((item) => item.nameRole === role);
      if (step) add(step.number, text, label, kind, start);
    };
    const localizedParent = localizedName(analysis.chainName, language);
    let parent = localizedParent.replace(/^ácido /, "");
    let parentStart = name.indexOf(parent);
    // Contextual translation can spell a substituted parent differently from
    // the isolated parent. In that case copy the literal cyclic parent only
    // when the whole displayed name agrees with the analyzed result.
    if (parentStart < 0 && analysis.family === "cycloalkane" && analysis.name
      && name === localizedName(analysis.name, language)) {
      const cyclicStart = /(?:ciclo|cyclo)[a-z]/i.exec(name)?.index;
      if (cyclicStart !== undefined) {
        parentStart = cyclicStart;
        parent = name.slice(cyclicStart);
      }
    }
    if (!parent || parentStart < 0 || name.lastIndexOf(parent) !== parentStart) return fragments;
    const ringLabel = language === "en"
      ? `${analysis.family === "aromatic" ? "Aromatic parent ring" : "Parent ring"} · ${analysis.mainChain.length} carbons`
      : `${analysis.family === "aromatic" ? "Anillo principal aromático" : "Anillo principal"} · ${analysis.mainChain.length} carbonos`;
    const groupLabel = analysis.primaryFunctionalLabel
      ? uiText(language, analysis.primaryFunctionalLabel)
      : uiText(language, "Grupo funcional principal");
    const primary = analysis.primaryFunctionalGroup;
    // Split only a supported systematic suffix from an explicit ring scaffold.
    // An indivisible functional parent is kept whole, without guessing morphemes.
    const suffixMatch = matchFunctionalParentSuffix(parent, primary, language);
    const scaffoldEnd = suffixMatch?.index ?? parent.length;
    const scaffold = parent.slice(0, scaffoldEnd).replace(/-$/, "").replace(/^ácido /, "");
    const explicitRing = analysis.family === "aromatic"
      ? scaffold === localizedName("benceno", language)
      : /^(?:ciclo|cyclo)[a-z]+(?:-\d+(?:,\d+)*-[a-z]+)*$/i.test(scaffold);

    if (primary && (!suffixMatch || !explicitRing)) {
      if (/^[a-záéíóúüñ]+$/i.test(localizedParent)) {
        addRole("function", parent, language === "en"
          ? `Parent name with ${groupLabel.toLowerCase()}` : `Nombre del padre con ${groupLabel.toLowerCase()}`, "function", parentStart);
        addRole("parent", parent, ringLabel, "parent", parentStart);
      }
    } else if (primary && suffixMatch) {
      const writtenLocants = suffixMatch[1];
      const primaryLocants = analysis.functionalGroups
        .filter((group) => group.kind === primary)
        .map((group) => analysis.numberedAtoms.get(group.carbonId))
        .filter((locant): locant is number => locant !== undefined)
        .sort((left, right) => left - right).join(",");
      // Never borrow locants from a displayed name that disagrees with analysis.
      if (writtenLocants && primaryLocants && writtenLocants !== primaryLocants) return fragments;
      const scaffoldStart = parentStart + parent.indexOf(scaffold);
      addRole("parent", scaffold, ringLabel, "parent", scaffoldStart);
      const functionLabel = writtenLocants
        ? language === "en" ? `${groupLabel} locants, multiplicity and suffix`
          : `${groupLabel}: localizadores, multiplicidad y sufijo`
        : language === "en" ? `${groupLabel} suffix` : `Sufijo: ${groupLabel.toLowerCase()}`;
      addRole("function", suffixMatch[0], functionLabel, "function", parentStart + suffixMatch.index);
      if (writtenLocants) addRole("numbering", writtenLocants, language === "en"
        ? `${groupLabel} locants` : `Localizadores: ${groupLabel.toLowerCase()}`, "numbering", parentStart + suffixMatch.index);
    } else {
      const root = /^[a-z]+/i.exec(parent)?.[0];
      if (root && analysis.doubleBondLocants.length + analysis.tripleBondLocants.length) {
        addRole("parent", root, ringLabel, "parent", parentStart);
        addRole("numbering", parent.slice(root.length + 1), uiText(language, "Enlaces múltiples, localizadores y multiplicidad"), "unsaturation", parentStart + root.length + 1);
      } else if (explicitRing) {
        addRole("parent", parent, ringLabel, "parent", parentStart);
      }
    }

    const prefixStart = name.startsWith("ácido ") ? "ácido ".length : 0;
    const prefix = name.slice(prefixStart, parentStart);
    const accountedFor = analysis.substituents.length > 0
      && analysis.substituents.every((item) => {
        const named = localizedName(item.name, language);
        return !item.complex && named && prefix.includes(named)
          && (prefix === named || new RegExp(`(^|[^0-9])${item.locant}([^0-9]|$)`).test(prefix));
      });
    if (accountedFor) {
      addRole("substituent", prefix, uiText(language, "Sustituyentes y localizadores"), "substituent", prefixStart);
      if (!fragments[steps.find((step) => step.nameRole === "numbering")?.number ?? ""]) {
        const locants = /^\d+(?:,\d+)*/.exec(prefix)?.[0];
        if (locants) addRole("numbering", locants, language === "en"
          ? "Substituent locants" : "Localizadores de los sustituyentes", "numbering", prefixStart);
      }
    }
    return fragments;
  }

  if (analysis.family === "aromatic"
    && analysis.chainName === "benceno"
    && analysis.mainChain.length === 6
    && !analysis.primaryFunctionalGroup) {
    const parent = localizedName(analysis.chainName, language);
    if (!parent || !name.endsWith(parent)) return fragments;
    const prefix = name.slice(0, -parent.length);
    add("02", name.slice(-parent.length), language === "en" ? "Parent benzene ring" : "Anillo principal de benceno", "parent");
    if (!prefix || !analysis.substituents.length || analysis.substituents.some((item) => item.complex)) return fragments;

    if (analysis.substituents.length === 1) {
      const substituent = analysis.substituents[0];
      const named = localizedName(substituent.name, language);
      if (prefix !== named && prefix !== `${substituent.locant}-${named}`) return fragments;
      add("04", prefix, language === "en" ? "Substituent in the name" : "Sustituyente en el nombre", "substituent");
      if (prefix !== named) {
        add("03", prefix.slice(0, String(substituent.locant).length), language === "en" ? "Substituent locant" : "Localizador del sustituyente", "numbering");
      }
      return fragments;
    }

    const allGroupsAccountedFor = analysis.substituents.every((item) => {
      const named = localizedName(item.name, language);
      return named && prefix.includes(named)
        && new RegExp(`(^|[^0-9])${item.locant}([^0-9]|$)`).test(prefix);
    });
    if (allGroupsAccountedFor && prefix.length <= 48) {
      add("04", prefix, language === "en" ? "Prefixes and locants" : "Prefijos y localizadores", "substituent");
    }
    return fragments;
  }

  if (analysis.family !== "acyclic") return fragments;
  const parent = localizedName(analysis.chainName, language);
  const parentSuffix = matchFunctionalParentSuffix(parent, analysis.primaryFunctionalGroup, language);
  const stem = ["ketone", "alcohol", "aldehyde"].includes(analysis.primaryFunctionalGroup ?? "")
    ? parentSuffix ? parent.slice(0, parentSuffix.index).replace(/-$/, "") : undefined
    : /^[a-z]+/i.exec(parent)?.[0];
  const chainLabel = language === "en"
    ? `Parent chain · ${analysis.mainChain.length} carbons`
    : `Cadena principal · ${analysis.mainChain.length} carbonos`;

  const multipleBondCount = analysis.doubleBondLocants.length + analysis.tripleBondLocants.length;
  if (multipleBondCount >= 2 && name.endsWith(parent)) {
    const root = /^[a-z]+/i.exec(parent)?.[0];
    const unsaturation = root ? parent.slice(root.length + 1) : "";
    const parentStart = name.length - parent.length;
    if (!root || !unsaturation) return fragments;

    add("02", root, chainLabel, "parent", parentStart);
    add("03", unsaturation, uiText(language, "Enlaces múltiples, localizadores y multiplicidad"), "unsaturation", parentStart + root.length + 1);

    const stereoPrefix = /^\((?:\d+[EZRS](?:,\d+[EZRS])*)\)-/.exec(name)?.[0] ?? "";
    const substituentStart = stereoPrefix.length;
    const substituentText = name.slice(substituentStart, parentStart);
    const containsEverySubstituent = analysis.substituents.length > 0
      && analysis.substituents.every((item) => {
        const substituentName = localizedName(item.name, language);
        const hasName = substituentName
          && new RegExp(`(?:^|[^a-z])${substituentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z])`, "i").test(substituentText);
        const hasLocant = new RegExp(`(?:^|\\D)${item.locant}(?:\\D|$)`).test(substituentText);
        return Boolean(hasName && hasLocant);
      });
    if (containsEverySubstituent) {
      add("04", substituentText, uiText(language, "Sustituyentes y localizadores"), "substituent", substituentStart);
    }
    return fragments;
  }

  if (!stem) return fragments;

  if (["ketone", "alcohol", "aldehyde"].includes(analysis.primaryFunctionalGroup ?? "")
    && analysis.functionalGroups.length === 1
    && analysis.functionalGroups[0].kind === analysis.primaryFunctionalGroup
    && !analysis.substituents.length
    && !analysis.doubleBondLocants.length
    && !analysis.tripleBondLocants.length) {
    const locant = analysis.numberedAtoms.get(analysis.functionalGroups[0].carbonId);
    const suffix = parentSuffix?.[2];
    if (!suffix) return fragments;
    if (!locant || (analysis.primaryFunctionalGroup === "aldehyde" && locant !== 1)) return fragments;
    const tail = name.slice(stem.length);
    const functionLabel = analysis.primaryFunctionalGroup === "ketone"
      ? language === "en" ? "Ketone" : "cetona"
      : analysis.primaryFunctionalGroup === "alcohol"
        ? language === "en" ? "Alcohol" : "alcohol"
        : language === "en" ? "Aldehyde" : "aldehído";
    const spanishGroupPhrase = analysis.primaryFunctionalGroup === "ketone" ? "de la cetona" : `del ${functionLabel}`;
    const numberingLabel = language === "en" ? `${functionLabel} locant`
      : analysis.primaryFunctionalGroup === "ketone" ? "Localizador del carbonilo" : `Localizador del ${functionLabel}`;
    if (analysis.primaryFunctionalGroup !== "aldehyde" && tail === `-${locant}-${suffix}`) {
      add("01", name.slice(stem.length + 1), language === "en" ? `${functionLabel} locant and suffix` : `Posición y sufijo ${spanishGroupPhrase}`, "function");
      add("02", name.slice(0, stem.length), chainLabel, "parent");
      add("03", String(locant), numberingLabel, "numbering");
    } else if (tail === suffix) {
      add("01", name.slice(-suffix.length), language === "en" ? `${functionLabel} suffix` : `Sufijo ${spanishGroupPhrase}`, "function");
      add("02", name.slice(0, stem.length), chainLabel, "parent");
    } else if (analysis.primaryFunctionalGroup !== "aldehyde" && name === `${locant}-${stem}${suffix}`) {
      add("01", suffix, language === "en" ? `${functionLabel} suffix` : `Sufijo ${spanishGroupPhrase}`, "function");
      add("02", stem, chainLabel, "parent");
      add("03", String(locant), numberingLabel, "numbering");
    }
    return fragments;
  }

  if (!analysis.primaryFunctionalGroup
    && !analysis.functionalGroups.length
    && !analysis.substituents.length
    && analysis.doubleBondLocants.length + analysis.tripleBondLocants.length === 1
    && name.startsWith(stem)) {
    const isTriple = analysis.tripleBondLocants.length === 1;
    const locant = isTriple ? analysis.tripleBondLocants[0] : analysis.doubleBondLocants[0];
    const suffix = isTriple ? language === "en" ? "yne" : "ino" : language === "en" ? "ene" : "eno";
    if (name.slice(stem.length) === `-${locant}-${suffix}`) {
      add("02", name.slice(0, stem.length), chainLabel, "parent");
      add("03", name.slice(stem.length + 1), language === "en"
        ? `${isTriple ? "Triple" : "Double"} bond and locant`
        : `Enlace ${isTriple ? "triple" : "doble"} y localizador`, "unsaturation");
    } else if (name === `${stem}${suffix}` && analysis.mainChain.length === 3 && locant === 1) {
      add("02", stem, chainLabel, "parent");
      add("03", suffix, language === "en"
        ? `${isTriple ? "Triple" : "Double"} bond`
        : `Enlace ${isTriple ? "triple" : "doble"}`, "unsaturation");
    }
    return fragments;
  }

  if (analysis.primaryFunctionalGroup || analysis.functionalGroups.length
    || analysis.doubleBondLocants.length || analysis.tripleBondLocants.length
    || !name.endsWith(parent)) return fragments;
  const prefix = name.slice(0, -parent.length);
  if (!prefix && !analysis.substituents.length) {
    add("02", name, chainLabel, "parent");
  } else if (analysis.substituents.length >= 1 && analysis.substituents.length <= 4
    && analysis.substituents.every((item) => !item.complex && item.name === analysis.substituents[0].name)) {
    const named = localizedName(analysis.substituents[0].name, language);
    const locants = analysis.substituents.map((item) => item.locant).sort((left, right) => left - right);
    const multiplier = ["", "", "di", "tri", "tetra"][locants.length];
    if (prefix === `${locants.join(",")}-${multiplier}${named}`) {
      add("02", name.slice(-parent.length), chainLabel, "parent");
      add("03", locants.join(","), language === "en"
        ? analysis.substituents.length > 1 ? "Substituent locants" : "Substituent locant"
        : analysis.substituents.length > 1 ? "Localizadores de los sustituyentes" : "Localizador del sustituyente", "numbering");
      add("04", prefix, language === "en" ? "Substituent and locants" : "Sustituyente y localizadores", "substituent");
    }
  }
  return fragments;
}

/** Recover the parent contribution beside the existing functional evidence. */
function parentNameEvidence(
  analysis: FragmentAnalysis, name: string, language: AppLanguage,
  evidence: ReturnType<typeof functionalNameEvidence>,
): ReasoningNameEvidence | undefined {
  if (!analysis.mainChain.length) return;
  if (analysis.family === "aromatic" && ["fenol", "anilina"].includes(analysis.chainName)) return;
  let parent = localizedName(analysis.chainName, language).replace(/^ácido /, "").replace(/ acid$/, "");
  if (analysis.primaryFunctionalGroup === "ester") {
    const acidPortion = /^(.*) de (.+)$/.exec(analysis.chainName)?.[1];
    if (!acidPortion) return;
    parent = localizedName(acidPortion, language);
  }
  const suffix = evidence.find((item) => item.kind === "function"
    && item.contributions.some((origin) => origin.role === "suffix"));
  let text: string;
  let start: number;
  if (suffix) {
    const parentSuffix = matchFunctionalParentSuffix(parent, analysis.primaryFunctionalGroup, language);
    if (!parentSuffix) return; // Indivisible retained parents keep their existing evidence.
    const root = /^[a-záéíóúüñ]+/i.exec(parent.slice(0, parentSuffix.index))?.[0];
    if (!root) return;
    start = name.lastIndexOf(root, suffix.start - root.length);
    if (start < 0) return;
    // A locanted unsaturation may intervene between the root and final function.
    const intervening = name.slice(start + root.length, suffix.start);
    if (!/^(?:-(?:\d+(?:,\d+)*-)?[a-z]+)*-?$/i.test(intervening)) return;
    text = name.slice(start, start + root.length);
  } else if (!analysis.primaryFunctionalGroup
    && (analysis.family === "acyclic" || analysis.family === "aromatic" && analysis.chainName === "benceno")
    && name.endsWith(parent)) {
    text = /^[a-z]+/i.exec(parent)?.[0] ?? "";
    start = name.length - parent.length;
  } else if (!analysis.primaryFunctionalGroup && analysis.family === "acyclic" && analysis.name?.endsWith(analysis.chainName)
    && name === localizedName(analysis.name, language)) {
    // Contextual localization can spell a root differently from its isolated
    // parent. Copy the residual only after every analyzed prefix is accounted for.
    const prefixes = evidence.filter((item) => item.kind === "substituent").sort((a, b) => a.start - b.start);
    if (!prefixes.length || prefixes.length !== new Set(analysis.substituents.map((item) => item.name)).size) return;
    let cursor = 0;
    for (const prefix of prefixes) {
      if (!/^-?$/.test(name.slice(cursor, prefix.start))) return;
      cursor = prefix.start + prefix.text.length;
    }
    start = cursor;
    text = name.slice(start);
    if (!/^[a-z]+$/i.test(text)) return;
  } else return;
  if (!text) return;
  const ring = analysis.family !== "acyclic";
  const label = language === "en"
    ? `${analysis.family === "aromatic" ? "Aromatic parent ring" : ring ? "Parent ring" : "Parent chain"} · ${analysis.mainChain.length} carbons`
    : `${analysis.family === "aromatic" ? "Anillo principal aromático" : ring ? "Anillo principal" : "Cadena principal"} · ${analysis.mainChain.length} carbonos`;
  return { text, start, label, kind: "parent", atomIds: analysis.mainChain };
}

/** Extend the existing evidence/targets; one step can own several disjoint spans. */
export function deriveReasoningNameFragments(input: FragmentInput): Record<string, ReasoningNameFragment> {
  const fragments = deriveExistingReasoningNameFragments(input);
  const { analysis, displayedName, language, steps, canHighlight } = input;
  const name = displayedName.trim();
  const complexEther = analysis.substituents.some((item) => item.complex
    && analysis.functionalGroups.some((group) => group.kind === "ether" && group.atomIds?.length
      && item.atomIds?.length === group.atomIds.length
      && group.atomIds.every((id) => item.atomIds!.includes(id))));
  const stereo = verifiedStereoPrefix(input);
  const supportedText = /^[a-záéíóúüñ0-9, -]+$/i.test(name)
    || stereo && /^[a-záéíóúüñ0-9, -]+$/i.test(name.slice(stereo.text.length + 1))
    || complexEther && /^[a-záéíóúüñ0-9(), -]+$/i.test(name);
  if (!canHighlight || !supportedText
    || !["acyclic", "cycloalkane", "aromatic"].includes(analysis.family)) return fragments;
  // Consume the analyzed result or an available local profile output. The caller
  // supplies the existing selector's results; this layer never creates variants.
  if (name !== localizedName(analysis.name ?? analysis.chainName, language)
    && !input.generatedNames?.includes(name)
    && !Object.keys(fragments).length) return fragments;
  const evidence = functionalNameEvidence(analysis, name, language);
  const stereoStep = steps.find(step => step.nameRole === "stereo");
  if (stereo && stereoStep) {
    const { descriptor, text } = stereo;
    fragments[stereoStep.number] = { text, start: 0, kind: "stereo", semanticId: `stereo:ez:${descriptor.locant}`,
      label: language === "en" ? `E/Z descriptor at position ${descriptor.locant}` : `Descriptor E/Z en la posición ${descriptor.locant}`,
      bondType: "double", locant: descriptor.locant, atomIds: descriptor.atomIds, bondIds: [descriptor.atomIds],
      explanation: language === "en" ? `The explicit double bond at C${descriptor.locant} has descriptor ${descriptor.configuration}, as verified by the structural CIP inspection.`
        : `El doble enlace explícito en C${descriptor.locant} tiene el descriptor ${descriptor.configuration}, verificado por la inspección CIP estructural.` };
  }
  const unsaturationStep = steps.find((step) => step.nameRole === "unsaturation");
  if (unsaturationStep) {
    const contributions = deriveUnsaturationNameContributions(analysis, name, language, input.generatedNames);
    const [first, ...rest] = contributions;
    if (first) fragments[unsaturationStep.number] = { ...first, additionalFragments: rest };
  }
  const parent = parentNameEvidence(analysis, name, language, evidence);
  const parentStep = steps.find((step) => step.nameRole === "parent");
  if (parent && parentStep) {
    const previous = fragments[parentStep.number];
    if (!previous || previous.text === parent.text
      || evidence.some((item) => item.kind === "function" && item.start >= (previous.start ?? name.indexOf(previous.text))
        && item.start + item.text.length <= (previous.start ?? name.indexOf(previous.text)) + previous.text.length)) {
      fragments[parentStep.number] = { ...parent, ...(previous?.text === parent.text ? { label: previous.label } : {}) };
    }
  }
  for (const item of evidence) {
    const step = steps.find((candidate) => candidate.nameRole === item.kind);
    if (!step) continue;
    const previous = fragments[step.number];
    if (!previous) {
      fragments[step.number] = item;
      continue;
    }
    const previousStart = previous.start ?? name.indexOf(previous.text);
    // A recognizable suffix must not inherit a broad retained-parent claim.
    if (item.kind === "function" && item.contributions[0]?.role === "suffix" && parent
      && previousStart < parent.start! + parent.text.length
      && previousStart + previous.text.length > parent.start!) {
      fragments[step.number] = item;
      continue;
    }
    if (previous.text === item.text && previousStart === item.start
      || previous.kind === "function" && item.contributions[0]?.role === "suffix"
        && item.start >= previousStart && item.start + item.text.length <= previousStart + previous.text.length) {
      previous.contributions = item.contributions;
      if (item.atomIds) previous.atomIds = item.atomIds;
    } else {
      previous.additionalFragments ??= [];
      previous.additionalFragments.push(item);
    }
  }
  const numberingStep = steps.find((step) => step.nameRole === "numbering");
  if (numberingStep) {
    for (const item of evidence) {
      const locants = /^\d+(?:,\d+)*/.exec(item.text)?.[0];
      if (!locants) continue;
      const written: ReasoningNameEvidence = { text: locants, start: item.start,
        label: uiText(language, "Numeración razonada"), kind: "numbering" };
      const previous = fragments[numberingStep.number];
      if (!previous) fragments[numberingStep.number] = written;
      else if (![previous, ...(previous.additionalFragments ?? [])].some((fragment) =>
        fragment.text === locants && (fragment.start ?? name.indexOf(fragment.text)) === item.start)) {
        previous.additionalFragments ??= [];
        previous.additionalFragments.push(written);
      }
    }
  }
  // Retained functional parents (phenol/aniline) are intentionally indivisible.
  const functionStep = steps.find((step) => step.nameRole === "function");
  const retained = functionStep ? fragments[functionStep.number] : undefined;
  if (retained && !retained.contributions && analysis.primaryFunctionalGroup) {
    retained.contributions = analysis.functionalGroups
      .filter((group) => group.kind === analysis.primaryFunctionalGroup)
      .map((group) => ({ group: group.kind, role: "suffix", atomIds: group.atomIds ?? [group.carbonId] }));
  }
  return fragments;
}
