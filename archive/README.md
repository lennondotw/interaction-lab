# archive

Frozen records of investigations that shaped the implementations in this repo.

Each subdirectory is one question, self-contained and still runnable: a
`probe.mjs` that measures the cases and prints a table, and a `README.md` with
the question, the numbers, and what was decided.

They are deliberately not wired into lint, typecheck, or the test suites — the
root ESLint config ignores `archive/`. Regressions are guarded by the unit and
story tests; these exist to explain _why_ the code looks the way it does, and to
let a future reader re-run the experiment rather than take the conclusion on
faith.

```bash
node archive/<name>/probe.mjs
```

Probes have no dependencies beyond Node unless their README says otherwise.
Absolute timings track whatever machine they run on; the ratios between rows are
what the decisions rest on.

Browser probes are the exception, and they say so: they need
`pnpm exec playwright install chromium` and a running Storybook
(`pnpm --filter @monorepo/app-storybook dev`, or `STORYBOOK_URL` for a
non-default port). They drive the **real stories** rather than a copy of them, so
they cannot quietly drift from what ships — which is also the one thing they ask
of the app, a `data-testid` handle on the stage under test. Those probes write a
padded 2× screenshot to `__screenshots__/`, committed through Git LFS; cloning without
LFS gives you everything except the images, and re-running the probe regenerates
them.

| Investigation                                                                                | Question                                                                     | Outcome                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| [2026-07-metaball-contour-cost](./2026-07-metaball-contour-cost/README.md)                   | Can `sdf-effect`'s metaball be edge-traced per frame? Worker or Rust needed? | Yes — 1.5ms, and neither.                           |
| [2026-07-sdf-vs-density-traversal](./2026-07-sdf-vs-density-traversal/README.md)             | Which field should the tracer walk, and does quadtree culling pay?           | A real SDF — 1.7× per sample, 55× overall.          |
| [2026-07-animate-presence-exit-batching](./2026-07-animate-presence-exit-batching/README.md) | Does a child leave the DOM when its own exit animation finishes?             | No — removal is batched, and re-entry is reachable. |
| [2026-07-step-transition-direction](./2026-07-step-transition-direction/README.md)           | Can a later navigation rewrite the exit direction of a card already leaving? | Yes — so stamp the direction per step, not once.    |
| [2026-07-beacon-layout-observation](./2026-07-beacon-layout-observation/README.md)           | Which of the beacon's five observation sources catches which layout change?  | Four are near-disjoint — and one was dead.          |
| [2026-07-contour-domain-overscan](./2026-07-contour-domain-overscan/README.md)               | How far past the frame must the contour be traced, and what does it cost?    | 128px — free for the quadtree, 2.25× for dense.     |
| [2026-07-wasm-kernel-headroom](./2026-07-wasm-kernel-headroom/README.md)                     | With the quadtree shipped, is the remaining kernel worth a Rust/WASM port?   | No — the 2.5× is in the loop, not the language.     |
