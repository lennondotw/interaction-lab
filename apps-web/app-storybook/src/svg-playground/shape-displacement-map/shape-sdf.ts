/**
 * Signed distance to a shape, evaluated one point at a time, plus the gradient that
 * gives a surface normal.
 *
 * `sdf-edge-trace/field.ts` already has this maths, but not in a form this story can
 * use: `ContourTracer` is built to walk a quadtree and hand back a contour, and its
 * sampler is private because exposing it would invite exactly the per-pixel use that
 * the quadtree exists to avoid. A displacement map is the opposite workload — every
 * pixel, once, no reuse — so it gets its own evaluator.
 *
 * That is also the repo's existing precedent rather than a departure from it:
 * `irregular/irregular-trace.tsx` keeps a second polygon distance on purpose, to check
 * the field against a reading that shares no code with it.
 *
 * Sign convention: **negative inside**, matching `field.ts`.
 */

export type Sdf = (x: number, y: number) => number;

export interface RoundedBox {
  cx: number;
  cy: number;
  /** Half-extents of the whole box, corners included. */
  hw: number;
  hh: number;
  /** Corner radius, clamped to `min(hw, hh)`. */
  r: number;
  /**
   * Exponent of the corner curve, the `n` in `|x|ⁿ + |y|ⁿ = rⁿ`. 2 is a circular arc,
   * 4 a squircle, 1 a bevel. Same meaning as `FieldShape.n`, which is also CSS
   * `corner-shape: superellipse(k)` with `n = 2ᵏ`.
   */
  n: number;
}

/**
 * The p-norm rounded box. With `hw === hh === r` this collapses to `length(p - c) - r`
 * exactly, so a circle needs no separate primitive.
 *
 * Only 1-Lipschitz at `n === 2`; past that the corner's gradient exceeds 1 and the
 * value is a slight under-estimate of true distance. That matters for a tracer's cull
 * bound and does not matter here — the refraction reads the field's *shape*, and both
 * the height profile and the normal come from the same slightly-warped field, so they
 * stay consistent with each other.
 */
export const roundedBoxSdf = ({ cx, cy, hw, hh, r, n }: RoundedBox): Sdf => {
  const radius = Math.max(0, Math.min(r, hw, hh));
  const insetX = hw - radius;
  const insetY = hh - radius;
  const power = Math.max(n, 0.05);

  return (x, y) => {
    const qx = Math.abs(x - cx) - insetX;
    const qy = Math.abs(y - cy) - insetY;
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    const corner =
      power === 2 ? Math.hypot(outsideX, outsideY) : (outsideX ** power + outsideY ** power) ** (1 / power);
    return Math.min(Math.max(qx, qy), 0) + corner - radius;
  };
};

export interface Polygon {
  cx: number;
  cy: number;
  /** Interleaved `x, y`, relative to `{ cx, cy }`. Any winding, convex or concave. */
  points: readonly number[];
  /** Outward offset: the shape grows by this in every direction, filleting every corner. */
  r: number;
}

/**
 * Exact Euclidean distance to a polygon's edge set, negative inside, minus the offset.
 *
 * Inside-ness is a crossing count rather than a "which side of the nearest edge" test,
 * because the latter is wrong at a reflex vertex — a star's notch sits outside the
 * polygon while being inside the hull, and the nearest edge there faces the wrong way.
 */
export const polygonSdf = ({ cx, cy, points, r }: Polygon): Sdf => {
  const count = Math.floor(points.length / 2);

  // Vertices and edges are hoisted out of the hot loop. This function runs once per pixel
  // and loops over every edge inside that, so a few hundred vertices — which is what
  // Apple's flattened corner comes to — makes it the only thing in this folder whose
  // constant factor is worth caring about. Recomputing each edge's vector and squared
  // length per pixel, as the obvious version does, roughly doubles the cost.
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);
  const ex = new Float64Array(count);
  const ey = new Float64Array(count);
  const invLen2 = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    vx[i] = cx + (points[i * 2] ?? 0);
    vy[i] = cy + (points[i * 2 + 1] ?? 0);
  }
  // Edge `i` runs from vertex `i` to its predecessor, matching the crossing test below.
  for (let v = 0, j = count - 1; v < count; j = v++) {
    const dx = (vx[j] ?? 0) - (vx[v] ?? 0);
    const dy = (vy[j] ?? 0) - (vy[v] ?? 0);
    ex[v] = dx;
    ey[v] = dy;
    const len2 = dx * dx + dy * dy;
    invLen2[v] = len2 > 0 ? 1 / len2 : 0;
  }

  return (px, py) => {
    let best = Infinity;
    let inside = false;
    for (let v = 0; v < count; v++) {
      const ax = vx[v] ?? 0;
      const ay = vy[v] ?? 0;
      const edgeX = ex[v] ?? 0;
      const edgeY = ey[v] ?? 0;
      const wx = px - ax;
      const wy = py - ay;

      let t = (wx * edgeX + wy * edgeY) * (invLen2[v] ?? 0);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;

      const dx = wx - edgeX * t;
      const dy = wy - edgeY * t;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;

      const by = ay + edgeY;
      if (ay > py !== by > py && px < ax + ((py - ay) / edgeY) * edgeX) inside = !inside;
    }
    const d = Math.sqrt(best);
    return (inside ? -d : d) - r;
  };
};

/*
 * There is deliberately no `normalAt(sdf, x, y)` here.
 *
 * A normal is a difference of two field samples, and the caller — `refraction-map` —
 * already samples the whole field into a buffer. Taking the difference between
 * neighbouring buffer entries costs nothing, where a helper taking an `Sdf` would have to
 * call it four more times per pixel: a 5× bill on the only expensive thing in this folder,
 * since a polygon's distance is a loop over every edge and Apple's flattened corner is a
 * few hundred of them.
 */
