import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  sortByClock,
  conflictStartMinute,
  type ConflictContext,
} from './conflicts';
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
    const note = conflicts.find((c) => c.performanceIds.includes('a') && c.performanceIds.includes('b'))!;
    // The sets still overlap on paper, so the card stays — but it's a note now.
    expect(note.type).toBe('split-plan');
    expect(note.severity).toBe('info');
    // …and it's the only card for the pair — no second "A or B?" alongside it.
    expect(conflicts.filter((c) => c.performanceIds.includes('a')).length).toBe(1);
  });

  it('a split note says how much of each set you get, and asks nothing', () => {
    const perfs = [perf('a', 'ghost', '15:05', '15:45'), perf('b', 'beatbox', '15:20', '16:00')];
    const withSplit = [
      { ...sel('a'), attendanceDecision: 'attending' as const, leaveEarlyMinutes: 15 },
      { ...sel('b'), attendanceDecision: 'attending' as const, arriveLateMinutes: 16 },
    ];
    const note = detectConflicts('saturday', ctx(perfs, withSplit)).find(
      (c) => c.type === 'split-plan',
    )!;
    expect(note.title).toBe('Part of Jimmy Eat World, part of Underoath');
    // The actual trimmed windows, not just "you planned a split".
    expect(note.message).toContain('Jimmy Eat World 3:05 PM–3:30 PM');
    expect(note.message).toContain('Underoath 3:36 PM–4:00 PM');
    // No "pick one" buttons — the choice was already made.
    expect(note.actions.some((x) => x.kind === 'attend')).toBe(false);
    expect(note.actions.some((x) => x.kind === 'undecided')).toBe(false);
    expect(note.actions.map((x) => x.kind)).toEqual(['split', 'ignore']);
  });

  it('labels overlaps that rely on an estimated end time', () => {
    // 'a' has no end; the next set on the SAME stage cuts it short of 30 min.
    const perfs = [
      perf('a', 'ghost', '15:00'),
      perf('filler', 'ghost', '15:25'),
      perf('b', 'rex', '15:10', '16:00'),
    ];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const overlap = conflicts.find((c) => c.type === 'overlap' || c.type === 'must-see-conflict');
    expect(overlap?.usesEstimatedTime).toBe(true);
    expect(overlap?.message).toContain('estimated end time');
  });

  it('says so when an overlap rests on the assumed set length', () => {
    // Nothing after 'a' on its stage — it counts as a 30-minute set.
    const perfs = [perf('a', 'ghost', '15:00'), perf('b', 'rex', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const overlap = conflicts.find((c) => c.type === 'overlap' || c.type === 'must-see-conflict');
    expect(overlap?.usesEstimatedTime).toBe(true);
    expect(overlap?.message).toContain('assumes a 30-minute set');
  });

  it('does not stretch a set to the next band on its stage', () => {
    // The bug: 'a' at 1:00 with nothing else on Ghost until 5:00 used to run
    // four hours and conflict with every band entered in between.
    const perfs = [
      perf('a', 'ghost', '13:00'),
      perf('filler', 'ghost', '17:00'),
      perf('b', 'rex', '14:00'),
      perf('c', 'beatbox', '15:00'),
    ];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b'), sel('c')]));
    expect(conflicts.some((x) => x.type === 'overlap' || x.type === 'must-see-conflict')).toBe(false);
  });
});

describe('one card per decision', () => {
  it('reports an overlap once, not twice, when both picks are undecided', () => {
    // Undecided is the default for every fresh pick, so a second
    // "A or B?" card meant every overlap was reported — and counted — twice.
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:20', '16:00')];
    const conflicts = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')]));
    const forPair = conflicts.filter(
      (c) => c.performanceIds.includes('a') && c.performanceIds.includes('b'),
    );
    expect(forPair).toHaveLength(1);
    expect(forPair[0].type).toBe('overlap');
  });

  it('reports one card for a band missing both a stage and a time', () => {
    const p: Performance = { ...perf('a', 'ghost', '15:00'), stageId: null, startTime: null };
    const conflicts = detectConflicts('saturday', ctx([p], [sel('a')]));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].title).toBe('Jimmy Eat World: no stage or time yet');
  });

  it('drops the no-op "keep both undecided" button', () => {
    const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'rex', '15:20', '16:00')];
    const overlap = detectConflicts('saturday', ctx(perfs, [sel('a'), sel('b')])).find(
      (c) => c.type === 'overlap',
    )!;
    expect(overlap.actions.some((x) => x.kind === 'undecided')).toBe(false);
  });
});

describe('putting conflicts in clock order', () => {
  it('sorts by the earliest set involved, with untimed notes last', () => {
    const perfs = [
      perf('a', 'ghost', '19:00', '19:40'),
      perf('b', 'rex', '19:20', '20:00'),
      perf('c', 'beatbox', '13:00', '13:40'),
      { ...perf('filler', 'ghost', '13:10'), startTime: null } as Performance,
    ];
    const conflicts = detectConflicts(
      'saturday',
      ctx(perfs, [sel('a'), sel('b'), sel('c'), sel('filler')]),
    );
    const sorted = sortByClock(conflicts, new Map(perfs.map((p) => [p.id, p])));
    const first = conflictStartMinute(sorted[0], new Map(perfs.map((p) => [p.id, p])));
    expect(first).toBe(19 * 60); // the 7 PM clash, not the untimed note
    expect(conflictStartMinute(sorted[sorted.length - 1], new Map(perfs.map((p) => [p.id, p])))).toBeNull();
  });
});
