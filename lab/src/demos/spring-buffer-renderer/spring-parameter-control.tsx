import { cn } from '@monorepo/utils';
import * as Label from '@radix-ui/react-label';
import * as Slider from '@radix-ui/react-slider';
import { FC } from 'react';
import { SPRING_PARAMS } from './constants.js';

/**
 * Props for SpringParameterControl component
 */
export interface SpringParameterControlProps {
  className?: string;
  visualDuration: number;
  onVisualDurationChange: (values: number[]) => void;
  onReset?: () => void;
}

/**
 * Component for controlling spring animation parameters
 */
export const SpringParameterControl: FC<SpringParameterControlProps> = ({
  visualDuration,
  onVisualDurationChange,
  onReset,
  className,
}) => {
  return (
    <div className={cn('flex w-full flex-col gap-2 px-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase">Spring Parameters</h3>
        {onReset && (
          <button
            onClick={onReset}
            className={`
              cursor-pointer rounded-sm bg-neutral-700 px-2 py-1 text-xs text-white transition-colors
              hover:bg-neutral-600
            `}
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-col">
        <div className="flex justify-between text-sm font-medium">
          <Label.Root>
            {SPRING_PARAMS.VISUAL_DURATION.LABEL}: {visualDuration}
          </Label.Root>
          <span className="text-xs text-gray-500">{SPRING_PARAMS.VISUAL_DURATION.DESCRIPTION}</span>
        </div>
        <Slider.Root
          className="relative flex h-5 w-full touch-none items-center select-none"
          value={[visualDuration]}
          onValueChange={onVisualDurationChange}
          max={SPRING_PARAMS.VISUAL_DURATION.MAX}
          min={SPRING_PARAMS.VISUAL_DURATION.MIN}
          step={SPRING_PARAMS.VISUAL_DURATION.STEP}
        >
          <Slider.Track className="relative h-1 w-full grow rounded-full bg-neutral-700">
            <Slider.Range className="absolute h-full rounded-full bg-emerald-500/80" />
          </Slider.Track>
          <Slider.Thumb
            className="block size-4 rounded-full border border-emerald-300 bg-gray-800 shadow-sm outline-none"
            aria-label={SPRING_PARAMS.VISUAL_DURATION.LABEL}
          />
        </Slider.Root>
      </div>
    </div>
  );
};
