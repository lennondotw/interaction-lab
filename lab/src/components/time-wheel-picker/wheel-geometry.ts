/**
 * The geometry of an endlessly looping wheel, as pure functions.
 *
 * Everything the wheel does is derived from one scalar: `offset`, a distance in
 * pixels, where `offset / itemHeight` is the (fractional, unbounded) index sitting
 * on the centre line. Snapping is rounding it. Which item a row shows is a modulo
 * of it. There is no scroll container, no `scrollTop`, and no seam.
 *
 * ## Why the loop is not a DOM concern
 *
 * The native way to make a wheel endless is a tall scroll container that rewrites
 * `scrollTop` by one lap as it approaches either end. That write has to happen
 * *during* momentum, which on iOS Safari either cancels the fling or jumps a frame,
 * and under `scroll-snap-type: mandatory` can provoke a second snap. Growing the
 * buffer to a thousand laps defers the problem rather than removing it.
 *
 * Here the same re-basing exists — {@link rebaseOffset} — but it is provably
 * invisible, so it can wait for a moment when nothing is animating. Subtracting a
 * whole number of laps changes `base` by a multiple of `count`, and `base` only
 * ever reaches the screen through `wrapIndex(base + slot, count)`; `frac` is
 * untouched, so every row's position is untouched too. Same trick as the native
 * recentre, done at rest, which is the only reason it is safe.
 *
 * ## Why `rows` must be odd, and why there are `rows + 1` of them
 *
 * With an even row count there is no centred row, and the resulting half-item
 * error shows up simultaneously in the snap detents, the fade curve and the
 * position of the `:` separator — three symptoms, one cause, hard to see. So
 * {@link assertOddRows} refuses it.
 *
 * The row count follows from the arithmetic rather than from caution. A row at
 * slot `s` has its top edge at `(half + s - frac) * itemHeight`, with
 * `frac ∈ [0, 1)`:
 *
 * - slot `-half` spans `(-itemHeight, 0]`, so its lower part is on screen until
 *   `frac → 1`, at which point slot `-half + 1` has arrived at the top edge. One
 *   row above centre-minus-half is therefore enough, and slot `-half - 1` is
 *   never visible at all.
 * - slot `half + 1` spans `((rows - 1) · itemHeight, rows · itemHeight]`, which
 *   enters the viewport as soon as `frac > 0` — the gap the bottom row leaves.
 *
 * So the slot set is `[-half, half + 1]`: `rows + 1` rows, one more than the
 * viewport is tall, and the extra one is at the bottom.
 *
 * The `rows + 1` rows are hard-clipped by the container's `overflow: hidden`
 * rather than faded out by a mask. That is deliberate: a mask is a decoration
 * that can be turned off, and nothing here may depend on a decoration.
 */

/** Floored modulo. `%` alone keeps the sign of the dividend, which a wrapped index cannot have. */
export const wrapIndex = (index: number, count: number): number => ((index % count) + count) % count;

/** Rows between the centre row and the top of the viewport. `(rows - 1) / 2`. */
export const halfRows = (rows: number): number => (rows - 1) / 2;

/**
 * Guards the one invariant the rest of the module assumes.
 *
 * Thrown rather than rounded, following `useLiquidStretch`: a wheel five and a
 * half rows tall is not a wheel with a cosmetic flaw, it is a wheel whose centre
 * line and snap detents disagree.
 */
export const assertOddRows = (rows: number): void => {
  if (!Number.isInteger(rows) || rows < 1 || rows % 2 === 0) {
    throw new Error(`rows must be an odd positive integer, received ${rows}`);
  }
};

/** Viewport height. The wheel is exactly `rows` items tall, never a rounded-off approximation of it. */
export const viewportHeight = ({ itemHeight, rows }: { itemHeight: number; rows: number }): number => itemHeight * rows;

/** Slot numbers to render, top to bottom. See the module docblock for why it is `rows + 1`. */
export const rowSlots = ({ rows, overscan = 0 }: { rows: number; overscan?: number }): number[] => {
  assertOddRows(rows);
  const half = halfRows(rows);
  const slots: number[] = [];
  for (let slot = -half - overscan; slot <= half + 1 + overscan; slot++) {
    // `-half - overscan` is `-0` for a single-row wheel with no overscan. Legal,
    // but it travels into React keys and test expectations as a distinct value
    // from `0`, so a slot is normalised to only ever be the positive zero.
    slots.push(slot === 0 ? 0 : slot);
  }
  return slots;
};

/**
 * `offset` split into the integer index at or above the centre line and the
 * fraction of a row it has travelled past it. Every row's position and label
 * comes from this pair, which is what keeps them from ever disagreeing.
 */
export const splitOffset = (
  offset: number,
  itemHeight: number
): {
  base: number;
  frac: number;
} => {
  const position = offset / itemHeight;
  const base = Math.floor(position);
  return { base, frac: position - base };
};

/** The offset at which `index` sits exactly on the centre line. */
export const offsetForIndex = (index: number, itemHeight: number): number => index * itemHeight;

/** Which item is selected at this offset. */
export const indexFromOffset = (offset: number, itemHeight: number, count: number): number =>
  wrapIndex(Math.round(offset / itemHeight), count);

/** The nearest offset at which some item sits exactly on the centre line. */
export const nearestDetentOffset = (offset: number, itemHeight: number): number =>
  Math.round(offset / itemHeight) * itemHeight;

/**
 * Whether a pointer has moved far enough to have meant a drag rather than a tap.
 *
 * Three pixels of 2D distance from where the pointer went down, which is Motion's
 * own `PanSession.distanceThreshold` and its `distance2D(info.offset, {x:0, y:0})`
 * test. Matched deliberately: a wheel that decides at a different distance from
 * every other draggable thing on the page is a wheel that feels wrong for reasons
 * nobody can name.
 *
 * The caller must treat the answer as *sticky* — once true for a gesture, true for
 * the rest of it. Re-testing the displacement at release instead would call a drag
 * that wandered out and came back to its origin a tap, and then jump the wheel to
 * whatever row the pointer happened to be resting on.
 */
export const pastDragThreshold = ({
  from,
  to,
  threshold = 3,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  threshold?: number;
}): boolean => Math.hypot(to.x - from.x, to.y - from.y) >= threshold;

/**
 * Where the wheel has to travel for a tapped row to come to the centre.
 *
 * Takes the slot that was tapped and the offset *at the moment of the tap*, not at
 * release: with the wheel following the pointer from its first pixel, the offset can
 * have drifted a couple of pixels by the time the finger lifts, and if that drift
 * crossed an integer the `base` would flip and the tap would land a row out.
 *
 * The correctness of this is worth stating precisely, because it is the reason the
 * caller can get away with a DOM hit-test instead of inverse-projecting a pointer
 * through the drum's perspective transform: `base` here is the same `base` the
 * tapped row used to choose the label it was displaying, so the item that arrives at
 * the centre is *by construction* the item the user pointed at. There is no
 * arithmetic linking the two that could be off by one — it is the same arithmetic.
 */
export const tapTargetOffset = ({
  offsetAtTap,
  slot,
  itemHeight,
}: {
  offsetAtTap: number;
  slot: number;
  itemHeight: number;
}): number => offsetForIndex(splitOffset(offsetAtTap, itemHeight).base + slot, itemHeight);

/**
 * Signed distance from the centre line to the centre of the row at `slot`, in rows.
 *
 * The single primitive both looks are built from: the flat wheel multiplies it by
 * `itemHeight` to get a translation, the drum multiplies it by an angle. Zero is
 * the selected row, positive is below.
 */
export const rowDistance = ({
  slot,
  offset,
  itemHeight,
}: {
  slot: number;
  offset: number;
  itemHeight: number;
}): number => slot - splitOffset(offset, itemHeight).frac;

/** Which item the row at `slot` shows. The whole of the endless loop, in one modulo. */
export const rowIndex = ({
  slot,
  offset,
  itemHeight,
  count,
}: {
  slot: number;
  offset: number;
  itemHeight: number;
  count: number;
}): number => wrapIndex(splitOffset(offset, itemHeight).base + slot, count);

/** Top edge of the row at `slot`, in pixels from the top of the viewport. */
export const rowTop = ({
  slot,
  offset,
  itemHeight,
  rows,
}: {
  slot: number;
  offset: number;
  itemHeight: number;
  rows: number;
}): number => (halfRows(rows) + rowDistance({ slot, offset, itemHeight })) * itemHeight;

/**
 * How much a row is dimmed and shrunk by being away from the centre.
 *
 * The only taste in this module; everything else is forced. Normalised against
 * `half + 1` rather than `half` so the row that is half-clipped at the edge is
 * dim but not gone — with a wireframe there is no mask softening the cut, and a
 * row that vanished before the clip would read as a missing row.
 */
export const rowFade = ({ distance, rows }: { distance: number; rows: number }): { opacity: number; scale: number } => {
  const reach = halfRows(rows) + 1;
  const t = Math.min(Math.abs(distance) / reach, 1);
  return { opacity: 1 - t, scale: 1 - 0.12 * t };
};

/**
 * Radius of the drum, in pixels, for a given angular pitch.
 *
 * `radius = itemHeight / anglePerItem` puts one item's arc length at exactly
 * `itemHeight`, so a drag of one row height advances one index at the centre and
 * compresses away from it — which is why the flat and drum variants can share one
 * interaction engine and differ only in how a row is drawn.
 */
export const drumRadius = ({ itemHeight, anglePerItem }: { itemHeight: number; anglePerItem: number }): number =>
  itemHeight / ((anglePerItem * Math.PI) / 180);

/**
 * Where a row sits on the drum: its rotation about the wheel's axis, and how much
 * of it is facing the viewer.
 *
 * `opacity` is `cos θ` rather than a tuned curve because on a drum the dimming is
 * not a decision — a surface turning edge-on genuinely presents less of itself.
 */
export const drumRow = ({
  distance,
  anglePerItem,
}: {
  distance: number;
  anglePerItem: number;
}): { rotateX: number; opacity: number } => {
  const rotateX = -distance * anglePerItem;
  const radians = (rotateX * Math.PI) / 180;
  return { rotateX, opacity: Math.max(Math.cos(radians), 0) };
};

/**
 * Extra rows a drum needs beyond the flat slot set.
 *
 * The flat wheel renders exactly the rows the viewport can hold, because a row's
 * apparent height there is always `itemHeight`. On a drum the rows away from the
 * centre compress, so the same viewport holds more of them, and the arc keeps
 * going until it turns edge-on at 90°. Stopping at the flat count leaves a visible
 * empty band at the top and bottom of the drum where the wheel should be curving
 * away.
 */
export const drumOverscan = ({ rows, anglePerItem }: { rows: number; anglePerItem: number }): number =>
  Math.max(0, Math.ceil(90 / anglePerItem) - halfRows(rows) - 1);

/**
 * `offset` brought back into the first lap, without moving anything on screen.
 *
 * Safe only while nothing is animating — see the module docblock. Called after a
 * settle so a wheel spun for a minute does not carry an ever-growing offset into
 * float territory where the detents stop landing on exact multiples.
 */
export const rebaseOffset = ({
  offset,
  itemHeight,
  count,
}: {
  offset: number;
  itemHeight: number;
  count: number;
}): number => {
  const lap = itemHeight * count;
  return offset - Math.floor(offset / lap) * lap;
};

/**
 * The offset representing `index` that is closest to where the wheel already is.
 *
 * A controlled wheel told to go from 23 to 0 should travel one row, not
 * twenty-three, and on a loop both readings are correct — so the short way round
 * has to be chosen explicitly.
 */
export const nearestOffsetForIndex = ({
  fromOffset,
  index,
  itemHeight,
  count,
}: {
  fromOffset: number;
  index: number;
  itemHeight: number;
  count: number;
}): number => {
  const lap = itemHeight * count;
  const target = offsetForIndex(wrapIndex(index, count), itemHeight);
  const laps = Math.round((fromOffset - target) / lap);
  return target + laps * lap;
};
