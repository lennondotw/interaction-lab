import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { FancyTimer, FancyTimerRef } from './fancy-timer.js';

const meta: Meta = {
  title: 'Components/FancyTimer',
};

export default meta;

export const Simple: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: function Component() {
    const timerRef = useRef<FancyTimerRef>(null);

    useEffect(() => {
      timerRef.current?.start();
    }, []);

    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <FancyTimer className="font-mono text-xl" ref={timerRef} />
      </div>
    );
  },
};

export const WithRefControl: StoryObj = {
  render: () => {
    const timerRef = useRef<FancyTimerRef>(null);

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <FancyTimer className="font-mono text-xl" ref={timerRef} />
        <div className="flex gap-2">
          <button
            className="cursor-pointer rounded-md border border-neutral-500/40 px-2 py-0.5 text-sm"
            onClick={() => timerRef.current?.start()}
          >
            Start
          </button>
          <button
            className="cursor-pointer rounded-md border border-neutral-500/40 px-2 py-0.5 text-sm"
            onClick={() => timerRef.current?.pause()}
          >
            Pause
          </button>
          <button
            className="cursor-pointer rounded-md border border-neutral-500/40 px-2 py-0.5 text-sm"
            onClick={() => timerRef.current?.reset()}
          >
            Reset
          </button>
        </div>
      </div>
    );
  },
};
