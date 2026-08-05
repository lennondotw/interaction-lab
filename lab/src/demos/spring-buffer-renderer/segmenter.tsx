import type { MotionValue } from 'motion';
import { useTransform } from 'motion/react';

function clamp(x: number, min: number, max: number) {
  return Math.min(Math.max(x, min), max);
}

export function segmentGraphemes(input: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(input), (s) => s.segment);
  }
  return Array.from(input);
}

export function useGraphemeSlicedStringMotionValue(
  text: MotionValue<string>,
  index: MotionValue<number>
): MotionValue<string> {
  const segmentsMV = useTransform(() => segmentGraphemes(text.get()));

  const prefixMV = useTransform(() => {
    const idx = clamp(Math.floor(index.get()), 0, segmentsMV.get().length);
    return segmentsMV.get().slice(0, idx).join('');
  });

  return prefixMV;
}
