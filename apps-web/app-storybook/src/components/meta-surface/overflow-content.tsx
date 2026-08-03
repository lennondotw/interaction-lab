/**
 * Content for the clip story, built to *deliberately* overflow the merged shape.
 *
 * Each of these fills the whole region box, which is a rectangle, while the shape inside it
 * is a blob — so every one of them spills past the contour on all four sides by
 * construction. That is the point: with the clip off you see the rectangle, with it on you
 * see the blob, and the difference is the only thing that changed.
 *
 * All three have *structure* rather than being smooth washes. A gradient would be cut
 * correctly and look almost identical either way, which would demonstrate nothing — a grid,
 * text baselines and hard colour boundaries all make the cut edge legible, and let you see
 * that the clip follows the traced curve rather than approximating it.
 */

import { Faker, en } from '@faker-js/faker';
import type { FC } from 'react';
import type { OverflowKind } from './overflow-kind.js';

/**
 * A hard-edged grid. The most legible of the three: the clip has to cut individual cells
 * mid-square, so any misalignment between the contour and the clip shows up as cells that
 * survive outside the curve.
 */
const Grid: FC = () => (
  <div
    className="size-full"
    style={{
      backgroundImage:
        'linear-gradient(to right, rgb(129 140 248 / 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgb(129 140 248 / 0.55) 1px, transparent 1px)',
      backgroundSize: '16px 16px',
      backgroundColor: 'rgb(30 27 75 / 0.55)',
    }}
  />
);

const faker = new Faker({ locale: [en], seed: 20260803 });
const LINES = Array.from({ length: 40 }, () => faker.lorem.sentence({ min: 8, max: 14 }));

/**
 * Prose running edge to edge. Text is the case a reader can judge instantly — a glyph cut
 * in half is unmistakable, and the ragged right edge proves nothing is being reflowed to
 * fit the shape.
 */
const Text: FC = () => (
  <div className="size-full overflow-hidden bg-indigo-950/60 p-3">
    <div className="flex flex-col gap-1 text-[10px] leading-tight text-indigo-200/85">
      {LINES.map((line, index) => (
        <p key={index} className="whitespace-nowrap">
          {line}
        </p>
      ))}
    </div>
  </div>
);

/** Diagonal stripes: every stripe crosses the contour at a different angle. */
const Stripes: FC = () => (
  <div
    className="size-full"
    style={{
      backgroundImage:
        'repeating-linear-gradient(45deg, rgb(99 102 241 / 0.75) 0 10px, rgb(30 27 75 / 0.75) 10px 20px)',
    }}
  />
);

export const OverflowContent: FC<{ kind: OverflowKind }> = ({ kind }) => {
  if (kind === 'text') return <Text />;
  if (kind === 'stripes') return <Stripes />;
  return <Grid />;
};
