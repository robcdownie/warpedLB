import type {
  Performance,
  Selection,
  MapLocation,
  User,
  CrowdDelay,
  TravelOverride,
  DayId,
} from './types';
import { withEffectiveEnds } from './endTimes';
import { plannedPosition, type PlannedPosition } from './positions';
import { hhmmToMinutes } from './time';

// Group timeline helpers (spec §23). Combine each person's plan into a shared,
// time-sliced picture for the Group screen views.

export interface GroupCtx {
  users: User[];
  selections: Selection[];
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  allPerformances: Performance[];
  crowd: CrowdDelay;
  turnoverBuffer: number;
  overrides: TravelOverride[];
}

/** A time-ordered list of every set any friend is attending that day. */
export interface GroupSlot {
  startMinute: number;
  endMinute: number;
  performance: Performance;
  stage?: MapLocation;
  /** userIds attending / undecided on this set. */
  attendees: { userId: string; decision: Selection['attendanceDecision'] }[];
}

export function groupTimeline(day: DayId, ctx: GroupCtx): GroupSlot[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const byPerf = new Map<string, GroupSlot>();

  for (const s of ctx.selections) {
    if (!s.selected || s.attendanceDecision === 'skipping') continue;
    const p = ctx.performanceById.get(s.performanceId);
    if (!p || p.day !== day || p.type !== 'main' || !p.startTime) continue;
    let slot = byPerf.get(p.id);
    if (!slot) {
      slot = {
        startMinute: hhmmToMinutes(p.startTime),
        endMinute: ends.get(p.id)?.minutes ?? hhmmToMinutes(p.startTime) + 30,
        performance: p,
        stage: p.stageId ? ctx.locationById.get(p.stageId) : undefined,
        attendees: [],
      };
      byPerf.set(p.id, slot);
    }
    slot.attendees.push({ userId: s.userId, decision: s.attendanceDecision });
  }

  return [...byPerf.values()].sort((a, b) => a.startMinute - b.startMinute);
}

/** Sets that two or more friends share (shared-bands view). */
export function sharedSets(day: DayId, ctx: GroupCtx): GroupSlot[] {
  return groupTimeline(day, ctx).filter((s) => s.attendees.length >= 2);
}

/** Positions of every user at a given minute (person-column / map slider). */
export function positionsAt(day: DayId, minute: number, ctx: GroupCtx): PlannedPosition[] {
  return ctx.users.map((u) =>
    plannedPosition(u.id, day, minute, {
      selections: ctx.selections,
      performanceById: ctx.performanceById,
      locationById: ctx.locationById,
      allPerformances: ctx.allPerformances,
      crowd: ctx.crowd,
      turnoverBuffer: ctx.turnoverBuffer,
      overrides: ctx.overrides,
    }),
  );
}

/** Free windows per user (free-time view): gaps between attended sets. */
export interface FreeWindow {
  userId: string;
  startMinute: number;
  endMinute: number;
}

export function freeWindows(
  day: DayId,
  ctx: GroupCtx,
  bounds: { open: number; close: number },
): FreeWindow[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const out: FreeWindow[] = [];
  for (const u of ctx.users) {
    const stops = ctx.selections
      .filter((s) => {
        if (s.userId !== u.id || !s.selected || s.attendanceDecision === 'skipping') return false;
        const p = ctx.performanceById.get(s.performanceId);
        return p?.day === day && p.type === 'main' && p.startTime;
      })
      .map((s) => {
        const p = ctx.performanceById.get(s.performanceId)!;
        return {
          start: hhmmToMinutes(p.startTime!),
          end: ends.get(p.id)?.minutes ?? hhmmToMinutes(p.startTime!) + 30,
        };
      })
      .sort((a, b) => a.start - b.start);

    let cursor = bounds.open;
    for (const stop of stops) {
      if (stop.start > cursor) out.push({ userId: u.id, startMinute: cursor, endMinute: stop.start });
      cursor = Math.max(cursor, stop.end);
    }
    if (cursor < bounds.close) out.push({ userId: u.id, startMinute: cursor, endMinute: bounds.close });
  }
  return out;
}
