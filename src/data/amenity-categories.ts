// Amenity categories shown in the map legend (spec §16).
// Individual amenity pins are added later via calibration mode; each gets a
// unique id like "restroom-01". These are the legend types the app supports.

export const AMENITY_CATEGORIES: string[] = [
  'Accessible Viewing',
  'Bar',
  'Box Office',
  'Cash Exchange',
  'Consciousness Group',
  'Charge Station',
  'First Aid',
  'General Store',
  'Food',
  'Food Truck',
  'ID Check',
  'Inflatable',
  'Info',
  'Lost & Found',
  'Lockers',
  'Pit Stop',
  'Restrooms',
  'Ticket Help',
  'Vendor Village',
  'VIP Bar',
  'VIP Food',
  'VIP Concierge',
  'VIP Restrooms',
  'VIP Food Truck',
  'VIP Lockers',
  'VIP Upgrade',
  'VIP Water Stations',
  'Water Stations',
  'Warped Merch',
];

/** Short id prefix used when creating repeated amenity pins. */
export function amenitySlug(type: string): string {
  return type
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
