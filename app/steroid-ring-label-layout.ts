export type OverlayPoint = { x: number; y: number };
export type OverlayExtent = { x: number; y: number; width: number; height: number };
export type SteroidRingLabel = "A" | "B" | "C" | "D";

export type PositionedSteroidRingLabel = OverlayPoint & {
  label: SteroidRingLabel;
};

const LABELS: readonly SteroidRingLabel[] = ["A", "B", "C", "D"];
const LABEL_RADIUS = 15;

export function steroidLabelIntersectsExtent(
  point: OverlayPoint,
  extent: OverlayExtent,
  clearance = 3,
) {
  const closestX = Math.max(extent.x, Math.min(point.x, extent.x + extent.width));
  const closestY = Math.max(extent.y, Math.min(point.y, extent.y + extent.height));
  return Math.hypot(point.x - closestX, point.y - closestY) < LABEL_RADIUS + clearance;
}

/**
 * Places educational A/B/C/D labels from recognized ring membership only.
 * Candidate offsets are expressed in each polygon's own axes, so rotations and
 * reflections keep the labels associated with the same ring.
 */
export function layoutSteroidRingLabels(
  ringsByLabel: Record<SteroidRingLabel, readonly number[]>,
  positions: ReadonlyMap<number, OverlayPoint>,
  obstacles: readonly OverlayExtent[] = [],
): PositionedSteroidRingLabel[] {
  const placed: PositionedSteroidRingLabel[] = [];

  for (const label of LABELS) {
    const atomIds = ringsByLabel[label];
    const points = atomIds
      .map((atomId) => positions.get(atomId))
      .filter((point): point is OverlayPoint => Boolean(point));
    if (points.length !== atomIds.length) continue;
    const centroid = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    const axisLength = Math.hypot(points[0].x - centroid.x, points[0].y - centroid.y) || 1;
    const axis = {
      x: (points[0].x - centroid.x) / axisLength,
      y: (points[0].y - centroid.y) / axisLength,
    };
    const normal = { x: -axis.y, y: axis.x };
    const candidates = [
      [0, 0], [0, 9], [0, -9], [9, 0], [-9, 0], [7, 7], [-7, 7], [7, -7], [-7, -7],
    ].map(([along, across]) => ({
      x: centroid.x + axis.x * along + normal.x * across,
      y: centroid.y + axis.y * along + normal.y * across,
    }));

    const score = (candidate: OverlayPoint) => {
      const obstaclePenalty = obstacles.reduce(
        (total, obstacle) => total + (steroidLabelIntersectsExtent(candidate, obstacle) ? 10_000 : 0),
        0,
      );
      const labelPenalty = placed.reduce(
        (total, prior) => total + (Math.hypot(candidate.x - prior.x, candidate.y - prior.y) < 34 ? 10_000 : 0),
        0,
      );
      return obstaclePenalty + labelPenalty + Math.hypot(candidate.x - centroid.x, candidate.y - centroid.y);
    };
    candidates.sort((left, right) => score(left) - score(right));
    placed.push({ label, ...candidates[0] });
  }

  return placed;
}
