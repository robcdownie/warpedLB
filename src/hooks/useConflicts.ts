import { useMemo } from 'react';
import { useApp } from '@/store/appStore';
import { detectConflicts, type Conflict } from '@/domain/conflicts';
import type { DayId } from '@/domain/types';

/** Conflicts for a given user across both festival days (memoized). */
export function useConflicts(userId: string): Conflict[] {
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const locationById = useApp((s) => s.locationById);
  const artistById = useApp((s) => s.artistById);
  const allPerformances = useApp((s) => s.performances);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);

  return useMemo(() => {
    const ctx = {
      userId,
      selections,
      performanceById,
      locationById,
      artistById,
      allPerformances,
      crowd,
      turnoverBuffer,
      overrides,
    };
    const days: DayId[] = ['saturday', 'sunday'];
    return days.flatMap((d) => detectConflicts(d, ctx));
  }, [
    userId,
    selections,
    performanceById,
    locationById,
    artistById,
    allPerformances,
    crowd,
    turnoverBuffer,
    overrides,
  ]);
}
