import { Stat } from '#src/animations/sdf-edge-trace/controls.js';
import { cn } from '@monorepo/utils';
import { useId, useMemo, type FC } from 'react';
import { drawBackdrop } from './backdrop.js';
import type { GlassLook } from './glass-look.js';
import { drawRefractionMap } from './refraction-map.js';
import { shapeById, type ShapeId } from './shape-catalogue.js';

/** Device pixels per logical unit. The map is supersampled; the box is not. */
const DPR = 2;

interface ShapeGlassProps extends GlassLook {
  /** Which entry of the catalogue to draw. */
  shape: ShapeId;
  className?: string;
}

/**
 * One shape, refracted through a map built from its own signed distance field.
 *
 * Everything is a prop, with no state and no controls of its own, because the controls belong
 * to Storybook: a component that also owned sliders would give every story two sets of knobs
 * that disagree, and the args panel is the one the story's `args` can actually address.
 *
 * The effect lives in a self-contained `<svg>` rather than in a DOM `backdrop-filter:
 * url(#…)`. Not a stylistic choice — `backdrop-filter` with an SVG filter is Chromium-only, so
 * the older `SvgDisplacementMap` story renders nothing at all in Safari or Firefox. Filtering
 * an `<image>` inside SVG is universally supported, and for a static frame the backdrop is
 * known anyway, so nothing is lost.
 */
export const ShapeGlass: FC<ShapeGlassProps> = ({
  shape,
  size,
  bevel,
  thickness,
  depth,
  ior,
  showOutline,
  dimSurroundings,
  showChannels,
  channelLayout,
  showStats,
  showCaption,
  className,
}) => {
  const entry = useMemo(() => shapeById(shape), [shape]);
  const backdrop = useMemo(() => drawBackdrop(size, DPR), [size]);
  const outline = useMemo(() => entry.path(size), [entry, size]);
  const map = useMemo(
    () => drawRefractionMap(entry.sdf(size), size, DPR, { bevel, thickness, depth, ior }),
    [bevel, depth, entry, ior, size, thickness]
  );

  // React's own id, with the delimiters stripped: `useId` returns something like `:r3:`, and a
  // colon is not addressable from `url(#…)`. Per instance rather than per shape so two of the
  // same shape on one page do not fight over the same filter.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Sized by CSS, not by attributes. `width`/`height` map to CSS width/height, which pins the box
  // and makes `aspect-ratio` a no-op — the stage came out 278×260 and the square viewBox
  // letterboxed inside it, black bars and all. With only a viewBox the element is square and the
  // viewBox fills it, whatever width the cell happens to have, which is what lets the same markup
  // serve one full-width card and one quarter-width filmstrip cell.
  const resultSvg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="aspect-square w-full rounded-lg bg-neutral-900"
      data-testid={`shape-${entry.id}`}
    >
      <defs>
        <filter
          id={`refract-${uid}`}
          filterUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={size}
          height={size}
          colorInterpolationFilters="sRGB"
        >
          {/*
              A neutral floor under the map. Anywhere the map does not cover, the filter reads
              transparent black — and because it uses unpremultiplied channels, that is channel
              0, which is the *most negative* offset the scale allows rather than zero.
              Compositing over #808080 turns that smear into no displacement.
            */}
          <feFlood floodColor="rgb(128, 128, 128)" floodOpacity={1} result="neutral" />
          {map !== null && (
            <feImage
              href={map.dataUrl}
              x={0}
              y={0}
              width={size}
              height={size}
              preserveAspectRatio="none"
              result="encoded"
            />
          )}
          <feComposite in="encoded" in2="neutral" operator="over" result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={map?.scalePx ?? 0}
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />

          {/*
            The shape's coverage, and then the glass laid back over the surroundings.

            Clipping inside the filter rather than with a `<mask>` outside it is what lets one
            element over one backdrop do the whole thing. The earlier version drew the backdrop
            twice — once dimmed for the surroundings, once refracted and masked for the glass —
            which meant the dimming was structural: there was no way to see the effect over an
            undimmed background at all. Now it is a `feColorMatrix` on the way past, so
            `dimSurroundings` can turn it off and leave a real reference to compare the interior
            against.

            `in` keeps `displaced` only where `coverage` has alpha, and `over` puts that on the
            surroundings — so outside the shape the pixels are the backdrop's own, at whatever
            brightness the arg asked for and never refracted.
          */}
          {map !== null && (
            <feImage
              href={map.maskDataUrl}
              x={0}
              y={0}
              width={size}
              height={size}
              preserveAspectRatio="none"
              result="coverage"
            />
          )}
          <feComposite in="displaced" in2="coverage" operator="in" result="glass" />

          {/*
            The surroundings, dimmed or not. `feColorMatrix` reads non-premultiplied channels, so
            scaling RGB and leaving the alpha row as identity darkens without eating coverage.
          */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={
              dimSurroundings
                ? '0.42 0 0 0 0  0 0.42 0 0 0  0 0 0.42 0 0  0 0 0 1 0'
                : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0'
            }
            result="surround"
          />
          <feComposite in="glass" in2="surround" operator="over" />
        </filter>
      </defs>

      {backdrop !== null && (
        <image href={backdrop} x={0} y={0} width={size} height={size} filter={`url(#refract-${uid})`} />
      )}

      {showOutline && outline !== '' && <path d={outline} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />}
    </svg>
  );

  /** The three views of the map, in the order the pipeline produces them. */
  const channels = [
    { key: 'map', filter: undefined, caption: 'map' },
    { key: 'r', filter: `url(#dm-r-${uid})`, caption: 'R \u2192 x' },
    { key: 'g', filter: `url(#dm-g-${uid})`, caption: 'G \u2192 y' },
  ];

  const filmstrip = channelLayout === 'filmstrip' && showChannels && map !== null;
  const stage = filmstrip ? (
    // Four equal cells. `min-w-0` on each is what stops the images forcing the row wider than its
    // container: a flex item's default `min-width: auto` is its content's intrinsic size, and an
    // <img> with a 520px natural width happily reports that.
    <div className="flex flex-row gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {resultSvg}
        <span className="text-center font-mono text-[9px] text-neutral-400">result</span>
      </div>
      {channels.map((channel) => (
        <div key={channel.key} className="flex min-w-0 flex-1 flex-col gap-1">
          <img
            src={map.dataUrl}
            alt={`${entry.label} displacement map, ${channel.caption}`}
            className={`
              aspect-square w-full rounded-lg border border-neutral-200
              dark:border-neutral-800
            `}
            style={{ filter: channel.filter }}
          />
          <span className="text-center font-mono text-[9px] text-neutral-400">{channel.caption}</span>
        </div>
      ))}
    </div>
  ) : (
    resultSvg
  );

  return (
    <div
      className={cn(
        `
          flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3
          dark:border-neutral-800 dark:bg-neutral-950
        `,
        className
      )}
    >
      {/* Greyscale readouts of one channel each, which reads as a height map rather than a tint. */}
      <svg width={0} height={0} className="absolute" aria-hidden>
        <defs>
          {/*
            Alpha is identity, not forced to 1. `0 0 0 0 1` makes every pixel opaque including
            the filter region's default 10% padding, which paints a black halo around each
            thumbnail — the map is already fully opaque, so there is nothing to force. The region
            is pinned to the bounds for the same reason.
          */}
          <filter id={`dm-r-${uid}`} x={0} y={0} width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0" />
          </filter>
          <filter id={`dm-g-${uid}`} x={0} y={0} width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      {showCaption && (
        <div className="flex flex-row items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{entry.label}</span>
          <span className="font-mono text-[10px] text-neutral-400">{entry.id}</span>
        </div>
      )}

      {stage}

      {showChannels && map !== null && !filmstrip && (
        <div className="flex flex-row gap-2">
          {channels.map((channel) => (
            <div key={channel.key} className="flex flex-col gap-1">
              <img
                src={map.dataUrl}
                alt={`${entry.label} displacement map, ${channel.caption}`}
                width={56}
                height={56}
                className={`
                  size-14 rounded-sm border border-neutral-200
                  dark:border-neutral-800
                `}
                style={{ filter: channel.filter }}
              />
              <span className="text-center font-mono text-[9px] text-neutral-400">{channel.caption}</span>
            </div>
          ))}
        </div>
      )}

      {showCaption && (
        <p
          className={`
            text-[11px] leading-snug text-neutral-500
            dark:text-neutral-400
          `}
        >
          {entry.note}
        </p>
      )}

      {showStats && map !== null && (
        <div className="flex flex-row flex-wrap gap-x-4 gap-y-1">
          <Stat label="peak" value={`${map.maxOffsetPx.toFixed(1)}px`} />
          <Stat label="scale" value={map.scalePx.toFixed(1)} />
          <Stat label="step" value={`${map.stepPx.toFixed(3)}px`} accent={map.stepPx > 0.5} />
          <Stat label="build" value={`${map.buildMs.toFixed(0)}ms`} />
        </div>
      )}
    </div>
  );
};
