import { clipBondSegmentsToLabel } from "./bond-label-geometry.ts";

export type SemiDevelopedBondSegment = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  role?: string | null;
};

/** Clip single, double, or triple bond strokes to the semi-developed label badges. */
export function clipSemiDevelopedBondSegments(
  segments: readonly SemiDevelopedBondSegment[],
  start: { x: number; y: number },
  end: { x: number; y: number },
): SemiDevelopedBondSegment[] {
  return clipBondSegmentsToLabel(segments, start, end, { radius: 28, overlap: 3 });
}
