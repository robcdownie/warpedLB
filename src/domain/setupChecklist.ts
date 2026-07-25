import type { AppSettings, Performance, Selection, User } from './types';
import { allDaysScheduleInfo, hasAnySchedule } from './scheduleStatus';
import { planInfo } from './planStatus';

/**
 * The "Finish Setting Up" checklist (plan §"Persistent setup checklist").
 *
 * Onboarding gets a phone usable in a few minutes; this keeps the remaining
 * work visible without blocking anything. Every step is either done, postponed
 * on purpose, or outstanding — there is no hidden third state where the app
 * quietly behaves as if setup finished.
 */

export type SetupStepId =
  | 'profile'
  | 'offline'
  | 'bands'
  | 'schedule'
  | 'friends'
  | 'emergency';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  done: boolean;
  /** Explicitly deferred by the user — counts as resolved, shown greyed. */
  postponed: boolean;
  /** Required for "Festival Ready". */
  required: boolean;
  detail: string;
}

export interface SetupState {
  steps: SetupStep[];
  outstanding: SetupStep[];
  /** Every required step done or deliberately postponed. */
  ready: boolean;
  doneCount: number;
  totalCount: number;
}

export function setupState(ctx: {
  settings: AppSettings;
  users: User[];
  selections: Selection[];
  performances: Performance[];
  offlineEssentialsPass: boolean;
}): SetupState {
  const { settings, users, selections, performances } = ctx;
  const activeUser = users.find((u) => u.id === settings.activeUserId);
  const mySelections = selections.filter(
    (s) => s.userId === settings.activeUserId && s.selected,
  ).length;
  const schedule = allDaysScheduleInfo(performances, settings.schedule);
  const friends = users.filter((u) => u.id !== settings.activeUserId);
  const importedFriends = friends.filter(
    (u) => planInfo(u.id, settings, selections).eligible,
  );

  const postponed = new Set(settings.setupPostponed);
  const mk = (
    id: SetupStepId,
    label: string,
    done: boolean,
    detail: string,
    required = true,
  ): SetupStep => ({ id, label, done, postponed: !done && postponed.has(id), required, detail });

  const steps: SetupStep[] = [
    mk(
      'profile',
      activeUser ? `Using this phone as ${activeUser.name}` : 'Choose who uses this phone',
      settings.onboardingComplete && !!activeUser,
      'Everything you pick is saved against this profile.',
    ),
    mk(
      'offline',
      ctx.offlineEssentialsPass ? 'Ready for offline use' : 'Prepare for offline use',
      ctx.offlineEssentialsPass,
      'Saves the app, map and lineup to this phone so it works with no signal.',
    ),
    mk(
      'bands',
      mySelections ? `${mySelections} bands selected` : 'Pick your bands',
      mySelections > 0,
      'Your Must See, Want to See and Maybe picks.',
    ),
    mk(
      'schedule',
      hasAnySchedule(schedule)
        ? schedule.saturday.status === 'complete' && schedule.sunday.status === 'complete'
          ? 'Set times complete'
          : 'Set times partly entered'
        : 'Import or enter set times',
      schedule.saturday.status === 'complete' || schedule.sunday.status === 'complete',
      'Warped posts stage times close to the show — import them or type them in.',
    ),
    mk(
      'friends',
      friends.length === 0
        ? 'No friends to import'
        : importedFriends.length === friends.length
          ? "Everyone's plan imported"
          : `${describeMissing(friends, importedFriends)} not imported`,
      friends.length === 0 || importedFriends.length === friends.length,
      "Scan each person's code so the group views are real.",
    ),
    mk(
      'emergency',
      settings.emergencyAcknowledged ? 'Emergency backup saved' : 'Save an emergency backup',
      settings.emergencyAcknowledged,
      'A plain-text copy of the plan that survives a dead phone.',
      false,
    ),
  ];

  const outstanding = steps.filter((s) => !s.done && !s.postponed);
  const ready = steps.every((s) => !s.required || s.done || s.postponed);
  return {
    steps,
    outstanding,
    ready,
    doneCount: steps.filter((s) => s.done).length,
    totalCount: steps.length,
  };
}

function describeMissing(friends: User[], imported: User[]): string {
  const ids = new Set(imported.map((u) => u.id));
  const names = friends.filter((u) => !ids.has(u.id)).map((u) => u.name);
  if (names.length === 1) return `${names[0]}'s plan`;
  if (names.length === 2) return `${names[0]} and ${names[1]}'s plans`;
  return `${names.length} plans`;
}
