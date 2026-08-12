/**
 * Measures what choosing a coordinate frame buys a beacon's follower, against
 * the real `Components/Beacon` stories.
 *
 * A beacon publishes one box and a shared follower springs to it. Which numbers
 * that box contains is a choice, and until 2026-08 the choice was implicit: the
 * container's top-left corner. That frame makes a resize *look like movement*
 * for anything the layout centres — a centred element's distance from the left
 * edge is half the container's width — so the spring is handed a moving target
 * it never should have seen. An origin fraction re-expresses the same geometry
 * against a reference point the layout actually holds still.
 *
 * The claim under test is not "it works". It is the shape of the trade:
 *
 *   1. how much lag the frame removes, and whether it removes *all* of it or
 *      merely divides it — swept across drag speed, because a wrong frame's
 *      error is speed-dependent and a right one's is not;
 *   2. that a wrong frame is worse than the default rather than merely
 *      different, and that the error scales with how much of the container's
 *      size the layout consumes;
 *   3. that the frame cannot buy scroll immunity at all, which is the boundary
 *      of the whole idea and the reason a second axis of choice (which *box* is
 *      the frame) exists;
 *   4. what the frame conversion on handoff is worth, in pixels of jump avoided;
 *   5. that the growth anchor under a size change is the origin point, per axis,
 *      for the whole transition rather than only at its ends;
 *   6. the size of the sub-pixel residue, and where it comes from;
 *   7. the border term in the offsetParent walk, measured arithmetically so the
 *      number stays meaningful whether or not the fix is present;
 *   8. that `onEmpty: 'freeze'` inherits whatever the frame guarantees.
 *
 * Nothing is re-implemented here. Every measurement is the *painted* geometry —
 * `getBoundingClientRect` on the follower against `getBoundingClientRect` on the
 * target — which is deliberately not the `offsetParent` walk the hook uses to
 * decide where to paint. An instrument that can disagree with its subject is the
 * only kind that can report a measurement bug as a number instead of as two
 * copies of the same mistake agreeing.
 *
 * Per-frame sampling is driven off `requestAnimationFrame` inside the page, so a
 * "frame" here is a real compositor frame. Headless Chromium is used for exactly
 * this reason: an occluded headed window stalls rAF while still reporting
 * `visibilityState: "visible"`, and every peak in this file would read as 0.
 *
 * Requires the Storybook dev server — `pnpm --filter @monorepo/lab dev` in
 * another shell — and `pnpm exec playwright install chromium`.
 *
 *   node archive/2026-08-beacon-origin-frame/probe.mjs
 */
import { chromium } from 'playwright';

const STORYBOOK = process.env.STORYBOOK_URL ?? 'http://localhost:6010';
const VIEWPORT = { width: 1280, height: 900 };

const story = (id) => `${STORYBOOK}/iframe.html?id=${id}&viewMode=story&reactScan=false`;

/** The three flags matter: a throttled renderer turns every per-frame peak into 0. */
const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

/**
 * Installed before app code runs. Everything the blocks below need from the
 * page, so each `evaluate` stays about the measurement rather than about
 * finding elements.
 */
const helpers = () => {
  const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };
  globalThis.b = {
    raf,
    settle: async (n = 45) => {
      for (let i = 0; i < n; i++) await raf();
    },
    box,
    /** Stages / panels: the story's own bordered boxes, in document order. */
    stages: () => [...document.querySelectorAll('div.relative[style*="width"]')],
    label: (stage) => stage.querySelector('span')?.textContent ?? '?',
    /** Followers are the only `z-index: 9000` boxes on the page, one per provider. */
    followers: () => [...document.querySelectorAll('div[style*="z-index: 9000"]')],
    inside: (root, w) => [...root.querySelectorAll(`[style*="width: ${w}px"]`)],
    button: (re) => [...document.querySelectorAll('button')].find((el) => re.test(el.textContent ?? '')),
    range: () => document.querySelector('input[type=range]'),
    /** React listens for `input`, and the value has to go through the setter. */
    setRange: (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    err: (follower, target) => {
      const f = box(follower);
      const t = box(target);
      return [f.cx - t.cx, f.cy - t.cy];
    },
    /** The springed value itself, parsed back out of what motion wrote. */
    springed: (follower) => {
      const t = follower.style.transform;
      return [
        Number(/translateX\((-?[\d.]+)px\)/.exec(t)?.[1] ?? 0),
        Number(/translateY\((-?[\d.]+)px\)/.exec(t)?.[1] ?? 0),
      ];
    },
    frame: (follower) => `${follower.style.left} ${follower.style.top} · ${follower.style.translate}`,
  };
};

const open = async (id) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(helpers);
  const page = await context.newPage();
  await page.goto(story(id));
  await page.waitForSelector('div[style*="z-index: 9000"]');
  await page.evaluate(() => globalThis.b.settle(50));
  return { page, context };
};

const round = (n, places = 1) => Number(n.toFixed(places));
const pair = ([x, y]) => `${round(x)} / ${round(y)}`;

// ---------------------------------------------------------------------------
// 1 · Resize: how much lag the frame removes, across drag speed.
//
// Both stories hold the same three layouts — corner-pinned, centred,
// far-corner-pinned. `match` gives each the origin its layout holds still
// against; `mismatch` gives all three the corner. The slider resizes the stage
// on both axes at once, so a wrong frame lags diagonally.
// ---------------------------------------------------------------------------

const SPEEDS = [4, 12, 32, 60];

const resizeSweep = async (id) => {
  const { page, context } = await open(id);
  const rows = {};
  for (const speed of SPEEDS) {
    const peaks = await page.evaluate(async (step) => {
      const { settle, stages, followers, inside, range, setRange, err, label, raf } = globalThis.b;
      const slider = range();
      const max = Number(slider.max);
      const min = Number(slider.min);
      setRange(slider, max);
      await settle(60);

      const panels = stages();
      const peak = panels.map(() => [0, 0]);
      for (let v = max; v >= min; v -= step) {
        setRange(slider, v);
        await raf();
        panels.forEach((stage, i) => {
          const target = inside(stage, 132)[0];
          if (!target) return;
          const [dx, dy] = err(followers()[i], target);
          peak[i][0] = Math.max(peak[i][0], Math.abs(dx));
          peak[i][1] = Math.max(peak[i][1], Math.abs(dy));
        });
      }
      await settle(90);
      return panels.map((stage, i) => {
        const target = inside(stage, 132)[0];
        return { label: label(stage), peak: peak[i], settled: err(followers()[i], target) };
      });
    }, speed);
    for (const p of peaks) {
      rows[p.label] ??= { settled: p.settled };
      rows[p.label][`${speed}px/frame`] = pair(p.peak);
      rows[p.label].settled = p.settled;
    }
  }
  // Inserted last so it prints after the speed columns rather than between them.
  for (const row of Object.values(rows)) {
    const settled = row.settled;
    delete row.settled;
    row['settled Δ'] = pair(settled);
  }
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 2 · Scroll: the boundary. Peak error, and the coordinate delta behind it.
//
// The coordinate column is the finding. A frame can only cancel a movement that
// leaves the *coordinate* unchanged; if the number the beacon publishes moves by
// the whole scroll, no reference point inside that frame can help, because the
// origin term is a fraction of the frame's extent and scrolling doesn't change
// it. So this block reports what the beacon believes, not only what the user sees.
// ---------------------------------------------------------------------------

const scrollPanels = async () => {
  const { page, context } = await open('components-beacon--scroll-frame');
  const rows = await page.evaluate(async () => {
    const { settle, stages, followers, inside, err, label, raf, springed } = globalThis.b;
    const panels = stages();
    const out = [];
    for (const [i, panel] of panels.entries()) {
      const target = inside(panel, 180)[0];
      const follower = followers()[i];
      await settle(40);
      const before = springed(follower);
      const rest = err(follower, target);
      let peak = [0, 0];
      for (let y = 0; y <= 300; y += 20) {
        panel.scrollTop = y;
        await raf();
        const [dx, dy] = err(follower, target);
        peak = [Math.max(peak[0], Math.abs(dx)), Math.max(peak[1], Math.abs(dy))];
      }
      await settle(90);
      const after = springed(follower);
      out.push({
        label: label(panel),
        position: follower.style.position,
        rest,
        peak,
        settled: err(follower, target),
        coordinateMoved: [after[0] - before[0], after[1] - before[1]],
      });
      panel.scrollTop = 0;
      await settle(60);
    }
    return out;
  });
  await context.close();
  return rows;
};

const scrollPage = async () => {
  const { page, context } = await open('components-beacon--scroll-page');
  const rows = await page.evaluate(async () => {
    const { settle, followers, err, raf, springed } = globalThis.b;
    const columns = [...document.querySelectorAll('div.flex.flex-col.gap-3')];
    const scroller = document.scrollingElement;
    const targets = columns.map((c) => [...c.querySelectorAll('[style*="height: 56px"]')][0]);
    await settle(40);
    const before = followers().map(springed);
    const rest = followers().map((f, i) => err(f, targets[i]));
    const peak = columns.map(() => [0, 0]);
    for (let y = 0; y <= 400; y += 25) {
      scroller.scrollTop = y;
      await raf();
      followers().forEach((f, i) => {
        const [dx, dy] = err(f, targets[i]);
        peak[i] = [Math.max(peak[i][0], Math.abs(dx)), Math.max(peak[i][1], Math.abs(dy))];
      });
    }
    await settle(90);
    const after = followers().map(springed);
    return followers().map((f, i) => ({
      label: i === 0 ? 'page · frame = page content' : 'page · frame = viewport',
      position: f.style.position,
      rest: rest[i],
      peak: peak[i],
      settled: err(f, targets[i]),
      coordinateMoved: [after[i][0] - before[i][0], after[i][1] - before[i][1]],
    }));
  });
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 3 · The frame conversion on handoff.
//
// Two beacons in one slot can disagree about the frame, and the springs hold a
// value in the outgoing one. `counterfactual` is what the swap would have jumped
// by if the held value were simply reinterpreted under the incoming frame's CSS
// percentages: Δf · (w − W). That number is what the conversion is worth.
// ---------------------------------------------------------------------------

const handoff = async (id, { midDrag }) => {
  const { page, context } = await open(id);
  const rows = await page.evaluate(async (drag) => {
    const { settle, stages, followers, button, err, raf, range, setRange, box } = globalThis.b;
    const stage = stages()[0];
    const follower = () => followers()[0];
    const toggle = button(/#2/);
    const targets = [...stage.querySelectorAll('[style*="height: 44px"], [style*="height: 48px"]')];
    const out = [];

    const swap = async (note) => {
      // Only the *painted* position may not move. Everything about how it is
      // painted does: `left`, `translate` and the springed value all change.
      const f0 = box(follower());
      const w = f0.w;
      const W = stage.clientWidth;
      const frameBefore = follower().style.left;
      toggle.click();
      await raf();
      const f1 = box(follower());
      const frameAfter = follower().style.left;
      const df = (Number.parseFloat(frameAfter) - Number.parseFloat(frameBefore)) / 100;
      out.push({
        note,
        'frame left%': `${frameBefore} → ${frameAfter}`,
        jump: Math.hypot(f1.cx - f0.cx, f1.cy - f0.cy),
        counterfactual: Math.abs(df * (w - W)),
      });
      await settle(120);
    };

    if (drag) {
      // Toggle while the surface is actively lagging: continuity has to preserve
      // the lag, not the target.
      const slider = range();
      setRange(slider, Number(slider.max));
      await settle(60);
      for (let v = Number(slider.max); v >= Number(slider.min); v -= 12) {
        setRange(slider, v);
        await raf();
      }
      const lag = err(follower(), targets[0]);
      out.push({
        note: 'lag at the swap moment',
        jump: Math.hypot(lag[0], lag[1]),
        counterfactual: 0,
        'frame left%': '—',
      });
      await swap('push #2 · mid-drag, wrong frame → right');
      for (let v = Number(slider.min); v <= Number(slider.max); v += 12) {
        setRange(slider, v);
        await raf();
      }
      await swap('pop #2 · mid-drag, right frame → wrong');
    } else {
      await swap('push #2 · at rest, corner → centre');
      await swap('pop #2 · at rest, centre → corner');
    }
    return out;
  }, midDrag);
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 4 · The growth anchor under a size change.
//
// The origin is used twice — on the container to place zero, and on the beacon's
// own box to say which of its points the coordinate refers to. The second use
// decides which quantity holds still while the size spring runs. Grow the target
// and ask which of the follower's six edges/centres never moved.
// ---------------------------------------------------------------------------

const growthAnchor = async () => {
  const { page, context } = await open('components-beacon--origin-match');
  const rows = await page.evaluate(async () => {
    const { settle, stages, followers, inside, label, raf } = globalThis.b;
    const out = {};
    for (const [i, stage] of stages().entries()) {
      const target = inside(stage, 132)[0];
      const follower = followers()[i];
      const edges = () => {
        const r = follower.getBoundingClientRect();
        return {
          left: r.left,
          'centre x': r.left + r.width / 2,
          right: r.right,
          top: r.top,
          'centre y': r.top + r.height / 2,
          bottom: r.bottom,
        };
      };
      await settle(40);
      const start = edges();
      target.style.width = '212px';
      target.style.height = '92px';
      const dev = Object.fromEntries(Object.keys(start).map((k) => [k, 0]));
      for (let n = 0; n < 50; n++) {
        await raf();
        const now = edges();
        for (const k of Object.keys(dev)) dev[k] = Math.max(dev[k], Math.abs(now[k] - start[k]));
      }
      out[label(stage)] = Object.fromEntries(Object.entries(dev).map(([k, v]) => [k, Number(v.toFixed(1))]));
      target.style.width = '132px';
      target.style.height = '52px';
      await settle(60);
    }
    return out;
  });
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 5 · The sub-pixel residue, against container parity.
//
// `offsetLeft` and `clientWidth` are integers while layout positions elements at
// fractional pixels. Sweeping one pixel at a time shows whether the residue is
// noise or a function of parity.
// ---------------------------------------------------------------------------

const rounding = async () => {
  const { page, context } = await open('components-beacon--origin-resize');
  const rows = await page.evaluate(async () => {
    const { settle, stages, followers, inside, range, setRange, err, springed } = globalThis.b;
    const slider = range();
    const centreStage = stages()[1];
    const target = inside(centreStage, 140)[0];
    const follower = followers()[1];
    const out = {};
    for (let w = 300; w <= 311; w++) {
      setRange(slider, w);
      await settle(40);
      const [dx] = err(follower, target);
      out[`stage ${w}`] = {
        clientWidth: centreStage.clientWidth,
        parity: centreStage.clientWidth % 2 === 0 ? 'even' : 'odd',
        offsetLeft: target.offsetLeft,
        'springed x': Number(springed(follower)[0].toFixed(3)),
        'visual Δx': Number(dx.toFixed(2)),
      };
    }
    return out;
  });
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 6 · The border term in the offsetParent walk.
//
// Arithmetic rather than behaviour, so the number means the same thing whether
// or not the fix is in: sum the chain the way a naive walk would, then with each
// hop's `clientLeft`, against the rect. The viewport-framed scroll panel is the
// case that has a bordered offsetParent *between* the element and the frame,
// which is what it takes for the term to be non-zero.
// ---------------------------------------------------------------------------

const borderTerm = async () => {
  const { page, context } = await open('components-beacon--scroll-frame');
  const rows = await page.evaluate(() => {
    const { stages, inside } = globalThis.b;
    const out = {};
    for (const [i, stage] of stages().entries()) {
      const target = inside(stage, 180)[0];
      // Two frames per panel: the panel itself (the registered container for the
      // left one) and `null` (the viewport, for the right one).
      for (const [name, container] of [
        ['→ panel', stage],
        ['→ viewport', null],
      ]) {
        let naive = { x: 0, y: 0 };
        let withBorder = { x: 0, y: 0 };
        const hops = [];
        let node = target;
        while (node && node !== container) {
          naive.x += node.offsetLeft;
          naive.y += node.offsetTop;
          withBorder.x += node.offsetLeft;
          withBorder.y += node.offsetTop;
          const op = node.offsetParent;
          if (op && op !== container) {
            withBorder.x += op.clientLeft;
            withBorder.y += op.clientTop;
            if (op.clientLeft || op.clientTop)
              hops.push(`${op.tagName.toLowerCase()} ${op.clientLeft}/${op.clientTop}`);
          }
          if (!op) break;
          node = op;
        }
        const origin = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
        const pad = container ? { l: container.clientLeft, t: container.clientTop } : { l: 0, t: 0 };
        const r = target.getBoundingClientRect();
        const truth = { x: r.left - origin.left - pad.l, y: r.top - origin.top - pad.t };
        out[`${stage.querySelector('span').textContent} ${name}`] = {
          'naive Σ offsetLeft': `${naive.x} / ${naive.y}`,
          '+ clientLeft': `${withBorder.x} / ${withBorder.y}`,
          truth: `${Number(truth.x.toFixed(1))} / ${Number(truth.y.toFixed(1))}`,
          'bordered hops': hops.join(', ') || 'none',
          'term costs': `${Number((withBorder.x - naive.x).toFixed(1))} / ${Number((withBorder.y - naive.y).toFixed(1))}`,
        };
      }
    }
    return out;
  });
  await context.close();
  return rows;
};

// ---------------------------------------------------------------------------
// 7 · Freeze inherits the frame.
//
// `onEmpty: 'freeze'` holds the last coordinate with nothing measuring. Whether
// that coordinate is still true after a resize is not a property of freezing —
// it is a property of the frame it froze in.
// ---------------------------------------------------------------------------

const NARROWED = { width: 940, height: 680 };

const freezeFrames = async () => {
  const out = {};
  for (const [label, id] of [
    ['centre frame', 'components-beacon--lose-last-beacon-freeze'],
    ['corner frame', 'components-beacon--lose-last-beacon-freeze-corner'],
  ]) {
    const { page, context } = await open(id);
    const before = await page.evaluate(async () => {
      const { settle, followers, button, err } = globalThis.b;
      const target = document.querySelector('[style*="width: 280px"]');
      await settle(40);
      const rest = err(followers()[0], target);
      button(/only beacon/).click();
      await settle(60);
      const t = target.getBoundingClientRect();
      return {
        rest,
        targetCentre: [t.left + t.width / 2, t.top + t.height / 2],
        frame: globalThis.b.frame(followers()[0]),
      };
    });
    await page.setViewportSize(NARROWED);
    const after = await page.evaluate(async (probe) => {
      const { settle, followers, button, err } = globalThis.b;
      const target = document.querySelector('[style*="width: 280px"]');
      await settle(90);
      const t = target.getBoundingClientRect();
      const gap = err(followers()[0], target);
      button(/only beacon/).click();
      await settle(140);
      return {
        targetMoved: [t.left + t.width / 2 - probe.targetCentre[0], t.top + t.height / 2 - probe.targetCentre[1]],
        gapWhileFrozen: gap,
        afterPushingAgain: err(followers()[0], target),
      };
    }, before);
    out[label] = {
      frame: before.frame,
      'rest Δ': pair(before.rest),
      'target moved': pair(after.targetMoved),
      'gap while frozen': pair(after.gapWhileFrozen),
      'after re-push': pair(after.afterPushingAgain),
    };
    await context.close();
  }
  return out;
};

// ---------------------------------------------------------------------------

const heading = (text) => console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 66 - text.length))}`);

heading('1 · resize · peak Δ x / y, by drag speed · origin MATCHES the layout');
console.table(await resizeSweep('components-beacon--origin-match'));

heading('1 · resize · peak Δ x / y, by drag speed · all three claim the CORNER');
console.table(await resizeSweep('components-beacon--origin-mismatch'));

heading('2 · scroll · a frame cannot cancel it');
const scrolls = [...(await scrollPanels()), ...(await scrollPage())];
console.table(
  Object.fromEntries(
    scrolls.map((r) => [
      r.label,
      {
        position: r.position,
        'rest Δ': pair(r.rest),
        'peak Δ': pair(r.peak),
        'settled Δ': pair(r.settled),
        'coordinate moved': pair(r.coordinateMoved),
      },
    ])
  )
);

heading('3 · handoff across frames · jump vs what it would have been');
const swaps = [
  ...(await handoff('components-beacon--origin-handoff', { midDrag: false })),
  ...(await handoff('components-beacon--origin-handoff-centred', { midDrag: true })),
];
console.table(
  Object.fromEntries(
    swaps.map((r) => [
      r.note,
      {
        'frame left%': r['frame left%'],
        'jump px': round(r.jump, 2),
        'without conversion': round(r.counterfactual, 1),
      },
    ])
  )
);

heading('4 · size change · max deviation of each edge, whole transition');
console.table(await growthAnchor());

heading('5 · sub-pixel residue vs container parity · centre origin');
console.table(await rounding());

heading('6 · the border term in the offsetParent walk');
console.table(await borderTerm());

heading('7 · freeze inherits the frame · viewport 1280×900 → 940×680');
console.table(await freezeFrames());

await browser.close();
