import { Field, Segmented, Stat } from '#src/animations/sdf-edge-trace/controls.js';
import { Button } from '#src/components/button/button.js';
import { LiveScope } from '#src/components/live-scope/live-scope.js';
import { cn } from '@monorepo/utils';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EncodeWorkerClient } from './encode-worker-client.js';
import { FrameLog } from './frame-log.js';
import { CONSUMERS, PRODUCERS, type ConsumerId } from './producers.js';
import {
  bmpIsDecodable,
  measureDisplayPeriod,
  runProducer,
  runSingleFrame,
  startLiveRun,
  type BenchRow,
  type BenchTargets,
} from './run-bench.js';

const SIZES = [
  { value: 256, label: '256' },
  { value: 384, label: '384' },
  { value: 512, label: '512' },
  { value: 768, label: '768' },
  { value: 1024, label: '1024' },
] as const;

const TILE_COUNTS = [
  { value: 1, label: '1' },
  { value: 4, label: '4' },
  { value: 9, label: '9' },
  { value: 16, label: '16' },
] as const;

const OCTAVES = [
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 6, label: '6' },
] as const;

const FRAME_COUNTS = [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 120, label: '120' },
] as const;

/**
 * A 1×1 transparent PNG, so a target starts empty instead of as a broken-image icon.
 *
 * The rows that hand off nothing — `generate only`, `putImageData` — never set a src, so
 * without a placeholder the box shows Chrome's broken-image glyph and its alt text for the
 * whole run, which reads as a bug in the benchmark rather than as the control it is.
 */
const EMPTY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const TILE_PX = 72;

const formatMs = (ms: number): string => (ms >= 10 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));
const formatBytes = (bytes: number): string =>
  bytes === 0 ? '—' : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;

export const BitmapHandoffCost: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const feImageRefs = useRef<(SVGFEImageElement | null)[]>([]);

  const [size, setSize] = useState<number>(256);
  const [tiles, setTiles] = useState<number>(1);
  const [octaves, setOctaves] = useState<number>(1);
  const [frames, setFrames] = useState<number>(60);
  const [consumer, setConsumer] = useState<ConsumerId>('feimage');

  const [displayPeriod, setDisplayPeriod] = useState<number | null>(null);
  const [bmpOk, setBmpOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const [liveProducerId, setLiveProducerId] = useState<string>('canvas-dataurl');
  const [liveOn, setLiveOn] = useState(false);
  const [liveStats, setLiveStats] = useState({ median: 0, p95: 0, worst: 0, count: 0 });
  const frameLog = useMemo(() => new FrameLog(), []);
  const workerRef = useRef<EncodeWorkerClient | null>(null);
  /** Advanced by each single-frame draw, so pressing the button twice shows two frames. */
  const drawSeedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void measureDisplayPeriod().then((period) => {
      if (!cancelled) setDisplayPeriod(period);
    });
    void bmpIsDecodable().then((ok) => {
      if (!cancelled) setBmpOk(ok);
    });
    return () => {
      cancelled = true;
      workerRef.current?.dispose();
    };
  }, []);

  // The chart animates itself at refresh rate; the numbers beside it are worth re-reading far
  // less often than that, and a median recomputed 120 times a second is its own workload.
  useEffect(() => {
    if (!liveOn) return;
    const id = setInterval(() => setLiveStats(frameLog.stats()), 200);
    return () => clearInterval(id);
  }, [frameLog, liveOn]);

  /**
   * Everything a run needs, rebuilt per run because size and tile count change it all.
   *
   * `willReadFrequently` keeps the canvas backing store in CPU memory, which is what makes the
   * `getImageData` row cheap. Without it that row also pays a GPU→CPU readback, and its gap to
   * the pure-JS rows is much larger — worth knowing before quoting the number.
   */
  const buildTargets = useCallback((): BenchTargets | null => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return null;

    // One buffer, shared by the scene and every encoder, so nothing pays for a copy the
    // others avoid.
    const imageData = ctx.createImageData(size, size);
    const rgba = { data: imageData.data, width: size, height: size };

    const applyAt = (index: number, url: string | null): void => {
      if (url === null) return;
      if (consumer === 'img') imgRefs.current[index]?.setAttribute('src', url);
      else if (consumer === 'feimage') feImageRefs.current[index]?.setAttribute('href', url);
    };

    // A 1x1 transparent PNG rather than removing the attribute: composited over the filter's
    // neutral floor it is a flat grey map, which means no displacement. Removing the href
    // leaves it to the implementation whether the last decoded image stays around.
    const resetAt = (index: number): void => {
      imgRefs.current[index]?.setAttribute('src', EMPTY_PNG);
      feImageRefs.current[index]?.setAttribute('href', EMPTY_PNG);
    };

    workerRef.current ??= new EncodeWorkerClient();

    return {
      canvas,
      ctx,
      imageData,
      rgba,
      applyAt,
      resetAt,
      tiles,
      offscreen: new OffscreenCanvas(size, size),
      worker: workerRef.current,
    };
  }, [consumer, size, tiles]);

  const runSweep = useCallback(async () => {
    const targets = buildTargets();
    if (targets === null) return;

    const period = displayPeriod ?? (await measureDisplayPeriod());
    setDisplayPeriod(period);
    setRows([]);

    const collected: BenchRow[] = [];
    for (const producer of PRODUCERS) {
      setRunning(producer.label);
      const row = await runProducer(producer, targets, period, { frames, octaves });
      collected.push(row);
      setRows([...collected]);
    }
    setRunning(null);
  }, [buildTargets, displayPeriod, frames, octaves]);

  /**
   * The live loop's whole lifetime, owned by an effect rather than by the button.
   *
   * The button used to start the loop directly and keep its stopper in a ref, which made every
   * control silently dead mid-run: the loop had already captured its canvas dimensions, pixel
   * buffer, offscreen canvas and producer, so changing `size` left it writing a 256² image into
   * a backing store React had just resized to 1024², and switching the handoff did nothing at
   * all. Hanging it off an effect keyed on the configuration means a change tears the loop down
   * and builds a new one, which is the only way the running work and the rendered DOM stay
   * describing the same thing.
   *
   * The log is cleared on every rebuild, because a median spanning two configurations is a
   * number about neither of them.
   */
  useEffect(() => {
    if (!liveOn) return;
    const targets = buildTargets();
    const producer = PRODUCERS.find((candidate) => candidate.id === liveProducerId);
    if (targets === null || producer === undefined) return;
    frameLog.clear();
    const stop = startLiveRun(producer, targets, octaves, frameLog);
    return stop;
  }, [buildTargets, frameLog, liveOn, liveProducerId, octaves]);

  const drawOnce = useCallback(async () => {
    const targets = buildTargets();
    const producer = PRODUCERS.find((candidate) => candidate.id === liveProducerId);
    if (targets === null || producer === undefined) return;
    // A stride rather than +1: the scene's terms are slow in the frame index, so neighbouring
    // frames look nearly identical and the redraw would seem not to have happened.
    drawSeedRef.current += 37;
    await runSingleFrame(producer, targets, octaves, drawSeedRef.current);
  }, [buildTargets, liveProducerId, octaves]);

  const readLive = useCallback((fromAt: number) => frameLog.since(fromAt), [frameLog]);

  const period = displayPeriod ?? 0;
  const floor = rows.find((row) => row.producerId === 'none');
  // A row whose map never decoded has not sustained anything, so it cannot win this. Under the
  // `feImage` consumer that disqualifies every object-URL row — which is most of them, and is
  // the whole point of the warning below the table.
  const best = rows.reduce<BenchRow | null>((winner, row) => {
    if (row.producerId === 'none' || row.producerId === 'put-only') return winner;
    const producer = PRODUCERS.find((candidate) => candidate.id === row.producerId);
    if (consumer === 'feimage' && producer?.asyncForFeImage === true) return winner;
    return winner === null || row.megapixelsPerSecond > winner.megapixelsPerSecond ? row : winner;
  }, null);

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl">What a per-frame bitmap handoff costs</h2>
        <p
          className={`
            max-w-3xl text-sm text-neutral-500
            dark:text-neutral-400
          `}
        >
          Can a JS-generated bitmap be handed to the compositor every frame at 120Hz, and is{' '}
          <code className="font-mono text-xs">canvas.toDataURL</code> the wrong way to do it? Each row differs from its
          neighbour by one thing, so the differences price the readback, the deflate pass, base64, and the two checksums
          separately.
        </p>
        <p
          className={`
            max-w-3xl text-sm text-neutral-500
            dark:text-neutral-400
          `}
        >
          The headline is the <strong>frame interval</strong>, not the encode time. Decoding the image and re-running
          the filter happen after the rAF callback returns, so a harness timing only its own work reports a comfortable
          millisecond and misses a pipeline that has dropped to 40fps. Push <em>size</em> and <em>tiles</em> until the
          interval leaves the display period behind — <span className="font-mono text-xs">MPix/s</span> is what
          survived.
        </p>
        <p
          className={`
            max-w-3xl text-sm text-neutral-500
            dark:text-neutral-400
          `}
        >
          <span className="font-mono text-xs">frame</span> is quantised to the refresh rate, so on this display every
          configuration that fits reports exactly one period and two very different ones look identical.{' '}
          <span className="font-mono text-xs">busy</span> is the synchronous work as a share of that period, and is the
          column that tells 256² from 384² while both still hold 120fps.
        </p>
      </header>

      <div
        className={`
          flex flex-row flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-neutral-200 p-3
          dark:border-neutral-800
        `}
      >
        <Field label="size" hint={`${size}² px`} allPossibleHints={SIZES.map((s) => `${s.value}² px`)}>
          <Segmented options={SIZES} value={size} onChange={setSize} />
        </Field>
        <Field
          label="tiles"
          hint={`${tiles} per frame`}
          allPossibleHints={TILE_COUNTS.map((t) => `${t.value} per frame`)}
        >
          <Segmented options={TILE_COUNTS} value={tiles} onChange={setTiles} />
        </Field>
        <Field label="scene octaves" hint={`${octaves}`} allPossibleHints={OCTAVES.map((o) => `${o.value}`)}>
          <Segmented options={OCTAVES} value={octaves} onChange={setOctaves} />
        </Field>
        <Field
          label="frames"
          hint={`${frames} measured`}
          allPossibleHints={FRAME_COUNTS.map((f) => `${f.value} measured`)}
        >
          <Segmented options={FRAME_COUNTS} value={frames} onChange={setFrames} />
        </Field>
        <Field
          label="consumer"
          hint={CONSUMERS.find((c) => c.id === consumer)?.label ?? ''}
          allPossibleHints={CONSUMERS.map((c) => c.label)}
        >
          <Segmented
            options={CONSUMERS.map((c) => ({ value: c.id, label: c.label }))}
            value={consumer}
            onChange={setConsumer}
          />
        </Field>
        {/* Mutually exclusive with live: two rAF loops driving the same canvas would interleave
            their frames and both sets of numbers would be about the other one. */}
        <Button size="sm" color="green" onClick={() => void runSweep()} disabled={running !== null || liveOn}>
          {running === null ? 'Run sweep' : `Running ${running}…`}
        </Button>
        <Stat label="display period" value={displayPeriod === null ? '…' : `${formatMs(period)}ms`} />
        <Stat label="bmp decodable" value={bmpOk === null ? '…' : bmpOk ? 'yes' : 'no'} accent={bmpOk === false} />
        <Stat label="asked for" value={`${((tiles * size * size) / 1e6).toFixed(2)} MPix/frame`} />
        <Stat
          label="best sustained"
          value={best === null ? '—' : `${best.megapixelsPerSecond.toFixed(0)} MPix/s`}
          accent={best !== null}
        />
      </div>

      {/*
        Live mode. The offline table says whether a configuration holds on average; this says
        what it feels like, which is not the same claim — a run that holds 8.3ms and stutters
        once a second has the same median as a smooth one and is obviously worse to look at.
      */}
      <div
        className={`
          flex flex-col gap-2 rounded-xl border border-neutral-200 p-3
          dark:border-neutral-800
        `}
      >
        <div className="flex flex-row flex-wrap items-end gap-x-6 gap-y-3">
          <Field label="live handoff" hint="continuous, unmeasured" allPossibleHints={['continuous, unmeasured']}>
            <select
              value={liveProducerId}
              onChange={(event) => setLiveProducerId(event.target.value)}
              className={`
                rounded border border-neutral-300 bg-transparent px-1.5 py-1 text-xs
                dark:border-neutral-700
              `}
            >
              {PRODUCERS.map((producer) => (
                <option key={producer.id} value={producer.id}>
                  {producer.label}
                </option>
              ))}
            </select>
          </Field>
          <Button
            size="sm"
            color={liveOn ? 'yellow' : 'green'}
            onClick={() => setLiveOn((on) => !on)}
            disabled={running !== null}
            allPossibleContents={['Start live', 'Stop live']}
          >
            {liveOn ? 'Stop live' : 'Start live'}
          </Button>
          {/* One frame, awaited. The only mode in which an object URL has time to land, so it is
              also the only one where the blob rows can be inspected rather than inferred. */}
          <Button size="sm" color="green" onClick={() => void drawOnce()} disabled={running !== null || liveOn}>
            Redraw once
          </Button>
          <Stat label="median" value={`${formatMs(liveStats.median)}ms`} />
          <Stat label="p95" value={`${formatMs(liveStats.p95)}ms`} accent={liveStats.p95 > period * 1.5} />
          <Stat label="worst" value={`${formatMs(liveStats.worst)}ms`} />
          <Stat label="fps" value={liveStats.median > 0 ? (1000 / liveStats.median).toFixed(0) : '—'} />
        </div>
        <LiveScope
          read={readLive}
          spanMs={4000}
          minScale={period > 0 ? period * 2 : 20}
          threshold={period > 0 ? period * 1.5 : 25}
          ticks={3}
          formatTick={(value) => value.toFixed(1)}
          className="h-24 w-full"
        />
      </div>

      <div className="flex flex-row flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-neutral-400">canvas</span>
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="rounded-lg bg-neutral-900"
            style={{ width: TILE_PX, height: TILE_PX }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-neutral-400">
            {consumer === 'none' ? 'no consumer' : consumer === 'img' ? `<img> × ${tiles}` : `feImage × ${tiles}`}
          </span>
          <div className="flex flex-row flex-wrap gap-1" style={{ maxWidth: (TILE_PX + 4) * 4 }}>
            {/* Nothing consumes the URL, so nothing is drawn — rendering the filtered gradient here
                anyway would show output for a row whose whole point is producing none. */}
            {consumer === 'none' && (
              <div
                className={`
                  flex items-center justify-center rounded border border-dashed border-neutral-300 font-mono text-[9px]
                  text-neutral-400
                  dark:border-neutral-700
                `}
                style={{ width: TILE_PX, height: TILE_PX }}
              >
                dropped
              </div>
            )}
            {consumer !== 'none' &&
              Array.from({ length: tiles }, (_, index) =>
                consumer === 'img' ? (
                  // Decorative: the label above says what these are, so alt stays empty.
                  <img
                    key={index}
                    ref={(node) => {
                      imgRefs.current[index] = node;
                    }}
                    src={EMPTY_PNG}
                    alt=""
                    width={TILE_PX}
                    height={TILE_PX}
                    className="rounded bg-neutral-900"
                    style={{ width: TILE_PX, height: TILE_PX }}
                  />
                ) : (
                  // The viewBox is the *map's* size, not the tile's, so the filter region and the
                  // image's intrinsic size are the same number and there is nothing for the
                  // browser to scale. That is not tidiness: `feImage` takes a different code path
                  // for an external reference than for a data URI, and for the external one Chrome
                  // draws at intrinsic size and ignores the primitive's width/height — so a 256²
                  // map in a 72² region jumped out of the tile the moment the handoff switched
                  // from `toDataURL` to a blob URL. The bytes were not at fault; Node's zlib
                  // inflates this encoder's IDAT back to the exact scanlines. Matching the two
                  // sizes makes both code paths agree instead of relying on the better one.
                  <svg
                    key={index}
                    width={TILE_PX}
                    height={TILE_PX}
                    viewBox={`0 0 ${size} ${size}`}
                    className="rounded bg-neutral-900"
                  >
                    <defs>
                      <filter
                        id={`handoff-filter-${index}`}
                        filterUnits="userSpaceOnUse"
                        x={0}
                        y={0}
                        width={size}
                        height={size}
                        colorInterpolationFilters="sRGB"
                      >
                        {/*
                        A neutral floor under the map. Until the image has loaded — and a blob
                        URL loads asynchronously, so at 120Hz that is most frames — the map is
                        transparent black, and because the filter reads unpremultiplied channels
                        that is channel 0: not "no displacement" but the most negative offset the
                        scale allows. Without this the whole tile slides toward the origin while
                        the stripes stay straight, which looks like a geometry bug and is really
                        an empty map.
                      */}
                        <feFlood floodColor="rgb(128, 128, 128)" floodOpacity={1} result="neutral" />
                        <feImage
                          ref={(node) => {
                            feImageRefs.current[index] = node;
                          }}
                          x={0}
                          y={0}
                          width={size}
                          height={size}
                          preserveAspectRatio="none"
                          result="encoded"
                        />
                        <feComposite in="encoded" in2="neutral" operator="over" result="map" />
                        <feDisplacementMap
                          in="SourceGraphic"
                          in2="map"
                          scale={size * 0.08}
                          xChannelSelector="R"
                          yChannelSelector="G"
                        />
                      </filter>
                      <linearGradient id={`handoff-source-${index}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#f472b6" />
                      </linearGradient>
                    </defs>
                    <g filter={`url(#handoff-filter-${index})`}>
                      <rect x={0} y={0} width={size} height={size} fill={`url(#handoff-source-${index})`} />
                      {Array.from({ length: 5 }, (_, line) => (
                        <rect
                          key={line}
                          x={0}
                          y={(line + 0.5) * (size / 5)}
                          width={size}
                          height={Math.max(2, size / 36)}
                          fill="rgba(255,255,255,0.8)"
                        />
                      ))}
                    </g>
                  </svg>
                )
              )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-left text-xs">
            <thead
              className={`
                border-b border-neutral-200 text-[10px] tracking-wide text-neutral-500 uppercase
                dark:border-neutral-800
              `}
            >
              <tr>
                <th className="py-1.5 pr-3 font-normal">handoff</th>
                <th className="py-1.5 pr-3 text-right font-normal">frame</th>
                <th className="py-1.5 pr-3 text-right font-normal">p95</th>
                <th className="py-1.5 pr-3 text-right font-normal">fps</th>
                <th className="py-1.5 pr-3 text-right font-normal">missed</th>
                <th className="py-1.5 pr-3 text-right font-normal">scene</th>
                <th className="py-1.5 pr-3 text-right font-normal">handoff ms</th>
                <th className="py-1.5 pr-3 text-right font-normal">busy</th>
                <th className="py-1.5 pr-3 text-right font-normal">vs floor</th>
                <th className="py-1.5 pr-3 text-right font-normal">MPix/s</th>
                <th className="py-1.5 pr-3 text-right font-normal">MB/s</th>
                <th className="py-1.5 pr-3 text-right font-normal">frame size</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((row) => {
                const overBudget = row.intervalMs > period * 1.2;
                const delta = floor === undefined ? 0 : row.intervalMs - floor.intervalMs;
                return (
                  <tr
                    key={row.producerId}
                    className={cn(
                      `
                        border-b border-neutral-100
                        dark:border-neutral-900
                      `,
                      row.producerId === 'none' && 'text-neutral-400'
                    )}
                  >
                    <td className="py-1.5 pr-3 font-sans">{row.label}</td>
                    <td
                      className={cn(
                        'py-1.5 pr-3 text-right',
                        overBudget &&
                          `
                            text-amber-600
                            dark:text-amber-500
                          `
                      )}
                    >
                      {formatMs(row.intervalMs)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{formatMs(row.intervalP95Ms)}</td>
                    <td
                      className={cn(
                        'py-1.5 pr-3 text-right',
                        overBudget &&
                          `
                            text-amber-600
                            dark:text-amber-500
                          `
                      )}
                    >
                      {row.fps.toFixed(0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{row.missedPct.toFixed(0)}%</td>
                    <td className="py-1.5 pr-3 text-right text-neutral-400">{formatMs(row.sceneMs)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatMs(row.handoffMs)}</td>
                    <td
                      className={cn(
                        'py-1.5 pr-3 text-right',
                        row.busyPct > 100 &&
                          `
                            text-amber-600
                            dark:text-amber-500
                          `
                      )}
                    >
                      {row.busyPct.toFixed(0)}%
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {floor === undefined || row.producerId === 'none'
                        ? '—'
                        : `${delta >= 0 ? '+' : ''}${formatMs(delta)}`}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {row.megapixelsPerSecond.toFixed(0)}
                      {consumer === 'feimage' &&
                      PRODUCERS.find((p) => p.id === row.producerId)?.asyncForFeImage === true ? (
                        <span title="object URL: feImage never finishes fetching it at this rate, so no decode was paid for">
                          {' '}
                          ⚠
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-neutral-400">
                      {row.bytes === 0 ? '—' : row.megabytesPerSecond.toFixed(0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-neutral-400">{formatBytes(row.bytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {PRODUCERS.map((producer) => (
          <p
            key={producer.id}
            className={`
              text-[11px] leading-snug text-neutral-500
              dark:text-neutral-400
            `}
          >
            <span
              className={`
                font-mono text-neutral-700
                dark:text-neutral-300
              `}
            >
              {producer.label}
            </span>{' '}
            — {producer.note}
          </p>
        ))}
        <p
          className={`
            mt-1 text-[11px] leading-snug text-neutral-500
            dark:text-neutral-400
          `}
        >
          <span
            className={`
              font-mono text-neutral-700
              dark:text-neutral-300
            `}
          >
            consumer
          </span>{' '}
          — {CONSUMERS.find((c) => c.id === consumer)?.note}
        </p>
      </div>
    </div>
  );
};
