import { describe, it, expect } from 'vitest';
import { dayScheduleInfo, unknownSelectedCount, completionLabel } from './scheduleStatus';
import { DEFAULT_SCHEDULE_PROVENANCE } from './settings';
import type { Performance, ScheduleProvenance } from './types';

function perf(id: string, opts: Partial<Performance> = {}): Performance {
  return {
    id,
    artistId: id,
    type: 'main',
    day: 'saturday',
    stageId: null,
    startTime: null,
    endTime: null,
    estimatedEndTime: null,
    scheduleStatus: 'time-pending',
    officialStatus: 'confirmed',
    ...opts,
  };
}

const scheduled = (id: string) =>
  perf(id, { stageId: 'ghost', startTime: '15:00', scheduleStatus: 'scheduled' });

const prov = (patch: Partial<ScheduleProvenance> = {}): ScheduleProvenance => ({
  ...DEFAULT_SCHEDULE_PROVENANCE,
  ...patch,
});

describe('schedule day status (plan §P0-1)', () => {
  it('is empty when nothing has a stage and time', () => {
    const info = dayScheduleInfo('saturday', [perf('a'), perf('b')], prov());
    expect(info.status).toBe('empty');
    expect(info.entered).toBe(0);
    expect(info.expected).toBe(2);
  });

  it('is PARTIAL — not complete — with one of many sets entered', () => {
    // This is the exact case the old boolean got wrong: one entered set used
    // to switch the whole app into "schedule loaded".
    const perfs = [scheduled('a'), ...Array.from({ length: 75 }, (_, i) => perf(`p${i}`))];
    const info = dayScheduleInfo('saturday', perfs, prov());
    expect(info.status).toBe('partial');
    expect(info.entered).toBe(1);
    expect(info.expected).toBe(76);
    expect(completionLabel(info)).toBe('1 of 76 sets entered');
  });

  it('needs BOTH a stage and a start time to count as entered', () => {
    const perfs = [
      perf('a', { startTime: '15:00' }), // no stage
      perf('b', { stageId: 'ghost' }), // no time
    ];
    expect(dayScheduleInfo('saturday', perfs, prov()).entered).toBe(0);
  });

  it('is complete when every expected set is entered', () => {
    const info = dayScheduleInfo('saturday', [scheduled('a'), scheduled('b')], prov());
    expect(info.status).toBe('complete');
  });

  it('is complete when a human marked the day verified, even if partial', () => {
    const perfs = [scheduled('a'), perf('b')];
    const info = dayScheduleInfo(
      'saturday',
      perfs,
      prov({ saturdayVerifiedAt: '2026-07-25T11:08:00Z', saturdayVerifiedBy: 'Alex' }),
    );
    expect(info.status).toBe('complete');
    expect(info.verifiedBy).toBe('Alex');
  });

  it('tracks the two days independently', () => {
    const perfs = [scheduled('a'), perf('sun', { day: 'sunday' })];
    expect(dayScheduleInfo('saturday', perfs, prov()).status).toBe('complete');
    expect(dayScheduleInfo('sunday', perfs, prov()).status).toBe('empty');
  });

  it('excludes cancelled and removed sets from the denominator', () => {
    const perfs = [
      scheduled('a'),
      perf('gone', { officialStatus: 'canceled' }),
      perf('never', { officialStatus: 'removed' }),
    ];
    const info = dayScheduleInfo('saturday', perfs, prov());
    expect(info.expected).toBe(1);
    expect(info.status).toBe('complete');
  });

  it('counts selected sets that have no time as unknown', () => {
    const perfs = [scheduled('a'), perf('b'), perf('c')];
    const sels = [
      { userId: 'member-1', performanceId: 'a', selected: true },
      { userId: 'member-1', performanceId: 'b', selected: true },
      { userId: 'member-1', performanceId: 'c', selected: false },
      { userId: 'member-2', performanceId: 'b', selected: true },
    ];
    expect(unknownSelectedCount('saturday', perfs, sels, 'member-1')).toBe(1);
  });
});
