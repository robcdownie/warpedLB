import { openDB, type IDBPDatabase } from 'idb';
import {
  DB_VERSION,
  PROD_DB_NAME,
  DEMO_DB_NAME,
  runMigrations,
  type WarpedDB,
} from './schema';

export type AppMode = 'prod' | 'demo';

let prodDb: Promise<IDBPDatabase<WarpedDB>> | null = null;
let demoDb: Promise<IDBPDatabase<WarpedDB>> | null = null;

function open(name: string): Promise<IDBPDatabase<WarpedDB>> {
  const dbPromise: Promise<IDBPDatabase<WarpedDB>> = openDB<WarpedDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      runMigrations(db, oldVersion);
    },
    blocked() {
      console.warn(`[db] ${name} open blocked by another tab`);
    },
    blocking() {
      // Another tab wants to upgrade; actually close so it can proceed, and
      // drop the cached connection so the next call reopens at the new version.
      console.warn(`[db] ${name} is blocking an upgrade; closing`);
      void dbPromise.then((db) => db.close());
      if (name === DEMO_DB_NAME) demoDb = null;
      else prodDb = null;
    },
  });
  return dbPromise;
}

export function getDb(mode: AppMode): Promise<IDBPDatabase<WarpedDB>> {
  if (mode === 'demo') {
    demoDb ??= open(DEMO_DB_NAME);
    return demoDb;
  }
  prodDb ??= open(PROD_DB_NAME);
  return prodDb;
}

/** Delete the demo database entirely (used by "Reset Demo Data"). */
export async function deleteDemoDb(): Promise<void> {
  if (demoDb) {
    (await demoDb).close();
    demoDb = null;
  }
  await indexedDB.deleteDatabase(DEMO_DB_NAME);
}

/** Request persistent storage so the OS is less likely to evict our data. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
