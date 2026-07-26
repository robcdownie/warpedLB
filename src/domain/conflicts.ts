import type {
  Performance,
  Selection,
  MapLocation,
  CrowdDelay,
  TravelOverride,
  DayId,
  Priority,
  Artist,
} from './types';
import { withEffectiveEnds, type EffectiveEnd } from './endTimes';
import { travelMinutes, overrideMap } from './travel';
import { hasSplit, attendWindow } from './splitSet';
import { formatTime, formatDuration } from './time';

export type ConflictType =
  | 'overlap' // direct time overlap
  | 'must-see-conflict' // must-see vs must-see overlap
  | 'split-plan' // overlapping, but you've already planned to catch part of each
  | 'insufficient-travel'
  | 'back-to-back' // 3+ in a row
  | 'missing-stage'
  | 'missing-time';

export type ConflictSeverity = 'info' | 'warn' | 'high';

export interface ConflictAction {
  kind: 'attend' | 'undecided' | 'ignore' | 'prioritize' | 'split';
  label: string;
  /** Performance to mark attending (others in the conflict become skipping). */
  attendId?: string;
  performanceIds?: string[];
}

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  performanceIds: string[];
  title: string;
  message: string;
  usesEstimatedTime: boolean;
  actions: ConflictAction[];
  /** Artist names involved, in the same order as performanceIds. */
  artistNames: string[];
}

export interface ConflictContext {
  userId: string;
  selections: Selection[];
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  /** Required: every conflict names the actual bands, never "the first set". */
  artistById: Map<string, Artist>;
  allPerformances: Performance[];
  crowd: CrowdDelay;
  turnoverBuffer: number;
  overrides: TravelOverride[];
}

interface Scheduled {
  perf: Performance;
  sel: Selection;
  start: number;
  end: EffectiveEnd;
  stage?: MapLocation;
  artistName: string;
}

const PRIORITY_RANK: Record<Priority, number> = {
  'must-see': 0,
  'want-to-see': 1,
  optional: 2,
};

/** Detect all conflicts for one user on one day. */
export function detectConflicts(day: DayId, ctx: ConflictContext): Conflict[] {
  const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
  const omap = overrideMap(ctx.overrides);
  const conflicts: Conflict[] = [];

  // Gather this user's active selections for the day.
  const active: { perf: Performance; sel: Selection }[] = [];
  for (const sel of ctx.selections) {
    if (sel.userId !== ctx.userId || !sel.selected) continue;
    if (sel.attendanceDecision === 'skipping') continue;
    const perf = ctx.performanceById.get(sel.performanceId);
    if (!perf || perf.day !== day || perf.type !== 'main') continue;
    active.push({ perf, sel });
  }

  const nameOf = (p: Performance): string =>
    ctx.artistById.get(p.artistId)?.name ?? 'This set';

  // Missing data. One card per band, not one per missing field: a pick with
  // neither a stage nor a time used to emit two cards saying the same thing,
  // so before the board was entered ~20 picks produced ~40 notes — all of them
  // above the real clashes, in the hour when the real clashes appear.
  //
  // A set with a start but no end isn't called out at all: that's the normal
  // case off the board, and the assumed length is disclosed on the conflicts it
  // actually affects.
  for (const { perf } of active) {
    const name = nameOf(perf);
    if (perf.stageId && perf.startTime) continue;
    const missing = !perf.startTime && !perf.stageId
      ? 'no stage or time yet'
      : !perf.startTime
        ? 'no set time yet'
        : 'no stage yet';
    conflicts.push({
      id: `missing-${perf.id}`,
      type: perf.startTime ? 'missing-stage' : 'missing-time',
      severity: 'info',
      performanceIds: [perf.id],
      artistNames: [name],
      title: `${name}: ${missing}`,
      message:
        `${name} can't be checked for clashes until it has both a stage and a start time. ` +
        'Add them in Enter Times.',
      usesEstimatedTime: false,
      actions: [],
    });
  }

  // Fully-scheduled sets (start + stage) for overlap/travel analysis.
  const scheduled: Scheduled[] = active
    .filter((a) => a.perf.startTime && a.perf.stageId)
    .map((a) => ({
      perf: a.perf,
      sel: a.sel,
      start: hh(a.perf.startTime!),
      end: ends.get(a.perf.id)!,
      stage: a.perf.stageId ? ctx.locationById.get(a.perf.stageId) : undefined,
      artistName: nameOf(a.perf),
    }))
    .sort((x, y) => x.start - y.start);

  // Pairwise overlap + travel.
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i];
      const b = scheduled[j];
      const aEnd = a.end.minutes ?? a.start + 30; // fallback window if unknown
      const bEnd = b.end.minutes ?? b.start + 30;
      // Anything but an exact end (estimated, or the +30 unknown fallback)
      // means the comparison is a guess — never label it "exact times".
      const usesEstimated = a.end.kind !== 'exact' || b.end.kind !== 'exact';

      const overlaps = a.start < bEnd && b.start < aEnd;
      if (overlaps) {
        const bothMustSee =
          a.sel.priority === 'must-see' && b.sel.priority === 'must-see';
        // A split plan IS a resolution. The sets still overlap on paper, so
        // the card stays (with the real times), but it stops shouting.
        const split = hasSplit(a.sel) && hasSplit(b.sel);
        // One card per clashing pair. There used to be a second, near-identical
        // "A or B?" card whenever both picks were undecided — which is the
        // default for every fresh pick, so in practice every overlap was
        // reported twice, and the badge counted the same decision twice.
        conflicts.push(
          buildOverlap(a, b, bothMustSee, usesEstimated, split),
        );
      } else if (j === i + 1 && b.start >= aEnd && a.stage && b.stage && a.stage.id !== b.stage.id) {
        // Consecutive on different stages — check walking time. Only the
        // chronologically adjacent pair matters: the user walks A→B→C, so
        // warning about the A→C "walk" would be noise.
        const gap = b.start - aEnd;
        const t = travelMinutes(a.stage, b.stage, ctx.crowd, omap);
        if (gap < t.minutes) {
          conflicts.push({
            id: `travel-${a.perf.id}-${b.perf.id}`,
            type: 'insufficient-travel',
            severity: 'warn',
            performanceIds: [a.perf.id, b.perf.id],
            artistNames: [a.artistName, b.artistName],
            title: `${a.artistName} to ${b.artistName} may be too tight`,
            message:
              `${a.artistName} ends around ${formatMin(aEnd)} at ${a.stage.shortName ?? a.stage.name}, ` +
              `and ${b.artistName} starts ${formatMin(b.start)} at ${b.stage.shortName ?? b.stage.name}. ` +
              `Only ${formatDuration(gap)} between them but the walk is about ${formatDuration(t.minutes)} ` +
              `(${endLabel(a)}, approximate walk).`,
            usesEstimatedTime: usesEstimated,
            actions: attendActions(a, b),
          });
        }
      }
    }
  }

  // Back-to-back stamina: 3+ sets each starting within 10 min of the prior end.
  const runs = findBackToBackRuns(scheduled, 10);
  for (const run of runs) {
    const names = run.map((r) => r.artistName);
    conflicts.push({
      id: `b2b-${run.map((r) => r.perf.id).join('-')}`,
      type: 'back-to-back',
      severity: 'info',
      performanceIds: run.map((r) => r.perf.id),
      artistNames: names,
      title: `${run.length} sets back-to-back`,
      message:
        `${listNames(names)} run back-to-back with little downtime. ` +
        'Consider a break, food, or a meetup in the middle.',
      usesEstimatedTime: run.some((r) => r.end.kind !== 'exact'),
      actions: [],
    });
  }

  return conflicts;
}

function buildOverlap(
  a: Scheduled,
  b: Scheduled,
  bothMustSee: boolean,
  usesEstimated: boolean,
  split: boolean,
): Conflict {
  const higher = PRIORITY_RANK[a.sel.priority] <= PRIORITY_RANK[b.sel.priority] ? a : b;
  const aStage = a.stage?.shortName ?? a.stage?.name ?? 'a stage';
  const bStage = b.stage?.shortName ?? b.stage?.name ?? 'a stage';
  if (split) return buildSplitNote(a, b, aStage, bStage, usesEstimated);
  return {
    id: `overlap-${a.perf.id}-${b.perf.id}`,
    type: bothMustSee ? 'must-see-conflict' : 'overlap',
    severity: bothMustSee ? 'high' : 'warn',
    performanceIds: [a.perf.id, b.perf.id],
    artistNames: [a.artistName, b.artistName],
    // Stage + time alone forced the reader to reconstruct which band was
    // which mid-festival. The bands are the decision; lead with them.
    title: `${a.artistName} conflicts with ${b.artistName}`,
    message:
      `${a.artistName} starts at ${formatMin(a.start)} at ${aStage}. ` +
      `${b.artistName} starts at ${formatMin(b.start)} at ${bStage}. ` +
      endBasis(a, b) +
      (bothMustSee
        ? `Both are marked Must-See — you can only catch part of each.`
        : `Higher priority right now: ${higher.artistName}.`),
    usesEstimatedTime: usesEstimated,
    actions: attendActions(a, b),
  };
}

/**
 * A split plan is a decision already made, so this is a heads-up, not a fork:
 * it says how much of each set you get and offers no "pick one" buttons. The
 * pair still overlaps on paper, which is exactly why it stays visible.
 */
function buildSplitNote(
  a: Scheduled,
  b: Scheduled,
  aStage: string,
  bStage: string,
  usesEstimated: boolean,
): Conflict {
  const aw = attendWindow(a.perf, a.sel, a.end);
  const bw = attendWindow(b.perf, b.sel, b.end);
  const part = (s: Scheduled, w: typeof aw, stage: string) =>
    w
      ? `${s.artistName} ${formatMin(w.start)}–${formatMin(w.end)} at ${stage} ` +
        `(${formatDuration(w.end - w.start)})`
      : `${s.artistName} at ${stage}`;
  return {
    id: `split-${a.perf.id}-${b.perf.id}`,
    type: 'split-plan',
    severity: 'info',
    performanceIds: [a.perf.id, b.perf.id],
    artistNames: [a.artistName, b.artistName],
    title: `Part of ${a.artistName}, part of ${b.artistName}`,
    message:
      `You're catching ${part(a, aw, aStage)}, then ${part(b, bw, bStage)}. ` +
      'Half of each, on purpose — My Day shows the same times.',
    usesEstimatedTime: usesEstimated,
    actions: splitActions(a, b),
  };
}

/** No "choose one" on a split — only adjusting it, or putting the note away. */
function splitActions(a: Scheduled, b: Scheduled): ConflictAction[] {
  const ids = [a.perf.id, b.perf.id];
  return [
    { kind: 'split', label: 'Adjust the split', performanceIds: ids },
    { kind: 'ignore', label: 'Dismiss', performanceIds: ids },
  ];
}

/** Minutes the assumed set length worked out to for this set. */
function assumedLength(s: Scheduled): number {
  return (s.end.minutes ?? s.start) - s.start;
}

/** Name the basis of an end time, so a guess never reads as a listed time. */
function endLabel(s: Scheduled): string {
  if (s.end.kind === 'exact') return 'exact end';
  if (s.end.kind === 'assumed') return `assumed ${assumedLength(s)}-min set`;
  return 'estimated end';
}

/** The one-line disclosure of what an overlap between two sets rests on. */
function endBasis(a: Scheduled, b: Scheduled): string {
  if (a.end.kind === 'exact' && b.end.kind === 'exact') return 'Based on exact times. ';
  const assumed = [a, b].filter((s) => s.end.kind === 'assumed');
  if (assumed.length) {
    // The two can differ: the late slots are assumed longer than the early ones.
    const lengths = [...new Set(assumed.map(assumedLength))].sort((x, y) => x - y);
    const phrase =
      lengths.length > 1 ? `${lengths.join('- and ')}-minute sets` : `a ${lengths[0]}-minute set`;
    return `No end time listed, so this assumes ${phrase}. `;
  }
  return 'The overlap uses an estimated end time. ';
}

function attendActions(a: Scheduled, b: Scheduled): ConflictAction[] {
  const ids = [a.perf.id, b.perf.id];
  return [
    { kind: 'attend', label: `Attend ${a.artistName}`, attendId: a.perf.id, performanceIds: ids },
    { kind: 'attend', label: `Attend ${b.artistName}`, attendId: b.perf.id, performanceIds: ids },
    { kind: 'split', label: 'Catch part of both', performanceIds: ids },
    // "Keep both undecided" is gone: undecided is the default state of every
    // fresh pick, so it was a button that changed nothing.
    { kind: 'ignore', label: 'Ignore warning', performanceIds: ids },
  ];
}

/** "A, B and C" — used where a run of sets is described. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'These sets';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function findBackToBackRuns(scheduled: Scheduled[], gapThreshold: number): Scheduled[][] {
  const runs: Scheduled[][] = [];
  let cur: Scheduled[] = [];
  for (let i = 0; i < scheduled.length; i++) {
    if (cur.length === 0) {
      cur = [scheduled[i]];
      continue;
    }
    const prev = cur[cur.length - 1];
    const prevEnd = prev.end.minutes ?? prev.start + 30;
    if (scheduled[i].start - prevEnd <= gapThreshold && scheduled[i].start >= prev.start) {
      cur.push(scheduled[i]);
    } else {
      if (cur.length >= 3) runs.push(cur);
      cur = [scheduled[i]];
    }
  }
  if (cur.length >= 3) runs.push(cur);
  return runs;
}

// helpers
function hh(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return formatTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

/** The day a conflict is about, from the sets involved. */
export function conflictDay(
  c: Conflict,
  performanceById: Map<string, Performance>,
): DayId | null {
  for (const id of c.performanceIds) {
    const day = performanceById.get(id)?.day;
    if (day) return day;
  }
  return null;
}

/** The wall-clock minute a conflict is about — its earliest involved set. */
export function conflictStartMinute(
  c: Conflict,
  performanceById: Map<string, Performance>,
): number | null {
  let min: number | null = null;
  for (const id of c.performanceIds) {
    const start = performanceById.get(id)?.startTime;
    if (!start) continue;
    const m = hh(start);
    if (min === null || m < min) min = m;
  }
  return min;
}

/**
 * Conflicts in the order they'll happen, soonest first.
 *
 * Detection order put every missing-data note at the top and left real clashes
 * below them, so the decisions that mattered were buried under notes about
 * bands with no time yet. Anything with no time sorts last — it can't be
 * placed on the clock.
 */
export function sortByClock(
  conflicts: Conflict[],
  performanceById: Map<string, Performance>,
): Conflict[] {
  return [...conflicts].sort((a, b) => {
    const am = conflictStartMinute(a, performanceById);
    const bm = conflictStartMinute(b, performanceById);
    if (am === null && bm === null) return 0;
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });
}

/** Count of conflicts by severity (for badges). */
export function conflictSummary(conflicts: Conflict[]): {
  high: number;
  warn: number;
  info: number;
  total: number;
} {
  return {
    high: conflicts.filter((c) => c.severity === 'high').length,
    warn: conflicts.filter((c) => c.severity === 'warn').length,
    info: conflicts.filter((c) => c.severity === 'info').length,
    total: conflicts.length,
  };
}
