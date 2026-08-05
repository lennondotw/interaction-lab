import { MotionValue, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import { RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  CARD_COUNT,
  CARD_HEIGHT_SVH,
  CARD_UNIT_SVH,
  SCROLL_PER_CARD_PX,
  TRIGGER_COUNT,
  TRIGGER_ZONE_HIGH,
  TRIGGER_ZONE_LOW,
} from './constants.js';
import { useTickSound } from './use-tick-sound.js';

// Configurable weights for mixing triggered (discrete) and linked (continuous) values
const TRIGGERED_WEIGHT = 0.8;
const LINKED_WEIGHT = 0.2;

export interface DigitalCrownState {
  // Refs
  contentRef: RefObject<HTMLDivElement | null>;
  placeholderRef: RefObject<HTMLDivElement | null>;

  // Motion values
  scrollProgress: MotionValue<number>;
  triggeredValue: MotionValue<number>;
  linkedValue: MotionValue<number>;
  combinedValue: MotionValue<number>;
  cardY: MotionValue<number>;

  // State
  activeCard: number;
  flashingForward: Set<number>;
  flashingBackward: Set<number>;

  // Audio
  isMuted: boolean;
  unmute: () => Promise<void>;
  mute: () => void;

  // Utilities
  getTotalScrollHeight: () => number;
}

export function useDigitalCrown(scrollContainerRef: RefObject<HTMLDivElement | null>): DigitalCrownState {
  const contentRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [flashingForward, setFlashingForward] = useState<Set<number>>(new Set());
  const [flashingBackward, setFlashingBackward] = useState<Set<number>>(new Set());
  const [activeCard, setActiveCard] = useState(0);

  const { scrollY } = useScroll({ container: scrollContainerRef });
  const { playTick, isMuted, unmute, mute } = useTickSound();

  // Track viewport height as a motion value to trigger cardY recalculation on resize
  const viewportHeight = useMotionValue(typeof window !== 'undefined' ? window.innerHeight : 0);

  // Calculate total scroll height: (N-1) cards * SCROLL_PER_CARD_PX
  // For 10 cards with 100px/card, total scroll = 9 * 100px = 900px
  const getTotalScrollHeight = useCallback(() => {
    return (CARD_COUNT - 1) * SCROLL_PER_CARD_PX;
  }, []);

  // Normalize scroll position to 0-1 range
  const scrollProgress = useTransform(scrollY, (value) => {
    const totalHeight = getTotalScrollHeight();
    return Math.min(Math.max(value / totalHeight, 0), 1);
  });

  // Triggered part - which "detent" we're at (0-9), with spring animation
  const triggeredRaw = useMotionValue(0);
  const triggeredValue = useSpring(triggeredRaw, {
    stiffness: 400,
    damping: 40,
    mass: 0.2,
  });

  // Track for hysteresis
  const currentDetentRef = useRef(0);

  // Handle trigger detection - optimized for crossing multiple triggers in one frame
  useMotionValueEvent(scrollProgress, 'change', (progress) => {
    const previousProgress = scrollProgress.getPrevious();
    if (previousProgress === undefined) return;

    const segmentSize = 1 / TRIGGER_COUNT;
    const currentDetent = currentDetentRef.current;
    let newDetent = currentDetent;
    const crossedTriggers: number[] = [];
    let direction: 'forward' | 'backward' | null = null;

    if (progress > previousProgress) {
      // Scrolling forward (down) - collect all crossed triggers
      for (let i = currentDetent; i < TRIGGER_COUNT; i++) {
        const segmentStart = i * segmentSize;
        const triggerHigh = segmentStart + segmentSize * TRIGGER_ZONE_HIGH;
        if (progress > triggerHigh) {
          newDetent = i + 1;
          crossedTriggers.push(i);
          direction = 'forward';
        } else {
          break;
        }
      }
    } else if (progress < previousProgress) {
      // Scrolling backward (up) - collect all crossed triggers
      for (let i = currentDetent - 1; i >= 0; i--) {
        const segmentStart = i * segmentSize;
        const triggerLow = segmentStart + segmentSize * TRIGGER_ZONE_LOW;
        if (progress < triggerLow) {
          newDetent = i;
          crossedTriggers.push(i);
          direction = 'backward';
        } else {
          break;
        }
      }
    }

    // Only update if we actually crossed triggers
    if (newDetent !== currentDetent && crossedTriggers.length > 0) {
      currentDetentRef.current = newDetent;
      // Set via triggeredRaw, spring config is applied through useSpring
      triggeredRaw.set(newDetent);
      setActiveCard(newDetent);

      // Flash all crossed triggers
      if (direction === 'forward') {
        setFlashingForward(new Set(crossedTriggers));
        setTimeout(() => setFlashingForward(new Set()), 200);
      } else {
        setFlashingBackward(new Set(crossedTriggers));
        setTimeout(() => setFlashingBackward(new Set()), 200);
      }

      playTick();
    }
  });

  // Linked part - continuous value from 0 to TRIGGER_COUNT (monotonic)
  const linkedValue = useTransform(scrollProgress, (value) => {
    return value * TRIGGER_COUNT;
  });

  // Combined Y position for cards
  // Maps scrollY to cardY such that each card is centered when scrolled to its position
  // Card i is centered when scrollY = i * SCROLL_PER_CARD_PX
  // cardY = (50 - CARD_HEIGHT_SVH/2 - cardIndex * CARD_UNIT_SVH) * svh
  const cardY = useTransform(() => {
    // Read viewportHeight to subscribe to resize updates
    const svh = viewportHeight.get() / 100;
    const triggered = triggeredValue.get();
    const linked = linkedValue.get();
    // Mix triggered (spring animated discrete) and linked (continuous) for the "detent" feel
    const cardIndex = triggered * TRIGGERED_WEIGHT + linked * LINKED_WEIGHT;
    // Calculate Y to center the card at cardIndex
    // 50svh is viewport center, CARD_HEIGHT_SVH/2 offsets to card center
    // Then subtract cardIndex * CARD_UNIT_SVH to move to the right card
    return (50 - CARD_HEIGHT_SVH / 2 - cardIndex * CARD_UNIT_SVH) * svh;
  });

  // Combined value for display
  const combinedValue = useTransform(() => {
    const triggered = triggeredValue.get();
    const linked = linkedValue.get();
    return triggered * TRIGGERED_WEIGHT + linked * LINKED_WEIGHT;
  });

  // Update viewport height and placeholder height on resize
  // Page height = 100svh + (N-1) * SCROLL_PER_CARD_PX
  useLayoutEffect(() => {
    const handleResize = () => {
      // Update viewport height motion value to trigger cardY recalculation
      viewportHeight.set(window.innerHeight);

      // Update placeholder height
      const placeholder = placeholderRef.current;
      if (!placeholder) return;
      const totalScrollHeight = getTotalScrollHeight();
      placeholder.style.height = `calc(100svh + ${totalScrollHeight}px)`;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [getTotalScrollHeight, viewportHeight]);

  return {
    contentRef,
    placeholderRef,
    scrollProgress,
    triggeredValue,
    linkedValue,
    combinedValue,
    cardY,
    activeCard,
    flashingForward,
    flashingBackward,
    isMuted,
    unmute,
    mute,
    getTotalScrollHeight,
  };
}
