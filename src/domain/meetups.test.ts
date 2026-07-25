import { describe, it, expect } from 'vitest';
import { findMeetups, PREFERRED_LANDMARK_IDS, type MeetupCtx } from './meetups';
import { hhmmToMinutes } from './time';
import type { Performance, Selection, MapLocation, User, Priority } from './types';

const users: User[] = [
  { id: 'member-1', name: 'Alex', initials: 'A', avatar: null, colorKey: 'pink' },
  { id: 'member-2', name: 'Sam', initials: 'S', avatar: null, colorKey: 'blue' },
  { id: 'member-3', name: 'Jordan', initials: 'J', avatar: null, colorKey: 'orange' },
];

const locations: MapLocation[] = [
  { id: 'ghost', name: 'Ghost Stage', shortName: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 },
  { id: 'rex', name: 'Rex Stage', shortName: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 },
  { id: 'vans', name: 'Vans Stage', shortName: 'Vans', category: 'stage', xPercent: 58, yPercent: 42 },
  { id: 'charity-circle', name: 'Charity Circle', category: 'experience', xPercent: 38, yPercent: 51 },
  { id: '805-area', name: '805 Area', category: 'sponsor', xPercent: 77, yPercent: 62 },
  { id: 'vans-activation', name: 'Vans Activation', category: 'sponsor', xPercent: 65, yPercent: 60 },
  { id: 'warped-museum', name: 'Warped Museum', category: 'experience', xPercent: 35, yPercent: 45 },
  { id: 'lobos-1707', name: 'Lobos 1707', category: 'bar', xPercent: 59, yPercent: 60 },
  { id: '32-taps', name: '32 Taps', category: 'bar', xPercent: 78, yPercent: 42 },
  { id: '60-taps', name: '60 Taps', category: 'bar', xPercent: 21, yPercent: 66 },
  { id: 'shoreline-village-drive-entrance', name: 'Entrance', category: 'entrance', xPercent: 14, yPercent: 54 },
];

function perf(id: string, day: 'saturday', stageId: string, start: string, end: string): Performance {
  return { id, artistId: id, type: 'main', day, stageId, startTime: start, endTime: end, estimatedEndTime: null, scheduleStatus: 'scheduled' };
}
function sel(userId: string, pid: string, priority: Priority = 'want-to-see'): Selection {
  return { userId, performanceId: pid, priority, selected: true, attendanceDecision: 'attending', notes: '' };
}

function makeCtx(perfs: Performance[], sels: Selection[], allowDuringMustSee = false): MeetupCtx {
  return {
    users,
    selections: sels,
    performanceById: new Map(perfs.map((p) => [p.id, p])),
    locationById: new Map(locations.map((l) => [l.id, l])),
    allPerformances: perfs,
    crowd: 'normal',
    turnoverBuffer: 10,
    overrides: [],
    minMeetupMinutes: 15,
    allowDuringMustSee,
    bounds: { open: hhmmToMinutes('11:00'), close: hhmmToMinutes('22:00') },
    preferredLandmarkIds: PREFERRED_LANDMARK_IDS,
  };
}

describe('meetup engine (spec §29)', () => {
  it('suggests a meetup in a shared 30+ minute opening (acceptance §37-38)', () => {
    // Alex: set ends 15:00 at Vans; next at 16:00 at Vans → 60 min free.
    // Sam: set ends 15:00 at Vans; next at 16:00 at Vans → same window.
    const perfs = [
      perf('r1', 'saturday', 'vans', '14:15', '15:00'),
      perf('r2', 'saturday', 'vans', '16:00', '16:45'),
      perf('a1', 'saturday', 'vans', '14:15', '15:00'),
      perf('a2', 'saturday', 'vans', '16:00', '16:45'),
    ];
    const sels = [sel('member-1', 'r1'), sel('member-1', 'r2'), sel('member-2', 'a1'), sel('member-2', 'a2')];
    const meetups = findMeetups('saturday', makeCtx(perfs, sels));
    expect(meetups.length).toBeGreaterThan(0);
    const m = meetups[0];
    expect(m.userIds).toContain('member-1');
    expect(m.userIds).toContain('member-2');
    expect(m.durationMinutes).toBeGreaterThanOrEqual(15);
  });

  it('never schedules a meetup on top of a Must-See set (acceptance §39-40)', () => {
    // Alex has a must-see 15:00-15:45 at Ghost. Sam is free the whole time.
    const perfs = [
      perf('rMust', 'saturday', 'ghost', '15:00', '15:45'),
      perf('a1', 'saturday', 'rex', '12:00', '12:45'),
    ];
    const sels = [sel('member-1', 'rMust', 'must-see'), sel('member-2', 'a1')];
    const meetups = findMeetups('saturday', makeCtx(perfs, sels));
    // No suggested meetup window should overlap Alex's must-see 15:00-15:45.
    for (const m of meetups) {
      if (m.userIds.includes('member-1')) {
        const overlapsMustSee = m.startMinute < hhmmToMinutes('15:45') && m.endMinute > hhmmToMinutes('15:00');
        expect(overlapsMustSee).toBe(false);
      }
    }
  });

  it('considers the next stage when choosing where to meet (acceptance §41)', () => {
    // Alex free until 16:00 at Ghost (east). Sam free until 16:00 at Rex (west).
    // The chosen spot should give a leave-by time before each next set.
    const perfs = [
      perf('r2', 'saturday', 'ghost', '16:00', '16:45'),
      perf('a2', 'saturday', 'rex', '16:00', '16:45'),
    ];
    const sels = [sel('member-1', 'r2'), sel('member-2', 'a2'), sel('member-3', 'r2')];
    const meetups = findMeetups('saturday', makeCtx(perfs, sels));
    expect(meetups.length).toBeGreaterThan(0);
    const m = meetups[0];
    const member1Plan = m.perUser.find((p) => p.userId === 'member-1');
    expect(member1Plan?.nextStageId).toBe('ghost');
    expect(member1Plan?.leaveByMinute).toBeLessThanOrEqual(hhmmToMinutes('16:00'));
  });

  it('prefers all-three meetups and clear landmarks', () => {
    const perfs = [
      perf('r2', 'saturday', 'vans', '16:00', '16:45'),
      perf('a2', 'saturday', 'vans', '16:00', '16:45'),
      perf('m2', 'saturday', 'vans', '16:00', '16:45'),
    ];
    const sels = [sel('member-1', 'r2'), sel('member-2', 'a2'), sel('member-3', 'm2')];
    const meetups = findMeetups('saturday', makeCtx(perfs, sels));
    expect(meetups[0].userIds.length).toBe(3);
  });
});
