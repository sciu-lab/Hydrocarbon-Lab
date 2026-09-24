export type CondensedBondSegment = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  role: string | null;
};

// This radius is also used by the condensed atom circle in the live SVG.
export const CONDENSED_NODE_RADIUS = 28;
const CONDENSED_BOND_NODE_OVERLAP = 3;

/** End each parallel stroke just inside the visible atom circle. */
export function clipCondensedBondSegments(
  segments: readonly CondensedBondSegment[],
  start: { x: number; y: number },
  end: { x: number; y: number },
): CondensedBondSegment[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return segments.map((segment) => ({ ...segment }));

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const maxTrim = Math.max(0, (length - 8) / 2);
  const trimAt = (offset: number) => Math.min(maxTrim, Math.max(
    0,
    Math.sqrt(Math.max(0, CONDENSED_NODE_RADIUS ** 2 - offset ** 2)) - CONDENSED_BOND_NODE_OVERLAP,
  ));

  return segments.map((segment) => {
    const startOffset = (segment.x - start.x) * nx + (segment.y - start.y) * ny;
    const endOffset = (segment.x2 - end.x) * nx + (segment.y2 - end.y) * ny;
    const startTrim = trimAt(startOffset);
    const endTrim = trimAt(endOffset);
    return {
      ...segment,
      x: segment.x + ux * startTrim,
      y: segment.y + uy * startTrim,
      x2: segment.x2 - ux * endTrim,
      y2: segment.y2 - uy * endTrim,
    };
  });
}
