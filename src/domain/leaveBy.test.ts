import { describe, it, expect } from 'vitest';
import { leaveByPlan, nextLeaveBy, urgencyFor } from './leaveBy';
import { hhmmToMinutes } from './time';
import type { Performance, Selection, MapLocation } from './types';

const stages: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'rex', name: 'Rex Stage', shortName: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 },
  // The entrance id the travel math falls back to before the first set.
  { id: 'shoreline-village-drive-entrance', name: 'Entrance', category: 'entrance', xPercent: 50, yPercent: 95 },
];

function perf(id: string, stageId: string, start: string, end: string): Performance {
  return {
    id, artistId: id, type: 'main', day: 'saturday', stageId,
    startTime: start, endTime: end, estimatedEndTime: null, scheduleStatus: 'scheduled',
  };
}
const sel = (pid: string): Selection => ({
  userId: 'member-1', performanceId: pid, priority: 'must-see',
  selected: true, attendanceDecision: 'attending', notes: '',
});

const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '16:30', '17:10')];
const ctx = {
  selections: [sel('a'), sel('b')],
  performanceById: new Map(perfs.map((p) => [p.id, p])),
  locationById: new Map(stages.map((s) => [s.id, s])),
  allPerformances: perfs,
  crowd: 'normal' as const,
  turnoverBuffer: 10,
  overrides: [],
};

describe('leave-by planning (add-on §2)', () => {
  it('leave-by is the set start minus the walk', () => {
    const info = nextLeaveBy('member-1', 'saturday', hhmmToMinutes('15:50'), ctx)!;
    expect(info.performanceId).toBe('b');
    expect(info.walkMinutes).toBeGreaterThan(0);
    expect(info.leaveMinute).toBe(hhmmToMinutes('16:30') - info.walkMinutes);
  });

  it('counts down to LEAVING, not to the set starting', () => {
    const at = hhmmToMinutes('16:00');
    const info = nextLeaveBy('member-1', 'saturday', at, ctx)!;
    expect(info.slackMinutes).toBe(info.leaveMinute - at);
    expect(info.slackMinutes).toBeLessThan(hhmmToMinutes('16:30') - at);
  });

  it('skips sets that have already started', () => {
    const plan = leaveByPlan('member-1', 'saturday', hhmmToMinutes('15:20'), ctx, 5);
    expect(plan.map((p) => p.performanceId)).not.toContain('a');
  });

  it('says "likely late" when the current set runs past the leave-by moment', () => {
    // Ghost runs to 15:40; a Rex set at 15:45 can't be reached in time.
    const tight = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:45', '16:20')];
    const tightCtx = {
      ...ctx,
      selections: [sel('a'), sel('b')],
      performanceById: new Map(tight.map((p) => [p.id, p])),
      allPerformances: tight,
    };
    const info = nextLeaveBy('member-1', 'saturday', hhmmToMinutes('15:30'), tightCtx)!;
    expect(info.urgency).toBe('late');
  });

  it('uses the entrance as the origin before the first set', () => {
    const info = nextLeaveBy('member-1', 'saturday', hhmmToMinutes('11:30'), ctx)!;
    expect(info.performanceId).toBe('a');
    expect(info.fromLocationId).toBe('shoreline-village-drive-entrance');
  });

  it('a heavier crowd setting means leaving earlier', () => {
    const at = hhmmToMinutes('15:50');
    const light = nextLeaveBy('member-1', 'saturday', at, { ...ctx, crowd: 'light' })!;
    const heavy = nextLeaveBy('member-1', 'saturday', at, { ...ctx, crowd: 'heavy' })!;
    expect(heavy.leaveMinute).toBeLessThan(light.leaveMinute);
  });

  it('ignores sets the user is skipping', () => {
    const skipping = {
      ...ctx,
      selections: [sel('a'), { ...sel('b'), attendanceDecision: 'skipping' as const }],
    };
    expect(nextLeaveBy('member-1', 'saturday', hhmmToMinutes('15:50'), skipping)).toBeNull();
  });

  it('urgency thresholds escalate as slack shrinks', () => {
    expect(urgencyFor(30)).toBe('plenty');
    expect(urgencyFor(7)).toBe('soon');
    expect(urgencyFor(1)).toBe('now');
    expect(urgencyFor(-3)).toBe('late');
  });
});
