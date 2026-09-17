import type { GeneratedMolecule, GeneratedRing } from "./name-to-molecule";

type Point = { x: number; y: number };

export function ringHasBond(ring: GeneratedRing, a: number, b: number) {
  return ring.atomIds.some((id, i) => id === a && (
    ring.atomIds[(i + 1) % ring.atomIds.length] === b
    || ring.atomIds[(i + ring.atomIds.length - 1) % ring.atomIds.length] === b
  ));
}

export function hasSharedRingAtoms(molecule: GeneratedMolecule) {
  const seen = new Set<number>();
  return (molecule.rings ?? []).some((ring) => ring.atomIds.some((id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  }));
}

/** Conservative MVP: an unused, saturated carbon edge of one aliphatic ring. */
export function ringFusionError(molecule: GeneratedMolecule, a: number, b: number) {
  const bond = molecule.bonds.find(([left, right]) =>
    (left === a && right === b) || (left === b && right === a));
  const rings = molecule.rings ?? [];
  const parents = rings.filter((ring) => ringHasBond(ring, a, b));
  if (!bond || a === b || parents.length !== 1) return "Selecciona un enlace periférico de un anillo.";
  if (parents[0].kind !== "cycloalkane" || (bond[2] ?? 1) !== 1) {
    return "La fusión requiere un enlace simple de un anillo alifático.";
  }
  if (rings.some((ring) => ring !== parents[0] && (ring.atomIds.includes(a) || ring.atomIds.includes(b)))) {
    return "Selecciona un enlace cuyos extremos aún no sean compartidos.";
  }
  for (const id of [a, b]) {
    const atom = molecule.atoms.find((item) => item.id === id);
    if (!atom || (atom.element ?? "C") !== "C" || atom.charge) return "La fusión requiere dos carbonos neutros.";
    const valence = molecule.bonds.reduce((sum, [left, right, order = 1]) => sum + (left === id || right === id ? order : 0), 0);
    if (valence + 1 > 4) return "La fusión superaría la valencia del carbono.";
  }
  return null;
}

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Reuses both endpoints and the existing edge; never mutates the input. */
export function fuseRingOnBond<T extends GeneratedMolecule>(
  molecule: T, atomA: number, atomB: number, ringSize: 5 | 6,
): T {
  const error = ringFusionError(molecule, atomA, atomB);
  if (error) throw new Error(error);
  if (ringSize !== 5 && ringSize !== 6) throw new Error("Solo se admiten ciclos de 5 o 6 miembros.");
  // Normalize endpoint order so reversing a selection cannot change the layout.
  const [a, b] = [atomA, atomB].sort((left, right) => left - right);
  // Match the existing canvas coordinate scales, without moving old atoms.
  const points = new Map(molecule.atoms.map((atom) => [atom.id, { x: atom.x, y: atom.y * 106 / 130 }]));
  const start = points.get(a)!;
  const end = points.get(b)!;
  const length = distance(start, end);
  if (!Number.isFinite(length) || length < 1e-6) throw new Error("El enlace debe tener longitud distinta de cero.");
  const parent = molecule.rings!.find((ring) => ringHasBond(ring, a, b))!;
  const parentCenter = parent.atomIds.reduce((center, id) => ({
    x: center.x + points.get(id)!.x / parent.atomIds.length,
    y: center.y + points.get(id)!.y / parent.atomIds.length,
  }), { x: 0, y: 0 });
  const candidates = [1, -1].map((side) => {
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const offset = side / (2 * Math.tan(Math.PI / ringSize));
    const center = { x: midpoint.x - (end.y - start.y) * offset, y: midpoint.y + (end.x - start.x) * offset };
    const angle = Math.atan2(start.y - center.y, start.x - center.x);
    const radius = length / (2 * Math.sin(Math.PI / ringSize));
    const added = Array.from({ length: ringSize - 2 }, (_, i) => ({
      x: center.x + radius * Math.cos(angle - side * (i + 1) * 2 * Math.PI / ringSize),
      y: center.y + radius * Math.sin(angle - side * (i + 1) * 2 * Math.PI / ringSize),
    }));
    const path = [start, ...added, end];
    let crossings = 0;
    for (let i = 1; i < path.length; i++) {
      for (const [left, right] of molecule.bonds) {
        const p = points.get(left)!;
        const q = points.get(right)!;
        if (cross(path[i - 1], path[i], p) * cross(path[i - 1], path[i], q) < -1e-9
          && cross(p, q, path[i - 1]) * cross(p, q, path[i]) < -1e-9) crossings++;
      }
    }
    const clearance = Math.min(...added.flatMap((point) => [...points.values()].map((old) => distance(point, old))));
    return { added, crossings, clearance, outward: distance(center, parentCenter) };
  });
  // Prefer a usable side, then the outside of the parent; clearance breaks ties.
  candidates.sort((left, right) => left.crossings - right.crossings
    || Number(left.clearance < length * 0.35) - Number(right.clearance < length * 0.35)
    || right.outward - left.outward || right.clearance - left.clearance);
  const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  const addedAtoms = candidates[0].added.map((point, i) => ({ id: firstId + i, x: point.x, y: point.y * 130 / 106 }));
  const atomIds = [a, ...addedAtoms.map((atom) => atom.id), b];
  return {
    ...molecule,
    atoms: [...molecule.atoms, ...addedAtoms],
    bonds: [...molecule.bonds, ...atomIds.slice(1).map((id, i): [number, number, 1] => [atomIds[i], id, 1])],
    rings: [...molecule.rings!, { id: Math.max(0, ...molecule.rings!.map((ring) => ring.id)) + 1, kind: "cycloalkane", atomIds }],
  };
}

/** Opening a fused aliphatic ring removes only its now-invalid metadata. */
export function removeFusedRingAtom<T extends GeneratedMolecule>(molecule: T, id: number): T | null {
  const rings = molecule.rings ?? [];
  const containing = rings.filter((ring) => ring.atomIds.includes(id));
  if (!containing.length || containing.some((ring) => ring.kind !== "cycloalkane")) return null;
  if (!containing.some((ring) => rings.some((other) => other !== ring
    && other.atomIds.filter((atomId) => ring.atomIds.includes(atomId)).length === 2))) return null;
  const atoms = molecule.atoms.filter((atom) => atom.id !== id);
  const bonds = molecule.bonds.filter(([a, b]) => a !== id && b !== id);
  const visited = new Set<number>();
  const pending = [atoms[0].id];
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [a, b] of bonds) {
      if (a === current) pending.push(b);
      if (b === current) pending.push(a);
    }
  }
  if (visited.size !== atoms.length) return null;
  return { ...molecule, atoms, bonds, rings: rings.filter((ring) => !ring.atomIds.includes(id)) };
}
