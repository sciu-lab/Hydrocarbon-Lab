import { clipBondSegmentsToLabel } from "./bond-label-geometry.ts";

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
  return clipBondSegmentsToLabel(segments, start, end, {
    radius: CONDENSED_NODE_RADIUS,
    overlap: CONDENSED_BOND_NODE_OVERLAP,
  });
}
