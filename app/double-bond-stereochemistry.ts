export type StereoConfiguration = "E" | "Z";

type StereoElement = "C" | "O" | "N" | "F" | "Cl" | "Br" | "I";
type StereoBondOrder = 1 | 2 | 3;

export type StereoMolecule = {
  atoms: Array<{
    id: number;
    x: number;
    y: number;
    element?: StereoElement;
  }>;
  bonds: Array<[number, number, StereoBondOrder?]>;
  rings?: Array<{
    id: number;
    kind: "cycloalkane" | "aromatic";
    atomIds: number[];
  }>;
};

export type DoubleBondStereoInspection =
  | {
      stereogenic: false;
      configuration: null;
      priorityAtomIds: null;
    }
  | {
      stereogenic: true;
      configuration: StereoConfiguration | null;
      priorityAtomIds: [number, number];
    };

export type DoubleBondStereoInspectionOptions = {
  /**
   * Aromatic Kekulé double bonds are not alkene E/Z centers. This opt-in is
   * reserved for the existing technical aromatic-name view, which explains
   * the engine's Kekulé representation without offering an E/Z interaction.
   */
  includeAromaticKekuleRepresentation?: boolean;
};

export type StereoDescriptor = {
  atomIds: [number, number];
  configuration: StereoConfiguration;
  locant: number;
};

export type AromaticStereochemicalNameOptions = {
  standardName: string;
  technicalName: string;
  descriptors: string[];
};

export type StereoToggleResult<T extends StereoMolecule> =
  | {
      ok: true;
      configuration: StereoConfiguration;
      molecule: T;
    }
  | {
      ok: false;
      error: string;
      reason: "cyclic" | "not-stereogenic" | "not-double-bond";
    };

type CipSignature = {
  atomicNumber: number;
  children: CipSignature[];
};

const atomicNumbers: Record<StereoElement, number> = {
  C: 6,
  N: 7,
  O: 8,
  F: 9,
  Cl: 17,
  Br: 35,
  I: 53,
};

const valences: Record<StereoElement, number> = {
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
};

const hydrogenSignature: CipSignature = { atomicNumber: 1, children: [] };

function atomElement(molecule: StereoMolecule, atomId: number): StereoElement | null {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  return atom ? atom.element ?? "C" : null;
}

function bondOrder(bond: StereoMolecule["bonds"][number]): StereoBondOrder {
  return bond[2] ?? 1;
}

function findBond(molecule: StereoMolecule, left: number, right: number) {
  return molecule.bonds.find(
    (bond) => (bond[0] === left && bond[1] === right)
      || (bond[0] === right && bond[1] === left),
  );
}

export function isAromaticBond(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
) {
  if (!findBond(molecule, leftAtomId, rightAtomId)) return false;
  return Boolean(molecule.rings?.some(
    (ring) => ring.kind === "aromatic"
      && ring.atomIds.includes(leftAtomId)
      && ring.atomIds.includes(rightAtomId),
  ));
}

function atomBonds(molecule: StereoMolecule, atomId: number) {
  return molecule.bonds.filter((bond) => bond[0] === atomId || bond[1] === atomId);
}

function implicitHydrogens(molecule: StereoMolecule, atomId: number) {
  const element = atomElement(molecule, atomId);
  if (!element) return 0;
  const usedValence = atomBonds(molecule, atomId)
    .reduce((total, bond) => total + bondOrder(bond), 0);
  return Math.max(0, valences[element] - usedValence);
}

function compareCipSignatures(left: CipSignature, right: CipSignature): number {
  if (left.atomicNumber !== right.atomicNumber) {
    return left.atomicNumber - right.atomicNumber;
  }

  const length = Math.max(left.children.length, right.children.length);
  for (let index = 0; index < length; index += 1) {
    const leftChild = left.children[index];
    const rightChild = right.children[index];
    if (!leftChild && !rightChild) return 0;
    if (!leftChild) return -1;
    if (!rightChild) return 1;
    const comparison = compareCipSignatures(leftChild, rightChild);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function terminalSignature(atomicNumber: number): CipSignature {
  return { atomicNumber, children: [] };
}

function buildCipSignature(
  molecule: StereoMolecule,
  atomId: number,
  parentId: number,
  visited: Set<number>,
  depth = 9,
): CipSignature {
  const element = atomElement(molecule, atomId);
  if (!element) return terminalSignature(0);
  const atomicNumber = atomicNumbers[element];
  if (depth <= 0) return terminalSignature(atomicNumber);

  const children: CipSignature[] = [];
  const nextVisited = new Set(visited).add(atomId);
  atomBonds(molecule, atomId).forEach((bond) => {
    const neighborId = bond[0] === atomId ? bond[1] : bond[0];
    const neighborElement = atomElement(molecule, neighborId);
    if (!neighborElement) return;
    const neighborAtomicNumber = atomicNumbers[neighborElement];
    const order = bondOrder(bond);

    if (neighborId === parentId) {
      for (let duplicate = 1; duplicate < order; duplicate += 1) {
        children.push(terminalSignature(neighborAtomicNumber));
      }
      return;
    }

    children.push(
      nextVisited.has(neighborId)
        ? terminalSignature(neighborAtomicNumber)
        : buildCipSignature(molecule, neighborId, atomId, nextVisited, depth - 1),
    );
    for (let duplicate = 1; duplicate < order; duplicate += 1) {
      children.push(terminalSignature(neighborAtomicNumber));
    }
  });

  for (let hydrogen = 0; hydrogen < implicitHydrogens(molecule, atomId); hydrogen += 1) {
    children.push(hydrogenSignature);
  }
  children.sort((left, right) => compareCipSignatures(right, left));
  return { atomicNumber, children };
}

type AttachedSubstituent = {
  atomId: number | null;
  signature: CipSignature;
};

function prioritySubstituent(
  molecule: StereoMolecule,
  alkeneAtomId: number,
  otherAlkeneAtomId: number,
): number | null {
  const candidates: AttachedSubstituent[] = [];
  atomBonds(molecule, alkeneAtomId).forEach((bond) => {
    const neighborId = bond[0] === alkeneAtomId ? bond[1] : bond[0];
    if (neighborId === otherAlkeneAtomId) return;
    candidates.push({
      atomId: neighborId,
      signature: buildCipSignature(
        molecule,
        neighborId,
        alkeneAtomId,
        new Set([alkeneAtomId]),
      ),
    });
  });

  for (
    let hydrogen = 0;
    hydrogen < implicitHydrogens(molecule, alkeneAtomId);
    hydrogen += 1
  ) {
    candidates.push({ atomId: null, signature: hydrogenSignature });
  }

  if (candidates.length !== 2) return null;
  const comparison = compareCipSignatures(candidates[0].signature, candidates[1].signature);
  if (comparison === 0) return null;
  return comparison > 0 ? candidates[0].atomId : candidates[1].atomId;
}

function signedSide(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
  substituentAtomId: number,
) {
  const left = molecule.atoms.find((atom) => atom.id === leftAtomId);
  const right = molecule.atoms.find((atom) => atom.id === rightAtomId);
  const substituent = molecule.atoms.find((atom) => atom.id === substituentAtomId);
  if (!left || !right || !substituent) return 0;
  const axisX = right.x - left.x;
  const axisY = right.y - left.y;
  return axisX * (substituent.y - left.y) - axisY * (substituent.x - left.x);
}

function configurationFromGeometry(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
  leftPriorityAtomId: number,
  rightPriorityAtomId: number,
): StereoConfiguration | null {
  const leftSide = signedSide(molecule, leftAtomId, rightAtomId, leftPriorityAtomId);
  const rightSide = signedSide(molecule, leftAtomId, rightAtomId, rightPriorityAtomId);
  if (Math.abs(leftSide) < 0.0001 || Math.abs(rightSide) < 0.0001) return null;
  return leftSide * rightSide > 0 ? "Z" : "E";
}

export function inspectDoubleBondStereochemistry(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
  options: DoubleBondStereoInspectionOptions = {},
): DoubleBondStereoInspection {
  const bond = findBond(molecule, leftAtomId, rightAtomId);
  if (!bond || bondOrder(bond) !== 2) {
    return { stereogenic: false, configuration: null, priorityAtomIds: null };
  }
  if (
    isAromaticBond(molecule, leftAtomId, rightAtomId)
    && !options.includeAromaticKekuleRepresentation
  ) {
    return { stereogenic: false, configuration: null, priorityAtomIds: null };
  }
  if (
    atomElement(molecule, leftAtomId) !== "C"
    || atomElement(molecule, rightAtomId) !== "C"
  ) {
    return { stereogenic: false, configuration: null, priorityAtomIds: null };
  }

  const leftPriorityAtomId = prioritySubstituent(molecule, leftAtomId, rightAtomId);
  const rightPriorityAtomId = prioritySubstituent(molecule, rightAtomId, leftAtomId);
  if (leftPriorityAtomId === null || rightPriorityAtomId === null) {
    return { stereogenic: false, configuration: null, priorityAtomIds: null };
  }

  return {
    stereogenic: true,
    configuration: configurationFromGeometry(
      molecule,
      leftAtomId,
      rightAtomId,
      leftPriorityAtomId,
      rightPriorityAtomId,
    ),
    priorityAtomIds: [leftPriorityAtomId, rightPriorityAtomId],
  };
}

function componentAfterCut(
  molecule: StereoMolecule,
  startAtomId: number,
  cutLeft: number,
  cutRight: number,
) {
  const seen = new Set<number>();
  const pending = [startAtomId];
  while (pending.length) {
    const atomId = pending.pop()!;
    if (seen.has(atomId)) continue;
    seen.add(atomId);
    atomBonds(molecule, atomId).forEach((bond) => {
      const neighborId = bond[0] === atomId ? bond[1] : bond[0];
      const isCutBond = (atomId === cutLeft && neighborId === cutRight)
        || (atomId === cutRight && neighborId === cutLeft);
      if (!isCutBond && !seen.has(neighborId)) pending.push(neighborId);
    });
  }
  return seen;
}

function isAcyclicBond(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
) {
  return !componentAfterCut(molecule, leftAtomId, leftAtomId, rightAtomId)
    .has(rightAtomId);
}

/** True only for the non-aromatic, acyclic C=C bonds that the canvas can switch. */
export function isDoubleBondEZToggleAvailable(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
) {
  if (isAromaticBond(molecule, leftAtomId, rightAtomId)) return false;
  return inspectDoubleBondStereochemistry(molecule, leftAtomId, rightAtomId).stereogenic
    && isAcyclicBond(molecule, leftAtomId, rightAtomId);
}

function rotateComponent(
  molecule: StereoMolecule,
  atomIds: Set<number>,
  centerAtomId: number,
  angle: number,
) {
  const center = molecule.atoms.find((atom) => atom.id === centerAtomId);
  if (!center) return;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  molecule.atoms.forEach((atom) => {
    if (!atomIds.has(atom.id) || atom.id === centerAtomId) return;
    const relativeX = atom.x - center.x;
    const relativeY = atom.y - center.y;
    atom.x = center.x + relativeX * cosine - relativeY * sine;
    atom.y = center.y + relativeX * sine + relativeY * cosine;
  });
}

function reflectComponentAcrossBond(
  molecule: StereoMolecule,
  atomIds: Set<number>,
  fixedAtomId: number,
  leftAtomId: number,
  rightAtomId: number,
) {
  const left = molecule.atoms.find((atom) => atom.id === leftAtomId);
  const right = molecule.atoms.find((atom) => atom.id === rightAtomId);
  if (!left || !right) return;
  const axisX = right.x - left.x;
  const axisY = right.y - left.y;
  const length = Math.hypot(axisX, axisY) || 1;
  const unitX = axisX / length;
  const unitY = axisY / length;

  molecule.atoms.forEach((atom) => {
    if (!atomIds.has(atom.id) || atom.id === fixedAtomId) return;
    const relativeX = atom.x - left.x;
    const relativeY = atom.y - left.y;
    const projection = relativeX * unitX + relativeY * unitY;
    const perpendicular = relativeX * -unitY + relativeY * unitX;
    atom.x = left.x + projection * unitX + perpendicular * unitY;
    atom.y = left.y + projection * unitY - perpendicular * unitX;
  });
}

export function toggleDoubleBondGeometry<T extends StereoMolecule>(
  molecule: T,
  leftAtomId: number,
  rightAtomId: number,
): StereoToggleResult<T> {
  const bond = findBond(molecule, leftAtomId, rightAtomId);
  if (!bond || bondOrder(bond) !== 2) {
    return {
      ok: false,
      reason: "not-double-bond",
      error: "Selecciona un enlace doble C=C para cambiar su configuración E/Z.",
    };
  }

  const inspection = inspectDoubleBondStereochemistry(molecule, leftAtomId, rightAtomId);
  if (!inspection.stereogenic) {
    return {
      ok: false,
      reason: "not-stereogenic",
      error: "Ese doble enlace no presenta isomería E/Z porque uno de sus carbonos tiene dos sustituyentes equivalentes.",
    };
  }

  if (!isAcyclicBond(molecule, leftAtomId, rightAtomId)) {
    return {
      ok: false,
      reason: "cyclic",
      error: "Este doble enlace pertenece a un ciclo y no puede rotarse como un alqueno acíclico.",
    };
  }
  const leftComponent = componentAfterCut(molecule, leftAtomId, leftAtomId, rightAtomId);
  const rightComponent = componentAfterCut(molecule, rightAtomId, leftAtomId, rightAtomId);

  const next = {
    ...molecule,
    atoms: molecule.atoms.map((atom) => ({ ...atom })),
    bonds: molecule.bonds.map((candidate) => [...candidate]),
    rings: molecule.rings?.map((ring) => ({ ...ring, atomIds: [...ring.atomIds] })),
  } as T;
  const [leftPriorityAtomId, rightPriorityAtomId] = inspection.priorityAtomIds;
  const target: StereoConfiguration = inspection.configuration === "Z" ? "E" : "Z";

  if (
    Math.abs(signedSide(next, leftAtomId, rightAtomId, leftPriorityAtomId)) < 0.0001
  ) {
    rotateComponent(next, leftComponent, leftAtomId, Math.PI / 3);
  }
  if (
    Math.abs(signedSide(next, leftAtomId, rightAtomId, rightPriorityAtomId)) < 0.0001
  ) {
    rotateComponent(next, rightComponent, rightAtomId, -Math.PI / 3);
  }

  const prepared = inspectDoubleBondStereochemistry(next, leftAtomId, rightAtomId);
  if (!prepared.stereogenic || prepared.configuration !== target) {
    reflectComponentAcrossBond(
      next,
      rightComponent,
      rightAtomId,
      leftAtomId,
      rightAtomId,
    );
  }

  const finalInspection = inspectDoubleBondStereochemistry(next, leftAtomId, rightAtomId);
  if (!finalInspection.stereogenic || finalInspection.configuration !== target) {
    return {
      ok: false,
      reason: "not-stereogenic",
      error: "No fue posible representar con claridad la configuración E/Z de ese enlace.",
    };
  }

  return { ok: true, molecule: next, configuration: target };
}

export function getMainChainStereoDescriptors(
  molecule: StereoMolecule,
  mainChain: number[],
): StereoDescriptor[] {
  const descriptors: StereoDescriptor[] = [];
  mainChain.slice(0, -1).forEach((leftAtomId, index) => {
    const rightAtomId = mainChain[index + 1];
    // E/Z descriptors are only meaningful for an acyclic alkene in this
    // simulator. A C=C inside any ring is geometrically constrained and must
    // never be added to the suggested name.
    if (!isDoubleBondEZToggleAvailable(molecule, leftAtomId, rightAtomId)) return;
    const inspection = inspectDoubleBondStereochemistry(
      molecule,
      leftAtomId,
      rightAtomId,
    );
    if (!inspection.stereogenic || !inspection.configuration) return;
    descriptors.push({
      atomIds: [leftAtomId, rightAtomId],
      configuration: inspection.configuration,
      locant: index + 1,
    });
  });
  return descriptors;
}

export function formatStereochemicalName(
  molecule: StereoMolecule,
  mainChain: number[],
  baseName: string,
) {
  const descriptors = getMainChainStereoDescriptors(molecule, mainChain);
  if (!descriptors.length) return baseName;
  const prefix = descriptors
    .map((descriptor) => `${descriptor.locant}${descriptor.configuration}`)
    .join(",");
  if (baseName.startsWith("ácido ")) {
    return `ácido (${prefix})-${baseName.slice("ácido ".length)}`;
  }
  return `(${prefix})-${baseName}`;
}

export function getAromaticStereochemicalNameOptions(
  technicalName: string,
  family: string,
): AromaticStereochemicalNameOptions | null {
  if (family !== "aromatic") return null;

  const directMatch = /^\(((?:\d+[EZ])(?:,\d+[EZ])*)\)-(.+)$/.exec(technicalName);
  if (directMatch) {
    return {
      standardName: directMatch[2],
      technicalName,
      descriptors: directMatch[1].split(","),
    };
  }

  const acidMatch = /^ácido \(((?:\d+[EZ])(?:,\d+[EZ])*)\)-(.+)$/.exec(technicalName);
  if (!acidMatch) return null;
  return {
    standardName: `ácido ${acidMatch[2]}`,
    technicalName,
    descriptors: acidMatch[1].split(","),
  };
}
