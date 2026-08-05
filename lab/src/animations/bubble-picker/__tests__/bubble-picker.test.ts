import { describe, expect, it } from 'vitest';

import { MIN_GAP, SELECTED_SCALE, VERTICAL_PAD } from '../constants.js';
import { buildBubbleItems, buildBubbleLabels } from '../demo-items.js';
import { hitTest } from '../hit-test.js';
import { layoutSettle } from '../physics/layout-settle.js';
import { isClusterAtRest } from '../physics/rest-detector.js';
import { stepRuntime, stepScaleOnly } from '../physics/step-runtime.js';
import { BUBBLE_PALETTES } from '../render/palette.js';

const VIEWPORT_HEIGHT = 600;
const FRAME = 1 / 60;

/** Indexed read that fails the test loudly instead of asserting non-null. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`expected an element at index ${index}`);
  return value;
}

/** Deterministic LCG so a settle is reproducible without touching Math.random. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function settleCluster(count = 8) {
  const items = buildBubbleItems(count);
  return layoutSettle({
    ids: items.map((i) => i.id),
    labels: items.map((i) => i.label),
    viewportHeight: VIEWPORT_HEIGHT,
    rng: seededRng(42),
  });
}

describe('demo items', () => {
  it('are stable for the fixed seed', () => {
    expect(buildBubbleLabels(5)).toEqual(buildBubbleLabels(5));
  });

  it('never exceed two words', () => {
    for (const label of buildBubbleLabels(30)) {
      expect(label.split(/\s+/).length).toBeLessThanOrEqual(2);
    }
  });

  it('are unique', () => {
    const labels = buildBubbleLabels(30);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('layoutSettle', () => {
  it('leaves no overlapping pair', () => {
    const { bubbles } = settleCluster(12);
    for (const [i, a] of bubbles.entries()) {
      for (const b of bubbles.slice(i + 1)) {
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        // PBD enforces gap + per-bubble slack; assert at least the hard rims.
        expect(d).toBeGreaterThanOrEqual(a.radius + b.radius + MIN_GAP - 0.001);
      }
    }
  });

  it('keeps every bubble inside the vertical band', () => {
    for (const b of settleCluster(12).bubbles) {
      expect(b.pos.y - b.radius).toBeGreaterThanOrEqual(VERTICAL_PAD - 0.001);
      expect(b.pos.y + b.radius).toBeLessThanOrEqual(VIEWPORT_HEIGHT - VERTICAL_PAD + 0.001);
    }
  });

  it('anchors restPos to the settled position', () => {
    for (const b of settleCluster().bubbles) {
      expect(b.restPos).toEqual(b.pos);
      expect(b.scale).toBe(1);
    }
  });

  it('rejects an ids / labels length mismatch', () => {
    expect(() => layoutSettle({ ids: ['a', 'b'], labels: ['only-one'], viewportHeight: VIEWPORT_HEIGHT })).toThrow(
      /mismatch/
    );
  });
});

describe('selection easing', () => {
  it('grows a selected bubble toward SELECTED_SCALE', () => {
    const { bubbles } = settleCluster();
    const target = at(bubbles, 0);
    const selected = new Set([target.id]);

    for (let frame = 0; frame < 120; frame++) {
      stepRuntime(bubbles, selected, { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }

    expect(target.scale).toBeCloseTo(SELECTED_SCALE, 3);
    // Everyone else stays at rest scale.
    for (const b of bubbles.slice(1)) expect(b.scale).toBeCloseTo(1, 3);
  });

  it('shrinks back after deselection', () => {
    const { bubbles } = settleCluster();
    const target = at(bubbles, 0);

    for (let frame = 0; frame < 120; frame++) {
      stepRuntime(bubbles, new Set([target.id]), { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }
    for (let frame = 0; frame < 240; frame++) {
      stepRuntime(bubbles, new Set(), { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }

    expect(target.scale).toBeCloseTo(1, 3);
  });

  it('still eases scale while paused, so taps stay legible', () => {
    const { bubbles } = settleCluster();
    const target = at(bubbles, 0);
    const before = { ...target.pos };

    for (let frame = 0; frame < 120; frame++) {
      stepScaleOnly(bubbles, new Set([target.id]), FRAME);
    }

    expect(target.scale).toBeCloseTo(SELECTED_SCALE, 3);
    // Paused means the integrator never ran — position is untouched.
    expect(target.pos).toEqual(before);
  });
});

describe('isClusterAtRest', () => {
  it('is true for a freshly settled, unselected cluster', () => {
    expect(isClusterAtRest(settleCluster().bubbles, new Set())).toBe(true);
  });

  it('goes false the moment a selection changes the scale target', () => {
    const { bubbles } = settleCluster();
    expect(isClusterAtRest(bubbles, new Set([at(bubbles, 0).id]))).toBe(false);
  });

  it('stays false while a selection is held', () => {
    // A popped bubble's grown radius keeps its neighbours shoved off their
    // anchors for as long as it stays selected, so the cluster never goes
    // quiet — the detector is what keeps physics running under the pop.
    const { bubbles } = settleCluster();
    const selected = new Set([at(bubbles, 0).id]);
    for (let frame = 0; frame < 600; frame++) {
      stepRuntime(bubbles, selected, { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }
    expect(isClusterAtRest(bubbles, selected)).toBe(false);
  });

  it('returns to true once the selection is released and the cluster springs home', () => {
    const { bubbles } = settleCluster();
    for (let frame = 0; frame < 120; frame++) {
      stepRuntime(bubbles, new Set([at(bubbles, 0).id]), { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }
    for (let frame = 0; frame < 1200; frame++) {
      stepRuntime(bubbles, new Set(), { width: 1200, height: VIEWPORT_HEIGHT }, FRAME);
    }
    expect(isClusterAtRest(bubbles, new Set())).toBe(true);
  });
});

describe('hitTest', () => {
  it('hits a bubble at its anchored centre and misses far outside', () => {
    const { bubbles } = settleCluster();
    const target = at(bubbles, 3);
    expect(hitTest(bubbles, target.pos.x, target.pos.y)?.id).toBe(target.id);
    expect(hitTest(bubbles, -500, -500)).toBeNull();
  });

  it('grows the hit area with the selected scale', () => {
    const { bubbles } = settleCluster();
    const target = at(bubbles, 3);
    const justOutside = target.pos.x + target.radius + 1;

    expect(hitTest(bubbles, justOutside, target.pos.y)?.id).not.toBe(target.id);
    target.scale = SELECTED_SCALE;
    expect(hitTest(bubbles, justOutside, target.pos.y)?.id).toBe(target.id);
  });
});

describe('palette', () => {
  it('has a distinct resting label colour per scheme', () => {
    expect(BUBBLE_PALETTES.light.idleLabelFill).not.toBe(BUBBLE_PALETTES.dark.idleLabelFill);
    // Both schemes cross-fade to the same white on selection.
    expect(BUBBLE_PALETTES.light.selectedLabelFill).toBe(BUBBLE_PALETTES.dark.selectedLabelFill);
  });
});
