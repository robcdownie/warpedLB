import { useMemo, useRef } from 'react';
import { X, Users, MapPin, Handshake, Clock3, UserRoundX } from 'lucide-react';
import { Button, cx } from './ui';
import { FriendAvatar } from './FriendAvatar';
import { useApp } from '@/store/appStore';
import { useGroupCtx } from '@/hooks/useGroupCtx';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { useMeetups } from '@/hooks/useMeetups';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { useModalA11y } from '@/hooks/useModalA11y';
import { positionWithCheckin, positionBadge, positionA11yLabel } from '@/domain/positions';
import { formatMinutes } from '@/domain/time';
import type { DayId } from '@/domain/types';

/**
 * One tap, one answer: where is everyone and where should we meet (add-on §5).
 *
 * Every row states its SOURCE — planned, checked in, or not imported — because
 * during the festival the difference between "Sam is planned at BeatBox" and
 * "Sam checked in at BeatBox 7 minutes ago" decides whether you walk over.
 */
export function FindMyCrew({
  day,
  atMinute,
  onClose,
  onGoMap,
}: {
  day: DayId;
  atMinute: number;
  onClose: () => void;
  onGoMap: () => void;
}) {
  const ctx = useGroupCtx();
  const plans = usePlanStatuses();
  const checkins = useApp((s) => s.checkins);
  const staleMinutes = useApp((s) => s.settings.staleMinutes);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const meetups = useMeetups(day, 1);
  const dayInfo = useDayScheduleStatus(day);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(true, panelRef, onClose);

  const nowMs = Date.now();
  const rows = useMemo(
    () =>
      plans.all.map((u) => {
        const info = plans.byUser.get(u.id)!;
        if (!info.eligible) return { user: u, info, pos: null };
        return {
          user: u,
          info,
          pos: positionWithCheckin(u.id, day, atMinute, checkins, nowMs, staleMinutes, {
            selections: ctx.selections,
            performanceById: ctx.performanceById,
            locationById: ctx.locationById,
            allPerformances: ctx.allPerformances,
            crowd: ctx.crowd,
            turnoverBuffer: ctx.turnoverBuffer,
            overrides: ctx.overrides,
          }),
        };
      }),
    [plans, ctx, day, atMinute, checkins, nowMs, staleMinutes],
  );

  const best = meetups[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label="Find my crew">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 max-h-[85%] w-full overflow-y-auto rounded-t-3xl p-4 pb-[calc(var(--safe-bottom)+1rem)] shadow-2xl outline-none"
        style={{ background: 'var(--surface-card)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Users size={19} className="text-accent" aria-hidden />
          <h2 className="flex-1 font-display text-[18px] text-primary">Find my crew</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-touch min-w-touch -m-2 flex items-center justify-center text-muted"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <p className="mb-3 text-[12px] text-muted">
          As of {formatMinutes(atMinute)}. Positions come from each person&apos;s schedule — not
          live GPS. A check-in only shows on the phone that made it.
        </p>

        <ul className="space-y-2">
          {rows.map(({ user, info, pos }) => (
            <li
              key={user.id}
              className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-sunken)] p-2.5"
              aria-label={pos ? positionA11yLabel(pos, user.name) : `${user.name}, plan not imported`}
            >
              <FriendAvatar user={user} size={34} ring dim={!info.eligible} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold text-primary">
                    {user.id === activeUserId ? `${user.name} (you)` : user.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[12px] text-secondary">
                  {pos ? (
                    <>
                      <MapPin size={11} aria-hidden />
                      <span className="truncate">{pos.label}</span>
                    </>
                  ) : (
                    <>
                      <UserRoundX size={11} aria-hidden />
                      <span>Plan not imported — position unknown, not free</span>
                    </>
                  )}
                </div>
                {pos?.staleCheckIn && (
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock3 size={10} aria-hidden />
                    Last check-in {pos.staleCheckIn.locationName ?? 'a custom pin'},{' '}
                    {pos.staleCheckIn.ageMinutes}m ago
                  </div>
                )}
              </div>
              <span
                className={cx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  !pos
                    ? 'bg-[var(--surface-card)] text-muted'
                    : pos.source === 'manual'
                      ? 'bg-warp-ok/15 text-ok'
                      : 'bg-accent-soft text-accent',
                )}
              >
                {pos ? positionBadge(pos) : 'Unknown'}
              </span>
            </li>
          ))}
        </ul>

        {/* Meetup suggestion — explicitly caveated when the day is partial. */}
        <div className="mt-4 rounded-xl border border-subtle p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Handshake size={15} className="text-accent" aria-hidden />
            <span className="font-display text-[14px] text-primary">Best meeting point</span>
          </div>
          {best ? (
            <>
              <p className="text-[14px] font-semibold text-primary">{best.location.name}</p>
              <p className="text-[13px] text-secondary">
                Suggested window {formatMinutes(best.startMinute)} – {formatMinutes(best.endMinute)}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">{best.reason}</p>
            </>
          ) : (
            <p className="text-[13px] text-secondary">
              No window where two or more of you are free long enough.
            </p>
          )}
          {dayInfo.status !== 'complete' && (
            <p className="mt-1.5 text-[11px] font-semibold text-warn">
              Provisional — {dayInfo.entered} of {dayInfo.expected} sets entered for this day.
            </p>
          )}
          {plans.missing.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              Doesn&apos;t include {plans.missing.map((u) => u.name).join(' or ')} — no plan imported.
            </p>
          )}
        </div>

        <Button variant="primary" className="mt-4 w-full py-3" onClick={onGoMap}>
          <MapPin size={17} aria-hidden /> Show on map
        </Button>
      </div>
    </div>
  );
}
