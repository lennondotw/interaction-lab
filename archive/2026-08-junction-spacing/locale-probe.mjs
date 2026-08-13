/*
 * Who actually types the space, and how wide is the gap if nobody does?
 *
 * Two measurements the locale policy rests on:
 *
 * 1. One publisher's three CJK localisations, counting text nodes that carry a
 *    typed U+0020 at a CJK/Latin boundary against ones that leave it flush. One
 *    publisher rather than a survey, because the point is that a single house
 *    style answers differently per locale — comparing across sites would
 *    confound the locale with the publisher.
 * 2. The gap CSS draws by itself against the gap a typed space draws, so the
 *    cost of inserting a character instead of setting a property is a number.
 *
 * Needs the network and a browser, unlike the sibling probe:
 *
 *   pnpm exec playwright install chromium
 *   node archive/2026-08-junction-spacing/locale-probe.mjs
 */

import { chromium } from 'playwright';

const SITES = [
  { expectation: 'types the space', label: 'apple.com.cn', url: 'https://www.apple.com/cn/' },
  { expectation: 'leaves it flush', label: 'apple.com/jp', url: 'https://www.apple.com/jp/' },
  { expectation: 'spaces words, not particles', label: 'apple.com/kr', url: 'https://www.apple.com/kr/' },
];

// Han, kana and Hangul. Deliberately the naive ranges: this counts what a page
// ships and has nothing to classify.
const CJK_RANGES = '一-鿿぀-ヿ가-힯';

/* Runs in the page, so it takes its ranges as an argument and closes over nothing. */
function countBoundaries(ranges) {
  const spaced = new RegExp(`[${ranges}] [A-Za-z0-9]|[A-Za-z0-9] [${ranges}]`, 'u');
  const flush = new RegExp(`[${ranges}][A-Za-z0-9]|[A-Za-z0-9][${ranges}]`, 'u');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let spacedNodes = 0;
  let flushNodes = 0;
  const spacedSamples = [];
  const flushSamples = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Embedded JSON and CSS are not copy, and a page's bootstrap payload is full
    // of both CJK and Latin.
    const tag = node.parentElement?.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
      continue;
    }
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }
    if (spaced.test(text)) {
      spacedNodes += 1;
      if (spacedSamples.length < 4) spacedSamples.push(text.slice(0, 40));
    } else if (flush.test(text)) {
      flushNodes += 1;
      if (flushSamples.length < 4) flushSamples.push(text.slice(0, 40));
    }
  }

  return {
    lang: document.documentElement.lang,
    spacedNodes,
    flushNodes,
    spacedSamples,
    flushSamples,
    textAutospace: getComputedStyle(document.body).textAutospace,
  };
}

function measureGaps() {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;font:16px system-ui;visibility:hidden;white-space:pre';
  document.body.append(host);

  const width = (text, autospace) => {
    const span = document.createElement('span');
    span.lang = 'zh-Hans';
    span.style.textAutospace = autospace;
    span.textContent = text;
    host.append(span);
    const value = span.getBoundingClientRect().width;
    span.remove();
    return value;
  };

  const initialProbe = document.createElement('span');
  document.body.append(initialProbe);
  const initialValue = getComputedStyle(initialProbe).textAutospace;
  initialProbe.remove();

  const flush = width('中文Lime', 'no-autospace');
  const result = {
    initialValue,
    autospaceGap: width('中文Lime', 'normal') - flush,
    typedGap: width('中文 Lime', 'no-autospace') - flush,
    // Does a typed space stack with the autospace, or suppress it?
    typedGapWithAutospaceOn: width('中文 Lime', 'normal') - flush,
  };
  host.remove();
  return result;
}

const browser = await chromium.launch();
const page = await browser.newPage();

console.log('typed spaces at a CJK/Latin boundary, per localisation of one publisher\n');
for (const site of SITES) {
  await page.goto(site.url, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(countBoundaries, CJK_RANGES);
  console.log(`${site.label}  [lang=${result.lang}]  — ${site.expectation}`);
  console.log(`  nodes with a typed space   ${result.spacedNodes}`);
  console.log(`  nodes left flush           ${result.flushNodes}`);
  console.log(`  computed text-autospace    ${result.textAutospace}`);
  console.log(`  spaced   ${result.spacedSamples.map((sample) => JSON.stringify(sample)).join('  ')}`);
  console.log(`  flush    ${result.flushSamples.map((sample) => JSON.stringify(sample)).join('  ')}\n`);
}

const EM = 16;
const gaps = await page.evaluate(measureGaps);
console.log('the gap itself, at 16px system-ui');
console.log(`  text-autospace initial value   ${gaps.initialValue}`);
console.log(
  `  text-autospace: normal         ${gaps.autospaceGap.toFixed(2)}px = 1/${(EM / gaps.autospaceGap).toFixed(0)} em`
);
console.log(`  typed U+0020                   ${gaps.typedGap.toFixed(2)}px = 1/${(EM / gaps.typedGap).toFixed(0)} em`);
console.log(
  `  typed U+0020, autospace on     ${gaps.typedGapWithAutospaceOn.toFixed(2)}px ${
    gaps.typedGapWithAutospaceOn === gaps.typedGap ? '(suppressed, not stacked)' : '(stacked)'
  }`
);
console.log(`  ratio, typed against autospace ${(gaps.typedGap / gaps.autospaceGap).toFixed(2)}x`);

await browser.close();
