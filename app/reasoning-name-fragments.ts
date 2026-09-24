import type { AppLanguage } from "./i18n.ts";
import { translateSpanishIupacToOpsin } from "./iupac-name-normalization.ts";

export type ReasoningNameFragment = {
  text: string;
  label: string;
  kind: "function" | "parent" | "numbering" | "substituent" | "unsaturation";
};

type FragmentAnalysis = {
  family: string;
  chainName: string;
  mainChain: number[];
  substituents: { name: string; locant: number; complex?: boolean }[];
  functionalGroups: { kind: string; carbonId: number }[];
  primaryFunctionalGroup?: string;
  numberedAtoms: ReadonlyMap<number, number>;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
};

type FragmentInput = {
  analysis: FragmentAnalysis;
  displayedName: string;
  language: AppLanguage;
  steps: readonly { number: string }[];
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
  if (!canHighlight || !/^[a-záéíóúüñ0-9,-]+$/i.test(name)) return fragments;
  const stepNumbers = new Set(steps.map((step) => step.number));
  const add = (number: string, text: string, label: string, kind: ReasoningNameFragment["kind"]) => {
    if (stepNumbers.has(number) && text && name.includes(text)) {
      fragments[number] = { text, label, kind };
    }
  };

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
  const stem = /^[a-z]+/i.exec(parent)?.[0];
  if (!stem) return fragments;
  const chainLabel = language === "en"
    ? `Parent chain · ${analysis.mainChain.length} carbons`
    : `Cadena principal · ${analysis.mainChain.length} carbonos`;

  if (analysis.primaryFunctionalGroup === "ketone"
    && analysis.functionalGroups.length === 1
    && analysis.functionalGroups[0].kind === "ketone"
    && !analysis.substituents.length
    && !analysis.doubleBondLocants.length
    && !analysis.tripleBondLocants.length
    && name.startsWith(stem)) {
    const locant = analysis.numberedAtoms.get(analysis.functionalGroups[0].carbonId);
    const suffix = language === "en" ? "one" : "ona";
    const tail = name.slice(stem.length);
    if (locant && tail === `-${locant}-${suffix}`) {
      add("01", name.slice(stem.length + 1), language === "en" ? "Ketone locant and suffix" : "Posición y sufijo de la cetona", "function");
      add("02", name.slice(0, stem.length), chainLabel, "parent");
      add("03", String(locant), language === "en" ? "Carbonyl locant" : "Localizador del carbonilo", "numbering");
    } else if (tail === suffix) {
      add("01", name.slice(-suffix.length), language === "en" ? "Ketone suffix" : "Sufijo de la cetona", "function");
      add("02", name.slice(0, stem.length), chainLabel, "parent");
    }
    return fragments;
  }

  if (!analysis.primaryFunctionalGroup
    && !analysis.functionalGroups.length
    && !analysis.substituents.length
    && analysis.doubleBondLocants.length === 1
    && !analysis.tripleBondLocants.length
    && name.startsWith(stem)) {
    const locant = analysis.doubleBondLocants[0];
    const suffix = language === "en" ? "ene" : "eno";
    if (name.slice(stem.length) === `-${locant}-${suffix}`) {
      add("02", name.slice(0, stem.length), chainLabel, "parent");
      add("03", name.slice(stem.length + 1), language === "en" ? "Double bond and locant" : "Enlace doble y localizador", "unsaturation");
    }
    return fragments;
  }

  if (analysis.primaryFunctionalGroup || analysis.functionalGroups.length
    || analysis.doubleBondLocants.length || analysis.tripleBondLocants.length
    || !name.endsWith(parent)) return fragments;
  const prefix = name.slice(0, -parent.length);
  if (!prefix && !analysis.substituents.length) {
    add("02", name, chainLabel, "parent");
  } else if (analysis.substituents.length === 1 && !analysis.substituents[0].complex) {
    const substituent = analysis.substituents[0];
    const named = localizedName(substituent.name, language);
    if (prefix === `${substituent.locant}-${named}`) {
      add("02", name.slice(-parent.length), chainLabel, "parent");
      add("03", String(substituent.locant), language === "en" ? "Substituent locant" : "Localizador del sustituyente", "numbering");
      add("04", prefix, language === "en" ? "Substituent and locant" : "Sustituyente y localizador", "substituent");
    }
  }
  return fragments;
}
