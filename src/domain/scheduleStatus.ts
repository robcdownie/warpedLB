import type { Performance, DayId, ScheduleDayStatus, AppSettings } from './types';

/**
 * Per-day schedule completeness (plan §P0-1).
 *
 * The old boolean `isScheduleLoaded` flipped true the moment ONE set had a
 * stage and a time, which switched on the Now dashboard, meetups, planned
 * friend positions and free-time claims off a schedule that might be 1/76
 * entered. Unassigned time then read as free time. Three states fix that:
 * a day is empty, partially entered, or actually complete — and only the last
 * one licenses a confident claim.
 */
export interface DayScheduleInfo {
  day: DayId;
  status: ScheduleDayStatus;
  /** Sets on this day with both a stage and a start time. */
  entered: number;
  /** Sets the lineup says belong to this day (excludes canceled/removed). */
  expected: number;
  /** Human verification stamp, if the day was marked complete. */
  verifiedAt: string | null;
  verifiedBy: string | null;
}

/** A performance counts as scheduled only with BOTH a stage and a start time. */
export function isAssigned(p: Performance): boolean {
  return !!p.startTime && !!p.stageId;
}

/** Retired lineup rows shouldn't inflate the denominator. */
function countsTowardDay(p: Performance): boolean {
  return p.officialStatus !== 'removed' && p.officialStatus !== 'canceled';
}

export function dayScheduleInfo(
  day: DayId,
  performances: Performance[],
  provenance: AppSettings['schedule'],
): DayScheduleInfo {
  const onDay = performances.filter(
    (p) => p.day === day && p.type === 'main' && countsTowardDay(p),
  );
  const entered = onDay.filter(isAssigned).length;
  const expected = onDay.length;
  const verifiedAt =
    day === 'saturday' ? provenance.saturdayVerifiedAt : provenance.sundayVerifiedAt;
  const verifiedBy =
    day === 'saturday' ? provenance.saturdayVerifiedBy : provenance.sundayVerifiedBy;

  let status: ScheduleDayStatus;
  if (entered === 0) status = 'empty';
  else if (verifiedAt || (expected > 0 && entered >= expected)) status = 'complete';
  else status = 'partial';

  return { day, status, entered, expected, verifiedAt, verifiedBy };
}

export function allDaysScheduleInfo(
  performances: Performance[],
  provenance: AppSettings['schedule'],
): Record<DayId, DayScheduleInfo> {
  return {
    saturday: dayScheduleInfo('saturday', performances, provenance),
    sunday: dayScheduleInfo('sunday', performances, provenance),
  };
}

/** Any day with at least one entered set — the gate for showing day views. */
export function hasAnySchedule(info: Record<DayId, DayScheduleInfo>): boolean {
  return info.saturday.status !== 'empty' || info.sunday.status !== 'empty';
}

/**
 * True when a claim about free time / availability on this day would be a
 * guess. Callers must soften their language when this is true.
 */
export function isProvisional(info: DayScheduleInfo): boolean {
  return info.status !== 'complete';
}

/** "51 of 76 sets entered" — used in the status strip and the setup card. */
export function completionLabel(info: DayScheduleInfo): string {
  if (info.status === 'empty') return 'No set times entered';
  return `${info.entered} of ${info.expected} sets entered`;
}

export function statusLabel(status: ScheduleDayStatus): string {
  return status === 'complete' ? 'Complete' : status === 'partial' ? 'Partial' : 'Not entered';
}

/**
 * Selected sets that have no time yet. These are the reason a partial day
 * can't be trusted: they occupy the person's day but the app can't say when.
 */
export function unknownSelectedCount(
  day: DayId,
  performances: Performance[],
  selections: { userId: string; performanceId: string; selected: boolean }[],
  userId: string,
): number {
  const byId = new Map(performances.map((p) => [p.id, p]));
  return selections.filter((s) => {
    if (s.userId !== userId || !s.selected) return false;
    const p = byId.get(s.performanceId);
    return !!p && p.day === day && countsTowardDay(p) && !isAssigned(p);
  }).length;
}
