import type { Artist, DayId, Performance, Selection } from './types';
import type { EffectiveEnd } from './endTimes';
import { attendWindow } from './splitSet';

/**
 * Bands dropped for a clash that no longer exists.
 *
 * Choosing one set on a conflict card marks the other one skipping, and a
 * skipped pick leaves the conflict engine entirely — it disappears from Now,
 * Festival mode, meetups, leave-by and the break planner, surviving only as a
 * dimmed row on My Day. Nothing ever re-checked those decisions, so when the
 * clash that caused them stopped being real (a corrected set time, or the
 * end-time model changing under them), the bands stayed gone for good.
 *
 * This finds them. It only ever considers picks the app itself skipped —
 * `skippedForConflict` — so a band deliberately dropped by hand stays dropped.
 */
export interface RecoverablePick {
  performanceId: string;
  artistName: string;
  day: DayId;
  startMinute: number;
}

export interface RecoveryCtx {
  userId: string;
  selections: Selection[];
  performanceById: Map<string, Performance>;
  artistById: Map<string, Artist>;
  ends: Map<string, EffectiveEnd>;
}

export function recoverablePicks(ctx: RecoveryCtx): RecoverablePick[] {
  const mine = ctx.selections.filter((s) => s.userId === ctx.userId && s.selected);

  // What's actually on the plan right now, with the windows really attended.
  const live: { day: DayId; start: number; end: number }[] = [];
  for (const s of mine) {
    if (s.attendanceDecision === 'skipping') continue;
    const perf = ctx.performanceById.get(s.performanceId);
    const end = perf ? ctx.ends.get(perf.id) : undefined;
    if (!perf?.day || !end) continue;
    const w = attendWindow(perf, s, end);
    if (w) live.push({ day: perf.day, start: w.start, end: w.end });
  }

  const out: RecoverablePick[] = [];
  for (const s of mine) {
    if (s.attendanceDecision !== 'skipping' || !s.skippedForConflict) continue;
    const perf = ctx.performanceById.get(s.performanceId);
    const end = perf ? ctx.ends.get(perf.id) : undefined;
    if (!perf?.day || !end) continue;
    const w = attendWindow(perf, s, end);
    if (!w) continue;
    const stillClashes = live.some(
      (l) => l.day === perf.day && l.start < w.end && w.start < l.end,
    );
    if (stillClashes) continue;
    out.push({
      performanceId: perf.id,
      artistName: ctx.artistById.get(perf.artistId)?.name ?? 'A band',
      day: perf.day,
      startMinute: w.start,
    });
  }

  return out.sort((a, b) => a.day.localeCompare(b.day) || a.startMinute - b.startMinute);
}

/** How many of a day's picks are still on the plan, and how many were picked. */
export function planCount(
  userId: string,
  day: DayId,
  selections: Selection[],
  performanceById: Map<string, Performance>,
): { onPlan: number; picked: number } {
  let onPlan = 0;
  let picked = 0;
  for (const s of selections) {
    if (s.userId !== userId || !s.selected) continue;
    if (performanceById.get(s.performanceId)?.day !== day) continue;
    picked++;
    if (s.attendanceDecision !== 'skipping') onPlan++;
  }
  return { onPlan, picked };
}
