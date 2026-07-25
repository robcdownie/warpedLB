import { describe, it, expect } from 'vitest';
import { validateEnvelope, validateRawCode, LIMITS, type ValidationContext } from './validate';
import type { Envelope } from './codec';
import { EVENT } from '@/config/event';

const ctx: ValidationContext = {
  knownPerformanceIds: new Set(['main-sat-a', 'main-sat-b']),
  knownStageIds: new Set(['ghost-stage', 'rex-stage']),
  knownLocationIds: new Set(['ghost-stage', 'rex-stage', 'charity-circle']),
  now: new Date('2026-07-25T12:00:00-07:00'),
};

function env<T>(type: Envelope['type'], data: T, patch: Partial<Envelope> = {}): Envelope {
  return {
    v: 1,
    event: EVENT.id,
    type,
    source: 'member-1',
    exportedAt: '2026-07-25T11:00:00-07:00',
    checksum: 'deadbeef',
    data,
    ...patch,
  };
}

const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe('payload validation (plan §P0-8)', () => {
  it('accepts a well-formed selections payload', () => {
    const r = validateEnvelope(
      env('selections', { u: 'member-2', n: 'Sam', i: 'S', c: 'pink', s: [['main-sat-a', 0, 1]] }),
      ctx,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown stage in a schedule rather than importing it', () => {
    const r = validateEnvelope(
      env('schedule', { p: [['main-sat-a', 'mystery-stage', '15:00', null]] }),
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('unknown-stage');
    expect(r.errors[0].message).toMatch(/unknown stage and cannot be imported/i);
  });

  it('rejects times that are not real clock times', () => {
    const r = validateEnvelope(
      env('schedule', { p: [['main-sat-a', 'ghost-stage', '25:99', null]] }),
      ctx,
    );
    expect(codes(r)).toContain('bad-time');
  });

  it('rejects a set that ends before it starts', () => {
    const r = validateEnvelope(
      env('schedule', { p: [['main-sat-a', 'ghost-stage', '16:00', '15:00']] }),
      ctx,
    );
    expect(codes(r)).toContain('end-before-start');
  });

  it('warns about unknown sets but still allows the import', () => {
    const r = validateEnvelope(
      env('schedule', { p: [['main-sat-a', 'ghost-stage', '15:00', null], ['ghost-set', null, '16:00', null]] }),
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('unknown-performances');
  });

  it('rejects a selections payload where NOTHING matches this lineup', () => {
    const r = validateEnvelope(
      env('selections', { u: 'member-2', n: 'Sam', i: 'S', c: 'pink', s: [['other-event-set', 0, 0]] }),
      ctx,
    );
    expect(codes(r)).toContain('all-performances-unknown');
  });

  it('rejects an oversized avatar', () => {
    const r = validateEnvelope(
      env('selections', {
        u: 'member-2', n: 'Sam', i: 'S', c: 'pink',
        a: 'x'.repeat(LIMITS.maxAvatarChars + 1),
        s: [['main-sat-a', 0, 0]],
      }),
      ctx,
    );
    expect(codes(r)).toContain('avatar-too-large');
  });

  it('rejects an implausible number of picks', () => {
    const s = Array.from({ length: LIMITS.maxSelections + 1 }, () => ['main-sat-a', 0, 0]);
    const r = validateEnvelope(env('selections', { u: 'member-2', n: 'Sam', i: 'S', c: 'pink', s }), ctx);
    expect(codes(r)).toContain('too-many-selections');
  });

  it('rejects an unusable profile id', () => {
    const r = validateEnvelope(
      env('selections', { u: '../../etc', n: 'Sam', i: 'S', c: 'pink', s: [] }),
      ctx,
    );
    expect(codes(r)).toContain('bad-user-id');
  });

  it('rejects coordinates outside the map image', () => {
    const r = validateEnvelope(
      env('coordinates', { l: [['ghost-stage', 'Ghost', 'stage', 140, 22, 0]] }),
      ctx,
    );
    expect(codes(r)).toContain('coordinates-off-map');
  });

  it('rejects an unknown location category', () => {
    const r = validateEnvelope(
      env('coordinates', { l: [['ghost-stage', 'Ghost', 'helipad', 40, 22, 0]] }),
      ctx,
    );
    expect(codes(r)).toContain('unknown-category');
  });

  it('rejects a check-in pointing at a place this phone has no pin for', () => {
    const r = validateEnvelope(
      env('checkin', {
        id: 'c1', userId: 'member-2', locationId: 'secret-bar',
        customCoordinates: null, source: 'manual',
        updatedAt: '2026-07-25T11:30:00-07:00',
      }),
      ctx,
    );
    expect(codes(r)).toContain('unknown-location');
  });

  it('warns about a code exported with a badly wrong clock', () => {
    const r = validateEnvelope(
      env('selections', { u: 'member-2', n: 'Sam', i: 'S', c: 'pink', s: [['main-sat-a', 0, 0]] }, {
        exportedAt: '2030-01-01T00:00:00Z',
      }),
      ctx,
    );
    expect(r.warnings.map((w) => w.code)).toContain('timestamp-future');
  });

  it('rejects a backup missing a whole section', () => {
    const r = validateEnvelope(
      env('backup', { users: [], selections: [], performances: [], locations: [] }),
      ctx,
    );
    expect(codes(r)).toContain('backup-missing-checkins');
  });

  it('refuses an absurdly large raw code before decoding it', () => {
    expect(validateRawCode('x'.repeat(LIMITS.maxCodeChars + 1))).not.toBeNull();
    expect(validateRawCode('WLB1.abc')).toBeNull();
  });

  it('every message is a plain sentence, not a field name', () => {
    const r = validateEnvelope(
      env('schedule', { p: [['main-sat-a', 'mystery-stage', '99:99', null]] }),
      ctx,
    );
    for (const issue of [...r.errors, ...r.warnings]) {
      // A sentence: starts with a capital or a count, ends with punctuation.
      expect(issue.message).toMatch(/^[A-Z0-9].*[.!]$/);
      expect(issue.message).not.toMatch(/undefined|null|\[object|TypeError/);
    }
  });
});
