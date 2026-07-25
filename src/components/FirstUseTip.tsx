import { Lightbulb } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { cx } from './ui';
import type { TipId } from '@/domain/types';

/**
 * A one-time, in-context explanation shown the first time a feature is
 * actually relevant (plan §"Contextual first-use tips").
 *
 * Deliberately not part of onboarding: explaining the Group tab before anyone
 * has imported a plan teaches nothing. Dismissal is stored locally and the tip
 * never returns.
 */
export function FirstUseTip({
  id,
  children,
  className,
}: {
  id: TipId;
  children: React.ReactNode;
  className?: string;
}) {
  const dismissed = useApp((s) => s.settings.dismissedTips);
  const dismissTip = useApp((s) => s.dismissTip);
  if (dismissed.includes(id)) return null;

  return (
    <div
      className={cx(
        'mb-3 flex items-start gap-2.5 rounded-xl border border-warp-yellow/50 bg-warp-yellow/10 p-3',
        className,
      )}
      role="note"
    >
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <p className="flex-1 text-[13px] leading-relaxed text-primary">{children}</p>
      <button
        type="button"
        onClick={() => void dismissTip(id)}
        className="min-h-touch shrink-0 self-center rounded-lg px-2.5 text-[13px] font-bold text-warn active:bg-[var(--press)]"
      >
        Got it
      </button>
    </div>
  );
}
