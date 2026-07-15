export interface ProgressiveTextUnit {
  content: string;
  originalIndex: number;
  visibleIndex: number | null;
}

export interface ProgressiveTextMapping {
  originalIndexToVisibleIndex: (number | null)[];
  units: ProgressiveTextUnit[];
  visibleIndexToOriginalIndex: number[];
  visibleLength: number;
}

const defaultSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const isWhitespace = (value: string) => value.trim().length === 0;

export const createProgressiveTextMapping = (
  text: string,
  segmenter: Intl.Segmenter = defaultSegmenter
): ProgressiveTextMapping => {
  const units: ProgressiveTextUnit[] = [];
  const visibleIndexToOriginalIndex: number[] = [];
  const originalIndexToVisibleIndex: (number | null)[] = [];
  let visibleIndex = 0;

  for (const part of segmenter.segment(text)) {
    const unitVisibleIndex = isWhitespace(part.segment) ? null : visibleIndex;

    if (unitVisibleIndex !== null) {
      visibleIndexToOriginalIndex[unitVisibleIndex] = part.index;
      visibleIndex += 1;
    }

    for (let index = 0; index < part.segment.length; index += 1) {
      originalIndexToVisibleIndex[part.index + index] = unitVisibleIndex;
    }

    units.push({
      content: part.segment,
      originalIndex: part.index,
      visibleIndex: unitVisibleIndex,
    });
  }

  return {
    originalIndexToVisibleIndex,
    units,
    visibleIndexToOriginalIndex,
    visibleLength: visibleIndex,
  };
};

const clampUnitInterval = (value: number) => Math.min(1, Math.max(0, value));

export const getProgressiveTextUnitOpacity = ({
  gradientWidth,
  inactiveOpacity,
  progress,
  visibleIndex,
  visibleLength,
}: {
  gradientWidth: number;
  inactiveOpacity: number;
  progress: number;
  visibleIndex: number | null;
  visibleLength: number;
}) => {
  if (visibleIndex === null) return 1;

  const safeGradientWidth = Math.max(Number.EPSILON, gradientWidth);
  const gradientEnd = progress * (visibleLength + safeGradientWidth);
  const unitProgress = clampUnitInterval((gradientEnd - visibleIndex) / safeGradientWidth);

  return inactiveOpacity + (1 - inactiveOpacity) * unitProgress;
};
