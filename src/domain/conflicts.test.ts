import { describe, it, expect } from 'vitest';
import { detectConflicts, type ConflictContext } from './conflicts';
import type { Performance, Selection, MapLocation, Priority, Artist } from './types';

// Real names, because the point of these conflicts is that they name bands.
const ARTISTS: Artist[] = [
  { id: 'a', name: 'Jimmy Eat World', searchAliases: [], category: 'main-lineup' },
  { id: 'b', name: 'Underoath', searchAliases: [], category: 'main-lineup' },
  { id: 'c', name: 'The Story So Far', searchAliases: [], category: 'main-lineup' },
  { id: 'filler', name: 'Filler Band', searchAliases: [], category: 'main-lineup' },
];

// Two stages far apart so travel is meaningful.
const stages: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'rex', name: 'Rex Stage', shortName: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 },
  { id: 'beatbox', name: 'BeatBox Stage', shortName: 'BeatBox', category: 'stage', xPercent: 84, yPercent: 45 },
];

function perf(id: string, stageId: string, start: string, end: string | null = null): Performance {
  return {
    id,
    artistId: id,
    type: 'main',
    day: 'saturday',
    stageId,
    startTime: start,
    endTime: end,
    estimatedEndTime: null,
    scheduleStatus: 'scheduled',
  };
}

function sel(performanceId: string, priority: Priority = 'want-to-see'): Selection {
  return { userId: 'member-1', performanceId, priority, selected: true, attendanceDecision: 'undecided', notes: '' };
}

function ctx(perfs: Performance[], sels: Selection[]): ConflictContext {
  return {
    userId: 'member-1',
    selections: sels,
    performanceById: new Map(perfs.map((p) => [p.id, p])),
    locationById: new Map(stages.map((s) => [s.id, s])),
    artistById: new Map(ARTISTS.map((a) => [a.id, a])),
    allPerformances: perfs,
    crowd: 'normal',
    turnoverBuffer: 10,
    overrides: [],
  };
}

describe('conflict engine (spec §22, §28)', () => {
  it('detects a direct time overlap (acceptance §24)', () => {
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    expect(conflicts.some((c) => c.type === 'overlap' || c.type === 'must-see-conflict')).toBe(true);
  });

  it('flags must-see vs must-see as high severity', () => {
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a', 'must-see'), sel('b', 'must-see')]));
    const c = conflicts.find((x) => x.type === 'must-see-conflict');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('high');
  });

  it('detects insufficient travel time between consecutive sets (acceptance §25)', () => {
    // Ghost ends 15:40, Rex starts 15:45 → 5 min gap, but Ghost→Rex walk is ~8 min.
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:45', '16:20')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    expect(conflicts.some((c) => c.type === 'insufficient-travel')).toBe(true);
  });

  it('allows a comfortable gap between nearby stages', () => {
    // Ghost ends 15:40, BeatBox (adjacent) starts 16:10 → plenty of time.
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'beatbox', '16:10', '16:50')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    expect(conflicts.some((c) => c.type === 'insufficient-travel')).toBe(false);
    expect(conflicts.some((c) => c.type === 'overlap')).toBe(false);
  });

  it('reports missing stage and missing time', () => {
    const p1: Performance = { ...perf('a', 'ghost', '15:00'), stageId: null };
    const p2: Performance = { ...perf('b', 'rex', '15:00'), startTime: null };
    const conflicts = detectConflicts('saturday', ctx([p1, p2], [sel('a'), sel('b')]));
    expect(conflicts.some((c) => c.type === 'missing-stage')).toBe(true);
    expect(conflicts.some((c) => c.type === 'missing-time')).toBe(true);
  });

  it('names both artists in the title, message and attend actions (plan §P0-4)', () => {
    const perfs = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const overlap = conflicts.find((c) => c.type === 'overlap')!;
    expect(overlap.title).toBe('Jimmy Eat World conflicts with Underoath');
    expect(overlap.message).toContain('Jimmy Eat World starts at 3:05 PM');
    expect(overlap.message).toContain('Underoath starts at 3:20 PM');
    expect(overlap.artistNames).toEqual(['Jimmy Eat World', 'Underoath']);
    // No "first set" / "second set" ambiguity anywhere in the actions.
    const labels = overlap.actions.map((a) => a.label);
    expect(labels).toContain('Attend Jimmy Eat World');
    expect(labels).toContain('Attend Underoath');
    expect(labels.some((l) => /first set|second set/i.test(l))).toBe(false);
  });

  it('names the artist on missing-stage and missing-time notes', () => {
    const p1: Performance = { ...perf('a', 'ghost', '15:00'), stageId: null };
    const p2: Performance = { ...perf('b', 'rex', '15:00'), startTime: null };
    const conflicts = detectConflicts('saturday', ctx([p1, p2], [sel('a'), sel('b')]));
    expect(conflicts.find((c) => c.type === 'missing-stage')!.title).toContain('Jimmy Eat World');
    expect(conflicts.find((c) => c.type === 'missing-time')!.title).toContain('Underoath');
  });

  it('names both artists in a tight-walk warning', () => {
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:45', '16:20')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const travel = conflicts.find((c) => c.type === 'insufficient-travel')!;
    expect(travel.title).toBe('Jimmy Eat World to Underoath may be too tight');
  });

  it('offers a split-set action on an overlap', () => {
    const perfs = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const overlap = conflicts.find((c) => c.type === 'overlap')!;
    expect(overlap.actions.some((a) => a.kind === 'split')).toBe(true);
  });

  it('a saved split stops the clash shouting (add-on §3)', () => {
    const perfs = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const withSplit = [
      { ...sel('a', 'must-see'), attendanceDecision: 'attending' as const, leaveEarlyMinutes: 15 },
      { ...sel('b', 'must-see'), attendanceDecision: 'attending' as const, arriveLateMinutes: 16 },
    ];
    const conflicts = detectConflicts('saturday', ctx(perfs, withSplit));
    const overlap = conflicts.find((c) => c.performanceIds.includes('a') && c.performanceIds.includes('b'))!;
    // The sets still overlap on paper, so the card stays — but it's a note now.
    expect(overlap.severity).toBe('info');
    expect(overlap.title).toContain('split plan');
    // …and it no longer nags about an undecided choice.
    expect(conflicts.some((c) => c.type === 'undecided-attendance')).toBe(false);
  });

  it('labels overlaps that rely on an estimated end time', () => {
    // 'a' has no end; next set on the SAME stage gives an estimate.
    const perfs = [
      perf('a', 'ghost', '15:00'),
      perf('filler', 'ghost', '15:50'),
      perf('b', 'rex', '15:30', '16:00'),
    ];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const overlap = conflicts.find((c) => c.type === 'overlap' || c.type === 'must-see-conflict');
    expect(overlap?.usesEstimatedTime).toBe(true);
  });
});
