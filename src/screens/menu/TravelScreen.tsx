import { useMemo, useState } from 'react';
import { Footprints, Users, RotateCcw, Info } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { useApp } from '@/store/appStore';
import { STAGES } from '@/data/stages';
import { stageMatrix, pairKey } from '@/domain/travel';
import { formatDuration } from '@/domain/time';
import { TYPICAL_SET_MINUTES } from '@/domain/endTimes';
import type { CrowdDelay } from '@/domain/types';

const CROWD: { id: CrowdDelay; label: string; desc: string }[] = [
  { id: 'light', label: 'Light', desc: 'Early / easy moving' },
  { id: 'normal', label: 'Normal', desc: 'Typical festival flow' },
  { id: 'heavy', label: 'Heavy', desc: 'Peak crowds, slow' },
];

export function TravelScreen() {
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);
  const updateSettings = useApp((s) => s.updateSettings);
  const putTravelOverride = useApp((s) => s.putTravelOverride);
  const clearTravelOverrides = useApp((s) => s.clearTravelOverrides);

  const matrix = useMemo(() => stageMatrix(STAGES, crowd, overrides), [crowd, overrides]);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Screen>
      {/* Crowd level */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Users size={16} className="text-accent" aria-hidden />
          <h2 className="font-display text-[15px] text-primary">Crowd level</h2>
        </div>
        <p className="mb-3 text-[13px] text-secondary">
          Scales every walking estimate. Bump it up as the day gets packed.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CROWD.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => updateSettings({ crowdDelay: c.id })}
              className={cx(
                'rounded-xl border-2 p-2 text-center transition',
                crowd === c.id ? 'border-warp-pink bg-warp-pink/5' : 'border-subtle',
              )}
            >
              <div className="font-display text-[14px] text-primary">{c.label}</div>
              <div className="text-[10px] leading-tight text-muted">{c.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Turnover buffer */}
      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[15px] text-primary">Stage turnover buffer</h2>
        <p className="mb-3 text-[13px] text-secondary">
          A set with no end time counts as {TYPICAL_SET_MINUTES} minutes long. If the next set on
          the same stage starts sooner than that, we end it this many minutes before that one
          instead.
        </p>
        <Stepper
          value={turnoverBuffer}
          min={0}
          max={30}
          onChange={(v) => updateSettings({ turnoverBuffer: v })}
          suffix="min"
        />
      </Card>

      {/* Travel matrix */}
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints size={16} className="text-accent" aria-hidden />
            <h2 className="font-display text-[15px] text-primary">Walking times</h2>
          </div>
          <Button
            variant="secondary"
            className="px-2.5 py-1.5 text-[12px]"
            onClick={() => clearTravelOverrides()}
            disabled={!overrides.length}
          >
            <RotateCcw size={14} aria-hidden /> Reset
          </Button>
        </div>
        <p className="mb-3 flex items-start gap-1 text-[12px] text-muted">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          Approximate walking time, not GPS routing. Tap a value to set the real time once you&apos;re
          on-site.
        </p>
        <div className="space-y-1">
          {matrix.map((row) => {
            const key = pairKey(row.from.id, row.to.id);
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-secondary">
                  {row.from.shortName} → {row.to.shortName}
                </span>
                {editing === key ? (
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    max={60}
                    defaultValue={row.minutes}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.min(60, Number(e.target.value)));
                      putTravelOverride({ pairKey: key, minutes: v });
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-16 rounded-lg border border-warp-blue-400 bg-[var(--surface-sunken)] px-2 py-1 text-right text-[13px] text-primary outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(key)}
                    className={cx(
                      'rounded-lg px-2 py-1 text-[13px] font-semibold',
                      row.source === 'override' ? 'bg-accent-soft text-accent' : 'bg-[var(--surface-sunken)] text-primary',
                    )}
                  >
                    ~{formatDuration(row.minutes)}
                    {row.source === 'override' && <span className="ml-1 text-[10px]">set</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </Screen>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[20px] font-bold text-primary"
      >
        −
      </button>
      <span className="min-w-[80px] text-center font-display text-[20px] text-primary">
        {value} {suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[20px] font-bold text-primary"
      >
        +
      </button>
    </div>
  );
}
