import { describe, it, expect } from 'vitest';
import { EVENT } from '@/config/event';
import { parseBoardTime, shouldAdvanceBoardTime, timeUntilFestival, getNow, windDownStarted } from './time';

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

// `ended` gates the post-festival wrap-up, which replaces the Now tab. A false
// positive would hijack the main screen mid-festival — the single worst thing
// this flag can do — so the boundaries are pinned in festival-local time.
// Long Beach is PDT (UTC-7) in July; the last day closes at 22:00.
describe('timeUntilFestival', () => {
  const at = (iso: string) => timeUntilFestival(new Date(iso));

  it('has not started the night before', () => {
    const t = at('2026-07-24T20:00:00-07:00');
    expect(t.started).toBe(false);
    expect(t.ended).toBe(false);
  });

  it('counts down in festival-local time, not UTC', () => {
    // 11:00 PDT Saturday is 18:00Z — an implementation that forgot the offset
    // would report the festival as already open at 04:00 PDT.
    const t = at('2026-07-25T04:00:00-07:00');
    expect(t.started).toBe(false);
    expect(t.hours).toBe(7);
  });

  it('is running, not ended, in the middle of day one', () => {
    const t = at('2026-07-25T14:30:00-07:00');
    expect(t.started).toBe(true);
    expect(t.ended).toBe(false);
  });

  it('is running, not ended, overnight between the two days', () => {
    const t = at('2026-07-26T02:00:00-07:00');
    expect(t.started).toBe(true);
    expect(t.ended).toBe(false);
  });

  it('is still running one minute before the last set could end', () => {
    const t = at('2026-07-26T21:59:00-07:00');
    expect(t.ended).toBe(false);
  });

  it('ends after close on the final day', () => {
    const t = at('2026-07-26T22:01:00-07:00');
    expect(t.started).toBe(true);
    expect(t.ended).toBe(true);
  });

  it('stays ended the following week', () => {
    expect(at('2026-08-02T12:00:00-07:00').ended).toBe(true);
  });
});

describe('the festival day does not end at midnight', () => {
  it('the small hours after the last night are not a festival day', () => {
    // 00:30 the morning after the FINAL day. getNow reports no festival day,
    // so the clock used to fall back to a Saturday NOON simulation labelled
    // "Previewing Saturday" — right when you're in a dark car park trying to
    // find people. useFestivalClock now looks back a day instead.
    const last = EVENT.days[EVENT.days.length - 1].date;
    const [y, m, d] = last.split('-').map(Number);
    const afterMidnight = new Date(Date.UTC(y, m - 1, d + 1, 7, 30)); // 00:30 PT
    expect(getNow(afterMidnight).day).toBeNull();
    expect(getNow(afterMidnight).minutes).toBe(30);

    // …and the previous calendar day, which is what the clock falls back to.
    const nightBefore = new Date(afterMidnight.getTime() - 24 * 60 * 60 * 1000);
    expect(getNow(nightBefore).day).toBe('sunday');
  });
});

// This flag strips the public app down to a thank-you, the band list and a
// Venmo link. A false positive takes the map away from someone standing in the
// venue, so the boundary is pinned in festival-local time. PDT is UTC-7.
describe('windDownStarted', () => {
  const at = (iso: string) => windDownStarted(new Date(iso));

  it('is false all through the first day', () => {
    expect(at('2026-07-25T21:45:00-07:00')).toBe(false);
    expect(at('2026-07-25T23:59:00-07:00')).toBe(false);
  });

  it('is false during the final day, up to the minute before', () => {
    expect(at('2026-07-26T11:00:00-07:00')).toBe(false);
    expect(at('2026-07-26T21:29:59-07:00')).toBe(false);
  });

  it('is true from 21:30 on the final day', () => {
    expect(at('2026-07-26T21:30:00-07:00')).toBe(true);
  });

  it('reads the boundary in festival time, not UTC', () => {
    // 21:30 PDT is 04:30Z the next day. An implementation that compared UTC
    // clock time would fire this at 14:30 local — mid-afternoon, gates open.
    expect(at('2026-07-26T14:30:00-07:00')).toBe(false);
    expect(at('2026-07-27T04:30:00Z')).toBe(true);
  });

  it('stays wound down afterwards', () => {
    expect(at('2026-07-27T09:00:00-07:00')).toBe(true);
    expect(at('2026-12-01T09:00:00-08:00')).toBe(true);
  });
});
