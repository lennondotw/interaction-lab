/**
 * The candidate handoffs, as one list so the harness can sweep them without knowing what
 * any of them do.
 *
 * Ordered so that consecutive rows differ by one thing. `none` → `put-only` prices the
 * canvas write; `put-only` → `canvas-dataurl` prices the browser's PNG encoder plus base64;
 * `raw-png-blob` → `raw-png-dataurl` prices base64 on its own; `raw-png-blob` → `bmp-blob`
 * prices the two checksum passes; and `raw-png-blob` → `canvas-readback` prices the GPU
 * readback that the canvas route cannot avoid. A row on its own says very little; the
 * differences are the measurement.
 */

import type { EncodeWorkerClient } from './encode-worker-client.js';
import { encodeBmp, encodeUncompressedPng, toBlobUrl, toDataUrl, type Rgba } from './encoders.js';

export interface ProducerContext {
  rgba: Rgba;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  /** For the rows that keep the encode off the main thread. */
  offscreen: OffscreenCanvas;
  worker: EncodeWorkerClient;
}

export interface ProducerResult {
  /** Ready immediately, or null when nothing is handed off or the URL arrives later. */
  url: string | null;
  /** Encoded size, or 0 when nothing was encoded. */
  bytes: number;
  /** Set by the async producers; the harness applies it when it settles. */
  pending?: Promise<{ url: string; bytes: number } | null>;
  /** True when `url` is an object URL the harness must revoke after swapping it out. */
  revocable: boolean;
}

export interface Producer {
  id: string;
  label: string;
  note: string;
  /**
   * True when the URL this hands over is an object URL, which `feImage` fetches
   * **asynchronously**.
   *
   * Measured, not assumed: a blob URL in `feImage` works perfectly given a second, and never
   * lands at 120Hz when a fresh one replaces it every frame — the stripes in the preview stay
   * dead straight where the data-URL rows are wavy. So for the `feImage` consumer these rows
   * time an encode whose result is never decoded, and their frame numbers are optimistic by
   * whatever the decode would have cost. The `<img>` consumer has no such problem; it is happy
   * to show a blob a frame or two late.
   */
  asyncForFeImage?: true;
  run: (context: ProducerContext) => ProducerResult;
}

const PNG = 'image/png';

export const PRODUCERS: readonly Producer[] = [
  {
    id: 'none',
    label: 'generate only',
    note: 'No handoff at all. The floor: whatever this costs is the scene, not the plumbing.',
    run: () => ({ url: null, bytes: 0, revocable: false }),
  },
  {
    id: 'put-only',
    label: 'putImageData',
    note: 'Pixels pushed to a canvas and left there. Prices the upload on its own, before any encoder is involved.',
    run: ({ ctx, imageData }) => {
      ctx.putImageData(imageData, 0, 0);
      return { url: null, bytes: 0, revocable: false };
    },
  },
  {
    id: 'canvas-dataurl',
    label: 'canvas.toDataURL(png)',
    note: 'The obvious approach, and three costs in one call: readback, a full deflate pass, and base64.',
    run: ({ ctx, imageData, canvas }) => {
      ctx.putImageData(imageData, 0, 0);
      const url = canvas.toDataURL(PNG);
      return { url, bytes: url.length, revocable: false };
    },
  },
  {
    id: 'canvas-blob',
    asyncForFeImage: true,
    label: 'canvas.toBlob(png)',
    note: 'Same encoder without base64, and asynchronous — so its cost may land off the frame that asked for it rather than disappear.',
    run: ({ ctx, imageData, canvas }) => {
      ctx.putImageData(imageData, 0, 0);
      const pending = new Promise<{ url: string; bytes: number } | null>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob === null) {
            resolve(null);
            return;
          }
          resolve({ url: URL.createObjectURL(blob), bytes: blob.size });
        }, PNG);
      });
      return { url: null, bytes: 0, pending, revocable: true };
    },
  },
  {
    id: 'raw-png-blob',
    asyncForFeImage: true,
    label: 'stored-deflate PNG → blob',
    note: 'A valid PNG with the pixels verbatim, straight from the JS buffer. No canvas, no compression, no base64 — one CRC and one Adler.',
    run: ({ rgba }) => {
      const bytes = encodeUncompressedPng(rgba);
      return { url: toBlobUrl(bytes, PNG), bytes: bytes.length, revocable: true };
    },
  },
  {
    id: 'raw-png-dataurl',
    label: 'stored-deflate PNG → data URL',
    note: 'The same bytes as the row above, base64-encoded instead of wrapped in a blob. The difference is base64 and the string it allocates.',
    run: ({ rgba }) => {
      const bytes = encodeUncompressedPng(rgba);
      const url = toDataUrl(bytes, PNG);
      return { url, bytes: url.length, revocable: false };
    },
  },
  {
    id: 'bmp-blob',
    asyncForFeImage: true,
    label: 'BMP → blob',
    note: 'No checksums anywhere, so the gap to the stored PNG is what CRC-32 and Adler-32 cost. 32-bit BI_RGB alpha is widely ignored, which is fine for an opaque map only.',
    run: ({ rgba }) => {
      const bytes = encodeBmp(rgba);
      return { url: toBlobUrl(bytes, 'image/bmp'), bytes: bytes.length, revocable: true };
    },
  },
  {
    id: 'offscreen-blob',
    asyncForFeImage: true,
    label: 'OffscreenCanvas.convertToBlob',
    note: 'The browser encoder again, on an offscreen canvas and asynchronous. Nothing about it is off the main thread by contract, so this measures whether Chrome chooses to move it.',
    run: ({ offscreen, imageData }) => {
      const offCtx = offscreen.getContext('2d');
      if (offCtx === null) return { url: null, bytes: 0, revocable: false };
      offCtx.putImageData(imageData, 0, 0);
      const pending = offscreen.convertToBlob({ type: PNG }).then((blob) => ({
        url: URL.createObjectURL(blob),
        bytes: blob.size,
      }));
      return { url: null, bytes: 0, pending, revocable: true };
    },
  },
  {
    id: 'worker-raw-png',
    asyncForFeImage: true,
    label: 'worker → stored PNG',
    note: 'The container built on another thread. The frame pays for one buffer copy and nothing else — the CRC, the Adler and the byte shuffling all leave the frame budget. What stays behind is the decode.',
    run: ({ rgba, worker }) => {
      const pending = worker.encode(rgba.data, rgba.width, rgba.height);
      return { url: null, bytes: 0, pending, revocable: true };
    },
  },
  {
    id: 'canvas-readback',
    asyncForFeImage: true,
    label: 'getImageData → stored PNG',
    note: 'For when the pixels are already on a canvas rather than in JS. Adds the GPU→CPU readback that the pure-JS rows skip, and nothing else.',
    run: ({ ctx, imageData, rgba }) => {
      ctx.putImageData(imageData, 0, 0);
      const read = ctx.getImageData(0, 0, rgba.width, rgba.height);
      const bytes = encodeUncompressedPng({ data: read.data, width: rgba.width, height: rgba.height });
      return { url: toBlobUrl(bytes, PNG), bytes: bytes.length, revocable: true };
    },
  },
];

export type ConsumerId = 'none' | 'img' | 'feimage';

export interface Consumer {
  id: ConsumerId;
  label: string;
  note: string;
}

export const CONSUMERS: readonly Consumer[] = [
  {
    id: 'none',
    label: 'nothing',
    note: 'The URL is produced and dropped. Isolates encoding from decoding — anything the browser would have done with the image is absent.',
  },
  {
    id: 'img',
    label: '<img src>',
    note: 'Decoded and composited, but no filter. The decode shows up as main-thread time the harness never called for.',
  },
  {
    id: 'feimage',
    label: 'SVG feImage',
    note: 'The real target for a displacement map: the image feeds a live filter, so every frame is a decode plus a filter re-run.',
  },
];
