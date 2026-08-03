import { cn } from '@monorepo/utils';
import { FC, ReactNode } from 'react';

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  /**
   * Every hint this field can display. The widest is reserved up front, so
   * switching between them does not resize the field and shove the rest of the
   * control row sideways. Omit for a hint that never changes.
   */
  allPossibleHints?: readonly string[];
}

export const Field: FC<FieldProps> = ({ label, children, hint, allPossibleHints }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex flex-row items-baseline gap-2">
      <div
        className={`
          text-xs font-medium text-neutral-600
          dark:text-neutral-400
        `}
      >
        {label}
      </div>
      {(hint !== undefined || allPossibleHints !== undefined) && (
        <div
          className={`
            flex flex-col font-mono text-[10px] text-neutral-400
            dark:text-neutral-500
          `}
        >
          {/* Non-breaking space keeps the row's height stable when this field
              has a hint in some states but not others. */}
          <span>{hint ?? '\u00A0'}</span>
          {allPossibleHints !== undefined && (
            <span aria-hidden="true" className="invisible flex h-0 flex-col overflow-clip leading-0">
              {allPossibleHints.map((candidate) => (
                <span key={candidate}>{candidate}</span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
    {children}
  </div>
);

interface SegmentedProps<T extends string | number> {
  options: readonly { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Handle for probes. Worth setting whenever a story has two of these on screen, because
   * the labels are short and collide readily — a cell size of `1` and a `k` of `1` are the
   * same string, so `button:has-text("1")` silently picks the wrong group.
   */
  testId?: string;
}

export const Segmented = <T extends string | number>({ options, value, onChange, testId }: SegmentedProps<T>) => (
  <div
    data-testid={testId}
    className={`
      flex w-fit flex-row rounded-lg border border-neutral-200 bg-neutral-100 p-0.5
      dark:border-neutral-700 dark:bg-neutral-800
    `}
  >
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        title={option.title}
        disabled={option.disabled}
        onClick={() => onChange(option.value)}
        className={cn(
          `
            rounded-md px-2.5 py-1 font-mono text-xs transition-colors
            disabled:cursor-not-allowed disabled:opacity-40
          `,
          option.value === value
            ? `
              bg-white text-neutral-900 shadow-sm
              dark:bg-neutral-600 dark:text-neutral-50
            `
            : `
              text-neutral-500
              not-disabled:hover:text-neutral-900
              dark:text-neutral-400 dark:not-disabled:hover:text-neutral-100
            `
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const Toggle: FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ label, checked, onChange, disabled = false }) => (
  <label
    className={cn(
      `
        flex flex-row items-center gap-1.5 text-xs text-neutral-600 select-none
        dark:text-neutral-400
      `,
      disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
    )}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="size-3.5 accent-indigo-500"
    />
    {label}
  </label>
);

export const Stat: FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent = false }) => (
  <div className="flex flex-col gap-0.5">
    <div
      className={`
        text-[10px] tracking-wide text-neutral-400 uppercase
        dark:text-neutral-500
      `}
    >
      {label}
    </div>
    <div
      className={cn(
        'font-mono text-sm tabular-nums',
        accent
          ? `
            text-indigo-600
            dark:text-indigo-400
          `
          : `
            text-neutral-800
            dark:text-neutral-200
          `
      )}
    >
      {value}
    </div>
  </div>
);
