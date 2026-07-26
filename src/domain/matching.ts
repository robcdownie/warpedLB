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

export interface RankedArtist {
  artist: Artist;
  /** 0 = name starts with the query, 1 = a word starts with it, 2 = contains it. */
  score: number;
}

/** The words of a name, normalized individually (so spaces still count). */
function wordStarts(name: string): string[] {
  return name
    .split(/[\s/&+,–—-]+/)
    .map((w) => normalizeName(w))
    .filter(Boolean);
}

function matchScore(q: string, a: Artist): number | null {
  let best: number | null = null;
  for (const n of [a.name, ...a.searchAliases]) {
    const norm = normalizeName(n);
    let s: number | null = null;
    if (norm.startsWith(q)) s = 0;
    else if (wordStarts(n).some((w) => w.startsWith(q))) s = 1;
    else if (norm.includes(q)) s = 2;
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

/**
 * Rank artists for the board's band field, best match first.
 *
 * Plain substring order put "Escape the Fate" above "The Story So Far" for the
 * query "the" — alphabetically first, and one keystroke from being committed
 * to the wrong slot. A name that STARTS with what you typed is nearly always
 * the one you're reading off the board.
 */
export function rankArtists(query: string, artists: Artist[]): RankedArtist[] {
  const q = normalizeName(query);
  if (!q) return [];
  const out: RankedArtist[] = [];
  for (const artist of artists) {
    const score = matchScore(q, artist);
    if (score !== null) out.push({ artist, score });
  }
  return out.sort(
    (x, y) =>
      x.score - y.score ||
      x.artist.name.length - y.artist.name.length ||
      x.artist.name.localeCompare(y.artist.name),
  );
}

/**
 * Near-matches for a name misread off a board in the sun. Compares against the
 * same-length *prefix* of each name, because the real failure is a partial name
 * plus a wrong letter ("danse gavin"), which whole-name distance never catches.
 */
export function nearArtists(query: string, artists: Artist[]): Artist[] {
  const q = normalizeName(query);
  if (q.length < 3) return [];
  const tolerance = q.length > 6 ? 2 : 1;
  return artists
    .map((artist) => ({
      artist,
      distance: levenshtein(q, normalizeName(artist.name).slice(0, q.length)),
    }))
    .filter((x) => x.distance <= tolerance)
    .sort((x, y) => x.distance - y.distance || x.artist.name.localeCompare(y.artist.name))
    .map((x) => x.artist);
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
