import { cn } from '@monorepo/utils';
import type { CSSProperties, FC } from 'react';

import {
  BACKDROP_STYLE,
  FADE_MODE_NOTE,
  FADE_MODE_TITLE,
  FADE_MODES,
  LOREM,
  type BackdropKind,
  type FadeMode,
} from './glass-fade-modes.js';

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

export interface GlassFadeOptions {
  /** Which property the fade's α is hung on. Does not touch what the material is. */
  mode: FadeMode;
  /**
   * The fade's α. Read by every mode except `material`, which has no separate α — moving
   * the material *is* its fade, so there the two progresses below are the parameters.
   */
  progress: number;
  backdrop: BackdropKind;
  /** Blur radius of the material at full strength — the end of the radius ramp. */
  blurPx: number;
  /** The colour of the material's tint. A dark glass is one value away. */
  tint: string;
  /**
   * The tint's alpha at full strength — the end of the alpha ramp. Kept out of `tint` so
   * it stays a slider rather than a page in a colour picker, and multiplied with whatever
   * alpha `tint` carries, so neither control is dead.
   */
  tintAlphaTarget: number;
  /**
   * Where along each ramp the material currently is. Left out — which is every mode but
   * `material` — the material is simply at full strength; `material` is the one mode
   * whose fade *is* these two, so there they follow `progress` unless split apart.
   */
  blurRadiusProgress?: number;
  tintAlphaProgress?: number;
}

/** Full strength, unless this is the mode that expresses its fade by ramping the material. */
function materialProgress({ blurRadiusProgress, mode, progress, tintAlphaProgress }: GlassFadeOptions) {
  const both = mode === 'material' ? progress : 1;

  return { blur: blurRadiusProgress ?? both, tint: tintAlphaProgress ?? both };
}

function panelStyle(options: GlassFadeOptions): CSSProperties {
  const { blurPx, mode, progress, tint, tintAlphaTarget } = options;
  const at = materialProgress(options);
  const radius = blurPx * at.blur;
  /*
   * Relative colour syntax rather than `color-mix(in srgb, tint x%, transparent)`, which
   * would read better and does scale a colour's alpha correctly (mixing is premultiplied,
   * so the hue survives). It loses on the hairline: mixing towards `transparent` can only
   * ever move alpha *down* to the tint's own, and the hairline has to sit at twice it to
   * stay visible at the alphas glass actually uses. `calc(alpha * k)` with k > 1 is the
   * only one-expression way to say that, and mixing an opaque copy of the tint back in
   * needs arithmetic on the tint's alpha to hit a target — which lands on `calc(alpha …)`
   * again anyway.
   */
  const tintAt = (scale: number) =>
    `rgb(from ${tint} r g b / calc(alpha * ${(tintAlphaTarget * at.tint * scale).toFixed(4)}))`;

  return {
    // `blur(0px)` is still a filter — it keeps the compositing layer and the
    // backdrop root alive. Only `none` releases them, which is what a real
    // transition should settle to at rest.
    backdropFilter: radius === 0 ? 'none' : `blur(${radius.toFixed(2)}px)`,
    backgroundColor: tintAt(1),
    boxShadow: `inset 0 0 0 1px ${tintAt(2)}`,
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
 *
 * It follows the tint rather than the radius, because the tint is what reads as the
 * material being there; content over a blur with no tint still needs to be legible.
 */
const Panel: FC<GlassFadeOptions & { label: string }> = ({ label, ...options }) => (
  <div className={PANEL} style={panelStyle(options)}>
    <span className={CHIP} style={{ opacity: options.mode === 'material' ? materialProgress(options).tint : 1 }}>
      {label}
    </span>
  </div>
);

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

const ProgressSlider: FC<{ label: string; value: number; onChange: (value: number) => void }> = ({
  label,
  onChange,
  value,
}) => (
  <label className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
    {/* Fixed widths on both the name and the readout: neither may resize as the value
        changes, or dragging one slider nudges the other sideways. */}
    <span className="w-24 shrink-0">{label}</span>
    <input
      className={RANGE}
      max={1}
      min={0}
      onChange={(event) => onChange(event.target.valueAsNumber)}
      step={0.01}
      type="range"
      value={value}
    />
    <span className="w-8 shrink-0 text-right tabular-nums">{value.toFixed(2)}</span>
  </label>
);

export const GlassFadeStage: FC<
  GlassFadeOptions & { className?: string; onOptionsChange?: (patch: Partial<GlassFadeOptions>) => void }
> = ({ className, onOptionsChange, ...options }) => {
  const { backdrop, mode, progress } = options;
  const at = materialProgress(options);
  // Label what is actually driving this cell, so the number never reports a slider the
  // mode ignores.
  const shown = mode === 'material' ? at.tint : progress;
  const panel = <Panel {...options} label={`${Math.round(shown * 100)}%`} />;

  return (
    <figure className={cn('flex w-full max-w-xl flex-col gap-2', className)}>
      <div className={PLATE}>
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
      {onOptionsChange !== undefined && (
        <div className="flex flex-col gap-1.5">
          {mode === 'material' ? (
            <>
              <ProgressSlider
                label="blur radius"
                onChange={(blurRadiusProgress) => onOptionsChange({ blurRadiusProgress })}
                value={at.blur}
              />
              <ProgressSlider
                label="tint alpha"
                onChange={(tintAlphaProgress) => onOptionsChange({ tintAlphaProgress })}
                value={at.tint}
              />
            </>
          ) : (
            <ProgressSlider label="α" onChange={(next) => onOptionsChange({ progress: next })} value={progress} />
          )}
        </div>
      )}
      <figcaption className={CAPTION}>
        <span className="font-semibold text-neutral-700 dark:text-neutral-200">{FADE_MODE_TITLE[mode]}</span>{' '}
        {FADE_MODE_NOTE[mode]}
      </figcaption>
    </figure>
  );
};

/**
 * The composed view, because α = 0.5 is only damning next to the mode that gets it
 * right at the same α. One α drives every cell here: the three fade modes hang it on
 * their own property over a full-strength material, and `material` spends it on both of
 * its axes at once. Decoupling those two is what the material story's own sliders are
 * for; on this board they would only make the cells incomparable.
 */
export const GlassFadeComparison: FC<Omit<GlassFadeOptions, 'blurRadiusProgress' | 'mode' | 'tintAlphaProgress'>> = (
  options
) => (
  <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
    {FADE_MODES.map((mode) => (
      // Leaving both material progresses unset is what makes the cells comparable: each
      // one then reads the single α, and no cell can be scrubbed away from the others.
      <GlassFadeStage {...options} className="max-w-none" key={mode} mode={mode} />
    ))}
  </div>
);
