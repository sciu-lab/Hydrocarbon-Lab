/**
 * Semantic names for alkyl substituents which have an accepted retained form.
 * The local builder, name analyzer, OPSIN bridge and UI all consume this one
 * catalog instead of maintaining unrelated replacement lists.
 */
export type SubstituentAlias = {
  /** Structural name emitted by the graph nomenclator. */
  systematic: string;
  /** Other systematic spellings accepted on input. */
  systematicAlternatives: readonly string[];
  /** Spanish retained/common form presented as an optional display alias. */
  common: string;
  /** Other Spanish forms accepted on input without changing connectivity. */
  commonAlternatives: readonly string[];
  /** Temporary token understood by the compact local name parser. */
  parserToken: string;
  opsin: string;
  englishCommon: string;
};

export const SUBSTITUENT_ALIASES: readonly SubstituentAlias[] = [
  {
    systematic: "1-metiletil",
    systematicAlternatives: ["propan-2-il"],
    common: "isopropil",
    commonAlternatives: [],
    parserToken: "isopropil",
    opsin: "propan-2-yl",
    englishCommon: "isopropyl",
  },
  {
    systematic: "1,1-dimetiletil",
    systematicAlternatives: [],
    common: "tert-butil",
    commonAlternatives: ["terc-butil"],
    parserToken: "tert-butil",
    opsin: "tert-butyl",
    englishCommon: "tert-butyl",
  },
  {
    systematic: "1-metilpropil",
    systematicAlternatives: ["butan-2-il"],
    common: "sec-butil",
    commonAlternatives: [],
    parserToken: "sec-butil",
    opsin: "butan-2-yl",
    englishCommon: "sec-butyl",
  },
  {
    systematic: "2-metilpropil",
    systematicAlternatives: [],
    common: "isobutil",
    commonAlternatives: [],
    parserToken: "isobutil",
    opsin: "2-methylpropyl",
    englishCommon: "isobutyl",
  },
] as const;

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function getSubstituentAlias(systematic: string) {
  return SUBSTITUENT_ALIASES.find((alias) => alias.systematic === systematic);
}

/** Rewrites only a complete chemical substituent fragment, never a bare substring. */
function replaceFragment(value: string, fragment: string, replacement: string) {
  const expression = new RegExp(`(^|[(-])${escaped(fragment)}(?=$|[-)])`, "g");
  return value.replace(expression, (_match, prefix: string) => `${prefix}${replacement}`);
}

function replaceCommonFragmentForOpsin(value: string, fragment: string, replacement: string) {
  // A retained substituent may be written immediately before an alkane parent
  // (isopropiloctano). The look-ahead recognizes only parent-root starts.
  const parentStart = "(?:ciclo)?(?:met|et|prop|but|pent|hex|hept|oct|non|dec)[a-z]";
  const expression = new RegExp(`(^|[(-])${escaped(fragment)}(?:(?=$|[-)])|(?=(${parentStart})))`, "g");
  return value.replace(expression, (_match, prefix: string, parent: string | undefined) =>
    `${prefix}${parent ? `(${replacement})` : replacement}`,
  );
}

/** Normalizes equivalent Spanish alkyl spellings for the compact graph builder. */
export function normalizeSubstituentAliasesForLocalParser(value: string) {
  const normalized = SUBSTITUENT_ALIASES.reduce((current, alias) => {
    const forms = [
      alias.systematic,
      ...alias.systematicAlternatives,
      alias.common,
      ...alias.commonAlternatives,
    ];
    return forms.reduce(
      (next, form) => replaceFragment(next, form, alias.parserToken),
      current,
    );
  }, value);
  const parserTokens = SUBSTITUENT_ALIASES.map((alias) => escaped(alias.parserToken)).join("|");
  return normalized.replace(new RegExp(`\\((?:${parserTokens})\\)`, "g"), (match) => match.slice(1, -1));
}

/** Converts common Spanish alkyl aliases to the OPSIN spelling at token boundaries. */
export function translateSubstituentAliasesForOpsin(value: string) {
  return SUBSTITUENT_ALIASES.reduce((translated, alias) => {
    const forms = [alias.common, ...alias.commonAlternatives];
    return forms.reduce(
      (next, form) => replaceCommonFragmentForOpsin(next, form, alias.opsin),
      translated,
    );
  }, value);
}

export function localizeCommonSubstituentAlias(value: string, locale: "es" | "en") {
  if (locale === "es") return value;
  const alias = SUBSTITUENT_ALIASES.find((candidate) =>
    candidate.common === value || candidate.commonAlternatives.includes(value),
  );
  return alias?.englishCommon ?? value;
}
