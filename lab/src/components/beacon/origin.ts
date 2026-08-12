/**
 * Beacon coordinate origin — the reference point a beacon's position is
 * measured against.
 *
 * The default frame is the container's top-left corner, which is the
 * obvious choice and the wrong one for anything the layout centres. A
 * horizontally-centred element's distance from the left edge is a
 * function of the container's width, so shrinking the window *is* a
 * change of position in that frame: the follower's spring is handed a
 * moving target and trails behind it for as long as the drag lasts.
 * Nothing about the element moved — the frame did.
 *
 * An origin fixes that by naming a fraction along each axis, used
 * twice:
 *
 * - on the **container**, it picks where the coordinate zero sits;
 * - on the **beacon's own box**, it picks which point of the beacon the
 *   coordinate refers to.
 *
 * So `0.5` reads as "the beacon's centre, offset from the container's
 * centre" — and a centred element reports a constant `0` at every
 * container width. The spring has nothing to chase, so there is no lag
 * to tune away. Choose the fraction that matches how the element is
 * actually laid out: `'start'` for something pinned to the left/top
 * edge, `'center'` for a centred column, `'end'` for a bottom bar. A
 * centre origin on a left-pinned element re-introduces exactly the lag
 * it removes elsewhere.
 *
 * The two axes are independent, and usually differ: the common page is
 * `{ x: 'center', y: 'start' }` — centred horizontally, flowing from
 * the top.
 *
 * Using the same fraction for both roles couples one more thing: the
 * anchor point is what stays still while the size spring runs, so a
 * centre origin makes the follower grow from its centre rather than
 * from its top-left. For a centred element that is the point — it stays
 * centred for the whole animation, not just at the ends.
 *
 * Precision: `offsetLeft` / `offsetTop` and `clientWidth` /
 * `clientHeight` are all integers, while layout positions elements at
 * fractional pixels, so a beacon's reported coordinate carries up to
 * half a pixel of rounding residue and wobbles between `0` and `±0.5`
 * across a drag. Measured in every frame, not just the centre one — a
 * corner-pinned beacon in a container of odd height reports the same
 * ±0.5 for the same reason. It is the price of `offset*`'s
 * transform-immunity (see `layout-offset.ts`), it is a spring input a
 * hundred times smaller than the lag the frame removes, and it is
 * invisible once smoothed.
 */

/**
 * Fraction along one axis. `'start'` = 0 (left / top edge), `'center'`
 * = 0.5, `'end'` = 1 (right / bottom edge). Arbitrary numbers are
 * allowed — `0.25` is a legitimate origin if that is where the layout
 * pins things — and are not clamped.
 */
export type BeaconOriginAxis = 'start' | 'center' | 'end' | number;

/** Per-axis origin. An omitted axis inherits the provider's default. */
export interface BeaconOrigin {
  x?: BeaconOriginAxis;
  y?: BeaconOriginAxis;
}

/** A {@link BeaconOrigin} with both axes resolved to fractions. */
export interface ResolvedBeaconOrigin {
  x: number;
  y: number;
}

/** Container top-left — the frame beacons used before origins existed. */
export const BEACON_ORIGIN_START: ResolvedBeaconOrigin = { x: 0, y: 0 };

const NAMED_FRACTION: Record<'start' | 'center' | 'end', number> = {
  start: 0,
  center: 0.5,
  end: 1,
};

export function resolveBeaconOriginAxis(axis: BeaconOriginAxis): number {
  return typeof axis === 'number' ? axis : NAMED_FRACTION[axis];
}

/** Resolve both axes, falling back per axis so `{ x: 'center' }` is a valid partial override. */
export function resolveBeaconOrigin(
  origin: BeaconOrigin | undefined,
  fallback: ResolvedBeaconOrigin
): ResolvedBeaconOrigin {
  if (!origin) return fallback;
  return {
    x: origin.x === undefined ? fallback.x : resolveBeaconOriginAxis(origin.x),
    y: origin.y === undefined ? fallback.y : resolveBeaconOriginAxis(origin.y),
  };
}

/** Extent of the box the origin fraction is taken along. */
export interface BeaconOriginFrame {
  width: number;
  height: number;
}

/**
 * Read the extent CSS percentages resolve against for the follower.
 *
 * The follower places itself at `left: f%` / `top: f%`, so the
 * measurement side has to subtract the *same* number the browser will
 * add back — the containing block's padding box for an absolutely
 * positioned follower (`clientWidth` / `clientHeight`, which excludes a
 * classic scrollbar exactly as percentage resolution does), or the
 * viewport for a fixed one. Getting this from the same source the
 * renderer uses is why the origin term costs no observer: both sides
 * read it in the frame they are already measuring in, so they cannot
 * disagree by a frame.
 */
export function readBeaconOriginFrame(container: HTMLElement | null): BeaconOriginFrame {
  if (container) return { width: container.clientWidth, height: container.clientHeight };
  const root = document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}

export interface BeaconBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convert a container-relative top-left box into origin-frame
 * coordinates: the box's origin point, offset from the frame's origin
 * point.
 */
export function toBeaconOriginFrame(
  box: BeaconBox,
  frame: BeaconOriginFrame,
  origin: ResolvedBeaconOrigin
): { x: number; y: number } {
  return {
    x: box.left + origin.x * (box.width - frame.width),
    y: box.top + origin.y * (box.height - frame.height),
  };
}

/**
 * Re-express a coordinate so it names the same visual position in a
 * different origin frame.
 *
 * Needed exactly once: when a follower hands over to a beacon whose
 * origin differs from the one its springs are currently expressed in.
 * Without the conversion the springs' held value would be reinterpreted
 * under the new frame's CSS percentages and the surface would jump by
 * `Δf · (w − W)` on the swap. `size` is the follower's *current* (spring)
 * size, not the incoming target's — the conversion has to preserve where
 * the surface is right now.
 */
export function reframeBeaconCoordinate(
  value: { x: number; y: number },
  size: BeaconOriginFrame,
  frame: BeaconOriginFrame,
  from: ResolvedBeaconOrigin,
  to: ResolvedBeaconOrigin
): { x: number; y: number } {
  return {
    x: value.x + (to.x - from.x) * (size.width - frame.width),
    y: value.y + (to.y - from.y) * (size.height - frame.height),
  };
}

/** CSS percentage for an origin fraction, for the follower's `left` / `top` / `translate`. */
export function beaconOriginPercent(fraction: number): string {
  return `${fraction * 100}%`;
}
