import { describe, it, expect } from 'vitest';
import { buildWrapUp } from './wrapUp';
import type { CheckIn, Performance, Priority, Selection } from './types';

function perf(id: string, day: 'saturday' | 'sunday', startTime: string | null): Performance {
  return {
    id,
    artistId: `a-${id}`,
    day,
    type: 'main',
    stageId: startTime ? 'ghost-stage' : null,
    startTime,
    endTime: startTime ? '23:59' : null,
    scheduleStatus: startTime ? 'scheduled' : 'unknown',
  } as Performance;
}

function sel(performanceId: string, priority: Priority = 'want-to-see'): Selection {
  return {
    userId: 'member-1',
    performanceId,
    priority,
    selected: true,
    attendanceDecision: 'undecided',
    notes: '',
  };
}

function checkIn(userId: string, id: string): CheckIn {
  return {
    id,
    userId,
    locationId: 'ghost-stage',
    customCoordinates: null,
    source: 'manual',
    updatedAt: '2026-07-25T18:00:00-07:00',
  };
}

function build(perfs: Performance[], selections: Selection[], checkins: CheckIn[] = [], friends = 0) {
  return buildWrapUp({
    selections,
    performanceById: new Map(perfs.map((p) => [p.id, p])),
    checkins,
    userId: 'member-1',
    friendPlanCount: friends,
  });
}

describe('post-festival wrap-up', () => {
  it('counts picks per day across both festival days', () => {
    const perfs = [perf('p1', 'saturday', '15:00'), perf('p2', 'saturday', '17:00'), perf('p3', 'sunday', '16:00')];
    const w = build(perfs, [sel('p1'), sel('p2'), sel('p3')]);
    expect(w.totalPlanned).toBe(3);
    expect(w.days.map((d) => d.planned)).toEqual([2, 1]);
  });

  it('counts picks that never got a time — the common case if nobody typed the board', () => {
    // The whole app ships with an empty schedule, so a user who picked bands but
    // never imported a code still deserves a recap. Counts must not depend on times.
    const perfs = [perf('p1', 'saturday', null), perf('p2', 'sunday', null)];
    const w = build(perfs, [sel('p1'), sel('p2')]);
    expect(w.totalPlanned).toBe(2);
    expect(w.hasTimeline).toBe(false);
    expect(w.empty).toBe(false);
  });

  it('builds a chronological timeline only from sets that have times', () => {
    const perfs = [
      perf('late', 'saturday', '20:00'),
      perf('early', 'saturday', '12:00'),
      perf('untimed', 'saturday', null),
    ];
    const w = build(perfs, [sel('late'), sel('early'), sel('untimed')]);
    expect(w.hasTimeline).toBe(true);
    expect(w.days[0].timeline.map((p) => p.id)).toEqual(['early', 'late']);
    // The untimed pick still counts as planned, it just cannot be placed.
    expect(w.days[0].planned).toBe(3);
  });

  it('counts must-see picks separately', () => {
    const perfs = [perf('p1', 'saturday', '15:00'), perf('p2', 'saturday', '16:00')];
    const w = build(perfs, [sel('p1', 'must-see'), sel('p2', 'optional')]);
    expect(w.mustSee).toBe(1);
  });

  it('counts only your own check-ins — nobody else’s can reach this phone', () => {
    const perfs = [perf('p1', 'saturday', '15:00')];
    const w = build(perfs, [sel('p1')], [checkIn('member-1', 'c1'), checkIn('member-2', 'c2')]);
    expect(w.checkIns).toBe(1);
  });

  it('reports empty when nothing was ever picked, rather than inventing a recap', () => {
    const w = build([perf('p1', 'saturday', '15:00')], []);
    expect(w.empty).toBe(true);
    expect(w.totalPlanned).toBe(0);
    expect(w.hasTimeline).toBe(false);
  });

  it('ignores deselected picks', () => {
    const perfs = [perf('p1', 'saturday', '15:00')];
    const w = build(perfs, [{ ...sel('p1'), selected: false }]);
    expect(w.totalPlanned).toBe(0);
  });

  it('excludes sets the user explicitly decided to skip from the timeline', () => {
    // Skipping is a real decision; replaying it as part of the weekend would
    // misrepresent what the user told the app.
    const perfs = [perf('p1', 'saturday', '15:00'), perf('p2', 'saturday', '16:00')];
    const w = build(perfs, [sel('p1'), { ...sel('p2'), attendanceDecision: 'skipping' }]);
    expect(w.days[0].timeline.map((p) => p.id)).toEqual(['p1']);
    expect(w.days[0].planned).toBe(2);
  });
});
