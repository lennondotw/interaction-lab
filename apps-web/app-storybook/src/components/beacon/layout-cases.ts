/**
 * The layout-change cases the beacon observation cascade is measured against,
 * plus the stage they all run on.
 *
 * Self-resize is the easy vector, and it is one case here. The rest are the ones
 * that motivated the cascade: changes that move an element *without resizing
 * anything*. A sibling appears beside it; a flex property flips on its parent;
 * a scroll container scrolls. No browser API reports "my position changed", so
 * each of those is either caught sideways or not at all.
 *
 * One stage covers every case, and every case starts from the same reset state.
 * Cases mutate through **direct inline style writes** rather than React state:
 * the mutation has to land at a known instant with no render between it and the
 * next frame, and at the DOM level a style write is indistinguishable from the
 * class swap or re-render an app would do.
 *
 * Kept apart from the harness component so both this list and the runner can be
 * imported without dragging a component along.
 */

import { nextFrame, sleep } from './layout-trace.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Stage geometry. Fixed, and inline at the use site: these numbers are the
 * instrument. The row is a fixed width so `justify-content` / `padding`
 * mutations move the target without resizing any ancestor, and centred inside
 * the stage so a viewport change moves it in container-relative coordinates.
 * ──────────────────────────────────────────────────────────────────────────── */

export const STAGE_HEIGHT = 240;
export const ROW_WIDTH = 420;
export const TARGET_WIDTH = 120;
export const TARGET_HEIGHT = 48;
export const SIBLING_WIDTH = 96;
export const SCROLL_ROOM = 360;
export const TRACE_HEIGHT = 250;

export interface StageNodes {
  stage: HTMLDivElement;
  scroller: HTMLDivElement;
  wrap: HTMLDivElement;
  row: HTMLDivElement;
  target: HTMLDivElement;
}

/**
 * Re-applied before every run, so no case can inherit another's mutations.
 *
 * `flex-start` is the resting state rather than `center` so that most cases need
 * no `setup` at all. A setup is itself a layout change, and a layout change made
 * while the source that would catch it is ablated leaves the beacon wrong before
 * the case has even started — a failure billed to the wrong line.
 */
export const resetStage = (n: StageNodes): void => {
  n.scroller.style.position = 'static';
  n.scroller.scrollTop = 0;
  n.wrap.style.transform = 'none';
  n.row.style.justifyContent = 'flex-start';
  n.row.style.paddingLeft = '12px';
  n.target.style.width = `${String(TARGET_WIDTH)}px`;
  n.target.style.height = `${String(TARGET_HEIGHT)}px`;
  n.target.style.marginLeft = '0px';
  n.row.querySelectorAll('[data-sibling]').forEach((el) => {
    el.remove();
  });
};

/** Logged verbatim as the `setup` line — the state the baseline was taken in. */
export const describeStage = (n: StageNodes): string =>
  [
    `stage ${String(Math.round(n.stage.clientWidth))}×${String(n.stage.clientHeight)}`,
    `scroller ${n.scroller.style.position} top=${String(n.scroller.scrollTop)}`,
    `wrap transform=${n.wrap.style.transform}`,
    `row ${String(ROW_WIDTH)} justify=${n.row.style.justifyContent} padL=${n.row.style.paddingLeft}`,
    `target ${n.target.style.width}×${n.target.style.height} marginL=${n.target.style.marginLeft}`,
    `siblings=${String(n.row.querySelectorAll('[data-sibling]').length)}`,
  ].join(' · ');

const makeSibling = (): HTMLDivElement => {
  const el = document.createElement('div');
  el.dataset.sibling = 'true';
  el.style.width = `${String(SIBLING_WIDTH)}px`;
  el.style.height = `${String(TARGET_HEIGHT)}px`;
  el.style.flex = 'none';
  el.style.borderRadius = '4px';
  el.style.background = 'color-mix(in oklab, currentColor 12%, transparent)';
  return el;
};

export interface LayoutCase {
  id: string;
  /** The layout-change vector, in two or three words. */
  vector: string;
  /** What changes, spelled out. Logged as the `mutate` line. */
  mutation: string;
  /** Which source is expected to be the one that catches it. */
  expect: string;
  /** Applied before the baseline, unsampled — arranges the stage for the case. */
  setup?: (n: StageNodes) => void;
  /** The single layout change under test. Sampled per frame. */
  apply: (n: StageNodes) => Promise<void> | void;
  /** Extra sampling after `apply` returns, in ms. */
  tail?: number;
  /** What a driver outside the page has to do during the sampling window. */
  external?: string;
}

/** Scrolls a fixed distance one frame at a time, so the Δ series is readable. */
const scrollOverFrames = async (n: StageNodes): Promise<void> => {
  for (let i = 1; i <= 10; i++) {
    n.scroller.scrollTop = i * 16;
    await nextFrame();
  }
};

export const LAYOUT_CASES: LayoutCase[] = [
  {
    id: 'C1',
    vector: 'self resize · grow',
    mutation: `target width ${String(TARGET_WIDTH)}px → 260px`,
    expect: 'self ResizeObserver',
    apply: (n) => {
      n.target.style.width = '260px';
    },
  },
  {
    id: 'C2',
    vector: 'self resize · shrink',
    mutation: 'target width 260px → 120px, left edge pinned',
    expect: 'self ResizeObserver — an IO frame cannot see a shrink',
    // The only setup that moves anything. An ablated run may miss the grow and
    // start with a non-zero baseline; that is reported, not hidden.
    setup: (n) => {
      n.target.style.width = '260px';
    },
    apply: (n) => {
      n.target.style.width = '120px';
    },
  },
  {
    id: 'C3',
    vector: 'sibling mounts',
    mutation: `insert a ${String(SIBLING_WIDTH)}px sibling before the target`,
    expect: 'IntersectionObserver — nothing resizes, the target just shifts',
    apply: (n) => {
      n.row.insertBefore(makeSibling(), n.target);
    },
  },
  {
    id: 'C4',
    vector: 'flex property',
    mutation: 'row justify-content: flex-start → flex-end',
    expect: 'IntersectionObserver — no box anywhere changes size',
    apply: (n) => {
      n.row.style.justifyContent = 'flex-end';
    },
  },
  {
    id: 'C5',
    vector: 'parent padding',
    mutation: 'row padding-left: 12px → 108px (row width fixed)',
    expect: 'IntersectionObserver — the border-box row keeps its size',
    apply: (n) => {
      n.row.style.paddingLeft = '108px';
    },
  },
  {
    id: 'C6',
    vector: 'own margin',
    mutation: 'target margin-left: 0 → 96px',
    expect: 'IntersectionObserver — the target moves, nothing resizes',
    apply: (n) => {
      n.target.style.marginLeft = '96px';
    },
  },
  {
    id: 'C7',
    vector: 'nested scroll · static',
    mutation: 'scroller scrollTop 0 → 160 over 10 frames',
    expect: 'capture-phase window scroll listener',
    apply: scrollOverFrames,
    // The scroll parks the target outside the stage's clip, which sends
    // `observeLayoutShift` into its 1000ms invisible-element retry. A
    // 500ms tail would stop watching before that retry lands and report
    // a permanent gap where there is a late recovery.
    tail: 1600,
  },
  {
    id: 'C8',
    vector: 'nested scroll · positioned',
    mutation: 'the same scroll, but the scroller is position: relative',
    expect: 'the same listener — but the scroller is now the offsetParent',
    setup: (n) => {
      n.scroller.style.position = 'relative';
    },
    apply: scrollOverFrames,
    tail: 1600,
  },
  {
    id: 'C9',
    vector: 'viewport resize',
    mutation: 'the window narrows, so the centred row moves inside the stage',
    expect: 'window resize listener, or the ancestor RO cascade',
    external: 'narrow the window during the 1.4s sampling window',
    apply: () => sleep(1400),
    tail: 200,
  },
  {
    id: 'C10',
    vector: 'ancestor transform',
    mutation: 'wrap transform: none → translateX(64px)',
    expect: 'nothing — a beacon is a layout anchor, not a visual rect',
    apply: (n) => {
      n.wrap.style.transform = 'translateX(64px)';
    },
  },
];
