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
 * Scripts are decided by Script_Extensions, not by hardcoded blocks, so Han
 * beyond Extension A (Ext B-G live above U+FFFF), halfwidth katakana, Hangul and
 * compatibility ideographs all classify correctly — pangu's nine ranges miss 87k
 * code points that `\p{scx=Han|Hira|Kana|Hang|Bopo}` covers, Hangul syllables
 * among them. The other side is any letter or digit, so Cyrillic, Arabic,
 * Hebrew, Thai and Devanagari get the same treatment as Latin rather than no
 * treatment at all.
 *
 * WHICH scripts take an inserted space is a locale question, not a Unicode one,
 * and the default is Han and Bopomofo only. See SPACED_SCRIPTS_DEFAULT.
 *
 * Bidi: a run in the opposite direction has to be isolated by the *renderer*,
 * not here. This decides adjacency in logical order; for an RTL run the
 * logically-last character is the visually-leftmost one, so a caller that
 * interpolates RTL content should give that run its own element with
 * `dir="auto"` and `unicode-bidi: isolate`, which makes logical adjacency and
 * visual adjacency agree again at its edges.
 */

/*
 * Inserting a U+0020 is the Chinese web convention, and only that.
 *
 * What the standards actually ask for is a *typographic* gap of about a quarter
 * em, applied by the composition engine and belonging to no character: W3C
 * CLReq calls for it between Han and Western text (Mixed Text Composition), and
 * JLReq calls for the same thing in Japanese — 和欧文間の空き, which JIS X 4051
 * sets at 四分アキ, a quarter em. Neither asks an author to type anything: both
 * put the gap in the composition engine. CSS Text 4's `text-autospace` is that
 * gap handed to a stylesheet — measured in Chrome 153 it is 1/8 em against the
 * 1/4 em of a typed U+0020, and it suppresses itself where a space already
 * exists rather than stacking with it. Its initial value is `no-autospace`, so
 * it is opt-in today.
 *
 * Which is the standing advice: where the text stays in a browser, reach for
 * `text-autospace` and leave the string alone. Insert a character only where the
 * text has to leave — an API payload, an `aria-label` or `title`, the clipboard,
 * `canvas.measureText`, an OG image or a push notification composed in Node.
 *
 * Who does what, measured off the three localisations of one publisher
 * (archive/2026-08-junction-spacing has the probe):
 *
 * - apple.com.cn, zh-CN: 123 text nodes carry a typed space at a Han/Latin
 *   boundary against 2 that do not, and both exceptions are filing numbers
 *   (`京ICP备10214630号`) where a space would be wrong.
 * - apple.com/jp, ja-JP: it is the other way round — 133 flush against 10, and
 *   the 10 are a carousel's `項目 1 -` labels, not prose. `お近くのApple Store`
 *   and `Macを詳しく見る` ship flush.
 * - apple.com/kr, ko-KR: Hangul is spaced at word boundaries because Korean
 *   orthography already spaces words, and never before a particle —
 *   `PC에서 Mac으로 갈아타기`, `Apple이 만든 앱`, `iPhone의 개인정보 보호`.
 *
 * Korean is the reason this is not merely a matter of taste. A particle (조사)
 * attaches to whatever precedes it, including a Latin word, so a space there is
 * a grammatical error rather than a typographic preference — and no window of
 * characters can tell `Lime와` (particle, flush) from `Lime 와` (a word, which
 * Korean would have spaced in the copy already). Japanese particles と/は/を/が
 * have the same shape. Hangul is therefore never spaced here, and kana is
 * off by default; a host that wants either has to say so, because Han is
 * shared between Chinese and Japanese and script detection cannot tell a
 * ja document from a zh one. Only the caller knows its locale.
 */
export type SpacedScript = 'han' | 'kana' | 'hangul';

/**
 * Han and Bopomofo — the Chinese convention, and the only one that types the
 * space. Bopomofo travels with Han because it annotates Chinese.
 */
export const SPACED_SCRIPTS_DEFAULT: readonly SpacedScript[] = ['han'];

export interface JunctionSpacingOptions {
  /**
   * Which wide scripts take an inserted space. A script left out reads as
   * neutral, never as half-width, so leaving kana out makes `ひらがなLime` flush
   * without making `ひらがな中文` spaced.
   */
  readonly scripts?: readonly SpacedScript[];
}

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

/*
 * A wide side keeps its script until the last moment, because whether it counts
 * as wide is the caller's policy rather than a property of the character.
 */
type BoundaryClass = SpacedScript | 'narrow' | 'symbol' | 'opener' | 'closer' | 'tight' | 'neutral';

const HAN_SCRIPT = /[\p{scx=Han}\p{scx=Bopo}]/u;
const KANA_SCRIPT = /[\p{scx=Hira}\p{scx=Kana}]/u;
const HANGUL_SCRIPT = /\p{scx=Hang}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/*
 * Fullwidth forms occupy a full em and carry their own sidebearing, so `ＡＢＣ`
 * and `１２３` need no space against CJK even though they are letters and
 * digits. Halfwidth katakana (U+FF65-FF9F) is deliberately outside this range:
 * it is narrow, so it classifies as kana and follows the kana policy rather than
 * being excluded here on width grounds.
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
/*
 * Brackets, plus every quote Unicode calls initial or final punctuation, which
 * covers the curly quotes and the guillemets in one go. The category is fixed per
 * code point, so a locale that opens with `»` (German) gets its spaces on the
 * wrong sides — a trade for not carrying a per-locale table, and the shape barely
 * occurs next to CJK.
 */
const OPENER = /[([{]|\p{Pi}/u;
const CLOSER = /[)\]}]|\p{Pf}/u;
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
    if (HAN_SCRIPT.test(first)) {
      return 'han';
    }
    if (KANA_SCRIPT.test(first)) {
      return 'kana';
    }
    if (HANGUL_SCRIPT.test(first)) {
      return 'hangul';
    }
    return 'narrow';
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

type ResolvedClass = Exclude<BoundaryClass, SpacedScript> | 'wide';

/*
 * A wide script the caller did not ask for reads as neutral, never as
 * half-width. The difference matters: leaving kana out has to make `ひらがなLime`
 * flush without making `ひらがな中文` spaced.
 */
function resolve(boundaryClass: BoundaryClass, scripts: readonly SpacedScript[]): ResolvedClass {
  if (boundaryClass === 'han' || boundaryClass === 'kana' || boundaryClass === 'hangul') {
    return scripts.includes(boundaryClass) ? 'wide' : 'neutral';
  }
  return boundaryClass;
}

interface LeftEdge {
  readonly edge: ResolvedClass;
  // What precedes a trailing run of tight punctuation. Only meaningful when
  // edge is 'tight', because that run's own class says nothing about which side
  // the space belongs on.
  readonly beforeTightRun: ResolvedClass;
}

function analyzeLeftEdge(clusters: readonly string[], scripts: readonly SpacedScript[]): LeftEdge {
  let index = clusters.length - 1;
  const edge = resolve(classifyCluster(clusters[index] ?? ''), scripts);
  if (edge !== 'tight') {
    return { edge, beforeTightRun: 'neutral' };
  }
  while (index >= 0 && classifyCluster(clusters[index] ?? '') === 'tight') {
    index -= 1;
  }
  return { edge, beforeTightRun: resolve(classifyCluster(clusters[index] ?? ''), scripts) };
}

function decideByClass(left: LeftEdge, right: ResolvedClass): boolean {
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
export function needsSpaceBetween(left: string, right: string, options?: JunctionSpacingOptions): boolean {
  if (!left || !right) {
    return false;
  }

  const scripts = options?.scripts ?? SPACED_SCRIPTS_DEFAULT;
  const tail = tailWindow(left);
  const head = headWindow(right);

  if (POSSESSIVE.test(head)) {
    return false;
  }
  if (!isJunctionGraphemeBoundary(tail, head)) {
    return false;
  }

  const headClusters = graphemesOf(head);
  return decideByClass(
    analyzeLeftEdge(graphemesOf(tail), scripts),
    resolve(classifyCluster(headClusters[0] ?? ''), scripts)
  );
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
export function segmentWithSpacing(parts: readonly string[], options?: JunctionSpacingOptions): SpacedSegment[] {
  const segments: SpacedSegment[] = [];
  // The left side of each junction is everything emitted so far, not just the
  // previous part, so a token split across parts (`v1` + `.2:` + `中文`) is
  // still read with its context.
  let emitted = '';

  for (const [partIndex, text] of parts.entries()) {
    if (!text) {
      continue;
    }
    if (emitted && needsSpaceBetween(emitted, text, options)) {
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
export function joinWithSpacing(parts: readonly string[], options?: JunctionSpacingOptions): string {
  let joined = '';
  for (const segment of segmentWithSpacing(parts, options)) {
    joined += segment.text;
  }
  return joined;
}
