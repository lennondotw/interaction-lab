interface TabWidthTarget {
  id: string;
  width: number;
}

/** New tabs inherit the hold; the available layout can still compress the entire strip further. */
export function resolveTabWidths(
  targets: readonly TabWidthTarget[],
  heldWidths: ReadonlyMap<string, number> | null
): number[] {
  const newTabWidth = heldWidths?.values().next().value;
  return targets.map((target) => {
    const heldWidth = heldWidths?.get(target.id) ?? newTabWidth;
    return heldWidth === undefined ? target.width : Math.min(heldWidth, target.width);
  });
}
