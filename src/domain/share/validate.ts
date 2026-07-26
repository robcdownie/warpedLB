import type { Envelope } from './codec';
import type {
  SelectionsData,
  ScheduleData,
  CoordinatesData,
  BackupData,
} from './payloads';
import type { CheckIn, LocationCategory, ColorKey } from '@/domain/types';

/**
 * Structural validation of a decoded payload (plan §P0-8).
 *
 * The checksum proves the bytes survived the QR round-trip. It says nothing
 * about whether the DECODED FIELDS make sense — a code built by an older
 * build, a half-edited backup file, or a payload from a different map
 * revision all pass the checksum and would then be written straight into
 * IndexedDB. Everything below runs before the preview is even shown, so an
 * invalid code is refused with a sentence a person can act on rather than
 * partially imported or silently coerced.
 */

export interface ValidationIssue {
  /** Machine-readable, for tests. */
  code: string;
  /** One sentence, plain language, no field names or type jargon. */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Blocking problems — the import cannot proceed. */
  errors: ValidationIssue[];
  /** Non-blocking notes surfaced in the preview. */
  warnings: ValidationIssue[];
}

// Deliberately generous ceilings: they exist to stop a corrupt or hostile
// payload from wedging the app, not to constrain real use.
export const LIMITS = {
  /** Raw share-code characters. A full backup QR chain is well under this. */
  maxCodeChars: 2_000_000,
  /** Avatar data URL. ~200 KB is a large square photo. */
  maxAvatarChars: 300_000,
  maxNotesChars: 500,
  maxSelections: 400,
  maxPerformances: 500,
  maxLocations: 400,
  maxUsers: 25,
  maxCheckins: 200,
  /** Timestamps this far outside now are a broken clock, not real data. */
  maxFutureDays: 2,
  maxPastDays: 400,
} as const;

const COLOR_KEYS: ColorKey[] = ['pink', 'blue', 'orange', 'teal', 'yellow', 'purple'];
const LOCATION_CATEGORIES: LocationCategory[] = [
  'stage', 'entrance', 'experience', 'extreme-sports', 'bar',
  'sponsor', 'service', 'vendor', 'amenity', 'custom',
];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ValidationContext {
  knownPerformanceIds: Set<string>;
  knownStageIds: Set<string>;
  knownLocationIds: Set<string>;
  now?: Date;
}

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && HHMM_RE.test(v);
}

function isPlainId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function timestampIssue(iso: unknown, label: string, now: Date): ValidationIssue | null {
  if (typeof iso !== 'string') return { code: 'timestamp-missing', message: `${label} has no valid date.` };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { code: 'timestamp-invalid', message: `${label} has an unreadable date.` };
  const days = (t - now.getTime()) / 86_400_000;
  if (days > LIMITS.maxFutureDays) {
    return { code: 'timestamp-future', message: `${label} is dated in the future — check the sending phone's clock.` };
  }
  if (-days > LIMITS.maxPastDays) {
    return { code: 'timestamp-ancient', message: `${label} is dated more than a year ago — this looks like the wrong file.` };
  }
  return null;
}

/** Validate the raw code string before it is even decoded. */
export function validateRawCode(raw: string): ValidationIssue | null {
  if (raw.length > LIMITS.maxCodeChars) {
    return {
      code: 'code-too-large',
      message: 'That code is far larger than any real Warped share code and was not read.',
    };
  }
  return null;
}

export function validateEnvelope(env: Envelope, ctx: ValidationContext): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const now = ctx.now ?? new Date();

  const tsIssue = timestampIssue(env.exportedAt, 'This code', now);
  if (tsIssue) warnings.push(tsIssue);

  if (env.data == null || typeof env.data !== 'object') {
    errors.push({ code: 'data-missing', message: 'This code carries no data.' });
    return { ok: false, errors, warnings };
  }

  switch (env.type) {
    case 'selections':
      validateSelections(env.data as SelectionsData, ctx, errors, warnings);
      break;
    case 'schedule':
      validateSchedule(env.data as ScheduleData, ctx, errors, warnings);
      break;
    case 'coordinates':
      validateCoordinates(env.data as CoordinatesData, errors, warnings);
      break;
    case 'checkin':
      validateCheckin(env.data as CheckIn, ctx, errors, warnings, now);
      break;
    case 'backup':
      validateBackup(env.data as BackupData, ctx, errors, warnings);
      break;
    default:
      errors.push({
        code: 'unknown-type',
        message: `This code is a "${String(env.type)}" code, which this version of the app doesn't understand.`,
      });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateSelections(
  d: SelectionsData,
  ctx: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  if (!isPlainId(d?.u)) {
    errors.push({ code: 'bad-user-id', message: 'This code has an unusable profile id and cannot be imported.' });
  }
  if (typeof d?.n !== 'string' || !d.n.trim()) {
    errors.push({ code: 'bad-user-name', message: 'This code has no name on it, so there is nothing to label the plan with.' });
  }
  if (d?.c && !COLOR_KEYS.includes(d.c)) {
    warnings.push({ code: 'bad-color', message: 'The profile colour in this code is unknown — a default will be used.' });
  }
  if (typeof d?.a === 'string' && d.a.length > LIMITS.maxAvatarChars) {
    errors.push({ code: 'avatar-too-large', message: 'The photo in this code is too large to store safely.' });
  }
  if (!Array.isArray(d?.s)) {
    errors.push({ code: 'selections-missing', message: 'This code has no band picks in it.' });
    return;
  }
  if (d.s.length > LIMITS.maxSelections) {
    errors.push({
      code: 'too-many-selections',
      message: `This code claims ${d.s.length} picks, far more than the festival has sets. It looks damaged.`,
    });
    return;
  }

  let unknownPerf = 0;
  let badPriority = 0;
  let badAttendance = 0;
  let longNotes = 0;
  for (const t of d.s) {
    if (!Array.isArray(t) || !isPlainId(t[0])) {
      errors.push({ code: 'malformed-selection', message: 'Some picks in this code are malformed and it cannot be imported.' });
      return;
    }
    if (!ctx.knownPerformanceIds.has(t[0])) unknownPerf++;
    if (typeof t[1] !== 'number' || t[1] < 0 || t[1] > 2) badPriority++;
    if (typeof t[2] !== 'number' || t[2] < 0 || t[2] > 2) badAttendance++;
    if (typeof t[3] === 'string' && t[3].length > LIMITS.maxNotesChars) longNotes++;
  }
  if (unknownPerf) {
    warnings.push({
      code: 'unknown-performances',
      message: `${unknownPerf} pick(s) point at sets this phone doesn't know — they will be skipped. Check both phones are on the same app version.`,
    });
  }
  if (unknownPerf === d.s.length && d.s.length > 0) {
    errors.push({
      code: 'all-performances-unknown',
      message: 'None of the sets in this code exist on this phone. It is probably for a different event or app version.',
    });
  }
  if (badPriority || badAttendance) {
    warnings.push({
      code: 'bad-choice-codes',
      message: 'Some picks have an unrecognised priority or going/skipping choice — those fall back to the safe default.',
    });
  }
  if (longNotes) {
    warnings.push({ code: 'long-notes', message: `${longNotes} note(s) are unusually long and will be shortened.` });
  }
}

function validateSchedule(
  d: ScheduleData,
  ctx: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  if (!Array.isArray(d?.p)) {
    errors.push({ code: 'schedule-missing', message: 'This code has no set times in it.' });
    return;
  }
  if (d.p.length > LIMITS.maxPerformances) {
    errors.push({
      code: 'too-many-performances',
      message: `This code claims ${d.p.length} sets, more than the festival has. It looks damaged.`,
    });
    return;
  }

  // Bands the sender typed in off the board. They're legitimately absent from
  // this phone's lineup, so they must not be counted as unknown — but they do
  // have to be well-formed, since importing them creates records.
  const declared = new Set<string>();
  if (d.x !== undefined) {
    if (!Array.isArray(d.x) || d.x.length > LIMITS.maxPerformances) {
      errors.push({
        code: 'malformed-added-band',
        message: 'The added bands in this code are malformed and it cannot be imported.',
      });
      return;
    }
    for (const row of d.x) {
      const [perfId, aId, name] = Array.isArray(row) ? row : [];
      if (
        !isPlainId(perfId) ||
        !isPlainId(aId) ||
        typeof name !== 'string' ||
        !name.trim() ||
        name.length > 120
      ) {
        errors.push({
          code: 'malformed-added-band',
          message: 'The added bands in this code are malformed and it cannot be imported.',
        });
        return;
      }
      declared.add(perfId);
    }
    warnings.push({
      code: 'added-bands',
      message:
        d.x.length === 1
          ? '1 band in this code was typed in off the board and will be added to your lineup.'
          : `${d.x.length} bands in this code were typed in off the board and will be added to your lineup.`,
    });
  }

  let unknownPerf = 0;
  const unknownStages = new Set<string>();
  let badTime = 0;
  let badOrder = 0;
  for (const row of d.p) {
    if (!Array.isArray(row) || !isPlainId(row[0])) {
      errors.push({ code: 'malformed-schedule-row', message: 'Some set times in this code are malformed and it cannot be imported.' });
      return;
    }
    const [id, stageId, start, end] = row;
    if (!ctx.knownPerformanceIds.has(id) && !declared.has(id)) unknownPerf++;
    if (stageId != null) {
      if (!isPlainId(stageId) || !ctx.knownStageIds.has(stageId)) unknownStages.add(String(stageId));
    }
    if (start != null && !isValidTime(start)) badTime++;
    if (end != null && !isValidTime(end)) badTime++;
    if (isValidTime(start) && isValidTime(end) && end <= start) badOrder++;
  }

  // An unknown stage means the sender's map and this phone's map disagree.
  // Writing it would leave sets pinned to a stage that can't be drawn.
  if (unknownStages.size) {
    errors.push({
      code: 'unknown-stage',
      message:
        unknownStages.size === 1
          ? 'This code contains an unknown stage and cannot be imported yet. Make sure both phones are on the same app version.'
          : `This code contains ${unknownStages.size} unknown stages and cannot be imported yet. Make sure both phones are on the same app version.`,
    });
  }
  if (badTime) {
    errors.push({
      code: 'bad-time',
      message: `${badTime} set time(s) in this code aren't real clock times, so it cannot be imported.`,
    });
  }
  if (badOrder) {
    errors.push({
      code: 'end-before-start',
      message: `${badOrder} set(s) in this code end before they start, so it cannot be imported.`,
    });
  }
  if (unknownPerf) {
    warnings.push({
      code: 'unknown-performances',
      message: `${unknownPerf} set(s) in this code aren't in this phone's lineup and will be skipped.`,
    });
  }
}

function validateCoordinates(
  d: CoordinatesData,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  if (!Array.isArray(d?.l)) {
    errors.push({ code: 'coordinates-missing', message: 'This code has no map pins in it.' });
    return;
  }
  if (d.l.length > LIMITS.maxLocations) {
    errors.push({ code: 'too-many-locations', message: 'This code claims more map pins than the festival map has. It looks damaged.' });
    return;
  }
  let offMap = 0;
  let badCategory = 0;
  for (const t of d.l) {
    if (!Array.isArray(t) || !isPlainId(t[0]) || typeof t[1] !== 'string') {
      errors.push({ code: 'malformed-location', message: 'Some map pins in this code are malformed and it cannot be imported.' });
      return;
    }
    const [, , category, x, y] = t;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) ||
        x < 0 || x > 100 || y < 0 || y > 100) {
      offMap++;
    }
    if (!LOCATION_CATEGORIES.includes(category as LocationCategory)) badCategory++;
  }
  if (offMap) {
    errors.push({
      code: 'coordinates-off-map',
      message: `${offMap} pin(s) in this code sit outside the map image, so it cannot be imported.`,
    });
  }
  if (badCategory) {
    errors.push({
      code: 'unknown-category',
      message: `${badCategory} pin(s) use a kind of place this app doesn't know, so it cannot be imported.`,
    });
  }
  warnings.push({
    code: 'coordinates-replace',
    message: 'Importing pins replaces this phone\'s map positions for every pin in the code.',
  });
}

function validateCheckin(
  c: CheckIn,
  ctx: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  now: Date,
): void {
  if (!isPlainId(c?.userId)) {
    errors.push({ code: 'bad-user-id', message: 'This check-in has an unusable profile id and cannot be imported.' });
  }
  if (c?.locationId != null && !ctx.knownLocationIds.has(c.locationId)) {
    errors.push({
      code: 'unknown-location',
      message: 'This check-in points at a place this phone doesn\'t have on its map and cannot be imported yet.',
    });
  }
  if (c?.customCoordinates) {
    const { xPercent, yPercent } = c.customCoordinates;
    if (typeof xPercent !== 'number' || typeof yPercent !== 'number' ||
        xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
      errors.push({ code: 'coordinates-off-map', message: 'This check-in sits outside the map image and cannot be imported.' });
    }
  }
  if (c?.source !== 'manual' && c?.source !== 'live') {
    warnings.push({ code: 'bad-source', message: 'This check-in doesn\'t say how it was made; it will be treated as a manual check-in.' });
  }
  const tsIssue = timestampIssue(c?.updatedAt, 'This check-in', now);
  if (tsIssue) errors.push(tsIssue);
}

function validateBackup(
  d: BackupData,
  ctx: ValidationContext,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const arrays: [keyof BackupData, number, string][] = [
    ['users', LIMITS.maxUsers, 'profiles'],
    ['selections', LIMITS.maxSelections * LIMITS.maxUsers, 'picks'],
    ['performances', LIMITS.maxPerformances, 'sets'],
    ['locations', LIMITS.maxLocations, 'map pins'],
    ['checkins', LIMITS.maxCheckins, 'check-ins'],
  ];
  for (const [key, max, label] of arrays) {
    const arr = d?.[key];
    if (!Array.isArray(arr)) {
      errors.push({ code: `backup-missing-${key}`, message: `This backup has no ${label} section and cannot be restored.` });
      continue;
    }
    if (arr.length > max) {
      errors.push({ code: `backup-too-many-${key}`, message: `This backup claims an impossible number of ${label} and looks damaged.` });
    }
  }
  if (errors.length) return;

  for (const u of d.users) {
    if (!isPlainId(u?.id)) {
      errors.push({ code: 'bad-user-id', message: 'A profile in this backup has an unusable id, so it cannot be restored.' });
      break;
    }
    if (typeof u.avatar === 'string' && u.avatar.length > LIMITS.maxAvatarChars) {
      errors.push({ code: 'avatar-too-large', message: 'A photo in this backup is too large to store safely.' });
      break;
    }
  }
  let badTime = 0;
  for (const p of d.performances) {
    if (p?.startTime != null && !isValidTime(p.startTime)) badTime++;
    if (p?.endTime != null && !isValidTime(p.endTime)) badTime++;
    if (isValidTime(p?.startTime) && isValidTime(p?.endTime) && p.endTime! <= p.startTime!) badTime++;
  }
  if (badTime) {
    errors.push({ code: 'bad-time', message: `${badTime} set time(s) in this backup aren't real clock times, so it cannot be restored.` });
  }
  const unknownStage = d.performances.filter(
    (p) => p?.stageId && !ctx.knownStageIds.has(p.stageId),
  ).length;
  if (unknownStage) {
    warnings.push({
      code: 'unknown-stage',
      message: `${unknownStage} set(s) in this backup name a stage this phone doesn't have. Restore it on the phone it came from if the map looks wrong.`,
    });
  }
}
