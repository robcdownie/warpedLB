import type { Artist } from './types';

// Fuzzy artist-name matching (spec §33). Ignores capitalization, accidental
// spaces, and common punctuation differences. Preserves the canonical display
// name once matched. Used for import review and data validation.

/** Explicit alias map for tricky cases from the spec. */
const ALIASES: Record<string, string> = {
  '3oh3': '3OH!3',
  lolo: 'LØLØ',
  mxpx: 'MxPx',
  'lo spirit': 'Lø Spirit',
};

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') // strip all punctuation & spaces
    .trim();
}

/** Levenshtein distance (capped for performance). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 0; i < a.length; i++) {
    cur[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur[j + 1] = Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export interface MatchResult {
  /** Exact (after normalization) canonical artist, if any. */
  exact?: Artist;
  /** Ranked near-matches (closest first) when no exact match. */
  suggestions: { artist: Artist; distance: number }[];
}

/** Match an arbitrary input name against the canonical artist list. */
export function matchArtist(input: string, artists: Artist[]): MatchResult {
  const norm = normalizeName(input);

  // Alias table first.
  const aliasTarget = ALIASES[norm];
  if (aliasTarget) {
    const a = artists.find((x) => x.name === aliasTarget);
    if (a) return { exact: a, suggestions: [] };
  }

  // Exact normalized match (also checks searchAliases).
  const exact = artists.find(
    (a) =>
      normalizeName(a.name) === norm ||
      a.searchAliases.some((al) => normalizeName(al) === norm),
  );
  if (exact) return { exact, suggestions: [] };

  // Near matches by edit distance on normalized names.
  const scored = artists
    .map((a) => ({ artist: a, distance: levenshtein(norm, normalizeName(a.name)) }))
    .filter((s) => s.distance <= 2)
    .sort((x, y) => x.distance - y.distance)
    .slice(0, 5);

  return { suggestions: scored };
}

/** Case/space/punct-insensitive filter for the band search box. */
export function searchArtists(query: string, artists: Artist[]): Set<string> {
  const q = normalizeName(query);
  if (!q) return new Set(artists.map((a) => a.id));
  const ids = new Set<string>();
  for (const a of artists) {
    if (
      normalizeName(a.name).includes(q) ||
      a.searchAliases.some((al) => normalizeName(al).includes(q))
    ) {
      ids.add(a.id);
    }
  }
  return ids;
}
