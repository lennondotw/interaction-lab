import { buttonVariants } from '#src/components/button/index.js';
import { faker } from '@faker-js/faker';
import { cn } from '@monorepo/utils';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSimpleConsoleLogger } from './simple-console-logger.js';
import { SimpleConsoleRender } from './simple-console.js';

const meta: Meta = {
  title: 'Demos/SimpleConsole',
};

export default meta;

export const Default: StoryObj = {
  render: () => {
    const simpleConsole = useSimpleConsoleLogger();

    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-4">
        <SimpleConsoleRender className="self-stretch" console={simpleConsole} />
        <button
          className={cn(buttonVariants({ color: 'blue', size: 'md' }))}
          onClick={() => {
            simpleConsole.log(faker.lorem.sentence());
          }}
        >
          Log something
        </button>
      </div>
    );
  },
};
