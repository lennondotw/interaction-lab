import Lenis from 'lenis';
import { cancelFrame, frame, type FrameData } from 'motion/react';
import { useEffect } from 'react';

// Lenis defaults to 0.1, which still leaves a 200px single-frame step when 2000px remain to
// travel. A firmer lerp keeps the remapped layer closer to the raw input without giving up the
// reason Lenis is here: routing the scroll offset through the main thread.
const SMOOTH_SCROLL_LERP = 0.14;

export type StickyScrollDriver =
  /** Native scroll: the compositor owns the sticky offset, the main thread owns the compensation. */
  | 'native'
  /** Lenis writes the scroll offset, and smooths the input on the way through. */
  | 'lenis'
  /** Lenis writes the scroll offset, but maps input onto it 1:1. */
  | 'lenis-unsmoothed';

// Flattens the two pipelines the sticky remap otherwise straddles. Lenis writes the document
// scroll offset itself, so the native sticky layout and the compensation transform both derive
// from a value the main thread produced this frame, instead of the compositor's scroll offset
// racing a main-thread transform commit. See README.md.
export const useLenisScrollDriver = (driver: StickyScrollDriver) => {
  useEffect(() => {
    if (driver === 'native') return;

    const lenis = new Lenis({
      // `autoRaf: false` because two independent frame loops would reintroduce the desync in a
      // milder form: registration order would decide whether the scroll measurement below sees
      // this frame's offset or the previous one, while the sticky layout always sees this frame's.
      autoRaf: false,
      // Lenis's `Animate.advance` jumps straight to its target when neither `lerp` nor `duration`
      // is set, so `lerp: 0` separates the two things Lenis does. The offset still tracks input
      // 1:1, but it is still written from the frame loop below — and only that second half is what
      // the remap needs. This mode is the control that demonstrates it.
      lerp: driver === 'lenis-unsmoothed' ? 0 : SMOOTH_SCROLL_LERP,
    });
    // Motion's `setup` step runs before every `read` job of the same frame, and `useScroll`
    // measures in `read` — so advancing Lenis here guarantees the offset it writes is the offset
    // the compensation is computed from.
    const advance = ({ timestamp }: FrameData) => {
      lenis.raf(timestamp);
    };

    frame.setup(advance, true);

    return () => {
      cancelFrame(advance);
      lenis.destroy();
    };
  }, [driver]);
};
