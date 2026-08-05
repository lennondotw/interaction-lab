import { animate, ValueTransition } from 'motion';
import { useMotionValue, useTransform, useVelocity } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SPRING_PARAMS } from './constants.js';
import { segmentGraphemes } from './segmenter.js';
import { SpringBufferContextValue } from './spring-buffer-provider-interface.js';
import { useQuantizedVelocityRaf } from './use-quantized-velocity.js';

export const useSpringBuffer = (): SpringBufferContextValue => {
  const [visualDuration, setVisualDurationInternal] = useState<number>(SPRING_PARAMS.VISUAL_DURATION.DEFAULT);

  // motion values
  const contentMV = useMotionValue<string>('');
  const contentGraphemeSegmentsMV = useTransform(() => segmentGraphemes(contentMV.get()));
  const contentGraphemeLengthMV = useTransform(() => {
    return contentGraphemeSegmentsMV.get().length;
  });

  // MARK: ANIMATION DRIVER
  const cursorGraphemeIndexSpringMVRaw = useMotionValue<number>(contentGraphemeLengthMV.get());

  // eslint-disable-next-line react-hooks/refs
  contentGraphemeLengthMV.on('change', () =>
    retune({ type: 'spring', bounce: 0, restDelta: 0.1, restSpeed: 0.01, visualDuration: visualDuration })
  );

  const cursorGraphemeIndexSpringMV = useTransform(() => {
    return Math.round(cursorGraphemeIndexSpringMVRaw.get());
  });

  const cursorUTF16IndexSpringMV = useTransform(() => {
    return contentGraphemeSegmentsMV.get().slice(0, cursorGraphemeIndexSpringMV.get()).join('').length;
  });

  const renderedValueSpringMV = useTransform(() => {
    return contentMV.get().slice(0, cursorUTF16IndexSpringMV.get());
  });

  const bufferValueSpringMV = useTransform(() => {
    return contentMV.get().slice(cursorUTF16IndexSpringMV.get());
  });

  const cursorVelocityMVRaw = useVelocity(cursorGraphemeIndexSpringMVRaw);
  const cursorVelocityMV = useQuantizedVelocityRaf(cursorVelocityMVRaw);

  // MARK: ACTIONS

  const controlsRef = useRef<ReturnType<typeof animate> | null>(null);

  const retune = useCallback(
    (nextConfig: ValueTransition) => {
      const vel = cursorGraphemeIndexSpringMVRaw.getVelocity() || 0;
      controlsRef.current?.stop();
      controlsRef.current = animate(cursorGraphemeIndexSpringMVRaw, contentGraphemeLengthMV.get(), {
        ...nextConfig,
        velocity: vel, // keep current velocity
      });
    },
    [contentGraphemeLengthMV, cursorGraphemeIndexSpringMVRaw]
  );

  useEffect(() => () => controlsRef.current?.stop(), []);

  const setVisualDuration = useCallback(
    (v: number) => {
      setVisualDurationInternal(v);
      retune({ type: 'spring', bounce: 0, restDelta: 0.1, restSpeed: 0.01, visualDuration: v });
    },
    [retune]
  );

  const append = useCallback(
    (suffix: string) => {
      const newContent = contentMV.get() + suffix;
      contentMV.set(newContent);
    },
    [contentMV]
  );

  const flush = useCallback(() => {
    const vel = cursorGraphemeIndexSpringMVRaw.getVelocity() || 0;
    retune({
      type: 'inertia',
      velocity: vel,
      restDelta: 0.1,
      restSpeed: 0.01,
      timeConstant: 80,
      modifyTarget: () => contentGraphemeLengthMV.get(),
    });
  }, [contentGraphemeLengthMV, cursorGraphemeIndexSpringMVRaw, retune]);

  const clear = useCallback(() => {
    controlsRef.current?.stop();
    contentMV.jump('');
    contentGraphemeSegmentsMV.jump([]);
    contentGraphemeLengthMV.jump(0);
    cursorGraphemeIndexSpringMVRaw.jump(0);
    cursorGraphemeIndexSpringMV.jump(0);
    cursorUTF16IndexSpringMV.jump(0);
    renderedValueSpringMV.jump('');
    bufferValueSpringMV.jump('');
    cursorVelocityMVRaw.jump(0);
    cursorVelocityMV.jump(0);
  }, [
    contentMV,
    contentGraphemeSegmentsMV,
    contentGraphemeLengthMV,
    cursorGraphemeIndexSpringMVRaw,
    cursorGraphemeIndexSpringMV,
    cursorUTF16IndexSpringMV,
    renderedValueSpringMV,
    bufferValueSpringMV,
    cursorVelocityMVRaw,
    cursorVelocityMV,
  ]);

  const value: SpringBufferContextValue = {
    visualDuration,
    setVisualDuration,

    contentMV,
    contentGraphemeSegmentsMV,
    contentGraphemeLengthMV,
    cursorGraphemeIndexSpringMV,
    cursorUTF16IndexSpringMV,
    renderedValueSpringMV,
    bufferValueSpringMV,
    cursorVelocityMV,

    append,
    flush,
    clear,
  };

  return value;
};
