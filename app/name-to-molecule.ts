import { englishIupacRoot, IUPAC_ROOT_ALIASES, IUPAC_ROOTS } from "./iupac-prefixes.ts";
import { normalizeTraditionalUnsaturationNotation } from "./iupac-name-normalization.ts";
import { normalizeSubstituentAliasesForLocalParser } from "./substituent-aliases.ts";
import { fuseRingOnBond } from "./fused-ring.ts";
import {
  getFusedBicyclicSystem,
  getFusedTetracyclicSystem,
  getFusedTricyclicSystem,
} from "./fused-ring-nomenclature.ts";

export type GeneratedBondOrder = 1 | 2 | 3;

export type GeneratedBond = [number, number, GeneratedBondOrder?];

export type GeneratedAtom = {
  id: number;
  x: number;
  y: number;
  element?: "C" | "O" | "N" | "S" | "F" | "Cl" | "Br" | "I";
  charge?: number;
  /** Absolute tetrahedral configuration. It is independent of atom IDs and 2D coordinates. */
  tetrahedralParity?: "R" | "S";
};

export type GeneratedRing = {
  id: number;
  kind: "cycloalkane" | "aromatic";
  atomIds: number[];
};

export type GeneratedMolecule = {
  atoms: GeneratedAtom[];
  bonds: GeneratedBond[];
  rings?: GeneratedRing[];
};

type ParentDescription = {
  kind: "chain" | "ring" | "benzene";
  size: number;
  doubleLocants: number[];
  tripleLocants: number[];
};

type SubstituentKind =
  | { kind: "linear"; length: number }
  | { kind: "vinyl" }
  | { kind: "halogen"; element: "F" | "Cl" | "Br" | "I" }
  | {
      kind: "structured";
      atoms: Array<{ x: number; y: number; element?: GeneratedAtom["element"] }>;
      connections: Array<readonly [number, number, GeneratedBondOrder?]>;
    }
  | { kind: "isopropyl" }
  | { kind: "isobutyl" }
  | { kind: "sec-butyl" }
  | { kind: "tert-butyl" };

type Substitution = {
  locant: number;
  substituent: SubstituentKind;
};

type ParsedName = {
  parent: ParentDescription;
  substitutions: Substitution[];
  enabledAliases: string[];
  normalizedInput: string;
  prebuiltMolecule?: GeneratedMolecule;
};

export type NameBuildResult =
  | {
      ok: true;
      molecule: GeneratedMolecule;
      normalizedInput: string;
      enabledAliases: string[];
      inputFamily?: "fused-von-baeyer";
    }
  | {
      ok: false;
      error: string;
      inputFamily?: "fused-von-baeyer";
    };

const hydrocarbonRoots = IUPAC_ROOTS;
const alkylNames = IUPAC_ROOTS.map((root) => root ? `${root}il` : "");

const multiplierCounts: Record<string, number> = {
  di: 2,
  tri: 3,
  tetra: 4,
  penta: 5,
  hexa: 6,
  hepta: 7,
  octa: 8,
};

const alkeneMultipliers: Record<string, number> = {
  di: 2,
  tri: 3,
  tetra: 4,
  penta: 5,
  hexa: 6,
  hepta: 7,
  octa: 8,
};

const alkyneMultipliers = alkeneMultipliers;

const commonSubstituents: Record<
  string,
  { substituent: SubstituentKind; systematicAlias?: string }
> = {
  vinil: { substituent: { kind: "vinyl" } },
  isopropil: { substituent: { kind: "isopropyl" }, systematicAlias: "1-metiletil" },
  isobutil: { substituent: { kind: "isobutyl" }, systematicAlias: "2-metilpropil" },
  "sec-butil": { substituent: { kind: "sec-butyl" }, systematicAlias: "1-metilpropil" },
  "terc-butil": { substituent: { kind: "tert-butyl" }, systematicAlias: "1,1-dimetiletil" },
  "tert-butil": { substituent: { kind: "tert-butyl" }, systematicAlias: "1,1-dimetiletil" },
};

const halogenSubstituents: Record<string, Extract<SubstituentKind, { kind: "halogen" }>> = {
  fluoro: { kind: "halogen", element: "F" },
  cloro: { kind: "halogen", element: "Cl" },
  bromo: { kind: "halogen", element: "Br" },
  yodo: { kind: "halogen", element: "I" },
};

const parenthesizedSubstituents: Record<
  string,
  Extract<SubstituentKind, { kind: "structured" }>
> = {
  clorometil: {
    kind: "structured",
    atoms: [{ x: 0, y: 1 }, { x: 0, y: 2, element: "Cl" }],
    connections: [[-1, 0], [0, 1]],
  },
  bromometil: {
    kind: "structured",
    atoms: [{ x: 0, y: 1 }, { x: 0, y: 2, element: "Br" }],
    connections: [[-1, 0], [0, 1]],
  },
  "2-cloroetil": {
    kind: "structured",
    atoms: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3, element: "Cl" }],
    connections: [[-1, 0], [0, 1], [1, 2]],
  },
  "2-hidroxietil": {
    kind: "structured",
    atoms: [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3, element: "O" }],
    connections: [[-1, 0], [0, 1], [1, 2]],
  },
};

const substituentTokens = [
  ...Object.keys(commonSubstituents),
  ...Object.keys(halogenSubstituents),
  ...alkylNames.slice(1),
].sort((left, right) => right.length - left.length);

function normalizeName(value: string) {
  const normalized = normalizeSubstituentAliasesForLocalParser(value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/\.+$/g, "")
    .replace(/--+/g, "-"));
  return normalizeTraditionalUnsaturationNotation(normalized);
}

function directAlias(name: string): ParsedName | null {
  const aromaticAliases: Record<string, number[]> = {
    tolueno: [1],
    "o-xileno": [1, 2],
    ortoxileno: [1, 2],
    "m-xileno": [1, 3],
    metaxileno: [1, 3],
    "p-xileno": [1, 4],
    paraxileno: [1, 4],
  };
  const locants = aromaticAliases[name];
  if (locants) {
    return {
      parent: {
        kind: "benzene",
        size: 6,
        doubleLocants: [],
        tripleLocants: [],
      },
      substitutions: locants.map((locant) => ({
        locant,
        substituent: { kind: "linear", length: 1 },
      })),
      enabledAliases: [],
      normalizedInput: name,
    };
  }

  if (name === "bifenilo") {
    const first = makeRing(6, "aromatic", 1, 0, 0);
    const second = makeRing(6, "aromatic", 7, 3.5, 0);
    return {
      parent: { kind: "benzene", size: 6, doubleLocants: [], tripleLocants: [] },
      substitutions: [],
      enabledAliases: [],
      normalizedInput: name,
      prebuiltMolecule: {
        atoms: [...first.atoms, ...second.atoms],
        bonds: [...first.bonds, ...second.bonds, [2, 12, 1] as GeneratedBond],
        rings: [...(first.rings ?? []), { ...(second.rings?.[0] as GeneratedRing), id: 2 }],
      },
    };
  }

  return null;
}

function parseLocants(value: string) {
  if (!/^\d+(?:,\d+)*$/.test(value)) return null;
  return value.split(",").map(Number);
}

function expectedUnsaturationCount(token: string, ending: "en" | "ino") {
  if (ending === "en") {
    if (token === "en") return 1;
    const prefix = token.slice(0, -2);
    return alkeneMultipliers[prefix] ?? null;
  }
  if (token === "ino") return 1;
  const prefix = token.slice(0, -3);
  return alkyneMultipliers[prefix] ?? null;
}

function parseParentTail(tail: string, size: number) {
  if (tail === "ano") return { doubleLocants: [], tripleLocants: [] };
  if (tail === "eno") return { doubleLocants: [1], tripleLocants: [] };
  if (tail === "ino") return { doubleLocants: [], tripleLocants: [1] };

  let match = tail.match(/^-(\d+)-(eno|ino)$/);
  if (match) {
    const locant = Number(match[1]);
    return match[2] === "eno"
      ? { doubleLocants: [locant], tripleLocants: [] }
      : { doubleLocants: [], tripleLocants: [locant] };
  }

  match = tail.match(/^a-(\d+(?:,\d+)*)-(di|tri|tetra|penta|hexa|hepta|octa)(eno|ino)$/);
  if (match) {
    const locants = parseLocants(match[1]);
    const expected = multiplierCounts[match[2]];
    if (!locants || locants.length !== expected) return null;
    return match[3] === "eno"
      ? { doubleLocants: locants, tripleLocants: [] }
      : { doubleLocants: [], tripleLocants: locants };
  }

  match = tail.match(
    /^-(\d+(?:,\d+)*)-(en|dien|trien|tetraen|pentaen|hexaen|heptaen|octaen)-(\d+(?:,\d+)*)-(ino|diino|triino|tetraino|pentaino|hexaino|heptaino|octaino)$/,
  );
  if (match) {
    const doubleLocants = parseLocants(match[1]);
    const tripleLocants = parseLocants(match[3]);
    const expectedDoubles = expectedUnsaturationCount(match[2], "en");
    const expectedTriples = expectedUnsaturationCount(match[4], "ino");
    if (
      !doubleLocants
      || !tripleLocants
      || doubleLocants.length !== expectedDoubles
      || tripleLocants.length !== expectedTriples
    ) {
      return null;
    }
    return { doubleLocants, tripleLocants };
  }

  // Acepta también la forma PIN habitual: hex-1-en-3-ino.
  match = tail.match(/^-(\d+)-en-(\d+)-ino$/);
  if (match) {
    return { doubleLocants: [Number(match[1])], tripleLocants: [Number(match[2])] };
  }

  const locantLimit = Math.max(1, size - 1);
  const prefixed = tail.match(/^(\d+)-(.*)$/);
  if (prefixed && Number(prefixed[1]) <= locantLimit) {
    return parseParentTail(`-${prefixed[1]}-${prefixed[2]}`, size);
  }

  return null;
}

function parseParent(value: string): ParentDescription | null {
  if (value === "benceno") {
    return { kind: "benzene", size: 6, doubleLocants: [], tripleLocants: [] };
  }

  const isRing = value.startsWith("ciclo");
  const withoutCycle = isRing ? value.slice(5) : value;

  for (let size = hydrocarbonRoots.length - 1; size >= 1; size -= 1) {
    const roots = [hydrocarbonRoots[size], ...(IUPAC_ROOT_ALIASES[size] ?? [])]
      .sort((left, right) => right.length - left.length);
    for (const root of roots) {
      if (!withoutCycle.startsWith(root)) continue;
      const tail = withoutCycle.slice(root.length);
      const unsaturation = parseParentTail(tail, size);
      if (!unsaturation) continue;
      return {
        kind: isRing ? "ring" : "chain",
        size,
        ...unsaturation,
      };
    }
  }

  return null;
}

function substituentFromToken(token: string) {
  const common = commonSubstituents[token];
  if (common) return common;
  const halogen = halogenSubstituents[token];
  if (halogen) return { substituent: halogen };
  const length = alkylNames.indexOf(token);
  if (length > 0) return { substituent: { kind: "linear", length } as SubstituentKind };
  return null;
}

function parseSubstitutions(
  value: string,
  parent: ParentDescription,
): { substitutions: Substitution[]; enabledAliases: string[] } | null {
  if (!value) return { substitutions: [], enabledAliases: [] };

  const substitutions: Substitution[] = [];
  const enabledAliases = new Set<string>();
  let remaining = value;

  while (remaining) {
    let locants: number[] | null = null;
    const locantMatch = remaining.match(/^(\d+(?:,\d+)*)-/);
    if (locantMatch) {
      locants = parseLocants(locantMatch[1]);
      remaining = remaining.slice(locantMatch[0].length);
    } else if ((parent.kind === "ring" || parent.kind === "benzene") && substitutions.length === 0) {
      locants = [1];
    } else {
      return null;
    }

    if (!locants) return null;

    if (remaining.startsWith("(")) {
      const closingIndex = remaining.indexOf(")");
      if (closingIndex < 0) return null;
      const descriptor = parenthesizedSubstituents[remaining.slice(1, closingIndex)];
      if (!descriptor || locants.length !== 1) return null;
      substitutions.push({ locant: locants[0], substituent: descriptor });
      remaining = remaining.slice(closingIndex + 1);
      if (remaining.startsWith("-")) remaining = remaining.slice(1);
      continue;
    }

    let multiplier = "";
    for (const candidate of Object.keys(multiplierCounts).sort((a, b) => b.length - a.length)) {
      if (remaining.startsWith(candidate)) {
        multiplier = candidate;
        break;
      }
    }

    const token = substituentTokens.find((candidate) =>
      remaining.startsWith(`${multiplier}${candidate}`),
    );
    if (!token) return null;

    const count = multiplier ? multiplierCounts[multiplier] : 1;
    if (locants.length !== count) return null;
    remaining = remaining.slice(multiplier.length + token.length);

    const descriptor = substituentFromToken(token);
    if (!descriptor) return null;
    if (descriptor.systematicAlias) enabledAliases.add(descriptor.systematicAlias);
    locants.forEach((locant) => {
      substitutions.push({ locant, substituent: descriptor.substituent });
    });

    if (remaining.startsWith("-")) remaining = remaining.slice(1);
  }

  return { substitutions, enabledAliases: [...enabledAliases] };
}

function parseHydrocarbonName(name: string): ParsedName | null {
  const alias = directAlias(name);
  if (alias) return alias;

  for (let split = 0; split < name.length; split += 1) {
    const parent = parseParent(name.slice(split));
    if (!parent) continue;
    const substitutions = parseSubstitutions(name.slice(0, split), parent);
    if (!substitutions) continue;
    return {
      parent,
      ...substitutions,
      normalizedInput: name,
    };
  }
  return null;
}

const alcoholMultiplierCounts: Record<string, number> = {
  "": 1,
  di: 2,
  tri: 3,
  tetra: 4,
  penta: 5,
  hexa: 6,
};

function hydrocarbonParentFromAlcoholStem(value: string) {
  if (value.endsWith("ano") || value.endsWith("eno") || value.endsWith("ino") || value === "benceno") {
    return value;
  }
  if (value.endsWith("an") || value.endsWith("en") || value.endsWith("in")) {
    return `${value}o`;
  }
  return value;
}

function attachHydroxylGroups(
  molecule: GeneratedMolecule,
  parent: ParentDescription,
  locants: number[],
) {
  let nextId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  locants.forEach((locant, index) => {
    const anchor = molecule.atoms.find((atom) => atom.id === locant);
    if (!anchor) return;

    let outwardX = 0;
    let outwardY = index % 2 === 0 ? -1 : 1;
    if (parent.kind !== "chain") {
      const length = Math.hypot(anchor.x, anchor.y) || 1;
      outwardX = anchor.x / length;
      outwardY = anchor.y / length;
    }

    molecule.atoms.push({
      id: nextId,
      x: anchor.x + outwardX * 1.15,
      y: anchor.y + outwardY * 1.15,
      element: "O",
    });
    molecule.bonds.push([anchor.id, nextId, 1]);
    nextId += 1;
  });
}

function attachCarbonylGroup(
  molecule: GeneratedMolecule,
  parent: ParentDescription,
  locant: number,
  includeHydroxyl: boolean,
) {
  const anchor = molecule.atoms.find((atom) => atom.id === locant);
  if (!anchor) return false;

  const nextId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  const outwardX = parent.kind === "chain" ? 0 : anchor.x / (Math.hypot(anchor.x, anchor.y) || 1);
  const outwardY = parent.kind === "chain" ? -1 : anchor.y / (Math.hypot(anchor.x, anchor.y) || 1);
  molecule.atoms.push({
    id: nextId,
    x: anchor.x + outwardX * 1.15,
    y: anchor.y + outwardY * 1.15,
    element: "O",
  });
  molecule.bonds.push([anchor.id, nextId, 2]);

  if (includeHydroxyl) {
    molecule.atoms.push({
      id: nextId + 1,
      x: anchor.x - outwardX * 1.15,
      y: anchor.y - outwardY * 1.15,
      element: "O",
    });
    molecule.bonds.push([anchor.id, nextId + 1, 1]);
  }
  return true;
}

function oxygenatedParsedName(
  name: string,
  parentName: string,
  locants: number[],
  kind: "alcohol" | "aldehyde" | "ketone" | "carboxylicAcid",
): ParsedName | null {
  const parsedParent = parseHydrocarbonName(parentName);
  if (!parsedParent || (kind !== "alcohol" && parsedParent.parent.kind !== "chain")) return null;
  if (locants.some((locant) => locant < 1 || locant > parsedParent.parent.size)) return null;
  if ((kind === "aldehyde" || kind === "carboxylicAcid") && !locants.every(
    (locant) => locant === 1 || locant === parsedParent.parent.size,
  )) return null;
  if (kind === "ketone" && locants.some(
    (locant) => locant <= 1 || locant >= parsedParent.parent.size,
  )) return null;

  const molecule = graphForParsedName(parsedParent);
  if (kind === "alcohol") {
    attachHydroxylGroups(molecule, parsedParent.parent, locants);
  } else if (!locants.every((locant) => attachCarbonylGroup(
    molecule,
    parsedParent.parent,
    locant,
    kind === "carboxylicAcid",
  ))) {
    return null;
  }

  return {
    ...parsedParent,
    normalizedInput: name,
    prebuiltMolecule: molecule,
  };
}

function parseAlcoholName(name: string): ParsedName | null {
  const phenolLocants = name === "fenol" ? [1] : null;
  const locantedMatch = phenolLocants
    ? null
    : name.match(/^(.*)-(\d+(?:,\d+)*)-(di|tri|tetra|penta|hexa)?ol$/);
  const unlocantedMatch = phenolLocants || locantedMatch ? null : name.match(/^(.+)ol$/);
  if (!phenolLocants && !locantedMatch && !unlocantedMatch) return null;

  const locants = phenolLocants ?? (locantedMatch
    ? parseLocants(locantedMatch[2])
    : [1]);
  const multiplier = phenolLocants ? "" : (locantedMatch?.[3] ?? "");
  if (!locants || locants.length !== alcoholMultiplierCounts[multiplier]) return null;
  if (new Set(locants).size !== locants.length) return null;

  const hydrocarbonName = phenolLocants
    ? "benceno"
    : hydrocarbonParentFromAlcoholStem(locantedMatch?.[1] ?? unlocantedMatch?.[1] ?? "");
  return oxygenatedParsedName(name, hydrocarbonName, locants, "alcohol");
}

function parseAldehydeName(name: string): ParsedName | null {
  const match = name.match(/^(.+)al$/);
  if (!match) return null;
  const parentName = hydrocarbonParentFromAlcoholStem(match[1]);
  return oxygenatedParsedName(name, parentName, [1], "aldehyde");
}

function parseKetoneName(name: string): ParsedName | null {
  const locanted = name.match(/^(.*)-(\d+)-ona$/);
  const simple = locanted ? null : name.match(/^(.+)ona$/);
  if (!locanted && !simple) return null;
  const parentName = hydrocarbonParentFromAlcoholStem(locanted?.[1] ?? simple?.[1] ?? "");
  return oxygenatedParsedName(name, parentName, [locanted ? Number(locanted[2]) : 2], "ketone");
}

function parseCarboxylicAcidName(name: string): ParsedName | null {
  const match = name.match(/^acido(.+)oico$/);
  if (!match) return null;
  const parentName = hydrocarbonParentFromAlcoholStem(match[1]);
  return oxygenatedParsedName(name, parentName, [1], "carboxylicAcid");
}

function makeChain(size: number): GeneratedMolecule {
  return {
    atoms: Array.from({ length: size }, (_, index) => ({ id: index + 1, x: index, y: 0 })),
    bonds: Array.from({ length: Math.max(0, size - 1) }, (_, index) => [
      index + 1,
      index + 2,
      1,
    ] as GeneratedBond),
  };
}

function makeRing(
  size: number,
  kind: "cycloalkane" | "aromatic",
  firstId = 1,
  centerX = 0,
  centerY = 0,
): GeneratedMolecule {
  const atomIds = Array.from({ length: size }, (_, index) => firstId + index);
  const atoms = atomIds.map((id, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / size;
    return {
      id,
      x: centerX + Math.cos(angle) * 1.35,
      y: centerY + Math.sin(angle) * 1.65,
    };
  });
  const bonds = atomIds.map((atomId, index) => [
    atomId,
    atomIds[(index + 1) % size],
    kind === "aromatic" && index % 2 === 0 ? 2 : 1,
  ] as GeneratedBond);
  return { atoms, bonds, rings: [{ id: 1, kind, atomIds }] };
}

type ParsedFusedVonBaeyerName = {
  ringCount: 2 | 3 | 4;
  descriptor: string;
  bridgeLengths: number[];
  secondaryBridgeLocants: [number, number][];
  carbonCount: number;
  language: "es" | "en";
  alkylSubstituents: { locant: number; length: number }[];
  hydroxyPrefixLocants: number[];
  alcoholLocants: number[];
  ketoneLocants: number[];
  multipleBonds: { locants: [number, number?]; order: 2 | 3 }[];
  normalizedInput: string;
};

type FusedVonBaeyerParseResult =
  | { matched: false }
  | { matched: true; parsed: ParsedFusedVonBaeyerName }
  | { matched: true; error: string };

const superscriptDigits: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

function plainSuperscriptNumber(value: string) {
  return [...value].map((character) => superscriptDigits[character] ?? character).join("");
}

function normalizeVonBaeyerSuperscripts(value: string) {
  return value
    .replace(/⁽([⁰¹²³⁴⁵⁶⁷⁸⁹]+),([⁰¹²³⁴⁵⁶⁷⁸⁹]+)⁾/g, (_match, left, right) => (
      `^{${plainSuperscriptNumber(left)},${plainSuperscriptNumber(right)}}`
    ))
    .replace(/(\d)([⁰¹²³⁴⁵⁶⁷⁸⁹]+),([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_match, bridge, left, right) => (
      `${bridge}^{${plainSuperscriptNumber(left)},${plainSuperscriptNumber(right)}}`
    ));
}

const fusedPrefixMultiplierByCount = new Map(
  Object.entries(multiplierCounts).map(([prefix, count]) => [count, prefix]),
);

function parseFusedLocants(value: string) {
  const locants = value.split(",").map(Number);
  return locants.length > 0
    && locants.every((locant) => Number.isInteger(locant) && locant > 0)
    ? locants
    : null;
}

function parseFusedPrefixes(value: string, language: "es" | "en") {
  const alkylSubstituents: { locant: number; length: number }[] = [];
  const hydroxyPrefixLocants: number[] = [];
  if (!value) return { alkylSubstituents, hydroxyPrefixLocants };

  const components = value.split(/-(?=\d+(?:,\d+)*-)/);
  for (const component of components) {
    const match = component.match(/^(\d+(?:,\d+)*)-([a-z]+)$/);
    if (!match) return null;
    const locants = parseFusedLocants(match[1]);
    if (!locants) return null;
    const expectedMultiplier = locants.length === 1
      ? ""
      : fusedPrefixMultiplierByCount.get(locants.length);
    if (expectedMultiplier === undefined) return null;

    const hydroxy = language === "es" ? "hidroxi" : "hydroxy";
    if (match[2] === `${expectedMultiplier}${hydroxy}`) {
      hydroxyPrefixLocants.push(...locants);
      continue;
    }

    const alkylLength = IUPAC_ROOTS.findIndex((root, carbonCount) => {
      if (carbonCount < 1) return false;
      const alkyl = language === "es" ? `${root}il` : `${englishIupacRoot(root)}yl`;
      return match[2] === `${expectedMultiplier}${alkyl}`;
    });
    if (alkylLength < 1) return null;
    alkylSubstituents.push(...locants.map((locant) => ({ locant, length: alkylLength })));
  }
  return { alkylSubstituents, hydroxyPrefixLocants };
}

function parseFusedMultipleLocant(value: string): [number, number?] | null {
  const match = value.match(/^(\d+)(?:\((\d+)\))?$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : undefined;
  if (first < 1 || (second !== undefined && (second < 1 || second === first))) return null;
  return second === undefined ? [first] : [first, second];
}

const fusedUnsaturationTokens: Record<string, { order: 2 | 3; count: number; terminal: boolean }> = {
  en: { order: 2, count: 1, terminal: false },
  eno: { order: 2, count: 1, terminal: true },
  ene: { order: 2, count: 1, terminal: true },
  dien: { order: 2, count: 2, terminal: false },
  dieno: { order: 2, count: 2, terminal: true },
  diene: { order: 2, count: 2, terminal: true },
  trien: { order: 2, count: 3, terminal: false },
  trieno: { order: 2, count: 3, terminal: true },
  triene: { order: 2, count: 3, terminal: true },
  in: { order: 3, count: 1, terminal: false },
  yn: { order: 3, count: 1, terminal: false },
  ino: { order: 3, count: 1, terminal: true },
  yne: { order: 3, count: 1, terminal: true },
  diin: { order: 3, count: 2, terminal: false },
  diyn: { order: 3, count: 2, terminal: false },
  diino: { order: 3, count: 2, terminal: true },
  diyne: { order: 3, count: 2, terminal: true },
  triin: { order: 3, count: 3, terminal: false },
  triyn: { order: 3, count: 3, terminal: false },
  triino: { order: 3, count: 3, terminal: true },
  triyne: { order: 3, count: 3, terminal: true },
};

function parseFusedUnsaturationStem(value: string, followedByFunction: boolean) {
  const stem = value.startsWith("a-") ? value.slice(1) : value;
  const pattern = /-((?:\d+(?:\(\d+\))?)(?:,\d+(?:\(\d+\))?)*)-(triyne|triino|triene|trieno|diyne|diino|diene|dieno|triyn|triin|trien|diyn|diin|dien|yne|ino|ene|eno|yn|in|en)/gy;
  const matches = [...stem.matchAll(pattern)];
  if (!matches.length || matches.map((match) => match[0]).join("") !== stem) return null;

  const multipleBonds: { locants: [number, number?]; order: 2 | 3 }[] = [];
  for (const [index, match] of matches.entries()) {
    const token = fusedUnsaturationTokens[match[2]];
    const citedLocants = match[1].split(",").map(parseFusedMultipleLocant);
    if (!token || citedLocants.some((locant) => !locant) || citedLocants.length !== token.count) return null;
    const shouldBeTerminal = !followedByFunction && index === matches.length - 1;
    if (token.terminal !== shouldBeTerminal) return null;
    multipleBonds.push(...(citedLocants as [number, number?][]).map((locants) => ({
      locants,
      order: token.order,
    })));
  }
  return multipleBonds;
}

function parseFusedParentTail(value: string, language: "es" | "en") {
  const roots = IUPAC_ROOTS.map((root, carbonCount) => ({
    carbonCount,
    root: language === "es" ? root : englishIupacRoot(root),
  })).filter(({ carbonCount }) => carbonCount > 0)
    .sort((left, right) => right.root.length - left.root.length);
  const matchedRoot = roots.find(({ root }) => value.startsWith(root));
  if (!matchedRoot) return null;

  let stem = value.slice(matchedRoot.root.length);
  let alcoholLocants: number[] = [];
  let ketoneLocants: number[] = [];
  const functionMatch = stem.match(/^(.*)-(\d+(?:,\d+)*)-(triol|diol|ol|diona|dione|ona|one)$/);
  if (functionMatch) {
    const locants = parseFusedLocants(functionMatch[2]);
    if (!locants) return null;
    const suffix = functionMatch[3];
    const kind = suffix.endsWith("ol") ? "alcohol" : "ketone";
    const expectedCount = suffix.startsWith("tri") ? 3 : suffix.startsWith("di") ? 2 : 1;
    if (locants.length !== expectedCount) return null;
    if (kind === "alcohol") alcoholLocants = locants;
    else ketoneLocants = locants;
    stem = functionMatch[1];
  }

  const saturatedStems = functionMatch
    ? functionMatch[2].includes(",")
      ? [language === "es" ? "ano" : "ane"]
      : ["an"]
    : [language === "es" ? "ano" : "ane"];
  let multipleBonds: { locants: [number, number?]; order: 2 | 3 }[] = [];
  if (!saturatedStems.includes(stem)) {
    const parsedUnsaturation = parseFusedUnsaturationStem(stem, Boolean(functionMatch));
    if (!parsedUnsaturation) return null;
    multipleBonds = parsedUnsaturation;
  }

  return {
    carbonCount: matchedRoot.carbonCount,
    alcoholLocants,
    ketoneLocants,
    multipleBonds,
  };
}

function parseFusedVonBaeyerName(name: string): FusedVonBaeyerParseResult {
  const normalized = normalizeVonBaeyerSuperscripts(name);
  const coreMatch = normalized.match(/(biciclo|bicyclo|triciclo|tricyclo|tetraciclo|tetracyclo)\[/);
  if (!coreMatch || coreMatch.index === undefined) return { matched: false };
  const prefixText = normalized.slice(0, coreMatch.index).replace(/-$/, "");
  const core = normalized.slice(coreMatch.index);

  const match = core.match(
    /^(biciclo|bicyclo|triciclo|tricyclo|tetraciclo|tetracyclo)\[([^\]]+)\]([a-z0-9,()\-]+)$/,
  );
  if (!match) {
    return { matched: true, error: "El descriptor von Baeyer está incompleto o malformado." };
  }

  const ringCount = match[1].startsWith("tetra") ? 4 : match[1].startsWith("tri") ? 3 : 2;
  const language = match[1].includes("cyclo") ? "en" : "es";
  const prefixes = parseFusedPrefixes(prefixText, language);
  const parentTail = parseFusedParentTail(match[3], language);
  if (!prefixes || !parentTail) {
    return {
      matched: true,
      error: "El nombre del derivado von Baeyer contiene prefijos, localizadores o sufijos no admitidos.",
    };
  }
  const { carbonCount } = parentTail;

  const descriptorMatch = match[2].match(
    /^(\d+)\.(\d+)\.(\d+)((?:\.\d+\^\{\d+,\d+\})*)$/,
  );
  if (!descriptorMatch) {
    return { matched: true, error: "El descriptor von Baeyer contiene puentes o localizadores malformados." };
  }

  const bridgeLengths = descriptorMatch.slice(1, 4).map(Number);
  const secondaryBridgeLocants: [number, number][] = [];
  const secondaryLengths: number[] = [];
  for (const secondary of descriptorMatch[4].matchAll(/\.(\d+)\^\{(\d+),(\d+)\}/g)) {
    secondaryLengths.push(Number(secondary[1]));
    secondaryBridgeLocants.push([Number(secondary[2]), Number(secondary[3])]);
  }
  bridgeLengths.push(...secondaryLengths);

  if (bridgeLengths.length !== ringCount + 1 || secondaryBridgeLocants.length !== ringCount - 2) {
    return {
      matched: true,
      error: `Un ${match[1]} necesita ${ringCount + 1} longitudes de puente en su descriptor.`,
    };
  }
  if (bridgeLengths[0] < bridgeLengths[1]) {
    return { matched: true, error: "Las dos ramas principales deben citarse en orden decreciente." };
  }
  if (bridgeLengths.slice(2).some((length) => length !== 0)) {
    return {
      matched: true,
      error: "Este constructor admite por ahora únicamente policiclos ortofusionados con puentes de longitud cero.",
    };
  }
  if (bridgeLengths.reduce((sum, length) => sum + length, 2) !== carbonCount) {
    return {
      matched: true,
      error: "El número de carbonos del progenitor no coincide con las longitudes del descriptor von Baeyer.",
    };
  }

  const descriptor = `[${bridgeLengths.slice(0, 3).join(".")}${secondaryBridgeLocants.map(
    (locants, index) => `.${secondaryLengths[index]}^{${locants.join(",")}}`,
  ).join("")}]`;
  return {
    matched: true,
    parsed: {
      ringCount: ringCount as 2 | 3 | 4,
      descriptor,
      bridgeLengths,
      secondaryBridgeLocants,
      carbonCount,
      language,
      ...prefixes,
      ...parentTail,
      normalizedInput: normalized,
    },
  };
}

function splitRegionOnChord(region: readonly number[], chord: readonly [number, number]) {
  let leftIndex = region.indexOf(chord[0]);
  let rightIndex = region.indexOf(chord[1]);
  if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return null;
  if (leftIndex > rightIndex) [leftIndex, rightIndex] = [rightIndex, leftIndex];
  const first = region.slice(leftIndex, rightIndex + 1);
  const second = [...region.slice(rightIndex), ...region.slice(0, leftIndex + 1)];
  if (first.length < 3 || second.length < 3) return null;
  return [first, second] as const;
}

function fusedRegionsFromDescriptor(parsed: ParsedFusedVonBaeyerName) {
  const locants = Array.from({ length: parsed.carbonCount }, (_, index) => index + 1);
  const chords: [number, number][] = [
    [1, parsed.bridgeLengths[0] + 2],
    ...parsed.secondaryBridgeLocants,
  ];
  let regions: number[][] = [locants];
  for (const chord of chords) {
    if (
      chord[0] < 1 || chord[1] > parsed.carbonCount || chord[0] >= chord[1]
      || chord[1] - chord[0] === 1
      || (chord[0] === 1 && chord[1] === parsed.carbonCount)
    ) return null;
    const matching = regions
      .map((region, index) => ({ index, split: splitRegionOnChord(region, chord) }))
      .filter(({ split }) => Boolean(split));
    if (matching.length !== 1) return null;
    const [{ index, split }] = matching;
    regions = [
      ...regions.slice(0, index),
      ...(split as readonly [number[], number[]]),
      ...regions.slice(index + 1),
    ];
  }
  if (regions.length !== parsed.ringCount || regions.some((region) => ![5, 6].includes(region.length))) {
    return null;
  }
  return { regions, chords };
}

function numberedFusedGraph(
  parsed: ParsedFusedVonBaeyerName,
  regions: readonly number[][],
  chords: readonly [number, number][],
): GeneratedMolecule {
  const atoms = Array.from({ length: parsed.carbonCount }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / parsed.carbonCount;
    return { id: index + 1, x: Math.cos(angle), y: Math.sin(angle) };
  });
  const bonds: GeneratedBond[] = atoms.map((atom, index) => [
    atom.id,
    atoms[(index + 1) % atoms.length].id,
    1,
  ]);
  bonds.push(...chords.map(([left, right]) => [left, right, 1] as GeneratedBond));
  return {
    atoms,
    bonds,
    rings: regions.map((atomIds, index) => ({ id: index + 1, kind: "cycloalkane", atomIds: [...atomIds] })),
  };
}

function validateFusedDescriptorGraph(
  parsed: ParsedFusedVonBaeyerName,
  molecule: GeneratedMolecule,
  requireCanonicalDescriptor = true,
) {
  if (molecule.bonds.length - molecule.atoms.length + 1 !== parsed.ringCount) return false;
  const valences = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  molecule.bonds.forEach(([left, right, order = 1]) => {
    valences.set(left, (valences.get(left) ?? 0) + order);
    valences.set(right, (valences.get(right) ?? 0) + order);
  });
  if ([...valences.values()].some((valence) => valence > 4)) return false;

  if (parsed.ringCount === 2) {
    const system = getFusedBicyclicSystem(molecule);
    return Boolean(system && (
      !requireCanonicalDescriptor || `[${system.paths.join(".")}]` === parsed.descriptor
    ));
  }
  if (parsed.ringCount === 3) {
    const system = getFusedTricyclicSystem(molecule);
    return Boolean(system && (
      !requireCanonicalDescriptor || system.vonBaeyerDescriptor === parsed.descriptor
    ));
  }
  const system = getFusedTetracyclicSystem(molecule);
  return Boolean(system && (
    !requireCanonicalDescriptor || system.vonBaeyerDescriptor === parsed.descriptor
  ));
}

function hasFusedDerivatives(parsed: ParsedFusedVonBaeyerName) {
  return parsed.alkylSubstituents.length > 0
    || parsed.hydroxyPrefixLocants.length > 0
    || parsed.alcoholLocants.length > 0
    || parsed.ketoneLocants.length > 0
    || parsed.multipleBonds.length > 0;
}

function sharedRegionEdge(left: readonly number[], right: readonly number[]) {
  const shared = left.filter((locant) => right.includes(locant));
  if (shared.length !== 2) return null;
  const adjacent = (region: readonly number[]) => region.some((locant, index) => (
    locant === shared[0]
    && (region[(index + 1) % region.length] === shared[1]
      || region[(index + region.length - 1) % region.length] === shared[1])
  ));
  return adjacent(left) && adjacent(right) ? shared as [number, number] : null;
}

function fusedLayoutFromRegions(regions: readonly number[][]) {
  const adjacency = regions.map(() => new Set<number>());
  for (let left = 0; left < regions.length; left += 1) {
    for (let right = left + 1; right < regions.length; right += 1) {
      if (!sharedRegionEdge(regions[left], regions[right])) continue;
      adjacency[left].add(right);
      adjacency[right].add(left);
    }
  }
  const start = adjacency.findIndex((neighbors) => neighbors.size === 1);
  if (start < 0) return null;

  const firstRegion = regions[start];
  let molecule = makeRing(firstRegion.length, "cycloalkane");
  const generatedIdByLocant = new Map(firstRegion.map((locant, index) => [locant, index + 1]));
  const built = new Set([start]);
  let current = start;
  let previous = -1;
  while (built.size < regions.length) {
    const next = [...adjacency[current]].find((index) => index !== previous && !built.has(index));
    if (next === undefined) return null;
    const shared = sharedRegionEdge(regions[current], regions[next]);
    if (!shared) return null;
    const generatedShared = shared.map((locant) => generatedIdByLocant.get(locant));
    if (generatedShared.some((atomId) => atomId === undefined)) return null;
    molecule = fuseRingOnBond(
      molecule,
      generatedShared[0]!,
      generatedShared[1]!,
      regions[next].length as 5 | 6,
    );
    const generatedRing = molecule.rings!.at(-1)!;
    const descriptorStart = shared.find((locant) => (
      generatedIdByLocant.get(locant) === generatedRing.atomIds[0]
    ));
    const descriptorEnd = shared.find((locant) => locant !== descriptorStart);
    if (descriptorStart === undefined || descriptorEnd === undefined) return null;
    const startIndex = regions[next].indexOf(descriptorStart);
    const forward: number[] = [descriptorStart];
    for (
      let index = (startIndex + 1) % regions[next].length;
      regions[next][index] !== descriptorEnd;
      index = (index + 1) % regions[next].length
    ) forward.push(regions[next][index]);
    forward.push(descriptorEnd);
    const backward: number[] = [descriptorStart];
    for (
      let index = (startIndex + regions[next].length - 1) % regions[next].length;
      regions[next][index] !== descriptorEnd;
      index = (index + regions[next].length - 1) % regions[next].length
    ) backward.push(regions[next][index]);
    backward.push(descriptorEnd);
    const path = forward.length === regions[next].length ? forward : backward;
    if (path.length !== generatedRing.atomIds.length) return null;
    path.forEach((locant, index) => generatedIdByLocant.set(locant, generatedRing.atomIds[index]));
    built.add(next);
    previous = current;
    current = next;
  }
  return { molecule, atomIdByLocant: generatedIdByLocant };
}

function validateConstructedFusedDerivative(molecule: GeneratedMolecule) {
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  if (atomsById.size !== molecule.atoms.length) return false;
  const valenceByAtom = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  const adjacency = new Map(molecule.atoms.map((atom) => [atom.id, new Set<number>()]));
  for (const [left, right, order = 1] of molecule.bonds) {
    if (!atomsById.has(left) || !atomsById.has(right) || left === right || ![1, 2, 3].includes(order)) {
      return false;
    }
    valenceByAtom.set(left, (valenceByAtom.get(left) ?? 0) + order);
    valenceByAtom.set(right, (valenceByAtom.get(right) ?? 0) + order);
    adjacency.get(left)!.add(right);
    adjacency.get(right)!.add(left);
  }
  if ([...valenceByAtom].some(([atomId, valence]) => {
    const element = atomsById.get(atomId)?.element ?? "C";
    return valence > (element === "O" ? 2 : 4);
  })) return false;

  const visited = new Set<number>();
  const pending = molecule.atoms.length ? [molecule.atoms[0].id] : [];
  while (pending.length) {
    const atomId = pending.pop()!;
    if (visited.has(atomId)) continue;
    visited.add(atomId);
    adjacency.get(atomId)?.forEach((neighbor) => pending.push(neighbor));
  }
  return visited.size === molecule.atoms.length;
}

function applyFusedDerivative(
  parsed: ParsedFusedVonBaeyerName,
  molecule: GeneratedMolecule,
  atomIdByLocant: ReadonlyMap<number, number>,
) {
  const coreParent: ParentDescription = {
    kind: "ring",
    size: parsed.carbonCount,
    doubleLocants: [],
    tripleLocants: [],
  };
  const atomId = (locant: number) => atomIdByLocant.get(locant);
  const allFunctionalLocants = [
    ...parsed.hydroxyPrefixLocants,
    ...parsed.alcoholLocants,
    ...parsed.ketoneLocants,
  ];
  if (
    parsed.hydroxyPrefixLocants.length > 0 && parsed.ketoneLocants.length === 0
    || new Set(allFunctionalLocants).size !== allFunctionalLocants.length
    || [...allFunctionalLocants, ...parsed.alkylSubstituents.map(({ locant }) => locant)]
      .some((locant) => !atomId(locant))
  ) return "Los localizadores funcionales o de sustituyentes no son válidos para este policiclo.";

  const changedBonds = new Set<number>();
  for (const multipleBond of parsed.multipleBonds) {
    const [firstLocant, citedSecond] = multipleBond.locants;
    const secondLocant = citedSecond ?? firstLocant + 1;
    const firstId = atomId(firstLocant);
    const secondId = atomId(secondLocant);
    if (!firstId || !secondId) {
      return "Una insaturación cita un carbono inexistente en el descriptor von Baeyer.";
    }
    const bondIndex = molecule.bonds.findIndex(([left, right]) => (
      (left === firstId && right === secondId) || (left === secondId && right === firstId)
    ));
    if (bondIndex < 0 || changedBonds.has(bondIndex)) {
      return "Una insaturación no corresponde a un enlace único del núcleo policíclico.";
    }
    changedBonds.add(bondIndex);
    molecule.bonds[bondIndex] = [firstId, secondId, multipleBond.order];
  }

  for (const locant of parsed.ketoneLocants) {
    if (!attachCarbonylGroup(molecule, coreParent, atomId(locant)!, false)) {
      return "No fue posible colocar el grupo funcional en el carbono indicado.";
    }
  }
  const hydroxylAtomIds = [...parsed.alcoholLocants, ...parsed.hydroxyPrefixLocants]
    .map((locant) => atomId(locant)!);
  attachHydroxylGroups(molecule, coreParent, hydroxylAtomIds);

  const slotsByAtom = new Map<number, number>();
  parsed.alkylSubstituents.forEach(({ locant, length }) => {
    const anchorId = atomId(locant)!;
    const slot = slotsByAtom.get(anchorId) ?? 0;
    attachSubstituent(molecule, coreParent, {
      locant: anchorId,
      substituent: { kind: "linear", length },
    }, slot);
    slotsByAtom.set(anchorId, slot + 1);
  });

  return validateConstructedFusedDerivative(molecule)
    ? null
    : "La combinación indicada produce una conectividad o valencia no válida.";
}

function buildFusedVonBaeyerParent(name: string): NameBuildResult | null {
  const result = parseFusedVonBaeyerName(name);
  if (!result.matched) return null;
  if ("error" in result) {
    return { ok: false, error: result.error, inputFamily: "fused-von-baeyer" };
  }
  const geometry = fusedRegionsFromDescriptor(result.parsed);
  if (!geometry) {
    return {
      ok: false,
      error: "El descriptor no representa una cadena ortofusionada de anillos de cinco o seis miembros soportada.",
      inputFamily: "fused-von-baeyer",
    };
  }
  const numberedGraph = numberedFusedGraph(result.parsed, geometry.regions, geometry.chords);
  const requireCanonicalDescriptor = !hasFusedDerivatives(result.parsed);
  if (!validateFusedDescriptorGraph(result.parsed, numberedGraph, requireCanonicalDescriptor)) {
    return {
      ok: false,
      error: "El descriptor von Baeyer no coincide con una topología policíclica soportada o no usa su numeración canónica.",
      inputFamily: "fused-von-baeyer",
    };
  }
  const layout = fusedLayoutFromRegions(geometry.regions);
  if (
    !layout
    || !validateFusedDescriptorGraph(result.parsed, layout.molecule, requireCanonicalDescriptor)
  ) {
    return {
      ok: false,
      error: "No fue posible reconstruir de forma coherente el grafo del policiclo indicado.",
      inputFamily: "fused-von-baeyer",
    };
  }
  const derivativeError = applyFusedDerivative(
    result.parsed,
    layout.molecule,
    layout.atomIdByLocant,
  );
  if (derivativeError) {
    return { ok: false, error: derivativeError, inputFamily: "fused-von-baeyer" };
  }
  return {
    ok: true,
    molecule: layout.molecule,
    normalizedInput: result.parsed.normalizedInput,
    enabledAliases: [],
    inputFamily: "fused-von-baeyer",
  };
}

function setUnsaturations(molecule: GeneratedMolecule, parent: ParentDescription) {
  const locantOrders = new Map<number, GeneratedBondOrder>();
  parent.doubleLocants.forEach((locant) => locantOrders.set(locant, 2));
  parent.tripleLocants.forEach((locant) => locantOrders.set(locant, 3));

  locantOrders.forEach((order, locant) => {
    const firstId = locant;
    const secondId = parent.kind === "ring" && locant === parent.size
      ? 1
      : locant + 1;
    const bondIndex = molecule.bonds.findIndex((bond) =>
      (bond[0] === firstId && bond[1] === secondId)
      || (bond[0] === secondId && bond[1] === firstId),
    );
    if (bondIndex >= 0) molecule.bonds[bondIndex] = [firstId, secondId, order];
  });
}

type BranchTemplate = {
  atoms: Array<{ x: number; y: number; element?: GeneratedAtom["element"] }>;
  connections: Array<readonly [number, number, GeneratedBondOrder?]>;
};

function branchTemplate(kind: SubstituentKind): BranchTemplate {
  if (kind.kind === "linear") {
    return {
      atoms: Array.from({ length: kind.length }, (_, index) => ({ x: 0, y: index + 1 })),
      connections: Array.from({ length: kind.length }, (_, index) => [index - 1, index] as const),
    };
  }
  if (kind.kind === "vinyl") {
    return {
      atoms: [{ x: 0, y: 1 }, { x: 0, y: 2 }],
      connections: [[-1, 0, 1], [0, 1, 2]] as const,
    };
  }
  if (kind.kind === "halogen") {
    return {
      atoms: [{ x: 0, y: 1, element: kind.element }],
      connections: [[-1, 0]] as const,
    };
  }
  if (kind.kind === "structured") return kind;
  if (kind.kind === "isopropyl") {
    return {
      atoms: [{ x: 0, y: 1 }, { x: -0.75, y: 2 }, { x: 0.75, y: 2 }],
      connections: [[-1, 0], [0, 1], [0, 2]] as const,
    };
  }
  if (kind.kind === "isobutyl") {
    return {
      atoms: [
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: -0.75, y: 3 },
        { x: 0.75, y: 3 },
      ],
      connections: [[-1, 0], [0, 1], [1, 2], [1, 3]] as const,
    };
  }
  if (kind.kind === "sec-butyl") {
    return {
      atoms: [
        { x: 0, y: 1 },
        { x: -0.8, y: 2 },
        { x: 0.8, y: 2 },
        { x: 0.8, y: 3 },
      ],
      connections: [[-1, 0], [0, 1], [0, 2], [2, 3]] as const,
    };
  }
  return {
    atoms: [
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: -0.85, y: 1.8 },
      { x: 0.85, y: 1.8 },
    ],
    connections: [[-1, 0], [0, 1], [0, 2], [0, 3]] as const,
  };
}

function attachSubstituent(
  molecule: GeneratedMolecule,
  parent: ParentDescription,
  substitution: Substitution,
  slot: number,
) {
  const anchor = molecule.atoms.find((atom) => atom.id === substitution.locant);
  if (!anchor) return;
  const template = branchTemplate(substitution.substituent);
  const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;

  let outwardX = 0;
  let outwardY = slot % 2 === 0 ? -1 : 1;
  if (parent.kind !== "chain") {
    const length = Math.hypot(anchor.x, anchor.y) || 1;
    outwardX = anchor.x / length;
    outwardY = anchor.y / length;
  }
  if (slot >= 2) {
    const rotation = slot % 2 === 0 ? -0.5 : 0.5;
    const nextX = outwardX * Math.cos(rotation) - outwardY * Math.sin(rotation);
    const nextY = outwardX * Math.sin(rotation) + outwardY * Math.cos(rotation);
    outwardX = nextX;
    outwardY = nextY;
  }

  const perpendicularX = -outwardY;
  const perpendicularY = outwardX;
  const atoms = template.atoms.map((point, index) => ({
    id: firstId + index,
    x: anchor.x + outwardX * point.y + perpendicularX * point.x,
    y: anchor.y + outwardY * point.y + perpendicularY * point.x,
    ...(point.element ? { element: point.element } : {}),
  }));
  molecule.atoms.push(...atoms);
  template.connections.forEach(([from, to, order = 1]) => {
    molecule.bonds.push([
      from === -1 ? anchor.id : firstId + from,
      firstId + to,
      order,
    ]);
  });
}

function graphForParsedName(parsed: ParsedName): GeneratedMolecule {
  if (parsed.prebuiltMolecule) return parsed.prebuiltMolecule;

  const molecule = parsed.parent.kind === "chain"
    ? makeChain(parsed.parent.size)
    : makeRing(
      parsed.parent.size,
      parsed.parent.kind === "benzene" ? "aromatic" : "cycloalkane",
    );

  if (parsed.parent.kind !== "benzene") setUnsaturations(molecule, parsed.parent);

  const slotsByLocant = new Map<number, number>();
  parsed.substitutions.forEach((substitution) => {
    const slot = slotsByLocant.get(substitution.locant) ?? 0;
    attachSubstituent(molecule, parsed.parent, substitution, slot);
    slotsByLocant.set(substitution.locant, slot + 1);
  });
  return molecule;
}

function validateParsedName(parsed: ParsedName, molecule: GeneratedMolecule) {
  const { parent } = parsed;
  if (parent.kind === "chain" && parent.size < 1) return "La cadena principal no es válida.";
  if (parent.kind === "ring" && parent.size < 3) return "Un ciclo necesita al menos tres carbonos.";

  const unsaturationLocants = [...parent.doubleLocants, ...parent.tripleLocants];
  const maximumBondLocant = parent.kind === "ring" ? parent.size : parent.size - 1;
  if (unsaturationLocants.some((locant) => locant < 1 || locant > maximumBondLocant)) {
    return `Una insaturación debe ubicarse entre 1 y ${maximumBondLocant}.`;
  }
  if (new Set(unsaturationLocants).size !== unsaturationLocants.length) {
    return "Un mismo enlace no puede ser doble y triple a la vez.";
  }
  if (parsed.substitutions.some(({ locant }) => locant < 1 || locant > parent.size)) {
    return `Los sustituyentes deben ubicarse entre los carbonos 1 y ${parent.size}.`;
  }

  const valenceByAtom = new Map<number, number>();
  molecule.bonds.forEach(([left, right, order = 1]) => {
    valenceByAtom.set(left, (valenceByAtom.get(left) ?? 0) + order);
    valenceByAtom.set(right, (valenceByAtom.get(right) ?? 0) + order);
  });
  if ([...valenceByAtom.values()].some((valence) => valence > 4)) {
    return "La combinación indicada supera la valencia 4 de uno de los carbonos.";
  }

  return null;
}

export function buildHydrocarbonFromIupacName(value: string): NameBuildResult {
  const normalizedInput = normalizeName(value);
  if (!normalizedInput) {
    return { ok: false, error: "Escribe un nombre, por ejemplo: 3-etil-2-metilhexano." };
  }

  const fusedParent = buildFusedVonBaeyerParent(normalizedInput);
  if (fusedParent) return fusedParent;

  const parsed = parseAlcoholName(normalizedInput)
    ?? parseAldehydeName(normalizedInput)
    ?? parseKetoneName(normalizedInput)
    ?? parseCarboxylicAcidName(normalizedInput)
    ?? parseHydrocarbonName(normalizedInput);
  if (!parsed) {
    return {
      ok: false,
      error: "No pude interpretar la cadena, el ciclo o sus grupos funcionales. Prueba con hex-2-eno, 3-etil-2-metilhexano, propan-2-ol o benceno-1,3,5-triol.",
    };
  }

  const molecule = graphForParsedName(parsed);
  const validationError = validateParsedName(parsed, molecule);
  if (validationError) return { ok: false, error: validationError };

  return {
    ok: true,
    molecule,
    normalizedInput: parsed.normalizedInput,
    enabledAliases: parsed.enabledAliases,
  };
}
