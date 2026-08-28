import { Faker, en } from '@faker-js/faker';
import { FC } from 'react';

import { ContentKind } from './content-kind.js';

/**
 * The three subjects for the clip. See `content-kind.ts` for why these three.
 */

const faker = new Faker({ locale: [en], seed: 20260731 });
const PARAGRAPHS = Array.from({ length: 14 }, () => faker.lorem.paragraph({ min: 5, max: 9 }));

const Gradient: FC = () => (
  <div
    className="size-full"
    style={{
      background:
        'conic-gradient(from 210deg at 35% 30%, #6366f1, #06b6d4 25%, #f43f5e 55%, #f59e0b 75%, #6366f1), radial-gradient(circle at 70% 70%, #ffffff55, transparent 60%)',
    }}
  />
);

const Text: FC = () => (
  <div className="size-full overflow-hidden bg-neutral-950 p-4">
    <div className="flex flex-col gap-2 text-[11px] leading-snug text-neutral-300">
      {PARAGRAPHS.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  </div>
);

/**
 * A blur over a busy background. `filter` forces its own render surface, so this
 * is the case where a clip changing every frame is at its most expensive.
 */
const Filtered: FC = () => (
  <div className="size-full bg-neutral-950">
    <div
      className="size-full"
      style={{
        filter: 'blur(12px) saturate(1.6)',
        background:
          'repeating-conic-gradient(from 0deg at 30% 40%, #6366f1 0deg 18deg, #f43f5e 18deg 36deg, #06b6d4 36deg 54deg)',
      }}
    />
  </div>
);

export const ClippedContent: FC<{ kind: ContentKind }> = ({ kind }) => {
  if (kind === 'text') return <Text />;
  if (kind === 'filtered') return <Filtered />;
  return <Gradient />;
};
