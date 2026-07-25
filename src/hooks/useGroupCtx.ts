import { useMemo } from 'react';
import { useApp } from '@/store/appStore';
import { eligibleUsers } from '@/domain/planStatus';
import type { GroupCtx } from '@/domain/group';

/**
 * Assembles the GroupCtx from the store for the Group screen + map.
 *
 * `users` here is deliberately the ELIGIBLE set — the active local user plus
 * anyone whose plan has actually been imported. A placeholder profile with no
 * selections would otherwise show up as free all day in timelines, meetups and
 * free-window math (plan §P0-2). Screens that need to render everyone,
 * including the people with no plan, use `usePlanStatuses()` instead.
 *
 * Memoized on the underlying slices — a fresh object every render would defeat
 * every downstream useMemo (and re-run the meetup engine constantly).
 */
export function useGroupCtx(): GroupCtx {
  const allUsers = useApp((s) => s.users);
  const settings = useApp((s) => s.settings);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const locationById = useApp((s) => s.locationById);
  const allPerformances = useApp((s) => s.performances);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);

  const users = useMemo(
    () => eligibleUsers(allUsers, settings, selections),
    [allUsers, settings, selections],
  );

  return useMemo(
    () => ({
      users,
      selections,
      performanceById,
      locationById,
      allPerformances,
      crowd,
      turnoverBuffer,
      overrides,
    }),
    [users, selections, performanceById, locationById, allPerformances, crowd, turnoverBuffer, overrides],
  );
}
