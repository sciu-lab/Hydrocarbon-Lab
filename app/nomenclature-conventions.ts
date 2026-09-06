import type { AppLanguage } from "./i18n";
import {
  compactHalogenatedName,
  hyphenateHalogenatedName,
  stripMethaneHalogenLocants,
} from "./iupac-name-normalization.ts";
import { englishIupacRoot, IUPAC_ROOTS } from "./iupac-prefixes.ts";

export type NomenclatureConvention = "current" | "traditional";

type ConventionCycle = readonly NomenclatureConvention[];

const conventionCycles: Record<AppLanguage, ConventionCycle> = {
  es: ["current", "traditional"],
  en: ["current", "traditional"],
};
const stereoPrefix = /^(\((?:\d+[EZ](?:,\d+[EZ])*)\)-)(.+)$/;
const pureAlkaneNames = new Set(
  IUPAC_ROOTS.slice(1).flatMap((root) => [`${root}ano`, `${englishIupacRoot(root)}ane`]),
);

type TraditionalName = {
  es: string;
  en: string;
};

const traditionalNames: Record<string, TraditionalName> = {
  metano: { es: "metano", en: "methane" },
  methane: { es: "metano", en: "methane" },
  etano: { es: "etano", en: "ethane" },
  ethane: { es: "etano", en: "ethane" },
  propano: { es: "propano", en: "propane" },
  propane: { es: "propano", en: "propane" },
  eteno: { es: "etileno", en: "ethylene" },
  ethene: { es: "etileno", en: "ethylene" },
  propeno: { es: "propileno", en: "propylene" },
  propene: { es: "propileno", en: "propylene" },
  "prop-1-eno": { es: "propileno", en: "propylene" },
  "prop-1-ene": { es: "propileno", en: "propylene" },
  "but-1-eno": { es: "butileno", en: "butylene" },
  "but-1-ene": { es: "butileno", en: "butylene" },
  "but-2-eno": { es: "butileno", en: "butylene" },
  "but-2-ene": { es: "butileno", en: "butylene" },
  etino: { es: "acetileno", en: "acetylene" },
  ethyne: { es: "acetileno", en: "acetylene" },
  "prop-1-ino": { es: "metilacetileno", en: "methylacetylene" },
  "prop-1-yne": { es: "metilacetileno", en: "methylacetylene" },
  metanol: { es: "metanol", en: "methanol" },
  methanol: { es: "metanol", en: "methanol" },
  "propan-1-ol": { es: "propanol", en: "propanol" },
  "propan-2-ol": { es: "alcohol isopropílico", en: "isopropyl alcohol" },
  etanol: { es: "alcohol etílico", en: "ethyl alcohol" },
  ethanol: { es: "alcohol etílico", en: "ethyl alcohol" },
  "etan-1-ol": { es: "alcohol etílico", en: "ethyl alcohol" },
  "ethan-1-ol": { es: "alcohol etílico", en: "ethyl alcohol" },
  "etan-1,2-diol": { es: "etilenglicol", en: "ethylene glycol" },
  "ethane-1,2-diol": { es: "etilenglicol", en: "ethylene glycol" },
  "propan-1,2-diol": { es: "propilenglicol", en: "propylene glycol" },
  "propane-1,2-diol": { es: "propilenglicol", en: "propylene glycol" },
  "propan-1,2,3-triol": { es: "glicerina", en: "glycerin" },
  "propane-1,2,3-triol": { es: "glicerina", en: "glycerin" },
  metoximetano: { es: "dimetil éter", en: "dimethyl ether" },
  methoxymethane: { es: "dimetil éter", en: "dimethyl ether" },
  metoxietano: { es: "etil metil éter", en: "ethyl methyl ether" },
  methoxyethane: { es: "etil metil éter", en: "ethyl methyl ether" },
  etoxietano: { es: "dietil éter", en: "diethyl ether" },
  ethoxyethane: { es: "dietil éter", en: "diethyl ether" },
  metanal: { es: "formaldehído", en: "formaldehyde" },
  methanal: { es: "formaldehído", en: "formaldehyde" },
  etanal: { es: "acetaldehído", en: "acetaldehyde" },
  ethanal: { es: "acetaldehído", en: "acetaldehyde" },
  propanal: { es: "propionaldehído", en: "propionaldehyde" },
  "propan-2-ona": { es: "acetona", en: "acetone" },
  "propan-2-one": { es: "acetona", en: "acetone" },
  "butan-2-ona": { es: "etil metil cetona", en: "ethyl methyl ketone" },
  "butan-2-one": { es: "etil metil cetona", en: "ethyl methyl ketone" },
  benceno: { es: "benceno", en: "benzene" },
  benzene: { es: "benceno", en: "benzene" },
  fenol: { es: "fenol", en: "phenol" },
  phenol: { es: "fenol", en: "phenol" },
  anilina: { es: "anilina", en: "aniline" },
  aniline: { es: "anilina", en: "aniline" },
  "ácido benzoico": { es: "ácido benzoico", en: "benzoic acid" },
  "benzoic acid": { es: "ácido benzoico", en: "benzoic acid" },
  etenilbenceno: { es: "estireno", en: "styrene" },
  ethenylbenzene: { es: "estireno", en: "styrene" },
  naftaleno: { es: "naftaleno", en: "naphthalene" },
  naphthalene: { es: "naftaleno", en: "naphthalene" },
  "ácido metanoico": { es: "ácido fórmico", en: "formic acid" },
  "methanoic acid": { es: "ácido fórmico", en: "formic acid" },
  "ácido etanoico": { es: "ácido acético", en: "acetic acid" },
  "ethanoic acid": { es: "ácido acético", en: "acetic acid" },
  "ácido propanoico": { es: "ácido propiónico", en: "propionic acid" },
  "propanoic acid": { es: "ácido propiónico", en: "propionic acid" },
  metilbenceno: { es: "tolueno", en: "toluene" },
  methylbenzene: { es: "tolueno", en: "toluene" },
};

/** Removes only the displayed alkene E/Z prefix; the structural model is untouched. */
export function stripStereochemicalDescriptors(name: string) {
  const directMatch = name.match(stereoPrefix);
  if (directMatch) return directMatch[2];

  const acidMatch = name.match(/^(ácido |acid )(\((?:\d+[EZ](?:,\d+[EZ])*)\)-)(.+)$/i);
  if (acidMatch) return `${acidMatch[1]}${acidMatch[3]}`;
  return name;
}

function splitStereochemicalPrefix(name: string) {
  const directMatch = name.match(stereoPrefix);
  if (directMatch) return { prefix: directMatch[1], baseName: directMatch[2] };

  const acidMatch = name.match(/^(ácido |acid )(\((?:\d+[EZ](?:,\d+[EZ])*)\)-)(.+)$/i);
  if (acidMatch) return { prefix: `${acidMatch[1]}${acidMatch[2]}`, baseName: acidMatch[3] };
  return { prefix: "", baseName: name };
}

function traditionalName(baseName: string, language: AppLanguage) {
  const retainedName = traditionalNames[baseName.toLocaleLowerCase("es")]?.[language];
  if (retainedName) return retainedName;
  if (/(?:fluoro|cloro|chloro|bromo|yodo|iodo)/i.test(baseName)) {
    return compactHalogenatedName(baseName);
  }
  return pureAlkaneNames.has(baseName.toLocaleLowerCase("es")) ? baseName : "-";
}

/**
 * Applies only display conventions to a localized PIN. It deliberately does
 * not parse or identify a molecule, so OPSIN/OpenChemLib naming remains the
 * canonical source of the underlying name.
 */
export function applyNomenclatureConvention(
  name: string,
  convention: NomenclatureConvention,
  language: AppLanguage,
) {
  const activeConvention = convention;
  const { prefix, baseName } = splitStereochemicalPrefix(name);
  const formattedName = activeConvention === "traditional"
    ? traditionalName(baseName, language)
    : baseName;
  if (formattedName === "-") return "-";
  const methaneLocantsRemoved = stripMethaneHalogenLocants(formattedName);
  const halogenFormattedName = activeConvention === "traditional"
    ? compactHalogenatedName(methaneLocantsRemoved)
    : hyphenateHalogenatedName(methaneLocantsRemoved);
  return `${prefix}${halogenFormattedName}`;
}

export function nextNomenclatureConvention(
  current: NomenclatureConvention,
  language: AppLanguage,
): NomenclatureConvention {
  const cycle = conventionCycles[language];
  const currentIndex = cycle.indexOf(current);
  return cycle[(currentIndex + 1) % cycle.length];
}

export function nomenclatureConventionLabel(
  convention: NomenclatureConvention,
  language: AppLanguage,
) {
  if (language === "en") {
    return convention === "traditional" ? "Traditional" : "IUPAC Preferred";
  }
  return convention === "traditional" ? "Tradicional" : "IUPAC Preferido";
}
