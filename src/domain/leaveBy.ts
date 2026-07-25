import type {
  Performance,
  Selection,
  MapLocation,
  CrowdDelay,
  TravelOverride,
  DayId,
} from './types';
import { withEffectiveEnds } from './endTimes';
import { travelMinutes, overrideMap } from './travel';
import { hhmmToMinutes } from './time';
import { attendWindow } from './splitSet';
import { ENTRANCE_LOCATION_ID } from '@/config/event';

/**
 * Leave-by planning (add-on §2).
 *
 * "Starts in 12 minutes" is the wrong number when the walk is 8 — what you
 * need is "leave in 4". This works out where the person is now (their previous
 * set, or the entrance before the day starts), how long the walk is at the
 * current crowd setting, and how much slack is left.
 */

export type LeaveUrgency = 'plenty' | 'soon' | 'now' | 'late';

export interface LeaveByInfo {
  performanceId: string;
  /** Wall-clock minute the set starts. */
  startMinute: number;
  /** Wall-clock minute to leave in order to arrive on time. */
  leaveMinute: number;
  walkMinutes: number;
  /** Countdown shown to the user: minutes from now until the leave-by moment. */
  slackMinutes: number;
  /**
   * Urgency accounts for being stuck in a set that runs past the leave-by
   * moment — that's "likely late" even when the clock says you have 15 min.
   */
  urgency: LeaveUrgency;
  fromLocationId: string | null;
  toLocationId: string | null;
  crowd: CrowdDelay;
  /** True when the previous set's end is an estimate, so slack is fuzzy. */
  usesEstimated: boolean;
}

export interface LeaveByCtx {
  selections: Selection[];
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  allPerformances: Performance[];
  crowd: CrowdDelay;
  turnoverBuffer: number;
  overrides: TravelOverride[];
}

export function urgencyFor(slack: number): LeaveUrgency {
  if (slack < 0) return 'late';
  if (slack <= 2) return 'now';
  if (slack <= 10) return 'soon';
  return 'plenty';
}

export function urgencyLabel(u: LeaveUrgency): string {
  switch (u) {
    case 'plenty':
      return 'Plenty of time';
    case 'soon':
      return 'Leave soon';
    case 'now':
      return 'Leave now';
    case 'late':
      return 'Likely late';
  }
}

/**
 * Leave-by info for a user's upcoming sets on a day, soonest first.
 * `atMinute` is "now" (or the simulated now on a non-festival day).
 */
export function leaveByPlan(
  userId: string,
  day: DayId,
  atMinute: number,
  ctx: LeaveByCtx,
  limit = 3,
): LeaveByInfo[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const omap = overrideMap(ctx.overrides);

  const stops = ctx.selections
    .filter((s) => {
      if (s.userId !== userId || !s.selected || s.attendanceDecision === 'skipping') return false;
      const p = ctx.performanceById.get(s.performanceId);
      return !!p && p.day === day && !!p.startTime && !!p.stageId;
    })
    .map((s) => {
      const p = ctx.performanceById.get(s.performanceId)!;
      const end = ends.get(p.id)!;
      return { perf: p, sel: s, window: attendWindow(p, s, end)!, endKind: end.kind };
    })
    .sort((a, b) => a.window.start - b.window.start);

  const out: LeaveByInfo[] = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (stop.window.start <= atMinute) continue; // already started or past

    // Where are they coming from? The set they're at (or just left), else the gate.
    const prior = [...stops.slice(0, i)].reverse().find((s) => s.window.start <= atMinute);
    const fromId = prior?.perf.stageId ?? ENTRANCE_LOCATION_ID;
    const from = ctx.locationById.get(fromId);
    const to = stop.perf.stageId ? ctx.locationById.get(stop.perf.stageId) : undefined;
    const walk = travelMinutes(from, to, ctx.crowd, omap).minutes;

    // If they're mid-set, they can't leave before it ends (unless they've
    // planned a split, which attendWindow already trimmed).
    const earliestDeparture = prior ? Math.max(atMinute, prior.window.end) : atMinute;
    const leaveMinute = Math.max(stop.window.start - walk, 0);

    out.push({
      performanceId: stop.perf.id,
      startMinute: stop.window.start,
      leaveMinute,
      walkMinutes: walk,
      slackMinutes: leaveMinute - atMinute,
      urgency: urgencyFor(leaveMinute - earliestDeparture),
      fromLocationId: from?.id ?? null,
      toLocationId: to?.id ?? null,
      crowd: ctx.crowd,
      usesEstimated: prior ? prior.endKind !== 'exact' : false,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Convenience: leave-by for the single next set, or null. */
export function nextLeaveBy(
  userId: string,
  day: DayId,
  atMinute: number,
  ctx: LeaveByCtx,
): LeaveByInfo | null {
  return leaveByPlan(userId, day, atMinute, ctx, 1)[0] ?? null;
}

export function crowdLabel(crowd: CrowdDelay): string {
  return crowd === 'light' ? 'Light crowd' : crowd === 'heavy' ? 'Heavy crowd' : 'Normal crowd';
}

export { hhmmToMinutes };
