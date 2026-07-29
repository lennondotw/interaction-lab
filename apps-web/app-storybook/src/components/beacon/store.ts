/**
 * Beacon stack store.
 *
 * Plain subscribable store (no Zustand / XState) — the surface is tiny
 * and a class-based implementation makes React 19 Strict Mode
 * double-mount semantics obvious.
 *
 * The store holds an unordered list of `BeaconEntry` objects. The
 * `getActive()` selector computes the winner on demand using the
 * priority + LIFO rule. Callers subscribe via `useSyncExternalStore`
 * in the renderer.
 */

import { BEACON_PRIORITY_RANK, type BeaconEntry } from './types.js';

type Listener = () => void;

export class BeaconStore {
  private entries: BeaconEntry[] = [];
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read the full stack (ordered by push time). */
  getSnapshot = (): readonly BeaconEntry[] => this.entries;

  /**
   * Compute the active beacon for a slot: highest priority first, ties
   * broken by most-recently-pushed (LIFO within a priority band).
   *
   * `slot` filters the stack before selection. `undefined` selects
   * entries whose own `slot` is also `undefined` — the default slot
   * used by the general-purpose follower. A string (e.g. `'tooltip'`)
   * selects entries matching that slot exactly. Passing `'*'` skips
   * the filter and returns the top of the entire stack regardless of
   * slot.
   */
  getActive = (slot?: string): BeaconEntry | undefined => {
    if (this.entries.length === 0) return undefined;
    let best: BeaconEntry | undefined;
    for (const entry of this.entries) {
      if (slot !== '*' && entry.slot !== slot) continue;
      if (!best || BEACON_PRIORITY_RANK[entry.priority] >= BEACON_PRIORITY_RANK[best.priority]) {
        best = entry;
      }
    }
    return best;
  };

  /**
   * Push (or replace by id). Idempotent: calling with the same id
   * removes any existing entry first, then appends, so a double-mount
   * during React 19 Strict Mode does not create duplicates.
   *
   * Appending at the end is intentional — `getActive` picks the last
   * entry within a priority band, so most-recently-pushed wins.
   */
  push = (entry: BeaconEntry): void => {
    const existing = this.entries.findIndex((e) => e.id === entry.id);
    if (existing === -1) {
      this.entries = [...this.entries, entry];
    } else {
      this.entries = [...this.entries.slice(0, existing), ...this.entries.slice(existing + 1), entry];
    }
    this.emit();
  };

  /**
   * Remove by id. No-op if the id is not present — makes unmount
   * cleanup safe even across a Strict Mode double-mount.
   */
  pop = (id: string): void => {
    const next = this.entries.filter((e) => e.id !== id);
    if (next.length === this.entries.length) return;
    this.entries = next;
    this.emit();
  };

  /**
   * Update an entry's `priority` in place, bumping it to the LIFO
   * tail. MotionValues are mutated outside the store (they carry their
   * own subscription channel), so changing position / size doesn't go
   * through here. `slot` is intentionally not mutable — beacons commit
   * to a slot at push time.
   */
  replacePriority = (id: string, priority: BeaconEntry['priority']): void => {
    const idx = this.entries.findIndex((e) => e.id === id);
    const prev = this.entries[idx];
    if (idx === -1 || !prev) return;
    if (prev.priority === priority) return;
    const next = { ...prev, priority };
    this.entries = [...this.entries.slice(0, idx), ...this.entries.slice(idx + 1), next];
    this.emit();
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
