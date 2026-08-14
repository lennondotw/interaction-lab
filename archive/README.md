# archive

Frozen records of investigations that shaped the implementations in this repo.

Each subdirectory is one question, self-contained and still runnable: an
instrument that measures the cases and prints a table — usually a `probe.mjs`,
sometimes whatever the question actually needs — and a `README.md` with the
question, the numbers, and what was decided. Where an investigation kept the
output it measured rather than only the conclusion, that sits in a `data/`
directory beside the probe.

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

Some carry their own toolchain, and all of them say so at the top of the probe.
Swift probes run against the macOS SDK through `xcrun swift <file>.swift`, or
`xcrun swiftc -parse-as-library` where they need an `@main` — a single file
either way, no Xcode project and no simulator. Most ask for nothing else,
because the questions they answer are about geometry rather than about a
platform. `2026-08-liquid-glass-internals` is the one that is about the
platform: it also wants the Metal toolchain that ships with Xcode, and its pixel
probe wants Screen Recording permission, because the effect it measures is
composited by the window server and an in-process render would miss it silently.

Browser probes are the exception, and they say so: they need
`pnpm exec playwright install chromium`. Most also want a running Storybook
(`pnpm --filter @monorepo/lab dev`, or `STORYBOOK_URL` for a
non-default port), because they drive the **real stories** rather than a copy of
them and so cannot quietly drift from what ships — which is also the one thing
they ask of the app, a `data-testid` handle on the stage under test.

A few ask for the browser and nothing else. When the question is about what the
platform does rather than about what we drew — `2026-08-displacement-map-reuse`
measuring which coordinate space `backdrop-filter` evaluates in, say — the probe
builds its own page with `setContent`, because a story would put our code between
the measurement and the thing being measured.

Probes that produce images write them to `__screenshots__/`, committed through Git
LFS — the browser probes a padded 2× shot of the stage, the glass probe its own
window. Cloning without LFS gives you everything except the images, and re-running
the probe regenerates them.

| Investigation                                                                                    | Question                                                                     | Outcome                                             |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| [2026-07-metaball-contour-cost](./2026-07-metaball-contour-cost/README.md)                       | Can `sdf-effect`'s metaball be edge-traced per frame? Worker or Rust needed? | Yes — 1.5ms, and neither.                           |
| [2026-07-sdf-vs-density-traversal](./2026-07-sdf-vs-density-traversal/README.md)                 | Which field should the tracer walk, and does quadtree culling pay?           | A real SDF — 1.7× per sample, 55× overall.          |
| [2026-07-animate-presence-exit-batching](./2026-07-animate-presence-exit-batching/README.md)     | Does a child leave the DOM when its own exit animation finishes?             | No — removal is batched, and re-entry is reachable. |
| [2026-07-step-transition-direction](./2026-07-step-transition-direction/README.md)               | Can a later navigation rewrite the exit direction of a card already leaving? | Yes — so stamp the direction per step, not once.    |
| [2026-07-beacon-layout-observation](./2026-07-beacon-layout-observation/README.md)               | Which of the beacon's five observation sources catches which layout change?  | Four are near-disjoint — and one was dead.          |
| [2026-07-contour-domain-overscan](./2026-07-contour-domain-overscan/README.md)                   | How far past the frame must the contour be traced, and what does it cost?    | 128px — free for the quadtree, 2.25× for dense.     |
| [2026-07-wasm-kernel-headroom](./2026-07-wasm-kernel-headroom/README.md)                         | With the quadtree shipped, is the remaining kernel worth a Rust/WASM port?   | No — the 2.5× is in the loop, not the language.     |
| [2026-07-contour-to-dom](./2026-07-contour-to-dom/README.md)                                     | What does moving the contour from canvas into SVG and `clip-path` cost?      | The `d` string, ~6.4× a `Path2D`. Not the clip.     |
| [2026-07-corner-shape-superellipse](./2026-07-corner-shape-superellipse/README.md)               | Why does corner smoothing shrink the corner, and never make a circle?        | It is corner-box-confined — 1.4334, and never.      |
| [2026-08-swiftui-corner-shapes](./2026-08-swiftui-corner-shapes/README.md)                       | Does Apple's continuous corner really spread along the edge instead?         | Yes — exactly 1.528665r, so no compensation.        |
| [2026-08-corner-shape-vs-apple](./2026-08-corner-shape-vs-apple/README.md)                       | Can CSS `corner-shape` stand in for Apple's curve, and where does it fail?   | To 0.003r below the clamp; never at it.             |
| [2026-07-metasurface-dom-field](./2026-07-metasurface-dom-field/README.md)                       | What does it take to seed the distance field from laid-out DOM rects?        | The shape work is free; never derive the domain.    |
| [2026-07-sdf-field-throughput](./2026-07-sdf-field-throughput/README.md)                         | How does the field scale with shape count, and what is left to squeeze?      | Quadratic — and smin not being commutative caps it. |
| [2026-08-view-transition-overlay-stacking](./2026-08-view-transition-overlay-stacking/README.md) | What does a View Transition commit do to overlays it knows nothing about?    | Covers and freezes them — naming fixes only paint.  |
| [2026-08-liquid-glass-internals](./2026-08-liquid-glass-internals/README.md)                     | How does Apple's Liquid Glass compute its refraction and its dispersion?     | Six overlapping taps — and it ships with them off.  |
| [2026-08-displacement-map-reuse](./2026-08-displacement-map-reuse/README.md)                     | When can one displacement map be reused, and what does a merge cost?         | Transforms are free; a merge wants an SDF instead.  |
| [2026-08-disclosure-height-target](./2026-08-disclosure-height-target/README.md)                 | What should a disclosure animation own — a length or a ratio?                | A ratio — a resolved length is stale by design.     |
| [2026-08-beacon-origin-frame](./2026-08-beacon-origin-frame/README.md)                           | What does choosing a beacon's coordinate frame buy, and what can't it buy?   | All of resize, none of scroll — 0 against 203px.    |
| [2026-08-split-minimum-across-frames](./2026-08-split-minimum-across-frames/README.md)           | Can a split pane held at a stale width be painted below its own minimum?     | No — the resize task re-clamps before that frame.   |
| [2026-08-junction-spacing](./2026-08-junction-spacing/README.md)                                 | Is deciding one text junction enough, and how much of pangu.js applies?      | Enough — 98.93%, in 958 bytes against 6.5 KB.       |
| [2026-08-backdrop-filter-corner-thread](./2026-08-backdrop-filter-corner-thread/README.md)       | Why does a blurred bar leave a hairline on a rounded frame's corner?         | Its clip is rasterised apart — 248px to 25.         |
| [2026-08-navigation-stack-depth-cost](./2026-08-navigation-stack-depth-cost/README.md)           | What does keeping every view mounted cost as the stack gets deeper?          | The commit, not the animation — 1.04ms per level.   |
