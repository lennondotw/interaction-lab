import { cn } from '@monorepo/utils';
import { motion, MotionValue } from 'motion/react';
import { FC, RefObject } from 'react';
import { CARD_COUNT, CARD_GAP_SVH, CARD_HEIGHT_SVH, getCardGradient } from './constants.js';

interface CardStackProps {
  contentRef: RefObject<HTMLDivElement | null>;
  cardY: MotionValue<number>;
  activeCard: number;
}

export const CardStack: FC<CardStackProps> = ({ contentRef, cardY, activeCard }) => {
  return (
    <motion.div
      ref={contentRef}
      className="absolute inset-x-0 top-0 flex flex-col items-center"
      style={{
        y: cardY,
        gap: `${CARD_GAP_SVH}svh`,
      }}
    >
      {/* No spacers - cardY transform handles centering directly */}
      {Array.from({ length: CARD_COUNT }, (_, i) => (
        <div
          key={i}
          className={cn(
            `
              flex w-[calc(100svw-6svh)] max-w-400 shrink-0 items-center justify-center rounded-3xl bg-linear-to-br
              font-bold text-white/90 shadow-2xl transition-opacity duration-200
              lg:w-220
            `,
            getCardGradient(i),
            activeCard !== i && 'opacity-30'
          )}
          style={{
            height: `${CARD_HEIGHT_SVH}svh`,
            fontSize: 'clamp(4rem, 15svw, 10rem)',
          }}
        >
          {i + 1}
        </div>
      ))}
    </motion.div>
  );
};
