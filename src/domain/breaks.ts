import type {
  Performance,
  Selection,
  MapLocation,
  CrowdDelay,
  TravelOverride,
  DayId,
  BreakKind,
} from './types';
import { withEffectiveEnds } from './endTimes';
import { travelMinutes, overrideMap } from './travel';
import { hhmmToMinutes } from './time';
import { attendWindow } from './splitSet';

/**
 * Personal energy / break planner (add-on §7).
 *
 * A day packed with bands stops being realistic without food, water and a sit
 * down. This finds the gaps that are actually long enough for each need and
 * points at the nearest amenity on the route between the sets on either side.
 */

export const BREAK_META: Record<
  BreakKind,
  { label: string; minMinutes: number; amenityTypes: string[]; verb: string }
> = {
  food: {
    label: 'Food',
    minMinutes: 25,
    amenityTypes: ['Food', 'Food Truck', 'VIP Food', 'VIP Food Truck'],
    verb: 'eat',
  },
  water: {
    label: 'Water',
    minMinutes: 8,
    amenityTypes: ['Water Stations', 'VIP Water Stations'],
    verb: 'refill',
  },
  rest: {
    label: 'Sit down',
    minMinutes: 20,
    amenityTypes: ['Pit Stop', 'Charge Station'],
    verb: 'rest',
  },
  restroom: {
    label: 'Restroom',
    minMinutes: 10,
    amenityTypes: ['Restrooms', 'VIP Restrooms'],
    verb: 'stop',
  },
  locker: {
    label: 'Locker',
    minMinutes: 12,
    amenityTypes: ['Lockers', 'VIP Lockers'],
    verb: 'swap gear',
  },
};

export interface BreakWindow {
  kind: BreakKind;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  /** Best amenity for this need near the route, if one is mapped. */
  location: MapLocation | null;
  walkMinutes: number;
  /** Stage names bracketing the gap, for "on your route from X to Y". */
  fromName: string | null;
  toName: string | null;
  /** True when a bracketing set's end time is only an estimate. */
  usesEstimated: boolean;
  /** A real gap between two sets, rather than before the first / after the last. */
  betweenSets: boolean;
}

export interface BreakCtx {
  selections: Selection[];
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  allPerformances: Performance[];
  crowd: CrowdDelay;
  turnoverBuffer: number;
  overrides: TravelOverride[];
  bounds: { open: number; close: number };
}

interface Gap {
  start: number;
  end: number;
  fromStageId: string | null;
  toStageId: string | null;
  usesEstimated: boolean;
}

function gapsFor(userId: string, day: DayId, ctx: BreakCtx): Gap[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const stops = ctx.selections
    .filter((s) => {
      if (s.userId !== userId || !s.selected || s.attendanceDecision === 'skipping') return false;
      const p = ctx.performanceById.get(s.performanceId);
      return !!p && p.day === day && !!p.startTime;
    })
    .map((s) => {
      const p = ctx.performanceById.get(s.performanceId)!;
      const end = ends.get(p.id)!;
      return { perf: p, window: attendWindow(p, s, end)!, exact: end.kind === 'exact' };
    })
    .sort((a, b) => a.window.start - b.window.start);

  const gaps: Gap[] = [];
  let cursor = ctx.bounds.open;
  let fromStage: string | null = null;
  let prevExact = true;

  for (const stop of stops) {
    if (stop.window.start > cursor) {
      gaps.push({
        start: cursor,
        end: stop.window.start,
        fromStageId: fromStage,
        toStageId: stop.perf.stageId,
        usesEstimated: !prevExact,
      });
    }
    cursor = Math.max(cursor, stop.window.end);
    fromStage = stop.perf.stageId;
    prevExact = stop.exact;
  }
  if (cursor < ctx.bounds.close) {
    gaps.push({
      start: cursor,
      end: ctx.bounds.close,
      fromStageId: fromStage,
      toStageId: null,
      usesEstimated: !prevExact,
    });
  }
  return gaps;
}

/** Amenity closest to the midpoint of the walk between two stages. */
function bestAmenity(
  kind: BreakKind,
  gap: Gap,
  ctx: BreakCtx,
  omap: Map<string, TravelOverride>,
): { loc: MapLocation | null; walk: number } {
  const types = new Set(BREAK_META[kind].amenityTypes);
  const from = gap.fromStageId ? ctx.locationById.get(gap.fromStageId) : undefined;
  const to = gap.toStageId ? ctx.locationById.get(gap.toStageId) : undefined;
  const anchor = from ?? to;

  let best: { loc: MapLocation; walk: number } | null = null;
  for (const loc of ctx.locationById.values()) {
    if (loc.category !== 'amenity' || !loc.amenityType || !types.has(loc.amenityType)) continue;
    // Detour cost: out from where you are, then on to where you're going.
    const out = travelMinutes(anchor, loc, ctx.crowd, omap).minutes;
    const onward = to ? travelMinutes(loc, to, ctx.crowd, omap).minutes : 0;
    const cost = out + onward;
    if (!best || cost < best.walk) best = { loc, walk: cost };
  }
  return best ? { loc: best.loc, walk: best.walk } : { loc: null, walk: 0 };
}

/**
 * Best window for each requested need, or none when the day genuinely has no
 * room — the honest answer is "no gap long enough", not a suggestion that
 * would make the person miss a set.
 */
export function planBreaks(
  userId: string,
  day: DayId,
  kinds: BreakKind[],
  ctx: BreakCtx,
): BreakWindow[] {
  const omap = overrideMap(ctx.overrides);
  const gaps = gapsFor(userId, day, ctx);
  const out: BreakWindow[] = [];

  for (const kind of kinds) {
    const need = BREAK_META[kind];
    let best: BreakWindow | null = null;
    for (const gap of gaps) {
      const duration = gap.end - gap.start;
      if (duration < need.minMinutes) continue;
      const { loc, walk } = bestAmenity(kind, gap, ctx, omap);
      // The break has to fit AROUND the walking, not instead of it.
      if (duration - walk < Math.round(need.minMinutes / 2)) continue;
      const candidate: BreakWindow = {
        kind,
        startMinute: gap.start,
        endMinute: gap.end,
        durationMinutes: duration,
        location: loc,
        walkMinutes: walk,
        fromName: gap.fromStageId
          ? (ctx.locationById.get(gap.fromStageId)?.shortName ??
             ctx.locationById.get(gap.fromStageId)?.name ?? null)
          : null,
        toName: gap.toStageId
          ? (ctx.locationById.get(gap.toStageId)?.shortName ??
             ctx.locationById.get(gap.toStageId)?.name ?? null)
          : null,
        usesEstimated: gap.usesEstimated,
        betweenSets: !!gap.fromStageId && !!gap.toStageId,
      };
      if (!best || score(candidate) < score(best)) best = candidate;
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * Lower is better. A real gap between two sets beats the wide-open stretch
 * before the first band — technically that IS free time, but nobody plans
 * lunch for "any time before 3pm". After that: earliest, then least walking.
 */
function score(w: BreakWindow): number {
  return (w.betweenSets ? 0 : 10_000) + w.startMinute + w.walkMinutes * 5;
}

export { hhmmToMinutes };
