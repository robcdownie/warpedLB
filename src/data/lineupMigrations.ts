import type { Repo } from '@/db/repo';
import type { DayId, Performance, Selection } from '@/domain/types';
import { artistId, mainPerformanceId, unpluggedPerformanceId } from '@/domain/slug';

/**
 * Safe lineup corrections (plan §P0-7).
 *
 * Once the app is installed on three phones, a lineup change can't just be a
 * new seed array: devices already hold performance records (and the user's
 * priorities and notes attached to them). Every correction is expressed as an
 * explicit, versioned change so it can be replayed on any device, carry saved
 * selections across, and TELL the user what moved. Nothing is ever silently
 * deleted.
 */

export type LineupChange =
  /** Artist name corrected. Selections follow to the new id. */
  | { kind: 'rename'; from: string; to: string; scope: 'main' | 'unplugged'; day?: DayId }
  /** Artist confirmed on the other day. */
  | { kind: 'move-day'; artist: string; from: DayId; to: DayId }
  /** Artist dropped off the bill but the row stays, flagged. */
  | { kind: 'cancel'; artist: string; day: DayId }
  /** Row was never real (bad source). Flagged 'removed', not deleted. */
  | { kind: 'remove'; artist: string; day: DayId }
  /** Late addition. The seed already creates it; this only records the notice. */
  | { kind: 'add'; artist: string; day: DayId };

export interface LineupRevision {
  revision: number;
  /** Where the correction came from, for the About / notices screen. */
  note: string;
  changes: LineupChange[];
}

/**
 * Bump this and append a revision whenever the official lineup changes.
 * Revision 1 is the shipped baseline — the verbatim announced lineup.
 */
export const LINEUP_REVISION = 1;

export const LINEUP_REVISIONS: LineupRevision[] = [
  // Example of the shape a future correction takes (kept empty until one is real):
  // {
  //   revision: 2,
  //   note: 'Official site update, 2026-07-20',
  //   changes: [{ kind: 'move-day', artist: 'Some Band', from: 'saturday', to: 'sunday' }],
  // },
];

/** A user-facing note about what a migration did to their saved plan. */
export interface LineupNotice {
  revision: number;
  message: string;
  /** Users whose saved selections were touched. */
  affectedUserIds: string[];
  ts: string;
}

function perfIdFor(change: { artist: string; day: DayId }): string {
  return mainPerformanceId(change.day, change.artist);
}

async function selectionsFor(repo: Repo, performanceId: string): Promise<Selection[]> {
  return (await repo.allSelections()).filter((s) => s.performanceId === performanceId);
}

/** Move every saved selection from one performance id to another, intact. */
async function carrySelections(
  repo: Repo,
  fromId: string,
  toId: string,
): Promise<string[]> {
  const saved = await selectionsFor(repo, fromId);
  for (const s of saved) {
    // priority, notes, attendance and split plans all ride along.
    await repo.putSelection({ ...s, performanceId: toId });
    await repo.deleteSelection(s.userId, fromId);
  }
  return [...new Set(saved.map((s) => s.userId))];
}

/** Carry user-entered schedule fields from an old row onto its replacement. */
function mergeScheduleFields(target: Performance, source: Performance): Performance {
  return {
    ...target,
    stageId: source.stageId ?? target.stageId,
    startTime: source.startTime ?? target.startTime,
    endTime: source.endTime ?? target.endTime,
    estimatedEndTime: source.estimatedEndTime ?? target.estimatedEndTime,
    scheduleStatus: source.startTime ? source.scheduleStatus : target.scheduleStatus,
  };
}

async function applyChange(
  repo: Repo,
  change: LineupChange,
  revision: number,
): Promise<LineupNotice | null> {
  const ts = new Date().toISOString();

  if (change.kind === 'rename') {
    const oldId =
      change.scope === 'unplugged'
        ? unpluggedPerformanceId(change.from)
        : mainPerformanceId(change.day!, change.from);
    const newId =
      change.scope === 'unplugged'
        ? unpluggedPerformanceId(change.to)
        : mainPerformanceId(change.day!, change.to);
    const oldPerf = await repo.getPerformance(oldId);
    if (!oldPerf) return null;
    const newPerf = await repo.getPerformance(newId);
    if (newPerf) {
      await repo.putPerformance({
        ...mergeScheduleFields(newPerf, oldPerf),
        officialStatus: 'confirmed',
        sourceRevision: revision,
      });
    }
    const affected = await carrySelections(repo, oldId, newId);
    await repo.deletePerformance(oldId);
    if (artistId(change.from) !== artistId(change.to)) {
      await repo.deleteArtist(artistId(change.from));
    }
    return {
      revision,
      message: `Lineup update: "${change.from}" is now "${change.to}". Your saved priority and notes were preserved.`,
      affectedUserIds: affected,
      ts,
    };
  }

  if (change.kind === 'move-day') {
    const oldId = perfIdFor({ artist: change.artist, day: change.from });
    const newId = perfIdFor({ artist: change.artist, day: change.to });
    const oldPerf = await repo.getPerformance(oldId);
    if (!oldPerf) return null;
    const existing = await repo.getPerformance(newId);
    const target: Performance = existing ?? {
      ...oldPerf,
      id: newId,
      day: change.to,
      // The day moved, so the old stage/time can't be right any more.
      stageId: null,
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending',
    };
    await repo.putPerformance({
      ...target,
      day: change.to,
      officialStatus: 'confirmed',
      sourceRevision: revision,
    });
    const affected = await carrySelections(repo, oldId, newId);
    await repo.deletePerformance(oldId);
    return {
      revision,
      message:
        `Lineup update: ${change.artist} moved from ${label(change.from)} to ${label(change.to)}. ` +
        'Your pick moved with them — their set time needs re-entering.',
      affectedUserIds: affected,
      ts,
    };
  }

  if (change.kind === 'cancel' || change.kind === 'remove') {
    const id = perfIdFor(change);
    const perf = await repo.getPerformance(id);
    if (!perf) return null;
    // Flag it; never delete. A vanished band with a vanished pick is a worse
    // surprise than a clearly-labeled cancelled row.
    await repo.putPerformance({
      ...perf,
      officialStatus: change.kind === 'cancel' ? 'canceled' : 'removed',
      sourceRevision: revision,
    });
    const affected = [
      ...new Set((await selectionsFor(repo, id)).filter((s) => s.selected).map((s) => s.userId)),
    ];
    return {
      revision,
      message:
        change.kind === 'cancel'
          ? `Lineup update: ${change.artist} cancelled their ${label(change.day)} set. Your pick is kept but marked cancelled.`
          : `Lineup update: ${change.artist} was removed from ${label(change.day)}. Your saved priority and notes were preserved.`,
      affectedUserIds: affected,
      ts,
    };
  }

  // 'add' — seedDatabase creates the row; this just tells the user.
  return {
    revision,
    message: `Lineup update: ${change.artist} was added to ${label(change.day)}.`,
    affectedUserIds: [],
    ts,
  };
}

function label(day: DayId): string {
  return day === 'saturday' ? 'Saturday' : 'Sunday';
}

/**
 * Replay every lineup revision this device hasn't seen. Returns the notices
 * to surface; they're also persisted so the user sees them once, whenever they
 * next open the app (which may be offline).
 */
export async function applyLineupMigrations(repo: Repo): Promise<LineupNotice[]> {
  const seen = (await repo.getMeta<number>('lineupRevision')) ?? 0;
  if (seen >= LINEUP_REVISION) return [];

  const notices: LineupNotice[] = [];
  for (const rev of LINEUP_REVISIONS) {
    if (rev.revision <= seen) continue;
    for (const change of rev.changes) {
      const notice = await applyChange(repo, change, rev.revision);
      if (notice) notices.push(notice);
    }
  }

  if (notices.length) {
    const prior = (await repo.getMeta<LineupNotice[]>('lineupNotices')) ?? [];
    await repo.putMeta('lineupNotices', [...prior, ...notices]);
    for (const n of notices) {
      await repo.addHistory({ ts: n.ts, kind: 'lineup-migration', summary: n.message });
    }
  }
  await repo.putMeta('lineupRevision', LINEUP_REVISION);
  return notices;
}

export async function pendingLineupNotices(repo: Repo): Promise<LineupNotice[]> {
  return (await repo.getMeta<LineupNotice[]>('lineupNotices')) ?? [];
}

export async function clearLineupNotices(repo: Repo): Promise<void> {
  await repo.putMeta('lineupNotices', []);
}
