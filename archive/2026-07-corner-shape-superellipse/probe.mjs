/**
 * Measures what `corner-shape: superellipse(k)` actually draws, to answer three
 * things the spec text alone does not settle:
 *
 *   1. What `k` means. Reverse-solved from the rendered geometry rather than read
 *      off the spec, so the answer is what Chrome ships.
 *   2. Why a smoothed corner reads smaller than the arc it replaces, and what the
 *      compensating radius scale therefore has to be.
 *   3. Why smoothing can never produce a circle or a true pill.
 *
 * Nothing here needs Storybook or the component. The shapes are plain divs, which
 * keeps the measurement about CSS rather than about our wrapper — the component
 * only consumes the constant section 2 derives.
 *
 * The instrument is hit-testing: `document.elementFromPoint` respects
 * `border-radius` and `corner-shape`, so a bisection along a ray finds the painted
 * boundary without reading a pixel. The alternative — screenshot and threshold —
 * measures antialiasing as much as geometry.
 *
 * It is not exact. Hit-testing lands ~1.4px inside the true boundary, constant
 * across shapes, so every geometry here is deliberately large: at r = 300 that
 * bias is 1.1% of the arc's depth rather than the 3.4% it would be at r = 100.
 * Section 1 prints the arc against its closed form so the residual error is
 * visible rather than implied, and section 2 reports measurement and closed form
 * side by side. The closed form is what the component ships; the measurement is
 * here to catch it being the wrong closed form.
 *
 * Requires `pnpm exec playwright install chromium`. `corner-shape` needs Chrome
 * 139+; the probe says so rather than reporting silent zeros.
 *
 *   node archive/2026-07-corner-shape-superellipse/probe.mjs
 */
import { chromium } from 'playwright';

/** `k` values swept in section 1. 0 is the bevel, 1 the arc, 1.6 our squircle. */
const K_VALUES = [0, 0.5, 1, 1.6, 2, 3];
/** The `k` the component ships. */
const SHIPPED_K = 1.6;
/** The factor `opal-ui` shipped, which this investigation replaced. */
const INHERITED_SCALE = 1.5;
/** Corner radius for section 1-2, in CSS px. Large so the hit-test bias stays small. */
const RADIUS = 300;
/** Box for section 1-2. Must be well over 2*RADIUS so straight edge survives. */
const DEPTH_BOX = 900;
/** Box for section 3, in CSS px. `50%` leaves no straight edge at all. */
const SQUARE = 600;
/** Pill box, in CSS px. Radius clamps to half the height. */
const PILL = { width: 900, height: 400 };
/** Angles sampled around a shape, in degrees. */
const RADIAL_ANGLES = [0, 15, 30, 45, 60, 75, 90];
/** Bisection steps. Far past sub-pixel for any box this size. */
const BISECT_STEPS = 40;

/** How deep a corner of exponent n bites, in units of the radius, per axis. */
const cornerDepth = (n) => 1 - 2 ** (-1 / n);
/** Distance from the box corner to the curve's apex, in units of the radius. */
const diagonalDepth = (n) => Math.SQRT2 * cornerDepth(n);
/** How far a superellipse of exponent n reaches past its radius on the diagonal. */
const diagonalBulge = (n) => Math.SQRT2 * 2 ** (-1 / n);

const fmt = (value, digits = 2) => Number(value.toFixed(digits));

const measure = (page, args) =>
  page.evaluate(({ kValues, shippedK, radius, depthBox, square, pill, angles, steps }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;';
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:0;top:0;background:#000;';
    host.appendChild(probe);
    document.body.appendChild(host);

    const size = (width, height) => {
      host.style.width = probe.style.width = `${width}px`;
      host.style.height = probe.style.height = `${height}px`;
    };
    const inside = (x, y) => document.elementFromPoint(x, y) === probe;

    /** Furthest point still inside, along a ray from (ox, oy). */
    const boundary = (ox, oy, deg, limit) => {
      const t = (deg * Math.PI) / 180;
      let lo = 0;
      let hi = limit;
      for (let i = 0; i < steps; i++) {
        const mid = (lo + hi) / 2;
        if (inside(ox + Math.cos(t) * mid, oy + Math.sin(t) * mid)) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };

    /** Distance from the sharp corner in to the curve, along the 45° diagonal. */
    const cornerInset = (limit) => {
      let lo = 0;
      let hi = limit;
      for (let i = 0; i < steps; i++) {
        const mid = (lo + hi) / 2;
        if (inside(mid / Math.SQRT2, mid / Math.SQRT2)) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    };

    const applyShape = (k) => {
      probe.style.setProperty('corner-shape', k === null ? 'round' : `superellipse(${k})`);
      return getComputedStyle(probe).getPropertyValue('corner-shape').trim();
    };

    const supported = CSS.supports('corner-shape', 'superellipse(1.6)');

    // 1 + 2 — corner depth, on a box with plenty of straight edge left over.
    size(depthBox, depthBox);
    probe.style.borderRadius = `${radius}px`;
    const depths = [null, ...kValues].map((k) => ({
      k,
      applied: applyShape(k),
      inset: cornerInset(radius * 1.6),
    }));

    // 3a — radial profile at 50%, where no straight edge survives.
    size(square, square);
    probe.style.borderRadius = '50%';
    const radial = [null, shippedK].map((k) => ({
      k,
      applied: applyShape(k),
      radii: angles.map((deg) => boundary(square / 2, square / 2, deg, square)),
    }));

    // 3b — pill end cap, measured from the cap's own centre.
    size(pill.width, pill.height);
    probe.style.borderRadius = '9999px';
    const capRadius = pill.height / 2;
    const cap = [null, shippedK].map((k) => ({
      k,
      applied: applyShape(k),
      used: getComputedStyle(probe).borderRadius,
      radii: angles.map((deg) => boundary(capRadius, capRadius, 180 + deg, capRadius * 1.8)),
    }));

    host.remove();
    return { supported, depths, radial, cap, capRadius, nominalRadius: square / 2 };
  }, args);

const table = (rows) => {
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
  const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  console.log(line(headers));
  console.log(`| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`);
  for (const row of rows) console.log(line(headers.map((h) => row[h])));
  console.log('');
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: DEPTH_BOX + 40, height: DEPTH_BOX + 40 },
  });
  await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');

  const result = await measure(page, {
    kValues: K_VALUES,
    shippedK: SHIPPED_K,
    radius: RADIUS,
    depthBox: DEPTH_BOX,
    square: SQUARE,
    pill: PILL,
    angles: RADIAL_ANGLES,
    steps: BISECT_STEPS,
  });

  if (!result.supported) {
    console.error('This Chromium does not support `corner-shape`. Needs Chrome 139+.');
    console.error('Reinstall with: pnpm exec playwright install chromium');
    await browser.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\n## 1. What k means  (r = ${RADIUS}px, ${DEPTH_BOX}px box)\n`);
  console.log('Solving  d = sqrt(2) * r * (1 - 2^(-1/n))  for n. If k is the log of');
  console.log('the exponent then n = 2^k, and the last two columns agree.\n');
  table(
    result.depths.map(({ k, applied, inset }) => {
      const frac = 1 - inset / (Math.SQRT2 * RADIUS);
      const n = frac > 0 && frac < 1 ? -1 / Math.log2(frac) : NaN;
      return {
        'corner-shape': k === null ? 'round' : `superellipse(${k})`,
        computed: applied,
        depth: `${fmt(inset)}px`,
        'implied n': fmt(n, 3),
        '2^k': k === null ? '—' : fmt(2 ** k, 3),
      };
    })
  );
  const arc = result.depths.find((d) => d.k === null);
  console.log(`Instrument error, from the one row with an exact closed form:`);
  console.log(
    `  arc measured ${fmt(arc.inset)}px vs ${fmt(diagonalDepth(2) * RADIUS)}px predicted` +
      `  (${fmt((arc.inset / (diagonalDepth(2) * RADIUS) - 1) * 100, 2)}%)\n`
  );

  const ours = result.depths.find((d) => d.k === SHIPPED_K);
  const measured = arc.inset / ours.inset;
  const predicted = diagonalDepth(2) / diagonalDepth(2 ** SHIPPED_K);

  console.log(`## 2. Why the corner reads smaller, and by how much\n`);
  console.log('The curve is confined to the same r x r corner box either way, so a');
  console.log('higher exponent cannot spread along the edges — it hugs the sharp');
  console.log('corner instead. Less is bitten out, so the corner looks smaller at');
  console.log('the same r, and the radius has to be paid back.\n');
  table([
    { shape: 'round (n = 2)', 'depth / r': fmt(arc.inset / RADIUS, 4), predicted: fmt(diagonalDepth(2), 4) },
    {
      shape: `superellipse(${SHIPPED_K}) (n = ${fmt(2 ** SHIPPED_K, 2)})`,
      'depth / r': fmt(ours.inset / RADIUS, 4),
      predicted: fmt(diagonalDepth(2 ** SHIPPED_K), 4),
    },
  ]);
  console.log('Compensation = arc depth / superellipse depth');
  console.log(`  measured             ${fmt(measured, 4)}`);
  console.log(`  closed form          ${fmt(predicted, 4)}   <- what the component derives`);
  console.log(
    `  inherited from opal-ui  ${INHERITED_SCALE}     ` +
      `(overshoots the closed form by ${fmt((INHERITED_SCALE / predicted - 1) * 100, 1)}%)\n`
  );

  console.log(`## 3. Why smoothing cannot make a circle  (radius 50%, ${SQUARE}px box)\n`);
  console.log('At 50% no straight edge survives, so the whole outline is the corner');
  console.log('curve — and a superellipse of exponent != 2 is not a circle. No radius');
  console.log('recovers one; only k = 1 does, and k = 1 is the arc.\n');
  table(
    result.radial.map(({ applied, radii }) => ({
      'corner-shape': applied,
      ...Object.fromEntries(RADIAL_ANGLES.map((deg, i) => [`${deg}°`, fmt(radii[i])])),
      bulge: `${fmt(((Math.max(...radii) - Math.min(...radii)) / Math.min(...radii)) * 100, 1)}%`,
    }))
  );
  console.log(`Nominal radius ${result.nominalRadius}px; a circle is flat across the row.`);
  console.log(
    `Predicted diagonal bulge at n = ${fmt(2 ** SHIPPED_K, 2)}:  ` +
      `${fmt((diagonalBulge(2 ** SHIPPED_K) - 1) * 100, 1)}%\n`
  );

  console.log(`## 3b. The same failure on a pill  (${PILL.width}x${PILL.height}, radius 9999px)\n`);
  console.log('The radius clamps to half the height, so each cap is a corner curve');
  console.log('spanning the full height: a semicircle, or a flattened superellipse');
  console.log('that reads as a rounded rectangle.\n');
  table(
    result.cap.map(({ applied, used, radii }) => ({
      'corner-shape': applied,
      specified: used,
      ...Object.fromEntries(RADIAL_ANGLES.map((deg, i) => [`${180 + deg}°`, fmt(radii[i])])),
      deviation: `${fmt(((Math.max(...radii) - Math.min(...radii)) / Math.min(...radii)) * 100, 1)}%`,
    }))
  );
  console.log(`A true cap is a constant ${result.capRadius}px across the row.\n`);

  await browser.close();
};

await main();
