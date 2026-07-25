import type { Performance } from './types';
import { hhmmToMinutes, minutesToHHMM } from './time';

// End-time handling (spec §19). We never invent exact set lengths. A set's
// effective end is, in priority order:
//   1. exact endTime (user-entered)
//   2. estimated end (next set on the same stage, minus a turnover buffer)
//   3. unknown

export interface EffectiveEnd {
  /** Minutes since midnight, or null if unknown. */
  minutes: number | null;
  hhmm: string | null;
  kind: 'exact' | 'estimated' | 'unknown';
}

/**
 * Compute the effective end for a performance.
 * @param perf the performance in question
 * @param sameStageSameDay all performances sharing this stage AND day (incl. perf)
 * @param turnoverBuffer minutes to subtract from the next set's start
 */
export function effectiveEnd(
  perf: Performance,
  sameStageSameDay: Performance[],
  turnoverBuffer: number,
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
  // 2. Estimate from the next set on the same stage.
  if (perf.startTime) {
    const start = hhmmToMinutes(perf.startTime);
    const laterStarts = sameStageSameDay
      .filter((p) => p.id !== perf.id && p.startTime)
      .map((p) => hhmmToMinutes(p.startTime!))
      .filter((m) => m > start)
      .sort((a, b) => a - b);
    if (laterStarts.length) {
      const est = Math.max(start + 5, laterStarts[0] - turnoverBuffer);
      return { minutes: est, hhmm: minutesToHHMM(est), kind: 'estimated' };
    }
  }
  // 3. Unknown.
  return { minutes: null, hhmm: null, kind: 'unknown' };
}

// withEffectiveEnds is called per user per render across conflicts, meetups,
// positions and the map slider. The store replaces the performances array
// identity on every data change, so a WeakMap keyed on the array (plus the
// buffer value) makes repeat calls free without changing any call sites.
// Callers only read the returned map — it must never be mutated.
const endsCache = new WeakMap<Performance[], Map<number, Map<string, EffectiveEnd>>>();

/** The pure end-time calculation used by conflicts, schedule view, and meetups. */
export function withEffectiveEnds(
  performances: Performance[],
  turnoverBuffer: number,
): Map<string, EffectiveEnd> {
  let byBuffer = endsCache.get(performances);
  if (!byBuffer) {
    byBuffer = new Map();
    endsCache.set(performances, byBuffer);
  }
  const cached = byBuffer.get(turnoverBuffer);
  if (cached) return cached;
  const result = computeEffectiveEnds(performances, turnoverBuffer);
  byBuffer.set(turnoverBuffer, result);
  return result;
}

function computeEffectiveEnds(
  performances: Performance[],
  turnoverBuffer: number,
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
    out.set(p.id, effectiveEnd(p, group, turnoverBuffer));
  }
  return out;
}
