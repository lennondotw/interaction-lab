import { cn } from '@monorepo/utils';
import { useIntervalEffect } from '@react-hookz/web';
import { motion, useAnimationFrame } from 'motion/react';
import { FC, useRef, useState } from 'react';

export const FpsIndicator: FC<{ className?: string; defaultShowAnimation?: boolean }> = ({
  className,
  defaultShowAnimation = false,
}) => {
  const framesRef = useRef<{ relativeTime: number }[]>([]);
  const [fps, setFps] = useState(0);
  const [showAnimation, setShowAnimation] = useState(defaultShowAnimation);

  useAnimationFrame(() => {
    framesRef.current = framesRef.current.filter((frame) => frame.relativeTime > performance.now() - 1000);
    framesRef.current.push({ relativeTime: performance.now() });
  });

  useIntervalEffect(() => {
    setFps(framesRef.current.length);
  }, 100);

  return (
    <div
      className={cn(
        `
          flex size-fit flex-col items-stretch gap-3 bg-red-500/50 p-2 font-mono text-xs text-black
          dark:text-white
        `,
        className
      )}
      // A toggle, so it needs to be reachable and operable without a pointer.
      // Not a <button>: the panel holds a <style> element and nested divs, which
      // are not valid button content.
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={0}
      aria-pressed={showAnimation}
      onClick={() => setShowAnimation((v) => !v)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setShowAnimation((v) => !v);
        }
      }}
    >
      {showAnimation && (
        <div className="flex flex-col gap-2">
          <style>{`
            @keyframes left-to-right-position {
              from { left: 0; }
              to { left: 4.25rem; }
            }
            @keyframes left-to-right-transform {
              from { transform: translateX(0); }
              to { transform: translateX(4.25rem); }
            }
        `}</style>
          <div className="flex flex-row items-center gap-2">
            <div className="relative h-3 w-20">
              <motion.div
                animate={{ left: ['0', '4.25rem', '0'] }}
                transition={{ duration: 1, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }}
                className={`
                  absolute top-0 aspect-square h-full rounded-full bg-black
                  dark:bg-white
                `}
              />
            </div>
            <div>JS rAF</div>
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="relative h-3 w-20">
              <div
                className={`
                  absolute top-0 aspect-square h-full
                  animate-[0.5s_ease-in-out_infinite_alternate_left-to-right-position] rounded-full bg-black
                  dark:bg-white
                `}
              />
            </div>
            <div>CSS Layout</div>
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="relative h-3 w-20">
              <div
                className={`
                  absolute top-0 aspect-square h-full
                  animate-[0.5s_ease-in-out_infinite_alternate_left-to-right-transform] rounded-full bg-black
                  dark:bg-white
                `}
              />
            </div>
            <div>CSS Transform</div>
          </div>
        </div>
      )}

      <div>
        {fps} FPS {showAnimation ? '(JS rAF)' : ''}
      </div>
    </div>
  );
};
