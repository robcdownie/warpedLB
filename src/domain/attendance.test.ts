import { describe, it, expect } from 'vitest';
import { contestedPicks, planState, nextDecision } from './attendance';
import { effectiveEnd } from './endTimes';
import type { Performance, Selection } from './types';

function perf(id: string, start: string, stageId = 's1'): Performance {
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

function sel(
  performanceId: string,
  attendanceDecision: Selection['attendanceDecision'] = 'undecided',
  extra: Partial<Selection> = {},
): Selection {
  return {
    userId: 'member-1',
    performanceId,
    priority: 'want-to-see',
    selected: true,
    attendanceDecision,
    notes: '',
    ...extra,
  };
}

/** Picks as the schedule builds them: performance + selection + effective end. */
function picks(entries: [Performance, Selection][]) {
  const all = entries.map(([p]) => p);
  return entries.map(([p, s]) => ({
    perf: p,
    sel: s,
    end: effectiveEnd(
      p,
      all.filter((x) => x.stageId === p.stageId),
      10,
    ),
  }));
}

describe('what counts as a decision', () => {
  it('leaves a pick with nothing against it uncontested', () => {
    const a = perf('a', '13:00');
    const b = perf('b', '15:00', 's2');
    expect(contestedPicks(picks([[a, sel('a')], [b, sel('b')]])).size).toBe(0);
  });

  it('contests two picks whose sets overlap', () => {
    const a = perf('a', '13:00');
    const b = perf('b', '13:20', 's2');
    const c = contestedPicks(picks([[a, sel('a')], [b, sel('b')]]));
    expect([...c].sort()).toEqual(['a', 'b']);
  });

  it('does not contest a set you are skipping', () => {
    const a = perf('a', '13:00');
    const b = perf('b', '13:20', 's2');
    const c = contestedPicks(picks([[a, sel('a')], [b, sel('b', 'skipping')]]));
    expect(c.size).toBe(0);
  });

  it('does not contest a pair you have split — that IS the decision', () => {
    const a = perf('a', '13:00');
    const b = perf('b', '13:20', 's2');
    const c = contestedPicks(
      picks([
        [a, sel('a', 'attending', { leaveEarlyMinutes: 15 })],
        [b, sel('b', 'attending', { arriveLateMinutes: 5 })],
      ]),
    );
    expect(c.size).toBe(0);
  });
});

describe('how a pick reads on the plan', () => {
  it('shows an uncontested maybe as being on the plan', () => {
    expect(planState(sel('a'), new Set())).toBe('going');
  });

  it('shows a contested maybe as a maybe', () => {
    expect(planState(sel('a'), new Set(['a']))).toBe('maybe');
  });

  it('never overrides what you said explicitly', () => {
    expect(planState(sel('a', 'attending'), new Set(['a']))).toBe('going');
    expect(planState(sel('a', 'skipping'), new Set(['a']))).toBe('skipping');
    expect(planState(sel('a', 'skipping'), new Set())).toBe('skipping');
  });
});

describe('what the badge does when tapped', () => {
  it('toggles an uncontested pick straight on and off the plan', () => {
    expect(nextDecision('going', false)).toBe('skipping');
    expect(nextDecision('skipping', false)).toBe('attending');
  });

  it('offers maybe only where there is something to be unsure about', () => {
    expect(nextDecision('going', true)).toBe('undecided');
    expect(nextDecision('maybe', true)).toBe('skipping');
  });
});
