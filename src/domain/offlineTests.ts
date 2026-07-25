import { repoFor } from '@/db/repo';
import { seedCounts } from '@/data/seed';
import { MAP_IMAGE_URL, BASE_URL } from '@/config/event';

export interface TestResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** Essential tests gate the "Ready for offline use" confirmation. */
  essential: boolean;
}

/**
 * Walks every cache on this origin. That matters: a phone with both this app
 * and its private sibling installed shares an origin, so a predicate loose
 * enough to match the sibling's assets would report this app as offline-ready
 * when it isn't. Every caller below scopes its predicate to BASE_URL.
 */
async function anyCacheMatch(predicate: (url: string) => boolean): Promise<boolean> {
  if (!('caches' in window)) return false;
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    const reqs = await cache.keys();
    if (reqs.some((r) => predicate(r.url))) return true;
  }
  return false;
}

/** True when a cached URL belongs to this app rather than a same-origin sibling. */
function isOurs(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith(BASE_URL);
  } catch {
    return false;
  }
}

/** Run every offline-readiness check. Order roughly matches spec §3. */
export async function runOfflineTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const counts = seedCounts();

  // 1. Service worker active + controlling.
  {
    let pass = false;
    let detail = 'Service workers unsupported in this browser.';
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const active = !!reg?.active;
      const controlling = !!navigator.serviceWorker.controller;
      pass = active;
      detail = active
        ? controlling
          ? 'Active and controlling this page.'
          : 'Active. Will control the page after one reload.'
        : 'Not registered yet — open online once, then reload.';
    }
    results.push({ id: 'sw', label: 'Service worker active', pass, detail, essential: true });
  }

  // 2. App shell precached (index.html or the built JS/CSS present in a cache).
  {
    const hasShell = await anyCacheMatch(
      (url) =>
        isOurs(url) &&
        (url.endsWith('/') ||
          url.includes('index.html') ||
          /\/assets\/.*\.(js|css)$/.test(url)),
    );
    results.push({
      id: 'shell',
      label: 'App shell cached',
      pass: hasShell,
      detail: hasShell
        ? 'HTML/JS/CSS found in Cache Storage.'
        : 'App shell not in cache yet — reload once while online.',
      essential: true,
    });
  }

  // 3. Festival map cached.
  {
    const hasMap = await anyCacheMatch((url) => isOurs(url) && url.includes('festival-map'));
    results.push({
      id: 'map',
      label: 'Festival map cached',
      pass: hasMap,
      detail: hasMap ? 'Map image is available offline.' : `Map (${MAP_IMAGE_URL}) not cached yet.`,
      essential: true,
    });
  }

  // 4. Artist database available (counts match seed).
  {
    const repo = repoFor('prod');
    const artists = await repo.allArtists();
    const perfs = await repo.allPerformances();
    const mainCount = perfs.filter((p) => p.type === 'main').length;
    const expectedMain = counts.saturdayMain + counts.sundayMain;
    const pass = artists.length >= counts.artists && mainCount === expectedMain;
    results.push({
      id: 'artists',
      label: 'Artist database ready',
      pass,
      detail: `${artists.length} artists, ${mainCount}/${expectedMain} main performances.`,
      essential: true,
    });
  }

  // 5. Stage database available.
  {
    const repo = repoFor('prod');
    const locs = await repo.allLocations();
    const stages = locs.filter((l) => l.category === 'stage');
    const pass = stages.length >= counts.stages;
    results.push({
      id: 'stages',
      label: 'Stage database ready',
      pass,
      detail: `${stages.length}/${counts.stages} stages, ${locs.length} total map locations.`,
      essential: true,
    });
  }

  // 6. User data write/read roundtrip.
  {
    const repo = repoFor('prod');
    let pass = false;
    let detail = '';
    try {
      const token = `selftest-${Date.now()}`;
      await repo.putMeta('__selftest', token);
      const readBack = await repo.getMeta<string>('__selftest');
      pass = readBack === token;
      detail = pass ? 'IndexedDB write/read confirmed.' : 'Read-back did not match.';
    } catch (e) {
      detail = `IndexedDB error: ${(e as Error).message}`;
    }
    results.push({ id: 'idb', label: 'Local data saves', pass, detail, essential: true });
  }

  // 7. Persistent storage (best-effort — not essential, iOS often denies).
  {
    let persisted = false;
    if (navigator.storage?.persisted) {
      persisted = await navigator.storage.persisted();
    }
    results.push({
      id: 'persist',
      label: 'Persistent storage granted',
      pass: persisted,
      detail: persisted
        ? 'The OS will avoid evicting your data.'
        : 'Not granted (common on iOS). Keep a backup export as insurance.',
      essential: false,
    });
  }

  // 8. Base scope reachable from cache (implies reopen-offline works).
  {
    const hasBase = await anyCacheMatch((url) => {
      try {
        const u = new URL(url);
        return u.pathname === BASE_URL || u.pathname === `${BASE_URL}index.html`;
      } catch {
        return false;
      }
    });
    results.push({
      id: 'reopen',
      label: 'Can reopen offline',
      pass: hasBase,
      detail: hasBase
        ? 'Start URL is cached — the app opens with no signal.'
        : 'Start URL not cached yet — reload once while online.',
      essential: true,
    });
  }

  return results;
}

export function allEssentialPass(results: TestResult[]): boolean {
  const essential = results.filter((r) => r.essential);
  return essential.length > 0 && essential.every((r) => r.pass);
}

/**
 * Plain-language groups for the onboarding step. Onboarding must not say
 * "service worker", "Cache Storage" or "IndexedDB" — nobody should need to
 * know what those are to get a phone ready for a field with no signal.
 */
export const FRIENDLY_GROUPS: { id: string; label: string; testIds: string[] }[] = [
  { id: 'app', label: 'App files', testIds: ['sw', 'shell', 'reopen'] },
  { id: 'map', label: 'Festival map', testIds: ['map'] },
  { id: 'lineup', label: 'Band lineup', testIds: ['artists', 'stages'] },
  { id: 'storage', label: 'Local storage', testIds: ['idb'] },
];

export interface FriendlyGroupResult {
  id: string;
  label: string;
  pass: boolean;
}

export function friendlyGroups(results: TestResult[]): FriendlyGroupResult[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return FRIENDLY_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    pass: g.testIds.every((t) => byId.get(t)?.pass ?? false),
  }));
}

/**
 * Warm everything the app needs with no signal, then re-run the checks.
 *
 * Requesting the map and the start URL while online pulls them through the
 * service worker's runtime cache; persistent storage asks the OS not to evict
 * the database. Both are best-effort — the returned results are what actually
 * passed, never what we hoped would.
 */
export async function prepareForOffline(): Promise<TestResult[]> {
  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready.catch(() => undefined);
    }
  } catch {
    /* unsupported browser — the checks below will report it honestly */
  }
  await Promise.allSettled([
    fetch(MAP_IMAGE_URL, { cache: 'reload' }),
    fetch(BASE_URL, { cache: 'reload' }),
    navigator.storage?.persist?.() ?? Promise.resolve(false),
  ]);
  return runOfflineTests();
}
