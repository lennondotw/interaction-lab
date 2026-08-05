import { describe, expect, it } from 'vitest';

import { resolveRadii, squircleCorners, squirclePath, type SquircleCorner } from '../squircle-path.js';

/**
 * Every expectation here is a control point dumped from
 * `RoundedRectangle(cornerRadius:style:.continuous).path(in:)` by
 * `archive/2026-08-swiftui-corner-shapes/probe.swift`. They are not derived from
 * this implementation, so they catch it drifting rather than merely changing.
 *
 * The tolerance is 0.001 because that is the precision the probe printed at, not
 * because anything here is approximate.
 */
const EXACT = 3;

const cornersOf = (width: number, height: number, radius: number) =>
  squircleCorners({ width, height, radii: resolveRadii(radius) });

/** The top-left corner, which the probe dumps in absolute box coordinates. */
const topLeft = (width: number, height: number, radius: number) => {
  const corner = cornersOf(width, height, radius)[0];
  if (!corner) throw new Error('no top-left corner');
  return corner;
};

const expectPoint = (actual: readonly [number, number], expected: readonly [number, number]) => {
  expect(actual[0]).toBeCloseTo(expected[0], EXACT);
  expect(actual[1]).toBeCloseTo(expected[1], EXACT);
};

describe('squircleCorners — against Apple, unclamped', () => {
  // probe.swift section 9: 1000x1000, r = 100, values are r x the constants.
  it('reproduces the 1000x1000 r=100 corner control points', () => {
    const { from, segments } = topLeft(1000, 1000, 100);

    expectPoint(from, [0, 152.8665]);

    expectPoint(segments[0].c1, [0, 108.849]);
    expectPoint(segments[0].c2, [0, 86.8407]);
    expectPoint(segments[0].to, [7.4911, 63.1494]);

    expectPoint(segments[1].c1, [16.906, 37.2824]);
    expectPoint(segments[1].c2, [37.2824, 16.906]);
    expectPoint(segments[1].to, [63.1494, 7.4911]);

    expectPoint(segments[2].c1, [86.8407, 0]);
    expectPoint(segments[2].c2, [108.849, 0]);
    expectPoint(segments[2].to, [152.8665, 0]);
  });

  it('reaches 1.528665r along the edge at every radius', () => {
    for (const r of [10, 25, 50, 100, 200]) {
      const { segments } = topLeft(1000, 1000, r);
      expect(segments[2].to[0]).toBeCloseTo(1.528665 * r, EXACT);
    }
  });

  it('puts the apex at 0.412253r along the diagonal', () => {
    // The middle segment's t = 0.5 point, which by symmetry is the diagonal
    // crossing: (P0 + 3*P1 + 3*P2 + P3) / 8.
    const r = 100;
    const { segments } = topLeft(1000, 1000, r);
    const p0 = segments[0].to;
    const [c1, c2, p3] = [segments[1].c1, segments[1].c2, segments[1].to];
    const apexX = (p0[0] + 3 * c1[0] + 3 * c2[0] + p3[0]) / 8;
    const apexY = (p0[1] + 3 * c1[1] + 3 * c2[1] + p3[1]) / 8;

    expect(apexX).toBeCloseTo(0.291507 * r, EXACT);
    expect(apexY).toBeCloseTo(0.291507 * r, EXACT);
    expect(Math.hypot(apexX, apexY)).toBeCloseTo(0.412253 * r, EXACT);
  });
});

describe('squircleCorners — against Apple, in the degradation zone', () => {
  // probe.swift degradation dump: 300x300, half = 150, crossover at r = 98.13.
  const cases: readonly { r: number; start: number; outer1: number; outer2: number }[] = [
    { r: 90, start: 137.58, outer1: 97.964, outer2: 78.157 },
    { r: 105, start: 150, outer1: 111.737, outer2: 90.22 },
    { r: 120, start: 150, outer1: 122.491, outer2: 101.147 },
    { r: 135, start: 150, outer1: 133.246, outer2: 112.073 },
    { r: 150, start: 150, outer1: 144, outer2: 123 },
  ];

  for (const { r, start, outer1, outer2 } of cases) {
    it(`matches the 300x300 r=${r} corner`, () => {
      const corner = topLeft(300, 300, r);
      expect(corner.from[1]).toBeCloseTo(start, EXACT);
      expect(corner.segments[0].c1[1]).toBeCloseTo(outer1, EXACT);
      expect(corner.segments[0].c2[1]).toBeCloseTo(outer2, EXACT);
    });
  }

  it('keeps the inner points scaling with r right through the clamp', () => {
    // Apple flattens the curve rather than shrinking the corner, so these do not
    // move when the extent saturates.
    for (const r of [105, 120, 135, 150]) {
      const { segments } = topLeft(300, 300, r);
      expectPoint(segments[0].to, [0.074911 * r, 0.631494 * r]);
      expectPoint(segments[1].c1, [0.16906 * r, 0.372824 * r]);
    }
  });

  it('is continuous across the crossover', () => {
    const half = 150;
    const crossover = half / 1.528665;
    const below = topLeft(300, 300, crossover - 0.001);
    const above = topLeft(300, 300, crossover + 0.001);

    expect(above.from[1] - below.from[1]).toBeCloseTo(0, 2);
    expect(above.segments[0].c1[1] - below.segments[0].c1[1]).toBeCloseTo(0, 2);
    expect(above.segments[0].c2[1] - below.segments[0].c2[1]).toBeCloseTo(0, 2);
  });
});

describe('squircleCorners — asymmetric corners', () => {
  // probe.swift asym dump. The budget is per axis, so one axis saturates while
  // the other does not, and the corner is genuinely not diagonal-symmetric.
  it('matches 400x200 r=80, clamped vertically and not horizontally', () => {
    const { from, segments } = topLeft(400, 200, 80);

    expectPoint(from, [0, 100]);
    expectPoint(segments[0].c1, [0, 81.661]);
    expectPoint(segments[0].c2, [0, 67.431]);
    expectPoint(segments[0].to, [5.993, 50.52]);

    expectPoint(segments[1].c1, [13.525, 29.826]);
    expectPoint(segments[1].c2, [29.826, 13.525]);
    expectPoint(segments[1].to, [50.52, 5.993]);

    expectPoint(segments[2].c1, [69.473, 0]);
    expectPoint(segments[2].c2, [87.079, 0]);
    expectPoint(segments[2].to, [122.293, 0]);
  });

  it('matches 300x120 r=55', () => {
    const { from, segments } = topLeft(300, 120, 55);

    expectPoint(from, [0, 60]);
    expectPoint(segments[0].c1, [0, 54.015]);
    expectPoint(segments[0].c2, [0, 45.558]);
    expectPoint(segments[0].to, [4.12, 34.732]);
    expectPoint(segments[2].to, [84.077, 0]);
  });

  it('reaches further along the long axis than the short one', () => {
    const { from, segments } = topLeft(400, 200, 80);
    expect(segments[2].to[0]).toBeGreaterThan(from[1]);
  });
});

describe('squircleCorners — clamping and degenerate boxes', () => {
  it('treats a radius past half the short side as that half', () => {
    const huge = topLeft(400, 200, 10_000);
    const exact = topLeft(400, 200, 100);
    expectPoint(huge.from, exact.from);
    expectPoint(huge.segments[2].to, exact.segments[2].to);
  });

  it('collapses to the box corner at radius 0', () => {
    const { from, segments } = topLeft(200, 200, 0);
    expectPoint(from, [0, 0]);
    expectPoint(segments[2].to, [0, 0]);
  });

  it('survives a zero-sized box', () => {
    expect(() => squirclePath({ width: 0, height: 0, radii: resolveRadii(12) })).not.toThrow();
  });
});

describe('squircleCorners — traversal', () => {
  it('walks clockwise, each corner starting where the last one ended', () => {
    const corners = cornersOf(400, 240, 32);
    for (let index = 0; index < corners.length; index++) {
      const corner = corners[index];
      const next = corners[(index + 1) % corners.length];
      if (!corner || !next) throw new Error('missing corner');
      // The run between two corners is axis-aligned, so exactly one coordinate
      // is shared. A mirrored or reversed corner would break this.
      const end = corner.segments[2].to;
      const shared = end[0] === next.from[0] || end[1] === next.from[1];
      expect(shared).toBe(true);
    }
  });

  it('places all four corners on the box, not just the first', () => {
    const [, topRight, bottomRight, bottomLeft] = cornersOf(400, 240, 32);
    if (!topRight || !bottomRight || !bottomLeft) throw new Error('missing corner');
    expect(topRight.from[1]).toBeCloseTo(0, EXACT);
    expect(bottomRight.from[0]).toBeCloseTo(400, EXACT);
    expect(bottomLeft.from[1]).toBeCloseTo(240, EXACT);
  });

  it('honours per-corner radii independently', () => {
    const corners = squircleCorners({
      width: 400,
      height: 400,
      radii: resolveRadii({ topLeft: 96, topRight: 8, bottomRight: 64, bottomLeft: 4 }),
    });
    const extents = corners.map((corner: SquircleCorner) => corner.segments[2].to);
    const [topLeftExtent, , bottomRightExtent] = extents;
    if (!topLeftExtent || !bottomRightExtent) throw new Error('missing corner');
    expect(Math.abs(topLeftExtent[0] - 0)).toBeCloseTo(1.528665 * 96, EXACT);
    expect(Math.abs(bottomRightExtent[0] - 400)).toBeCloseTo(1.528665 * 64, EXACT);
  });
});

describe('squirclePath', () => {
  it('emits a closed path that starts on the top edge', () => {
    const d = squirclePath({ width: 320, height: 200, radii: resolveRadii(24) });
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // Four corners, three cubics each.
    expect(d.match(/C/g)).toHaveLength(12);
    expect(d.match(/L/g)).toHaveLength(4);
  });

  it('is stable for the same geometry', () => {
    const geometry = { width: 320, height: 200, radii: resolveRadii(24) };
    expect(squirclePath(geometry)).toBe(squirclePath(geometry));
  });

  it('carries no exponent notation, which CSS path() would reject', () => {
    const d = squirclePath({ width: 0.0001, height: 0.0001, radii: resolveRadii(0.00001) });
    expect(d).not.toMatch(/e[+-]/i);
  });
});

describe('squircleCorners — the shape at maximum radius', () => {
  /** Radial distance from the box centre, folded into one quadrant. */
  const radialProfile = (side: number, radius: number) => {
    const centre = side / 2;
    const corners = squircleCorners({ width: side, height: side, radii: resolveRadii(radius) });
    const cubic = (
      p0: readonly [number, number],
      c1: readonly [number, number],
      c2: readonly [number, number],
      p3: readonly [number, number],
      t: number
    ) => {
      const u = 1 - t;
      const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return [a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]] as const;
    };

    const byDegree = new Map<number, number[]>();
    for (const corner of corners) {
      let cursor = corner.from;
      for (const segment of corner.segments) {
        for (let i = 0; i <= 200; i++) {
          const [x, y] = cubic(cursor, segment.c1, segment.c2, segment.to, i / 200);
          const deg = Math.round(((((Math.atan2(y - centre, x - centre) * 180) / Math.PI) % 90) + 90) % 90);
          const bucket = byDegree.get(deg) ?? [];
          bucket.push(Math.hypot(x - centre, y - centre));
          byDegree.set(deg, bucket);
        }
        cursor = segment.to;
      }
    }
    return new Map([...byDegree].map(([deg, rs]) => [deg, rs.reduce((a, b) => a + b, 0) / rs.length]));
  };

  // Faithful to Apple rather than a defect — see SPEC.md. Pinned so that a change
  // to the clamped interpolation cannot quietly alter the silhouette of every
  // circle and pill in the app.
  it('bulges toward the diagonals and pinches between them', () => {
    const profile = radialProfile(400, 200);
    const at = (deg: number) => profile.get(deg) ?? Number.NaN;

    expect(at(0)).toBeCloseTo(200, 1);
    expect(at(45)).toBeCloseTo(200.392, 2);
    expect(at(21)).toBeCloseTo(199.158, 2);
    // The diagonal is outside a true circle; the shoulder is inside it.
    expect(at(45)).toBeGreaterThan(200);
    expect(at(21)).toBeLessThan(200);
  });

  it('is the same shape however far past the clamp the radius goes', () => {
    const clamped = radialProfile(400, 200);
    const absurd = radialProfile(400, 10_000);
    for (const deg of [0, 21, 45, 60, 89]) {
      expect(absurd.get(deg)).toBeCloseTo(clamped.get(deg) ?? Number.NaN, 6);
    }
  });
});
