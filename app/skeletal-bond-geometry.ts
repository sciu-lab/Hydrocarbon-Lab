export type SkeletalPoint = {
  x: number;
  y: number;
};

export type SkeletalBondSegment = SkeletalPoint & {
  x2: number;
  y2: number;
  role: "edge" | "inner";
};

export const SKELETAL_NODE_RADIUS = 20;
export const SKELETAL_BOND_END_BUFFER = 3;
export const SKELETAL_BOND_END_CLEARANCE = SKELETAL_NODE_RADIUS + SKELETAL_BOND_END_BUFFER;
export const SKELETAL_NUMBER_BADGE_OFFSET = { x: 20, y: -22 } as const;
export const SKELETAL_NUMBER_BADGE_RADIUS = 12;
export const SKELETAL_NUMBER_BADGE_STROKE_WIDTH = 2.5;
export const SKELETAL_NUMBER_BADGE_CLEARANCE = SKELETAL_NUMBER_BADGE_RADIUS
  + SKELETAL_NUMBER_BADGE_STROKE_WIDTH / 2
  + SKELETAL_BOND_END_BUFFER;
export const SKELETAL_RING_NUMBER_BADGE_DISTANCE = 30;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function getSkeletalRingNumberBadgeOffset(
  vertex: SkeletalPoint,
  ringPoints: readonly SkeletalPoint[],
): SkeletalPoint {
  const ringCenter = ringPoints.reduce(
    (center, point) => ({
      x: center.x + point.x / Math.max(ringPoints.length, 1),
      y: center.y + point.y / Math.max(ringPoints.length, 1),
    }),
    { x: 0, y: 0 },
  );
  const outwardX = vertex.x - ringCenter.x;
  const outwardY = vertex.y - ringCenter.y;
  const outwardLength = Math.hypot(outwardX, outwardY);

  if (outwardLength === 0) return { ...SKELETAL_NUMBER_BADGE_OFFSET };

  return {
    x: outwardX / outwardLength * SKELETAL_RING_NUMBER_BADGE_DISTANCE,
    y: outwardY / outwardLength * SKELETAL_RING_NUMBER_BADGE_DISTANCE,
  };
}

/**
 * Recorta un trazo paralelo sin mover los átomos ni cambiar su inclinación.
 * La distancia se mide sobre el eje original del enlace, de modo que las dos
 * líneas de un enlace doble terminan alineadas aunque estén desplazadas.
 */
export function clipSkeletalBondSegment<
  Segment extends SkeletalPoint & { x2: number; y2: number },
>(
  segment: Segment,
  start: SkeletalPoint,
  end: SkeletalPoint,
  startClearance = SKELETAL_BOND_END_CLEARANCE,
  endClearance = startClearance,
): Segment {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) return { ...segment };

  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  // Conserva al menos 8 px de trazo incluso si llega una geometría anómala.
  const maximumClearance = Math.max(0, (length - 8) / 2);
  const safeStartClearance = clamp(startClearance, 0, maximumClearance);
  const safeEndClearance = clamp(endClearance, 0, maximumClearance);
  const existingStartTrim = (segment.x - start.x) * tangentX
    + (segment.y - start.y) * tangentY;
  const existingEndTrim = (end.x - segment.x2) * tangentX
    + (end.y - segment.y2) * tangentY;
  const startAdjustment = Math.max(0, safeStartClearance - existingStartTrim);
  const endAdjustment = Math.max(0, safeEndClearance - existingEndTrim);

  return {
    ...segment,
    x: segment.x + tangentX * startAdjustment,
    y: segment.y + tangentY * startAdjustment,
    x2: segment.x2 - tangentX * endAdjustment,
    y2: segment.y2 - tangentY * endAdjustment,
  };
}

type SkeletalCircleObstacle = {
  center: SkeletalPoint;
  radius: number;
};

type SkeletalParallelBondClipOptions = {
  startObstacle?: SkeletalCircleObstacle;
  endObstacle?: SkeletalCircleObstacle;
};

function getCircleEndClearance(
  segment: SkeletalPoint & { x2: number; y2: number },
  start: SkeletalPoint,
  end: SkeletalPoint,
  obstacle: SkeletalCircleObstacle,
  endpoint: "start" | "end",
) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) return 0;

  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  const existingStartTrim = (segment.x - start.x) * tangentX
    + (segment.y - start.y) * tangentY;
  const lineOrigin = {
    x: segment.x - tangentX * existingStartTrim,
    y: segment.y - tangentY * existingStartTrim,
  };
  const obstacleDeltaX = obstacle.center.x - lineOrigin.x;
  const obstacleDeltaY = obstacle.center.y - lineOrigin.y;
  const centerProjection = obstacleDeltaX * tangentX + obstacleDeltaY * tangentY;
  const perpendicularSquared = Math.max(
    0,
    obstacleDeltaX ** 2 + obstacleDeltaY ** 2 - centerProjection ** 2,
  );
  const radiusSquared = obstacle.radius ** 2;
  if (perpendicularSquared >= radiusSquared) return 0;

  const halfChord = Math.sqrt(radiusSquared - perpendicularSquared);
  const entry = centerProjection - halfChord;
  const exit = centerProjection + halfChord;
  if (exit <= 0 || entry >= length) return 0;

  return endpoint === "start"
    ? Math.max(0, exit)
    : Math.max(0, length - entry);
}

/**
 * Recorta el conjunto completo usando los valores más conservadores. Así las
 * líneas paralelas comparten exactamente sus topes y ninguna roza la insignia
 * numerada aunque solo una de ellas se cruce con su circunferencia.
 */
export function clipSkeletalParallelBondSegments<
  Segment extends SkeletalPoint & { x2: number; y2: number },
>(
  segments: readonly Segment[],
  start: SkeletalPoint,
  end: SkeletalPoint,
  options: SkeletalParallelBondClipOptions = {},
): Segment[] {
  let startClearance = SKELETAL_BOND_END_CLEARANCE;
  let endClearance = SKELETAL_BOND_END_CLEARANCE;

  if (options.startObstacle) {
    startClearance = Math.max(
      startClearance,
      ...segments.map((segment) => getCircleEndClearance(
        segment,
        start,
        end,
        options.startObstacle!,
        "start",
      )),
    );
  }

  if (options.endObstacle) {
    endClearance = Math.max(
      endClearance,
      ...segments.map((segment) => getCircleEndClearance(
        segment,
        start,
        end,
        options.endObstacle!,
        "end",
      )),
    );
  }

  return segments.map((segment) => clipSkeletalBondSegment(
    segment,
    start,
    end,
    startClearance,
    endClearance,
  ));
}

/**
 * En los anillos la línea exterior forma parte del propio polígono: se deja
 * llegar al vértice igual que un enlace simple. La línea interior conserva su
 * recorte clásico y cada trazo se aparta de las insignias numeradas solo si su
 * trayectoria realmente las cruza.
 */
export function clipSkeletalRingDoubleBondSegments(
  segments: readonly SkeletalBondSegment[],
  start: SkeletalPoint,
  end: SkeletalPoint,
  options: SkeletalParallelBondClipOptions = {},
): SkeletalBondSegment[] {
  return segments.map((segment) => {
    const startClearance = options.startObstacle
      ? getCircleEndClearance(segment, start, end, options.startObstacle, "start")
      : 0;
    const endClearance = options.endObstacle
      ? getCircleEndClearance(segment, start, end, options.endObstacle, "end")
      : 0;

    return clipSkeletalBondSegment(
      segment,
      start,
      end,
      startClearance,
      endClearance,
    );
  });
}

export function getSkeletalRingDoubleBondSegments(
  start: SkeletalPoint,
  end: SkeletalPoint,
  ringPoints: readonly SkeletalPoint[],
): SkeletalBondSegment[] {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  let inwardX = -tangentY;
  let inwardY = tangentX;
  const ringCenter = ringPoints.reduce(
    (center, point) => ({
      x: center.x + point.x / Math.max(ringPoints.length, 1),
      y: center.y + point.y / Math.max(ringPoints.length, 1),
    }),
    { x: 0, y: 0 },
  );
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const pointsTowardCenter = inwardX * (ringCenter.x - midpoint.x)
    + inwardY * (ringCenter.y - midpoint.y);

  if (pointsTowardCenter < 0) {
    inwardX *= -1;
    inwardY *= -1;
  }

  // La línea exterior coincide con el lado geométrico del polígono. La línea
  // interior se desplaza hacia el centro (≈4,75–5,75 px entre ejes): así
  // sigue siendo distinguible sin invadir el espacio de los números de anillo
  // ni competir visualmente con sustituyentes próximos.
  const innerInset = clamp(length * 0.04, 4.75, 5.75);
  const endpointTrim = clamp(length * 0.09, 10, 18);

  return [
    {
      x: start.x,
      y: start.y,
      x2: end.x,
      y2: end.y,
      role: "edge",
    },
    {
      x: start.x + tangentX * endpointTrim + inwardX * innerInset,
      y: start.y + tangentY * endpointTrim + inwardY * innerInset,
      x2: end.x - tangentX * endpointTrim + inwardX * innerInset,
      y2: end.y - tangentY * endpointTrim + inwardY * innerInset,
      role: "inner",
    },
  ];
}
