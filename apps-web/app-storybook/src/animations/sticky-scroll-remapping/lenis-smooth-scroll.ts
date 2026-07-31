import Lenis from 'lenis';
import { cancelFrame, frame, type FrameData } from 'motion/react';
import { useEffect } from 'react';

// Lenis defaults to 0.1, which still leaves a 200px single-frame step when 2000px remain to
// travel. A firmer lerp keeps the remapped layer closer to the raw input without giving up the
// reason Lenis is here: routing the scroll offset through the main thread.
const SMOOTH_SCROLL_LERP = 0.14;

// Flattens the two pipelines the sticky remap otherwise straddles. Lenis writes the document
// scroll offset itself, so the native sticky layout and the compensation transform both derive
// from a value the main thread produced this frame, instead of the compositor's scroll offset
// racing a main-thread transform commit. See README.md.
export const useLenisSmoothScroll = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;

    // `autoRaf: false` because two independent frame loops would reintroduce the desync in a
    // milder form: registration order would decide whether the scroll measurement below sees this
    // frame's offset or the previous one, while the sticky layout always sees this frame's.
    const lenis = new Lenis({ autoRaf: false, lerp: SMOOTH_SCROLL_LERP });
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
  }, [enabled]);
};
