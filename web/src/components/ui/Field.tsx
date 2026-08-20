import { useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink ' +
  'placeholder:text-ink-subtle transition-colors duration-100 ' +
  'hover:border-ink-subtle ' +
  'disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-subtle';

const INVALID = 'border-unsafe-line bg-danger-bg';

/**
 * Label + control + help/error wrapper.
 *
 * Wires the label, description and error message to the control via ids so the
 * relationship survives for screen readers — placeholder-as-label and
 * colour-only error states both fail that.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Receives the wiring props. */
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-muted">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="text-2xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-2xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(CONTROL, 'h-9', invalid && INVALID, className)} {...rest} />;
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(CONTROL, 'h-9 pr-8', invalid && INVALID, className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cn(CONTROL, 'py-2 leading-relaxed', invalid && INVALID, className)} {...rest} />;
}

/** Search input with a leading icon. */
export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input type="search" className={cn(CONTROL, 'h-9 pl-8')} {...rest} />
    </div>
  );
}
