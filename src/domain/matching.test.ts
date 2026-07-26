import { describe, it, expect } from 'vitest';
import { matchArtist, normalizeName, rankArtists, nearArtists } from './matching';
import type { Artist } from './types';

const artists: Artist[] = [
  { id: '3oh3', name: '3OH!3', searchAliases: [], category: 'main-lineup' },
  { id: 'lolo', name: 'LØLØ', searchAliases: [], category: 'main-lineup' },
  { id: 'mxpx', name: 'MxPx', searchAliases: [], category: 'main-lineup' },
  { id: 'taking-back-sunday', name: 'Taking Back Sunday', searchAliases: [], category: 'main-lineup' },
];

describe('artist matching (spec §33)', () => {
  it('normalizes punctuation, case, spaces, diacritics', () => {
    expect(normalizeName('3OH!3')).toBe('3oh3');
    expect(normalizeName('Taking Back Sunday ')).toBe('takingbacksunday');
    expect(normalizeName('LØLØ')).toBe('lolo');
  });

  it('“3OH3” suggests “3OH!3”', () => {
    const r = matchArtist('3OH3', artists);
    expect(r.exact?.name).toBe('3OH!3');
  });

  it('trailing space matches exactly', () => {
    const r = matchArtist('Taking Back Sunday ', artists);
    expect(r.exact?.name).toBe('Taking Back Sunday');
  });

  it('“Lolo” resolves to “LØLØ”', () => {
    const r = matchArtist('Lolo', artists);
    expect(r.exact?.name).toBe('LØLØ');
  });

  it('“MXPX” matches “MxPx”', () => {
    const r = matchArtist('MXPX', artists);
    expect(r.exact?.name).toBe('MxPx');
  });

  it('offers near-match suggestions when no exact hit', () => {
    const r = matchArtist('Takng Back Sunday', artists);
    expect(r.exact).toBeUndefined();
    expect(r.suggestions[0]?.artist.name).toBe('Taking Back Sunday');
  });
});

// Board-entry ranking. The failure this guards against: typing a few letters
// off a wall board, hitting Go, and silently filing the wrong band.
const boardArtists: Artist[] = [
  { id: 'escape-the-fate', name: 'Escape the Fate', searchAliases: [], category: 'main-lineup' },
  { id: 'the-story-so-far', name: 'The Story So Far', searchAliases: [], category: 'main-lineup' },
  { id: 'the-devil-wears-prada', name: 'The Devil Wears Prada', searchAliases: [], category: 'main-lineup' },
  { id: 'dance-gavin-dance', name: 'Dance Gavin Dance', searchAliases: [], category: 'main-lineup' },
  { id: 'underoath', name: 'Underoath', searchAliases: [], category: 'main-lineup' },
];

describe('board search ranking', () => {
  it('puts a name that starts with the query above one that merely contains it', () => {
    const r = rankArtists('the', boardArtists);
    // "Escape the Fate" is alphabetically first and used to win.
    expect(r[0].artist.name).toBe('The Story So Far');
    expect(r.map((x) => x.artist.name)).toContain('Escape the Fate');
    expect(r[0].score).toBe(0);
  });

  it('ranks a word-start match above a mid-word one', () => {
    const r = rankArtists('story', boardArtists);
    expect(r[0].artist.name).toBe('The Story So Far');
  });

  it('scores an unambiguous prefix as 0 so Enter can commit it', () => {
    const r = rankArtists('undero', boardArtists);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(0);
  });

  it('finds a partial name misread off the board', () => {
    // Whole-name distance never catches this: "dansegavin" vs
    // "dancegavindance" is 5 apart. Against the same-length prefix it's 1.
    expect(nearArtists('danse gavin', boardArtists)[0]?.name).toBe('Dance Gavin Dance');
  });

  it('still catches a single wrong letter in a full name', () => {
    expect(nearArtists('underoth', boardArtists)[0]?.name).toBe('Underoath');
  });

  it('does not guess from one or two letters', () => {
    expect(nearArtists('un', boardArtists)).toEqual([]);
  });
});
