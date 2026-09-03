import type { AppLanguage } from "./i18n";
import {
  compactHalogenatedName,
  hyphenateHalogenatedName,
} from "./iupac-name-normalization.ts";

export type NomenclatureConvention = "current" | "school" | "traditional";

type ConventionCycle = readonly NomenclatureConvention[];

const conventionCycles: Record<AppLanguage, ConventionCycle> = {
  es: ["current", "school", "traditional"],
  en: ["current", "traditional"],
};

const functionalSuffixes = "ene|yne|eno|ino|ol|one|ona|amine|amina";
const locantedSuffix = new RegExp(
  `([a-záéíóúñ]+)-(\\d+)-(${functionalSuffixes})(?=$|[^a-záéíóúñ])`,
  "i",
);
const unsaturatedSuffix = /^(ene|yne|eno|ino)$/i;
const stereoPrefix = /^(\((?:\d+[EZ](?:,\d+[EZ])*)\)-)(.+)$/;

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
  etanol: { es: "etanol", en: "ethanol" },
  ethanol: { es: "etanol", en: "ethanol" },
  "propan-1-ol": { es: "propanol", en: "propanol" },
  "propan-2-ol": { es: "2-propanol", en: "2-propanol" },
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

function addSchoolBaseVowel(baseName: string) {
  return baseName.replace(locantedSuffix, (match, parent: string, locant: string, suffix: string) => (
    unsaturatedSuffix.test(suffix) ? `${parent}a-${locant}-${suffix}` : match
  ));
}

function moveFunctionalLocantToFront(baseName: string) {
  const match = locantedSuffix.exec(baseName);
  if (!match) return baseName;

  const [matched, parent, locant, suffix] = match;
  const parentName = `${parent}${suffix}`;
  return `${locant}-${baseName.replace(matched, parentName)}`;
}

function traditionalName(baseName: string, language: AppLanguage) {
  return traditionalNames[baseName.toLocaleLowerCase("es")]?.[language]
    ?? moveFunctionalLocantToFront(baseName);
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
  const activeConvention = language === "en" && convention === "school"
    ? "current"
    : convention;
  const { prefix, baseName } = splitStereochemicalPrefix(name);
  const formattedName = activeConvention === "school"
    ? addSchoolBaseVowel(baseName)
    : activeConvention === "traditional"
      ? traditionalName(baseName, language)
      : baseName;
  const halogenFormattedName = activeConvention === "traditional"
    ? compactHalogenatedName(formattedName)
    : hyphenateHalogenatedName(formattedName);
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
  if (language === "en") return convention === "traditional" ? "Traditional" : "IUPAC Preferred";
  if (convention === "school") return "PAES/Escolar";
  return convention === "traditional" ? "Tradicional" : "IUPAC Actual";
}
