import { useMemo } from 'react';
import { Scale, CircleHelp, Check, X, Split, PartyPopper } from 'lucide-react';
import { Card, cx } from './ui';
import { FriendAvatar } from './FriendAvatar';
import { EmptyState } from './EmptyState';
import { ProvisionalNote } from './ScheduleStatusStrip';
import { useApp } from '@/store/appStore';
import { useGroupCtx } from '@/hooks/useGroupCtx';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { withEffectiveEnds } from '@/domain/endTimes';
import { hasSplit } from '@/domain/splitSet';
import { formatMinutes, hhmmToMinutes, dayLabel } from '@/domain/time';
import { ART } from '@/config/event';
import type { DayId, Performance, Selection, User } from '@/domain/types';

interface Clash {
  key: string;
  startMinute: number;
  performances: Performance[];
  /** Per person, what they've decided about each clashing set. */
  rows: {
    user: User;
    picks: { performance: Performance; selection: Selection }[];
    state: 'decided' | 'undecided' | 'split' | 'not-involved';
    label: string;
  }[];
  /** True when at least one person still hasn't chosen. */
  unresolved: boolean;
}

/**
 * Group Decision Board (add-on §4).
 *
 * Surfaces only the choices that need a conversation: moments where two or
 * more of the crew want different things at the same time, or where somebody
 * hasn't decided yet. Everything else in the Group tab is a report; this is
 * the part that changes what the day looks like.
 */
export function DecisionBoard({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  const plans = usePlanStatuses();
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const performances = useApp((s) => s.performances);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const dayInfo = useDayScheduleStatus(day);

  const ends = useMemo(
    () => withEffectiveEnds(performances, turnoverBuffer),
    [performances, turnoverBuffer],
  );

  const clashes = useMemo<Clash[]>(() => {
    // Every scheduled pick belonging to an eligible user, by person.
    const byUser = new Map<string, { perf: Performance; sel: Selection; start: number; end: number }[]>();
    for (const u of ctx.users) byUser.set(u.id, []);
    for (const sel of ctx.selections) {
      if (!sel.selected || !byUser.has(sel.userId)) continue;
      const p = ctx.performanceById.get(sel.performanceId);
      if (!p || p.day !== day || !p.startTime) continue;
      const start = hhmmToMinutes(p.startTime);
      byUser.get(sel.userId)!.push({
        perf: p,
        sel,
        start,
        end: ends.get(p.id)?.minutes ?? start + 30,
      });
    }

    // Group overlapping picks into time clusters.
    const all = [...byUser.values()].flat().sort((a, b) => a.start - b.start);
    const clusters: (typeof all)[] = [];
    for (const item of all) {
      const last = clusters[clusters.length - 1];
      if (last && item.start < Math.max(...last.map((x) => x.end))) last.push(item);
      else clusters.push([item]);
    }

    const out: Clash[] = [];
    for (const cluster of clusters) {
      const perfIds = new Set(cluster.map((c) => c.perf.id));
      // One set everybody agrees on isn't a decision.
      if (perfIds.size < 2) continue;

      const perfList = [...new Map(cluster.map((c) => [c.perf.id, c.perf])).values()].sort(
        (a, b) => (a.startTime! < b.startTime! ? -1 : 1),
      );

      const rows = ctx.users.map((user) => {
        const picks = cluster
          .filter((c) => c.sel.userId === user.id)
          .map((c) => ({ performance: c.perf, selection: c.sel }));
        if (!picks.length) {
          return { user, picks, state: 'not-involved' as const, label: 'Not going to any of these' };
        }
        const attending = picks.filter((p) => p.selection.attendanceDecision === 'attending');
        const splits = picks.filter((p) => hasSplit(p.selection));
        if (splits.length >= 2) {
          return {
            user,
            picks,
            state: 'split' as const,
            label: `Splitting: ${splits.map((p) => name(p.performance)).join(' + ')}`,
          };
        }
        if (attending.length === 1) {
          return { user, picks, state: 'decided' as const, label: name(attending[0].performance) };
        }
        const live = picks.filter((p) => p.selection.attendanceDecision !== 'skipping');
        if (live.length === 1) {
          return { user, picks, state: 'decided' as const, label: name(live[0].performance) };
        }
        return {
          user,
          picks,
          state: 'undecided' as const,
          label: live.length ? live.map((p) => name(p.performance)).join(' or ') : 'Skipping all',
        };
      });

      const involved = rows.filter((r) => r.state !== 'not-involved');
      if (involved.length === 0) continue;
      const unresolved = involved.some((r) => r.state === 'undecided');
      const disagreement =
        new Set(involved.filter((r) => r.state === 'decided').map((r) => r.label)).size > 1;
      if (!unresolved && !disagreement) continue;

      out.push({
        key: perfList.map((p) => p.id).join('|'),
        startMinute: Math.min(...cluster.map((c) => c.start)),
        performances: perfList,
        rows,
        unresolved,
      });
    }
    return out.sort((a, b) => a.startMinute - b.startMinute);

    function name(p: Performance): string {
      return artistById.get(p.artistId)?.name ?? 'a set';
    }
  }, [ctx, day, ends, artistById]);

  if (!clashes.length) {
    return (
      <>
        <EmptyState
          Icon={PartyPopper}
          image={ART.noConflicts}
          title={dayInfo.status === 'complete' ? 'Nothing to argue about' : 'Nothing to argue about yet'}
          message={`No moment on ${dayLabel(day)} where the crew wants different things — or where someone still hasn't decided.`}
        />
        <ProvisionalNote day={day} what="decisions" />
      </>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 px-1 text-[12px] leading-relaxed text-secondary">
        <Scale size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        Moments where the crew is split or undecided. Everyone updates their own phone — swap fresh
        codes after you talk it through.
      </p>

      <ProvisionalNote day={day} what="decisions" className="mt-0" />

      {clashes.map((clash) => (
        <Card key={clash.key} className={cx('p-3', clash.unresolved && 'border-warp-warn/40')}>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-[15px] text-primary">
              {formatMinutes(clash.startMinute)} decision
            </span>
            {clash.unresolved && (
              <span className="rounded-full bg-warp-warn/20 px-2 py-0.5 text-[10px] font-bold text-warn">
                Undecided
              </span>
            )}
          </div>

          <ul className="mb-2 space-y-0.5">
            {clash.performances.map((p) => (
              <li key={p.id} className="text-[12px] text-secondary">
                <b className="text-primary">{artistById.get(p.artistId)?.name}</b> ·{' '}
                {formatMinutes(hhmmToMinutes(p.startTime!))} ·{' '}
                {p.stageId ? locationById.get(p.stageId)?.shortName ?? locationById.get(p.stageId)?.name : 'Stage TBA'}
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            {clash.rows.map((row) => (
              <div key={row.user.id} className="flex items-center gap-2">
                <FriendAvatar
                  user={row.user}
                  size={22}
                  dim={row.state === 'not-involved'}
                />
                <span className="w-16 shrink-0 truncate text-[13px] font-semibold text-primary">
                  {row.user.name}
                </span>
                <StateIcon state={row.state} />
                <span
                  className={cx(
                    'flex-1 truncate text-[13px]',
                    row.state === 'undecided' ? 'font-semibold text-warn' : 'text-secondary',
                  )}
                >
                  {row.label}
                </span>
              </div>
            ))}
          </div>

          {plans.missing.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              {plans.missing.map((u) => u.name).join(', ')} not included — no plan imported.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function StateIcon({ state }: { state: Clash['rows'][number]['state'] }) {
  if (state === 'decided') return <Check size={13} className="shrink-0 text-ok" aria-label="Decided" />;
  if (state === 'undecided') return <CircleHelp size={13} className="shrink-0 text-warn" aria-label="Undecided" />;
  if (state === 'split') return <Split size={13} className="shrink-0 text-warp-pink" aria-label="Split plan" />;
  return <X size={13} className="shrink-0 text-muted" aria-label="Not going" />;
}
