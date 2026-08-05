import { useAnimationFrame } from 'motion/react';
import { RefObject, useCallback, useRef } from 'react';

const getTopPositionRelativeToContent = (element: Element, container: Element, containerId: string): number => {
  const result =
    element.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    getPreciseScrollTop(container, containerId);

  return result;
};

const getPreciseScrollTop = (container: Element, containerId: string): number => {
  const containerAnchor = container.querySelector<HTMLElement>(
    `[data-scroll-container-anchor-id="${containerId}"]:where([data-scroll-container-id="${containerId}"] *)`
  );
  if (!containerAnchor) {
    console.warn('[ScrollAnchoring] container anchor not found, using scrollTop as fallback.');
    return container.scrollTop;
  }
  const scrollTop = container.scrollTop;
  const preciseScrollTop = container.getBoundingClientRect().top - containerAnchor.getBoundingClientRect().top;
  if (Math.abs(scrollTop - preciseScrollTop) > 1) {
    console.warn(
      `[ScrollAnchoring] getPreciseScrollTop returned wrong value, preciseScrollTop: %fpx, scrollTop: %fpx, diff: %fpx.`,
      preciseScrollTop,
      scrollTop,
      preciseScrollTop - scrollTop
    );
  }
  return preciseScrollTop;
};

const scrollToAnchor = (container: Element, containerId: string, previousAnchor: Anchor) => {
  const currentTop = getTopPositionRelativeToContent(previousAnchor.anchor, container, containerId);
  const previousTop = previousAnchor.topPositionRelativeToContent;
  const diffToScroll = currentTop - previousTop;

  if (Math.abs(diffToScroll) < 0.001) {
    console.info('[ScrollAnchoring] no need to scroll, diffToScroll is %fpx.', diffToScroll);
    return;
  }

  const expectedScrollTop = getPreciseScrollTop(container, containerId) + diffToScroll;

  console.info('[ScrollAnchoring] executing active scroll, diff to scroll: %fpx', diffToScroll);
  container.scrollBy({ behavior: 'instant', left: 0, top: diffToScroll });

  const actualScrollTop = getPreciseScrollTop(container, containerId);
  const scrollTopDiscrepancy = actualScrollTop - expectedScrollTop;

  if (Math.abs(scrollTopDiscrepancy) > 0.001) {
    console.warn(
      `[ScrollAnchoring] expected scrollTop is %fpx, got %fpx. discrepancy: %fpx.`,
      expectedScrollTop,
      actualScrollTop,
      scrollTopDiscrepancy
    );

    // setSubpixelCompensation(container, containerId, -visibleTopDiscrepancy);
  }
};

interface Anchor {
  anchor: Element;
  topPositionRelativeToContent: number;
}

export const useScrollAnchoring = ({
  containerRef,
  containerId,
  defaultEnableAnchoring,
}: {
  containerRef: RefObject<HTMLElement | null>;
  containerId: string;
  defaultEnableAnchoring: boolean;
}) => {
  const previousFrameAnchor = useRef<Anchor | null>(null);
  const activeAnchorRef = useRef<Element | null>(null);
  const isAnchoringEnabledRef = useRef(defaultEnableAnchoring);
  const frameCountRef = useRef(0);

  const updateActiveAnchor = useCallback((anchor: Element | null) => {
    activeAnchorRef.current = anchor;
  }, []);

  const enableAnchoring = useCallback(() => {
    isAnchoringEnabledRef.current = true;
  }, []);

  const disableAnchoring = useCallback(() => {
    isAnchoringEnabledRef.current = false;
  }, []);

  const getIsAnchoringEnabled = useCallback(() => {
    return isAnchoringEnabledRef.current;
  }, []);

  useAnimationFrame(() => {
    frameCountRef.current++;
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const active = activeAnchorRef.current;
    if (!previousFrameAnchor.current?.anchor) {
      if (!active) {
        // case 1: previous === null && active === null
        return;
      }
      // case 2: previous === null && active !== null
      previousFrameAnchor.current = {
        anchor: active,
        topPositionRelativeToContent: getTopPositionRelativeToContent(active, container, containerId),
      };
      return;
    }
    if (!active) {
      // case 3: previous !== null && active === null
      // previous.anchor is always truthy in this condition
      if (!container.contains(activeAnchorRef.current)) {
        // has been removed from document or moved to outside of the container
        // so do nothing in current frame, execute anchoring in next frame
        activeAnchorRef.current = null;
        return;
      }
      // previous anchor is still in the container, since the anchor in current frame has changed,
      // we still use the previous anchor in current frame, and this is the last frame we use the previous anchor
      const currentTopPosition = getTopPositionRelativeToContent(
        previousFrameAnchor.current.anchor,
        container,
        containerId
      );
      const diffToScroll = currentTopPosition - previousFrameAnchor.current.topPositionRelativeToContent;
      if (Math.abs(diffToScroll) > 0.001 && getIsAnchoringEnabled()) {
        console.info('[ScrollAnchoring] triggering active scroll, frame count: %d', frameCountRef.current);
        scrollToAnchor(container, containerId, previousFrameAnchor.current);
      }
      activeAnchorRef.current = null;
      return;
    }
    if (previousFrameAnchor.current.anchor !== active) {
      // case 4: previous !== null && active !== null, but previous.anchor !== active
      const currentTopPosition = getTopPositionRelativeToContent(
        previousFrameAnchor.current.anchor,
        container,
        containerId
      );
      const diffToScroll = currentTopPosition - previousFrameAnchor.current.topPositionRelativeToContent;
      if (Math.abs(diffToScroll) > 0.001 && getIsAnchoringEnabled()) {
        console.info('[ScrollAnchoring] triggering active scroll, frame count: %d', frameCountRef.current);
        scrollToAnchor(container, containerId, previousFrameAnchor.current);
      }
      previousFrameAnchor.current = {
        anchor: active,
        topPositionRelativeToContent: getTopPositionRelativeToContent(active, container, containerId),
      };
      return;
    }
    // case 5: previous !== null && active !== null, and previous.anchor === active
    // the anchor is not changed since last frame and both current and previous is not null
    const currentTopPosition = getTopPositionRelativeToContent(
      previousFrameAnchor.current.anchor,
      container,
      containerId
    );
    const diffToScroll = currentTopPosition - previousFrameAnchor.current.topPositionRelativeToContent;
    if (Math.abs(diffToScroll) > 0.001 && getIsAnchoringEnabled()) {
      console.info('[ScrollAnchoring] triggering active scroll, frame count: %d', frameCountRef.current);
      scrollToAnchor(container, containerId, previousFrameAnchor.current);
    }
    previousFrameAnchor.current = {
      anchor: active,
      topPositionRelativeToContent: getTopPositionRelativeToContent(active, container, containerId),
    };
  });

  return { updateActiveAnchor, enableAnchoring, disableAnchoring, getIsAnchoringEnabled };
};
