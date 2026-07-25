import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, ShieldCheck, Loader2 } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { useApp } from '@/store/appStore';
import {
  runOfflineTests,
  allEssentialPass,
  type TestResult,
} from '@/domain/offlineTests';

export function OfflineTestScreen() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const offlineReady = useApp((s) => s.settings.offlineReady);
  const updateSettings = useApp((s) => s.updateSettings);

  const run = useCallback(async () => {
    setRunning(true);
    const r = await runOfflineTests();
    setResults(r);
    setRunning(false);
    const ready = allEssentialPass(r);
    if (ready !== offlineReady) {
      await updateSettings({ offlineReady: ready });
    }
  }, [offlineReady, updateSettings]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = results ? allEssentialPass(results) : false;

  return (
    <Screen>
      {/* Status banner */}
      <Card
        className={cx(
          'mb-4 p-5 text-center',
          ready ? 'border-warp-ok/50 bg-warp-ok/5' : 'border-warp-warn/50 bg-warp-warn/5',
        )}
      >
        {ready ? (
          <ShieldCheck size={40} className="mx-auto mb-2 text-warp-ok" aria-hidden />
        ) : (
          <Loader2
            size={40}
            className={cx('mx-auto mb-2 text-warp-warn', running && 'animate-spin')}
            aria-hidden
          />
        )}
        <div className="font-display text-[18px] text-primary">
          {ready ? 'Ready for offline use' : 'Not ready yet'}
        </div>
        <p className="mt-1 text-[13px] text-secondary">
          {ready
            ? 'Every essential check passed. You can turn on Airplane Mode and reopen the app.'
            : 'Reload once while online so the service worker can cache everything, then re-run.'}
        </p>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[15px] uppercase tracking-wide text-secondary">
          Checks
        </h2>
        <Button variant="secondary" className="px-3" onClick={run} disabled={running}>
          <RefreshCw size={16} className={cx(running && 'animate-spin')} aria-hidden />
          Re-run
        </Button>
      </div>

      <div className="space-y-2">
        {(results ?? []).map((r) => (
          <Card key={r.id} className="flex items-start gap-3 p-3">
            {r.pass ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-warp-ok" size={22} aria-hidden />
            ) : (
              <XCircle
                className={cx('mt-0.5 shrink-0', r.essential ? 'text-warp-danger' : 'text-warp-warn')}
                size={22}
                aria-hidden
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-primary">{r.label}</span>
                {!r.essential && (
                  <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold text-muted">
                    optional
                  </span>
                )}
              </div>
              <p className="text-[13px] text-secondary">{r.detail}</p>
            </div>
            <span className="sr-only">{r.pass ? 'Passed' : 'Failed'}</span>
          </Card>
        ))}
        {!results && (
          <p className="py-6 text-center text-secondary">Running checks…</p>
        )}
      </div>

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
        Tip: after your first online visit, add the app to your Home Screen, then open it once
        more so the service worker fully caches. This screen confirms it worked.
      </p>
    </Screen>
  );
}
