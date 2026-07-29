import { motionValue } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import { BeaconStore } from '../store.js';
import type { BeaconEntry, BeaconPriority } from '../types.js';

function makeEntry(id: string, priority: BeaconPriority = 'normal', slot?: string): BeaconEntry {
  return {
    id,
    priority,
    slot,
    x: motionValue(0),
    y: motionValue(0),
    w: motionValue(100),
    h: motionValue(40),
  };
}

describe('BeaconStore', () => {
  describe('push + getActive', () => {
    it('returns undefined when empty', () => {
      const store = new BeaconStore();
      expect(store.getActive()).toBeUndefined();
    });

    it('picks the most recent push within the same priority band', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a'));
      store.push(makeEntry('b'));
      store.push(makeEntry('c'));
      expect(store.getActive()?.id).toBe('c');
    });

    it('picks the highest priority regardless of push order', () => {
      const store = new BeaconStore();
      store.push(makeEntry('low-1', 'low'));
      store.push(makeEntry('critical-1', 'critical'));
      store.push(makeEntry('normal-1', 'normal'));
      expect(store.getActive()?.id).toBe('critical-1');
    });

    it('within the same priority, LIFO wins', () => {
      const store = new BeaconStore();
      store.push(makeEntry('n1', 'normal'));
      store.push(makeEntry('h1', 'high'));
      store.push(makeEntry('h2', 'high'));
      store.push(makeEntry('h3', 'high'));
      expect(store.getActive()?.id).toBe('h3');
    });
  });

  describe('slots', () => {
    it('keeps slots independent', () => {
      const store = new BeaconStore();
      store.push(makeEntry('default-1'));
      store.push(makeEntry('tooltip-1', 'normal', 'tooltip'));
      expect(store.getActive()?.id).toBe('default-1');
      expect(store.getActive('tooltip')?.id).toBe('tooltip-1');
    });

    it('does not let a named slot win the default slot even at higher priority', () => {
      const store = new BeaconStore();
      store.push(makeEntry('default-1', 'low'));
      store.push(makeEntry('tooltip-1', 'critical', 'tooltip'));
      expect(store.getActive()?.id).toBe('default-1');
    });

    it("'*' selects the top of the whole stack regardless of slot", () => {
      const store = new BeaconStore();
      store.push(makeEntry('default-1', 'low'));
      store.push(makeEntry('tooltip-1', 'critical', 'tooltip'));
      expect(store.getActive('*')?.id).toBe('tooltip-1');
    });
  });

  describe('push idempotency (Strict Mode double-mount safety)', () => {
    it('replacing same id does not duplicate and moves to top of LIFO band', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a'));
      store.push(makeEntry('b'));
      store.push(makeEntry('a')); // re-push: removes old + appends
      expect(store.getSnapshot()).toHaveLength(2);
      expect(store.getActive()?.id).toBe('a');
    });
  });

  describe('pop', () => {
    it('removes by id and falls back to the new LIFO winner', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a'));
      store.push(makeEntry('b'));
      store.push(makeEntry('c'));
      store.pop('c');
      expect(store.getActive()?.id).toBe('b');
    });

    it('pop of missing id is a no-op and does not notify listeners', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a'));
      const listener = vi.fn();
      store.subscribe(listener);
      store.pop('ghost');
      expect(listener).not.toHaveBeenCalled();
    });

    it('returns undefined active when last entry is popped', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a'));
      store.pop('a');
      expect(store.getActive()).toBeUndefined();
    });
  });

  describe('replacePriority', () => {
    it('updates priority and bumps entry to the LIFO tail', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a', 'normal'));
      store.push(makeEntry('b', 'normal'));
      store.replacePriority('a', 'high');
      const active = store.getActive();
      expect(active?.id).toBe('a');
      expect(active?.priority).toBe('high');
    });

    it('preserves the entry MotionValue identities across a priority change', () => {
      const store = new BeaconStore();
      const entry = makeEntry('a', 'normal');
      store.push(entry);
      store.replacePriority('a', 'high');
      expect(store.getActive()?.x).toBe(entry.x);
    });

    it('is a no-op when priority is unchanged', () => {
      const store = new BeaconStore();
      store.push(makeEntry('a', 'normal'));
      const listener = vi.fn();
      store.subscribe(listener);
      store.replacePriority('a', 'normal');
      expect(listener).not.toHaveBeenCalled();
    });

    it('is a no-op when id is missing', () => {
      const store = new BeaconStore();
      const listener = vi.fn();
      store.subscribe(listener);
      store.replacePriority('ghost', 'high');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('notifies on push and pop, not on MotionValue changes', () => {
      const store = new BeaconStore();
      const listener = vi.fn();
      const unsub = store.subscribe(listener);
      store.push(makeEntry('a'));
      expect(listener).toHaveBeenCalledTimes(1);
      store.pop('a');
      expect(listener).toHaveBeenCalledTimes(2);
      unsub();
      store.push(makeEntry('b'));
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('does not notify a listener after it unsubscribes', () => {
      const store = new BeaconStore();
      const listener = vi.fn();
      store.subscribe(listener)();
      store.push(makeEntry('a'));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
