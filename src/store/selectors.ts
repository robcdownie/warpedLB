import type {
  Artist,
  Performance,
  Selection,
  MapLocation,
  DayId,
} from '@/domain/types';

// Pure derivation helpers used across screens. They take the raw store arrays
// so they can also be unit-tested without React.

export interface JoinedPerformance {
  performance: Performance;
  artist: Artist | undefined;
  stage: MapLocation | undefined;
  selection: Selection | undefined;
}

export function scheduleCompletion(performances: Performance[]): {
  main: number;
  scheduledMain: number;
  percent: number;
} {
  const main = performances.filter((p) => p.type === 'main');
  const scheduled = main.filter((p) => p.startTime && p.stageId);
  return {
    main: main.length,
    scheduledMain: scheduled.length,
    percent: main.length ? Math.round((scheduled.length / main.length) * 100) : 0,
  };
}

export function selectionsForUser(
  selections: Selection[],
  userId: string,
): Selection[] {
  return selections.filter((s) => s.userId === userId && s.selected);
}

/** Selected performances for a user on a given day (main lineup). */
export function selectedMainByDay(
  selections: Selection[],
  performanceById: Map<string, Performance>,
  userId: string,
  day: DayId,
): Selection[] {
  return selections.filter((s) => {
    if (s.userId !== userId || !s.selected) return false;
    const p = performanceById.get(s.performanceId);
    return p?.type === 'main' && p.day === day;
  });
}

export function join(
  performance: Performance,
  artistById: Map<string, Artist>,
  locationById: Map<string, MapLocation>,
  selection?: Selection,
): JoinedPerformance {
  return {
    performance,
    artist: artistById.get(performance.artistId),
    stage: performance.stageId ? locationById.get(performance.stageId) : undefined,
    selection,
  };
}

/** Which users selected (and are attending / undecided) a given performance. */
export function usersOnPerformance(
  selections: Selection[],
  performanceId: string,
): { userId: string; attendance: Selection['attendanceDecision'] }[] {
  return selections
    .filter((s) => s.performanceId === performanceId && s.selected)
    .map((s) => ({ userId: s.userId, attendance: s.attendanceDecision }));
}

/** A user's chronological, scheduled, attending itinerary for a day. */
export function itinerary(
  selections: Selection[],
  performanceById: Map<string, Performance>,
  userId: string,
  day: DayId,
  opts: { includeUndecided?: boolean } = {},
): Performance[] {
  const includeUndecided = opts.includeUndecided ?? true;
  const perfs: Performance[] = [];
  for (const s of selections) {
    if (s.userId !== userId || !s.selected) continue;
    const p = performanceById.get(s.performanceId);
    if (!p || p.day !== day || !p.startTime) continue;
    if (s.attendanceDecision === 'skipping') continue;
    if (!includeUndecided && s.attendanceDecision !== 'attending') continue;
    perfs.push(p);
  }
  return perfs.sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
}
