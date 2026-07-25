import type { ReactNode, ButtonHTMLAttributes } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** A themed card surface. */
export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <As className={cx('surface-card rounded-2xl shadow-sm', className)}>{children}</As>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'yellow';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-warp-blue-500 text-white active:bg-warp-blue-600',
  yellow: 'bg-warp-yellow text-warp-ink active:bg-warp-yellow-dark font-bold',
  secondary:
    'bg-[var(--surface-sunken)] text-primary border border-subtle active:opacity-80',
  ghost: 'bg-transparent text-primary active:bg-[var(--press)]',
  danger: 'bg-warp-danger text-white active:opacity-90',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        'min-h-touch inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold',
        'transition disabled:opacity-40 disabled:pointer-events-none',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Screen scaffold: sets up scroll area with safe-area padding + bottom-nav gap. */
export function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        // No safe-area term here: Screen renders inside <main>, below the
        // TopBar, which already absorbs the top inset. Double-counting it
        // opened a ~59pt dead band on every screen in the installed PWA.
        'mx-auto w-full max-w-[560px] px-4 pb-28 pt-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="font-display text-[15px] uppercase tracking-wide text-secondary">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Pill({
  children,
  color = 'default',
  className,
}: {
  children: ReactNode;
  color?: 'default' | 'pink' | 'blue' | 'yellow' | 'danger' | 'ok' | 'warn';
  className?: string;
}) {
  const colors: Record<string, string> = {
    default: 'bg-[var(--surface-sunken)] text-secondary',
    pink: 'bg-warp-pink/15 text-warp-pink',
    blue: 'bg-accent-soft text-accent',
    yellow: 'bg-warp-yellow/20 text-warn',
    danger: 'bg-warp-danger/15 text-danger',
    ok: 'bg-warp-ok/15 text-ok',
    warn: 'bg-warp-warn/20 text-warn',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
