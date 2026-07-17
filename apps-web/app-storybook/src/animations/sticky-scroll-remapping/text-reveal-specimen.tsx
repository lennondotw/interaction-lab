import { cn } from '@monorepo/utils';
import type { MotionValue } from 'motion/react';
import type { FC } from 'react';

import { createProgressiveTextMapping } from './progressive-text-utils.js';
import { ProgressiveText, type ProgressiveTextProps } from './progressive-text.js';

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

const emojiGraphemePattern = /\p{Extended_Pictographic}/u;

export interface TextRevealColorHighlight {
  color: string;
  paragraphIndex: number;
  text: string;
}

export interface TextRevealSpecimenProps {
  className?: string;
  colorHighlights?: TextRevealColorHighlight[];
  progress: MotionValue<number> | number;
  textProps?: Pick<
    ProgressiveTextProps,
    'activeColor' | 'colorGradientWidth' | 'getActiveColor' | 'gradientWidth' | 'inactiveColor' | 'inactiveOpacity'
  >;
}

const getHighlightRanges = ({
  highlights,
  paragraphIndex,
  text,
}: {
  highlights: TextRevealColorHighlight[];
  paragraphIndex: number;
  text: string;
}) =>
  highlights
    .filter((highlight) => highlight.paragraphIndex === paragraphIndex)
    .map((highlight) => {
      const start = text.indexOf(highlight.text);

      if (start === -1) return null;

      return {
        color: highlight.color,
        end: start + highlight.text.length,
        start,
      };
    })
    .filter((range) => range !== null);

export const TextRevealSpecimen: FC<TextRevealSpecimenProps> = ({
  className,
  colorHighlights = [],
  progress,
  textProps,
}) => {
  return (
    <div className={cn('flex flex-col gap-[0.55em]', className)}>
      {specimenSequence.paragraphs.map(({ sequenceOffset, text }, paragraphIndex) => {
        const highlightRanges = getHighlightRanges({
          highlights: colorHighlights,
          paragraphIndex,
          text,
        });

        return (
          <p key={text}>
            <ProgressiveText
              progress={progress}
              sequenceLength={specimenSequence.sequenceLength}
              sequenceOffset={sequenceOffset}
              text={text}
              {...textProps}
              getActiveColor={(unit) =>
                emojiGraphemePattern.test(unit.content)
                  ? undefined
                  : (highlightRanges.find(
                      (highlight) => unit.originalIndex >= highlight.start && unit.originalIndex < highlight.end
                    )?.color ?? textProps?.getActiveColor?.(unit))
              }
            />
          </p>
        );
      })}
    </div>
  );
};
