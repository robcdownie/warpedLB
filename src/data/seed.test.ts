import { describe, it, expect } from 'vitest';
import { buildSeed } from './seed';
import { SATURDAY_ARTISTS } from './artists-saturday';
import { SUNDAY_ARTISTS } from './artists-sunday';
import { UNPLUGGED_APPEARANCES } from './artists-unplugged';

describe('seed data integrity (spec §33)', () => {
  const { artists, performances } = buildSeed();

  it('every main artist appears exactly once per day (acceptance §13-14)', () => {
    const satMain = performances.filter((p) => p.type === 'main' && p.day === 'saturday');
    const sunMain = performances.filter((p) => p.type === 'main' && p.day === 'sunday');
    expect(satMain).toHaveLength(SATURDAY_ARTISTS.length);
    expect(sunMain).toHaveLength(SUNDAY_ARTISTS.length);
    // unique performance ids
    expect(new Set(performances.map((p) => p.id)).size).toBe(performances.length);
  });

  it('no duplicate main performance for the same artist+day', () => {
    const seen = new Set<string>();
    for (const p of performances.filter((x) => x.type === 'main')) {
      const key = `${p.artistId}:${p.day}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('Unplugged appearances do NOT duplicate artist records (acceptance §17)', () => {
    // Artists shared between main + unplugged reuse one artist record.
    const ids = artists.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every unplugged performance references an existing artist.
    const artistIds = new Set(ids);
    for (const p of performances.filter((x) => x.type === 'unplugged')) {
      expect(artistIds.has(p.artistId)).toBe(true);
      expect(p.stageId).toBe('warped-unplugged-stage');
      expect(p.day).toBeNull();
    }
    expect(performances.filter((p) => p.type === 'unplugged')).toHaveLength(
      UNPLUGGED_APPEARANCES.length,
    );
  });

  it('shared performers (e.g. Hawthorne Heights) have both main and unplugged performances', () => {
    const hawthorne = artists.find((a) => a.name === 'Hawthorne Heights');
    expect(hawthorne).toBeDefined();
    const perfs = performances.filter((p) => p.artistId === hawthorne!.id);
    expect(perfs.some((p) => p.type === 'main')).toBe(true);
    expect(perfs.some((p) => p.type === 'unplugged')).toBe(true);
  });

  it('all main performances start time-pending with no stage/time', () => {
    for (const p of performances.filter((x) => x.type === 'main')) {
      expect(p.scheduleStatus).toBe('time-pending');
      expect(p.startTime).toBeNull();
      expect(p.stageId).toBeNull();
    }
  });
});
