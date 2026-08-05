import { createMatrixFor } from '#src/utils/ui/matrix/matrix.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, useMemo } from 'react';
import { toast } from 'sonner';
import { Button, ButtonVariants } from './index.js';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  parameters: {
    layout: 'centered',
  },
};

export default meta;

export const Default: StoryObj<typeof Button> = {
  render: () => {
    const colors: ButtonVariants['color'][] = useMemo(() => ['blue', 'red', 'yellow', 'green'], []);
    const sizes: ButtonVariants['size'][] = useMemo(() => ['sm', 'md'], []);
    const disabled = useMemo(() => [false, true], []);

    const containerStyles = useMemo<CSSProperties>(() => {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${colors.length}, 1fr)`,
        gap: '0.5rem',
        justifyItems: 'center',
        alignItems: 'center',
      };
    }, [colors]);

    return (
      <div className="flex flex-col items-center gap-6">
        {sizes.map((size) => (
          <div key={size} className="flex flex-col items-center gap-2">
            <h1 className="font-mono text-sm">size: {size}</h1>
            <div style={containerStyles}>
              {disabled.map((isDisabled) =>
                colors.map((color) => (
                  <Button
                    key={`${color}-${size}-${isDisabled}`}
                    color={color ?? undefined}
                    size={size}
                    disabled={isDisabled}
                  >
                    {color} {isDisabled ? 'disabled' : ''}
                  </Button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  },
};

const ButtonMatrix = createMatrixFor(Button);

export const MatrixVertical: StoryObj<typeof Button> = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => {
    return (
      <div
        className={`
          min-h-screen w-screen place-content-center border-red-50 p-2
          md:p-4
        `}
      >
        <ButtonMatrix
          matrix={{
            size: ['sm', 'md'],
            color: ['blue', 'red', 'yellow', 'green'],
          }}
          sections={{
            disabled: [false, true],
          }}
          componentProps={(context) => {
            const variant = `${context.matrixProps.color} ${context.matrixProps.size}`;
            return {
              children: variant,
              onClick: () => toast.info(`Clicked ${variant}`),
            };
          }}
          sectionsLayout="vertical"
        />
      </div>
    );
  },
};

export const MatrixHorizontal: StoryObj<typeof Button> = {
  parameters: {
    layout: 'fullscreen',
  },
  render: () => {
    return (
      <div
        className={`
          min-h-screen w-screen place-content-center border-red-50 p-2
          md:p-4
        `}
      >
        <ButtonMatrix
          matrix={{ color: ['blue', 'red', 'yellow', 'green'] }}
          sections={{ size: ['sm', 'md'] }}
          sectionsLayout="horizontal"
          componentProps={(context) => {
            const variant = `a ${context.sectionProps.size} button`;
            return {
              children: variant,
              onClick: () => toast.info(`Clicked ${variant}`),
            };
          }}
        />
      </div>
    );
  },
};
