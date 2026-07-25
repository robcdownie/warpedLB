import { useMemo } from 'react';
import { useApp } from '@/store/appStore';
import { allPlanInfo, type PlanInfo } from '@/domain/planStatus';
import type { User } from '@/domain/types';

export interface PlanStatuses {
  /** Every seeded/known profile, including ones with no imported plan. */
  all: User[];
  /** Only the people whose plans may drive group calculations. */
  eligible: User[];
  byUser: Map<string, PlanInfo>;
  /** Profiles present on this device with no usable plan. */
  missing: User[];
}

/**
 * Who counts. A placeholder profile is still shown in the UI (so nobody
 * wonders where a friend they added went) but never feeds availability,
 * meetups or free-time math.
 */
export function usePlanStatuses(): PlanStatuses {
  const users = useApp((s) => s.users);
  const settings = useApp((s) => s.settings);
  const selections = useApp((s) => s.selections);

  return useMemo(() => {
    const byUser = allPlanInfo(users, settings, selections);
    const eligible = users.filter((u) => byUser.get(u.id)?.eligible);
    const missing = users.filter((u) => !byUser.get(u.id)?.eligible);
    return { all: users, eligible, byUser, missing };
  }, [users, settings, selections]);
}
