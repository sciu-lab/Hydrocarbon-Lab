import { clipBondSegmentsToLabel } from "./bond-label-geometry.ts";
import type { SemiDevelopedLabelExtent } from "./semi-developed-label-geometry.ts";

export const SEMI_DEVELOPED_BOND_LABEL_GAP = 8;

export type SemiDevelopedBondSegment = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  role?: string | null;
};

/** Clip bond strokes to the text footprint, independently of the larger atom hit target. */
export function clipSemiDevelopedBondSegments(
  segments: readonly SemiDevelopedBondSegment[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  startExtent: Pick<SemiDevelopedLabelExtent, "halfWidth" | "halfHeight">,
  endExtent: Pick<SemiDevelopedLabelExtent, "halfWidth" | "halfHeight">,
): SemiDevelopedBondSegment[] {
  return clipBondSegmentsToLabel(segments, start, end, {
    startExtent,
    endExtent,
    textPadding: SEMI_DEVELOPED_BOND_LABEL_GAP,
  });
}
