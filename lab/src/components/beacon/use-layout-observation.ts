/**
 * The observation cascade on its own: call `measure` whenever anything that could
 * move `ref` relative to `containerRef` changes.
 *
 * Extracted from `useBeaconAnchor` when a second subject needed the same coverage —
 * a metaball surface whose shape is derived from its participants' laid-out rects
 * has exactly the beacon's failure mode, and worse consequences for it. A beacon
 * that misses a change paints one element in the wrong place; a merged surface that
 * misses one participant reports the wrong *topology*, showing a phantom lobe or
 * dropping a bridge, which does not look obviously wrong and so cannot be caught by
 * eye.
 *
 * Shared rather than copied deliberately. `archive/2026-07-beacon-layout-observation`
 * ablated each source and found that four are near-disjoint and **one was dead** —
 * evidence that this wiring is both load-bearing and capable of silently rotting. A
 * second copy would rot independently, and the probe that found the dead source only
 * watches this one.
 *
 * Kept in the beacon directory because that is where its proof lives: the story and
 * the archived probe that exercise it are here.
 */

import { useEffect, type RefObject } from 'react';

import { observeLayoutShift } from './layout-shift.js';

export interface LayoutObservationOptions {
  /** Set false to unwire everything — used while a subject is disabled. */
  enabled?: boolean;
}

/**
 * `measure` is called once immediately on wiring, then on every observed change. It
 * must be stable across renders (a `useCallback` or a ref-backed function): it is an
 * effect dependency, and an inline closure would tear the whole cascade down and
 * rebuild it on every render.
 */
export function useLayoutObservation(
  ref: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null> | null,
  measure: () => void,
  options: LayoutObservationOptions = {}
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    measure();

    // Observation cascade.
    //
    // There is no single browser API for "this element's position
    // relative to X changed" — every reasonable layout-change vector
    // has to be hooked up explicitly. Covered here:
    //
    // - self resize → `ResizeObserver` on `el`.
    // - sibling / flex redistribution / padding / font-size / class
    //   swap above us → propagates to some ancestor's size, so we
    //   observe every ancestor from `el.parentElement` up to (and
    //   including) the container. A handful of extra `observe()` calls
    //   per subject, each ~nanoseconds and batched to the layout pass.
    // - scroll of any intermediate scroll container → `scroll` on
    //   window with capture catches all descendants (scroll events
    //   don't bubble, but dispatch during capture still reaches window
    //   listeners).
    // - window resize → direct listener.
    // - pure position shifts where no ancestor resizes — e.g. a
    //   conditional sibling mounting into a `justify-center`
    //   fixed-size parent, shifting us up. The RO cascade never fires
    //   here because no observed element's size changes. We use an
    //   `IntersectionObserver` layout-shift trick for this (see
    //   `observeLayoutShift`), the same approach Floating UI takes.
    //   Zero idle cost, fires only when the element actually moves.
    const container = containerRef?.current ?? null;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    {
      // Walk to (and including) the container; if the chain never hits
      // it (cut by a `position: fixed` ancestor, detached element,
      // etc.) we stop at `<body>` — body resize covers the
      // viewport-level flow case.
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        ro.observe(node);
        if (node === container || node === document.body) break;
        node = node.parentElement;
      }
    }
    if (!container) {
      // Without a container the origin frame's extent is
      // `documentElement.clientWidth / clientHeight`, so that box has to be
      // observed even though the walk above stops at `<body>` — a change to it
      // is a change to the beacon's coordinate, and nothing else here is
      // guaranteed to notice.
      //
      // The case is a scrollbar that takes layout width: it comes out of the
      // ICB without resizing any ancestor, and `resize` does not fire for it.
      // Measured with real classic scrollbars, the layout-shift observer
      // happens to cover *one* direction — its frame insets are computed
      // against the ICB, so shrinking the viewport pushes the frame off the
      // element and fires, while growing it back leaves the element still
      // fully inside and silent. That left a permanent half-a-scrollbar error
      // on the way out (7.5px of a 15px bar) for any centre origin.
      ro.observe(document.documentElement);
    }
    const shiftObserver = observeLayoutShift(el, measure);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      ro.disconnect();
      shiftObserver.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [ref, containerRef, measure, enabled]);
}
