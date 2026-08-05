import { MotionValue, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useCallback } from 'react';
import { expDecayGaussian } from './decay.js';

export interface UseLiquidStretchConfig {
  maxMoveX?: number;
  maxMoveY?: number;
  maxStretchX?: number;
  maxStretchY?: number;
}

export interface UseLiquidStretchResult {
  normalizedTranslateX: MotionValue<number>;
  normalizedTranslateY: MotionValue<number>;
  translateX: MotionValue<string>;
  translateY: MotionValue<string>;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  updateNormalizedPanOffset: (normalizedOffsetX: number, normalizedOffsetY: number) => void;
  release: () => void;
}

/**
 * Hook for creating a liquid stretch effect.
 *
 * **Important**: When using the returned values, you must apply transforms in this order:
 *
 * 1. First apply `translate` (translateX, translateY)
 * 2. Then apply `scale` (scaleX, scaleY)
 *
 * That is the order Motion serialises — `translateX(…) scaleX(…)` — and CSS composes
 * a transform list as `T · S`, so a point maps to `s * x + t`: the translate is *not*
 * multiplied by the scale. `t` is therefore already in unscaled units and is returned
 * as-is. Measured: `translateX(10%) scaleX(2)` on a 200px box moves the centre 20px,
 * not 40px.
 *
 * So do **not** run these values through `./transform-utils.js` on the way out. That
 * module converts between the two parameterisations correctly, but the conversion is not
 * wanted here — see its module docblock for which CSS orderings do need it.
 */
export const useLiquidStretch = (config: UseLiquidStretchConfig = {}): UseLiquidStretchResult => {
  const { maxStretchX = 0.25, maxStretchY = 0.25, maxMoveX = 0.15, maxMoveY = 0.15 } = config;

  if (maxStretchX < 0 || maxStretchY < 0) {
    throw new Error('maxStretchX and maxStretchY must not be less than 0');
  }

  if (maxMoveX < 0 || maxMoveY < 0) {
    throw new Error('maxMoveX and maxMoveY must not be less than 0');
  }

  const inputOffsetX = useMotionValue(0);
  const inputOffsetY = useMotionValue(0);

  const updatePanOffset = useCallback(
    (newOffsetX: number, newOffsetY: number) => {
      inputOffsetX.set(newOffsetX);
      inputOffsetY.set(newOffsetY);
    },
    [inputOffsetX, inputOffsetY]
  );

  const release = useCallback(() => {
    inputOffsetX.set(0);
    inputOffsetY.set(0);
  }, [inputOffsetX, inputOffsetY]);

  const distance = useTransform(() => {
    return Math.sqrt(inputOffsetX.get() ** 2 + inputOffsetY.get() ** 2);
  });

  const decayedDistance = useTransform(() => {
    // return 1 - expoDecay(distance.get(), 0.3);
    return 1 - expDecayGaussian(distance.get(), 0.1);
  });

  const decayRatio = useTransform(() => {
    if (Math.abs(distance.get()) < 0.001) {
      return 0;
    }
    return decayedDistance.get() / distance.get();
  });

  const decayedOffsetX = useTransform(() => {
    return inputOffsetX.get() * decayRatio.get();
  });
  const decayedOffsetY = useTransform(() => {
    return inputOffsetY.get() * decayRatio.get();
  });

  const animatedDecayedOffsetX = useSpring(decayedOffsetX, {
    stiffness: 300,
    damping: 15,
    mass: 0.6,
    restDelta: 0.001,
    restSpeed: 0.01,
  });
  const animatedDecayedOffsetY = useSpring(decayedOffsetY, {
    stiffness: 300,
    damping: 15,
    mass: 0.6,
    restDelta: 0.001,
    restSpeed: 0.01,
  });

  const deltaScaleX = useTransform(() => {
    return animatedDecayedOffsetX.get() * maxStretchX;
  });
  const deltaScaleY = useTransform(() => {
    return animatedDecayedOffsetY.get() * maxStretchY;
  });

  const scaleX = useTransform(() => {
    return 1 + Math.abs(deltaScaleX.get());
  });
  const scaleY = useTransform(() => {
    return 1 + Math.abs(deltaScaleY.get());
  });

  const translateX = useTransform(() => {
    return deltaScaleX.get() / 2;
  });
  const translateY = useTransform(() => {
    return deltaScaleY.get() / 2;
  });

  const extraTranslateX = useTransform(() => {
    return maxMoveX * animatedDecayedOffsetX.get();
  });
  const extraTranslateY = useTransform(() => {
    return maxMoveY * animatedDecayedOffsetY.get();
  });

  const totalTranslateX = useTransform(() => {
    return translateX.get() + extraTranslateX.get();
  });
  const totalTranslateY = useTransform(() => {
    return translateY.get() + extraTranslateY.get();
  });

  const totalTranslateXPercent = useTransform(() => {
    return `${totalTranslateX.get() * 100}%`;
  });
  const totalTranslateYPercent = useTransform(() => {
    return `${totalTranslateY.get() * 100}%`;
  });

  return {
    scaleX,
    scaleY,
    normalizedTranslateX: totalTranslateX,
    normalizedTranslateY: totalTranslateY,
    translateX: totalTranslateXPercent,
    translateY: totalTranslateYPercent,
    updateNormalizedPanOffset: updatePanOffset,
    release,
  };
};
