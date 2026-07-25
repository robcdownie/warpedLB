import type { Repo } from '@/db/repo';
import type { Artist, Performance, MapLocation } from '@/domain/types';
import { artistId, mainPerformanceId, unpluggedPerformanceId } from '@/domain/slug';
import { SATURDAY_ARTISTS } from './artists-saturday';
import { SUNDAY_ARTISTS } from './artists-sunday';
import { UNPLUGGED_APPEARANCES } from './artists-unplugged';
import { STAGES } from './stages';
import { NAMED_LOCATIONS } from './locations';
import { AMENITY_LOCATIONS } from './amenities';
import { applyLineupMigrations, LINEUP_REVISION } from './lineupMigrations';

// Bump when the seed data shape changes. Seeding is idempotent: it adds/updates
// seed records by id but NEVER overwrites user-entered schedule fields.
// v5: performances carry officialStatus / sourceRevision for lineup migrations.
// v6: amenity pins (water, restrooms, First Aid, food, lockers…) seeded from
//     the festival map artwork — they used to be a legend with no pins.
export const SEED_VERSION = 6;

/**
 * One-off corrections to earlier seed data. When a name fix changes a seed id,
 * anything referencing the old id is migrated and the stale records removed.
 * (v4: "Partical Kid" → "Particle Kid".)
 */
const SEED_RENAMES: Array<{
  oldArtist: string;
  newArtist: string;
  oldPerf: string;
  newPerf: string;
}> = [
  {
    oldArtist: artistId('Partical Kid'),
    newArtist: artistId('Particle Kid'),
    oldPerf: unpluggedPerformanceId('Partical Kid'),
    newPerf: unpluggedPerformanceId('Particle Kid'),
  },
];

export interface SeedBundle {
  artists: Artist[];
  performances: Performance[];
  locations: MapLocation[];
}

/**
 * Build the full canonical dataset from the verbatim spec lists. Pure function
 * (no IO) so it can also be used for validation/testing.
 */
export function buildSeed(): SeedBundle {
  const artists = new Map<string, Artist>();
  const performances: Performance[] = [];

  function ensureArtist(name: string, category: Artist['category']): string {
    const id = artistId(name);
    if (!artists.has(id)) {
      artists.set(id, { id, name, searchAliases: [], category });
    }
    return id;
  }

  // Main lineup — Saturday.
  for (const name of SATURDAY_ARTISTS) {
    const aId = ensureArtist(name, 'main-lineup');
    performances.push({
      id: mainPerformanceId('saturday', name),
      artistId: aId,
      type: 'main',
      day: 'saturday',
      stageId: null,
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending',
      officialStatus: 'confirmed',
      sourceRevision: LINEUP_REVISION,
      verifiedAt: null,
    });
  }

  // Main lineup — Sunday.
  for (const name of SUNDAY_ARTISTS) {
    const aId = ensureArtist(name, 'main-lineup');
    performances.push({
      id: mainPerformanceId('sunday', name),
      artistId: aId,
      type: 'main',
      day: 'sunday',
      stageId: null,
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending',
      officialStatus: 'confirmed',
      sourceRevision: LINEUP_REVISION,
      verifiedAt: null,
    });
  }

  // Warped Unplugged & special appearances. Reuse existing artist record when the
  // name already exists in the main lineup; otherwise create an 'unplugged-special'.
  for (const name of UNPLUGGED_APPEARANCES) {
    const id = artistId(name);
    const category = artists.has(id) ? artists.get(id)!.category : 'unplugged-special';
    const aId = ensureArtist(name, category);
    performances.push({
      id: unpluggedPerformanceId(name),
      artistId: aId,
      type: 'unplugged',
      day: null,
      stageId: 'warped-unplugged-stage',
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending',
      officialStatus: 'confirmed',
      sourceRevision: LINEUP_REVISION,
      verifiedAt: null,
    });
  }

  const locations: MapLocation[] = [...STAGES, ...NAMED_LOCATIONS, ...AMENITY_LOCATIONS];

  return { artists: [...artists.values()], performances, locations };
}

/**
 * Seed the database idempotently.
 * - Artists: upserted (safe; names/categories are canonical).
 * - Performances: created if missing; if present, only schedule fields are left
 *   untouched (we refresh identity fields but preserve user edits).
 * - Locations: seed pins created if missing; existing pins (possibly calibrated)
 *   are preserved. Custom user pins are never touched.
 * - Users: NOT seeded. The roster is whatever this phone's owner created or
 *   imported, so seeding would hand every install a stranger's profile.
 */
export async function seedDatabase(repo: Repo): Promise<void> {
  const bundle = buildSeed();

  // Artists — upsert all.
  const existingArtists = new Map((await repo.allArtists()).map((a) => [a.id, a]));
  const artistsToWrite = bundle.artists.filter((a) => {
    const cur = existingArtists.get(a.id);
    return !cur || cur.name !== a.name || cur.category !== a.category;
  });
  if (artistsToWrite.length) await repo.putArtists(artistsToWrite);

  // Performances — create missing; preserve user-entered schedule on existing.
  // Rows seeded before v5 get backfilled with lineup-lifecycle fields so the
  // schedule-completeness math can exclude cancelled/removed sets.
  const existingPerf = new Map((await repo.allPerformances()).map((p) => [p.id, p]));
  const perfToWrite = bundle.performances.filter((p) => !existingPerf.has(p.id));
  const perfToBackfill = bundle.performances
    .map((p) => existingPerf.get(p.id))
    .filter((p): p is Performance => !!p && p.officialStatus === undefined)
    .map((p) => ({
      ...p,
      officialStatus: 'confirmed' as const,
      sourceRevision: LINEUP_REVISION,
      verifiedAt: p.verifiedAt ?? null,
    }));
  if (perfToWrite.length) await repo.putPerformances(perfToWrite);
  if (perfToBackfill.length) await repo.putPerformances(perfToBackfill);

  // Locations — create missing seed pins only.
  const existingLoc = new Map((await repo.allLocations()).map((l) => [l.id, l]));
  const locToWrite = bundle.locations.filter((l) => !existingLoc.has(l.id));
  if (locToWrite.length) await repo.putLocations(locToWrite);

  // Users are deliberately not seeded — see the note above seedDatabase.

  // Migrate renamed seed records on devices seeded before the correction.
  for (const r of SEED_RENAMES) {
    const oldPerf = await repo.getPerformance(r.oldPerf);
    if (oldPerf) {
      const newPerf = await repo.getPerformance(r.newPerf);
      if (newPerf) {
        // Carry user-entered schedule fields over to the corrected record.
        await repo.putPerformance({
          ...newPerf,
          stageId: oldPerf.stageId ?? newPerf.stageId,
          startTime: oldPerf.startTime ?? newPerf.startTime,
          endTime: oldPerf.endTime ?? newPerf.endTime,
          estimatedEndTime: oldPerf.estimatedEndTime ?? newPerf.estimatedEndTime,
          scheduleStatus: oldPerf.startTime ? oldPerf.scheduleStatus : newPerf.scheduleStatus,
        });
      }
      await repo.deletePerformance(r.oldPerf);
    }
    // Point any saved selections at the corrected performance id.
    const stale = (await repo.allSelections()).filter((s) => s.performanceId === r.oldPerf);
    for (const s of stale) {
      await repo.putSelection({ ...s, performanceId: r.newPerf });
      await repo.deleteSelection(s.userId, r.oldPerf);
    }
    if (r.oldArtist !== r.newArtist) await repo.deleteArtist(r.oldArtist);
  }

  // Versioned lineup corrections (day moves, cancellations, late additions).
  // Runs after seeding so newly-added rows exist for 'add' notices.
  await applyLineupMigrations(repo);

  await repo.putMeta('seedVersion', SEED_VERSION);
  await repo.putMeta('schemaVersion', 1);
}

/** Expected counts for validation and the Offline Test screen. */
export function seedCounts() {
  const bundle = buildSeed();
  return {
    saturdayMain: SATURDAY_ARTISTS.length,
    sundayMain: SUNDAY_ARTISTS.length,
    unplugged: UNPLUGGED_APPEARANCES.length,
    artists: bundle.artists.length,
    performances: bundle.performances.length,
    stages: STAGES.length,
    locations: bundle.locations.length,
  };
}
