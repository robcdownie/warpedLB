import { describe, it, expect } from 'vitest';
import { planInfo, eligibleUsers, planStatusLabel } from './planStatus';
import { DEFAULT_SETTINGS } from './settings';
import type { AppSettings, Selection, User } from './types';

const NOW = new Date('2026-07-25T12:00:00-07:00');

const users: User[] = [
  { id: 'member-1', name: 'Alex', initials: 'A', avatar: null, colorKey: 'blue' },
  { id: 'member-2', name: 'Sam', initials: 'S', avatar: null, colorKey: 'pink' },
  { id: 'member-3', name: 'Jordan', initials: 'J', avatar: null, colorKey: 'orange' },
];

function sels(userId: string, n: number): Selection[] {
  return Array.from({ length: n }, (_, i) => ({
    userId,
    performanceId: `p${i}`,
    priority: 'want-to-see' as const,
    selected: true,
    attendanceDecision: 'undecided' as const,
    notes: '',
  }));
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, activeUserId: 'member-1', ...patch };
}

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('user plan status (plan §P0-2)', () => {
  it('treats the active local user as always eligible', () => {
    const info = planInfo('member-1', settings(), sels('member-1', 12), NOW);
    expect(info.status).toBe('local');
    expect(info.eligible).toBe(true);
  });

  it('treats a seeded profile with no import as a placeholder, NOT free', () => {
    // The core failure this guards: Sam exists from first launch, so before
    // she sends anything her day looked completely open.
    const info = planInfo('member-2', settings(), [], NOW);
    expect(info.status).toBe('placeholder');
    expect(info.eligible).toBe(false);
    expect(planStatusLabel(info)).toBe('Plan not imported');
  });

  it('marks a fresh import as imported', () => {
    const s = settings({
      friendImports: { 'member-2': { userId: 'member-2', importedAt: hoursAgo(2), selectionCount: 14 } },
    });
    const info = planInfo('member-2', s, sels('member-2', 14), NOW);
    expect(info.status).toBe('imported');
    expect(info.eligible).toBe(true);
    expect(planStatusLabel(info)).toBe('14 bands, 2 hours ago');
  });

  it('marks an old import as stale but still usable', () => {
    const s = settings({
      friendImports: { 'member-2': { userId: 'member-2', importedAt: hoursAgo(30), selectionCount: 14 } },
    });
    const info = planInfo('member-2', s, sels('member-2', 14), NOW);
    expect(info.status).toBe('stale');
    expect(info.eligible).toBe(true);
    expect(planStatusLabel(info)).toContain('may be outdated');
  });

  it('does not treat an import that carried nothing as a real plan', () => {
    const s = settings({
      friendImports: { 'member-2': { userId: 'member-2', importedAt: hoursAgo(1), selectionCount: 0 } },
    });
    const info = planInfo('member-2', s, [], NOW);
    expect(info.status).toBe('placeholder');
    expect(info.eligible).toBe(false);
  });

  it('excludes placeholders from the eligible set used for group math', () => {
    const s = settings({
      friendImports: { 'member-2': { userId: 'member-2', importedAt: hoursAgo(1), selectionCount: 3 } },
    });
    const eligible = eligibleUsers(users, s, sels('member-2', 3), NOW);
    expect(eligible.map((u) => u.id)).toEqual(['member-1', 'member-2']);
  });

  it('drops a friend back to placeholder when their selections are deleted', () => {
    // Deleting the selections but keeping the profile must not leave a
    // "free all day" ghost in the group views.
    const s = settings({
      friendImports: { 'member-2': { userId: 'member-2', importedAt: hoursAgo(1), selectionCount: 14 } },
    });
    const info = planInfo('member-2', s, [], NOW);
    expect(info.eligible).toBe(false);
  });
});
