import { describe, it, expect } from 'vitest';
import { effectiveEnd } from './endTimes';
import type { Performance } from './types';

function perf(id: string, start: string | null, end: string | null = null, stageId = 's1'): Performance {
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

describe('effective end times (spec §19)', () => {
  it('uses an exact end time when present', () => {
    const p = perf('a', '15:00', '15:40');
    const r = effectiveEnd(p, [p], 10);
    expect(r.kind).toBe('exact');
    expect(r.hhmm).toBe('15:40');
  });

  it('estimates from the next set on the same stage minus buffer', () => {
    const a = perf('a', '15:00');
    const b = perf('b', '15:45');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('estimated');
    expect(r.hhmm).toBe('15:35'); // 15:45 - 10
  });

  it('never overwrites an exact end with an estimate', () => {
    const a = perf('a', '15:00', '15:30');
    const b = perf('b', '15:45');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('exact');
    expect(r.hhmm).toBe('15:30');
  });

  it('is unknown when nothing follows and no end is given', () => {
    const a = perf('a', '21:30');
    const r = effectiveEnd(a, [a], 10);
    expect(r.kind).toBe('unknown');
    expect(r.minutes).toBeNull();
  });
});
