# scroll offset quantization: how to hold anchored content still to the device pixel

**Date:** 2026-09 · **Status:** implemented as `anchor/presentation.ts` in the chat history list · **Applies to:**
Chromium 153 and Chrome Dev 156 (headed), Safari Technology Preview (Safari 27), iOS 27
Safari in the Simulator

The chat history list's anchoring resolves a fractional scroll offset every time a row above
the reading position changes size. The browser snaps whatever is written to `scrollTop`, so
in the playground a row resizing every frame left the anchor up to 0.25px off in Chromium, and
the question was whether that is visible and what to do about it. The obvious answer, a
sub-pixel spacer above the content that carries the fraction `scrollTop` cannot, only works if
the painted result is actually stable; this measures that rather than assuming it.

## the platform

What `scrollTop` keeps of a fractional write:

| Browser                      | Writes 100.3 | Writes 100.7 | Step                         |
| ---------------------------- | ------------ | ------------ | ---------------------------- |
| Chromium, headed, 2x display | 100.5        | 100.5        | the screen's device pixel    |
| Chromium, headless           | 100          | 101          | a whole CSS pixel, rounded   |
| Safari 27, 2x display        | 100          | 100          | a whole CSS pixel, truncated |
| iOS 27 Safari, 3x Simulator  | 100          | 100          | a whole CSS pixel, truncated |

The Chromium step follows the real screen, not the page's device pixel ratio: emulating a
device scale factor of 1, 1.25, 1.5 or 3 on a 2x display still gives 0.5px. It is the same in
Chromium 153 and Chrome Dev 156. Headless is not what users get, so the probe runs headed.

## measured

The probe renders 24 states of a row above the anchor whose height is a fractional raised
cosine, each in its own scroller, and asks each to put the anchor's top edge 50.37px below
the scroller's top. It then decodes one screenshot and reports on which device pixels the
anchor's top border, a 4px bar and a line of text were painted across the 24 states. One value
means the anchor held still to the pixel; two or more means it hops from frame to frame.

- **direct:** write the fractional offset to `scrollTop` and let the browser snap it.
- **spacer:** round the offset up to a grid for `scrollTop`, and put the remainder in a spacer
  above the content. Rounding up keeps the spacer non-negative, so there is no "take a pixel
  off, then add the fraction back" case.
- **translate:** the same `scrollTop`, and `translateY` of the remainder on the content.

The grid is either the browser's scroll step or the smallest multiple of it that is also a
whole number of device pixels (the device-aligned step).

Headed Chromium 153, device pixel ratio emulated, painted positions in device pixels:

| DPR  | direct    | spacer, scroll step | spacer, aligned step  | translate, aligned step |
| ---- | --------- | ------------------- | --------------------- | ----------------------- |
| 1    | 2 / 2 / 2 | 1 / 1 / 2           | **1 / 1 / 1** (1px)   | 1 / 1 / 2               |
| 1.25 | 2 / 2 / 3 | 2 / 2 / 2           | **1 / 1 / 1** (4px)   | 2 / 2 / 1               |
| 1.5  | 2 / 3 / 2 | 2 / 2 / 2           | **1 / 1 / 1** (2px)   | 2 / 1 / 2               |
| 2    | 2 / 2 / 2 | **1 / 1 / 1**       | **1 / 1 / 1** (0.5px) | 2 / 2 / 2               |
| 3    | 3 / 3 / 3 | 1 / 1 / 2           | **1 / 1 / 1** (1px)   | 2 / 2 / 3               |

Each cell is the number of distinct painted positions of border / bar / text. At DPR 2 the
scroll step is already a device pixel, which is why both spacer columns agree.

Safari 27 at DPR 2, where the scroll step and the aligned step are both 1px:

| presentation | largest quantization | border / bar / text positions |
| ------------ | -------------------- | ----------------------------- |
| direct       | 0.94px               | 3 / 3 / 3                     |
| spacer       | 0                    | **1 / 1 / 1**                 |
| translate    | 0                    | 2 / 2 / 2                     |

iOS 27 Safari on an iPhone 17 Pro Simulator at DPR 3, where both steps are again 1px:

| presentation | largest quantization | border / bar / text positions |
| ------------ | -------------------- | ----------------------------- |
| direct       | 0.94px               | 4 / 4 / 4                     |
| spacer       | 0                    | **1 / 1 / 1**                 |
| translate    | 0                    | 2 / 2 / 2                     |

Safari's truncation makes direct writes worse than Chromium's rounding: the error reaches
almost a whole CSS pixel, two device pixels at 2x and nearly three on the phone, where the
anchor visibly wanders over four device pixels.

## why

This is our reading of the numbers; the probe does not isolate it. Scrolled content is
painted in its own coordinate space and then offset by the scroll position. Layout positions inside it keep sub-pixel precision and are snapped to device pixels
when painted, relative to that space. A spacer changes a layout position, so its fraction goes
through the same snapping as any other layout; as long as the scroll offset itself is a whole
number of device pixels, content at the same place on screen snaps the same way whatever the
split between spacer and scroll. When the scroll step is not a whole number of device pixels,
the space itself sits at a fractional device position and the snapping differs from state to
state, which is the "spacer, scroll step" column at DPR 1, 1.25, 1.5 and 3. A transform is
applied after that snapping, so its fraction is either resampled (blur) or snapped on its own.

## what was decided

- **The reading offset stays the source of truth.** It is fractional and never read back from
  `scrollTop`; what the screen shows is derived from it. This landed first, with the
  quantization error shown in the playground's state panel.
- **Present the fraction with a spacer, on the device-aligned step.** `scrollTop` is the
  reading offset rounded up to that step, and a spacer above the content takes the remainder,
  so the anchor is held to the device pixel in both browsers and at every pixel ratio measured.
- **Measure the step at runtime.** It depends on the engine, the screen and whether the browser
  is headless, so it is found by writing fractional offsets and reading them back, then
  widened to a whole number of device pixels, rather than assumed from `devicePixelRatio`.
- **Not a transform.** It does not hold still at any pixel ratio measured.

iOS was measured in the Simulator, not on a device.

## reproducing

```bash
node archive/2026-09-scroll-offset-quantization/probe.mjs
```

The numbers above came from one run:

```bash
SAFARIDRIVER="/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver" \
IOS_SIMULATOR=<udid of a booted simulator> \
node archive/2026-09-scroll-offset-quantization/probe.mjs
```

It opens windows, since Chromium must run headed. The Safari targets need Remote Automation
enabled in the Safari that `SAFARIDRIVER` belongs to, and Safari takes one WebDriver session at
a time, so stop any other first (a `safaridriver --mcp`, say). Without `IOS_SIMULATOR` the iOS
target is skipped. A phone's screenshot covers the whole screen, so the page carries a red
marker at its viewport's corner to be found in each shot. `__screenshots__/` holds the first
shot from headed Chromium at DPR 2, from Safari and from the Simulator.
