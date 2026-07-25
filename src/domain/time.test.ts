import { describe, it, expect } from 'vitest';
import { parseBoardTime, shouldAdvanceBoardTime } from './time';

// The board lists start times only, within festival hours (11:00-22:00), so a
// bare number is unambiguous. These cases are transcribed from the real 2025
// set-time poster.
describe('parseBoardTime', () => {
  it('reads morning hours as AM', () => {
    expect(parseBoardTime('1153')).toBe('11:53');
    expect(parseBoardTime('11:30')).toBe('11:30');
  });

  it('keeps noon as PM', () => {
    expect(parseBoardTime('1254')).toBe('12:54');
    expect(parseBoardTime('12:41')).toBe('12:41');
  });

  it('infers PM for hours 1-10', () => {
    expect(parseBoardTime('205')).toBe('14:05');
    expect(parseBoardTime('148')).toBe('13:48');
    expect(parseBoardTime('931')).toBe('21:31');
    expect(parseBoardTime('3:31')).toBe('15:31');
    expect(parseBoardTime('1000')).toBe('22:00');
  });

  it('honours an explicit meridiem over the festival-hours guess', () => {
    expect(parseBoardTime('3:05 pm')).toBe('15:05');
    expect(parseBoardTime('3:05pm')).toBe('15:05');
    expect(parseBoardTime('11:15 am')).toBe('11:15');
    expect(parseBoardTime('12:00 am')).toBe('00:00');
    expect(parseBoardTime('12:00 pm')).toBe('12:00');
  });

  it('keeps a full 24-hour time as typed', () => {
    expect(parseBoardTime('15:05')).toBe('15:05');
    expect(parseBoardTime('2130')).toBe('21:30');
  });

  it('accepts a bare hour', () => {
    expect(parseBoardTime('3')).toBe('15:00');
    expect(parseBoardTime('3 pm')).toBe('15:00');
    expect(parseBoardTime('11')).toBe('11:00');
  });

  it('tolerates surrounding whitespace and dots', () => {
    expect(parseBoardTime('  205  ')).toBe('14:05');
    expect(parseBoardTime('3:05 p.m.')).toBe('15:05');
  });

  it('returns null for anything unparseable', () => {
    expect(parseBoardTime('')).toBeNull();
    expect(parseBoardTime('   ')).toBeNull();
    expect(parseBoardTime('abc')).toBeNull();
    expect(parseBoardTime('12:75')).toBeNull();
    expect(parseBoardTime('25:00')).toBeNull();
    expect(parseBoardTime('13 pm')).toBeNull();
    expect(parseBoardTime('12345')).toBeNull();
  });
});

describe('shouldAdvanceBoardTime', () => {
  it('advances once four digits are in', () => {
    expect(shouldAdvanceBoardTime('1153')).toBe(true);
    expect(shouldAdvanceBoardTime('1030')).toBe(true);
  });

  it('advances on three digits that cannot be extended', () => {
    expect(shouldAdvanceBoardTime('148')).toBe(true); // 14:8x is never valid
    expect(shouldAdvanceBoardTime('530')).toBe(true);
    expect(shouldAdvanceBoardTime('931')).toBe(true);
  });

  it('waits when a fourth digit could still change the reading', () => {
    expect(shouldAdvanceBoardTime('115')).toBe(false); // could become 11:5x
    expect(shouldAdvanceBoardTime('200')).toBe(false); // could become 20:0x
  });

  it('never assumes from one or two digits', () => {
    expect(shouldAdvanceBoardTime('3')).toBe(false); // might be the start of 331
    expect(shouldAdvanceBoardTime('11')).toBe(false);
    expect(shouldAdvanceBoardTime('')).toBe(false);
  });
});
