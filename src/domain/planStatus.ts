import type { User, AppSettings, UserPlanStatus, Selection } from './types';
import { PLAN_STALE_HOURS } from './settings';
import { plural } from './plural';

/**
 * Whether a person's plan is actually on this device (plan §P0-2).
 *
 * A profile can exist on this phone without their picks ever arriving — you
 * add someone by name, or they arrive with an imported code. Such a friend
 * used to look identical to a friend with an empty day: free all afternoon. "No data" must never render as "free",
 * so a placeholder profile is excluded from every group calculation and is
 * labeled "Plan not imported" wherever it appears.
 */
export interface PlanInfo {
  userId: string;
  status: UserPlanStatus;
  /** Selections actually stored for this person. */
  selectionCount: number;
  importedAt: string | null;
  ageHours: number | null;
  /** True when this person may be included in group math. */
  eligible: boolean;
}

export function planInfo(
  userId: string,
  settings: AppSettings,
  selections: Selection[],
  now: Date = new Date(),
): PlanInfo {
  const selectionCount = selections.filter((s) => s.userId === userId && s.selected).length;

  if (userId === settings.activeUserId) {
    return {
      userId,
      status: 'local',
      selectionCount,
      importedAt: null,
      ageHours: null,
      eligible: true,
    };
  }

  const meta = settings.friendImports[userId];
  if (!meta) {
    return {
      userId,
      status: 'placeholder',
      selectionCount,
      importedAt: null,
      ageHours: null,
      eligible: false,
    };
  }

  const ageHours = (now.getTime() - new Date(meta.importedAt).getTime()) / 3_600_000;
  // An import that landed but carried nothing is still no plan — treating an
  // empty import as "free all day" is the exact failure this guards against.
  if (selectionCount === 0) {
    return {
      userId,
      status: 'placeholder',
      selectionCount: 0,
      importedAt: meta.importedAt,
      ageHours,
      eligible: false,
    };
  }

  return {
    userId,
    status: ageHours >= PLAN_STALE_HOURS ? 'stale' : 'imported',
    selectionCount,
    importedAt: meta.importedAt,
    ageHours,
    eligible: true,
  };
}

export function allPlanInfo(
  users: User[],
  settings: AppSettings,
  selections: Selection[],
  now: Date = new Date(),
): Map<string, PlanInfo> {
  return new Map(users.map((u) => [u.id, planInfo(u.id, settings, selections, now)]));
}

/** The users whose plans may drive timelines, meetups and free-time claims. */
export function eligibleUsers(
  users: User[],
  settings: AppSettings,
  selections: Selection[],
  now: Date = new Date(),
): User[] {
  return users.filter((u) => planInfo(u.id, settings, selections, now).eligible);
}

/** Short status line under a name, e.g. "14 bands, imported 2 hours ago". */
export function planStatusLabel(info: PlanInfo): string {
  switch (info.status) {
    case 'local':
      return `${plural(info.selectionCount, 'band')} · this phone`;
    case 'imported':
      return `${plural(info.selectionCount, 'band')}, ${relativeHours(info.ageHours)}`;
    case 'stale':
      return `Plan may be outdated — imported ${relativeHours(info.ageHours)}`;
    case 'placeholder':
      return 'Plan not imported';
  }
}

/** One word for badges and screen-reader labels. */
export function planStatusBadge(status: UserPlanStatus): string {
  switch (status) {
    case 'local':
      return 'This phone';
    case 'imported':
      return 'Imported';
    case 'stale':
      return 'May be outdated';
    case 'placeholder':
      return 'Not imported';
  }
}

function relativeHours(hours: number | null): string {
  if (hours == null) return 'just now';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (hours < 24) {
    const h = Math.round(hours);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.round(hours / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
