import { useMemo } from 'react';
import { useApp } from '@/store/appStore';
import { useGroupCtx } from './useGroupCtx';
import { findMeetups, PREFERRED_LANDMARK_IDS, type MeetupSuggestion } from '@/domain/meetups';
import { hhmmToMinutes } from '@/domain/time';
import { EVENT } from '@/config/event';
import type { DayId } from '@/domain/types';

const OPEN = hhmmToMinutes(EVENT.festivalHours.opens);
const CLOSE = hhmmToMinutes(EVENT.festivalHours.closes);

export function useMeetups(day: DayId, limit = 6): MeetupSuggestion[] {
  const ctx = useGroupCtx();
  const minMeetupMinutes = useApp((s) => s.settings.minMeetupMinutes);
  const allowDuringMustSee = useApp((s) => s.settings.allowMeetupDuringMustSee);

  return useMemo(
    () =>
      findMeetups(
        day,
        {
          ...ctx,
          minMeetupMinutes,
          allowDuringMustSee,
          bounds: { open: OPEN, close: CLOSE },
          preferredLandmarkIds: PREFERRED_LANDMARK_IDS,
        },
        limit,
      ),
    [day, ctx, minMeetupMinutes, allowDuringMustSee, limit],
  );
}
