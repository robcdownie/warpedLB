import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, Check, Split } from 'lucide-react';
import type { Conflict, ConflictAction } from '@/domain/conflicts';
import { useApp } from '@/store/appStore';
import { SplitSetSheet } from './SplitSetSheet';
import { Card, cx } from './ui';

// Colors come from theme tokens so they stay readable in light AND dark;
// bg/border washes are derived from the same color via color-mix.
const SEVERITY_META = {
  high: { Icon: AlertTriangle, color: 'var(--color-warp-pink)', label: 'Conflict' },
  warn: { Icon: AlertCircle, color: 'var(--warn-text)', label: 'Warning' },
  info: { Icon: Info, color: 'var(--accent-text)', label: 'Note' },
} as const;

export function ConflictCard({
  conflict,
  userId,
  onIgnore,
}: {
  conflict: Conflict;
  userId: string;
  onIgnore?: (c: Conflict) => void;
}) {
  const setAttendance = useApp((s) => s.setAttendance);
  const setSplitPlan = useApp((s) => s.setSplitPlan);
  const m = SEVERITY_META[conflict.severity];
  const [splitting, setSplitting] = useState<string[] | null>(null);

  const handle = async (action: ConflictAction) => {
    const ids = action.performanceIds ?? conflict.performanceIds;
    if (action.kind === 'attend' && action.attendId) {
      for (const pid of ids) {
        await setAttendance(userId, pid, pid === action.attendId ? 'attending' : 'skipping', pid !== action.attendId);
        // Choosing one whole set clears any earlier split trim on it.
        if (pid === action.attendId) {
          await setSplitPlan(userId, pid, { arriveLateMinutes: 0, leaveEarlyMinutes: 0 });
        }
      }
    } else if (action.kind === 'undecided') {
      for (const pid of ids) await setAttendance(userId, pid, 'undecided');
    } else if (action.kind === 'split') {
      setSplitting(ids);
    } else if (action.kind === 'ignore') {
      onIgnore?.(conflict);
    }
  };

  return (
    <Card
      className="p-3"
      // color-independent: icon + label text + border, not color alone
    >
      <div
        className="rounded-lg border p-3"
        style={{
          background: `color-mix(in srgb, ${m.color} 9%, transparent)`,
          borderColor: `color-mix(in srgb, ${m.color} 35%, transparent)`,
        }}
      >
        <div className="mb-1 flex items-center gap-2">
          <m.Icon size={18} style={{ color: m.color }} aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: m.color }}>
            {m.label}
          </span>
          <span className="font-display text-[14px] text-primary">{conflict.title}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-secondary">{conflict.message}</p>
        {conflict.usesEstimatedTime && (
          <p className="mt-1 text-[11px] font-semibold text-warn">
            Uses an estimated end time.
          </p>
        )}
        {conflict.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {conflict.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handle(a)}
                className={cx(
                  'min-h-touch inline-flex items-center gap-1 rounded-lg px-3 text-[13px] font-semibold',
                  a.kind === 'attend'
                    ? 'bg-warp-blue-500 text-white'
                    : a.kind === 'split'
                      ? 'border border-warp-pink/50 bg-warp-pink/10 text-warp-pink'
                      : 'border border-subtle bg-[var(--surface-card)] text-secondary',
                )}
              >
                {a.kind === 'attend' && <Check size={14} aria-hidden />}
                {a.kind === 'split' && <Split size={14} aria-hidden />}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {splitting && (
        <SplitSetSheet
          userId={userId}
          performanceIds={splitting}
          onClose={() => setSplitting(null)}
        />
      )}
    </Card>
  );
}
