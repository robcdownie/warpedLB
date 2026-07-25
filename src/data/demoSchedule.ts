import type { Repo } from '@/db/repo';
import type { Performance, Selection, DayId, User } from '@/domain/types';
import { STAGES } from './stages';
import { minutesToHHMM } from '@/domain/time';

// Fictional demo schedule (spec §34). Assigns plausible-looking set times so the
// interface can be exercised. DEMO ONLY — never shown in production.

const MUSIC_STAGES = STAGES.filter((s) => s.id !== 'warped-unplugged-stage');
const SLOT_MINUTES = 50; // 45-min sets + 5-min gap
const DAY_START = 12 * 60; // 12:00
const DAY_END = 21 * 60 + 30; // 21:30

/** Populate a fictional schedule in the given (demo) repo. */
export async function seedDemoSchedule(repo: Repo): Promise<void> {
  const all = await repo.allPerformances();
  const updates: Performance[] = [];

  for (const day of ['saturday', 'sunday'] as DayId[]) {
    const dayPerfs = all.filter((p) => p.type === 'main' && p.day === day);
    // Round-robin artists onto stages, staggering start times per stage.
    const stageCursors = new Map<string, number>(MUSIC_STAGES.map((s, i) => [s.id, DAY_START + (i % 3) * 15]));
    dayPerfs.forEach((p, idx) => {
      const stage = MUSIC_STAGES[idx % MUSIC_STAGES.length];
      let start = stageCursors.get(stage.id)!;
      if (start > DAY_END) start = DAY_START + (idx % 5) * 20; // wrap for busy days
      const end = start + 45;
      updates.push({
        ...p,
        stageId: stage.id,
        startTime: minutesToHHMM(start),
        endTime: minutesToHHMM(end),
        estimatedEndTime: null,
        scheduleStatus: 'scheduled',
      });
      stageCursors.set(stage.id, start + SLOT_MINUTES);
    });
  }

  await repo.putPerformances(updates);
}

/**
 * Fictional profiles for the demo database only. The production roster is
 * created by the user, so demo mode has to bring its own people — otherwise it
 * would seed picks belonging to nobody.
 */
const DEMO_USERS: User[] = [
  { id: 'alex', name: 'Alex', initials: 'A', avatar: null, colorKey: 'pink' },
  { id: 'sam', name: 'Sam', initials: 'S', avatar: null, colorKey: 'blue' },
  { id: 'jordan', name: 'Jordan', initials: 'J', avatar: null, colorKey: 'orange' },
];

/** Seed sample profiles + selections so demo screens have data. */
export async function seedDemoSelections(repo: Repo): Promise<void> {
  for (const u of DEMO_USERS) await repo.putUser(u);

  const all = await repo.allPerformances();
  const sat = all.filter((p) => p.type === 'main' && p.day === 'saturday' && p.startTime);
  const picks: Selection[] = [];
  const pick = (userId: string, perf: Performance | undefined, priority: Selection['priority'], decision: Selection['attendanceDecision'] = 'attending') => {
    if (!perf) return;
    picks.push({ userId, performanceId: perf.id, priority, selected: true, attendanceDecision: decision, notes: '' });
  };
  // Give each profile a handful across the day.
  pick('alex', sat[0], 'must-see');
  pick('alex', sat[3], 'want-to-see');
  pick('alex', sat[7], 'must-see');
  pick('sam', sat[0], 'must-see');
  pick('sam', sat[4], 'want-to-see', 'undecided');
  pick('sam', sat[8], 'must-see');
  pick('jordan', sat[2], 'want-to-see');
  pick('jordan', sat[7], 'must-see');
  pick('jordan', sat[10], 'want-to-see', 'undecided');
  await repo.putSelections(picks);

  const settings = await repo.getSettings();
  // Stamp friend-import metadata so the crew shows as imported in demo.
  settings.friendImports = {
    sam: { userId: 'sam', importedAt: new Date().toISOString(), selectionCount: 3 },
    jordan: { userId: 'jordan', importedAt: new Date().toISOString(), selectionCount: 3 },
  };
  // Demo mode skips the first-run flow, so it must supply the state that flow
  // would otherwise have written — without these, demo has no active profile.
  settings.activeUserId = 'alex';
  settings.onboardingComplete = true;
  await repo.putSettings(settings);
}
