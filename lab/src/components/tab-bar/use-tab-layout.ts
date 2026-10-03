import { useMotionValue, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { TabBarProps, TabFootprint } from './tab-bar.types.js';
import { closeTabWidths } from './tab-close-layout.js';
import type { createTabHoverHold } from './tab-hover-hold.js';
import { getTabLayoutChange, type TabLayoutSnapshot } from './tab-layout-change.js';
import { readTabLayoutConstraints, readTabTargets } from './tab-layout-measurement.js';
import { createTabSpring } from './tab-spring.js';
import { resolveTabWidths } from './tab-target-layout.js';

interface TabLayoutOptions {
  tabs: TabBarProps['tabs'];
  onClose: TabBarProps['onClose'];
  heldWidths: ReadonlyMap<string, number> | null;
  setHeldWidths: Dispatch<SetStateAction<ReadonlyMap<string, number> | null>>;
  hoverHold: ReturnType<typeof createTabHoverHold>;
  animationSpeed: number;
}

export function useTabLayout({
  tabs,
  onClose,
  heldWidths,
  setHeldWidths,
  hoverHold,
  animationSpeed,
}: TabLayoutOptions) {
  const targetLayoutRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const previousLayout = useRef<TabLayoutSnapshot | null>(null);
  const [footprints] = useState(() => new Map<string, TabFootprint>());
  const addGap = useMotionValue(0);
  const [addGapSpring] = useState(() => createTabSpring(addGap));
  const reducedMotion = useReducedMotion();
  const close = useCallback(
    (id: string) => {
      const layout = targetLayoutRef.current!;
      const { gap, basis } = readTabLayoutConstraints(layout);
      const widths = tabs.map((tab) => footprints.get(tab.id)!.getTargetWidth());
      const index = tabs.findIndex((tab) => tab.id === id);
      const nextWidths = closeTabWidths(widths, index, gap, basis);
      const remaining = tabs.filter((tab) => tab.id !== id);
      setHeldWidths(
        hoverHold.shouldHoldWidths()
          ? new Map(remaining.map((tab, tabIndex) => [tab.id, nextWidths[tabIndex]!] as const))
          : null
      );
      onClose(id);
    },
    [footprints, hoverHold, onClose, setHeldWidths, tabs]
  );

  const measureTargets = useCallback(() => {
    const layout = targetLayoutRef.current!;
    const { width: availableWidth, gap, targets } = readTabTargets(layout);
    const snapshot = { width: availableWidth, ids: targets.map((target) => target.id), heldWidths };
    const previous = previousLayout.current;
    const reason = getTabLayoutChange(previous, snapshot);
    previousLayout.current = snapshot;
    // Container resize takes ownership of every footprint, including entering
    // and exiting tabs. Hover hold and its release timer remain independent.
    const immediate = reason === 'mount' || reason === 'resize' || reducedMotion === true;
    const widths = resolveTabWidths(targets, heldWidths);
    for (const footprint of footprints.values()) footprint.setSpeed(animationSpeed);
    addGapSpring.setSpeed(animationSpeed);
    targets.forEach((target, index) => {
      const width = widths[index]!;
      // Expose the destination for Storybook instrumentation, independent of entering/exiting pixels.
      const value = String(width);
      if (target.element.getAttribute('data-tab-width-target') !== value) {
        target.element.setAttribute('data-tab-width-target', value);
      }
      footprints.get(target.id)!.set(width, target.gap, immediate);
    });
    const presentIds = new Set(targets.map((target) => target.id));
    // AnimatePresence keeps removed tabs in flow, but the sizing row excludes
    // them. Their old pixel footprint collapses while survivors expand together.
    for (const [id, footprint] of footprints) {
      if (!presentIds.has(id)) footprint.set(0, 0, immediate);
    }
    const nextAddGap = targets.length === 0 ? 0 : gap;
    addGapSpring.set(nextAddGap, immediate);
    if (immediate) addRef.current!.style.marginLeft = `${nextAddGap}px`;
  }, [addGapSpring, animationSpeed, footprints, heldWidths, reducedMotion]);

  // Child layout effects register the newly mounted tabs before this reads the
  // final layout. Existing MotionValues survive every tab-list change.
  useLayoutEffect(measureTargets);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measureTargets);
    observer.observe(targetLayoutRef.current!);
    return () => observer.disconnect();
  }, [measureTargets]);
  useEffect(() => () => addGapSpring.stop(), [addGapSpring]);

  return { targetLayoutRef, addRef, footprints, addGap, close };
}
