import type {
  User,
  Selection,
  Performance,
  MapLocation,
  CheckIn,
  Priority,
  AttendanceDecision,
  ColorKey,
  AppSettings,
  DayId,
  Artist,
} from '@/domain/types';
import { encodeEnvelope, type Envelope, type PayloadType } from './codec';
import { plural } from '../plural';

/**
 * Biggest avatar worth putting in a share code (~8 KB of data URL). Above this
 * the QR count explodes; below it, it's a frame or two.
 */
export const MAX_SHARED_AVATAR_CHARS = 8000;

// Compact payload shapes. Deflate handles redundancy, but short field names keep
// QR codes small. Codes are arrays-of-tuples with documented positions.

const PRI_CODE: Record<Priority, number> = { 'must-see': 0, 'want-to-see': 1, optional: 2 };
const PRI_FROM = ['must-see', 'want-to-see', 'optional'] as const;
const ATT_CODE: Record<AttendanceDecision, number> = { undecided: 0, attending: 1, skipping: 2 };
const ATT_FROM = ['undecided', 'attending', 'skipping'] as const;

// ---- Selections ----------------------------------------------------------
export interface SelectionsData {
  u: string; // userId
  n: string; // name
  i: string; // initials
  c: ColorKey; // colorKey
  a?: string | null; // avatar data URL (optional; large)
  s: [string, number, number, string?][]; // [perfId, pri, att, notes?]
}

export function buildSelectionsData(user: User, selections: Selection[]): SelectionsData {
  const mine = selections.filter((s) => s.userId === user.id && s.selected);
  return {
    u: user.id,
    n: user.name,
    i: user.initials,
    c: user.colorKey,
    // A photo is raw base64 that doesn't deflate: a normal iPhone shot turns a
    // one-frame code into thousands of QR images rendered on the main thread,
    // which freezes or kills the sending phone. Small ones ride along; anything
    // real gets dropped, and the receiver just sees initials.
    a: user.avatar && user.avatar.length <= MAX_SHARED_AVATAR_CHARS ? user.avatar : null,
    s: mine.map((s) => {
      const tuple: [string, number, number, string?] = [
        s.performanceId,
        PRI_CODE[s.priority],
        ATT_CODE[s.attendanceDecision],
      ];
      if (s.notes) tuple.push(s.notes);
      return tuple;
    }),
  };
}

export function selectionsFromData(d: SelectionsData): { user: User; selections: Selection[] } {
  const user: User = {
    id: d.u,
    name: d.n,
    initials: d.i,
    avatar: d.a ?? null,
    colorKey: d.c,
  };
  const selections: Selection[] = d.s.map((t) => ({
    userId: d.u,
    performanceId: t[0],
    priority: PRI_FROM[t[1]] ?? 'want-to-see',
    selected: true,
    attendanceDecision: ATT_FROM[t[2]] ?? 'undecided',
    notes: t[3] ?? '',
  }));
  return { user, selections };
}

// ---- Schedule ------------------------------------------------------------
export interface ScheduleData {
  p: [string, string | null, string | null, string | null][]; // [perfId, stageId, start, end]
  /** Sender's schedule revision — lets the receiver spot a re-send vs an update. */
  rev?: number;
  /** Days the sender marked verified-complete, so completeness travels too. */
  done?: DayId[];
  /**
   * Bands typed in off the board that aren't in the announced lineup. Without
   * these the receiver silently drops the row (an unknown id is skipped on
   * import) and their day would read as free in a slot that isn't.
   */
  x?: [string, string, string, DayId | null][]; // [perfId, artistId, name, day]
}

export function buildScheduleData(
  performances: Performance[],
  meta?: { revision?: number; completeDays?: DayId[]; artistById?: Map<string, Artist> },
): ScheduleData {
  // An unplugged set carries a permanent stage from the seed, so "has a stage"
  // alone let all 32 of them ride along with nothing entered — a whole wasted
  // QR frame every send.
  const entered = performances.filter(
    (p) => p.startTime || p.endTime || (p.stageId && p.type !== 'unplugged'),
  );
  const added = entered.filter((p) => p.addedLocally);
  return {
    p: entered.map((p) => [p.id, p.stageId, p.startTime, p.endTime]),
    rev: meta?.revision,
    done: meta?.completeDays,
    x: added.length
      ? added.map((p) => [
          p.id,
          p.artistId,
          meta?.artistById?.get(p.artistId)?.name ?? p.artistId,
          p.day,
        ])
      : undefined,
  };
}

// ---- Coordinates ---------------------------------------------------------
export interface CoordinatesData {
  l: [string, string, string, number, number, number?, string?][];
  // [id, name, category, x, y, custom?, amenityType?]
}

export function buildCoordinatesData(locations: MapLocation[]): CoordinatesData {
  return {
    l: locations.map((l) => [
      l.id,
      l.name,
      l.category,
      Math.round(l.xPercent * 100) / 100,
      Math.round(l.yPercent * 100) / 100,
      l.custom ? 1 : 0,
      l.amenityType,
    ]),
  };
}

export function coordinatesFromData(d: CoordinatesData): MapLocation[] {
  return d.l.map((t) => ({
    id: t[0],
    name: t[1],
    category: t[2] as MapLocation['category'],
    xPercent: t[3],
    yPercent: t[4],
    custom: t[5] === 1,
    amenityType: t[6],
  }));
}

// ---- Check-in ------------------------------------------------------------
export function buildCheckinData(checkin: CheckIn): CheckIn {
  return checkin;
}

// ---- Backup (full) -------------------------------------------------------
export interface BackupData {
  users: User[];
  selections: Selection[];
  performances: Performance[];
  locations: MapLocation[];
  checkins: CheckIn[];
  settings?: AppSettings;
}

// ---- Encoders ------------------------------------------------------------
export function encodeSelections(user: User, selections: Selection[], now: string): string {
  return encodeEnvelope('selections', user.id, buildSelectionsData(user, selections), now);
}
export function encodeSchedule(
  performances: Performance[],
  source: string,
  now: string,
  meta?: { revision?: number; completeDays?: DayId[]; artistById?: Map<string, Artist> },
): string {
  return encodeEnvelope('schedule', source, buildScheduleData(performances, meta), now);
}
export function encodeCoordinates(locations: MapLocation[], source: string, now: string): string {
  return encodeEnvelope('coordinates', source, buildCoordinatesData(locations), now);
}
export function encodeCheckin(checkin: CheckIn, now: string): string {
  return encodeEnvelope('checkin', checkin.userId, buildCheckinData(checkin), now);
}
export function encodeBackup(data: BackupData, source: string, now: string): string {
  return encodeEnvelope('backup', source, data, now);
}

// ---- Import preview ------------------------------------------------------
export interface ImportPreview {
  type: PayloadType;
  source: string;
  exportedAt: string;
  adds: number;
  updates: number;
  unchanged: number;
  /** Records currently on this device that the import will delete. */
  removals: number;
  /** Human-readable summary lines. */
  lines: string[];
  /** Warnings (e.g. unknown performance IDs). */
  warnings: string[];
}

export interface CurrentState {
  users: User[];
  selections: Selection[];
  performances: Performance[];
  locations: MapLocation[];
}

/** Compute a non-destructive preview of what an import would change (spec §20). */
export function previewImport(env: Envelope, cur: CurrentState): ImportPreview {
  const base: ImportPreview = {
    type: env.type,
    source: env.source,
    exportedAt: env.exportedAt,
    adds: 0,
    updates: 0,
    unchanged: 0,
    removals: 0,
    lines: [],
    warnings: [],
  };

  if (env.type === 'selections') {
    const d = env.data as SelectionsData;
    const { user, selections } = selectionsFromData(d);
    const existingUser = cur.users.find((u) => u.id === user.id);
    base.lines.push(`${user.name}'s selections: ${plural(selections.length, 'band')}`);
    const knownPerf = new Set(cur.performances.map((p) => p.id));
    const unknown = selections.filter((s) => !knownPerf.has(s.performanceId));
    if (unknown.length) base.warnings.push(`${unknown.length} selection(s) reference unknown sets and will be skipped.`);
    const curForUser = new Map(
      cur.selections.filter((s) => s.userId === user.id).map((s) => [s.performanceId, s]),
    );
    for (const s of selections) {
      if (!knownPerf.has(s.performanceId)) continue;
      const prev = curForUser.get(s.performanceId);
      if (!prev) base.adds++;
      else if (
        prev.priority !== s.priority ||
        prev.attendanceDecision !== s.attendanceDecision ||
        prev.notes !== s.notes ||
        !prev.selected
      )
        base.updates++;
      else base.unchanged++;
    }
    // The commit replaces this user's selections wholesale — surface what an
    // older/smaller code would silently delete.
    const importedIds = new Set(selections.map((s) => s.performanceId));
    base.removals = [...curForUser.values()].filter(
      (prev) => prev.selected && !importedIds.has(prev.performanceId),
    ).length;
    if (base.removals) {
      base.warnings.push(
        `${base.removals} band(s) currently saved for ${user.name} are not in this code and will be removed.`,
      );
    }
    base.lines.push(existingUser ? `Updates existing friend "${user.name}"` : `Adds new friend "${user.name}"`);
  } else if (env.type === 'schedule') {
    const d = env.data as ScheduleData;
    const known = new Map(cur.performances.map((p) => [p.id, p]));
    let unknown = 0;
    for (const [id, stageId, start, end] of d.p) {
      const p = known.get(id);
      if (!p) {
        unknown++;
        continue;
      }
      if (p.stageId !== stageId || p.startTime !== start || p.endTime !== end) base.updates++;
      else base.unchanged++;
    }
    if (unknown) base.warnings.push(`${unknown} unknown set(s) will be skipped.`);
    base.lines.push(`Set times for ${d.p.length} performances`);
  } else if (env.type === 'coordinates') {
    const d = env.data as CoordinatesData;
    const known = new Map(cur.locations.map((l) => [l.id, l]));
    const round2 = (n: number) => Math.round(n * 100) / 100;
    for (const t of d.l) {
      const l = known.get(t[0]);
      if (!l) base.adds++;
      // Export rounds coordinates to 2 decimals — compare like-for-like so a
      // fresh round-trip doesn't show phantom "updates".
      else if (round2(l.xPercent) !== t[3] || round2(l.yPercent) !== t[4] || l.name !== t[1]) base.updates++;
      else base.unchanged++;
    }
    base.lines.push(`${d.l.length} map coordinates`);
  } else if (env.type === 'checkin') {
    base.adds = 1;
    const c = env.data as CheckIn;
    base.lines.push(`Check-in from ${c.userId}`);
  } else if (env.type === 'backup') {
    const d = env.data as BackupData;
    base.adds = d.users.length + d.selections.length;
    base.lines.push(
      `Full backup: ${d.users.length} users, ${d.selections.length} selections, ${d.performances.length} performances`,
    );
    base.warnings.push(
      'Restoring this backup replaces the friends, selections and check-ins on this device with the backup contents.',
    );
  }

  return base;
}
