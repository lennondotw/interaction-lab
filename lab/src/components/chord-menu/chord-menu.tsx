'use client';

import { cn } from '@monorepo/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useRef, useState, type FC } from 'react';

import { chordKeyAt } from './chord-keys.js';
import { CHORD_MENU_COLLAPSED_OFFSET, resolveChordMenuBottomOffset } from './chord-menu-layout.js';
import { currentChordMenuLevel, type ChordMenuAction, type ChordMenuState } from './chord-menu-state.js';

const LINE_HEIGHT = 14;
const PADDING_Y = 5;
const PADDING_X = 10;
const RADIUS = (LINE_HEIGHT + PADDING_Y * 2) / 2;

/**
 * Stiff and heavily damped. The card resizes between levels rather than crossfading, so the size
 * change *is* the transition — it has to finish about as fast as the eye expects a menu to appear.
 */
const SPRING = { type: 'spring' as const, stiffness: 1600, damping: 80, mass: 1 };

export interface ChordMenuProps {
  state: ChordMenuState;
  /**
   * What the menu is positioned against.
   *
   * `viewport` (the default) fixes it to the window, which is what a global chord menu wants.
   * `container` makes it absolute instead, so the nearest positioned ancestor bounds it — for a
   * panel or a demo frame that owns its own bottom edge.
   */
  anchorTo?: 'viewport' | 'container';
  /** Pointer is over the menu — hold it open instead of counting down under the cursor. */
  onHoldOpen?: () => void;
  /** Pointer left — start the countdown over. */
  onReleaseHold?: () => void;
  className?: string;
}

const Key: FC<{ children: string; disabled?: boolean }> = ({ children, disabled }) => (
  <kbd
    className={cn(
      `inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono text-[10px]/[14px] font-medium`,
      disabled ? `bg-white/8 text-white/35` : `bg-white/15 text-white/80`
    )}
  >
    {children}
  </kbd>
);

const Row: FC<{ action: ChordMenuAction; index: number }> = ({ action, index }) => {
  const key = chordKeyAt(index);

  return (
    <div className={`flex items-center gap-1.5`}>
      {/* An action past the end of the alphabet keeps its place in the list but has no key to
          press — visible rather than silently dropped. */}
      {key ? <Key disabled={action.disabled}>{key}</Key> : <span className={`w-4`} />}
      <span className={cn(`block font-mono text-[11px]/[14px]`, action.disabled ? `text-white/35` : `text-white/70`)}>
        {action.description}
      </span>
    </div>
  );
};

const Title: FC<{ children: string }> = ({ children }) => (
  <span className={`block pb-0.5 font-mono text-[10px]/[14px] font-semibold tracking-wide text-white/50 uppercase`}>
    {children}
  </span>
);

/**
 * The level's value line, mirroring the title at the other end of the card.
 *
 * `whitespace-pre` so a footer can pad its value to a fixed width. The card is as wide as its
 * widest line and springs to that width, so a footer counting from 9 to 10 would otherwise have
 * the whole card breathe on every press.
 */
const Footer: FC<{ children: string }> = ({ children }) => (
  <span
    className={`block pt-0.5 font-mono text-[10px]/[14px] font-medium whitespace-pre text-white/50`}
    data-testid="chord-menu-footer"
  >
    {children}
  </span>
);

/**
 * The chord menu's card: a keyboard-driven list that resizes to whatever level is showing.
 *
 * The card is measured rather than laid out by the animation. Content sits absolutely centred
 * inside it at its natural size, a `ResizeObserver` reports that size, and the card animates its
 * own box to match — so a level change is one spring on width and height rather than a crossfade
 * between two differently-sized boxes.
 *
 * Presentation only: it renders whatever state it is handed and reports pointer intent back up.
 */
export const ChordMenu: FC<ChordMenuProps> = ({
  state,
  anchorTo = 'viewport',
  onHoldOpen,
  onReleaseHold,
  className,
}) => {
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;

      const box = entry.contentBoxSize[0];

      setSize({
        width: (box ? box.inlineSize : entry.contentRect.width) + PADDING_X * 2,
        height: (box ? box.blockSize : entry.contentRect.height) + PADDING_Y * 2,
      });
    });

    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const level = currentChordMenuLevel(state);
  // Measured per level, so changing level moves the card and the spring animates the move.
  const bottomOffset = resolveChordMenuBottomOffset(size.height);

  return (
    <div
      className={cn(
        `pointer-events-none inset-x-0 bottom-0 z-50 flex justify-center`,
        anchorTo === 'viewport' ? `fixed` : `absolute`,
        className
      )}
    >
      <AnimatePresence>
        {state.phase !== 'closed' && (
          <motion.div
            className={`pointer-events-auto overflow-clip bg-[#1a1a1e]/90 shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-xl`}
            data-testid="chord-menu"
            style={{ borderRadius: RADIUS }}
            initial={
              reducedMotion
                ? { opacity: 0, marginBottom: CHORD_MENU_COLLAPSED_OFFSET }
                : { width: 0, height: 0, marginBottom: CHORD_MENU_COLLAPSED_OFFSET }
            }
            animate={
              reducedMotion
                ? { opacity: 1, marginBottom: bottomOffset }
                : { width: size.width || 'auto', height: size.height || 'auto', marginBottom: bottomOffset }
            }
            // Collapsing lands on the anchor too, or closing a tall level would shrink it into the
            // bottom edge it grew from instead of the point it opened out of.
            exit={reducedMotion ? { opacity: 0 } : { width: 0, height: 0, marginBottom: CHORD_MENU_COLLAPSED_OFFSET }}
            onMouseEnter={onHoldOpen}
            onMouseLeave={onReleaseHold}
            // Re-establishes the hold when the menu reopens under a pointer that never moved, where
            // no mouseenter fires.
            onMouseMove={onHoldOpen}
            transition={SPRING}
          >
            <div
              ref={measureRef}
              className={`absolute top-1/2 left-1/2 w-max -translate-1/2`}
              style={{ padding: `${PADDING_Y}px ${PADDING_X}px` }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {level && (
                  <motion.div
                    key={`level-${state.phase === 'open' ? state.stack.length : 0}`}
                    className={`flex flex-col gap-0.5`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    {level.title && <Title>{level.title}</Title>}
                    {level.actions.map((action, index) => (
                      <Row key={action.label} action={action} index={index} />
                    ))}
                    {/* An action that stays open reports back here, so the level it belongs to is
                        still on screen to be pressed again. */}
                    {state.phase === 'open' && state.notice && (
                      <span
                        className={`block pt-0.5 font-mono text-[11px]/[14px] whitespace-nowrap text-white/45`}
                        data-testid="chord-menu-notice"
                      >
                        {state.notice}
                      </span>
                    )}
                    {/* Last, under the notice: the notice is about the press that just happened and
                        belongs next to the rows, while this is the level's own bottom edge. */}
                    {level.footer && <Footer>{level.footer()}</Footer>}
                  </motion.div>
                )}

                {state.phase === 'result' && (
                  <motion.span
                    key="result"
                    className={`block font-mono text-[11px]/[14px] whitespace-nowrap text-white/70`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    {state.message}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
