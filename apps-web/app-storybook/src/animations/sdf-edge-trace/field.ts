/**
 * Contour extraction for metaball-style shapes, in two flavours:
 *
 * - `density`: what `sdf-effect` actually renders. A sum of gaussian-blurred
 *   discs, thresholded at 0.4 (matching `feColorMatrix values="... 20 -8"`).
 *   Saturates at 0 and 1, so it carries no distance information away from the
 *   edge — you can only ever scan it densely.
 * - `sdf`: a real signed distance field, `smin` over per-shape distances. The
 *   value is a distance in pixels everywhere, which lets a quadtree cull whole
 *   regions that provably cannot contain the surface.
 *
 * A primitive is a rounded box (`FieldShape`), of which a disc is the case where
 * the half-extents equal the corner radius — one code path, no branch. That is
 * what lets a laid-out DOM rect seed the field directly.
 *
 * The point of having both behind one interface is that the extracted contour
 * is identical; only the cost of getting there differs.
 *
 * The sampled domain is deliberately larger than the box the caller works in. A
 * shape is confined to the view, but the surface around it is not — it reaches
 * `max(blend, 3 * sigma)` past the shape's own outline — so a shape parked on the
 * frame would put half its contour outside a view-sized grid, marching
 * squares would hand back an open chain, and the renderer would close it with a
 * straight chord along the frame. Sampling an `overscan` margin on every side
 * is what keeps every loop closed. See
 * archive/2026-07-contour-domain-overscan for how that margin was sized and
 * what it costs per traversal.
 *
 * A distance field also gets an inset contour cheaply, which is the one
 * capability here that is genuinely `sdf`-only: the curve `inset` px inside the
 * surface is just the iso level `-inset`, and every sample taken for iso 0
 * already answers for it. See `TraceConfig.inset` for what that does and does
 * not make free.
 */

/**
 * One primitive in the field: a rounded box, centred at `x, y`.
 *
 * A disc is not a special case of this — it *is* this, with the half-extents equal
 * to the corner radius. Substituting `hw = hh = r = R` into the rounded-box
 * distance collapses it to `length(p - c) - R` exactly, so the two live on one code
 * path and the ball-based stories keep the geometry they always had. That is why
 * the fields below are optional: `{ x, y }` on its own means "a disc of
 * `config.radius`", which is what every existing caller passes.
 *
 * `hw` / `hh` are half-extents of the **whole** box, corners included — so a DOM
 * rect maps straight onto them as `width / 2`, `height / 2`, with no adjustment for
 * the radius.
 */
export interface FieldShape {
  x: number;
  y: number;
  /** Half-width of the whole box. Falls back to `config.radius`. */
  hw?: number;
  /** Half-height of the whole box. Falls back to `config.radius`. */
  hh?: number;
  /** Corner radius, clamped to `min(hw, hh)`. Falls back to `config.radius`. */
  r?: number;
}

/**
 * The disc-shaped reading of `FieldShape`, which is all three of the metaball
 * stories ever need. Kept as a name rather than replaced because "ball" is what
 * those stories are about, and `trace(shapes)` would read worse in them.
 */
export type Ball = FieldShape;

export type FieldKind = 'sdf' | 'density';

/**
 * - `dense`: sample every cell of the domain.
 * - `bounded`: sample every cell inside the balls' combined bounding box. The
 *   best a density field can do, and still O(area).
 * - `sparse`: quadtree, culling any node whose centre is farther from the
 *   surface than the node's half-diagonal. Needs a real distance field. O(perimeter).
 */
export type Traversal = 'dense' | 'bounded' | 'sparse';

/**
 * A density field saturates at 0 and 1, so a node's sample value says nothing
 * about how far the nearest edge is — there is no hierarchical cull available.
 * `sparse` therefore degrades to `bounded` for it. Exported so the UI can show
 * what actually ran rather than what was asked for.
 */
export function effectiveTraversal(field: FieldKind, traversal: Traversal): Traversal {
  return traversal === 'sparse' && field === 'density' ? 'bounded' : traversal;
}

export interface TraceConfig {
  field: FieldKind;
  traversal: Traversal;
  /** Domain units per marching-squares cell. Must divide the sampled domain. */
  cell: number;
  radius: number;
  /** Gaussian blur sigma, `density` only. */
  sigma: number;
  /** smin blend radius, `sdf` only. */
  blend: number;
  /** Record visited/culled node rects for the debug overlay. Off during benchmarks. */
  collectCells: boolean;
  /**
   * Distance to inset a second contour, in domain units. `sdf` only, and only up
   * to the `levels` the tracer was constructed with. A distance field's inset is
   * just a different iso value, `-inset`, so the second contour reuses the first
   * one's samples rather than taking its own.
   *
   * Left at 0 (or unset) for a single contour.
   *
   * What that shares is the *samples*, not the *traversal*, and the two
   * traversal families land on opposite sides of the distinction:
   *
   * - `dense` and `bounded` walk a fixed grid, so the second level takes no
   *   sample of its own: ×1.000 field evals, exactly, because it reads corner
   *   values the row buffers already hold. It is *not* free in wall time —
   *   ×1.27 to ×1.43 — because marching squares and loop linking still run
   *   again over every cell. Free in samples, not in work.
   * - `sparse` has to go *find* its contours, and a quadtree's cost is
   *   proportional to the length of what it finds. Two contours is two
   *   perimeters, so it pays in samples too: ×1.31 at cell=8 rising to ×1.72 at
   *   cell=1 on the 4-ball ring, ×1.42 to ×1.70 on two bridged lobes. The exact
   *   figure is a property of the shape — how much inner perimeter it has for its
   *   outer perimeter — so read the trend, not the number. It stays under ×2
   *   because both levels share their ancestor nodes until the tree gets fine
   *   enough to tell them apart, and it climbs toward ×2 as the cell shrinks
   *   because that shared prefix is a fixed number of levels while the leaves
   *   keep doubling.
   *
   * So the inset is nearly free where the walk was already paying for area, and
   * costs about what it adds where the walk was paying for perimeter. Even at
   * the top of that range
   * sparse is far below either dense walk.
   *
   * This is emphatically *not* the same curve a stroke of width `2 * inset`
   * clipped to the shape would draw. A clipped stroke is the surface pushed
   * inward with its topology preserved by construction; a true iso offset can
   * pinch a narrow neck in two and drop a small blob entirely, because at
   * `inset` past the surface there is genuinely nothing left there. Where the
   * two disagree is the interesting part, not an artefact.
   */
  inset?: number;
}

export interface LoopRange {
  start: number;
  count: number;
  /** 0 for the surface itself, 1 for the contour inset by `TraceConfig.inset`. */
  level: number;
}

export interface TraceStats {
  fieldEvals: number;
  loopCount: number;
  pointCount: number;
  cellsTested: number;
  cellsCulled: number;
  leafCells: number;
  /** 1, or 2 when an `inset` was asked for and the field could honour it. */
  levelsTraced: number;
}

/** Cell rect kinds recorded for the overlay. */
export const CELL_CULLED = 0;
export const CELL_LEAF = 1;

const DENSITY_ISO = 0.4;
/** A blurred disc's alpha falls from ~1 to ~0 across +-3 sigma of its edge. */
const BAND_SIGMAS = 3;
const MAX_OVERLAY_CELLS = 16384;
/**
 * Upper bound on primitives per trace. The field is a linear scan over all of them
 * per sample, so this is a cost ceiling as much as an allocation one — the shape
 * count multiplies every single field evaluation.
 */
const MAX_SHAPES = 64;

/**
 * Floor on the smin blend radius.
 *
 * The fold divides by `blend`: `h = max(blend - |d - di|, 0) / blend`. At exactly 0
 * that is `0 / 0`, so the first fold returns NaN and the entire field follows —
 * every sample NaN, no iso crossings, an empty contour and no error. A caller
 * sliding "how much do these merge" down to nothing is asking for no merging, not
 * for a poisoned field, so it is clamped rather than rejected.
 */
const MIN_BLEND = 1e-6;

/**
 * Granularity the sampled domain must be a multiple of, and the largest quadtree
 * root the forest will use.
 *
 * `traverseSparse` derives its root size as `nx & -nx` — the largest power of two
 * dividing the grid width — because a quadtree has to subdivide evenly. That works
 * silently until the domain stops being chosen and starts being *derived* from
 * something arbitrary, like an element's measured width, at which point it fails
 * just as silently:
 *
 * | region | domain | nx  | tile | roots   |
 * | -----: | -----: | --: | ---: | ------: |
 * |    640 |    896 | 448 |   64 |      49 |
 * |    734 |    990 | 495 |  **1** | **245,025** |
 * |    990 |   1246 | 623 |  **1** | **388,129** |
 *
 * An odd `nx` gives `tile = 1`, which makes every root a leaf: the walk degenerates
 * into a flat scan of the entire domain *plus* a wasted centre probe per cell —
 * strictly worse than `dense`, and it turns the quadtree's headline win into a loss
 * without erroring. See archive/2026-07-metasurface-dom-field.
 *
 * 256 is divisible by every supported cell size, so padding to it keeps `nx` a
 * multiple of 32 at the coarsest cell and 256 at the finest.
 */
export const QUADTREE_TILE = 256;

/**
 * Smallest view size that keeps the quadtree healthy for a region of `required`
 * domain units, assuming an overscan that is itself a multiple of `QUADTREE_TILE / 2`.
 *
 * Pad the domain; do not fit it. The padding is close to free precisely because the
 * traversal that needs it is the one whose cost follows the contour rather than the
 * area — an empty quadrant is one centre probe and a cull. It also means a
 * non-square region can use a square domain sized to its longer side without
 * paying for the difference, which is what lets one tracer serve any aspect ratio.
 */
export function quadtreeSafeView(required: number): number {
  return Math.max(QUADTREE_TILE, Math.ceil(required / QUADTREE_TILE) * QUADTREE_TILE);
}

/**
 * Quadratic smin is a Lipschitz *bound*, not exactly 1-Lipschitz, so the
 * quadtree cull radius gets a little slack. Verified against the dense
 * traversal by `runSweep`'s agreement check.
 */
const CULL_SAFETY = 1.1;

export class ContourTracer {
  /** Size of the visible, interactive box. Caller coordinates run `0..view`. */
  readonly view: number;
  /** Margin sampled beyond every side of the view. */
  readonly overscan: number;
  /** Total sampled extent, `view + 2 * overscan`. */
  readonly traced: number;
  /** Domain coordinate of the sampling grid's first corner, `-overscan`. */
  readonly origin: number;

  /** How many iso levels this instance can trace at once. 1 unless asked for more. */
  readonly levels: number;

  /**
   * Size of the quadtree roots this domain yields at `cell`, in cells.
   *
   * Exposed because the degeneration it guards against is silent — a value of 1
   * means every root is a leaf and `sparse` has become a flat scan with an extra
   * probe per cell. Tests assert on it; `quadtreeSafeView` is how a caller avoids
   * needing to.
   */
  quadtreeTileFor(cell: number): number {
    const nx = Math.round(this.traced / cell);
    return nx & -nx;
  }

  // --- geometry output ---
  /** Interleaved xy of every contour vertex, indexed by the values in `ordered`. */
  readonly pointXY: Float32Array;
  /** Vertex indices, loops laid end to end. Slice with `loops`. */
  readonly ordered: Int32Array;
  loops: LoopRange[] = [];

  // --- overlay output ---
  /**
   * Interleaved x, y, width, height, kind per recorded region. Quadtree nodes
   * are square; the `bounded` traversal's single box is not.
   */
  readonly cellRects: Float32Array;
  cellRectCount = 0;

  // --- config, held as fields so the hot loops read them without argument passing ---
  private kind: FieldKind = 'sdf';
  private radius = 60;
  private blend = 40;
  /** `sigma * BAND_SIGMAS`; the only form of sigma the hot loop needs. */
  private band = 36;
  private collectCells = false;

  /**
   * Shapes flattened into parallel typed arrays once per `trace`, rather than read
   * off objects inside the sample loop.
   *
   * The loop runs hundreds of thousands of times per frame, and every optional
   * field on `FieldShape` would otherwise be a property lookup plus a nullish
   * check on each iteration. Resolving the defaults once moves that off the hot
   * path entirely — and the arrays are what let the disc fast path below branch on
   * a value that is uniform across the whole set, so it predicts perfectly.
   */
  private shapeCount = 0;
  private readonly shapeX: Float64Array;
  private readonly shapeY: Float64Array;
  private readonly shapeHW: Float64Array;
  private readonly shapeHH: Float64Array;
  private readonly shapeR: Float64Array;
  /** `hw === hh === r`, i.e. the shape is a plain disc and can skip the box maths. */
  private readonly shapeIsDisc: Uint8Array;

  // --- scratch, allocated once ---
  private readonly rowA: Float32Array;
  private readonly rowB: Float32Array;
  private readonly cornerVal: Float32Array;
  private readonly cornerGen: Int32Array;
  private readonly edgePoint: Int32Array;
  private readonly edgeGen: Int32Array;
  private readonly nextPoint: Int32Array;
  private readonly seen: Uint8Array;
  /** Which iso level emitted each vertex, so `linkLoops` can tag the loops it finds. */
  private readonly pointLevel: Uint8Array;
  private readonly segFrom: Int32Array;
  private readonly segTo: Int32Array;
  private readonly stack: Int32Array;

  private generation = 0;
  /** Edge-cache stride between levels. An edge holds one vertex *per iso*. */
  private readonly edgeStride: number;
  /** Iso value per level for the current trace; length is `activeLevels`. */
  private readonly isoLevels: Float64Array;
  private activeLevels = 1;
  private nx = 0;
  private evals = 0;
  private pointCount = 0;
  private segCount = 0;
  private cellsTested = 0;
  private cellsCulled = 0;
  private leafCells = 0;

  /**
   * @param view Size of the (square) visible box in domain units.
   * @param overscan Margin sampled beyond each side of the view. Must exceed how
   *   far the iso surface can reach past a ball centre, or contours that run off
   *   the frame come back open.
   * @param minCell Smallest cell size that will ever be requested; sizes the buffers.
   * @param levels How many iso levels a single trace may extract. Each one needs
   *   its own vertex per grid edge — the corner *samples* are shared, but the
   *   interpolation along an edge lands somewhere different for every iso — so
   *   this multiplies the edge cache and is opt-in rather than always 2.
   */
  constructor(view: number, overscan: number, minCell: number, levels = 1) {
    this.view = view;
    this.overscan = overscan;
    this.traced = view + 2 * overscan;
    this.origin = -overscan;
    this.levels = levels;

    const maxNx = Math.round(this.traced / minCell);
    const corners = (maxNx + 1) * (maxNx + 1);
    const maxPoints = Math.min(corners, 1 << 18);

    this.rowA = new Float32Array(maxNx + 1);
    this.rowB = new Float32Array(maxNx + 1);
    this.cornerVal = new Float32Array(corners);
    this.cornerGen = new Int32Array(corners);
    this.edgeStride = corners * 2;
    this.edgePoint = new Int32Array(this.edgeStride * levels);
    this.edgeGen = new Int32Array(this.edgeStride * levels);
    this.isoLevels = new Float64Array(levels);
    this.pointXY = new Float32Array(maxPoints * 2);
    this.ordered = new Int32Array(maxPoints);
    this.nextPoint = new Int32Array(maxPoints);
    this.seen = new Uint8Array(maxPoints);
    this.pointLevel = new Uint8Array(maxPoints);
    this.segFrom = new Int32Array(maxPoints * 2);
    this.segTo = new Int32Array(maxPoints * 2);
    this.cellRects = new Float32Array(MAX_OVERLAY_CELLS * 5);
    this.shapeX = new Float64Array(MAX_SHAPES);
    this.shapeY = new Float64Array(MAX_SHAPES);
    this.shapeHW = new Float64Array(MAX_SHAPES);
    this.shapeHH = new Float64Array(MAX_SHAPES);
    this.shapeR = new Float64Array(MAX_SHAPES);
    this.shapeIsDisc = new Uint8Array(MAX_SHAPES);
    // Depth-first quadtree stack: (i, j, size) triples. It starts loaded with
    // every root of the forest (see `traverseSparse`), and each level descended
    // replaces one triple with four, so a root-to-leaf path adds 3 per level.
    const tile = maxNx & -maxNx;
    const roots = (maxNx / tile) ** 2;
    this.stack = new Int32Array(3 * (roots + 3 * (Math.log2(tile) + 2)));
  }

  // ---------------------------------------------------------------- fields

  /**
   * Exact signed distance to shape `i`'s rounded box.
   *
   * ```
   * q = |p - c| - halfExtent + r
   * d = min(max(q.x, q.y), 0) + length(max(q, 0)) - r
   * ```
   *
   * Exact rather than a bound, and `|∇d| = 1` almost everywhere — better behaved
   * than the smooth-min that combines these, which is only Lipschitz-bounded and is
   * what `CULL_SAFETY` exists for.
   *
   * With `hw = hh = r` the half-extent cancels: `q = |p - c|`, whose components are
   * non-negative, so `min(max(q.x, q.y), 0)` is 0 and the whole thing reduces to
   * `length(p - c) - r`. That identity is why discs need no branch here for
   * correctness — the fast path in `density` is purely about skipping a sqrt.
   */
  private shapeDistance(i: number, x: number, y: number): number {
    const r = this.shapeR[i] ?? 0;
    const qx = Math.abs(x - (this.shapeX[i] ?? 0)) - (this.shapeHW[i] ?? 0) + r;
    const qy = Math.abs(y - (this.shapeY[i] ?? 0)) - (this.shapeHH[i] ?? 0) + r;
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.sqrt(outsideX * outsideX + outsideY * outsideY) - r;
  }

  /** Sum of blurred shapes. Saturates at 1, so it is flat almost everywhere. */
  private density(x: number, y: number): number {
    this.evals++;
    const band = this.band;
    let s = 0;
    for (let i = 0; i < this.shapeCount; i++) {
      let sd: number;
      if (this.shapeIsDisc[i] === 1) {
        // A disc can reject on squared distance and skip the sqrt entirely, which
        // is the early-out the archived density timings were measured with. Kept
        // rather than folded into the general path for exactly that reason.
        const r = this.shapeR[i] ?? 0;
        const dx = x - (this.shapeX[i] ?? 0);
        const dy = y - (this.shapeY[i] ?? 0);
        const d2 = dx * dx + dy * dy;
        const reach = r + band;
        if (d2 >= reach * reach) continue;
        sd = Math.sqrt(d2) - r;
      } else {
        sd = this.shapeDistance(i, x, y);
        if (sd >= band) continue;
      }
      const t = sd / band;
      if (t <= -1) {
        s += 1;
      } else {
        // smootherstep, flipped: a cheap stand-in for 0.5*erfc((d-R)/(sigma*sqrt2))
        const u = (t + 1) * 0.5;
        s += 1 - u * u * u * (u * (u * 6 - 15) + 10);
      }
      if (s >= 1) return 1;
    }
    return s;
  }

  /** Quadratic smooth-min over the shapes' SDFs. Returns a distance in domain units. */
  private sdf(x: number, y: number): number {
    this.evals++;
    const k = this.blend;
    let d = 1e9;
    for (let i = 0; i < this.shapeCount; i++) {
      const di = this.shapeDistance(i, x, y);
      const h = Math.max(k - Math.abs(d - di), 0) / k;
      d = Math.min(d, di) - h * h * k * 0.25;
    }
    return d;
  }

  private sample(x: number, y: number): number {
    return this.kind === 'sdf' ? this.sdf(x, y) : this.density(x, y);
  }

  private get iso(): number {
    return this.kind === 'sdf' ? 0 : DENSITY_ISO;
  }

  /**
   * How many levels an `inset` request can actually be honoured at, and what iso
   * each one sits on. Loads `isoLevels` as a side effect.
   *
   * An inset is only meaningful on a distance field: level 1 sits at `-inset`,
   * which *is* the set of points exactly `inset` inside the surface, because the
   * field's value is that distance. On a density field the same arithmetic gives
   * a band whose width follows the local gradient instead — wide where the blur
   * is flat, hairline where it is steep — so the request is refused rather than
   * answered with a plausible wrong shape. `insetSupported` reports which
   * happened so the UI can say so.
   */
  private loadIsoLevels(inset: number | undefined): number {
    this.isoLevels[0] = this.iso;
    if (inset === undefined || inset <= 0 || this.levels < 2 || this.kind !== 'sdf') return 1;
    this.isoLevels[1] = this.iso - inset;
    return 2;
  }

  /** Whether an `inset` would be honoured for the field last traced. */
  get insetSupported(): boolean {
    return this.kind === 'sdf' && this.levels >= 2;
  }

  /**
   * How far past a shape's own outline the surface can still sit — the margin the
   * caller's `overscan` has to cover beyond the shapes' bounding box.
   *
   * For `density` it is exact: past `3 * sigma` outside a shape every contribution
   * is 0, so the sum cannot reach the iso. For `sdf` it is a bound rather than the
   * reachable maximum — each smin fold subtracts at most `blend / 4` and the
   * accumulation converges on `blend` from below, so 12 coincident shapes reach
   * `0.76 * blend`.
   *
   * Stated as a margin rather than as `radius + margin` because a shape now carries
   * its own extent. For a disc, `hw` *is* the radius, so the bounding box already
   * includes it and the two readings agree exactly — which is what keeps the
   * archived overscan figures valid.
   */
  private get influence(): number {
    return this.kind === 'sdf' ? this.blend : this.band;
  }

  /**
   * Resolves `FieldShape` defaults into the flat arrays the sample loops read.
   *
   * `r` is clamped to `min(hw, hh)`: a larger corner radius than the box has room
   * for makes the distance formula report a shape that bulges outside its own
   * extent, which would then escape the bounding box `bounded` and `sparse` derive
   * from and get silently clipped.
   */
  private loadShapes(shapes: readonly FieldShape[]): void {
    const fallback = this.radius;
    const count = Math.min(shapes.length, MAX_SHAPES);
    for (let i = 0; i < count; i++) {
      const shape = shapes[i];
      if (shape === undefined) continue;
      const hw = shape.hw ?? fallback;
      const hh = shape.hh ?? fallback;
      const r = Math.min(shape.r ?? fallback, hw, hh);
      this.shapeX[i] = shape.x;
      this.shapeY[i] = shape.y;
      this.shapeHW[i] = hw;
      this.shapeHH[i] = hh;
      this.shapeR[i] = r;
      this.shapeIsDisc[i] = hw === r && hh === r ? 1 : 0;
    }
    this.shapeCount = count;
  }

  /** Axis-aligned bounds of every shape, grown by `influence`. Empty when there are none. */
  private shapeBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.shapeCount === 0) return null;
    const margin = this.influence;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.shapeCount; i++) {
      const x = this.shapeX[i] ?? 0;
      const y = this.shapeY[i] ?? 0;
      const hw = (this.shapeHW[i] ?? 0) + margin;
      const hh = (this.shapeHH[i] ?? 0) + margin;
      if (x - hw < minX) minX = x - hw;
      if (y - hh < minY) minY = y - hh;
      if (x + hw > maxX) maxX = x + hw;
      if (y + hh > maxY) maxY = y + hh;
    }
    return { minX, minY, maxX, maxY };
  }

  // ---------------------------------------------------------------- entry

  trace(shapes: readonly FieldShape[], config: TraceConfig): TraceStats {
    this.kind = config.field;
    this.radius = config.radius;
    this.blend = Math.max(config.blend, MIN_BLEND);
    this.band = config.sigma * BAND_SIGMAS;
    this.collectCells = config.collectCells;
    // Before anything reads a shape: `loadShapes` resolves the optional fields
    // against `config.radius`, so it has to run after the config is in place.
    this.loadShapes(shapes);
    this.activeLevels = this.loadIsoLevels(config.inset);

    this.nx = Math.round(this.traced / config.cell);
    this.generation++;
    this.evals = 0;
    this.pointCount = 0;
    this.segCount = 0;
    this.cellsTested = 0;
    this.cellsCulled = 0;
    this.leafCells = 0;
    this.cellRectCount = 0;

    const traversal = effectiveTraversal(this.kind, config.traversal);

    if (traversal === 'sparse') {
      this.traverseSparse(config.cell);
    } else {
      this.traverseDense(config.cell, traversal === 'bounded');
    }

    this.linkLoops();

    return {
      fieldEvals: this.evals,
      loopCount: this.loops.length,
      pointCount: this.ordered.length > 0 ? this.totalOrdered : 0,
      cellsTested: this.cellsTested,
      cellsCulled: this.cellsCulled,
      leafCells: this.leafCells,
      levelsTraced: this.activeLevels,
    };
  }

  private totalOrdered = 0;

  // ---------------------------------------------------------------- traversal

  private traverseDense(cell: number, bounded: boolean): void {
    const nx = this.nx;
    const origin = this.origin;
    let i0 = 0;
    let i1 = nx;
    let j0 = 0;
    let j1 = nx;

    const bounds = bounded ? this.shapeBounds() : null;
    if (bounds !== null) {
      i0 = Math.max(0, Math.floor((bounds.minX - origin) / cell));
      j0 = Math.max(0, Math.floor((bounds.minY - origin) / cell));
      i1 = Math.min(nx, Math.ceil((bounds.maxX - origin) / cell));
      j1 = Math.min(nx, Math.ceil((bounds.maxY - origin) / cell));
      if (this.collectCells) {
        this.pushCellRect(origin + i0 * cell, origin + j0 * cell, (i1 - i0) * cell, (j1 - j0) * cell, CELL_LEAF);
      }
    }

    if (i1 <= i0 || j1 <= j0) return;

    const width = i1 - i0 + 1;
    let top = this.rowA;
    let bot = this.rowB;
    for (let i = 0; i < width; i++) {
      top[i] = this.sample(origin + (i0 + i) * cell, origin + j0 * cell);
    }

    const levels = this.activeLevels;
    for (let j = j0; j < j1; j++) {
      const y1 = origin + (j + 1) * cell;
      for (let i = 0; i < width; i++) {
        bot[i] = this.sample(origin + (i0 + i) * cell, y1);
      }
      for (let i = 0; i < width - 1; i++) {
        const v00 = top[i] ?? 0;
        const v10 = top[i + 1] ?? 0;
        const v11 = bot[i + 1] ?? 0;
        const v01 = bot[i] ?? 0;
        // Every level reads the same four corner values. The row buffers above
        // are the only place samples are taken, so a second iso adds marching
        // squares and nothing else — the `field evals` stat does not move.
        for (let level = 0; level < levels; level++) {
          this.cellSegments(i0 + i, j, cell, v00, v10, v11, v01, this.isoLevels[level] ?? 0, level);
        }
        this.cellsTested++;
      }
      const swap = top;
      top = bot;
      bot = swap;
    }
    this.leafCells = this.cellsTested;
  }

  private traverseSparse(cell: number): void {
    const nx = this.nx;
    const origin = this.origin;
    const levels = this.activeLevels;
    const stack = this.stack;

    // A quadtree needs power-of-two roots, and the overscan margin makes the
    // sampled domain no longer a power of two itself (512 + 2 * 128 = 768). So
    // the walk starts from a forest of the largest power-of-two tile that
    // divides the grid — 3x3 tiles of 256 — instead of one root covering
    // everything. Costs one extra eval per tile, all of which the cull test
    // rejects immediately for tiles the shape is nowhere near.
    const tile = nx & -nx;
    const tiles = nx / tile;
    let sp = 0;
    for (let tj = 0; tj < tiles; tj++) {
      for (let ti = 0; ti < tiles; ti++) {
        stack[sp++] = ti * tile;
        stack[sp++] = tj * tile;
        stack[sp++] = tile;
      }
    }

    while (sp > 0) {
      const size = stack[--sp] ?? 0;
      const j = stack[--sp] ?? 0;
      const i = stack[--sp] ?? 0;

      const sizePx = size * cell;
      const x = origin + i * cell;
      const y = origin + j * cell;
      const d = this.sdf(x + sizePx * 0.5, y + sizePx * 0.5);
      this.cellsTested++;

      // Centre is farther from every iso surface than the node's half-diagonal,
      // so the whole node is on one side of all of them. With an inset level the
      // node has to clear *both* to be discarded — the reach that matters is the
      // nearest iso, not iso 0 — otherwise the cull punches holes in the inner
      // contour exactly where the outer one is far away.
      const reach = sizePx * Math.SQRT1_2 * CULL_SAFETY;
      let nearest = Infinity;
      for (let level = 0; level < levels; level++) {
        const distance = Math.abs(d - (this.isoLevels[level] ?? 0));
        if (distance < nearest) nearest = distance;
      }
      if (nearest > reach) {
        this.cellsCulled++;
        if (this.collectCells) this.pushCellRect(x, y, sizePx, sizePx, CELL_CULLED);
        continue;
      }

      if (size === 1) {
        this.leafCells++;
        if (this.collectCells) this.pushCellRect(x, y, sizePx, sizePx, CELL_LEAF);
        const v00 = this.corner(i, j, cell);
        const v10 = this.corner(i + 1, j, cell);
        const v11 = this.corner(i + 1, j + 1, cell);
        const v01 = this.corner(i, j + 1, cell);
        for (let level = 0; level < levels; level++) {
          this.cellSegments(i, j, cell, v00, v10, v11, v01, this.isoLevels[level] ?? 0, level);
        }
        continue;
      }

      const h = size >> 1;
      stack[sp++] = i;
      stack[sp++] = j;
      stack[sp++] = h;
      stack[sp++] = i + h;
      stack[sp++] = j;
      stack[sp++] = h;
      stack[sp++] = i;
      stack[sp++] = j + h;
      stack[sp++] = h;
      stack[sp++] = i + h;
      stack[sp++] = j + h;
      stack[sp++] = h;
    }
  }

  /** Memoised corner sample; quadtree leaves share corners with their neighbours. */
  private corner(i: number, j: number, cell: number): number {
    const idx = j * (this.nx + 1) + i;
    if (this.cornerGen[idx] === this.generation) return this.cornerVal[idx] ?? 0;
    const v = this.sample(this.origin + i * cell, this.origin + j * cell);
    this.cornerVal[idx] = v;
    this.cornerGen[idx] = this.generation;
    return v;
  }

  private pushCellRect(x: number, y: number, width: number, height: number, kind: number): void {
    if (this.cellRectCount >= MAX_OVERLAY_CELLS) return;
    const o = this.cellRectCount * 5;
    this.cellRects[o] = x;
    this.cellRects[o + 1] = y;
    this.cellRects[o + 2] = width;
    this.cellRects[o + 3] = height;
    this.cellRects[o + 4] = kind;
    this.cellRectCount++;
  }

  // ---------------------------------------------------------------- marching squares

  /**
   * Emits oriented segments for one cell. Complementary cases run in opposite
   * directions so that the segments chain into consistently wound loops.
   */
  private cellSegments(
    i: number,
    j: number,
    cell: number,
    v00: number,
    v10: number,
    v11: number,
    v01: number,
    iso: number,
    level: number
  ): void {
    let code = 0;
    if (v00 > iso) code |= 1;
    if (v10 > iso) code |= 2;
    if (v11 > iso) code |= 4;
    if (v01 > iso) code |= 8;
    if (code === 0 || code === 15) return;

    const stride = this.nx + 1;
    const x0 = this.origin + i * cell;
    const y0 = this.origin + j * cell;
    const x1 = x0 + cell;
    const y1 = y0 + cell;
    // One vertex per (edge, iso). Two isos cross the same grid edge at different
    // points, so the level has to be part of the cache key — sharing it would
    // graft the inner contour onto the outer one's vertices.
    const base = level * this.edgeStride;

    const top = () => this.edgeVertex(base + 2 * (j * stride + i), x0, y0, x1, y0, v00, v10, iso, level);
    const bottom = () => this.edgeVertex(base + 2 * ((j + 1) * stride + i), x0, y1, x1, y1, v01, v11, iso, level);
    const left = () => this.edgeVertex(base + 2 * (j * stride + i) + 1, x0, y0, x0, y1, v00, v01, iso, level);
    const right = () => this.edgeVertex(base + 2 * (j * stride + i + 1) + 1, x1, y0, x1, y1, v10, v11, iso, level);

    switch (code) {
      case 1:
        this.emit(left(), top());
        break;
      case 14:
        this.emit(top(), left());
        break;
      case 2:
        this.emit(top(), right());
        break;
      case 13:
        this.emit(right(), top());
        break;
      case 3:
        this.emit(left(), right());
        break;
      case 12:
        this.emit(right(), left());
        break;
      case 4:
        this.emit(right(), bottom());
        break;
      case 11:
        this.emit(bottom(), right());
        break;
      case 6:
        this.emit(top(), bottom());
        break;
      case 9:
        this.emit(bottom(), top());
        break;
      case 7:
        this.emit(left(), bottom());
        break;
      case 8:
        this.emit(bottom(), left());
        break;
      // Saddles. Either resolution is defensible; this one matches the
      // orientation of the single-corner cases above.
      case 5:
        this.emit(left(), top());
        this.emit(right(), bottom());
        break;
      case 10:
        this.emit(top(), right());
        this.emit(bottom(), left());
        break;
      default:
        break;
    }
  }

  /** One vertex per grid edge per iso, shared between the two cells that touch it. */
  private edgeVertex(
    id: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    va: number,
    vb: number,
    iso: number,
    level: number
  ): number {
    if (this.edgeGen[id] === this.generation) return this.edgePoint[id] ?? 0;
    const t = (iso - va) / (vb - va);
    const p = this.pointCount++;
    this.pointXY[p * 2] = ax + (bx - ax) * t;
    this.pointXY[p * 2 + 1] = ay + (by - ay) * t;
    this.pointLevel[p] = level;
    this.edgePoint[id] = p;
    this.edgeGen[id] = this.generation;
    return p;
  }

  private emit(from: number, to: number): void {
    this.segFrom[this.segCount] = from;
    this.segTo[this.segCount] = to;
    this.segCount++;
  }

  // ---------------------------------------------------------------- loop linking

  private linkLoops(): void {
    const n = this.pointCount;
    this.loops = [];
    this.totalOrdered = 0;
    if (n === 0) return;

    this.nextPoint.fill(-1, 0, n);
    this.seen.fill(0, 0, n);
    for (let s = 0; s < this.segCount; s++) {
      const from = this.segFrom[s] ?? 0;
      this.nextPoint[from] = this.segTo[s] ?? -1;
    }

    let write = 0;
    for (let p = 0; p < n; p++) {
      if (this.seen[p] === 1) continue;
      const start = write;
      let q = p;
      while (q !== -1 && this.seen[q] !== 1) {
        this.seen[q] = 1;
        this.ordered[write++] = q;
        q = this.nextPoint[q] ?? -1;
      }
      const count = write - start;
      // Two-vertex "loops" are marching-squares noise, not geometry.
      if (count > 2) {
        // Segments never join vertices from different isos, so a chain is wholly
        // one level and its first vertex names it.
        this.loops.push({ start, count, level: this.pointLevel[p] ?? 0 });
      } else {
        write = start;
      }
    }
    this.totalOrdered = write;
  }
}
