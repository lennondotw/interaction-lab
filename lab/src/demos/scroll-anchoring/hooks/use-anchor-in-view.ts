import { useCallback, useLayoutEffect, useRef } from 'react';
import { useEventCallback } from 'usehooks-ts';
import { deduplicate } from '../utils/deduplicate.js';

export type AnchoringMode = 'top' | 'bottom';

const selectAnchorElement = (elements: Element[], anchoringMode: AnchoringMode): Element | null => {
  let minTop = Infinity;
  let maxTop = -Infinity;
  let currentTopElement: Element | null = null;
  let currentBottomElement: Element | null = null;
  elements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < minTop) {
      minTop = rect.top;
      currentTopElement = element;
    }
    if (rect.top > maxTop) {
      maxTop = rect.top;
      currentBottomElement = element;
    }
  });
  return anchoringMode === 'top' ? currentTopElement : currentBottomElement;
};

const getPotentialAnchorElements = (container: Element, id: string): Element[] => {
  const subtreeContainerIds = deduplicate(
    Array.from(container.querySelectorAll(`[data-scroll-container-id]:where([data-scroll-container-id="${id}"] *)`))
      .map((element) => element.getAttribute('data-scroll-container-id'))
      .filter((id): id is Exclude<typeof id, null> => id !== null)
      .filter((id) => !!id)
  );
  const anchorElements = Array.from(
    container.querySelectorAll(
      `[data-scroll-anchor]:where([data-scroll-container-id="${id}"] *)` +
        subtreeContainerIds.map((id) => `:not(:where([data-scroll-container-id="${id}"] *))`).join('')
    )
  );
  return anchorElements;
};

interface UseAnchorInViewContainer {
  containerId: string;
}

type UseAnchorInViewProps = {
  onPotentialAnchorsChange?: (anchorElements: Element[]) => void;
  onAnchorsInViewChange?: (anchorElements: Element[]) => void;
  onActiveAnchorChange?: (anchorElement: Element | null, previousAnchorElement: Element | null) => void;
  defaultAnchoringMode?: AnchoringMode;
} & UseAnchorInViewContainer;

const observeAnchorElementsIntersection = (
  elements: Element[],
  root: Element,
  onIntersectionChange: (intersectingElements: Element[]) => void
) => {
  const intersectingElements = new Set<Element>();
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          intersectingElements.add(entry.target);
        } else {
          intersectingElements.delete(entry.target);
        }
      });
      onIntersectionChange(Array.from(intersectingElements));
    },
    { root, threshold: [0], rootMargin: '0px' }
  );
  elements.forEach((element) => {
    intersectionObserver.observe(element);
  });
  return () => {
    intersectionObserver.disconnect();
    intersectingElements.clear();
  };
};

export const useAnchorInView = (props: UseAnchorInViewProps) => {
  const {
    containerId: id,
    onPotentialAnchorsChange: rawOnPotentialAnchorsChange,
    onAnchorsInViewChange: rawOnAnchorsInViewChange,
    onActiveAnchorChange: rawOnActiveAnchorChange,
    defaultAnchoringMode = 'top',
  } = props;

  const onPotentialAnchorsChange = useEventCallback(rawOnPotentialAnchorsChange);
  const onAnchorsInViewChange = useEventCallback(rawOnAnchorsInViewChange);
  const onActiveAnchorChange = useEventCallback(rawOnActiveAnchorChange);

  const potentialAnchorElementsRef = useRef<Element[]>([]);
  const memoedContainerRef = useRef<Element | null>(null);
  const disconnectIntersectionObserverRef = useRef<(() => void) | null>(() => null);
  const inViewAnchorElementsRef = useRef<Element[]>([]);
  const activeAnchorElementRef = useRef<Element | null>(null);
  const anchoringModeRef = useRef<AnchoringMode>(defaultAnchoringMode);

  const getContainerRef = useCallback((id: string): Element | null => {
    const container = document.querySelector(`[data-scroll-container-id="${id}"]`);
    if (!container) {
      console.error(
        `Container with id ${id} not found. The container is not mounted yet, or the container element does not have the data-scroll-container-id attribute. You should only call getContainerRef in useLayoutEffect.`
      );
      return null;
    }
    memoedContainerRef.current = container;
    return container;
  }, []);

  const handleIntersectedElementsChange = useCallback(
    (intersectedElements: Element[]) => {
      onAnchorsInViewChange?.(intersectedElements);
      inViewAnchorElementsRef.current = intersectedElements;
      const firstIntersectingElement = selectAnchorElement(intersectedElements, anchoringModeRef.current);
      if (!firstIntersectingElement) {
        return;
      }
      const previousAnchorElement = activeAnchorElementRef.current;
      activeAnchorElementRef.current = firstIntersectingElement;
      onActiveAnchorChange?.(firstIntersectingElement, previousAnchorElement);
    },
    [activeAnchorElementRef, onActiveAnchorChange, onAnchorsInViewChange]
  );

  const handlePotentialAnchorElementsRemoval = useCallback(
    (removedElements: Element[]) => {
      const newAnchorsInView = inViewAnchorElementsRef.current.filter((prev) => !removedElements.includes(prev));
      inViewAnchorElementsRef.current = newAnchorsInView;
      onAnchorsInViewChange?.(newAnchorsInView);
      if (activeAnchorElementRef.current !== null && removedElements.includes(activeAnchorElementRef.current)) {
        onActiveAnchorChange?.(null, activeAnchorElementRef.current);
        activeAnchorElementRef.current = null;
      }
    },
    [onActiveAnchorChange, onAnchorsInViewChange]
  );

  const handlePotentialAnchorsChange = useCallback(
    (container: Element, potentialAnchorElements: Element[]) => {
      const removedAnchorElements = potentialAnchorElementsRef.current.filter(
        (prev) => !potentialAnchorElements.includes(prev)
      );
      if (removedAnchorElements.length > 0) {
        handlePotentialAnchorElementsRemoval(removedAnchorElements);
      }
      potentialAnchorElementsRef.current = potentialAnchorElements;
      onPotentialAnchorsChange?.(potentialAnchorElements);
      disconnectIntersectionObserverRef.current?.();
      disconnectIntersectionObserverRef.current = observeAnchorElementsIntersection(
        potentialAnchorElements,
        container,
        (intersectingElements) => {
          handleIntersectedElementsChange(intersectingElements);
        }
      );
    },
    [handleIntersectedElementsChange, handlePotentialAnchorElementsRemoval, onPotentialAnchorsChange]
  );

  // observe anchor elements intersection on first mount
  useLayoutEffect(() => {
    const container = getContainerRef(id);
    if (!container) {
      return;
    }
    const potentialAnchorElements = getPotentialAnchorElements(container, id);
    handlePotentialAnchorsChange(container, potentialAnchorElements);
    return () => {
      disconnectIntersectionObserverRef.current?.();
    };
  }, [getContainerRef, handleIntersectedElementsChange, handlePotentialAnchorsChange, id]);

  // observe subtree element creation / removal / data attribute change, and connect intersection observer
  useLayoutEffect(() => {
    const container = getContainerRef(id);
    if (!container) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      const potentialAnchorElements = getPotentialAnchorElements(container, id);
      handlePotentialAnchorsChange(container, potentialAnchorElements);
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      attributeFilter: ['data-scroll-anchor', 'data-scroll-container-id'],
      characterData: false,
      characterDataOldValue: false,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [
    potentialAnchorElementsRef,
    getContainerRef,
    handleIntersectedElementsChange,
    id,
    onPotentialAnchorsChange,
    handlePotentialAnchorsChange,
  ]);

  const setAnchoringMode = useCallback(
    (anchoringMode: AnchoringMode) => {
      anchoringModeRef.current = anchoringMode;
      handleIntersectedElementsChange(inViewAnchorElementsRef.current);
    },
    [handleIntersectedElementsChange]
  );

  return {
    setAnchoringMode,
  };
};
