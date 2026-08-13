import { describe, expect, it } from 'vitest';

import { joinWithSpacing, needsSpaceBetween, segmentWithSpacing } from '#src/junction-spacing.js';

/*
 * Cases marked "pangu disagrees" are measured divergences from pangu.js 9.1.0,
 * kept as assertions so the divergence stays a decision rather than a drift.
 * archive/2026-08-junction-spacing has the probe and the numbers.
 */

describe('needsSpaceBetween', () => {
  it('spaces a wide run against a half-width one, in both directions', () => {
    expect(needsSpaceBetween('你好', 'world')).toBe(true);
    expect(needsSpaceBetween('hello', '世界')).toBe(true);
    expect(needsSpaceBetween('共有', '42')).toBe(true);
    expect(needsSpaceBetween('42', '个项目')).toBe(true);
  });

  it('leaves two runs of the same width flush', () => {
    expect(needsSpaceBetween('你好', '世界')).toBe(false);
    expect(needsSpaceBetween('hello', 'world')).toBe(false);
    expect(needsSpaceBetween('80%', 'files')).toBe(false);
  });

  it('treats every wide script as wide, not just the blocks pangu hardcodes', () => {
    expect(needsSpaceBetween('汉字', 'a')).toBe(true);
    expect(needsSpaceBetween('漢字', 'a')).toBe(true);
    expect(needsSpaceBetween('ひらがな', 'a')).toBe(true);
    expect(needsSpaceBetween('カタカナ', 'a')).toBe(true);
    expect(needsSpaceBetween('ㄅㄆ', 'a')).toBe(true);
    // Hangul: pangu disagrees, its CJK class has no Hangul at all
    expect(needsSpaceBetween('한국', 'word')).toBe(true);
    expect(needsSpaceBetween('총', '42')).toBe(true);
    // Hangul written decomposed, as macOS filenames are
    expect(needsSpaceBetween('한국'.normalize('NFD'), 'word')).toBe(true);
    // Han beyond Extension A lives above U+FFFF: pangu disagrees
    expect(needsSpaceBetween('\u{20000}', 'word')).toBe(true);
    // Halfwidth katakana is narrow but still kana: pangu disagrees
    expect(needsSpaceBetween('ﾊﾝｶｸ', 'abc')).toBe(true);
  });

  it('leaves fullwidth forms flush, since they carry their own sidebearing', () => {
    expect(needsSpaceBetween('ＡＢＣ', '中文')).toBe(false);
    expect(needsSpaceBetween('中文', '１２３')).toBe(false);
    expect(needsSpaceBetween('「引用」', 'quote')).toBe(false);
    expect(needsSpaceBetween('中文。', 'hello')).toBe(false);
    expect(needsSpaceBetween('中文', '（括号）')).toBe(false);
  });

  it('gives non-Latin half-width scripts the same treatment as Latin', () => {
    expect(needsSpaceBetween('中文', 'Привет')).toBe(true);
    expect(needsSpaceBetween('中文', 'العربية')).toBe(true);
    expect(needsSpaceBetween('中文', 'שלום')).toBe(true);
    expect(needsSpaceBetween('中文', 'ไทย')).toBe(true);
    expect(needsSpaceBetween('हिन्दी', '中文')).toBe(true);
  });

  it('normalises the probe so decomposed text behaves like composed text', () => {
    // The last code point is a combining acute, which is in no character class
    expect(needsSpaceBetween('café'.normalize('NFD'), '中文')).toBe(true);
    expect(needsSpaceBetween('café'.normalize('NFC'), '中文')).toBe(true);
  });

  it('never splits a grapheme cluster', () => {
    expect(needsSpaceBetween('点赞👍', '\u{1F3FD}了')).toBe(false);
    expect(needsSpaceBetween('喜欢❤', '️的')).toBe(false);
    expect(needsSpaceBetween('来自🇯', '🇵的用户')).toBe(false);
    expect(needsSpaceBetween('一家👨‍', '👩‍👧')).toBe(false);
    expect(needsSpaceBetween('咖啡e', '́很香')).toBe(false);
  });

  it('treats pictographs as neutral, whichever block they live in', () => {
    expect(needsSpaceBetween('庆祝', '🎉')).toBe(false);
    expect(needsSpaceBetween('🎉', '庆祝')).toBe(false);
    expect(needsSpaceBetween('评分', '⭐⭐⭐')).toBe(false);
    // pangu disagrees on these two: U+2700-27BF sits inside its half-width
    // symbol class, so it spaces ✈ and ❤ but not 😀 — same category, opposite
    // answer, decided by code point block
    expect(needsSpaceBetween('航班', '✈')).toBe(false);
    expect(needsSpaceBetween('喜欢', '❤')).toBe(false);
    // A keycap reads as its base digit, and does so on both sides: pangu
    // spaces the left one only
    expect(needsSpaceBetween('中文', '1️⃣')).toBe(true);
    expect(needsSpaceBetween('1️⃣', '第一')).toBe(true);
  });

  it('spaces symbols that read as their own token next to a wide run', () => {
    expect(needsSpaceBetween('已完成', '80%')).toBe(true);
    expect(needsSpaceBetween('80%', '的任务')).toBe(true);
    expect(needsSpaceBetween('价格', '+100')).toBe(true);
    expect(needsSpaceBetween('Disney+', '会员')).toBe(true);
    expect(needsSpaceBetween('标签', '#tag')).toBe(true);
    expect(needsSpaceBetween('来自', '@vinta')).toBe(true);
    // pangu only spaces a path whose first segment is in its directory word
    // list, so it splits /usr/bin from /foo/bar; this does not
    expect(needsSpaceBetween('文件在', '/usr/bin')).toBe(true);
    expect(needsSpaceBetween('文件在', '/foo/bar')).toBe(true);
  });

  it('leaves a symbol that binds into a half-width token alone', () => {
    expect(needsSpaceBetween('state-of-the-', 'art')).toBe(false);
    expect(needsSpaceBetween('GPT-', '4o')).toBe(false);
    expect(needsSpaceBetween('snake_', 'case')).toBe(false);
    expect(needsSpaceBetween('中文', '_id')).toBe(false);
  });

  it('puts the space outside a bracket or quote pair, not inside it', () => {
    expect(needsSpaceBetween('他说', '"hello"')).toBe(true);
    expect(needsSpaceBetween('"hello"', '很好')).toBe(true);
    expect(needsSpaceBetween('他说', '“引用”')).toBe(true);
    expect(needsSpaceBetween('“引用”', '中文')).toBe(true);
    expect(needsSpaceBetween('中文', '(hello)')).toBe(true);
    expect(needsSpaceBetween('(hello)', '中文')).toBe(true);
    expect(needsSpaceBetween('(', '中文')).toBe(false);
    expect(needsSpaceBetween('中文', ')')).toBe(false);
  });

  it('reads guillemets as the quote pair they are', () => {
    expect(needsSpaceBetween('他说', '«سلام»')).toBe(true);
    expect(needsSpaceBetween('«سلام»', '结束')).toBe(true);
    expect(needsSpaceBetween('«', '中文')).toBe(false);
    expect(needsSpaceBetween('中文', '»')).toBe(false);
  });

  it('binds halfwidth punctuation to the run on its left', () => {
    // The case a single-character probe cannot see: `:` against `中` says
    // nothing, the digit before it decides
    expect(needsSpaceBetween('版本 v1.2:', '中文说明')).toBe(true);
    expect(needsSpaceBetween('hello.', '中文')).toBe(true);
    expect(needsSpaceBetween('hello,', '中文')).toBe(true);
    expect(needsSpaceBetween('他说,', 'hello')).toBe(true);
    expect(needsSpaceBetween('他说……', 'hello')).toBe(false);
    // A decimal point split across parts must not become a sentence
    expect(needsSpaceBetween('1.', '2')).toBe(false);
    // The space belongs after the punctuation, which is inside the next run
    expect(needsSpaceBetween('中文', ',请稍候')).toBe(false);
    expect(needsSpaceBetween('中文', '.5')).toBe(false);
    // Punctuation with nothing but space behind it decides nothing
    expect(needsSpaceBetween('中文 ,', 'hello')).toBe(false);
  });

  it('keeps a possessive flush', () => {
    expect(needsSpaceBetween('李明', "'s profile")).toBe(false);
    expect(needsSpaceBetween('李明', '’s profile')).toBe(false);
    expect(needsSpaceBetween('李明', "'quoted'")).toBe(true);
  });

  it('does nothing where a space is already present', () => {
    expect(needsSpaceBetween('你好 ', 'world')).toBe(false);
    expect(needsSpaceBetween('你好', ' world')).toBe(false);
    expect(needsSpaceBetween('你好\n', 'world')).toBe(false);
  });

  it('answers false for an empty side', () => {
    expect(needsSpaceBetween('', '世界')).toBe(false);
    expect(needsSpaceBetween('你好', '')).toBe(false);
    expect(needsSpaceBetween('', '')).toBe(false);
  });
});

describe('joinWithSpacing', () => {
  it('spaces both junctions of an interpolation', () => {
    expect(joinWithSpacing(['共有', '42', '个项目'])).toBe('共有 42 个项目');
    expect(joinWithSpacing(['已完成', '80%', '的任务'])).toBe('已完成 80% 的任务');
    expect(joinWithSpacing(['使用', 'GPT-4o', '模型'])).toBe('使用 GPT-4o 模型');
  });

  it('leaves the interpolated run byte-identical', () => {
    const dynamic = '蒸馏/训练';
    const joined = joinWithSpacing(['流程是', dynamic, '两步']);
    // Whole-string formatting reads the interior as `蒸馏 / 训练`, because the
    // slash rule needs both of its sides in view; only the junctions are ours
    // to change, and here both are wide against wide
    expect(joined).toContain(dynamic);
    expect(joined).toBe('流程是蒸馏/训练两步');
  });

  it('spaces the junctions around a run whose interior it cannot touch', () => {
    expect(joinWithSpacing(['共有', 'a/b', '两步'])).toBe('共有 a/b 两步');
  });

  it('judges the junction an empty part leaves behind', () => {
    expect(joinWithSpacing(['你好', '', '世界'])).toBe('你好世界');
    expect(joinWithSpacing(['共有', '', '42'])).toBe('共有 42');
    expect(joinWithSpacing([])).toBe('');
  });

  it('reads a token split across parts with its context', () => {
    expect(joinWithSpacing(['版本 v1', '.2:', '中文说明'])).toBe('版本 v1.2: 中文说明');
  });

  it('is idempotent on copy that is already spaced', () => {
    const spaced = joinWithSpacing(['共有', '42', '个项目']);
    expect(joinWithSpacing([spaced])).toBe(spaced);
    expect(joinWithSpacing(['共有 ', '42', ' 个项目'])).toBe('共有 42 个项目');
  });
});

describe('segmentWithSpacing', () => {
  it('reports which spans came from which part and which spaces it added', () => {
    expect(segmentWithSpacing(['共有', '42', '个项目'])).toEqual([
      { type: 'part', text: '共有', partIndex: 0 },
      { type: 'space', text: ' ' },
      { type: 'part', text: '42', partIndex: 1 },
      { type: 'space', text: ' ' },
      { type: 'part', text: '个项目', partIndex: 2 },
    ]);
  });

  it('keeps the original part index when a part is skipped', () => {
    expect(segmentWithSpacing(['你好', '', 'world'])).toEqual([
      { type: 'part', text: '你好', partIndex: 0 },
      { type: 'space', text: ' ' },
      { type: 'part', text: 'world', partIndex: 2 },
    ]);
  });
});
