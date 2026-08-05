import { cn } from '@monorepo/utils';
import { getSvgPath, type FigmaSquircleParams } from 'figma-squircle';
import { motion } from 'motion/react';
import { FC, useMemo } from 'react';
import { LiquidDiv } from './liquid-div.js';

const baseWidth = 150;
const baseHeight = 150;

const defaultFigmaSquircleParams: FigmaSquircleParams = {
  width: baseWidth,
  height: baseHeight,
  cornerRadius: 24,
  cornerSmoothing: 0.6,
};

export const LiquidSquare: FC<{ className?: string }> = ({ className }) => {
  const d = useMemo(() => getSvgPath(defaultFigmaSquircleParams), []);
  return (
    <div
      className={cn(
        `
          mx-auto flex min-h-screen w-screen touch-manipulation flex-col items-center justify-center gap-6
          overflow-x-clip px-2 py-4 select-none
        `,
        className
      )}
    >
      <div style={{ width: baseWidth, height: baseHeight }} className="relative">
        <div className="pointer-events-none absolute -inset-2 border-4 border-dashed border-neutral-400/50"></div>
        <LiquidDiv style={{ width: baseWidth, height: baseHeight }}>
          <motion.svg
            width={baseWidth}
            height={baseHeight}
            viewBox={`0 0 ${baseWidth} ${baseHeight}`}
            role="none"
            aria-hidden="true"
            className={cn('absolute inset-0 block')}
          >
            <path d={d} fill="currentColor" />
          </motion.svg>
        </LiquidDiv>
      </div>
    </div>
  );
};
