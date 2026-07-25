import { describe, it, expect } from 'vitest';
import { suggestSplit, attendWindow, hasSplit } from './splitSet';
import { withEffectiveEnds } from './endTimes';
import { overrideMap } from './travel';
import { hhmmToMinutes } from './time';
import type { Performance, Selection, MapLocation } from './types';

const stages: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'beatbox', name: 'BeatBox Stage', shortName: 'BeatBox', category: 'stage', xPercent: 84, yPercent: 45 },
  { id: 'rex', name: 'Rex Stage', shortName: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 },
];
const byId = new Map(stages.map((s) => [s.id, s]));

function perf(id: string, stageId: string, start: string, end: string | null): Performance {
  return {
    id, artistId: id, type: 'main', day: 'saturday', stageId,
    startTime: start, endTime: end, estimatedEndTime: null, scheduleStatus: 'scheduled',
  };
}

function wrap(p: Performance, all: Performance[]) {
  return { perf: p, end: withEffectiveEnds(all, 10).get(p.id)!, stage: byId.get(p.stageId!) };
}

const sel = (patch: Partial<Selection> = {}): Selection => ({
  userId: 'member-1', performanceId: 'a', priority: 'must-see',
  selected: true, attendanceDecision: 'attending', notes: '', ...patch,
});

describe('split-set planning (add-on §3)', () => {
  it('proposes a switch point in the middle of the overlap', () => {
    // Jimmy 3:05–3:45 at Ghost, Underoath 3:20–4:00 at BeatBox (adjacent).
    const all = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const plan = suggestSplit(wrap(all[0], all), wrap(all[1], all), 'normal', overrideMap([]))!;
    expect(plan.firstId).toBe('a');
    expect(plan.secondId).toBe('b');
    expect(plan.switchMinute).toBeGreaterThan(hhmmToMinutes('15:20'));
    expect(plan.switchMinute).toBeLessThanOrEqual(hhmmToMinutes('15:45'));
  });

  it("arrival accounts for the walk, so it's later than the switch", () => {
    const all = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'rex', '15:20', '16:00')];
    const plan = suggestSplit(wrap(all[0], all), wrap(all[1], all), 'normal', overrideMap([]))!;
    expect(plan.walkMinutes).toBeGreaterThan(0);
    expect(plan.arriveMinute).toBe(plan.switchMinute + plan.walkMinutes);
    expect(plan.arriveLateMinutes).toBe(plan.arriveMinute - hhmmToMinutes('15:20'));
  });

  it('gives real time at BOTH sets, not a token appearance', () => {
    const all = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const plan = suggestSplit(wrap(all[0], all), wrap(all[1], all), 'normal', overrideMap([]))!;
    expect(plan.firstMinutes).toBeGreaterThanOrEqual(5);
    expect(plan.secondMinutes).toBeGreaterThanOrEqual(5);
  });

  it('refuses to split sets that do not overlap', () => {
    const all = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'beatbox', '16:00', '16:40')];
    expect(suggestSplit(wrap(all[0], all), wrap(all[1], all), 'normal', overrideMap([]))).toBeNull();
  });

  it('refuses when the walk would consume the whole second set', () => {
    // Rex is far; a 10-minute overlap can't absorb the walk.
    const all = [perf('a', 'ghost', '15:00', '15:20'), perf('b', 'rex', '15:10', '15:22')];
    expect(suggestSplit(wrap(all[0], all), wrap(all[1], all), 'heavy', overrideMap([]))).toBeNull();
  });

  it('attendWindow trims the set to the planned split', () => {
    const all = [perf('a', 'ghost', '15:05', '15:45')];
    const ends = withEffectiveEnds(all, 10);
    const w = attendWindow(all[0], sel({ leaveEarlyMinutes: 20 }), ends.get('a')!)!;
    expect(w.start).toBe(hhmmToMinutes('15:05'));
    expect(w.end).toBe(hhmmToMinutes('15:25'));
    expect(w.partial).toBe(true);
  });

  it('attendWindow is the full set with no split', () => {
    const all = [perf('a', 'ghost', '15:05', '15:45')];
    const w = attendWindow(all[0], sel(), withEffectiveEnds(all, 10).get('a')!)!;
    expect(w.partial).toBe(false);
    expect(w.end - w.start).toBe(40);
  });

  it('never produces a negative-length window from an over-large trim', () => {
    const all = [perf('a', 'ghost', '15:05', '15:45')];
    const w = attendWindow(
      all[0],
      sel({ arriveLateMinutes: 500, leaveEarlyMinutes: 500 }),
      withEffectiveEnds(all, 10).get('a')!,
    )!;
    expect(w.end).toBeGreaterThanOrEqual(w.start);
  });

  it('hasSplit only reports a real trim', () => {
    expect(hasSplit(sel())).toBe(false);
    expect(hasSplit(sel({ arriveLateMinutes: 0, leaveEarlyMinutes: 0 }))).toBe(false);
    expect(hasSplit(sel({ arriveLateMinutes: 11 }))).toBe(true);
  });
});
