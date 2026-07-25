import { describe, it, expect } from 'vitest';
import { planBreaks, BREAK_META } from './breaks';
import { hhmmToMinutes } from './time';
import type { Performance, Selection, MapLocation } from './types';

const locations: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'rex', name: 'Rex Stage', shortName: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 },
  { id: 'food-1', name: 'Food 1', category: 'amenity', amenityType: 'Food', xPercent: 60, yPercent: 55 },
  { id: 'water-1', name: 'Water 1', category: 'amenity', amenityType: 'Water Stations', xPercent: 90, yPercent: 46 },
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

function ctx(perfs: Performance[]) {
  return {
    selections: perfs.map((p) => sel(p.id)),
    performanceById: new Map(perfs.map((p) => [p.id, p])),
    locationById: new Map(locations.map((l) => [l.id, l])),
    allPerformances: perfs,
    crowd: 'normal' as const,
    turnoverBuffer: 10,
    overrides: [],
    bounds: { open: hhmmToMinutes('11:00'), close: hhmmToMinutes('22:00') },
  };
}

describe('break planning (add-on §7)', () => {
  it('finds a food window in the gap between two sets', () => {
    const perfs = [perf('a', 'ghost', '13:00', '13:45'), perf('b', 'rex', '15:00', '15:45')];
    const [food] = planBreaks('member-1', 'saturday', ['food'], ctx(perfs));
    expect(food).toBeDefined();
    expect(food.startMinute).toBe(hhmmToMinutes('13:45'));
    expect(food.endMinute).toBe(hhmmToMinutes('15:00'));
    expect(food.betweenSets).toBe(true);
    expect(food.location?.amenityType).toBe('Food');
    expect(food.fromName).toBe('Ghost');
    expect(food.toName).toBe('Rex');
  });

  it('prefers a real mid-day gap over the wide-open pre-show stretch', () => {
    // 11:00–13:00 is free, but nobody plans lunch for "some time before 1pm".
    const perfs = [perf('a', 'ghost', '13:00', '13:45'), perf('b', 'rex', '15:00', '15:45')];
    const [food] = planBreaks('member-1', 'saturday', ['food'], ctx(perfs));
    expect(food.startMinute).toBeGreaterThan(hhmmToMinutes('11:00'));
  });

  it('reports nothing when no gap is long enough', () => {
    // Back-to-back sets all afternoon with only a 5-minute seam.
    const perfs = [
      perf('a', 'ghost', '11:00', '13:00'),
      perf('b', 'ghost', '13:05', '15:00'),
      perf('c', 'ghost', '15:05', '22:00'),
    ];
    expect(planBreaks('member-1', 'saturday', ['food'], ctx(perfs))).toEqual([]);
  });

  it('a short need still fits where a long one does not', () => {
    // A 12-minute seam: too short to eat, long enough to refill a bottle.
    const perfs = [perf('a', 'ghost', '11:00', '14:00'), perf('b', 'ghost', '14:12', '22:00')];
    const c = ctx(perfs);
    expect(planBreaks('member-1', 'saturday', ['food'], c)).toEqual([]);
    const [water] = planBreaks('member-1', 'saturday', ['water'], c);
    expect(water).toBeDefined();
    expect(water.durationMinutes).toBeGreaterThanOrEqual(BREAK_META.water.minMinutes);
  });

  it('does not suggest a break that the walk would swallow', () => {
    // The only water pin is next to Ghost, so a Ghost-side gap is cheap...
    const near = [perf('a', 'ghost', '13:00', '13:45'), perf('b', 'ghost', '14:00', '14:45')];
    const [ok] = planBreaks('member-1', 'saturday', ['water'], ctx(near));
    expect(ok).toBeDefined();
    expect(ok.walkMinutes).toBeLessThan(ok.durationMinutes);
  });

  it('returns one window per requested need', () => {
    const perfs = [perf('a', 'ghost', '13:00', '13:45'), perf('b', 'rex', '16:00', '16:45')];
    const out = planBreaks('member-1', 'saturday', ['food', 'water'], ctx(perfs));
    expect(out.map((w) => w.kind).sort()).toEqual(['food', 'water']);
  });
});
