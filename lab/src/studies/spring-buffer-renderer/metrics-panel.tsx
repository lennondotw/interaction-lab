import { cn } from '@monorepo/utils';
import { motion, useTransform } from 'motion/react';
import { FC } from 'react';

import { useSpringBufferContext } from './spring-buffer-provider.js';

export const MetricsPanel: FC<{ className?: string }> = ({ className }) => {
  const {
    contentMV,
    contentGraphemeSegmentsMV,
    cursorUTF16IndexSpringMV,
    cursorGraphemeIndexSpringMV,
    cursorVelocityMV,
  } = useSpringBufferContext();

  const contentGraphemeLength = useTransform(() => {
    return contentGraphemeSegmentsMV.get().length;
  });
  const contentUTF16Length = useTransform(() => {
    return contentMV.get().length;
  });

  const bufferUTF16Length = useTransform(() => {
    return contentUTF16Length.get() - cursorUTF16IndexSpringMV.get();
  });

  const bufferGraphemeLength = useTransform(() => {
    return contentGraphemeLength.get() - cursorGraphemeIndexSpringMV.get();
  });

  return (
    <div
      className={cn(
        `
          w-full rounded-md border border-neutral-400/50 bg-white/60 p-4 font-mono text-xs/relaxed
          dark:border-neutral-600/40 dark:bg-black/60
        `,
        className
      )}
    >
      <div>
        <span className="opacity-60">rendered + buffer length (in utf-16 / graphemes): </span>
        <motion.span>{contentUTF16Length}</motion.span> / <motion.span>{contentGraphemeLength}</motion.span>
      </div>
      <div>
        <span className="opacity-60">rendered length (in utf-16 / graphemes): </span>
        <motion.span>{cursorUTF16IndexSpringMV}</motion.span> / <motion.span>{cursorGraphemeIndexSpringMV}</motion.span>
      </div>
      <div>
        <span className="opacity-60">buffer length (in utf-16 / graphemes): </span>
        <motion.span>{bufferUTF16Length}</motion.span> / <motion.span>{bufferGraphemeLength}</motion.span>
      </div>
      <div>
        <span className="opacity-60">cursor velocity: (in graphemes per second): </span>
        <motion.span>{cursorVelocityMV}</motion.span>
      </div>
    </div>
  );
};
