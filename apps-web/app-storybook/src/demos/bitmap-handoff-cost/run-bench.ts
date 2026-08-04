/**
 * The measurement harness, in two modes over one frame body.
 *
 * The instrument that matters is the **frame interval**, not a `performance.now()` bracket
 * around the encoder. Decoding the image and re-running the filter happen after the rAF
 * callback returns, inside the browser's own pipeline, so they are invisible to any timer this
 * code could wrap around its own work — they show up only as frames that took longer than the
 * display's period. A harness measuring just the encode call would report a comfortable
 * millisecond and miss a pipeline that had dropped to 40fps.
 *
 * `runProducer` is the offline mode: a fixed number of frames, summarised once at the end,
 * which is what makes rows comparable. `startLiveRun` is the same frame body left running, so
 * a dropped frame can be *seen* on the chart and felt in the tab. Both call `runOneFrame`, so
 * neither can drift from the other.
 *
 * The median is the headline and p95 is next to it, because a dropped frame is not an outlier
 * to be averaged away — at a 120Hz budget it is the thing being looked for.
 */

import type { EncodeWorkerClient } from './encode-worker-client.js';
import type { Rgba } from './encoders.js';
import type { FrameLog } from './frame-log.js';
import type { Producer, ProducerContext } from './producers.js';
import { paintScene } from './scene.js';

const WARMUP_FRAMES = 12;

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] ?? 0;

const summarise = (values: readonly number[]): { median: number; p95: number } => {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95) };
};

export interface BenchTargets {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Backed by the same buffer the scene paints into, so no row pays for a copy the others do not. */
  imageData: ImageData;
  rgba: Rgba;
  /** One consumer per tile, so `tiles > 1` measures many live images rather than one reassigned. */
  applyAt: (index: number, url: string | null) => void;
  /**
   * Blanks a tile's consumer.
   *
   * Called before every row, because a target holds whatever URL it was last given: switching to
   * `generate only` or `putImageData` — the two rows that deliberately hand over nothing — used
   * to leave the previous row's image on screen, which reads as those rows producing something.
   * The canvas needs no equivalent; assigning `width` resets its bitmap.
   */
  resetAt: (index: number) => void;
  tiles: number;
  offscreen: OffscreenCanvas;
  worker: EncodeWorkerClient;
}

export interface BenchOptions {
  frames: number;
  octaves: number;
}

export interface BenchRow {
  producerId: string;
  label: string;
  frames: number;
  /** Median and 95th-percentile rAF interval, ms. */
  intervalMs: number;
  intervalP95Ms: number;
  fps: number;
  /** Share of frames longer than 1.5 display periods. */
  missedPct: number;
  sceneMs: number;
  handoffMs: number;
  handoffP95Ms: number;
  /**
   * Synchronous work as a share of the display period — the headroom the interval cannot show.
   *
   * rAF intervals are quantised to the refresh rate: on a 120Hz display the only answers are
   * 8.3ms and 16.6ms, so every configuration that fits reports exactly 8.30 whether it used 3ms
   * of the budget or 7.9ms. That makes `frame` a pass/fail signal and nothing more, and makes
   * two very different configurations — 256² and 384², say — look identical. This is the column
   * that separates them.
   */
  busyPct: number;
  /** Total encoded bytes for one frame, summed across tiles. */
  bytes: number;
  /** Sustained pixels per second actually achieved: tiles × size² × fps. */
  megapixelsPerSecond: number;
  /** Sustained encoded bytes per second. */
  megabytesPerSecond: number;
}

/** The display's actual frame period, measured rather than assumed to be 16.7ms. */
export const measureDisplayPeriod = async (frames = 90): Promise<number> => {
  const intervals: number[] = [];
  await new Promise<void>((resolve) => {
    let previous = performance.now();
    let count = 0;
    const step = (now: number): void => {
      if (count > 4) intervals.push(now - previous);
      previous = now;
      count++;
      if (count < frames) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return summarise(intervals).median;
};

interface Live {
  url: string;
  revocable: boolean;
}

/**
 * How many swaps an object URL survives before being revoked.
 *
 * One was wrong, and wrong in a way that quietly invalidated every blob row. A blob URL in
 * `feImage` is fetched *asynchronously*; revoking last frame's URL as soon as this frame's is
 * assigned means no URL ever lives long enough to decode, so the filter renders with an empty
 * map — visible as perfectly straight stripes where the data-URL rows are wavy, plus a shift
 * toward the origin, because an absent map reads as channel 0 and channel 0 is the most
 * negative offset the scale allows. The encode was being measured with the decode never
 * happening.
 *
 * Four swaps is ~33ms at 120Hz, which is enough for the fetch and decode to land, and still
 * bounds the leak at four frames of pixels rather than the run's whole output.
 */
const URL_GRACE_FRAMES = 4;

/**
 * Tracks the URLs each tile has referenced and revokes them `URL_GRACE_FRAMES` behind.
 *
 * Not revoking at all is not an option either: at 120fps a megabyte a frame turns the numbers
 * into a description of memory pressure rather than of the encoder.
 */
const createSwapper = (tiles: number, applyAt: (index: number, url: string | null) => void) => {
  const history: Live[][] = Array.from({ length: tiles }, () => []);
  const revoke = (entry: Live | undefined): void => {
    if (entry?.revocable === true) URL.revokeObjectURL(entry.url);
  };
  return {
    swap: (tile: number, url: string | null, revocable: boolean): void => {
      if (url === null) return;
      const queue = history[tile];
      if (queue === undefined) return;
      applyAt(tile, url);
      queue.push({ url, revocable });
      while (queue.length > URL_GRACE_FRAMES) revoke(queue.shift());
    },
    disposeAll: (): void => {
      for (const queue of history) {
        for (const entry of queue) revoke(entry);
        queue.length = 0;
      }
    },
  };
};

interface FrameCost {
  sceneMs: number;
  handoffMs: number;
  bytes: number;
}

/**
 * One frame: paint and hand off every tile.
 *
 * Each tile gets its own scene, seeded off the frame, so no two tiles are the same bytes — an
 * identical buffer would let the decoder or the filter reuse the work and the row would report
 * a throughput nothing real can reach.
 */
const runOneFrame = (
  producer: Producer,
  context: ProducerContext,
  tiles: number,
  frame: number,
  octaves: number,
  swap: (tile: number, url: string | null, revocable: boolean) => void,
  onSettled: (bytes: number) => void
): FrameCost => {
  const { rgba } = context;
  let sceneMs = 0;
  let handoffMs = 0;
  let bytes = 0;

  for (let tile = 0; tile < tiles; tile++) {
    const t0 = performance.now();
    paintScene(rgba.data, rgba.width, rgba.height, frame * tiles + tile, octaves);
    const t1 = performance.now();
    const result = producer.run(context);
    const t2 = performance.now();
    sceneMs += t1 - t0;
    handoffMs += t2 - t1;
    bytes += result.bytes;

    swap(tile, result.url, result.revocable);
    if (result.pending !== undefined) {
      const at = tile;
      void result.pending.then((settled) => {
        if (settled === null) return;
        onSettled(settled.bytes * tiles);
        swap(at, settled.url, true);
      });
    }
  }

  return { sceneMs, handoffMs, bytes };
};

/** Offline mode: a fixed number of frames, summarised once. */
export const runProducer = async (
  producer: Producer,
  targets: BenchTargets,
  displayPeriodMs: number,
  { frames, octaves }: BenchOptions
): Promise<BenchRow> => {
  const { canvas, ctx, imageData, rgba, applyAt, resetAt, tiles, offscreen, worker } = targets;
  const context: ProducerContext = { rgba, canvas, ctx, imageData, offscreen, worker };
  const { swap, disposeAll } = createSwapper(tiles, applyAt);
  for (let tile = 0; tile < tiles; tile++) resetAt(tile);

  // A named span per producer, so a DevTools trace over the whole sweep can attribute its
  // Image Decode and filter work to a row instead of leaving eight indistinguishable phases.
  const spanStart = `handoff:${producer.id}:start`;
  performance.mark(spanStart);

  const intervals: number[] = [];
  const sceneTimes: number[] = [];
  const handoffTimes: number[] = [];
  let bytes = 0;

  await new Promise<void>((resolve) => {
    let frame = 0;
    let previous = performance.now();

    const step = (now: number): void => {
      const measuring = frame >= WARMUP_FRAMES;
      if (measuring) intervals.push(now - previous);
      previous = now;

      const cost = runOneFrame(producer, context, tiles, frame, octaves, swap, (settled) => {
        bytes = settled;
      });

      if (measuring) {
        sceneTimes.push(cost.sceneMs);
        handoffTimes.push(cost.handoffMs);
        if (cost.bytes > 0) bytes = cost.bytes;
      }

      frame++;
      if (frame < WARMUP_FRAMES + frames) requestAnimationFrame(step);
      else resolve();
    };

    requestAnimationFrame(step);
  });

  disposeAll();
  performance.measure(`handoff:${producer.id}`, spanStart);

  const interval = summarise(intervals);
  const handoff = summarise(handoffTimes);
  const scene = summarise(sceneTimes);
  const missed = intervals.filter((value) => value > displayPeriodMs * 1.5).length;
  const fps = interval.median > 0 ? 1000 / interval.median : 0;

  return {
    producerId: producer.id,
    label: producer.label,
    frames: intervals.length,
    intervalMs: interval.median,
    intervalP95Ms: interval.p95,
    fps,
    missedPct: intervals.length > 0 ? (missed / intervals.length) * 100 : 0,
    sceneMs: scene.median,
    handoffMs: handoff.median,
    handoffP95Ms: handoff.p95,
    busyPct: displayPeriodMs > 0 ? ((scene.median + handoff.median) / displayPeriodMs) * 100 : 0,
    bytes,
    megapixelsPerSecond: (tiles * rgba.width * rgba.height * fps) / 1e6,
    megabytesPerSecond: (bytes * fps) / 1e6,
  };
};

/**
 * Live mode: the same frame body, left running, pushing intervals into a log the chart reads.
 *
 * Returns the stopper. Nothing is summarised here — the chart and the log own that — because
 * the point of this mode is the shape of the series over time, which a median hides. A run
 * that holds 8.3ms and then stutters once a second reads identically to a smooth one in the
 * offline table and completely differently here.
 */
export const startLiveRun = (
  producer: Producer,
  targets: BenchTargets,
  octaves: number,
  log: FrameLog
): (() => void) => {
  const { canvas, ctx, imageData, rgba, applyAt, resetAt, tiles, offscreen, worker } = targets;
  const context: ProducerContext = { rgba, canvas, ctx, imageData, offscreen, worker };
  const { swap, disposeAll } = createSwapper(tiles, applyAt);
  for (let tile = 0; tile < tiles; tile++) resetAt(tile);

  let stopped = false;
  let frame = 0;
  let previous = performance.now();
  let handle = 0;

  const step = (now: number): void => {
    if (stopped) return;
    if (frame > 2) log.push(now, now - previous);
    previous = now;
    runOneFrame(producer, context, tiles, frame, octaves, swap, () => undefined);
    frame++;
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
    disposeAll();
  };
};

/**
 * One frame, awaited to completion, for looking at rather than for timing.
 *
 * Deliberately waits for the asynchronous producers to settle, which is the opposite of what the
 * timed modes do and is exactly what makes this useful: a blob URL in `feImage` never lands at
 * frame rate, so the live chart shows its map as permanently absent. Given one frame and no
 * deadline it lands fine, and this is the mode where that can be seen instead of argued about.
 *
 * Nothing is revoked. One frame of pixels is not a leak worth managing, and revoking is precisely
 * what stops the image from being there to look at.
 *
 * `seed` advances per draw so consecutive presses show different frames — otherwise every press
 * repaints frame zero and the button looks broken. An advancing counter rather than
 * `Math.random()`, matching how `irregular-shapes` handles the same problem: a frame nobody can
 * get back to twice is worth less in a lab than one that varies and is reproducible.
 */
export const runSingleFrame = async (
  producer: Producer,
  targets: BenchTargets,
  octaves: number,
  seed: number
): Promise<void> => {
  const { canvas, ctx, imageData, rgba, applyAt, resetAt, tiles, offscreen, worker } = targets;
  const context: ProducerContext = { rgba, canvas, ctx, imageData, offscreen, worker };

  for (let tile = 0; tile < tiles; tile++) resetAt(tile);

  const settling: Promise<void>[] = [];
  for (let tile = 0; tile < tiles; tile++) {
    paintScene(rgba.data, rgba.width, rgba.height, seed * tiles + tile, octaves);
    const result = producer.run(context);
    if (result.url !== null) applyAt(tile, result.url);
    if (result.pending !== undefined) {
      const at = tile;
      settling.push(
        result.pending.then((resolved) => {
          if (resolved !== null) applyAt(at, resolved.url);
        })
      );
    }
  }
  await Promise.all(settling);
};

/**
 * Whether the browser will actually decode a BMP, checked rather than assumed.
 *
 * A 1×1 BMP through an `<img>`. If this fails the BMP row still reports timings — it just
 * measured encoding something nothing will display, which is worth knowing before quoting it.
 */
export const bmpIsDecodable = (): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.width === 1);
    image.onerror = () => resolve(false);
    image.src = 'data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAA/wAA';
  });
