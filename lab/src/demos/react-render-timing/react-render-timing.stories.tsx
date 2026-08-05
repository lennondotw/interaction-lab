import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSimpleConsoleLogger } from '../simple-console/simple-console-logger.js';
import { SimpleConsoleRender } from '../simple-console/simple-console.js';
import { ReactRenderTiming } from './react-render-timing.js';

const meta: Meta = {
  title: 'Demos/ReactRenderTiming',
};

export default meta;

export const Default: StoryObj = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => {
    const simpleConsole = useSimpleConsoleLogger();
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 p-4">
        <SimpleConsoleRender className="h-[20lh] self-stretch" console={simpleConsole} />
        <ReactRenderTiming logger={simpleConsole} />
      </div>
    );
  },
};
