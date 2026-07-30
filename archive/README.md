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

| Investigation                                                                    | Question                                                                     | Outcome                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| [2026-07-metaball-contour-cost](./2026-07-metaball-contour-cost/README.md)       | Can `sdf-effect`'s metaball be edge-traced per frame? Worker or Rust needed? | Yes — 1.5ms, and neither.                  |
| [2026-07-sdf-vs-density-traversal](./2026-07-sdf-vs-density-traversal/README.md) | Which field should the tracer walk, and does quadtree culling pay?           | A real SDF — 1.7× per sample, 55× overall. |
