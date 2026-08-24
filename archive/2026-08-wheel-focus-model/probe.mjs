// How does the platform hand focus around inside a segmented picker?
//
//   pnpm exec playwright install chromium               # once
//   node archive/2026-08-wheel-focus-model/probe.mjs
//
// Two questions about our wheel picker's keyboard, both about focus rather than value:
// whether the component should trap focus, and whether Left/Right should mean anything.
// Neither is answerable from the ARIA patterns alone — `spinbutton` says nothing about
// siblings, and `group` is not a composite widget, so the specs permit either answer. So
// ask the thing our time picker was told to align with: `<input type="time">`.
//
// The whole subject is *where focus is*, and the one thing this platform will not tell you
// is where focus is. A time input's segments live in its shadow DOM; `document.activeElement`
// is the `<input>` no matter which segment is lit. So every reading here is indirect —
// press a key, then press ArrowUp, and see which half of `.value` moved. That indirection
// is the probe.
//
// Traps, in the order they cost a wrong answer:
//
//   `.value` is empty until every segment is filled — inherited from this probe's sibling,
//   `2026-08-wheel-typeahead-platform`. Seed a complete value or nothing is observable.
//
//   Counting Tab presses tells you how many stops are inside the input, but not what they
//   are. A 24-hour locale has two segments and three stops: the extra one is the clock
//   icon Chromium draws inside the field. It is only distinguishable from a third segment
//   by two further readings — ArrowUp on it moves nothing, and ArrowRight from the minutes
//   refuses to reach it.
//
//   The `<select>` half does not work at all, and the interesting part is how convincingly
//   it doesn't. Arrow, Home, End and PageDown on a closed select all report "value
//   unchanged", which reads exactly like a finding — "a select ignores them" — and it was
//   written up that way once. It is not a finding. Pressing Enter afterwards, to commit
//   whatever a popup might have highlighted, also changes nothing, while a *letter* key
//   lands in place on the same element in the same run. So the keys are not being ignored;
//   they are going somewhere this probe cannot see, and headless does not help. Whatever
//   `<select>` does with Home/End on macOS, it is out of reach here, and the design must
//   not lean on a number this probe cannot produce.
//
// Which leaves the deliberate asymmetry in what follows: the time input is measured, the
// select is a hole. That is the honest shape of the evidence.

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

// ── <input type="time">: one element, several stops inside it ──────────────────────────
const SEED = '09:41';

await page.setContent(`
  <button id="before">before</button>
  <input id="t" type="time" value="${SEED}">
  <button id="after">after</button>
`);

const timeShape = await page.evaluate(() => {
  const el = document.getElementById('t');
  el.value = '13:05';
  return el.value === '13:05' ? '24-hour (two segments, no meridiem)' : '12-hour (three segments)';
});

const seed = () =>
  page.evaluate((value) => {
    const el = document.getElementById('t');
    el.blur();
    el.value = value;
    el.focus();
  }, SEED);

/** Which segment the keys left focused, read by nudging it and seeing what moved. */
const segmentAfter = async (keys) => {
  await seed();
  for (const key of keys) await page.keyboard.press(key);
  await page.keyboard.press('ArrowUp');
  const value = await page.evaluate(() => document.getElementById('t').value);
  if (value === SEED) return 'nothing moved';
  const [hour, minute] = value.split(':');
  return hour === '09' ? `minutes (${value})` : `hours (${value})`;
};

/** How many Tab presses the input keeps for itself before focus leaves it. */
const stopsInside = await (async () => {
  await seed();
  for (let pressed = 1; pressed <= 8; pressed++) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.id ?? null);
    if (active !== 't') return `${pressed - 1} more stop(s) inside, then "${active}"`;
  }
  return 'never left in 8 presses';
})();

record('time', '(focus)', await segmentAfter([]), 'the hours are where focus lands');
record('time', 'Tab', await segmentAfter(['Tab']), 'Tab does NOT leave — it steps to the next segment');
record('time', 'Tab Tab', await segmentAfter(['Tab', 'Tab']), 'a third stop that no arrow can change: the clock icon');
record('time', 'Tab x3', stopsInside, 'so the whole field is ONE stop from the outside');
record(
  'time',
  'Right',
  await segmentAfter(['ArrowRight']),
  'Left/Right step segments too — two ways to the same place'
);
record('time', 'Right Right', await segmentAfter(['ArrowRight', 'ArrowRight']), 'CLAMPS at the last segment, no wrap');
record('time', 'Right x3', await segmentAfter(['ArrowRight', 'ArrowRight', 'ArrowRight']), 'still clamped');
record('time', 'Left', await segmentAfter(['ArrowLeft']), 'clamps at the first segment as well');
record('time', 'Shift+Tab', await segmentAfter(['ArrowRight', 'Shift+Tab']), 'reverse steps back through the segments');

const valueAfter = async (keys) => {
  await seed();
  for (const key of keys) await page.keyboard.press(key);
  const value = await page.evaluate(() => document.getElementById('t').value);
  return value === SEED ? `unchanged (${value})` : value;
};

record('time-value', 'Up', await valueAfter(['ArrowUp']), 'the focused segment increments');
record('time-value', 'Home', await valueAfter(['Home']), 'nothing at all');
record('time-value', 'End', await valueAfter(['End']), 'nothing at all');
record('time-value', 'PageUp', await valueAfter(['PageUp']), 'nothing at all');
record('time-value', 'PageDown', await valueAfter(['PageDown']), 'nothing at all');

// ── <select>: the same keys, on the other reference widget ─────────────────────────────
// Only meaningful headless. See the header.
const OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START = 'Wednesday';

await page.setContent(`
  <button id="before">before</button>
  <select id="s">${OPTIONS.map((o) => `<option${o === START ? ' selected' : ''}>${o}</option>`).join('')}</select>
  <button id="after">after</button>
`);

const selectAfter = async (keys) => {
  await page.evaluate((value) => {
    const el = document.getElementById('s');
    el.blur();
    el.value = value;
    el.focus();
  }, START);
  for (const key of keys) await page.keyboard.press(key);
  const { value, active } = await page.evaluate(() => ({
    value: document.getElementById('s').value,
    active: document.activeElement?.id ?? null,
  }));
  return active === 's' ? (value === START ? `unchanged (${value})` : value) : `focus left to "${active}"`;
};

record(
  'select',
  'Down',
  await selectAfter(['ArrowDown']),
  'not "ignored" — see the second table before believing this'
);
record('select', 'Home', await selectAfter(['Home']), 'likewise');
record('select', 'End', await selectAfter(['End']), 'likewise');
record('select', 'PageDown', await selectAfter(['PageDown']), 'likewise');
record('select', 'Left', await selectAfter(['ArrowLeft']), 'likewise');
record('select', 'Right', await selectAfter(['ArrowRight']), 'likewise');
record('select', 'Tab', await selectAfter(['Tab']), 'one stop, and Tab leaves at once — this row IS real');
record(
  'select',
  't',
  await selectAfter(['t']),
  'a LETTER lands in place, so the element does have focus and does listen'
);

// Every arrow row above says "unchanged", which is also what a probe that measured nothing
// looks like. `Enter` afterwards separates the two: if the key had opened a popup and moved
// a highlight, Enter would commit it. Nothing commits either — so the keys are not ignored
// and not landing in a reachable popup. They are somewhere this probe cannot see.
record('select-enter', 'Down Enter', await selectAfter(['ArrowDown', 'Enter']), 'nothing to commit');
record('select-enter', 'Up Enter', await selectAfter(['ArrowUp', 'Enter']), 'nothing to commit');
record('select-enter', 'Home Enter', await selectAfter(['Home', 'Enter']), 'nothing to commit');
record('select-enter', 'End Enter', await selectAfter(['End', 'Enter']), 'nothing to commit');
record('select-enter', 'Left Enter', await selectAfter(['ArrowLeft', 'Enter']), 'nothing to commit');
record(
  'select-enter',
  't Enter',
  await selectAfter(['t', 'Enter']),
  'the control: a letter still commits, so Enter works'
);

console.log(`\n<input type="time"> rendered as: ${timeShape}`);
console.log("(Chromium follows the browser locale here and ignores the element's lang.)");
table('<input type="time"> — where focus goes', 'time');
table('<input type="time"> — what the other keys do', 'time-value');
table('<select> — the same keys, and what they commit', 'select');
table('<select> — with Enter, to tell "ignored" apart from "moved out of sight"', 'select-enter');
console.log(
  '\nThe select tables are a hole, not a result. A letter key lands and commits on the same\n' +
    'element in the same run, so focus and Enter both work; the arrows and Home/End go\n' +
    'somewhere synthesised keys cannot follow on macOS, headless or not. Nothing in the\n' +
    'design should rest on them — the time input above is the reference that measured.\n'
);

await browser.close();
