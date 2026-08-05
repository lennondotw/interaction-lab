import { cn } from '@monorepo/utils';
import type { Property } from 'csstype';
import { HTMLMotionProps, motion, MotionNodePanHandlers, MotionNodeTapHandlers, useComposedRefs } from 'motion/react';
import { FC, useCallback, useRef, useState } from 'react';
import { useBodyCursor } from './use-body-cursor.js';
import { useLiquidStretch, UseLiquidStretchConfig } from './use-liquid-stretch.js';

interface LiquidDivConfig extends UseLiquidStretchConfig {
  hoverCursorShape?: Property.Cursor;
  activeAndOutsideCursorShape?: Property.Cursor;
}

interface LiquidDivProps extends HTMLMotionProps<'div'> {
  liquidConfig?: LiquidDivConfig;
}

export const LiquidDiv: FC<LiquidDivProps> = (props) => {
  const {
    className,
    children,
    liquidConfig = {},
    style,
    ref: externalRef,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onPanStart: externalOnPanStart,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onPan: externalOnPan,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onPanEnd: externalOnPanEnd,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onTapStart: externalOnTapStart,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onTap: externalOnTap,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    onTapCancel: externalOnTapCancel,
    ...restProps
  } = props;

  const { hoverCursorShape, activeAndOutsideCursorShape, ...restLiquidConfig } = liquidConfig;

  const internalRef = useRef<HTMLDivElement>(null);
  const composedRef = useComposedRefs(internalRef, externalRef);

  const { translateX, translateY, scaleX, scaleY, updateNormalizedPanOffset, release } =
    useLiquidStretch(restLiquidConfig);

  const [active, setActive] = useState(false);

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  useBodyCursor(active ? activeAndOutsideCursorShape || null : null);

  // pan handlers
  const handlePanStart: NonNullable<MotionNodePanHandlers['onPanStart']> = useCallback(
    (...props) => {
      externalOnPanStart?.(...props);
    },
    [externalOnPanStart]
  );

  const handlePan: NonNullable<MotionNodePanHandlers['onPan']> = useCallback(
    (...props) => {
      externalOnPan?.(...props);
      const [_, info] = props;
      const container = internalRef.current;
      if (!container) return;
      const dx = info.offset.x;
      const dy = info.offset.y;
      updateNormalizedPanOffset(dx / container.clientWidth, dy / container.clientHeight);
    },
    [externalOnPan, updateNormalizedPanOffset]
  );

  const handlePanEnd: NonNullable<MotionNodePanHandlers['onPanEnd']> = useCallback(
    (...props) => {
      externalOnPanEnd?.(...props);
      release();
    },
    [externalOnPanEnd, release]
  );

  // tap handlers
  const handleTapStart: NonNullable<MotionNodeTapHandlers['onTapStart']> = useCallback(
    (...props) => {
      externalOnTapStart?.(...props);
      setActive(true);
    },
    [externalOnTapStart]
  );

  const handleTap: NonNullable<MotionNodeTapHandlers['onTap']> = useCallback(
    (...props) => {
      externalOnTap?.(...props);
      setActive(false);
    },
    [externalOnTap]
  );

  const handleTapCancel: NonNullable<MotionNodeTapHandlers['onTapCancel']> = useCallback(
    (...props) => {
      externalOnTapCancel?.(...props);
      setActive(false);
    },
    [externalOnTapCancel]
  );

  return (
    <motion.div
      {...restProps}
      ref={composedRef}
      onPanStart={handlePanStart}
      onPan={handlePan}
      onPanEnd={handlePanEnd}
      onTapStart={handleTapStart}
      onTap={handleTap}
      onTapCancel={handleTapCancel}
      className={cn(`touch-none`, className)}
      style={{
        ...style,
        translateX,
        translateY,
        scaleX,
        scaleY,
        cursor: active ? activeAndOutsideCursorShape : hoverCursorShape,
      }}
    >
      {children}
    </motion.div>
  );
};
