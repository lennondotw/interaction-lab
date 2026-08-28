import type { Meta, StoryObj } from '@storybook/react-vite';

import { BeaconLayoutObservation } from './layout-observation.js';

/**
 * One instrumented stage, ten layout-change cases, one question per case: does
 * the beacon still know where its anchor is?
 *
 * `useBeaconAnchor` has no polling loop. It wires five browser primitives to one
 * `measure()` — self `ResizeObserver`, an ancestor RO cascade up to the
 * container, a capture-phase window `scroll` listener, a window `resize`
 * listener, and an `IntersectionObserver` layout-shift frame — and each covers a
 * class of change the others are blind to. These cases are how that split is
 * checked rather than asserted.
 *
 * Read the trace bottom-up per case: `baseline` (the two boxes agree),
 * `mutate` (what changed and which source should notice), `frames` (the
 * per-frame gap between the beacon's belief and the target's real box), then
 * `verdict`. A case that ends at Δ 0 was tracked; a case that ends at Δ 96 was
 * missed, and the number is how far off the follower would be painting.
 *
 * The Δ series is measured against the store's raw MotionValues, not the
 * follower's painted rect — the follower runs springs, and a spring would show
 * up as observation lag that isn't there. The blue outline on the stage is the
 * follower, and it is only there so a human can see the same thing the numbers
 * say.
 *
 * `archive/2026-07-beacon-layout-observation/` drives this story from Playwright
 * with individual observation sources knocked out, which is what turns "all five
 * together work" into "this one is the one that catches C4".
 */

const meta = {
  title: 'Studies/Beacon layout observation',
  component: BeaconLayoutObservation,
  // `padded`, not `centered`: the stage has to stay pinned to the top of the
  // canvas. Anything that re-centres the page mid-run moves the very element
  // being measured.
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BeaconLayoutObservation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Probes: Story = {};
