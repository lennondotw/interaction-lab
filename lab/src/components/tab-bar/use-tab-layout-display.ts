import { useLayoutEffect, useState, type RefObject } from 'react';

// Storybook instrumentation only: classify destinations, not transient animation footprints.
export function useTabLayoutDisplay(root: RefObject<HTMLDivElement | null>, tabCount: number) {
  const [layout, setLayout] = useState<{ compressed: boolean; hasSpace: boolean } | null>(null);
  useLayoutEffect(() => {
    const target = root.current!.querySelector<HTMLElement>('[data-tab-target-layout]')!;
    const measure = () => {
      const tabs = Array.from(target.querySelectorAll('[data-tab-target]'));
      const widths = tabs.map((tab) => parseFloat(tab.getAttribute('data-tab-width-target')!));
      // A CSS pixel of tolerance absorbs fractional flex layout rounding.
      const compressed = tabs.some((tab, index) => widths[index]! < parseFloat(getComputedStyle(tab).flexBasis) - 1);
      const gap = parseFloat(getComputedStyle(target).columnGap);
      const addWidth = parseFloat(getComputedStyle(target.querySelector('[data-tab-add-target]')!).width);
      const occupied = widths.reduce((sum, width) => sum + width, 0) + tabs.length * gap + addWidth;
      const hasSpace = occupied < target.getBoundingClientRect().width - 1;
      setLayout((previous) =>
        previous?.compressed === compressed && previous.hasSpace === hasSpace ? previous : { compressed, hasSpace }
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    const mutations = new MutationObserver(measure);
    mutations.observe(target, { subtree: true, attributes: true, attributeFilter: ['data-tab-width-target'] });
    measure();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [root, tabCount]);
  return layout;
}
