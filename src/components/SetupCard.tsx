import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, PartyPopper, Circle, MinusCircle } from 'lucide-react';
import { Card, Button, cx } from './ui';
import { useApp } from '@/store/appStore';
import { useSetupState } from '@/hooks/useSetupState';
import { PhaseModel } from '@/screens/onboarding/OnboardingFlow';
import type { SetupStepId } from '@/domain/setupChecklist';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from './MenuDrawer';

/**
 * The persistent "Finish Setting Up" card (plan §"Persistent setup checklist").
 *
 * Onboarding ending isn't the same as being ready, so the remaining work stays
 * visible on Now until it's done or deliberately postponed. It never blocks
 * the app — every step is optional to act on right now.
 */
export function SetupCard({
  onGoTab,
  onOpenMenu,
}: {
  onGoTab: (t: TabId) => void;
  onOpenMenu: (r: MenuRoute) => void;
}) {
  const state = useSetupState();
  const collapsed = useApp((s) => s.settings.setupCardCollapsed);
  const updateSettings = useApp((s) => s.updateSettings);
  const postpone = useApp((s) => s.postponeSetupStep);
  const [expanded, setExpanded] = useState(false);

  const go = (id: SetupStepId) => {
    switch (id) {
      case 'profile':
        return onOpenMenu('settings');
      case 'offline':
        return onOpenMenu('offline-test');
      case 'bands':
        return onGoTab('bands');
      case 'schedule':
        return onGoTab('schedule');
      case 'friends':
        return onOpenMenu('friends');
      case 'emergency':
        return onOpenMenu('emergency');
    }
  };

  // Ready + collapsed: a single quiet line, still reachable from Settings.
  if (state.ready && collapsed) {
    return (
      <button
        type="button"
        onClick={() => void updateSettings({ setupCardCollapsed: false })}
        className="mb-4 flex w-full items-center gap-2 rounded-xl bg-warp-ok/10 px-3 py-2 text-left"
      >
        <PartyPopper size={16} className="text-ok" aria-hidden />
        <span className="flex-1 text-[13px] font-semibold text-ok">Festival Ready</span>
        <ChevronDown size={16} className="text-ok" aria-hidden />
      </button>
    );
  }

  const showAll = expanded || !state.ready;
  const visible = showAll ? state.steps : [];

  return (
    <Card className={cx('mb-4 p-4', state.ready ? 'border-warp-ok/40' : 'border-warp-yellow/50')}>
      <div className="mb-2 flex items-center gap-2">
        {state.ready ? (
          <PartyPopper size={17} className="text-ok" aria-hidden />
        ) : (
          <Circle size={17} className="text-warn" aria-hidden />
        )}
        <h2 className="flex-1 font-display text-[15px] text-primary">
          {state.ready ? 'Festival Ready' : 'Finish Setting Up'}
        </h2>
        <span className="text-[12px] text-muted">
          {state.doneCount}/{state.totalCount}
        </span>
      </div>

      {state.ready && (
        <p className="mb-2 text-[13px] text-secondary">
          Everything essential is in place. You can keep this card handy or tuck it away.
        </p>
      )}

      <ul className="space-y-1">
        {visible.map((step) => (
          <li key={step.id}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => !step.done && go(step.id)}
                disabled={step.done}
                className={cx(
                  'flex min-h-touch flex-1 items-center gap-2 rounded-lg px-1 text-left text-[13px]',
                  !step.done && 'active:bg-[var(--press)]',
                )}
              >
                {step.done ? (
                  <Check size={15} className="shrink-0 text-ok" aria-hidden />
                ) : step.postponed ? (
                  <MinusCircle size={15} className="shrink-0 text-muted" aria-hidden />
                ) : (
                  <Circle size={15} className="shrink-0 text-warn" aria-hidden />
                )}
                <span
                  className={cx(
                    'flex-1',
                    step.done
                      ? 'text-secondary'
                      : step.postponed
                        ? 'text-muted line-through'
                        : 'font-semibold text-primary',
                  )}
                >
                  {step.label}
                </span>
              </button>
              {!step.done && !step.postponed && (
                <button
                  type="button"
                  onClick={() => void postpone(step.id)}
                  className="min-h-touch shrink-0 px-2 text-[12px] text-muted active:opacity-70"
                >
                  Later
                </button>
              )}
            </div>
            {!step.done && !step.postponed && (
              <p className="ml-7 -mt-0.5 mb-1 text-[11px] leading-snug text-muted">{step.detail}</p>
            )}
          </li>
        ))}
      </ul>

      {/* The same three phases the welcome flow ends on, so the card doubles
          as a reminder of where you are in the festival, not just a to-do. */}
      {showAll && !state.ready && (
        <details className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-2.5">
          <summary className="min-h-touch flex cursor-pointer items-center text-[13px] font-semibold text-secondary">
            How this app works
          </summary>
          <PhaseModel className="mt-2" />
        </details>
      )}

      <div className="mt-3 flex gap-2">
        {!state.ready && state.outstanding.length > 0 && (
          <Button
            variant="yellow"
            className="flex-1 py-1.5 text-[14px]"
            onClick={() => go(state.outstanding[0].id)}
          >
            Continue Setup
          </Button>
        )}
        {state.ready && (
          <>
            <Button
              variant="secondary"
              className="flex-1 py-1.5 text-[13px]"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
              {expanded ? 'Hide steps' : 'Show steps'}
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-[13px]"
              onClick={() => void updateSettings({ setupCardCollapsed: true })}
            >
              Tuck away
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
