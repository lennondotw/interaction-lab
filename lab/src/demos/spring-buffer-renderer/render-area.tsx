import { cn } from '@monorepo/utils';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { FC } from 'react';
import { useAnimationControlsContext } from './animation-controls-provider.js';
import { segmentGraphemes } from './segmenter.js';
import { useSpringBufferContext } from './spring-buffer-provider.js';

const TRAILING_EXTRA_LENGTH = 20;

export const RenderArea: FC = () => {
  const { renderedValueSpringMV, bufferValueSpringMV } = useSpringBufferContext();
  const { showBuffer, showTrailing } = useAnimationControlsContext();

  const showBufferMV = useMotionValue<boolean>(showBuffer);
  showBufferMV.set(showBuffer);

  const transformedBufferValueSpringMV = useTransform(() => {
    const bufferContent = bufferValueSpringMV.get();
    if (showBufferMV.get()) {
      return bufferContent;
    }
    return bufferContent.slice(0, segmentGraphemes(bufferContent).slice(0, TRAILING_EXTRA_LENGTH).join('').length);
  });

  return (
    <div
      className={cn(
        `
          relative rounded-sm border border-neutral-400/50 bg-white/70 p-3 leading-relaxed tracking-normal text-black
          dark:border-neutral-600/40 dark:bg-black/70 dark:text-white
        `
      )}
    >
      {/* layer 1: rendered value */}
      <div className="relative min-h-lh whitespace-pre-wrap">
        <motion.span>{renderedValueSpringMV}</motion.span>
        <motion.span className="opacity-0 select-none">{transformedBufferValueSpringMV}</motion.span>

        {/* layer 2: buffer value */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 min-h-lh',
            !showBuffer && !showTrailing && 'opacity-0',
            !showBuffer && showTrailing && 'opacity-40'
          )}
        >
          <motion.span className="opacity-0 select-none">{renderedValueSpringMV}</motion.span>
          <motion.span className="opacity-40">{transformedBufferValueSpringMV}</motion.span>
        </div>

        {/* layer 3: cursor */}
        <div className="pointer-events-none absolute inset-0 min-h-lh">
          <motion.span className="opacity-0 select-none">{renderedValueSpringMV}</motion.span>
          <div className="relative inline-block size-0 align-bottom">
            <div className="absolute bottom-0 left-0 h-lh w-[2px] bg-emerald-500/80"></div>
          </div>
          <motion.span className="opacity-0 select-none">{transformedBufferValueSpringMV}</motion.span>
        </div>
      </div>
    </div>
  );
};
