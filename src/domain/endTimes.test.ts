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
    const b = perf('b', '15:20');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('estimated');
    expect(r.hhmm).toBe('15:10'); // 15:20 - 10
  });

  it('caps the estimate at a typical set when the next set is later', () => {
    const a = perf('a', '15:00');
    const b = perf('b', '15:45');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('assumed');
    expect(r.hhmm).toBe('15:30'); // not 15:35 — a set is not stretched to fill the gap
  });

  it('does not stretch a set across an empty stage — the overlap bug', () => {
    // One band at 13:00, the next entered band on that stage at 17:00. The
    // 13:00 set used to read as four hours long and collided with everything.
    const a = perf('a', '13:00');
    const b = perf('b', '17:00');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('assumed');
    expect(r.hhmm).toBe('13:30');
  });

  it('never overwrites an exact end with an estimate', () => {
    const a = perf('a', '15:00', '15:30');
    const b = perf('b', '15:45');
    const r = effectiveEnd(a, [a, b], 10);
    expect(r.kind).toBe('exact');
    expect(r.hhmm).toBe('15:30');
  });

  it('assumes a typical set when nothing follows on the stage', () => {
    const a = perf('a', '21:30');
    const r = effectiveEnd(a, [a], 10);
    expect(r.kind).toBe('assumed');
    expect(r.hhmm).toBe('22:00');
  });

  it('is unknown only when there is no start time to work from', () => {
    const a = perf('a', null);
    const r = effectiveEnd(a, [a], 10);
    expect(r.kind).toBe('unknown');
    expect(r.minutes).toBeNull();
  });

  it('honours a custom typical set length', () => {
    const a = perf('a', '15:00');
    expect(effectiveEnd(a, [a], 10, 45).hhmm).toBe('15:45');
  });
});
