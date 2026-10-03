import { resolveRadii, squircleCorners } from '../../components/continuous-corner/squircle-path.js';

export type EdgeAxis = 'width' | 'height';

export interface IndicatorGeometry {
  path: string;
  origin: { x: number; y: number };
  length: number;
  cornerStart: number;
  cornerLength: number;
  start: Record<EdgeAxis, number>;
}

/** The virtual contour shares ContinuousCorner's controls; the frame's CSS border stays unchanged. */
export function measureIndicatorGeometry(
  box: { x: number; y: number; width: number; height: number; radius: number },
  bodyCenter: { x: number; y: number },
  measureLength: (path: string) => number
): IndicatorGeometry {
  const corner = squircleCorners({ width: box.width, height: box.height, radii: resolveRadii(box.radius) })[2]!;
  const point = ([x, y]: readonly [number, number]) => `${x} ${y}`;
  const curve = corner.segments.map(({ c1, c2, to }) => `C ${point(c1)} ${point(c2)} ${point(to)}`).join(' ');
  const cornerLength = measureLength(`M ${point(corner.from)} ${curve}`);
  const cornerStart = corner.from[1];
  const length = cornerStart + cornerLength + corner.segments[2].to[0];

  return {
    path: `M ${box.width} 0 L ${point(corner.from)} ${curve} L 0 ${box.height}`,
    origin: { x: box.x, y: box.y },
    length,
    cornerStart,
    cornerLength,
    start: { width: bodyCenter.y - box.y, height: length - (bodyCenter.x - box.x) },
  };
}

/** Distance increases down the right edge, around the corner, then left along the bottom. */
export function indicatorCenter(geometry: IndicatorGeometry, axis: EdgeAxis, progress: number) {
  const target = geometry.cornerStart + geometry.cornerLength / 2;
  return (1 - progress) * geometry.start[axis] + progress * target;
}

export const indicatorSize = {
  rest: { length: 24, thickness: 3 },
  hover: { length: 28, thickness: 4 },
  active: { length: 26, thickness: 3.5 },
};
export const indicatorTravelScale = 1.2;

export function indicatorLength(progress: number, edgeLength: number, cornerLength: number) {
  return (1 - progress) * edgeLength + progress * cornerLength;
}

/** A single round-capped dash grows symmetrically around its own arc-length center. */
export function indicatorDash(
  geometry: IndicatorGeometry,
  axis: EdgeAxis,
  progress: number,
  length: number,
  thickness: number
) {
  // The two round caps contribute one thickness to the visible length.
  const dashLength = length - thickness;
  return {
    array: `${dashLength} ${geometry.length}`,
    offset: dashLength / 2 - indicatorCenter(geometry, axis, progress),
  };
}
