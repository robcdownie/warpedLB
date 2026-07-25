import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { onPwaState, type UpdateState } from '@/pwa';
import { Button } from './ui';

/** Shows a non-intrusive prompt when a new app version is available. */
export function UpdateToast() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => onPwaState(setState), []);

  if (!state?.needRefresh || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+6rem)] z-50 mx-auto max-w-[520px]">
      <div className="surface-card flex items-center gap-3 rounded-2xl border border-subtle p-3 shadow-xl">
        <RefreshCw size={20} className="text-accent" aria-hidden />
        <div className="flex-1 text-[13px] text-primary">
          A new version is ready. Update when you have signal.
          <span className="mt-0.5 block text-[11px] text-muted">
            You&apos;re on build {__BUILD_HASH__} — After updating, check Menu → About for the new build.
          </span>
        </div>
        <Button variant="secondary" className="px-3" onClick={() => setDismissed(true)}>
          Later
        </Button>
        <Button variant="primary" className="px-3" onClick={() => state.update()}>
          Update
        </Button>
      </div>
    </div>
  );
}
