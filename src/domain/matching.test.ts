import { describe, it, expect } from 'vitest';
import { matchArtist, normalizeName } from './matching';
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
