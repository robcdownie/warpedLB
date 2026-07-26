import type { AppSettings, ScheduleProvenance, MapMeta } from './types';

/** Fresh install: nothing imported, nothing verified, nothing assumed. */
export const DEFAULT_SCHEDULE_PROVENANCE: ScheduleProvenance = {
  scheduleSource: null,
  scheduleImportedAt: null,
  scheduleExportedAt: null,
  scheduleRevision: 0,
  saturdayVerifiedAt: null,
  sundayVerifiedAt: null,
  saturdayVerifiedBy: null,
  sundayVerifiedBy: null,
};

/**
 * The shipped map was traced from the 2025-era Long Beach reference. It stays
 * unverified until a human checks it against the official 2026 map — caching
 * the image proves nothing about whether the layout is right.
 */
export const DEFAULT_MAP_META: MapMeta = {
  mapYear: 2026,
  mapRevision: 1,
  sourceLabel: 'Reference layout (not yet checked against the official 2026 map)',
  verifiedAt: null,
  calibratedAt: null,
  verified: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  // Empty until first-run creates or imports a profile. App.tsx refuses to show
  // the main UI while this doesn't resolve to a real user, so nothing can be
  // saved against a profile the person holding the phone never chose.
  activeUserId: '',
  staleMinutes: 20,
  crowdDelay: 'normal',
  turnoverBuffer: 10,
  adminUnlocked: false,
  offlineReady: false,
  theme: 'system',
  allowMeetupDuringMustSee: false,
  minMeetupMinutes: 15,
  friendImports: {},

  onboardingComplete: false,
  setupPostponed: [],
  emergencyAcknowledged: false,
  dismissedTips: [],
  setupCardCollapsed: false,

  schedule: { ...DEFAULT_SCHEDULE_PROVENANCE },
  map: { ...DEFAULT_MAP_META },

  festivalMode: false,
  breakNeeds: [],
  mapEditingEnabled: false,

  boardDay: null,
  boardStageId: null,
  boardPicksOnly: true,
  scheduleView: null,
  ignoredConflicts: [],
};

/**
 * Merge stored settings over the defaults. Nested objects need their own merge
 * or a device that saved settings before `schedule`/`map` existed would read
 * back `undefined` and crash every consumer.
 */
export function mergeSettings(stored: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    schedule: { ...DEFAULT_SCHEDULE_PROVENANCE, ...(stored?.schedule ?? {}) },
    map: { ...DEFAULT_MAP_META, ...(stored?.map ?? {}) },
    friendImports: stored?.friendImports ?? {},
    setupPostponed: stored?.setupPostponed ?? [],
    dismissedTips: stored?.dismissedTips ?? [],
    breakNeeds: stored?.breakNeeds ?? [],
    ignoredConflicts: stored?.ignoredConflicts ?? [],
  };
}

/** Crowd-delay multipliers applied to base travel estimates. */
export const CROWD_MULTIPLIER: Record<AppSettings['crowdDelay'], number> = {
  light: 1.0,
  normal: 1.4,
  heavy: 1.8,
};

/**
 * An imported friend plan older than this reads as "may be outdated". Long
 * enough to survive a night's sleep before the festival, short enough that a
 * plan imported yesterday morning is flagged on festival day.
 */
export const PLAN_STALE_HOURS = 12;
