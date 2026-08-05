import type { Meta, StoryObj } from '@storybook/react-vite';

import { ExitBatchingScenario, type ScenarioSpec, type SlideSpec } from './animate-presence-exit-batching.js';
import { sleep } from './exit-trace.js';

/**
 * Three scripted scenarios about one thing: `AnimatePresence` removes exiting
 * children as a *batch*, not individually.
 *
 *  - S1: a finished element lingers in the DOM until its slowest sibling is done.
 *  - S2: re-adding a key that is *still exiting* resumes it correctly.
 *  - S3: re-adding a key whose exit had *already finished* — only reachable
 *    because of S1 — enters from the wrong side on motion 12.23.25, the version
 *    this workspace pins. Fix versions are noted above `scenario3`.
 *
 * Timings in the copy were measured against 12.23.25 in Chrome. Re-measure after
 * a version bump.
 */

const SLIDE_A = (exitDuration: number): SlideSpec => ({
  key: 'A',
  label: `A · exit ${String(exitDuration)}s`,
  exitDuration,
  className: 'bg-rose-500/90',
});

const SLIDE_B = (exitDuration: number): SlideSpec => ({
  key: 'B',
  label: `B · exit ${String(exitDuration)}s`,
  exitDuration,
  className: 'bg-blue-500/90',
});

const SLIDE_C = (exitDuration: number): SlideSpec => ({
  key: 'C',
  label: `C · exit ${String(exitDuration)}s`,
  exitDuration,
  className: 'bg-emerald-500/90',
});

/** The slow sibling whose only job is to hold the removal batch open. */
const SLIDE_SLOW = (exitDuration: number): SlideSpec => ({
  key: 'S',
  label: `S · exit ${String(exitDuration)}s`,
  exitDuration,
  className: 'bg-violet-500/90',
});

/* ────────────────────────────────────────────────────────────────────────────
 * S1 — a finished element is not removed until its slowest sibling finishes.
 * ──────────────────────────────────────────────────────────────────────────── */

const scenario1: ScenarioSpec = {
  id: 'S1',
  title: 'A finishes exiting, then waits ~3.8s to be removed',
  question: 'A exits in 0.5s, B in 4s, both at once. Does A leave the DOM at 0.5s?',
  slides: [SLIDE_A(0.5), SLIDE_B(4), SLIDE_C(4)],
  initialPresent: ['A'],
  script: [
    'A → B, so A starts a 0.5s exit.',
    '250ms later B → C, so B starts a 4s exit.',
    'Snapshot the container 3×.',
  ],
  finding: (
    <>
      <code>exit-done</code> for A at ~1.26s, with <strong>no</strong> <code>unmount</code> beside it. Both later
      snapshots still list A, parked at <code>x=-300 o=0</code>. <code>− A</code> and <code>− B</code> land together at
      ~5.01s — A sat mounted for ~3.8s with nothing to do.
    </>
  ),
  why: (
    <>
      Each finishing child marks itself in an <code>exitComplete</code> Map, then checks whether <em>every</em> entry is
      done. Only the last one calls <code>setRenderedChildren</code>, which swaps the whole list. There is no per-child
      removal path, so A cannot leave early. Buys one layout re-measure and one React re-render per flush instead of N.
    </>
  ),
  run: async ({ setPresent, container, tracer }) => {
    await sleep(700);
    tracer.logSnapshot('A settled', container);

    tracer.log('script', 'switch → B  (A begins its 0.5s exit)');
    setPresent(['B']);
    await sleep(250);

    tracer.log('script', 'switch → C  (B begins its 4s exit; A is still exiting)');
    setPresent(['C']);

    await sleep(1500);
    tracer.logSnapshot("+1.5s — A's exit finished ~750ms ago", container);

    await sleep(1500);
    tracer.logSnapshot('+3.0s — A is still here', container);

    await sleep(2200);
    tracer.logSnapshot("+5.2s — after B's exit finished", container);
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * S2 — re-entry while the exit is still running.
 * ──────────────────────────────────────────────────────────────────────────── */

const scenario2: ScenarioSpec = {
  id: 'S2',
  title: 'Re-adding a key mid-exit resumes it in place',
  question: 'A is 1.2s into a 4s exit when we put it back. Resume, or restart from x=300?',
  slides: [SLIDE_A(4), SLIDE_B(4)],
  initialPresent: ['A'],
  script: ['A → B, so A starts a 4s exit.', 'At 1.2s (x≈-90) switch back to A.', 'Sample A’s real x for 12 frames.'],
  finding: (
    <>
      Same node <code>A#1</code>, no unmount/mount pair. The sample opens at A&apos;s mid-exit x (around{' '}
      <code>-90</code>) and creeps back toward 0 — nothing jumps to <code>300</code>. Opacity turns around too:{' '}
      <code>0.7</code> at re-entry, <code>0.82</code> 1.5s later.
    </>
  ),
  why: (
    <>
      The exit hadn&apos;t completed, so the element is still live. Re-adding the key takes the{' '}
      <code>setActive(&quot;exit&quot;, false)</code> branch in <code>features/animation/exit.ts</code> — the variant is
      deactivated and <code>animate</code> takes over from current values. Both branches settle at <code>x=0</code>,
      which is why this samples per frame rather than asserting the end state.
    </>
  ),
  run: async ({ setPresent, container, tracer }) => {
    await sleep(4300);
    tracer.logSnapshot('A settled at x=0', container);

    tracer.log('script', 'switch → B  (A begins a 4s exit toward x=-300)');
    setPresent(['B']);
    await sleep(1200);
    tracer.logSnapshot('+1.2s — A mid-exit', container);

    tracer.log('script', 'switch back → A  (its exit is still running)');
    setPresent(['A']);
    const series = await tracer.sampleSlide(container, 'A', 12);
    tracer.log('sample', `A x per frame, first 12 frames after re-entry: ${series}`);

    await sleep(1500);
    tracer.logSnapshot('+1.5s later', container);
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * S3 — re-entry after the exit already completed.
 *
 * This is the scenario with an actual bug in it. On the motion version this
 * workspace pins (12.23.25) the re-entering element does NOT reset to its
 * `initial`; it resumes from wherever the finished exit parked it, so it slides
 * in from the side it just left towards. Upstream fixed this in v12.36.0 for
 * variant-label `initial`, and in v12.39.0 for the object-form `initial` this
 * demo uses. Staying on the pinned version is deliberate — it is the behaviour
 * our app code has to live with today.
 * ──────────────────────────────────────────────────────────────────────────── */

const scenario3: ScenarioSpec = {
  id: 'S3',
  title: 'Re-adding a key whose exit already finished — enters from the wrong side',
  question: 'A is done exiting but still mounted (S1’s state). Re-add it. Which side does it come in from?',
  slides: [SLIDE_A(0.4), SLIDE_SLOW(6)],
  initialPresent: ['A', 'S'],
  script: [
    'Remove both A (0.4s) and S (6s); S holds the batch open.',
    'At 1.5s A is done, parked at x=-300, still mounted.',
    'Re-add A only, then sample its x for 12 frames.',
  ],
  finding: (
    <>
      <strong>Watch the stage:</strong> the card flies in from the <em>left</em> — the opposite side to every other
      enter here. The sample confirms it: every value is <em>negative</em>, starting near <code>-300</code> and climbing
      toward 0, though <code>initial</code> says <code>x: 300</code>. Same node <code>#1</code>, <code>enter-done</code>{' '}
      ~0.4s later, so it really did run an enter — from the wrong place.
    </>
  ),
  why: (
    <>
      <code>exit.ts</code> forks on <code>isExitComplete</code>. S2 took the still-running branch; this one took the
      completed branch, which on <strong>12.23.25</strong> never re-establishes <code>initial</code>. Fixed by{' '}
      <code>6a8d3abb9</code> (v12.36.0, variant labels) and <code>3497306f8</code> (v12.39.0, object-form{' '}
      <code>initial</code> like this demo&apos;s); on ≥12.39 the sample comes back <em>positive</em> instead. The nasty
      part is the trigger — whether you land here depends on how long an <em>unrelated</em> sibling&apos;s exit takes.
    </>
  ),
  run: async ({ setPresent, container, tracer }) => {
    await sleep(6300);
    tracer.logSnapshot('both settled', container);

    tracer.log('script', 'remove BOTH A and S');
    setPresent([]);

    await sleep(1500);
    tracer.logSnapshot("+1.5s — A's exit is done and at rest; S still exiting", container);

    tracer.log('script', 're-add A  (its exit already completed)');
    setPresent(['A']);
    const series = await tracer.sampleSlide(container, 'A', 12);
    tracer.log('sample', `A x per frame, first 12 frames after re-entry: ${series}`);

    await sleep(1200);
    tracer.logSnapshot('+1.2s later', container);
  },
};

const meta = {
  title: 'Demos/AnimatePresence exit batching',
  component: ExitBatchingScenario,
  // `padded`, not `centered`: the demo centres itself horizontally, and must stay
  // pinned to the top because its height changes as the trace fills up.
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ExitBatchingScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BatchedRemoval: Story = {
  name: 'S1 · Batched removal',
  args: scenario1,
};

export const ReEntryMidExit: Story = {
  name: 'S2 · Re-entry mid-exit',
  args: scenario2,
};

export const ReEntryAfterExitComplete: Story = {
  name: 'S3 · Re-entry after exit completed',
  args: scenario3,
};
