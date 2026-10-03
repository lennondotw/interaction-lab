import { cn, createHeldKeyboardShortcuts } from '@monorepo/utils';
import { Plus, X } from 'lucide-react';
import {
  AnimatePresence,
  cancelFrame,
  frame,
  motion,
  useMotionValue,
  usePresence,
  useReducedMotion,
} from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { closeTabWidths } from './tab-close-layout.js';
import { createTabHoverHold, type TabBarHoldState } from './tab-hover-hold.js';
import { createTabSpring } from './tab-spring.js';
import { resolveTabWidths } from './tab-target-layout.js';

// The same 15 / 20 / 40 alpha hierarchy as the time wheel picker's wireframe.
const WIREFRAME_FRAME = 'outline-1 -outline-offset-1 outline-neutral-500/20';
const WIREFRAME_ITEM = 'outline-1 -outline-offset-1 outline-neutral-500/15';
const WIREFRAME_SELECTED = 'outline-1 -outline-offset-1 outline-neutral-500/40 outline-dashed';
const WIREFRAME_CONTROL = 'outline-1 -outline-offset-1 outline-transparent';
const WIREFRAME_FOCUS = 'focus-visible:outline-neutral-500/70';

export interface TabBarItem {
  id: string;
  title: string;
}

export interface TabBarProps {
  tabs: readonly TabBarItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  /** Reports hover/leave-delay transitions for hosts that visualize the hold. */
  onHoldStateChange?: (state: TabBarHoldState) => void;
  className?: string;
}

interface TabFootprint {
  set: (width: number, gap: number, immediate: boolean) => void;
  getTargetWidth: () => number;
}

interface AnimatedTabProps {
  tab: TabBarItem;
  active: boolean;
  onSelect: TabBarProps['onSelect'];
  onClose: TabBarProps['onClose'];
  footprints: Map<string, TabFootprint>;
}

function AnimatedTab({ tab, active, onSelect, onClose, footprints }: AnimatedTabProps) {
  const [isPresent, safeToRemove] = usePresence();
  const elementRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const width = useMotionValue(0);
  const gap = useMotionValue(0);
  const [widthSpring] = useState(() => createTabSpring(width));
  const [gapSpring] = useState(() => createTabSpring(gap));

  useLayoutEffect(() => {
    footprints.set(tab.id, {
      getTargetWidth: () => widthSpring.getTarget(),
      set(nextWidth, nextGap, immediate) {
        widthSpring.set(nextWidth, immediate);
        gapSpring.set(nextGap, immediate);
        if (immediate) {
          // Mount/reduced-motion layout must be visible before the first paint,
          // without waiting for Motion's scheduled style render.
          elementRef.current!.style.width = `${nextWidth}px`;
          elementRef.current!.style.marginLeft = `${nextGap}px`;
        }
      },
    });
    return () => {
      footprints.delete(tab.id);
      widthSpring.stop();
      gapSpring.stop();
    };
  }, [footprints, gapSpring, tab.id, widthSpring]);

  useLayoutEffect(() => {
    const viewport = titleRef.current!;
    const text = viewport.firstElementChild!;
    const measure = () => {
      viewport.toggleAttribute(
        'data-overflow',
        text.getBoundingClientRect().width > viewport.getBoundingClientRect().width
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    measure();
    return () => observer.disconnect();
  }, [tab.title]);

  useLayoutEffect(() => {
    if (isPresent) return;

    const removeIfCollapsed = () => {
      if (width.get() === 0 && gap.get() === 0) safeToRemove();
    };
    // Wait until Motion has rendered both zero footprints before releasing the
    // presence hold. This also covers immediate reduced-motion updates and a tab
    // closed before its first entering frame, without an arbitrary exit timeout.
    const scheduleRemoval = () => frame.postRender(removeIfCollapsed);
    const unsubscribeWidth = width.on('change', scheduleRemoval);
    const unsubscribeGap = gap.on('change', scheduleRemoval);
    scheduleRemoval();
    return () => {
      unsubscribeWidth();
      unsubscribeGap();
      cancelFrame(removeIfCollapsed);
    };
  }, [gap, isPresent, safeToRemove, width]);

  return (
    <motion.div
      ref={elementRef}
      data-tab-id={tab.id}
      data-exiting={!isPresent || undefined}
      inert={!isPresent}
      style={{ width, marginLeft: gap }}
      className={cn(
        'flex h-9 min-w-0 shrink-0 items-center overflow-hidden',
        active ? WIREFRAME_SELECTED : WIREFRAME_ITEM
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={tab.title}
        title={tab.title}
        onClick={() => onSelect(tab.id)}
        className={cn(
          `relative h-full min-w-0 flex-1 overflow-hidden text-left
          before:pointer-events-none before:absolute before:inset-y-px before:right-0 before:w-px before:bg-neutral-500/15`,
          WIREFRAME_CONTROL,
          WIREFRAME_FOCUS
        )}
      >
        <span
          ref={titleRef}
          className="block overflow-clip whitespace-nowrap data-overflow:mask-r-from-[calc(100%-20px)] data-overflow:mask-r-to-100% data-overflow:mask-r-to-black/50"
        >
          <span className="inline-block px-3">{tab.title}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        aria-keyshortcuts={active ? 'Shift+W' : undefined}
        onClick={() => onClose(tab.id)}
        className={cn('flex h-full w-7 min-w-0 shrink items-center justify-center', WIREFRAME_CONTROL, WIREFRAME_FOCUS)}
      >
        <X aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
      </button>
    </motion.div>
  );
}

export function TabBar({ tabs, activeId, onSelect, onClose, onAdd, onHoldStateChange, className }: TabBarProps) {
  const targetLayoutRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const initialized = useRef(false);
  const [footprints] = useState(() => new Map<string, TabFootprint>());
  const [keyboard] = useState(() => createHeldKeyboardShortcuts([]));
  const addGap = useMotionValue(0);
  const [addGapSpring] = useState(() => createTabSpring(addGap));
  const reducedMotion = useReducedMotion();
  const [heldWidths, setHeldWidths] = useState<ReadonlyMap<string, number> | null>(null);
  const [holdState, setHoldState] = useState<TabBarHoldState>('natural');
  const holdStateCallback = useRef(onHoldStateChange);
  useLayoutEffect(() => {
    holdStateCallback.current = onHoldStateChange;
  }, [onHoldStateChange]);
  const [hoverHold] = useState(() =>
    createTabHoverHold(
      (state) => {
        setHoldState(state);
        holdStateCallback.current?.(state);
      },
      () => setHeldWidths(null)
    )
  );
  useEffect(() => () => hoverHold.stop(), [hoverHold]);

  const close = useCallback(
    (id: string) => {
      const layout = targetLayoutRef.current!;
      const gap = parseFloat(getComputedStyle(layout).columnGap);
      const basis = parseFloat(getComputedStyle(layout.firstElementChild!).flexBasis);
      const widths = tabs.map((tab) => footprints.get(tab.id)!.getTargetWidth());
      const index = tabs.findIndex((tab) => tab.id === id);
      const nextWidths = closeTabWidths(widths, index, gap, basis);
      const remaining = tabs.filter((tab) => tab.id !== id);
      setHeldWidths(
        hoverHold.shouldHoldWidths()
          ? new Map(remaining.map((tab, tabIndex) => [tab.id, nextWidths[tabIndex]!] as const))
          : null
      );
      onClose(id);
    },
    [footprints, hoverHold, onClose, tabs]
  );

  const measureTargets = useCallback(() => {
    const layout = targetLayoutRef.current!;
    const gap = parseFloat(getComputedStyle(layout).columnGap);
    // This independent flex row already contains the FINAL tab count. Read every
    // target before starting any spring; animated widths cannot feed back into sizing.
    const targets = Array.from(layout.children)
      .slice(0, -1)
      .map((element, index) => ({
        element,
        id: element.getAttribute('data-tab-target')!,
        width: parseFloat(getComputedStyle(element).width),
        gap: index === 0 ? 0 : gap,
      }));
    const immediate = !initialized.current || reducedMotion === true;
    const widths = resolveTabWidths(targets, heldWidths);
    targets.forEach((target, index) => {
      const width = widths[index]!;
      // Expose the destination for Storybook instrumentation, independent of entering/exiting pixels.
      const value = String(width);
      if (target.element.getAttribute('data-tab-width-target') !== value) {
        target.element.setAttribute('data-tab-width-target', value);
      }
      footprints.get(target.id)!.set(width, target.gap, immediate);
    });
    const presentIds = new Set(targets.map((target) => target.id));
    // AnimatePresence keeps removed tabs in flow, but the sizing row excludes
    // them. Their old pixel footprint collapses while survivors expand together.
    for (const [id, footprint] of footprints) {
      if (!presentIds.has(id)) footprint.set(0, 0, immediate);
    }
    const nextAddGap = targets.length === 0 ? 0 : gap;
    addGapSpring.set(nextAddGap, immediate);
    if (immediate) addRef.current!.style.marginLeft = `${nextAddGap}px`;
    initialized.current = true;
  }, [addGapSpring, footprints, heldWidths, reducedMotion]);

  // Child layout effects register the newly mounted tabs before this reads the
  // final layout. Existing MotionValues survive every tab-list change.
  useLayoutEffect(measureTargets);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measureTargets);
    observer.observe(targetLayoutRef.current!);
    return () => observer.disconnect();
  }, [measureTargets]);
  useEffect(() => () => addGapSpring.stop(), [addGapSpring]);

  useLayoutEffect(() => {
    const switchTab = (direction: number) => {
      if (activeId === null) return;
      const index = tabs.findIndex((tab) => tab.id === activeId);
      const nextIndex = index + direction;
      if (nextIndex >= 0 && nextIndex < tabs.length) onSelect(tabs[nextIndex]!.id);
    };
    keyboard.update([
      { key: 't', shift: true, onTrigger: onAdd },
      {
        key: 'w',
        shift: true,
        repeat: true,
        onTrigger: () => {
          if (activeId !== null) close(activeId);
        },
      },
      ...[false, true].flatMap((alt) => [
        { key: 'ArrowLeft', shift: true, alt, repeat: true, onTrigger: () => switchTab(-1) },
        { key: 'ArrowRight', shift: true, alt, repeat: true, onTrigger: () => switchTab(1) },
      ]),
    ]);
  }, [activeId, tabs, onAdd, close, onSelect, keyboard]);

  useEffect(() => {
    window.addEventListener('keydown', keyboard.keydown);
    window.addEventListener('keyup', keyboard.keyup);
    window.addEventListener('blur', keyboard.stop);
    return () => {
      window.removeEventListener('keydown', keyboard.keydown);
      window.removeEventListener('keyup', keyboard.keyup);
      window.removeEventListener('blur', keyboard.stop);
      keyboard.stop();
    };
  }, [keyboard]);

  return (
    <fieldset
      aria-label="Tabs"
      aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight Shift+Alt+ArrowLeft Shift+Alt+ArrowRight"
      className={cn(
        `w-full min-w-0 p-1 text-base/6 font-normal tracking-normal
        text-neutral-950 dark:text-neutral-50`,
        WIREFRAME_FRAME,
        className
      )}
    >
      <div className="relative min-w-0">
        <div
          ref={targetLayoutRef}
          data-tab-target-layout=""
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-0 flex items-center gap-1"
        >
          {tabs.map((tab) => (
            <div key={tab.id} data-tab-target={tab.id} className="h-9 min-w-0 shrink basis-44" />
          ))}
          <div className="size-9 shrink-0" />
        </div>
        <div
          data-tab-hover-region=""
          data-hold-state={holdState}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') hoverHold.enter();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') hoverHold.leave();
          }}
          className="flex w-fit min-w-0 items-center"
        >
          <AnimatePresence initial={false} mode="sync">
            {tabs.map((tab) => (
              <AnimatedTab
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                onSelect={onSelect}
                onClose={close}
                footprints={footprints}
              />
            ))}
          </AnimatePresence>
          <motion.button
            ref={addRef}
            type="button"
            aria-label="Add tab"
            aria-keyshortcuts="Shift+T"
            onClick={onAdd}
            style={{ marginLeft: addGap }}
            className={cn('flex size-9 shrink-0 items-center justify-center', WIREFRAME_ITEM, WIREFRAME_FOCUS)}
          >
            <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
          </motion.button>
        </div>
      </div>
    </fieldset>
  );
}
