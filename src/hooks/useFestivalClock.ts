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
export function useFestivalClock(tickMs = 15000): FestivalClock {
  const now = useClock(tickMs);
  const info = getNow(now);
  return {
    now,
    day: info.day ?? 'saturday',
    atMinute: info.day ? info.minutes : Math.max(OPEN, 12 * 60),
    live: info.day != null,
  };
}
