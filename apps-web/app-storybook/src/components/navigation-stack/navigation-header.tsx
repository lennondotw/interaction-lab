import { cn } from '@monorepo/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { useNavigation } from './navigation-context.js';

export interface NavBackButtonProps {
  className?: string;
}

/** Pops the stack. Renders nothing at the root. */
export const NavBackButton: FC<NavBackButtonProps> = ({ className }) => {
  const { canGoBack, pop } = useNavigation();

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      data-testid="nav-back-button"
      onClick={pop}
      aria-label="Go back"
      className={cn(
        `
          flex size-7 cursor-pointer items-center justify-center rounded-sm text-neutral-700 transition-colors
          hover:bg-black/5
          dark:text-neutral-200
          dark:hover:bg-white/10
        `,
        className
      )}
    >
      <ChevronLeft className="size-5" />
    </button>
  );
};

export interface NavTitleProps {
  className?: string;
}

/** Title of the view currently on top of the stack. */
export const NavTitle: FC<NavTitleProps> = ({ className }) => {
  const { currentView } = useNavigation();

  return (
    <div
      data-testid="nav-title"
      className={cn(
        `
          h-7 text-sm/7 font-medium text-black
          dark:text-white
        `,
        className
      )}
    >
      {currentView?.title}
    </div>
  );
};

export interface NavBreadcrumbProps {
  className?: string;
}

/** The whole path, root first. */
export const NavBreadcrumb: FC<NavBreadcrumbProps> = ({ className }) => {
  const { stack } = useNavigation();

  return (
    <nav
      data-testid="nav-breadcrumb"
      aria-label="Breadcrumb"
      className={cn(
        `
          flex items-center overflow-hidden text-xs whitespace-nowrap text-black/50
          dark:text-white/50
        `,
        className
      )}
    >
      {stack.map((view, i) => (
        <span key={view.id} className="flex items-center" data-testid={`breadcrumb-item-${i}`}>
          {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
          <span>{view.title}</span>
        </span>
      ))}
    </nav>
  );
};

export interface NavHeaderProps {
  children: ReactNode;
  className?: string;
}

/** Standard header padding + stacking. */
export const NavHeader: FC<NavHeaderProps> = ({ children, className }) => (
  <div className={cn('flex flex-col gap-2 p-4', className)}>{children}</div>
);

/** Row layout for the back button and title. */
export const NavHeaderRow: FC<NavHeaderProps> = ({ children, className }) => (
  <div className={cn('flex items-center gap-2', className)}>{children}</div>
);
