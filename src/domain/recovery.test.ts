import { describe, it, expect } from 'vitest';
import { recoverablePicks, planCount } from './recovery';
import { withEffectiveEnds } from './endTimes';
import type { Artist, Performance, Selection } from './types';

function perf(id: string, start: string | null, stageId = 's1'): Performance {
  return {
    id,
    artistId: id,
    type: 'main',
    day: 'saturday',
    stageId,
    startTime: start,
    endTime: null,
    estimatedEndTime: null,
    scheduleStatus: 'scheduled',
  };
}

function sel(performanceId: string, over: Partial<Selection> = {}): Selection {
  return {
    userId: 'member-1',
    performanceId,
    priority: 'want-to-see',
    selected: true,
    attendanceDecision: 'undecided',
    notes: '',
    ...over,
  };
}

function ctx(perfs: Performance[], sels: Selection[]) {
  return {
    userId: 'member-1',
    selections: sels,
    performanceById: new Map(perfs.map((p) => [p.id, p])),
    artistById: new Map(
      perfs.map((p) => [
        p.artistId,
        { id: p.artistId, name: p.artistId.toUpperCase(), searchAliases: [], category: 'main-lineup' } as Artist,
      ]),
    ),
    ends: withEffectiveEnds(perfs, 10),
  };
}

describe('recovering bands dropped for clashes that no longer exist', () => {
  it('offers back a band whose clash is gone', () => {
    // 'a' was skipped for 'b'. 'b' has since moved to the evening, so nothing
    // competes with 'a' any more.
    const perfs = [perf('a', '13:00'), perf('b', '19:00', 's2')];
    const r = recoverablePicks(
      ctx(perfs, [
        sel('a', { attendanceDecision: 'skipping', skippedForConflict: true }),
        sel('b', { attendanceDecision: 'attending' }),
      ]),
    );
    expect(r.map((x) => x.performanceId)).toEqual(['a']);
  });

  it('leaves a band alone while its clash is still real', () => {
    const perfs = [perf('a', '13:00'), perf('b', '13:10', 's2')];
    const r = recoverablePicks(
      ctx(perfs, [
        sel('a', { attendanceDecision: 'skipping', skippedForConflict: true }),
        sel('b', { attendanceDecision: 'attending' }),
      ]),
    );
    expect(r).toEqual([]);
  });

  it('never resurrects a band dropped by hand', () => {
    // Same free slot, but no skippedForConflict flag — this was a real choice.
    const perfs = [perf('a', '13:00'), perf('b', '19:00', 's2')];
    const r = recoverablePicks(
      ctx(perfs, [
        sel('a', { attendanceDecision: 'skipping' }),
        sel('b', { attendanceDecision: 'attending' }),
      ]),
    );
    expect(r).toEqual([]);
  });

  it('ignores a clash with another band that is also skipped', () => {
    // 'a' and 'b' overlap, but 'b' is off the plan too — so 'a' is free to
    // come back, and restoring both simply makes them contested again.
    const perfs = [perf('a', '13:00'), perf('b', '13:10', 's2')];
    const r = recoverablePicks(
      ctx(perfs, [
        sel('a', { attendanceDecision: 'skipping', skippedForConflict: true }),
        sel('b', { attendanceDecision: 'skipping', skippedForConflict: true }),
      ]),
    );
    expect(r.map((x) => x.performanceId).sort()).toEqual(['a', 'b']);
  });

  it('respects a split plan when deciding what still clashes', () => {
    // 'b' is trimmed to arrive after 'a' finishes, so 'a' no longer competes.
    const perfs = [perf('a', '13:00'), perf('b', '13:10', 's2')];
    const r = recoverablePicks(
      ctx(perfs, [
        sel('a', { attendanceDecision: 'skipping', skippedForConflict: true }),
        sel('b', { attendanceDecision: 'attending', arriveLateMinutes: 25 }),
      ]),
    );
    expect(r.map((x) => x.performanceId)).toEqual(['a']);
  });
});

describe('how much of the day is left', () => {
  it('counts picks still on the plan against picks made', () => {
    const perfs = [perf('a', '13:00'), perf('b', '15:00'), perf('c', '17:00')];
    const c = planCount(
      'member-1',
      'saturday',
      [
        sel('a'),
        sel('b', { attendanceDecision: 'skipping' }),
        sel('c', { attendanceDecision: 'attending' }),
      ],
      new Map(perfs.map((p) => [p.id, p])),
    );
    expect(c).toEqual({ onPlan: 2, picked: 3 });
  });
});
