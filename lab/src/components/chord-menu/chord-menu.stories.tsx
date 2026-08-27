import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState, type FC, type ReactNode } from 'react';

import type { ChordMenuAction, ChordMenuLevel } from './chord-menu-state.js';
import { ChordMenu } from './chord-menu.js';
import { useChordMenu } from './use-chord-menu.js';

// ---------------------------------------------------------------------------
// Demo fixtures — a made-up settings surface to walk. Not part of the component.
// ---------------------------------------------------------------------------

/** An action that reports what it did and closes, which is the ordinary case. */
function pick(label: string, description = label): ChordMenuAction {
  return { label, description, type: 'run', run: () => `${label} selected` };
}

function group(label: string, description: string, level: ChordMenuLevel): ChordMenuAction {
  return { label, description, type: 'level', level: () => level };
}

const APPEARANCE: ChordMenuLevel = {
  title: 'Appearance',
  actions: [pick('Follow system'), pick('Always light'), pick('Always dark'), pick('No override')],
};

const DENSITY: ChordMenuLevel = {
  title: 'Density',
  actions: [pick('Comfortable'), pick('Cosy'), pick('Compact')],
};

const GRID: ChordMenuLevel = {
  title: 'Grid',
  actions: [pick('Columns'), pick('Gutters'), pick('Baseline'), pick('Safe areas')],
};

const ROOT: ChordMenuLevel = {
  title: 'Settings',
  actions: [
    group('Appearance', 'Light, dark, or follow the system', APPEARANCE),
    group('Density', 'How much room each row takes', DENSITY),
    group('Grid', 'Overlays for columns, gutters and baseline', GRID),
    pick('Reset', 'Put every setting back to its default'),
  ],
};

/**
 * Mounts the menu and its keyboard. Every story shares it, so the only thing a story varies is
 * the level it starts from and where the menu is anchored.
 */
const Chord: FC<{
  root: ChordMenuLevel;
  anchorTo?: 'viewport' | 'container';
}> = ({ root, anchorTo }) => {
  const { state, holdOpen, releaseHold } = useChordMenu(root);

  return <ChordMenu anchorTo={anchorTo} state={state} onHoldOpen={holdOpen} onReleaseHold={releaseHold} />;
};

const Hint: FC<{ children: ReactNode }> = ({ children }) => (
  <div className={`max-w-160 space-y-2 text-sm/6 text-neutral-600 dark:text-neutral-400`}>{children}</div>
);

const Kbd: FC<{ children: string }> = ({ children }) => (
  <kbd
    className={`
      inline-flex h-5 items-center rounded border border-neutral-300 bg-neutral-100 px-1.5 font-mono text-[11px]
      dark:border-neutral-700 dark:bg-neutral-800
    `}
  >
    {children}
  </kbd>
);

const meta: Meta = {
  title: 'Components/Chord menu',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

/**
 * Press <kbd>⌘.</kbd> to open, then a single key per row. <kbd>Esc</kbd> goes up a level, <kbd>⌘.</kbd>
 * again jumps back to the root, and pressing it at the root closes.
 *
 * Anchored to the viewport, which is what a global menu wants — here that is the story canvas.
 */
export const Default: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          <Kbd>⌘.</Kbd> opens the menu. Rows are numbered, so <Kbd>1</Kbd> walks into Appearance and <Kbd>2</Kbd> picks
          the second row of whatever level is showing.
        </p>
        <p>
          Keys come from the row's position rather than its name. Nothing to memorise per action, and two rows on one
          level can never want the same letter.
        </p>
      </Hint>
      <Chord root={ROOT} />
    </>
  ),
};

/**
 * The same menu bounded by a container instead of the viewport.
 *
 * `anchorTo="container"` makes the layer absolute, so the nearest positioned ancestor owns the
 * bottom edge it measures against — for a panel, a sheet, or a demo frame that should not have a
 * menu escaping into the page around it.
 */
export const InsideAContainer: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          Identical menu, anchored to the frame below rather than the window. The 40px it keeps from the bottom is now
          40px from the <em>frame's</em> bottom.
        </p>
      </Hint>
      <div
        className={`
          relative mt-4 h-96 w-full overflow-hidden rounded-xl border border-neutral-300 bg-neutral-50
          dark:border-neutral-700 dark:bg-neutral-900
        `}
      >
        <span className={`absolute top-3 left-4 font-mono text-[11px] text-neutral-500`}>positioning container</span>
        <Chord anchorTo="container" root={ROOT} />
      </div>
    </>
  ),
};

/**
 * A level long enough to hit the floor.
 *
 * The card centres on the anchor while it is short, then stops centring and keeps a fixed gap from
 * the bottom, growing upward only. Without that, a list this long grows straight off the screen.
 */
export const LongLevel: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          Twelve rows. The card holds its gap from the bottom edge and extends upward instead of centring, which is what
          stops a long level running off-screen.
        </p>
      </Hint>
      <Chord
        root={{
          title: 'Long level',
          actions: Array.from({ length: 12 }, (_, index) => pick(`Row ${index + 1}`, `The ${index + 1}th row`)),
        }}
      />
    </>
  ),
};

/**
 * Walking from a tall level into a short one.
 *
 * Both pin to the same bottom edge, so the card's top moves and its bottom does not. The alternative
 * — each level centred on its own middle — makes the whole card jump every time you go one level in.
 */
export const LevelsShareABottomEdge: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          Open, then press <Kbd>1</Kbd>. The tall root gives way to a two-row level: the top edge drops, the bottom edge
          stays put.
        </p>
      </Hint>
      <Chord
        root={{
          title: 'Twelve rows',
          actions: [
            group('Two rows', 'A short level, one press in', {
              title: 'Two rows',
              actions: [pick('First'), pick('Second')],
            }),
            ...Array.from({ length: 11 }, (_, index) => pick(`Filler ${index + 1}`)),
          ],
        }}
      />
    </>
  ),
};

/**
 * An action that keeps its level open.
 *
 * `after: 'stay'` is for a press that is not the whole interaction — stepping through more than two
 * states. The result arrives as a notice under the rows instead of replacing them, so the same key
 * is still under the same finger.
 */
export const StaysOpen: Story = {
  render: () => {
    const STEPS = ['off', 'morning', 'evening'] as const;

    const StayDemo: FC = () => {
      const [step, setStep] = useState(0);
      // The level is captured into the menu's stack when it opens, so the action still on screen is
      // the one from that moment. Reading `step` directly would have every press after the first see
      // the value it had when the menu opened.
      const stepRef = useRef(0);

      return (
        <>
          <Hint>
            <p>
              <Kbd>1</Kbd> steps through three states. The level stays up, so the next press needs no reopening —
              currently <strong>{STEPS[step % STEPS.length]}</strong>.
            </p>
            <p>
              <Kbd>2</Kbd> is an ordinary action next to it: one press, a result, and the menu closes.
            </p>
          </Hint>
          <Chord
            root={{
              title: 'Playback',
              actions: [
                {
                  label: 'Step schedule',
                  description: 'Cycle the schedule: off → morning → evening',
                  type: 'run',
                  after: 'stay',
                  run: () => {
                    stepRef.current += 1;
                    setStep(stepRef.current);

                    return `Schedule → ${STEPS[stepRef.current % STEPS.length]}`;
                  },
                },
                pick('Reset schedule', 'One press, then the menu closes'),
              ],
            }}
          />
        </>
      );
    };

    return <StayDemo />;
  },
};

/**
 * The menu holds itself open under the pointer.
 *
 * It dismisses itself after a few seconds otherwise, which a twelve-row level outlasts. Hovering
 * cancels that; leaving starts the countdown over rather than resuming what was left of it.
 */
export const HoverHolds: Story = {
  render: () => {
    /**
     * Composes the hook directly rather than going through `Chord`, so it can watch the same two
     * signals the menu reports and say which one is in force. The indicator reads those signals; it
     * is not a third source of truth the component has to be told about.
     */
    const HoverDemo: FC = () => {
      const { state, holdOpen, releaseHold } = useChordMenu(ROOT);
      const [held, setHeld] = useState(false);

      // Closed wins over held: a menu dismissed from the keyboard under the pointer drops its hold
      // too, and the hook has already done so by the time this renders.
      const status = state.phase === 'closed' ? 'closed' : held ? 'holding' : 'counting down';

      return (
        <>
          <Hint>
            <p>
              Open the menu and leave the pointer off it: it closes on its own. Open it again and hover: it stays as
              long as you are over it.
            </p>
            <p>
              Move away and the full countdown starts again, so a pointer passing across buys the same time as one that
              arrived deliberately.
            </p>
          </Hint>
          {/* Deliberately plain. It is here to make an invisible timer legible, and anything more designed would read
              as part of the component.

              The status gets a line to itself and the note sits under it: the note is much the longer of the two and
              changes length with every state, so on one line it would drag the status word around as it went. */}
          <div className={`mt-4 font-mono text-xs text-neutral-700 dark:text-neutral-300`} data-testid="hold-status">
            <p>
              {'status: '}
              <strong>{status}</strong>
            </p>
            <p className={`text-neutral-500 dark:text-neutral-400`}>
              {status === 'holding'
                ? 'Pointer is over the menu, so no dismiss is scheduled.'
                : status === 'counting down'
                  ? 'Dismisses itself shortly.'
                  : 'Press the chord to open it.'}
            </p>
          </div>
          <ChordMenu
            onHoldOpen={() => {
              setHeld(true);
              holdOpen();
            }}
            onReleaseHold={() => {
              setHeld(false);
              releaseHold();
            }}
            state={state}
          />
        </>
      );
    };

    return <HoverDemo />;
  },
};

/**
 * Keys the menu has no use for still reach the page.
 *
 * The menu is an overlay, not a modal. It claims exactly the keys the current level hands out — one
 * per row, plus <kbd>Esc</kbd> and the chord — and leaves everything else alone.
 */
export const UnusedKeysPassThrough: Story = {
  render: () => {
    const PassThroughDemo: FC = () => {
      const [typed, setTyped] = useState('');

      return (
        <>
          <Hint>
            <p>
              Focus the field, open the menu with <Kbd>⌘.</Kbd>, and keep typing letters. They land in the field — a
              four-row level claims <Kbd>1</Kbd>–<Kbd>4</Kbd> and nothing else, so the rest of the alphabet is still the
              page's.
            </p>
          </Hint>
          <input
            aria-label="Pass-through target"
            className={`
              mt-4 h-9 w-80 rounded-lg border border-neutral-300 bg-white px-3 font-mono text-sm
              dark:border-neutral-700 dark:bg-neutral-900
            `}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type here with the menu open"
            value={typed}
          />
          <Chord root={ROOT} />
        </>
      );
    };

    return <PassThroughDemo />;
  },
};

/**
 * An unavailable action keeps its place.
 *
 * Dimmed, still numbered, and it says so when pressed rather than doing nothing. Hiding it instead
 * would renumber every row below it, so a key learned while the action was available would start
 * doing something else.
 */
export const Unavailable: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          The second row is unavailable. Press <Kbd>2</Kbd> and the menu says so — and notice the rows under it keep
          their numbers.
        </p>
      </Hint>
      <Chord
        root={{
          title: 'Export',
          actions: [
            pick('Copy to clipboard'),
            { ...pick('Save to disk'), disabled: true, description: 'Save to disk (needs permission)' },
            pick('Share a link'),
          ],
        }}
      />
    </>
  ),
};

/**
 * An action that takes a moment.
 *
 * A promise shows the label with an ellipsis first, then whatever it resolves to — or a failure
 * line if it rejects, because a menu that reports nothing back looks like a key that did nothing.
 */
export const AsyncAction: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          <Kbd>1</Kbd> resolves after a second. <Kbd>2</Kbd> rejects.
        </p>
      </Hint>
      <Chord
        root={{
          title: 'Sync',
          actions: [
            {
              label: 'Pull',
              description: 'Takes a second, then reports',
              type: 'run',
              run: async () => {
                await new Promise((resolve) => setTimeout(resolve, 1000));

                return 'Pulled 3 changes';
              },
            },
            {
              label: 'Push',
              description: 'Fails, and says why',
              type: 'run',
              run: async () => {
                await new Promise((resolve) => setTimeout(resolve, 600));

                throw new Error('no upstream');
              },
            },
          ],
        }}
      />
    </>
  ),
};

/**
 * More rows than there are keys.
 *
 * The alphabet runs `1`–`9`, `0`, then `a`–`z`. Past that a row keeps its place in the list but has no
 * key — visibly unreachable, rather than quietly sharing a key with the row that already had it. It is
 * a prompt to group, which is what the levels are for.
 */
export const KeysRunOut: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          Thirty-eight rows, thirty-six keys. The last two have no badge, which is the signal that this level wants
          splitting up — long before it got here, really.
        </p>
      </Hint>
      <Chord
        root={{
          title: 'Too many',
          actions: Array.from({ length: 38 }, (_, index) => pick(`Row ${index + 1}`)),
        }}
      />
    </>
  ),
};

/**
 * With `prefers-reduced-motion`, the card crossfades instead of resizing.
 *
 * The size change is the whole transition, so there is nothing to slow down — it is either the spring
 * or nothing. Turn the setting on at the OS level to see this story change.
 */
export const ReducedMotion: Story = {
  render: () => (
    <>
      <Hint>
        <p>
          Same menu. Under <code>prefers-reduced-motion</code> it fades in at its final size rather than springing open,
          and level changes swap without the box animating between them.
        </p>
      </Hint>
      <Chord root={ROOT} />
    </>
  ),
};
