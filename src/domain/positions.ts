import type {
  Performance,
  Selection,
  MapLocation,
  CheckIn,
  CrowdDelay,
  TravelOverride,
  DayId,
  PositionSource,
} from './types';
import { withEffectiveEnds } from './endTimes';
import { travelMinutes, overrideMap } from './travel';
import { hhmmToMinutes } from './time';
import { ENTRANCE_LOCATION_ID } from '@/config/event';

// Planned friend positions (spec §24). Computed purely from selections,
// attendance decisions, set times, and stage locations. NEVER a live location.
// Manual check-ins can override while fresh (spec §25).

export interface PlannedPosition {
  userId: string;
  atMinute: number;
  kind: 'at-stage' | 'traveling' | 'open' | 'not-arrived' | 'done' | 'checked-in' | 'unknown';
  locationId?: string;
  towardLocationId?: string;
  performanceId?: string;
  label: string;
  source: PositionSource;
  /** For a fresh check-in: minutes since it was made. */
  ageMinutes?: number;
  /**
   * A check-in too old to trust. The position above is the planned one; this
   * is kept purely as historical context ("last seen at…"). Never used to
   * place the primary marker (plan §P0-3).
   */
  staleCheckIn?: {
    checkInId: string;
    locationId: string | null;
    locationName: string | null;
    ageMinutes: number;
  };
}

/** Short, source-accurate badge text. Never communicate state by opacity alone. */
export function positionBadge(pos: PlannedPosition): string {
  switch (pos.source) {
    case 'manual':
      return `Checked in ${pos.ageMinutes ?? 0}m ago`;
    case 'stale':
      return `Stale ${pos.ageMinutes ?? 0}m`;
    case 'unknown':
      return 'Plan unknown';
    default:
      return pos.kind === 'traveling' ? 'Traveling' : 'Planned';
  }
}

/**
 * Screen-reader label that preserves the real source. "Sam planned at Ghost
 * Stage" would be a lie when the position came from a manual check-in.
 */
export function positionA11yLabel(pos: PlannedPosition, name: string): string {
  if (pos.source === 'manual') {
    return `${name}, manual check-in at ${pos.label}, updated ${pos.ageMinutes ?? 0} minutes ago`;
  }
  if (pos.source === 'unknown') {
    return `${name}, plan not imported — position unknown`;
  }
  const base = `${name}, planned: ${pos.label}`;
  return pos.staleCheckIn
    ? `${base}. Last manual check-in ${pos.staleCheckIn.locationName ?? 'a custom pin'}, ${pos.staleCheckIn.ageMinutes} minutes ago`
    : base;
}

/** Placeholder profile: we genuinely do not know where they are. */
export function unknownPosition(userId: string, atMinute: number): PlannedPosition {
  return {
    userId,
    atMinute,
    kind: 'unknown',
    label: 'Plan not imported',
    source: 'unknown',
  };
}

interface Stop {
  perf: Performance;
  start: number;
  end: number;
  stage?: MapLocation;
}

/**
 * Where a user plans to be at minute T on a given day (from their attending
 * itinerary). Used by the map time slider and the Now/Group screens.
 */
export function plannedPosition(
  userId: string,
  day: DayId,
  atMinute: number,
  ctx: {
    selections: Selection[];
    performanceById: Map<string, Performance>;
    locationById: Map<string, MapLocation>;
    allPerformances: Performance[];
    crowd: CrowdDelay;
    turnoverBuffer: number;
    overrides: TravelOverride[];
  },
): PlannedPosition {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const omap = overrideMap(ctx.overrides);

  const stops: Stop[] = ctx.selections
    .filter((s) => {
      if (s.userId !== userId || !s.selected) return false;
      if (s.attendanceDecision === 'skipping') return false;
      const p = ctx.performanceById.get(s.performanceId);
      return p?.day === day && p.type === 'main' && p.startTime && p.stageId;
    })
    .map((s) => {
      const p = ctx.performanceById.get(s.performanceId)!;
      const end = ends.get(p.id)?.minutes ?? hhmmToMinutes(p.startTime!) + 30;
      return {
        perf: p,
        start: hhmmToMinutes(p.startTime!),
        end,
        stage: p.stageId ? ctx.locationById.get(p.stageId) : undefined,
      };
    })
    .sort((a, b) => a.start - b.start);

  const base = { userId, atMinute, source: 'planned' as const };

  if (stops.length === 0) {
    return { ...base, kind: 'open', label: 'Open time (no plan yet)' };
  }

  // Currently in a set?
  const current = stops.find((s) => atMinute >= s.start && atMinute < s.end);
  if (current) {
    return {
      ...base,
      kind: 'at-stage',
      locationId: current.stage?.id,
      performanceId: current.perf.id,
      label: current.stage?.name ?? 'a stage',
    };
  }

  const next = stops.find((s) => s.start > atMinute);
  const prev = [...stops].reverse().find((s) => s.end <= atMinute);

  // Before the first set.
  if (!prev && next) {
    // Traveling to the first set if within its travel window from the entrance.
    // (An undefined origin would short-circuit travelMinutes to 0 and make the
    // 'traveling' state unreachable — use the real entrance location.)
    const entrance = ctx.locationById.get(ENTRANCE_LOCATION_ID);
    const travel = travelMinutes(entrance, next.stage, ctx.crowd, omap);
    if (atMinute >= next.start - travel.minutes) {
      return {
        ...base,
        kind: 'traveling',
        towardLocationId: next.stage?.id,
        performanceId: next.perf.id,
        label: `Heading to ${next.stage?.name ?? 'first set'}`,
      };
    }
    // Pronoun-free: the same label renders for "you" and for friends.
    return { ...base, kind: 'not-arrived', label: 'Not at the first set yet' };
  }

  // Between sets.
  if (prev && next) {
    const travel = travelMinutes(prev.stage, next.stage, ctx.crowd, omap);
    if (atMinute >= next.start - travel.minutes) {
      return {
        ...base,
        kind: 'traveling',
        locationId: prev.stage?.id,
        towardLocationId: next.stage?.id,
        performanceId: next.perf.id,
        label: `Traveling toward ${next.stage?.name ?? 'next set'}`,
      };
    }
    // Open time — shown at the most recent planned landmark.
    return {
      ...base,
      kind: 'open',
      locationId: prev.stage?.id,
      label: `Open time near ${prev.stage?.shortName ?? prev.stage?.name ?? 'last stage'}`,
    };
  }

  // After the last set.
  if (prev && !next) {
    return {
      ...base,
      kind: 'done',
      locationId: prev.stage?.id,
      label: `Wrapped up near ${prev.stage?.shortName ?? prev.stage?.name ?? 'last stage'}`,
    };
  }

  return { ...base, kind: 'open', label: 'Open time' };
}

/**
 * Position resolved in strict confidence order (plan §P0-3):
 *   1. a FRESH manual check-in
 *   2. the current planned schedule position
 *   3. a stale check-in — historical context only, never the primary position
 *
 * The old behaviour kept a check-in as the primary position forever and merely
 * relabeled it "stale", so a friend who checked in at Ghost Stage at noon was
 * still pinned there at 6pm while their own schedule said otherwise.
 */
export function positionWithCheckin(
  userId: string,
  day: DayId,
  atMinute: number,
  checkins: CheckIn[],
  nowMs: number,
  staleMinutes: number,
  ctx: Parameters<typeof plannedPosition>[3],
): PlannedPosition {
  const latest = latestCheckIn(userId, checkins);
  if (!latest) return plannedPosition(userId, day, atMinute, ctx);

  const ageMinutes = Math.max(
    0,
    Math.floor((nowMs - new Date(latest.updatedAt).getTime()) / 60000),
  );
  const loc = latest.locationId ? ctx.locationById.get(latest.locationId) : undefined;
  const locName = loc ? loc.name : latest.customCoordinates ? 'a custom pin' : null;

  if (ageMinutes < staleMinutes) {
    return {
      userId,
      atMinute,
      kind: 'checked-in',
      locationId: latest.locationId ?? undefined,
      label: locName ?? 'Checked in',
      source: 'manual',
      ageMinutes,
    };
  }

  // Stale: fall all the way back to the plan, carrying the old check-in as
  // context so the detail card can still say where they were last seen.
  const planned = plannedPosition(userId, day, atMinute, ctx);
  return {
    ...planned,
    staleCheckIn: {
      checkInId: latest.id,
      locationId: latest.locationId,
      locationName: locName,
      ageMinutes,
    },
  };
}

/** Newest check-in for a user, or undefined. */
export function latestCheckIn(userId: string, checkins: CheckIn[]): CheckIn | undefined {
  let best: CheckIn | undefined;
  for (const c of checkins) {
    if (c.userId !== userId) continue;
    if (!best || c.updatedAt > best.updatedAt) best = c;
  }
  return best;
}
