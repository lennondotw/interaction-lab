/**
 * Builds the PNG container off the main thread.
 *
 * This is the interesting row in the sweep, because everything the main-thread encoders do is
 * work the frame has to wait for, and none of it needs to be. The pixels arrive as a
 * transferred `ArrayBuffer` — no copy on the way in — and the reply is a `Blob`, which is also
 * transferable in the sense that matters: its bytes never cross the thread boundary as a
 * structured clone, only a handle does.
 *
 * What this cannot move off-thread is the decode. `createObjectURL` and the browser's own
 * image decoding still happen where the image is used, so a worker deletes the encode from
 * the frame budget and leaves the decode in it.
 */

import { encodeUncompressedPng } from './encoders.js';

interface EncodeRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

interface WorkerScope {
  addEventListener: (type: 'message', listener: (event: MessageEvent<EncodeRequest>) => void) => void;
  postMessage: (message: { id: number; blob: Blob; bytes: number }) => void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { id, buffer, width, height } = event.data;
  const bytes = encodeUncompressedPng({ data: new Uint8ClampedArray(buffer), width, height });
  scope.postMessage({ id, blob: new Blob([bytes as unknown as BlobPart], { type: 'image/png' }), bytes: bytes.length });
});
