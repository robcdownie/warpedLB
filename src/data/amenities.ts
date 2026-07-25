import type { MapLocation } from '@/domain/types';

/**
 * Amenity pins transcribed from the festival map artwork.
 *
 * These were previously "added later via calibration mode" and never were, so
 * the Water / Restrooms / First Aid filters — the things people actually open
 * a festival map for — had nothing to show, and the break planner had nowhere
 * to send anyone.
 *
 * Positions are read off the map image by eye, so they are STARTER
 * coordinates: good enough to point you at the right corner of the site, not
 * survey-grade. Map Setup keeps the map flagged unverified until a human has
 * checked these against the official 2026 layout, and Calibration can drag any
 * of them.
 */

interface AmenitySeed {
  type: string;
  /** [xPercent, yPercent] pairs, one per pin of this type. */
  points: [number, number][];
}

const AMENITY_SEEDS: AmenitySeed[] = [
  { type: 'Water Stations', points: [[78.4, 42.5], [21.1, 63.6]] },
  { type: 'VIP Water Stations', points: [[72.6, 47.1]] },
  { type: 'Restrooms', points: [[74.4, 45.4], [43.6, 54.6], [44.5, 66.0]] },
  { type: 'VIP Restrooms', points: [[68.9, 51.1], [67.6, 52.8]] },
  { type: 'First Aid', points: [[43.9, 43.7], [87.4, 53.7], [17.4, 64.6]] },
  { type: 'Lockers', points: [[47.5, 41.9], [47.5, 60.4]] },
  { type: 'Food', points: [[26.5, 52.9], [62.6, 51.6], [72.9, 53.9], [11.9, 63.9], [60.2, 61.0]] },
  { type: 'Food Truck', points: [[65.3, 51.9], [70.9, 55.6], [87.7, 56.1]] },
  { type: 'Bar', points: [[50.6, 46.0], [24.1, 52.5], [77.5, 45.6], [28.1, 56.9], [14.5, 64.3], [57.3, 60.8], [70.8, 66.2]] },
  { type: 'VIP Bar', points: [[49.9, 40.2], [66.5, 49.6]] },
  { type: 'VIP Food', points: [[47.1, 45.8], [53.4, 40.7]] },
  { type: 'Warped Merch', points: [[39.5, 58.6]] },
  { type: 'General Store', points: [[42.4, 57.7]] },
  { type: 'Accessible Viewing', points: [[55.3, 44.4], [60.8, 47.9], [81.1, 47.1], [36.1, 56.2], [82.4, 61.9]] },
  { type: 'Charge Station', points: [[64.1, 53.7], [44.4, 61.7]] },
  { type: 'ID Check', points: [[49.0, 43.6], [31.9, 53.8], [26.2, 58.6], [49.4, 59.0]] },
  { type: 'Cash Exchange', points: [[29.2, 53.4], [52.5, 59.2]] },
  { type: 'Info', points: [[49.0, 62.3]] },
  { type: 'Lost & Found', points: [[50.9, 60.8]] },
  { type: 'Ticket Help', points: [[17.6, 52.9]] },
  { type: 'Box Office', points: [[6.8, 48.6]] },
  { type: 'Pit Stop', points: [[21.1, 49.8]] },
  { type: 'Consciousness Group', points: [[40.3, 43.9]] },
];

function slug(type: string): string {
  return type
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Stable ids (`restrooms-01`, `restrooms-02`, …) so calibrated positions and
 * shared coordinate codes survive across devices and app updates.
 */
export const AMENITY_LOCATIONS: MapLocation[] = AMENITY_SEEDS.flatMap((seed) =>
  seed.points.map((point, i) => ({
    id: `${slug(seed.type)}-${String(i + 1).padStart(2, '0')}`,
    // Multiple pins of a type need distinguishing in a list; the map itself
    // only ever shows the icon.
    name: seed.points.length > 1 ? `${seed.type} ${i + 1}` : seed.type,
    shortName: seed.type,
    category: 'amenity' as const,
    amenityType: seed.type,
    xPercent: point[0],
    yPercent: point[1],
  })),
);
