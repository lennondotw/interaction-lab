import { Field, Stat, Toggle } from '#src/animations/sdf-edge-trace/controls.js';
import { cn } from '@monorepo/utils';
import { FC, useDeferredValue, useMemo, useState } from 'react';
import { drawBackdrop } from './backdrop.js';
import { drawRefractionMap, type DisplacementMap, type GlassConfig } from './refraction-map.js';
import { SHAPES, type ShapeEntry } from './shape-catalogue.js';

/** Logical px per card. Device pixels are `SIZE * DPR` — the map is supersampled. */
const SIZE = 200;
const DPR = 2;

const Slider: FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, hint, onChange }) => (
  <Field label={label} hint={hint} allPossibleHints={[hint]}>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-40 accent-indigo-500"
    />
  </Field>
);

/**
 * One shape: the refraction, the map that produced it, and the numbers that say whether
 * the encoding had room.
 *
 * The whole effect lives in a self-contained `<svg>` rather than in a DOM
 * `backdrop-filter: url(#…)`. That is not a stylistic choice — `backdrop-filter` with an
 * SVG filter is Chromium-only, so the older story in this folder does not render at all
 * in Safari or Firefox. Filtering an `<image>` inside SVG is universally supported, and
 * for a static frame the backdrop is known anyway, so nothing is lost.
 */
const ShapeCard: FC<{
  entry: ShapeEntry;
  map: DisplacementMap | null;
  backdrop: string | null;
  showOutline: boolean;
  showChannels: boolean;
}> = ({ entry, map, backdrop, showOutline, showChannels }) => {
  const outline = useMemo(() => entry.path(SIZE), [entry]);

  return (
    <div
      className={`
        flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3
        dark:border-neutral-800 dark:bg-neutral-950
      `}
    >
      <div className="flex flex-row items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{entry.label}</span>
        <span className="font-mono text-[10px] text-neutral-400">{entry.id}</span>
      </div>

      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full rounded-lg bg-neutral-900"
        data-testid={`shape-${entry.id}`}
      >
        <defs>
          <filter
            id={`refract-${entry.id}`}
            filterUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={SIZE}
            height={SIZE}
            colorInterpolationFilters="sRGB"
          >
            {/*
              A neutral floor under the map. Anywhere the map does not cover, the filter
              reads transparent black — and because it uses unpremultiplied channels, that
              is channel 0, which is the *most negative* offset the scale allows rather
              than zero. Compositing over #808080 turns that smear into no displacement.
            */}
            <feFlood floodColor="rgb(128, 128, 128)" floodOpacity={1} result="neutral" />
            {map !== null && (
              <feImage
                href={map.dataUrl}
                x={0}
                y={0}
                width={SIZE}
                height={SIZE}
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
            />
          </filter>

          {map !== null && (
            <mask id={`inside-${entry.id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={SIZE} height={SIZE}>
              <image href={map.maskDataUrl} x={0} y={0} width={SIZE} height={SIZE} preserveAspectRatio="none" />
            </mask>
          )}
        </defs>

        {backdrop !== null && <image href={backdrop} x={0} y={0} width={SIZE} height={SIZE} opacity={0.42} />}

        <g mask={map === null ? undefined : `url(#inside-${entry.id})`}>
          {backdrop !== null && (
            <image href={backdrop} x={0} y={0} width={SIZE} height={SIZE} filter={`url(#refract-${entry.id})`} />
          )}
        </g>

        {showOutline && outline !== '' && (
          <path d={outline} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
        )}
      </svg>

      {showChannels && map !== null && (
        <div className="flex flex-row gap-2">
          {[
            { key: 'map', filter: undefined, caption: 'map' },
            { key: 'r', filter: 'url(#dm-channel-r)', caption: 'R → x' },
            { key: 'g', filter: 'url(#dm-channel-g)', caption: 'G → y' },
          ].map((channel) => (
            <div key={channel.key} className="flex flex-col gap-1">
              <img
                src={map.dataUrl}
                alt={`${entry.label} displacement map, ${channel.caption}`}
                width={56}
                height={56}
                className={`
                  size-14 rounded border border-neutral-200
                  dark:border-neutral-800
                `}
                style={{ filter: channel.filter }}
              />
              <span className="text-center font-mono text-[9px] text-neutral-400">{channel.caption}</span>
            </div>
          ))}
        </div>
      )}

      <p
        className={`
          text-[11px] leading-snug text-neutral-500
          dark:text-neutral-400
        `}
      >
        {entry.note}
      </p>

      {map !== null && (
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

export const ShapeDisplacementMap: FC = () => {
  const [bevel, setBevel] = useState(26);
  const [thickness, setThickness] = useState(26);
  const [depth, setDepth] = useState(70);
  const [ior, setIor] = useState(1.5);
  const [showOutline, setShowOutline] = useState(false);
  const [showChannels, setShowChannels] = useState(true);

  const config = useMemo<GlassConfig>(() => ({ bevel, thickness, depth, ior }), [bevel, thickness, depth, ior]);

  // Rasterising ten fields is tens of milliseconds each, which is fine for a static frame
  // and not fine while a slider is moving. Deferring the config lets the thumb track the
  // pointer and the maps catch up a frame later, instead of the input going hard to drag.
  const settled = useDeferredValue(config);
  const stale = settled !== config;

  const backdrop = useMemo(() => drawBackdrop(SIZE, DPR), []);
  const maps = useMemo(() => SHAPES.map((entry) => drawRefractionMap(entry.sdf(SIZE), SIZE, DPR, settled)), [settled]);

  const totalMs = maps.reduce((sum, map) => sum + (map?.buildMs ?? 0), 0);

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      <svg width={0} height={0} className="absolute" aria-hidden>
        <defs>
          {/* Each channel shown as greyscale, which reads as a height map rather than as a tint. */}
          <filter id="dm-channel-r" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
          </filter>
          <filter id="dm-channel-g" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 0 1" />
          </filter>
        </defs>
      </svg>

      <header className="flex flex-col gap-1">
        <h2 className="text-xl">Displacement maps for arbitrary shapes</h2>
        <p
          className={`
            max-w-3xl text-sm text-neutral-500
            dark:text-neutral-400
          `}
        >
          One static frame per shape. The map is built from a signed distance field rather than from a radial falloff,
          so the normal comes out of the geometry and a star&rsquo;s notch, a squircle&rsquo;s corner and Apple&rsquo;s
          continuous corner all work without being special-cased. No dispersion — one channel pair, R for x and G for y.
        </p>
        <p
          className={`
            max-w-3xl text-sm text-neutral-500
            dark:text-neutral-400
          `}
        >
          <span className="font-mono text-xs">peak</span> reads the same for every shape, and that is a result rather
          than a bug: the largest offset is set by the bevel profile and the depth, which the outline has no say in.
          What the outline decides is <em>where</em> around the rim that peak is reached — which is what the two channel
          views show.
        </p>
      </header>

      <div
        className={cn(
          `
            flex flex-row flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-neutral-200 p-3
            dark:border-neutral-800
          `,
          stale && 'opacity-60'
        )}
      >
        <Slider label="bevel" value={bevel} min={4} max={60} step={1} hint={`${bevel}px rim`} onChange={setBevel} />
        <Slider
          label="thickness"
          value={thickness}
          min={2}
          max={60}
          step={1}
          hint={`${thickness}px`}
          onChange={setThickness}
        />
        <Slider label="depth" value={depth} min={0} max={200} step={5} hint={`${depth}px`} onChange={setDepth} />
        <Slider label="ior" value={ior} min={1} max={2.2} step={0.01} hint={ior.toFixed(2)} onChange={setIor} />
        <div className="flex flex-col gap-1.5">
          <Toggle label="outline" checked={showOutline} onChange={setShowOutline} />
          <Toggle label="channels" checked={showChannels} onChange={setShowChannels} />
        </div>
        <Stat label="rasterised" value={`${SHAPES.length} maps, ${totalMs.toFixed(0)}ms`} />
      </div>

      <div
        className={`
          grid grid-cols-1 gap-3
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4
        `}
      >
        {SHAPES.map((entry, index) => (
          <ShapeCard
            key={entry.id}
            entry={entry}
            map={maps[index] ?? null}
            backdrop={backdrop}
            showOutline={showOutline}
            showChannels={showChannels}
          />
        ))}
      </div>
    </div>
  );
};
