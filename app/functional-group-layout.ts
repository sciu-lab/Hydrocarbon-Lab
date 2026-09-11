export type FunctionalTemplatePoint = { x: number; y: number; element?: string };
export type FunctionalTemplateBond = readonly [number, number, number];
export type FunctionalLayoutPoint = { x: number; y: number };

export function hasCarbonylAttachment(bonds: readonly FunctionalTemplateBond[]) {
  return bonds.some(([from, , order]) => from === 0 && order === 2);
}

/**
 * Rotates a functional-group template so its C=O vector points to the exterior
 * of any ring. The template topology and coordinates of ring atoms are never
 * modified.
 */
export function orientCarbonylTemplateOutsideRing(
  atoms: readonly FunctionalTemplatePoint[],
  bonds: readonly FunctionalTemplateBond[],
  anchor: FunctionalLayoutPoint,
  ringPoints: readonly FunctionalLayoutPoint[],
): FunctionalLayoutPoint[] {
  const carbonylBond = bonds.find(([from, , order]) => from === 0 && order === 2);
  if (!carbonylBond || !ringPoints.length) {
    return atoms.map((atom) => ({ x: anchor.x + atom.x, y: anchor.y + atom.y }));
  }
  const carbonyl = atoms[carbonylBond[1] - 1];
  if (!carbonyl) return atoms.map((atom) => ({ x: anchor.x + atom.x, y: anchor.y + atom.y }));

  const center = ringPoints.reduce(
    (total, point) => ({ x: total.x + point.x / ringPoints.length, y: total.y + point.y / ringPoints.length }),
    { x: 0, y: 0 },
  );
  const rawLength = Math.hypot(carbonyl.x, carbonyl.y) || 1;
  const exteriorLength = Math.hypot(anchor.x - center.x, anchor.y - center.y) || 1;
  const exterior = { x: (anchor.x - center.x) / exteriorLength, y: (anchor.y - center.y) / exteriorLength };
  const raw = { x: carbonyl.x / rawLength, y: carbonyl.y / rawLength };
  const cos = raw.x * exterior.x + raw.y * exterior.y;
  const sin = raw.x * exterior.y - raw.y * exterior.x;

  return atoms.map((atom) => ({
    x: anchor.x + atom.x * cos - atom.y * sin,
    y: anchor.y + atom.x * sin + atom.y * cos,
  }));
}
