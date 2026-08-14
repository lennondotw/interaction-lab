// What does keeping every view mounted cost, and at what depth does it start to show?
//
//   pnpm exec playwright install chromium              # once
//   pnpm --filter @monorepo/lab dev                    # a running Storybook
//   node archive/2026-08-navigation-stack-depth-cost/probe.mjs
//   STORYBOOK_URL=http://localhost:6031 node …/probe.mjs   # non-default port
//
// `navigation-stack` keeps every view on the stack mounted, so going back does not
// remount, refetch or re-scroll the view underneath. The price is that
// `NavigationContent` maps over every entry on every navigation: one push re-renders
// all N mounted views, even though only two of them animate. So the animation should
// be O(1) in depth and the commit should be O(depth), and the question is where that
// crosses from free to felt.
//
// This drives the real stories rather than a copy of them, because the question is
// about what our component does. Two of them, for two content weights:
//
//   RevisitedView   a cycle of three rows — the lightest a view gets, and the only
//                   story that can be pushed to arbitrary depth
//   WithTabBar      twelve rows and a paragraph per view. Its other two tabs sit at
//                   depth 1 and never re-render when this one navigates (separate
//                   providers), so they are constant overhead rather than a confound
//
// Two numbers per navigation:
//
//   toDomMs   click -> the first DOM mutation inside the stack, via MutationObserver.
//             Scheduling plus render plus commit. NOT measured by timing `click()`
//             itself: React flushes a discrete update after the event returns, so that
//             window contains only the dispatch and reads ~0 at every depth.
//   worstMs   the longest frame between the click and the spring settling. This is the
//             one a user feels, and it is the one that should be flat.
//
// Each depth is measured by push-measure-pop, repeated, and reported as a median —
// single samples are far too noisy to read a slope from. A first exploratory pass
// showed a worst frame of 28ms at depth 8 and 8ms at depth 24, which is noise, not a
// signal, and would have supported any conclusion at all.

import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6009';
const DEPTHS = [1, 2, 4, 8, 16, 32];
const REPEATS = 5;
const SETTLE_MS = 340; // the navigation spring is critically damped and settles in ~200ms

const CASES = [
  {
    name: 'RevisitedView',
    story: 'components-navigationstack--revisited-view',
    note: '3 rows per view',
    scope: '[data-testid="navigation-content"]',
  },
  {
    name: 'WithTabBar',
    story: 'components-navigationstack--with-tab-bar',
    note: '12 rows + copy per view',
    scope: '[data-testid="tab-panel-browse"] [data-testid="navigation-content"]',
  },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });

// Everything below depends on frames actually being produced. A page that is not
// being rendered still runs timers and still lays out, so a probe like this fails
// silently rather than loudly: `requestAnimationFrame` never fires, every frame
// sample is missing, and Motion never animates at all.
async function assertRendering() {
  const state = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve({ visibility: document.visibilityState, framed: false }), 500);
        requestAnimationFrame(() => {
          clearTimeout(t);
          resolve({ visibility: document.visibilityState, framed: true });
        });
      })
  );
  if (!state.framed) {
    throw new Error(
      `the page is not being rendered (visibilityState: ${state.visibility}) — no frames, no measurement`
    );
  }
}

async function measure({ story, scope }) {
  await page.goto(`${STORYBOOK}/iframe.html?id=${story}&viewMode=story`);
  await page.waitForSelector(`${scope} [data-entry-key]`, { timeout: 20000 });
  await page.waitForTimeout(600);
  await assertRendering();

  return page.evaluate(
    async ([scopeSelector, depths, repeats, settleMs]) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const scopeEl = document.querySelector(scopeSelector);
      const live = () => scopeEl.querySelectorAll('[data-entry-key]:not([data-view-status="exiting"])').length;
      const nodes = () => scopeEl.querySelectorAll('*').length;
      const topRow = () => scopeEl.querySelector('[data-view-status="active"] button');
      const backButton = () =>
        scopeEl.closest('[data-testid="navigation-container"]').querySelector('[data-testid="nav-back-button"]');

      const settleTo = async (target) => {
        const deadline = performance.now() + 4000;
        while (live() !== target && performance.now() < deadline) {
          if (live() < target) topRow().click();
          else backButton().click();
          await sleep(settleMs);
        }
        // Wait for any leaving view to drop out, so the next measurement starts clean.
        const drained = performance.now() + 2000;
        while (scopeEl.querySelector('[data-view-status="exiting"]') && performance.now() < drained) await sleep(40);
      };

      /** One push, instrumented. Returns null if the push did not land. */
      const timedPush = async () => {
        const target = live() + 1;
        let domAt = null;
        const mo = new MutationObserver(() => {
          domAt ??= performance.now();
        });
        mo.observe(scopeEl, { attributes: true, childList: true, subtree: true });

        const frames = [];
        let prev = performance.now();
        let running = true;
        const tick = (t) => {
          frames.push(t - prev);
          prev = t;
          if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        const t0 = performance.now();
        topRow().click();
        const deadline = performance.now() + 2000;
        while (live() !== target && performance.now() < deadline) await sleep(4);
        await sleep(settleMs);
        running = false;
        mo.disconnect();

        if (live() !== target) return null;
        // The first delta straddles the click and measures whatever the page was
        // doing before it, so it is dropped rather than counted as a slow frame.
        const body = frames.slice(1);
        return {
          toDomMs: domAt === null ? null : domAt - t0,
          worstMs: body.length ? Math.max(...body) : null,
        };
      };

      const rows = [];
      for (const depth of depths) {
        await settleTo(depth);
        const toDom = [];
        const worst = [];
        for (let r = 0; r < repeats; r++) {
          const m = await timedPush();
          if (m?.toDomMs != null) toDom.push(m.toDomMs);
          if (m?.worstMs != null) worst.push(m.worstMs);
          await settleTo(depth); // pop back, so every repeat pushes *from* `depth`
        }
        rows.push({ depth, nodes: nodes(), toDom, worst, samples: toDom.length });
      }
      return rows;
    },
    [scope, DEPTHS, REPEATS, SETTLE_MS]
  );
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n, d = 1) => (v == null ? pad('—', n) : v.toFixed(d).padStart(n));

for (const testCase of CASES) {
  const rows = await measure(testCase);
  console.log(`\n${testCase.name} — ${testCase.note}`);
  console.log(
    `${pad('depth', 7)}${pad('nodes', 7)}${pad('nodes/view', 12)}${pad('toDom ms', 10)}${pad('worst ms', 10)}n`
  );
  for (const r of rows) {
    console.log(
      `${pad(r.depth, 7)}${pad(r.nodes, 7)}${num(r.nodes / r.depth, 10)}  ${num(median(r.toDom), 8, 2)}  ${num(median(r.worst), 8, 2)}  ${r.samples}`
    );
  }
  const first = rows[0];
  const last = rows.at(-1);
  if (first && last && last.depth > first.depth) {
    const slope = (median(last.toDom) - median(first.toDom)) / (last.depth - first.depth);
    console.log(`\n  toDom slope: ${slope.toFixed(2)} ms per level of depth`);
  }
}

console.log(`\n${DEPTHS.length} depths x ${REPEATS} pushes each, median. Chromium, 1x.\n`);

await browser.close();
