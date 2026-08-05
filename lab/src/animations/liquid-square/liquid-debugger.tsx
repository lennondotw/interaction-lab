import { cn } from '@monorepo/utils';
import { motion, PanInfo } from 'motion/react';
import { FC, useCallback, useState } from 'react';
import { useBodyCursor } from './use-body-cursor.js';
import { useLiquidStretch } from './use-liquid-stretch.js';

const baseWidth = 200;
const baseHeight = 200;

export const LiquidDebugger: FC<{ className?: string }> = ({ className }) => {
  const { translateX, translateY, scaleX, scaleY, updateNormalizedPanOffset, release } = useLiquidStretch();

  const [grabbing, setGrabbing] = useState(false);

  useBodyCursor(grabbing ? 'grabbing' : null);

  const handlePanStart = useCallback(() => {
    setGrabbing(true);
  }, []);

  const handlePan = useCallback(
    (_: PointerEvent, info: PanInfo) => {
      const dx = info.offset.x;
      const dy = info.offset.y;
      updateNormalizedPanOffset(dx / baseWidth, dy / baseHeight);
    },
    [updateNormalizedPanOffset]
  );

  const handlePanEnd = useCallback(() => {
    setGrabbing(false);
    release();
  }, [release]);

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
      <motion.div
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        style={{ width: baseWidth, height: baseHeight }}
        className={cn(`
          relative cursor-grab touch-none
          active:cursor-grabbing
        `)}
      >
        <div className="pointer-events-none absolute inset-0 border-4 border-red-400/30"></div>
        <motion.div
          className="pointer-events-none absolute inset-0 border-4 border-blue-400/50 bg-red-400/10"
          style={{ width: baseWidth, height: baseHeight, translateX, translateY, scaleX, scaleY }}
        ></motion.div>
      </motion.div>
    </div>
  );
};
