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
  Footprints,
  Sun,
} from 'lucide-react';
import { Button, Card, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { LeaveByCard, useLeaveBy } from '@/components/LeaveByCard';
import { FindMyCrew } from '@/components/FindMyCrew';
import { FirstUseTip } from '@/components/FirstUseTip';
import { useApp } from '@/store/appStore';
import { useFestivalClock } from '@/hooks/useFestivalClock';
import { useConflicts } from '@/hooks/useConflicts';
import { conflictDay, conflictStartMinute, sortByClock } from '@/domain/conflicts';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { withEffectiveEnds, type EffectiveEnd } from '@/domain/endTimes';
import { attendWindow } from '@/domain/splitSet';
import { formatMinutes, formatDuration, formatTime, dayLabel, hhmmToMinutes } from '@/domain/time';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { LeaveByInfo } from '@/domain/leaveBy';
import type { AttendWindow } from '@/domain/splitSet';
import type { Performance } from '@/domain/types';

/** A set on the plan, with the window actually being attended. */
interface Stop {
  perf: Performance;
  window: AttendWindow;
  endKind: EffectiveEnd['kind'];
}

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
  const daylight = useApp((s) => s.settings.daylightMode);
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
        const end = ends.get(s.performanceId)!;
        const p = performanceById.get(s.performanceId)!;
        return { perf: p, window: attendWindow(p, s, end)!, endKind: end.kind };
      })
      .sort((a, b) => a.window.start - b.window.start);

    let current: Stop | undefined;
    let next: Stop | undefined;
    for (const m of mine) {
      if (atMinute >= m.window.start && atMinute < m.window.end) current = m;
      else if (m.window.start > atMinute && !next) next = m;
    }
    return { current, next };
  }, [selections, activeUserId, performanceById, day, ends, atMinute]);

  const focus = (current ?? next)?.perf;
  const focusStage = focus?.stageId ? locationById.get(focus.stageId) : undefined;
  const friendsHere = focus
    ? selections
        .filter((s) => s.performanceId === focus.id && s.selected && s.userId !== activeUserId)
        .map((s) => users.find((u) => u.id === s.userId))
        .filter((u): u is NonNullable<typeof u> => !!u)
    : [];
  // Detection order, not clock order — so at 8 PM this slot was still showing
  // the 1 PM warning under the heading "Decide now".
  const nextConflict = useMemo(
    () =>
      sortByClock(
        conflicts.filter((c) => {
          if (c.severity === 'info') return false;
          if (conflictDay(c, performanceById) !== day) return false;
          const start = conflictStartMinute(c, performanceById);
          return start === null || start >= atMinute - 30;
        }),
        performanceById,
      )[0],
    [conflicts, performanceById, day, atMinute],
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
        {/* Outdoors, dark mode is the harder read — and the theme follows the
            phone, so a phone on auto-dark is on the wrong one all afternoon
            with nothing saying so. One tap, where you'd notice. */}
        <button
          type="button"
          onClick={() => void updateSettings({ daylightMode: !daylight })}
          aria-label={daylight ? 'Turn off daylight mode' : 'Daylight mode — easier to read in sun'}
          aria-pressed={daylight}
          className={cx(
            'min-h-touch min-w-touch flex items-center justify-center rounded-xl',
            daylight ? 'bg-warp-yellow text-warp-ink' : 'bg-[var(--surface-sunken)] text-secondary',
          )}
        >
          <Sun size={19} aria-hidden />
        </button>
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

        {/* 1. Leave-by is the top-priority answer once a plan exists — unless a
            set is on now, in which case it belongs on the Next up card below,
            next to the band it is about. */}
        {leaveBy[0] && !current && (
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
              <div className="mt-1 text-[14px] font-semibold text-pink">
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

        {/* 2b. What's after this one — the answer to "should we cut out early?" */}
        {current && next && (
          <NextUpCard
            className="mb-3"
            current={current}
            next={next}
            leave={leaveBy.find((l) => l.performanceId === next.perf.id)}
            currentName={artistById.get(current.perf.artistId)?.name ?? 'This set'}
            nextName={artistById.get(next.perf.artistId)?.name ?? 'Next set'}
            nextStageName={
              (next.perf.stageId ? locationById.get(next.perf.stageId) : undefined)?.name ?? 'Stage TBA'
            }
            atMinute={atMinute}
            onOpen={() => onGoTab('schedule')}
          />
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

/**
 * "Next up", shown while a set is on.
 *
 * Standing in a crowd, the live question isn't what's on — you can see that —
 * it's whether to cut out early for the next one. That needs three facts next
 * to each other: who's next, how long the walk is, and whether staying to the
 * last song makes you late. The card does that arithmetic out loud instead of
 * leaving it to be done in a pit.
 */
function NextUpCard({
  current,
  next,
  leave,
  currentName,
  nextName,
  nextStageName,
  atMinute,
  className,
  onOpen,
}: {
  current: Stop;
  next: Stop;
  leave?: LeaveByInfo;
  currentName: string;
  nextName: string;
  nextStageName: string;
  atMinute: number;
  className?: string;
  onOpen: () => void;
}) {
  const walk = leave?.walkMinutes ?? null;
  // Where staying to the last note lands you. Positive = that many minutes late.
  const lateBy = walk === null ? null : current.window.end + walk - next.window.start;

  return (
    <Card className={cx('overflow-hidden p-0', className)}>
      <div className="bg-[var(--surface-sunken)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-secondary">
        Next up
      </div>
      <button type="button" onClick={onOpen} className="block w-full p-4 text-left">
        <div className="font-display text-[19px] leading-tight text-primary">{nextName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-secondary">
          <span className="flex items-center gap-1">
            <MapPin size={13} aria-hidden /> {nextStageName}
          </span>
          <span>
            {formatMinutes(next.window.start)} · in {formatDuration(next.window.start - atMinute)}
          </span>
          {walk !== null && (
            <span className="flex items-center gap-1">
              <Footprints size={13} aria-hidden /> ~{formatDuration(walk)} walk
            </span>
          )}
        </div>

        {leave && <LeaveByCard compact className="mt-2" info={leave} artistName={nextName} />}

        {lateBy !== null && (
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            {lateBy > 0 ? (
              <>
                Staying to the end of {currentName} ({formatMinutes(current.window.end)}) gets you
                there about {formatDuration(lateBy)} late — cut out about {formatDuration(lateBy)}{' '}
                early to catch the start.
              </>
            ) : (
              <>
                You can stay to the end of {currentName} ({formatMinutes(current.window.end)}) and
                still make the start.
              </>
            )}
            {current.endKind !== 'exact' && (
              <span className="text-muted"> That end time is an estimate.</span>
            )}
          </p>
        )}
      </button>
    </Card>
  );
}
