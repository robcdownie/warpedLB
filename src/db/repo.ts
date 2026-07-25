import type { IDBPDatabase } from 'idb';
import { getDb, type AppMode } from './db';
import { selectionKey, type WarpedDB } from './schema';
import type {
  Artist,
  Performance,
  User,
  Selection,
  MapLocation,
  CheckIn,
  TravelOverride,
  AppSettings,
  HistoryEntry,
  BackupSnapshot,
} from '@/domain/types';
import { DEFAULT_SETTINGS, mergeSettings } from '@/domain/settings';

// A thin repository over IndexedDB. All screens go through the store, which
// goes through this. Every write is awaited so data is durable before UI reacts.

export class Repo {
  constructor(private mode: AppMode) {}

  private db(): Promise<IDBPDatabase<WarpedDB>> {
    return getDb(this.mode);
  }

  // ---- bulk loads -------------------------------------------------------
  async allArtists(): Promise<Artist[]> {
    return (await this.db()).getAll('artists');
  }
  async allPerformances(): Promise<Performance[]> {
    return (await this.db()).getAll('performances');
  }
  async allUsers(): Promise<User[]> {
    return (await this.db()).getAll('users');
  }
  async allSelections(): Promise<Selection[]> {
    const rows = await (await this.db()).getAll('selections');
    return rows.map(stripKey);
  }
  async allLocations(): Promise<MapLocation[]> {
    return (await this.db()).getAll('locations');
  }
  async allCheckins(): Promise<CheckIn[]> {
    return (await this.db()).getAll('checkins');
  }
  async allTravelOverrides(): Promise<TravelOverride[]> {
    return (await this.db()).getAll('travelOverrides');
  }
  async history(limit = 50): Promise<HistoryEntry[]> {
    const all = await (await this.db()).getAll('history');
    return all.slice(-limit).reverse();
  }
  async backups(): Promise<BackupSnapshot[]> {
    return (await this.db()).getAll('backups');
  }

  // ---- artists / performances (seed data, but performances are editable) --
  async putArtist(a: Artist): Promise<void> {
    await (await this.db()).put('artists', a);
  }
  async putArtists(list: Artist[]): Promise<void> {
    const tx = (await this.db()).transaction('artists', 'readwrite');
    await Promise.all(list.map((a) => tx.store.put(a)));
    await tx.done;
  }
  async putPerformance(p: Performance): Promise<void> {
    await (await this.db()).put('performances', p);
  }
  async putPerformances(list: Performance[]): Promise<void> {
    const tx = (await this.db()).transaction('performances', 'readwrite');
    await Promise.all(list.map((p) => tx.store.put(p)));
    await tx.done;
  }
  async getPerformance(id: string): Promise<Performance | undefined> {
    return (await this.db()).get('performances', id);
  }
  async deletePerformance(id: string): Promise<void> {
    await (await this.db()).delete('performances', id);
  }
  async deleteArtist(id: string): Promise<void> {
    await (await this.db()).delete('artists', id);
  }

  // ---- users ------------------------------------------------------------
  async putUser(u: User): Promise<void> {
    await (await this.db()).put('users', u);
  }
  async deleteUser(id: string): Promise<void> {
    await (await this.db()).delete('users', id);
  }

  // ---- selections -------------------------------------------------------
  async putSelection(s: Selection): Promise<void> {
    await (await this.db()).put('selections', {
      ...s,
      key: selectionKey(s.userId, s.performanceId),
    });
  }
  async putSelections(list: Selection[]): Promise<void> {
    const tx = (await this.db()).transaction('selections', 'readwrite');
    await Promise.all(
      list.map((s) =>
        tx.store.put({ ...s, key: selectionKey(s.userId, s.performanceId) }),
      ),
    );
    await tx.done;
  }
  async getSelection(userId: string, performanceId: string): Promise<Selection | undefined> {
    const row = await (await this.db()).get('selections', selectionKey(userId, performanceId));
    return row ? stripKey(row) : undefined;
  }
  async deleteSelection(userId: string, performanceId: string): Promise<void> {
    await (await this.db()).delete('selections', selectionKey(userId, performanceId));
  }
  async deleteSelectionsForUser(userId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('selections', 'readwrite');
    const idx = tx.store.index('by-user');
    let cursor = await idx.openCursor(userId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ---- locations --------------------------------------------------------
  async putLocation(l: MapLocation): Promise<void> {
    await (await this.db()).put('locations', l);
  }
  async putLocations(list: MapLocation[]): Promise<void> {
    const tx = (await this.db()).transaction('locations', 'readwrite');
    await Promise.all(list.map((l) => tx.store.put(l)));
    await tx.done;
  }
  async deleteLocation(id: string): Promise<void> {
    await (await this.db()).delete('locations', id);
  }

  // ---- check-ins --------------------------------------------------------
  async putCheckIn(c: CheckIn): Promise<void> {
    await (await this.db()).put('checkins', c);
  }
  async deleteCheckIn(id: string): Promise<void> {
    await (await this.db()).delete('checkins', id);
  }

  // ---- travel overrides -------------------------------------------------
  async putTravelOverride(o: TravelOverride): Promise<void> {
    await (await this.db()).put('travelOverrides', o);
  }
  async clearTravelOverrides(): Promise<void> {
    await (await this.db()).clear('travelOverrides');
  }

  // ---- settings ---------------------------------------------------------
  async getSettings(): Promise<AppSettings> {
    const row = await (await this.db()).get('settings', 'app');
    if (!row) return { ...DEFAULT_SETTINGS, schedule: { ...DEFAULT_SETTINGS.schedule }, map: { ...DEFAULT_SETTINGS.map } };
    return mergeSettings(row.value as Partial<AppSettings>);
  }
  async putSettings(s: AppSettings): Promise<void> {
    await (await this.db()).put('settings', { key: 'app', value: s });
  }

  // ---- meta -------------------------------------------------------------
  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    const row = await (await this.db()).get('meta', key);
    return row?.value as T | undefined;
  }
  async putMeta(key: string, value: unknown): Promise<void> {
    await (await this.db()).put('meta', { key, value });
  }

  // ---- history / backups ------------------------------------------------
  async addHistory(entry: HistoryEntry): Promise<void> {
    const db = await this.db();
    await db.add('history', entry);
    // Trim to last 200 entries.
    const keys = await db.getAllKeys('history');
    if (keys.length > 200) {
      const tx = db.transaction('history', 'readwrite');
      await Promise.all(keys.slice(0, keys.length - 200).map((k) => tx.store.delete(k)));
      await tx.done;
    }
  }
  /** Newest history entry that can be undone, without deleting anything. */
  async peekUndoableHistory(): Promise<{ key: number; entry: HistoryEntry } | undefined> {
    const db = await this.db();
    const keys = await db.getAllKeys('history');
    for (let i = keys.length - 1; i >= 0; i--) {
      const entry = await db.get('history', keys[i]);
      if (entry?.undo) return { key: keys[i] as number, entry };
    }
    return undefined;
  }
  async deleteHistory(key: number): Promise<void> {
    await (await this.db()).delete('history', key);
  }
  async addBackup(snapshot: BackupSnapshot): Promise<number> {
    const db = await this.db();
    const id = await db.add('backups', snapshot);
    const keys = await db.getAllKeys('backups');
    if (keys.length > 20) {
      const tx = db.transaction('backups', 'readwrite');
      await Promise.all(keys.slice(0, keys.length - 20).map((k) => tx.store.delete(k)));
      await tx.done;
    }
    return id as number;
  }
  async getBackup(id: number): Promise<BackupSnapshot | undefined> {
    return (await this.db()).get('backups', id);
  }

  // ---- resets -----------------------------------------------------------
  async clearStore(store: keyof WarpedDB & string): Promise<void> {
    await (await this.db()).clear(store as never);
  }
  async clearAll(): Promise<void> {
    const db = await this.db();
    const stores: (keyof WarpedDB & string)[] = [
      'artists',
      'performances',
      'users',
      'selections',
      'locations',
      'checkins',
      'travelOverrides',
      'settings',
      'meta',
      'history',
      'backups',
    ];
    await Promise.all(stores.map((s) => db.clear(s as never)));
  }
}

function stripKey(row: Selection & { key?: string }): Selection {
  const { key: _key, ...rest } = row;
  void _key;
  return rest;
}

export const prodRepo = new Repo('prod');
export const demoRepo = new Repo('demo');
export function repoFor(mode: AppMode): Repo {
  return mode === 'demo' ? demoRepo : prodRepo;
}
