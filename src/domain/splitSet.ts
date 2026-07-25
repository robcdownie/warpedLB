import type { Performance, Selection, MapLocation, CrowdDelay, TravelOverride } from './types';
import type { EffectiveEnd } from './endTimes';
import { travelMinutes } from './travel';
import { hhmmToMinutes } from './time';

/**
 * Split-set planning (add-on §3).
 *
 * "Choose one" is stricter than how people actually do festivals — catching
 * the first half of one band and the back half of another is normal. A split
 * plan stores how many minutes late you arrive and how many you cut off the
 * end, so conflicts, positions and leave-by times all reflect the real plan
 * instead of a decision the user never made.
 */

export interface AttendWindow {
  /** Minutes since midnight the person actually plans to be there. */
  start: number;
  end: number;
  /** True when the person is deliberately not there for the whole set. */
  partial: boolean;
}

/** The window a person plans to attend, honoring any split-set trims. */
export function attendWindow(
  perf: Performance,
  sel: Selection | undefined,
  end: EffectiveEnd,
): AttendWindow | null {
  if (!perf.startTime) return null;
  const rawStart = hhmmToMinutes(perf.startTime);
  const rawEnd = end.minutes ?? rawStart + 30;
  const late = Math.max(0, sel?.arriveLateMinutes ?? 0);
  const early = Math.max(0, sel?.leaveEarlyMinutes ?? 0);
  const start = Math.min(rawStart + late, rawEnd);
  const stop = Math.max(rawEnd - early, start);
  return { start, end: stop, partial: late > 0 || early > 0 };
}

/** Shortest stay that still counts as seeing a band rather than passing it. */
export const MIN_STAY_MINUTES = 10;

export interface SplitPlan {
  /** Performance attended first (the one you leave early). */
  firstId: string;
  /** Performance attended second (the one you arrive late to). */
  secondId: string;
  /** Wall-clock minute the user walks away from the first set. */
  switchMinute: number;
  /** Wall-clock minute they arrive at the second. */
  arriveMinute: number;
  walkMinutes: number;
  leaveEarlyMinutes: number;
  arriveLateMinutes: number;
  /** Minutes actually spent at each set under this plan. */
  firstMinutes: number;
  secondMinutes: number;
}

/**
 * Propose a split for two overlapping sets. The switch point aims for the
 * middle of the overlap so neither band gets a token appearance, then backs
 * out the walk so the arrival time is honest.
 */
export function suggestSplit(
  a: { perf: Performance; end: EffectiveEnd; stage?: MapLocation },
  b: { perf: Performance; end: EffectiveEnd; stage?: MapLocation },
  crowd: CrowdDelay,
  overrides: Map<string, TravelOverride>,
): SplitPlan | null {
  if (!a.perf.startTime || !b.perf.startTime) return null;
  // Whoever starts first is the one you leave early.
  const [first, second] =
    hhmmToMinutes(a.perf.startTime) <= hhmmToMinutes(b.perf.startTime) ? [a, b] : [b, a];

  const fStart = hhmmToMinutes(first.perf.startTime!);
  const fEnd = first.end.minutes ?? fStart + 30;
  const sStart = hhmmToMinutes(second.perf.startTime!);
  const sEnd = second.end.minutes ?? sStart + 30;

  const walk = travelMinutes(first.stage, second.stage, crowd, overrides).minutes;

  // Overlap region; without one there's nothing to split.
  const overlapStart = Math.max(fStart, sStart);
  const overlapEnd = Math.min(fEnd, sEnd);
  if (overlapEnd <= overlapStart) return null;

  let switchMinute = Math.round((overlapStart + overlapEnd) / 2);
  // Both halves must be worth showing up for. Below this a "split" is really
  // a long walk with two cameo appearances, and the honest answer is that
  // these two can't be combined.
  switchMinute = Math.max(switchMinute, fStart + MIN_STAY_MINUTES);
  switchMinute = Math.min(switchMinute, fEnd, sEnd - walk - MIN_STAY_MINUTES);
  if (switchMinute < fStart + MIN_STAY_MINUTES) return null;

  const arriveMinute = switchMinute + walk;
  if (sEnd - arriveMinute < MIN_STAY_MINUTES) return null;

  return {
    firstId: first.perf.id,
    secondId: second.perf.id,
    switchMinute,
    arriveMinute,
    walkMinutes: walk,
    leaveEarlyMinutes: Math.max(0, fEnd - switchMinute),
    arriveLateMinutes: Math.max(0, arriveMinute - sStart),
    firstMinutes: Math.max(0, switchMinute - fStart),
    secondMinutes: Math.max(0, sEnd - arriveMinute),
  };
}

export function hasSplit(sel: Selection | undefined): boolean {
  return !!sel && ((sel.arriveLateMinutes ?? 0) > 0 || (sel.leaveEarlyMinutes ?? 0) > 0);
}
