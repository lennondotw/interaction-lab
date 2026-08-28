# Whether the trace kernel should be Rust compiled to WebAssembly

**Date:** 2026-07 · **Outcome:** no — the headroom is in the shape of the loop,
not in the language · **Applies to:** `sdf-edge-trace` as of 2026-07, after the
domain overscan landed, Node 24 / Chromium 141, both V8 14

## The question

[2026-07-sdf-vs-density-traversal](../2026-07-sdf-vs-density-traversal/README.md)
retired the Rust question with an asymptotic argument: the cost was O(area), the
fix was a better algorithm, and a constant-factor language win applied to the
wrong algorithm loses to the right algorithm in JavaScript.

That argument is correct but it no longer applies. The right algorithm is now
shipped. So the question comes back in its honest form: **with the quadtree
already in place, is the remaining kernel worth porting?**

The kernel is `ContourTracer.sdf` — a quadratic smooth-min over circle
distances, evaluated once per sample. It is the only part of the pipeline a WASM
port could touch. Everything else in the frame is canvas API calls.

## Where the frame actually goes

Measured on the live demo, not in a probe. Default configuration: `sdf` field,
`quadtree` traversal, `cell=2`, 4 balls, and the 768² traced domain — a 512px
view plus the 128px overscan on every side that
[2026-07-contour-domain-overscan](../2026-07-contour-domain-overscan/README.md)
establishes. These numbers are from the post-overscan build; a pre-overscan
measurement would sample 512² and is not comparable.

|                         | ms        | share of budget |
| ----------------------- | --------- | --------------- |
| JS work in the frame    | 1.1       | 15.9%           |
| ├ `tracer.trace()`      | **0.400** | **5.8%**        |
| └ `renderScene` + React | ~0.7      | 10.1%           |

`rAF` median was 6.9 ms, so this ran on a 144 Hz display — a 6.94 ms budget, not
16.67 ms. The demo's own `budget @60fps` readout is therefore optimistic by 2.4×
on this machine, which is worth knowing before reading it as headroom.

The method: a `requestAnimationFrame` callback registered after the component's
own runs later in the same frame, so `performance.now()` minus the frame
timestamp at its entry is the time already consumed by the component. `stats.ms`
covers only `tracer.trace()` (`sdf-edge-trace.tsx:130–140`), which is exactly the
WASM-addressable span.

This archive does have a browser-probe convention — Playwright driving the real
stories — and this table is deliberately not one. The load-bearing number is a
share of the frame budget, and the budget came from a 144 Hz display; headless
Chromium does not reproduce a real refresh rate, so a probe would report a
confidently wrong denominator. The story also carries no `data-testid` handle,
which that convention asks of the app. The kernel table below, which is the part
the decision rests on, is a probe and needs no display.

**The trace is the smaller half of the frame.** Canvas painting costs more, and
no language choice reaches it.

From the demo's own benchmark panel, 8 balls, contours cross-checked against the
dense scan:

| field   | traversal | cell | ms        |
| ------- | --------- | ---- | --------- |
| sdf     | sparse    | 2    | **0.608** |
| sdf     | sparse    | 1    | **1.24**  |
| sdf     | dense     | 1    | 32.2      |
| density | dense     | 1    | 17.9      |

Only the dense rows exceed the budget, and avoiding them is what the quadtree is
for.

## Where the kernel's own time goes

`probe.mjs` walks the kernel from its shipped form down to the bare hardware
cost. Median of 7 batches, one process per measurement, ns per field evaluation:

| variant      | 4 balls | 8 balls  | 12 balls | what changed                         |
| ------------ | ------- | -------- | -------- | ------------------------------------ |
| `shipped`    | 21.8    | 38.9     | 66.7     | `for..of` over objects, divide by K  |
| `reciprocal` | 17.9    | 30.2     | 49.6     | multiply by 1/K                      |
| `twoPass`    | 9.4     | 25.6     | 40.1     | all sqrts first, then fold           |
| `earlyOut`   | **9.1** | **17.3** | **24.7** | skip balls that cannot lower the min |
| `unrolled`   | 11.4    | —        | —        | no loop, fixed at 4 balls            |
| `sqrtOnly`   | 4.3     | 8.5      | 9.7      | n sqrts, nothing else — the floor    |

Absolute values drift about ±15% between runs; the ratios hold. Read three
things off it.

**There is 2.4–2.7× sitting in the JavaScript.** `earlyOut` beats `shipped` by
2.39× at 4 balls and 2.70× at 12, and it is not an approximation: ball _i_
cannot affect the result once `di >= d + K`, because the blend weight is then
exactly 0 and smin degenerates to `min(d, di) = d`. Squared, that is testable
before the sqrt, so the sqrt is skipped outright.

**The floor is hardware.** `sqrtOnly` is 4.6–6.9× below `shipped`, and after
fixing the JS the best variant is within 2.0–2.5× of it. That remainder is mostly
sqrt latency, which WASM issues with the same `sqrtsd`.

**The two available wins pull in opposite directions.** `twoPass` — hoisting the
sqrts out of the loop-carried dependency on `d` so they can pipeline — is worth
2.33× at 4 balls and only 1.66× at 12. `earlyOut` is the reverse, improving as
ball count grows. Neither is a single lever, and the fully unrolled version is
the fastest-looking option that is not generic at all.

## What that leaves for WASM

Scalar WASM would be competing against `earlyOut`, not against `shipped`, and
the gap from there to the hardware floor is ~2× of which most is sqrt. That is
not a port worth a toolchain.

SIMD is the one thing WASM has that JavaScript does not. `f32x4.sqrt` collapses
four distance computations into one instruction, which could plausibly approach
the floor. Two things bound the prize:

- **The budget.** Even deleting the kernel entirely takes the frame from 1.1 ms
  to ~0.93 ms — 15.9% of budget to 13.4%. Deleting it entirely is not on offer.
- **The traversal fights it.** SIMD wants wide regular batches. The quadtree is
  irregular and each node's cull decision is serial — you cannot batch samples
  you have not decided to take yet. The traversal that wants SIMD is the dense
  scan, which is the 55× slower algorithm. You would be adding SIMD to win back
  a fraction of what not scanning densely already won.

## The harness bug, which is most of the value here

The first draft of this probe timed every variant in one process, through one
`bench(fn)` call site. After a dozen distinct closures that site goes
megamorphic, V8 stops inlining, and what gets measured is dispatch plus whatever
IC state the previous variant left behind. It reported:

- `reciprocal` 2.69× faster than `shipped`, on a change from `/40` to `* 0.025`
- `unrolled` **slower** than `shipped`
- 8 balls cheaper per evaluation than 4 balls

A second bug compounded it: a `point(i)` helper returning `[x, y]` allocated once
per iteration, and that allocation outweighed the kernel while being optimised
differently at each call site.

The fix is one process per measurement — a pristine V8 and a monomorphic call
site each time — which is why `probe.mjs` re-executes itself with `--measure`.

**The browser figures that first motivated this entry came from a harness with
the same flaw.** Its ratios happened to survive (it put the JS-side win at 2.7×,
against 2.4–2.7× clean) but its absolute per-evaluation numbers did not. It
claimed the kernel was 84% of traced time; against the clean numbers,
21.8–24.0 ns × 6,929 evaluations is 0.15–0.17 ms of the 0.400 ms trace, so the
kernel is nearer **40%** and the traversal, marching squares, edge dedup and loop
linking are the rest. That correction strengthens the conclusion rather than
weakening it, which is exactly why the number needed to be right.

Mixing Node ns with browser ms here is an approximation — same engine, different
build — and is used only to size a share, not to make a claim.

## Decision

No Rust, no WASM.

If the kernel needs to be faster, `earlyOut` is worth 2.4–2.7× for a dozen lines
and no toolchain, and it is exact. That is the first move, and it is very likely
the last one needed.

What would reopen it: the density field at `cell=1` genuinely blows the budget at
17.9 ms — but the fix there is to use the distance field, not to change language.
Hundreds of balls, a quarter-pixel cell on a 4K canvas, or the trace growing past
half the frame would each be a real reason to look again. None of those is the
demo.

## Reproducing

```bash
node archive/2026-07-wasm-kernel-headroom/probe.mjs
```

No dependencies. Spawns one child process per measurement, so it takes a couple
of minutes and prints agreement checks before any timing — a faster kernel that
returns a different distance is not a faster kernel.

The in-situ frame numbers are not reproduced by the probe: they need a real
display and the live story at `Studies/SDF edge trace`. The sweep table comes
from that story's own **Run benchmark** panel.
