/*
 * Whether a space belongs at the junction of two text runs.
 *
 * This is the only question a template interpolation has to answer, and it is a
 * much smaller question than the one paragraph typesetters answer. A junction
 * has exactly two inputs — the grapheme cluster on each side — so the answer is
 * a class-by-class matrix, not an ordered rule pipeline. pangu.js needs 63
 * ordered regexes because it rewrites whole strings, where a rule's match
 * window spans three or more characters and the rules interact; every one of
 * those interactions is out of scope here.
 *
 * Two consequences of interpolation being the use case, both deliberate:
 *
 * - The interpolated run is never touched, not one byte. A space only ever goes
 *   *between* two runs. Where whole-string formatting would edit inside a run
 *   (`蒸馏/训练` reads as `蒸馏 / 训练`, and the slash lives inside the dynamic
 *   part), this inserts the junction space it can and leaves the interior
 *   alone.
 * - Only a junction where one side is wide gets a space. Two half-width runs
 *   are left flush, so `Disney+`, `C++`, `1.2`, `a/b` and URLs survive being
 *   split across parts. Whole-string formatters do space some half-width pairs
 *   (`80%files` → `80% files`); that is a paragraph concern and it cannot be
 *   done safely without seeing the whole paragraph.
 *
 * Scripts: `wide` is decided by Script_Extensions, not by hardcoded blocks, so
 * Hangul, Han beyond Extension A (Ext B-G live above U+FFFF), halfwidth
 * katakana and compatibility ideographs all classify correctly — pangu's nine
 * ranges miss 87k code points that `\p{scx=Han|Hira|Kana|Hang|Bopo}` covers,
 * Hangul syllables among them. The other side is any letter or digit, so
 * Cyrillic, Arabic, Hebrew, Thai and Devanagari get the same treatment as Latin
 * rather than no treatment at all.
 *
 * Bidi: a run in the opposite direction has to be isolated by the *renderer*,
 * not here. This decides adjacency in logical order; for an RTL run the
 * logically-last character is the visually-leftmost one, so a caller that
 * interpolates RTL content should give that run its own element with
 * `dir="auto"` and `unicode-bidi: isolate`, which makes logical adjacency and
 * visual adjacency agree again at its edges.
 */

/*
 * Grapheme granularity is locale-independent (UAX #29 tailors word and sentence
 * breaking by locale, not grapheme breaking), so the locale is fixed rather
 * than left to the host default.
 */
const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

/*
 * Only the characters next to the junction decide it, so both sides are cut to
 * a window. The cut is what keeps the cost independent of how long the runs
 * are; the price is that a grapheme cluster longer than the window reads as
 * neutral, which fails towards not inserting a space.
 */
const WINDOW_CODE_POINTS = 32;

type BoundaryClass = 'wide' | 'narrow' | 'symbol' | 'opener' | 'closer' | 'tight' | 'neutral';

const WIDE_SCRIPT = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}\p{scx=Bopo}]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/*
 * Fullwidth forms occupy a full em and carry their own sidebearing, so `ＡＢＣ`
 * and `１２３` need no space against CJK even though they are letters and
 * digits. Halfwidth katakana (U+FF65-FF9F) is deliberately outside this range:
 * it is narrow, and `ﾊﾝｶｸabc` does want the space.
 */
const FULLWIDTH_FORM = /[！-｠￠-￦]/u;
/*
 * Symbols that read as their own token next to CJK, so they take a space on
 * either side. Straight quotes and the backtick are here rather than in
 * opener/closer because they are ambiguous — the same character both opens and
 * closes — and the answer is the same for both roles.
 *
 * Left out on purpose: `_` (binds into identifiers, `snake_case`), `|` (a
 * separator on one line and a pipe operator on the next, undecidable from two
 * characters), and the Latin-1 symbols `° © ® µ` (each binds to the run it
 * annotates, so a wide character is never really adjacent to one).
 */
const SYMBOL = /["'`+\-*/=&%@$^\\~#<>±×÷]/;
const OPENER = /[([{“‘]/;
const CLOSER = /[)\]}”’]/;
/*
 * Halfwidth sentence punctuation. It binds to the run on its left, so at a
 * junction the space goes on the far side of the run and never before it — see
 * decideByClass. The fullwidth counterparts (`。，：；！？`) are not here: they
 * already carry the space in the glyph.
 */
const TIGHT = /[.,;:!?]/;
/*
 * `李明` + `'s profile` is a possessive, not a quoted run, so it stays flush.
 */
const POSSESSIVE = /^['’]s(?![\p{L}\p{N}])/u;

function graphemesOf(text: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(text), (entry) => entry.segment);
}

function tailWindow(text: string): string {
  // Slicing UTF-16 units first keeps this off the whole string; a lone
  // surrogate left at the far edge is 32 code points from the junction and
  // cannot reach the decision.
  return Array.from(text.slice(-WINDOW_CODE_POINTS * 2))
    .slice(-WINDOW_CODE_POINTS)
    .join('');
}

function headWindow(text: string): string {
  return Array.from(text.slice(0, WINDOW_CODE_POINTS * 2))
    .slice(0, WINDOW_CODE_POINTS)
    .join('');
}

/*
 * A cluster is classified by the first code point of its NFC form. NFC is what
 * makes decomposed text behave like composed text: `café` ends in a
 * combining acute, which is in no character class at all, and normalising the
 * cluster turns it back into `é`. Reading only the first code point is what
 * makes every extending sequence — variation selectors, ZWJ, skin tones,
 * keycaps — classify as its base character, so `1️⃣` reads as a digit and `❤️`
 * reads as its pictograph, the same way each does without the modifier.
 *
 * The text itself is never normalised, only this probe.
 */
function classifyCluster(cluster: string): BoundaryClass {
  const [first] = Array.from(cluster.normalize('NFC'));
  if (first === undefined) {
    return 'neutral';
  }
  if (LETTER_OR_DIGIT.test(first)) {
    if (FULLWIDTH_FORM.test(first)) {
      return 'neutral';
    }
    return WIDE_SCRIPT.test(first) ? 'wide' : 'narrow';
  }
  if (TIGHT.test(first)) {
    return 'tight';
  }
  if (OPENER.test(first)) {
    return 'opener';
  }
  if (CLOSER.test(first)) {
    return 'closer';
  }
  if (SYMBOL.test(first)) {
    return 'symbol';
  }
  // Whitespace, emoji, fullwidth and CJK punctuation, marks, controls. A
  // neutral on either side settles the junction: no space.
  return 'neutral';
}

interface LeftEdge {
  readonly edge: BoundaryClass;
  // What precedes a trailing run of tight punctuation. Only meaningful when
  // edge is 'tight', because that run's own class says nothing about which side
  // the space belongs on.
  readonly beforeTightRun: BoundaryClass;
}

function analyzeLeftEdge(clusters: readonly string[]): LeftEdge {
  let index = clusters.length - 1;
  const edge = classifyCluster(clusters[index] ?? '');
  if (edge !== 'tight') {
    return { edge, beforeTightRun: 'neutral' };
  }
  while (index >= 0 && classifyCluster(clusters[index] ?? '') === 'tight') {
    index -= 1;
  }
  return { edge, beforeTightRun: classifyCluster(clusters[index] ?? '') };
}

function decideByClass(left: LeftEdge, right: BoundaryClass): boolean {
  if (left.edge === 'neutral' || right === 'neutral') {
    return false;
  }

  /*
   * A trailing punctuation run takes the space after itself, never before:
   * `他说,` + `hello` reads `他说, hello`, and `版本 v1.2:` + `中文` reads
   * `版本 v1.2: 中文` — which is the case that a one-character probe cannot
   * see, since `:` alone against `中` says nothing. A run preceded by a
   * half-width character only earns the space when a wide character follows,
   * so a decimal point split across parts (`1.` + `2`) stays flush.
   */
  if (left.edge === 'tight') {
    if (left.beforeTightRun === 'wide') {
      return right === 'wide' || right === 'narrow' || right === 'symbol' || right === 'opener';
    }
    if (left.beforeTightRun === 'narrow' || left.beforeTightRun === 'closer') {
      return right === 'wide';
    }
    return false;
  }
  if (right === 'tight') {
    return false;
  }

  // Brackets and quote pairs are asymmetric: the space goes outside the pair,
  // so an opener takes it on its left and a closer on its right.
  if (left.edge === 'wide') {
    return right === 'narrow' || right === 'symbol' || right === 'opener';
  }
  if (right === 'wide') {
    return left.edge === 'narrow' || left.edge === 'symbol' || left.edge === 'closer';
  }
  return false;
}

/*
 * Inserting a space inside a grapheme cluster destroys the glyph: it strands a
 * skin tone modifier, breaks a regional-indicator pair into two letters, drops
 * a variation selector so an emoji falls back to monochrome, or orphans a
 * combining mark. Interpolation is exactly where this happens, because the two
 * runs come from different sources and either may end or begin mid-cluster.
 */
function isJunctionGraphemeBoundary(tail: string, head: string): boolean {
  for (const { index } of GRAPHEME_SEGMENTER.segment(tail + head)) {
    if (index === tail.length) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a single space belongs between `left` and `right` when they are
 * concatenated.
 *
 * Neither string is modified or inspected beyond a window at the junction, so
 * this is safe to ask about runs that must survive verbatim.
 */
export function needsSpaceBetween(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  const tail = tailWindow(left);
  const head = headWindow(right);

  if (POSSESSIVE.test(head)) {
    return false;
  }
  if (!isJunctionGraphemeBoundary(tail, head)) {
    return false;
  }

  const headClusters = graphemesOf(head);
  return decideByClass(analyzeLeftEdge(graphemesOf(tail)), classifyCluster(headClusters[0] ?? ''));
}

export type SpacedSegment =
  | { readonly type: 'part'; readonly text: string; readonly partIndex: number }
  | { readonly type: 'space'; readonly text: ' ' };

/**
 * The parts with the junction spaces made explicit, so a caller can render each
 * piece on its own — which part a span of text came from, and which spaces this
 * function added rather than the copy.
 *
 * An empty part contributes nothing and does not hide the junction it sits in:
 * `['你好', '', '世界']` is judged as `你好` against `世界`.
 */
export function segmentWithSpacing(parts: readonly string[]): SpacedSegment[] {
  const segments: SpacedSegment[] = [];
  // The left side of each junction is everything emitted so far, not just the
  // previous part, so a token split across parts (`v1` + `.2:` + `中文`) is
  // still read with its context.
  let emitted = '';

  for (const [partIndex, text] of parts.entries()) {
    if (!text) {
      continue;
    }
    if (emitted && needsSpaceBetween(emitted, text)) {
      segments.push({ type: 'space', text: ' ' });
      emitted += ' ';
    }
    segments.push({ type: 'part', text, partIndex });
    emitted += text;
  }

  return segments;
}

/**
 * The parts concatenated with a space at every junction that wants one.
 */
export function joinWithSpacing(parts: readonly string[]): string {
  let joined = '';
  for (const segment of segmentWithSpacing(parts)) {
    joined += segment.text;
  }
  return joined;
}
