import { Star, Heart, Circle } from 'lucide-react';
import type { Priority } from '@/domain/types';
import { cx } from './ui';

// Theme-token colors so priority chips stay readable in light and dark mode.
export const PRIORITY_META: Record<
  Priority,
  { label: string; short: string; Icon: typeof Star; color: string; bg: string }
> = {
  'must-see': {
    label: 'Must See',
    short: 'Must',
    Icon: Star,
    color: 'var(--color-warp-pink)',
    bg: 'color-mix(in srgb, var(--color-warp-pink) 14%, transparent)',
  },
  'want-to-see': {
    label: 'Want to See',
    short: 'Want',
    Icon: Heart,
    color: 'var(--accent-text)',
    bg: 'color-mix(in srgb, var(--accent-text) 14%, transparent)',
  },
  optional: {
    // One word everywhere — the badge said "Maybe" while the control and
    // filters said "Optional", which read as two different tiers.
    label: 'Maybe',
    short: 'Maybe',
    Icon: Circle,
    color: 'var(--text-muted)',
    bg: 'color-mix(in srgb, var(--text-muted) 14%, transparent)',
  },
};

const ORDER: Priority[] = ['must-see', 'want-to-see', 'optional'];

/** Segmented control for choosing a selection's priority. */
export function PriorityControl({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-sunken)] p-1"
      role="radiogroup"
      aria-label="Priority"
    >
      {ORDER.map((p) => {
        const m = PRIORITY_META[p];
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={cx(
              'min-h-touch flex items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-semibold transition',
              active ? 'shadow-sm' : 'opacity-70',
            )}
            style={{
              background: active ? m.bg : 'transparent',
              color: active ? m.color : 'var(--text-secondary)',
            }}
          >
            <m.Icon size={15} aria-hidden fill={active && p !== 'optional' ? m.color : 'none'} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small priority badge (icon + text, color-independent) for cards. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: m.bg, color: m.color }}
    >
      <m.Icon size={11} aria-hidden fill={priority !== 'optional' ? m.color : 'none'} />
      {m.short}
    </span>
  );
}
