import { cn } from '@monorepo/utils';
import { motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useMemo, type FC } from 'react';

import { createProgressiveTextMapping, getProgressiveTextUnitOpacity } from './progressive-text-utils.js';

export interface ProgressiveTextProps {
  className?: string;
  gradientWidth?: number;
  inactiveOpacity?: number;
  progress: MotionValue<number> | number;
  sequenceLength?: number;
  sequenceOffset?: number;
  text: string;
}

interface ProgressiveTextUnitProps {
  content: string;
  gradientWidth: number;
  inactiveOpacity: number;
  progress: MotionValue<number>;
  visibleIndex: number | null;
  visibleLength: number;
}

const ProgressiveTextUnit: FC<ProgressiveTextUnitProps> = ({
  content,
  gradientWidth,
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

  return <motion.span style={{ opacity }}>{content}</motion.span>;
};

export const ProgressiveText: FC<ProgressiveTextProps> = ({
  className,
  gradientWidth = 6,
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
          content={unit.content}
          gradientWidth={gradientWidth}
          inactiveOpacity={inactiveOpacity}
          progress={progressValue}
          visibleIndex={unit.visibleIndex === null ? null : unit.visibleIndex + sequenceOffset}
          visibleLength={sequenceLength ?? mapping.visibleLength}
        />
      ))}
    </span>
  );
};
