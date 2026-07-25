// Profile id generation. Unlike artist ids (src/domain/slug.ts) these must NOT
// be deterministic from the name — see newUserId for why.

import type { ColorKey } from './types';
import { slugify } from './slug';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Not cryptographic — this only has to make accidental collisions unlikely. */
function randomSuffix(len = 5): string {
  const out: string[] = [];
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(len);
    c.getRandomValues(bytes);
    for (const b of bytes) out.push(ALPHABET[b % ALPHABET.length]);
  } else {
    for (let i = 0; i < len; i++) {
      out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
    }
  }
  return out.join('');
}

/**
 * A profile id that will not collide with a profile created on another phone.
 *
 * The random suffix is load-bearing, not decoration. Ids travel inside share
 * codes, and importing a plan upserts by id and then REPLACES that id's
 * selections wholesale (see domain/share/importCommit.ts). So if two people in
 * one group were both called "Alex" and both got the bare slug `alex`,
 * importing the second one would silently destroy the first one's entire plan.
 *
 * The shape must satisfy ID_RE in domain/share/validate.ts —
 * /^[a-z0-9][a-z0-9-]{0,80}$/ — so: lowercase, no underscores, no leading
 * hyphen.
 */
export function newUserId(name: string, taken: Iterable<string> = []): string {
  const base = slugify(name).slice(0, 24).replace(/-+$/, '') || 'member';
  const used = new Set(taken);
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${base}-${randomSuffix()}`;
    if (!used.has(id)) return id;
  }
  // Effectively unreachable; still better than returning a known-taken id.
  return `member-${randomSuffix(12)}`;
}

/**
 * "Sam" → "S"; "Sam Lee" → "SL". A starting point the user can overwrite.
 *
 * Uses Array.from so a name starting with an emoji or astral character yields
 * that whole character rather than half a surrogate pair.
 */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = Array.from(parts[0])[0] ?? '';
  if (parts.length === 1) return first.toUpperCase();
  const last = Array.from(parts[parts.length - 1])[0] ?? '';
  return (first + last).toUpperCase();
}

/** The colour to offer a new profile: the first one nobody is using yet. */
export function nextFreeColor(taken: Iterable<ColorKey>, choices: ColorKey[]): ColorKey {
  const used = new Set(taken);
  return choices.find((c) => !used.has(c)) ?? choices[0];
}
