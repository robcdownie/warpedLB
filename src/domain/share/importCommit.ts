import type { Repo } from '@/db/repo';
import type { Envelope } from './codec';
import {
  selectionsFromData,
  coordinatesFromData,
  type SelectionsData,
  type ScheduleData,
  type CoordinatesData,
  type BackupData,
} from './payloads';
import type { CheckIn, Performance } from '@/domain/types';

// Applies a decoded envelope to the database. A pre-import snapshot is saved to
// the `backups` store first so the whole import can be rolled back (spec §20).

export interface CommitResult {
  backupId: number;
  summary: string;
}

export async function commitImport(repo: Repo, env: Envelope): Promise<CommitResult> {
  // Snapshot affected stores for rollback.
  const snapshot = {
    users: await repo.allUsers(),
    selections: await repo.allSelections(),
    performances: await repo.allPerformances(),
    // Artists ride along because a schedule import can now CREATE bands (see
    // ScheduleData.x). Restoring performances alone would leave them orphaned.
    artists: await repo.allArtists(),
    locations: await repo.allLocations(),
    checkins: await repo.allCheckins(),
    settings: await repo.getSettings(),
  };
  const backupId = await repo.addBackup({
    ts: new Date().toISOString(),
    label: `Before import: ${env.type} from ${env.source}`,
    data: snapshot,
  });

  let summary = '';

  if (env.type === 'selections') {
    const { user, selections } = selectionsFromData(env.data as SelectionsData);
    // Upsert user (update in place, never duplicate).
    await repo.putUser(user);
    // Replace this user's selections wholesale (import is authoritative for them).
    await repo.deleteSelectionsForUser(user.id);
    const known = new Set((await repo.allPerformances()).map((p) => p.id));
    const valid = selections.filter((s) => known.has(s.performanceId));
    await repo.putSelections(valid);
    // Stamp friend-import metadata.
    const settings = await repo.getSettings();
    settings.friendImports = {
      ...settings.friendImports,
      [user.id]: {
        userId: user.id,
        importedAt: new Date().toISOString(),
        selectionCount: valid.length,
      },
    };
    await repo.putSettings(settings);
    summary = `Imported ${valid.length} selections for ${user.name}.`;
    if (valid.length === 0) {
      // An import that carried nothing must not read as "Sam is free all day".
      summary = `${user.name}'s code had no usable picks — their plan still counts as not imported.`;
    }
  } else if (env.type === 'schedule') {
    const d = env.data as ScheduleData;

    // Bands the sender typed in off the board that aren't in the announced
    // lineup. Create them first — an unknown id is skipped below, which would
    // silently drop the set and leave that slot reading as free time.
    if (d.x?.length) {
      const known = new Set((await repo.allArtists()).map((a) => a.id));
      const knownPerfs = new Set((await repo.allPerformances()).map((p) => p.id));
      for (const [perfId, aId, name, day] of d.x) {
        if (!known.has(aId)) {
          await repo.putArtist({
            id: aId,
            name,
            searchAliases: [],
            category: day ? 'main-lineup' : 'unplugged-special',
          });
          known.add(aId);
        }
        if (!knownPerfs.has(perfId)) {
          await repo.putPerformance({
            id: perfId,
            artistId: aId,
            type: day ? 'main' : 'unplugged',
            day,
            stageId: null,
            startTime: null,
            endTime: null,
            estimatedEndTime: null,
            scheduleStatus: 'time-pending',
            officialStatus: 'confirmed',
            addedLocally: true,
          });
          knownPerfs.add(perfId);
        }
      }
    }

    const perfs = new Map((await repo.allPerformances()).map((p) => [p.id, p]));
    const updated: Performance[] = [];
    for (const [id, stageId, start, end] of d.p) {
      const p = perfs.get(id);
      if (!p) continue;
      const nextStage = stageId ?? p.stageId;
      const nextStart = start ?? p.startTime;
      const nextEnd = end ?? p.endTime;
      // A manually confirmed status survives an import that doesn't actually
      // change anything; real changes recompute the status.
      const unchanged =
        nextStage === p.stageId && nextStart === p.startTime && nextEnd === p.endTime;
      updated.push({
        ...p,
        stageId: nextStage,
        startTime: nextStart,
        endTime: nextEnd,
        estimatedEndTime: end ? null : p.estimatedEndTime,
        scheduleStatus:
          unchanged && p.scheduleStatus === 'confirmed'
            ? 'confirmed'
            : nextStart && nextStage
              ? 'scheduled'
              : 'time-pending',
      });
    }
    await repo.putPerformances(updated);

    // Provenance: who entered these times, when they left the other phone, and
    // which revision this is. Without it an imported schedule looks exactly
    // like one you typed yourself (plan §P0-5).
    const settings = await repo.getSettings();
    const importedAt = new Date().toISOString();
    const nextRevision = typeof d.rev === 'number' ? d.rev : settings.schedule.scheduleRevision + 1;
    const completeDays = new Set(d.done ?? []);
    await repo.putSettings({
      ...settings,
      schedule: {
        ...settings.schedule,
        scheduleSource: env.source,
        scheduleImportedAt: importedAt,
        scheduleExportedAt: env.exportedAt,
        scheduleRevision: nextRevision,
        // Verification travels with the schedule, attributed to the sender.
        // Days the sender did NOT mark complete drop back to unverified here —
        // an update that adds sets must not inherit the old "complete" stamp.
        saturdayVerifiedAt: completeDays.has('saturday') ? importedAt : null,
        saturdayVerifiedBy: completeDays.has('saturday') ? env.source : null,
        sundayVerifiedAt: completeDays.has('sunday') ? importedAt : null,
        sundayVerifiedBy: completeDays.has('sunday') ? env.source : null,
      },
    });
    summary = `Imported set times for ${updated.length} performances.`;
  } else if (env.type === 'coordinates') {
    const locs = coordinatesFromData(env.data as CoordinatesData);
    await repo.putLocations(locs);
    // Imported pins mean someone calibrated, not that the map was verified —
    // those are different claims and only a human flips `verified`.
    const settings = await repo.getSettings();
    await repo.putSettings({
      ...settings,
      map: { ...settings.map, calibratedAt: new Date().toISOString() },
    });
    summary = `Imported ${locs.length} map coordinates.`;
  } else if (env.type === 'checkin') {
    const c = env.data as CheckIn;
    await repo.putCheckIn(c);
    summary = `Imported a check-in from ${c.userId}.`;
  } else if (env.type === 'backup') {
    const d = env.data as BackupData;
    // Restore is a REPLACE (as the preview warns), not a merge: clear the
    // user-data stores first so records absent from the backup don't linger.
    // Performances/locations are keyed by stable seed ids and the backup holds
    // the full set, so upserting them is already a replace.
    await repo.clearStore('users');
    await repo.clearStore('selections');
    await repo.clearStore('checkins');
    for (const u of d.users) await repo.putUser(u);
    await repo.putSelections(d.selections);
    await repo.putPerformances(d.performances);
    await repo.putLocations(d.locations);
    for (const c of d.checkins) await repo.putCheckIn(c);
    if (d.settings) {
      // Keep this device's offlineReady flag — it reflects local SW state.
      const cur = await repo.getSettings();
      await repo.putSettings({ ...d.settings, offlineReady: cur.offlineReady });
    }
    summary = `Restored backup: ${d.users.length} users, ${d.selections.length} selections.`;
  }

  return { backupId, summary };
}

/** Roll back a prior import using its snapshot. */
export async function rollbackImport(repo: Repo, backupId: number): Promise<boolean> {
  const backup = await repo.getBackup(backupId);
  if (!backup) return false;
  const snap = backup.data as {
    users: import('@/domain/types').User[];
    selections: import('@/domain/types').Selection[];
    performances: Performance[];
    artists?: import('@/domain/types').Artist[];
    locations: import('@/domain/types').MapLocation[];
    checkins: CheckIn[];
    settings: import('@/domain/types').AppSettings;
  };
  // Restore the snapshot wholesale for the affected stores.
  await repo.clearStore('selections');
  await repo.putSelections(snap.selections);
  await repo.clearStore('users');
  for (const u of snap.users) await repo.putUser(u);
  // Records the import CREATED aren't in the snapshot, and putting the snapshot
  // back only upserts — so drop the additions explicitly or an undone import
  // leaves its bands behind. Older snapshots have no `artists`; skip that half
  // rather than deleting every artist on the phone.
  const keepPerfs = new Set(snap.performances.map((p) => p.id));
  for (const p of await repo.allPerformances()) {
    if (!keepPerfs.has(p.id)) await repo.deletePerformance(p.id);
  }
  if (snap.artists) {
    const keepArtists = new Set(snap.artists.map((a) => a.id));
    for (const a of await repo.allArtists()) {
      if (!keepArtists.has(a.id)) await repo.deleteArtist(a.id);
    }
  }
  await repo.putPerformances(snap.performances);
  await repo.putLocations(snap.locations);
  await repo.clearStore('checkins');
  for (const c of snap.checkins) await repo.putCheckIn(c);
  await repo.putSettings(snap.settings);
  return true;
}
