import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white border border-brand-700 hover:bg-brand-800 hover:border-brand-800 active:bg-brand-900',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-raised active:bg-line',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:bg-surface-raised hover:text-ink',
  // Destructive actions are outlined rather than filled: a wall of red buttons
  // would compete with the UNSAFE classification colour, which must stay the
  // loudest red on screen.
  danger:
    'bg-surface text-danger border border-unsafe-line hover:bg-danger-bg active:bg-unsafe-line/40',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Rendered before the label. Decorative only — never the sole meaning. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      // A loading button must stay in the tab order and keep announcing itself,
      // so it is aria-disabled rather than removed from the a11y tree.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium',
        'transition-colors duration-100 select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control is meaningless to a screen reader without it. */
  label: string;
  variant?: Variant;
}

export function IconButton({ label, variant = 'ghost', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      // 36px square clears the WCAG 2.2 AA 24x24 minimum target with margin.
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-control',
        'transition-colors duration-100',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}
