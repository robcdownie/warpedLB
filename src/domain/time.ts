import { EVENT } from '@/config/event';
import type { DayId } from './types';

// All set times are wall-clock local (America/Los_Angeles). We store "HH:mm"
// strings and convert to minutes-since-midnight for math. This avoids timezone
// bugs while offline: comparisons are within a single festival day.

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Parse a set time typed off the festival board into "HH:mm".
 *
 * The board lists start times only, in festival hours (11:00–22:00), so a bare
 * number is unambiguous and we can skip the AM/PM tap entirely:
 *   "1153" -> 11:53 AM   "1254" -> 12:54 PM   "205" -> 2:05 PM   "931" -> 9:31 PM
 * An explicit am/pm always wins, and a 24-hour time typed in full is kept as-is.
 * Returns null for anything unparseable so the caller can hold the raw text.
 */
export function parseBoardTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (!s) return null;

  let hh: number;
  let mm: number;
  let meridiem: string | undefined;

  // "3:05pm" | "1505" | "205" | "15:05"
  const withMinutes = s.match(/^(\d{1,2}):?(\d{2})\s*(am|pm)?$/);
  if (withMinutes) {
    hh = Number(withMinutes[1]);
    mm = Number(withMinutes[2]);
    meridiem = withMinutes[3];
  } else {
    // Bare hour: "3pm", "3 pm", or just "3" (festival hours make it PM).
    const bareHour = s.match(/^(\d{1,2})\s*(am|pm)?$/);
    if (!bareHour) return null;
    hh = Number(bareHour[1]);
    mm = 0;
    meridiem = bareHour[2];
  }

  if (mm > 59) return null;

  if (meridiem) {
    if (hh > 12) return null; // "13pm" is nonsense
    hh = hh % 12;
    if (meridiem === 'pm') hh += 12;
  } else if (hh >= 1 && hh <= 10) {
    // Festival runs 11:00–22:00, so 1–10 can only mean afternoon/evening.
    hh += 12;
  }
  // 11 stays 11 AM, 12 stays 12 PM, 13–23 are already 24-hour.

  if (hh > 23) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * True when the digits typed so far can only mean one time, so the caller can
 * jump straight to the band field without waiting for a tap.
 *
 * Four digits are always complete. Three digits are complete only when no
 * fourth digit could extend them into a valid time ("148" can only be 1:48,
 * but "115" might still become 11:50). One or two digits are never assumed —
 * "3" could be the start of "331".
 */
export function shouldAdvanceBoardTime(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) return true;
  if (digits.length < 3) return false;
  if (!parseBoardTime(digits)) return false;
  for (let d = 0; d <= 9; d++) {
    if (parseBoardTime(digits + d)) return false;
  }
  return true;
}

/** "15:05" -> "3:05 PM". */
export function formatTime(hhmm: string | null): string {
  if (!hhmm) return '--:--';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatMinutes(min: number): string {
  return formatTime(minutesToHHMM(min));
}

/** Human duration like "28 minutes" / "1 hr 5 min". */
export function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hr ${rem} min` : `${h} hr`;
}

export interface NowInfo {
  /** Wall-clock minutes since midnight in festival timezone. */
  minutes: number;
  /** Festival day if "now" falls on one of the event dates, else null. */
  day: DayId | null;
  /** ISO date string (yyyy-mm-dd) in festival tz. */
  isoDate: string;
  date: Date;
}

/** Current time expressed in the festival's timezone. */
export function getNow(reference: Date = new Date()): NowInfo {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT.timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(reference);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  if (hour === '24') hour = '00';
  const minute = get('minute');
  const isoDate = `${year}-${month}-${day}`;
  const minutes = Number(hour) * 60 + Number(minute);
  const match = EVENT.days.find((d) => d.date === isoDate);
  return {
    minutes,
    day: (match?.id as DayId) ?? null,
    isoDate,
    date: reference,
  };
}

/** Milliseconds until festival gates open on the first day (for countdown). */
export function timeUntilFestival(reference: Date = new Date()): {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  started: boolean;
  ended: boolean;
} {
  // Festival open on day 1 and close on the last day, in festival tz.
  const first = EVENT.days[0];
  const last = EVENT.days[EVENT.days.length - 1];
  const openMs = zonedDateTimeToMs(first.date, EVENT.festivalHours.opens);
  const closeMs = zonedDateTimeToMs(last.date, EVENT.festivalHours.closes);
  const now = reference.getTime();
  const totalMs = Math.max(0, openMs - now);
  const started = now >= openMs;
  const ended = now > closeMs;
  const totalSec = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    started,
    ended,
  };
}

/**
 * Convert a festival-local date + HH:mm into an absolute epoch-ms value,
 * accounting for the festival timezone's UTC offset on that date.
 */
export function zonedDateTimeToMs(isoDate: string, hhmm: string): number {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  // Guess UTC, then measure the tz offset at that instant and correct.
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetMs(new Date(guess), EVENT.timezone);
  return guess - offset;
}

/** Timezone offset (ms) for a given instant, e.g. PDT = -7h => -25200000. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUTC - date.getTime();
}

/** "22 minutes ago", "just now", "3 hours ago", "2 days ago". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now.getTime() - then) / 1000);
  if (diffSec < 45) return 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

export function dayLabel(day: DayId | null): string {
  if (!day) return 'TBA';
  return EVENT.days.find((d) => d.id === day)?.label ?? day;
}
