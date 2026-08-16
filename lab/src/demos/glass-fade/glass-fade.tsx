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
  /** Which property the 0 → 1 drives. */
  mode: FadeMode;
  /** How far along the appearance is. The interesting values are strictly between 0 and 1. */
  progress: number;
  backdrop: BackdropKind;
  /** Blur radius of the material at full strength. */
  blurPx: number;
  /**
   * The material's tint at full strength, alpha included — the colour it is meant to
   * settle on, not a starting point. Ramping scales this colour's own alpha, so a dark
   * glass is one value away.
   */
  tint: string;
}

function panelStyle({ blurPx, mode, progress, tint }: GlassFadeOptions): CSSProperties {
  // Only `material` ramps the material itself. Every other mode holds it at full
  // strength and fades or masks the finished surface.
  const strength = mode === 'material' ? progress : 1;
  const radius = blurPx * strength;
  // Relative colour syntax, so the tint can be given as any colour and the ramp still
  // has its alpha to scale. The hairline is the same colour at twice the alpha, which
  // keeps it a property of the material rather than a hard-coded white that would be
  // wrong the moment the tint is dark.
  const atStrength = (scale: number) => `rgb(from ${tint} r g b / calc(alpha * ${(strength * scale).toFixed(3)}))`;

  return {
    // `blur(0px)` is still a filter — it keeps the compositing layer and the
    // backdrop root alive. Only `none` releases them, which is what a real
    // transition should settle to at rest.
    backdropFilter: radius === 0 ? 'none' : `blur(${radius.toFixed(2)}px)`,
    backgroundColor: atStrength(1),
    boxShadow: `inset 0 0 0 1px ${atStrength(2)}`,
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
const Panel: FC<GlassFadeOptions & { label: string }> = ({ label, ...options }) => (
  <div className={PANEL} style={panelStyle(options)}>
    <span className={CHIP} style={{ opacity: options.mode === 'material' ? options.progress : 1 }}>
      {label}
    </span>
  </div>
);

export const GlassFadeStage: FC<GlassFadeOptions & { className?: string }> = ({ className, ...options }) => {
  const { backdrop, mode, progress } = options;
  const panel = <Panel {...options} label={`${Math.round(progress * 100)}%`} />;

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
      <figcaption className={CAPTION}>
        <span className="font-semibold text-neutral-700 dark:text-neutral-200">{FADE_MODE_TITLE[mode]}</span>{' '}
        {FADE_MODE_NOTE[mode]}
      </figcaption>
    </figure>
  );
};

/**
 * The composed view, because α = 0.5 is only damning next to the mode that gets it
 * right at the same α. Every panel here is the same material over the same backdrop,
 * half-way in — the only thing that differs between cells is which property the α is
 * hung on.
 */
export const GlassFadeComparison: FC<Omit<GlassFadeOptions, 'mode'>> = (options) => (
  <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
    {FADE_MODES.map((mode) => (
      <GlassFadeStage {...options} className="max-w-none" key={mode} mode={mode} />
    ))}
  </div>
);
