import { iupacRootForCarbonCount } from "./iupac-prefixes.ts";

export type TraditionalGroupType =
  | "acid"
  | "ester"
  | "amide"
  | "nitrile"
  | "aldehyde"
  | "ketone"
  | "alcohol"
  | "amine"
  | "ether"
  | "alkene"
  | "alkyne"
  | "halide"
  | "nitro"
  | "alkane";

export type TraditionalFunctionalGroup = {
  pos: number;
  type: TraditionalGroupType | string;
  name?: string;
  alkylNames?: string[];
};

export type TraditionalSubstituent = {
  pos: number;
  name: string;
  complex?: boolean;
};

/**
 * Structure-only input for the traditional nomenclature engine.
 *
 * `carbonCount` retains the requested total molecular carbon count.
 * `parentCarbonCount` identifies the selected parent chain when the molecule
 * is branched; it falls back to `carbonCount` for the compact input contract.
 * The optional fields allow mixed unsaturation, rings and stereochemical
 * display information to be represented losslessly.
 */
export interface MoleculeStructure {
  carbonCount: number;
  parentCarbonCount?: number;
  bondType: "simple" | "doble" | "triple";
  bondPositions: number[];
  groups: TraditionalFunctionalGroup[];
  mainChain: string;
  substituents: TraditionalSubstituent[];
  doubleBondPositions?: number[];
  tripleBondPositions?: number[];
  family?: "acyclic" | "cycloalkane" | "aromatic" | "polycyclic" | "heterocycle";
  sourceName?: string;
  hasBranches?: boolean;
  stereochemicalPrefix?: string;
  /** Structural prefixes with non-carbon locants, for example N-metil. */
  prefixes?: string[];
}

const GROUP_ALIASES: Readonly<Record<string, TraditionalGroupType>> = {
  acid: "acid",
  acidocarboxilico: "acid",
  carboxylicacid: "acid",
  ester: "ester",
  amide: "amide",
  amida: "amide",
  nitrile: "nitrile",
  nitrilo: "nitrile",
  aldehyde: "aldehyde",
  aldehido: "aldehyde",
  ketone: "ketone",
  cetona: "ketone",
  alcohol: "alcohol",
  amine: "amine",
  amina: "amine",
  ether: "ether",
  eter: "ether",
  alkene: "alkene",
  alqueno: "alkene",
  alkyne: "alkyne",
  alquino: "alkyne",
  halide: "halide",
  halogenuro: "halide",
  halogen: "halide",
  nitro: "nitro",
  alkane: "alkane",
  alcano: "alkane",
};

const PRIORITY: readonly TraditionalGroupType[] = [
  "acid",
  "ester",
  // These two families are supported by the structural editor as well. They
  // sit in their established IUPAC order without changing the requested order
  // of acid > ester > aldehyde > ketone > alcohol > amine.
  "amide",
  "nitrile",
  "aldehyde",
  "ketone",
  "alcohol",
  "amine",
  "ether",
  "alkene",
  "alkyne",
  "halide",
  "nitro",
  "alkane",
];

const SIMPLE_MULTIPLIERS = [
  "",
  "",
  "di",
  "tri",
  "tetra",
  "penta",
  "hexa",
  "hepta",
  "octa",
  "nona",
  "deca",
] as const;

const COMPLEX_MULTIPLIERS = [
  "",
  "",
  "bis",
  "tris",
  "tetrakis",
  "pentakis",
  "hexakis",
] as const;

function normalizedKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]/g, "")
    .toLocaleLowerCase("es");
}

function normalizeGroupType(value: string): TraditionalGroupType | undefined {
  return GROUP_ALIASES[normalizedKey(value)];
}

function sortedUniquePositions(positions: readonly number[]) {
  return [...new Set(positions)]
    .filter((position) => Number.isInteger(position) && position > 0)
    .sort((left, right) => left - right);
}

function sortedPositions(positions: readonly number[]) {
  return [...positions]
    .filter((position) => Number.isInteger(position) && position > 0)
    .sort((left, right) => left - right);
}

function groupsOfType(structure: MoleculeStructure, type: TraditionalGroupType) {
  return structure.groups.filter((group) => normalizeGroupType(group.type) === type);
}

function groupPositions(structure: MoleculeStructure, type: TraditionalGroupType) {
  return sortedPositions(groupsOfType(structure, type).map((group) => group.pos));
}

function doubleBondPositions(structure: MoleculeStructure) {
  if (structure.doubleBondPositions) return sortedUniquePositions(structure.doubleBondPositions);
  return structure.bondType === "doble" ? sortedUniquePositions(structure.bondPositions) : [];
}

function tripleBondPositions(structure: MoleculeStructure) {
  if (structure.tripleBondPositions) return sortedUniquePositions(structure.tripleBondPositions);
  return structure.bondType === "triple" ? sortedUniquePositions(structure.bondPositions) : [];
}

function hasUnsaturation(structure: MoleculeStructure) {
  return doubleBondPositions(structure).length > 0 || tripleBondPositions(structure).length > 0;
}

function selectedParentCarbonCount(structure: MoleculeStructure) {
  return structure.parentCarbonCount ?? structure.carbonCount;
}

function parentRoot(structure: MoleculeStructure) {
  return iupacRootForCarbonCount(selectedParentCarbonCount(structure));
}

export function getMultiplier(count: number) {
  return SIMPLE_MULTIPLIERS[count] || `${count}`;
}

function unsaturatedStem(structure: MoleculeStructure) {
  const root = parentRoot(structure);
  if (!root) return undefined;

  const doubleLocants = doubleBondPositions(structure);
  const tripleLocants = tripleBondPositions(structure);
  if (!doubleLocants.length && !tripleLocants.length) return `${root}an`;

  if (doubleLocants.length && !tripleLocants.length) {
    if (doubleLocants.length === 1) return `${doubleLocants[0]}-${root}en`;
    return `${doubleLocants.join(",")}-${root}a${getMultiplier(doubleLocants.length)}en`;
  }

  if (tripleLocants.length && !doubleLocants.length) {
    if (tripleLocants.length === 1) return `${tripleLocants[0]}-${root}in`;
    return `${tripleLocants.join(",")}-${root}a${getMultiplier(tripleLocants.length)}in`;
  }

  const alkenePart = doubleLocants.length === 1
    ? `${doubleLocants[0]}-${root}en`
    : `${doubleLocants.join(",")}-${root}a${getMultiplier(doubleLocants.length)}en`;
  const alkynePart = tripleLocants.length === 1
    ? `${tripleLocants[0]}-in`
    : `${tripleLocants.join(",")}-${getMultiplier(tripleLocants.length)}in`;
  return `${alkenePart}-${alkynePart}`;
}

function hydrocarbonName(structure: MoleculeStructure) {
  const root = parentRoot(structure);
  const stem = unsaturatedStem(structure);
  if (!root || !stem) return structure.mainChain || structure.sourceName || "molécula";
  if (!hasUnsaturation(structure)) return `${root}ano`;

  const doubleLocants = doubleBondPositions(structure);
  const tripleLocants = tripleBondPositions(structure);
  if (doubleLocants.length === 1 && !tripleLocants.length && selectedParentCarbonCount(structure) === 2) {
    return `${root}eno`;
  }
  if (tripleLocants.length === 1 && !doubleLocants.length && selectedParentCarbonCount(structure) === 2) {
    return `${root}ino`;
  }
  return `${stem}o`;
}

function formatAlkylNames(names: readonly string[]) {
  const cleanNames = names.map((name) => name.trim()).filter(Boolean);
  if (!cleanNames.length) return "alquilo";
  const counts = new Map<string, number>();
  cleanNames.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return [...counts.entries()]
    .sort(([left], [right]) => compareAlphabetically(left, right))
    .map(([name, count]) => count === 1 ? name : `${getMultiplier(count)}${name}`)
    .join(" y ");
}

function etherName(groups: readonly TraditionalFunctionalGroup[]) {
  const names = groups.flatMap((group) => group.alkylNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (names.length !== 2) return undefined;
  if (names[0] === names[1]) return `${getMultiplier(2)}${names[0]} éter`;
  return `${[...names].sort(compareAlphabetically).join(" ")} éter`;
}

/** Returns the highest-priority structural feature without consulting OPSIN. */
export function getPriorityGroup(structure: MoleculeStructure): TraditionalGroupType {
  const present = new Set(
    structure.groups
      .map((group) => normalizeGroupType(group.type))
      .filter((type): type is TraditionalGroupType => Boolean(type)),
  );
  if (doubleBondPositions(structure).length) present.add("alkene");
  if (tripleBondPositions(structure).length) present.add("alkyne");
  present.add("alkane");
  return PRIORITY.find((type) => present.has(type)) ?? "alkane";
}

/** Builds the locant-free parent; traditional locants are added separately. */
export function buildBaseName(structure: MoleculeStructure, priorityGroup = getPriorityGroup(structure)) {
  const root = parentRoot(structure);
  const stem = unsaturatedStem(structure);
  if (!root || !stem) return structure.mainChain || structure.sourceName || "molécula";

  const positions = groupPositions(structure, priorityGroup);
  const count = Math.max(positions.length, 1);
  const multiplier = getMultiplier(count);

  if (priorityGroup === "acid") {
    return count === 1 ? `ácido ${stem}oico` : `ácido ${stem}o${multiplier}oico`;
  }
  if (priorityGroup === "ester") {
    const alkylNames = groupsOfType(structure, "ester").flatMap((group) => group.alkylNames ?? []);
    const parent = count === 1 ? `${stem}oato` : `${stem}o${multiplier}oato`;
    return `${parent} de ${formatAlkylNames(alkylNames)}`;
  }
  if (priorityGroup === "amide") {
    return count === 1 ? `${stem}amida` : `${stem}o${multiplier}amida`;
  }
  if (priorityGroup === "nitrile") {
    return count === 1 ? `${stem}onitrilo` : `${stem}o${multiplier}nitrilo`;
  }
  if (priorityGroup === "aldehyde") {
    return count === 1 ? `${stem}al` : `${stem}o${multiplier}al`;
  }
  if (priorityGroup === "ketone") {
    return count === 1 ? `${stem}ona` : `${stem}o${multiplier}ona`;
  }
  if (priorityGroup === "alcohol") {
    return count === 1 ? `${stem}ol` : `${stem}o${multiplier}ol`;
  }
  if (priorityGroup === "amine") {
    return count === 1 ? `${stem}amina` : `${stem}o${multiplier}amina`;
  }
  if (priorityGroup === "ether") {
    return etherName(groupsOfType(structure, "ether")) ?? structure.sourceName ?? structure.mainChain;
  }
  return hydrocarbonName(structure);
}

function stripForAlphabetizing(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^(?:(?:\d+(?:,\d+)*|n(?:,n)*)-)+/, "")
    .replace(/[0-9,()\-]/g, "")
    .replace(/^(?:di|tri|tetra|penta|hexa|hepta|octa|nona|deca|bis|tris|tetrakis|pentakis|hexakis)/, "")
    .replace(/^(?:sec|terc|tert)/, "");
}

function compareAlphabetically(left: string, right: string) {
  const normalized = stripForAlphabetizing(left).localeCompare(
    stripForAlphabetizing(right),
    "es",
    { sensitivity: "base" },
  );
  return normalized || left.localeCompare(right, "es", { sensitivity: "base" });
}

function unwrapParentheses(name: string) {
  const trimmed = name.trim();
  return trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
}

function formattedSubstituentParts(substituents: readonly TraditionalSubstituent[]) {
  const groups = new Map<string, TraditionalSubstituent[]>();
  substituents.forEach((substituent) => {
    const explicitlyParenthesized = /^\(.+\)$/.test(substituent.name.trim());
    const name = unwrapParentheses(substituent.name);
    if (!name || !Number.isInteger(substituent.pos) || substituent.pos <= 0) return;
    const complex = Boolean(substituent.complex || explicitlyParenthesized);
    const key = `${complex ? "complex" : "simple"}:${name}`;
    const current = groups.get(key) ?? [];
    current.push({ ...substituent, name, complex });
    groups.set(key, current);
  });

  return [...groups.values()]
    .sort((left, right) => compareAlphabetically(left[0].name, right[0].name))
    .map((group) => {
      const positions = sortedPositions(group.map((item) => item.pos)).join(",");
      const name = group[0].name;
      const complex = Boolean(group[0].complex || /^\(.+\)$/.test(group[0].name));
      if (group.length === 1) return complex ? `${positions}-(${name})` : `${positions}-${name}`;
      if (complex) {
        const multiplier = COMPLEX_MULTIPLIERS[group.length] || `${group.length}×`;
        return `${positions}-${multiplier}(${name})`;
      }
      return `${positions}-${getMultiplier(group.length)}${name}`;
    });
}

/** Adds grouped, alphabetized substituents without mutating the input array. */
export function addSubstituents(nombre: string, substituents: readonly TraditionalSubstituent[]) {
  const parts = formattedSubstituentParts(substituents);
  return addPrefixParts(nombre, parts);
}

function addPrefixParts(nombre: string, parts: readonly string[]) {
  if (!parts.length) return nombre;
  const prefix = [...parts].sort(compareAlphabetically).join("-");
  const combine = (parent: string) => `${prefix}${/^\d/.test(parent) ? "-" : ""}${parent}`;
  return nombre.startsWith("ácido ")
    ? `ácido ${combine(nombre.slice("ácido ".length))}`
    : combine(nombre);
}

function insertBeforeSuffix(nombre: string, positions: readonly number[], suffix: string) {
  if (!positions.length || !nombre.endsWith(suffix)) return nombre;
  return `${nombre.slice(0, -suffix.length)}-${positions.join(",")}-${suffix}`;
}

/** Places suffix-group locants according to the requested pre-2013 style. */
export function placeTraditionalLocators(nombre: string, structure: MoleculeStructure) {
  const priorityGroup = getPriorityGroup(structure);
  const positions = groupPositions(structure, priorityGroup);
  if (!positions.length) return nombre;

  // Their C1 position is inherent in the suffix.
  if (priorityGroup === "acid" || priorityGroup === "ester" || priorityGroup === "aldehyde") {
    return nombre;
  }

  if (priorityGroup === "alcohol") {
    if (positions.length === 1 && positions[0] === 1) {
      // A branched primary alcohol keeps the unambiguous PIN-style -1- locant;
      // an unbranched one uses the traditional implicit C1 form.
      return structure.hasBranches ? insertBeforeSuffix(nombre, positions, "ol") : nombre;
    }
    if (positions.length > 1) {
      return hasUnsaturation(structure)
        ? insertBeforeSuffix(nombre, positions, `${getMultiplier(positions.length)}ol`)
        : `${positions.join(",")}-${nombre}`;
    }
    return hasUnsaturation(structure)
      ? insertBeforeSuffix(nombre, positions, "ol")
      : `${positions[0]}-${nombre}`;
  }

  if (priorityGroup === "ketone") {
    if (
      positions.length === 1
      && positions[0] === 2
      && selectedParentCarbonCount(structure) === 3
      && !hasUnsaturation(structure)
    ) {
      return nombre;
    }
    if (positions.length > 1) {
      return hasUnsaturation(structure)
        ? insertBeforeSuffix(nombre, positions, `${getMultiplier(positions.length)}ona`)
        : `${positions.join(",")}-${nombre}`;
    }
    return hasUnsaturation(structure)
      ? insertBeforeSuffix(nombre, positions, "ona")
      : `${positions[0]}-${nombre}`;
  }

  if (priorityGroup === "amine") {
    if (
      positions.length === 1
      && positions[0] === 1
      && selectedParentCarbonCount(structure) <= 2
      && !structure.hasBranches
      && !hasUnsaturation(structure)
    ) {
      return nombre;
    }
    if (positions.length > 1) {
      return hasUnsaturation(structure)
        ? insertBeforeSuffix(nombre, positions, `${getMultiplier(positions.length)}amina`)
        : `${positions.join(",")}-${nombre}`;
    }
    return hasUnsaturation(structure)
      ? insertBeforeSuffix(nombre, positions, "amina")
      : `${positions[0]}-${nombre}`;
  }

  if (priorityGroup === "amide" || priorityGroup === "nitrile") return nombre;
  return nombre;
}

/** Applies small output invariants after all structural parts have been placed. */
export function applyTraditionalRules(nombre: string) {
  return nombre
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/\s+-|-(?=\s)/g, "-")
    .trim()
    .replace(/^-|-$/g, "");
}

function withStereochemicalPrefix(nombre: string, prefix: string | undefined) {
  const cleanPrefix = prefix?.trim();
  if (!cleanPrefix) return nombre;
  const normalizedPrefix = cleanPrefix.endsWith("-") ? cleanPrefix : `${cleanPrefix}-`;
  return nombre.startsWith("ácido ")
    ? `ácido ${normalizedPrefix}${nombre.slice("ácido ".length)}`
    : `${normalizedPrefix}${nombre}`;
}

/**
 * Generates the Spanish traditional systematic name from molecular structure.
 * This module has no OPSIN or OpenChemLib dependency and never makes network
 * calls. Unsupported cyclic parents fall back to the structure analyzer's
 * local parent/name instead of displaying a dash.
 */
export function generarNombreTradicional(structure: MoleculeStructure) {
  const parentCarbonCount = selectedParentCarbonCount(structure);
  if (!Number.isInteger(parentCarbonCount) || parentCarbonCount < 1) {
    return applyTraditionalRules(structure.sourceName || structure.mainChain || "molécula");
  }

  if (structure.family && structure.family !== "acyclic") {
    return withStereochemicalPrefix(
      applyTraditionalRules(structure.sourceName || structure.mainChain || "molécula"),
      structure.stereochemicalPrefix,
    );
  }

  const priorityGroup = getPriorityGroup(structure);
  const baseName = buildBaseName(structure, priorityGroup);
  const withLocants = placeTraditionalLocators(baseName, structure);
  const withSubstituents = addPrefixParts(withLocants, [
    ...formattedSubstituentParts(structure.substituents),
    ...(structure.prefixes ?? []).map((prefix) => prefix.trim()).filter(Boolean),
  ]);
  return withStereochemicalPrefix(applyTraditionalRules(withSubstituents), structure.stereochemicalPrefix);
}

export function generateAllNames(
  structure: MoleculeStructure,
  iupacModern: string,
  commonName?: string,
) {
  return {
    iupacModern,
    traditional: generarNombreTradicional(structure),
    common: commonName ?? "-",
  };
}
