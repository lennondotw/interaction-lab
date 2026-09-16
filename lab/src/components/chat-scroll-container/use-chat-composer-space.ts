import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import type { ChatBottomSpace } from './chat-bottom-space.js';

/** Measure after textarea layout effects, then commit clearance and reset intent together. */
export function useChatComposerSpace(composerRef: RefObject<HTMLElement | null>, gap = 0) {
  const [bottomSpace, setBottomSpace] = useState<ChatBottomSpace>({ height: 0 });
  const measured = useRef(bottomSpace);
  const pendingRelease = useRef<symbol | undefined>(undefined);
  const measure = useCallback(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const height = composer.getBoundingClientRect().height + gap;
    const release = pendingRelease.current;
    pendingRelease.current = undefined;
    if (height === measured.current.height && release === undefined) return;
    const next = { height, release };
    measured.current = next;
    setBottomSpace(next);
  }, [composerRef, gap]);

  // This parent effect runs after the textarea's intrinsic-size update. Updating
  // React state here commits the complete measured exchange before the next paint.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const observer = new ResizeObserver(measure);
    observer.observe(composer, { box: 'border-box' });
    return () => observer.disconnect();
  }, [composerRef, measure]);

  const preserveOnReset = useCallback(() => {
    // Several messages in one commit still release composer space only once.
    pendingRelease.current ??= Symbol('composer reset');
  }, []);
  return { bottomSpace, preserveOnReset };
}
