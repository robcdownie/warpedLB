// A small debug/automation surface exposed on window.__WLB__. Used by the
// verification harness (scripts/verify-e2e.mjs) and handy in the console.
// Safe to ship: this is a personal offline app with no secrets.
import { useApp } from '@/store/appStore';
import { detectConflicts } from '@/domain/conflicts';
import { encodeSchedule, encodeSelections } from '@/domain/share/payloads';
import { decodeEnvelope } from '@/domain/share/codec';
import { validateEnvelope } from '@/domain/share/validate';
import { allDaysScheduleInfo } from '@/domain/scheduleStatus';
import { allPlanInfo } from '@/domain/planStatus';
import { positionWithCheckin } from '@/domain/positions';
import { repoFor } from '@/db/repo';
import type { DayId, Performance, Priority } from '@/domain/types';

export function installDebugHook() {
  const api = {
    state: () => useApp.getState(),
    counts: () => {
      const s = useApp.getState();
      return {
        main: s.performances.filter((p) => p.type === 'main').length,
        unplugged: s.performances.filter((p) => p.type === 'unplugged').length,
        artists: s.artists.length,
        users: s.users.length,
        stages: s.locations.filter((l) => l.category === 'stage').length,
      };
    },
    updatePerformance: (p: Performance) => useApp.getState().updatePerformance(p),
    toggleSelection: (u: string, p: string) => useApp.getState().toggleSelection(u, p),
    setPriority: (u: string, p: string, pr: Priority) => useApp.getState().setPriority(u, p, pr),
    conflicts: (userId: string) => {
      const s = useApp.getState();
      const ctx = {
        userId,
        selections: s.selections,
        performanceById: s.performanceById,
        locationById: s.locationById,
        artistById: s.artistById,
        allPerformances: s.performances,
        crowd: s.settings.crowdDelay,
        turnoverBuffer: s.settings.turnoverBuffer,
        overrides: s.travelOverrides,
      };
      return (['saturday', 'sunday'] as DayId[]).flatMap((d) => detectConflicts(d, ctx));
    },
    exportSchedule: () => {
      const s = useApp.getState();
      // Match ScheduleIoScreen and send the display NAME, not the id. env.source
      // is rendered to whoever imports the code ("Imported from …"), so a
      // harness that exported an id here would be testing a different string
      // from the one users actually ship.
      const me = s.userById.get(s.settings.activeUserId);
      const source = me?.name ?? s.settings.activeUserId;
      return encodeSchedule(s.performances, source, new Date().toISOString(), {
        artistById: s.artistById,
      });
    },
    exportSelections: (userId: string) => {
      const s = useApp.getState();
      // The roster starts empty, so an unknown id is a normal mistake now, not
      // an impossible one. Fail with a readable message instead of a TypeError
      // buried inside page.evaluate.
      const user = s.userById.get(userId);
      if (!user) throw new Error(`No such profile: ${userId}`);
      return encodeSelections(user, s.selections, new Date().toISOString());
    },
    decode: (code: string) => decodeEnvelope(code),
    /** Structural validation, as the import UI runs it. */
    validate: (env: ReturnType<typeof decodeEnvelope>) => {
      const s = useApp.getState();
      return validateEnvelope(env, {
        knownPerformanceIds: new Set(s.performances.map((p) => p.id)),
        knownStageIds: new Set(s.locations.filter((l) => l.category === 'stage').map((l) => l.id)),
        knownLocationIds: new Set(s.locations.map((l) => l.id)),
      });
    },
    applyImport: (env: ReturnType<typeof decodeEnvelope>) => useApp.getState().applyImport(env),

    /** Per-day empty/partial/complete status (plan §P0-1). */
    scheduleStatus: () => {
      const s = useApp.getState();
      return allDaysScheduleInfo(s.performances, s.settings.schedule);
    },
    markDayComplete: (day: DayId) => useApp.getState().markDayComplete(day, 'e2e'),
    unmarkDayComplete: (day: DayId) => useApp.getState().unmarkDayComplete(day),

    /** Who counts in group math, and why (plan §P0-2). */
    planStatus: () => {
      const s = useApp.getState();
      return Object.fromEntries(allPlanInfo(s.users, s.settings, s.selections));
    },

    /** Resolved position for a user, honoring check-in freshness (plan §P0-3). */
    position: (userId: string, day: DayId, atMinute: number, nowMs = Date.now()) => {
      const s = useApp.getState();
      return positionWithCheckin(userId, day, atMinute, s.checkins, nowMs, s.settings.staleMinutes, {
        selections: s.selections,
        performanceById: s.performanceById,
        locationById: s.locationById,
        allPerformances: s.performances,
        crowd: s.settings.crowdDelay,
        turnoverBuffer: s.settings.turnoverBuffer,
        overrides: s.travelOverrides,
      });
    },

    settings: () => useApp.getState().settings,
    updateSettings: (patch: Partial<import('@/domain/types').AppSettings>) =>
      useApp.getState().updateSettings(patch),
    /**
     * Skip onboarding so the harness lands on the normal UI. There is no
     * default profile to fall back on — the caller must create one first and
     * pass its id, or App.tsx will bounce straight back to onboarding.
     */
    completeOnboarding: (userId: string) => useApp.getState().completeOnboarding(userId),
    resetSchedule: async () => {
      const s = useApp.getState();
      const repo = repoFor(s.mode);
      for (const p of s.performances) {
        if (p.startTime || p.endTime || (p.type === 'main' && p.stageId)) {
          await repo.putPerformance({
            ...p,
            stageId: p.type === 'unplugged' ? p.stageId : null,
            startTime: null,
            endTime: null,
            estimatedEndTime: null,
            scheduleStatus: 'time-pending',
          });
        }
      }
      await useApp.getState().reloadAll();
    },
  };
  (window as unknown as { __WLB__: typeof api }).__WLB__ = api;
}
