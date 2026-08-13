/**
 * The presentation table's claims, pinned down.
 *
 * These are the invariants that a careless edit survives and that show up
 * later as a view stranded off-screen, or as parallax under a fade — none
 * of which a DOM-less suite could catch any other way.
 */

import { describe, expect, it } from 'vitest';

import {
  AT_REST,
  coveredPose,
  DEFAULT_PRESENTATION,
  FADE_TRANSITION,
  isInstant,
  NAVIGATION_SPRING,
  NO_TRANSITION,
  offscreenPose,
  presentationTransition,
  reducedPresentation,
  resolvePresentation,
  type NavigationPresentation,
  type ViewPose,
} from '../navigation-presentation.js';

const ALL: NavigationPresentation[] = ['slide', 'cover', 'fade', 'instant'];

describe('poses are total', () => {
  // The load-bearing one. Motion does not reset a key that disappears from
  // an `animate` target, it abandons it at its last value — so if `slide`
  // omitted `y`, a view that arrived by `cover` and was then covered by a
  // `slide` would stay a full container height down the screen forever.
  const isTotal = (pose: ViewPose): boolean =>
    typeof pose.x === 'string' &&
    typeof pose.y === 'string' &&
    typeof pose.opacity === 'number' &&
    typeof pose.dim === 'number';

  it.each(ALL)('offscreenPose(%s) writes every axis', (presentation) => {
    expect(isTotal(offscreenPose(presentation))).toBe(true);
  });

  it.each(ALL)('coveredPose(%s) writes every axis', (presentation) => {
    expect(isTotal(coveredPose(presentation))).toBe(true);
  });

  it('states offsets in the same unit it comes to rest in', () => {
    // `0` and `'-30%'` in one target makes motion convert between px and
    // percent, which costs a layout read mid-transition. Everything is a
    // percentage of the container, including the origin.
    for (const pose of [AT_REST, ...ALL.map(offscreenPose), ...ALL.map(coveredPose)]) {
      expect(pose.x).toMatch(/%$/);
      expect(pose.y).toMatch(/%$/);
    }
  });
});

describe('offscreenPose', () => {
  it('sends a slide out to the trailing edge and a cover down past the bottom', () => {
    expect(offscreenPose('slide')).toMatchObject({ x: '100%', y: '0%' });
    expect(offscreenPose('cover')).toMatchObject({ x: '0%', y: '100%' });
  });

  it('moves nothing for a fade — it is a dissolve in place', () => {
    expect(offscreenPose('fade')).toMatchObject({ x: '0%', y: '0%', opacity: 0 });
  });

  it('leaves an instant view exactly where it comes to rest', () => {
    expect(offscreenPose('instant')).toEqual(AT_REST);
  });
});

describe('coveredPose', () => {
  it('parks a view back only when a slide covers it', () => {
    expect(coveredPose('slide').x).not.toBe('0%');
    for (const presentation of ['cover', 'fade', 'instant'] as const) {
      expect(coveredPose(presentation).x).toBe('0%');
    }
  });

  it('never dims the view under a fade', () => {
    // The covered view is visible *through* the one dissolving over it for
    // the whole transition, so dimming it reads as the background going
    // dark mid-fade rather than as depth.
    expect(coveredPose('fade').dim).toBe(0);
    for (const presentation of ['slide', 'cover', 'instant'] as const) {
      expect(coveredPose(presentation).dim).toBeGreaterThan(0);
    }
  });

  it('keeps a covered view fully opaque, whatever covers it', () => {
    // Dimming is a scrim on top, never the view's own opacity — fading the
    // view itself would show the container through the stack.
    for (const presentation of ALL) expect(coveredPose(presentation).opacity).toBe(1);
  });
});

describe('NAVIGATION_SPRING', () => {
  it('is critically damped', () => {
    const { damping, mass, stiffness } = NAVIGATION_SPRING as { damping: number; mass: number; stiffness: number };

    // A damping ratio of exactly 1: the fastest approach to the target that
    // does not pass it. Retune `stiffness` without re-deriving `damping` and
    // the screen bounces past its own edge — and the parallax layer behind
    // it bounces too.
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness * mass), 6);
  });

  it('settles in around a fifth of a second', () => {
    const { mass, stiffness } = NAVIGATION_SPRING as { mass: number; stiffness: number };

    // At critical damping the envelope decays as e^(−ωt) with ω = √(k/m), so
    // four time constants is within 2% of the target. A guard on the order of
    // magnitude: this is a whole screen moving, not a disclosure.
    const settleMs = (4 / Math.sqrt(stiffness / mass)) * 1000;

    expect(settleMs).toBeGreaterThan(120);
    expect(settleMs).toBeLessThan(320);
  });
});

describe('presentationTransition', () => {
  it('springs a slide and a cover on the same curve', () => {
    // They are the same gesture on two axes; two curves would read as two
    // different kinds of event.
    expect(presentationTransition('slide')).toBe(NAVIGATION_SPRING);
    expect(presentationTransition('cover')).toBe(NAVIGATION_SPRING);
  });

  it('tweens a fade over a fixed window instead', () => {
    // A spring's long tail would leave the arriving view imperceptibly
    // transparent for most of the transition.
    expect(presentationTransition('fade')).toBe(FADE_TRANSITION);
    expect(FADE_TRANSITION.type).toBeUndefined();
  });

  it('gives an instant view no window at all', () => {
    expect(presentationTransition('instant')).toBe(NO_TRANSITION);
    expect(NO_TRANSITION.duration).toBe(0);
  });
});

describe('reducedPresentation', () => {
  it('takes the displacement out and keeps the dissolve', () => {
    // Not `instant`: an opacity change is the accepted substitute for motion
    // rather than another instance of it, and cutting hard between screens
    // throws away the only cue that a navigation happened.
    expect(reducedPresentation('slide')).toBe('fade');
    expect(reducedPresentation('cover')).toBe('fade');
    expect(reducedPresentation('fade')).toBe('fade');
    expect(reducedPresentation(undefined)).toBe('fade');
  });

  it('leaves an instant view instant', () => {
    // Giving it a 200ms fade would be adding motion in the name of removing
    // it — the author already asked for none.
    expect(reducedPresentation('instant')).toBe('instant');
  });

  it('only ever returns a presentation that displaces nothing', () => {
    // The guard on the whole point: every reduced result must come to rest
    // where it started on both axes.
    for (const presentation of ALL) {
      const reduced = reducedPresentation(presentation);
      expect(offscreenPose(reduced)).toMatchObject({ x: '0%', y: '0%' });
      expect(coveredPose(reduced)).toMatchObject({ x: '0%', y: '0%' });
    }
  });
});

describe('resolvePresentation', () => {
  it('slides when a view says nothing', () => {
    expect(resolvePresentation(undefined)).toBe(DEFAULT_PRESENTATION);
    expect(DEFAULT_PRESENTATION).toBe('slide');
  });

  it('treats an unspecified presentation as animated', () => {
    // `NavigationContent` shortcuts an instant view in both directions —
    // skipping its entrance and dropping it without an exit. Defaulting the
    // other way would silently un-animate every view that omits the field.
    expect(isInstant(undefined)).toBe(false);
    expect(isInstant('instant')).toBe(true);
  });
});
