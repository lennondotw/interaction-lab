/**
 * Debug visualisation for the elastic scale effect — a dashed reference
 * grid showing where each item is laid out, the live transform on top of
 * it, and a panel reading out the numbers. Built for tuning `maxScale` /
 * `sigma` by eye.
 */

import { cn } from '@monorepo/utils';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useState, type FC } from 'react';
import { calculateScale, DEFAULT_MAX_SCALE, DEFAULT_SIGMA } from './elastic-scale.js';
import {
  NO_HOVERED_ITEM,
  useElasticScaleContainer,
  useItemTransform,
  type ElasticScaleContext,
} from './use-elastic-scale.js';

const DEFAULT_ITEM_SIZE = 16;
const DEFAULT_ITEM_GAP = 4;

/** Height of the bar drawn inside each item — presentation, not layout. */
const DEBUG_BAR_HEIGHT = 2;

/** Rows listed in the panel before it truncates. */
const PANEL_ROW_LIMIT = 12;

/**
 * Pull a MotionValue into React state. Deliberately confined to the
 * debug panel: it re-renders on every pointer move, which is exactly
 * what the effect itself is designed to avoid.
 */
function useMotionValueState<T>(mv: MotionValue<T>): T {
  const [value, setValue] = useState<T>(mv.get());
  useEffect(() => mv.on('change', setValue), [mv]);
  return value;
}

const DebugPanel: FC<{
  context: ElasticScaleContext;
  hoveredItemIndex: MotionValue<number>;
  maxScale: number;
  sigma: number;
}> = ({ context, hoveredItemIndex, maxScale, sigma }) => {
  const { cursorPosition, intensity, layout } = context;
  const cursorPos = useMotionValueState(cursorPosition);
  const intensityValue = useMotionValueState(intensity);
  const hoveredIndex = useMotionValueState(hoveredItemIndex);
  const isHovering = cursorPos !== null;

  return (
    <div
      className={`
        max-h-100 w-56 overflow-auto rounded-sm bg-black/5 p-3 font-mono text-xs
        dark:bg-white/5
      `}
    >
      <div className="mb-2 font-bold">Debug</div>

      <div
        className={`
          mb-2 border-b border-black/10 pb-2
          dark:border-white/10
        `}
      >
        <div>
          <span
            className={`
              text-black/50
              dark:text-white/50
            `}
          >
            position:{' '}
          </span>
          <span
            className={
              isHovering
                ? `
                  text-green-600
                  dark:text-green-400
                `
                : `
                  text-red-500
                  dark:text-red-400
                `
            }
          >
            {isHovering ? `${cursorPos.toFixed(1)}px` : 'none'}
          </span>
        </div>
        <div>
          <span
            className={`
              text-black/50
              dark:text-white/50
            `}
          >
            intensity:{' '}
          </span>
          <span
            className={
              intensityValue > 0
                ? `
                  text-blue-500
                  dark:text-blue-400
                `
                : ''
            }
          >
            {intensityValue.toFixed(2)}
          </span>
        </div>
        <div>
          <span
            className={`
              text-black/50
              dark:text-white/50
            `}
          >
            hovered:{' '}
          </span>
          <span
            className={
              hoveredIndex !== NO_HOVERED_ITEM
                ? `
                  text-red-500
                  dark:text-red-400
                `
                : ''
            }
          >
            {hoveredIndex !== NO_HOVERED_ITEM ? `#${hoveredIndex}` : 'none'}
          </span>
        </div>
      </div>

      <div
        className={`
          mb-2 border-b border-black/10 pb-2 text-black/60
          dark:border-white/10 dark:text-white/60
        `}
      >
        maxScale={maxScale} sigma={sigma} items={layout.itemCount}
      </div>

      <div className="space-y-0.5">
        {Array.from({ length: Math.min(layout.itemCount, PANEL_ROW_LIMIT) }, (_, i) => {
          const center = layout.getItemCenter(i);
          const rawScale = isHovering ? calculateScale(center, cursorPos, maxScale, sigma) : 1;
          const scale = 1 + (rawScale - 1) * intensityValue;
          const isCurrentHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              className={cn(
                'flex gap-2',
                isCurrentHovered
                  ? `
                    text-red-500
                    dark:text-red-400
                  `
                  : scale > 1.5 &&
                      `
                        text-orange-600
                        dark:text-orange-400
                      `
              )}
            >
              <span
                className={cn(
                  'w-6',
                  !isCurrentHovered &&
                    `
                      text-black/40
                      dark:text-white/40
                    `
                )}
              >
                #{i}
              </span>
              <span>×{scale.toFixed(2)}</span>
            </div>
          );
        })}
        {layout.itemCount > PANEL_ROW_LIMIT && (
          <div
            className={`
              text-black/40
              dark:text-white/40
            `}
          >
            ...
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * One item. The dashed outline is a static reference showing where the
 * item is laid out; the animated layers sit on top so you can see how
 * far the transform has carried it away from rest.
 */
const DebugItem: FC<{
  index: number;
  context: ElasticScaleContext;
  hoveredItemIndex: MotionValue<number>;
  maxScale: number;
  sigma: number;
}> = ({ index, context, hoveredItemIndex, maxScale, sigma }) => {
  const { scale, translate } = useItemTransform(context, index, { maxScale, sigma });
  const displayScale = useTransform(scale, (s: number) => s.toFixed(2));

  const hoveredIndex = useMotionValueState(hoveredItemIndex);
  const isHovered = hoveredIndex === index;

  return (
    <div
      className={`
        relative flex items-center justify-end outline-1 -outline-offset-1 outline-black/20 outline-dashed
        dark:outline-white/20
      `}
      style={{ height: context.layout.itemSize, width: 40 }}
    >
      {/* Centre line of the resting slot. */}
      <div
        className={`
          absolute inset-x-0 top-1/2 h-px bg-black/20
          dark:bg-white/20
        `}
      />

      {/* Translate and scale are split across two layers so the scale
          transform doesn't compound into the positional offset. */}
      <motion.div className="absolute inset-0" style={{ y: translate }}>
        <motion.div
          className="flex h-full items-center justify-end outline-1 -outline-offset-1 outline-blue-400/50 outline-solid"
          style={{ scale, transformOrigin: 'right center' }}
        >
          <div
            className={`
              rounded-sm bg-black/40
              dark:bg-white/40
            `}
            style={{ height: DEBUG_BAR_HEIGHT, width: 16 }}
          />
        </motion.div>

        {/* Rides along with the item but stays unscaled, so the readout
            is legible at every scale factor. */}
        <motion.span
          className={cn(
            `
              pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 font-mono text-[10px]
              whitespace-nowrap
            `,
            isHovered
              ? `
                text-red-500
                dark:text-red-400
              `
              : `
                text-black/40
                dark:text-white/40
              `
          )}
        >
          {displayScale}
        </motion.span>
      </motion.div>
    </div>
  );
};

export interface DebugElasticScaleProps {
  itemCount?: number;
  /** Size of one slot along the axis — bar height plus its gap. */
  itemSize?: number;
  maxScale?: number;
  sigma?: number;
}

export const DebugElasticScale: FC<DebugElasticScaleProps> = ({
  itemCount = 20,
  itemSize = DEFAULT_ITEM_SIZE + DEFAULT_ITEM_GAP,
  maxScale = DEFAULT_MAX_SCALE,
  sigma = DEFAULT_SIGMA,
}) => {
  const { context, hoveredItemIndex, handlePointerMove, handlePointerLeave, layout } = useElasticScaleContainer({
    itemCount,
    itemSize,
  });

  return (
    <div data-testid="debug-elastic-scale" className="flex items-start gap-4">
      <div
        className={`
          rounded-sm border border-black/10 bg-white py-4 pr-12 pl-4
          dark:border-white/10 dark:bg-black/50
        `}
      >
        {/* The red dashed box is the pointer capture area. */}
        <div
          data-testid="debug-elastic-scale-container"
          className="relative outline-2 -outline-offset-2 outline-red-400/60 outline-dashed"
          style={{ height: layout.totalSize, width: 40 }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <div className="flex flex-col items-end">
            {Array.from({ length: layout.itemCount }, (_, i) => (
              <DebugItem
                key={i}
                index={i}
                context={context}
                hoveredItemIndex={hoveredItemIndex}
                maxScale={maxScale}
                sigma={sigma}
              />
            ))}
          </div>
        </div>
      </div>
      <DebugPanel context={context} hoveredItemIndex={hoveredItemIndex} maxScale={maxScale} sigma={sigma} />
    </div>
  );
};
