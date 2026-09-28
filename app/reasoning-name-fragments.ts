import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import { translateSpanishIupacToOpsin } from "./iupac-name-normalization.ts";

export type ReasoningNameFragment = {
  text: string;
  label: string;
  kind: "function" | "parent" | "numbering" | "substituent" | "unsaturation";
  start?: number;
};

type FragmentAnalysis = {
  family: string;
  name?: string;
  chainName: string;
  mainChain: number[];
  substituents: { name: string; locant: number; complex?: boolean }[];
  functionalGroups: { kind: string; carbonId: number }[];
  primaryFunctionalGroup?: string;
  primaryFunctionalLabel?: string;
  numberedAtoms: ReadonlyMap<number, number>;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
};

type FragmentInput = {
  analysis: FragmentAnalysis;
  displayedName: string;
  language: AppLanguage;
  steps: readonly { number: string; nameRole?: ReasoningNameFragment["kind"] }[];
  canHighlight: boolean;
};

function localizedName(name: string, language: AppLanguage) {
  return language === "en" ? translateSpanishIupacToOpsin(name) : name;
}

/** Presentation only: every emitted text is copied from the currently displayed name. */
export function deriveReasoningNameFragments({
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
    const suffixes: Record<string, string> = language === "en" ? {
      alcohol: "ol", ketone: "one", amine: "amine", aldehyde: "carbaldehyde",
      carboxylicAcid: "carboxylic acid", amide: "carboxamide", nitrile: "carbonitrile",
    } : {
      alcohol: "ol", ketone: "ona", amine: "amina", aldehyde: "carbaldehído",
      carboxylicAcid: "carboxílico", amide: "carboxamida", nitrile: "carbonitrilo",
    };
    const primary = analysis.primaryFunctionalGroup;
    const suffix = primary ? suffixes[primary] : undefined;
    // Split only a supported systematic suffix from an explicit ring scaffold.
    // An indivisible functional parent is kept whole, without guessing morphemes.
    const suffixMatch = suffix
      ? new RegExp(`(?:(\\d+(?:,\\d+)*)-)?((?:di|tri|tetra|penta|hexa)?${suffix})$`).exec(parent)
      : null;
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
  const stem = ["ketone", "alcohol", "aldehyde"].includes(analysis.primaryFunctionalGroup ?? "")
    ? /^([a-z]+?)(?:-\d+-)?(?:ona|one|ol|al)$/i.exec(parent)?.[1]
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
    const suffix = analysis.primaryFunctionalGroup === "ketone"
      ? language === "en" ? "one" : "ona"
      : analysis.primaryFunctionalGroup === "alcohol" ? "ol" : "al";
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
