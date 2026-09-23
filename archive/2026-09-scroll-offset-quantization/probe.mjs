/**
 * Where does anchored content land on screen when the scroll offset it needs is fractional?
 *
 * Browser probe: needs `pnpm exec playwright install chromium`, and opens windows.
 *
 *   node archive/2026-09-scroll-offset-quantization/probe.mjs            # every target below
 *   node archive/2026-09-scroll-offset-quantization/probe.mjs chromium   # or just one
 *   node archive/2026-09-scroll-offset-quantization/probe.mjs safari
 *   node archive/2026-09-scroll-offset-quantization/probe.mjs ios
 *
 * - chromium runs headed, because headless Chromium snaps scroll offsets to whole CSS pixels
 *   while a headed one snaps them to the screen's device pixels (0.5px on a 2x display), and
 *   the headed behaviour is the one users get. It runs at several emulated device scale
 *   factors, which change layout and paint but not that scroll step: they are the cases where
 *   the scroll step is not a whole number of device pixels.
 * - safari drives macOS Safari through `safaridriver` over plain WebDriver HTTP. It needs
 *   "Allow Remote Automation" in Safari's Developer settings, and Safari takes one WebDriver
 *   session at a time, so stop any other (a `safaridriver --mcp`, say) first. SAFARIDRIVER
 *   picks the binary: `/usr/bin/safaridriver` by default, or Safari Technology Preview's at
 *   `/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver`.
 * - ios drives Safari in a booted iOS Simulator through the same `safaridriver`. IOS_SIMULATOR
 *   is the simulator's UDID (`xcrun simctl list devices booted`); without it the target is
 *   skipped. Xcode's DeviceHub shows the simulator while it runs.
 *
 * The page is built here, not taken from a story: the question is what the platform does
 * with a scroll offset and a sub-pixel layout offset, and our list would only sit between the
 * measurement and the thing measured.
 *
 * It lays out small scrollers, wrapped to the viewport's width, all rendered at once. Each
 * group of 24 is one presentation; within a group, each scroller is one state of a row above
 * the anchor whose height changes (a raised cosine, fractional on purpose). Every scroller asks
 * for the same thing: the anchor row's top edge 50.37px below the scroller's top.
 *
 *   direct      write the fractional offset to scrollTop and let the browser snap it
 *               (what the playground did when this was measured)
 *   spacer      scrollTop = the offset rounded up to a grid, and a top spacer of the remainder
 *   translate   the same scrollTop, and translateY(remainder) on the content instead
 *
 * The spacer and translate groups run twice: on the browser's own scroll step, and on the
 * smallest multiple of it that is also a whole number of device pixels.
 *
 * A phone's screenshot is of the whole screen, with the page below the status bar, so a red
 * marker fixed at the viewport's top-left corner locates the page in every shot. Where the
 * scrollers do not fit (a phone), the page is scrolled and shot again until every scroller has
 * been seen whole. Each shot is decoded in a
 * Chromium page against the positions the browser under test reported for that shot. For each
 * scroller the probe finds the rows of device pixels with ink in a band across the anchor,
 * groups them into the anchor's top border, a 4px bar and a line of text, and reports each
 * one's first inked row relative to the scroller's own top border. A presentation that holds
 * the anchor still paints each of them on the same device pixel in all 24 states.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import { chromium } from 'playwright';

const only = process.argv[2];
const runs = (target) => only === undefined || only === target;
const SHOTS = new URL('__screenshots__/', import.meta.url);
const STATES = 24;
const GROUPS = [
  { mode: 'direct', grid: null },
  { mode: 'spacer', grid: 'browser' },
  { mode: 'translate', grid: 'browser' },
  { mode: 'spacer', grid: 'aligned' },
  { mode: 'translate', grid: 'aligned' },
];
const VIEWPORT = { width: 1200, height: 780 };

const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>scroll offset quantization</title>
<style>
  body { margin: 0; background: #fff; font-family: -apple-system, system-ui, sans-serif; }
  .scroller { position: absolute; width: 40px; height: 120px; overflow-y: scroll; overflow-anchor: none;
    border-top: 1px solid #000; scrollbar-width: none; background: #fff; }
  .scroller::-webkit-scrollbar { display: none; }
  .row { height: 57.3px; }
  .anchor { border-top: 1px solid #000; }
  .bar { height: 4px; background: #000; margin: 6px 4px 0; }
  .text { font-size: 16px; line-height: 20px; color: #000; margin-top: 4px; text-align: center; }
  /* The viewport's top-left corner, found in the screenshot: a phone's shot is of the whole
     screen, with the page below the status bar. */
  #origin { position: fixed; left: 0; top: 0; width: 4px; height: 4px; background: #f00; }
</style></head>
<body>
<div id="origin"></div>
<script>
const GROUPS = ${JSON.stringify(GROUPS)};
const STATES = ${STATES};
const TARGET = 50.37;
const above = (i) => 16 + (160 * (1 - Math.cos((2 * Math.PI * i) / 23.7))) / 2 + 0.123;
const perRow = Math.max(1, Math.floor((innerWidth - 16) / 48));
const cells = [];
GROUPS.forEach((group, g) => {
  for (let i = 0; i < STATES; i++) {
    const k = g * STATES + i;
    const scroller = document.createElement('div');
    scroller.className = 'scroller';
    scroller.style.left = (8 + (k % perRow) * 48) + 'px';
    scroller.style.top = (8 + Math.floor(k / perRow) * 150) + 'px';
    scroller.innerHTML = '<div class="content"><div class="spacer"></div><div class="above"></div>' +
      '<div class="row"></div>'.repeat(5) +
      '<div class="anchor"><div class="bar"></div><div class="text">H</div></div><div style="height:3000px"></div></div>';
    document.body.appendChild(scroller);
    cells.push({ ...group, g, i, scroller });
  }
});
document.body.style.height = (Math.ceil(cells.length / perRow) * 150 + 16) + 'px';

/** The browser's scroll step: write every 1/64 between two pixels, and see what comes back. */
function scrollStep() {
  const s = cells[0].scroller;
  const reads = new Set();
  for (let k = 0; k < 64; k++) { s.scrollTop = 100 + k / 64; reads.add(+(s.scrollTop - 100).toFixed(6)); }
  s.scrollTop = 0;
  const sorted = [...reads].sort((a, b) => a - b);
  return sorted.length > 1 ? sorted[1] - sorted[0] : 1;
}

/** The smallest multiple of the scroll step that is a whole number of device pixels. */
function alignedStep(step, dpr) {
  for (let k = 1; k <= 64; k++) if (Math.abs(k * step * dpr - Math.round(k * step * dpr)) < 1e-6) return k * step;
  throw new Error('no aligned step within 64 scroll steps');
}

window.run = () => {
  const dpr = devicePixelRatio;
  const step = scrollStep();
  const aligned = alignedStep(step, dpr);
  const quantization = GROUPS.map(() => 0);
  for (const cell of cells) {
    const content = cell.scroller.firstElementChild;
    const h = above(cell.i);
    content.querySelector('.above').style.height = h + 'px';
    const reading = h + 5 * 57.3 - TARGET; // the offset the anchor asks for, in content coordinates
    let p = 0;
    if (cell.mode === 'direct') {
      if (Math.round(reading * dpr) !== Math.round(cell.scroller.scrollTop * dpr)) cell.scroller.scrollTop = reading;
    } else {
      const grid = cell.grid === 'aligned' ? aligned : step;
      const top = Math.ceil(reading / grid - 1e-9) * grid;
      p = top - reading;
      if (cell.mode === 'spacer') content.querySelector('.spacer').style.height = p + 'px';
      else content.style.transform = 'translateY(' + p + 'px)';
      cell.scroller.scrollTop = top;
    }
    quantization[cell.g] = Math.max(quantization[cell.g], Math.abs(cell.scroller.scrollTop - p - reading));
  }
  return { dpr, step, aligned, quantization };
};

/** Scroller positions in the viewport now, for the shot about to be taken. */
window.layout = () => ({
  width: innerWidth,
  height: innerHeight,
  cells: cells.map(({ g, i, scroller }) => {
    const b = scroller.getBoundingClientRect();
    return { g, i, x: b.left, y: b.top, h: b.height };
  }),
});

/** Ink regions per scroller, in device pixels relative to the scroller's top border. */
window.analyze = async (url, layout) => {
  const img = new Image(); img.src = url; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
  const scale = img.width / layout.width;
  // Where the viewport's top-left corner is in the image: the first pure red pixel.
  const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
  let origin = null;
  for (let o = 0; o < pixels.length && origin === null; o += 4) {
    if (pixels[o] > 240 && pixels[o + 1] < 16 && pixels[o + 2] < 16) {
      const at = o / 4;
      origin = { x: at % img.width, y: Math.floor(at / img.width) };
    }
  }
  if (origin === null) throw new Error('viewport origin marker not found in the screenshot');
  return layout.cells
    .filter((cell) => cell.y >= 4 && cell.y + cell.h <= layout.height)
    .map((cell) => {
      const x0 = origin.x + Math.round((cell.x + 12) * scale), x1 = origin.x + Math.round((cell.x + 28) * scale);
      const y0 = origin.y + Math.round((cell.y - 3) * scale), y1 = origin.y + Math.round((cell.y + cell.h) * scale);
      const w = x1 - x0;
      const data = ctx.getImageData(x0, y0, w, y1 - y0).data;
      const regions = [];
      let current = null;
      for (let y = 0; y < y1 - y0; y++) {
        let ink = 0;
        for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; ink += 255 - (data[o] + data[o + 1] + data[o + 2]) / 3; }
        ink /= w * 255;
        if (ink > 0.02) {
          if (!current) regions.push((current = { top: y, mass: 0, moment: 0 }));
          current.mass += ink; current.moment += ink * y;
        } else current = null;
      }
      const [ref, border, bar, text] = regions;
      const rel = (region) => region && { top: region.top - ref.top, soft: !Number.isInteger(+(region.moment / region.mass).toFixed(3)) };
      return { g: cell.g, i: cell.i, border: rel(border), bar: rel(bar), text: rel(text) };
    });
};
</script>
</body></html>`;

const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page));
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: false });
// Every screenshot, from any browser, is decoded here.
const decoder = await browser.newPage({ viewport: VIEWPORT });
await decoder.goto(url);

function report(label, run, cells) {
  console.log(`\n${label}: scroll step ${run.step}px, device-aligned step ${run.aligned}px (DPR ${run.dpr})`);
  console.log('| presentation | grid | max quantization | border px | bar px | text px | soft borders | seen |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  GROUPS.forEach((group, g) => {
    const mine = cells.filter((c) => c.g === g);
    const positions = (part) => [...new Set(mine.map((c) => c[part]?.top))].sort((a, b) => a - b).join(', ');
    const grid = group.grid === null ? '—' : group.grid === 'aligned' ? `${run.aligned}px` : `${run.step}px`;
    console.log(
      `| ${group.mode} | ${grid} | ${run.quantization[g].toFixed(3)}px | ${positions('border')} | ${positions('bar')} | ${positions('text')} | ${mine.filter((c) => c.border?.soft).length} | ${mine.length} |`
    );
  });
}

/**
 * Run the page in one browser and report on it. `browse` holds that browser's three
 * operations: evaluate an expression, wait two frames, and take a viewport screenshot.
 */
/** `firstShot` names the file the first screenshot is kept as, or null to keep none. */
async function measure(label, browse, firstShot) {
  const run = await browse.evaluate('window.run()');
  await browse.settle();
  const seen = new Map();
  for (let shot = 0; ; shot++) {
    const layout = await browse.evaluate('window.layout()');
    const png = await browse.screenshot();
    if (shot === 0 && firstShot !== null) await writeFile(new URL(firstShot, SHOTS), png);
    const cells = await decoder.evaluate(
      ([src, frame]) => window.analyze(src, frame),
      [`data:image/png;base64,${png.toString('base64')}`, layout]
    );
    for (const cell of cells) seen.set(`${cell.g}:${cell.i}`, cell);
    if (seen.size === GROUPS.length * STATES) break;
    if (shot > 20) throw new Error(`${label}: saw ${seen.size} scrollers after ${shot + 1} shots`);
    await browse.evaluate('(window.scrollBy(0, innerHeight - 160), 0)');
    await browse.settle();
  }
  report(label, run, [...seen.values()]);
}

/** A browser behind `safaridriver`, spoken to over WebDriver HTTP. */
async function withSafari(capabilities, use) {
  const binary = process.env.SAFARIDRIVER ?? '/usr/bin/safaridriver';
  // Let the system pick a free port; a guessed one can belong to some other local server.
  const port = await new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
  const driver = spawn(binary, ['--port', String(port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
    return json.value;
  };
  try {
    // The driver takes a moment to listen; poll its status endpoint rather than guess.
    for (let waited = 0; ; waited += 250) {
      const ready = await fetch(`${base}/status`).then(
        async (response) => response.ok && (await response.json()).value?.ready === true,
        () => false
      );
      if (ready) break;
      if (waited > 20_000) throw new Error(`${binary} did not start listening on port ${port}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const session = await call('POST', '/session', { capabilities: { alwaysMatch: capabilities } });
    const id = session.sessionId;
    try {
      await use({
        session: session.capabilities,
        call: (method, path, body) => call(method, `/session/${id}${path}`, body),
        evaluate: (expression) =>
          call('POST', `/session/${id}/execute/sync`, { script: `return ${expression}`, args: [] }),
        settle: () =>
          call('POST', `/session/${id}/execute/async`, {
            script: 'const done = arguments[0]; requestAnimationFrame(() => requestAnimationFrame(done));',
            args: [],
          }),
        screenshot: async () => Buffer.from(await call('GET', `/session/${id}/screenshot`), 'base64'),
      });
    } finally {
      await call('DELETE', `/session/${id}`);
    }
  } finally {
    driver.kill();
  }
}

await mkdir(SHOTS, { recursive: true });

for (const dpr of runs('chromium') ? [1, 1.25, 1.5, 2, 3] : []) {
  const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: VIEWPORT });
  const tab = await context.newPage();
  await tab.goto(url);
  await measure(
    `Chromium ${browser.version()}`,
    {
      evaluate: (expression) => tab.evaluate(expression),
      settle: () => tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))),
      screenshot: () => tab.screenshot({ scale: 'device' }),
    },
    dpr === 2 ? 'chromium-dpr2.png' : null
  );
  await context.close();
}

if (runs('safari')) {
  // No browserName: each driver launches its own browser (Safari, or the Technology Preview).
  await withSafari({}, async (safari) => {
    await safari.call('POST', '/window/rect', { width: VIEWPORT.width + 40, height: VIEWPORT.height + 160 });
    await safari.call('POST', '/url', { url });
    await measure(`${safari.session.browserName} ${safari.session.browserVersion}`, safari, 'safari.png');
  });
}

if (runs('ios')) {
  const udid = process.env.IOS_SIMULATOR;
  if (udid === undefined) console.log('\niOS: skipped, IOS_SIMULATOR is not set.');
  else {
    await withSafari(
      { platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': udid },
      async (safari) => {
        await safari.call('POST', '/url', { url });
        const { session } = safari;
        await measure(
          `iOS ${session['safari:platformVersion']} Safari, ${session['safari:deviceName']} (Simulator)`,
          safari,
          'ios.png'
        );
      }
    );
  }
}

await browser.close();
server.close();
