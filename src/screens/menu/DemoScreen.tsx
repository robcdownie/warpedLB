import { useState } from 'react';
import { FlaskConical, Play, Square, RotateCcw } from 'lucide-react';
import { Screen, Card, Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApp } from '@/store/appStore';

export function DemoScreen() {
  const mode = useApp((s) => s.mode);
  const enterDemo = useApp((s) => s.enterDemo);
  const exitDemo = useApp((s) => s.exitDemo);
  const resetDemoData = useApp((s) => s.resetDemoData);
  const [confirmReset, setConfirmReset] = useState(false);
  const isDemo = mode === 'demo';

  return (
    <Screen>
      <Card className="mb-4 border-warp-yellow/50 bg-warp-yellow/5 p-4">
        <div className="flex items-start gap-3">
          <FlaskConical size={24} className="mt-0.5 shrink-0 text-warp-yellow-dark" aria-hidden />
          <div>
            <h2 className="font-display text-[15px] text-primary">Demo Mode</h2>
            <p className="text-[13px] text-secondary">
              Loads a full <b>fictional</b> schedule so you can try conflicts, meetups, and the map
              before the real set times drop. Demo data is kept completely separate — your real
              plan is never touched.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isDemo ? 'bg-warp-yellow' : 'bg-warp-ok'}`} aria-hidden />
          <span className="text-[14px] font-semibold text-primary">
            {isDemo ? 'Currently in Demo Mode' : 'Normal mode — your real plan is active'}
          </span>
        </div>
        {isDemo ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => exitDemo()}>
              <Square size={16} aria-hidden /> Exit Demo
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={16} aria-hidden /> Reset Demo
            </Button>
          </div>
        ) : (
          <Button variant="yellow" className="w-full" onClick={() => enterDemo()}>
            <Play size={16} aria-hidden /> Enter Demo Mode
          </Button>
        )}
      </Card>

      <p className="px-1 text-[12px] leading-relaxed text-muted">
        While in Demo Mode a yellow banner stays at the top of the app so demo times are never
        mistaken for the real schedule. Exit any time — your real picks are untouched.
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        message="Regenerates the fictional demo schedule and sample picks. Your real data is unaffected."
        confirmLabel="Reset demo"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => { await resetDemoData(); setConfirmReset(false); }}
      />
    </Screen>
  );
}
