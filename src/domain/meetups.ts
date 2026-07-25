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
import { travelMinutes, overrideMap } from './travel';
import { hhmmToMinutes } from './time';
import { ENTRANCE_LOCATION_ID } from '@/config/event';

// Meetup engine (spec §29). Finds windows where friends are simultaneously free
// and picks a landmark that minimizes the longest individual walk. Never cuts
// into a Must-See set unless explicitly allowed.

export interface MeetupCtx {
  users: User[];
  selections: Selection[];
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  allPerformances: Performance[];
  crowd: CrowdDelay;
  turnoverBuffer: number;
  overrides: TravelOverride[];
  minMeetupMinutes: number;
  allowDuringMustSee: boolean;
  bounds: { open: number; close: number };
  /** Preferred meetup landmark ids (spec §29). */
  preferredLandmarkIds: string[];
}

export interface MeetupPerUser {
  userId: string;
  prevStageId?: string;
  nextStageId?: string;
  /** When this user should leave the meetup to reach their next set (minutes). */
  leaveByMinute?: number;
  /** No next set — free after. */
  openAfter: boolean;
}

export interface MeetupSuggestion {
  id: string;
  day: DayId;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  location: MapLocation;
  userIds: string[];
  perUser: MeetupPerUser[];
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  usesEstimated: boolean;
}

interface Busy {
  start: number;
  end: number;
  stageId: string | null;
  mustSee: boolean;
  estimatedEnd: boolean;
}

interface FreeWindow {
  userId: string;
  start: number;
  end: number;
  prevStageId: string | null; // stage they came from (null => entrance)
  nextStageId: string | null; // stage they go to (null => none)
  nextStart: number | null;
  usesEstimated: boolean;
}

const ENTRANCE_ID = ENTRANCE_LOCATION_ID;

function userBusy(day: DayId, userId: string, ctx: MeetupCtx): Busy[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  return ctx.selections
    .filter((s) => {
      if (s.userId !== userId || !s.selected || s.attendanceDecision === 'skipping') return false;
      const p = ctx.performanceById.get(s.performanceId);
      return p?.day === day && p.type === 'main' && p.startTime;
    })
    .map((s) => {
      const p = ctx.performanceById.get(s.performanceId)!;
      const end = ends.get(p.id);
      return {
        start: hhmmToMinutes(p.startTime!),
        end: end?.minutes ?? hhmmToMinutes(p.startTime!) + 30,
        stageId: p.stageId,
        mustSee: s.priority === 'must-see',
        // Anything but an exact end (estimated, unknown, or the +30 fallback)
        // means the window boundaries are guesses.
        estimatedEnd: end?.kind !== 'exact',
      };
    })
    .sort((a, b) => a.start - b.start);
}

function userFreeWindows(day: DayId, userId: string, ctx: MeetupCtx): FreeWindow[] {
  // Every attended set blocks meetups, except that Must-See sets become
  // interruptible when the user explicitly allows it (spec §29 / settings).
  const busy = userBusy(day, userId, ctx).filter(
    (b) => !(ctx.allowDuringMustSee && b.mustSee),
  );
  const windows: FreeWindow[] = [];
  let cursor = ctx.bounds.open;
  let prevStage: string | null = null; // entrance
  let prevEstimated = false;

  for (const b of busy) {
    if (b.start > cursor) {
      windows.push({
        userId,
        start: cursor,
        end: b.start,
        prevStageId: prevStage,
        nextStageId: b.stageId,
        nextStart: b.start,
        usesEstimated: prevEstimated,
      });
    }
    cursor = Math.max(cursor, b.end);
    prevStage = b.stageId;
    prevEstimated = b.estimatedEnd;
  }
  if (cursor < ctx.bounds.close) {
    windows.push({
      userId,
      start: cursor,
      end: ctx.bounds.close,
      prevStageId: prevStage,
      nextStageId: null,
      nextStart: null,
      usesEstimated: prevEstimated,
    });
  }
  return windows;
}

function travelBetween(ctx: MeetupCtx, aId: string | null, bId: string | null, omap: Map<string, TravelOverride>): number {
  const a = ctx.locationById.get(aId ?? ENTRANCE_ID);
  const b = ctx.locationById.get(bId ?? ENTRANCE_ID);
  return travelMinutes(a, b, ctx.crowd, omap).minutes;
}

/** Find meetup suggestions for a day, best first. */
export function findMeetups(day: DayId, ctx: MeetupCtx, limit = 6): MeetupSuggestion[] {
  const omap = overrideMap(ctx.overrides);
  const freeByUser = new Map<string, FreeWindow[]>();
  for (const u of ctx.users) freeByUser.set(u.id, userFreeWindows(day, u.id, ctx));

  // Candidate meetup locations: preferred landmarks + all stages.
  const candidates: MapLocation[] = [];
  const seen = new Set<string>();
  for (const id of ctx.preferredLandmarkIds) {
    const l = ctx.locationById.get(id);
    if (l && !seen.has(l.id)) { candidates.push(l); seen.add(l.id); }
  }
  for (const l of ctx.locationById.values()) {
    if (l.category === 'stage' && !seen.has(l.id)) { candidates.push(l); seen.add(l.id); }
  }
  const preferredSet = new Set(ctx.preferredLandmarkIds);

  // Sample the day in coarse steps to find overlapping free windows.
  const suggestions: MeetupSuggestion[] = [];

  // Build a list of "overlap intervals" across users using a sweep of window edges.
  const edges = new Set<number>([ctx.bounds.open, ctx.bounds.close]);
  for (const ws of freeByUser.values()) for (const w of ws) { edges.add(w.start); edges.add(w.end); }
  const sortedEdges = [...edges].sort((a, b) => a - b);

  for (let i = 0; i < sortedEdges.length - 1; i++) {
    const s = sortedEdges[i];
    const e = sortedEdges[i + 1];
    if (e - s < ctx.minMeetupMinutes) continue;
    const mid = (s + e) / 2;

    // Which users are free across [s,e]?
    const availWindows: FreeWindow[] = [];
    for (const u of ctx.users) {
      const w = (freeByUser.get(u.id) ?? []).find((w) => w.start <= mid && w.end >= mid);
      if (w) availWindows.push(w);
    }
    if (availWindows.length < 2) continue;

    // Evaluate candidate locations.
    let best: { loc: MapLocation; meetStart: number; meetEnd: number; maxWalk: number; usesEst: boolean } | null = null;
    for (const loc of candidates) {
      let meetStart = s;
      let meetEnd = e;
      let maxWalk = 0;
      let usesEst = false;
      for (const w of availWindows) {
        const walkIn = travelBetween(ctx, w.prevStageId, loc.id, omap);
        const arrive = w.start + walkIn;
        meetStart = Math.max(meetStart, arrive);
        maxWalk = Math.max(maxWalk, walkIn);
        if (w.usesEstimated) usesEst = true;
        if (w.nextStart != null) {
          const walkOut = travelBetween(ctx, loc.id, w.nextStageId, omap);
          const depart = w.nextStart - walkOut;
          meetEnd = Math.min(meetEnd, depart);
        }
      }
      const dur = meetEnd - meetStart;
      if (dur < ctx.minMeetupMinutes) continue;
      const better =
        !best ||
        maxWalk < best.maxWalk - 0.01 ||
        (Math.abs(maxWalk - best.maxWalk) <= 1 && preferredSet.has(loc.id) && !preferredSet.has(best.loc.id));
      if (better) best = { loc, meetStart, meetEnd, maxWalk, usesEst };
    }

    if (!best) continue;

    const perUser: MeetupPerUser[] = availWindows.map((w) => {
      const openAfter = w.nextStart == null;
      const leaveBy = openAfter ? undefined : w.nextStart! - travelBetween(ctx, best!.loc.id, w.nextStageId, omap);
      return { userId: w.userId, prevStageId: w.prevStageId ?? undefined, nextStageId: w.nextStageId ?? undefined, leaveByMinute: leaveBy, openAfter };
    });

    const dur = best.meetEnd - best.meetStart;
    const all = availWindows.length === ctx.users.length;
    const confidence: MeetupSuggestion['confidence'] =
      all && !best.usesEst && dur >= ctx.minMeetupMinutes + 10 && best.maxWalk <= 6
        ? 'high'
        : best.usesEst || dur < ctx.minMeetupMinutes + 5
          ? 'low'
          : 'medium';

    suggestions.push({
      id: `meetup-${day}-${Math.round(best.meetStart)}-${best.loc.id}`,
      day,
      startMinute: Math.round(best.meetStart),
      endMinute: Math.round(best.meetEnd),
      durationMinutes: Math.round(dur),
      location: best.loc,
      userIds: availWindows.map((w) => w.userId),
      perUser,
      reason: reasonFor(best.loc, preferredSet.has(best.loc.id), best.maxWalk, all, availWindows.length),
      confidence,
      usesEstimated: best.usesEst,
    });
  }

  // Dedupe near-identical windows: keep the highest-value per rough start bucket.
  suggestions.sort((a, b) => {
    const rank = (x: MeetupSuggestion) =>
      x.userIds.length * 1000 + (x.confidence === 'high' ? 100 : x.confidence === 'medium' ? 50 : 0) + x.durationMinutes;
    return rank(b) - rank(a);
  });
  const kept: MeetupSuggestion[] = [];
  for (const sug of suggestions) {
    if (kept.some((k) => Math.abs(k.startMinute - sug.startMinute) < 30 && overlaps(k, sug))) continue;
    kept.push(sug);
    if (kept.length >= limit) break;
  }
  return kept.sort((a, b) => a.startMinute - b.startMinute);
}

function overlaps(a: MeetupSuggestion, b: MeetupSuggestion): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

function reasonFor(
  loc: MapLocation,
  preferred: boolean,
  maxWalk: number,
  all: boolean,
  count: number,
): string {
  // Never hardcode the crew size: the app must stay correct if a fourth
  // person joins, or if only two plans are on this phone (plan §P1-10).
  const who = all
    ? count === 2
      ? 'both of you'
      : 'everyone in this plan'
    : `${count} of you`;
  const clear = preferred ? 'a clear, easy-to-find landmark' : 'the closest workable spot';
  const walk =
    maxWalk < 1
      ? "you're already right by it — no real walking"
      : `the longest walk is about ${Math.round(maxWalk)} min`;
  return `${loc.name} is ${clear} for ${who} — ${walk}.`;
}

/** Default preferred landmark ids from spec §29 (plus major stages added by the engine). */
export const PREFERRED_LANDMARK_IDS = [
  'warped-museum',
  'charity-circle',
  '805-area',
  'lobos-1707',
  'vans-activation',
  '32-taps',
  '60-taps',
  'shoreline-village-drive-entrance',
];
