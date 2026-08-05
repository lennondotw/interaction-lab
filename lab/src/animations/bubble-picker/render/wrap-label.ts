// Greedy word-wrap to a max pixel width. The Canvas 2D context's
// `measureText` is fast enough for a one-shot post-settle pre-measure (we
// only call this twice per bubble: idle font + selected font), but it
// must not run inside the per-frame draw path — which is why each
// BubbleState caches `idleLines` / `selectedLines` and we just call
// `fillText` per line every frame.
export function wrapLabel(ctx: CanvasRenderingContext2D, font: string, text: string, maxWidth: number): string[] {
  const prevFont = ctx.font;
  ctx.font = font;
  const [firstWord, ...restWords] = text.split(/\s+/).filter((w) => w.length > 0);
  if (firstWord === undefined) {
    ctx.font = prevFont;
    return [];
  }

  const lines: string[] = [];
  let current = firstWord;
  for (const word of restWords) {
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  ctx.font = prevFont;
  return lines;
}
