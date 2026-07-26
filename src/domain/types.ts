// Core data model for Warped Long Beach Companion.
// These types mirror the IndexedDB stores and the spec's record shapes.

export type DayId = 'saturday' | 'sunday';

export type ArtistCategory = 'main-lineup' | 'unplugged-special';

export type PerformanceType = 'main' | 'unplugged';

export type ScheduleStatus = 'time-pending' | 'scheduled' | 'confirmed';

export type Priority = 'must-see' | 'want-to-see' | 'optional';

export type AttendanceDecision = 'undecided' | 'attending' | 'skipping';

export type PositionSource = 'planned' | 'manual' | 'live' | 'stale' | 'unknown';

/**
 * How complete a festival day's set-time data is. Deliberately three-valued:
 * a partial schedule must never be treated as a finished one (unassigned time
 * is *unknown*, not free).
 */
export type ScheduleDayStatus = 'empty' | 'partial' | 'complete';

/**
 * Whether a person's picks are actually on this device. "No data" is never
 * "free" — a placeholder profile is excluded from every group calculation.
 */
export type UserPlanStatus = 'local' | 'imported' | 'stale' | 'placeholder';

/** Lifecycle of a seeded performance as the official lineup changes. */
export type OfficialStatus = 'confirmed' | 'source-conflict' | 'removed' | 'canceled';

/** Things a person may need to fit into their day besides music. */
export type BreakKind = 'food' | 'water' | 'rest' | 'restroom' | 'locker';

export type CrowdDelay = 'light' | 'normal' | 'heavy';

export type ColorKey = 'pink' | 'blue' | 'orange' | 'teal' | 'yellow' | 'purple';

export interface Artist {
  id: string;
  name: string;
  searchAliases: string[];
  category: ArtistCategory;
}

export interface Performance {
  id: string;
  artistId: string;
  type: PerformanceType;
  /** Confirmed festival day. Null for Unplugged appearances until announced. */
  day: DayId | null;
  stageId: string | null;
  /** "HH:mm" 24h local (America/Los_Angeles) or null when unknown. */
  startTime: string | null;
  endTime: string | null;
  estimatedEndTime: string | null;
  scheduleStatus: ScheduleStatus;
  /** Lineup lifecycle. Absent on records seeded before v5 (treat as confirmed). */
  officialStatus?: OfficialStatus;
  /** Lineup revision this record was last reconciled against. */
  sourceRevision?: number;
  /** When a human confirmed this row against an official source. */
  verifiedAt?: string | null;
  /**
   * Typed in off the board because it wasn't in the announced lineup — a late
   * addition or a local opener. Kept distinct so it never passes as official.
   */
  addedLocally?: boolean;
}

export interface User {
  id: string;
  name: string;
  initials: string;
  /** Data URL of a locally-stored avatar image, or null. */
  avatar: string | null;
  colorKey: ColorKey;
}

export interface Selection {
  userId: string;
  performanceId: string;
  priority: Priority;
  selected: boolean;
  attendanceDecision: AttendanceDecision;
  notes: string;
  /** Set when the user skipped this because of a detected conflict. */
  skippedForConflict?: boolean;
  /**
   * Split-set plan: catch part of an overlapping set instead of choosing one.
   * Minutes late on arrival / minutes cut off the end.
   */
  arriveLateMinutes?: number;
  leaveEarlyMinutes?: number;
}

export type LocationCategory =
  | 'stage'
  | 'entrance'
  | 'experience'
  | 'extreme-sports'
  | 'bar'
  | 'sponsor'
  | 'service'
  | 'vendor'
  | 'amenity'
  | 'custom';

export interface MapLocation {
  id: string;
  name: string;
  shortName?: string;
  category: LocationCategory;
  /** Amenity legend key (e.g. "Restrooms", "First Aid") when category === 'amenity'. */
  amenityType?: string;
  xPercent: number;
  yPercent: number;
  /** True for user-added pins (deletable in calibration). Seed pins are false. */
  custom?: boolean;
}

export interface CheckIn {
  id: string;
  userId: string;
  locationId: string | null;
  customCoordinates: { xPercent: number; yPercent: number } | null;
  source: 'manual' | 'live';
  updatedAt: string; // ISO timestamp
}

export interface TravelOverride {
  /** "aStageId|bStageId" sorted, or "locA|locB". */
  pairKey: string;
  minutes: number;
}

/** Per-user metadata about the last selection import. */
export interface FriendImportMeta {
  userId: string;
  importedAt: string; // ISO
  selectionCount: number;
  /** Schedule revision the sender was on, when they told us. */
  scheduleRevision?: number;
}

/**
 * Where this device's set times came from and how fresh they are. Entirely
 * local metadata — no network needed (spec add-on §5).
 */
export interface ScheduleProvenance {
  /** User id or display name of whoever entered/exported the times. */
  scheduleSource: string | null;
  scheduleImportedAt: string | null;
  scheduleExportedAt: string | null;
  scheduleRevision: number;
  /** Per-day human verification: "every set on this day is entered". */
  saturdayVerifiedAt: string | null;
  sundayVerifiedAt: string | null;
  /** Who marked the day complete (for the provenance strip). */
  saturdayVerifiedBy: string | null;
  sundayVerifiedBy: string | null;
}

/**
 * Provenance for the festival map image + pin coordinates. A cached image is
 * NOT a verified map — `verified` only flips when a human confirms it.
 */
export interface MapMeta {
  mapYear: number;
  mapRevision: number;
  sourceLabel: string;
  verifiedAt: string | null;
  calibratedAt: string | null;
  verified: boolean;
}

/** Which one-time contextual tips have been dismissed. */
export type TipId =
  | 'bands'
  | 'group'
  | 'map'
  | 'schedule-import'
  | 'board-code'
  | 'festival-mode'
  /** The post-festival recap. Dismissing it returns the Now tab to normal. */
  | 'wrap-up';

export interface AppSettings {
  activeUserId: string;
  staleMinutes: number;
  crowdDelay: CrowdDelay;
  /** Stage turnover buffer (minutes) for estimated end times. */
  turnoverBuffer: number;
  adminUnlocked: boolean;
  offlineReady: boolean;
  theme: 'system' | 'light' | 'dark';
  /** Allow meetups to interrupt must-see sets (default false). */
  allowMeetupDuringMustSee: boolean;
  minMeetupMinutes: number;
  friendImports: Record<string, FriendImportMeta>;

  // ---- first run ---------------------------------------------------------
  /** False until the welcome flow has been completed or explicitly skipped. */
  onboardingComplete: boolean;
  /** Steps the user chose to postpone, so the checklist stops nagging. */
  setupPostponed: string[];
  /** The user has seen and acknowledged the emergency-backup step. */
  emergencyAcknowledged: boolean;
  dismissedTips: TipId[];
  /** Collapse (but keep) the setup card once the essentials are done. */
  setupCardCollapsed: boolean;

  // ---- provenance --------------------------------------------------------
  schedule: ScheduleProvenance;
  map: MapMeta;

  // ---- festival mode -----------------------------------------------------
  /** Simplified one-handed festival-day screen. */
  festivalMode: boolean;
  /** Personal break needs surfaced by the energy planner. */
  breakNeeds: BreakKind[];
  /** Map editing (calibration) is gated behind this. */
  mapEditingEnabled: boolean;

  // ---- board entry -------------------------------------------------------
  // Where you were up to when the phone locked. Losing your place mid-column
  // costs five taps to get back, ~76 times a day.
  boardDay: DayId | null;
  boardStageId: string | null;
  /** Narrow the band pool to sets someone in the crew actually picked. */
  boardPicksOnly: boolean;
  /** Which Schedule sub-view you were last on. */
  scheduleView: 'schedule' | 'editor' | 'conflicts' | null;
}

export interface HistoryEntry {
  id?: number;
  ts: string;
  kind: string;
  summary: string;
  /** Enough info to undo a schedule edit. */
  undo?: {
    performanceId: string;
    before: Pick<
      Performance,
      'stageId' | 'startTime' | 'endTime' | 'estimatedEndTime' | 'scheduleStatus' | 'day'
    >;
  };
}

export interface BackupSnapshot {
  id?: number;
  ts: string;
  label: string;
  /** JSON snapshot of affected stores prior to an import (for rollback). */
  data: unknown;
}
