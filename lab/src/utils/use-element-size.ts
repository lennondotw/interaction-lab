import { useLayoutEffect, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The content-box size of `ref`'s block element, known before the first frame runs.
 *
 * The first size is read synchronously in a layout effect, so it is committed
 * during React's commit, before the browser runs any rAF callback or paints:
 * layout and canvas drawing in that first frame already see it. Later resizes
 * come from a ResizeObserver and are committed with `flushSync`, still before
 * the frame they happen in is painted. (`@react-hookz/web`'s `useMeasure`
 * defers its first entry to the next rAF, so its first painted frame has no size.)
 *
 * `undefined` only during the first render, which is never painted.
 * The element must mount together with the caller; a later swap is not observed.
 */
export function useElementSize(ref: RefObject<Element | null>): ElementSize | undefined {
  const [size, setSize] = useState<ElementSize>();
  useLayoutEffect(() => {
    const element = ref.current!;
    const commit = (width: number, height: number) =>
      setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));

    // Computed `width`/`height` are the used layout values: fractional and untransformed,
    // unlike getBoundingClientRect. Under border-box sizing they include padding and border.
    const style = getComputedStyle(element);
    const inset = (a: string, b: string) => Number.parseFloat(a) + Number.parseFloat(b);
    const borderBox = style.boxSizing === 'border-box';
    commit(
      Number.parseFloat(style.width) -
        (borderBox
          ? inset(style.paddingLeft, style.paddingRight) + inset(style.borderLeftWidth, style.borderRightWidth)
          : 0),
      Number.parseFloat(style.height) -
        (borderBox
          ? inset(style.paddingTop, style.paddingBottom) + inset(style.borderTopWidth, style.borderBottomWidth)
          : 0)
    );

    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentBoxSize[0]!;
      flushSync(() => commit(box.inlineSize, box.blockSize));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
