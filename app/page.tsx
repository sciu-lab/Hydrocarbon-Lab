"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildHydrocarbonFromIupacName } from "./name-to-molecule";
import { IUPAC_ROOTS } from "./iupac-prefixes";
import { translateSpanishIupacToOpsin } from "./iupac-name-normalization";
import {
  type AppLanguage,
  detectInitialLanguage,
  dynamicUiText,
  englishReasoningTitle,
  LANGUAGE_STORAGE_KEY,
  languagePath,
  pageMetadata,
  translateCommonName,
  uiText,
} from "./i18n";
import {
  type NameStructureResolution,
  resolveNameWithOpsin,
} from "./opsin-name-resolver";
import {
  formatStereochemicalName,
  getMainChainStereoDescriptors,
  isDoubleBondEZToggleAvailable,
  inspectDoubleBondStereochemistry,
  toggleDoubleBondGeometry,
} from "./double-bond-stereochemistry";
import {
  canToggleBondStereochemistry,
  getBondInteractionHintActions,
  getVisibleBondInteractionHintActions,
} from "./bond-interaction-hints";
import {
  applyNomenclatureConvention,
  type NomenclatureConvention,
  nextNomenclatureConvention,
  nomenclatureConventionLabel,
  stripStereochemicalDescriptors,
} from "./nomenclature-conventions";
import {
  findCommonNameSuggestion,
  type CommonNameSuggestion,
} from "./name-suggestions";
import {
  clipSkeletalParallelBondSegments,
  clipSkeletalRingDoubleBondSegments,
  getSkeletalRingNumberBadgeOffset,
  getSkeletalRingDoubleBondSegments,
  SKELETAL_NUMBER_BADGE_CLEARANCE,
  SKELETAL_NUMBER_BADGE_OFFSET,
} from "./skeletal-bond-geometry";
import { buildOpenChainSkeletalPositions } from "./skeletal-layout";
import { flipCoordinates } from "./coordinate-flip";
import { readSmilesFileRecord } from "./smiles-file";

type CarbonAtom = {
  id: number;
  x: number;
  y: number;
  element?: ChemicalElement;
  charge?: number;
};

type ChemicalElement = "C" | "O" | "N" | "F" | "Cl" | "Br" | "I";

type BondOrder = 1 | 2 | 3;

type Bond = [number, number, BondOrder?];

type RingKind = "cycloalkane" | "aromatic";

type RingInfo = {
  id: number;
  kind: RingKind;
  atomIds: number[];
};

type Molecule = {
  atoms: CarbonAtom[];
  bonds: Bond[];
  rings?: RingInfo[];
  /** UI-only orientation for display-only skeletal coordinates. */
  isMirrored?: boolean;
};

type HistoryEntry = {
  id: string;
  name: string;
  formula: string;
  family: string;
  molecule: Molecule;
  viewMode: ViewMode;
  atomCount: number;
  createdAt: string;
  updatedAt: string;
};

type PortableStructure = Omit<HistoryEntry, "id">;

type ChemistryDocument = {
  format: "laboratorio-quimica-organica";
  version: 1;
  kind: "structure" | "library";
  exportedAt: string;
  structure?: PortableStructure;
  structures?: PortableStructure[];
};

type HistoryTransferNotice = {
  kind: "success" | "error";
  message: string;
};

type NameBuilderFeedback = {
  kind: "success" | "error";
  message: string;
};

type HistoryScope = "account" | "device";
type HistorySyncState = "loading" | "saved" | "saving" | "error";
type LibrarySection = "history" | "saved";

type ViewMode = "condensed" | "skeletal";
type ThemePreference = "auto" | "light" | "dark";
type RingInsertMode = "replace" | "attach";

type FunctionalGroupKind =
  | "halogen"
  | "alcohol"
  | "ether"
  | "aldehyde"
  | "ketone"
  | "carboxylicAcid"
  | "ester"
  | "amine"
  | "amide"
  | "nitrile"
  | "nitro";

type FunctionalGroup = {
  id: string;
  kind: FunctionalGroupKind;
  label: string;
  atomIds: number[];
  carbonIds: number[];
  carbonId: number;
  heteroAtomId: number;
  alkylCarbonId?: number;
};

type FunctionalGroupTemplate = {
  id: string;
  label: string;
  shortFormula: string;
  category: "oxygen" | "nitrogen" | "halogen";
  detail: string;
  kind: FunctionalGroupKind;
  atoms: { element: ChemicalElement; x: number; y: number; charge?: number }[];
  bonds: [number, number, BondOrder][];
  requirement: "open" | "terminal-carbon" | "internal-carbon";
};

type AlkylTemplate = {
  id: string;
  label: string;
  systematic: string;
  formula: string;
  atoms: { x: number; y: number }[];
  connections: [number, number][];
};

type RingTemplate = {
  id: string;
  label: string;
  formula: string;
  detail: string;
  size: number;
  kind: RingKind;
  molecule: Molecule;
};

type NamedSubstituent = {
  locant: number;
  name: string;
  sortName: string;
  complex: boolean;
  atomIds: number[];
};

type Analysis = {
  name: string;
  commonName?: string;
  formula: string;
  family: "acyclic" | RingKind | "polycyclic";
  mainChain: number[];
  chainName: string;
  substituents: NamedSubstituent[];
  numberedAtoms: Map<number, number>;
  doubleBondLocants: number[];
  tripleBondLocants: number[];
  functionalGroups: FunctionalGroup[];
  primaryFunctionalGroup?: FunctionalGroupKind;
  primaryFunctionalLabel?: string;
};

export type IupacReasoningStep = {
  number: "01" | "02" | "03" | "04" | "05" | "06";
  title: string;
  explanation: string;
};

const alkaneRoots = IUPAC_ROOTS;
const alkylNames = IUPAC_ROOTS.map((root) => root ? `${root}il` : "");

const simplePrefixes = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa"];
const complexPrefixes = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis"];

const commonAlkylAliases = {
  "1-metiletil": "isopropil",
  "2-metilpropil": "isobutil",
  "1-metilpropil": "sec-butil",
  "1,1-dimetiletil": "terc-butil",
} as const;

type AlkylAliasKey = keyof typeof commonAlkylAliases;

const subscriptDigits: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

const toSubscript = (value: number) =>
  String(value)
    .split("")
    .map((digit) => subscriptDigits[digit])
    .join("");

const getBondOrder = (bond: Bond): BondOrder => bond[2] ?? 1;

const getBondOrderLabel = (order: BondOrder) =>
  order === 1 ? "simple" : order === 2 ? "doble" : "triple";

const bondKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const getElement = (atom: CarbonAtom): ChemicalElement => atom.element ?? "C";

const elementValences: Record<ChemicalElement, number> = {
  C: 4,
  O: 2,
  N: 3,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
};

const elementNames: Record<ChemicalElement, string> = {
  C: "carbono",
  O: "oxígeno",
  N: "nitrógeno",
  F: "flúor",
  Cl: "cloro",
  Br: "bromo",
  I: "yodo",
};

const getAtom = (atomId: number, molecule: Molecule) =>
  molecule.atoms.find((atom) => atom.id === atomId);

const getValenceLimit = (atomId: number, molecule: Molecule) => {
  const atom = getAtom(atomId, molecule);
  if (!atom) return 0;
  const element = getElement(atom);
  const charge = atom.charge ?? 0;
  if (element === "N" && charge === 1) return 4;
  if (element === "O" && charge === -1) return 1;
  return elementValences[element];
};

const getValenceUsed = (atomId: number, molecule: Molecule) =>
  molecule.bonds.reduce(
    (total, bond) => total + (bond[0] === atomId || bond[1] === atomId ? getBondOrder(bond) : 0),
    0,
  );

export type ValenceViolation = {
  atomId: number;
  element: ChemicalElement;
  current: number;
  attempted: number;
  limit: number;
};

export function getAtomValenceViolation(
  molecule: Molecule,
  atomId: number,
  addedValence: number,
): ValenceViolation | null {
  const atom = getAtom(atomId, molecule);
  if (!atom) return null;
  const element = getElement(atom);
  const current = getValenceUsed(atomId, molecule);
  const limit = getValenceLimit(atomId, molecule);
  const attempted = current + addedValence;
  return attempted > limit
    ? { atomId, element, current, attempted, limit }
    : null;
}

export function findBondValenceViolation(
  molecule: Molecule,
  a: number,
  b: number,
  nextOrder: BondOrder,
  currentOrder: BondOrder | 0 = 0,
): ValenceViolation | null {
  const addedValence = nextOrder - currentOrder;
  if (addedValence <= 0) return null;
  return getAtomValenceViolation(molecule, a, addedValence)
    ?? getAtomValenceViolation(molecule, b, addedValence);
}

export function findMoleculeValenceViolation(molecule: Molecule): ValenceViolation | null {
  for (const atom of molecule.atoms) {
    const current = getValenceUsed(atom.id, molecule);
    const element = getElement(atom);
    const limit = getValenceLimit(atom.id, molecule);
    if (current > limit) {
      return { atomId: atom.id, element, current, attempted: current, limit };
    }
  }
  return null;
}

const titleCaseElement = (element: ChemicalElement) => {
  const label = elementNames[element];
  return `${label[0].toUpperCase()}${label.slice(1)}`;
};

export function formatBondValenceError(
  order: BondOrder,
  violation: ValenceViolation,
) {
  const atomLabel = `${titleCaseElement(violation.element)} ${violation.atomId}`;
  if (violation.current >= violation.limit) {
    return `No se puede añadir un enlace ${getBondOrderLabel(order)} en el ${atomLabel} porque ya tiene ${violation.current} enlaces.`;
  }
  return `No se puede añadir un enlace ${getBondOrderLabel(order)} en el ${atomLabel} porque alcanzaría ${violation.attempted} enlaces y su máximo es ${violation.limit}.`;
}

export function findDirectionalNeighborId(
  molecule: Molecule,
  atomId: number,
  dx: number,
  dy: number,
) {
  const atom = getAtom(atomId, molecule);
  if (!atom) return null;
  const length = Math.hypot(dx, dy) || 1;
  const direction = { x: dx / length, y: dy / length };
  const candidates = atomNeighbors(atomId, molecule).flatMap((neighbor) => {
    const candidate = getAtom(neighbor.atomId, molecule);
    if (!candidate) return [];
    const deltaX = candidate.x - atom.x;
    const deltaY = candidate.y - atom.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const projection = deltaX * direction.x + deltaY * direction.y;
    if (projection <= 0.05) return [];
    return [{
      id: candidate.id,
      alignment: projection / distance,
      distance,
    }];
  });
  candidates.sort((left, right) =>
    right.alignment - left.alignment || left.distance - right.distance,
  );
  return candidates[0]?.id ?? null;
}

const getImplicitHydrogens = (atomId: number, molecule: Molecule) =>
  Math.max(0, getValenceLimit(atomId, molecule) - getValenceUsed(atomId, molecule));

const isCarbonAtom = (atom: CarbonAtom) => getElement(atom) === "C";

const makeChain = (length: number): Molecule => ({
  atoms: Array.from({ length }, (_, index) => ({ id: index + 1, x: index, y: 0 })),
  bonds: Array.from({ length: Math.max(0, length - 1) }, (_, index) => [index + 1, index + 2]),
});

function makeRing(size: number, kind: RingKind): Molecule {
  const atomIds = Array.from({ length: size }, (_, index) => index + 1);
  const atoms = atomIds.map((id, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / size;
    return {
      id,
      x: Math.cos(angle) * 1.35,
      y: Math.sin(angle) * 1.65,
    };
  });
  const bonds = atomIds.map((atomId, index) => {
    const nextId = atomIds[(index + 1) % size];
    const order: BondOrder = kind === "aromatic" && index % 2 === 0 ? 2 : 1;
    return [atomId, nextId, order] as Bond;
  });
  return { atoms, bonds, rings: [{ id: 1, kind, atomIds }] };
}

function makeSubstitutedRing(
  kind: RingKind,
  substitutions: { ringIndex: number; length: number }[],
): Molecule {
  const molecule = makeRing(6, kind);
  let nextId = 7;

  substitutions.forEach(({ ringIndex, length }) => {
    const ringAtom = molecule.atoms[ringIndex];
    let previousId = ringAtom.id;
    for (let index = 0; index < length; index += 1) {
      const scale = 1 + 0.65 * (index + 1);
      const atom = { id: nextId, x: ringAtom.x * scale, y: ringAtom.y * scale };
      molecule.atoms.push(atom);
      molecule.bonds.push([previousId, nextId, 1]);
      previousId = nextId;
      nextId += 1;
    }
  });

  return molecule;
}

function ringContainingAtom(molecule: Molecule, atomId: number) {
  return molecule.rings?.find((ring) => ring.atomIds.includes(atomId));
}

function attachRingToMolecule(
  molecule: Molecule,
  selectedId: number,
  size: number,
  kind: RingKind,
): { molecule: Molecule; attachmentId: number } | null {
  const selectedAtom = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selectedAtom || getValenceUsed(selectedId, molecule) >= 4) return null;

  const selectedScreen = { x: selectedAtom.x * 130, y: selectedAtom.y * 106 };
  const sourceRing = ringContainingAtom(molecule, selectedId);
  const referenceAtoms = sourceRing
    ? molecule.atoms.filter((atom) => sourceRing.atomIds.includes(atom.id))
    : molecule.atoms;
  const referenceCenter = referenceAtoms.reduce(
    (total, atom) => ({
      x: total.x + (atom.x * 130) / referenceAtoms.length,
      y: total.y + (atom.y * 106) / referenceAtoms.length,
    }),
    { x: 0, y: 0 },
  );
  const outwardLength = Math.hypot(
    selectedScreen.x - referenceCenter.x,
    selectedScreen.y - referenceCenter.y,
  ) || 1;
  const outward = {
    x: (selectedScreen.x - referenceCenter.x) / outwardLength,
    y: (selectedScreen.y - referenceCenter.y) / outwardLength,
  };
  const directions = [
    { x: 1, y: 0 },
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: 0, y: 1 },
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: -1, y: 0 },
    { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: 0, y: -1 },
    { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  ].sort(
    (left, right) => right.x * outward.x + right.y * outward.y - (left.x * outward.x + left.y * outward.y),
  );

  const occupied = molecule.atoms.map((atom) => ({ x: atom.x * 130, y: atom.y * 106 }));
  const radius = 175;
  const centerDistance = 285;
  let placement: { x: number; y: number }[] | null = null;

  for (const direction of directions) {
    const center = {
      x: selectedScreen.x + direction.x * centerDistance,
      y: selectedScreen.y + direction.y * centerDistance,
    };
    const facingAngle = Math.atan2(-direction.y, -direction.x);
    const candidate = Array.from({ length: size }, (_, index) => {
      const angle = facingAngle + (index * Math.PI * 2) / size;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
    const clear = candidate.every((point) =>
      occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= 78),
    );
    if (clear) {
      placement = candidate;
      break;
    }
  }

  if (!placement) return null;

  const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  const atomIds = placement.map((_, index) => firstId + index);
  const atoms = placement.map((point, index) => ({
    id: atomIds[index],
    x: point.x / 130,
    y: point.y / 106,
  }));
  const ringBonds = atomIds.map((atomId, index) => {
    const nextId = atomIds[(index + 1) % atomIds.length];
    const order: BondOrder = kind === "aromatic" && index % 2 === 0 ? 2 : 1;
    return [atomId, nextId, order] as Bond;
  });
  const ringId = Math.max(0, ...(molecule.rings ?? []).map((ring) => ring.id)) + 1;
  const next: Molecule = {
    ...molecule,
    atoms: [...molecule.atoms, ...atoms],
    bonds: [...molecule.bonds, ...ringBonds, [selectedId, atomIds[0], 1]],
    rings: [...(molecule.rings ?? []), { id: ringId, kind, atomIds }],
  };
  return { molecule: next, attachmentId: atomIds[0] };
}

function makeLinkedRings(firstKind: RingKind, secondKind: RingKind) {
  const first = makeRing(6, firstKind);
  const rightmost = [...first.atoms].sort((left, right) => right.x - left.x)[0];
  return attachRingToMolecule(first, rightmost.id, 6, secondKind)?.molecule ?? first;
}

function makeIsopropylOctane(): Molecule {
  const molecule = makeChain(8);
  molecule.atoms.push(
    { id: 9, x: 3, y: -1 },
    { id: 10, x: 2, y: -2 },
    { id: 11, x: 4, y: -2 },
  );
  molecule.bonds.push([4, 9], [9, 10], [9, 11]);
  return molecule;
}

const CYCLE_TEMPLATES: RingTemplate[] = [3, 4, 5, 6, 7, 8].map((size) => ({
  id: `cyclo-${size}`,
  label: `Ciclo${alkaneRoots[size]}ano`,
  formula: `C${toSubscript(size)}H${toSubscript(size * 2)}`,
  detail: `anillo de ${size} carbonos`,
  size,
  kind: "cycloalkane",
  molecule: makeRing(size, "cycloalkane"),
}));

const AROMATIC_TEMPLATES: RingTemplate[] = [
  {
    id: "benzene",
    label: "Benceno",
    formula: "C₆H₆",
    detail: "anillo aromático",
    size: 6,
    kind: "aromatic",
    molecule: makeRing(6, "aromatic"),
  },
  {
    id: "toluene",
    label: "Tolueno",
    formula: "C₇H₈",
    detail: "metilbenceno",
    size: 6,
    kind: "aromatic",
    molecule: makeSubstitutedRing("aromatic", [{ ringIndex: 0, length: 1 }]),
  },
  {
    id: "ethylbenzene",
    label: "Etilbenceno",
    formula: "C₈H₁₀",
    detail: "un sustituyente etil",
    size: 6,
    kind: "aromatic",
    molecule: makeSubstitutedRing("aromatic", [{ ringIndex: 0, length: 2 }]),
  },
  {
    id: "ortho-xylene",
    label: "o-Xileno",
    formula: "C₈H₁₀",
    detail: "1,2-dimetilbenceno",
    size: 6,
    kind: "aromatic",
    molecule: makeSubstitutedRing("aromatic", [
      { ringIndex: 0, length: 1 },
      { ringIndex: 1, length: 1 },
    ]),
  },
  {
    id: "meta-xylene",
    label: "m-Xileno",
    formula: "C₈H₁₀",
    detail: "1,3-dimetilbenceno",
    size: 6,
    kind: "aromatic",
    molecule: makeSubstitutedRing("aromatic", [
      { ringIndex: 0, length: 1 },
      { ringIndex: 2, length: 1 },
    ]),
  },
  {
    id: "para-xylene",
    label: "p-Xileno",
    formula: "C₈H₁₀",
    detail: "1,4-dimetilbenceno",
    size: 6,
    kind: "aromatic",
    molecule: makeSubstitutedRing("aromatic", [
      { ringIndex: 0, length: 1 },
      { ringIndex: 3, length: 1 },
    ]),
  },
];

const functionalGroupLabels: Record<FunctionalGroupKind, string> = {
  halogen: "Halogenuro",
  alcohol: "Alcohol",
  ether: "Éter",
  aldehyde: "Aldehído",
  ketone: "Cetona",
  carboxylicAcid: "Ácido carboxílico",
  ester: "Éster",
  amine: "Amina",
  amide: "Amida",
  nitrile: "Nitrilo",
  nitro: "Nitro",
};

const functionalGroupPriority: Record<FunctionalGroupKind, number> = {
  carboxylicAcid: 10,
  ester: 9,
  amide: 8,
  nitrile: 7,
  aldehyde: 6,
  ketone: 5,
  alcohol: 4,
  amine: 3,
  nitro: 1,
  ether: 1,
  halogen: 1,
};

const FUNCTIONAL_GROUP_TEMPLATES: FunctionalGroupTemplate[] = [
  {
    id: "hydroxyl",
    label: "Alcohol",
    shortFormula: "–OH",
    category: "oxygen",
    detail: "grupo hidroxilo",
    kind: "alcohol",
    atoms: [{ element: "O", x: 1, y: 0 }],
    bonds: [[0, 1, 1]],
    requirement: "open",
  },
  {
    id: "ether-methyl",
    label: "Éter",
    shortFormula: "–O–CH₃",
    category: "oxygen",
    detail: "grupo metoxi",
    kind: "ether",
    atoms: [
      { element: "O", x: 1, y: 0 },
      { element: "C", x: 2, y: 0 },
    ],
    bonds: [[0, 1, 1], [1, 2, 1]],
    requirement: "open",
  },
  {
    id: "aldehyde",
    label: "Aldehído",
    shortFormula: "–CHO",
    category: "oxygen",
    detail: "carbonilo terminal",
    kind: "aldehyde",
    atoms: [{ element: "O", x: 1, y: 0 }],
    bonds: [[0, 1, 2]],
    requirement: "terminal-carbon",
  },
  {
    id: "ketone",
    label: "Cetona",
    shortFormula: ">C=O",
    category: "oxygen",
    detail: "carbonilo interno",
    kind: "ketone",
    atoms: [{ element: "O", x: 0, y: -1 }],
    bonds: [[0, 1, 2]],
    requirement: "internal-carbon",
  },
  {
    id: "carboxylic-acid",
    label: "Ácido carboxílico",
    shortFormula: "–COOH",
    category: "oxygen",
    detail: "carboxilo terminal",
    kind: "carboxylicAcid",
    atoms: [
      { element: "O", x: 0, y: -1 },
      { element: "O", x: 1, y: 0 },
    ],
    bonds: [[0, 1, 2], [0, 2, 1]],
    requirement: "terminal-carbon",
  },
  {
    id: "methyl-ester",
    label: "Éster metílico",
    shortFormula: "–COOCH₃",
    category: "oxygen",
    detail: "éster con metilo",
    kind: "ester",
    atoms: [
      { element: "O", x: 0, y: -1 },
      { element: "O", x: 1, y: 0 },
      { element: "C", x: 2, y: 0 },
    ],
    bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1]],
    requirement: "terminal-carbon",
  },
  {
    id: "amine",
    label: "Amina",
    shortFormula: "–NH₂",
    category: "nitrogen",
    detail: "amina primaria",
    kind: "amine",
    atoms: [{ element: "N", x: 1, y: 0 }],
    bonds: [[0, 1, 1]],
    requirement: "open",
  },
  {
    id: "amide",
    label: "Amida",
    shortFormula: "–CONH₂",
    category: "nitrogen",
    detail: "carbonilo con amino",
    kind: "amide",
    atoms: [
      { element: "O", x: 0, y: -1 },
      { element: "N", x: 1, y: 0 },
    ],
    bonds: [[0, 1, 2], [0, 2, 1]],
    requirement: "terminal-carbon",
  },
  {
    id: "nitrile",
    label: "Nitrilo",
    shortFormula: "–C≡N",
    category: "nitrogen",
    detail: "grupo ciano terminal",
    kind: "nitrile",
    atoms: [{ element: "N", x: 1, y: 0 }],
    bonds: [[0, 1, 3]],
    requirement: "terminal-carbon",
  },
  {
    id: "nitro",
    label: "Nitro",
    shortFormula: "–NO₂",
    category: "nitrogen",
    detail: "grupo nitro",
    kind: "nitro",
    atoms: [
      { element: "N", x: 1, y: 0, charge: 1 },
      { element: "O", x: 2, y: -0.75 },
      { element: "O", x: 2, y: 0.75, charge: -1 },
    ],
    bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]],
    requirement: "open",
  },
  ...(["F", "Cl", "Br", "I"] as ChemicalElement[]).map((element) => ({
    id: `halo-${element.toLowerCase()}`,
    label: element === "F" ? "Fluoro" : element === "Cl" ? "Cloro" : element === "Br" ? "Bromo" : "Yodo",
    shortFormula: `–${element}`,
    category: "halogen" as const,
    detail: "sustituyente halógeno",
    kind: "halogen" as const,
    atoms: [{ element, x: 1, y: 0 }],
    bonds: [[0, 1, 1] as [number, number, BondOrder]],
    requirement: "open" as const,
  })),
];

const PRESETS: { label: string; molecule: Molecule }[] = [
  { label: "Butano", molecule: makeChain(4) },
  {
    label: "Eteno",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
      ],
      bonds: [[1, 2, 2]],
    },
  },
  {
    label: "2-metilpropeno",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 1, y: -1 },
      ],
      bonds: [[1, 2, 2], [2, 3], [2, 4]],
    },
  },
  {
    label: "Etino",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
      ],
      bonds: [[1, 2, 3]],
    },
  },
  {
    label: "2-metilpropano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 1, y: -1 },
      ],
      bonds: [[1, 2], [2, 3], [2, 4]],
    },
  },
  {
    label: "2,3-dimetilbutano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 3, y: 0 },
        { id: 5, x: 1, y: -1 },
        { id: 6, x: 2, y: 1 },
      ],
      bonds: [[1, 2], [2, 3], [3, 4], [2, 5], [3, 6]],
    },
  },
  {
    label: "3-etil-2-metilhexano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 3, y: 0 },
        { id: 5, x: 4, y: 0 },
        { id: 6, x: 5, y: 0 },
        { id: 7, x: 1, y: -1 },
        { id: 8, x: 2, y: 1 },
        { id: 9, x: 2, y: 2 },
      ],
      bonds: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [2, 7], [3, 8], [8, 9]],
    },
  },
  {
    label: "2,2,4-trimetilpentano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 3, y: 0 },
        { id: 5, x: 4, y: 0 },
        { id: 6, x: 1, y: -1 },
        { id: 7, x: 1, y: 1 },
        { id: 8, x: 3, y: -1 },
      ],
      bonds: [[1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [2, 7], [4, 8]],
    },
  },
  { label: "4-isopropiloctano", molecule: makeIsopropylOctane() },
  { label: "Ciclohexano", molecule: makeRing(6, "cycloalkane") },
  {
    label: "Metilciclohexano",
    molecule: makeSubstitutedRing("cycloalkane", [{ ringIndex: 0, length: 1 }]),
  },
  { label: "Benceno", molecule: makeRing(6, "aromatic") },
  {
    label: "Tolueno",
    molecule: makeSubstitutedRing("aromatic", [{ ringIndex: 0, length: 1 }]),
  },
  {
    label: "p-Xileno",
    molecule: makeSubstitutedRing("aromatic", [
      { ringIndex: 0, length: 1 },
      { ringIndex: 3, length: 1 },
    ]),
  },
  { label: "Bifenilo", molecule: makeLinkedRings("aromatic", "aromatic") },
  { label: "Ciclohexilciclohexano", molecule: makeLinkedRings("cycloalkane", "cycloalkane") },
  {
    label: "Etanol",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0, element: "O" },
      ],
      bonds: [[1, 2], [2, 3]],
    },
  },
  {
    label: "Metoxietano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0, element: "O" },
        { id: 4, x: 3, y: 0 },
      ],
      bonds: [[1, 2], [2, 3], [3, 4]],
    },
  },
  {
    label: "Etanal",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 1, y: -1, element: "O" },
      ],
      bonds: [[1, 2], [2, 3, 2]],
    },
  },
  {
    label: "Propan-2-ona",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0 },
        { id: 4, x: 1, y: -1, element: "O" },
      ],
      bonds: [[1, 2], [2, 3], [2, 4, 2]],
    },
  },
  {
    label: "Ácido etanoico",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 1, y: -1, element: "O" },
        { id: 4, x: 2, y: 0, element: "O" },
      ],
      bonds: [[1, 2], [2, 3, 2], [2, 4]],
    },
  },
  {
    label: "Etanoato de metilo",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 1, y: -1, element: "O" },
        { id: 4, x: 2, y: 0, element: "O" },
        { id: 5, x: 3, y: 0 },
      ],
      bonds: [[1, 2], [2, 3, 2], [2, 4], [4, 5]],
    },
  },
  {
    label: "Etanamina",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0, element: "N" },
      ],
      bonds: [[1, 2], [2, 3]],
    },
  },
  {
    label: "Etanamida",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 1, y: -1, element: "O" },
        { id: 4, x: 2, y: 0, element: "N" },
      ],
      bonds: [[1, 2], [2, 3, 2], [2, 4]],
    },
  },
  {
    label: "Cloroetano",
    molecule: {
      atoms: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 1, y: 0 },
        { id: 3, x: 2, y: 0, element: "Cl" },
      ],
      bonds: [[1, 2], [2, 3]],
    },
  },
];

function cloneMolecule(molecule: Molecule): Molecule {
  return {
    atoms: molecule.atoms.map((atom) => ({ ...atom })),
    bonds: molecule.bonds.map((bond) => [...bond] as Bond),
    rings: molecule.rings
      ? molecule.rings.map((ring) => ({ id: ring.id, kind: ring.kind, atomIds: [...ring.atomIds] }))
      : undefined,
    ...(molecule.isMirrored ? { isMirrored: true } : {}),
  };
}

function buildAdjacency(molecule: Molecule) {
  const adjacency = new Map<number, number[]>();
  molecule.atoms.forEach((atom) => adjacency.set(atom.id, []));
  molecule.bonds.forEach(([a, b]) => {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  });
  return adjacency;
}

function pathBetween(start: number, end: number, adjacency: Map<number, number[]>) {
  const queue = [start];
  const previous = new Map<number, number | null>([[start, null]]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current === end) break;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!previous.has(neighbor)) {
        previous.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  if (!previous.has(end)) return [];

  const path: number[] = [];
  let cursor: number | null | undefined = end;
  while (cursor != null) {
    path.unshift(cursor);
    cursor = previous.get(cursor);
  }
  return path;
}

function compareNumberLists(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? Number.POSITIVE_INFINITY;
    const right = b[index] ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
  }
  return 0;
}

function stripForAlphabetizing(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/^(?:(?:\d+(?:,\d+)*|n(?:,n)*)-)+/, "")
    .replace(/[0-9,()\-]/g, "")
    .replace(/^(?:di|tri|tetra|penta|hexa|hepta|octa|bis|tris|tetrakis|pentakis|hexakis)/, "")
    .replace(/^(?:sec|terc|tert)/, "");
}

function compareAlphabeticalNames(left: string, right: string) {
  const keyComparison = stripForAlphabetizing(left).localeCompare(
    stripForAlphabetizing(right),
    "es",
    { sensitivity: "base" },
  );
  return keyComparison || left.localeCompare(right, "es", { sensitivity: "base" });
}

function resolveSubstituentNaming(
  substituent: NamedSubstituent,
  enabledAliases: ReadonlySet<string>,
) {
  const systematic = substituent.name as AlkylAliasKey;
  const common = commonAlkylAliases[systematic];
  if (common && enabledAliases.has(systematic)) {
    return {
      name: common,
      sortName: stripForAlphabetizing(common),
      complex: false,
    };
  }
  return {
    name: substituent.name,
    sortName: stripForAlphabetizing(substituent.name),
    complex: substituent.complex,
  };
}

function compareSubstituentAlphabeticalLocants(
  left: NamedSubstituent[],
  right: NamedSubstituent[],
  enabledAliases: readonly string[] = [],
) {
  const enabled = new Set(enabledAliases);
  const orderedLocants = (items: NamedSubstituent[]) => [...items]
    .sort((a, b) => {
      const leftName = resolveSubstituentNaming(a, enabled);
      const rightName = resolveSubstituentNaming(b, enabled);
      return compareAlphabeticalNames(leftName.sortName, rightName.sortName)
        || a.locant - b.locant;
    })
    .map((item) => item.locant);
  return compareNumberLists(orderedLocants(left), orderedLocants(right));
}

function sortFormattedPrefixParts(prefixParts: string[]) {
  return [...prefixParts].sort(compareAlphabeticalNames);
}

function formatSubstituentGroups(
  substituents: NamedSubstituent[],
  enabledAliases: readonly string[] = [],
) {
  const enabled = new Set(enabledAliases);
  const groups = new Map<string, NamedSubstituent[]>();
  substituents.forEach((substituent) => {
    const current = groups.get(substituent.name) ?? [];
    current.push(substituent);
    groups.set(substituent.name, current);
  });

  return [...groups.values()]
    .sort((left, right) => {
      const leftName = resolveSubstituentNaming(left[0], enabled);
      const rightName = resolveSubstituentNaming(right[0], enabled);
      return compareAlphabeticalNames(leftName.sortName, rightName.sortName);
    })
    .map((group) => {
      const locants = group.map((item) => item.locant).sort((a, b) => a - b).join(",");
      const { name, complex } = resolveSubstituentNaming(group[0], enabled);
      if (group.length === 1) {
        return complex ? `${locants}-(${name})` : `${locants}-${name}`;
      }
      if (complex) {
        const prefix = complexPrefixes[group.length] ?? `${group.length}×`;
        return `${locants}-${prefix}(${name})`;
      }
      const prefix = simplePrefixes[group.length] ?? `${group.length}×`;
      return `${locants}-${prefix}${name}`;
    });
}

function collectSubtree(root: number, blocked: Set<number>, adjacency: Map<number, number[]>) {
  const result: number[] = [];
  const stack = [root];
  const seen = new Set(blocked);
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    for (const neighbor of adjacency.get(current) ?? []) stack.push(neighbor);
  }
  return result;
}

function nameSubstituent(root: number, parent: number, adjacency: Map<number, number[]>): Omit<NamedSubstituent, "locant"> {
  const component = collectSubtree(root, new Set([parent]), adjacency);
  const componentSet = new Set(component);
  const rootPaths: number[][] = [];

  const walk = (current: number, previous: number | null, path: number[]) => {
    const children = (adjacency.get(current) ?? []).filter(
      (neighbor) => neighbor !== previous && componentSet.has(neighbor),
    );
    if (!children.length) {
      rootPaths.push(path);
      return;
    }
    children.forEach((child) => walk(child, current, [...path, child]));
  };
  walk(root, null, [root]);

  const maxLength = Math.max(...rootPaths.map((path) => path.length));
  const candidates = rootPaths
    .filter((path) => path.length === maxLength)
    .map((path) => {
      const pathSet = new Set(path);
      const branches: NamedSubstituent[] = [];
      path.forEach((atomId, index) => {
        for (const neighbor of adjacency.get(atomId) ?? []) {
          if (!componentSet.has(neighbor) || pathSet.has(neighbor)) continue;
          const named = nameSubstituent(neighbor, atomId, adjacency);
          branches.push({ ...named, locant: index + 1 });
        }
      });
      return { path, branches };
    })
    .sort((left, right) => {
      if (left.branches.length !== right.branches.length) return right.branches.length - left.branches.length;
      const leftLocants = left.branches.map((branch) => branch.locant).sort((a, b) => a - b);
      const rightLocants = right.branches.map((branch) => branch.locant).sort((a, b) => a - b);
      const locantComparison = compareNumberLists(leftLocants, rightLocants);
      return locantComparison || compareSubstituentAlphabeticalLocants(left.branches, right.branches);
    });

  const chosen = candidates[0];
  const parentName = alkylNames[chosen.path.length] ?? `alquilo de ${chosen.path.length} carbonos`;
  const branchParts = formatSubstituentGroups(chosen.branches);
  const name = branchParts.length ? `${branchParts.join("-")}${parentName}` : parentName;

  return {
    name,
    sortName: stripForAlphabetizing(name),
    complex: branchParts.length > 0,
    atomIds: component,
  };
}

function makeChainName(length: number, doubleLocants: number[], tripleLocants: number[]) {
  const root = alkaneRoots[length];
  if (!root) return `hidrocarburo de ${length} carbonos`;
  if (!doubleLocants.length && !tripleLocants.length) return `${root}ano`;

  const unsaturationPrefix = (count: number) => simplePrefixes[count] ?? `${count}`;
  if (doubleLocants.length && !tripleLocants.length) {
    if (doubleLocants.length === 1) {
      return length <= 2 ? `${root}eno` : `${root}-${doubleLocants[0]}-eno`;
    }
    return `${root}a-${doubleLocants.join(",")}-${unsaturationPrefix(doubleLocants.length)}eno`;
  }
  if (tripleLocants.length && !doubleLocants.length) {
    if (tripleLocants.length === 1) {
      return length <= 2 ? `${root}ino` : `${root}-${tripleLocants[0]}-ino`;
    }
    return `${root}a-${tripleLocants.join(",")}-${unsaturationPrefix(tripleLocants.length)}ino`;
  }

  const alkenePart = doubleLocants.length === 1
    ? `${doubleLocants[0]}-en`
    : `${doubleLocants.join(",")}-${unsaturationPrefix(doubleLocants.length)}en`;
  const alkynePart = tripleLocants.length === 1
    ? `${tripleLocants[0]}-ino`
    : `${tripleLocants.join(",")}-${unsaturationPrefix(tripleLocants.length)}ino`;
  return `${root}-${alkenePart}-${alkynePart}`;
}

function molecularFormula(molecule: Molecule) {
  const counts = new Map<ChemicalElement, number>();
  molecule.atoms.forEach((atom) => {
    const element = getElement(atom);
    counts.set(element, (counts.get(element) ?? 0) + 1);
  });
  const hydrogenCount = molecule.atoms.reduce(
    (total, atom) => total + getImplicitHydrogens(atom.id, molecule),
    0,
  );

  const formatCount = (element: ChemicalElement, alwaysShowCount = false) => {
    const count = counts.get(element) ?? 0;
    if (!count) return "";
    return `${element}${count > 1 || alwaysShowCount ? toSubscript(count) : ""}`;
  };

  return [
    formatCount("C", true),
    hydrogenCount ? `H${toSubscript(hydrogenCount)}` : "",
    formatCount("Br"),
    formatCount("Cl"),
    formatCount("F"),
    formatCount("I"),
    formatCount("N"),
    formatCount("O"),
  ].filter(Boolean).join("");
}

function aromaticCommonName(substituents: NamedSubstituent[]) {
  if (substituents.length === 1 && substituents[0].name === "metil") return "tolueno";
  if (substituents.length !== 2 || substituents.some((item) => item.name !== "metil")) return undefined;

  const locants = substituents.map((item) => item.locant).sort((a, b) => a - b).join(",");
  if (locants === "1,2") return "o-xileno";
  if (locants === "1,3") return "m-xileno";
  if (locants === "1,4") return "p-xileno";
  return undefined;
}

function ringBaseName(ring: RingInfo) {
  const root = alkaneRoots[ring.atomIds.length];
  if (ring.kind === "aromatic") return ring.atomIds.length === 6 ? "benceno" : "aromático";
  return root ? `ciclo${root}ano` : `cicloalcano de ${ring.atomIds.length} carbonos`;
}

function unsaturatedRingBaseName(
  ring: RingInfo,
  doubleBondLocants: number[],
  tripleBondLocants: number[],
) {
  if (ring.kind === "aromatic" || (!doubleBondLocants.length && !tripleBondLocants.length)) {
    return ringBaseName(ring);
  }
  return `ciclo${makeChainName(
    ring.atomIds.length,
    doubleBondLocants,
    tripleBondLocants,
  )}`;
}

function ringSubstituentName(ring: RingInfo) {
  if (ring.kind === "aromatic") return ring.atomIds.length === 6 ? "fenil" : "aril";
  const root = alkaneRoots[ring.atomIds.length];
  return root ? `ciclo${root}il` : `cicloalquilo de ${ring.atomIds.length} carbonos`;
}

function orientedRingPaths(ring: RingInfo) {
  const paths: number[][] = [];
  ring.atomIds.forEach((_, startIndex) => {
    ([1, -1] as const).forEach((direction) => {
      paths.push(
        Array.from({ length: ring.atomIds.length }, (__, offset) => {
          const index = (startIndex + direction * offset + ring.atomIds.length) % ring.atomIds.length;
          return ring.atomIds[index];
        }),
      );
    });
  });
  return paths;
}

function ringCandidates(
  molecule: Molecule,
  ring: RingInfo,
  enabledAliases: readonly string[] = [],
) {
  const adjacency = buildAdjacency(molecule);
  const bondOrders = new Map(
    molecule.bonds.map((bond) => [bondKey(bond[0], bond[1]), getBondOrder(bond)]),
  );
  const ringSet = new Set(ring.atomIds);
  const candidates = orientedRingPaths(ring).map((path) => {
    const substituents: NamedSubstituent[] = [];
    const doubleBondLocants: number[] = [];
    const tripleBondLocants: number[] = [];

    if (ring.kind === "cycloalkane") {
      path.forEach((atomId, index) => {
        const nextAtomId = path[(index + 1) % path.length];
        const order = bondOrders.get(bondKey(atomId, nextAtomId)) ?? 1;
        if (order === 2) doubleBondLocants.push(index + 1);
        if (order === 3) tripleBondLocants.push(index + 1);
      });
    }

    path.forEach((atomId, index) => {
      for (const neighbor of adjacency.get(atomId) ?? []) {
        if (ringSet.has(neighbor)) continue;
        const neighboringRing = molecule.rings?.find(
          (candidateRing) => candidateRing.id !== ring.id && candidateRing.atomIds.includes(neighbor),
        );
        if (neighboringRing) {
          const name = ringSubstituentName(neighboringRing);
          substituents.push({
            locant: index + 1,
            name,
            sortName: name,
            complex: false,
            atomIds: neighboringRing.atomIds,
          });
          continue;
        }

        const component = collectSubtree(neighbor, new Set([atomId]), adjacency);
        const reachesAnotherRing = molecule.rings?.some(
          (candidateRing) => candidateRing.id !== ring.id
            && candidateRing.atomIds.some((ringAtomId) => component.includes(ringAtomId)),
        );
        const named = reachesAnotherRing
          ? {
              name: "grupo policíclico",
              sortName: "grupo policíclico",
              complex: true,
              atomIds: component,
            }
          : nameSubstituent(neighbor, atomId, adjacency);
        substituents.push({ ...named, locant: index + 1 });
      }
    });
    return { path, substituents, doubleBondLocants, tripleBondLocants };
  });

  candidates.sort((left, right) => {
    const leftMultipleLocants = [...left.doubleBondLocants, ...left.tripleBondLocants]
      .sort((a, b) => a - b);
    const rightMultipleLocants = [...right.doubleBondLocants, ...right.tripleBondLocants]
      .sort((a, b) => a - b);
    const multipleComparison = compareNumberLists(leftMultipleLocants, rightMultipleLocants);
    if (multipleComparison !== 0) return multipleComparison;

    const doubleComparison = compareNumberLists(
      [...left.doubleBondLocants].sort((a, b) => a - b),
      [...right.doubleBondLocants].sort((a, b) => a - b),
    );
    if (doubleComparison !== 0) return doubleComparison;

    const leftLocants = left.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const rightLocants = right.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const locantComparison = compareNumberLists(leftLocants, rightLocants);
    if (locantComparison !== 0) return locantComparison;

    return compareSubstituentAlphabeticalLocants(
      left.substituents,
      right.substituents,
      enabledAliases,
    );
  });

  return candidates;
}

function buildRingAnalysis(
  molecule: Molecule,
  ring: RingInfo,
  family: RingKind | "polycyclic",
  enabledAliases: readonly string[] = [],
): Analysis {
  const chosen = ringCandidates(molecule, ring, enabledAliases)[0];
  const chainName = unsaturatedRingBaseName(
    ring,
    chosen.doubleBondLocants,
    chosen.tripleBondLocants,
  );
  const substituentParts = formatSubstituentGroups(chosen.substituents, enabledAliases);
  const singleSubstituent = chosen.substituents.length === 1
    ? resolveSubstituentNaming(chosen.substituents[0], new Set(enabledAliases))
    : undefined;
  let name = singleSubstituent
    ? `${singleSubstituent.complex ? `(${singleSubstituent.name})` : singleSubstituent.name}${chainName}`
    : substituentParts.length
      ? `${substituentParts.join("-")}${chainName}`
      : chainName;

  const rings = molecule.rings ?? [];
  const allAtomsBelongToRings = molecule.atoms.every((atom) =>
    rings.some((candidateRing) => candidateRing.atomIds.includes(atom.id)),
  );
  if (
    rings.length === 2
    && rings.every((candidateRing) => candidateRing.kind === "aromatic" && candidateRing.atomIds.length === 6)
    && allAtomsBelongToRings
  ) {
    name = "bifenilo";
  }

  return {
    name,
    commonName: rings.length === 1 && ring.kind === "aromatic"
      ? aromaticCommonName(chosen.substituents)
      : undefined,
    formula: molecularFormula(molecule),
    family,
    mainChain: chosen.path,
    chainName,
    substituents: chosen.substituents,
    numberedAtoms: new Map(chosen.path.map((atomId, index) => [atomId, index + 1])),
    doubleBondLocants: chosen.doubleBondLocants,
    tripleBondLocants: chosen.tripleBondLocants,
    functionalGroups: [],
  };
}

function analyzeRingMolecule(molecule: Molecule, enabledAliases: readonly string[] = []): Analysis {
  const ring = molecule.rings![0];
  return buildRingAnalysis(molecule, ring, ring.kind, enabledAliases);
}

function analyzeMultiRingMolecule(molecule: Molecule, enabledAliases: readonly string[] = []): Analysis {
  const rings = molecule.rings!;
  const adjacency = buildAdjacency(molecule);
  const ranked = [...rings].sort((left, right) => {
    const linkedRingCount = (ring: RingInfo) => {
      const linked = new Set<number>();
      ring.atomIds.forEach((atomId) => {
        for (const neighbor of adjacency.get(atomId) ?? []) {
          const other = rings.find(
            (candidateRing) => candidateRing.id !== ring.id && candidateRing.atomIds.includes(neighbor),
          );
          if (other) linked.add(other.id);
        }
      });
      return linked.size;
    };
    const linkDifference = linkedRingCount(right) - linkedRingCount(left);
    if (linkDifference !== 0) return linkDifference;
    if (left.kind !== right.kind) return left.kind === "aromatic" ? -1 : 1;
    return right.atomIds.length - left.atomIds.length;
  });
  return buildRingAnalysis(molecule, ranked[0], "polycyclic", enabledAliases);
}

function analyzeHydrocarbonMolecule(
  molecule: Molecule,
  enabledAliases: readonly string[] = [],
): Analysis {
  if ((molecule.rings?.length ?? 0) > 1) return analyzeMultiRingMolecule(molecule, enabledAliases);
  if (molecule.rings?.length === 1) return analyzeRingMolecule(molecule, enabledAliases);

  const adjacency = buildAdjacency(molecule);
  const bondOrders = new Map(
    molecule.bonds.map((bond) => [bondKey(bond[0], bond[1]), getBondOrder(bond)]),
  );
  const atomIds = molecule.atoms.map((atom) => atom.id);
  const orientedPaths: number[][] = atomIds.length === 1 ? [[atomIds[0]]] : [];

  atomIds.forEach((start, startIndex) => {
    atomIds.slice(startIndex + 1).forEach((end) => {
      const path = pathBetween(start, end, adjacency);
      orientedPaths.push(path, [...path].reverse());
    });
  });

  const candidates = orientedPaths.map((path) => {
    const pathSet = new Set(path);
    const substituents: NamedSubstituent[] = [];
    const doubleBondLocants: number[] = [];
    const tripleBondLocants: number[] = [];

    path.slice(0, -1).forEach((atomId, index) => {
      const order = bondOrders.get(bondKey(atomId, path[index + 1])) ?? 1;
      if (order === 2) doubleBondLocants.push(index + 1);
      if (order === 3) tripleBondLocants.push(index + 1);
    });

    path.forEach((atomId, index) => {
      for (const neighbor of adjacency.get(atomId) ?? []) {
        if (pathSet.has(neighbor)) continue;
        const named = nameSubstituent(neighbor, atomId, adjacency);
        substituents.push({ ...named, locant: index + 1 });
      }
    });

    return {
      path,
      substituents,
      doubleBondLocants,
      tripleBondLocants,
      multipleBondCount: doubleBondLocants.length + tripleBondLocants.length,
    };
  });

  candidates.sort((left, right) => {
    if (left.multipleBondCount !== right.multipleBondCount) {
      return right.multipleBondCount - left.multipleBondCount;
    }
    if (left.path.length !== right.path.length) return right.path.length - left.path.length;

    const leftMultipleLocants = [...left.doubleBondLocants, ...left.tripleBondLocants].sort((a, b) => a - b);
    const rightMultipleLocants = [...right.doubleBondLocants, ...right.tripleBondLocants].sort((a, b) => a - b);
    const multipleComparison = compareNumberLists(leftMultipleLocants, rightMultipleLocants);
    if (multipleComparison !== 0) return multipleComparison;

    const doubleComparison = compareNumberLists(left.doubleBondLocants, right.doubleBondLocants);
    if (doubleComparison !== 0) return doubleComparison;

    if (left.substituents.length !== right.substituents.length) {
      return right.substituents.length - left.substituents.length;
    }
    const leftLocants = left.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const rightLocants = right.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const locantComparison = compareNumberLists(leftLocants, rightLocants);
    if (locantComparison !== 0) return locantComparison;

    return compareSubstituentAlphabeticalLocants(
      left.substituents,
      right.substituents,
      enabledAliases,
    );
  });

  const chosen = candidates[0];
  const chainName = makeChainName(
    chosen.path.length,
    chosen.doubleBondLocants,
    chosen.tripleBondLocants,
  );
  const substituentParts = formatSubstituentGroups(chosen.substituents, enabledAliases);
  const name = substituentParts.length ? `${substituentParts.join("-")}${chainName}` : chainName;
  const numberedAtoms = new Map(chosen.path.map((atomId, index) => [atomId, index + 1]));

  return {
    name,
    formula: molecularFormula(molecule),
    family: "acyclic",
    mainChain: chosen.path,
    chainName,
    substituents: chosen.substituents,
    numberedAtoms,
    doubleBondLocants: chosen.doubleBondLocants,
    tripleBondLocants: chosen.tripleBondLocants,
    functionalGroups: [],
  };
}

function carbonSkeleton(molecule: Molecule): Molecule {
  const carbonIds = new Set(
    molecule.atoms.filter(isCarbonAtom).map((atom) => atom.id),
  );
  return {
    atoms: molecule.atoms.filter(isCarbonAtom).map((atom) => ({ ...atom, element: "C" })),
    bonds: molecule.bonds
      .filter(([a, b]) => carbonIds.has(a) && carbonIds.has(b))
      .map((bond) => [...bond] as Bond),
    rings: molecule.rings?.map((ring) => ({ ...ring, atomIds: [...ring.atomIds] })),
  };
}

function atomNeighbors(atomId: number, molecule: Molecule) {
  return molecule.bonds.flatMap((bond) => {
    if (bond[0] === atomId) return [{ atomId: bond[1], order: getBondOrder(bond) }];
    if (bond[1] === atomId) return [{ atomId: bond[0], order: getBondOrder(bond) }];
    return [];
  });
}

function detectFunctionalGroups(molecule: Molecule): FunctionalGroup[] {
  const groups: FunctionalGroup[] = [];
  const claimedHeteroAtoms = new Set<number>();
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const elementAt = (atomId: number) => {
    const atom = atomsById.get(atomId);
    return atom ? getElement(atom) : "C";
  };

  molecule.atoms.filter(isCarbonAtom).forEach((carbon) => {
    const neighbors = atomNeighbors(carbon.id, molecule);
    const doubleOxygen = neighbors.find(
      (neighbor) => elementAt(neighbor.atomId) === "O" && neighbor.order === 2,
    );
    if (!doubleOxygen) return;

    const singleOxygen = neighbors.find(
      (neighbor) => elementAt(neighbor.atomId) === "O" && neighbor.order === 1,
    );
    const singleNitrogen = neighbors.find(
      (neighbor) => elementAt(neighbor.atomId) === "N" && neighbor.order === 1,
    );

    if (singleOxygen) {
      const oxygenCarbonNeighbors = atomNeighbors(singleOxygen.atomId, molecule)
        .filter((neighbor) => neighbor.atomId !== carbon.id && elementAt(neighbor.atomId) === "C");
      const alkylCarbonId = oxygenCarbonNeighbors[0]?.atomId;
      const kind: FunctionalGroupKind = alkylCarbonId ? "ester" : "carboxylicAcid";
      groups.push({
        id: `${kind}-${carbon.id}`,
        kind,
        label: functionalGroupLabels[kind],
        atomIds: [
          carbon.id,
          doubleOxygen.atomId,
          singleOxygen.atomId,
          ...(alkylCarbonId ? [alkylCarbonId] : []),
        ],
        carbonIds: [carbon.id],
        carbonId: carbon.id,
        heteroAtomId: doubleOxygen.atomId,
        alkylCarbonId,
      });
      claimedHeteroAtoms.add(doubleOxygen.atomId);
      claimedHeteroAtoms.add(singleOxygen.atomId);
      return;
    }

    if (singleNitrogen) {
      groups.push({
        id: `amide-${carbon.id}`,
        kind: "amide",
        label: functionalGroupLabels.amide,
        atomIds: [carbon.id, doubleOxygen.atomId, singleNitrogen.atomId],
        carbonIds: [carbon.id],
        carbonId: carbon.id,
        heteroAtomId: singleNitrogen.atomId,
      });
      claimedHeteroAtoms.add(doubleOxygen.atomId);
      claimedHeteroAtoms.add(singleNitrogen.atomId);
      return;
    }

    const kind: FunctionalGroupKind = getImplicitHydrogens(carbon.id, molecule) > 0
      ? "aldehyde"
      : "ketone";
    groups.push({
      id: `${kind}-${carbon.id}`,
      kind,
      label: functionalGroupLabels[kind],
      atomIds: [carbon.id, doubleOxygen.atomId],
      carbonIds: [carbon.id],
      carbonId: carbon.id,
      heteroAtomId: doubleOxygen.atomId,
    });
    claimedHeteroAtoms.add(doubleOxygen.atomId);
  });

  molecule.atoms.forEach((atom) => {
    const element = getElement(atom);
    if (element !== "O" || claimedHeteroAtoms.has(atom.id)) return;
    const carbonNeighbors = atomNeighbors(atom.id, molecule)
      .filter((neighbor) => neighbor.order === 1 && elementAt(neighbor.atomId) === "C")
      .map((neighbor) => neighbor.atomId);
    if (carbonNeighbors.length === 1 && getValenceUsed(atom.id, molecule) === 1) {
      groups.push({
        id: `alcohol-${atom.id}`,
        kind: "alcohol",
        label: functionalGroupLabels.alcohol,
        atomIds: [carbonNeighbors[0], atom.id],
        carbonIds: [carbonNeighbors[0]],
        carbonId: carbonNeighbors[0],
        heteroAtomId: atom.id,
      });
      claimedHeteroAtoms.add(atom.id);
    } else if (carbonNeighbors.length === 2 && getValenceUsed(atom.id, molecule) === 2) {
      groups.push({
        id: `ether-${atom.id}`,
        kind: "ether",
        label: functionalGroupLabels.ether,
        atomIds: [atom.id, ...carbonNeighbors],
        carbonIds: carbonNeighbors,
        carbonId: carbonNeighbors[0],
        heteroAtomId: atom.id,
        alkylCarbonId: carbonNeighbors[1],
      });
      claimedHeteroAtoms.add(atom.id);
    }
  });

  molecule.atoms.forEach((atom) => {
    const element = getElement(atom);
    if (element !== "N" || claimedHeteroAtoms.has(atom.id)) return;
    const neighbors = atomNeighbors(atom.id, molecule);
    const nitrileCarbon = neighbors.find(
      (neighbor) => neighbor.order === 3 && elementAt(neighbor.atomId) === "C",
    );
    if (nitrileCarbon) {
      groups.push({
        id: `nitrile-${atom.id}`,
        kind: "nitrile",
        label: functionalGroupLabels.nitrile,
        atomIds: [nitrileCarbon.atomId, atom.id],
        carbonIds: [nitrileCarbon.atomId],
        carbonId: nitrileCarbon.atomId,
        heteroAtomId: atom.id,
      });
      claimedHeteroAtoms.add(atom.id);
      return;
    }

    const nitroCarbon = neighbors.find(
      (neighbor) => neighbor.order === 1 && elementAt(neighbor.atomId) === "C",
    );
    const nitroOxygens = neighbors.filter(
      (neighbor) => elementAt(neighbor.atomId) === "O" && (neighbor.order === 1 || neighbor.order === 2),
    );
    const hasNitroBondPattern = nitroOxygens.length === 2
      && nitroOxygens.some((neighbor) => neighbor.order === 2)
      && nitroOxygens.some((neighbor) => neighbor.order === 1);
    if (nitroCarbon && hasNitroBondPattern) {
      groups.push({
        id: `nitro-${atom.id}`,
        kind: "nitro",
        label: functionalGroupLabels.nitro,
        atomIds: [nitroCarbon.atomId, atom.id, ...nitroOxygens.map((neighbor) => neighbor.atomId)],
        carbonIds: [nitroCarbon.atomId],
        carbonId: nitroCarbon.atomId,
        heteroAtomId: atom.id,
      });
      claimedHeteroAtoms.add(atom.id);
      nitroOxygens.forEach((neighbor) => claimedHeteroAtoms.add(neighbor.atomId));
      return;
    }

    const carbonNeighbors = neighbors
      .filter((neighbor) => neighbor.order === 1 && elementAt(neighbor.atomId) === "C")
      .map((neighbor) => neighbor.atomId);
    if (!carbonNeighbors.length) return;
    groups.push({
      id: `amine-${atom.id}`,
      kind: "amine",
      label: functionalGroupLabels.amine,
      atomIds: [atom.id, ...carbonNeighbors],
      carbonIds: carbonNeighbors,
      carbonId: carbonNeighbors[0],
      heteroAtomId: atom.id,
    });
    claimedHeteroAtoms.add(atom.id);
  });

  molecule.atoms.forEach((atom) => {
    const element = getElement(atom);
    if (!(element === "F" || element === "Cl" || element === "Br" || element === "I")) return;
    const carbonNeighbor = atomNeighbors(atom.id, molecule)
      .find((neighbor) => elementAt(neighbor.atomId) === "C");
    if (!carbonNeighbor) return;
    const label = element === "F" ? "Fluoro" : element === "Cl" ? "Cloro" : element === "Br" ? "Bromo" : "Yodo";
    groups.push({
      id: `halogen-${atom.id}`,
      kind: "halogen",
      label,
      atomIds: [carbonNeighbor.atomId, atom.id],
      carbonIds: [carbonNeighbor.atomId],
      carbonId: carbonNeighbor.atomId,
      heteroAtomId: atom.id,
    });
  });

  return groups;
}

const suffixFunctionalGroups = new Set<FunctionalGroupKind>([
  "carboxylicAcid",
  "ester",
  "amide",
  "nitrile",
  "aldehyde",
  "ketone",
  "alcohol",
  "amine",
]);

function selectPrimaryFunctionalGroup(groups: FunctionalGroup[]) {
  return [...groups]
    .filter((group) => suffixFunctionalGroups.has(group.kind))
    .sort((left, right) => functionalGroupPriority[right.kind] - functionalGroupPriority[left.kind])[0]?.kind;
}

function carbonComponent(startId: number, skeleton: Molecule) {
  const adjacency = buildAdjacency(skeleton);
  const seen = new Set<number>();
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    (adjacency.get(current) ?? []).forEach((neighbor) => stack.push(neighbor));
  }
  return [...seen];
}

function simpleAlkylLength(startId: number, skeleton: Molecule) {
  const component = carbonComponent(startId, skeleton);
  const adjacency = buildAdjacency(skeleton);
  const simple = component.every(
    (atomId) => (adjacency.get(atomId) ?? []).filter((neighbor) => component.includes(neighbor)).length <= 2,
  );
  return simple ? component.length : 0;
}

function alkoxyName(startId: number, skeleton: Molecule) {
  const length = simpleAlkylLength(startId, skeleton);
  return length && alkaneRoots[length] ? `${alkaneRoots[length]}oxi` : "alcoxi";
}

function esterAlkylName(startId: number | undefined, skeleton: Molecule) {
  if (!startId) return "alquilo";
  const length = simpleAlkylLength(startId, skeleton);
  const name = alkylNames[length];
  return name ? `${name}o` : "alquilo";
}

function locantForGroup(group: FunctionalGroup, path: number[]) {
  const carbonId = group.carbonIds.find((candidate) => path.includes(candidate));
  return carbonId ? path.indexOf(carbonId) + 1 : undefined;
}

function anchorLocantForGroup(group: FunctionalGroup, path: number[], skeleton: Molecule) {
  const direct = locantForGroup(group, path);
  if (direct) return direct;
  const adjacency = buildAdjacency(skeleton);
  for (const carbonId of group.carbonIds) {
    const anchor = path.find((parentAtomId) => (adjacency.get(parentAtomId) ?? []).includes(carbonId));
    if (anchor) return path.indexOf(anchor) + 1;
  }
  return undefined;
}

function functionalPrefixSubstituents(
  groups: FunctionalGroup[],
  path: number[],
  primaryKind: FunctionalGroupKind | undefined,
  molecule: Molecule,
  skeleton: Molecule,
): NamedSubstituent[] {
  const prefixes: NamedSubstituent[] = [];
  groups.forEach((group) => {
    const directLocant = locantForGroup(group, path);
    const locant = directLocant ?? anchorLocantForGroup(group, path, skeleton);
    if (!locant) return;
    if (group.kind === primaryKind) return;

    const addPrefix = (name: string) => {
      prefixes.push({
        locant,
        name,
        sortName: stripForAlphabetizing(name),
        complex: false,
        atomIds: group.atomIds,
      });
    };

    if (group.kind === "halogen") {
      const element = getElement(getAtom(group.heteroAtomId, molecule)!);
      addPrefix(element === "F" ? "fluoro" : element === "Cl" ? "cloro" : element === "Br" ? "bromo" : "yodo");
    } else if (group.kind === "ether") {
      const parentCarbonId = group.carbonIds.find((candidate) => path.includes(candidate));
      const otherCarbonId = group.carbonIds.find((candidate) => candidate !== parentCarbonId);
      if (otherCarbonId) addPrefix(alkoxyName(otherCarbonId, skeleton));
    } else if (group.kind === "alcohol") {
      addPrefix("hidroxi");
    } else if (group.kind === "ketone") {
      addPrefix("oxo");
    } else if (group.kind === "amine") {
      addPrefix("amino");
    } else if (group.kind === "nitrile") {
      addPrefix("ciano");
    } else if (group.kind === "nitro") {
      addPrefix("nitro");
    } else if (group.kind === "aldehyde") {
      addPrefix(directLocant ? "oxo" : "formil");
    } else if (group.kind === "carboxylicAcid") {
      addPrefix("carboxi");
    } else if (group.kind === "ester") {
      const alkoxy = group.alkylCarbonId
        ? alkoxyName(group.alkylCarbonId, skeleton)
        : "alcoxi";
      if (directLocant) {
        addPrefix(alkoxy);
        addPrefix("oxo");
      } else {
        addPrefix(`${alkoxy}carbonil`);
      }
    } else if (group.kind === "amide") {
      if (directLocant) {
        addPrefix("amino");
        addPrefix("oxo");
      } else {
        addPrefix("carbamoil");
      }
    }
  });
  return prefixes;
}

function suffixMultiplier(count: number, suffix: string) {
  const prefix = simplePrefixes[count] ?? `${count}`;
  if (suffix === "ol" && prefix.endsWith("a")) return prefix.slice(0, -1);
  return prefix;
}

function formatEsterAlkylNames(names: string[]) {
  if (!names.length) return "alquilo";
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return [...counts.entries()]
    .sort(([left], [right]) => compareAlphabeticalNames(left, right))
    .map(([name, count]) => count === 1 ? name : `${simplePrefixes[count] ?? count}${name}`)
    .join(" y ");
}

function makeFunctionalParentName(
  length: number,
  doubleLocants: number[],
  tripleLocants: number[],
  kind: FunctionalGroupKind,
  locants: number[],
  esterAlkylNames: string[] = [],
) {
  const hydrocarbonName = makeChainName(length, doubleLocants, tripleLocants);
  const stem = hydrocarbonName.endsWith("o") ? hydrocarbonName.slice(0, -1) : hydrocarbonName;
  const sortedLocants = [...locants].sort((a, b) => a - b);
  const locantText = sortedLocants.join(",");
  const count = sortedLocants.length;

  if (kind === "carboxylicAcid") {
    return count > 1
      ? `ácido ${hydrocarbonName}${suffixMultiplier(count, "oico")}oico`
      : `ácido ${stem}oico`;
  }
  if (kind === "ester") {
    return count > 1
      ? `${hydrocarbonName}${suffixMultiplier(count, "oato")}oato de ${formatEsterAlkylNames(esterAlkylNames)}`
      : `${stem}oato de ${formatEsterAlkylNames(esterAlkylNames)}`;
  }
  if (kind === "amide") {
    return count > 1
      ? `${hydrocarbonName}${suffixMultiplier(count, "amida")}amida`
      : `${stem}amida`;
  }
  if (kind === "nitrile") {
    return count > 1
      ? `${hydrocarbonName}${suffixMultiplier(count, "nitrilo")}nitrilo`
      : `${hydrocarbonName}nitrilo`;
  }
  if (kind === "aldehyde") {
    return count > 1
      ? `${hydrocarbonName}${suffixMultiplier(count, "al")}al`
      : `${stem}al`;
  }

  if (sortedLocants.length > 1) {
    if (kind === "alcohol") return `${stem}-${locantText}-${suffixMultiplier(count, "ol")}ol`;
    if (kind === "ketone") return `${stem}-${locantText}-${suffixMultiplier(count, "ona")}ona`;
    if (kind === "amine") return `${stem}-${locantText}-${suffixMultiplier(count, "amina")}amina`;
  }

  const locant = sortedLocants[0] ?? 1;
  if (kind === "alcohol") {
    if (!doubleLocants.length && !tripleLocants.length && length === 1) return `${stem}ol`;
    return `${stem}-${locant}-ol`;
  }
  if (kind === "ketone") return `${stem}-${locant}-ona`;
  if (kind === "amine") {
    if (!doubleLocants.length && !tripleLocants.length && length <= 2) return `${stem}amina`;
    return `${stem}-${locant}-amina`;
  }
  return hydrocarbonName;
}

function combinePrefixAndParent(prefixParts: string[], parentName: string) {
  if (!prefixParts.length) return parentName;
  const prefix = prefixParts.join("-");
  return parentName.startsWith("ácido ")
    ? `ácido ${prefix}${parentName.slice("ácido ".length)}`
    : `${prefix}${parentName}`;
}

function nitrogenSubstituentPrefixes(
  group: FunctionalGroup | undefined,
  parentPath: number[],
  molecule: Molecule,
  skeleton: Molecule,
) {
  if (!group || !(group.kind === "amine" || group.kind === "amide")) return [];
  const extraCarbonIds = atomNeighbors(group.heteroAtomId, molecule)
    .map((neighbor) => neighbor.atomId)
    .filter((atomId) => {
      const atom = getAtom(atomId, molecule);
      if (!atom || !isCarbonAtom(atom)) return false;
      if (group.kind === "amide" && atomId === group.carbonId) return false;
      return !parentPath.includes(atomId);
    });
  const names = extraCarbonIds.map((atomId) => {
    const length = simpleAlkylLength(atomId, skeleton);
    return alkylNames[length] ?? "alquil";
  });
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return [...counts.entries()].map(([name, count]) => {
    if (count === 1) return `N-${name}`;
    const prefix = simplePrefixes[count] ?? `${count}`;
    return `${Array.from({ length: count }, () => "N").join(",")}-${prefix}${name}`;
  });
}

function analyzeFunctionalAcyclic(
  molecule: Molecule,
  skeleton: Molecule,
  groups: FunctionalGroup[],
  primaryKind: FunctionalGroupKind | undefined,
  enabledAliases: readonly string[] = [],
): Analysis {
  const adjacency = buildAdjacency(skeleton);
  const bondOrders = new Map(
    skeleton.bonds.map((bond) => [bondKey(bond[0], bond[1]), getBondOrder(bond)]),
  );
  const atomIds = skeleton.atoms.map((atom) => atom.id);
  const orientedPaths: number[][] = atomIds.map((atomId) => [atomId]);
  atomIds.forEach((start, startIndex) => {
    atomIds.slice(startIndex + 1).forEach((end) => {
      const path = pathBetween(start, end, adjacency);
      if (path.length > 1) orientedPaths.push(path, [...path].reverse());
    });
  });

  const candidates = orientedPaths.map((path) => {
    const pathSet = new Set(path);
    const carbonSubstituents: NamedSubstituent[] = [];
    const doubleBondLocants: number[] = [];
    const tripleBondLocants: number[] = [];
    path.slice(0, -1).forEach((atomId, index) => {
      const order = bondOrders.get(bondKey(atomId, path[index + 1])) ?? 1;
      if (order === 2) doubleBondLocants.push(index + 1);
      if (order === 3) tripleBondLocants.push(index + 1);
    });
    path.forEach((atomId, index) => {
      for (const neighbor of adjacency.get(atomId) ?? []) {
        if (pathSet.has(neighbor)) continue;
        const named = nameSubstituent(neighbor, atomId, adjacency);
        carbonSubstituents.push({ ...named, locant: index + 1 });
      }
    });
    const primaryLocants = primaryKind
      ? groups
          .filter((group) => group.kind === primaryKind)
          .map((group) => locantForGroup(group, path))
          .filter((locant): locant is number => Boolean(locant))
          .sort((a, b) => a - b)
      : [];
    const functionalPrefixes = functionalPrefixSubstituents(
      groups,
      path,
      primaryKind,
      molecule,
      skeleton,
    );
    return {
      path,
      carbonSubstituents,
      functionalPrefixes,
      substituents: [...carbonSubstituents, ...functionalPrefixes],
      doubleBondLocants,
      tripleBondLocants,
      multipleBondCount: doubleBondLocants.length + tripleBondLocants.length,
      primaryLocants,
    };
  });

  candidates.sort((left, right) => {
    if (left.primaryLocants.length !== right.primaryLocants.length) {
      return right.primaryLocants.length - left.primaryLocants.length;
    }
    if (left.multipleBondCount !== right.multipleBondCount) {
      return right.multipleBondCount - left.multipleBondCount;
    }
    if (left.path.length !== right.path.length) return right.path.length - left.path.length;
    const primaryComparison = compareNumberLists(left.primaryLocants, right.primaryLocants);
    if (primaryComparison !== 0) return primaryComparison;
    const multipleComparison = compareNumberLists(
      [...left.doubleBondLocants, ...left.tripleBondLocants].sort((a, b) => a - b),
      [...right.doubleBondLocants, ...right.tripleBondLocants].sort((a, b) => a - b),
    );
    if (multipleComparison !== 0) return multipleComparison;
    const doubleComparison = compareNumberLists(left.doubleBondLocants, right.doubleBondLocants);
    if (doubleComparison !== 0) return doubleComparison;
    const leftLocants = left.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const rightLocants = right.substituents.map((item) => item.locant).sort((a, b) => a - b);
    const locantComparison = compareNumberLists(leftLocants, rightLocants);
    return locantComparison || compareSubstituentAlphabeticalLocants(
      left.substituents,
      right.substituents,
      enabledAliases,
    );
  });

  const chosen = candidates[0];
  const baseHydrocarbonName = makeChainName(
    chosen.path.length,
    chosen.doubleBondLocants,
    chosen.tripleBondLocants,
  );
  const primaryGroups = primaryKind
    ? groups.filter((group) => group.kind === primaryKind && locantForGroup(group, chosen.path))
    : [];
  const primaryGroup = primaryGroups[0];
  const chainName = primaryKind
    ? makeFunctionalParentName(
        chosen.path.length,
        chosen.doubleBondLocants,
        chosen.tripleBondLocants,
        primaryKind,
        chosen.primaryLocants,
        primaryKind === "ester"
          ? primaryGroups.map((group) => esterAlkylName(group.alkylCarbonId, skeleton))
          : [],
      )
    : baseHydrocarbonName;
  let substituentParts = formatSubstituentGroups(chosen.substituents, enabledAliases);
  if (chosen.path.length === 1) {
    // Metano only has C1, so repeated 1,1- locants on substituent prefixes
    // provide no information and are omitted in the suggested name.
    substituentParts = substituentParts.map((part) => part.replace(/^1(?:,1)*-/, ""));
  } else if (
    chosen.path.length === 2
    && chosen.substituents.length === 1
    && chosen.substituents[0].locant === 1
  ) {
    substituentParts = substituentParts.map((part) => part.replace(/^1-/, ""));
  }
  substituentParts = sortFormattedPrefixParts([
    ...nitrogenSubstituentPrefixes(primaryGroup, chosen.path, molecule, skeleton),
    ...substituentParts,
  ]);
  const name = combinePrefixAndParent(substituentParts, chainName);

  return {
    name,
    commonName: name === "propan-2-ona" ? "acetona" : undefined,
    formula: molecularFormula(molecule),
    family: "acyclic",
    mainChain: chosen.path,
    chainName,
    substituents: chosen.substituents,
    numberedAtoms: new Map(chosen.path.map((atomId, index) => [atomId, index + 1])),
    doubleBondLocants: chosen.doubleBondLocants,
    tripleBondLocants: chosen.tripleBondLocants,
    functionalGroups: groups,
    primaryFunctionalGroup: primaryKind,
    primaryFunctionalLabel: primaryKind ? functionalGroupLabels[primaryKind] : undefined,
  };
}

function makeRingFunctionalParentName(
  ring: RingInfo,
  primaryKind: FunctionalGroupKind,
  locants: number[],
  groups: FunctionalGroup[],
  skeleton: Molecule,
  doubleBondLocants: number[],
  tripleBondLocants: number[],
) {
  const aromatic = ring.kind === "aromatic" && ring.atomIds.length === 6;
  const sortedLocants = [...locants].sort((a, b) => a - b);
  const locantText = sortedLocants.join(",");
  const count = sortedLocants.length;
  const locant = sortedLocants[0] ?? 1;
  const allGroupsOnRing = groups.length > 0 && groups.every((group) =>
    group.carbonIds.some((carbonId) => ring.atomIds.includes(carbonId)),
  );
  const esterAlkylNames = groups.map((group) => esterAlkylName(group.alkylCarbonId, skeleton));
  const esterAlkyl = formatEsterAlkylNames(esterAlkylNames);

  if (aromatic) {
    if (primaryKind === "alcohol" && allGroupsOnRing) {
      if (count === 1) return "fenol";
      if (count === ring.atomIds.length && sortedLocants.every((value, index) => value === index + 1)) {
        return `benceno${suffixMultiplier(count, "ol")}ol`;
      }
      return `benceno-${locantText}-${suffixMultiplier(count, "ol")}ol`;
    }
    if (primaryKind === "amine" && allGroupsOnRing) {
      // Anilina is a retained IUPAC parent name and gives clearer names for
      // substituted aromatic amines (for example 4-nitroanilina).
      return count === 1
        ? "anilina"
        : `benceno-${locantText}-${suffixMultiplier(count, "amina")}amina`;
    }
    if (primaryKind === "carboxylicAcid") {
      return count === 1
        ? "ácido benzoico"
        : `ácido benceno-${locantText}-${suffixMultiplier(count, "carboxílico")}carboxílico`;
    }
    if (primaryKind === "ester") {
      return count === 1
        ? `benzoato de ${esterAlkyl}`
        : `benceno-${locantText}-${suffixMultiplier(count, "carboxilato")}carboxilato de ${esterAlkyl}`;
    }
    if (primaryKind === "amide") {
      return count === 1
        ? "benzamida"
        : `benceno-${locantText}-${suffixMultiplier(count, "carboxamida")}carboxamida`;
    }
    if (primaryKind === "nitrile") {
      return count === 1
        ? "benzonitrilo"
        : `benceno-${locantText}-${suffixMultiplier(count, "carbonitrilo")}carbonitrilo`;
    }
    if (primaryKind === "aldehyde") {
      return count === 1
        ? "benzaldehído"
        : `benceno-${locantText}-${suffixMultiplier(count, "carbaldehído")}carbaldehído`;
    }
  }

  const base = unsaturatedRingBaseName(ring, doubleBondLocants, tripleBondLocants);
  const stem = base.endsWith("o") ? base.slice(0, -1) : base;
  if (!allGroupsOnRing) {
    if (primaryKind === "carboxylicAcid") {
      return count === 1
        ? `ácido ${stem}ocarboxílico`
        : `ácido ${base}-${locantText}-${suffixMultiplier(count, "carboxílico")}carboxílico`;
    }
    if (primaryKind === "ester") {
      return count === 1
        ? `${stem}ocarboxilato de ${esterAlkyl}`
        : `${base}-${locantText}-${suffixMultiplier(count, "carboxilato")}carboxilato de ${esterAlkyl}`;
    }
    if (primaryKind === "amide") {
      return count === 1
        ? `${stem}ocarboxamida`
        : `${base}-${locantText}-${suffixMultiplier(count, "carboxamida")}carboxamida`;
    }
    if (primaryKind === "nitrile") {
      return count === 1
        ? `${stem}ocarbonitrilo`
        : `${base}-${locantText}-${suffixMultiplier(count, "carbonitrilo")}carbonitrilo`;
    }
    if (primaryKind === "aldehyde") {
      return count === 1
        ? `${stem}ocarbaldehído`
        : `${base}-${locantText}-${suffixMultiplier(count, "carbaldehído")}carbaldehído`;
    }
  }
  if (count > 1) {
    if (primaryKind === "alcohol") return `${base}-${locantText}-${suffixMultiplier(count, "ol")}ol`;
    if (primaryKind === "ketone") return `${base}-${locantText}-${suffixMultiplier(count, "ona")}ona`;
    if (primaryKind === "amine") return `${base}-${locantText}-${suffixMultiplier(count, "amina")}amina`;
  }
  const hasUnsaturation = doubleBondLocants.length > 0 || tripleBondLocants.length > 0;
  if (primaryKind === "alcohol") return locant === 1 && !hasUnsaturation ? `${stem}ol` : `${stem}-${locant}-ol`;
  if (primaryKind === "ketone") return locant === 1 && !hasUnsaturation ? `${stem}ona` : `${stem}-${locant}-ona`;
  if (primaryKind === "amine") return `${stem}-${locant}-amina`;
  return base;
}

function aromaticFunctionalCommonName(chainName: string, substituents: NamedSubstituent[]) {
  if (substituents.length) return undefined;
  if (chainName === "bencenamina") return "anilina";
  if (chainName === "benceno-1,2-diol") return "catecol";
  if (chainName === "benceno-1,3-diol") return "resorcinol";
  if (chainName === "benceno-1,4-diol") return "hidroquinona";
  if (chainName === "benceno-1,3,5-triol") return "floroglucinol";
  return undefined;
}

function analyzeFunctionalRing(
  molecule: Molecule,
  skeleton: Molecule,
  groups: FunctionalGroup[],
  primaryKind: FunctionalGroupKind | undefined,
  baseAnalysis: Analysis,
  enabledAliases: readonly string[] = [],
): Analysis {
  const ring = skeleton.rings?.find(
    (candidate) => candidate.atomIds.some((atomId) => baseAnalysis.mainChain.includes(atomId)),
  );
  if (!ring) return { ...baseAnalysis, formula: molecularFormula(molecule), functionalGroups: groups };
  const candidates = ringCandidates(skeleton, ring, enabledAliases).map((candidate) => {
    const primaryLocants = primaryKind
      ? groups
          .filter((group) => group.kind === primaryKind)
          .map((group) => anchorLocantForGroup(group, candidate.path, skeleton))
          .filter((locant): locant is number => Boolean(locant))
          .sort((a, b) => a - b)
      : [];
    const claimedCarbonIds = new Set(groups.flatMap((group) => group.atomIds));
    const carbonSubstituents = candidate.substituents.filter(
      (substituent) => !substituent.atomIds.some((atomId) => claimedCarbonIds.has(atomId)),
    );
    const functionalPrefixes = functionalPrefixSubstituents(
      groups,
      candidate.path,
      primaryKind,
      molecule,
      skeleton,
    );
    return {
      ...candidate,
      primaryLocants,
      substituents: [...carbonSubstituents, ...functionalPrefixes],
    };
  });
  candidates.sort((left, right) => {
    if (left.primaryLocants.length !== right.primaryLocants.length) {
      return right.primaryLocants.length - left.primaryLocants.length;
    }
    const primaryComparison = compareNumberLists(left.primaryLocants, right.primaryLocants);
    if (primaryComparison !== 0) return primaryComparison;
    const multipleComparison = compareNumberLists(
      [...left.doubleBondLocants, ...left.tripleBondLocants].sort((a, b) => a - b),
      [...right.doubleBondLocants, ...right.tripleBondLocants].sort((a, b) => a - b),
    );
    if (multipleComparison !== 0) return multipleComparison;
    const locantComparison = compareNumberLists(
      left.substituents.map((item) => item.locant).sort((a, b) => a - b),
      right.substituents.map((item) => item.locant).sort((a, b) => a - b),
    );
    return locantComparison || compareSubstituentAlphabeticalLocants(
      left.substituents,
      right.substituents,
      enabledAliases,
    );
  });
  const chosen = candidates[0];
  const primaryGroups = primaryKind
    ? groups.filter((group) => group.kind === primaryKind)
    : [];
  const hydrocarbonBase = unsaturatedRingBaseName(
    ring,
    chosen.doubleBondLocants,
    chosen.tripleBondLocants,
  );
  const chainName = primaryKind
    ? makeRingFunctionalParentName(
        ring,
        primaryKind,
        chosen.primaryLocants,
        primaryGroups,
        skeleton,
        chosen.doubleBondLocants,
        chosen.tripleBondLocants,
      )
    : hydrocarbonBase;
  const singleSubstituent = chosen.substituents.length === 1
    ? resolveSubstituentNaming(chosen.substituents[0], new Set(enabledAliases))
    : undefined;
  const carbonAndFunctionalPrefixParts = !primaryKind && singleSubstituent
    ? [singleSubstituent.complex
        ? `(${singleSubstituent.name})`
        : singleSubstituent.name]
    : formatSubstituentGroups(chosen.substituents, enabledAliases);
  const ringPrefixParts = sortFormattedPrefixParts([
    ...nitrogenSubstituentPrefixes(primaryGroups[0], chosen.path, molecule, skeleton),
    ...carbonAndFunctionalPrefixParts,
  ]);
  const name = combinePrefixAndParent(ringPrefixParts, chainName);
  const commonName = ring.kind === "aromatic"
    ? aromaticFunctionalCommonName(chainName, chosen.substituents)
    : undefined;

  return {
    ...baseAnalysis,
    name,
    commonName,
    formula: molecularFormula(molecule),
    mainChain: chosen.path,
    chainName,
    substituents: chosen.substituents,
    numberedAtoms: new Map(chosen.path.map((atomId, index) => [atomId, index + 1])),
    doubleBondLocants: chosen.doubleBondLocants,
    tripleBondLocants: chosen.tripleBondLocants,
    functionalGroups: groups,
    primaryFunctionalGroup: primaryKind,
    primaryFunctionalLabel: primaryKind ? functionalGroupLabels[primaryKind] : undefined,
  };
}

export function analyzeMolecule(molecule: Molecule, enabledAliases: readonly string[] = []): Analysis {
  const skeleton = carbonSkeleton(molecule);
  const baseAnalysis = analyzeHydrocarbonMolecule(skeleton, enabledAliases);
  const groups = detectFunctionalGroups(molecule);
  if (!groups.length) {
    return { ...baseAnalysis, formula: molecularFormula(molecule), functionalGroups: [] };
  }
  const primaryKind = selectPrimaryFunctionalGroup(groups);
  if (skeleton.rings?.length) {
    return analyzeFunctionalRing(
      molecule,
      skeleton,
      groups,
      primaryKind,
      baseAnalysis,
      enabledAliases,
    );
  }
  return analyzeFunctionalAcyclic(molecule, skeleton, groups, primaryKind, enabledAliases);
}

function joinSpanishList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function locantPhrase(locants: number[]) {
  const unique = [...new Set(locants)].sort((left, right) => left - right);
  if (!unique.length) return "el localizador más bajo posible";
  return unique.length === 1
    ? `el localizador ${unique[0]}`
    : `los localizadores ${joinSpanishList(unique.map(String))}`;
}

function normalizeLocants(locants: number[]) {
  return [...new Set(locants)].sort((left, right) => left - right);
}

function reverseAtomLocants(locants: number[], chainLength: number) {
  return normalizeLocants(locants.map((locant) => chainLength + 1 - locant));
}

function reverseBondLocants(locants: number[], chainLength: number) {
  return normalizeLocants(locants.map((locant) => chainLength - locant));
}

function carbonLocantsText(locants: number[]) {
  const normalized = normalizeLocants(locants);
  if (!normalized.length) return "sin localizador";
  return normalized.map((locant) => `C${locant}`).join(", ");
}

function alkaneParentName(length: number) {
  return alkaneRoots[length] ? `${alkaneRoots[length]}ano` : `cadena de ${length} carbonos`;
}

function multipleBondLocantsText(doubleLocants: number[], tripleLocants: number[]) {
  const parts = [
    doubleLocants.length
      ? `C=C en ${carbonLocantsText(doubleLocants)}`
      : "",
    tripleLocants.length
      ? `C≡C en ${carbonLocantsText(tripleLocants)}`
      : "",
  ].filter(Boolean);
  return joinSpanishList(parts);
}

const spanishCardinals = [
  "cero",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
];

function spanishCardinal(count: number) {
  return spanishCardinals[count] ?? String(count);
}

function spanishStandaloneCardinal(count: number) {
  return count === 1 ? "uno" : spanishCardinal(count);
}

function substituentNoun(name: string) {
  return name.endsWith("il") ? `${name}o` : name;
}

function multiplicativeSubstituentName(name: string, count: number) {
  const isComplex = /[0-9(),]/.test(name);
  const prefix = isComplex ? complexPrefixes[count] : simplePrefixes[count];
  if (!prefix) return `${count} × ${name}`;
  return isComplex ? `${prefix}(${name})` : `${prefix}${name}`;
}

function naturalLocalizedSubstituent(name: string, locants: number[]) {
  const sortedLocants = [...locants].sort((left, right) => left - right);
  const noun = substituentNoun(name);
  if (sortedLocants.length === 1) {
    return `un ${noun} en C${sortedLocants[0]}`;
  }

  const locationCounts = new Map<number, number>();
  sortedLocants.forEach((locant) => {
    locationCounts.set(locant, (locationCounts.get(locant) ?? 0) + 1);
  });
  const locations = [...locationCounts.entries()];
  const multiplicativeName = multiplicativeSubstituentName(name, sortedLocants.length);
  const lead = `${spanishCardinal(sortedLocants.length)} grupos ${noun}`;

  if (locations.length === 1) {
    return `${lead} en C${locations[0][0]} (${multiplicativeName})`;
  }
  if (locations.every(([, count]) => count === 1)) {
    return `${lead} en ${joinSpanishList(locations.map(([locant]) => `C${locant}`))} (${multiplicativeName})`;
  }

  const distribution = locations.map(([locant, count]) =>
    `${spanishStandaloneCardinal(count)} en C${locant}`);
  return `${lead}: ${joinSpanishList(distribution)} (${multiplicativeName})`;
}

function extractComplexAlkylSubstituents(sourceName?: string | null) {
  if (!sourceName) return [];
  return [...sourceName.toLocaleLowerCase("es").matchAll(/\(([^()]+)\)/g)]
    .map((match) => match[1].replace(/\s+/g, ""))
    .filter((name) =>
      /\d/.test(name)
      && /(?:metil|etil|propil|butil|pentil|hexil|heptil|octil)$/.test(name)
      && !/(?:oxo|hidroxi|amino|fluoro|cloro|bromo|yodo)/.test(name));
}

function buildLocalizedSubstituentGroups(
  analysis: Analysis,
  enabledAliasSet: ReadonlySet<string>,
) {
  const groups = new Map<string, { name: string; sortName: string; locants: number[] }>();
  analysis.substituents.forEach((substituent) => {
    const resolved = resolveSubstituentNaming(substituent, enabledAliasSet);
    const key = `${resolved.sortName}:${resolved.name}`;
    const current = groups.get(key) ?? {
      name: resolved.name,
      sortName: resolved.sortName,
      locants: [],
    };
    current.locants.push(substituent.locant);
    groups.set(key, current);
  });
  return groups;
}

export function buildIupacReasoningSteps(
  molecule: Molecule,
  analysis: Analysis,
  enabledAliases: readonly string[] = [],
  sourceName?: string | null,
): IupacReasoningStep[] {
  if (sourceName && usesNitrogenLocants(sourceName)) {
    const normalizedSource = sourceName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
    const principalGroup = /(?:amida|amide)/.test(normalizedSource) ? "amida" : "amina";
    const nestedExplanation = sourceName.includes("(")
      ? " Los paréntesis mantienen unido el sustituyente complejo para que se interprete como una sola rama."
      : "";

    return [
      {
        number: "01",
        title: "Grupo funcional principal",
        explanation: `OPSIN identifica la ${principalGroup} y conserva el nitrógeno como centro funcional del nombre.`,
      },
      {
        number: "02",
        title: "Cadena principal o anillo",
        explanation: "El motor interpreta simultáneamente la cadena principal, los ciclos y las ramas, sin convertir automáticamente un grupo unido al nitrógeno en parte de la cadena principal.",
      },
      {
        number: "04",
        title: "Sustituyentes y localizadores",
        explanation: `El localizador N- indica que el sustituyente está enlazado directamente al nitrógeno y no a un carbono numerado.${nestedExplanation}`,
      },
    ];
  }

  const steps: IupacReasoningStep[] = [];
  const isRingStructure = analysis.family !== "acyclic";
  const chainLength = analysis.mainChain.length;
  const hasMultipleBonds = analysis.doubleBondLocants.length > 0
    || analysis.tripleBondLocants.length > 0;
  const enabledAliasSet = new Set(enabledAliases);
  const substituentGroups = buildLocalizedSubstituentGroups(analysis, enabledAliasSet);
  const localizedSubstituents = [...substituentGroups.values()]
    .sort((left, right) => Math.min(...left.locants) - Math.min(...right.locants))
    .map((group) => naturalLocalizedSubstituent(group.name, group.locants));
  const complexAlkylSubstituents = extractComplexAlkylSubstituents(sourceName);
  const normalizedResultName = analysis.name.toLocaleLowerCase("es").replace(/\s+/g, "");
  const reclassifiedComplexSubstituents = complexAlkylSubstituents.filter(
    (name) => !normalizedResultName.includes(name),
  );
  const primaryKind = analysis.primaryFunctionalGroup;
  const primaryGroups = primaryKind
    ? analysis.functionalGroups.filter((group) => group.kind === primaryKind)
    : [];
  const primaryLocants = normalizeLocants(primaryGroups.flatMap((group) => group.carbonIds
    .map((atomId) => analysis.numberedAtoms.get(atomId))
    .filter((locant): locant is number => Boolean(locant))));
  const terminalCarbonFunctions = new Set<FunctionalGroupKind>([
    "carboxylicAcid",
    "ester",
    "amide",
    "nitrile",
    "aldehyde",
  ]);

  if (primaryKind && analysis.primaryFunctionalLabel) {
    const detectedLabels = [...new Set(analysis.functionalGroups.map((group) => group.label.toLowerCase()))];
    const priorityLead = detectedLabels.length > 1
      ? `Entre ${joinSpanishList(detectedLabels)}, ${analysis.primaryFunctionalLabel.toLowerCase()} tiene la prioridad más alta.`
      : `Se identifica ${analysis.primaryFunctionalLabel.toLowerCase()} como el grupo de mayor prioridad.`;
    let positionRule: string;
    if (terminalCarbonFunctions.has(primaryKind)) {
      positionRule = `El carbono propio de esta función forma parte del esqueleto principal y se fija como C1.`;
    } else if (primaryKind === "ketone" && primaryLocants.some((locant) => locant > 1)) {
      positionRule = `El carbonilo es interno: no puede convertirse mecánicamente en C1 sin cortar una de las continuaciones de la cadena. Debe recibir el menor localizador posible; aquí queda en ${carbonLocantsText(primaryLocants)}.`;
    } else {
      positionRule = `Esta función no obliga automáticamente a usar C1. El carbono que la porta debe recibir el menor localizador que permita la cadena principal; aquí recibe ${locantPhrase(primaryLocants)}.`;
    }
    steps.push({
      number: "01",
      title: "Grupo funcional principal",
      explanation: `${priorityLead} Aporta el sufijo del nombre. ${positionRule}`,
    });
  }

  let parentExplanation: string;
  if (analysis.family === "aromatic") {
    parentExplanation = `Se elige el anillo aromático de ${chainLength} carbonos que contiene la función prioritaria cuando existe. La elección se hace por conectividad, no por la orientación visual del dibujo, y aporta el nombre base ${analysis.chainName}.`;
  } else if (analysis.family === "polycyclic") {
    parentExplanation = `Se comparan los anillos del sistema y se elige como principal el que conserva la función prioritaria y el mayor número de conexiones. El esqueleto seleccionado aporta ${analysis.chainName}.`;
  } else if (analysis.family === "cycloalkane") {
    parentExplanation = `Se elige el anillo continuo de ${chainLength} carbonos${analysis.primaryFunctionalLabel ? ` que contiene el grupo ${analysis.primaryFunctionalLabel.toLowerCase()}` : ""}. Este anillo aporta el nombre base ${analysis.chainName}.`;
  } else {
    const totalCarbons = molecule.atoms.filter(isCarbonAtom).length;
    const parentSkeleton = alkaneParentName(chainLength);
    const shorterSkeleton = chainLength > 1 ? alkaneParentName(chainLength - 1) : "";
    const hasComplexReclassification = reclassifiedComplexSubstituents.length > 0
      && localizedSubstituents.length > 0;
    const hiddenChainReason = hasComplexReclassification
      ? " La cadena principal no se conserva solo porque así aparecía escrita en el nombre ingresado: el motor compara también las rutas que atraviesan las ramificaciones."
      : totalCarbons > chainLength && chainLength > 1
      ? ` Al recorrer también las ramificaciones aparece esta ruta más larga: una ruta de ${chainLength - 1} carbonos (${shorterSkeleton}) se descarta si existe una ruta continua de ${chainLength} (${parentSkeleton}). Ese cambio de cadena principal modifica todos los localizadores.`
      : " La cadena principal no se decide por la línea que parece más evidente en el dibujo: el motor compara todas las rutas continuas.";
    const substituentLocants = analysis.substituents
      .map((substituent) => substituent.locant)
      .sort((left, right) => left - right);
    const complexReclassificationReason = hasComplexReclassification
      ? ` Se encontró ${reclassifiedComplexSubstituents.length === 1 ? "un sustituyente complejo" : "más de un sustituyente complejo"} (${joinSpanishList(reclassifiedComplexSubstituents)}) que pudo simplificarse. Al extender la cadena desde ${reclassifiedComplexSubstituents.length === 1 ? "ese sustituyente" : "esos sustituyentes"}, sus carbonos no desaparecen: el motor elige otra ruta continua y reordena los restantes. El nombre resultó ser ${parentSkeleton} (${chainLength} carbonos) con ${joinSpanishList(localizedSubstituents)}; el conjunto de localizadores ${substituentLocants.join(",")} es el más bajo posible.`
      : "";
    parentExplanation = `Se elige la cadena continua más larga que contiene la función prioritaria cuando existe. La ruta seleccionada tiene ${chainLength} carbonos y su esqueleto es ${parentSkeleton}; por eso el nombre base resultante es ${analysis.chainName}.${hiddenChainReason}${complexReclassificationReason}`;
  }
  steps.push({
    number: "02",
    title: isRingStructure ? "Anillo principal" : "Cadena principal",
    explanation: parentExplanation,
  });

  if (primaryKind || hasMultipleBonds || analysis.substituents.length) {
    const explanationParts = [
      "Se comparan ambos extremos en este orden: primero la función principal, después los enlaces múltiples y, solo si continúa el empate, los sustituyentes.",
    ];
    if (isRingStructure) {
      explanationParts.push(
        `En el anillo se eligen el punto de inicio y el sentido que respetan esa jerarquía${primaryLocants.length ? `; la función principal queda en ${carbonLocantsText(primaryLocants)}` : ""}.`,
      );
    } else {
      const reversedPrimaryLocants = reverseAtomLocants(primaryLocants, chainLength);
      const chosenDoubleLocants = normalizeLocants(analysis.doubleBondLocants);
      const chosenTripleLocants = normalizeLocants(analysis.tripleBondLocants);
      const reversedDoubleLocants = reverseBondLocants(chosenDoubleLocants, chainLength);
      const reversedTripleLocants = reverseBondLocants(chosenTripleLocants, chainLength);
      const chosenMultipleLocants = normalizeLocants([...chosenDoubleLocants, ...chosenTripleLocants]);
      const reversedMultipleLocants = normalizeLocants([...reversedDoubleLocants, ...reversedTripleLocants]);
      const chosenSubstituentLocants = [...analysis.substituents]
        .map((substituent) => substituent.locant)
        .sort((left, right) => left - right);
      const reversedSubstituentLocants = reverseAtomLocants(chosenSubstituentLocants, chainLength);
      let hierarchyResolved = false;

      if (primaryKind && primaryLocants.length) {
        const primaryComparison = compareNumberLists(primaryLocants, reversedPrimaryLocants);
        if (primaryComparison < 0) {
          explanationParts.push(
            `La función principal resuelve la orientación: queda en ${carbonLocantsText(primaryLocants)}, mientras que desde el extremo contrario quedaría en ${carbonLocantsText(reversedPrimaryLocants)}. Se conserva el conjunto menor; los enlaces múltiples y sustituyentes no pueden invertir esta decisión.`,
          );
          hierarchyResolved = true;
        } else if (primaryComparison === 0) {
          explanationParts.push(
            `La función principal empata desde ambos extremos en ${carbonLocantsText(primaryLocants)}; por eso se pasa al criterio siguiente.`,
          );
        }
      }

      if (!hierarchyResolved && hasMultipleBonds) {
        const multipleComparison = compareNumberLists(chosenMultipleLocants, reversedMultipleLocants);
        const doubleComparison = multipleComparison === 0
          ? compareNumberLists(chosenDoubleLocants, reversedDoubleLocants)
          : 0;
        if (multipleComparison < 0 || doubleComparison < 0) {
          explanationParts.push(
            `Los enlaces múltiples rompen el empate: esta orientación da ${multipleBondLocantsText(chosenDoubleLocants, chosenTripleLocants)}, frente a ${multipleBondLocantsText(reversedDoubleLocants, reversedTripleLocants)} desde el otro extremo.${multipleComparison === 0 && doubleComparison < 0 ? " Al empatar el conjunto global, el doble enlace recibe el localizador menor." : ""}`,
          );
          hierarchyResolved = true;
        } else if (multipleComparison === 0 && doubleComparison === 0) {
          explanationParts.push(
            `Los enlaces múltiples también empatan: ${multipleBondLocantsText(chosenDoubleLocants, chosenTripleLocants)} desde cualquiera de los extremos.`,
          );
        }
      }

      if (!hierarchyResolved && chosenSubstituentLocants.length) {
        const substituentComparison = compareNumberLists(
          chosenSubstituentLocants,
          reversedSubstituentLocants,
        );
        if (substituentComparison < 0) {
          explanationParts.push(
            `Finalmente, los sustituyentes deciden: el conjunto ${chosenSubstituentLocants.join(",")} es menor que ${reversedSubstituentLocants.join(",")} desde el extremo contrario.`,
          );
          hierarchyResolved = true;
        } else if (substituentComparison === 0) {
          explanationParts.push("Los sustituyentes conservan el mismo conjunto de localizadores desde ambos extremos.");
        }
      }

      if (!hierarchyResolved && !primaryKind && !hasMultipleBonds && !chosenSubstituentLocants.length) {
        explanationParts.push("Ambos extremos son equivalentes para esta estructura.");
      }
    }
    steps.push({
      number: "03",
      title: "Numeración razonada",
      explanation: explanationParts.join(" "),
    });
  }

  if (localizedSubstituents.length) {
    const hierarchyReminder = primaryKind || hasMultipleBonds
      ? "Se consideran después de la función principal y de los enlaces múltiples; solo rompen un empate previo."
      : "Al no existir una función principal ni enlaces múltiples, este conjunto define el sentido de numeración.";
    steps.push({
      number: "04",
      title: "Sustituyentes y localizadores",
      explanation: `Con la orientación ya evaluada, ${analysis.substituents.length === 1 ? "se ubica" : "se ubican"} ${joinSpanishList(localizedSubstituents)}. ${hierarchyReminder}`,
    });
  }

  if (substituentGroups.size > 1) {
    const alphabeticalNames = [...substituentGroups.values()]
      .sort((left, right) => compareAlphabeticalNames(left.sortName, right.sortName))
      .map((group) => group.name);
    steps.push({
      number: "05",
      title: "Orden alfabético",
      explanation: `Los sustituyentes se escriben como ${alphabeticalNames.join(" → ")}. Para ordenar se ignoran di-, tri-, tetra-, sec- y tert-.`,
    });
  }

  const stereoDescriptors = getMainChainStereoDescriptors(molecule, analysis.mainChain);
  if (stereoDescriptors.length) {
    const descriptorDetails = stereoDescriptors.map((descriptor) => {
      const geometry = descriptor.configuration === "E"
        ? "lados opuestos"
        : "el mismo lado";
      return `C${descriptor.locant}=C${descriptor.locant + 1} es ${descriptor.locant}${descriptor.configuration}: los sustituyentes de mayor prioridad quedan en ${geometry}`;
    });
    steps.push({
      number: "06",
      title: "Estereoquímica (E/Z o R/S)",
      explanation: `Se aplican las reglas CIP. ${descriptorDetails.join("; ")}.`,
    });
  }

  return steps;
}

function buildEnglishReasoningSteps(
  steps: IupacReasoningStep[],
  molecule: Molecule,
  analysis: Analysis,
): IupacReasoningStep[] {
  const englishName = translateSpanishIupacToOpsin(analysis.name) || analysis.name;
  const parentName = translateSpanishIupacToOpsin(analysis.chainName) || analysis.chainName;
  const primaryLabel = analysis.primaryFunctionalLabel
    ? uiText("en", analysis.primaryFunctionalLabel)
    : undefined;
  const substituentList = analysis.substituents
    .map((item) => `${item.locant}-${translateSpanishIupacToOpsin(item.name) || item.name}`)
    .join(", ");
  const multipleBonds = [
    ...analysis.doubleBondLocants.map((locant) => `C${locant}=C${locant + 1}`),
    ...analysis.tripleBondLocants.map((locant) => `C${locant}≡C${locant + 1}`),
  ];

  return steps.map((step) => {
    let explanation: string;
    if (step.number === "01") {
      explanation = primaryLabel
        ? `${primaryLabel} has the highest naming priority among the detected functional groups. It determines the suffix, and the parent skeleton is numbered to give this function the lowest permitted locant.`
        : "Functional-group priority is checked before the parent skeleton is numbered.";
    } else if (step.number === "02") {
      const family = analysis.family === "aromatic"
        ? "aromatic ring"
        : analysis.family === "cycloalkane"
          ? "ring"
          : analysis.family === "polycyclic"
            ? "ring system"
            : "continuous carbon chain";
      explanation = `The ${family} chosen as the parent contains ${analysis.mainChain.length} carbon${analysis.mainChain.length === 1 ? "" : "s"}. The parent name is ${parentName}; the complete IUPAC name is ${englishName}.`;
    } else if (step.number === "03") {
      const unsaturation = multipleBonds.length
        ? ` Multiple bonds are located at ${multipleBonds.join(", ")}.`
        : "";
      explanation = primaryLabel
        ? `Numbering is chosen to give the principal group (${primaryLabel}) the lowest permitted locant. If both directions remain equivalent, multiple bonds are considered next, followed by substituents at the first point of difference.${unsaturation}`
        : `Numbering is chosen from the end that gives the lowest locant at the first point of difference. Multiple bonds are considered before substituents.${unsaturation}`;
    } else if (step.number === "04") {
      explanation = substituentList
        ? `Substituent names and locants are assigned from the numbered parent skeleton: ${substituentList}. Multiplicative prefixes such as di-, tri-, and tetra- are used when the same substituent occurs more than once.`
        : "No carbon substituents need to be added to the parent name.";
    } else if (step.number === "05") {
      const names = [...new Set(analysis.substituents.map((item) =>
        translateSpanishIupacToOpsin(item.name) || item.name,
      ))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
      explanation = names.length
        ? `Different substituent names are written in alphabetical order: ${names.join(" → ")}. Multiplicative prefixes such as di-, tri-, and tetra- do not control alphabetization.`
        : "Substituent prefixes are ordered alphabetically when more than one different substituent is present.";
    } else {
      const descriptors = getMainChainStereoDescriptors(molecule, analysis.mainChain);
      explanation = descriptors.length
        ? `CIP priority rules are applied to each stereogenic double bond. ${descriptors.map((descriptor) => `${descriptor.locant}${descriptor.configuration} identifies the relative position of the higher-priority substituents`).join("; ")}.`
        : "Stereochemical descriptors are assigned from molecular geometry using CIP priority rules when the structure requires them.";
    }

    return {
      ...step,
      title: englishReasoningTitle(step.title),
      explanation,
    };
  });
}

const directionOptions = [
  { label: "Arriba", symbol: "↑", dx: 0, dy: -1, className: "north" },
  { label: "Izquierda", symbol: "←", dx: -1, dy: 0, className: "west" },
  { label: "Derecha", symbol: "→", dx: 1, dy: 0, className: "east" },
  { label: "Abajo", symbol: "↓", dx: 0, dy: 1, className: "south" },
];

const ALKYL_TEMPLATES: AlkylTemplate[] = [
  {
    id: "methyl",
    label: "Metil",
    systematic: "metil",
    formula: "–CH₃",
    atoms: [{ x: 1, y: 0 }],
    connections: [[-1, 0]],
  },
  {
    id: "ethyl",
    label: "Etil",
    systematic: "etil",
    formula: "–CH₂CH₃",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    connections: [[-1, 0], [0, 1]],
  },
  {
    id: "propyl",
    label: "Propil",
    systematic: "propan-1-il",
    formula: "–(CH₂)₂CH₃",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    connections: [[-1, 0], [0, 1], [1, 2]],
  },
  {
    id: "butyl",
    label: "Butil",
    systematic: "butan-1-il",
    formula: "–(CH₂)₃CH₃",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }],
    connections: [[-1, 0], [0, 1], [1, 2], [2, 3]],
  },
  {
    id: "isopropyl",
    label: "Isopropil",
    systematic: "1-metiletil · propan-2-il",
    formula: "–CH(CH₃)₂",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }],
    connections: [[-1, 0], [0, 1], [0, 2]],
  },
  {
    id: "isobutyl",
    label: "Isobutil",
    systematic: "2-metilpropil",
    formula: "–CH₂CH(CH₃)₂",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: -1 }, { x: 3, y: 1 }],
    connections: [[-1, 0], [0, 1], [1, 2], [1, 3]],
  },
  {
    id: "sec-butyl",
    label: "Sec-butil",
    systematic: "butan-2-il",
    formula: "–CH(CH₃)CH₂CH₃",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    connections: [[-1, 0], [0, 1], [0, 2], [2, 3]],
  },
  {
    id: "tert-butyl",
    label: "Terc-butil",
    systematic: "1,1-dimetiletil",
    formula: "–C(CH₃)₃",
    atoms: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 1 }],
    connections: [[-1, 0], [0, 1], [0, 2], [0, 3]],
  },
];

function getDisplayPosition(atom: CarbonAtom, viewMode: ViewMode, preserveGeometry = false) {
  // Open skeletal chains are laid out from graph connectivity by
  // buildOpenChainSkeletalPositions(). This direct projection is retained for
  // condensed mode and ring structures, whose imported geometry is preserved.
  void viewMode;
  void preserveGeometry;
  return { x: atom.x * 130, y: atom.y * 106 };
}

export function canvasCoordinateScaleForCarbonCount(carbonCount: number) {
  if (carbonCount <= 10) return 1;
  if (carbonCount <= 20) return 0.78;
  if (carbonCount <= 50) return 0.5;
  return 0.36;
}

function ringIconPoints(size: number) {
  return Array.from({ length: size }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / size;
    return `${24 + Math.cos(angle) * 16},${24 + Math.sin(angle) * 16}`;
  }).join(" ");
}

function getHistoryVisitorId() {
  const storageKey = "organic-lab-visitor-id";
  const current = window.localStorage.getItem(storageKey);
  if (current && /^[a-zA-Z0-9_-]{20,90}$/.test(current)) return current;

  const generated = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `lab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

function formatHistoryDate(value: string, language: AppLanguage = "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === "en" ? "Saved recently" : "Guardado recientemente";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mergeHistoryEntry(items: HistoryEntry[], next: HistoryEntry, limit = 50) {
  return [next, ...items.filter((item) => item.id !== next.id)]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, limit);
}

type LocalLibraryState = {
  draft: HistoryEntry | null;
  history: HistoryEntry[];
  saved: HistoryEntry[];
};

type LocalLibraryWritePayload = {
  name: string;
  formula: string;
  family: string;
  molecule: Molecule;
  viewMode: ViewMode;
  updateDraft?: boolean;
};

const localLibraryStorageKey = "organic-lab-history-v1";
function usesLocalLibrary() {
  return window.location.hostname.endsWith(".github.io")
    || window.location.protocol === "file:";
}

async function resolveNameStructure(name: string): Promise<NameStructureResolution> {
  if (!usesLocalLibrary()) {
    try {
      const response = await fetch("/api/name-to-structure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json() as NameStructureResolution & { error?: string };
      if (response.ok && data.smiles) return data;
    } catch {
      // The direct public OPSIN request below also works if the Sites route is
      // temporarily unavailable.
    }
  }

  const directResult = await resolveNameWithOpsin(name);
  if (directResult.ok) return directResult.value;
  throw new Error(directResult.error);
}

const COMPLEX_NAME_LIMIT_MESSAGE = "El motor no puede interpretar heterociclos o aminas complejas en este momento.";
const COMPLEX_NAME_UNAVAILABLE_MESSAGE = "Nombre no disponible para estructuras complejas";
const STEREOCHEMISTRY_STORAGE_KEY = "hydrocarbon-lab-show-stereochemistry";

export function localNamerCannotSafelyName(molecule: Molecule, analysis: Analysis) {
  const parentAtoms = new Set(analysis.mainChain);
  if (!parentAtoms.size) return false;

  // The local namer is reliable when a secondary functional group is directly
  // on the chosen parent skeleton. Once that group lives inside a carbon
  // substituent, it needs its own substituent numbering (e.g. 2-oxopropyl).
  // Returning an incomplete parent-only name is worse than explicitly saying
  // that this structure is outside the local naming grammar.
  return analysis.functionalGroups.some((group) => {
    if (!group.carbonIds.length) return false;
    const directlyOnParent = group.carbonIds.some((carbonId) => parentAtoms.has(carbonId));
    if (directlyOnParent) return false;

    // Ring carboxylic derivatives are deliberately named from an exocyclic
    // carbonyl carbon (benzoic acid, carboxamide, carbaldehyde, etc.), so that
    // case is supported even though the functional carbon is not a ring atom.
    const supportedExocyclicRingSuffix = analysis.family !== "acyclic"
      && group.kind === analysis.primaryFunctionalGroup
      && (group.kind === "carboxylicAcid"
        || group.kind === "ester"
        || group.kind === "amide"
        || group.kind === "nitrile"
        || group.kind === "aldehyde");
    if (supportedExocyclicRingSuffix) return false;

    return true;
  });
}

function usesNitrogenLocants(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("es");
  return /(?:amina|amine|amida|amide|anilina|aniline)/.test(normalized)
    && /(^|[-,(])n(?=[,-])/.test(normalized);
}

function readLocalLibrary(): LocalLibraryState {
  try {
    const stored = window.localStorage.getItem(localLibraryStorageKey);
    if (!stored) return { draft: null, history: [], saved: [] };
    const parsed = JSON.parse(stored) as Partial<LocalLibraryState>;
    return {
      draft: parsed.draft?.molecule?.atoms?.length ? parsed.draft : null,
      history: Array.isArray(parsed.history)
        ? parsed.history.filter((entry) => entry?.molecule?.atoms?.length).slice(0, 50)
        : [],
      saved: Array.isArray(parsed.saved)
        ? parsed.saved.filter((entry) => entry?.molecule?.atoms?.length).slice(0, 200)
        : [],
    };
  } catch {
    return { draft: null, history: [], saved: [] };
  }
}

function writeLocalLibrary(state: LocalLibraryState) {
  window.localStorage.setItem(localLibraryStorageKey, JSON.stringify(state));
}

function makeLocalEntry(payload: LocalLibraryWritePayload, existing?: HistoryEntry) {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? (window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
    name: payload.name,
    formula: payload.formula,
    family: payload.family,
    molecule: cloneMolecule(payload.molecule),
    viewMode: payload.viewMode,
    atomCount: payload.molecule.atoms.length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  } satisfies HistoryEntry;
}

function findMatchingLocalEntry(items: HistoryEntry[], payload: LocalLibraryWritePayload) {
  const signature = JSON.stringify({ molecule: payload.molecule, viewMode: payload.viewMode });
  return items.find((entry) => JSON.stringify({
    molecule: entry.molecule,
    viewMode: entry.viewMode,
  }) === signature);
}

function saveLocalHistoryEntry(payload: LocalLibraryWritePayload) {
  const state = readLocalLibrary();
  const entry = makeLocalEntry(payload, findMatchingLocalEntry(state.history, payload));
  writeLocalLibrary({
    ...state,
    history: mergeHistoryEntry(state.history, entry),
    draft: payload.updateDraft === false ? state.draft : entry,
  });
  return entry;
}

function saveLocalSavedEntry(payload: LocalLibraryWritePayload) {
  const state = readLocalLibrary();
  const entry = makeLocalEntry(payload, findMatchingLocalEntry(state.saved, payload));
  writeLocalLibrary({
    ...state,
    saved: mergeHistoryEntry(state.saved, entry, 200),
  });
  return entry;
}

function removeLocalLibraryEntry(id: string, section: LibrarySection) {
  const state = readLocalLibrary();
  writeLocalLibrary(section === "history"
    ? {
        ...state,
        draft: state.draft?.id === id ? null : state.draft,
        history: state.history.filter((entry) => entry.id !== id),
      }
    : {
        ...state,
        saved: state.saved.filter((entry) => entry.id !== id),
      });
}

function clearLocalHistoryEntries() {
  const state = readLocalLibrary();
  writeLocalLibrary({
    ...state,
    history: [],
  });
}

function toPortableStructure(entry: HistoryEntry): PortableStructure {
  return {
    name: entry.name,
    formula: entry.formula,
    family: entry.family,
    molecule: cloneMolecule(entry.molecule),
    viewMode: entry.viewMode,
    atomCount: entry.atomCount,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function safeChemistryFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return normalized || "estructura-organica";
}

function downloadChemistryDocument(document: ChemistryDocument, fileName: string) {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeChemistryFileName(fileName)}.quimica`;
  anchor.style.display = "none";
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function downloadSmilesFile(smiles: string, fileName: string) {
  const blob = new Blob([`${smiles.trim()}\n`], {
    type: "chemical/x-daylight-smiles;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeChemistryFileName(fileName)}.smi`;
  anchor.style.display = "none";
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function isPortableStructure(value: unknown): value is PortableStructure {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PortableStructure>;
  return (
    typeof item.name === "string"
    && typeof item.formula === "string"
    && typeof item.family === "string"
    && (item.viewMode === "condensed" || item.viewMode === "skeletal")
    && typeof item.atomCount === "number"
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string"
    && Boolean(item.molecule)
    && Array.isArray(item.molecule?.atoms)
    && Array.isArray(item.molecule?.bonds)
  );
}

function readChemistryDocument(value: unknown): PortableStructure[] {
  if (!value || typeof value !== "object") {
    throw new Error("El archivo no contiene un documento químico válido.");
  }
  const document = value as Partial<ChemistryDocument>;
  if (document.format !== "laboratorio-quimica-organica" || document.version !== 1) {
    throw new Error("Este archivo no pertenece a una versión compatible del laboratorio.");
  }

  const structures = document.kind === "structure"
    ? document.structure ? [document.structure] : []
    : document.kind === "library" && Array.isArray(document.structures)
      ? document.structures.slice(0, 50)
      : [];

  if (!structures.length || !structures.every(isPortableStructure)) {
    throw new Error("El documento no contiene estructuras orgánicas válidas.");
  }
  return structures;
}

function MoleculeHistoryPreview({
  molecule,
  width: previewWidth = 120,
  height: previewHeight = 64,
}: {
  molecule: Molecule;
  width?: number;
  height?: number;
}) {
  const minX = Math.min(...molecule.atoms.map((atom) => atom.x));
  const maxX = Math.max(...molecule.atoms.map((atom) => atom.x));
  const minY = Math.min(...molecule.atoms.map((atom) => atom.y));
  const maxY = Math.max(...molecule.atoms.map((atom) => atom.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min((previewWidth - 26) / width, (previewHeight - 16) / height, 25);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const positions = new Map(
    molecule.atoms.map((atom) => [
      atom.id,
      {
        x: previewWidth / 2 + (atom.x - centerX) * scale,
        y: previewHeight / 2 + (atom.y - centerY) * scale,
      },
    ]),
  );

  return (
    <svg
      className="history-molecule-preview"
      viewBox={`0 0 ${previewWidth} ${previewHeight}`}
      aria-hidden="true"
    >
      {molecule.bonds.flatMap((bond) => {
        const start = positions.get(bond[0]);
        const end = positions.get(bond[1]);
        if (!start || !end) return [];
        const order = getBondOrder(bond);
        const deltaX = end.x - start.x;
        const deltaY = end.y - start.y;
        const length = Math.hypot(deltaX, deltaY) || 1;
        const normalX = -deltaY / length;
        const normalY = deltaX / length;
        const offsets = order === 1 ? [0] : order === 2 ? [-2, 2] : [-3, 0, 3];
        return offsets.map((offset, index) => (
          <line
            key={`${bond[0]}-${bond[1]}-${index}`}
            x1={start.x + normalX * offset}
            y1={start.y + normalY * offset}
            x2={end.x + normalX * offset}
            y2={end.y + normalY * offset}
          />
        ));
      })}
      {molecule.atoms.map((atom) => {
        const position = positions.get(atom.id)!;
        const element = atom.element ?? "C";
        const chargeText = atom.charge === 1 ? "+" : atom.charge === -1 ? "−" : "";
        return (
          <g key={atom.id} transform={`translate(${position.x} ${position.y})`}>
            <circle className={element === "C" ? "history-carbon" : "history-hetero"} r={element === "C" ? 3.5 : 7} />
            {element !== "C" && (
              <text textAnchor="middle" dominantBaseline="central">{element}{chargeText}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [language, setLanguage] = useState<AppLanguage>(() => detectInitialLanguage());
  const t = (spanish: string) => uiText(language, spanish);
  const localizedIupac = (name: string) => {
    if (name === COMPLEX_NAME_UNAVAILABLE_MESSAGE) return t(COMPLEX_NAME_UNAVAILABLE_MESSAGE);
    return language === "en" ? translateSpanishIupacToOpsin(name) || name : name;
  };
  const localizedCommonAlkylName = (name: string) => {
    if (language === "es") return name;
    const commonNames: Record<string, string> = {
      isopropil: "isopropyl",
      isobutil: "isobutyl",
      "sec-butil": "sec-butyl",
      "terc-butil": "tert-butyl",
    };
    return commonNames[name.toLocaleLowerCase("es")] ?? localizedIupac(name);
  };
  const localizedDynamicText = (value: string | null | undefined) => {
    const source = value ?? "";
    if (!source || language === "es") return source;

    const continuing = source.match(/^Continuamos donde quedaste: (.+)\.$/);
    if (continuing) return `Continuing where you left off: ${localizedIupac(continuing[1])}.`;

    const updatedMolecule = source.match(/^Molécula actualizada: (.+)\.$/);
    if (updatedMolecule) return `Molecule updated: ${localizedIupac(updatedMolecule[1])}.`;

    const saved = source.match(/^(.+) quedó añadido a Guardados\.$/);
    if (saved) return `${localizedIupac(saved[1])} was added to Saved.`;

    const removedHistory = source.match(/^(.+) se eliminó del historial\.$/);
    if (removedHistory) return `${localizedIupac(removedHistory[1])} was removed from history.`;

    const removedSaved = source.match(/^(.+) se eliminó de Guardados\.$/);
    if (removedSaved) return `${localizedIupac(removedSaved[1])} was removed from Saved.`;

    const imported = source.match(/^(.+) se importó desde (.+) y está lista para editar\.$/);
    if (imported) return `${localizedIupac(imported[1])} was imported from ${imported[2]} and is ready to edit.`;

    const terminalRequirement = source.match(/^(.+) requiere un carbono terminal: selecciona un CH₃ del extremo de la cadena\.$/);
    if (terminalRequirement) return `${t(terminalRequirement[1])} requires a terminal carbon: select a CH₃ at the end of the chain.`;

    const internalRequirement = source.match(/^(.+) requiere un carbono interno unido por enlaces simples a otros dos carbonos\.$/);
    if (internalRequirement) return `${t(internalRequirement[1])} requires an internal carbon connected by single bonds to two other carbons.`;

    const selectedBond = source.match(/^Enlace (simple|doble|triple) seleccionado\. Añade un carbono o pulsa un enlace dibujado para cambiarlo\.$/);
    if (selectedBond) return `${t(selectedBond[1])[0].toUpperCase()}${t(selectedBond[1]).slice(1)} bond selected. Add a carbon or tap a drawn bond to change it.`;

    const selectedAtomNotice = source.match(/^(Carbono|Oxígeno|Nitrógeno|Flúor|Cloro|Bromo|Yodo) (.+) seleccionado\.$/);
    if (selectedAtomNotice) return `${t(selectedAtomNotice[1])} ${selectedAtomNotice[2]} selected.`;

    const restored = source.match(/^Estructura recuperada de (Guardados|tu historial): (.+)\.$/);
    if (restored) return `Structure restored from ${restored[1] === "Guardados" ? "Saved" : "your history"}: ${localizedIupac(restored[2])}.`;

    const example = source.match(/^Ejemplo cargado: (.+)\.$/);
    if (example) return `Example loaded: ${localizedIupac(example[1])}.`;

    const alkylAdded = source.match(/^(.+) añadido\. La cadena principal y el nombre se recalcularon\.$/);
    if (alkylAdded) return `${localizedIupac(alkylAdded[1])} added. The parent chain and name were recalculated.`;

    const functionalAdded = source.match(/^(.+) añadido \((.+)\)\. Fórmula, grupo principal y nombre recalculados\.$/);
    if (functionalAdded) return `${t(functionalAdded[1])} added (${functionalAdded[2]}). Formula, principal group, and name were recalculated.`;

    const attachedRing = source.match(/^(.+) unido mediante un enlace simple\. La estructura ahora contiene (\d+) anillos\.$/);
    if (attachedRing) return `${localizedIupac(attachedRing[1])} attached with a single bond. The structure now contains ${attachedRing[2]} ring${attachedRing[2] === "1" ? "" : "s"}.`;

    const ringLoaded = source.match(/^(.+) cargado\. Selecciona un carbono y vuelve a Anillos para unir otro\.$/);
    if (ringLoaded) return `${localizedIupac(ringLoaded[1])} loaded. Select a carbon and return to Rings to attach another.`;

    const carbonAdded = source.match(/^Carbono añadido al (.+) con enlace (simple|doble|triple)\. El nombre se recalculó automáticamente\.$/);
    if (carbonAdded) return `Carbon added to ${t(carbonAdded[1])} with a ${t(carbonAdded[2])} bond. The name was recalculated automatically.`;

    const bondUpdated = source.match(/^Enlace actualizado: (simple|doble|triple) → (simple|doble|triple)\. Fórmula y nombre recalculados\.$/);
    if (bondUpdated) return `Bond updated: ${t(bondUpdated[1])} → ${t(bondUpdated[2])}. Formula and name recalculated.`;

    const removedNodeReconnect = source.match(/^Nodo (\d+) eliminado; sus dos vecinos se reconectaron mediante un enlace simple\.$/);
    if (removedNodeReconnect) return `Node ${removedNodeReconnect[1]} removed; its two neighbors were reconnected with a single bond.`;

    const removedNode = source.match(/^Nodo (\d+) eliminado\.$/);
    if (removedNode) return `Node ${removedNode[1]} removed.`;

    const createdFrom = source.match(/^Estructura creada desde «(.+)»\. Puedes seguir editándola átomo por átomo\.$/);
    if (createdFrom) return `Structure created from “${localizedIupac(createdFrom[1])}”. You can keep editing it atom by atom.`;

    const configuration = source.match(/^Configuración cambiada a (.+): se rotó un lado del doble enlace y el nombre IUPAC se actualizó automáticamente\.$/);
    if (configuration) return `Configuration changed to ${configuration[1]}: one side of the double bond was rotated and the IUPAC name was updated automatically.`;

    const valenceExisting = source.match(/^No se puede añadir un enlace (simple|doble|triple) en el (Carbono|Oxígeno|Nitrógeno|Flúor|Cloro|Bromo|Yodo) (\d+) porque ya tiene (\d+) enlaces\.$/);
    if (valenceExisting) return `Cannot add a ${t(valenceExisting[1])} bond to ${t(valenceExisting[2]).toLowerCase()} ${valenceExisting[3]} because it already has ${valenceExisting[4]} bonds.`;

    const valenceAttempt = source.match(/^No se puede añadir un enlace (simple|doble|triple) en el (Carbono|Oxígeno|Nitrógeno|Flúor|Cloro|Bromo|Yodo) (\d+) porque alcanzaría (\d+) enlaces y su máximo es (\d+)\.$/);
    if (valenceAttempt) return `Cannot add a ${t(valenceAttempt[1])} bond to ${t(valenceAttempt[2]).toLowerCase()} ${valenceAttempt[3]} because it would reach ${valenceAttempt[4]} bonds and its maximum is ${valenceAttempt[5]}.`;

    const blockedValence = source.match(/^Acción bloqueada: el (Carbono|Oxígeno|Nitrógeno|Flúor|Cloro|Bromo|Yodo) (\d+) quedaría con (\d+) enlaces y su máximo es (\d+)\.$/);
    if (blockedValence) return `Action blocked: ${t(blockedValence[1])} ${blockedValence[2]} would have ${blockedValence[3]} bonds and its maximum is ${blockedValence[4]}.`;

    const functionalValence = source.match(/^No se puede añadir (.+) en el (Carbono|Oxígeno|Nitrógeno|Flúor|Cloro|Bromo|Yodo) (\d+): alcanzaría (\d+) enlaces y su máximo es (\d+)\.$/);
    if (functionalValence) return `Cannot add ${t(functionalValence[1])} to ${t(functionalValence[2]).toLowerCase()} ${functionalValence[3]}: it would reach ${functionalValence[4]} bonds and its maximum is ${functionalValence[5]}.`;

    const convertValence = source.match(/^No se puede convertir el nodo (\d+) en (.+): conservaría (\d+) enlaces y su máximo es (\d+)\.$/);
    if (convertValence) return `Node ${convertValence[1]} cannot be converted to ${t(convertValence[2])}: it would keep ${convertValence[3]} bonds and its maximum is ${convertValence[4]}.`;

    const aliasBack = source.match(/^(.+) volvió a mostrarse como \((.+)\) y se recalculó el orden alfabético\.$/);
    if (aliasBack) return `${localizedCommonAlkylName(aliasBack[1])} is now shown again as (${localizedIupac(aliasBack[2])}), and alphabetical order was recalculated.`;

    const aliasCommon = source.match(/^\((.+)\) ahora se muestra como (.+); el nombre completo se reordenó alfabéticamente\.$/);
    if (aliasCommon) return `(${localizedIupac(aliasCommon[1])}) is now shown as ${localizedCommonAlkylName(aliasCommon[2])}; the full name was reordered alphabetically.`;

    const ringNameBack = source.match(/^(.+) volvió a mostrarse como (.+)\.$/);
    if (ringNameBack) return `${localizedIupac(ringNameBack[1])} is now shown again as ${localizedIupac(ringNameBack[2])}.`;

    const ringNameSimple = source.match(/^(.+) ahora se muestra como (.+); en un ciclo con una sola insaturación, el localizador 1 puede omitirse\.$/);
    if (ringNameSimple) return `${localizedIupac(ringNameSimple[1])} is now shown as ${localizedIupac(ringNameSimple[2])}; in a ring with a single unsaturation, locant 1 may be omitted.`;

    const completeRingExample = source.match(/^(.+) es un ejemplo completo\. Para añadir otro núcleo aromático, elige Benceno\.$/);
    if (completeRingExample) return `${localizedIupac(completeRingExample[1])} is a complete example. To add another aromatic ring, choose Benzene.`;

    const autoNameBuilder = source.match(/^Lista con ([^:]+): (.+)\. Ya quedó añadida a tu historial automático\.$/);
    if (autoNameBuilder) {
      const engine = autoNameBuilder[1]
        .replace("OpenChemLib y el respaldo integrado", "OpenChemLib and the integrated fallback")
        .replace("constructor local de respaldo", "local fallback builder");
      let result = autoNameBuilder[2];
      const warningText = " OPSIN informó una posible ambigüedad del nombre.";
      const hasWarning = result.endsWith(warningText);
      if (hasWarning) result = result.slice(0, -warningText.length);
      const commonSeparator = "; también se conoce como ";
      const commonIndex = result.indexOf(commonSeparator);
      const systematic = commonIndex >= 0 ? result.slice(0, commonIndex) : result;
      const common = commonIndex >= 0 ? result.slice(commonIndex + commonSeparator.length) : "";
      const commonText = common ? `; also known as ${translateCommonName("en", common)}` : "";
      const warning = hasWarning ? " OPSIN reported a possible ambiguity in the name." : "";
      return `Ready with ${engine}: ${localizedIupac(systematic)}${commonText}.${warning} It has been added to your automatic history.`;
    }

    const themeManual = source.match(/^Tema (oscuro|claro) fijado manualmente\.$/);
    if (themeManual) return `${t(themeManual[1])[0].toUpperCase()}${t(themeManual[1]).slice(1)} theme set manually.`;

    return dynamicUiText(language, source);
  };
  const localizedDetail = (value: string) => {
    if (language === "es") return value;
    const ringMatch = value.match(/^anillo de (\d+) carbonos$/);
    if (ringMatch) return `ring of ${ringMatch[1]} carbons`;
    const substituentMatch = value.match(/^un sustituyente (.+)$/);
    if (substituentMatch) return `one ${localizedIupac(substituentMatch[1])} substituent`;
    return t(value) !== value ? t(value) : localizedIupac(value);
  };
  const [molecule, setMolecule] = useState<Molecule>(() =>
    cloneMolecule(PRESETS.find((preset) => preset.label === "2-metilpropano")!.molecule),
  );
  const [selectedId, setSelectedId] = useState<number | null>(2);
  const [undoStack, setUndoStack] = useState<Molecule[]>([]);
  const [future, setFuture] = useState<Molecule[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [librarySection, setLibrarySection] = useState<LibrarySection>("history");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyIdentity, setHistoryIdentity] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<HistoryScope>("device");
  const [historyReady, setHistoryReady] = useState(false);
  const [historySyncState, setHistorySyncState] = useState<HistorySyncState>("loading");
  const [historyMessage, setHistoryMessage] = useState("Preparando tu historial…");
  const [historyImporting, setHistoryImporting] = useState(false);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [savedBusy, setSavedBusy] = useState(false);
  const [historyTransferNotice, setHistoryTransferNotice] = useState<HistoryTransferNotice | null>(null);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const [showNumbering, setShowNumbering] = useState(true);
  const [highlightSubstituents, setHighlightSubstituents] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("condensed");
  const [newBondOrder, setNewBondOrder] = useState<BondOrder>(1);
  const [showIupacName, setShowIupacName] = useState(true);
  const [nomenclatureConvention, setNomenclatureConvention] = useState<NomenclatureConvention>("current");
  const [showStereochemistry, setShowStereochemistry] = useState(false);
  const [advancedScreenReaderEnabled, setAdvancedScreenReaderEnabled] = useState(false);
  const [highContrastEnabled, setHighContrastEnabled] = useState(false);
  const [largeTextEnabled, setLargeTextEnabled] = useState(false);
  const [doubleBondPatternEnabled, setDoubleBondPatternEnabled] = useState(false);
  const [largeTargetsEnabled, setLargeTargetsEnabled] = useState(false);
  const [dyslexiaTypefaceEnabled, setDyslexiaTypefaceEnabled] = useState(false);
  const [simplifiedModeEnabled, setSimplifiedModeEnabled] = useState(false);
  const [highlightInteractivesEnabled, setHighlightInteractivesEnabled] = useState(false);
  const [stereochemistryPreferenceReady, setStereochemistryPreferenceReady] = useState(false);
  const [hasUsedNomenclatureToggle, setHasUsedNomenclatureToggle] = useState(false);
  const [showNomenclatureHint, setShowNomenclatureHint] = useState(false);
  const [showReasoningHelp, setShowReasoningHelp] = useState(true);
  const [showAlkylPalette, setShowAlkylPalette] = useState(false);
  const [showRingPalette, setShowRingPalette] = useState(false);
  const [showFunctionalPalette, setShowFunctionalPalette] = useState(false);
  const [ringInsertMode, setRingInsertMode] = useState<RingInsertMode>("replace");
  const [commonAlkylNameSelections, setCommonAlkylNameSelections] = useState<string[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>("auto");
  const [automaticDark, setAutomaticDark] = useState(false);
  const [showCreatorCredit, setShowCreatorCredit] = useState(false);
  const [notice, setNotice] = useState("Selecciona un carbono para añadir otro o toca un enlace para cambiar su orden.");
  const [valenceAlert, setValenceAlert] = useState<string | null>(null);
  const [nameBuilderOpen, setNameBuilderOpen] = useState(true);
  const [iupacInput, setIupacInput] = useState("");
  const [nameBuilderBusy, setNameBuilderBusy] = useState(false);
  const [nameBuilderFeedback, setNameBuilderFeedback] = useState<NameBuilderFeedback | null>(null);
  const [nameSuggestion, setNameSuggestion] = useState<CommonNameSuggestion | null>(null);
  const [nameSuggestionPreview, setNameSuggestionPreview] = useState<Molecule | null>(null);
  const [nameSuggestionPreviewLoading, setNameSuggestionPreviewLoading] = useState(false);
  const [smilesPanelOpen, setSmilesPanelOpen] = useState(false);
  const [smilesImporting, setSmilesImporting] = useState(false);
  const [smilesFeedback, setSmilesFeedback] = useState<HistoryTransferNotice | null>(null);
  const [reasoningSourceName, setReasoningSourceName] = useState<string | null>(null);
  const [sourceNameOverride, setSourceNameOverride] = useState<string | null>(null);
  const lastPersistedSignature = useRef("");
  const previousSelectedId = useRef<number | null>(null);
  const valenceAlertTimer = useRef<number | null>(null);
  const nomenclatureHintTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasExpanded) return undefined;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previousOverflow;
    };
  }, [canvasExpanded]);

  const adjacency = useMemo(() => buildAdjacency(molecule), [molecule]);
  const calculatedAnalysis = useMemo(
    () => analyzeMolecule(molecule, commonAlkylNameSelections),
    [molecule, commonAlkylNameSelections],
  );
  const localSuggestedNameUnavailable = sourceNameOverride === null
    && localNamerCannotSafelyName(molecule, calculatedAnalysis);
  const analysis = useMemo(
    () => sourceNameOverride
      ? { ...calculatedAnalysis, name: sourceNameOverride }
      : calculatedAnalysis,
    [calculatedAnalysis, sourceNameOverride],
  );
  const automaticNumberingAvailable = sourceNameOverride === null;
  const effectiveShowNumbering = showNumbering && automaticNumberingAvailable;
  const selectedAtom = molecule.atoms.find((atom) => atom.id === selectedId) ?? molecule.atoms[0];
  const mainChainSet = useMemo(() => new Set(analysis.mainChain), [analysis.mainChain]);
  const pinName = useMemo(
    () => localSuggestedNameUnavailable
      ? COMPLEX_NAME_UNAVAILABLE_MESSAGE
      : stripStereochemicalDescriptors(analysis.name),
    [analysis.name, localSuggestedNameUnavailable],
  );
  const stereochemistryAvailable = useMemo(
    () => !localSuggestedNameUnavailable
      && getMainChainStereoDescriptors(molecule, analysis.mainChain).length > 0,
    [analysis.mainChain, localSuggestedNameUnavailable, molecule],
  );
  const stereochemicalName = useMemo(
    () => !stereochemistryAvailable
      ? pinName
      : formatStereochemicalName(molecule, analysis.mainChain, pinName),
    [analysis.mainChain, molecule, pinName, stereochemistryAvailable],
  );
  const stereochemistryEnabled = showStereochemistry && !simplifiedModeEnabled;
  const nameWithSelectedStereochemistry = stereochemistryEnabled && stereochemistryAvailable
    ? stereochemicalName
    : pinName;
  const activeNomenclatureConvention = simplifiedModeEnabled
    ? "current"
    : nomenclatureConvention;
  const nomenclatureVariants = useMemo(() => {
    const localizedName = localizedIupac(nameWithSelectedStereochemistry);
    return (["current", "traditional"] as const).map((convention) => ({
      convention,
      label: nomenclatureConventionLabel(convention, language),
      name: applyNomenclatureConvention(localizedName, convention, language),
    }));
  }, [language, nameWithSelectedStereochemistry]);
  const displayedIupacName = nomenclatureVariants.find(
    (variant) => variant.convention === activeNomenclatureConvention,
  )?.name ?? localizedIupac(nameWithSelectedStereochemistry);
  const suggestionPreviewIupacName = useMemo(
    () => nameSuggestionPreview
      ? localizedIupac(stripStereochemicalDescriptors(analyzeMolecule(nameSuggestionPreview).name))
      : nameSuggestion?.name ?? "",
    [language, nameSuggestion, nameSuggestionPreview],
  );
  const canonicalIupacName = nameWithSelectedStereochemistry;
  const localizedCanonicalIupacName = localizedIupac(nameWithSelectedStereochemistry);
  const reasoningSteps = useMemo(
    () => buildIupacReasoningSteps(
      molecule,
      analysis,
      commonAlkylNameSelections,
      reasoningSourceName,
    ),
    [analysis, commonAlkylNameSelections, molecule, reasoningSourceName],
  );
  const localizedReasoningSteps = useMemo(
    () => language === "en"
      ? buildEnglishReasoningSteps(reasoningSteps, molecule, analysis)
      : reasoningSteps,
    [analysis, language, molecule, reasoningSteps],
  );
  const isDarkTheme = themePreference === "dark" || (themePreference === "auto" && automaticDark);
  const historyFamilyLabel = analysis.primaryFunctionalLabel
    ?? analysis.functionalGroups[0]?.label
    ?? (analysis.family === "aromatic"
      ? "Aromático"
      : analysis.family === "cycloalkane"
        ? "Cíclico"
        : analysis.family === "polycyclic"
          ? "Policíclico"
          : "Hidrocarburo");
  const localizedHistoryFamilyLabel = t(historyFamilyLabel);
  const filteredHistoryEntries = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase(language);
    if (!query) return historyEntries;
    return historyEntries.filter((item) => {
      const englishName = translateSpanishIupacToOpsin(item.name);
      const englishFamily = uiText("en", item.family);
      return `${item.name} ${englishName} ${item.formula} ${item.family} ${englishFamily}`
        .toLocaleLowerCase(language)
        .includes(query);
    });
  }, [historyEntries, historyQuery, language]);
  const filteredSavedEntries = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase(language);
    if (!query) return savedEntries;
    return savedEntries.filter((item) => {
      const englishName = translateSpanishIupacToOpsin(item.name);
      const englishFamily = uiText("en", item.family);
      return `${item.name} ${englishName} ${item.formula} ${item.family} ${englishFamily}`
        .toLocaleLowerCase(language)
        .includes(query);
    });
  }, [historyQuery, language, savedEntries]);
  const filteredLibraryEntries = librarySection === "history"
    ? filteredHistoryEntries
    : filteredSavedEntries;

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The selector still works when browser storage is unavailable.
    }
    document.documentElement.lang = language;
    const metadata = pageMetadata(language);
    document.title = metadata.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = metadata.description;

    const nextPath = languagePath(window.location.pathname, language);
    if (nextPath !== window.location.pathname) {
      window.history.replaceState(window.history.state, "", `${nextPath}${window.location.search}${window.location.hash}`);
    }
  }, [language]);

  useEffect(() => {
    try {
      setShowStereochemistry(window.localStorage.getItem(STEREOCHEMISTRY_STORAGE_KEY) === "on");
    } catch {
      // The default remains off when browser storage is unavailable.
    } finally {
      setStereochemistryPreferenceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!stereochemistryPreferenceReady) return;
    try {
      window.localStorage.setItem(
        STEREOCHEMISTRY_STORAGE_KEY,
        showStereochemistry ? "on" : "off",
      );
    } catch {
      // The control remains usable for the current session without storage.
    }
  }, [showStereochemistry, stereochemistryPreferenceReady]);

  useEffect(() => () => {
    if (nomenclatureHintTimer.current !== null) {
      window.clearTimeout(nomenclatureHintTimer.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const visitorId = getHistoryVisitorId();

    if (usesLocalLibrary()) {
      const data = readLocalLibrary();
      const restoreLocalLibrary = window.setTimeout(() => {
        if (cancelled) return;
        setHistoryIdentity(visitorId);
        setHistoryScope("device");
        setHistoryEntries(data.history);
        setSavedEntries(data.saved);
        if (data.draft?.molecule?.atoms?.length) {
          const restored = cloneMolecule(data.draft.molecule);
          lastPersistedSignature.current = JSON.stringify({
            molecule: restored,
            viewMode: data.draft.viewMode,
          });
          setMolecule(restored);
          setSourceNameOverride(usesNitrogenLocants(data.draft.name) ? data.draft.name : null);
          setReasoningSourceName(usesNitrogenLocants(data.draft.name) ? data.draft.name : null);
          setSelectedId(restored.atoms[0].id);
          setViewMode(data.draft.viewMode);
          setNotice(`Continuamos donde quedaste: ${data.draft.name}.`);
        }
        setHistorySyncState("saved");
        setHistoryMessage("Guardado para este navegador");
        setHistoryReady(true);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(restoreLocalLibrary);
      };
    }

    Promise.all([
      fetch("/api/history", {
        headers: { "x-lab-visitor-id": visitorId },
      }).then(async (response) => {
        const data = await response.json() as {
          scope?: HistoryScope;
          draft?: HistoryEntry | null;
          history?: HistoryEntry[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
        return data;
      }),
      fetch("/api/saved", {
        headers: { "x-lab-visitor-id": visitorId },
      }).then(async (response) => {
        const data = await response.json() as {
          scope?: HistoryScope;
          saved?: HistoryEntry[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "No se pudo cargar Guardados.");
        return data;
      }),
    ])
      .then(([data, savedData]) => {
        if (cancelled) return;
        setHistoryIdentity(visitorId);
        setHistoryScope(data.scope ?? savedData.scope ?? "device");
        setHistoryEntries(data.history ?? []);
        setSavedEntries(savedData.saved ?? []);
        if (data.draft?.molecule?.atoms?.length) {
          const restored = cloneMolecule(data.draft.molecule);
          lastPersistedSignature.current = JSON.stringify({
            molecule: restored,
            viewMode: data.draft.viewMode,
          });
          setMolecule(restored);
          setSourceNameOverride(usesNitrogenLocants(data.draft.name) ? data.draft.name : null);
          setReasoningSourceName(usesNitrogenLocants(data.draft.name) ? data.draft.name : null);
          setSelectedId(restored.atoms[0].id);
          setViewMode(data.draft.viewMode);
          setNotice(`Continuamos donde quedaste: ${data.draft.name}.`);
        }
        setHistorySyncState("saved");
        setHistoryMessage(
          data.scope === "account"
            ? "Sincronizado con tu cuenta"
            : "Guardado para este navegador",
        );
        setHistoryReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setHistoryIdentity(visitorId);
        setHistorySyncState("error");
        setHistoryMessage(error instanceof Error ? error.message : "Historial no disponible.");
        setHistoryReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("hydrocarbon-theme");
    if (storedTheme === "auto" || storedTheme === "light" || storedTheme === "dark") {
      const restoreTheme = window.setTimeout(() => setThemePreference(storedTheme), 0);
      return () => window.clearTimeout(restoreTheme);
    }
  }, []);

  useEffect(() => {
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    const updateAutomaticTheme = () => {
      const hour = new Date().getHours();
      setAutomaticDark(systemPreference.matches || hour >= 19 || hour < 7);
    };
    updateAutomaticTheme();
    systemPreference.addEventListener("change", updateAutomaticTheme);
    const clock = window.setInterval(updateAutomaticTheme, 60_000);
    return () => {
      systemPreference.removeEventListener("change", updateAutomaticTheme);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkTheme ? "dark" : "light";
    document.documentElement.style.colorScheme = isDarkTheme ? "dark" : "light";
  }, [isDarkTheme]);

  useEffect(() => {
    if (!historyOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!historyReady || !historyIdentity || historyClearing) return;
    const signature = JSON.stringify({ molecule, viewMode });
    if (signature === lastPersistedSignature.current) return;

    const timer = window.setTimeout(() => {
      setHistorySyncState("saving");
      setHistoryMessage("Guardando esta estructura…");
      if (usesLocalLibrary()) {
        try {
          const entry = saveLocalHistoryEntry({
            name: canonicalIupacName,
            formula: analysis.formula,
            family: historyFamilyLabel,
            molecule,
            viewMode,
          });
          lastPersistedSignature.current = signature;
          setHistoryEntries((items) => mergeHistoryEntry(items, entry));
          setHistorySyncState("saved");
          setHistoryMessage("Guardado para este navegador");
        } catch {
          setHistorySyncState("error");
          setHistoryMessage("No se pudo guardar en este navegador.");
        }
        return;
      }
      fetch("/api/history", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lab-visitor-id": historyIdentity,
        },
        body: JSON.stringify({
          name: canonicalIupacName,
          formula: analysis.formula,
          family: historyFamilyLabel,
          molecule,
          viewMode,
          archive: true,
        }),
      })
        .then(async (response) => {
          const data = await response.json() as {
            scope?: HistoryScope;
            item?: HistoryEntry | null;
            error?: string;
          };
          if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
          return data;
        })
        .then((data) => {
          lastPersistedSignature.current = signature;
          if (data.item) {
            setHistoryEntries((items) => mergeHistoryEntry(items, data.item!));
          }
          setHistoryScope(data.scope ?? historyScope);
          setHistorySyncState("saved");
          setHistoryMessage(
            (data.scope ?? historyScope) === "account"
              ? "Sincronizado con tu cuenta"
              : "Guardado para este navegador",
          );
        })
        .catch((error: unknown) => {
          setHistorySyncState("error");
          setHistoryMessage(error instanceof Error ? error.message : "No se pudo guardar.");
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [
    analysis.formula,
    canonicalIupacName,
    historyFamilyLabel,
    historyClearing,
    historyIdentity,
    historyReady,
    historyScope,
    molecule,
    viewMode,
  ]);

  const dismissValenceAlert = () => {
    if (valenceAlertTimer.current !== null) {
      window.clearTimeout(valenceAlertTimer.current);
      valenceAlertTimer.current = null;
    }
    setValenceAlert(null);
  };

  const showValenceError = (message: string) => {
    if (valenceAlertTimer.current !== null) {
      window.clearTimeout(valenceAlertTimer.current);
    }
    setValenceAlert(message);
    valenceAlertTimer.current = window.setTimeout(() => {
      setValenceAlert(null);
      valenceAlertTimer.current = null;
    }, 3600);
  };

  useEffect(() => () => {
    if (valenceAlertTimer.current !== null) {
      window.clearTimeout(valenceAlertTimer.current);
    }
  }, []);

  const commit = (next: Molecule, message: string, preserveName = false) => {
    const violation = findMoleculeValenceViolation(next);
    if (violation) {
      showValenceError(
        `Acción bloqueada: el ${titleCaseElement(violation.element)} ${violation.atomId} quedaría con ${violation.attempted} enlaces y su máximo es ${violation.limit}.`,
      );
      return false;
    }
    setUndoStack((items) => [...items, cloneMolecule(molecule)]);
    setFuture([]);
    setMolecule(next);
    if (!preserveName) {
      setReasoningSourceName(null);
      setSourceNameOverride(null);
    }
    setNotice(message);
    return true;
  };

  const constructFromName = async (requestedName: string, fromSuggestion = false) => {
    const submittedName = requestedName.trim();
    if (!submittedName) {
      setNameBuilderOpen(true);
      setNameBuilderFeedback({ kind: "error", message: "Escribe un nombre IUPAC para crear la estructura." });
      return;
    }

    // Some legacy or near-correct names are accepted by the external parser.
    // Correct them before parsing so the user can explicitly accept the PIN
    // instead of silently retaining a malformed presentation.
    const localPreflight = buildHydrocarbonFromIupacName(submittedName);
    const suggestedCorrection = fromSuggestion || localPreflight.ok
      ? null
      : findCommonNameSuggestion(submittedName, language);
    if (suggestedCorrection) {
      setNameBuilderOpen(true);
      setNameSuggestion(suggestedCorrection);
      setNameSuggestionPreview(null);
      setNameSuggestionPreviewLoading(false);
      setNameBuilderFeedback({
        kind: "error",
        message: "Revisa el nombre propuesto antes de crear la estructura.",
      });
      return;
    }

    const preserveSourceName = usesNitrogenLocants(submittedName);

    setNameBuilderBusy(true);
    setNameBuilderFeedback(null);
    setNameSuggestion(null);
    setNameSuggestionPreview(null);
    setNameSuggestionPreviewLoading(false);

    try {
      let next: Molecule;
      let enabledAliases: string[] = [];
      let normalizedInput = submittedName.toLocaleLowerCase("es").replace(/\s+/g, "");
      let engineLabel = "OPSIN + OpenChemLib";
      let serviceWarning = "";
      let advancedNameResolved = false;

      try {
        const data = await resolveNameStructure(submittedName);

        const { moleculeFromSmiles } = await import("./openchemlib-adapter");
        const converted = moleculeFromSmiles(data.smiles);
        if (!converted.ok) throw new Error(converted.error);
        next = converted.molecule;
        advancedNameResolved = true;
        if (data.source === "integrated-fallback") {
          engineLabel = "OpenChemLib y el respaldo integrado";
        }
        normalizedInput = (data.interpretedName ?? submittedName)
          .toLocaleLowerCase("es")
          .replace(/\s+/g, "");
        if (data.warnings?.length) serviceWarning = " OPSIN informó una posible ambigüedad del nombre.";
      } catch (advancedError) {
        const localResult = buildHydrocarbonFromIupacName(submittedName);
        if (!localResult.ok) {
          throw advancedError instanceof Error
            ? advancedError
            : new Error(localResult.error);
        }
        next = localResult.molecule;
        enabledAliases = localResult.enabledAliases;
        normalizedInput = localResult.normalizedInput;
        engineLabel = "constructor local de respaldo";
      }

      const generatedAnalysis = analyzeMolecule(next, enabledAliases);
      const preserveTrustedSourceName = advancedNameResolved
        && (preserveSourceName || localNamerCannotSafelyName(next, generatedAnalysis));
      const resultName = preserveTrustedSourceName ? submittedName : generatedAnalysis.name;
      const commonName = generatedAnalysis.commonName
        ? `; también se conoce como ${generatedAnalysis.commonName}`
        : "";

      const committed = commit(
        next,
        `Estructura creada desde «${submittedName}». Puedes seguir editándola átomo por átomo.`,
      );
      if (!committed) {
        setNameBuilderOpen(true);
        setNameBuilderFeedback({
          kind: "error",
          message: "La estructura fue interpretada, pero el canvas la bloqueó por una validación de valencia.",
        });
        return;
      }
      setReasoningSourceName(submittedName);
      // If OPSIN/OpenChemLib successfully parsed a structure whose nested
      // functional groups exceed the local naming grammar, keep the validated
      // source name rather than replacing it with an incomplete suggestion.
      setSourceNameOverride(preserveTrustedSourceName ? submittedName : null);
      setSelectedId(next.atoms[0].id);
      setCommonAlkylNameSelections(enabledAliases);
      setShowIupacName(true);
      setRingInsertMode("replace");
      setShowAlkylPalette(false);
      setShowRingPalette(false);
      setShowFunctionalPalette(false);
      setIupacInput(submittedName);
      setNameBuilderFeedback({
        kind: "success",
        message: fromSuggestion
          ? `Molécula actualizada: ${resultName}.`
          : `Lista con ${engineLabel}: ${resultName}${commonName}.${serviceWarning} Ya quedó añadida a tu historial automático.`,
      });
    } catch (error) {
      setNameBuilderOpen(true);
      setNameSuggestion(findCommonNameSuggestion(submittedName, language));
      setNameBuilderFeedback({
        kind: "error",
        message: preserveSourceName
          ? COMPLEX_NAME_LIMIT_MESSAGE
          : error instanceof Error
            ? error.message
            : "No pude interpretar ese nombre IUPAC.",
      });
    } finally {
      setNameBuilderBusy(false);
    }
  };

  const constructFromIupacName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void constructFromName(iupacInput);
  };

  const loadNameSuggestionPreview = async () => {
    if (!nameSuggestion || nameSuggestionPreview || nameSuggestionPreviewLoading) return;
    setNameSuggestionPreviewLoading(true);
    try {
      const data = await resolveNameStructure(nameSuggestion.name);
      const { moleculeFromSmiles } = await import("./openchemlib-adapter");
      const converted = moleculeFromSmiles(data.smiles);
      if (converted.ok) setNameSuggestionPreview(converted.molecule);
    } catch {
      // The correction remains usable even when a preview cannot be generated.
    } finally {
      setNameSuggestionPreviewLoading(false);
    }
  };

  const applyNameSuggestion = () => {
    if (!nameSuggestion) return;
    setIupacInput(nameSuggestion.name);
    setNameSuggestion(null);
    setNameSuggestionPreview(null);
    setNameSuggestionPreviewLoading(false);
    void constructFromName(nameSuggestion.name, true);
  };

  const cycleTheme = () => {
    const nextPreference: ThemePreference = themePreference === "auto"
      ? "light"
      : themePreference === "light"
        ? "dark"
        : "auto";
    setThemePreference(nextPreference);
    window.localStorage.setItem("hydrocarbon-theme", nextPreference);
    setNotice(
      nextPreference === "auto"
        ? "Tema automático: sigue el dispositivo y activa la vista oscura entre las 19:00 y las 07:00."
        : `Tema ${nextPreference === "dark" ? "oscuro" : "claro"} fijado manualmente.`,
    );
  };

  const addCarbon = (dx: number, dy: number) => {
    if (!isCarbonAtom(selectedAtom) && newBondOrder !== 1) {
      setNotice("En esta etapa, los nuevos enlaces desde O o N se añaden como enlaces simples para conservar un grupo funcional reconocido.");
      return;
    }
    if (molecule.rings?.length && newBondOrder !== 1) {
      setNotice("En los ciclos de esta etapa, los sustituyentes se conectan al anillo con enlaces simples.");
      return;
    }
    const violation = getAtomValenceViolation(molecule, selectedAtom.id, newBondOrder);
    if (violation) {
      showValenceError(formatBondValenceError(newBondOrder, violation));
      return;
    }
    const targetX = selectedAtom.x + dx;
    const targetY = selectedAtom.y + dy;
    if (molecule.atoms.some((atom) => atom.x === targetX && atom.y === targetY)) {
      setNotice("Ese espacio ya está ocupado. Prueba otra dirección.");
      return;
    }
    const nextId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
    const next: Molecule = {
      ...molecule,
      atoms: [...molecule.atoms, { id: nextId, x: targetX, y: targetY, element: "C" }],
      bonds: [...molecule.bonds, [selectedAtom.id, nextId, newBondOrder] as Bond],
    };
    const committed = commit(
      next,
      `Carbono añadido al ${elementNames[getElement(selectedAtom)]} con enlace ${getBondOrderLabel(newBondOrder)}. El nombre se recalculó automáticamente.`,
    );
    if (!committed) return;
    previousSelectedId.current = selectedAtom.id;
    setSelectedId(nextId);
  };

  const cycleBondOrder = (a: number, b: number) => {
    const atomA = getAtom(a, molecule);
    const atomB = getAtom(b, molecule);
    if ((atomA && !isCarbonAtom(atomA)) || (atomB && !isCarbonAtom(atomB))) {
      setNotice("Los enlaces de O, N y halógenos quedan fijados para conservar el grupo funcional. Retira el átomo terminal y elige otro grupo si deseas cambiarlo.");
      return;
    }
    const containingRing = molecule.rings?.find(
      (ring) => ring.atomIds.includes(a) && ring.atomIds.includes(b),
    );
    if (containingRing?.kind === "aromatic") {
      setNotice(
        "Los enlaces internos del benceno están fijados para conservar su aromaticidad.",
      );
      return;
    }
    if (molecule.rings?.length && !containingRing) {
      setNotice(
        "Los enlaces que unen un anillo con un sustituyente u otro anillo se mantienen simples; toca un enlace interno del ciclo para cambiarlo.",
      );
      return;
    }
    const bondIndex = molecule.bonds.findIndex(
      (bond) => (bond[0] === a && bond[1] === b) || (bond[0] === b && bond[1] === a),
    );
    if (bondIndex < 0) return;

    const currentOrder = getBondOrder(molecule.bonds[bondIndex]);
    if (currentOrder === 2 && !containingRing) {
      const ezToggleAvailable = isDoubleBondEZToggleAvailable(molecule, a, b);
      if (ezToggleAvailable && !canToggleBondStereochemistry(stereochemistryEnabled, ezToggleAvailable)) {
        setNotice("Activa Estereoquímica para alternar la configuración E/Z de este doble enlace.");
        return;
      }
      const stereoToggle = toggleDoubleBondGeometry(molecule, a, b);
      if (stereoToggle.ok) {
        const locantIndex = analysis.mainChain.slice(0, -1).findIndex(
          (atomId, index) => {
            const nextAtomId = analysis.mainChain[index + 1];
            return (atomId === a && nextAtomId === b) || (atomId === b && nextAtomId === a);
          },
        );
        const descriptor = locantIndex >= 0
          ? `(${locantIndex + 1}${stereoToggle.configuration})`
          : stereoToggle.configuration;
        commit(
          stereoToggle.molecule,
          `Configuración cambiada a ${descriptor}: se rotó un lado del doble enlace y el nombre IUPAC se actualizó automáticamente.`,
        );
        setShowIupacName(true);
        return;
      }
    }

    const nextOrder = (currentOrder === 3 ? 1 : currentOrder + 1) as BondOrder;
    const extraValence = nextOrder - currentOrder;
    const violation = extraValence > 0
      ? findBondValenceViolation(molecule, a, b, nextOrder, currentOrder)
      : null;
    if (violation) {
      showValenceError(formatBondValenceError(nextOrder, violation));
      return;
    }

    const nextBonds = molecule.bonds.map((bond, index) =>
      index === bondIndex ? [bond[0], bond[1], nextOrder] as Bond : [...bond] as Bond,
    );
    commit(
      { ...molecule, bonds: nextBonds },
      `Enlace actualizado: ${getBondOrderLabel(currentOrder)} → ${getBondOrderLabel(nextOrder)}. Fórmula y nombre recalculados.`,
    );
  };

  const addAlkylGroup = (template: AlkylTemplate) => {
    if (!isCarbonAtom(selectedAtom)) {
      setNotice("Selecciona un carbono para añadir un grupo alquilo.");
      return;
    }
    const attachmentViolation = getAtomValenceViolation(molecule, selectedAtom.id, 1);
    if (attachmentViolation) {
      showValenceError(formatBondValenceError(1, attachmentViolation));
      return;
    }

    const occupied = new Set(molecule.atoms.map((atom) => `${atom.x},${atom.y}`));
    const orientations = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
    ];
    const selectedRing = ringContainingAtom(molecule, selectedAtom.id);
    if (selectedRing) {
      const ringAtoms = molecule.atoms.filter((atom) => selectedRing.atomIds.includes(atom.id));
      const center = ringAtoms.reduce(
        (total, atom) => ({ x: total.x + atom.x / ringAtoms.length, y: total.y + atom.y / ringAtoms.length }),
        { x: 0, y: 0 },
      );
      const outward = { x: selectedAtom.x - center.x, y: selectedAtom.y - center.y };
      orientations.sort(
        (left, right) => right.dx * outward.x + right.dy * outward.y - (left.dx * outward.x + left.dy * outward.y),
      );
    }
    let placement: { x: number; y: number }[] | null = null;

    for (const orientation of orientations) {
      for (const mirror of [1, -1]) {
        const candidate = template.atoms.map((atom) => ({
          x: selectedAtom.x + atom.x * orientation.dx - atom.y * orientation.dy * mirror,
          y: selectedAtom.y + atom.x * orientation.dy + atom.y * orientation.dx * mirror,
        }));
        const candidateKeys = candidate.map((atom) => `${atom.x},${atom.y}`);
        if (
          candidateKeys.every((key) => !occupied.has(key))
          && new Set(candidateKeys).size === candidateKeys.length
        ) {
          placement = candidate;
          break;
        }
      }
      if (placement) break;
    }

    if (!placement) {
      setNotice("No hay espacio libre para ese grupo. Selecciona otro carbono o retira una ramificación.");
      return;
    }

    const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
    const idMap = placement.map((_, index) => firstId + index);
    const addedAtoms = placement.map((atom, index) => ({ ...atom, id: idMap[index] }));
    const addedBonds = template.connections.map(([from, to]) => [
      from === -1 ? selectedAtom.id : idMap[from],
      idMap[to],
    ] as Bond);
    const next: Molecule = {
      ...molecule,
      atoms: [...molecule.atoms, ...addedAtoms],
      bonds: [...molecule.bonds, ...addedBonds],
    };

    commit(next, `${template.label} añadido. La cadena principal y el nombre se recalcularon.`);
    previousSelectedId.current = selectedAtom.id;
    setSelectedId(idMap[0]);
  };

  const addFunctionalGroup = (template: FunctionalGroupTemplate) => {
    if (!isCarbonAtom(selectedAtom)) {
      setNotice("Los grupos funcionales de la biblioteca se incorporan desde un carbono seleccionado.");
      return;
    }

    const carbonNeighbors = atomNeighbors(selectedAtom.id, molecule)
      .filter((neighbor) => {
        const atom = getAtom(neighbor.atomId, molecule);
        return atom && isCarbonAtom(atom);
      });
    const heteroNeighbors = atomNeighbors(selectedAtom.id, molecule)
      .filter((neighbor) => {
        const atom = getAtom(neighbor.atomId, molecule);
        return atom && !isCarbonAtom(atom);
      });
    const incomingValence = template.bonds
      .filter(([from]) => from === 0)
      .reduce((total, bond) => total + bond[2], 0);

    if (
      template.requirement === "terminal-carbon"
      && (carbonNeighbors.length > 1
        || carbonNeighbors.some((neighbor) => neighbor.order !== 1)
        || heteroNeighbors.length > 0)
    ) {
      setNotice(`${template.label} requiere un carbono terminal: selecciona un CH₃ del extremo de la cadena.`);
      return;
    }
    if (
      template.requirement === "internal-carbon"
      && (carbonNeighbors.length !== 2
        || carbonNeighbors.some((neighbor) => neighbor.order !== 1)
        || heteroNeighbors.length > 0)
    ) {
      setNotice(`${template.label} requiere un carbono interno unido por enlaces simples a otros dos carbonos.`);
      return;
    }
    const functionalGroupViolation = getAtomValenceViolation(
      molecule,
      selectedAtom.id,
      incomingValence,
    );
    if (functionalGroupViolation) {
      showValenceError(
        `No se puede añadir ${template.label.toLowerCase()} en el ${titleCaseElement(functionalGroupViolation.element)} ${functionalGroupViolation.atomId}: alcanzaría ${functionalGroupViolation.attempted} enlaces y su máximo es ${functionalGroupViolation.limit}.`,
      );
      return;
    }

    const occupied = new Set(molecule.atoms.map((atom) => `${atom.x.toFixed(4)},${atom.y.toFixed(4)}`));
    const orientations = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
    ];
    const selectedRing = ringContainingAtom(molecule, selectedAtom.id);
    if (selectedRing) {
      const ringAtoms = molecule.atoms.filter((atom) => selectedRing.atomIds.includes(atom.id));
      const center = ringAtoms.reduce(
        (total, atom) => ({ x: total.x + atom.x / ringAtoms.length, y: total.y + atom.y / ringAtoms.length }),
        { x: 0, y: 0 },
      );
      const outward = { x: selectedAtom.x - center.x, y: selectedAtom.y - center.y };
      orientations.sort(
        (left, right) => right.dx * outward.x + right.dy * outward.y - (left.dx * outward.x + left.dy * outward.y),
      );
    }

    let placement: { x: number; y: number }[] | null = null;
    for (const orientation of orientations) {
      for (const mirror of [1, -1]) {
        const candidate = template.atoms.map((atom) => ({
          x: selectedAtom.x + atom.x * orientation.dx - atom.y * orientation.dy * mirror,
          y: selectedAtom.y + atom.x * orientation.dy + atom.y * orientation.dx * mirror,
        }));
        const keys = candidate.map((atom) => `${atom.x.toFixed(4)},${atom.y.toFixed(4)}`);
        if (keys.every((key) => !occupied.has(key)) && new Set(keys).size === keys.length) {
          placement = candidate;
          break;
        }
      }
      if (placement) break;
    }

    if (!placement) {
      setNotice("No hay espacio libre para dibujar ese grupo. Prueba otro carbono o retira una rama cercana.");
      return;
    }

    const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
    const idMap = placement.map((_, index) => firstId + index);
    const addedAtoms = placement.map((position, index) => ({
      ...position,
      id: idMap[index],
      element: template.atoms[index].element,
      ...(template.atoms[index].charge ? { charge: template.atoms[index].charge } : {}),
    }));
    const addedBonds = template.bonds.map(([from, to, order]) => [
      from === 0 ? selectedAtom.id : idMap[from - 1],
      idMap[to - 1],
      order,
    ] as Bond);
    const next: Molecule = {
      ...molecule,
      atoms: [...molecule.atoms, ...addedAtoms],
      bonds: [...molecule.bonds, ...addedBonds],
    };
    commit(
      next,
      `${template.label} añadido (${template.shortFormula}). Fórmula, grupo principal y nombre recalculados.`,
    );
    previousSelectedId.current = selectedAtom.id;
    setSelectedId(idMap[0]);
    setShowFunctionalPalette(false);
  };

  const removeSelected = () => {
    if (ringContainingAtom(molecule, selectedAtom.id)) {
      setNotice("El carbono seleccionado forma parte del anillo y no puede retirarse. Elige un sustituyente terminal.");
      return;
    }
    const degree = (adjacency.get(selectedAtom.id) ?? []).length;
    const carbonCount = molecule.atoms.filter(isCarbonAtom).length;
    if (isCarbonAtom(selectedAtom) && carbonCount === 1) {
      setNotice("La molécula debe conservar al menos un carbono.");
      return;
    }
    if (degree > 1) {
      setNotice("Solo puedes retirar un átomo terminal para no cortar la molécula en dos.");
      return;
    }
    const neighbor = adjacency.get(selectedAtom.id)?.[0];
    const next: Molecule = {
      ...molecule,
      atoms: molecule.atoms.filter((atom) => atom.id !== selectedAtom.id),
      bonds: molecule.bonds.filter(([a, b]) => a !== selectedAtom.id && b !== selectedAtom.id),
    };
    commit(next, `${elementNames[getElement(selectedAtom)]} terminal retirado.`);
    setSelectedId(neighbor ?? next.atoms[0].id);
  };

  const removeSelectedWithKeyboard = () => {
    if (ringContainingAtom(molecule, selectedAtom.id)) {
      setNotice("No se puede borrar un vértice de un anillo, porque alteraría su cierre y su aromaticidad.");
      return;
    }
    const neighborIds = adjacency.get(selectedAtom.id) ?? [];
    const carbonCount = molecule.atoms.filter(isCarbonAtom).length;
    if (isCarbonAtom(selectedAtom) && carbonCount === 1) {
      setNotice("La molécula debe conservar al menos un carbono.");
      return;
    }
    if (neighborIds.length > 2) {
      setNotice("No se puede reconectar de forma inequívoca un nodo con tres o más vecinos. Elimina primero una rama terminal.");
      return;
    }

    const remainingAtoms = molecule.atoms.filter((atom) => atom.id !== selectedAtom.id);
    const remainingBonds = molecule.bonds
      .filter(([a, b]) => a !== selectedAtom.id && b !== selectedAtom.id)
      .map((bond) => [...bond] as Bond);
    const next: Molecule = { ...molecule, atoms: remainingAtoms, bonds: remainingBonds };

    if (neighborIds.length === 2) {
      const [a, b] = neighborIds;
      const alreadyConnected = remainingBonds.some(
        (bond) => (bond[0] === a && bond[1] === b) || (bond[0] === b && bond[1] === a),
      );
      if (!alreadyConnected) {
        const violation = findBondValenceViolation(next, a, b, 1, 0);
        if (violation) {
          showValenceError(formatBondValenceError(1, violation));
          return;
        }
        next.bonds = [...remainingBonds, [a, b, 1]];
      }
    }

    const committed = commit(
      next,
      neighborIds.length === 2
        ? `Nodo ${selectedAtom.id} eliminado; sus dos vecinos se reconectaron mediante un enlace simple.`
        : `Nodo ${selectedAtom.id} eliminado.`,
    );
    if (!committed) return;
    previousSelectedId.current = null;
    setSelectedId(neighborIds[0] ?? remainingAtoms[0].id);
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setFuture((items) => [cloneMolecule(molecule), ...items]);
    setUndoStack((items) => items.slice(0, -1));
    setMolecule(cloneMolecule(previous));
    setReasoningSourceName(null);
    setSourceNameOverride(null);
    setSelectedId(previous.atoms[0].id);
    setNotice("Último cambio deshecho.");
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setUndoStack((items) => [...items, cloneMolecule(molecule)]);
    setFuture((items) => items.slice(1));
    setMolecule(cloneMolecule(next));
    setReasoningSourceName(null);
    setSourceNameOverride(null);
    setSelectedId(next.atoms[0].id);
    setNotice("Cambio rehecho.");
  };

  const saveCurrentStructure = async () => {
    if (!historyIdentity) return;
    setSavedBusy(true);
    try {
      if (usesLocalLibrary()) {
        const item = saveLocalSavedEntry({
          name: canonicalIupacName,
          formula: analysis.formula,
          family: historyFamilyLabel,
          molecule,
          viewMode,
        });
        setSavedEntries((items) => mergeHistoryEntry(items, item, 200));
        setNotice(`${canonicalIupacName} quedó añadido a Guardados.`);
        setLibrarySection("saved");
        setHistoryOpen(true);
        return;
      }
      const response = await fetch("/api/saved", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lab-visitor-id": historyIdentity,
        },
        body: JSON.stringify({
          name: canonicalIupacName,
          formula: analysis.formula,
          family: historyFamilyLabel,
          molecule,
          viewMode,
        }),
      });
      const data = await response.json() as {
        scope?: HistoryScope;
        item?: HistoryEntry | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      if (data.item) {
        setSavedEntries((items) => mergeHistoryEntry(items, data.item!, 200));
      }
      const scope = data.scope ?? historyScope;
      setHistoryScope(scope);
      setNotice(`${canonicalIupacName} quedó añadido a Guardados.`);
      setLibrarySection("saved");
      setHistoryOpen(true);
    } catch (error) {
      setHistoryTransferNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar.",
      });
    } finally {
      setSavedBusy(false);
    }
  };

  const restoreLibraryEntry = (entry: HistoryEntry, source: LibrarySection) => {
    const restored = cloneMolecule(entry.molecule);
    commit(
      restored,
      `Estructura recuperada de ${source === "saved" ? "Guardados" : "tu historial"}: ${entry.name}.`,
    );
    if (usesNitrogenLocants(entry.name)) {
      setSourceNameOverride(entry.name);
      setReasoningSourceName(entry.name);
    }
    setSelectedId(restored.atoms[0].id);
    setViewMode(entry.viewMode);
    setShowAlkylPalette(false);
    setShowRingPalette(false);
    setShowFunctionalPalette(false);
    setHistoryOpen(false);
  };

  const exportHistoryEntry = (entry: HistoryEntry) => {
    const document: ChemistryDocument = {
      format: "laboratorio-quimica-organica",
      version: 1,
      kind: "structure",
      exportedAt: new Date().toISOString(),
      structure: toPortableStructure(entry),
    };
    downloadChemistryDocument(document, entry.name);
    setHistoryTransferNotice({
      kind: "success",
      message: `${entry.name} se descargó como documento .quimica.`,
    });
  };

  const exportHistoryLibrary = () => {
    if (!historyEntries.length) return;
    const document: ChemistryDocument = {
      format: "laboratorio-quimica-organica",
      version: 1,
      kind: "library",
      exportedAt: new Date().toISOString(),
      structures: historyEntries.map(toPortableStructure),
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadChemistryDocument(document, `mi-historial-quimico-${date}`);
    setHistoryTransferNotice({
      kind: "success",
      message: `Historial exportado con ${historyEntries.length} estructura${historyEntries.length === 1 ? "" : "s"}.`,
    });
  };

  const exportSavedLibrary = () => {
    if (!savedEntries.length) return;
    const document: ChemistryDocument = {
      format: "laboratorio-quimica-organica",
      version: 1,
      kind: "library",
      exportedAt: new Date().toISOString(),
      structures: savedEntries.map(toPortableStructure),
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadChemistryDocument(document, `mis-estructuras-guardadas-${date}`);
    setHistoryTransferNotice({
      kind: "success",
      message: `Guardados exportado con ${savedEntries.length} estructura${savedEntries.length === 1 ? "" : "s"}.`,
    });
  };

  const exportCurrentSmiles = async () => {
    setSmilesFeedback(null);
    try {
      const { moleculeToSmiles } = await import("./openchemlib-adapter");
      const result = moleculeToSmiles(molecule);
      if (!result.ok) throw new Error(result.error);
      downloadSmilesFile(result.smiles, canonicalIupacName);
      setSmilesFeedback({
        kind: "success",
        message: t("La molécula actual se exportó como archivo .smi compatible con SMILES."),
      });
    } catch (error) {
      setSmilesFeedback({
        kind: "error",
        message: error instanceof Error
          ? localizedDynamicText(error.message)
          : t("No fue posible exportar esta estructura como SMILES."),
      });
    }
  };

  const importSmilesDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setSmilesImporting(true);
    setSmilesFeedback(null);
    try {
      if (file.size > 1_000_000) {
        throw new Error(t("El archivo SMILES supera el límite de 1 MB."));
      }

      const record = readSmilesFileRecord(await file.text());
      const { moleculeFromSmiles } = await import("./openchemlib-adapter");
      const converted = moleculeFromSmiles(record.smiles);
      if (!converted.ok) throw new Error(t(converted.error));

      const next = converted.molecule;
      const importedAnalysis = analyzeMolecule(next);
      const suggestedName = localNamerCannotSafelyName(next, importedAnalysis)
        ? COMPLEX_NAME_UNAVAILABLE_MESSAGE
        : importedAnalysis.name;
      const committed = commit(
        next,
        language === "en"
          ? `Structure imported from SMILES file ${file.name}. You can keep editing it atom by atom.`
          : `Estructura importada desde el archivo SMILES ${file.name}. Puedes seguir editándola átomo por átomo.`,
      );
      if (!committed) {
        throw new Error(t("El SMILES fue interpretado, pero el canvas lo bloqueó por una validación de valencia."));
      }

      setSelectedId(next.atoms[0].id);
      setCommonAlkylNameSelections([]);
      setShowIupacName(true);
      setRingInsertMode("replace");
      setShowAlkylPalette(false);
      setShowRingPalette(false);
      setShowFunctionalPalette(false);
      setNameBuilderFeedback(null);

      const extraRecords = record.ignoredRecordCount > 0
        ? language === "en"
          ? ` The file contains ${record.ignoredRecordCount + 1} records; SciU imported the first molecule.`
          : ` El archivo contiene ${record.ignoredRecordCount + 1} registros; SciU importó la primera molécula.`
        : "";
      setSmilesFeedback({
        kind: "success",
        message: language === "en"
          ? `SMILES imported with OpenChemLib. Suggested IUPAC name: ${localizedIupac(suggestedName)}.${extraRecords}`
          : `SMILES importado con OpenChemLib. Nombre IUPAC sugerido: ${suggestedName}.${extraRecords}`,
      });
    } catch (error) {
      setSmilesFeedback({
        kind: "error",
        message: error instanceof Error
          ? localizedDynamicText(error.message)
          : t("No fue posible importar este archivo SMILES."),
      });
    } finally {
      setSmilesImporting(false);
      input.value = "";
    }
  };

  const importChemistryDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !historyIdentity) return;

    setHistoryImporting(true);
    setHistoryTransferNotice(null);
    try {
      if (file.size > 4_000_000) {
        throw new Error("El documento supera el límite de 4 MB.");
      }
      const parsed = JSON.parse(await file.text()) as unknown;
      const structures = readChemistryDocument(parsed);
      const importedEntries: HistoryEntry[] = [];

      for (const structure of structures) {
        if (usesLocalLibrary()) {
          importedEntries.push(saveLocalSavedEntry({
            name: structure.name,
            formula: structure.formula,
            family: structure.family,
            molecule: structure.molecule,
            viewMode: structure.viewMode,
            updateDraft: false,
          }));
          continue;
        }
        const response = await fetch("/api/saved", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-lab-visitor-id": historyIdentity,
          },
          body: JSON.stringify({
            name: structure.name,
            formula: structure.formula,
            family: structure.family,
            molecule: structure.molecule,
            viewMode: structure.viewMode,
          }),
        });
        const data = await response.json() as {
          item?: HistoryEntry | null;
          error?: string;
        };
        if (!response.ok || !data.item) {
          throw new Error(data.error || `No fue posible importar ${structure.name}.`);
        }
        importedEntries.push(data.item);
      }

      setSavedEntries((items) =>
        importedEntries.reduce(
          (current, entry) => mergeHistoryEntry(current, entry, 200),
          items,
        ),
      );

      if (importedEntries.length === 1) {
        const [entry] = importedEntries;
        restoreLibraryEntry(entry, "saved");
        setNotice(`${entry.name} se importó desde ${file.name} y está lista para editar.`);
      } else {
        setHistoryTransferNotice({
          kind: "success",
          message: `${importedEntries.length} estructuras importadas. Elige una para abrirla.`,
        });
      }
    } catch (error) {
      setHistoryTransferNotice({
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "No fue posible leer este documento químico.",
      });
    } finally {
      setHistoryImporting(false);
      input.value = "";
    }
  };

  const deleteHistoryEntry = async (entry: HistoryEntry) => {
    if (!historyIdentity) return;
    if (!window.confirm(
      language === "en"
        ? `Remove “${localizedIupac(entry.name)}” from your history?`
        : `¿Eliminar “${entry.name}” de tu historial?`,
    )) return;
    try {
      if (usesLocalLibrary()) {
        removeLocalLibraryEntry(entry.id, "history");
        setHistoryEntries((items) => items.filter((item) => item.id !== entry.id));
        setNotice(`${entry.name} se eliminó del historial.`);
        return;
      }
      const response = await fetch(`/api/history?id=${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { "x-lab-visitor-id": historyIdentity },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar.");
      setHistoryEntries((items) => items.filter((item) => item.id !== entry.id));
      setNotice(`${entry.name} se eliminó del historial.`);
    } catch (error) {
      setHistorySyncState("error");
      setHistoryMessage(error instanceof Error ? error.message : "No se pudo eliminar.");
    }
  };

  const clearHistory = async () => {
    if (!historyIdentity || !historyEntries.length || historyClearing) return;
    const total = historyEntries.length;
    const confirmed = window.confirm(
      language === "en"
        ? `Clear ${total} ${total === 1 ? "structure" : "structures"} from history? Saved structures and the current structure will be preserved. This action cannot be undone.`
        : `¿Borrar las ${total} estructura${total === 1 ? "" : "s"} del historial? Guardados y la estructura actual se conservarán. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setHistoryClearing(true);
    setHistoryTransferNotice(null);
    try {
      if (usesLocalLibrary()) {
        clearLocalHistoryEntries();
      } else {
        const response = await fetch("/api/history?all=true", {
          method: "DELETE",
          headers: { "x-lab-visitor-id": historyIdentity },
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudo borrar el historial.");
      }

      lastPersistedSignature.current = JSON.stringify({ molecule, viewMode });
      setHistoryEntries([]);
      setHistoryQuery("");
      setHistoryTransferNotice({
        kind: "success",
        message: "Historial borrado. Tus estructuras de Guardados y la estructura actual se conservaron.",
      });
      setNotice("El historial se borró sin modificar Guardados ni la estructura actual.");
    } catch (error) {
      setHistoryTransferNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo borrar el historial.",
      });
    } finally {
      setHistoryClearing(false);
    }
  };

  const deleteSavedEntry = async (entry: HistoryEntry) => {
    if (!historyIdentity) return;
    if (!window.confirm(
      language === "en"
        ? `Remove “${localizedIupac(entry.name)}” from Saved?`
        : `¿Eliminar “${entry.name}” de Guardados?`,
    )) return;
    try {
      if (usesLocalLibrary()) {
        removeLocalLibraryEntry(entry.id, "saved");
        setSavedEntries((items) => items.filter((item) => item.id !== entry.id));
        setNotice(`${entry.name} se eliminó de Guardados.`);
        return;
      }
      const response = await fetch(`/api/saved?id=${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { "x-lab-visitor-id": historyIdentity },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar.");
      setSavedEntries((items) => items.filter((item) => item.id !== entry.id));
      setNotice(`${entry.name} se eliminó de Guardados.`);
    } catch (error) {
      setHistoryTransferNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar.",
      });
    }
  };

  const loadPreset = (preset: (typeof PRESETS)[number]) => {
    commit(cloneMolecule(preset.molecule), `Ejemplo cargado: ${preset.label}.`);
    setSelectedId(preset.molecule.atoms[0].id);
    setShowAlkylPalette(false);
    setShowRingPalette(false);
    setShowFunctionalPalette(false);
  };

  const loadRingTemplate = (template: RingTemplate) => {
    if (ringInsertMode === "attach") {
      if (!isCarbonAtom(selectedAtom)) {
        setNotice("Selecciona un carbono antes de unir un anillo.");
        return;
      }
      if (template.molecule.atoms.length !== template.size) {
        setNotice(
          `${template.label} es un ejemplo completo. Para añadir otro núcleo aromático, elige Benceno.`,
        );
        return;
      }
      const attachmentViolation = getAtomValenceViolation(molecule, selectedAtom.id, 1);
      if (attachmentViolation) {
        showValenceError(formatBondValenceError(1, attachmentViolation));
        return;
      }
      const attached = attachRingToMolecule(
        molecule,
        selectedAtom.id,
        template.size,
        template.kind,
      );
      if (!attached) {
        setNotice(
          selectedValence >= 4
            ? "Ese carbono ya tiene valencia 4. Selecciona otro carbono antes de unir el anillo."
            : "No hay espacio suficiente alrededor del carbono seleccionado para colocar ese anillo.",
        );
        return;
      }
      const ringCount = (attached.molecule.rings?.length ?? 0);
      const committed = commit(
        attached.molecule,
        `${template.label} unido mediante un enlace simple. La estructura ahora contiene ${ringCount} anillos.`,
      );
      if (!committed) return;
      previousSelectedId.current = selectedAtom.id;
      setSelectedId(attached.attachmentId);
      setShowRingPalette(false);
      setShowAlkylPalette(false);
      setShowFunctionalPalette(false);
      return;
    }

    commit(
      cloneMolecule(template.molecule),
      `${template.label} cargado. Selecciona un carbono y vuelve a Anillos para unir otro.`,
    );
    setSelectedId(template.molecule.rings?.[0].atomIds[0] ?? template.molecule.atoms[0].id);
    setRingInsertMode("attach");
    setShowRingPalette(false);
    setShowAlkylPalette(false);
    setShowFunctionalPalette(false);
  };

  const newMolecule = () => {
    const methane = makeChain(1);
    commit(methane, "Molécula nueva: comienza desde un átomo de carbono.");
    setSelectedId(1);
    setNomenclatureConvention("current");
    setShowStereochemistry(false);
    setRingInsertMode("replace");
    setShowRingPalette(false);
    setShowFunctionalPalette(false);
  };

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setNotice(
      mode === "skeletal"
        ? "Vista esquelética activada: cada extremo y cada vértice representa un carbono."
        : "Vista semidesarrollada activada: se muestran los carbonos y sus hidrógenos implícitos.",
    );
  };

  const redrawMolecule = () => {
    commit(
      flipCoordinates(molecule),
      "Estructura redibujada en espejo sin cambiar su conectividad, nombre ni configuración E/Z.",
      true,
    );
  };

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(target?.matches("input, textarea, select") || target?.isContentEditable);

      if (event.key === "Escape") {
        if (canvasExpanded) {
          event.preventDefault();
          setCanvasExpanded(false);
        } else if (settingsOpen) {
          event.preventDefault();
          setSettingsOpen(false);
        } else if (!historyOpen && !isEditable && selectedId !== null) {
          event.preventDefault();
          previousSelectedId.current = null;
          setSelectedId(null);
        }
        return;
      }

      if (isEditable) return;

      const commandPressed = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (!commandPressed) {
        if (event.key === "Delete" && selectedId !== null) {
          event.preventDefault();
          removeSelectedWithKeyboard();
        }
        return;
      }

      const key = event.key.toLocaleLowerCase("es");
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "r") {
        event.preventDefault();
        redrawMolecule();
      } else if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) void exportCurrentSmiles();
        else void saveCurrentStructure();
      } else if (key === "i") {
        event.preventDefault();
        setNameBuilderOpen(false);
        setSmilesPanelOpen(true);
        setSmilesFeedback(null);
      } else if (key === "n") {
        event.preventDefault();
        newMolecule();
      } else if (key === "1") {
        event.preventDefault();
        setSmilesPanelOpen(false);
        setNameBuilderOpen(true);
        setNameBuilderFeedback(null);
      } else if (key === "2") {
        event.preventDefault();
        setNameBuilderOpen(false);
        setSmilesPanelOpen(true);
        setSmilesFeedback(null);
      } else if (key === "3") {
        event.preventDefault();
        changeViewMode("condensed");
      } else if (key === "4") {
        event.preventDefault();
        changeViewMode("skeletal");
      }
    };

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [
    historyOpen,
    removeSelectedWithKeyboard,
    undo,
    redo,
    redrawMolecule,
    exportCurrentSmiles,
    saveCurrentStructure,
    newMolecule,
    changeViewMode,
    canvasExpanded,
    settingsOpen,
    selectedId,
  ]);

  const carbonCount = molecule.atoms.filter(isCarbonAtom).length;
  const rawDisplayPositions = viewMode === "skeletal" && !molecule.rings?.length
    ? buildOpenChainSkeletalPositions(molecule, analysis.mainChain)
    : new Map(
        molecule.atoms.map((atom) => [atom.id, getDisplayPosition(atom, viewMode, Boolean(molecule.rings?.length))]),
      );
  const coordinateScale = canvasCoordinateScaleForCarbonCount(carbonCount);
  const displayPositions = new Map(
    [...rawDisplayPositions].map(([atomId, point]) => [atomId, {
      x: point.x * coordinateScale,
      y: point.y * coordinateScale,
    }]),
  );
  const skeletalNumberBadgeOffsets = new Map(
    molecule.atoms.map((atom) => {
      const containingRing = molecule.rings?.find((ring) => ring.atomIds.includes(atom.id));
      const position = displayPositions.get(atom.id)!;
      const offset = containingRing
        ? getSkeletalRingNumberBadgeOffset(
            position,
            containingRing.atomIds.map((atomId) => displayPositions.get(atomId)!),
          )
        : molecule.isMirrored
          ? { x: -SKELETAL_NUMBER_BADGE_OFFSET.x, y: SKELETAL_NUMBER_BADGE_OFFSET.y }
          : SKELETAL_NUMBER_BADGE_OFFSET;
      return [atom.id, offset];
    }),
  );
  const coordinates = [...displayPositions.values()];
  const minX = Math.min(...coordinates.map((point) => point.x));
  const maxX = Math.max(...coordinates.map((point) => point.x));
  const minY = Math.min(...coordinates.map((point) => point.y));
  const maxY = Math.max(...coordinates.map((point) => point.y));
  const viewWidth = Math.max(720, maxX - minX + 260);
  const viewHeight = Math.max(390, maxY - minY + 220);
  const viewCenterX = (minX + maxX) / 2;
  const viewCenterY = (minY + maxY) / 2;
  const selectedValence = getValenceUsed(selectedAtom.id, molecule);
  const selectedHydrogens = getImplicitHydrogens(selectedAtom.id, molecule);
  const selectedElement = getElement(selectedAtom);
  const selectedValenceLimit = getValenceLimit(selectedAtom.id, molecule);
  const canvasScaleClass = carbonCount <= 10
    ? "chain-short"
    : carbonCount <= 20
      ? "chain-medium"
      : carbonCount <= 50
        ? "chain-long"
        : "chain-extra-long";
  const hasMultipleBonds = analysis.doubleBondLocants.length > 0 || analysis.tripleBondLocants.length > 0;
  const bondInteractionHintActions = useMemo(
    () => getBondInteractionHintActions(molecule),
    [molecule],
  );
  const visibleBondInteractionHintActions = useMemo(
    () => getVisibleBondInteractionHintActions(bondInteractionHintActions, stereochemistryEnabled),
    [bondInteractionHintActions, stereochemistryEnabled],
  );
  const isRingStructure = analysis.family !== "acyclic";
  const carbonFamilyLabel = analysis.family === "aromatic"
    ? t("Aromático")
    : analysis.family === "polycyclic"
      ? `${molecule.rings?.length ?? 0} ${language === "en" ? "rings" : "anillos"}`
    : analysis.family === "cycloalkane"
      ? analysis.doubleBondLocants.length && analysis.tripleBondLocants.length
        ? t("Cicloalquenino")
        : analysis.doubleBondLocants.length
          ? t("Cicloalqueno")
          : analysis.tripleBondLocants.length
            ? t("Cicloalquino")
            : t("Cicloalcano")
      : hasMultipleBonds
        ? t("Insaturado")
        : t("Alcano");
  const structureFamilyLabel = analysis.primaryFunctionalLabel
    ? `${t(analysis.primaryFunctionalLabel)} · ${carbonFamilyLabel}`
    : analysis.functionalGroups.length
      ? `${t(analysis.functionalGroups[0].label)} · ${carbonFamilyLabel}`
      : carbonFamilyLabel;
  const themeModeLabel = themePreference === "auto"
    ? `Auto · ${isDarkTheme ? t("oscuro") : t("claro")}`
    : themePreference === "dark"
      ? t("Oscuro")
      : t("Claro");
  const cycleNomenclatureConvention = () => {
    if (simplifiedModeEnabled) return;
    setNomenclatureConvention((current) => nextNomenclatureConvention(
      current,
      language,
    ));
    if (hasUsedNomenclatureToggle) return;

    setHasUsedNomenclatureToggle(true);
    setShowNomenclatureHint(true);
    if (nomenclatureHintTimer.current !== null) {
      window.clearTimeout(nomenclatureHintTimer.current);
    }
    nomenclatureHintTimer.current = window.setTimeout(() => {
      setShowNomenclatureHint(false);
      nomenclatureHintTimer.current = null;
    }, 3600);
  };

  return (
    <main
      className={[
        "app-shell",
        highContrastEnabled && "a11y-high-contrast",
        largeTextEnabled && "a11y-large-text",
        doubleBondPatternEnabled && "a11y-double-bond-pattern",
        largeTargetsEnabled && "a11y-large-targets",
        dyslexiaTypefaceEnabled && "a11y-dyslexia-typeface",
        simplifiedModeEnabled && "a11y-simplified-mode",
        highlightInteractivesEnabled && "a11y-highlight-interactives",
      ].filter(Boolean).join(" ")}
      onPointerDownCapture={dismissValenceAlert}
    >
      <header className="site-header">
        <div className="brand-mark">
          <img src="../sciu-eye.png" alt="Sciu Science" />
        </div>
        <div className="brand-copy">
          <p>{t("Laboratorio interactivo")}</p>
          <h1>{t("Laboratorio de Hidrocarburos")}</h1>
        </div>
        <div className="header-actions">
          <button
            className="personal-history-control"
            onClick={() => {
              setLibrarySection("history");
              setHistoryQuery("");
              setHistoryOpen(true);
            }}
            aria-label={language === "en" ? `Open my history. ${historyEntries.length} recent versions` : `Abrir mi historial. ${historyEntries.length} versiones recientes`}
            aria-haspopup="dialog"
          >
            <span className="personal-history-icon" aria-hidden="true">↺</span>
            <span className="personal-history-copy">
              {t("Historial")}
              <small>{historySyncState === "saving" ? t("Guardando…") : t("Siempre disponible")}</small>
            </span>
            <strong>{historyEntries.length}</strong>
          </button>
          <button
            className="personal-history-control personal-saved-control"
            onClick={() => {
              setLibrarySection("saved");
              setHistoryQuery("");
              setHistoryOpen(true);
            }}
            aria-label={language === "en" ? `Open Saved. ${savedEntries.length} selected structures` : `Abrir Guardados. ${savedEntries.length} estructuras elegidas`}
            aria-haspopup="dialog"
          >
            <span className="personal-history-icon" aria-hidden="true">★</span>
            <span className="personal-history-copy">
              {t("Guardados")}
              <small>{t("Elegidos por ti")}</small>
            </span>
            <strong>{savedEntries.length}</strong>
          </button>
          <div className="language-switch" role="group" aria-label={language === "en" ? "Language" : "Idioma"}>
            <button
              type="button"
              className={language === "es" ? "active" : ""}
              aria-pressed={language === "es"}
              onClick={() => setLanguage("es")}
              title="Español"
            >
              ES
            </button>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
              title="English"
            >
              EN
            </button>
          </div>
          <button
            className="theme-control"
            onClick={cycleTheme}
            aria-label={language === "en" ? `Theme ${themeModeLabel}. Change color mode` : `Tema ${themeModeLabel}. Cambiar modo de color`}
            title={t("Alternar entre automático, claro y oscuro")}
          >
            <span className="theme-icon" aria-hidden="true">{isDarkTheme ? "☾" : "☀"}</span>
            <span>{t("Tema")} <strong>{themeModeLabel}</strong></span>
          </button>
          <button
            type="button"
            className="settings-control"
            onClick={() => {
              setHistoryOpen(false);
              setSettingsOpen(true);
            }}
            aria-label={t("Abrir configuración")}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            title={t("Configuración")}
          >
            <span aria-hidden="true">⚙</span>
          </button>
          <div className="scope-pill">
            <span className="status-dot" />
            {t("Hidrocarburos · grupos funcionales")}
          </div>
        </div>
      </header>

      {historyOpen && (
        <div className="history-overlay">
          <button
            className="history-scrim"
            onClick={() => setHistoryOpen(false)}
            aria-label={t("Cerrar historial")}
          />
          <aside
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <div className="history-drawer-heading">
              <div>
                <p className="eyebrow">{t("Biblioteca personal")}</p>
                <h2 id="history-title">{t("Mi laboratorio químico")}</h2>
              </div>
              <button
                className="history-close"
                onClick={() => setHistoryOpen(false)}
                aria-label={t("Cerrar historial")}
              >
                ×
              </button>
            </div>

            <div className="library-tabs" role="tablist" aria-label={t("Secciones de mi laboratorio")}>
              <button
                className={librarySection === "history" ? "active" : ""}
                onClick={() => {
                  setLibrarySection("history");
                  setHistoryQuery("");
                  setHistoryTransferNotice(null);
                }}
                role="tab"
                aria-selected={librarySection === "history"}
              >
                <span aria-hidden="true">↺</span>
                <span>{t("Historial")}<small>{t("Automático")}</small></span>
                <strong>{historyEntries.length}</strong>
              </button>
              <button
                className={librarySection === "saved" ? "active" : ""}
                onClick={() => {
                  setLibrarySection("saved");
                  setHistoryQuery("");
                  setHistoryTransferNotice(null);
                }}
                role="tab"
                aria-selected={librarySection === "saved"}
              >
                <span aria-hidden="true">★</span>
                <span>{t("Guardados")}<small>{t("Elegidos por ti")}</small></span>
                <strong>{savedEntries.length}</strong>
              </button>
            </div>

            {librarySection === "history" ? (
              <div className="history-transfer-toolbar" aria-label={t("Exportar o borrar el historial químico")}>
                <button
                  onClick={exportHistoryLibrary}
                  disabled={!historyEntries.length || historyClearing}
                  title={historyEntries.length
                    ? t("Descargar el historial en un único documento")
                    : t("El historial todavía no contiene estructuras")}
                >
                  <span aria-hidden="true">↓</span>
                  {t("Exportar historial")}
                </button>
                <button
                  className="history-clear-all"
                  onClick={clearHistory}
                  disabled={!historyEntries.length || historyClearing || historySyncState === "saving"}
                  title={historyEntries.length
                    ? t("Borrar únicamente el historial; Guardados se conservará")
                    : t("El historial ya está vacío")}
                  aria-label={t("Borrar todo mi historial sin eliminar Guardados")}
                >
                  <span aria-hidden="true">⌫</span>
                  {historyClearing ? t("Borrando…") : t("Borrar historial")}
                </button>
              </div>
            ) : (
              <div className="history-transfer-toolbar" aria-label={t("Importar y exportar estructuras guardadas")}>
                <label className={historyImporting || !historyIdentity ? "disabled" : ""}>
                  <span aria-hidden="true">↑</span>
                  {historyImporting ? t("Importando…") : t("Importar .quimica")}
                  <input
                    type="file"
                    accept=".quimica,.json,application/json"
                    onChange={importChemistryDocument}
                    disabled={historyImporting || !historyIdentity}
                    aria-label={t("Importar documento químico a Guardados")}
                  />
                </label>
                <button
                  onClick={exportSavedLibrary}
                  disabled={!savedEntries.length}
                  title={savedEntries.length
                    ? t("Descargar todas las estructuras guardadas en un único documento")
                    : t("Añade una estructura a Guardados antes de exportar")}
                >
                  <span aria-hidden="true">↓</span>
                  {t("Exportar guardados")}
                </button>
              </div>
            )}

            {historyTransferNotice && (
              <div className={`history-transfer-notice transfer-${historyTransferNotice.kind}`} role="status">
                <span aria-hidden="true">{historyTransferNotice.kind === "success" ? "✓" : "!"}</span>
                <p>{localizedDynamicText(historyTransferNotice.message)}</p>
                <button
                  onClick={() => setHistoryTransferNotice(null)}
                  aria-label={t("Cerrar aviso de archivo")}
                >
                  ×
                </button>
              </div>
            )}

            {librarySection === "saved" ? (
              <div className="history-current-card">
                <MoleculeHistoryPreview molecule={molecule} />
                <div>
                  <span>{t("Estructura actual")}</span>
                  <strong>{localizedCanonicalIupacName}</strong>
                  <small>{analysis.formula} · {localizedHistoryFamilyLabel}</small>
                </div>
                <button onClick={saveCurrentStructure} disabled={!historyIdentity || savedBusy}>
                  {savedBusy ? t("Guardando…") : t("Añadir a Guardados")}
                </button>
              </div>
            ) : (
              <div className={`history-sync history-sync-${historySyncState}`} role="status">
                <span aria-hidden="true" />
                <div>
                  <strong>{localizedDynamicText(historyMessage)}</strong>
                  <small>
                    {historyScope === "account"
                      ? t("El historial se recupera cuando vuelves con la misma cuenta.")
                      : t("El historial se recupera cuando vuelves desde este navegador.")}
                  </small>
                </div>
              </div>
            )}

            <label className="history-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder={language === "en" ? `Search ${librarySection === "history" ? "history" : "Saved"}` : `Buscar en ${librarySection === "history" ? "el historial" : "Guardados"}`}
                aria-label={language === "en" ? `Search ${librarySection === "history" ? "my history" : "Saved"}` : `Buscar en ${librarySection === "history" ? "mi historial" : "Guardados"}`}
              />
              {historyQuery && (
                <button onClick={() => setHistoryQuery("")} aria-label={t("Limpiar búsqueda")}>×</button>
              )}
            </label>

            <div className="history-list-heading">
              <div>
                <strong>{librarySection === "history" ? t("Versiones recientes") : t("Estructuras guardadas")}</strong>
                <small>
                  {librarySection === "history"
                    ? t("Se guarda una versión única después de cada pausa.")
                    : t("Esta sección solo contiene lo que decides conservar.")}
                </small>
              </div>
              <span>{filteredLibraryEntries.length}</span>
            </div>

            <div className="history-list">
              {historySyncState === "loading" ? (
                <div className="history-empty">
                  <span className="history-loader" aria-hidden="true" />
                  <strong>{t("Cargando tus estructuras…")}</strong>
                </div>
              ) : filteredLibraryEntries.length ? (
                filteredLibraryEntries.map((entry) => (
                  <article className="history-item" key={entry.id}>
                    <button
                      className="history-item-open"
                      onClick={() => restoreLibraryEntry(entry, librarySection)}
                      aria-label={language === "en" ? `Open ${localizedIupac(entry.name)}` : `Abrir ${entry.name}`}
                    >
                      <MoleculeHistoryPreview molecule={entry.molecule} />
                      <span className="history-item-copy">
                        <strong>{localizedIupac(entry.name)}</strong>
                        <span>{entry.formula} · {language === "en" ? t(entry.family) : entry.family}</span>
                        <small>{formatHistoryDate(entry.updatedAt, language)} · {entry.atomCount} {entry.atomCount === 1 ? t("átomo") : t("átomos")}</small>
                      </span>
                    </button>
                    <div className="history-item-actions">
                      <button
                        className="history-download"
                        onClick={() => exportHistoryEntry(entry)}
                        aria-label={language === "en" ? `Download ${localizedIupac(entry.name)} as a chemistry document` : `Descargar ${entry.name} como documento químico`}
                        title={language === "en" ? "Download .quimica file" : "Descargar archivo .quimica"}
                      >
                        ↓
                      </button>
                      <button
                        className="history-delete"
                        onClick={() => librarySection === "history"
                          ? deleteHistoryEntry(entry)
                          : deleteSavedEntry(entry)}
                        aria-label={language === "en" ? `Remove ${localizedIupac(entry.name)} from ${librarySection === "history" ? "my history" : "Saved"}` : `Eliminar ${entry.name} de ${librarySection === "history" ? "mi historial" : "Guardados"}`}
                        title={librarySection === "history" ? t("Eliminar del historial") : t("Eliminar de Guardados")}
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="history-empty">
                  <span aria-hidden="true">⌬</span>
                  <strong>
                    {historyQuery
                      ? (language === "en" ? "No matches found" : "No encontramos coincidencias")
                      : librarySection === "history"
                        ? t("Tu historial comienza aquí")
                        : t("Todavía no tienes estructuras guardadas")}
                  </strong>
                  <p>
                    {historyQuery
                      ? t("Prueba con el nombre IUPAC, la fórmula o la familia del compuesto.")
                      : librarySection === "history"
                        ? t("Construye una molécula y aparecerán aquí sus versiones recientes.")
                        : t("Añade la estructura actual o importa un archivo .quimica para conservarlo aparte del historial.")}
                  </p>
                </div>
              )}
            </div>

            <p className="history-privacy-note">
              <span aria-hidden="true">✓</span>
              {t("Historial y Guardados permanecen separados y cada visitante ve únicamente sus propias estructuras.")}
            </p>
          </aside>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-overlay">
          <button
            className="settings-scrim"
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label={t("Cerrar configuración")}
          />
          <aside
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-panel-heading">
              <div>
                <p className="eyebrow">⚙ {t("Configuración")}</p>
                <h2 id="settings-title">{t("Configuración")}</h2>
              </div>
              <button
                type="button"
                className="settings-close"
                onClick={() => setSettingsOpen(false)}
                aria-label={t("Cerrar configuración")}
              >
                ×
              </button>
            </div>

            <section className="settings-section" aria-labelledby="settings-options-title">
              <h3 id="settings-options-title">{t("Preferencias")}</h3>
              <label className="settings-toggle">
                <span>{t("Mostrar hidrógenos implícitos")}</span>
                <input
                  type="checkbox"
                  checked={showHydrogens}
                  onChange={(event) => setShowHydrogens(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className={`settings-toggle ${!automaticNumberingAvailable ? "is-disabled" : ""}`}>
                <span>{t("Numerar anillo")}</span>
                <input
                  type="checkbox"
                  checked={effectiveShowNumbering}
                  disabled={!automaticNumberingAvailable}
                  onChange={(event) => setShowNumbering(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Resaltar sustituyentes")}</span>
                <input
                  type="checkbox"
                  checked={highlightSubstituents}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setHighlightSubstituents(enabled);
                    setNotice(
                      enabled
                        ? "Sustituyentes resaltados en amarillo para diferenciarlos de la cadena principal."
                        : "Color uniforme activado: cadena principal y sustituyentes comparten el mismo color.",
                    );
                  }}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Recordar estereoquímica")}</span>
                <input
                  type="checkbox"
                  checked={showStereochemistry}
                  onChange={(event) => setShowStereochemistry(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </section>

            <section className="settings-section settings-accessibility" aria-labelledby="settings-accessibility-title">
              <h3 id="settings-accessibility-title">{t("Accesibilidad opcional")}</h3>
              <label className="settings-toggle">
                <span>{t("Lectores de pantalla avanzados")}</span>
                <input
                  type="checkbox"
                  checked={advancedScreenReaderEnabled}
                  onChange={(event) => setAdvancedScreenReaderEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Contraste alto AA")}</span>
                <input
                  type="checkbox"
                  checked={highContrastEnabled}
                  onChange={(event) => setHighContrastEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Texto ampliado")}</span>
                <input
                  type="checkbox"
                  checked={largeTextEnabled}
                  onChange={(event) => setLargeTextEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Patrón en enlaces dobles")}</span>
                <input
                  type="checkbox"
                  checked={doubleBondPatternEnabled}
                  onChange={(event) => setDoubleBondPatternEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Botones ampliados")}</span>
                <input
                  type="checkbox"
                  checked={largeTargetsEnabled}
                  onChange={(event) => setLargeTargetsEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Tipografía para dislexia")}</span>
                <input
                  type="checkbox"
                  checked={dyslexiaTypefaceEnabled}
                  onChange={(event) => setDyslexiaTypefaceEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Modo simplificado")}</span>
                <input
                  type="checkbox"
                  checked={simplifiedModeEnabled}
                  onChange={(event) => setSimplifiedModeEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
              <label className="settings-toggle">
                <span>{t("Destacar interactivos")}</span>
                <input
                  type="checkbox"
                  checked={highlightInteractivesEnabled}
                  onChange={(event) => setHighlightInteractivesEnabled(event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </section>

            <section className="settings-section settings-shortcuts" aria-labelledby="settings-shortcuts-title">
              <h3 id="settings-shortcuts-title">{t("Atajos de teclado")}</h3>
              {[
                [["Ctrl", "Z"], "Deshacer"],
                [["Ctrl", "Y"], "Rehacer"],
                [["Ctrl", "R"], "Redibujar"],
                [["Ctrl", "S"], "Guardar"],
                [["Ctrl", "Shift", "S"], "Exportar"],
                [["Ctrl", "I"], "Importar"],
                [["Ctrl", "N"], "Nueva molécula"],
                [["Delete / Supr"], "Borrar"],
                [["Esc"], "Deseleccionar"],
                [["Ctrl", "1"], "Por nombre"],
                [["Ctrl", "2"], "SMILES"],
                [["Ctrl", "3"], "Semides."],
                [["Ctrl", "4"], "Esquelética"],
              ].map(([keys, label]) => (
                <div className="settings-shortcut" key={`${keys.join("-")}-${label}`}>
                  <span className="shortcut-keys">
                    {keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <b aria-hidden="true">+</b>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </span>
                  <span>{t(label)}</span>
                </div>
              ))}
            </section>
          </aside>
        </div>
      )}

      <section className="intro-strip" aria-label={t("Instrucciones breves")}>
        <div>
          <span className="step-number">1</span>
          <p><strong>{t("Selecciona")}</strong> {t("un carbono")}</p>
        </div>
        <div className="step-line" />
        <div>
          <span className="step-number">2</span>
          <p><strong>{t("Añade")}</strong> {t("C, enlaces y grupos funcionales")}</p>
        </div>
        <div className="step-line" />
        <div>
          <span className="step-number">3</span>
          <p><strong>{t("Analiza")}</strong> {t("el nombre IUPAC")}</p>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="builder-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("Estructura molecular")}</p>
              <h2>{t("Construye la estructura orgánica")}</h2>
            </div>
            <div className="heading-actions">
              <button
                className={`name-builder-toggle ${nameBuilderOpen ? "active" : ""}`}
                onClick={() => {
                  setNameBuilderOpen((open) => !open);
                  setNameBuilderFeedback(null);
                }}
                aria-expanded={nameBuilderOpen}
                aria-controls="iupac-name-builder"
              >
                <span aria-hidden="true">Aa</span>
                {t("Por nombre")}
              </button>
              <button
                className={`name-builder-toggle smiles-toggle ${smilesPanelOpen ? "active" : ""}`}
                onClick={() => {
                  setSmilesPanelOpen((open) => !open);
                  setSmilesFeedback(null);
                }}
                aria-expanded={smilesPanelOpen}
                aria-controls="smiles-interop-panel"
                title={t("Importar o exportar la molécula mediante SMILES")}
              >
                <span aria-hidden="true">S</span>
                SMILES
              </button>
              <div className="view-mode-switch" role="group" aria-label={t("Tipo de representación molecular")}>
                <button
                  className={viewMode === "condensed" ? "active" : ""}
                  onClick={() => changeViewMode("condensed")}
                  aria-pressed={viewMode === "condensed"}
                  title={t("Vista semidesarrollada")}
                >
                  <span className="condensed-icon" aria-hidden="true">CH₃</span>
                  <span className="mode-label">{t("Semides.")}</span>
                </button>
                <button
                  className={viewMode === "skeletal" ? "active" : ""}
                  onClick={() => changeViewMode("skeletal")}
                  aria-pressed={viewMode === "skeletal"}
                  title={t("Vista esquelética o de líneas")}
                >
                  <span className="line-angle-icon" aria-hidden="true"><i /><i /></span>
                  <span className="mode-label">{t("Esquelética")}</span>
                </button>
              </div>
              <div className="history-controls" aria-label={t("Historial de cambios")}>
                <button
                  className="new-button redraw-button"
                  type="button"
                  onClick={redrawMolecule}
                  title={t("Redibujar la estructura en espejo")}
                  aria-label={t("Redibujar la estructura en espejo")}
                >
                  <span aria-hidden="true">↔</span> {t("Redibujar")}
                </button>
                <button onClick={undo} disabled={!undoStack.length} title={t("Deshacer")}>↶</button>
                <button onClick={redo} disabled={!future.length} title={t("Rehacer")}>↷</button>
                <button className="new-button" onClick={newMolecule}>{t("Nueva")}</button>
              </div>
            </div>
          </div>

          {nameBuilderOpen && (
            <form
              id="iupac-name-builder"
              className="name-builder-panel"
              onSubmit={constructFromIupacName}
            >
              <div className="name-builder-intro">
                <span className="name-builder-mark" aria-hidden="true">Aa</span>
                <div>
                  <strong>{t("Construir por nombre IUPAC")}</strong>
                  <small>{t("OPSIN interpreta el nombre y OpenChemLib crea el objeto molecular que se dibuja en el canvas.")}</small>
                </div>
                <span className="name-builder-scope">{t("Motor químico avanzado")}</span>
              </div>

              <div className="name-builder-field-row">
                <label htmlFor="iupac-name-input">{t("Nombre del compuesto")}</label>
                <div className="name-builder-input-group">
                  <input
                    id="iupac-name-input"
                    type="text"
                    value={iupacInput}
                    onChange={(event) => {
                      setIupacInput(event.target.value);
                      setNameBuilderFeedback(null);
                      setNameSuggestion(null);
                      setNameSuggestionPreview(null);
                      setNameSuggestionPreviewLoading(false);
                    }}
                    placeholder={language === "en" ? "E.g., 2-methylpropanoic acid" : "Ej.: ácido 2-metilpropanoico"}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={nameBuilderBusy}
                    aria-describedby="name-builder-help"
                  />
                  <button type="submit" disabled={nameBuilderBusy} aria-busy={nameBuilderBusy}>
                    {nameBuilderBusy ? t("Interpretando…") : t("Crear estructura")}
                    <span className={nameBuilderBusy ? "name-builder-spinner" : ""} aria-hidden="true">
                      {nameBuilderBusy ? "" : "→"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="name-builder-footer" id="name-builder-help">
                <div className="name-builder-examples" aria-label={t("Ejemplos de nombres compatibles")}>
                  <span>{t("Prueba:")}</span>
                  {[
                    "benceno-1,3,5-triol",
                    "butan-2-ona",
                    "ácido 2-metilpropanoico",
                    "3-(2-oxopropil)ciclohexanona",
                    "(2E)-2-etil-3-metilhex-2-enal",
                  ].map((example) => (
                    <button
                      type="button"
                      key={example}
                      disabled={nameBuilderBusy}
                      onClick={() => {
                        setIupacInput(language === "en" ? localizedIupac(example) : example);
                        setNameBuilderFeedback(null);
                        setNameSuggestion(null);
                        setNameSuggestionPreview(null);
                        setNameSuggestionPreviewLoading(false);
                      }}
                    >
                      {localizedIupac(example)}
                    </button>
                  ))}
                </div>
                <small>{t("Admite grupos funcionales, sustituyentes entre paréntesis y descriptores estereoquímicos E/Z.")}</small>
              </div>

              {nameBuilderFeedback && (
                <div
                  className={`name-builder-feedback ${nameBuilderFeedback.kind}`}
                  role={nameBuilderFeedback.kind === "error" ? "alert" : "status"}
                >
                  <span aria-hidden="true">{nameBuilderFeedback.kind === "success" ? "✓" : "!"}</span>
                  <p>{localizedDynamicText(nameBuilderFeedback.message)}</p>
                </div>
              )}
              {nameSuggestion && (
                <div className="name-suggestion" role="status">
                  <span aria-hidden="true">💡</span>
                  <p>
                    {t("Quizás quisiste decir:")}{" "}
                    <button
                      type="button"
                      className="name-suggestion-name"
                      disabled={nameBuilderBusy}
                      onPointerEnter={() => { void loadNameSuggestionPreview(); }}
                      onFocus={() => { void loadNameSuggestionPreview(); }}
                      onClick={applyNameSuggestion}
                    >
                      {nameSuggestion.name}
                      <span className="name-suggestion-tooltip" role="tooltip">
                        {nameSuggestionPreview ? (
                          <>
                            <MoleculeHistoryPreview molecule={nameSuggestionPreview} width={150} height={100} />
                            <small className="name-suggestion-iupac">{suggestionPreviewIupacName}</small>
                          </>
                        ) : nameSuggestionPreviewLoading ? (
                          <small>{t("Generando vista previa…")}</small>
                        ) : (
                          <small>{t("Pasa el cursor para ver la estructura")}</small>
                        )}
                      </span>
                    </button>{language === "en" ? "?" : ""}
                  </p>
                </div>
              )}
            </form>
          )}

          {smilesPanelOpen && (
            <section id="smiles-interop-panel" className="smiles-interop-panel" aria-label={t("Compatibilidad SMILES")}>
              <div className="smiles-interop-intro">
                <span className="smiles-interop-mark" aria-hidden="true">S</span>
                <div>
                  <strong>{t("Compatibilidad SMILES")}</strong>
                  <small>{t(".quimica sigue siendo el formato nativo de SciU; SMILES permite intercambiar la molécula con otras herramientas químicas.")}</small>
                </div>
                <span className="smiles-interop-scope">OpenChemLib</span>
              </div>

              <div className="smiles-interop-actions">
                <button type="button" onClick={exportCurrentSmiles}>
                  <span aria-hidden="true">↓</span>
                  {t("Exportar SMILES (.smi)")}
                </button>
                <label className={smilesImporting ? "disabled" : ""}>
                  <span aria-hidden="true">↑</span>
                  {smilesImporting ? t("Importando…") : t("Importar SMILES")}
                  <input
                    type="file"
                    accept=".smi,.smiles,.txt,text/plain,chemical/x-daylight-smiles"
                    onChange={importSmilesDocument}
                    disabled={smilesImporting}
                    aria-label={t("Importar archivo SMILES al canvas")}
                  />
                </label>
              </div>

              <div className="smiles-format-note">
                <code>.smi</code>
                <span>{t("Se exporta una cadena SMILES isomérica en texto plano. También se aceptan archivos .smiles y .txt al importar.")}</span>
              </div>

              {smilesFeedback && (
                <div className={`smiles-feedback ${smilesFeedback.kind}`} role={smilesFeedback.kind === "error" ? "alert" : "status"}>
                  <span aria-hidden="true">{smilesFeedback.kind === "success" ? "✓" : "!"}</span>
                  <p>{smilesFeedback.message}</p>
                </div>
              )}
            </section>
          )}

          {canvasExpanded && (
            <button
              type="button"
              className="canvas-expand-scrim"
              aria-label={t("Cerrar vista ampliada")}
              onClick={() => setCanvasExpanded(false)}
            />
          )}

          <div
            className={`molecule-stage ${viewMode === "skeletal" ? "skeletal-view" : "condensed-view"} ${highlightSubstituents ? "" : "uniform-colors"} ${canvasExpanded ? "is-expanded" : ""} ${canvasScaleClass}`}
            tabIndex={advancedScreenReaderEnabled ? 0 : undefined}
            role={advancedScreenReaderEnabled ? "group" : undefined}
            aria-label={advancedScreenReaderEnabled ? t("Canvas molecular interactivo") : undefined}
            onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
          >
            <button
              type="button"
              className="canvas-expand-button"
              aria-expanded={canvasExpanded}
              aria-label={canvasExpanded ? t("Cerrar vista ampliada") : t("Ampliar canvas")}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setCanvasExpanded((expanded) => !expanded)}
            >
              <span aria-hidden="true">{canvasExpanded ? "×" : "⌕"}</span>
              {canvasExpanded ? t("Cerrar") : t("Ampliar")}
            </button>

            <svg
              role={advancedScreenReaderEnabled ? "img" : undefined}
              aria-label={advancedScreenReaderEnabled ? language === "en"
                ? `${viewMode === "skeletal" ? "Skeletal representation" : "Condensed structural representation"} ${showIupacName ? `of ${displayedIupacName}` : "of the constructed molecule"}`
                : `${viewMode === "skeletal" ? "Representación esquelética" : "Representación semidesarrollada"} ${showIupacName ? `de ${displayedIupacName}` : "de la molécula construida"}` : undefined}
              viewBox={`${viewCenterX - viewWidth / 2} ${viewCenterY - viewHeight / 2} ${viewWidth} ${viewHeight}`}
            >
              <defs>
                <pattern id="dotGrid" width="26" height="26" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.4" fill="var(--grid-dot)" />
                </pattern>
              </defs>
              <rect
                x={viewCenterX - viewWidth / 2}
                y={viewCenterY - viewHeight / 2}
                width={viewWidth}
                height={viewHeight}
                fill="url(#dotGrid)"
              />

              <g className="molecule-bonds-layer">
              {molecule.bonds.map((bond) => {
                const [a, b] = bond;
                const order = getBondOrder(bond);
                const positionA = displayPositions.get(a)!;
                const positionB = displayPositions.get(b)!;
                const isMainBond = mainChainSet.has(a) && mainChainSet.has(b);
                const atomA = getAtom(a, molecule)!;
                const atomB = getAtom(b, molecule)!;
                const isFunctionalBond = !isCarbonAtom(atomA) || !isCarbonAtom(atomB);
                const deltaX = positionB.x - positionA.x;
                const deltaY = positionB.y - positionA.y;
                const bondLength = Math.hypot(deltaX, deltaY) || 1;
                const normalX = -deltaY / bondLength;
                const normalY = deltaX / bondLength;
                const containingRing = molecule.rings?.find(
                  (ring) => ring.atomIds.includes(a) && ring.atomIds.includes(b),
                );
                const ringDoubleBondSegments = viewMode === "skeletal"
                  && order === 2
                  && containingRing
                  ? getSkeletalRingDoubleBondSegments(
                      positionA,
                      positionB,
                      containingRing.atomIds.map((atomId) => displayPositions.get(atomId)!),
                    )
                  : null;
                const offsets = order === 1 ? [0] : order === 2 ? [-5, 5] : [-8, 0, 8];
                const rawBondSegments = ringDoubleBondSegments ?? offsets.map((offset) => ({
                  x: positionA.x + normalX * offset,
                  y: positionA.y + normalY * offset,
                  x2: positionB.x + normalX * offset,
                  y2: positionB.y + normalY * offset,
                  role: null,
                }));
                const startNumberObstacle = effectiveShowNumbering
                  && carbonCount > 1
                  && isCarbonAtom(atomA)
                  && analysis.numberedAtoms.has(a)
                  ? {
                      center: {
                        x: positionA.x + skeletalNumberBadgeOffsets.get(a)!.x,
                        y: positionA.y + skeletalNumberBadgeOffsets.get(a)!.y,
                      },
                      radius: SKELETAL_NUMBER_BADGE_CLEARANCE,
                    }
                  : undefined;
                const endNumberObstacle = effectiveShowNumbering
                  && carbonCount > 1
                  && isCarbonAtom(atomB)
                  && analysis.numberedAtoms.has(b)
                  ? {
                      center: {
                        x: positionB.x + skeletalNumberBadgeOffsets.get(b)!.x,
                        y: positionB.y + skeletalNumberBadgeOffsets.get(b)!.y,
                      },
                      radius: SKELETAL_NUMBER_BADGE_CLEARANCE,
                    }
                  : undefined;
                const startHeteroObstacle = viewMode === "skeletal" && !isCarbonAtom(atomA)
                  ? {
                      center: positionA,
                      radius: 22,
                    }
                  : undefined;
                const endHeteroObstacle = viewMode === "skeletal" && !isCarbonAtom(atomB)
                  ? {
                      center: positionB,
                      radius: 22,
                    }
                  : undefined;
                const bondClipOptions = {
                  startObstacle: startNumberObstacle ?? startHeteroObstacle,
                  endObstacle: endNumberObstacle ?? endHeteroObstacle,
                };
                const visibleBondSegments = viewMode === "skeletal" && order > 1
                  ? ringDoubleBondSegments
                    ? clipSkeletalRingDoubleBondSegments(
                        ringDoubleBondSegments,
                        positionA,
                        positionB,
                        bondClipOptions,
                      )
                    : clipSkeletalParallelBondSegments(
                        rawBondSegments,
                        positionA,
                        positionB,
                        bondClipOptions,
                      )
                  : rawBondSegments;
                const lockedBond = isFunctionalBond
                  || containingRing?.kind === "aromatic"
                  || Boolean(molecule.rings?.length && !containingRing);
                const stereoInspection = order === 2 && !lockedBond && !containingRing
                  ? inspectDoubleBondStereochemistry(molecule, a, b)
                  : null;
                const stereoConfiguration = stereoInspection?.stereogenic
                  ? stereoInspection.configuration
                  : null;
                const stereoToggleAvailable = Boolean(stereoInspection?.stereogenic);
                const stereoInteractionEnabled = stereochemistryEnabled && stereoToggleAvailable;
                const stereoLocantIndex = stereoToggleAvailable
                  ? analysis.mainChain.slice(0, -1).findIndex((atomId, index) => {
                      const nextAtomId = analysis.mainChain[index + 1];
                      return (atomId === a && nextAtomId === b)
                        || (atomId === b && nextAtomId === a);
                    })
                  : -1;
                const stereoLocant = stereoLocantIndex >= 0 ? stereoLocantIndex + 1 : null;
                const currentStereoLabel = stereoConfiguration
                  ? `${stereoLocant ?? ""}${stereoConfiguration}`
                  : "E/Z";
                const nextStereoLabel = stereoConfiguration === "E" ? "Z" : "E";
                const markerX = (positionA.x + positionB.x) / 2 + normalX * 25;
                const markerY = (positionA.y + positionB.y) / 2 + normalY * 25;
                return (
                  <g
                    key={`${a}-${b}`}
                    className={`bond-control bond-order-${order} ${lockedBond ? "locked-bond" : ""} ${stereoInteractionEnabled ? "stereo-bond-control" : ""}`}
                    onClick={() => cycleBondOrder(a, b)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        cycleBondOrder(a, b);
                      }
                    }}
                    role={advancedScreenReaderEnabled ? "button" : undefined}
                    tabIndex={advancedScreenReaderEnabled ? 0 : undefined}
                    aria-label={advancedScreenReaderEnabled ? (lockedBond
                      ? language === "en"
                        ? `${t(getBondOrderLabel(order))} bond locked to preserve ${isFunctionalBond ? "the functional group" : "the ring structure"}`
                        : `Enlace ${getBondOrderLabel(order)} fijado para conservar ${isFunctionalBond ? "el grupo funcional" : "la estructura cíclica"}`
                      : stereoInteractionEnabled
                        ? language === "en"
                          ? `Stereogenic double bond ${currentStereoLabel}. Activate to change to ${stereoLocant ?? ""}${nextStereoLabel}`
                          : `Doble enlace estereogénico ${currentStereoLabel}. Activar para cambiar a ${stereoLocant ?? ""}${nextStereoLabel}`
                        : stereoToggleAvailable
                          ? t("Activa Estereoquímica para alternar la configuración E/Z de este doble enlace")
                        : language === "en"
                          ? `${t(getBondOrderLabel(order))} bond. Activate to change to ${t(getBondOrderLabel(order === 3 ? 1 : (order + 1) as BondOrder))}`
                          : `Enlace ${getBondOrderLabel(order)}. Activar para cambiar a ${getBondOrderLabel(order === 3 ? 1 : (order + 1) as BondOrder)}`) : undefined}
                  >
                    <line
                      className="bond-hit-target"
                      x1={positionA.x}
                      y1={positionA.y}
                      x2={positionB.x}
                      y2={positionB.y}
                    />
                    {visibleBondSegments.map((segment, index) => (
                      <line
                        key={index}
                        className={`${isMainBond ? "bond main-bond" : "bond branch-bond"} ${isFunctionalBond ? "functional-bond" : ""} ${viewMode === "skeletal" ? "skeletal-bond" : ""} ${segment.role ? `skeletal-ring-double-bond ring-double-bond-${segment.role}` : ""} ${doubleBondPatternEnabled && order === 2 ? `double-bond-pattern-line double-bond-pattern-${index}` : ""}`}
                        x1={segment.x}
                        y1={segment.y}
                        x2={segment.x2}
                        y2={segment.y2}
                      />
                    ))}
                    {stereoInteractionEnabled && (
                      <g
                        className="stereo-bond-marker"
                        transform={`translate(${markerX} ${markerY})`}
                        aria-hidden="true"
                      >
                        <rect x="-16" y="-10" width="32" height="20" rx="10" />
                        <text textAnchor="middle" dominantBaseline="central">
                          {stereoConfiguration ?? "E/Z"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              </g>

              <g className="molecule-nodes-layer">
              {molecule.atoms.map((atom) => {
                const element = getElement(atom);
                const carbonAtom = isCarbonAtom(atom);
                const hydrogenCount = getImplicitHydrogens(atom.id, molecule);
                const isSelected = atom.id === selectedAtom.id;
                const chainNumber = analysis.numberedAtoms.get(atom.id);
                const position = displayPositions.get(atom.id)!;
                const numberBadgeOffset = skeletalNumberBadgeOffsets.get(atom.id)
                  ?? SKELETAL_NUMBER_BADGE_OFFSET;
                const showHydrogenOnLabel = showHydrogens;
                const atomLabel = carbonAtom
                  ? showHydrogenOnLabel
                    ? hydrogenCount === 0
                      ? "C"
                      : "CH"
                    : "C"
                  : showHydrogenOnLabel && hydrogenCount > 0
                    ? `${element}H`
                    : element;
                const hydrogenSubscript = showHydrogenOnLabel && hydrogenCount > 1
                  ? hydrogenCount
                  : undefined;
                const chargeText = atom.charge === 1 ? "+" : atom.charge === -1 ? "−" : "";
                const visibleLabelLength = atomLabel.length + (chargeText ? 1 : 0);
                const heteroBadgeWidth = visibleLabelLength >= 3 ? 40 : visibleLabelLength === 2 ? 31 : 24;
                return (
                  <g
                    key={atom.id}
                    className={`carbon-node ${carbonAtom ? "carbon-element" : `hetero-node element-${element.toLowerCase()}`} ${viewMode === "skeletal" ? (carbonAtom ? "skeletal-node" : "skeletal-hetero-node") : "condensed-node"} ${isSelected ? "selected" : ""} ${mainChainSet.has(atom.id) ? "on-main-chain" : "on-branch"}`}
                    transform={`translate(${position.x} ${position.y})`}
                    onClick={() => {
                      previousSelectedId.current = selectedAtom.id;
                      setSelectedId(atom.id);
                      setNotice(`${elementNames[element][0].toUpperCase()}${elementNames[element].slice(1)} ${chainNumber ?? "del grupo funcional"} seleccionado.`);
                    }}
                    role={advancedScreenReaderEnabled ? "button" : undefined}
                    tabIndex={advancedScreenReaderEnabled ? 0 : undefined}
                    aria-label={advancedScreenReaderEnabled
                      ? language === "en"
                        ? `Select ${t(elementNames[element])} ${chainNumber ?? atom.id}`
                        : `Seleccionar ${elementNames[element]} ${chainNumber ?? atom.id}`
                      : undefined}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        previousSelectedId.current = selectedAtom.id;
                        setSelectedId(atom.id);
                      }
                    }}
                  >
                    {viewMode === "skeletal" ? (
                      carbonAtom ? (
                        <>
                          <circle className="skeletal-hit-target" r="31" />
                          {isSelected && <circle className="skeletal-selection-ring" r="22" />}
                          <circle className="skeletal-anchor" r="3.2" />
                          {carbonCount === 1 && molecule.atoms.length === 1 && (
                            <g className="methane-marker">
                              <circle r="28" />
                              <text textAnchor="middle" dominantBaseline="central">
                                {showHydrogens ? (
                                  <>
                                    <tspan>CH</tspan>
                                    <tspan className="hydrogen-subscript" baselineShift="sub">4</tspan>
                                  </>
                                ) : (
                                  <tspan>C</tspan>
                                )}
                              </text>
                            </g>
                          )}
                          {effectiveShowNumbering && chainNumber && carbonCount > 1 && (
                            <g
                              className="skeletal-number"
                              transform={`translate(${numberBadgeOffset.x} ${numberBadgeOffset.y})`}
                            >
                              <circle className="number-circle" r="12" />
                              <text className="number-label" textAnchor="middle" dominantBaseline="central">{chainNumber}</text>
                            </g>
                          )}
                        </>
                      ) : (
                        <>
                          <rect
                            className="skeletal-hetero-hit-target"
                            x={-heteroBadgeWidth / 2 - 8}
                            y={-18}
                            width={heteroBadgeWidth + 16}
                            height={36}
                            rx={18}
                          />
                          {isSelected && (
                            <rect
                              className="skeletal-selection-ring skeletal-hetero-selection-ring"
                              x={-heteroBadgeWidth / 2 - 4}
                              y={-14}
                              width={heteroBadgeWidth + 8}
                              height={28}
                              rx={14}
                            />
                          )}
                          <rect
                            className="skeletal-hetero-badge"
                            x={-heteroBadgeWidth / 2}
                            y={-13}
                            width={heteroBadgeWidth}
                            height={26}
                            rx={13}
                          />
                          <text className="atom-label skeletal-hetero-label" textAnchor="middle" dominantBaseline="central">
                            <tspan>{atomLabel}</tspan>
                            {hydrogenSubscript && (
                              <tspan className="hydrogen-subscript" baselineShift="sub">
                                {hydrogenSubscript}
                              </tspan>
                            )}
                            {chargeText && (
                              <tspan className="atom-charge" baselineShift="super">{chargeText}</tspan>
                            )}
                          </text>
                          {effectiveShowNumbering && chainNumber && (
                            <g
                              className="skeletal-number"
                              transform={`translate(${numberBadgeOffset.x} ${numberBadgeOffset.y})`}
                            >
                              <circle className="number-circle" r="12" />
                              <text className="number-label" textAnchor="middle" dominantBaseline="central">{chainNumber}</text>
                            </g>
                          )}
                        </>
                      )
                    ) : (
                      <>
                        {isSelected && <circle className="selection-ring" r="39" />}
                        <circle className="atom-circle" r="28" />
                        <text className="atom-label" textAnchor="middle" dominantBaseline="central">
                          <tspan>{atomLabel}</tspan>
                          {hydrogenSubscript && (
                            <tspan className="hydrogen-subscript" baselineShift="sub">
                              {hydrogenSubscript}
                            </tspan>
                          )}
                          {chargeText && (
                            <tspan className="atom-charge" baselineShift="super">{chargeText}</tspan>
                          )}
                        </text>
                        {effectiveShowNumbering && chainNumber && (
                          <g transform={`translate(${molecule.isMirrored ? -25 : 25} -27)`}>
                            <circle className="number-circle" r="12" />
                            <text className="number-label" textAnchor="middle" dominantBaseline="central">{chainNumber}</text>
                          </g>
                        )}
                      </>
                    )}
                  </g>
                );
              })}
              </g>
            </svg>

            <div className={`structure-family-badge family-${analysis.family} ${analysis.functionalGroups.length ? "has-functional-group" : ""}`}>
              {analysis.functionalGroups.length > 0 && <span aria-hidden="true">⚗</span>}
              {analysis.family === "aromatic" && <span aria-hidden="true">⌬</span>}
              {analysis.family === "cycloalkane" && <span aria-hidden="true">⬡</span>}
              {analysis.family === "polycyclic" && <span aria-hidden="true">⬡–⬡</span>}
              {structureFamilyLabel}
            </div>

            {visibleBondInteractionHintActions.length > 0 && (
              <div className="bond-touch-hint" aria-hidden="true">
                <span>↻</span>
                <div className="bond-touch-hint-actions">
                  {visibleBondInteractionHintActions.map((action) => (
                    <small key={action}>
                      {t(action === "change-order"
                        ? "Toca un enlace · cambiar orden de enlace"
                        : "Toca un C=C · alternar E ↔ Z")}
                    </small>
                  ))}
                </div>
              </div>
            )}

            {viewMode === "skeletal" && (
              <div className="skeletal-hint">
                <span aria-hidden="true"><i /><i /></span>
                {t("Cada extremo y vértice representa un C; los H están implícitos.")}
              </div>
            )}

            <div className="stage-legend" aria-label={t("Leyenda")}>
              {highlightSubstituents ? (
                <>
                  <span><i className="main-key" /> {isRingStructure ? t("Anillo principal") : t("Cadena principal")}</span>
                  <span><i className="branch-key" /> {t("Sustituyente")}</span>
                </>
              ) : (
                <span><i className="main-key" /> {t("Estructura uniforme")}</span>
              )}
            </div>
          </div>

          {valenceAlert && (
            <div className="valence-alert" role="alert" aria-live="assertive">
              <span aria-hidden="true">!</span>
              <p>{localizedDynamicText(valenceAlert)}</p>
            </div>
          )}

          <div className="builder-toolbar">
            <div className="selection-summary">
              <span className={`selection-icon selection-${selectedElement.toLowerCase()}`}>{selectedElement}</span>
              <div>
                <p>{language === "en" ? `${t(elementNames[selectedElement])} ${t("seleccionado")}` : `${elementNames[selectedElement][0].toUpperCase() + elementNames[selectedElement].slice(1)} seleccionado`}</p>
                <strong>{selectedHydrogens} {selectedHydrogens === 1 ? t("H implícito") : t("H implícitos")} · {t("valencia")} {selectedValence}/{selectedValenceLimit}</strong>
              </div>
            </div>

            <div className="bond-order-picker" role="group" aria-label={t("Orden del próximo enlace")}>
              <span>{t("Próximo enlace")}</span>
              <div>
                {([1, 2, 3] as BondOrder[]).map((order) => (
                  <button
                    key={order}
                    className={newBondOrder === order ? "active" : ""}
                    onClick={() => {
                      setNewBondOrder(order);
                      setNotice(
                        `Enlace ${getBondOrderLabel(order)} seleccionado. Añade un carbono o pulsa un enlace dibujado para cambiarlo.`,
                      );
                    }}
                    aria-pressed={newBondOrder === order}
                    title={`${t("Crear enlace")} ${t(getBondOrderLabel(order))}`}
                  >
                    <span aria-hidden="true">{order === 1 ? "C–C" : order === 2 ? "C=C" : "C≡C"}</span>
                    <small>{t(getBondOrderLabel(order))}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="direction-pad" aria-label={t("Añadir carbono")}>
              <span className="pad-label">{t("Añadir C")}</span>
              {directionOptions.map((option) => (
                <button
                  key={option.label}
                  className={option.className}
                  onClick={() => addCarbon(option.dx, option.dy)}
                  aria-label={language === "en" ? `Add carbon ${t(option.label).toLowerCase()}` : `Añadir carbono hacia ${option.label.toLowerCase()}`}
                  title={language === "en" ? `Add ${t(option.label).toLowerCase()}` : `Añadir hacia ${option.label.toLowerCase()}`}
                >
                  {option.symbol}
                </button>
              ))}
              <span className="pad-center">+</span>
            </div>

            <div className="structure-actions">
              <button
                className={`alkyl-button ${showAlkylPalette ? "active" : ""}`}
                onClick={() => {
                  setShowAlkylPalette(!showAlkylPalette);
                  if (!showAlkylPalette) {
                    setShowRingPalette(false);
                    setShowFunctionalPalette(false);
                  }
                }}
                aria-expanded={showAlkylPalette}
                aria-controls="alkyl-palette"
              >
                <span>+</span>
                {t("Grupos alquilo")}
              </button>
              <button
                className={`ring-button ${showRingPalette ? "active" : ""}`}
                onClick={() => {
                  const nextVisible = !showRingPalette;
                  setShowRingPalette(nextVisible);
                  if (nextVisible) {
                    setShowAlkylPalette(false);
                    setShowFunctionalPalette(false);
                    setRingInsertMode(molecule.rings?.length ? "attach" : "replace");
                  }
                }}
                aria-expanded={showRingPalette}
                aria-controls="ring-palette"
              >
                <span aria-hidden="true">⬡</span>
                {t("Anillos")}
              </button>
              <button
                className={`functional-button ${showFunctionalPalette ? "active" : ""}`}
                onClick={() => {
                  const nextVisible = !showFunctionalPalette;
                  setShowFunctionalPalette(nextVisible);
                  if (nextVisible) {
                    setShowAlkylPalette(false);
                    setShowRingPalette(false);
                  }
                }}
                aria-expanded={showFunctionalPalette}
                aria-controls="functional-palette"
              >
                <span aria-hidden="true">OH</span>
                {t("Grupos funcionales")}
              </button>
              <button className="remove-button" onClick={removeSelected}>
                <span>−</span>
                {t("Retirar terminal")}
              </button>
            </div>
          </div>

          {showAlkylPalette && (
            <div className="alkyl-palette" id="alkyl-palette">
              <div className="alkyl-palette-heading">
                <div>
                  <strong>{t("Añadir al carbono seleccionado")}</strong>
                  <p>{t("Elige un grupo completo; se colocará automáticamente en un espacio libre.")}</p>
                </div>
                <button onClick={() => setShowAlkylPalette(false)} aria-label={t("Cerrar grupos alquilo")}>×</button>
              </div>
              <div className="alkyl-grid">
                {ALKYL_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className="alkyl-option"
                    onClick={() => addAlkylGroup(template)}
                    title={language === "en" ? `Add ${localizedCommonAlkylName(template.label).toLowerCase()}: ${localizedIupac(template.systematic)}` : `Añadir ${template.label.toLowerCase()}: ${template.systematic}`}
                  >
                    <span className="alkyl-formula">{template.formula}</span>
                    <span className="alkyl-copy">
                      <strong>{localizedCommonAlkylName(template.label)}</strong>
                      <small>{localizedIupac(template.systematic)}</small>
                    </span>
                  </button>
                ))}
              </div>
              <p className="alkyl-note">{t("Al buscar la cadena más larga, parte del grupo añadido puede convertirse en cadena principal.")}</p>
            </div>
          )}

          {showRingPalette && (
            <div className="alkyl-palette ring-palette" id="ring-palette">
              <div className="alkyl-palette-heading">
                <div>
                  <strong>{t("Biblioteca de anillos")}</strong>
                  <p>
                    {ringInsertMode === "attach"
                      ? t("El nuevo anillo se unirá mediante un enlace simple al carbono seleccionado.")
                      : t("El anillo elegido reemplazará la estructura actual y comenzará una molécula nueva.")}
                  </p>
                </div>
                <button onClick={() => setShowRingPalette(false)} aria-label={t("Cerrar biblioteca de anillos")}>×</button>
              </div>

              <div className="ring-mode-switch" role="group" aria-label={t("Forma de insertar el anillo")}>
                <button
                  className={ringInsertMode === "replace" ? "active" : ""}
                  onClick={() => setRingInsertMode("replace")}
                  aria-pressed={ringInsertMode === "replace"}
                >
                  <span aria-hidden="true">↻</span>
                  {t("Nueva molécula")}
                </button>
                <button
                  className={ringInsertMode === "attach" ? "active" : ""}
                  onClick={() => setRingInsertMode("attach")}
                  aria-pressed={ringInsertMode === "attach"}
                  disabled={!isCarbonAtom(selectedAtom) || selectedValence >= 4}
                  title={!isCarbonAtom(selectedAtom) || selectedValence >= 4 ? t("Selecciona un carbono con una valencia libre") : undefined}
                >
                  <span aria-hidden="true">＋</span>
                  {t("Unir al C seleccionado")}
                </button>
                <small>
                  {ringInsertMode === "attach"
                    ? language === "en"
                      ? `${molecule.rings?.length ?? 0} ring${molecule.rings?.length === 1 ? "" : "s"} currently`
                      : `${molecule.rings?.length ?? 0} anillo${molecule.rings?.length === 1 ? "" : "s"} actualmente`
                    : t("Reinicia solo la estructura")}
                </small>
              </div>

              <div className="ring-section">
                <div className="ring-section-heading">
                  <strong>{t("Cicloalcanos")}</strong>
                  <span>{t("CₙH₂ₙ · enlaces simples")}</span>
                </div>
                <div className="ring-grid cycle-ring-grid">
                  {CYCLE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      className="ring-option"
                      onClick={() => loadRingTemplate(template)}
                      title={`${ringInsertMode === "attach" ? t("Unir") : t("Cargar")} ${localizedIupac(template.label).toLowerCase()}`}
                    >
                      <span className="ring-preview" aria-hidden="true">
                        <svg viewBox="0 0 48 48">
                          <polygon points={ringIconPoints(template.size)} />
                        </svg>
                      </span>
                      <span className="ring-option-copy">
                        <strong>{localizedIupac(template.label)}</strong>
                        <small>{template.formula} · {localizedDetail(template.detail)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ring-section aromatic-section">
                <div className="ring-section-heading">
                  <strong>{t("Aromáticos monocíclicos")}</strong>
                  <span>{t("Benceno y derivados alquilados")}</span>
                </div>
                <div className="ring-grid aromatic-ring-grid">
                  {AROMATIC_TEMPLATES.map((template) => {
                    const unavailable = ringInsertMode === "attach"
                      && template.molecule.atoms.length !== template.size;
                    return (
                      <button
                        key={template.id}
                        className={`ring-option aromatic-option ${unavailable ? "unavailable" : ""}`}
                        onClick={() => loadRingTemplate(template)}
                        title={unavailable
                          ? t("Este derivado se carga como ejemplo completo; usa Benceno para unir otro anillo")
                          : `${ringInsertMode === "attach" ? t("Unir") : t("Cargar")} ${localizedIupac(template.label).toLowerCase()}`}
                        disabled={unavailable}
                      >
                        <span className="ring-preview aromatic-preview" aria-hidden="true">
                          <svg viewBox="0 0 48 48">
                            <polygon points={ringIconPoints(6)} />
                            <circle cx="24" cy="24" r="9" />
                          </svg>
                        </span>
                        <span className="ring-option-copy">
                          <strong>{localizedIupac(template.label)}</strong>
                          <small>{template.formula} · {localizedDetail(template.detail)}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="alkyl-note ring-note">{t("Puedes repetir “Unir al C seleccionado” para construir moléculas con varios anillos. Los anillos quedan conectados por enlaces simples; no se fusionan ni comparten carbonos.")}</p>
            </div>
          )}

          {showFunctionalPalette && (
            <div className="alkyl-palette functional-palette" id="functional-palette">
              <div className="alkyl-palette-heading">
                <div>
                  <strong>{t("Biblioteca de grupos funcionales")}</strong>
                  <p>{t("Selecciona primero el carbono que llevará el grupo. La valencia y el nombre se validan automáticamente.")}</p>
                </div>
                <button onClick={() => setShowFunctionalPalette(false)} aria-label={t("Cerrar grupos funcionales")}>×</button>
              </div>

              <div className="functional-priority-note">
                <span aria-hidden="true">⇧</span>
                <p><strong>{t("La prioridad importa:")}</strong> {t("el grupo principal define el sufijo y recibe el localizador más bajo.")}</p>
              </div>

              {([
                { id: "oxygen", title: "Grupos con oxígeno", detail: "Alcoholes, carbonilos, ácidos y derivados" },
                { id: "nitrogen", title: "Grupos con nitrógeno", detail: "Aminas, amidas, nitrilos y nitrocompuestos" },
                { id: "halogen", title: "Derivados halogenados", detail: "F, Cl, Br e I se nombran como prefijos" },
              ] as const).map((category) => (
                <div className={`functional-section functional-${category.id}`} key={category.id}>
                  <div className="functional-section-heading">
                    <strong>{t(category.title)}</strong>
                    <span>{t(category.detail)}</span>
                  </div>
                  <div className="functional-grid">
                    {FUNCTIONAL_GROUP_TEMPLATES
                      .filter((template) => template.category === category.id)
                      .map((template) => (
                        <button
                          className="functional-option"
                          key={template.id}
                          onClick={() => addFunctionalGroup(template)}
                          title={language === "en" ? `Add ${t(template.label).toLowerCase()}: ${t(template.detail)}` : `Añadir ${template.label.toLowerCase()}: ${template.detail}`}
                        >
                          <span className="functional-formula">{template.shortFormula}</span>
                          <span className="functional-copy">
                            <strong>{t(template.label)}</strong>
                            <small>{t(template.detail)}</small>
                          </span>
                          {template.requirement !== "open" && (
                            <em>{template.requirement === "terminal-carbon" ? t("C terminal") : t("C interno")}</em>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              ))}

              <p className="alkyl-note functional-note">{t("Para aldehídos, ácidos, ésteres y amidas usa un carbono terminal. Para una cetona, selecciona un carbono interno de la cadena.")}</p>
            </div>
          )}

          <div
            className="notice"
            role={advancedScreenReaderEnabled ? "status" : undefined}
            aria-live={advancedScreenReaderEnabled ? "polite" : undefined}
          >
            <span>i</span>
            {localizedDynamicText(notice)}
          </div>

          <div className="display-options">
            <label title={t("Mostrar u ocultar hidrógenos implícitos, incluidos los unidos a heteroátomos")}>
              <input type="checkbox" checked={showHydrogens} onChange={(event) => setShowHydrogens(event.target.checked)} />
              <span /> {t("Mostrar H implícitos")}
            </label>
            <label
              className={!automaticNumberingAvailable ? "option-disabled" : ""}
              title={!automaticNumberingAvailable
                ? t("La numeración automática se oculta para no atribuir localizadores de carbono a sustituyentes N-.")
                : undefined}
            >
              <input
                type="checkbox"
                checked={effectiveShowNumbering}
                disabled={!automaticNumberingAvailable}
                onChange={(event) => setShowNumbering(event.target.checked)}
              />
              <span /> {automaticNumberingAvailable
                ? `${t("Numerar")} ${isRingStructure ? t("anillo") : t("cadena principal")}`
                : t("Numeración N- conservada en el nombre")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={highlightSubstituents}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setHighlightSubstituents(enabled);
                  setNotice(
                    enabled
                      ? "Sustituyentes resaltados en amarillo para diferenciarlos de la cadena principal."
                      : "Color uniforme activado: cadena principal y sustituyentes comparten el mismo color.",
                  );
                }}
              />
              <span /> {t("Resaltar sustituyentes")}
            </label>
          </div>
        </section>

        <aside className="analysis-card">
          <div className="analysis-heading">
            <div>
              <p className="eyebrow">{t("Análisis en tiempo real")}</p>
              <h2>{t("Nombre IUPAC sugerido")}</h2>
            </div>
            <div className="analysis-status">
              <span className="valid-badge">{t("Estructura válida")}</span>
              {!simplifiedModeEnabled && (
                <button
                  className={`stereochemistry-toggle ${showStereochemistry && stereochemistryAvailable ? "is-active" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={showStereochemistry && stereochemistryAvailable}
                  disabled={!stereochemistryAvailable}
                  title={stereochemistryAvailable
                    ? t("Mostrar descriptores E/Z")
                    : t("La estereoquímica E/Z no corresponde a esta estructura")}
                  onClick={() => setShowStereochemistry((visible) => !visible)}
                >
                  <span aria-hidden="true" />
                  {t("Estereoquímica")}
                </button>
              )}
              <button
                className="name-visibility-button"
                onClick={() => {
                  setShowIupacName((visible) => !visible);
                  setNotice(
                    showIupacName
                      ? "Nombre IUPAC oculto: formula tu respuesta antes de mostrarlo."
                      : "Nombre IUPAC visible nuevamente.",
                  );
                }}
                aria-pressed={!showIupacName}
              >
                {showIupacName ? t("Ocultar") : t("Mostrar")}
              </button>
            </div>
          </div>

          <div
            className={`name-result ${showIupacName ? "" : "concealed"}`}
            aria-live={advancedScreenReaderEnabled ? "polite" : undefined}
          >
            <div className="name-copy">
              <p>
                {showIupacName && !simplifiedModeEnabled ? (
                  <button
                    className="nomenclature-name-toggle"
                    type="button"
                    onClick={cycleNomenclatureConvention}
                    aria-label={t("Toca el nombre para cambiar la nomenclatura")}
                    title={t("Toca el nombre para cambiar la nomenclatura")}
                  >
                    {displayedIupacName}
                  </button>
                ) : showIupacName ? (
                  <span className="nomenclature-name-static">{displayedIupacName}</span>
                ) : t("Respuesta oculta")}
              </p>
              {showIupacName && !simplifiedModeEnabled && (
                <div className="nomenclature-variants" aria-label={t("Sistemas de nomenclatura disponibles")}>
                  {nomenclatureVariants.map((variant) => (
                    <button
                      type="button"
                      key={variant.convention}
                      className={variant.convention === activeNomenclatureConvention ? "active" : ""}
                      aria-pressed={variant.convention === activeNomenclatureConvention}
                      onClick={() => setNomenclatureConvention(variant.convention)}
                    >
                      <span>{variant.label}</span>
                      <strong>{variant.name}</strong>
                    </button>
                  ))}
                </div>
              )}
              {showIupacName && !simplifiedModeEnabled && (
                <small className="nomenclature-mode-label">
                  {nomenclatureConventionLabel(activeNomenclatureConvention, language)}
                </small>
              )}
              {showIupacName && !simplifiedModeEnabled && showNomenclatureHint && (
                <small className="nomenclature-name-help">{t("Toca el nombre para cambiar la nomenclatura")}</small>
              )}
            </div>
            <button
              title={showIupacName ? t("Copiar nombre") : t("Muestra el nombre antes de copiarlo")}
              aria-label={t("Copiar nombre IUPAC")}
              disabled={!showIupacName}
              onClick={() => {
                navigator.clipboard?.writeText(displayedIupacName);
                setNotice("Nombre copiado al portapapeles.");
              }}
            >
              ⧉
            </button>
          </div>

          {analysis.functionalGroups.length > 0 && (
            <div className="functional-detection" aria-label={t("Grupos funcionales detectados")}>
              <span>{t("Detectados")}</span>
              <div>
                {[...new Map(analysis.functionalGroups.map((group) => [group.label, group])).values()]
                  .map((group) => (
                    <strong key={group.label}>{t(group.label)}</strong>
                  ))}
              </div>
            </div>
          )}

          <div className="formula-row">
            <div>
              <span>{t("Fórmula molecular")}</span>
              <strong>{analysis.formula}</strong>
            </div>
            <div>
              <span>{t("Carbonos totales")}</span>
              <strong>{carbonCount}</strong>
            </div>
            <div>
              <span>{t("Grupo principal")}</span>
              <strong>{analysis.primaryFunctionalLabel ? t(analysis.primaryFunctionalLabel) : analysis.functionalGroups[0]?.label ? t(analysis.functionalGroups[0].label) : t("Hidrocarburo")}</strong>
            </div>
          </div>

          <div className={`reasoning-section ${showReasoningHelp ? "expanded" : "collapsed"}`}>
            <div className="reasoning-heading">
              <div>
                <h3>{t("Cómo se obtiene")}</h3>
                <span>{showReasoningHelp ? t("Prioridades que aplican") : t("Modo examen")}</span>
              </div>
              <button
                type="button"
                className="reasoning-visibility-button"
                aria-label={showReasoningHelp ? t("Ocultar ayuda de nomenclatura") : t("Mostrar ayuda de nomenclatura")}
                aria-expanded={showReasoningHelp}
                aria-controls="iupac-reasoning-content"
                onClick={() => {
                  setShowReasoningHelp((visible) => !visible);
                  setNotice(
                    showReasoningHelp
                      ? "Ayuda de nomenclatura oculta: modo examen activado."
                      : "Ayuda de nomenclatura visible nuevamente.",
                  );
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.7 12s3.4-5.2 9.3-5.2 9.3 5.2 9.3 5.2-3.4 5.2-9.3 5.2S2.7 12 2.7 12Z" />
                  <circle cx="12" cy="12" r="2.7" />
                  {!showReasoningHelp && <path className="eye-slash" d="m4 4 16 16" />}
                </svg>
                <span>{showReasoningHelp ? t("Ocultar ayuda") : t("Mostrar ayuda")}</span>
              </button>
            </div>

            <div className="reasoning-collapse" aria-hidden={!showReasoningHelp}>
              <div id="iupac-reasoning-content">
                <ol>
                  {localizedReasoningSteps.map((step) => (
                    <li key={step.number}>
                      <span>{step.number}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{step.explanation}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="examples-card">
        <div>
          <p className="eyebrow">{t("Explora estructuras conocidas")}</p>
          <h2>{t("Ejemplos rápidos")}</h2>
        </div>
        <div className="preset-list">
          {PRESETS.map((preset) => (
            <button key={preset.label} onClick={() => loadPreset(preset)}>
              <span className="preset-structure">{preset.molecule.atoms.filter(isCarbonAtom).length} C</span>
              <span>{localizedIupac(preset.label)}</span>
              <i>→</i>
            </button>
          ))}
        </div>
      </section>

      <footer>
        <p><strong>{t("Alcance actual:")}</strong> {t("hidrocarburos y nueve familias funcionales con O, N y halógenos.")}</p>
        <a
          className="footer-instagram"
          href="https://www.instagram.com/sciu.science/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Síguenos en Instagram: @sciu.science")}
        >
          {t("Síguenos en Instagram: @sciu.science")}
        </a>
        <p className="footer-note">
          {t("Los hidrógenos se completan automáticamente respetando las valencias de C, O, N y halógenos.")}
          <button
            className="credit-trigger"
            onClick={() => setShowCreatorCredit((visible) => !visible)}
            aria-expanded={showCreatorCredit}
            aria-controls="creator-credit"
            aria-label={t("Descubrir crédito del autor")}
            title={t("Hay algo escondido aquí")}
          >
            ✦
          </button>
        </p>
        <div
          className={`creator-credit ${showCreatorCredit ? "revealed" : ""}`}
          id="creator-credit"
          aria-hidden={!showCreatorCredit}
        >
          <span>{t("Una experiencia creada por")}</span>
          <strong>{t("Profe Alex Sáez")}</strong>
          <small>{t("Química que se construye.")}</small>
        </div>
      </footer>
    </main>
  );
}
