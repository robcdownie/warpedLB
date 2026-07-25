import { describe, it, expect } from 'vitest';
import { encodeEnvelope, decodeEnvelope, DecodeError, crc32 } from './codec';

describe('share codec', () => {
  it('round-trips a payload', () => {
    const data = { hello: 'world', list: [1, 2, 3], u: 'member-1' };
    const code = encodeEnvelope('selections', 'member-1', data, '2026-07-24T12:00:00Z');
    const env = decodeEnvelope(code);
    expect(env.type).toBe('selections');
    expect(env.source).toBe('member-1');
    expect(env.data).toEqual(data);
  });

  it('rejects a non-Warped string (acceptance §42)', () => {
    expect(() => decodeEnvelope('{"just":"json"}')).toThrow(DecodeError);
    try {
      decodeEnvelope('not a code');
    } catch (e) {
      expect((e as DecodeError).code).toBe('format');
    }
  });

  it('detects corruption via checksum', () => {
    const code = encodeEnvelope('schedule', 'member-1', { p: [['x', 'y', '12:00', null]] }, 'now');
    // Corrupt a character in the payload body.
    const bad = code.slice(0, -3) + (code.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    expect(() => decodeEnvelope(bad)).toThrow(DecodeError);
  });

  it('crc32 is stable and differs on change', () => {
    expect(crc32('abc')).toBe(crc32('abc'));
    expect(crc32('abc')).not.toBe(crc32('abd'));
  });
});
