import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/store/appStore';
import { setupState, type SetupState } from '@/domain/setupChecklist';
import { runOfflineTests, allEssentialPass } from '@/domain/offlineTests';

/**
 * Setup progress, including a real offline check.
 *
 * The offline result is asynchronous (it inspects Cache Storage and the
 * service worker), so it's fetched once on mount and re-checked when the
 * stored `offlineReady` flag changes — never faked from the flag alone, since
 * the flag can outlive a cache eviction.
 */
export function useSetupState(): SetupState & { offlineChecked: boolean } {
  const settings = useApp((s) => s.settings);
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const performances = useApp((s) => s.performances);

  const [offlinePass, setOfflinePass] = useState(false);
  const [offlineChecked, setOfflineChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    void runOfflineTests().then((r) => {
      if (!alive) return;
      setOfflinePass(allEssentialPass(r));
      setOfflineChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [settings.offlineReady]);

  return useMemo(
    () => ({
      ...setupState({
        settings,
        users,
        selections,
        performances,
        offlineEssentialsPass: offlinePass,
      }),
      offlineChecked,
    }),
    [settings, users, selections, performances, offlinePass, offlineChecked],
  );
}
