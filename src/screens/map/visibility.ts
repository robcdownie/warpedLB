import type { MapLocation } from '@/domain/types';
import { AMENITY_FILTER_GROUPS, type FilterKey } from './markerMeta';

// Decide whether a location should be visible given the active filter set.
// Empty filter set = show stages + named landmarks (the useful default), but not
// every amenity pin (keeps the map readable).

const CATEGORY_FILTER: Partial<Record<MapLocation['category'], FilterKey>> = {
  stage: 'stages',
  entrance: 'entrances',
  experience: 'experiences',
  'extreme-sports': 'extreme',
  bar: 'bars',
  sponsor: 'sponsor',
  vendor: 'vendors',
  custom: 'custom',
};

export function locationVisible(
  loc: MapLocation,
  active: Set<FilterKey>,
  selectedStageIds: Set<string>,
): boolean {
  // "My sets" highlights stages hosting a selected band.
  if (active.has('selected') && loc.category === 'stage' && selectedStageIds.has(loc.id)) {
    return true;
  }

  if (active.size === 0) {
    // Default view: just the orientation anchors — stages + entrances.
    // Everything else (vendors, bars, sponsors, amenities) is opt-in via the
    // filter chips; showing them all by default buries the map in pins.
    return loc.category === 'stage' || loc.category === 'entrance';
  }

  // Category-based filters.
  const catFilter = CATEGORY_FILTER[loc.category];
  if (catFilter && active.has(catFilter)) return true;

  // 'service' has no dedicated chip; show under experiences fallback.
  if (loc.category === 'service' && active.has('experiences')) return true;

  // Amenity filters.
  if (loc.category === 'amenity' && loc.amenityType) {
    for (const key of active) {
      const group = AMENITY_FILTER_GROUPS[key];
      if (group && group.includes(loc.amenityType)) return true;
    }
  }

  return false;
}

/** Stages that host at least one selected+scheduled band for any user. */
export function stagesWithSelections(
  selections: { performanceId: string; selected: boolean }[],
  performanceById: Map<string, { stageId: string | null }>,
): Set<string> {
  const out = new Set<string>();
  for (const s of selections) {
    if (!s.selected) continue;
    const stage = performanceById.get(s.performanceId)?.stageId;
    if (stage) out.add(stage);
  }
  return out;
}
