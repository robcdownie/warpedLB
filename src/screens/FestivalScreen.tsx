import { useMemo, useState } from 'react';
import {
  MapPin,
  Users,
  Check,
  Menu,
  Minimize2,
  AlertTriangle,
  CalendarClock,
  Handshake,
  LifeBuoy,
} from 'lucide-react';
import { Button, Card, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { LeaveByCard, useLeaveBy } from '@/components/LeaveByCard';
import { FindMyCrew } from '@/components/FindMyCrew';
import { FirstUseTip } from '@/components/FirstUseTip';
import { useApp } from '@/store/appStore';
import { useFestivalClock } from '@/hooks/useFestivalClock';
import { useConflicts } from '@/hooks/useConflicts';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { withEffectiveEnds } from '@/domain/endTimes';
import { attendWindow } from '@/domain/splitSet';
import { formatMinutes, formatDuration, formatTime, dayLabel, hhmmToMinutes } from '@/domain/time';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { Performance } from '@/domain/types';

/**
 * Festival Lock Screen (add-on §1).
 *
 * The planning app is excellent at a kitchen table and overwhelming in a
 * crowd. This mode answers the four questions you actually have while
 * standing in one: what's next, when do I leave, where is everyone, and is
 * anything about to clash. Everything else moves behind the menu.
 */
export function FestivalScreen({
  onOpenMenu,
  onOpenDrawer,
  onGoTab,
}: {
  onOpenMenu: (r: MenuRoute) => void;
  onOpenDrawer: () => void;
  onGoTab: (t: TabId) => void;
}) {
  const { day, atMinute, live } = useFestivalClock(15000);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const users = useApp((s) => s.users);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const updateSettings = useApp((s) => s.updateSettings);
  const putCheckIn = useApp((s) => s.putCheckIn);
  const conflicts = useConflicts(activeUserId);
  const dayInfo = useDayScheduleStatus(day);
  const leaveBy = useLeaveBy(activeUserId, day, atMinute, 1);
  const [crewOpen, setCrewOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const ends = useMemo(
    () => withEffectiveEnds(performances, turnoverBuffer),
    [performances, turnoverBuffer],
  );

  const { current, next } = useMemo(() => {
    const mine = selections
      .filter((s) => {
        if (s.userId !== activeUserId || !s.selected || s.attendanceDecision === 'skipping') return false;
        const p = performanceById.get(s.performanceId);
        return p?.day === day && !!p.startTime && !!p.stageId;
      })
      .map((s) => {
        const p = performanceById.get(s.performanceId)!;
        return { perf: p, window: attendWindow(p, s, ends.get(p.id)!)! };
      })
      .sort((a, b) => a.window.start - b.window.start);

    let current: Performance | undefined;
    let next: Performance | undefined;
    for (const m of mine) {
      if (atMinute >= m.window.start && atMinute < m.window.end) current = m.perf;
      else if (m.window.start > atMinute && !next) next = m.perf;
    }
    return { current, next };
  }, [selections, activeUserId, performanceById, day, ends, atMinute]);

  const focus = current ?? next;
  const focusStage = focus?.stageId ? locationById.get(focus.stageId) : undefined;
  const friendsHere = focus
    ? selections
        .filter((s) => s.performanceId === focus.id && s.selected && s.userId !== activeUserId)
        .map((s) => users.find((u) => u.id === s.userId))
        .filter((u): u is NonNullable<typeof u> => !!u)
    : [];
  const nextConflict = conflicts.find(
    (c) => c.severity !== 'info' && c.performanceIds.some((id) => performanceById.get(id)?.day === day),
  );

  const checkInHere = async () => {
    if (!focusStage) return;
    await putCheckIn({
      id: `checkin-${activeUserId}-${Date.now()}`,
      userId: activeUserId,
      locationId: focusStage.id,
      customCoordinates: null,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    });
    setCheckedIn(true);
    window.setTimeout(() => setCheckedIn(false), 2500);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header: big clock, way out, menu. */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-[calc(var(--safe-top)+0.75rem)]">
        <div className="flex-1">
          <div className="font-display text-[28px] leading-none text-primary tabular-nums">
            {formatMinutes(atMinute)}
          </div>
          <div className="text-[12px] text-secondary">
            {live ? dayLabel(day) : `Previewing ${dayLabel(day)}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void updateSettings({ festivalMode: false })}
          aria-label="Exit festival mode"
          className="min-h-touch min-w-touch flex items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-secondary"
        >
          <Minimize2 size={19} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="min-h-touch min-w-touch flex items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-secondary"
        >
          <Menu size={19} aria-hidden />
        </button>
      </div>

      <div className="flex-1 px-4 pb-[calc(var(--safe-bottom)+1rem)]">
        <FirstUseTip id="festival-mode">
          Festival mode keeps the day-of answers on one screen. Tap the shrink icon any time to get
          the full app back.
        </FirstUseTip>

        {/* 1. Leave-by is the top-priority answer once a plan exists. */}
        {leaveBy[0] && (
          <LeaveByCard
            className="mb-3"
            info={leaveBy[0]}
            artistName={artistById.get(performanceById.get(leaveBy[0].performanceId)?.artistId ?? '')?.name ?? 'Next set'}
          />
        )}

        {/* 2. On-now / next-up, big. */}
        {focus ? (
          <Card className={cx('mb-3 overflow-hidden p-0', current ? 'border-warp-pink/60' : 'border-warp-blue-500/40')}>
            <div
              className={cx(
                'px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white',
                current ? 'bg-warp-pink' : 'bg-warp-blue-500',
              )}
            >
              {current ? 'On now' : 'Next up'}
            </div>
            <button type="button" onClick={() => onGoTab('schedule')} className="block w-full p-4 text-left">
              <div className="font-display text-[26px] leading-tight text-primary">
                {artistById.get(focus.artistId)?.name ?? 'Artist'}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[15px] text-secondary">
                <MapPin size={15} aria-hidden />
                {focusStage?.name ?? 'Stage TBA'}
              </div>
              <div className="mt-1 text-[14px] font-semibold text-warp-pink">
                {current
                  ? `Started ${formatTime(focus.startTime)}`
                  : `${formatTime(focus.startTime)} · in ${formatDuration(
                      hhmmToMinutes(focus.startTime!) - atMinute,
                    )}`}
              </div>
              {friendsHere.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="flex -space-x-2">
                    {friendsHere.slice(0, 3).map((f) => (
                      <FriendAvatar key={f.id} user={f} size={22} className="ring-2 ring-[var(--surface-card)]" />
                    ))}
                  </span>
                  <span className="text-[12px] text-secondary">
                    {friendsHere.map((f) => f.name).join(' & ')} picked this too
                  </span>
                </div>
              )}
            </button>
          </Card>
        ) : (
          <Card className="mb-3 p-4">
            <div className="flex items-center gap-2 text-secondary">
              <CalendarClock size={18} aria-hidden />
              <span className="text-[14px]">
                {dayInfo.status === 'empty'
                  ? 'No set times entered for this day yet.'
                  : 'Nothing else on your plan for this day.'}
              </span>
            </div>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => onGoTab('schedule')}>
              Open Schedule
            </Button>
          </Card>
        )}

        {/* 3. Two big one-handed actions. */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Button variant="primary" className="py-4 text-[15px]" onClick={() => onGoTab('map')}>
            <MapPin size={18} aria-hidden /> Map
          </Button>
          <Button
            variant={checkedIn ? 'secondary' : 'yellow'}
            className="py-4 text-[15px]"
            onClick={() => void checkInHere()}
            disabled={!focusStage}
          >
            <Check size={18} aria-hidden />
            {checkedIn ? 'Checked in' : 'Check in'}
          </Button>
        </div>

        <Button variant="secondary" className="mb-3 w-full py-4 text-[15px]" onClick={() => setCrewOpen(true)}>
          <Users size={18} aria-hidden /> Find My Crew
        </Button>

        {/* 4. Next conflict, named. */}
        {nextConflict && (
          <Card className="mb-3 border-warp-warn/50 p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={15} className="text-warn" aria-hidden />
              <span className="font-display text-[14px] text-primary">{nextConflict.title}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-secondary">{nextConflict.message}</p>
            <button
              type="button"
              onClick={() => onGoTab('schedule')}
              className="mt-1.5 min-h-touch text-[13px] font-semibold text-accent"
            >
              Decide now →
            </button>
          </Card>
        )}

        {/* Honesty footer: this whole screen is only as good as the schedule. */}
        {dayInfo.status !== 'complete' && (
          <p className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-[11px] leading-relaxed text-secondary">
            {dayLabel(day)} is {dayInfo.status === 'empty' ? 'not entered' : 'only partly entered'} (
            {dayInfo.entered} of {dayInfo.expected} sets). Anything missing a time is unknown, not free.
          </p>
        )}

        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onGoTab('group')}
            className="flex min-h-touch items-center justify-center gap-1.5 text-[13px] font-semibold text-accent"
          >
            <Handshake size={15} aria-hidden /> Group day view
          </button>
          {/* The one setup-ish screen worth keeping a tap away on the day: a
              plain-text plan that survives a flat battery. */}
          <button
            type="button"
            onClick={() => onOpenMenu('emergency')}
            className="flex min-h-touch items-center justify-center gap-1.5 text-[13px] font-semibold text-accent"
          >
            <LifeBuoy size={15} aria-hidden /> Emergency plan
          </button>
        </div>
      </div>

      {crewOpen && (
        <FindMyCrew
          day={day}
          atMinute={atMinute}
          onClose={() => setCrewOpen(false)}
          onGoMap={() => {
            setCrewOpen(false);
            onGoTab('map');
          }}
        />
      )}
    </div>
  );
}
