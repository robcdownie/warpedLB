import { useMemo, useState } from 'react';
import { Clock, MapPin, Footprints, ChevronRight, Users, AlertTriangle, Handshake, CalendarClock, Coffee, Maximize2 } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { FriendAvatar } from '@/components/FriendAvatar';
import { MeetupCard } from '@/components/MeetupCard';
import { SetupCard } from '@/components/SetupCard';
import { ScheduleStatusStrip } from '@/components/ScheduleStatusStrip';
import { LeaveByCard, useLeaveBy } from '@/components/LeaveByCard';
import { FindMyCrew } from '@/components/FindMyCrew';
import { BreakPlannerCard } from '@/components/BreakPlannerCard';
import { useApp } from '@/store/appStore';
import { useFestivalClock } from '@/hooks/useFestivalClock';
import { useGroupCtx } from '@/hooks/useGroupCtx';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { useConflicts } from '@/hooks/useConflicts';
import { useMeetups } from '@/hooks/useMeetups';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { formatTime, formatMinutes, formatDuration, hhmmToMinutes, dayLabel } from '@/domain/time';
import { withEffectiveEnds } from '@/domain/endTimes';
import { travelMinutes, overrideMap } from '@/domain/travel';
import { positionWithCheckin, positionBadge, positionA11yLabel } from '@/domain/positions';
import { attendWindow } from '@/domain/splitSet';
import { ART } from '@/config/event';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { Performance } from '@/domain/types';

export function NowDashboard({
  onOpenMenu,
  onGoTab,
}: {
  onOpenMenu: (r: MenuRoute) => void;
  onGoTab: (t: TabId) => void;
}) {
  const { now, day, atMinute: nowMinute, live } = useFestivalClock(15000);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const checkins = useApp((s) => s.checkins);
  const staleMinutes = useApp((s) => s.settings.staleMinutes);
  const updateSettings = useApp((s) => s.updateSettings);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overridesArr = useApp((s) => s.travelOverrides);
  const ctx = useGroupCtx();
  const plans = usePlanStatuses();
  const dayInfo = useDayScheduleStatus(day);
  const [crewOpen, setCrewOpen] = useState(false);

  const ends = useMemo(() => withEffectiveEnds(performances, turnoverBuffer), [performances, turnoverBuffer]);
  const omap = useMemo(() => overrideMap(overridesArr), [overridesArr]);
  const conflicts = useConflicts(activeUserId);
  const meetups = useMeetups(day, 3);
  const leaveBy = useLeaveBy(activeUserId, day, nowMinute, 1);

  // Current or next selected performance for the active user. Split-set trims
  // are honored so "on now" matches the plan the user actually made.
  const myStops = useMemo(() => {
    return selections
      .filter((s) => {
        if (s.userId !== activeUserId || !s.selected || s.attendanceDecision === 'skipping') return false;
        const p = performanceById.get(s.performanceId);
        return p?.day === day && p.type === 'main' && p.startTime && p.stageId;
      })
      .map((s) => {
        const p = performanceById.get(s.performanceId)!;
        return { perf: p, window: attendWindow(p, s, ends.get(p.id)!)! };
      })
      .sort((a, b) => a.window.start - b.window.start);
  }, [selections, activeUserId, performanceById, day, ends]);

  const { current, next, previous } = useMemo(() => {
    let current: Performance | undefined;
    let next: Performance | undefined;
    let previous: Performance | undefined;
    for (const { perf, window } of myStops) {
      if (nowMinute >= window.start && nowMinute < window.end) current = perf;
      else if (window.start > nowMinute && !next) next = perf;
      else if (window.end <= nowMinute) previous = perf;
    }
    return { current, next, previous };
  }, [myStops, nowMinute]);

  const focus = current ?? next;
  const upcomingConflicts = conflicts.filter((c) => c.severity !== 'info').slice(0, 3);

  return (
    <Screen>
      {/* Header strip */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[22px] text-primary">
            {live ? dayLabel(day) : 'Festival plan'}
          </h1>
          <p className="text-[13px] text-secondary">
            {live ? `It's ${formatMinutes(nowMinute)}` : 'Planning view'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!live && (
            <span className="min-h-9 inline-flex items-center rounded-full bg-warp-yellow px-3 text-[12px] font-bold text-warp-ink">
              Previewing {dayLabel(day)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void updateSettings({ festivalMode: true })}
            aria-label="Festival mode"
            title="Festival mode"
            className="min-h-touch min-w-touch flex items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-secondary"
          >
            <Maximize2 size={17} aria-hidden />
          </button>
        </div>
      </div>

      {/* Simulated-time banner — "in 3 hr 5 min" a day before the festival
          read as real and contradicted the countdown. Same idiom as the
          Demo Mode banner. */}
      {!live && (
        <div className="mb-3 rounded-lg bg-warp-yellow/15 px-3 py-1.5 text-[12px] font-semibold text-warn">
          Times below simulate {dayLabel(day)} at {formatMinutes(nowMinute)} — the festival hasn&apos;t started.
        </div>
      )}

      {/* One line of context on how complete this day is — the full strip
          (with Mark Day Complete) lives on Schedule, where you'd act on it.
          Anything taller than this pushes the time-critical answer below the
          fold, which is the opposite of what a festival screen is for. */}
      <ScheduleStatusStrip day={day} compact />

      {/* 1. Leave-by comes first: it's the only time-critical number. */}
      {leaveBy[0] && (
        <LeaveByCard
          className="mb-3"
          info={leaveBy[0]}
          artistName={
            artistById.get(performanceById.get(leaveBy[0].performanceId)?.artistId ?? '')?.name ??
            'Next set'
          }
        />
      )}

      {/* NEXT UP / NOW */}
      {focus ? (
        <NextUpCard
          performance={focus}
          isNow={!!current}
          artistName={artistById.get(focus.artistId)?.name ?? 'Artist'}
          stageName={focus.stageId ? locationById.get(focus.stageId)?.name : undefined}
          minutesUntil={hhmmToMinutes(focus.startTime!) - nowMinute}
          preview={!live}
          travel={
            previous?.stageId && focus.stageId && previous.stageId !== focus.stageId
              ? travelMinutes(locationById.get(previous.stageId), locationById.get(focus.stageId), crowd, omap).minutes
              : undefined
          }
          friends={selections
            .filter((s) => s.performanceId === focus.id && s.selected && s.userId !== activeUserId)
            .map((s) => plans.all.find((u) => u.id === s.userId))
            .filter((u): u is NonNullable<typeof u> => !!u)}
          onOpen={() => onGoTab('schedule')}
        />
      ) : (
        <Card className="mb-4 p-4">
          <EmptyState
            Icon={CalendarClock}
            image={ART.emptyBands}
            title={myStops.length ? 'All done for now' : 'No sets lined up'}
            message={myStops.length ? 'No more sets on your plan for this day.' : 'Pick bands and add set times to see your next set here.'}
            action={<Button variant="secondary" className="mt-1" onClick={() => onGoTab('bands')}>Pick bands</Button>}
          />
        </Card>
      )}

      {/* Find My Crew — one tap to the whole coordination picture. */}
      <Button variant="secondary" className="mb-4 w-full py-3" onClick={() => setCrewOpen(true)}>
        <Users size={18} aria-hidden /> Find My Crew
      </Button>

      {/* Where the crew is now, with the SOURCE of each position stated. */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[15px] uppercase tracking-wide text-secondary">
            <Users size={15} aria-hidden /> The crew right now
          </h2>
          <button type="button" onClick={() => onGoTab('map')} className="min-h-touch text-[13px] font-semibold text-accent">
            Map
          </button>
        </div>
        {(() => {
          const rows = plans.all.map((u) => {
            const info = plans.byUser.get(u.id)!;
            return {
              user: u,
              info,
              pos: info.eligible
                ? positionWithCheckin(u.id, day, nowMinute, checkins, now.getTime(), staleMinutes, {
                    selections: ctx.selections,
                    performanceById: ctx.performanceById,
                    locationById: ctx.locationById,
                    allPerformances: ctx.allPerformances,
                    crowd: ctx.crowd,
                    turnoverBuffer: ctx.turnoverBuffer,
                    overrides: ctx.overrides,
                  })
                : null,
            };
          });
          // Identical "not arrived" rows are noise — collapse them until
          // statuses actually diverge (the only time this card matters). Only
          // safe when nobody is in the unknown state.
          if (rows.length > 1 && rows.every((r) => r.pos?.kind === 'not-arrived')) {
            return (
              <div className="flex items-center gap-2.5">
                <span className="flex -space-x-2">
                  {rows.map((r) => (
                    <FriendAvatar key={r.user.id} user={r.user} size={26} className="ring-2 ring-[var(--surface-card)]" />
                  ))}
                </span>
                <span className="text-[13px] text-secondary">
                  Everyone&apos;s pre-show — positions appear once first sets start.
                </span>
              </div>
            );
          }
          return (
            <div className="space-y-2">
              {rows.map(({ user: u, info, pos }) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2.5"
                  aria-label={pos ? positionA11yLabel(pos, u.name) : `${u.name}, plan not imported`}
                >
                  <FriendAvatar user={u} size={30} ring dim={!info.eligible} />
                  <span className="text-[14px] font-semibold text-primary">
                    {u.id === activeUserId ? 'You' : u.name}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-secondary">
                    {pos ? pos.label : 'Plan not imported — unknown, not free'}
                  </span>
                  <span
                    className={cx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      !pos
                        ? 'bg-[var(--surface-sunken)] text-muted'
                        : pos.source === 'manual'
                          ? 'bg-warp-ok/15 text-ok'
                          : pos.kind === 'open'
                            ? 'bg-warp-ok/15 text-ok'
                            : 'bg-accent-soft text-accent',
                    )}
                  >
                    {pos ? (pos.kind === 'open' && pos.source === 'planned' ? 'Free' : positionBadge(pos)) : 'Unknown'}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
        <p className="mt-2 text-[11px] text-muted">
          Planned from everyone&apos;s schedule — not live GPS. Check-ins stay on the phone that
          made them.
        </p>
      </Card>

      {/* Best meetup */}
      {meetups.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-display text-[15px] uppercase tracking-wide text-secondary">
            <Handshake size={15} aria-hidden /> Next meetup
          </h2>
          <MeetupCard meetup={meetups[0]} highlight />
          {dayInfo.status !== 'complete' && (
            <p className="mt-1 text-[11px] font-semibold text-warn">
              Provisional — {dayLabel(day)} is only {dayInfo.entered} of {dayInfo.expected} sets entered.
            </p>
          )}
        </div>
      )}

      {/* Conflicts */}
      {upcomingConflicts.length > 0 && (
        <Card className="mb-4 border-warp-warn/40 p-4">
          <h2 className="mb-2 flex items-center gap-1.5 font-display text-[15px] uppercase tracking-wide text-warp-warn">
            <AlertTriangle size={15} aria-hidden /> Heads up
          </h2>
          <ul className="space-y-1.5">
            {upcomingConflicts.map((c) => (
              <li key={c.id} className="text-[13px] text-secondary">
                <b className="text-primary">{c.title}.</b> {c.message}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => onGoTab('schedule')} className="mt-2 min-h-touch text-[13px] font-semibold text-accent">
            Resolve in Schedule →
          </button>
        </Card>
      )}

      {/* Food / water / sit-down windows. */}
      <BreakPlannerCard day={day} className="mb-4" />

      {/* Setup lives below the day's answers: once times exist, "what's next"
          matters more than "finish setting up". It stays visible, and Settings
          keeps a copy. */}
      <SetupCard onGoTab={onGoTab} onOpenMenu={onOpenMenu} />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onOpenMenu('emergency')}>
          Emergency plan
        </Button>
        <Button variant="secondary" onClick={() => onGoTab('group')}>
          <Coffee size={16} aria-hidden /> Group day
        </Button>
      </div>

      {crewOpen && (
        <FindMyCrew
          day={day}
          atMinute={nowMinute}
          onClose={() => setCrewOpen(false)}
          onGoMap={() => {
            setCrewOpen(false);
            onGoTab('map');
          }}
        />
      )}
    </Screen>
  );
}

function NextUpCard({
  performance,
  isNow,
  artistName,
  stageName,
  minutesUntil,
  travel,
  friends,
  onOpen,
  preview,
}: {
  performance: Performance;
  isNow: boolean;
  artistName: string;
  stageName?: string;
  minutesUntil: number;
  travel?: number;
  friends: { id: string; name: string; initials: string; avatar: string | null; colorKey: string }[];
  onOpen: () => void;
  preview?: boolean;
}) {
  return (
    <button type="button" onClick={onOpen} className="mb-4 block w-full text-left">
      <Card className={cx('overflow-hidden p-0', isNow ? 'border-warp-pink/50' : 'border-warp-blue-500/40')}>
        <div className={cx('px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white', isNow ? 'bg-warp-pink' : 'bg-warp-blue-500')}>
          {isNow ? 'On now' : 'Next up'}
        </div>
        <div className="flex items-center gap-3 p-4">
          <div className="text-center">
            <div className="font-display text-[20px] leading-none text-primary">{formatTime(performance.startTime)}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[18px] text-primary">{artistName}</div>
            <div className="flex items-center gap-1 text-[14px] text-secondary">
              <MapPin size={14} aria-hidden /> {stageName ?? 'Stage TBA'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              {!isNow && minutesUntil > 0 && (
                <span className="flex items-center gap-1 font-semibold text-warp-pink">
                  <Clock size={13} aria-hidden /> in {formatDuration(minutesUntil)}
                  {preview && <span className="font-normal text-muted">(preview)</span>}
                </span>
              )}
              {travel != null && (
                <span className="flex items-center gap-1 text-muted">
                  <Footprints size={13} aria-hidden /> ~{formatDuration(travel)} walk
                </span>
              )}
              {friends.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="flex -space-x-1.5">
                    {friends.slice(0, 3).map((f) => (
                      <FriendAvatar key={f.id} user={f as never} size={18} className="ring-2 ring-[var(--surface-card)]" />
                    ))}
                  </span>
                  <span className="text-muted">also going</span>
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="text-muted" aria-hidden />
        </div>
      </Card>
    </button>
  );
}
