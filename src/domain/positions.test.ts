import { describe, it, expect } from 'vitest';
import { plannedPosition, positionWithCheckin, positionBadge, positionA11yLabel } from './positions';
import { hhmmToMinutes } from './time';
import type { Performance, Selection, MapLocation, CheckIn } from './types';

const stages: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'doordash', name: 'DoorDash Stage', shortName: 'DoorDash', category: 'stage', xPercent: 77, yPercent: 72 },
];

function perf(id: string, stageId: string, start: string, end: string): Performance {
  return { id, artistId: id, type: 'main', day: 'saturday', stageId, startTime: start, endTime: end, estimatedEndTime: null, scheduleStatus: 'scheduled' };
}
function sel(pid: string): Selection {
  return { userId: 'member-1', performanceId: pid, priority: 'must-see', selected: true, attendanceDecision: 'attending', notes: '' };
}

const perfs = [perf('a', 'ghost', '15:00', '15:40'), perf('b', 'doordash', '16:30', '17:10')];
const ctx = {
  selections: [sel('a'), sel('b')],
  performanceById: new Map(perfs.map((p) => [p.id, p])),
  locationById: new Map(stages.map((s) => [s.id, s])),
  allPerformances: perfs,
  crowd: 'normal' as const,
  turnoverBuffer: 10,
  overrides: [],
};

describe('planned positions (spec §24)', () => {
  it('is at the stage during a set', () => {
    const p = plannedPosition('member-1', 'saturday', hhmmToMinutes('15:20'), ctx);
    expect(p.kind).toBe('at-stage');
    expect(p.locationId).toBe('ghost');
    expect(p.source).toBe('planned');
  });

  it('shows open time between sets', () => {
    const p = plannedPosition('member-1', 'saturday', hhmmToMinutes('15:50'), ctx);
    expect(p.kind).toBe('open');
  });

  it('shows traveling toward the next stage inside the travel window', () => {
    // DoorDash set starts 16:30; the walk is a few minutes, so just before the
    // start the user is en route.
    const p = plannedPosition('member-1', 'saturday', hhmmToMinutes('16:29'), ctx);
    expect(p.kind).toBe('traveling');
    expect(p.towardLocationId).toBe('doordash');
  });

  it('never labels a planned position as live', () => {
    const p = plannedPosition('member-1', 'saturday', hhmmToMinutes('15:20'), ctx);
    expect(p.source).not.toBe('live');
  });

  it('reports open time when nothing is planned', () => {
    const empty = { ...ctx, selections: [] as Selection[] };
    const p = plannedPosition('member-1', 'saturday', hhmmToMinutes('15:20'), empty);
    expect(p.kind).toBe('open');
  });
});

describe('check-in freshness (plan §P0-3)', () => {
  const NOW = new Date('2026-07-25T15:20:00-07:00').getTime();
  const STALE_AFTER = 20;

  const checkin = (minutesAgo: number, locationId = 'doordash'): CheckIn => ({
    id: 'c1',
    userId: 'member-1',
    locationId,
    customCoordinates: null,
    source: 'manual',
    updatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  });

  it('a fresh check-in wins over the planned position', () => {
    const p = positionWithCheckin(
      'member-1', 'saturday', hhmmToMinutes('15:20'), [checkin(6)], NOW, STALE_AFTER, ctx,
    );
    expect(p.source).toBe('manual');
    expect(p.kind).toBe('checked-in');
    expect(p.locationId).toBe('doordash');
    expect(p.ageMinutes).toBe(6);
  });

  it('a STALE check-in falls back to the planned position', () => {
    // The old behaviour kept pinning the friend at the stale spot forever.
    const p = positionWithCheckin(
      'member-1', 'saturday', hhmmToMinutes('15:20'), [checkin(48)], NOW, STALE_AFTER, ctx,
    );
    expect(p.kind).toBe('at-stage');
    expect(p.locationId).toBe('ghost'); // where the SCHEDULE says they are
    expect(p.source).toBe('planned');
  });

  it('keeps the stale check-in as history, not as a position', () => {
    const p = positionWithCheckin(
      'member-1', 'saturday', hhmmToMinutes('15:20'), [checkin(48)], NOW, STALE_AFTER, ctx,
    );
    expect(p.staleCheckIn).toBeDefined();
    expect(p.staleCheckIn!.locationId).toBe('doordash');
    expect(p.staleCheckIn!.ageMinutes).toBe(48);
    expect(p.locationId).not.toBe(p.staleCheckIn!.locationId);
  });

  it('uses the newest check-in when several exist', () => {
    const older = { ...checkin(50, 'ghost'), id: 'old' };
    const newer = { ...checkin(3, 'doordash'), id: 'new' };
    const p = positionWithCheckin(
      'member-1', 'saturday', hhmmToMinutes('15:20'), [older, newer], NOW, STALE_AFTER, ctx,
    );
    expect(p.source).toBe('manual');
    expect(p.locationId).toBe('doordash');
  });

  it('badges say the source, so it never depends on opacity', () => {
    const fresh = positionWithCheckin('member-1', 'saturday', hhmmToMinutes('15:20'), [checkin(6)], NOW, STALE_AFTER, ctx);
    expect(positionBadge(fresh)).toBe('Checked in 6m ago');
    const planned = plannedPosition('member-1', 'saturday', hhmmToMinutes('15:20'), ctx);
    expect(positionBadge(planned)).toBe('Planned');
  });

  it('screen-reader labels never call a manual check-in "planned"', () => {
    const fresh = positionWithCheckin('member-1', 'saturday', hhmmToMinutes('15:20'), [checkin(6)], NOW, STALE_AFTER, ctx);
    const label = positionA11yLabel(fresh, 'Sam');
    expect(label).toContain('manual check-in');
    expect(label).not.toMatch(/Sam, planned/);
  });
});
