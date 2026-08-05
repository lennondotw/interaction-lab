import { cn } from '@monorepo/utils';
import { motion, MotionValue, useTransform } from 'motion/react';
import { FC } from 'react';
import './pane.js';

interface DebugPanelProps {
  scrollProgress: MotionValue<number>;
  triggeredValue: MotionValue<number>;
  linkedValue: MotionValue<number>;
  combinedValue: MotionValue<number>;
  activeCard: number;
}

export const DebugPanel: FC<DebugPanelProps> = ({
  scrollProgress,
  triggeredValue,
  linkedValue,
  combinedValue,
  activeCard,
}) => {
  const scrollProgressFixed = useTransform(scrollProgress, (v) => (v * 100).toFixed(1) + '%');
  const triggeredFixed = useTransform(triggeredValue, (v) => v.toFixed(2));
  const linkedFixed = useTransform(linkedValue, (v) => v.toFixed(2));
  const combinedFixed = useTransform(combinedValue, (v) => v.toFixed(2));

  return (
    <div
      className={`
        pointer-events-none fixed inset-x-0 bottom-4 hidden overflow-clip font-mono text-[10px] select-none
        lg:flex lg:flex-col lg:items-center lg:gap-2
      `}
    >
      <div className={cn(`grid w-200 grid-cols-[repeat(5,auto)] gap-6`)}>
        <p>
          <span className="opacity-70">Scroll: </span>
          <motion.span className="opacity-90">{scrollProgressFixed}</motion.span>
        </p>
        <p>
          <span className="opacity-70">Triggered: </span>
          <motion.span className="text-cyan-400 opacity-90">{triggeredFixed}</motion.span>
        </p>
        <p>
          <span className="opacity-70">Linked: </span>
          <motion.span className="text-cyan-400 opacity-90">{linkedFixed}</motion.span>
        </p>
        <p>
          <span className="opacity-70">Combined: </span>
          <motion.span className="opacity-90">{combinedFixed}</motion.span>
        </p>
        <p>
          <span className="opacity-70">Active: </span>
          <span className="opacity-90">{activeCard + 1}</span>
        </p>
      </div>
    </div>
  );
};
