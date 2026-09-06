const commonSpanishNames: Record<string, string> = {
  acetaldehido: "ethanal",
  acetileno: "ethyne",
  acetona: "propan-2-one",
  "acido acetico": "acetic acid",
  "acido benzoico": "benzoic acid",
  "acido formico": "formic acid",
  "acido propionico": "propionic acid",
  anilina: "aniline",
  bencenamina: "benzenamine",
  benzonitrilo: "benzonitrile",
  benzamida: "benzamide",
  benceno: "benzene",
  bifenilo: "biphenyl",
  formaldehido: "methanal",
  fenol: "phenol",
  etileno: "ethene",
  propileno: "propene",
  butileno: "butene",
  metilacetileno: "propyne",
  "dimetil eter": "methoxymethane",
  "etil metil eter": "methoxyethane",
  "dietil eter": "ethoxyethane",
  propionaldehido: "propanal",
  "etil metil cetona": "butan-2-one",
  estireno: "styrene",
  naftaleno: "naphthalene",
  tetrahidropiran: "tetrahydropyran",
  tetrahidropirano: "tetrahydropyran",
  tolueno: "toluene",
  "o-xileno": "o-xylene",
  "m-xileno": "m-xylene",
  "p-xileno": "p-xylene",
  "4-isopropiloctano": "4-(propan-2-yl)octane",
};

const halogenMultipliers = "di|tri|tetra|penta|hexa|hepta|octa";
const halogenPrefixes = "fluoro|cloro|chloro|bromo|yodo|iodo";
const methaneParents = "metano|methane";
const halogenParents = [
  "metano", "etano", "propano", "butano", "pentano", "hexano", "heptano", "octano", "nonano", "decano",
  "benceno",
  "methane", "ethane", "propane", "butane", "pentane", "hexane", "heptane", "octane", "nonane", "decane",
  "benzene",
].join("|");

const gluedHalogenName = new RegExp(
  `(^|[\\s,(\\-])((?:${halogenMultipliers})?)(${halogenPrefixes})(${halogenParents})(?=$|[\\s,.)\\-])`,
  "gi",
);

const hyphenatedHalogenName = new RegExp(
  `(^|[\\s,(\\-])((?:${halogenMultipliers})-)?(${halogenPrefixes})-(${halogenParents})(?=$|[\\s,.)\\-])`,
  "gi",
);

const methaneHalogenLocant = new RegExp(
  `(^|[\\s,(])1(?:,1){0,3}-(?=(?:(?:${halogenMultipliers})-?)?(?:${halogenPrefixes})-?(?:${methaneParents})(?=$|[\\s,.)\\-]))`,
  "gi",
);

const multipliedMethaneHalogenName = new RegExp(
  `(^|[\\s,(\\-])((?:${halogenMultipliers})-?)(${halogenPrefixes})-?(${methaneParents})(?=$|[\\s,.)\\-])`,
  "gi",
);

function followsNumericLocant(value: string, matchOffset: number, boundary: string) {
  return boundary === "-"
    && /(?:^|[,(])\d+(?:,\d+)*-$/.test(value.slice(0, matchOffset + boundary.length));
}

/** A one-carbon parent never needs the repeated C1 locants for halogens. */
export function stripMethaneHalogenLocants(value: string) {
  return value.replace(methaneHalogenLocant, "$1");
}

function compactMultipliedMethaneHalogens(value: string) {
  return value.replace(
    multipliedMethaneHalogenName,
    (_match, boundary: string, multiplier: string, halogen: string, parent: string) =>
      `${boundary}${multiplier.replace(/-$/, "")}${halogen}${parent}`,
  );
}

/** Adds presentation hyphens to a directly attached halogen substituent. */
export function hyphenateHalogenatedName(value: string) {
  const withoutMethaneLocants = stripMethaneHalogenLocants(value);
  const locantAware = withoutMethaneLocants.replace(
    hyphenatedHalogenName,
    (match, boundary: string, multiplier: string = "", halogen: string, parent: string, offset: number, whole: string) =>
      followsNumericLocant(whole, offset, boundary)
        ? `${boundary}${multiplier.replace(/-$/, "")}${halogen}${parent}`
        : match,
  );
  const hyphenated = locantAware.replace(
    gluedHalogenName,
    (_match, boundary: string, multiplier: string = "", halogen: string, parent: string, offset: number, whole: string) =>
      followsNumericLocant(whole, offset, boundary)
        ? `${boundary}${multiplier}${halogen}${parent}`
        : `${boundary}${multiplier ? `${multiplier}-` : ""}${halogen}-${parent}`,
  );
  return compactMultipliedMethaneHalogens(hyphenated);
}

/** Restores the traditional, unhyphenated rendering of halogen derivatives. */
export function compactHalogenatedName(value: string) {
  const withoutMethaneLocants = stripMethaneHalogenLocants(value);
  const compacted = withoutMethaneLocants.replace(
    hyphenatedHalogenName,
    (_match, boundary: string, multiplier: string = "", halogen: string, parent: string) =>
      `${boundary}${multiplier.replace(/-$/, "")}${halogen}${parent}`,
  );
  return compactMultipliedMethaneHalogens(compacted);
}

function normalizePunctuation(value: string) {
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .toLocaleLowerCase("es");

  const withStereochemicalLocants = normalized.replace(/\(([^()]*)\)/g, (_match, content: string) => {
    const stereochemical = content.replace(
      /(^|,)(\d*)([ersz])(?=,|$)/g,
      (_descriptor, separator: string, locant: string, letter: string) =>
        `${separator}${locant}${letter.toUpperCase()}`,
    );
    return `(${stereochemical})`;
  });

  // N- y N,N- son localizadores de heteroátomo, no la letra inicial de una
  // palabra. OPSIN los distingue de la n minúscula, por lo que se restauran
  // después de normalizar el resto del nombre.
  return withStereochemicalLocants.replace(/(^|[-,(])n(?=[,-])/g, "$1N");
}

/**
 * Accepts the classroom placement of a single multiple-bond locant and
 * returns the preferred parent-first notation before either parser sees it.
 * This only rearranges presentation; it does not infer a structure.
 */
export function normalizeTraditionalUnsaturationNotation(value: string) {
  const substituentPrefix = "(?:(?:\\d+(?:,\\d+)*-(?:fluoro|cloro|bromo|yodo|metil|etil|hidroxi|amino)-)+)";
  const prefixed = value.match(
    new RegExp(`^(${substituentPrefix})(\\d+)-((?:ciclo)?[a-z]+)-?(eno|ino)$`, "i"),
  );
  if (prefixed) {
    const [, prefix, locant, parent, suffix] = prefixed;
    return `${prefix.slice(0, -1)}${parent}-${locant}-${suffix}`;
  }

  const simple = value.match(/^(\d+)-((?:ciclo)?[a-z]+)-?(eno|ino)$/i);
  if (simple) {
    const [, locant, parent, suffix] = simple;
    return `${parent}-${locant}-${suffix}`;
  }
  return value;
}

/**
 * Normalizes a user-entered halogen name before it is passed to OPSIN.
 * Existing hyphens are left alone; only glued prefix/parent pairs are split.
 */
export function normalizeHalogenatedNameForOpsin(value: string) {
  return hyphenateHalogenatedName(
    normalizeTraditionalUnsaturationNotation(normalizePunctuation(value)),
  );
}

function translateCore(value: string) {
  let translated = value
    // Retained and systematic nitrogen parent names need to be translated
    // before the generic suffix rules. This also covers substituted parents
    // such as 4-nitroanilina and N-metilanilina.
    .replace(/anilina/g, "aniline")
    .replace(/bencenamina/g, "benzenamine")
    .replace(/benzonitrilo/g, "benzonitrile")
    .replace(/benzamida/g, "benzamide")
    .replace(/metoxi/g, "methoxy")
    .replace(/etoxi/g, "ethoxy")
    .replace(/propoxi/g, "propoxy")
    .replace(/butoxi/g, "butoxy")
    .replace(/hidroxi/g, "hydroxy")
    .replace(/amino/g, "__amino_prefix__")
    .replace(/carbamoil/g, "carbamoyl")
    .replace(/ciano/g, "cyano")
    .replace(/benceno/g, "benzene")
    .replace(/fenol/g, "phenol")
    .replace(/fenoxi/g, "phenoxy")
    .replace(/fenil/g, "phenyl")
    .replace(/cloro/g, "chloro")
    .replace(/yodo/g, "iodo")
    .replace(
      /ciclo(prop|but|pent|hex|hept|oct|non|dec)il/g,
      (_match, root: string) => `cyclo${root}yl`,
    )
    .replace(/ciclo/g, "cyclo")
    .replace(/tetrahidro/g, "tetrahydro")
    .replace(/pirano/g, "pyran")
    .replace(/isopropil/g, "propan-2-yl")
    .replace(/isobutil/g, "2-methylpropyl")
    .replace(/terc-butil|tert-butil/g, "tert-butyl")
    .replace(/metilo/g, "methyl")
    .replace(/etilo/g, "ethyl")
    .replace(/propilo/g, "propyl")
    .replace(/butilo/g, "butyl")
    .replace(/metil/g, "methyl")
    .replace(/etil/g, "ethyl")
    .replace(/propil/g, "propyl")
    .replace(/butil/g, "butyl")
    .replace(/oxyet(?=an|en|in)/g, "oxyeth")
    // When a Spanish halo-methane is written as one word, there is no word
    // boundary before metano for the generic met -> meth bridge below.
    .replace(/(fluoro|chloro|bromo|iodo)metano$/g, "$1methane")
    .replace(/\bmet(?=an|en|in)/g, "meth")
    .replace(/\bet(?=an|en|in)/g, "eth");

  translated = translated
    // Parent-chain amines need the English alkane root even when an N-alkyl
    // prefix is immediately attached (for example N-metiletanamina). Word-
    // boundary replacements cannot see the "et" in methyletanamina, so these
    // suffix bridges are intentionally applied before the generic -amine rule.
    .replace(/metanamina$/g, "methanamine")
    .replace(/etanamina$/g, "ethanamine")
    .replace(/propanamina$/g, "propanamine")
    .replace(/butanamina$/g, "butanamine")
    .replace(/pentanamina$/g, "pentanamine")
    .replace(/hexanamina$/g, "hexanamine")
    .replace(/heptanamina$/g, "heptanamine")
    .replace(/octanamina$/g, "octanamine")
    .replace(/nonanamina$/g, "nonanamine")
    .replace(/decanamina$/g, "decanamine")
    .replace(/anodial$/g, "anedial")
    .replace(/anodiamida$/g, "anediamide")
    .replace(/anodiamina$/g, "anediamine")
    .replace(/anodioato$/g, "anedioate")
    .replace(/anodioico$/g, "anedioic")
    .replace(/carboxilato$/g, "carboxylate")
    .replace(/benzoico$/g, "benzoic")
    .replace(/carbaldehido$/g, "carbaldehyde")
    .replace(/carboxilico$/g, "carboxylic acid")
    // Spanish parent nitriles are commonly written as butanonitrilo or
    // pentanodinitrilo. OPSIN uses butanenitrile / pentanedinitrile.
    // Ring carbonitriles and carboxamides also retain the parent alkane e.
    .replace(/([a-z]+)ano(di|tri|tetra|penta|hexa)nitrilo$/g, "$1ane$2nitrile")
    .replace(/([a-z]+)anonitrilo$/g, "$1anenitrile")
    .replace(/([a-z]+)anocarbonitrilo$/g, "$1anecarbonitrile")
    .replace(/([a-z]+)anocarboxamida$/g, "$1anecarboxamide")
    .replace(/nitrilo$/g, "nitrile")
    .replace(/aldehido$/g, "aldehyde")
    .replace(/tetraona$/g, "tetraone")
    .replace(/triona$/g, "trione")
    .replace(/diona$/g, "dione")
    .replace(/ona$/g, "one")
    .replace(/amida$/g, "amide")
    .replace(/amina$/g, "amine")
    .replace(/tiol$/g, "thiol")
    .replace(/oato$/g, "oate")
    .replace(/oico$/g, "oic")
    .replace(/ano(?=-\d)/g, "ane")
    .replace(/eno(?=-\d)/g, "ene")
    .replace(/ino(?=-\d)/g, "yne")
    .replace(/-en$/g, "-ene")
    .replace(/-in$/g, "-yne")
    .replace(/ano$/g, "ane")
    .replace(/eno$/g, "ene")
    .replace(/ino$/g, "yne")
    .replace(/-il$/g, "-yl")
    .replace(/ilo$/g, "yl")
    .replace(/__amino_prefix__/g, "amino");

  return translated;
}

/**
 * OPSIN follows English systematic nomenclature. The laboratory UI is Spanish,
 * so we generate a conservative English candidate before trying the original
 * text. This is intentionally a nomenclature bridge, not a structure parser.
 */
export function translateSpanishIupacToOpsin(value: string) {
  const normalized = normalizeHalogenatedNameForOpsin(value);
  if (!normalized) return "";

  const common = commonSpanishNames[normalized];
  if (common) return common;

  const ester = normalized.match(/^(.+?(?:oato|carboxilato))\s+de\s+(.+?(?:ilo|il))$/);
  if (ester) {
    const acidPart = translateCore(ester[1]);
    const alkylPart = translateCore(ester[2]);
    return `${alkylPart} ${acidPart}`;
  }

  const acid = normalized.match(/^acido\s+(.+)$/);
  if (acid) {
    const acidName = translateCore(acid[1]);
    return acidName.endsWith("acid") ? acidName : `${acidName} acid`;
  }

  return translateCore(normalized);
}

export function getOpsinNameCandidates(value: string) {
  const originalNormalized = normalizePunctuation(value);
  const normalized = normalizeHalogenatedNameForOpsin(value);
  const translated = translateSpanishIupacToOpsin(value);
  // Try the normalized spelling first, then retain compact variants as a
  // compatibility fallback for older OPSIN spellings.
  return [...new Set([
    translated,
    normalized,
    compactHalogenatedName(translated),
    compactHalogenatedName(normalized),
    originalNormalized,
  ].filter(Boolean))];
}
