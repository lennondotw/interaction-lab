/*
 * Is a junction-only spacer as good as a whole-string one, and what does each
 * get wrong?
 *
 * Measures @monorepo/utils' junction-spacing against pangu.js 9.1.0 on two
 * corpora: an interpolation sweep of Chinese-plus-Latin copy, where pangu is
 * taken as the oracle, and a Unicode corpus where neither is an oracle and the
 * two answers are printed side by side.
 *
 * Needs pangu, which is not a dependency of this repo. It is pinned in this
 * directory's package.json, outside the pnpm workspace:
 *
 *   npm install --prefix archive/2026-08-junction-spacing
 *   node archive/2026-08-junction-spacing/probe.mjs
 *
 * Node runs the TypeScript import directly by stripping types (Node >= 23.6).
 */

import pangu from 'pangu/browser';

import { joinWithSpacing, needsSpaceBetween } from '../../packages/utils/src/junction-spacing.ts';

const PREFIXES = [
  '你好',
  '共有',
  '版本 v1.2:',
  '剩余',
  '文件在',
  '他说',
  '使用',
  '价格',
  '已完成',
  '查看',
  '标签',
  '(',
  '第 3 章',
  'hello',
  'CPU',
  '温度 25',
  '他说：',
  '进度',
  '打开',
  '删除',
  '“',
  '备注',
  'GPT-4o',
  '评分 A+',
  '容量',
];
const MIDDLES = [
  'world',
  '世界',
  '42',
  '5',
  '/usr/local/bin',
  '"hello"',
  'GPT-4o',
  '+100',
  '/训练',
  '80%',
  'Disney+',
  '#tag',
  '中文',
  'src/index.ts',
  'Math.floor(x)',
  '5~10',
  'A+',
  '@vinta',
  '',
  '3.5',
  'iPhone 17',
  '（括号）',
  'x|y',
  '“引用”',
];
const SUFFIXES = [
  '',
  '个项目',
  '分钟',
  '里',
  '很好',
  '模型',
  '元',
  '的任务',
  '会员',
  '。',
  '，请稍候',
  'files',
  ')',
  '第 3 行',
  '”',
  'GB',
];

/*
 * pangu can only be the oracle where its whole-string pass did nothing but
 * insert junction spaces. Where it also rewrote an interior, the two are
 * answering different questions and the combo is counted separately rather
 * than scored.
 */
function oracle(prefix, middle, suffix) {
  const whole = pangu.spacingText(prefix + middle + suffix);
  for (const left of [false, true]) {
    for (const right of [false, true]) {
      if (whole === prefix + (left ? ' ' : '') + middle + (right ? ' ' : '') + suffix) {
        return [left, right];
      }
    }
  }
  return null;
}

let combos = 0;
let decisions = 0;
let agreed = 0;
let interiorRewrite = 0;
const divergences = new Map();

for (const prefix of PREFIXES) {
  for (const middle of MIDDLES) {
    for (const suffix of SUFFIXES) {
      const expected = oracle(prefix, middle, suffix);
      if (expected === null) {
        interiorRewrite += 1;
        continue;
      }
      combos += 1;
      // An empty middle leaves one junction, and which of the two the oracle
      // attributed the space to is arbitrary, so it is scored as one decision
      // between the parts that are actually adjacent.
      const junctions =
        middle === ''
          ? [[prefix, suffix, expected[0] || expected[1]]]
          : [
              [prefix, middle, expected[0]],
              [middle, suffix, expected[1]],
            ];

      for (const [left, right, want] of junctions) {
        decisions += 1;
        const got = needsSpaceBetween(left, right);
        if (got === want) {
          agreed += 1;
          continue;
        }
        /*
         * Grouped by the pair of characters at the junction, which is what
         * decides it — 9k combos collapse to the handful of shapes where the
         * two implementations really differ.
         */
        const key = `${[...left].at(-1) ?? '∅'}|${[...right][0] ?? '∅'}  ours ${got ? 'space' : 'flush'}, pangu ${want ? 'space' : 'flush'}`;
        const seen = divergences.get(key) ?? { count: 0, sample: `${left}⟦${right}` };
        divergences.set(key, { count: seen.count + 1, sample: seen.sample });
      }
    }
  }
}

console.log(`interpolation sweep: ${PREFIXES.length} x ${MIDDLES.length} x ${SUFFIXES.length} combos`);
console.log(`  scored against pangu   ${combos} combos, ${decisions} junction decisions`);
console.log(`  agreed                 ${agreed} (${((100 * agreed) / decisions).toFixed(2)}%)`);
console.log(`  pangu rewrote interior ${interiorRewrite} combos  (out of scope: the dynamic run is not ours to edit)`);
if (divergences.size > 0) {
  console.log('  disagreements by junction:');
  for (const [key, { count, sample }] of [...divergences].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    x${String(count).padStart(4)}  ${key.padEnd(44)} e.g. ${JSON.stringify(sample)}`);
  }
}

const HOSTILE = [
  // Kana and Hangul are wide, and are still left flush: typing the space is a
  // Chinese convention, and Japanese and Korean each have their own answer. See
  // the README's locale section, and junction-spacing's module comment.
  ['한국', 'word', '입니다'],
  ['총', '42', '개'],
  ['오늘은 ', 'Lime', '와 대화'],
  ['PC에서 ', 'Mac', '으로 갈아타기'],
  ['ひらがな', 'ABC', 'です'],
  ['お近くの', 'Apple Store', ''],
  ['', 'Mac', 'を詳しく見る'],
  ['ﾊﾝｶｸ', 'abc', 'ｶﾅ'],
  ['\u{20000}字', 'word', ''],
  ['中文', 'Привет', '世界'],
  ['中文', 'العربية', '结束'],
  ['中文', 'שלום', '结束'],
  ['中文', 'ไทย', '结束'],
  ['咖啡e', '́很香', ''],
  ['点赞👍', '\u{1F3FD}了', ''],
  ['喜欢❤', '️的', ''],
  ['来自🇯', '🇵的用户', ''],
  ['一家👨‍', '👩‍👧', ''],
  ['庆祝', '🎉', '吧'],
  ['航班', '✈', '起飞'],
  ['「引用」', 'quote', ''],
  ['ＡＢＣ', '中文', ''],
  ['中文', '１２３', ''],
  ['中文', '1️⃣', '第一'],
  ['文件在', '/foo/bar', '里'],
  ['文件在', '/usr/bin', '里'],
];

console.log('\nunicode corpus (no oracle: both answers printed)');
for (const [prefix, middle, suffix] of HOSTILE) {
  const input = `${prefix}⟦${middle}⟧${suffix}`;
  const ours = joinWithSpacing([prefix, middle, suffix]);
  const theirs = pangu.spacingText(prefix + middle + suffix);
  const mark = ours === theirs ? '  ' : '≠ ';
  console.log(
    `  ${mark}${JSON.stringify(input).padEnd(30)} ours ${JSON.stringify(ours).padEnd(28)} pangu ${JSON.stringify(theirs)}`
  );
}

const ITERATIONS = 20000;
for (const [label, left, right] of [
  ['plain junction', '共有九十九', '42 个项目'],
  ['grapheme veto', '点赞👍', '\u{1F3FD}了'],
]) {
  const started = process.hrtime.bigint();
  for (let index = 0; index < ITERATIONS; index += 1) {
    needsSpaceBetween(left, right);
  }
  const elapsed = Number(process.hrtime.bigint() - started) / ITERATIONS / 1000;
  console.log(`\nneedsSpaceBetween, ${label}: ${elapsed.toFixed(1)}us/call`);
}

const LONG_TAIL = '他说'.repeat(400);
const started = process.hrtime.bigint();
for (let index = 0; index < ITERATIONS; index += 1) {
  needsSpaceBetween(LONG_TAIL, 'world');
}
console.log(
  `needsSpaceBetween, 800-char left run: ${(Number(process.hrtime.bigint() - started) / ITERATIONS / 1000).toFixed(1)}us/call`
);

const wholeStarted = process.hrtime.bigint();
for (let index = 0; index < ITERATIONS; index += 1) {
  pangu.spacingText(`${LONG_TAIL}world`);
}
console.log(
  `pangu.spacingText, same 800-char string: ${(Number(process.hrtime.bigint() - wholeStarted) / ITERATIONS / 1000).toFixed(1)}us/call`
);
