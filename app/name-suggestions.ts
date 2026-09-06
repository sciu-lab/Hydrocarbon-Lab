import type { AppLanguage } from "./i18n";
import { englishIupacRoot, IUPAC_ROOTS } from "./iupac-prefixes.ts";

export type CommonNameSuggestion = {
  id: string;
  name: string;
  confidence?: number;
};

type CommonMolecule = {
  id: string;
  es: string;
  en: string;
  aliases: string[];
  suggestOnExactFailure?: boolean;
};

export type IupacTokens = {
  parent: string | null;
  suffix: string | null;
  locants: string[];
  substituents: string[];
};

/**
 * Restricted vocabulary used by the suggestion layer. It intentionally
 * describes spelling and presentation only; molecule parsing stays in OPSIN
 * and OpenChemLib.
 */
export const chemicalDictionary = {
  roots: IUPAC_ROOTS.slice(1),
  suffixes: ["ano", "eno", "ino", "ol", "diol", "triol", "al", "ona", "oico"],
  groups: ["cloro", "bromo", "fluoro", "yodo", "hidroxi", "amino"],
  diolPatterns: [
    { regex: /^([a-z]+)ano-(\d+(?:,\d+)*)-diol$/i, correction: "$1an-$2-diol" },
    { regex: /^(\d+(?:,\d+)*)-([a-z]+)odiol$/i, correction: "$2an-$1-diol" },
  ],
} as const;

const englishRoots = IUPAC_ROOTS.slice(1).map(englishIupacRoot);
const correctionSuffixes = ["ol", "diol", "triol"] as const;

const commonMolecules: CommonMolecule[] = [
  { id: "benzene", es: "benceno", en: "benzene", aliases: ["benceno", "benzene"] },
  { id: "phenol", es: "fenol", en: "phenol", aliases: ["fenol", "phenol"] },
  { id: "cyclohexane", es: "ciclohexano", en: "cyclohexane", aliases: ["ciclohexano", "cyclohexane"] },
  { id: "ethanol-systematic", es: "etan-1-ol", en: "ethan-1-ol", aliases: ["alcohol etilico", "ethyl alcohol"] },
  { id: "ethanol", es: "etanol", en: "ethanol", aliases: ["etanol", "ethanol"] },
  { id: "propanol", es: "propan-1-ol", en: "propan-1-ol", aliases: ["propanol", "propan-1-ol", "1-propanol"] },
  { id: "isopropanol", es: "propan-2-ol", en: "propan-2-ol", aliases: ["propan-2-ol", "2-propanol", "alcohol isopropilico", "isopropyl alcohol"] },
  { id: "ethanediol", es: "etan-1,2-diol", en: "ethane-1,2-diol", aliases: ["etan-1,2-diol", "1,2-etanodiol", "etilenglicol", "ethane-1,2-diol", "ethylene glycol"] },
  { id: "propanediol", es: "propan-1,2-diol", en: "propane-1,2-diol", aliases: ["propan-1,2-diol", "1,2-propanodiol", "propilenglicol", "propane-1,2-diol", "propylene glycol"] },
  { id: "glycerol", es: "propan-1,2,3-triol", en: "propane-1,2,3-triol", aliases: ["propan-1,2,3-triol", "1,2,3-propanotriol", "glicerina", "glicerol", "glycerin", "glycerol"] },
  { id: "butanol", es: "butan-1-ol", en: "butan-1-ol", aliases: ["butanol", "butan-1-ol", "1-butanol"] },
  { id: "hexane", es: "hexano", en: "hexane", aliases: ["hexano", "hexane"] },
  { id: "hexene", es: "hex-1-eno", en: "hex-1-ene", aliases: ["hexeno", "hex-1-eno", "hexene", "hex-1-ene"] },
  { id: "propene", es: "prop-1-eno", en: "prop-1-ene", aliases: ["propeno", "prop-1-eno", "propene", "prop-1-ene"] },
  { id: "butene", es: "but-1-eno", en: "but-1-ene", aliases: ["buteno", "but-1-eno", "butene", "but-1-ene"] },
  { id: "glucose", es: "glucosa", en: "glucose", aliases: ["glucosa", "glucose"], suggestOnExactFailure: true },
];

const spanishRootPattern = IUPAC_ROOTS.slice(1).sort((left, right) => right.length - left.length).join("|");
const englishRootPattern = englishRoots.slice().sort((left, right) => right.length - left.length).join("|");
const parentPattern = new RegExp(`(?:ciclo)?(?:${spanishRootPattern})(?:an|en|in)?o?|(?:cyclo)?(?:${englishRootPattern})(?:ane|ene|yne)?|benceno|benzene`);
const unlocantedOxygenatedParentPattern = new RegExp(
  `^(?:(?:${spanishRootPattern})an(?:ol|al|ona)|acido(?:${spanishRootPattern})anoico)$`,
  "i",
);
const suffixPattern = /(?:diol|triol|tetraol|ol|diona|ona|one|al|dial|amina|amine|eno|ene|ino|yne|oico|oicacid)/;
const substituentPattern = /(?:fluoro|cloro|chloro|bromo|yodo|iodo|metil|methyl|etil|ethyl|hidroxi|hydroxy|amino|nitro)/g;

/** Preserves chemical separators while making user input comparable. */
export function normalizeChemicalInput(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*,\s*/g, ",")
    .replace(/-+/g, "-");
}

function normalizeName(value: string) {
  return normalizeChemicalInput(value).replace(/[^a-z0-9]/g, "");
}

function normalizeChemicalText(value: string) {
  return normalizeChemicalInput(value).replace(/\s+/g, "");
}

export function levenshteinDistance(left: string, right: string) {
  const source = normalizeName(left);
  const target = normalizeName(right);
  const previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    let diagonal = previous[0];
    previous[0] = sourceIndex;
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const above = previous[targetIndex];
      previous[targetIndex] = Math.min(
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + 1,
        diagonal + Number(source[sourceIndex - 1] !== target[targetIndex - 1]),
      );
      diagonal = above;
    }
  }
  return previous[target.length];
}

/** Edit distance that recognizes a transposed pair as one typo. */
export function damerauLevenshteinDistance(left: string, right: string) {
  const source = normalizeName(left);
  const target = normalizeName(right);
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  matrix.forEach((row, index) => { row[0] = index; });
  matrix[0].forEach((_value, index) => { matrix[0][index] = index; });
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitution = Number(source[sourceIndex - 1] !== target[targetIndex - 1]);
      matrix[sourceIndex][targetIndex] = Math.min(
        matrix[sourceIndex - 1][targetIndex] + 1,
        matrix[sourceIndex][targetIndex - 1] + 1,
        matrix[sourceIndex - 1][targetIndex - 1] + substitution,
      );
      if (sourceIndex > 1 && targetIndex > 1
        && source[sourceIndex - 1] === target[targetIndex - 2]
        && source[sourceIndex - 2] === target[targetIndex - 1]) {
        matrix[sourceIndex][targetIndex] = Math.min(
          matrix[sourceIndex][targetIndex],
          matrix[sourceIndex - 2][targetIndex - 2] + 1,
        );
      }
    }
  }
  return matrix[source.length][target.length];
}

/**
 * Weighted edit distance for the common mistakes found in introductory IUPAC
 * names. Damerau-Levenshtein remains the primary transposition signal; this
 * score makes an inserted connecting "o" less costly than changing a root or
 * functional suffix.
 */
export function chemicalLevenshtein(input: string, candidate: string) {
  const source = normalizeName(input);
  const target = normalizeName(candidate);
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    matrix[sourceIndex][0] = matrix[sourceIndex - 1][0] + (source[sourceIndex - 1] === "o" ? 0.5 : 1);
  }
  for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
    matrix[0][targetIndex] = matrix[0][targetIndex - 1] + (target[targetIndex - 1] === "o" ? 0.5 : 1);
  }
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const sourceCharacter = source[sourceIndex - 1];
      const targetCharacter = target[targetIndex - 1];
      const substitution = sourceCharacter === targetCharacter
        ? 0
        : (sourceCharacter === "o" && targetCharacter === "a")
          || (sourceCharacter === "a" && targetCharacter === "o")
          || (sourceCharacter === "i" && targetCharacter === "o")
          || (sourceCharacter === "o" && targetCharacter === "i")
          ? 1
          : 1.25;
      matrix[sourceIndex][targetIndex] = Math.min(
        matrix[sourceIndex - 1][targetIndex] + (sourceCharacter === "o" ? 0.5 : 1),
        matrix[sourceIndex][targetIndex - 1] + (targetCharacter === "o" ? 0.5 : 1),
        matrix[sourceIndex - 1][targetIndex - 1] + substitution,
      );
      if (sourceIndex > 1 && targetIndex > 1
        && sourceCharacter === target[targetIndex - 2]
        && source[sourceIndex - 2] === targetCharacter) {
        matrix[sourceIndex][targetIndex] = Math.min(
          matrix[sourceIndex][targetIndex],
          matrix[sourceIndex - 2][targetIndex - 2] + 2,
        );
      }
    }
  }
  const inputTokens = tokenizeIupacName(input);
  const candidateTokens = tokenizeIupacName(candidate);
  const rootPenalty = inputTokens.parent && candidateTokens.parent
    && inputTokens.parent !== candidateTokens.parent
    && !inputTokens.parent.startsWith(candidateTokens.parent)
    && !candidateTokens.parent.startsWith(inputTokens.parent)
    ? 5
    : 0;
  const suffixPenalty = inputTokens.suffix && candidateTokens.suffix && inputTokens.suffix !== candidateTokens.suffix
    ? 4
    : 0;
  return matrix[source.length][target.length] + rootPenalty + suffixPenalty;
}

/** Similarity metric that gives useful weight to matching chemical stems. */
export function jaroWinklerSimilarity(left: string, right: string) {
  const source = normalizeName(left);
  const target = normalizeName(right);
  if (source === target) return 1;
  if (!source.length || !target.length) return 0;
  const matchDistance = Math.max(Math.floor(Math.max(source.length, target.length) / 2) - 1, 0);
  const sourceMatches = Array(source.length).fill(false);
  const targetMatches = Array(target.length).fill(false);
  let matches = 0;
  for (let index = 0; index < source.length; index += 1) {
    const start = Math.max(index - matchDistance, 0);
    const end = Math.min(index + matchDistance + 1, target.length);
    for (let candidate = start; candidate < end; candidate += 1) {
      if (targetMatches[candidate] || source[index] !== target[candidate]) continue;
      sourceMatches[index] = true;
      targetMatches[candidate] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let targetIndex = 0;
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    if (!sourceMatches[sourceIndex]) continue;
    while (!targetMatches[targetIndex]) targetIndex += 1;
    if (source[sourceIndex] !== target[targetIndex]) transpositions += 1;
    targetIndex += 1;
  }
  const jaro = (matches / source.length + matches / target.length + (matches - transpositions / 2) / matches) / 3;
  const mismatch = [...source].findIndex((character, index) => character !== target[index]);
  const prefixLength = Math.min(mismatch === -1 ? 4 : mismatch, 4);
  return jaro + prefixLength * 0.1 * (1 - jaro);
}

/** Extracts IUPAC pieces used to reject chemically unrelated corrections. */
export function tokenizeIupacName(value: string): IupacTokens {
  const normalized = normalizeChemicalText(value);
  const parent = normalized.match(parentPattern)?.[0].replace(/(?:ano|ane)$/, "an") ?? null;
  const suffix = normalized.match(suffixPattern)?.[0] ?? null;
  const locants = [...normalized.matchAll(/\d+(?:,\d+)*/g)].flatMap((match) => match[0].split(","));
  const substituents = [...new Set(normalized.match(substituentPattern) ?? [])].sort();
  return { parent, suffix, locants, substituents };
}

function tokenSimilarity(left: IupacTokens, right: IupacTokens) {
  const fields = [[left.parent, right.parent], [left.suffix, right.suffix]];
  const available = fields.filter(([source, target]) => source || target);
  const fieldScore = available.length
    ? fields.filter(([source, target]) => source && target && source === target).length / available.length
    : 0;
  const locantIntersection = left.locants.filter((locant) => right.locants.includes(locant)).length;
  const locantScore = left.locants.length || right.locants.length
    ? (2 * locantIntersection) / (left.locants.length + right.locants.length) : 1;
  const substituentIntersection = left.substituents.filter((item) => right.substituents.includes(item)).length;
  const substituentScore = left.substituents.length || right.substituents.length
    ? (2 * substituentIntersection) / (left.substituents.length + right.substituents.length) : 1;
  return 0.55 * fieldScore + 0.3 * locantScore + 0.15 * substituentScore;
}

function chemicalPenalty(source: IupacTokens, candidate: IupacTokens) {
  let penalty = 0;
  if (
    source.parent
    && candidate.parent
    && source.parent !== candidate.parent
    && !source.parent.startsWith(candidate.parent)
    && !candidate.parent.startsWith(source.parent)
  ) penalty += 0.26;
  if (source.suffix && candidate.suffix && source.suffix !== candidate.suffix) penalty += 0.2;
  if (source.locants.length && candidate.locants.length && source.locants.join(",") !== candidate.locants.join(",")) penalty += 0.1;
  if (source.substituents.length && candidate.substituents.length && source.substituents.join(",") !== candidate.substituents.join(",")) penalty += 0.14;
  return penalty;
}

type SuggestionCandidate = { id: string; name: string; aliases: string[]; suggestOnExactFailure?: boolean };

type PartialSystematicName = {
  locants: string;
  suffixFragment: string;
  reverseAlcohol?: boolean;
};

function readPartialSystematicName(value: string): PartialSystematicName | null {
  const normalized = normalizeChemicalText(value);
  const modern = normalized.match(/^[a-z]+-(\d+(?:,\d+)*)-([a-z]+)$/);
  if (modern) return { locants: modern[1], suffixFragment: modern[2] };

  const traditional = normalized.match(/^(\d+(?:,\d+)*)-[a-z]+$/);
  if (traditional) {
    const suffix = normalized.match(/(triol|diol|diolo|diel|dial|dil|dol)$/)?.[1];
    if (suffix) return { locants: traditional[1], suffixFragment: suffix };
  }

  // "propanol-2" and the common typo "pentol-2" place the locant last.
  const reverseAlcohol = normalized.match(/^[a-z]+-(\d+)$/);
  if (reverseAlcohol) return { locants: reverseAlcohol[1], suffixFragment: "ol", reverseAlcohol: true };
  return null;
}

function candidateRoots(language: AppLanguage) {
  return language === "en" ? englishRoots : chemicalDictionary.roots;
}

function parentFor(root: string, language: AppLanguage) {
  return language === "en" ? `${root}ane` : `${root}an`;
}

function systematicCandidateAliases(
  root: string,
  parent: string,
  locants: string,
  suffix: string,
  language: AppLanguage,
) {
  const legacyParent = language === "en" ? `${root}ane` : `${root}ano`;
  const aliases = [
    `${parent}-${locants}-${suffix}`,
    `${legacyParent}-${locants}-${suffix}`,
    `${locants}-${legacyParent}${suffix}`,
    `${locants}-${parent}${suffix}`,
  ];
  if (suffix === "ol" && !locants.includes(",")) {
    aliases.push(`${parent}ol-${locants}`, `${root}ol-${locants}`);
  }
  return aliases;
}

function suffixIsPlausible(fragment: string, suffix: string) {
  const normalizedFragment = normalizeName(fragment);
  const maximum = Math.max(normalizedFragment.length, suffix.length, 1);
  return chemicalLevenshtein(normalizedFragment, suffix) / maximum <= 0.52
    || damerauLevenshteinDistance(normalizedFragment, suffix) <= 2;
}

function systematicCandidates(input: string, language: AppLanguage): SuggestionCandidate[] {
  const partial = readPartialSystematicName(input);
  if (!partial) return [];
  const typedSuffix = normalizeName(partial.suffixFragment);
  const intendedMultiplicativeSuffix = typedSuffix.startsWith("tri")
    ? "triol"
    : typedSuffix.startsWith("d")
      ? "diol"
      : null;
  const suffixes = intendedMultiplicativeSuffix
    ? [intendedMultiplicativeSuffix]
    : correctionSuffixes.filter((suffix) => suffixIsPlausible(partial.suffixFragment, suffix));
  return candidateRoots(language).flatMap((root) => {
    const parent = parentFor(root, language);
    return suffixes.map((suffix) => ({
      id: "systematic-format",
      name: `${parent}-${partial.locants}-${suffix}`,
      aliases: [
        ...systematicCandidateAliases(root, parent, partial.locants, suffix, language),
        // Preserve the typed frame as an alias only after its suffix has
        // passed the chemical spelling check (for example, dial → diol).
        `${parent}-${partial.locants}-${partial.suffixFragment}`,
        `${language === "en" ? `${root}ane` : `${root}ano`}-${partial.locants}-${partial.suffixFragment}`,
      ],
    }));
  });
}

/** Candidate spelling variants used by the five-engine correction pipeline. */
export function generateVariants(input: string, language: AppLanguage = "es") {
  return [...new Set(systematicCandidates(input, language).map((candidate) => candidate.name))];
}

function scoreCandidate(input: string, candidate: string) {
  const inputTokens = tokenizeIupacName(input);
  const candidateTokens = tokenizeIupacName(candidate);
  const maxLength = Math.max(normalizeName(input).length, normalizeName(candidate).length, 1);
  const editScore = 1 - damerauLevenshteinDistance(input, candidate) / maxLength;
  const chemicalEditScore = 1 - Math.min(chemicalLevenshtein(input, candidate) / maxLength, 1);
  return Math.max(0, 0.3 * editScore + 0.22 * chemicalEditScore + 0.26 * jaroWinklerSimilarity(input, candidate)
    + 0.22 * tokenSimilarity(inputTokens, candidateTokens) - chemicalPenalty(inputTokens, candidateTokens));
}

/**
 * Five-engine conservative chemical correction: normalizer, IUPAC token
 * parser, Damerau-Levenshtein, Jaro-Winkler, and chemical penalties.
 */
export function findCommonNameSuggestion(input: string, language: AppLanguage): CommonNameSuggestion | null {
  const normalizedInput = normalizeName(input);
  if (normalizedInput.length < 3) return null;
  // These parent names are accepted directly by the local functional-group
  // parser, so they must never be replaced by a nearby alkane suggestion.
  if (unlocantedOxygenatedParentPattern.test(normalizeChemicalText(input))) return null;
  const candidates: SuggestionCandidate[] = [
    ...systematicCandidates(input, language),
    ...commonMolecules.map((molecule) => ({
    id: molecule.id,
    name: language === "en" ? molecule.en : molecule.es,
    aliases: molecule.aliases,
    suggestOnExactFailure: molecule.suggestOnExactFailure,
    })),
  ];
  let best: { candidate: SuggestionCandidate; score: number; exactOutput: boolean } | null = null;
  candidates.forEach((candidate) => {
    const aliases = [...new Set([...candidate.aliases, candidate.name])];
    const score = aliases.reduce((highest, alias) => Math.max(highest, scoreCandidate(input, alias)), 0);
    const exactOutput = normalizeName(candidate.name) === normalizedInput;
    if (!best || score > best.score) best = { candidate, score, exactOutput };
  });
  if (!best || (best.exactOutput && !best.candidate.suggestOnExactFailure)) return null;
  const threshold = normalizedInput.length <= 5 ? 0.82 : 0.73;
  if (best.score < threshold) return null;
  return { id: best.candidate.id, name: best.candidate.name };
}
