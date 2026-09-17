export type MoleculeVisualPoint = { x: number; y: number };

export type MoleculeVisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
};

/**
 * Conservative display bounds shared by the interactive canvas and tests.
 * Bond strokes lie between their endpoint extents, while the atom extent also
 * reserves room for labels, hydrogen subscripts and number badges.
 */
export function getMoleculeVisualBounds(
  positions: Iterable<MoleculeVisualPoint>,
  options: { atomExtent?: number; padding?: number } = {},
): MoleculeVisualBounds {
  const atomExtent = Math.max(0, options.atomExtent ?? 58);
  const padding = Math.max(0, options.padding ?? 72);
  const points = [...positions].filter((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (!points.length) {
    return { x: -padding, y: -padding, width: padding * 2 || 1, height: padding * 2 || 1, padding };
  }

  const minX = Math.min(...points.map((point) => point.x)) - atomExtent - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + atomExtent + padding;
  const minY = Math.min(...points.map((point) => point.y)) - atomExtent - padding;
  const maxY = Math.max(...points.map((point) => point.y)) + atomExtent + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    padding,
  };
}

export function moleculeVisualBoundsViewBox(bounds: MoleculeVisualBounds) {
  return `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
}

/** Keeps raster output proportional to the exact logical frame used by SVG. */
export function getMoleculeExportDimensions(
  bounds: Pick<MoleculeVisualBounds, "width" | "height">,
  longestEdgePixels: number,
) {
  const longestEdge = Math.max(1, Math.round(longestEdgePixels));
  const scale = longestEdge / Math.max(1, bounds.width, bounds.height);
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}
