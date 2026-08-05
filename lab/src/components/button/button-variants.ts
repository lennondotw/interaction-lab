import { cva, VariantProps } from '@monorepo/utils';

export const buttonVariants = cva(
  `
    cursor-pointer rounded-sm border transition-all duration-150 ease-out
    hover:opacity-90
    active:opacity-70
    dark:border-blue-500/20 dark:bg-blue-500/20
  `,
  {
    variants: {
      size: {
        md: 'px-2 py-0.5 text-sm',
        sm: 'px-1.5 py-0.5 text-xs',
      },
      color: {
        blue: `
          border-blue-600/40 bg-blue-600/80 text-white
          dark:border-blue-500/20 dark:bg-blue-500/20 dark:text-white
        `,
        red: `
          border-red-600/40 bg-red-600/80 text-white
          dark:border-red-500/20 dark:bg-red-500/20 dark:text-white
        `,
        yellow: `
          border-yellow-600/40 bg-yellow-600/80 text-white
          dark:border-yellow-500/20 dark:bg-yellow-500/20 dark:text-white
        `,
        green: `
          border-green-600/40 bg-green-600/80 text-white
          dark:border-green-500/20 dark:bg-green-500/20 dark:text-white
        `,
      },
      disabled: {
        true: `
          cursor-not-allowed opacity-50
          hover:opacity-50
          active:opacity-50
        `,
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      color: 'blue',
      disabled: false,
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
