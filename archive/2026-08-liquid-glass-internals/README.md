# 2026-08-liquid-glass-internals

**Question.** Our SVG displacement-map glass is tuned by eye. What does Apple's Liquid
Glass actually compute — what is the parameter set, and how is the chromatic dispersion
built? Specifically: is the dispersion three RGB samples, or something else?

**Answer.** The parameter set is 63 fields, recovered verbatim. The dispersion is _not_
three RGB point samples: it is six taps along one direction, integrated per channel with
overlapping triangular weights, normalised by `(0.5, 1/3, 0.5)`. And on macOS 27 a plain
`NSGlassEffectView` runs it at zero amplitude — measured, not inferred.

## What is committed here

```
probe-shaders.sh          Apple's metallib → uniform lists, constants, dispersion paths
probe-internals.swift     runtime CAFilter catalogue + NSGlassEffectView layer tree
demo-glass.swift          the rig: interactive, or --measure for numbers and PNGs
data/shader-findings.txt  probe-shaders.sh output, verbatim
data/dispersion-loops.ll  the ~40 lines of IR the dispersion claim rests on
data/cafilter-types.txt   the 44 CAFilter types on this build
data/glass-defaults.txt   the NSGlass* user-default keys, and what would not override
data/measurements.txt     demo-glass --measure output, both styles × three backgrounds
__screenshots__/          six 1280×984 captures from the same run (Git LFS)
```

Screenshots are PNG, and the repo root already routes `*.png` through Git LFS, so they land
there without a local `.gitattributes`. Cloning without LFS gives you everything except the
images; re-running `--measure --out __screenshots__` regenerates them.

Two things are deliberately _not_ committed. The full disassembly is 9.2 MB of Apple's
shipping shader code and the `glass_background_all_lpf` module alone is 1,527 lines; keeping
a short excerpt as evidence and a script that regenerates the rest on the reader's own
machine seemed better than vendoring a proprietary binary's contents. And the fat
`default.metallib` itself stays where it is — `probe-shaders.sh` reads it in place.

## Three instruments

Each answers something the others cannot, which is the point of having three.

### 1. `probe-shaders.sh` — Apple's own Metal library

`QuartzCore.framework` ships `default.metallib` on disk (164 MB, 19 GPU slices plus one
`air64_v29` AIR slice). The AIR slice is LLVM bitcode, and `metal-objdump -d` prints it as
readable IR, constants included. This is the load-bearing instrument: it is Apple's
shipping code, not a reconstruction.

```bash
./probe-shaders.sh          # writes air.ll, gb.ll, ca.ll and prints the findings
```

The glass entry points are `glass_background_{minimal,c,r,e,cr,ce,re,all}` and
`glass_background_sdf_*` (same eight, SDF-fed), plus `glass_foreground_*`. The three
template booleans gate `c`/`r`/`e`, so the shipping shader is a feature-gated uber-shader
rather than one fixed pipeline.

`GlassBackgroundUniforms`, in declaration order:

| group        | fields                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| displacement | `displacement_mat` (float4 = 2×2)                                                                                                                                                                                            |
| refraction   | `inner_refraction_amount`, `inner_refraction_inv_height`, `outer_refraction_amount`, `outer_refraction_inv_height`, `refraction_threshold0/1`, `refraction_opacity`                                                          |
| blur         | `blur_radius`, `blur_alpha0..3`, `blur_dist0..3`                                                                                                                                                                             |
| edge bleed   | `edge_bleed_blur_radius`, `edge_bleed_amount`, `edge_bleed_inv_height`, `edge_bleed_dist0/1`, `edge_bleed_opacity`, `bleed_darken` (float2)                                                                                  |
| shadow       | `shadow_amount`, `shadow_inv_height`, `shadow_offset`, `shadow_blur_radius`, `shadow_inv_radius`, `shadow_contribution`, `shadow_face_opacity`, `shadow_dist_offset`, `shadow_opacity`, `sdr_shadow_dist0`, `sdr_shadow_inv` |
| ring shadow  | `ring_shadow_offset`, `ring_shadow_stroke_width`, `ring_shadow_radius`, `ring_shadow_opacity`, `ring_shadow_mask`                                                                                                            |
| colour       | `face_cm0/1/2`, `bleed_cm0/1/2`, `shadow_cm0/1/2` (half4 each — three 3×4 matrices)                                                                                                                                          |
| highlight    | `key_fill_highlight_dir` (float2), `_height`, `_spread`, `_amount`, `_effect_offset`, `_color_bias`                                                                                                                          |
| blur fill    | `blur_fill_blur_radius`, `blur_fill_lighten_opacity`, `blur_fill_darken_opacity`, `blur_fill_normal_opacity`                                                                                                                 |
| aberration   | `aberration_amount`, `aberration_dir` (float2)                                                                                                                                                                               |
| face         | `face_opacity`, `holding_tone_opacity`                                                                                                                                                                                       |

`GlassBackgroundUniformsExt`: `inv_aberration_height`, `aberration_offset`,
`sdr_white_value`, `clamp_limit`, `face_color_matrix_max_luma_complement`, then flags
`preserve_hue`, `blur_fill_enabled`, `stroke_mode`, `highlight_extension`,
`wants_highlight_bias_correction`.

Four things worth reading twice. Refraction is **two-sided** — separate inner and outer
amount/height pairs, with two thresholds between them, not one curve. Blur is a **4-stop
ramp against SDF distance** (`blur_dist0..3` → `blur_alpha0..3`), not a single radius.
There are **three** colour matrices, one each for face, bleed, and shadow. And there is no
IOR anywhere: refraction is parameterised as amount + inverse-height, i.e. as an artistic
falloff, not as Snell.

### How the dispersion actually works

The generic `chromaticAberration` CAFilter is the naive thing, and worth stating so the
glass path is not confused with it. `ChromaticAberrationUniforms` is
`{float2 off0, off1, off2, uvMin, uvMax}`; the shader takes three taps and pulls **R from
tap0, G from tap1, B from tap2** (IR: `extractelement %16, 0` / `%18, 1` / `%20, 2`), each
unpremultiplied by `max(a, 1e-6)`, then re-premultiplies by the mean of the three alphas.
Three point samples, one per primary. Per-tap offsets are full float2s, so directions may
differ per channel — already more general than "scale by refractive index", which is what
every web reimplementation does (e.g. `iyinchao/liquid-glass-studio` uses
`N_R=0.98, N_G=1.0, N_B=1.02`).

`glass_background_*` does something different. Two three-iteration loops:

```
loop A:  w = 1, 2/3, 1/3         uv = base + w · dir
         R += tap.r · w          G += tap.g · (1 − w)
loop B:  t = 0, 1/3, 2/3         uv = base − t · dir
         G += tap.g · w'         B += tap.b · (1 − w')
final:   rgb *= (0.5, 1/3, 0.5)  alpha *= 1/7
```

`w` starting at `1.0` and stepping by `1/3` is read straight off the IR
(`%14 = phi float [1.0, ...], [%83, ...]`, `%83 = fadd %14, -1/3`). So there are six tap
positions spaced `1/3 · dir` apart spanning `[−2/3, +1] · dir`, and each channel is a
**weighted integral over a range of positions** rather than one sample. Neighbouring
channels share taps through the `(w, 1−w)` cross-fade, and the normalisation
`(0.5, 1/3, 0.5)` says R and B each integrate weight-sum 2 while G integrates 3 — green
gets the widest support, which is what you would do if you were approximating a luminance-
weighted spectrum with three channels.

That is the answer to "the dispersion colours are not pure RGB". Overlapping triangular
supports produce _mixtures_ at the fringe — continuous hue ramps through orange and teal —
where three point samples would give you saturated red/green/blue edges. Reinforcing it:
`preserve_hue` is a flag, and the only hardcoded colour constants in the whole shader are
two Rec.709 luma triples, `(0.2126, 0.7152, 0.0722)` and `(0.2125, 0.7154, 0.0721)`, used
to hold luminance while chroma moves.

Each tap is optionally a 4-sample box fetch at a `log2`-selected mip (`%136 = %135 * 0.25`),
so dispersion and blur are one pass, not two.

The actual colour _values_ are not in the shader — `face_cm*` and friends are uniforms, so
they come from the CAFilter at runtime. That is what instrument 2 is for.

### 2. `probe-internals.swift` — the runtime layer tree

```bash
xcrun swiftc -parse-as-library probe-internals.swift -o probe-internals && ./probe-internals
```

No permissions needed; the tree is built in-process before anything reaches the render
server. The window is off-screen so this can run while you work.

44 CAFilter types exist on this build. The glass-relevant ones: `glassBackground` (294),
`glassForeground` (295), `chromaticAberration` (98), `chromaticAberrationMap` (99),
`displacementMap`, `distanceField`, `variableBlur` (773), `vibrantColorMatrix` (777),
`vibrantColorMatrixSourceOver`, `vibrantDark/Light`, `sdrNormalize`, `edrGain`,
`compressLuminance`, `limitAveragePixelLuminance`.

**Limitation, stated plainly:** a freshly instantiated CAFilter exposes only `_type`,
`_name`, `_flags` — the configured uniforms are not reachable as ivars on the client side,
and `NSGlassEffectView`'s own tree did not surface a populated `glassBackground` filter
where the probe looked. So this instrument confirmed the filter _catalogue_ but did **not**
recover Apple's chosen values for `face_cm*`, `aberration_amount`, or the blur ramp. Those
are still open. The known-good next step is `AlexStrNik/ShatteredGlass`'s hierarchy —
`CABackdropLayer` → `CASDFLayer("@0")` → `CASDFElementLayer`, with the filter carrying
`inputSourceSublayerName = "@0"` — which means the filter lives on the backdrop layer of a
SwiftUI-hosted glass, not on the AppKit view's own layer.

### 3. `demo-glass.swift` — pixels

```bash
xcrun swiftc -parse-as-library demo-glass.swift -o demo-glass && ./demo-glass
./demo-glass --measure                        # needs Screen Recording permission
./demo-glass --measure --out __screenshots__  # same run, captures kept as PNGs
```

Interactive mode: real `NSGlassEffectView`, draggable, with a background switcher, a style
switcher, and a `cornerRadius` slider. `--measure` sweeps both styles × three backgrounds,
captures its own window through ScreenCaptureKit, and prints numbers.

Screen capture is not optional here. Glass composites on the window server, so
`CALayer.render(in:)` and `cacheDisplay(in:to:)` both skip the backdrop filter and would
report the background unrefracted — zero displacement, silently. The probe refuses to
print anything rather than fall back to an in-process render.

Backgrounds, each isolating one thing: **stripes** at a known period (a periodic signal
gives a displacement reading at every x, not just one), **a single black→white step** just
inside the rim (one edge means fringe colours are readable without neighbouring-stripe
contamination), and **flat colour swatches** (flat regions cancel refraction, leaving only
the colour transform).

![.clear glass over 48 pt stripes](./__screenshots__/glass-clear-grid.png)

That capture is worth as much as the table below it. In the lightest of the two styles, the
interior stripes are blurred to a low-contrast ripple and stay _where they were_ — the
refraction is confined to a narrow band at the rim, and there is no coloured fringe
anywhere. Both of those are what the numbers then confirm.

Results, 2× capture, 360×200 pt glass at `cornerRadius` 46:

|                               | `.regular`                            | `.clear`                                  |
| ----------------------------- | ------------------------------------- | ----------------------------------------- |
| reference stripe spacing      | 48.000 px (nominal 48.0)              | 48.000 px                                 |
| interior displacement         | no signal — blur destroys the stripes | ≈ 0                                       |
| near-rim displacement         | −7.11 px at the rim                   | −7.66 px at the rim, −3.79 px at 26 pt in |
| peak chroma over glass ±20 px | **0.0039**                            | **0.0078**                                |

Colour card, sRGB codes, sampled at the optically flat centre:

| swatch | outside       | `.regular`            | `.clear`              |
| ------ | ------------- | --------------------- | --------------------- |
| red    | (0.996, 0, 0) | (0.549, 0.161, 0.157) | (0.800, 0.196, 0.188) |
| green  | (0, 1, 0)     | (0.137, 0.384, 0.016) | (0.216, 0.643, 0.000) |
| blue   | (0, 0, 1)     | (0.075, 0.204, 0.592) | (0.043, 0.271, 0.788) |
| cyan   | (0, 1, 1)     | (0.000, 0.396, 0.467) | (0.000, 0.671, 0.902) |

The off-diagonal cross-talk is real and asymmetric — pure green leaks 0.137 into R but only
0.016 into B — which is `face_cm0/1/2` doing its job.

**The dispersion is off.** Over a 760×440 px sweep covering the whole glass and 20 px
around it, against a black/white step edge, **zero pixels** exceed chroma 0.008; the peaks
of 0.0039 and 0.0078 are one to two 8-bit codes, i.e. capture dither. So on macOS 27 a
plain `NSGlassEffectView` in either style runs `aberration_amount` at zero. The machinery
is compiled in and gated off. Visible dispersion presumably belongs to the lens-style
controls (slider, toggle — ShatteredGlass calls this the "Liquid Lens" effect) or to iOS,
neither of which this rig has tested.

### Why `.clear` is not clear

Every capture in `__screenshots__/` looks frosted, including the `.clear` ones. That is not
the rig failing — it is what macOS draws.

`.clear` does take effect, and the difference is large. Through the glass, red reads 0.800
versus `.regular`'s 0.549, and green's Δluma is −0.209 versus −0.410; comparing the two PNGs
pixel by pixel inside the glass gives a mean |Δ| of 44/255 on stripes, 118/255 on the step
edge, and 31/255 on the colour card. The style is unmistakably applied.

What it is not is _transparent_. Apple's clear style is **less tinted, not unfrosted** — the
blur is a separate mechanism (`blur_radius` plus the `blur_dist0..3` ramp) and the style
switch does not zero it. `glass-clear-edge.png` shows this best: the black/white boundary sits
at x = 304 outside the glass and is dragged to roughly x = 420 inside it, smeared across some
120 px. Refraction and blur are both plainly there. What is missing is any colour in that
smear, which is the dispersion result stated above.

Whether the frosting also follows a machine-wide setting: the keys exist and AppKit
references them, including `NSGlassDiffusionSetting`, `NSGlassTintAmount`,
`NSGlassEverEditedInSettings`, and a `NSGlassEffectDiffusionDidChangeNotification` to go
with them. Accessibility is _not_ the cause here — this machine has `reduceTransparency = 0`
and `increaseContrast = 0`. It does carry non-stock values (`NSGlassTintAmount = 1`,
`NSGlassEverEditedInBuddy = 1`, i.e. something edited them through Apple's internal
"Glass Buddy" tool at some point), so its glass is not necessarily configured the way a
fresh install would be.

An app cannot override them from its own defaults. `-NSGlassTintAmount 0 | 0.5 | 1` and
`-NSGlassDiffusionSetting 0..3 | clear | opaque` all produce **bit-identical** output. That
is what you would expect if the material is resolved in the window server, which never sees
an app's `NSArgumentDomain` — and it is also how `CFPreferencesCopyAppValue` behaves, since
that ignores the argument domain too. Whether the setting is overridable _at all_ would need
a write to the real global domain, which is a change to the machine's own settings and so is
left alone here.

### One trap worth the whole section

The first pass at this measured `NSGlassDiffusionSetting` "working": set it to `clear` and
the glass went almost perfectly transparent. It was not real. Glass composites on the window
server's own schedule, so a capture taken too early comes back with the background
**unstyled** — which reads exactly like "the glass is transparent". The tell was an
interleaved control: `bogus` and `clear` each produced _both_ results depending on run order,
and the transparent value sat suspiciously close to the raw background colour.

The first fix was wrong too, which is the more useful half of the story. Waiting for two
consecutive captures with the same content fingerprint _looks_ like the right gate and is
not: a glass that has not started rendering is perfectly stable, so the rule accepts the
artefact happily. It passed four runs, then the artefact came straight back on the fifth.

The gate has to be **positive**, not a stability check. Every background here is uniform
along one axis, so the un-glassed backdrop under the glass is known: `grid` and `edge` are
uniform vertically, so a point inside the glass is compared with the same column above it;
`card` is uniform horizontally, so it is compared along the row. If the glass region still
matches that reference, the effect is not on the frame and the capture is discarded. Only
once it differs does frame stability start counting.

With that in place, six consecutive runs reproduce to the last decimal, and the three
override variants collapse onto identical numbers. Everything in the tables above survived
re-measurement unchanged, so the original readings were the settled state and the conclusions
stand — including "no dispersion", which the artefact could not have faked in either
direction, since an unstyled background has no chroma either.

Two hypotheses died on the way, both worth recording because they are the obvious suspects.
Window focus is not involved: the probe now records `isKeyWindow` and `NSApp.isActive` at
capture time, and a run with both `false` produced bit-identical numbers to runs with both
`true`. And Accessibility is not involved either, per `reduceTransparency = 0`.

## What this changes for our SVG implementation

1. **Two-sided refraction, not one falloff.** Separate inner and outer amount/height with
   thresholds between them. Our single `t^gamma` is the inner half only.
2. **Blur belongs on an SDF-distance ramp**, four stops. We apply one uniform
   `backdrop-blur`, which is why our rim reads flat next to Apple's.
3. **Three colour matrices, not one tint.** Face, bleed, and shadow are toned separately.
4. **Amount + inverse-height beats IOR** as a parameterisation. Apple ships no refractive
   index. Our Snell derivation is more physical but harder to art-direct, and Apple chose
   art direction — worth knowing before we call our version "more correct".
5. **If we add dispersion, integrate — do not point-sample.** Six taps with overlapping
   triangular per-channel weights and `(0.5, 1/3, 0.5)` normalisation, luminance held via
   Rec.709. Three RGB taps at different scales is the thing Apple specifically did not do.

## Open

- Apple's actual _values_ for `face_cm*`, the blur ramp, and the refraction thresholds.
  Needs the SwiftUI/`CABackdropLayer` route, not the AppKit view's own layer.
- Whether `.clear`'s near-rim −7.66 px is refraction or the rim highlight producing a
  spurious luma crossing. The two rims disagree in sign, which suggests the latter
  contaminates the reading; the crossing-matcher needs to reject rim pixels before this
  number is quotable.
- Where dispersion is actually enabled. Same rig, pointed at a `Slider`, should settle it.
- Whether `NSGlassDiffusionSetting` controls the frosting at all, and what its value domain
  is. Needs a write to `NSGlobalDomain` — a real change to the machine — so it is unanswered
  rather than answered wrongly.
- Whether this machine's non-stock `NSGlassTintAmount = 1` shifts any of the numbers above.
  Worth re-running the rig somewhere that never had Glass Buddy pointed at it.

## Sources

- Apple, `QuartzCore.framework/Resources/default.metallib`, macOS 27.0 (26A5388g) — primary.
- `AlexStrNik/ShatteredGlass` — the `CABackdropLayer`/`CASDFLayer`/`CASDFElementLayer`
  hierarchy and the `glassBackground` + `inputSourceSublayerName` finding.
- `iyinchao/liquid-glass-studio` — cited as the contrast case for per-channel IOR.
