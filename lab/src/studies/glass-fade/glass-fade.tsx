import { cn } from '@monorepo/utils';
import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties, type FC } from 'react';

import {
  BACKDROP_STYLE,
  CONVOLUTION_BLUR_NOTE,
  FADE_MODE_NOTE,
  FADE_MODE_TITLE,
  FADE_MODES,
  LOREM,
  MAPPED_MATERIAL_BLUR_NOTE,
  type BackdropKind,
  type FadeMode,
} from './glass-fade-modes.js';
import { SvgConvolutionFilter } from './svg-convolution-filter.js';

/*
 * One glass panel over a backdrop that shows whether the blur is running, and a
 * scrubbable 0 → 1 for how far along its appearance is. The question the board
 * asks is which property that 0 → 1 should drive.
 *
 * Scrub rather than animate: the artefact belongs to every intermediate frame,
 * not to the transition, and parking on one frame is the only way to look at it.
 * The slider is also the parameter, which is what Controls is for.
 */

/*
 * No substrate of its own: the stage keeps the canvas's own background, so the copy
 * behind the glass sits on the same page the rest of the demo does and the frost has
 * to hold up against real content rather than against a test chart. A hairline in
 * the canvas's own ink at low alpha is the whole edge treatment.
 *
 * `overflow-clip` plus overscan — 80px at the sides, 24px on top — is what keeps the
 * copy reading as an infinite page: the block's first line, left margin and ragged
 * right are all outside the frame, so every edge of the backdrop is a cut through a
 * glyph rather than the end of a paragraph. The sides get much more than the top
 * because a ragged right edge is a shape the eye reads as "column", and 80px is
 * enough that no line ends inside the frame. The bottom needs no overscan — there is
 * more copy than height, so it clips mid-line on its own.
 *
 * Deliberately not a mask: `mask-image` here would make this a backdrop root, and the
 * demo would be doing in its own chrome the thing the third cell is about. A clip is
 * free — it forms nothing.
 */
const PLATE = 'relative h-56 w-full overflow-clip border border-black/15 dark:border-white/20';
const BACKDROP_LAYER = 'pointer-events-none absolute -inset-x-20 -top-6 bottom-0 select-none';
const BACKDROP_TEXT = 'text-[11px] leading-[1.45] text-black/75 dark:text-white/75';
const PANEL = 'absolute inset-x-8 inset-y-9 grid place-items-center rounded-2xl';
const CHIP = 'rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white';
const CAPTION = 'text-xs leading-relaxed text-neutral-500 dark:text-neutral-400';
const BUTTON = `
  cursor-pointer rounded-[4px] border border-black/20 bg-white/0 px-3 py-1 text-xs text-black/70
  hover:bg-black/5
  active:bg-black/10
  dark:border-white/30 dark:text-white/80 dark:hover:bg-white/5 dark:active:bg-white/10
`;

/** How the α is handed over to a gesture. */
export type Interaction = 'hover' | 'toggle';

/**
 * α is not what the eye reads; each axis converts it at its own rate. Measured on this backdrop
 * at 2× device pixels as the loss of multi-scale detail energy inside the panel — the full
 * instrument, and every number below, is `archive/2026-08-glass-fade-perceptual-alpha`.
 * Those archived measurements use the original white tint and 20px target, not the current defaults.
 *
 * | axis        | perceived, α = ⅛ … 1              | mean error vs an even ramp |
 * | ----------- | --------------------------------- | -------------------------- |
 * | tint, γ = 1 | .11 .20 .32 .41 .51 .68 .80 1.00  | already even (γ fits 1.00) |
 * | blur, γ = 1 | .89 .97 1.0 1.0 1.0 1.0 1.0 1.0   | 0.422 — all of it up front |
 * | blur, γ = 2 | .22 .75 .91 .97 1.0 1.0 1.0 1.0   | **0.295**                  |
 * | blur, γ = 4 | .00 .06 .28 .75 .92 .99 1.0 1.0   | 0.165, and unshippable     |
 *
 * So the tint stays linear — veiling removes backdrop contrast in proportion to (1 − α), so its
 * detail loss already *is* linear in α — and only the radius is remapped by default. Tint and content have independent exponents too.
 *
 * γ = 4 measures best and cannot ship: 0.3⁴ of 20px is 0.16px, so the first third of the ramp is
 * a dead zone you can watch. The tension is real rather than a flaw in the metric — perceived
 * frostiness goes as roughly the log of the radius, one pixel of blur already delivering 71% of
 * everything the axis will ever deliver — so any mapping that evens the curve out has to crawl
 * through the low end. The archived γ = 2 preset was about 1.4× more even than linear with nothing dead.
 * The current default is γ = 2.6; `blurGamma` is a control because where to sit on that trade is a judgement no
 * measurement settles.
 *
 * Past about 4px on this content the radius is nearly free of perceptual effect, so most of a
 * 20px design is spent where the eye cannot see it change. The renderer also introduces steps,
 * including larger jumps when its downsampling pass count changes. In Chrome 154, with this
 * panel held in place and tint fixed, 8.888 → 8.889px and 17.777 → 17.778px visibly jump at both
 * 1× and 2× device pixels. With radius = 20·α², these land at 66% → 67% and 94% → 95%.
 *
 * The measured boundaries match Skia's max linear sigma of 4 and its 0.9 multipass limit:
 * 4·2/0.9 ≈ 8.889 and 4·4/0.9 ≈ 17.778. Crossing one adds a resampling pass, so a continuous
 * CSS radius does not guarantee a continuous image. These are renderer implementation details,
 * not universal CSS thresholds; higher DPR did not remove these two jumps in the current probe.
 * Changing γ moves where they land in α; easing or finer radius serialization cannot remove
 * the pass boundary. Keep this distinct from the smaller quantisation treads in the archive.
 *
 * https://github.com/google/skia/blob/main/src/core/SkBlurEngine.h
 * https://github.com/google/skia/blob/main/src/core/SkImageFilterTypes.cpp (downscale_step_count)
 */
const DEFAULT_REMAP_EXPONENT = { blur: 2.6, border: 1, content: 1, tint: 1 } as const;

/** Whether each parameter progress is used directly or remapped through its own power curve. */
export type Mapping = 'linear' | 'remapped';

/** Whether α itself moves at a constant rate over time, or is eased. */
export type Timing = 'ease' | 'linear';

export type BlurImplementation = 'css' | 'svg-convolution';

export interface GlassFadeOptions {
  /** Which property the fade's α is hung on. Does not touch what the material is. */
  mode: FadeMode;
  /**
   * The fade's α. Read by every mode except `material`, which has no separate α — moving
   * the material *is* its fade, so there the four progresses below are the parameters.
   */
  progress: number;
  backdrop: BackdropKind;
  /** Blur radius of the material at full strength — the end of the radius ramp. */
  blurPx: number;
  /** Experimental convolution bypasses Skia's Gaussian blur downsampling path. */
  blurImplementation?: BlurImplementation;
  /** The colour of the material's tint. A dark glass is one value away. */
  tint: string;
  /**
   * The tint's alpha at full strength — the end of the alpha ramp. Kept out of `tint` so
   * it stays a slider rather than a page in a colour picker, and multiplied with whatever
   * alpha `tint` carries, so neither control is dead.
   */
  tintAlphaTarget: number;
  /** Border colour and full-strength alpha are independent of the material tint. */
  borderColor: string;
  borderAlphaTarget: number;
  /**
   * Where along each ramp the surface currently is. Left out — which is every mode but
   * `material` — the material is simply at full strength; `material` is the one mode whose
   * fade *is* these, so there they follow `progress` unless split apart.
   *
   * `contentProgress` is its own axis rather than a consequence of the tint, because in
   * production the content's own fade is its own curve — usually trailing the material,
   * sometimes not fading at all. The other modes cannot have it: fading the finished layer
   * takes the content with it, which is part of why they are wrong.
   */
  blurRadiusProgress?: number;
  tintAlphaProgress?: number;
  borderAlphaProgress?: number;
  contentProgress?: number;
  /**
   * Whether each parameter reads its input progress directly or through its own remap curve. A separate
   * layer from easing, and the order is fixed: time → ease → **α** → mapping → axis value.
   * The ease decides *when* α gets somewhere; the mapping decides *how much material* being
   * there means. Each parameter has its own exponent; sharing input progress does not bind
   * its output curve.
   */
  mapping?: Mapping;
  /** Each remap exponent is independent. Gamma 1 leaves that parameter linear. */
  blurGamma?: number;
  tintGamma?: number;
  borderGamma?: number;
  contentGamma?: number;
  /** Whether the gesture's α is eased or runs at a constant rate. */
  timing?: Timing;
}

/** Full strength, unless this is the mode that expresses its fade by ramping the material. */
function materialProgress({
  blurRadiusProgress,
  borderAlphaProgress,
  contentProgress,
  mode,
  progress,
  tintAlphaProgress,
}: GlassFadeOptions) {
  const all = mode === 'material' ? progress : 1;

  return {
    blur: blurRadiusProgress ?? all,
    border: borderAlphaProgress ?? all,
    content: contentProgress ?? all,
    tint: tintAlphaProgress ?? all,
  };
}

/**
 * Remap each parameter after resolving its input progress. Sliders retain those input
 * values; only the rendered material sees the outputs. Shared progress synchronises the
 * inputs, while each exponent still controls a separate output curve.
 */
function remapped(
  at: { blur: number; border: number; content: number; tint: number },
  mapping: Mapping,
  exponents: { blur: number; border: number; content: number; tint: number }
) {
  if (mapping === 'linear') {
    return at;
  }

  return {
    blur: at.blur ** exponents.blur,
    border: at.border ** exponents.border,
    content: at.content ** exponents.content,
    tint: at.tint ** exponents.tint,
  };
}

// Shared duration for hover and toggle, including the linear timing baseline.
const DURATION = 0.5;
// Front-load the shared progress, then decelerate. Parameter remaps run after this curve.
const EASE_DECELERATE = [0, 0.4, 0.01, 1] as const;

/*
 * Every property the material is made of is transitionable, so the cheap way to animate this
 * is to set the target and let the browser interpolate — no per-frame JavaScript at all. It
 * is also the way that cannot express a perceptual mapping, and the reason is worth keeping:
 * a transition interpolates the *endpoint values* of each property and never evaluates the α
 * in between. Both endpoints are the same under any mapping — 0 and 1 map to 0 and 1 — so the
 * mapping has nothing to act on and a transition-driven toggle silently ignores it.
 *
 * So α is driven here instead, one value per frame, and the two layers apply in order:
 * ease shapes α over time, then the mapping turns α into material. The cost is a React render
 * per frame, which for one panel over static copy is cheap; the alternative is transitioning a
 * registered `@property` custom α and writing the mapping in CSS `pow()`, which buys back the
 * frames but moves the mapping somewhere it cannot be measured from here.
 */
function useDrivenAlpha(target: number, timing: Timing, enabled: boolean) {
  const [alpha, setAlpha] = useState(target);
  // The animation starts from wherever the last one got to, so an interrupted gesture
  // reverses from the current frame rather than snapping to an end.
  const current = useRef(target);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controls = animate(current.current, target, {
      duration: reduceMotion === true ? 0 : DURATION,
      ease: timing === 'ease' ? [...EASE_DECELERATE] : 'linear',
      onUpdate: (value) => {
        current.current = value;
        setAlpha(value);
      },
    });

    return () => controls.stop();
  }, [enabled, reduceMotion, target, timing]);

  return enabled ? alpha : target;
}

/** The material's axes after both layers, which is what every style below is built from. */
function axesOf(options: GlassFadeOptions) {
  return remapped(materialProgress(options), options.mapping ?? 'linear', {
    blur: options.blurGamma ?? DEFAULT_REMAP_EXPONENT.blur,
    border: options.borderGamma ?? DEFAULT_REMAP_EXPONENT.border,
    content: options.contentGamma ?? DEFAULT_REMAP_EXPONENT.content,
    tint: options.tintGamma ?? DEFAULT_REMAP_EXPONENT.tint,
  });
}

function panelStyle(options: GlassFadeOptions, driven: boolean, convolutionId: string): CSSProperties {
  const { blurPx, borderColor, borderAlphaTarget, mode, progress, tint, tintAlphaTarget } = options;
  const at = axesOf(options);
  const radius = blurPx * at.blur;
  // Each colour retains its own alpha; border progress and remapping do not affect the fill.
  const tintColor = `rgb(from ${tint} r g b / calc(alpha * ${(tintAlphaTarget * at.tint).toFixed(4)}))`;

  const borderTint = `rgb(from ${borderColor} r g b / calc(alpha * ${(borderAlphaTarget * at.border).toFixed(4)}))`;

  return {
    /*
     * `blur(0px)` is still a filter — it keeps the compositing layer and the backdrop root
     * alive, and only `none` releases them. So `none` is right at rest and wrong in flight:
     * a gesture that lands on 0 should release the layer, but one passing through 0 should
     * not create and destroy it per frame.
     */
    backdropFilter:
      radius === 0 && !driven
        ? 'none'
        : options.blurImplementation === 'svg-convolution'
          ? `url(#${convolutionId})`
          : `blur(${radius.toFixed(2)}px)`,
    backgroundColor: tintColor,
    boxShadow: `inset 0 0 0 1px ${borderTint}`,
    maskImage:
      mode === 'mask-alpha' ? `linear-gradient(rgb(0 0 0 / ${progress}), rgb(0 0 0 / ${progress}))` : undefined,
    opacity: mode === 'layer-opacity' ? progress : 1,
  };
}

/**
 * The label is a descendant, so its own opacity is free: a descendant's alpha
 * cannot reach the parent's backdrop. Fading the content while the material
 * ramps is the legitimate use of opacity here, and `material` is the only mode
 * that has to do it by hand — the others drag the label along with the layer.
 */
const Panel: FC<GlassFadeOptions & { label: string; driven: boolean }> = ({ driven, label, ...options }) => {
  const convolutionId = useId();

  return (
    <div className={PANEL} style={panelStyle(options, driven, convolutionId)}>
      {options.blurImplementation === 'svg-convolution' && (
        <SvgConvolutionFilter
          id={convolutionId}
          radius={options.blurPx * axesOf(options).blur}
          targetRadius={options.blurPx}
        />
      )}
      <span className={CHIP} style={{ opacity: options.mode === 'material' ? axesOf(options).content : 1 }}>
        {label}
      </span>
    </div>
  );
};

/*
 * The sliders sit in the page as well as in Controls, because the whole demo is a scrub
 * and reaching for a panel to do it puts the pointer somewhere other than under the eye.
 * They are controlled from args and write back through `onOptionsChange`, so the two are
 * one value rather than two that drift — the pattern the JunctionSpacing board uses.
 *
 * Only progress-shaped values appear here. Which ones are live depends on the mode, so
 * the row never shows a slider the mode ignores.
 */
const RANGE =
  'h-1 w-full grow cursor-pointer appearance-none rounded-full bg-black/15 accent-black dark:bg-white/20 dark:accent-white';

/**
 * An arg write is not a `setState`: it crosses Storybook's channel and re-renders the
 * Controls panel along with the story, which is far too much to do per pointer-move. So a
 * scrub is local while the pointer is down and commits once on release.
 *
 * The local patch has to live *here*, above the panel, not inside the slider — the panel
 * is the thing being scrubbed, so it has to read the live value too. A slider owning its
 * own live state moves its own readout and leaves the glass frozen at the last commit.
 *
 * The patch is dropped the moment any committed value changes: that is the signal that the
 * commit has landed, or that Controls has overridden us. Adjusting the state during render
 * rather than in an effect is what avoids the frame in between, where the panel would snap
 * back to the pre-drag value before the new one arrives.
 */
function useScrub(options: GlassFadeOptions, commit?: (patch: Partial<GlassFadeOptions>) => void) {
  const [patch, setPatch] = useState<Partial<GlassFadeOptions> | null>(null);
  // Only the scrubbable values, joined, because `options` is a fresh object every render
  // and identity cannot answer "did the committed value change".
  const committed = [options.progress, options.blurRadiusProgress, options.tintAlphaProgress, options.contentProgress]
    .map((value) => value ?? '')
    .join('/');
  const [seen, setSeen] = useState(committed);

  if (seen !== committed) {
    setSeen(committed);
    setPatch(null);
  }

  return {
    live: patch === null ? options : { ...options, ...patch },
    onInput: (next: Partial<GlassFadeOptions>) => setPatch((previous) => ({ ...previous, ...next })),
    onRelease: () => {
      if (patch !== null) {
        commit?.(patch);
      }
    },
  };
}

const ProgressSlider: FC<{
  label: string;
  value: number;
  onInput: (value: number) => void;
  onRelease: () => void;
}> = ({ label, onInput, onRelease, value }) => (
  <label className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
    {/* Fixed widths on both the name and the readout: neither may resize as the value
        changes, or dragging one slider nudges the other sideways. */}
    <span className="w-24 shrink-0">{label}</span>
    <input
      className={RANGE}
      max={1}
      min={0}
      // React maps `onChange` to the DOM's `input`, so that is the live one and the commit
      // needs the pointer and key events. `onBlur` is the backstop for a release that
      // lands outside the control.
      onBlur={onRelease}
      onChange={(event) => onInput(event.target.valueAsNumber)}
      onKeyUp={onRelease}
      onPointerUp={onRelease}
      step={0.01}
      type="range"
      value={value}
    />
    <span className="w-8 shrink-0 text-right tabular-nums">{value.toFixed(2)}</span>
  </label>
);

export const GlassFadeStage: FC<
  GlassFadeOptions & {
    className?: string;
    /** A comparison can keep its explanation and layout fixed while switching renderers. */
    captionNote?: string;
    onOptionsChange?: (patch: Partial<GlassFadeOptions>) => void;
    /**
     * Hand the α to a gesture instead of a slider. `hover` runs between the story's
     * `progress` and 1, so it shows a surface *strengthening* rather than appearing;
     * `toggle` runs the full 0 → 1, which is the appearance proper.
     */
    interaction?: Interaction;
  }
> = ({ captionNote, className, interaction, onOptionsChange, ...options }) => {
  const [engaged, setEngaged] = useState(false);
  const scrub = useScrub(options, onOptionsChange);
  /*
   * An interaction owns the α outright, overriding both the slider and the arg — which is why
   * the two are hidden while one is attached. It overrides `progress` alone, and the four
   * material axes then follow it through their own fallback, so a gesture drives the whole
   * material without knowing the axes exist.
   *
   * The gesture names a target; `useDrivenAlpha` walks α there over time, easing it if asked.
   * That ordering is the point: this is the ease layer, and the mapping layer is downstream of
   * it, inside the styles.
   */
  /*
   * Nullish rather than `!== undefined` throughout: these arrive as Storybook args, which are
   * untyped at runtime, and an explicit `null` is what clearing one looks like. Read strictly,
   * `interaction: null` counts as a gesture, and the stage starts animating α towards a resting
   * value on a story that has no gesture at all — which reads as the panel quietly drifting.
   */
  const gesture = interaction ?? null;
  const resting = gesture === 'toggle' ? 0 : options.progress;
  const alpha = useDrivenAlpha(engaged ? 1 : resting, options.timing ?? 'linear', gesture !== null);
  const live = gesture === null ? scrub.live : { ...scrub.live, progress: alpha };
  const { backdrop, blurRadiusProgress, borderAlphaProgress, contentProgress, mode, progress, tintAlphaProgress } =
    live;
  const at = materialProgress(live);
  const split =
    blurRadiusProgress != null || borderAlphaProgress != null || contentProgress != null || tintAlphaProgress != null;
  // Label what is actually driving this cell, so the number never reports a slider the mode
  // ignores. Split apart there is no single number, so it reports the tint — the axis that
  // reads as the material being there, and the one the label is sitting on.
  const shown = split ? at.tint : progress;
  const panel = <Panel {...live} driven={gesture !== null} label={`${Math.round(shown * 100)}%`} />;

  return (
    <figure className={cn('flex w-full max-w-xl flex-col gap-2', className)}>
      <div
        className={PLATE}
        onPointerEnter={gesture === 'hover' ? () => setEngaged(true) : undefined}
        onPointerLeave={gesture === 'hover' ? () => setEngaged(false) : undefined}
      >
        <div aria-hidden className={BACKDROP_LAYER} style={{ background: BACKDROP_STYLE[backdrop] }}>
          {backdrop === 'text' && <p className={BACKDROP_TEXT}>{LOREM}</p>}
        </div>
        {mode === 'ancestor-opacity' ? (
          // A wrapper holding nothing but the glass — the shape `AnimatePresence`
          // produces when a motion element is given the fade instead of the card.
          <div className="absolute inset-0" style={{ opacity: progress }}>
            {panel}
          </div>
        ) : (
          panel
        )}
      </div>
      {gesture === 'toggle' && (
        <div>
          <button className={BUTTON} onClick={() => setEngaged((previous) => !previous)} type="button">
            {engaged ? 'Hide' : 'Show'}
            {/* Both labels stay in the DOM so the button sizes to the wider of the two and
                does not resize on click, which would move it out from under the pointer
                mid-transition. */}
            <span className="invisible flex h-0 flex-col overflow-clip leading-0">
              <span>Hide</span>
              <span>Show</span>
            </span>
          </button>
        </div>
      )}
      {gesture === 'hover' && (
        <p className={CAPTION}>Pointer over the panel to take α from {options.progress.toFixed(2)} to 1.</p>
      )}
      {onOptionsChange !== undefined && gesture === null && (
        <div className="flex flex-col gap-1.5">
          {/* One slider per input: the split controls appear only where a story supplies
              overrides, so the bound case needs no flag of its own — omitting all four axes
              *is* the merged case. */}
          {split ? (
            <>
              <ProgressSlider
                label="blur radius"
                onInput={(blurRadiusProgress) => scrub.onInput({ blurRadiusProgress })}
                onRelease={scrub.onRelease}
                value={at.blur}
              />
              <ProgressSlider
                label="tint alpha"
                onInput={(tintAlphaProgress) => scrub.onInput({ tintAlphaProgress })}
                onRelease={scrub.onRelease}
                value={at.tint}
              />
              <ProgressSlider
                label="border alpha"
                onInput={(borderAlphaProgress) => scrub.onInput({ borderAlphaProgress })}
                onRelease={scrub.onRelease}
                value={at.border}
              />
              <ProgressSlider
                label="content"
                onInput={(contentProgress) => scrub.onInput({ contentProgress })}
                onRelease={scrub.onRelease}
                value={at.content}
              />
            </>
          ) : (
            <ProgressSlider
              label={mode === 'material' ? 'all progress' : 'α'}
              onInput={(next) => scrub.onInput({ progress: next })}
              onRelease={scrub.onRelease}
              value={progress}
            />
          )}
        </div>
      )}
      <figcaption className={cn(CAPTION, 'flex flex-col gap-2')}>
        <p>
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{FADE_MODE_TITLE[mode]}</span>{' '}
          {FADE_MODE_NOTE[mode]}
        </p>
        {mode === 'material' && (
          <p>
            {split
              ? 'Independent progress values drive blur, tint alpha, border alpha and content opacity.'
              : 'All four parameter progress values are bound to the shared progress.'}{' '}
            {live.mapping === 'remapped'
              ? `Each parameter remaps its input as progress^γ: blur γ = ${live.blurGamma ?? DEFAULT_REMAP_EXPONENT.blur}, tint γ = ${live.tintGamma ?? DEFAULT_REMAP_EXPONENT.tint}, border γ = ${live.borderGamma ?? DEFAULT_REMAP_EXPONENT.border}, content γ = ${live.contentGamma ?? DEFAULT_REMAP_EXPONENT.content}. Binding the input progress still leaves these curves independent.`
              : 'Each parameter uses its input progress directly.'}
          </p>
        )}
        {captionNote !== undefined ? (
          <p>{captionNote}</p>
        ) : live.blurImplementation === 'svg-convolution' ? (
          <p>{CONVOLUTION_BLUR_NOTE}</p>
        ) : (
          mode === 'material' && live.mapping === 'remapped' && <p>{MAPPED_MATERIAL_BLUR_NOTE}</p>
        )}
      </figcaption>
    </figure>
  );
};

/**
 * The composed view, because α = 0.5 is only damning next to the mode that gets it
 * right at the same α. One α drives every cell here: the three fade modes hang it on
 * their own property over a full-strength material, and `material` spends it on all four
 * parameter progress values at once. Decoupling them is what the material story's own sliders are
 * for; on this board they would only make the cells incomparable.
 */
export const GlassFadeComparison: FC<
  Omit<
    GlassFadeOptions,
    'blurRadiusProgress' | 'borderAlphaProgress' | 'contentProgress' | 'mode' | 'tintAlphaProgress'
  >
> = (options) => (
  <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
    {FADE_MODES.map((mode) => (
      // Leaving all material progresses unset is what makes the cells comparable: each
      // one then reads the single α, and no cell can be scrubbed away from the others.
      <GlassFadeStage {...options} className="max-w-none" key={mode} mode={mode} />
    ))}
  </div>
);
