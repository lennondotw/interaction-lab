import { cn } from '@monorepo/utils';
import type { MotionValue } from 'motion/react';
import type { FC } from 'react';

import { createProgressiveTextMapping } from './progressive-text-utils.js';
import { ProgressiveText } from './progressive-text.js';

const specimenCopy = [
  'Lorem ipsum 🌤️ dolor sit amet, consectetur adipiscing elit. Integer vitae 🧠 justo sed arcu facilisis posuere, quis tempus sem volutpat.',
  'Vivamus porta neque at tellus fermentum, sed tristique velit consequat. Nulla facilisi 💬 donec finibus, sapien in cursus posuere, lorem augue posuere metus.',
] as const;

const specimenSequence = specimenCopy.reduce<{
  paragraphs: { sequenceOffset: number; text: string }[];
  sequenceLength: number;
}>(
  (sequence, text) => ({
    paragraphs: [...sequence.paragraphs, { sequenceOffset: sequence.sequenceLength, text }],
    sequenceLength: sequence.sequenceLength + createProgressiveTextMapping(text).visibleLength,
  }),
  { paragraphs: [], sequenceLength: 0 }
);

export interface TextRevealSpecimenProps {
  className?: string;
  progress: MotionValue<number> | number;
}

export const TextRevealSpecimen: FC<TextRevealSpecimenProps> = ({ className, progress }) => {
  return (
    <div className={cn('flex flex-col gap-[0.55em]', className)}>
      {specimenSequence.paragraphs.map(({ sequenceOffset, text }) => (
        <p key={text}>
          <ProgressiveText
            progress={progress}
            sequenceLength={specimenSequence.sequenceLength}
            sequenceOffset={sequenceOffset}
            text={text}
          />
        </p>
      ))}
    </div>
  );
};
