/**
 * Timestamped history for scopes whose visible time range depends on viewport width.
 * Keep one extra visible window to the left so a resize can reveal already-recorded data.
 * Retention is time-based: a faster producer must not truncate the visible window.
 */
export class SampleHistory<T extends { at: number }> {
  private readonly samples: T[] = [];
  private windowMs = 0;

  push(sample: T): void {
    this.samples.push(sample);
  }

  since(fromAt: number, now = performance.now()): T[] {
    this.windowMs = now - fromAt;
    const retainFrom = fromAt - this.windowMs;
    let discard = 0;
    while (discard < this.samples.length && this.samples[discard]!.at < retainFrom) discard++;
    if (discard > 0) this.samples.splice(0, discard);
    return this.after(fromAt);
  }

  /** Statistics use the visible window, excluding the retained overscan. */
  visible(now = performance.now()): T[] {
    return this.after(now - this.windowMs);
  }

  private after(fromAt: number): T[] {
    let start = this.samples.length;
    while (start > 0 && this.samples[start - 1]!.at >= fromAt) start--;
    return this.samples.slice(start);
  }

  get size(): number {
    return this.samples.length;
  }

  get visibleMs(): number {
    return this.windowMs;
  }

  clear(): void {
    this.samples.length = 0;
  }
}
