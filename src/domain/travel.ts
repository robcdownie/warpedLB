import type { MapLocation, CrowdDelay, TravelOverride } from './types';
import { CROWD_MULTIPLIER } from './settings';

// Approximate stage-to-stage walking estimates. The festival map has no
// guaranteed pedestrian network or precise scale, so these are deliberately
// labeled "approximate walking time" everywhere they surface (spec §27).
//
// Method: percentage distance on the map, made isotropic using the map image's
// aspect ratio, converted to minutes by a tuned constant, then scaled by the
// crowd-delay setting. Every pair is admin-overridable.

// Cropped festival-map.webp is 1320 x 1798 px. y% covers more pixels than x%,
// so scale y to keep distances geometrically honest.
export const MAP_ASPECT = 1798 / 1320; // ≈ 1.362

// Minutes per unit of x-equivalent percent distance (tuned so the spec's
// example pairs land right: Ghost→BeatBox ≈ 1-2 min, Ghost→Rex ≈ 6 min base).
const MIN_PER_PERCENT = 0.08;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Isotropic percentage distance between two map points. */
export function percentDistance(a: MapLocation, b: MapLocation): number {
  const dx = a.xPercent - b.xPercent;
  const dy = (a.yPercent - b.yPercent) * MAP_ASPECT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Base (light-crowd) minutes between two points, before crowd scaling. */
export function baseMinutes(a: MapLocation, b: MapLocation): number {
  return Math.max(1, Math.round(percentDistance(a, b) * MIN_PER_PERCENT));
}

export interface TravelResult {
  minutes: number;
  approximate: true;
  source: 'override' | 'estimated';
  /** False when a location was missing, so `minutes: 0` means "no idea". */
  known: boolean;
}

/**
 * Approximate walking minutes between two locations.
 * - An admin override is treated as the real, observed time (crowd already
 *   baked in) and returned as-is.
 * - Otherwise, base distance × crowd multiplier.
 */
export function travelMinutes(
  a: MapLocation | undefined,
  b: MapLocation | undefined,
  crowd: CrowdDelay,
  overrides: Map<string, TravelOverride>,
): TravelResult {
  // Same place is a genuine zero. A MISSING place is not — a stage that was
  // renamed or deleted used to produce a confident "leave by <set start>" with
  // a zero-minute walk, which is the most wrong the app can be while sounding
  // certain. Callers get `known: false` and can say so.
  if (a && b && a.id === b.id) {
    return { minutes: 0, approximate: true, source: 'estimated', known: true };
  }
  if (!a || !b) {
    return { minutes: 0, approximate: true, source: 'estimated', known: false };
  }
  const override = overrides.get(pairKey(a.id, b.id));
  if (override) {
    return { minutes: Math.max(0, override.minutes), approximate: true, source: 'override', known: true };
  }
  const base = baseMinutes(a, b);
  const minutes = Math.max(1, Math.round(base * CROWD_MULTIPLIER[crowd]));
  return { minutes, approximate: true, source: 'estimated', known: true };
}

/** Build a Map keyed by pairKey for quick override lookup. */
export function overrideMap(overrides: TravelOverride[]): Map<string, TravelOverride> {
  return new Map(overrides.map((o) => [o.pairKey, o]));
}

/** Full stage-to-stage matrix (for the Travel settings screen). */
export function stageMatrix(
  stages: MapLocation[],
  crowd: CrowdDelay,
  overrides: TravelOverride[],
): { from: MapLocation; to: MapLocation; minutes: number; source: TravelResult['source'] }[] {
  const omap = overrideMap(overrides);
  const out: { from: MapLocation; to: MapLocation; minutes: number; source: TravelResult['source'] }[] = [];
  for (let i = 0; i < stages.length; i++) {
    for (let j = i + 1; j < stages.length; j++) {
      const r = travelMinutes(stages[i], stages[j], crowd, omap);
      out.push({ from: stages[i], to: stages[j], minutes: r.minutes, source: r.source });
    }
  }
  return out;
}
