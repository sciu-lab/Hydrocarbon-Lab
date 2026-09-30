import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import { translateSpanishIupacForDisplay } from "./iupac-name-normalization.ts";

export type FunctionalContribution = {
  group: string;
  role: "suffix" | "prefix" | "ester-alkyl" | "acid-marker";
  atomIds: readonly number[];
};

export type FunctionalReasoningAnalysis = {
  family: string;
  name?: string;
  chainName: string;
  mainChain: readonly number[];
  primaryFunctionalGroup?: string;
  functionalGroups: {
    kind: string;
    carbonId: number;
    atomIds?: readonly number[];
    alkylCarbonId?: number;
    label?: string;
  }[];
  substituents: { name: string; locant: number; complex?: boolean; atomIds?: readonly number[] }[];
  numberedAtoms: ReadonlyMap<number, number>;
};

export type FunctionalNameEvidence = {
  text: string;
  start: number;
  label: string;
  kind: "function" | "substituent";
  contributions: FunctionalContribution[];
  atomIds?: readonly number[];
};

const localized = (name: string, language: AppLanguage) =>
  language === "en" ? translateSpanishIupacForDisplay(name) : name;
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** These patterns recognize an existing parent output; they never generate a name. */
const suffixPatterns: Record<string, { es: string; en: string }> = {
  alcohol: { es: "ol", en: "ol" },
  ketone: { es: "ona", en: "one" },
  aldehyde: { es: "(?:carbaldehído|aldehído|al)", en: "(?:carbaldehyde|aldehyde|al)" },
  carboxylicAcid: { es: "(?:carboxílico|oico)", en: "(?:carboxylic|oic)" },
  ester: { es: "(?:carboxilato|oato)", en: "(?:carboxylate|oate)" },
  amine: { es: "amina", en: "amine" },
  amide: { es: "(?:carboxamida|amida)", en: "(?:carboxamide|amide)" },
  nitrile: { es: "(?:carbonitrilo|nitrilo)", en: "(?:carbonitrile|nitrile)" },
};

const structures: Record<string, { es: string; en: string }> = {
  alcohol: { es: "el grupo hidroxilo –OH", en: "the hydroxyl group –OH" },
  ether: { es: "el enlace éter –O–R", en: "the ether linkage –O–R" },
  aldehyde: { es: "el grupo aldehído –CHO", en: "the aldehyde group –CHO" },
  ketone: { es: "el carbonilo de cetona >C=O", en: "the ketone carbonyl >C=O" },
  carboxylicAcid: { es: "el grupo carboxilo –COOH", en: "the carboxyl group –COOH" },
  ester: { es: "el grupo éster –COOR", en: "the ester group –COOR" },
  amine: { es: "el grupo amino unido al padre", en: "the amino group attached to the parent" },
  amide: { es: "el grupo amida –C(=O)N", en: "the amide group –C(=O)N" },
  nitrile: { es: "el grupo nitrilo –C≡N", en: "the nitrile group –C≡N" },
  nitro: { es: "el grupo nitro –NO₂", en: "the nitro group –NO₂" },
  halogen: { es: "el halógeno unido al padre", en: "the halogen attached to the parent" },
};

export function matchFunctionalParentSuffix(parent: string, group: string | undefined, language: AppLanguage) {
  const pattern = group ? suffixPatterns[group]?.[language] : undefined;
  return pattern ? new RegExp(`(?:(\\d+(?:,\\d+)*)-)?((?:di|tri|tetra|penta|hexa|hepta|octa|nona|deca)?${pattern})${group === "carboxylicAcid" && language === "en" ? "(?: acid)?" : ""}$`, "i").exec(parent) : null;
}

function prefixGroups(analysis: FunctionalReasoningAnalysis) {
  const groups = new Map<string, { locants: number[]; contributions: FunctionalContribution[]; atomIds: number[]; complex: boolean }>();
  for (const item of analysis.substituents) {
    // The naming engine already associates each functional prefix with its atoms.
    // Match that provenance, not a word such as "amino" somewhere in the name.
    const origins = analysis.functionalGroups.filter((group) => group.atomIds?.length
      && item.atomIds?.length === group.atomIds.length
      && group.atomIds.every((id) => item.atomIds!.includes(id)));
    if (item.complex && !origins.some((group) => group.kind === "ether")) continue;
    const entry = groups.get(item.name) ?? { locants: [], contributions: [], atomIds: [], complex: Boolean(item.complex) };
    entry.locants.push(item.locant);
    entry.atomIds.push(...item.atomIds ?? []);
    entry.contributions.push(...origins.map((group) => ({
      group: group.kind, role: "prefix" as const, atomIds: group.atomIds!,
    })));
    groups.set(item.name, entry);
  }
  return groups;
}

/** Copies spans from the displayed result, with identities supplied by the analysis. */
export function functionalNameEvidence(
  analysis: FunctionalReasoningAnalysis,
  name: string,
  language: AppLanguage,
): FunctionalNameEvidence[] {
  const result: FunctionalNameEvidence[] = [];
  const primary = analysis.primaryFunctionalGroup;
  const primaryGroups = analysis.functionalGroups.filter((group) => group.kind === primary);
  const origins = primaryGroups.map((group) => ({
    group: group.kind, role: "suffix" as const,
    atomIds: (group.atomIds ?? [group.carbonId]).filter((id) => group.kind !== "ester" || id !== group.alkylCarbonId),
  }));
  let bodyStart = 0;
  let bodyEnd = name.length;
  let parent = localized(analysis.chainName, language);

  if (primary === "carboxylicAcid") {
    const marker = language === "en" ? " acid" : "ácido ";
    const start = language === "en" ? name.length - marker.length : 0;
    if (name.slice(start, start + marker.length) !== marker) return [];
    result.push({ text: marker.trim(), start: start + (language === "en" ? 1 : 0),
      kind: "function", label: uiText(language, "Ácido carboxílico"),
      contributions: origins.map((item) => ({ ...item, role: "acid-marker" })) });
    if (language === "en") bodyEnd -= marker.length;
    else bodyStart += marker.length;
    parent = parent.replace(/^ácido /, "").replace(/ acid$/, "");
  }
  if (primary === "ester") {
    // Consume the engine's O-alkyl portion, including its own multiplicity.
    const split = /^(.*) de (.+)$/.exec(analysis.chainName);
    if (!split || !primaryGroups.every((group) => group.alkylCarbonId !== undefined)) return [];
    const alkyl = language === "en" ? localized(split[2], language) : `de ${split[2]}`;
    const start = language === "en" ? 0 : name.length - alkyl.length;
    if (name.slice(start, start + alkyl.length) !== alkyl) return [];
    result.push({ text: alkyl, start, kind: "function",
      label: language === "en" ? "O-bound alkyl portion" : "Porción alquilo unida al oxígeno",
      contributions: primaryGroups.map((group) => ({ group: group.kind, role: "ester-alkyl",
        atomIds: [group.alkylCarbonId!] })) });
    if (language === "en") bodyStart = alkyl.length + 1;
    else bodyEnd = start - 1;
    parent = localized(split[1], language);
  }

  if (primary && suffixPatterns[primary] && origins.length) {
    const parentSuffix = matchFunctionalParentSuffix(parent, primary, language);
    const body = name.slice(bodyStart, bodyEnd);
    const suffix = matchFunctionalParentSuffix(body, primary, language);
    // Recognize the morpheme actually emitted for this functional parent.
    // A different locant/name is not evidence for the analyzed molecule.
    const locants = primaryGroups.map((group) => analysis.numberedAtoms.get(group.carbonId))
      .filter((locant): locant is number => locant !== undefined).sort((a, b) => a - b).join(",");
    if (parentSuffix && suffix && parentSuffix[2] === suffix[2]
      && (!suffix[1] || !locants || suffix[1] === locants)) {
      result.push({ text: suffix[0], start: bodyStart + suffix.index, kind: "function",
        label: language === "en" ? "Principal functional group suffix" : "Sufijo del grupo funcional principal",
        contributions: origins });
    } else if (!parentSuffix && /^[a-záéíóúüñ]+$/i.test(parent)) {
      const start = name.indexOf(parent);
      if (start >= bodyStart && start + parent.length <= bodyEnd && name.lastIndexOf(parent) === start) {
        result.push({ text: parent, start, kind: "function",
          label: language === "en" ? "Retained functional parent name" : "Nombre retenido del padre funcional",
          contributions: origins });
      }
    }
  }

  for (const [source, { locants, contributions, atomIds, complex }] of prefixGroups(analysis)) {
    const named = localized(source, language);
    const sorted = [...locants].sort((a, b) => a - b).join(",");
    const prefix = complex ? `(?:bis|tris|tetrakis|pentakis|hexakis)?\\(${escapePattern(named)}\\)`
      : `(?:di|tri|tetra|penta|hexa|hepta|octa|nona|deca)?${escapePattern(named)}`;
    const prefixPattern = new RegExp(`(?:^|-)(${escapePattern(sorted)}-${prefix})`, "g");
    const body = name.slice(bodyStart, bodyEnd);
    const matches = [...body.matchAll(prefixPattern)];
    // The engine also omits repeated 1,1,... locants on methane, while keeping
    // the multiplier. Copy that whole emitted prefix rather than discarding it.
    const implicitMatch = new RegExp(`^(${prefix})`).exec(body);
    const implicit = !matches.length && implicitMatch && locants.every((locant) => locant === 1);
    if (matches.length === 1 || implicit) {
      const match = matches[0];
      const text = implicit ? implicitMatch![1] : match[1];
      const start = bodyStart + (implicit ? 0 : match.index! + match[0].length - text.length);
      result.push({ text, start, kind: "substituent",
        label: contributions.length
          ? language === "en" ? "Functional prefix and locants" : "Prefijo funcional y localizadores"
          : uiText(language, "Sustituyentes y localizadores"),
        contributions, ...(atomIds.length ? { atomIds: [...new Set(atomIds)] } : {}) });
    }
  }
  return result;
}

/** The analyzed retained parent supplies the identity; presentation adds no naming rules. */
export function retainedFunctionalParentReasoning(analysis: FunctionalReasoningAnalysis, language: AppLanguage) {
  const aldehydes = analysis.functionalGroups.filter((group) => group.kind === "aldehyde");
  if (analysis.family !== "aromatic" || analysis.mainChain.length !== 6
    || analysis.chainName !== "benzaldehído" || analysis.primaryFunctionalGroup !== "aldehyde"
    || aldehydes.length !== 1 || analysis.mainChain.includes(aldehydes[0].carbonId)) return undefined;
  const name = localized(analysis.chainName, language);
  return language === "en" ? {
    function: `The aldehyde is identified as the principal functional group. The retained name “${name}” is used for a –CHO group directly attached to a benzene ring. The carbon of –CHO belongs to the aldehyde function and remains outside the parent ring.`,
    parent: "The parent skeleton is a six-carbon benzene ring.",
  } : {
    function: `Se identifica el aldehído como la función principal. Se utiliza el nombre retenido «${name}» para un grupo –CHO unido directamente a un anillo bencénico. El carbono de –CHO pertenece a la función aldehído y queda fuera del anillo padre.`,
    parent: "El esqueleto padre es un anillo bencénico de seis carbonos.",
  };
}

/** Structural explanations share exactly the same atom provenance as the links. */
export function functionalContributionReasoning(
  analysis: FunctionalReasoningAnalysis,
  role: "function" | "substituent",
  language: AppLanguage,
) {
  const evidence = functionalNameEvidence(analysis, localized(analysis.name ?? analysis.chainName, language), language)
    .filter((item) => item.kind === role);
  const phrases: string[] = [];
  for (const item of evidence) {
    const groups = [...new Set(item.contributions.map((contribution) => contribution.group))];
    const structural = groups.map((group) => structures[group]?.[language]).filter(Boolean).join(language === "en" ? " and " : " y ");
    if (!structural || item.contributions[0]?.role === "acid-marker") continue;
    if (item.contributions[0]?.role === "ester-alkyl") {
      phrases.push(language === "en"
        ? `The alkyl portion bonded through the ester oxygen contributes “${item.text}”; it is separate from the acid-derived portion.`
        : `La porción alquilo enlazada a través del oxígeno del éster aporta «${item.text}»; es distinta de la porción derivada del ácido.`);
    } else {
      const retained = item.text === localized(analysis.chainName, language);
      phrases.push(language === "en"
        ? `In this structure, ${structural} ${retained ? "is expressed in the retained parent name" : `contributes ${role === "function" ? "the suffix" : "the prefix"}`} “${item.text}”.`
        : `En esta estructura, ${structural} ${retained ? "se expresa en el nombre retenido del padre" : `aporta ${role === "function" ? "el sufijo" : "el prefijo"}`} «${item.text}».`);
    }
  }
  return phrases.join(" ");
}
