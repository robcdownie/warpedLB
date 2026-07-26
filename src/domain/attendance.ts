import type { Performance, Selection } from './types';
import type { EffectiveEnd } from './endTimes';
import { attendWindow, hasSplit } from './splitSet';

/**
 * How a pick reads on your own plan.
 *
 * "Maybe" is only a real state when something competes with it. A pick with
 * nothing against it isn't an open question — it's on the plan until you take
 * it off. Every consumer already worked that way (leave-by, meetups, positions
 * and Now all count undecided picks), so showing a whole conflict-free day as
 * "Maybe" was the app hedging about a plan it wasn't actually hedging about.
 */
export type PlanState = 'going' | 'maybe' | 'skipping';

export interface Pick {
  perf: Performance;
  sel: Selection;
  end: EffectiveEnd;
}

/**
 * The performance ids you actually have to choose between: live picks whose
 * attend windows overlap. A split pair is excluded — planning to catch part of
 * each IS the choice, so neither set is contested any more.
 */
export function contestedPicks(picks: Pick[]): Set<string> {
  const live = picks
    .filter((p) => p.sel.selected && p.sel.attendanceDecision !== 'skipping')
    .map((p) => ({ ...p, window: attendWindow(p.perf, p.sel, p.end) }))
    .filter((p): p is typeof p & { window: NonNullable<typeof p.window> } => !!p.window);

  const out = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (hasSplit(a.sel) && hasSplit(b.sel)) continue;
      if (a.window.start < b.window.end && b.window.start < a.window.end) {
        out.add(a.perf.id);
        out.add(b.perf.id);
      }
    }
  }
  return out;
}

/** How a pick should read, given what it's competing with. */
export function planState(sel: Selection, contested: Set<string>): PlanState {
  if (sel.attendanceDecision === 'skipping') return 'skipping';
  if (sel.attendanceDecision === 'attending') return 'going';
  return contested.has(sel.performanceId) ? 'maybe' : 'going';
}

/**
 * What tapping the badge should do next. Uncontested picks toggle straight
 * between on and off the plan: offering "Maybe" there is a decision about
 * nothing, and it made the badge take two taps to show any change.
 */
export function nextDecision(
  state: PlanState,
  contested: boolean,
): Selection['attendanceDecision'] {
  if (state === 'skipping') return 'attending';
  if (state === 'maybe') return 'skipping';
  return contested ? 'undecided' : 'skipping';
}
