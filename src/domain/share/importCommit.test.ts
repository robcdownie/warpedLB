import { describe, it, expect } from 'vitest';
import type { Repo } from '@/db/repo';
import type {
  User,
  Selection,
  Performance,
  MapLocation,
  CheckIn,
  AppSettings,
  BackupSnapshot,
} from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { decodeEnvelope } from './codec';
import {
  encodeSelections,
  encodeSchedule,
  encodeBackup,
  previewImport,
  type BackupData,
} from './payloads';
import { commitImport, rollbackImport } from './importCommit';

// ---------------------------------------------------------------------------
// In-memory fake of the Repo surface commitImport/rollbackImport touch, so the
// full encode → decode → preview → commit → rollback path runs without IndexedDB.
// ---------------------------------------------------------------------------

function selKey(userId: string, performanceId: string): string {
  return `${userId}::${performanceId}`;
}

function makeFakeRepo() {
  const users = new Map<string, User>();
  const selections = new Map<string, Selection>();
  const performances = new Map<string, Performance>();
  const locations = new Map<string, MapLocation>();
  const checkins = new Map<string, CheckIn>();
  const backups = new Map<number, BackupSnapshot>();
  let settings: AppSettings = { ...DEFAULT_SETTINGS };
  let backupId = 0;

  const fake = {
    async allUsers() { return [...users.values()]; },
    async allSelections() { return [...selections.values()]; },
    async allPerformances() { return [...performances.values()]; },
    async allLocations() { return [...locations.values()]; },
    async allCheckins() { return [...checkins.values()]; },
    async getSettings() { return { ...settings }; },
    async putSettings(s: AppSettings) { settings = { ...s }; },
    async putUser(u: User) { users.set(u.id, u); },
    async putSelection(s: Selection) { selections.set(selKey(s.userId, s.performanceId), s); },
    async putSelections(list: Selection[]) { for (const s of list) selections.set(selKey(s.userId, s.performanceId), s); },
    async deleteSelectionsForUser(userId: string) {
      for (const [k, s] of selections) if (s.userId === userId) selections.delete(k);
    },
    async putPerformance(p: Performance) { performances.set(p.id, p); },
    async putPerformances(list: Performance[]) { for (const p of list) performances.set(p.id, p); },
    async getPerformance(id: string) { return performances.get(id); },
    async putLocations(list: MapLocation[]) { for (const l of list) locations.set(l.id, l); },
    async putCheckIn(c: CheckIn) { checkins.set(c.id, c); },
    async addBackup(snapshot: BackupSnapshot) { backups.set(++backupId, snapshot); return backupId; },
    async getBackup(id: number) { return backups.get(id); },
    async clearStore(store: string) {
      if (store === 'users') users.clear();
      else if (store === 'selections') selections.clear();
      else if (store === 'checkins') checkins.clear();
      else throw new Error(`fake clearStore: unexpected store ${store}`);
    },
    // direct state access for assertions
    _state: { users, selections, performances, locations, checkins, get settings() { return settings; } },
  };
  return fake;
}

type FakeRepo = ReturnType<typeof makeFakeRepo>;
const asRepo = (f: FakeRepo) => f as unknown as Repo;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-07-24T12:00:00.000Z';

function user(id: string, name: string): User {
  return { id, name, initials: name.slice(0, 2).toUpperCase(), avatar: null, colorKey: 'pink' as User['colorKey'] };
}

function perf(id: string, over: Partial<Performance> = {}): Performance {
  return {
    id,
    artistId: `artist-${id}`,
    type: 'main',
    day: 'saturday',
    stageId: null,
    startTime: null,
    endTime: null,
    estimatedEndTime: null,
    scheduleStatus: 'time-pending',
    ...over,
  };
}

function sel(userId: string, performanceId: string, over: Partial<Selection> = {}): Selection {
  return { userId, performanceId, priority: 'want-to-see', selected: true, attendanceDecision: 'undecided', notes: '', ...over };
}

function seedRepo(): FakeRepo {
  const repo = makeFakeRepo();
  repo._state.users.set('member-1', user('member-1', 'Alex'));
  repo._state.users.set('member-2', user('member-2', 'Sam'));
  for (const id of ['p1', 'p2', 'p3']) repo._state.performances.set(id, perf(id));
  return repo;
}

// ---------------------------------------------------------------------------

describe('selections import round-trip', () => {
  it('encode → decode → preview → commit replaces the friend selections, rollback restores', async () => {
    const repo = seedRepo();
    // Sam previously shared p1 + p3; the new code has p1 (updated) + p2 only.
    repo._state.selections.set(selKey('member-2', 'p1'), sel('member-2', 'p1'));
    repo._state.selections.set(selKey('member-2', 'p3'), sel('member-2', 'p3', { priority: 'must-see' }));

    const incoming: Selection[] = [
      sel('member-2', 'p1', { priority: 'must-see' }),
      sel('member-2', 'p2'),
    ];
    const code = encodeSelections(user('member-2', 'Sam'), incoming, NOW);
    const env = decodeEnvelope(code);

    const preview = previewImport(env, {
      users: await repo.allUsers(),
      selections: await repo.allSelections(),
      performances: await repo.allPerformances(),
      locations: await repo.allLocations(),
    });
    expect(preview.adds).toBe(1); // p2 is new
    expect(preview.updates).toBe(1); // p1 priority changed
    expect(preview.removals).toBe(1); // p3 disappears — must be surfaced
    expect(preview.warnings.join(' ')).toMatch(/will be removed/);

    const { backupId } = await commitImport(asRepo(repo), env);

    const member2Sel = (await repo.allSelections()).filter((s) => s.userId === 'member-2');
    expect(member2Sel.map((s) => s.performanceId).sort()).toEqual(['p1', 'p2']);
    expect(member2Sel.find((s) => s.performanceId === 'p1')?.priority).toBe('must-see');
    // Import metadata stamped.
    expect(repo._state.settings.friendImports['member-2']?.selectionCount).toBe(2);

    // Rollback restores the pre-import world, including the removed p3.
    const ok = await rollbackImport(asRepo(repo), backupId);
    expect(ok).toBe(true);
    const restored = (await repo.allSelections()).filter((s) => s.userId === 'member-2');
    expect(restored.map((s) => s.performanceId).sort()).toEqual(['p1', 'p3']);
    expect(restored.find((s) => s.performanceId === 'p3')?.priority).toBe('must-see');
  });

  it('skips selections that reference unknown performances', async () => {
    const repo = seedRepo();
    const code = encodeSelections(user('member-2', 'Sam'), [sel('member-2', 'p1'), sel('member-2', 'ghost-perf')], NOW);
    const env = decodeEnvelope(code);
    await commitImport(asRepo(repo), env);
    const member2Sel = (await repo.allSelections()).filter((s) => s.userId === 'member-2');
    expect(member2Sel.map((s) => s.performanceId)).toEqual(['p1']);
  });
});

describe('schedule import', () => {
  it('applies times and preserves a confirmed status when nothing changed', async () => {
    const repo = seedRepo();
    repo._state.performances.set('p1', perf('p1', { stageId: 's1', startTime: '12:00', endTime: '12:30', scheduleStatus: 'confirmed' }));
    repo._state.performances.set('p2', perf('p2', { stageId: 's1', startTime: '13:00', scheduleStatus: 'scheduled' }));

    // Export the current schedule and re-import it — a no-op round-trip.
    const code = encodeSchedule(await repo.allPerformances(), 'member-1', NOW);
    await commitImport(asRepo(repo), decodeEnvelope(code));
    expect(repo._state.performances.get('p1')?.scheduleStatus).toBe('confirmed');
    expect(repo._state.performances.get('p2')?.scheduleStatus).toBe('scheduled');
  });

  it('recomputes status when the import actually changes a set', async () => {
    const repo = seedRepo();
    repo._state.performances.set('p1', perf('p1', { stageId: 's1', startTime: '12:00', endTime: '12:30', scheduleStatus: 'confirmed' }));

    const changed = [perf('p1', { stageId: 's1', startTime: '12:15', endTime: '12:45' })];
    const code = encodeSchedule(changed, 'member-1', NOW);
    await commitImport(asRepo(repo), decodeEnvelope(code));
    const p1 = repo._state.performances.get('p1')!;
    expect(p1.startTime).toBe('12:15');
    expect(p1.scheduleStatus).toBe('scheduled'); // confirmed no longer applies
  });
});

describe('backup restore', () => {
  it('replaces users/selections/checkins wholesale and restores settings (keeping local offlineReady)', async () => {
    const repo = seedRepo();
    // Local-only records that are NOT in the backup and must disappear.
    repo._state.users.set('stray', user('stray', 'Stray'));
    repo._state.selections.set(selKey('member-1', 'p3'), sel('member-1', 'p3'));
    repo._state.checkins.set('c-old', { id: 'c-old', userId: 'member-1', locationId: null, customCoordinates: null, source: 'manual', updatedAt: NOW });
    await repo.putSettings({ ...DEFAULT_SETTINGS, offlineReady: true, minMeetupMinutes: 15 });

    const backup: BackupData = {
      users: [user('member-1', 'Alex'), user('member-2', 'Sam')],
      selections: [sel('member-1', 'p1')],
      performances: [perf('p1'), perf('p2'), perf('p3')],
      locations: [],
      checkins: [],
      settings: { ...DEFAULT_SETTINGS, offlineReady: false, minMeetupMinutes: 25 },
    };
    const env = decodeEnvelope(encodeBackup(backup, 'member-1', NOW));

    const preview = previewImport(env, {
      users: await repo.allUsers(),
      selections: await repo.allSelections(),
      performances: await repo.allPerformances(),
      locations: await repo.allLocations(),
    });
    expect(preview.warnings.join(' ')).toMatch(/replaces/i);

    const { backupId } = await commitImport(asRepo(repo), env);

    expect((await repo.allUsers()).map((u) => u.id).sort()).toEqual(['member-1', 'member-2']); // stray gone
    expect((await repo.allSelections()).map((s) => s.performanceId)).toEqual(['p1']); // p3 gone
    expect(await repo.allCheckins()).toEqual([]); // c-old gone
    expect(repo._state.settings.minMeetupMinutes).toBe(25); // settings restored…
    expect(repo._state.settings.offlineReady).toBe(true); // …but device flag kept

    // Rollback brings the stray records back.
    await rollbackImport(asRepo(repo), backupId);
    expect((await repo.allUsers()).map((u) => u.id).sort()).toEqual(['member-1', 'member-2', 'stray']);
    expect((await repo.allSelections()).some((s) => s.performanceId === 'p3')).toBe(true);
    expect((await repo.allCheckins()).map((c) => c.id)).toEqual(['c-old']);
    expect(repo._state.settings.minMeetupMinutes).toBe(15);
  });
});
