import { useMemo } from 'react';
import { Utensils, Droplets, Armchair, Toilet, Backpack, Footprints } from 'lucide-react';
import { Card, cx } from './ui';
import { useApp } from '@/store/appStore';
import { planBreaks, BREAK_META } from '@/domain/breaks';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { formatMinutes, formatDuration, hhmmToMinutes } from '@/domain/time';
import { EVENT } from '@/config/event';
import type { BreakKind, DayId } from '@/domain/types';

const ICONS: Record<BreakKind, typeof Utensils> = {
  food: Utensils,
  water: Droplets,
  rest: Armchair,
  restroom: Toilet,
  locker: Backpack,
};

const ORDER: BreakKind[] = ['food', 'water', 'restroom', 'rest', 'locker'];

/**
 * Personal energy planner (add-on §7).
 *
 * A day of back-to-back sets quietly becomes a day with no lunch. Toggle what
 * you need and this finds the real gaps — and says plainly when there isn't
 * one, rather than inventing a window that would cost you a band.
 */
export function BreakPlannerCard({ day, className }: { day: DayId; className?: string }) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const breakNeeds = useApp((s) => s.settings.breakNeeds);
  const updateSettings = useApp((s) => s.updateSettings);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const locationById = useApp((s) => s.locationById);
  const allPerformances = useApp((s) => s.performances);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);
  const dayInfo = useDayScheduleStatus(day);

  const windows = useMemo(
    () =>
      breakNeeds.length
        ? planBreaks(activeUserId, day, breakNeeds, {
            selections,
            performanceById,
            locationById,
            allPerformances,
            crowd,
            turnoverBuffer,
            overrides,
            bounds: {
              open: hhmmToMinutes(EVENT.festivalHours.opens),
              close: hhmmToMinutes(EVENT.festivalHours.closes),
            },
          })
        : [],
    [activeUserId, day, breakNeeds, selections, performanceById, locationById, allPerformances, crowd, turnoverBuffer, overrides],
  );

  const toggle = (kind: BreakKind) => {
    const next = breakNeeds.includes(kind)
      ? breakNeeds.filter((k) => k !== kind)
      : [...breakNeeds, kind];
    void updateSettings({ breakNeeds: next });
  };

  const found = new Set(windows.map((w) => w.kind));
  const missing = breakNeeds.filter((k) => !found.has(k));

  return (
    <Card className={cx('p-4', className)}>
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-[15px] uppercase tracking-wide text-secondary">
        <Utensils size={15} aria-hidden /> Breaks &amp; energy
      </h2>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ORDER.map((kind) => {
          const Icon = ICONS[kind];
          const on = breakNeeds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              aria-pressed={on}
              className={cx(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
                on
                  ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white'
                  : 'border-subtle bg-[var(--surface-card)] text-secondary',
              )}
            >
              <Icon size={14} aria-hidden /> {BREAK_META[kind].label}
            </button>
          );
        })}
      </div>

      {breakNeeds.length === 0 ? (
        <p className="text-[13px] text-secondary">
          Tap what you&apos;ll need and the app finds the gaps in your day that are actually long
          enough.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {windows.map((w) => {
              const Icon = ICONS[w.kind];
              return (
                <li key={w.kind} className="rounded-xl bg-[var(--surface-sunken)] p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} className="text-accent" aria-hidden />
                    <span className="text-[13px] font-semibold text-primary">
                      Best {BREAK_META[w.kind].label.toLowerCase()} window:{' '}
                      {formatMinutes(w.startMinute)} – {formatMinutes(w.endMinute)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-secondary">
                    {w.location ? w.location.name : 'No mapped spot for this yet'}
                    {w.fromName && w.toName && (
                      <> · on your route from {w.fromName} to {w.toName}</>
                    )}
                    {!w.toName && w.fromName && <> · after {w.fromName}</>}
                  </p>
                  {w.walkMinutes > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <Footprints size={11} aria-hidden /> about {formatDuration(w.walkMinutes)} of
                      walking, leaving {formatDuration(w.durationMinutes - w.walkMinutes)} spare
                    </p>
                  )}
                  {w.usesEstimated && (
                    <p className="mt-0.5 text-[11px] text-warn">Uses an estimated set end time.</p>
                  )}
                </li>
              );
            })}
          </ul>

          {missing.length > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed text-warn">
              No gap long enough for {missing.map((k) => BREAK_META[k].label.toLowerCase()).join(' or ')} on
              this day. Something would have to give — try marking a set as Maybe.
            </p>
          )}
        </>
      )}

      {dayInfo.status !== 'complete' && breakNeeds.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          Based on a {dayInfo.status === 'empty' ? 'not yet entered' : 'partial'} schedule — gaps may
          close once the rest of the set times land.
        </p>
      )}
    </Card>
  );
}
