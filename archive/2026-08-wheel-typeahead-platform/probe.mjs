// What does the platform already do when you type into a picker?
//
//   pnpm exec playwright install chromium               # once
//   node archive/2026-08-wheel-typeahead-platform/probe.mjs
//
// A wheel that has focus and receives a character has to do something with it, and there
// are two established answers to copy from rather than invent. `<select>` accumulates
// characters and matches a label prefix. `<input type="time">` accumulates digits into a
// value. They are not variations on one behaviour — they disagree about what a buffer is,
// when it ends, and what a repeated key means — so the question is what each actually
// does, precisely enough to reimplement.
//
// This probe builds its own pages rather than driving our stories, because the subject
// *is* the platform. Everything measured here is Chromium's own widget.
//
// Two things make a naive probe lie, and both cost a round of wrong answers:
//
//   `.value` on a time input stays empty until every segment is filled, so typing one
//   digit into a fresh input shows nothing at all. Seeding a complete value first makes
//   each keystroke observable.
//
//   A timeout test needs a list *and a starting position* where "buffer alive" and
//   "buffer expired" give different answers. `m` then `a` on a list holding `March`
//   lands on March either way and says nothing at all. `m` then `o` separates them —
//   but only when the selection starts on Monday, so that `m` cycles past it to March
//   and the `o` has somewhere different to go. Both versions of this test measured
//   nothing before they measured anything.
//
// Chromium renders `<input type="time">` in the format of the *browser* locale and
// ignores the element's `lang`, so on a 24-hour machine there is no meridiem segment and
// the `a`/`p` behaviour cannot be reached at all. The probe reports which shape it got
// rather than pretending otherwise; the AM/PM half of the design rests on `<select>`.

import { chromium } from 'playwright';

const rows = [];
const record = (subject, sequence, observed, note = '') => rows.push({ subject, sequence, observed, note });

const table = (title, only) => {
  const picked = rows.filter((row) => row.subject === only);
  const width = (key, header) => Math.max(header.length, ...picked.map((row) => String(row[key]).length));
  const keysWidth = width('sequence', 'keys');
  const resultWidth = width('observed', 'result');
  console.log(`\n${title}\n`);
  console.log(`  ${'keys'.padEnd(keysWidth)}  ${'result'.padEnd(resultWidth)}  note`);
  console.log(`  ${'-'.repeat(keysWidth)}  ${'-'.repeat(resultWidth)}  ----`);
  for (const row of picked) {
    console.log(`  ${row.sequence.padEnd(keysWidth)}  ${String(row.observed).padEnd(resultWidth)}  ${row.note}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();

// ── <input type="time">: digits accumulate into a value ───────────────────────────────
await page.setContent('<input id="t" type="time">');

const timeShape = await page.evaluate(() => {
  const el = document.getElementById('t');
  el.value = '13:05';
  return el.value === '13:05' ? '24-hour (accepts hour 13, no meridiem segment)' : '12-hour';
});

const typeTime = async (keys, { seed = '05:30', pauseBefore = 0 } = {}) => {
  await page.evaluate((value) => {
    const el = document.getElementById('t');
    el.blur();
    el.value = value;
  }, seed);
  await page.evaluate(() => document.getElementById('t').focus());
  const pressed = [...keys];
  for (const [at, key] of pressed.entries()) {
    if (pauseBefore > 0 && at === pressed.length - 1) await page.waitForTimeout(pauseBefore);
    await page.keyboard.press(key);
  }
  return page.evaluate(() => document.getElementById('t').value);
};

record('time', '1 2', await typeTime('12'), 'accumulates — twelve, not two');
record('time', '1 5', await typeTime('15'), 'two digits still accumulate');
record('time', '0 9', await typeTime('09'), 'a leading zero is held, not rejected');
record('time', '9 4', await typeTime('94'), '9 cannot extend, so the 4 lands in the MINUTES');
record('time', '> 5 9', await typeTime(['ArrowRight', '5', '9']), 'minutes accumulate too');
record('time', '> 6 5', await typeTime(['ArrowRight', '6', '5']), 'terminal segment CLAMPS, having nowhere to advance');
record('time', '> 9 9', await typeTime(['ArrowRight', '9', '9']), 'same clamp');
record('time', '> 3 7 2', await typeTime(['ArrowRight', '3', '7', '2']), 'third digit clamps to the maximum');
record('time', '1 wait2000 2', await typeTime('12', { pauseBefore: 2000 }), 'NO idle timeout — still twelve');
record('time', '1 up 2', await typeTime(['1', 'ArrowUp', '2']), 'an arrow key closes the buffer');
record('time', '1 > < 2', await typeTime(['1', 'ArrowRight', 'ArrowLeft', '2']), 'leaving the segment closes it');
record('time', '1 backspace', `"${await typeTime(['1', 'Backspace'])}"`, 'clears the WHOLE value, not the buffer');

// ── <select>: characters accumulate into a label prefix ───────────────────────────────
// `TTY` and `TTX` are here for the one case where the two halves of prefix typeahead
// disagree: is `tt` a repeat to cycle on, or the prefix `TT`?
const OPTIONS = [
  'Alpha',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'March',
  'TTY',
  'TTX',
];
await page.setContent(`<select id="s">${OPTIONS.map((option) => `<option>${option}</option>`).join('')}</select>`);

const typeSelect = async (keys, { pauseBefore = 0, from = 0 } = {}) => {
  await page.evaluate((index) => {
    const el = document.getElementById('s');
    el.blur();
    el.selectedIndex = index;
    el.focus();
  }, from);
  const pressed = [...keys];
  for (const [at, key] of pressed.entries()) {
    if (pauseBefore > 0 && at === pressed.length - 1) await page.waitForTimeout(pauseBefore);
    await page.keyboard.press(key);
  }
  return page.evaluate(() => document.getElementById('s').value);
};

record('select', 't', await typeSelect('t'), '');
record('select', 't t', await typeSelect('tt'), 'a repeat CYCLES — it is not read as the prefix "tt"');
record('select', 't t t', await typeSelect('ttt'), '');
record('select', 't t t t', await typeSelect('tttt'), '');
record('select', 't t t t t', await typeSelect('ttttt'), 'and wraps round');
record('select', 't h', await typeSelect('th'), 'two DIFFERENT characters are a prefix');
record('select', 'm o', await typeSelect('mo'), '');
record('select', 's u', await typeSelect('su'), '');
record('select', 't t y', await typeSelect('tty'), 'a third character breaks the repeat, reaching TTY');
record('select', 't t x', await typeSelect('ttx'), 'so a TT label is not stranded, only unreachable at "tt"');
record('select', 't h h', await typeSelect('thh'), 'no match: the key is ignored, nothing moves');
record('select', 'z', await typeSelect('z'), 'no match');

// Starting *on* Monday is what makes this discriminate. Cycling searches from the item
// after the current one, so `m` skips Monday and lands on March; then `o` either extends
// the buffer to "mo" and reaches Monday, or arrives alone, matches nothing and stays on
// March. Start anywhere else and `m` lands on Monday directly, both outcomes are Monday,
// and the test silently measures nothing — which is how the first version of it lied.
const MONDAY = OPTIONS.indexOf('Monday');
record('select', 'm (from Monday)', await typeSelect('m', { from: MONDAY }), 'cycles past Monday to March');
for (const pause of [0, 400, 800, 1000, 1600, 2500]) {
  const landed = await typeSelect('mo', { pauseBefore: pause, from: MONDAY });
  record('select', `m wait${pause} o`, landed, landed === 'Monday' ? 'buffer alive' : 'buffer EXPIRED');
}

await browser.close();

console.log(`\n<input type="time"> in this browser: ${timeShape}`);
table('<input type="time"> — digits accumulate into a value', 'time');
table('<select> — characters accumulate into a label prefix', 'select');

console.log(`
                  time segment                    select
  ------------  ------------------------------  ------------------------------
  buffer        a number, two digits wide       a string, unbounded
  match         exact value                     label prefix, case-insensitive
  repeated key  n/a, digits accumulate          cycles the matches, wrapping
  idle timeout  none                            ~1000ms
  ends when     no digit could extend it        the clock runs out
  on ending     focus moves to the next field   nothing; there is no next field

The timeout is not a tuning choice on either side. A time segment is two digits wide and
closes itself the moment no digit could extend it, so it is self-limiting and needs no
clock. A prefix buffer has no width bound, so a clock is the only thing that can end it.
`);
