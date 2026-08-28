import { cn } from '@monorepo/utils';
import { motion } from 'motion/react';
import { FC } from 'react';

const canvasWidth = 600;
const canvasHeight = 600;
const ballRadius = 60;

interface Ball {
  id: number;
  initialX: number;
  initialY: number;
  color: string;
}

const balls: Ball[] = [
  { id: 1, initialX: 200, initialY: 200, color: '#3b82f6' },
  { id: 3, initialX: 400, initialY: 200, color: '#ec4899' },
  { id: 4, initialX: 400, initialY: 400, color: 'currentColor' },
  { id: 5, initialX: 200, initialY: 400, color: 'currentColor' },
];

export const SdfEffect: FC<{ className?: string }> = ({ className }) => {
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
      <div className="text-center text-sm text-neutral-500">Drag the balls to see the metaball liquid effect</div>
      <div
        style={{ width: canvasWidth, height: canvasHeight }}
        className={cn(
          `
            relative rounded-2xl bg-neutral-900/5
            dark:bg-neutral-800/50
          `
        )}
      >
        <svg
          width={canvasWidth}
          height={canvasHeight}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="absolute inset-0"
        >
          <defs>
            {/* Metaball filter using blur and color matrix */}
            <filter id="metaball-filter" x="-50%" y="-50%" width="200%" height="200%">
              {/* Blur to create soft edges */}
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
              {/* Color matrix to create sharp edges from blur - this is the key to metaball effect */}
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="
                  1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 20 -8
                "
                result="metaball"
              />
            </filter>
          </defs>

          {/* Group with metaball filter applied */}
          <g filter="url(#metaball-filter)">
            {balls.map((ball) => (
              <MetaballCircle
                key={ball.id}
                initialX={ball.initialX}
                initialY={ball.initialY}
                radius={ballRadius}
                color={ball.color}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

interface MetaballCircleProps {
  initialX: number;
  initialY: number;
  radius: number;
  color: string;
}

const MetaballCircle: FC<MetaballCircleProps> = ({ initialX, initialY, radius, color }) => {
  return (
    <motion.circle
      cx={initialX}
      cy={initialY}
      r={radius}
      fill={color}
      drag
      dragConstraints={{
        left: radius - initialX + 10,
        right: canvasWidth - radius - initialX - 10,
        top: radius - initialY + 10,
        bottom: canvasHeight - radius - initialY - 10,
      }}
      className={`
        cursor-grab
        active:cursor-grabbing
      `}
    />
  );
};
