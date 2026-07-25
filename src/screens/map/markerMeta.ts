import type { LocationCategory } from '@/domain/types';

// Visual metadata for map markers: color + short glyph per category. Colors are
// chosen to stay distinct in sunlight and are paired with text labels so meaning
// never depends on color alone (accessibility, spec §36).

export interface CategoryStyle {
  color: string;
  label: string;
}

export const CATEGORY_STYLE: Record<LocationCategory, CategoryStyle> = {
  stage: { color: '#1f5fa8', label: 'Stage' },
  entrance: { color: '#0a7d5a', label: 'Entrance' },
  experience: { color: '#8b5cf6', label: 'Experience' },
  'extreme-sports': { color: '#ff7a1a', label: 'Extreme' },
  bar: { color: '#b45309', label: 'Bar' },
  sponsor: { color: '#0891b2', label: 'Sponsor' },
  service: { color: '#475569', label: 'Service' },
  vendor: { color: '#be185d', label: 'Vendor' },
  amenity: { color: '#334155', label: 'Amenity' },
  custom: { color: '#e8b800', label: 'Custom' },
};

// Amenity legend type → color (spec §16). Falls back to the generic amenity color.
export const AMENITY_STYLE: Record<string, string> = {
  'First Aid': '#dc2626',
  Restrooms: '#2563eb',
  'VIP Restrooms': '#7c3aed',
  Food: '#ea580c',
  'Food Truck': '#ea580c',
  'VIP Food': '#7c3aed',
  'VIP Food Truck': '#7c3aed',
  Bar: '#b45309',
  'VIP Bar': '#7c3aed',
  'Water Stations': '#0891b2',
  'VIP Water Stations': '#0e7490',
  Lockers: '#0d9488',
  'VIP Lockers': '#7c3aed',
  'Charge Station': '#16a34a',
  Info: '#2563eb',
  'Lost & Found': '#d97706',
  'ID Check': '#0d9488',
  'Ticket Help': '#2563eb',
  'Box Office': '#475569',
  'Cash Exchange': '#16a34a',
  'Accessible Viewing': '#2563eb',
  'Warped Merch': '#be185d',
  'General Store': '#be185d',
  'Vendor Village': '#be185d',
  'Pit Stop': '#334155',
  Inflatable: '#8b5cf6',
  'Consciousness Group': '#8b5cf6',
  'VIP Concierge': '#7c3aed',
  'VIP Upgrade': '#7c3aed',
};

export function amenityColor(type?: string): string {
  if (type && AMENITY_STYLE[type]) return AMENITY_STYLE[type];
  return CATEGORY_STYLE.amenity.color;
}

// Filter keys shown in the map filter bar (spec §30).
export type FilterKey =
  | 'friends'
  | 'stages'
  | 'selected'
  | 'food'
  | 'bars'
  | 'water'
  | 'restrooms'
  | 'firstaid'
  | 'lockers'
  | 'merch'
  | 'accessibility'
  | 'vip'
  | 'entrances'
  | 'experiences'
  | 'extreme'
  | 'vendors'
  | 'sponsor'
  | 'custom';

export const FILTER_LABELS: Record<FilterKey, string> = {
  friends: 'Friends',
  stages: 'Stages',
  selected: 'My sets',
  food: 'Food',
  bars: 'Bars',
  water: 'Water',
  restrooms: 'Restrooms',
  firstaid: 'First Aid',
  lockers: 'Lockers',
  merch: 'Merch',
  accessibility: 'Accessible',
  vip: 'VIP',
  entrances: 'Entrances',
  experiences: 'Experiences',
  extreme: 'Extreme',
  vendors: 'Vendors',
  sponsor: 'Sponsors',
  custom: 'Custom',
};

/** Amenity legend types grouped under each amenity filter key. */
export const AMENITY_FILTER_GROUPS: Partial<Record<FilterKey, string[]>> = {
  food: ['Food', 'Food Truck', 'VIP Food', 'VIP Food Truck'],
  water: ['Water Stations', 'VIP Water Stations'],
  restrooms: ['Restrooms', 'VIP Restrooms'],
  firstaid: ['First Aid'],
  lockers: ['Lockers', 'VIP Lockers'],
  merch: ['Warped Merch', 'General Store', 'Vendor Village'],
  accessibility: ['Accessible Viewing'],
  vip: [
    'VIP Bar', 'VIP Food', 'VIP Concierge', 'VIP Restrooms', 'VIP Food Truck',
    'VIP Lockers', 'VIP Upgrade', 'VIP Water Stations',
  ],
};
