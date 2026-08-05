import { cn } from '@monorepo/utils';
import { ButtonHTMLAttributes, FC, ReactNode } from 'react';
import { ButtonVariants, buttonVariants } from './button-variants.js';

export const Button: FC<
  ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants & { allPossibleContents?: ReactNode[] }
> = ({ children, className, size, color, disabled, allPossibleContents, ...props }) => {
  return (
    <button className={cn(buttonVariants({ className, size, color, disabled }))} disabled={disabled} {...props}>
      {children}
      {allPossibleContents && allPossibleContents.length > 0 && (
        <div className="invisible flex h-0 flex-col overflow-clip leading-0">
          {allPossibleContents.map((content, index) => (
            <div key={index}>{content}</div>
          ))}
        </div>
      )}
    </button>
  );
};
