import { MotionValue } from 'motion/react';

export interface SpringBufferContextValue {
  // params
  visualDuration: number;
  setVisualDuration: (v: number) => void;

  // motion values
  contentMV: MotionValue<string>;
  contentGraphemeSegmentsMV: MotionValue<string[]>;
  contentGraphemeLengthMV: MotionValue<number>;
  cursorGraphemeIndexSpringMV: MotionValue<number>;
  cursorUTF16IndexSpringMV: MotionValue<number>;
  renderedValueSpringMV: MotionValue<string>;
  bufferValueSpringMV: MotionValue<string>;
  cursorVelocityMV: MotionValue<number>;

  // actions
  append: (suffix: string) => void;
  flush: () => void;
  clear: () => void;
}
