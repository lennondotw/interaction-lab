/**
 * Contour extraction for metaball-style shapes, in two flavours:
 *
 * - `density`: what `sdf-effect` actually renders. A sum of gaussian-blurred
 *   discs, thresholded at 0.4 (matching `feColorMatrix values="... 20 -8"`).
 *   Saturates at 0 and 1, so it carries no distance information away from the
 *   edge — you can only ever scan it densely.
 * - `sdf`: a real signed distance field, `smin` over per-circle distances.
 *   The value is a distance in pixels everywhere, which lets a quadtree cull
 *   whole regions that provably cannot contain the surface.
 *
 * The point of having both behind one interface is that the extracted contour
 * is identical; only the cost of getting there differs.
 *
 * The sampled domain is deliberately larger than the box the caller works in.
 * Ball centres are confined to the view, but the shape around a centre is not —
 * it reaches `radius + max(blend, 3 * sigma)` further out — so a centre parked
 * on the frame would put half its contour outside a view-sized grid, marching
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

export interface Ball {
  x: number;
  y: number;
}

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
   * - `dense` and `bounded` walk a fixed grid, so the second level is exactly
   *   free — measured at ×1.000 field evals, because it reads corner values the
   *   row buffers already hold and only redoes the per-edge interpolation.
   * - `sparse` has to go *find* its contours, and a quadtree's cost is
   *   proportional to the length of what it finds. Two contours is two
   *   perimeters: ×1.66 at cell=4 rising to ×1.83 at cell=1. It stays under ×2
   *   because both levels share their ancestor nodes until the tree gets fine
   *   enough to tell them apart, and it climbs toward ×2 as the cell shrinks
   *   because that shared prefix is a fixed number of levels while the leaves
   *   keep doubling.
   *
   * So the inset is free where the walk was already paying for area, and costs
   * about what it adds where the walk was paying for perimeter. Even at ×1.83
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
  private balls: readonly Ball[] = [];
  private kind: FieldKind = 'sdf';
  private radius = 60;
  private blend = 40;
  /** `sigma * BAND_SIGMAS`; the only form of sigma the hot loop needs. */
  private band = 36;
  private influence2 = 0;
  private collectCells = false;

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
    // Depth-first quadtree stack: (i, j, size) triples. It starts loaded with
    // every root of the forest (see `traverseSparse`), and each level descended
    // replaces one triple with four, so a root-to-leaf path adds 3 per level.
    const tile = maxNx & -maxNx;
    const roots = (maxNx / tile) ** 2;
    this.stack = new Int32Array(3 * (roots + 3 * (Math.log2(tile) + 2)));
  }

  // ---------------------------------------------------------------- fields

  /** Sum of blurred discs. Saturates at 1, so it is flat almost everywhere. */
  private density(x: number, y: number): number {
    this.evals++;
    let s = 0;
    for (const b of this.balls) {
      const dx = x - b.x;
      const dy = y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= this.influence2) continue;
      const t = (Math.sqrt(d2) - this.radius) / this.band;
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

  /** Quadratic smooth-min over circle SDFs. Returns a distance in domain units. */
  private sdf(x: number, y: number): number {
    this.evals++;
    const k = this.blend;
    let d = 1e9;
    for (const b of this.balls) {
      const dx = x - b.x;
      const dy = y - b.y;
      const di = Math.sqrt(dx * dx + dy * dy) - this.radius;
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
   * Radius beyond which a ball cannot influence the contour, and so also the
   * furthest the surface can sit from the nearest centre — which is what the
   * caller's `overscan` has to cover.
   *
   * For `density` it is exact: past `radius + 3 * sigma` every disc contributes
   * exactly 0, so the sum cannot reach the iso. For `sdf` it is a bound rather
   * than the reachable maximum — each smin fold subtracts at most `blend / 4`
   * and the accumulation converges on `blend` from below, so 12 coincident
   * balls reach `radius + 0.76 * blend`.
   */
  private get influence(): number {
    return this.kind === 'sdf' ? this.radius + this.blend : this.radius + this.band;
  }

  // ---------------------------------------------------------------- entry

  trace(balls: readonly Ball[], config: TraceConfig): TraceStats {
    this.balls = balls;
    this.kind = config.field;
    this.radius = config.radius;
    this.blend = config.blend;
    this.band = config.sigma * BAND_SIGMAS;
    this.influence2 = this.influence * this.influence;
    this.collectCells = config.collectCells;
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

    if (bounded && this.balls.length > 0) {
      const inf = this.influence;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const b of this.balls) {
        if (b.x - inf < minX) minX = b.x - inf;
        if (b.y - inf < minY) minY = b.y - inf;
        if (b.x + inf > maxX) maxX = b.x + inf;
        if (b.y + inf > maxY) maxY = b.y + inf;
      }
      i0 = Math.max(0, Math.floor((minX - origin) / cell));
      j0 = Math.max(0, Math.floor((minY - origin) / cell));
      i1 = Math.min(nx, Math.ceil((maxX - origin) / cell));
      j1 = Math.min(nx, Math.ceil((maxY - origin) / cell));
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
