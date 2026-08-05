import { cn } from '@monorepo/utils';
import { motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useMemo, type FC } from 'react';

import {
  createProgressiveTextMapping,
  getProgressiveTextUnitColor,
  getProgressiveTextUnitOpacity,
} from './progressive-text-utils.js';

export interface ProgressiveTextProps {
  activeColor?: string;
  colorGradientWidth?: number;
  className?: string;
  getActiveColor?: (unit: {
    content: string;
    originalIndex: number;
    visibleIndex: number | null;
  }) => string | undefined;
  gradientWidth?: number;
  inactiveColor?: string;
  inactiveOpacity?: number;
  progress: MotionValue<number> | number;
  sequenceLength?: number;
  sequenceOffset?: number;
  text: string;
}

interface ProgressiveTextUnitProps {
  activeColor?: string;
  colorGradientWidth: number;
  content: string;
  gradientWidth: number;
  inactiveColor: string;
  inactiveOpacity: number;
  progress: MotionValue<number>;
  visibleIndex: number | null;
  visibleLength: number;
}

const ProgressiveTextUnit: FC<ProgressiveTextUnitProps> = ({
  activeColor,
  colorGradientWidth,
  content,
  gradientWidth,
  inactiveColor,
  inactiveOpacity,
  progress,
  visibleIndex,
  visibleLength,
}) => {
  const opacity = useTransform(progress, (latestProgress) =>
    getProgressiveTextUnitOpacity({
      gradientWidth,
      inactiveOpacity,
      progress: latestProgress,
      visibleIndex,
      visibleLength,
    })
  );
  const color = useTransform(progress, (latestProgress) =>
    activeColor
      ? getProgressiveTextUnitColor({
          activeColor,
          gradientWidth: colorGradientWidth,
          inactiveColor,
          progress: latestProgress,
          sequenceGradientWidth: gradientWidth,
          visibleIndex,
          visibleLength,
        })
      : inactiveColor
  );

  return <motion.span style={{ color: activeColor ? color : undefined, opacity }}>{content}</motion.span>;
};

export const ProgressiveText: FC<ProgressiveTextProps> = ({
  activeColor,
  colorGradientWidth = 1,
  className,
  getActiveColor,
  gradientWidth = 6,
  inactiveColor = '#171717',
  inactiveOpacity = 0.24,
  progress,
  sequenceLength,
  sequenceOffset = 0,
  text,
}) => {
  const staticProgress = useMotionValue(typeof progress === 'number' ? progress : progress.get());
  const progressValue = typeof progress === 'number' ? staticProgress : progress;
  const mapping = useMemo(() => createProgressiveTextMapping(text), [text]);

  useEffect(() => {
    if (typeof progress === 'number') staticProgress.set(progress);
  }, [progress, staticProgress]);

  return (
    <span className={cn('whitespace-pre-wrap', className)} data-progressive-text="">
      {mapping.units.map((unit) => (
        <ProgressiveTextUnit
          key={unit.originalIndex}
          activeColor={getActiveColor?.(unit) ?? activeColor}
          colorGradientWidth={colorGradientWidth}
          content={unit.content}
          gradientWidth={gradientWidth}
          inactiveColor={inactiveColor}
          inactiveOpacity={inactiveOpacity}
          progress={progressValue}
          visibleIndex={unit.visibleIndex === null ? null : unit.visibleIndex + sequenceOffset}
          visibleLength={sequenceLength ?? mapping.visibleLength}
        />
      ))}
    </span>
  );
};
