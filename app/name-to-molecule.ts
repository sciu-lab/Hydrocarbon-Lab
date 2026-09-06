import { IUPAC_ROOT_ALIASES, IUPAC_ROOTS } from "./iupac-prefixes.ts";
import { normalizeTraditionalUnsaturationNotation } from "./iupac-name-normalization.ts";

export type GeneratedBondOrder = 1 | 2 | 3;

export type GeneratedBond = [number, number, GeneratedBondOrder?];

export type GeneratedAtom = {
  id: number;
  x: number;
  y: number;
  element?: "C" | "O" | "N" | "F" | "Cl" | "Br" | "I";
  charge?: number;
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
  | { kind: "halogen"; element: "F" | "Cl" | "Br" | "I" }
  | {
      kind: "structured";
      atoms: Array<{ x: number; y: number; element?: GeneratedAtom["element"] }>;
      connections: Array<readonly [number, number]>;
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
    }
  | {
      ok: false;
      error: string;
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
  const normalized = value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "")
    .replace(/\.+$/g, "")
    .replace(/--+/g, "-")
    .replace(/\(?(?:propan-2-il|1-metiletil)\)?/g, "isopropil")
    .replace(/\(?2-metilpropil\)?/g, "isobutil")
    .replace(/\(?(?:butan-2-il|1-metilpropil)\)?/g, "sec-butil")
    .replace(/\(?1,1-dimetiletil\)?/g, "terc-butil");
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

function branchTemplate(kind: SubstituentKind) {
  if (kind.kind === "linear") {
    return {
      atoms: Array.from({ length: kind.length }, (_, index) => ({ x: 0, y: index + 1 })),
      connections: Array.from({ length: kind.length }, (_, index) => [index - 1, index] as const),
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
  template.connections.forEach(([from, to]) => {
    molecule.bonds.push([
      from === -1 ? anchor.id : firstId + from,
      firstId + to,
      1,
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
