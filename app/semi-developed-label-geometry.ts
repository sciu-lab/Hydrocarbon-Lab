export type SemiDevelopedLabelExtent = {
  halfWidth: number;
  halfHeight: number;
  hitRadius: number;
};

export const SEMI_DEVELOPED_LABEL_SCALE_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75] as const;
export const DEFAULT_SEMI_DEVELOPED_LABEL_SCALE = 1.25;
export const SEMI_DEVELOPED_LABEL_SCALE_STEP = 0.25;

export function normalizeSemiDevelopedLabelScale(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return SEMI_DEVELOPED_LABEL_SCALE_OPTIONS.find((scale) => Math.abs(scale - numericValue) < 1e-8)
    ?? DEFAULT_SEMI_DEVELOPED_LABEL_SCALE;
}

/** Deterministic estimate of the rendered SVG text footprint and its separate hit target. */
export function getSemiDevelopedLabelExtent(
  label: string,
  hydrogenSubscript?: number,
  charge = "",
  scale = 1,
): SemiDevelopedLabelExtent {
  const safeScale = Math.max(0.5, scale);
  const halfWidth = Math.max(
    4,
    (label.length * 4.8 + (hydrogenSubscript ? 4.2 : 0) + (charge ? 3.6 : 0)) * safeScale,
  );
  const halfHeight = (9 + (charge ? 2 : 0)) * safeScale;
  return {
    halfWidth,
    halfHeight,
    hitRadius: Math.max(32, halfWidth + 12, halfHeight + 10),
  };
}
