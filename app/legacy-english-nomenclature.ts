import { englishIupacRoot, iupacRootForCarbonCount } from "./iupac-prefixes.ts";

export const IUPAC_1979_LEGACY_ENGLISH_PROFILE = "iupac-1979-legacy-en" as const;
export type NomenclatureProfile =
  | typeof IUPAC_1979_LEGACY_ENGLISH_PROFILE
  | "iupac-2013-pin-en";

export type LegacyFunctionalGroupKind =
  | "carboxylicAcid"
  | "sulfonicAcid"
  | "ester"
  | "amide"
  | "nitrile"
  | "aldehyde"
  | "ketone"
  | "alcohol"
  | "amine"
  | "ether"
  | "halogen"
  | "nitro";

export type FunctionalGroupForm = {
  priority: number;
  suffix?: string;
  prefix?: string;
  suffixEligible: boolean;
};

/** One auditable hierarchy shared by resolution, tests and future group additions. */
export const FUNCTIONAL_GROUP_FORMS: Readonly<Record<LegacyFunctionalGroupKind, FunctionalGroupForm>> = {
  carboxylicAcid: { priority: 100, suffix: "oic acid", prefix: "carboxy", suffixEligible: true },
  sulfonicAcid: { priority: 90, suffix: "sulfonic acid", prefix: "sulfo", suffixEligible: true },
  ester: { priority: 80, suffix: "oate", prefix: "alkoxycarbonyl", suffixEligible: true },
  amide: { priority: 75, suffix: "amide", prefix: "carbamoyl", suffixEligible: true },
  nitrile: { priority: 70, suffix: "nitrile", prefix: "cyano", suffixEligible: true },
  aldehyde: { priority: 60, suffix: "al", prefix: "formyl", suffixEligible: true },
  ketone: { priority: 50, suffix: "one", prefix: "oxo", suffixEligible: true },
  alcohol: { priority: 40, suffix: "ol", prefix: "hydroxy", suffixEligible: true },
  amine: { priority: 30, suffix: "amine", prefix: "amino", suffixEligible: true },
  ether: { priority: 10, prefix: "alkoxy", suffixEligible: false },
  halogen: { priority: 0, suffixEligible: false },
  nitro: { priority: 0, prefix: "nitro", suffixEligible: false },
};

export type LegacyFunctionalGroup = {
  kind: LegacyFunctionalGroupKind;
  locant: number;
  carbonIncludedInParent: boolean;
  attachedAlkylName?: string;
};

export type LegacySubstituent = {
  locant: number;
  systematicName: string;
  complex: boolean;
};

export type LegacyEnglishNameModel = {
  profile: typeof IUPAC_1979_LEGACY_ENGLISH_PROFILE;
  parent: {
    kind: "chain" | "ring" | "aromatic" | "polycyclic" | "heterocycle";
    carbonCount: number;
    atomIds: number[];
    fallbackName?: string;
  };
  doubleBondLocants: number[];
  tripleBondLocants: number[];
  functionalGroups: LegacyFunctionalGroup[];
  substituents: LegacySubstituent[];
  stereochemicalPrefix?: string;
};

export type ParentCandidateCriteria = {
  principalGroupCount: number;
  multipleBondCount: number;
  carbonCount: number;
  doubleBondCount: number;
  principalGroupLocants: number[];
  multipleBondLocants: number[];
  doubleBondLocants: number[];
  prefixCount: number;
  prefixLocants: number[];
  alphabeticalTieBreak: string;
};

export type NumberingCriteria = {
  principalGroupLocants: number[];
  multipleBondLocants: number[];
  doubleBondLocants: number[];
  prefixLocants: number[];
  alphabeticalTieBreak: string;
};

export function compareLocantSets(left: readonly number[], right: readonly number[]) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? Number.POSITIVE_INFINITY;
    const b = right[index] ?? Number.POSITIVE_INFINITY;
    if (a !== b) return a - b;
  }
  return 0;
}

/** Ordered 1979-style parent criteria; negative means the left candidate wins. */
export function compareParentCandidates(left: ParentCandidateCriteria, right: ParentCandidateCriteria) {
  const descending = (a: number, b: number) => b - a;
  return descending(left.principalGroupCount, right.principalGroupCount)
    || descending(left.multipleBondCount, right.multipleBondCount)
    || descending(left.carbonCount, right.carbonCount)
    || descending(left.doubleBondCount, right.doubleBondCount)
    || compareLocantSets(left.principalGroupLocants, right.principalGroupLocants)
    || compareLocantSets(left.multipleBondLocants, right.multipleBondLocants)
    || compareLocantSets(left.doubleBondLocants, right.doubleBondLocants)
    || descending(left.prefixCount, right.prefixCount)
    || compareLocantSets(left.prefixLocants, right.prefixLocants)
    || left.alphabeticalTieBreak.localeCompare(right.alphabeticalTieBreak, "en", { sensitivity: "base" });
}

/** Numbering is deliberately separate from choosing the parent framework. */
export function compareNumberings(left: NumberingCriteria, right: NumberingCriteria) {
  return compareLocantSets(left.principalGroupLocants, right.principalGroupLocants)
    || compareLocantSets(left.multipleBondLocants, right.multipleBondLocants)
    || compareLocantSets(left.doubleBondLocants, right.doubleBondLocants)
    || compareLocantSets(left.prefixLocants, right.prefixLocants)
    || left.alphabeticalTieBreak.localeCompare(right.alphabeticalTieBreak, "en", { sensitivity: "base" });
}

export function numberParent<T>(
  candidates: readonly T[],
  criteria: (candidate: T) => NumberingCriteria,
) {
  return [...candidates].sort((left, right) => compareNumberings(criteria(left), criteria(right)))[0];
}

export function selectParent<T>(
  candidates: readonly T[],
  criteria: (candidate: T) => ParentCandidateCriteria,
) {
  return [...candidates].sort((left, right) => compareParentCandidates(criteria(left), criteria(right)))[0];
}

export function resolveFunctionalHierarchy(groups: readonly LegacyFunctionalGroup[]) {
  const principalKind = [...new Set(groups.map((group) => group.kind))]
    .filter((kind) => FUNCTIONAL_GROUP_FORMS[kind].suffixEligible)
    .sort((left, right) => FUNCTIONAL_GROUP_FORMS[right].priority - FUNCTIONAL_GROUP_FORMS[left].priority)[0];
  return {
    principalKind,
    principalGroups: principalKind ? groups.filter((group) => group.kind === principalKind) : [],
    subordinateGroups: groups.filter((group) => group.kind !== principalKind),
  };
}

const SIMPLE_MULTIPLIERS = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"];
const COMPLEX_MULTIPLIERS = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis"];

export function getAlphabetizationKey(name: string) {
  return name
    .toLocaleLowerCase("en")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^(?:(?:\d+(?:,\d+)*)-)+/, "")
    .replace(/[0-9,()\-]/g, "")
    .replace(/^(?:di|tri|tetra|penta|hexa|hepta|octa|nona|deca|bis|tris|tetrakis|pentakis|hexakis)/, "")
    .replace(/^(?:sec|tert)/, "");
}

const fixedPrefixTranslations: Readonly<Record<string, string>> = {
  amino: "amino", bromo: "bromo", ciano: "cyano", cloro: "chloro", fluoro: "fluoro",
  formil: "formyl", hidroxi: "hydroxy", isobutil: "isobutyl", isopropil: "isopropyl",
  nitro: "nitro", oxo: "oxo", fenil: "phenyl", secbutil: "sec-butyl",
  "sec-butil": "sec-butyl", tertbutil: "tert-butyl", "tert-butil": "tert-butyl", yodo: "iodo",
};

/** Converts the structural Spanish morphemes emitted by graph analysis, not arbitrary prose. */
export function englishStructuralSubstituentName(name: string) {
  const exact = fixedPrefixTranslations[name];
  if (exact) return exact;
  let translated = name
    .replace(/ciclo/g, "cyclo")
    .replace(/fenil/g, "phenyl")
    .replace(/hidroxi/g, "hydroxy")
    .replace(/ciano/g, "cyano")
    .replace(/formil/g, "formyl")
    .replace(/carboxi/g, "carboxy")
    .replace(/carbamoil/g, "carbamoyl")
    .replace(/metoxi/g, "methoxy")
    .replace(/etoxi/g, "ethoxy")
    .replace(/propoxi/g, "propoxy")
    .replace(/butoxi/g, "butoxy")
    .replace(/cloro/g, "chloro")
    .replace(/yodo/g, "iodo");
  const roots = Array.from({ length: 101 }, (_, count) => iupacRootForCarbonCount(count))
    .filter((root): root is string => Boolean(root))
    .sort((a, b) => b.length - a.length);
  for (const root of roots) {
    translated = translated.replace(new RegExp(`${root}il`, "g"), `${englishIupacRoot(root)}yl`);
  }
  return translated;
}

export function nameSubstituents(substituents: readonly LegacySubstituent[]) {
  const groups = new Map<string, { name: string; complex: boolean; locants: number[] }>();
  for (const substituent of substituents) {
    const name = englishStructuralSubstituentName(substituent.systematicName);
    const key = `${substituent.complex}:${name}`;
    const group = groups.get(key) ?? { name, complex: substituent.complex, locants: [] };
    group.locants.push(substituent.locant);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => getAlphabetizationKey(a.name).localeCompare(getAlphabetizationKey(b.name), "en")
      || a.name.localeCompare(b.name, "en"))
    .map((group) => {
      const locants = [...group.locants].sort((a, b) => a - b).join(",");
      if (group.locants.length === 1) return group.complex ? `${locants}-(${group.name})` : `${locants}-${group.name}`;
      const multiplier = group.complex
        ? COMPLEX_MULTIPLIERS[group.locants.length] ?? `${group.locants.length}x`
        : SIMPLE_MULTIPLIERS[group.locants.length] ?? `${group.locants.length}x`;
      return group.complex
        ? `${locants}-${multiplier}(${group.name})`
        : `${locants}-${multiplier}${group.name}`;
    });
}

function rootFor(count: number) {
  const root = iupacRootForCarbonCount(count);
  return root ? englishIupacRoot(root) : undefined;
}

function unsaturatedStem(carbonCount: number, doubleLocants: readonly number[], tripleLocants: readonly number[]) {
  const root = rootFor(carbonCount);
  if (!root) return undefined;
  if (!doubleLocants.length && !tripleLocants.length) return `${root}an`;
  if (doubleLocants.length && !tripleLocants.length) {
    return doubleLocants.length === 1
      ? `${doubleLocants[0]}-${root}en`
      : `${doubleLocants.join(",")}-${root}a${SIMPLE_MULTIPLIERS[doubleLocants.length] ?? doubleLocants.length}en`;
  }
  if (tripleLocants.length && !doubleLocants.length) {
    return tripleLocants.length === 1
      ? `${tripleLocants[0]}-${root}yn`
      : `${tripleLocants.join(",")}-${root}a${SIMPLE_MULTIPLIERS[tripleLocants.length] ?? tripleLocants.length}yn`;
  }
  const ene = doubleLocants.length === 1
    ? `${doubleLocants[0]}-${root}en`
    : `${doubleLocants.join(",")}-${root}a${SIMPLE_MULTIPLIERS[doubleLocants.length] ?? doubleLocants.length}en`;
  const yne = tripleLocants.length === 1
    ? `${tripleLocants[0]}-yn`
    : `${tripleLocants.join(",")}-${SIMPLE_MULTIPLIERS[tripleLocants.length] ?? tripleLocants.length}yn`;
  return `${ene}-${yne}`;
}

function hydrocarbonParent(model: LegacyEnglishNameModel) {
  const { carbonCount, kind } = model.parent;
  if (kind === "polycyclic" || kind === "heterocycle") return model.parent.fallbackName ?? "molecule";
  const root = rootFor(carbonCount);
  const stem = unsaturatedStem(carbonCount, model.doubleBondLocants, model.tripleBondLocants);
  if (!root || !stem) return model.parent.fallbackName ?? "molecule";
  if (kind === "aromatic") return carbonCount === 6 ? "benzene" : model.parent.fallbackName ?? "arene";
  const cyclo = kind === "ring" ? "cyclo" : "";
  if (!model.doubleBondLocants.length && !model.tripleBondLocants.length) return `${cyclo}${root}ane`;
  return kind === "ring"
    ? `${stem.replace(/^([\d,]+)-/, "$1-cyclo")}e`
    : `${stem}e`;
}

function functionalParent(model: LegacyEnglishNameModel, principal: LegacyFunctionalGroupKind, groups: LegacyFunctionalGroup[]) {
  if (model.parent.kind === "polycyclic" || model.parent.kind === "heterocycle") {
    return model.parent.fallbackName ?? "molecule";
  }
  const root = rootFor(model.parent.carbonCount);
  if (!root) return model.parent.fallbackName ?? "molecule";
  const locants = groups.map((group) => group.locant).sort((a, b) => a - b);
  const locantText = locants.join(",");
  const count = locants.length;
  const multiple = SIMPLE_MULTIPLIERS[count] ?? `${count}`;
  const parentKind = model.parent.kind;
  const aromatic = parentKind === "aromatic" && model.parent.carbonCount === 6;
  const ring = parentKind === "ring" || aromatic;
  const included = groups.every((group) => group.carbonIncludedInParent);

  if (aromatic) {
    if (principal === "alcohol" && count === 1) return "phenol";
    if (principal === "alcohol" && count > 1) return `benzene-${locantText}-${multiple}ol`;
    if (principal === "amine" && count === 1) return "aniline";
    if (principal === "amine" && count > 1) return `benzene-${locantText}-${multiple}amine`;
    if (principal === "carboxylicAcid") return count === 1 ? "benzoic acid" : `benzene-${locantText}-${multiple}carboxylic acid`;
    if (principal === "aldehyde") return count === 1 ? "benzaldehyde" : `benzene-${locantText}-${multiple}carbaldehyde`;
    if (principal === "nitrile") return count === 1 ? "benzonitrile" : `benzene-${locantText}-${multiple}carbonitrile`;
  }

  if (ring) {
    const base = hydrocarbonParent({ ...model, functionalGroups: [] });
    if (!included) {
      if (principal === "carboxylicAcid") return `${base}carboxylic acid`;
      if (principal === "aldehyde") return `${base}carbaldehyde`;
      if (principal === "nitrile") return `${base}carbonitrile`;
      if (principal === "amide") return `${base}carboxamide`;
    }
    const stem = base.endsWith("e") ? base.slice(0, -1) : base;
    if (principal === "alcohol") return count === 1 && locants[0] === 1 ? `${stem}ol` : `${stem}-${locantText}-${multiple}ol`;
    if (principal === "ketone") return count === 1 && locants[0] === 1 ? `${stem}one` : `${stem}-${locantText}-${multiple}one`;
    if (principal === "amine") return count === 1 ? `${stem}amine` : `${stem}-${locantText}-${multiple}amine`;
  }

  const stem = unsaturatedStem(model.parent.carbonCount, model.doubleBondLocants, model.tripleBondLocants) ?? `${root}an`;
  const saturated = !model.doubleBondLocants.length && !model.tripleBondLocants.length;
  if (principal === "carboxylicAcid") return `${stem}oic acid`;
  if (principal === "ester") {
    const alkylNames = groups
      .map((group) => group.attachedAlkylName ? englishStructuralSubstituentName(group.attachedAlkylName) : "alkyl")
      .sort((a, b) => getAlphabetizationKey(a).localeCompare(getAlphabetizationKey(b), "en"));
    const alkyl = alkylNames.length === 1
      ? alkylNames[0]
      : `${SIMPLE_MULTIPLIERS[alkylNames.length] ?? alkylNames.length}${alkylNames[0]}`;
    return count === 1 ? `${alkyl} ${stem}oate` : `${alkyl} ${stem}e${multiple}oate`;
  }
  if (principal === "aldehyde") return count === 1 ? `${stem}al` : `${stem}e${multiple}al`;
  if (principal === "nitrile") return count === 1 ? `${stem}enitrile` : `${stem}e${multiple}nitrile`;
  if (principal === "amide") return count === 1 ? `${stem}amide` : `${stem}e${multiple}amide`;
  if (principal === "alcohol") {
    if (count === 1) {
      if (saturated && model.parent.carbonCount <= 2) return `${stem}ol`;
      return saturated ? `${locants[0]}-${stem}ol` : `${stem}-${locants[0]}-ol`;
    }
    return saturated ? `${locantText}-${root}ane${multiple}ol` : `${stem}-${locantText}-${multiple}ol`;
  }
  if (principal === "ketone") {
    if (count === 1 && saturated && model.parent.carbonCount === 3 && locants[0] === 2) return "propanone";
    if (count === 1 && saturated) return `${locants[0]}-${stem}one`;
    return saturated ? `${locantText}-${root}ane${multiple}one` : `${stem}-${locantText}-${multiple}one`;
  }
  if (principal === "amine") {
    if (count === 1 && saturated && model.parent.carbonCount <= 2) return `${stem}amine`;
    if (count === 1 && saturated) return `${locants[0]}-${stem}amine`;
    return saturated ? `${locantText}-${root}ane${multiple}amine` : `${stem}-${locantText}-${multiple}amine`;
  }
  return hydrocarbonParent(model);
}

export type LegacyEnglishReasoning = {
  profile: typeof IUPAC_1979_LEGACY_ENGLISH_PROFILE;
  principalFunctionalGroup?: LegacyFunctionalGroupKind;
  selectedParent: LegacyEnglishNameModel["parent"] & { reason: string };
  numbering: {
    principalGroupLocants: number[];
    multipleBondLocants: number[];
    substituentLocants: number[];
  };
  substituents: Array<{ locant: number; name: string }>;
  finalName: string;
};

export function formatName(model: LegacyEnglishNameModel) {
  const hierarchy = resolveFunctionalHierarchy(model.functionalGroups);
  const parentName = hierarchy.principalKind
    ? functionalParent(model, hierarchy.principalKind, hierarchy.principalGroups)
    : hydrocarbonParent(model);
  let prefixParts = nameSubstituents(model.substituents);
  if (
    !hierarchy.principalKind
    && (model.parent.kind === "ring" || model.parent.kind === "aromatic")
    && prefixParts.length === 1
    && model.substituents.length === 1
    && model.substituents[0].locant === 1
  ) {
    prefixParts = [prefixParts[0].replace(/^1-/, "")];
  }
  let prefixed = parentName;
  if (prefixParts.length) {
    const prefix = prefixParts.join("-");
    const ester = hierarchy.principalKind === "ester"
      ? parentName.match(/^(.+?\s)(\S+oate)$/)
      : undefined;
    prefixed = ester
      ? `${ester[1]}${prefix}${/^\d/.test(ester[2]) ? "-" : ""}${ester[2]}`
      : `${prefix}${/^\d/.test(parentName) ? "-" : ""}${parentName}`;
  }
  const clean = prefixed.replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return model.stereochemicalPrefix ? `${model.stereochemicalPrefix}${clean}` : clean;
}

export function generateLegacyEnglishName(model: LegacyEnglishNameModel) {
  const hierarchy = resolveFunctionalHierarchy(model.functionalGroups);
  const finalName = formatName(model);
  const principalLocants = hierarchy.principalGroups.map((group) => group.locant).sort((a, b) => a - b);
  const reasoning: LegacyEnglishReasoning = {
    profile: IUPAC_1979_LEGACY_ENGLISH_PROFILE,
    principalFunctionalGroup: hierarchy.principalKind,
    selectedParent: {
      ...model.parent,
      reason: hierarchy.principalKind
        ? "contains the maximum number of principal characteristic groups"
        : "selected by multiple-bond count, carbon count and deterministic locant criteria",
    },
    numbering: {
      principalGroupLocants: principalLocants,
      multipleBondLocants: [...model.doubleBondLocants, ...model.tripleBondLocants].sort((a, b) => a - b),
      substituentLocants: model.substituents.map((substituent) => substituent.locant).sort((a, b) => a - b),
    },
    substituents: model.substituents.map((substituent) => ({
      locant: substituent.locant,
      name: englishStructuralSubstituentName(substituent.systematicName),
    })),
    finalName,
  };
  return { name: finalName, reasoning };
}
