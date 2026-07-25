import type { DBSchema } from 'idb';
import type {
  Artist,
  Performance,
  User,
  Selection,
  MapLocation,
  CheckIn,
  TravelOverride,
  HistoryEntry,
  BackupSnapshot,
} from '@/domain/types';

export const DB_VERSION = 1;
// Namespaced to this app. IndexedDB is scoped by ORIGIN, not by path, and
// GitHub Pages serves this app and its private sibling from the same origin —
// so sharing a database name would mean the two installs read and overwrite
// each other's picks on a phone that has both.
export const PROD_DB_NAME = 'warpedlb-public-2026';
export const DEMO_DB_NAME = 'warpedlb-public-2026-demo';

// A settings/meta value can be any JSON-serializable thing.
export interface KV {
  key: string;
  value: unknown;
}

export interface WarpedDB extends DBSchema {
  artists: {
    key: string;
    value: Artist;
    indexes: { 'by-name': string };
  };
  performances: {
    key: string;
    value: Performance;
    indexes: { 'by-artist': string; 'by-day': string; 'by-stage': string };
  };
  users: {
    key: string;
    value: User;
  };
  selections: {
    // Composite key stored as `${userId}::${performanceId}`.
    key: string;
    value: Selection & { key: string };
    indexes: { 'by-user': string; 'by-performance': string };
  };
  locations: {
    key: string;
    value: MapLocation;
    indexes: { 'by-category': string };
  };
  checkins: {
    key: string;
    value: CheckIn;
    indexes: { 'by-user': string };
  };
  travelOverrides: {
    key: string;
    value: TravelOverride;
  };
  settings: {
    key: string;
    value: KV;
  };
  meta: {
    key: string;
    value: KV;
  };
  history: {
    key: number;
    value: HistoryEntry;
  };
  backups: {
    key: number;
    value: BackupSnapshot;
  };
}

export function selectionKey(userId: string, performanceId: string): string {
  return `${userId}::${performanceId}`;
}

/**
 * Versioned migrations. Each `if (oldVersion < N)` block upgrades from the
 * previous version. Add new blocks for future schema versions; never mutate
 * an existing block once shipped.
 */
export function runMigrations(
  db: import('idb').IDBPDatabase<WarpedDB>,
  oldVersion: number,
): void {
  if (oldVersion < 1) {
    const artists = db.createObjectStore('artists', { keyPath: 'id' });
    artists.createIndex('by-name', 'name');

    const performances = db.createObjectStore('performances', { keyPath: 'id' });
    performances.createIndex('by-artist', 'artistId');
    performances.createIndex('by-day', 'day');
    performances.createIndex('by-stage', 'stageId');

    db.createObjectStore('users', { keyPath: 'id' });

    const selections = db.createObjectStore('selections', { keyPath: 'key' });
    selections.createIndex('by-user', 'userId');
    selections.createIndex('by-performance', 'performanceId');

    const locations = db.createObjectStore('locations', { keyPath: 'id' });
    locations.createIndex('by-category', 'category');

    const checkins = db.createObjectStore('checkins', { keyPath: 'id' });
    checkins.createIndex('by-user', 'userId');

    db.createObjectStore('travelOverrides', { keyPath: 'pairKey' });
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
  }
  // Future: if (oldVersion < 2) { ... }
}
