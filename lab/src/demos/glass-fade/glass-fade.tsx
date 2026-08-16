import { cn } from '@monorepo/utils';
import type { CSSProperties, FC, ReactNode } from 'react';

import {
  BACKDROP_STYLE,
  FADE_MODE_NOTE,
  FADE_MODE_TITLE,
  FADE_MODES,
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

const STAGE = 'relative h-56 w-full overflow-hidden rounded-xl';
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
  /** Tint alpha of the material at full strength. */
  tintAlpha: number;
}

function panelStyle({ blurPx, mode, progress, tintAlpha }: GlassFadeOptions): CSSProperties {
  // Only `material` ramps the material itself. Every other mode holds it at full
  // strength and fades, masks, or moves the finished surface.
  const strength = mode === 'material' ? progress : 1;
  const radius = blurPx * strength;

  return {
    // `blur(0px)` is still a filter — it keeps the compositing layer and the
    // backdrop root alive. Only `none` releases them, which is what a real
    // transition should settle to at rest.
    backdropFilter: radius === 0 ? 'none' : `blur(${radius.toFixed(2)}px)`,
    backgroundColor: `rgb(255 255 255 / ${(tintAlpha * strength).toFixed(3)})`,
    boxShadow: `inset 0 0 0 1px rgb(255 255 255 / ${(0.35 * strength).toFixed(3)})`,
    maskImage:
      mode === 'mask-alpha' ? `linear-gradient(rgb(0 0 0 / ${progress}), rgb(0 0 0 / ${progress}))` : undefined,
    opacity: mode === 'layer-opacity' ? progress : 1,
    transform: mode === 'geometry' ? `translateY(${((1 - progress) * 145).toFixed(1)}%)` : undefined,
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

export const GlassFadeStage: FC<GlassFadeOptions & { className?: string; caption?: ReactNode }> = ({
  caption,
  className,
  ...options
}) => {
  const { backdrop, mode, progress } = options;
  const panel = <Panel {...options} label={`${Math.round(progress * 100)}%`} />;

  return (
    <figure className={cn('flex w-full max-w-xl flex-col gap-2', className)}>
      <div className={STAGE} style={{ background: BACKDROP_STYLE[backdrop] }}>
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
        {caption ?? (
          <>
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">{FADE_MODE_TITLE[mode]}</span>{' '}
            {FADE_MODE_NOTE[mode]}
          </>
        )}
      </figcaption>
    </figure>
  );
};

/**
 * The composed view, because α = 0.5 is only damning next to the modes that get
 * it right at the same α. Every panel here is the same material over the same
 * backdrop, half-way in.
 *
 * The sixth cell is the defect again over a flat backdrop, hard-coded rather than
 * taken from args: the argument this board makes is incomplete without the case
 * where none of it is visible.
 */
export const GlassFadeComparison: FC<Omit<GlassFadeOptions, 'mode'> & { children?: ReactNode }> = ({
  children,
  ...options
}) => (
  <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
    {children}
    <div className="grid gap-6 lg:grid-cols-2">
      {FADE_MODES.map((mode) => (
        <GlassFadeStage {...options} className="max-w-none" key={mode} mode={mode} />
      ))}
      <GlassFadeStage
        {...options}
        backdrop="flat"
        caption={
          <>
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              the defect again, over a flat backdrop
            </span>{' '}
            Undetectable — blurring a solid colour is a no-op, so there is no detail left to survive the blend. Most
            glass sits over something flat enough to hide this, which is how an opacity fade passes review and then
            falls apart over a photo.
          </>
        }
        className="max-w-none"
        mode="layer-opacity"
      />
    </div>
  </div>
);
