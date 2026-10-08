export type LabelClippedBondSegment = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  role?: string | null;
};

/** Shared presentation primitive: trims parallel strokes to atom label geometry. */
export function clipBondSegmentsToLabel<Segment extends LabelClippedBondSegment>(
  segments: readonly Segment[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  options: {
    radius?: number;
    startExtent?: { halfWidth: number; halfHeight: number };
    endExtent?: { halfWidth: number; halfHeight: number };
    textPadding?: number;
    overlap?: number;
  },
): Segment[] {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return segments.map((segment) => ({ ...segment }));
  const ux = dx / length, uy = dy / length;
  const nx = -uy, ny = ux;
  const overlap = options.overlap ?? 3;
  const maxTrim = Math.max(0, (length - 8) / 2);
  const trimAt = (offset: number, extent?: { halfWidth: number; halfHeight: number }) => {
    const extentAlongBond = extent
      ? Math.min(
          extent.halfWidth / Math.max(1e-6, Math.abs(ux)),
          extent.halfHeight / Math.max(1e-6, Math.abs(uy)),
        )
      : Math.sqrt(Math.max(0, (options.radius ?? 0) ** 2 - offset ** 2));
    const trim = extent
      ? extentAlongBond + (options.textPadding ?? 0)
      : extentAlongBond - overlap;
    return Math.min(maxTrim, Math.max(0, trim));
  };
  return segments.map((segment) => {
    const startOffset = (segment.x - start.x) * nx + (segment.y - start.y) * ny;
    const endOffset = (segment.x2 - end.x) * nx + (segment.y2 - end.y) * ny;
    const startTrim = trimAt(startOffset, options.startExtent), endTrim = trimAt(endOffset, options.endExtent);
    return {
      ...segment,
      x: segment.x + ux * startTrim,
      y: segment.y + uy * startTrim,
      x2: segment.x2 - ux * endTrim,
      y2: segment.y2 - uy * endTrim,
    };
  });
}
