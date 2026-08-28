/**
 * Main-thread side of the encode worker: one request in flight per id, resolved by reply.
 *
 * The buffer is copied before it is transferred, and that copy is charged to the caller on
 * purpose. Transferring the scene buffer itself would be free but would also detach it, and
 * the next frame would have nothing to paint into — so the honest comparison against the
 * synchronous encoders includes the copy that making this asynchronous requires.
 */

export interface EncodeReply {
  url: string;
  bytes: number;
}

export class EncodeWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, (reply: EncodeReply) => void>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event: MessageEvent<{ id: number; blob: Blob; bytes: number }>) => {
      const { id, blob, bytes } = event.data;
      const resolve = this.pending.get(id);
      if (resolve === undefined) return;
      this.pending.delete(id);
      resolve({ url: URL.createObjectURL(blob), bytes });
    });
  }

  encode(data: Uint8ClampedArray, width: number, height: number): Promise<EncodeReply> {
    const id = this.nextId++;
    // A copy, then transfer the copy — see the note above.
    const copy = new Uint8ClampedArray(data);
    return new Promise<EncodeReply>((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, buffer: copy.buffer, width, height }, [copy.buffer]);
    });
  }

  dispose(): void {
    this.pending.clear();
    this.worker.terminate();
  }
}
