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
  /** Domain units per marching-squares cell. Must divide `domain` into a power of two. */
  cell: number;
  radius: number;
  /** Gaussian blur sigma, `density` only. */
  sigma: number;
  /** smin blend radius, `sdf` only. */
  blend: number;
  /** Record visited/culled node rects for the debug overlay. Off during benchmarks. */
  collectCells: boolean;
}

export interface LoopRange {
  start: number;
  count: number;
}

export interface TraceStats {
  fieldEvals: number;
  loopCount: number;
  pointCount: number;
  cellsTested: number;
  cellsCulled: number;
  leafCells: number;
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
  readonly domain: number;

  // --- geometry output ---
  /** Interleaved xy of every contour vertex, indexed by the values in `ordered`. */
  readonly pointXY: Float32Array;
  /** Vertex indices, loops laid end to end. Slice with `loops`. */
  readonly ordered: Int32Array;
  loops: LoopRange[] = [];

  // --- overlay output ---
  /** Interleaved x, y, size, kind per recorded quadtree node. */
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
  private readonly segFrom: Int32Array;
  private readonly segTo: Int32Array;
  private readonly stack: Int32Array;

  private generation = 0;
  private nx = 0;
  private evals = 0;
  private pointCount = 0;
  private segCount = 0;
  private cellsTested = 0;
  private cellsCulled = 0;
  private leafCells = 0;

  /**
   * @param domain Size of the (square) sampling domain in domain units.
   * @param minCell Smallest cell size that will ever be requested; sizes the buffers.
   */
  constructor(domain: number, minCell: number) {
    this.domain = domain;
    const maxNx = Math.round(domain / minCell);
    const corners = (maxNx + 1) * (maxNx + 1);
    const maxPoints = Math.min(corners, 1 << 18);

    this.rowA = new Float32Array(maxNx + 1);
    this.rowB = new Float32Array(maxNx + 1);
    this.cornerVal = new Float32Array(corners);
    this.cornerGen = new Int32Array(corners);
    this.edgePoint = new Int32Array(corners * 2);
    this.edgeGen = new Int32Array(corners * 2);
    this.pointXY = new Float32Array(maxPoints * 2);
    this.ordered = new Int32Array(maxPoints);
    this.nextPoint = new Int32Array(maxPoints);
    this.seen = new Uint8Array(maxPoints);
    this.segFrom = new Int32Array(maxPoints * 2);
    this.segTo = new Int32Array(maxPoints * 2);
    this.cellRects = new Float32Array(MAX_OVERLAY_CELLS * 4);
    // Depth-first quadtree stack: (i, j, size) triples. Depth is log2(maxNx),
    // and each level pushes at most 4, so this is a generous bound.
    this.stack = new Int32Array(3 * 4 * (Math.log2(maxNx) + 2));
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

  /** Radius beyond which a ball cannot influence the contour. */
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

    this.nx = Math.round(this.domain / config.cell);
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
    };
  }

  private totalOrdered = 0;

  // ---------------------------------------------------------------- traversal

  private traverseDense(cell: number, bounded: boolean): void {
    const nx = this.nx;
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
      i0 = Math.max(0, Math.floor(minX / cell));
      j0 = Math.max(0, Math.floor(minY / cell));
      i1 = Math.min(nx, Math.ceil(maxX / cell));
      j1 = Math.min(nx, Math.ceil(maxY / cell));
      if (this.collectCells) {
        this.pushCellRect(i0 * cell, j0 * cell, (i1 - i0) * cell, CELL_LEAF);
      }
    }

    if (i1 <= i0 || j1 <= j0) return;

    const width = i1 - i0 + 1;
    let top = this.rowA;
    let bot = this.rowB;
    for (let i = 0; i < width; i++) {
      top[i] = this.sample((i0 + i) * cell, j0 * cell);
    }

    const iso = this.iso;
    for (let j = j0; j < j1; j++) {
      const y1 = (j + 1) * cell;
      for (let i = 0; i < width; i++) {
        bot[i] = this.sample((i0 + i) * cell, y1);
      }
      for (let i = 0; i < width - 1; i++) {
        this.cellSegments(i0 + i, j, cell, top[i] ?? 0, top[i + 1] ?? 0, bot[i + 1] ?? 0, bot[i] ?? 0, iso);
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
    const iso = this.iso;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    stack[sp++] = 0;
    stack[sp++] = nx;

    while (sp > 0) {
      const size = stack[--sp] ?? 0;
      const j = stack[--sp] ?? 0;
      const i = stack[--sp] ?? 0;

      const sizePx = size * cell;
      const d = this.sdf((i + size * 0.5) * cell, (j + size * 0.5) * cell);
      this.cellsTested++;

      // Centre is farther from the surface than the node's half-diagonal, so
      // the whole node is strictly inside or strictly outside.
      if (Math.abs(d) > sizePx * Math.SQRT1_2 * CULL_SAFETY) {
        this.cellsCulled++;
        if (this.collectCells) this.pushCellRect(i * cell, j * cell, sizePx, CELL_CULLED);
        continue;
      }

      if (size === 1) {
        this.leafCells++;
        if (this.collectCells) this.pushCellRect(i * cell, j * cell, sizePx, CELL_LEAF);
        this.cellSegments(
          i,
          j,
          cell,
          this.corner(i, j, cell),
          this.corner(i + 1, j, cell),
          this.corner(i + 1, j + 1, cell),
          this.corner(i, j + 1, cell),
          iso
        );
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
    const v = this.sample(i * cell, j * cell);
    this.cornerVal[idx] = v;
    this.cornerGen[idx] = this.generation;
    return v;
  }

  private pushCellRect(x: number, y: number, size: number, kind: number): void {
    if (this.cellRectCount >= MAX_OVERLAY_CELLS) return;
    const o = this.cellRectCount * 4;
    this.cellRects[o] = x;
    this.cellRects[o + 1] = y;
    this.cellRects[o + 2] = size;
    this.cellRects[o + 3] = kind;
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
    iso: number
  ): void {
    let code = 0;
    if (v00 > iso) code |= 1;
    if (v10 > iso) code |= 2;
    if (v11 > iso) code |= 4;
    if (v01 > iso) code |= 8;
    if (code === 0 || code === 15) return;

    const stride = this.nx + 1;
    const x0 = i * cell;
    const y0 = j * cell;
    const x1 = x0 + cell;
    const y1 = y0 + cell;

    const top = () => this.edgeVertex(2 * (j * stride + i), x0, y0, x1, y0, v00, v10, iso);
    const bottom = () => this.edgeVertex(2 * ((j + 1) * stride + i), x0, y1, x1, y1, v01, v11, iso);
    const left = () => this.edgeVertex(2 * (j * stride + i) + 1, x0, y0, x0, y1, v00, v01, iso);
    const right = () => this.edgeVertex(2 * (j * stride + i + 1) + 1, x1, y0, x1, y1, v10, v11, iso);

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

  /** One vertex per grid edge, shared between the two cells that touch it. */
  private edgeVertex(
    id: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    va: number,
    vb: number,
    iso: number
  ): number {
    if (this.edgeGen[id] === this.generation) return this.edgePoint[id] ?? 0;
    const t = (iso - va) / (vb - va);
    const p = this.pointCount++;
    this.pointXY[p * 2] = ax + (bx - ax) * t;
    this.pointXY[p * 2 + 1] = ay + (by - ay) * t;
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
        this.loops.push({ start, count });
      } else {
        write = start;
      }
    }
    this.totalOrdered = write;
  }
}
