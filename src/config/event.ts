// Event configuration — spec §2. Do not display fictional schedule data in production.

export const EVENT = {
  id: 'warped-long-beach-2026',
  name: 'Vans Warped Tour Long Beach',
  venue: 'Shoreline Waterfront',
  address: '386 East Shoreline Drive, Long Beach, CA 90802',
  timezone: 'America/Los_Angeles',
  festivalHours: {
    opens: '11:00',
    closes: '22:00',
  },
  days: [
    { id: 'saturday', label: 'Saturday', date: '2026-07-25' },
    { id: 'sunday', label: 'Sunday', date: '2026-07-26' },
  ],
} as const;

export type EventDay = (typeof EVENT.days)[number];

export const APP_NAME = 'Warped LB Companion';
export const APP_DISCLAIMER =
  'Unofficial fan-made app. Not affiliated with, endorsed by, or connected to Vans, Vans Warped Tour, or the venue. Set times are entered by you or imported from a code — always check the official board.';

/**
 * Location id of the festival entrance (see src/data/locations.ts). Used as the
 * origin/fallback point for travel math before a first set or without a stage.
 */
export const ENTRANCE_LOCATION_ID = 'shoreline-village-drive-entrance';

/** Base path used for asset URLs (matches vite base + PWA scope). */
export const BASE_URL = import.meta.env.BASE_URL;

export const MAP_IMAGE_URL = `${BASE_URL}map/festival-map.webp`;

/** Illustration set, all offline-bundled + precached. */
export const ART = {
  hero: `${BASE_URL}art/hero.webp`,
  emptyGroup: `${BASE_URL}art/empty-group.webp`,
  emptySchedule: `${BASE_URL}art/empty-schedule.webp`,
  emptyMap: `${BASE_URL}art/empty-map.webp`,
  emptyBands: `${BASE_URL}art/empty-bands.webp`,
  emptyTimeline: `${BASE_URL}art/empty-timeline.webp`,
  emptyShared: `${BASE_URL}art/empty-shared.webp`,
  noConflicts: `${BASE_URL}art/no-conflicts.webp`,
} as const;
