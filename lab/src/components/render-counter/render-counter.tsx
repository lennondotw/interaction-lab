import { buttonVariants } from '#src/components/button/index.js';
import { cn } from '@monorepo/utils';
import { ComponentProps, FC, useRef, useState } from 'react';

export const RenderCounterDemo: FC = () => {
  const [_, setCount] = useState(0);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <RenderCounter className="font-mono text-sm" />
      <button className={cn(buttonVariants({ color: 'blue', size: 'md' }))} onClick={() => setCount((c) => c + 1)}>
        Trigger re-render
      </button>
    </div>
  );
};

export const RenderCounterPointerDemo: FC = () => {
  const [_, setCount] = useState(0);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div>Move mouse or drag over the box</div>
      <div
        className="size-[300px] touch-none border bg-neutral-500/20"
        onPointerMove={() => setCount((c) => c + 1)}
      ></div>
      <RenderCounter className="font-mono text-sm" />
    </div>
  );
};

export const RenderCounter: FC<ComponentProps<'div'>> = (props) => {
  const count = useRef(0);
  // eslint-disable-next-line react-hooks/refs
  count.current++;
  // eslint-disable-next-line react-hooks/refs
  return <div {...props}>Renders: {count.current}</div>;
};
