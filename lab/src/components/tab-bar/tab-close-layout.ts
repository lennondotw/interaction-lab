/** Preserve the next close target, or the strip's right edge when closing its tail. */
export function closeTabWidths(widths: readonly number[], index: number, gap: number, basis: number): number[] {
  const remaining = widths.filter((_, tabIndex) => tabIndex !== index);
  if (index < widths.length - 1 || remaining.length === 0) return remaining;

  const span = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  const width = Math.min(basis, (span - gap * (remaining.length - 1)) / remaining.length);
  return remaining.map(() => width);
}
