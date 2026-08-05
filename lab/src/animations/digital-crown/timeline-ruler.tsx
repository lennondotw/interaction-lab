import { cn } from '@monorepo/utils';
import { motion, MotionValue, useTransform } from 'motion/react';
import { FC } from 'react';

import { CARD_COUNT, TRIGGER_COUNT, TRIGGER_ZONE_HIGH, TRIGGER_ZONE_LOW } from './constants.js';

interface TimelineRulerProps {
  scrollProgress: MotionValue<number>;
  flashingForward: Set<number>;
  flashingBackward: Set<number>;
}

export const TimelineRuler: FC<TimelineRulerProps> = ({ scrollProgress, flashingForward, flashingBackward }) => {
  const scrollLeft = useTransform(scrollProgress, (v) => `calc(${v * 100}% * 0.92 + 4%)`);

  return (
    <div
      className={`
        relative flex h-10 w-[calc(100svw-12rem)] items-center rounded-full bg-neutral-900/80 px-4 backdrop-blur-sm
      `}
    >
      {/* 11 center points (detent positions) */}
      {Array.from({ length: CARD_COUNT }, (_, i) => {
        const position = (i / TRIGGER_COUNT) * 100;
        return (
          <div key={`center-${i}`}>
            <div
              className="absolute top-1/2 h-3 w-0.5 -translate-1/2 rounded-full bg-neutral-500"
              style={{ left: `calc(${position}% * 0.92 + 4%)` }}
              title={`Card ${i + 1} centered: ${position.toFixed(0)}%`}
            />
            <div
              className="absolute top-full mt-1 -translate-x-1/2 font-mono text-[10px] text-neutral-500"
              style={{ left: `calc(${position}% * 0.92 + 4%)` }}
            >
              {i + 1}
            </div>
          </div>
        );
      })}

      {/* 10 segments with trigger zones */}
      {Array.from({ length: TRIGGER_COUNT }, (_, i) => {
        const segmentStart = (i / TRIGGER_COUNT) * 100;
        const segmentEnd = ((i + 1) / TRIGGER_COUNT) * 100;
        const triggerLow = segmentStart + (segmentEnd - segmentStart) * TRIGGER_ZONE_LOW;
        const triggerHigh = segmentStart + (segmentEnd - segmentStart) * TRIGGER_ZONE_HIGH;

        return (
          <div key={`trigger-${i}`}>
            {/* Trigger zone background */}
            <div
              className="absolute top-1/2 h-4 -translate-y-1/2 bg-neutral-700/30"
              style={{
                left: `calc(${triggerLow}% * 0.92 + 4%)`,
                width: `calc(${triggerHigh - triggerLow}% * 0.92)`,
              }}
            />
            {/* Backward trigger point */}
            <div
              className={cn(
                `absolute top-1/2 h-5 w-0.5 -translate-1/2 rounded-full transition-all duration-600 ease-out`,
                flashingBackward.has(i) ? 'bg-red-200 duration-0' : 'bg-cyan-600'
              )}
              style={{ left: `calc(${triggerLow}% * 0.92 + 4%)` }}
              title={`Backward trigger: ${triggerLow.toFixed(1)}%`}
            />
            {/* Forward trigger point */}
            <div
              className={cn(
                `absolute top-1/2 h-5 w-0.5 -translate-1/2 rounded-full transition-all duration-600 ease-out`,
                flashingForward.has(i) ? 'bg-red-200 duration-0' : 'bg-cyan-600'
              )}
              style={{ left: `calc(${triggerHigh}% * 0.92 + 4%)` }}
              title={`Forward trigger: ${triggerHigh.toFixed(1)}%`}
            />
          </div>
        );
      })}

      {/* Current scroll position indicator */}
      <motion.div
        className={`absolute top-1/2 h-7 w-0.5 -translate-1/2 rounded-full bg-white shadow-lg shadow-white/30`}
        style={{ left: scrollLeft }}
      />
    </div>
  );
};
