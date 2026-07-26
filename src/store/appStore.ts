import { create } from 'zustand';
import type { AppMode } from '@/db/db';
import { repoFor } from '@/db/repo';
import { requestPersistentStorage, deleteDemoDb } from '@/db/db';
import { seedDatabase, SEED_VERSION } from '@/data/seed';
import { seedDemoSchedule, seedDemoSelections } from '@/data/demoSchedule';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import type {
  Artist,
  Performance,
  User,
  Selection,
  MapLocation,
  CheckIn,
  TravelOverride,
  AppSettings,
  Priority,
  AttendanceDecision,
  DayId,
  ScheduleProvenance,
  MapMeta,
  TipId,
} from '@/domain/types';
import { selectionKey } from '@/db/schema';
import { artistId, mainPerformanceId, unpluggedPerformanceId } from '@/domain/slug';
import { commitImport, rollbackImport } from '@/domain/share/importCommit';

export type TabId = 'now' | 'bands' | 'schedule' | 'group' | 'map';

interface AppState {
  // lifecycle
  hydrated: boolean;
  /** Set when hydrate failed, so the UI can offer a retry instead of hanging. */
  hydrateError: Error | null;
  mode: AppMode; // 'prod' | 'demo'
  activeTab: TabId;
  online: boolean;

  // data (mirrors IndexedDB)
  artists: Artist[];
  performances: Performance[];
  users: User[];
  selections: Selection[];
  locations: MapLocation[];
  checkins: CheckIn[];
  travelOverrides: TravelOverride[];
  settings: AppSettings;

  // derived lookups (rebuilt on data change)
  artistById: Map<string, Artist>;
  performanceById: Map<string, Performance>;
  locationById: Map<string, MapLocation>;
  userById: Map<string, User>;

  // actions
  hydrate: () => Promise<void>;
  setMode: (mode: AppMode) => Promise<void>;
  setTab: (tab: TabId) => void;
  setOnline: (online: boolean) => void;

  reloadAll: () => Promise<void>;

  // settings
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateScheduleMeta: (patch: Partial<ScheduleProvenance>) => Promise<void>;
  updateMapMeta: (patch: Partial<MapMeta>) => Promise<void>;
  /** Mark a festival day's set times as fully entered (or undo that). */
  markDayComplete: (day: DayId, verifiedBy: string) => Promise<void>;
  unmarkDayComplete: (day: DayId) => Promise<void>;
  dismissTip: (tip: TipId) => Promise<void>;
  /** Put a conflict away. Until now "Ignore" was wired to nothing at all. */
  ignoreConflict: (id: string) => Promise<void>;
  unignoreConflicts: () => Promise<void>;
  postponeSetupStep: (step: string) => Promise<void>;
  completeOnboarding: (activeUserId: string) => Promise<void>;
  restartOnboarding: () => Promise<void>;

  // selections
  getSelection: (userId: string, performanceId: string) => Selection | undefined;
  toggleSelection: (userId: string, performanceId: string) => Promise<void>;
  setPriority: (userId: string, performanceId: string, priority: Priority) => Promise<void>;
  setAttendance: (
    userId: string,
    performanceId: string,
    decision: AttendanceDecision,
    skippedForConflict?: boolean,
  ) => Promise<void>;
  setNotes: (userId: string, performanceId: string, notes: string) => Promise<void>;
  putSelectionsBulk: (list: Selection[]) => Promise<void>;
  /** Split-set trim: arrive late to / leave early from a set. */
  setSplitPlan: (
    userId: string,
    performanceId: string,
    plan: { arriveLateMinutes?: number; leaveEarlyMinutes?: number },
  ) => Promise<void>;

  // performances (schedule editing)
  updatePerformance: (perf: Performance, historySummary?: string) => Promise<void>;
  /** Create a band that's on the board but wasn't in the announced lineup. */
  addBoardBand: (input: {
    name: string;
    day: DayId;
    type: 'main' | 'unplugged';
  }) => Promise<Performance | null>;
  undoLastScheduleEdit: () => Promise<boolean>;

  // locations
  putLocation: (loc: MapLocation) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  // checkins
  putCheckIn: (c: CheckIn) => Promise<void>;
  deleteCheckIn: (id: string) => Promise<void>;
  /** Drop every check-in for a user, returning them to their planned position. */
  clearCheckInsFor: (userId: string) => Promise<void>;

  // travel overrides
  putTravelOverride: (o: TravelOverride) => Promise<void>;
  clearTravelOverrides: () => Promise<void>;

  // users
  putUser: (u: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // sharing
  applyImport: (env: import('@/domain/share/codec').Envelope) => Promise<{ backupId: number; summary: string }>;
  rollbackImport: (backupId: number) => Promise<boolean>;

  // resets / recovery
  resetSchedule: () => Promise<void>;
  resetMap: () => Promise<void>;
  resetAllLocalData: () => Promise<void>;
  resetDemoData: () => Promise<void>;

  // demo mode
  enterDemo: () => Promise<void>;
  exitDemo: () => Promise<void>;
}

function buildLookups(state: {
  artists: Artist[];
  performances: Performance[];
  locations: MapLocation[];
  users: User[];
}) {
  return {
    artistById: new Map(state.artists.map((a) => [a.id, a])),
    performanceById: new Map(state.performances.map((p) => [p.id, p])),
    locationById: new Map(state.locations.map((l) => [l.id, l])),
    userById: new Map(state.users.map((u) => [u.id, u])),
  };
}

/**
 * Replace one selection in the in-memory mirror (plan §P1-11).
 *
 * Every small edit used to re-read all seven IndexedDB stores, which is
 * correct but makes rapid starring on an older phone feel laggy. Selections
 * feed no derived lookup, so patching the array in place is enough — full
 * reloads are still used for hydration, imports, rollbacks, resets,
 * migrations and demo-mode switches, where whole stores change at once.
 */
function patchSelection(list: Selection[], next: Selection): Selection[] {
  const i = list.findIndex(
    (s) => s.userId === next.userId && s.performanceId === next.performanceId,
  );
  if (i === -1) return [...list, next];
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

/** Replace one performance and rebuild only the id lookup it feeds. */
function patchPerformance(list: Performance[], next: Performance): Performance[] {
  const i = list.findIndex((p) => p.id === next.id);
  if (i === -1) return [...list, next];
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

const BLANK_SELECTION = (userId: string, performanceId: string): Selection => ({
  userId,
  performanceId,
  priority: 'want-to-see',
  selected: true,
  attendanceDecision: 'undecided',
  notes: '',
});

export const useApp = create<AppState>((set, get) => ({
  hydrated: false,
  hydrateError: null,
  mode: 'prod',
  activeTab: 'now',
  online: navigator.onLine,

  artists: [],
  performances: [],
  users: [],
  selections: [],
  locations: [],
  checkins: [],
  travelOverrides: [],
  settings: { ...DEFAULT_SETTINGS },

  artistById: new Map(),
  performanceById: new Map(),
  locationById: new Map(),
  userById: new Map(),

  hydrate: async () => {
    // Any throw here used to be swallowed by the `void` at the call site, and
    // `hydrated` only flips on the success path — so a failed IndexedDB open
    // left the splash screen up forever, with a hand-typed board sitting
    // unreachable behind it and no way to retry.
    try {
      const repo = repoFor('prod');
      // Seed if needed (idempotent).
      const seedVersion = await repo.getMeta<number>('seedVersion');
      if (seedVersion !== SEED_VERSION) {
        await seedDatabase(repo);
      }
      void requestPersistentStorage();
      await get().reloadAll();
      set({ hydrated: true, hydrateError: null });
    } catch (err) {
      set({ hydrateError: err instanceof Error ? err : new Error(String(err)) });
    }
  },

  setMode: async (mode) => {
    if (mode === get().mode) return;
    if (mode === 'demo') {
      const repo = repoFor('demo');
      const seedVersion = await repo.getMeta<number>('seedVersion');
      if (seedVersion !== SEED_VERSION) await seedDatabase(repo);
    }
    set({ mode });
    await get().reloadAll();
  },

  setTab: (tab) => set({ activeTab: tab }),
  setOnline: (online) => set({ online }),

  reloadAll: async () => {
    const repo = repoFor(get().mode);
    const [
      artists,
      performances,
      users,
      selections,
      locations,
      checkins,
      travelOverrides,
      settings,
    ] = await Promise.all([
      repo.allArtists(),
      repo.allPerformances(),
      repo.allUsers(),
      repo.allSelections(),
      repo.allLocations(),
      repo.allCheckins(),
      repo.allTravelOverrides(),
      repo.getSettings(),
    ]);
    artists.sort((a, b) => a.name.localeCompare(b.name));
    // You first, then everyone else alphabetically. There is no seed order to
    // preserve any more — the roster is whatever this phone created or imported.
    const me = settings.activeUserId;
    users.sort(
      (a, b) => (a.id === me ? 0 : 1) - (b.id === me ? 0 : 1) || a.name.localeCompare(b.name),
    );
    set({
      artists,
      performances,
      users,
      selections,
      locations,
      checkins,
      travelOverrides,
      settings,
      ...buildLookups({ artists, performances, locations, users }),
    });
  },

  updateSettings: async (patch) => {
    const repo = repoFor(get().mode);
    const next = { ...get().settings, ...patch };
    await repo.putSettings(next);
    set({ settings: next });
  },

  updateScheduleMeta: async (patch) => {
    const cur = get().settings;
    await get().updateSettings({ schedule: { ...cur.schedule, ...patch } });
  },

  updateMapMeta: async (patch) => {
    const cur = get().settings;
    await get().updateSettings({ map: { ...cur.map, ...patch } });
  },

  markDayComplete: async (day, verifiedBy) => {
    const ts = new Date().toISOString();
    await get().updateScheduleMeta(
      day === 'saturday'
        ? { saturdayVerifiedAt: ts, saturdayVerifiedBy: verifiedBy }
        : { sundayVerifiedAt: ts, sundayVerifiedBy: verifiedBy },
    );
  },

  unmarkDayComplete: async (day) => {
    await get().updateScheduleMeta(
      day === 'saturday'
        ? { saturdayVerifiedAt: null, saturdayVerifiedBy: null }
        : { sundayVerifiedAt: null, sundayVerifiedBy: null },
    );
  },

  dismissTip: async (tip) => {
    const cur = get().settings.dismissedTips;
    if (cur.includes(tip)) return;
    await get().updateSettings({ dismissedTips: [...cur, tip] });
  },

  postponeSetupStep: async (step) => {
    const cur = get().settings.setupPostponed;
    if (cur.includes(step)) return;
    await get().updateSettings({ setupPostponed: [...cur, step] });
  },

  ignoreConflict: async (id) => {
    const cur = get().settings.ignoredConflicts;
    if (cur.includes(id)) return;
    await get().updateSettings({ ignoredConflicts: [...cur, id] });
  },

  unignoreConflicts: async () => {
    if (!get().settings.ignoredConflicts.length) return;
    await get().updateSettings({ ignoredConflicts: [] });
  },

  completeOnboarding: async (activeUserId) => {
    await get().updateSettings({ onboardingComplete: true, activeUserId });
  },

  restartOnboarding: async () => {
    // Deliberately does NOT touch selections, schedule or friends — replaying
    // the guide must never look like a data reset.
    await get().updateSettings({ onboardingComplete: false, setupCardCollapsed: false });
  },

  getSelection: (userId, performanceId) =>
    get().selections.find(
      (s) => s.userId === userId && s.performanceId === performanceId,
    ),

  toggleSelection: async (userId, performanceId) => {
    const repo = repoFor(get().mode);
    // Read fresh from IndexedDB (not the in-memory mirror) so two mutations
    // fired before the write resolves can't clobber each other's fields.
    const existing = await repo.getSelection(userId, performanceId);
    const next: Selection = existing
      ? { ...existing, selected: !existing.selected }
      : BLANK_SELECTION(userId, performanceId);
    await repo.putSelection(next);
    set({ selections: patchSelection(get().selections, next) });
  },

  setPriority: async (userId, performanceId, priority) => {
    const repo = repoFor(get().mode);
    const existing =
      (await repo.getSelection(userId, performanceId)) ?? BLANK_SELECTION(userId, performanceId);
    const next: Selection = { ...existing, priority, selected: true };
    await repo.putSelection(next);
    set({ selections: patchSelection(get().selections, next) });
  },

  setAttendance: async (userId, performanceId, decision, skippedForConflict) => {
    const repo = repoFor(get().mode);
    const existing = await repo.getSelection(userId, performanceId);
    if (!existing) return;
    const next: Selection = {
      ...existing,
      attendanceDecision: decision,
      // The flag used to be sticky: `?? existing`, so a band you later restored
      // by hand still claimed a conflict dropped it, and any recovery keyed on
      // the flag would resurrect picks you'd deliberately let go. An explicit
      // decision clears it; only a conflict card sets it.
      skippedForConflict: skippedForConflict ?? false,
    };
    await repo.putSelection(next);
    set({ selections: patchSelection(get().selections, next) });
  },

  setNotes: async (userId, performanceId, notes) => {
    const repo = repoFor(get().mode);
    const existing =
      (await repo.getSelection(userId, performanceId)) ?? BLANK_SELECTION(userId, performanceId);
    const next: Selection = { ...existing, notes };
    await repo.putSelection(next);
    set({ selections: patchSelection(get().selections, next) });
  },

  setSplitPlan: async (userId, performanceId, plan) => {
    const repo = repoFor(get().mode);
    const existing =
      (await repo.getSelection(userId, performanceId)) ?? BLANK_SELECTION(userId, performanceId);
    const next: Selection = {
      ...existing,
      selected: true,
      // A split IS a decision — leaving it "undecided" would keep nagging.
      attendanceDecision: 'attending',
      skippedForConflict: false,
      arriveLateMinutes: plan.arriveLateMinutes ?? 0,
      leaveEarlyMinutes: plan.leaveEarlyMinutes ?? 0,
    };
    await repo.putSelection(next);
    set({ selections: patchSelection(get().selections, next) });
  },

  putSelectionsBulk: async (list) => {
    const repo = repoFor(get().mode);
    await repo.putSelections(list);
    await get().reloadAll();
  },

  updatePerformance: async (perf, historySummary) => {
    const repo = repoFor(get().mode);
    const before = get().performanceById.get(perf.id);
    if (before && historySummary) {
      await repo.addHistory({
        ts: new Date().toISOString(),
        kind: 'schedule-edit',
        summary: historySummary,
        undo: {
          performanceId: perf.id,
          before: {
            stageId: before.stageId,
            startTime: before.startTime,
            endTime: before.endTime,
            estimatedEndTime: before.estimatedEndTime,
            scheduleStatus: before.scheduleStatus,
            day: before.day,
          },
        },
      });
    }
    await repo.putPerformance(perf);
    // Board entry fires one of these per row; a full reload per keystroke was
    // the worst of the reload cost. Patch the row and rebuild only its lookup.
    const performances = patchPerformance(get().performances, perf);
    set({ performances, performanceById: new Map(performances.map((p) => [p.id, p])) });
  },

  /**
   * A band on the wall that isn't in the announced lineup — a late addition or
   * a local opener. Without this the set simply could not be entered, and the
   * day would still count itself "complete" around the hole.
   *
   * Ids are derived from the name (domain/slug.ts), so the same band added on
   * two phones is the same record and the crew's codes still line up.
   */
  addBoardBand: async ({ name, day, type }) => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    const repo = repoFor(get().mode);
    const aId = artistId(clean);
    const pId = type === 'unplugged' ? unpluggedPerformanceId(clean) : mainPerformanceId(day, clean);

    // Already there (added earlier, or imported from a friend) — hand it back
    // rather than making a duplicate.
    const existing = get().performanceById.get(pId);
    if (existing) return existing;

    if (!get().artistById.has(aId)) {
      await repo.putArtist({
        id: aId,
        name: clean,
        searchAliases: [],
        category: type === 'unplugged' ? 'unplugged-special' : 'main-lineup',
      });
    }
    const perf: Performance = {
      id: pId,
      artistId: aId,
      type,
      day: type === 'unplugged' ? null : day,
      stageId: null,
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending',
      officialStatus: 'confirmed',
      addedLocally: true,
    };
    await repo.putPerformance(perf);
    await get().reloadAll();
    return get().performanceById.get(pId) ?? perf;
  },

  undoLastScheduleEdit: async () => {
    const repo = repoFor(get().mode);
    // Peek first — only delete the entry once the undo actually applies, so a
    // failed undo can't silently consume history.
    const top = await repo.peekUndoableHistory();
    if (!top) return false;
    const cur = await repo.getPerformance(top.entry.undo!.performanceId);
    if (!cur) {
      // The performance no longer exists; the entry can never apply. Drop it
      // so it doesn't wedge the undo stack.
      await repo.deleteHistory(top.key);
      return false;
    }
    await repo.putPerformance({ ...cur, ...top.entry.undo!.before });
    await repo.deleteHistory(top.key);
    await get().reloadAll();
    return true;
  },

  putLocation: async (loc) => {
    const repo = repoFor(get().mode);
    await repo.putLocation(loc);
    // Any pin write IS a calibration — record when, so Map Setup can show
    // whether the shipped coordinates have been touched.
    const settings = { ...get().settings };
    settings.map = { ...settings.map, calibratedAt: new Date().toISOString() };
    await repo.putSettings(settings);
    const locations = get().locations.some((l) => l.id === loc.id)
      ? get().locations.map((l) => (l.id === loc.id ? loc : l))
      : [...get().locations, loc];
    set({ locations, locationById: new Map(locations.map((l) => [l.id, l])), settings });
  },

  deleteLocation: async (id) => {
    const repo = repoFor(get().mode);
    await repo.deleteLocation(id);
    await get().reloadAll();
  },

  putCheckIn: async (c) => {
    const repo = repoFor(get().mode);
    await repo.putCheckIn(c);
    const rest = get().checkins.filter((x) => x.id !== c.id);
    set({ checkins: [...rest, c] });
  },

  deleteCheckIn: async (id) => {
    const repo = repoFor(get().mode);
    await repo.deleteCheckIn(id);
    set({ checkins: get().checkins.filter((c) => c.id !== id) });
  },

  clearCheckInsFor: async (userId) => {
    const repo = repoFor(get().mode);
    const mine = get().checkins.filter((c) => c.userId === userId);
    for (const c of mine) await repo.deleteCheckIn(c.id);
    set({ checkins: get().checkins.filter((c) => c.userId !== userId) });
  },

  putTravelOverride: async (o) => {
    const repo = repoFor(get().mode);
    await repo.putTravelOverride(o);
    await get().reloadAll();
  },

  clearTravelOverrides: async () => {
    const repo = repoFor(get().mode);
    await repo.clearTravelOverrides();
    await get().reloadAll();
  },

  putUser: async (u) => {
    const repo = repoFor(get().mode);
    await repo.putUser(u);
    await get().reloadAll();
  },

  /**
   * Remove a person from THIS phone. Their own device is unaffected.
   *
   * Everything keyed by their id has to go together, or the roster stops
   * agreeing with itself: a leftover check-in would keep drawing a map pin for
   * someone who isn't in the crew, and a leftover friendImports entry would
   * make them read as "imported" the moment they were re-added.
   */
  deleteUser: async (id) => {
    const repo = repoFor(get().mode);
    await repo.deleteUser(id);
    await repo.deleteSelectionsForUser(id);
    for (const c of get().checkins.filter((c) => c.userId === id)) {
      await repo.deleteCheckIn(c.id);
    }
    const s = await repo.getSettings();
    if (s.friendImports[id]) {
      const { [id]: _removed, ...rest } = s.friendImports;
      await repo.putSettings({ ...s, friendImports: rest });
    }
    await get().reloadAll();
  },

  applyImport: async (env) => {
    const repo = repoFor(get().mode);
    const res = await commitImport(repo, env);
    await get().reloadAll();
    return res;
  },

  rollbackImport: async (backupId) => {
    const repo = repoFor(get().mode);
    const ok = await rollbackImport(repo, backupId);
    await get().reloadAll();
    return ok;
  },

  resetSchedule: async () => {
    const repo = repoFor(get().mode);
    const cleared = get().performances.map((p) => ({
      ...p,
      // keep Unplugged stage assignment (it's fixed); clear everything else
      stageId: p.type === 'unplugged' ? p.stageId : null,
      startTime: null,
      endTime: null,
      estimatedEndTime: null,
      scheduleStatus: 'time-pending' as const,
    }));
    await repo.putPerformances(cleared);
    await repo.clearStore('history');
    // A wiped schedule cannot still be "verified complete".
    const settings = await repo.getSettings();
    await repo.putSettings({
      ...settings,
      schedule: {
        ...settings.schedule,
        scheduleSource: null,
        scheduleImportedAt: null,
        saturdayVerifiedAt: null,
        saturdayVerifiedBy: null,
        sundayVerifiedAt: null,
        sundayVerifiedBy: null,
      },
    });
    await get().reloadAll();
  },

  resetMap: async () => {
    const repo = repoFor(get().mode);
    await repo.clearStore('locations');
    await repo.clearTravelOverrides();
    await seedDatabase(repo); // re-seeds seed locations at seed coordinates
    // Seed coordinates are the unverified reference layout again.
    const settings = await repo.getSettings();
    await repo.putSettings({
      ...settings,
      map: { ...settings.map, verified: false, verifiedAt: null, calibratedAt: null },
    });
    await get().reloadAll();
  },

  resetAllLocalData: async () => {
    const repo = repoFor(get().mode);
    await repo.clearAll();
    await seedDatabase(repo);
    await get().reloadAll();
  },

  resetDemoData: async () => {
    await deleteDemoDb();
    const repo = repoFor('demo');
    await seedDatabase(repo);
    await seedDemoSchedule(repo);
    await seedDemoSelections(repo);
    if (get().mode === 'demo') await get().reloadAll();
  },

  enterDemo: async () => {
    const repo = repoFor('demo');
    const seeded = await repo.getMeta<number>('seedVersion');
    if (seeded !== SEED_VERSION) await seedDatabase(repo);
    // Populate fictional times/selections if not already present.
    const perfs = await repo.allPerformances();
    if (!perfs.some((p) => p.startTime)) {
      await seedDemoSchedule(repo);
      await seedDemoSelections(repo);
    }
    set({ mode: 'demo' });
    await get().reloadAll();
  },

  exitDemo: async () => {
    set({ mode: 'prod' });
    await get().reloadAll();
  },
}));

/** Convenience selector: the active user record. */
export function useActiveUser(): User | undefined {
  return useApp((s) => s.userById.get(s.settings.activeUserId));
}

export { selectionKey };
