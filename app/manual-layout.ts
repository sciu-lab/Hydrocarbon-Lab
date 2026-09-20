export type ManualLayoutAtom = {
  id: number;
  x: number;
  y: number;
  element?: string;
};

export type ManualLayoutMolecule = {
  atoms: readonly ManualLayoutAtom[];
  bonds: readonly (readonly [number, number, ...unknown[]])[];
  rings?: readonly { atomIds: readonly number[] }[];
};

type Point = { x: number; y: number };

export type AttachmentTemplateAtom = Point & { element?: string };
export type AttachmentTemplateBond = readonly [number, number, number?];

const normalized = (vector: Point): Point => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};

const dot = (left: Point, right: Point) => left.x * right.x + left.y * right.y;

const cross = (origin: Point, end: Point, point: Point) =>
  (end.x - origin.x) * (point.y - origin.y)
  - (end.y - origin.y) * (point.x - origin.x);

function segmentsCross(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) {
  return cross(firstStart, firstEnd, secondStart) * cross(firstStart, firstEnd, secondEnd) < -1e-9
    && cross(secondStart, secondEnd, firstStart) * cross(secondStart, secondEnd, firstEnd) < -1e-9;
}

function getRingComponent(
  molecule: ManualLayoutMolecule,
  selectedId: number,
) {
  const rings = molecule.rings ?? [];
  const active = new Set(rings.filter((ring) => ring.atomIds.includes(selectedId)));
  if (!active.size) return { rings: active, atomIds: new Set<number>() };
  const atomIds = new Set([...active].flatMap((ring) => [...ring.atomIds]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const ring of rings) {
      if (active.has(ring) || !ring.atomIds.some((atomId) => atomIds.has(atomId))) continue;
      active.add(ring);
      ring.atomIds.forEach((atomId) => atomIds.add(atomId));
      changed = true;
    }
  }
  return { rings: active, atomIds };
}

/** Returns the complete fused ring component containing the selected atom. */
export function getFusedRingSystemAtomIds(
  molecule: ManualLayoutMolecule,
  selectedId: number,
) {
  return getRingComponent(molecule, selectedId).atomIds;
}

/** Chooses an exterior direction from the fused component and local neighbours. */
export function getPreferredAttachmentDirection(
  molecule: ManualLayoutMolecule,
  selectedId: number,
): Point {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected) return { x: 1, y: 0 };
  const systemIds = getFusedRingSystemAtomIds(molecule, selectedId);
  if (!systemIds.size) return { x: 1, y: 0 };
  const systemAtoms = molecule.atoms.filter((atom) => systemIds.has(atom.id));
  const center = systemAtoms.reduce(
    (sum, atom) => ({ x: sum.x + atom.x / systemAtoms.length, y: sum.y + atom.y / systemAtoms.length }),
    { x: 0, y: 0 },
  );
  const radial = { x: selected.x - center.x, y: selected.y - center.y };
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const directRings = (molecule.rings ?? []).filter((ring) => ring.atomIds.includes(selectedId));
  // A bridgehead has three ring bonds. Their opposite vectors point through
  // its only free valence, unlike a centroid of the whole polycyclic system.
  if (directRings.length > 1) {
    const ringNeighborIds = new Set<number>();
    for (const ring of directRings) {
      const index = ring.atomIds.indexOf(selectedId);
      ringNeighborIds.add(ring.atomIds[(index - 1 + ring.atomIds.length) % ring.atomIds.length]);
      ringNeighborIds.add(ring.atomIds[(index + 1) % ring.atomIds.length]);
    }
    const freeValenceDirection = [...ringNeighborIds].reduce((sum, neighborId) => {
      const neighbor = atomsById.get(neighborId);
      if (!neighbor) return sum;
      const away = normalized({ x: selected.x - neighbor.x, y: selected.y - neighbor.y });
      return { x: sum.x + away.x, y: sum.y + away.y };
    }, { x: 0, y: 0 });
    if (Math.hypot(freeValenceDirection.x, freeValenceDirection.y) > 1e-8) {
      return normalized(freeValenceDirection);
    }
  }
  const repulsion = molecule.bonds.reduce((sum, [left, right]) => {
    const neighborId = left === selectedId ? right : right === selectedId ? left : undefined;
    const neighbor = neighborId === undefined ? undefined : atomsById.get(neighborId);
    if (!neighbor) return sum;
    const away = normalized({ x: selected.x - neighbor.x, y: selected.y - neighbor.y });
    return { x: sum.x + away.x, y: sum.y + away.y };
  }, { x: 0, y: 0 });
  if (Math.hypot(radial.x, radial.y) > 1e-8) {
    const exterior = normalized(radial);
    return normalized({ x: exterior.x * 2 + repulsion.x, y: exterior.y * 2 + repulsion.y });
  }
  return Math.hypot(repulsion.x, repulsion.y) > 1e-8 ? normalized(repulsion) : { x: 1, y: 0 };
}

function axisZigzagCandidates(direction: Point) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const longitudinal = Math.cos(Math.PI / 3);
  const alternating = Math.sin(Math.PI / 3);
  return [1, -1].map((sign) => ({
    x: direction.x * longitudinal + perpendicular.x * alternating * sign,
    y: direction.y * longitudinal + perpendicular.y * alternating * sign,
  }));
}

function ringZigzagDirection(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  requestedDirection: Point,
) {
  const systemIds = getFusedRingSystemAtomIds(molecule, selectedId);
  if (!systemIds.size) return requestedDirection;
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const selected = atomsById.get(selectedId);
  if (!selected) return requestedDirection;
  const outward = getPreferredAttachmentDirection(molecule, selectedId);
  const length = Math.hypot(requestedDirection.x, requestedDirection.y) || 1;
  const candidates = axisZigzagCandidates(normalized(requestedDirection)).map((candidate) => ({
    x: candidate.x * length,
    y: candidate.y * length,
  }));
  return candidates
    .map((candidate, index) => {
      const point = { x: selected.x + candidate.x, y: selected.y + candidate.y };
      const clearance = Math.min(...molecule.atoms
        .filter((atom) => atom.id !== selectedId)
        .map((atom) => Math.hypot(point.x - atom.x, point.y - atom.y)));
      return {
        candidate,
        index,
        outwardProgress: dot(normalized(candidate), outward),
        clearance,
        crosses: molecule.bonds.some(([left, right]) => {
          if (left === selectedId || right === selectedId) return false;
          const start = atomsById.get(left);
          const end = atomsById.get(right);
          return Boolean(start && end && segmentsCross(selected, point, start, end));
        }),
      };
    })
    .sort((left, right) =>
      Number(left.crosses) - Number(right.crosses)
      || Number(right.outwardProgress > 0.05) - Number(left.outwardProgress > 0.05)
      || right.outwardProgress - left.outwardProgress
      || right.clearance - left.clearance
      || left.index - right.index,
    )[0].candidate;
}

function carbonNeighbors(molecule: ManualLayoutMolecule, atomId: number) {
  const atomsById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  return molecule.bonds.flatMap(([left, right]) => {
    const neighborId = left === atomId ? right : right === atomId ? left : undefined;
    const neighbor = neighborId === undefined ? undefined : atomsById.get(neighborId);
    return neighbor && (neighbor.element ?? "C") === "C" ? [neighbor] : [];
  });
}

/**
 * Chooses a conventional zigzag around the global axis requested by the
 * arrow. Keeping both candidates on opposite sides of that axis prevents a
 * sequence of locally-good turns from accumulating perpendicular drift.
 */
export function getAutoPlacedCarbonPosition(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  requestedDirection: Point,
): Point {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected) return requestedDirection;
  if (molecule.rings?.some((ring) => ring.atomIds.includes(selectedId))) {
    const firstZigzagStep = ringZigzagDirection(molecule, selectedId, requestedDirection);
    return { x: selected.x + firstZigzagStep.x, y: selected.y + firstZigzagStep.y };
  }

  const neighbors = carbonNeighbors(molecule, selectedId);
  if (neighbors.length !== 1) {
    return { x: selected.x + requestedDirection.x, y: selected.y + requestedDirection.y };
  }

  const parent = neighbors[0];
  const desired = normalized(requestedDirection);
  const perpendicular = { x: -desired.y, y: desired.x };
  const incoming = normalized({ x: selected.x - parent.x, y: selected.y - parent.y });
  const candidates = axisZigzagCandidates(desired);
  const incomingSide = dot(incoming, perpendicular);
  let choice = incomingSide > 1e-9 ? 1 : incomingSide < -1e-9 ? 0 : 0;

  // When entering from an unrelated angle (for example after selecting a
  // branch), prefer the candidate closest to a 120° internal bond angle.
  if (Math.abs(dot(incoming, desired)) < 0.45) {
    const angleScores = candidates.map((candidate) => Math.abs(dot(incoming, candidate) - 0.5));
    choice = angleScores[0] <= angleScores[1] ? 0 : 1;
  }

  const length = Math.hypot(requestedDirection.x, requestedDirection.y) || 1;
  return {
    x: selected.x + candidates[choice].x * length,
    y: selected.y + candidates[choice].y * length,
  };
}

function attachmentDirections(preferred: Point, isRingAttachment: boolean) {
  const baseAngle = Math.atan2(preferred.y, preferred.x);
  const offsets = isRingAttachment
    ? [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI]
    : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  return offsets.map((offset) => ({
    x: Math.cos(baseAngle + offset),
    y: Math.sin(baseAngle + offset),
  }));
}

function isLinearCarbonTemplate(
  atoms: readonly AttachmentTemplateAtom[],
  bonds: readonly AttachmentTemplateBond[],
) {
  if (!atoms.length || atoms.some((atom) => (atom.element ?? "C") !== "C")) return false;
  if (bonds.length !== atoms.length) return false;
  return bonds.every(([left, right], index) => (
    index === 0 ? left === -1 && right === 0 : left === index - 1 && right === index
  ));
}

function placementScore(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  positions: readonly Point[],
  bonds: readonly AttachmentTemplateBond[],
  preferred: Point,
  requireExterior: boolean,
) {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected || positions.length === 0) return null;
  const existingById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const firstAttachment = bonds.find(([left, right]) => left === -1 || right === -1);
  const firstIndex = firstAttachment
    ? (firstAttachment[0] === -1 ? firstAttachment[1] : firstAttachment[0])
    : 0;
  const first = positions[firstIndex];
  if (!first) return null;
  const firstDirection = normalized({ x: first.x - selected.x, y: first.y - selected.y });
  const outwardProgress = dot(firstDirection, preferred);
  if (requireExterior && outwardProgress <= 0.05) return null;

  let clearance = Infinity;
  for (let index = 0; index < positions.length; index++) {
    for (const atom of molecule.atoms) {
      const separation = Math.hypot(positions[index].x - atom.x, positions[index].y - atom.y);
      if (separation < 0.42) return null;
      clearance = Math.min(clearance, separation);
    }
    for (let other = index + 1; other < positions.length; other++) {
      const separation = Math.hypot(
        positions[index].x - positions[other].x,
        positions[index].y - positions[other].y,
      );
      if (separation < 0.42) return null;
      clearance = Math.min(clearance, separation);
    }
  }

  const pointFor = (index: number) => index === -1 ? selected : positions[index];
  for (const [left, right] of bonds) {
    const start = pointFor(left);
    const end = pointFor(right);
    if (!start || !end) return null;
    for (const [existingLeft, existingRight] of molecule.bonds) {
      if ((left === -1 || right === -1) && (existingLeft === selectedId || existingRight === selectedId)) continue;
      const existingStart = existingById.get(existingLeft);
      const existingEnd = existingById.get(existingRight);
      if (existingStart && existingEnd && segmentsCross(start, end, existingStart, existingEnd)) return null;
    }
  }
  return outwardProgress * 4 + Math.min(clearance, 3);
}

function placeLinearTemplate(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  count: number,
  bonds: readonly AttachmentTemplateBond[],
  preferred: Point,
) {
  const candidates = attachmentDirections(preferred, true).flatMap((direction) => {
    const temporary: ManualLayoutMolecule = {
      atoms: molecule.atoms.map((atom) => ({ ...atom })),
      bonds: molecule.bonds.map((bond) => [...bond]),
      rings: molecule.rings?.map((ring) => ({ atomIds: [...ring.atomIds] })),
    };
    const positions: Point[] = [];
    let currentId = selectedId;
    let nextId = Math.max(0, ...temporary.atoms.map((atom) => atom.id)) + 1;
    for (let index = 0; index < count; index++) {
      const point = getAutoPlacedCarbonPosition(temporary, currentId, direction);
      positions.push(point);
      temporary.atoms = [...temporary.atoms, { id: nextId, ...point }];
      temporary.bonds = [...temporary.bonds, [currentId, nextId]];
      currentId = nextId;
      nextId++;
    }
    const score = placementScore(molecule, selectedId, positions, bonds, preferred, true);
    return score === null ? [] : [{ positions, score }];
  });
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.positions ?? null;
}

function placeLegacyTemplate(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  atoms: readonly AttachmentTemplateAtom[],
  bonds: readonly AttachmentTemplateBond[],
  preferred: Point,
  ringAttachment: boolean,
) {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId)!;
  const carbonylAttachment = bonds.some(([left, right, order = 1]) => (
    (left === -1 || right === -1) && order === 2
  ));
  const cardinal = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  if (ringAttachment) cardinal.sort((left, right) => dot(right, preferred) - dot(left, preferred));
  const directions = ringAttachment && carbonylAttachment ? [preferred] : cardinal;
  const attachment = bonds.find(([left, right]) => left === -1 || right === -1);
  const firstIndex = attachment ? (attachment[0] === -1 ? attachment[1] : attachment[0]) : 0;
  const sourceDirection = normalized(atoms[firstIndex] ?? { x: 1, y: 0 });
  const sourcePerpendicular = { x: -sourceDirection.y, y: sourceDirection.x };
  for (const direction of directions) {
    const perpendicular = { x: -direction.y, y: direction.x };
    for (const mirror of [1, -1]) {
      const positions = atoms.map((atom) => {
        if (!carbonylAttachment || !ringAttachment) {
          return {
            x: selected.x + atom.x * direction.x - atom.y * direction.y * mirror,
            y: selected.y + atom.x * direction.y + atom.y * direction.x * mirror,
          };
        }
        const longitudinal = dot(atom, sourceDirection);
        const lateral = dot(atom, sourcePerpendicular) * mirror;
        return {
          x: selected.x + direction.x * longitudinal + perpendicular.x * lateral,
          y: selected.y + direction.y * longitudinal + perpendicular.y * lateral,
        };
      });
      const distinct = positions.every((point, index) => (
        molecule.atoms.every((atom) => Math.hypot(point.x - atom.x, point.y - atom.y) > 1e-8)
        && positions.slice(index + 1).every((other) => Math.hypot(point.x - other.x, point.y - other.y) > 1e-8)
      ));
      if (distinct) return positions;
    }
  }
  return null;
}

/**
 * Places an attached template without changing its graph. Linear carbon
 * templates start a true zigzag; other groups retain their internal geometry.
 */
export function placeAttachmentTemplate(
  molecule: ManualLayoutMolecule,
  selectedId: number,
  atoms: readonly AttachmentTemplateAtom[],
  bonds: readonly AttachmentTemplateBond[],
  options: { zigzagLinear?: boolean } = {},
): Point[] | null {
  const selected = molecule.atoms.find((atom) => atom.id === selectedId);
  if (!selected || !atoms.length) return null;
  const component = getRingComponent(molecule, selectedId);
  const systemIds = component.atomIds;
  const ringAttachment = systemIds.size > 0;
  const preferred = getPreferredAttachmentDirection(molecule, selectedId);
  const fusedAttachment = component.rings.size > 1;
  if (!fusedAttachment) {
    return placeLegacyTemplate(molecule, selectedId, atoms, bonds, preferred, ringAttachment);
  }
  if (options.zigzagLinear && isLinearCarbonTemplate(atoms, bonds)) {
    return placeLinearTemplate(molecule, selectedId, atoms.length, bonds, preferred);
  }

  const attachment = bonds.find(([left, right]) => left === -1 || right === -1);
  const firstIndex = attachment ? (attachment[0] === -1 ? attachment[1] : attachment[0]) : 0;
  const source = atoms[firstIndex];
  if (!source) return null;
  const sourceDirection = normalized(source);
  const sourcePerpendicular = { x: -sourceDirection.y, y: sourceDirection.x };
  const candidates: { positions: Point[]; score: number; order: number }[] = [];
  attachmentDirections(preferred, ringAttachment).forEach((direction, directionIndex) => {
    const perpendicular = { x: -direction.y, y: direction.x };
    for (const mirror of [1, -1]) {
      const positions = atoms.map((atom) => {
        const longitudinal = dot(atom, sourceDirection);
        const lateral = dot(atom, sourcePerpendicular) * mirror;
        return {
          x: selected.x + direction.x * longitudinal + perpendicular.x * lateral,
          y: selected.y + direction.y * longitudinal + perpendicular.y * lateral,
        };
      });
      const score = placementScore(
        molecule,
        selectedId,
        positions,
        bonds,
        preferred,
        ringAttachment,
      );
      if (score !== null) candidates.push({ positions, score, order: directionIndex * 2 + (mirror < 0 ? 1 : 0) });
    }
  });
  if (!ringAttachment) return candidates.sort((left, right) => left.order - right.order)[0]?.positions ?? null;
  candidates.sort((left, right) => right.score - left.score || left.order - right.order);
  return candidates[0]?.positions ?? null;
}
