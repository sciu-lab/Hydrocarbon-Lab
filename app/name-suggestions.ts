import type { AppLanguage } from "./i18n";

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

const commonMolecules: CommonMolecule[] = [
  { id: "benzene", es: "benceno", en: "benzene", aliases: ["benceno", "benzene"] },
  { id: "phenol", es: "fenol", en: "phenol", aliases: ["fenol", "phenol"] },
  { id: "cyclohexane", es: "ciclohexano", en: "cyclohexane", aliases: ["ciclohexano", "cyclohexane"] },
  { id: "ethanol", es: "etanol", en: "ethanol", aliases: ["etanol", "ethanol", "alcohol etilico", "ethyl alcohol"] },
  { id: "propanol", es: "propan-1-ol", en: "propan-1-ol", aliases: ["propanol", "propan-1-ol", "1-propanol"] },
  { id: "isopropanol", es: "propan-2-ol", en: "propan-2-ol", aliases: ["propan-2-ol", "2-propanol", "alcohol isopropilico", "isopropyl alcohol"] },
  { id: "ethanediol", es: "etan-1,2-diol", en: "ethane-1,2-diol", aliases: ["etan-1,2-diol", "1,2-etanodiol", "etilenglicol", "ethane-1,2-diol", "ethylene glycol"] },
  { id: "propanediol", es: "propan-1,2-diol", en: "propane-1,2-diol", aliases: ["propan-1,2-diol", "1,2-propanodiol", "propilenglicol", "propane-1,2-diol", "propylene glycol"] },
  { id: "glycerol", es: "propan-1,2,3-triol", en: "propane-1,2,3-triol", aliases: ["propan-1,2,3-triol", "1,2,3-propanotriol", "glicerina", "glycerin"] },
  { id: "butanol", es: "butan-1-ol", en: "butan-1-ol", aliases: ["butanol", "butan-1-ol", "1-butanol"] },
  { id: "hexane", es: "hexano", en: "hexane", aliases: ["hexano", "hexane"] },
  { id: "hexene", es: "hex-1-eno", en: "hex-1-ene", aliases: ["hexeno", "hex-1-eno", "hexene", "hex-1-ene"] },
  { id: "propene", es: "prop-1-eno", en: "prop-1-ene", aliases: ["propeno", "prop-1-eno", "propene", "prop-1-ene"] },
  { id: "butene", es: "but-1-eno", en: "but-1-ene", aliases: ["buteno", "but-1-eno", "butene", "but-1-ene"] },
  { id: "glucose", es: "glucosa", en: "glucose", aliases: ["glucosa", "glucose"], suggestOnExactFailure: true },
];

const parentPattern = /(?:ciclo)?(?:met|et|prop|but|pent|hex|hept|oct|non|dec)(?:an|en|in)?o?|(?:cyclo)?(?:meth|eth|prop|but|pent|hex|hept|oct|non|dec)(?:ane|ene|yne)?|benceno|benzene/;
const suffixPattern = /(?:diol|triol|tetraol|ol|diona|ona|one|al|dial|amina|amine|eno|ene|ino|yne|oico|oicacid)/;
const substituentPattern = /(?:fluoro|cloro|chloro|bromo|yodo|iodo|metil|methyl|etil|ethyl|hidroxi|hydroxy|amino|nitro)/g;

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeChemicalText(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");
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

function normalizeSystematicPresentation(value: string, language: AppLanguage) {
  const normalized = normalizeChemicalText(value);
  const spanishParent = "(?:met|et|prop|but|pent|hex|hept|oct|non|dec)";
  const englishParent = "(?:meth|eth|prop|but|pent|hex|hept|oct|non|dec)";
  const multiplicative = "(?:di|tri|tetra|penta|hexa)(?:ol|ona|amina)";
  if (language === "es") {
    return normalized
      .replace(new RegExp(`(${spanishParent})ano-(\\d+(?:,\\d+)*)-(${multiplicative})`, "g"), "$1an-$2-$3")
      .replace(new RegExp(`(\\d+(?:,\\d+)*)-(${spanishParent})ano((?:di|tri|tetra|penta|hexa)(?:ol|ona|amina))`, "g"), "$2an-$1-$3")
      .replace(new RegExp(`(\\d+)-(${spanishParent})(eno|ino|ol|ona|amina)`, "g"), "$2-$1-$3");
  }
  return normalized
    .replace(new RegExp(`(\\d+(?:,\\d+)*)-(${englishParent})ane((?:di|tri|tetra|penta|hexa)(?:ol|one|amine))`, "g"), "$2ane-$1-$3")
    .replace(new RegExp(`(\\d+)-(${englishParent})(ene|yne|ol|one|amine)`, "g"), "$2-$1-$3");
}

type SuggestionCandidate = { id: string; name: string; aliases: string[]; suggestOnExactFailure?: boolean };

function scoreCandidate(input: string, candidate: string) {
  const inputTokens = tokenizeIupacName(input);
  const candidateTokens = tokenizeIupacName(candidate);
  const maxLength = Math.max(normalizeName(input).length, normalizeName(candidate).length, 1);
  const editScore = 1 - damerauLevenshteinDistance(input, candidate) / maxLength;
  return Math.max(0, 0.42 * editScore + 0.34 * jaroWinklerSimilarity(input, candidate)
    + 0.24 * tokenSimilarity(inputTokens, candidateTokens) - chemicalPenalty(inputTokens, candidateTokens));
}

/**
 * Five-engine conservative chemical correction: normalizer, IUPAC token
 * parser, Damerau-Levenshtein, Jaro-Winkler, and chemical penalties.
 */
export function findCommonNameSuggestion(input: string, language: AppLanguage): CommonNameSuggestion | null {
  const normalizedInput = normalizeName(input);
  if (normalizedInput.length < 3) return null;
  const presentationCorrection = normalizeSystematicPresentation(input, language);
  const candidates: SuggestionCandidate[] = commonMolecules.map((molecule) => ({
    id: molecule.id,
    name: language === "en" ? molecule.en : molecule.es,
    aliases: molecule.aliases,
    suggestOnExactFailure: molecule.suggestOnExactFailure,
  }));
  if (normalizeName(presentationCorrection) !== normalizedInput) {
    candidates.unshift({ id: "systematic-format", name: presentationCorrection, aliases: [presentationCorrection] });
  }
  let best: { candidate: SuggestionCandidate; score: number; exact: boolean } | null = null;
  candidates.forEach((candidate) => {
    const aliases = [...new Set([...candidate.aliases, candidate.name])];
    const score = aliases.reduce((highest, alias) => Math.max(highest, scoreCandidate(input, alias)), 0);
    const exact = aliases.some((alias) => normalizeName(alias) === normalizedInput);
    if (!best || score > best.score) best = { candidate, score, exact };
  });
  if (!best || (best.exact && !best.candidate.suggestOnExactFailure)) return null;
  const threshold = normalizedInput.length <= 5 ? 0.82 : 0.73;
  if (best.score < threshold) return null;
  return { id: best.candidate.id, name: best.candidate.name };
}
