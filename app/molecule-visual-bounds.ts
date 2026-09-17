export type MoleculeVisualPoint = { x: number; y: number };

export type MoleculeVisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
};

export type MoleculeVisualExtent = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MoleculeExportFrame = {
  bounds: MoleculeVisualBounds;
  viewBox: string;
  width: number;
  height: number;
};

/**
 * Conservative display bounds shared by the interactive canvas and tests.
 * Bond strokes lie between their endpoint extents, while the atom extent also
 * reserves room for labels, hydrogen subscripts and number badges.
 */
export function getMoleculeVisualBounds(
  positions: Iterable<MoleculeVisualPoint>,
  options: {
    atomExtent?: number;
    padding?: number;
    additionalExtents?: Iterable<MoleculeVisualExtent>;
  } = {},
): MoleculeVisualBounds {
  const atomExtent = Math.max(0, options.atomExtent ?? 58);
  const padding = Math.max(0, options.padding ?? 72);
  const points = [...positions].filter((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  const additionalExtents = [...(options.additionalExtents ?? [])].filter((extent) =>
    [extent.x, extent.y, extent.width, extent.height].every(Number.isFinite)
    && extent.width >= 0
    && extent.height >= 0,
  );
  if (!points.length && !additionalExtents.length) {
    return { x: -padding, y: -padding, width: padding * 2 || 1, height: padding * 2 || 1, padding };
  }

  const pointMinX = points.length ? Math.min(...points.map((point) => point.x)) - atomExtent : Infinity;
  const pointMaxX = points.length ? Math.max(...points.map((point) => point.x)) + atomExtent : -Infinity;
  const pointMinY = points.length ? Math.min(...points.map((point) => point.y)) - atomExtent : Infinity;
  const pointMaxY = points.length ? Math.max(...points.map((point) => point.y)) + atomExtent : -Infinity;
  const minX = Math.min(pointMinX, ...additionalExtents.map((extent) => extent.x)) - padding;
  const maxX = Math.max(pointMaxX, ...additionalExtents.map((extent) => extent.x + extent.width)) + padding;
  const minY = Math.min(pointMinY, ...additionalExtents.map((extent) => extent.y)) - padding;
  const maxY = Math.max(pointMaxY, ...additionalExtents.map((extent) => extent.y + extent.height)) + padding;
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

/** One logical frame shared by preview, SVG serialization and PNG rasterization. */
export function getMoleculeExportFrame(
  bounds: MoleculeVisualBounds,
  longestEdgePixels: number,
): MoleculeExportFrame {
  const dimensions = getMoleculeExportDimensions(bounds, longestEdgePixels);
  return {
    bounds,
    viewBox: moleculeVisualBoundsViewBox(bounds),
    ...dimensions,
  };
}
