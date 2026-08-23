// How tall is a drum, and does its box fit it?
//
//   pnpm exec playwright install chromium               # once
//   pnpm --filter @monorepo/lab dev                     # STORYBOOK_URL to override the port
//   node archive/2026-08-drum-cylinder-height/probe.mjs
//
// The flat wheel's box is `itemHeight * rows`, because a flat row is `itemHeight` tall and
// there are `rows` of them. A drum's rows are set around an axis instead, so its height is
// a property of the cylinder and has nothing to do with the row count — and the component
// used the same expression for both, which is the thing this measures.
//
// It drives the real `Components/TimeWheelPicker` stories through their args rather than a
// copy, because the claim is about our own layering and must not be able to drift from it.
//
// A drum's rows are flat rectangles, not arcs, so in cross-section it is a PRISM: the rows
// are its faces, meeting at edges. A prism lies between two cylinders and both matter:
//
//   inscribed     radius `r`, the apothem — where `translateZ(r)` puts each row's centre
//   circumscribed radius `hypot(r, itemHeight/2)` — through the rows' corners, which is
//                 the surface the edges sweep as the wheel turns
//
// A third height exists, the prism's extent at rest, and it is the wrong one to build on
// because it depends on the rotation phase. Phase `wobble` measures how much: sampled
// while turning, the extent moves, and its maximum is above its value at rest — so a box
// measured at a detent clips during a scroll.
//
//   fit      Positive slack is padding between the box and the drum; negative is a clip.
//   model    The closed form, `2 · R · P / (P + r)`. It is what the component computes.
//   measured `getBoundingClientRect` over every rendered row. It reads a little high on a
//            3D-transformed quad, so treat a gap of a percent or two as the instrument.

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const ITEM_HEIGHT = 40;
const PERSPECTIVE = 900;

/** The closed form the component ships. `fit: 'inner'` gives the inscribed cylinder. */
const drumHeight = ({ itemHeight, anglePerItem, perspective = PERSPECTIVE, fit = 'outer' }) => {
  const apothem = itemHeight / ((anglePerItem * Math.PI) / 180);
  const radius = fit === 'inner' ? apothem : Math.hypot(apothem, itemHeight / 2);
  return 2 * radius * (perspective / (perspective + apothem));
};

const story = (id, args = {}) => {
  const query = Object.entries(args)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
  return `${STORYBOOK}/iframe.html?id=${id}&viewMode=story${query === '' ? '' : `&args=${query}`}`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const geometry = () =>
  page.evaluate(() => {
    const column = document.querySelector('[aria-label="Hour"]');
    const box = column.getBoundingClientRect();
    const rows = [...column.querySelectorAll(':scope > div')].map((row) => ({
      rect: row.getBoundingClientRect(),
      opacity: Number(getComputedStyle(row).opacity),
    }));
    const top = Math.min(...rows.map((row) => row.rect.top));
    const bottom = Math.max(...rows.map((row) => row.rect.bottom));
    return {
      box: box.height,
      extent: bottom - top,
      slackTop: top - box.top,
      slackBottom: box.bottom - bottom,
      visible: rows.filter((row) => row.opacity > 0.02).length,
      rendered: rows.length,
    };
  });

// The DrumHeight story names its columns after their case, so the selector to wait on
// differs; every other story has a plain `Hour`.
const open = async (url, selector = '[aria-label="Hour"]') => {
  await page.goto(url);
  await page.locator(selector).first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(1500);
};

// ── Phase A: the angle alone changes the drum's height by 4x ──────────────────────────
console.log('\nA · the drum sizes itself; the angle is the only input\n');
console.log('  angle   model   inner   measured   box   slack   rows');
console.log('  -----   -----   -----   --------   ---   -----   ----');
for (const anglePerItem of [8, 10, 14, 20, 28, 34, 40]) {
  await open(story('components-timewheelpicker--drum', { anglePerItem }));
  const seen = await geometry();
  const model = drumHeight({ itemHeight: ITEM_HEIGHT, anglePerItem });
  const inner = drumHeight({ itemHeight: ITEM_HEIGHT, anglePerItem, fit: 'inner' });
  console.log(
    `  ${String(anglePerItem).padStart(5)}   ${model.toFixed(1).padStart(5)}   ${inner.toFixed(1).padStart(5)}   ` +
      `${seen.extent.toFixed(1).padStart(8)}   ${seen.box.toFixed(0).padStart(3)}   ` +
      `${seen.slackTop.toFixed(1).padStart(5)}   ${String(seen.visible).padStart(4)}`
  );
}

// ── Phase B: overriding the box ───────────────────────────────────────────────────────
console.log('\nB · overriding the height: larger is padding, smaller is a clip\n');
console.log('  case            box   drum    slack   reading');
console.log('  ------------   ----   ----   ------   -------');
await open(story('components-timewheelpicker--drum-height'), '[role="spinbutton"]');
const cases = await page.evaluate(() =>
  [...document.querySelectorAll('[role="spinbutton"]')].map((column) => {
    const box = column.getBoundingClientRect();
    const rows = [...column.querySelectorAll(':scope > div')].map((row) => row.getBoundingClientRect());
    const top = Math.min(...rows.map((row) => row.top));
    const bottom = Math.max(...rows.map((row) => row.bottom));
    return {
      label: (column.getAttribute('aria-label') ?? '').replace('Hour ', ''),
      box: box.height,
      extent: bottom - top,
      slack: top - box.top,
    };
  })
);
for (const seen of cases) {
  const reading = seen.slack > 1 ? 'padded' : seen.slack < -1 ? 'clipped' : 'exact fit';
  console.log(
    `  ${seen.label.padEnd(12)}   ${seen.box.toFixed(0).padStart(4)}   ${seen.extent.toFixed(0).padStart(4)}   ` +
      `${seen.slack.toFixed(1).padStart(6)}   ${reading}`
  );
}

// ── Phase C: the prism wobbles, so a height read at rest is the wrong one ─────────────
console.log('\nC · the extent while turning, against its value at rest\n');
await open(story('components-timewheelpicker--drum'));
const atRest = (await geometry()).extent;
const box = await page.locator('[aria-label="Hour"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const samples = [];
for (let step = 0; step < 60; step++) {
  await page.mouse.wheel(0, 4);
  samples.push((await geometry()).extent);
}
const min = Math.min(...samples);
const max = Math.max(...samples);
console.log(`  at rest        ${atRest.toFixed(2)}`);
console.log(`  turning min    ${min.toFixed(2)}`);
console.log(`  turning max    ${max.toFixed(2)}`);
console.log(`  wobble         ${(max - min).toFixed(2)}`);
console.log(`  over rest by   ${(max - atRest).toFixed(2)}  <- a box measured at a detent clips here`);

await browser.close();

console.log(`
The circumscribed cylinder is what the component uses, because it is rotation-invariant and
cannot clip. The inscribed one is 1.5% shorter at the defaults, which is why the choice
between them is not a design decision — whereas a box of \`itemHeight * rows\` on a drum was:
at 8° it cut the drum in half, at 40° it left 43px of dead space on each side.
`);
