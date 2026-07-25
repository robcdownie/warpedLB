import type { ColorKey } from '@/domain/types';

/**
 * There is deliberately NO seeded roster. This app ships with zero profiles and
 * the first-run flow creates one, because a seeded list would mean every fresh
 * install starts out claiming to be somebody who isn't holding the phone — and
 * anything starred before the user identified themselves would be filed under a
 * stranger's name.
 *
 * People are added in-app (first run, or Menu → Friends & Sharing), or arrive
 * automatically when you import someone's plan code.
 */

/** Colour options offered in the profile editor, in this order. */
export const COLOR_CHOICES: ColorKey[] = ['pink', 'blue', 'orange', 'teal', 'yellow', 'purple'];

/** Tailwind-independent color values per colorKey (for avatars, markers, accents). */
export const COLOR_VALUES: Record<string, { bg: string; ring: string; text: string }> = {
  pink: { bg: '#ff2d78', ring: '#ff2d78', text: '#ffffff' },
  blue: { bg: '#2f66c4', ring: '#2f66c4', text: '#ffffff' },
  orange: { bg: '#ff7a1a', ring: '#ff7a1a', text: '#ffffff' },
  teal: { bg: '#17b3a3', ring: '#17b3a3', text: '#ffffff' },
  yellow: { bg: '#ffd21e', ring: '#e8b800', text: '#0a0f1c' },
  purple: { bg: '#8b5cf6', ring: '#8b5cf6', text: '#ffffff' },
};
