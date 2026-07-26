import { useClock } from './useClock';
import { getNow, hhmmToMinutes } from '@/domain/time';
import { EVENT } from '@/config/event';
import type { DayId } from '@/domain/types';

const OPEN = hhmmToMinutes(EVENT.festivalHours.opens);

export interface FestivalClock {
  now: Date;
  /** The day being shown: today if it's a festival day, else Saturday. */
  day: DayId;
  /** Minutes since midnight to plan against. */
  atMinute: number;
  /** False when it isn't actually a festival day — every derived time is a
      simulation and must be labeled as one. */
  live: boolean;
}

/**
 * One source of truth for "what time is it, festival-wise". Prevents the Now
 * screen and the Festival screen drifting into different assumptions about
 * what "now" means the day before the show.
 */
/**
 * A festival day doesn't end at midnight — you're still walking to the car.
 * Until this hour the following morning, "today" is still last night.
 */
const NIGHT_ENDS_AT = 3 * 60;

export function useFestivalClock(tickMs = 15000): FestivalClock {
  const now = useClock(tickMs);
  const info = getNow(now);

  // Past midnight the calendar date has rolled over, so `day` went null and
  // this fell back to a *Saturday noon simulation* labelled "Previewing
  // Saturday" — at exactly the moment you're in a dark car park trying to find
  // people. Keep last night's day running instead, with its real clock time.
  if (!info.day && info.minutes < NIGHT_ENDS_AT) {
    const lastNight = getNow(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    if (lastNight.day) {
      return { now, day: lastNight.day, atMinute: info.minutes + 24 * 60, live: true };
    }
  }

  return {
    now,
    day: info.day ?? 'saturday',
    atMinute: info.day ? info.minutes : Math.max(OPEN, 12 * 60),
    live: info.day != null,
  };
}
