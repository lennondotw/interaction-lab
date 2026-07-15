import { cn } from '@monorepo/utils';
import type { CSSProperties, FC } from 'react';

interface NativeScrollRulerProps {
  className?: string;
  side?: 'left' | 'right';
}

const getTickX = ({ side, width }: { side: 'left' | 'right'; width: number }) => (side === 'left' ? 0 : 34 - width);

const getRulerMaskImage = (side: 'left' | 'right') =>
  `url("data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="512" viewBox="0 0 34 512">
  <rect x="${getTickX({ side, width: 34 })}" y="0" width="34" height="5" fill="black" fill-opacity="1" />
  <rect x="${getTickX({ side, width: 10 })}" y="64" width="10" height="2" fill="black" fill-opacity="0.38" />
  <rect x="${getTickX({ side, width: 20 })}" y="128" width="20" height="3" fill="black" fill-opacity="0.57" />
  <rect x="${getTickX({ side, width: 10 })}" y="192" width="10" height="2" fill="black" fill-opacity="0.38" />
  <rect x="${getTickX({ side, width: 20 })}" y="256" width="20" height="3" fill="black" fill-opacity="0.57" />
  <rect x="${getTickX({ side, width: 10 })}" y="320" width="10" height="2" fill="black" fill-opacity="0.38" />
  <rect x="${getTickX({ side, width: 20 })}" y="384" width="20" height="3" fill="black" fill-opacity="0.57" />
  <rect x="${getTickX({ side, width: 10 })}" y="448" width="10" height="2" fill="black" fill-opacity="0.38" />
</svg>
`)}")`;

const getRulerStyle = (side: 'left' | 'right') => {
  const rulerMaskImage = getRulerMaskImage(side);

  return {
    backgroundColor: 'rgb(var(--orbit-ruler-tick) / 0.42)',
    maskImage: rulerMaskImage,
    maskPosition: `${side} top`,
    maskRepeat: 'repeat-y',
    maskSize: '34px 512px',
    WebkitMaskImage: rulerMaskImage,
    WebkitMaskPosition: `${side} top`,
    WebkitMaskRepeat: 'repeat-y',
    WebkitMaskSize: '34px 512px',
  } satisfies CSSProperties;
};

export const NativeScrollRuler: FC<NativeScrollRulerProps> = ({ className, side = 'right' }) => (
  <div
    aria-hidden="true"
    className={cn(
      `
        pointer-events-none
        [--orbit-ruler-tick:0_0_0]
        dark:[--orbit-ruler-tick:255_255_255]
      `,
      className
    )}
    data-native-scroll-ruler={side}
    style={getRulerStyle(side)}
  />
);
