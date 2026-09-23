import {
  use,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react';

import { assignRef, ScrollAnchorContext } from './scroll-anchor-context.js';
import { useScrollAnchor, type ScrollAnchorHandle, type ScrollAnchorOptions } from './use-scroll-anchor.js';

export interface ScrollAnchorProps extends ScrollAnchorOptions {
  ref?: Ref<ScrollAnchorHandle>;
  children?: ReactNode;
}

/**
 * Headless root: owns intent and programmatic scrolling for the viewport and
 * content rendered by `ScrollAnchorViewport` and `ScrollAnchorContent`, whenever
 * they mount. Renders no element of its own; the host supplies every style.
 */
export function ScrollAnchor({ ref, children, ...options }: ScrollAnchorProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const handle = useScrollAnchor(viewport, content, options);
  useImperativeHandle(ref, () => handle, [handle]);
  const context = useMemo(() => ({ setViewport, setContent }), []);
  return <ScrollAnchorContext value={context}>{children}</ScrollAnchorContext>;
}

function useScrollAnchorContext(part: string) {
  const context = use(ScrollAnchorContext);
  if (!context) throw new Error(`${part} must render inside ScrollAnchor.`);
  return context;
}

export interface ScrollAnchorViewportProps extends ComponentPropsWithoutRef<'div'> {
  ref?: Ref<HTMLDivElement>;
}

/**
 * The scrolling element. Native scroll anchoring is disabled because the
 * controller owns compensation; everything else is left to the host's styles.
 */
export function ScrollAnchorViewport({ ref, style, ...props }: ScrollAnchorViewportProps) {
  const { setViewport } = useScrollAnchorContext('ScrollAnchorViewport');
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setViewport(node);
      assignRef(ref, node);
    },
    [setViewport, ref]
  );
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scroll region needs keyboard access.
      tabIndex={0}
      {...props}
      ref={setRef}
      data-slot="scroll-anchor-viewport"
      style={{ overflowY: 'auto', overflowAnchor: 'none', ...style }}
    />
  );
}

export interface ScrollAnchorContentProps extends ComponentPropsWithoutRef<'div'> {
  ref?: Ref<HTMLDivElement>;
}

/** The measured content box. Its direct children are the rows a reading anchor can attach to. */
export function ScrollAnchorContent({ ref, ...props }: ScrollAnchorContentProps) {
  const { setContent } = useScrollAnchorContext('ScrollAnchorContent');
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setContent(node);
      assignRef(ref, node);
    },
    [setContent, ref]
  );
  return <div {...props} ref={setRef} data-slot="scroll-anchor-content" />;
}
