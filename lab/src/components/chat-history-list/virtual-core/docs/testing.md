# Tests

The core is tested without a DOM. [`__tests__/simulation.ts`](../__tests__/simulation.ts)
stands in for the browser:

- `seededRandom` produces the same true heights on every run. Heights are quarter pixels so
  fractional layout is always exercised.
- `ListSimulation.layout()` models one frame: mount the core's render range, measure true
  heights for mounted items only, and hold the [anchor](../../anchor/docs/anchoring.md) at
  `anchorRatio` (0 by default). It repeats until nothing new is measured and throws if that
  takes too many passes. `change()` does the same around a change to the window or the
  viewport, capturing the anchor just before it, and `resize()` changes the viewport height.
- `stepCriticallyDamped` is the exact closed-form critically damped spring. `animate()` drives
  the scroll position toward a key re-read every frame; layout compensation moves the spring
  with the content and keeps its velocity.

[`virtual-core.test.ts`](../__tests__/virtual-core.test.ts) covers layout, the measurement
cache, range edges, the viewport, each overscan strategy and invariants, plus a seeded property test that compares offsets and
ranges with a naive reference after random measurements and window changes.

[`scroll-simulation.test.ts`](../__tests__/scroll-simulation.test.ts) covers:

- arbitrary discrete jumps with realistic, tiny and huge estimates, and with zero, item and
  custom overscan;
- wheel-like steps down to the bottom and up to the top through unmeasured content;
- animated scrolling up and down to a key whose offset changes during the flight;
- prepending older items and appending newer ones.

After every settled frame these tests require that every item intersecting the viewport is
measured and, unless the position had to be clamped, that the anchor did not move on screen.

```sh
pnpm --filter @monorepo/lab exec vitest run src/components/chat-history-list
```

Anchoring's own tests, including the simulation at three ratios, are listed in
[Anchoring](../../anchor/docs/anchoring.md#tests).

The debug views have their own tests in [`debug/__tests__`](../debug/__tests__/): the
minimap's view, scene and renderer (see [Minimap](./minimap.md#layers)), and the scroll
direction's hysteresis in [`scroll-direction.test.ts`](../debug/__tests__/scroll-direction.test.ts),
and the pulsing row's height curve in [`pulse-height.test.ts`](../debug/__tests__/pulse-height.test.ts).

[Index](../../README.md)
