import { Button } from '#src/components/button/button.js';
import { cn } from '@monorepo/utils';
import { FC } from 'react';
import { Drawer } from 'vaul';

export const HelpTrigger: FC = () => {
  return (
    <Drawer.Root dismissible container={document.body} modal>
      <Drawer.Trigger>
        <Button size="sm" color="blue">
          About this
        </Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay
          className={cn(`
            fixed inset-0 bg-black/10
            sm:bg-black/20
            dark:bg-white/5
            sm:dark:bg-white/10
          `)}
        />
        <div
          className={cn(`
            fixed inset-0 flex flex-col items-center justify-end
            sm:justify-center sm:px-6 sm:py-4
          `)}
        >
          <HelpContent />
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export const HelpContent: FC = () => {
  return (
    <Drawer.Content
      className={cn(`
        flex h-fit max-h-[85vh] max-w-2xl flex-col rounded-t-lg rounded-b-none bg-neutral-100 outline-none
        sm:max-h-[80vh] sm:rounded-xl
        dark:bg-neutral-950
      `)}
    >
      <Drawer.Handle
        className={cn(`
          mt-2! mb-1! h-1! w-12! shrink-0! grow-0! basis-1! rounded-full! bg-neutral-300! transition-all!
          sm:w-16!
          dark:bg-neutral-700!
        `)}
      ></Drawer.Handle>
      <div
        className={cn(`
          flex flex-col overflow-x-clip overflow-y-auto mask-t-from-[calc(100%-24px)] mask-alpha pb-6
          sm:pb-5
        `)}
      >
        <Drawer.Title
          className={cn(`
            mt-4 px-4 text-xl font-semibold
            sm:px-8
          `)}
        >
          Physics-Based Text Stream Smoothing
        </Drawer.Title>
        <Drawer.Description
          className={cn(`
            mt-2 px-4
            sm:px-8
          `)}
        >
          <p>
            A smooth, physics-based text streaming renderer that simulates LLM streaming output with adaptive velocity
            control. Click the buttons to simulate receiving delta chunks, then click &quot;Flush&quot; when the final
            chunk arrives.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Spring Physics Simulation</h4>
          <p>
            The cursor position is driven by a spring animation with floating-point precision, then rounded to integer
            grapheme indices. This creates natural, organic motion that feels responsive yet smooth.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Adaptive Velocity Control</h4>
          <p>
            When the buffer is long, the cursor accelerates to catch up quickly. As the buffer shortens, it decelerates
            smoothly. This adaptive behavior ensures graceful handling of network jitter and variable model output
            speeds, maintaining visual continuity even under unstable conditions.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">High Refresh Rate Support</h4>
          <p>
            The cursor position can update as frequently as your display&apos;s native refresh rate—whether 60Hz or
            360Hz—using requestAnimationFrame. The physics calculations are frame-rate independent, ensuring consistent
            behavior across all devices.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Zero React Re-renders During Animation</h4>
          <p>
            All animations are driven by Motion values that update outside React&apos;s render cycle. The component
            never re-renders during streaming, eliminating performance bottlenecks and ensuring buttery-smooth
            animations even with large amounts of text.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Intelligent Flush Behavior</h4>
          <p>
            When you click &quot;Flush&quot; after receiving the final chunk, the system switches from spring physics to
            inertia-based animation. This smoothly decelerates the cursor to the end of the buffer, maintaining the
            current velocity for a natural finish.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Grapheme-Aware Rendering</h4>
          <p>
            Character segmentation and animation calculations are based on grapheme clusters (using Intl.Segmenter), not
            UTF-16 code units. This means emojis, combining characters, and other complex Unicode sequences render
            without visual artifacts or broken intermediate states. The perceived animation speed remains constant
            regardless of character complexity.
          </p>
          <h4 className="mt-4 mb-2 text-base font-semibold">Line-Break Stability</h4>
          <p>
            A small portion of the buffer is rendered invisibly after the cursor position. This trailing content allows
            the layout engine to pre-calculate line breaks, preventing the cursor from jumping vertically when text
            wraps at line endings during streaming.
          </p>
        </Drawer.Description>
      </div>
    </Drawer.Content>
  );
};
