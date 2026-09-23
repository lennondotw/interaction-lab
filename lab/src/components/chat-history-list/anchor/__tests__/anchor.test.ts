/**
 * Anchoring against a real core. Screen positions are offset-relative: a row's anchor point is
 * at (start + ratio * size) - offset on screen, and the reference line at ratio * viewport size.
 */

import { describe, expect, it } from 'vitest';

import { createVirtualCore } from '../../virtual-core/virtual-core.js';
import { captureAnchor, resolveAnchor } from '../anchor.js';

/** Ten rows of 100px: row n spans n*100..(n+1)*100. */
function core100() {
  const core = createVirtualCore({ estimateSize: () => 100 });
  core.setKeys(Array.from({ length: 10 }, (_, index) => `r${index}`));
  return core;
}

const screenPoint = (core: ReturnType<typeof core100>, key: string, ratio: number, offset: number) => {
  const item = core.item(core.indexOf(key)!);
  return item.start + ratio * item.size - offset;
};

describe('captureAnchor', () => {
  it('ranks the row under the reference line first, then by distance', () => {
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 200, size: 300 }, 0.5);
    // The line is at 350: r3 contains it; r2 and r4 are 50px away, r2 first by order on a tie.
    expect(snapshot.candidates.slice(0, 3).map((candidate) => candidate.key)).toEqual(['r3', 'r2', 'r4']);
  });

  it.each([
    [0, 'r3', 'the row starting at the line'],
    [1, 'r2', 'the row ending at the line'],
    [0.5, 'r2', 'the earlier row when both points are equally far'],
  ])('ratio %s on a row boundary prefers %s: %s', (ratio, key) => {
    const core = core100();
    // The line lands on 300, the boundary between r2 and r3, whatever the ratio.
    const snapshot = captureAnchor(core, { offset: 300 - ratio * 200, size: 200 }, ratio);
    expect(snapshot.candidates[0]?.key).toBe(key);
  });

  it('records each candidate relative to the reference line at the same ratio of the row', () => {
    const core = core100();
    const top = captureAnchor(core, { offset: 250, size: 300 }, 0);
    expect(top.candidates[0]).toEqual({ key: 'r2', fromLine: -50 });
    const bottom = captureAnchor(core, { offset: 250, size: 300 }, 1);
    expect(bottom.candidates[0]).toEqual({ key: 'r5', fromLine: 50 });
  });

  it('includes rows within the margin around the viewport', () => {
    const core = core100();
    const keys = captureAnchor(core, { offset: 400, size: 200 }, 0, 100).candidates.map((candidate) => candidate.key);
    expect(keys.toSorted()).toEqual(['r3', 'r4', 'r5', 'r6']);
  });

  it('rejects a ratio outside 0..1', () => {
    expect(() => captureAnchor(core100(), { offset: 0, size: 100 }, 1.5)).toThrow(RangeError);
    expect(() => captureAnchor(core100(), { offset: 0, size: 100 }, Number.NaN)).toThrow(RangeError);
  });
});

describe('resolveAnchor', () => {
  it('keeps the anchor still when rows are prepended above it', () => {
    const core = core100();
    const viewport = { offset: 350, size: 300 };
    const before = screenPoint(core, 'r3', 0, viewport.offset);
    const snapshot = captureAnchor(core, viewport, 0);
    core.setKeys(['p0', 'p1', ...core.keys]);
    const resolved = resolveAnchor(snapshot, core, viewport.size)!;
    expect(resolved).toEqual({ key: 'r3', offset: 550 });
    expect(screenPoint(core, 'r3', 0, resolved.offset)).toBe(before);
  });

  it('needs no compensation when rows change below the anchor', () => {
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 350, size: 300 }, 0);
    core.measure('r8', 500);
    expect(resolveAnchor(snapshot, core, 300)?.offset).toBe(350);
  });

  it.each([
    [0, 'the top edge stays and the growth goes down', 0],
    [0.5, 'the middle stays and the growth splits', 50],
    [1, 'the bottom edge stays and the growth goes up', 100],
  ])('ratio %s: when the anchor row grows, %s', (ratio, _description, shift) => {
    const core = core100();
    const viewport = { offset: 350, size: 300 };
    const snapshot = captureAnchor(core, viewport, ratio);
    const key = snapshot.candidates[0]!.key;
    core.measure(key, 200);
    expect(resolveAnchor(snapshot, core, viewport.size)?.offset).toBe(viewport.offset + shift);
  });

  it.each([
    [0, 0],
    [0.5, -100],
    [1, -200],
  ])('ratio %s: shrinking the viewport by 200px moves the offset by %s', (ratio, shift) => {
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 400, size: 400 }, ratio);
    expect(resolveAnchor(snapshot, core, 200)?.offset).toBe(400 - shift);
  });

  it('keeps the bottom of the viewport still under bottom anchoring when it shrinks', () => {
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 400, size: 400 }, 1);
    const resolved = resolveAnchor(snapshot, core, 200)!;
    expect(resolved.offset + 200).toBe(400 + 400);
  });

  it('falls back to the next candidate when the anchor row is removed', () => {
    const core = core100();
    const viewport = { offset: 350, size: 300 };
    const snapshot = captureAnchor(core, viewport, 0);
    const [first, second] = snapshot.candidates;
    const secondBefore = screenPoint(core, second!.key, 0, viewport.offset);
    core.setKeys(core.keys.filter((key) => key !== first!.key));
    const resolved = resolveAnchor(snapshot, core, viewport.size)!;
    expect(resolved.key).toBe(second!.key);
    expect(screenPoint(core, second!.key, 0, resolved.offset)).toBe(secondBefore);
  });

  it('anchors a row that is not mounted, as long as its key is in the window', () => {
    // The core has no notion of mounting: any key in the window resolves.
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 0, size: 1000 }, 1, 0);
    expect(snapshot.candidates[0]?.key).toBe('r9');
    core.measure('r0', 300);
    expect(resolveAnchor(snapshot, core, 1000)?.offset).toBe(200);
  });

  it('returns null when every candidate left the window', () => {
    const core = core100();
    const snapshot = captureAnchor(core, { offset: 350, size: 300 }, 0);
    core.setKeys(['elsewhere-0', 'elsewhere-1']);
    expect(resolveAnchor(snapshot, core, 300)).toBeNull();
  });

  it('returns null for a snapshot taken with nothing in range', () => {
    const empty = createVirtualCore({ estimateSize: () => 100 });
    const snapshot = captureAnchor(empty, { offset: 0, size: 300 }, 0);
    expect(snapshot.candidates).toEqual([]);
    expect(resolveAnchor(snapshot, core100(), 300)).toBeNull();
  });
});
