import { describe, expect, it } from 'vitest';

/*
 * The single-letter tokens below are deliberately not Tailwind classes. These
 * cases pin down cn()'s merge semantics — falsy filtering, array and object
 * inputs, output order — and meaningless names keep them from reading as
 * assertions about Tailwind. The one test that *is* about Tailwind conflict
 * resolution uses real classes and is unaffected by this.
 */
/* eslint-disable better-tailwindcss/no-unknown-classes */
import { cn } from '#src/cn.js';

describe('cn', () => {
  it('merges classes correctly', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', undefined, 'c')).toBe('a c');
    expect(cn('a', null, 'b', 0, 'c')).toBe('a b c');
  });

  it('merges Tailwind classes with conflict', () => {
    expect(cn('text-lg', 'text-sm')).toBe('text-sm');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('handles arrays and objects', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
    expect(cn(['a', ['b', { c: true }]])).toBe('a b c');
  });

  it('returns empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
