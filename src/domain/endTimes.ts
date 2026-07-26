import type { Performance } from './types';
import { hhmmToMinutes, minutesToHHMM } from './time';

// End-time handling (spec §19). We never invent an *exact* set length, but a
// missing end still has to produce a sane window. Stretching a set to the next
// band on its stage was wrong in the common case: the board is entered a column
// at a time, so a 1:00 set with nothing after it until 5:00 read as a four-hour
// set and collided with everything in between.
//
// A set's effective end is, in priority order:
//   1. exact endTime (user-entered)
//   2. estimated end (next set on the same stage, minus a turnover buffer) —
//      but only when that lands sooner than a typical set would
//   3. assumed end (start + a typical set length)
//   4. unknown (no start time to work from)

/**
 * Warped sets run about half an hour. The board lists start times only, so this
 * is the working assumption behind every overlap the app reports — it is never
 * written to a performance and never presented as an exact time.
 */
export const TYPICAL_SET_MINUTES = 30;

export interface EffectiveEnd {
  /** Minutes since midnight, or null if unknown. */
  minutes: number | null;
  hhmm: string | null;
  kind: 'exact' | 'estimated' | 'assumed' | 'unknown';
}

/**
 * Compute the effective end for a performance.
 * @param perf the performance in question
 * @param sameStageSameDay all performances sharing this stage AND day (incl. perf)
 * @param turnoverBuffer minutes to subtract from the next set's start
 * @param typicalSetLength fallback set length when nothing better is known
 */
export function effectiveEnd(
  perf: Performance,
  sameStageSameDay: Performance[],
  turnoverBuffer: number,
  typicalSetLength: number = TYPICAL_SET_MINUTES,
): EffectiveEnd {
  // 1. Exact end wins and is never overwritten.
  if (perf.endTime) {
    return { minutes: hhmmToMinutes(perf.endTime), hhmm: perf.endTime, kind: 'exact' };
  }
  // A stored estimatedEndTime (previously computed / manually corrected).
  if (perf.estimatedEndTime) {
    return {
      minutes: hhmmToMinutes(perf.estimatedEndTime),
      hhmm: perf.estimatedEndTime,
      kind: 'estimated',
    };
  }
  if (perf.startTime) {
    const start = hhmmToMinutes(perf.startTime);
    const assumed = start + typicalSetLength;
    // 2. The next set on the same stage, when it caps the set *shorter* than a
    //    typical one. A later next-set says nothing — the stage is just idle,
    //    or that column of the board isn't filled in yet.
    const laterStarts = sameStageSameDay
      .filter((p) => p.id !== perf.id && p.startTime)
      .map((p) => hhmmToMinutes(p.startTime!))
      .filter((m) => m > start)
      .sort((a, b) => a - b);
    if (laterStarts.length) {
      const est = Math.max(start + 5, laterStarts[0] - turnoverBuffer);
      if (est < assumed) return { minutes: est, hhmm: minutesToHHMM(est), kind: 'estimated' };
    }
    // 3. Assume a typical set.
    return { minutes: assumed, hhmm: minutesToHHMM(assumed), kind: 'assumed' };
  }
  // 4. No start time — nothing to work from.
  return { minutes: null, hhmm: null, kind: 'unknown' };
}

// withEffectiveEnds is called per user per render across conflicts, meetups,
// positions and the map slider. The store replaces the performances array
// identity on every data change, so a WeakMap keyed on the array (plus the
// buffer value) makes repeat calls free without changing any call sites.
// Callers only read the returned map — it must never be mutated.
const endsCache = new WeakMap<Performance[], Map<string, Map<string, EffectiveEnd>>>();

/** The pure end-time calculation used by conflicts, schedule view, and meetups. */
export function withEffectiveEnds(
  performances: Performance[],
  turnoverBuffer: number,
  typicalSetLength: number = TYPICAL_SET_MINUTES,
): Map<string, EffectiveEnd> {
  let bySettings = endsCache.get(performances);
  if (!bySettings) {
    bySettings = new Map();
    endsCache.set(performances, bySettings);
  }
  const key = `${turnoverBuffer}:${typicalSetLength}`;
  const cached = bySettings.get(key);
  if (cached) return cached;
  const result = computeEffectiveEnds(performances, turnoverBuffer, typicalSetLength);
  bySettings.set(key, result);
  return result;
}

function computeEffectiveEnds(
  performances: Performance[],
  turnoverBuffer: number,
  typicalSetLength: number,
): Map<string, EffectiveEnd> {
  const byStageDay = new Map<string, Performance[]>();
  for (const p of performances) {
    if (!p.stageId || !p.day) continue;
    const key = `${p.stageId}::${p.day}`;
    const arr = byStageDay.get(key) ?? [];
    arr.push(p);
    byStageDay.set(key, arr);
  }
  const out = new Map<string, EffectiveEnd>();
  for (const p of performances) {
    const key = p.stageId && p.day ? `${p.stageId}::${p.day}` : '';
    const group = byStageDay.get(key) ?? [p];
    out.set(p.id, effectiveEnd(p, group, turnoverBuffer, typicalSetLength));
  }
  return out;
}
