import { useMemo } from 'react';
import { MapPin, Footprints, CalendarX, HelpCircle, Split, Ban } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { Card, cx } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { FriendAvatar } from '@/components/FriendAvatar';
import { PriorityBadge } from '@/components/PriorityControl';
import { withEffectiveEnds } from '@/domain/endTimes';
import { travelMinutes, overrideMap } from '@/domain/travel';
import { attendWindow } from '@/domain/splitSet';
import { formatTime, formatMinutes, formatDuration, dayLabel } from '@/domain/time';
import { ART } from '@/config/event';
import type { DayId, Performance } from '@/domain/types';

export function PersonalSchedule({ day }: { day: DayId }) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const users = useApp((s) => s.users);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);
  const setAttendance = useApp((s) => s.setAttendance);

  const ends = useMemo(() => withEffectiveEnds(performances, turnoverBuffer), [performances, turnoverBuffer]);
  const omap = useMemo(() => overrideMap(overrides), [overrides]);

  const { items, unknown } = useMemo(() => {
    const mine = selections.filter((s) => {
      if (s.userId !== activeUserId || !s.selected) return false;
      const p = performanceById.get(s.performanceId);
      // Unplugged sets count too, once the board has given them a day.
      return p?.day === day;
    });
    const items = mine
      .filter((s) => performanceById.get(s.performanceId)!.startTime)
      .map((s) => ({ sel: s, perf: performanceById.get(s.performanceId)! }))
      .sort((a, b) => (a.perf.startTime! < b.perf.startTime! ? -1 : 1));
    // Picks with no time yet. These used to vanish from the day entirely,
    // which made a partial schedule look like a finished one (plan §P0-1).
    const unknown = mine
      .filter((s) => !performanceById.get(s.performanceId)!.startTime)
      .map((s) => ({ sel: s, perf: performanceById.get(s.performanceId)! }));
    return { items, unknown };
  }, [selections, activeUserId, performanceById, day]);

  if (!items.length && !unknown.length) {
    return (
      <EmptyState
        Icon={CalendarX}
        image={ART.emptySchedule}
        title={`No scheduled ${dayLabel(day)} sets`}
        message="Pick bands and add their set times, then your day appears here in order."
      />
    );
  }

  let prev: Performance | undefined;

  return (
    <div className="space-y-2">
      {items.map(({ sel, perf }) => {
        const artist = artistById.get(perf.artistId);
        const stage = perf.stageId ? locationById.get(perf.stageId) : undefined;
        const end = ends.get(perf.id);
        const friends = selections
          .filter((s) => s.performanceId === perf.id && s.selected && s.userId !== activeUserId)
          .map((s) => users.find((u) => u.id === s.userId))
          .filter((u): u is NonNullable<typeof u> => !!u);

        // Travel from previous set.
        let travel: { minutes: number; from: string } | null = null;
        if (prev?.stageId && perf.stageId && prev.stageId !== perf.stageId) {
          const t = travelMinutes(
            locationById.get(prev.stageId),
            locationById.get(perf.stageId),
            crowd,
            omap,
          );
          travel = { minutes: t.minutes, from: locationById.get(prev.stageId)?.shortName ?? '' };
        }
        const skipping = sel.attendanceDecision === 'skipping';
        const window = attendWindow(perf, sel, end!);
        prev = perf;

        return (
          <div key={perf.id}>
            {/* One text run, one flex item — the icon plus three separate text
                pieces could not wrap between themselves and squeezed into
                columns on a narrow screen with a long stage name. */}
            {travel && (
              <div className="flex items-start gap-1.5 py-1 pl-3 text-[12px] text-muted">
                <Footprints size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  ~{formatDuration(travel.minutes)} walk from {travel.from}{' '}
                  <span className="text-[10px]">(approx)</span>
                </span>
              </div>
            )}
            <Card className={cx('p-3', skipping && 'opacity-55')}>
              <div className="flex items-start gap-3">
                <div className="w-16 shrink-0 text-center">
                  <div className="font-display text-[15px] leading-tight text-primary">
                    {formatTime(perf.startTime)}
                  </div>
                  <div className="text-[11px] text-muted">
                    {end?.kind === 'unknown' ? '· · ·' : formatTime(end?.hhmm ?? null)}
                    {end?.kind === 'estimated' && <span className="block text-[9px]">est.</span>}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[15px] text-primary">{artist?.name}</span>
                    <PriorityBadge priority={sel.priority} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[13px] text-secondary">
                    <MapPin size={13} aria-hidden />
                    {stage?.name ?? 'Stage TBA'}
                  </div>
                  {window?.partial && (
                    <div className="mt-0.5 flex items-start gap-1 text-[12px] font-semibold text-warp-pink">
                      <Split size={12} className="mt-0.5 shrink-0" aria-hidden />
                      <span>
                        Split plan: {formatMinutes(window.start)}–{formatMinutes(window.end)}{' '}
                        <span className="font-normal text-muted">
                          ({formatDuration(window.end - window.start)} of the set)
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    {/* Tap cycles going → maybe → skipping. Vocabulary matches
                        the "maybe" badge used in Group views. */}
                    <button
                      type="button"
                      onClick={() => {
                        const next =
                          sel.attendanceDecision === 'attending'
                            ? 'undecided'
                            : sel.attendanceDecision === 'undecided'
                              ? 'skipping'
                              : 'attending';
                        void setAttendance(activeUserId, perf.id, next);
                      }}
                      aria-label={`Attendance for ${artist?.name}: ${
                        skipping ? 'skipping' : sel.attendanceDecision === 'attending' ? 'going' : 'maybe'
                      }. Tap to change.`}
                      className={cx(
                        'min-h-touch -my-2 flex items-center rounded-full px-2 text-[11px] font-semibold active:opacity-80',
                      )}
                    >
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5',
                          skipping
                            ? 'bg-[var(--surface-sunken)] text-muted'
                            : sel.attendanceDecision === 'attending'
                              ? 'bg-warp-ok/15 text-warp-ok'
                              : 'bg-warp-warn/20 text-warn',
                        )}
                      >
                        {skipping
                          ? sel.skippedForConflict ? 'Skipping (conflict)' : 'Skipping'
                          : sel.attendanceDecision === 'attending'
                            ? 'Going'
                            : 'Maybe'}
                      </span>
                    </button>
                    {friends.length > 0 && (
                      <span className="flex -space-x-2">
                        {friends.slice(0, 3).map((f) => (
                          <FriendAvatar key={f.id} user={f} size={20} className="ring-2 ring-[var(--surface-card)]" />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        );
      })}

      {/* Picks with no time yet. Listing them is the whole point: an unlisted
          pick makes the rest of the day look emptier than it is. */}
      {unknown.length > 0 && (
        <div className="pt-2">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-warn">
            <HelpCircle size={14} aria-hidden />
            {unknown.length} pick{unknown.length === 1 ? '' : 's'} with no time yet
          </h3>
          <p className="mb-2 text-[12px] leading-relaxed text-secondary">
            These are on your {dayLabel(day)} but the app doesn&apos;t know when. Treat the gaps
            around them as unknown, not free.
          </p>
          <div className="space-y-1.5">
            {unknown.map(({ sel, perf }) => {
              const artist = artistById.get(perf.artistId);
              const stage = perf.stageId ? locationById.get(perf.stageId) : undefined;
              const canceled =
                perf.officialStatus === 'canceled' || perf.officialStatus === 'removed';
              return (
                <Card key={perf.id} className="border-dashed p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-center font-display text-[13px] text-muted">
                      --:--
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-primary">
                          {artist?.name}
                        </span>
                        <PriorityBadge priority={sel.priority} />
                        {canceled && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-warp-danger/15 px-1.5 text-[10px] font-bold text-danger">
                            <Ban size={9} aria-hidden />
                            {perf.officialStatus === 'canceled' ? 'Cancelled' : 'Off the bill'}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted">
                        {stage ? stage.name : 'Stage not set'} · time unknown
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
