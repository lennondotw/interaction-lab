/**
 * Open every story in a real browser and report the ones that are broken.
 *
 * The unit tests cover the pure parts and CI builds the Storybook, but neither
 * notices a story that renders an empty box, throws on mount, or logs a React
 * warning — the failures that only exist once a component is actually mounted.
 * This walks the whole index and looks for exactly those.
 *
 * Needs a Storybook running, because it drives the real stories rather than a copy
 * of them, the same bargain the archive probes make:
 *
 *   pnpm --filter @monorepo/lab dev
 *   pnpm smoke:stories                      # or STORYBOOK_URL=... for another port
 *   pnpm smoke:stories -- --filter studies/  # a subset, matched against the id
 *
 * Exits non-zero if anything failed, so it can gate a branch. It is deliberately
 * not in CI: 230-odd stories at roughly a second each is minutes, and the answer
 * only changes when a component does.
 */

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';

/** How long to let a story settle before reading it. Enough for one spring to start. */
const SETTLE_MS = 600;

const filterIndex = process.argv.indexOf('--filter');
const FILTER = filterIndex === -1 ? null : process.argv[filterIndex + 1];

/**
 * Console noise that is not the app's: browser extensions, and React's own
 * devtools nag. Everything else counts, including warnings React logs as errors.
 */
const NOT_OURS = [/React Scan/i, /react-grab/i, /is outdated/i, /Download the React DevTools/i];

const index = await fetch(`${STORYBOOK}/index.json`)
  .then((response) => response.json())
  .catch(() => {
    console.error(`No Storybook at ${STORYBOOK}. Start one with:\n\n  pnpm --filter @monorepo/lab dev\n`);
    process.exit(2);
  });

const stories = Object.entries(index.entries)
  .filter(([, entry]) => entry.type === 'story')
  .filter(([id]) => !FILTER || id.includes(FILTER));

if (!stories.length) {
  console.error(FILTER ? `No story id contains ${FILTER}.` : 'The index has no stories.');
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();

// Headless or not, a page the window manager considers hidden gets its rAF throttled
// to nothing: Motion applies `initial` and never animates, ResizeObserver callbacks
// never arrive, and anything derived from a measured size looks frozen. Every story
// here would then be checked in a state it never reaches in front of a person.
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

const failures = [];
let checked = 0;

for (const [id, entry] of stories) {
  const messages = [];
  const onConsole = (message) => {
    if (message.type() === 'error' && !NOT_OURS.some((pattern) => pattern.test(message.text()))) {
      messages.push(message.text().replaceAll('\n', ' ').slice(0, 200));
    }
  };
  const onPageError = (error) => messages.push(`uncaught — ${error.message.split('\n')[0].slice(0, 200)}`);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  await page.goto(`${STORYBOOK}/iframe.html?viewMode=story&id=${id}`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);

  const state = await page.evaluate(() => {
    const root = document.querySelector('#storybook-root') ?? document.body;

    return {
      // Storybook's own failure surfaces. Both render a page that looks fine to a
      // screenshot and says nothing to the console.
      missing: /Couldn't find story|Unable to index/.test(document.body.innerText),
      errorDisplay: (document.querySelector('#error-message')?.textContent ?? '').trim().slice(0, 160) || null,
      // A story can mount without throwing and still paint nothing. Drawn output
      // counts, not just text, or every canvas and SVG story would report empty.
      empty:
        root.innerText.trim().length === 0 && root.querySelectorAll('svg, canvas, img, video, [style]').length === 0,
    };
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  checked += 1;
  const broken = state.missing || state.errorDisplay || state.empty || messages.length > 0;

  if (broken) failures.push({ id, title: entry.title, name: entry.name, ...state, messages });

  // Progress overwrites itself on a terminal and is silent otherwise. Piped to a file,
  // a carriage return is not a newline, so the same line would arrive as one 15,000
  // character run — which is exactly how you read it in a log you did not expect to keep.
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${broken ? '✗' : '·'} ${checked}/${stories.length}  ${id.slice(0, 60).padEnd(60)}`);
  }
}

await browser.close();

if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(80)}\r`);
console.log(`${checked} stories checked, ${failures.length} with something to report\n`);

for (const failure of failures) {
  console.log(`✗ ${failure.title} — ${failure.name}`);
  console.log(`  ${failure.id}`);
  if (failure.missing) console.log('  story not in the index');
  if (failure.errorDisplay) console.log(`  error display — ${failure.errorDisplay}`);
  if (failure.empty) console.log('  rendered nothing');
  for (const message of failure.messages) console.log(`  console — ${message}`);
  console.log('');
}

process.exit(failures.length > 0 ? 1 : 0);
