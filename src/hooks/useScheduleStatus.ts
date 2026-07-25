import { useMemo } from 'react';
import { useApp } from '@/store/appStore';
import {
  allDaysScheduleInfo,
  hasAnySchedule,
  type DayScheduleInfo,
} from '@/domain/scheduleStatus';
import type { DayId } from '@/domain/types';

export interface ScheduleStatus {
  byDay: Record<DayId, DayScheduleInfo>;
  /** At least one set entered on some day. */
  any: boolean;
  /** Both days verified/entered in full — the only state that licenses
      confident free-time and availability claims. */
  allComplete: boolean;
}

/** Per-day schedule completeness, memoized on the performance list. */
export function useScheduleStatus(): ScheduleStatus {
  const performances = useApp((s) => s.performances);
  const provenance = useApp((s) => s.settings.schedule);
  return useMemo(() => {
    const byDay = allDaysScheduleInfo(performances, provenance);
    return {
      byDay,
      any: hasAnySchedule(byDay),
      allComplete: byDay.saturday.status === 'complete' && byDay.sunday.status === 'complete',
    };
  }, [performances, provenance]);
}

/** The status of one day. */
export function useDayScheduleStatus(day: DayId): DayScheduleInfo {
  return useScheduleStatus().byDay[day];
}
