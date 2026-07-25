import { useMemo, useRef, useState } from 'react';
import { X, Split, Footprints, Check, RotateCcw } from 'lucide-react';
import { Button, cx } from './ui';
import { useApp } from '@/store/appStore';
import { useModalA11y } from '@/hooks/useModalA11y';
import { withEffectiveEnds } from '@/domain/endTimes';
import { overrideMap } from '@/domain/travel';
import { suggestSplit, hasSplit, MIN_STAY_MINUTES } from '@/domain/splitSet';
import { formatMinutes, formatDuration, hhmmToMinutes } from '@/domain/time';

/**
 * Split-set planner (add-on §3).
 *
 * Turns "pick one" into "catch 20 minutes of the first and the back half of
 * the second", with an honest arrival time that accounts for the walk. The
 * switch point is adjustable because only the person there knows whether
 * they'd rather leave during the encore or miss the opener.
 */
export function SplitSetSheet({
  userId,
  performanceIds,
  onClose,
}: {
  userId: string;
  performanceIds: string[];
  onClose: () => void;
}) {
  const performanceById = useApp((s) => s.performanceById);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const performances = useApp((s) => s.performances);
  const selections = useApp((s) => s.selections);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const overrides = useApp((s) => s.travelOverrides);
  const setSplitPlan = useApp((s) => s.setSplitPlan);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(true, panelRef, onClose);

  const ends = useMemo(
    () => withEffectiveEnds(performances, turnoverBuffer),
    [performances, turnoverBuffer],
  );
  const omap = useMemo(() => overrideMap(overrides), [overrides]);

  const base = useMemo(() => {
    const [aId, bId] = performanceIds;
    const a = performanceById.get(aId);
    const b = performanceById.get(bId);
    if (!a || !b) return null;
    const wrap = (p: typeof a) => ({
      perf: p,
      end: ends.get(p.id)!,
      stage: p.stageId ? locationById.get(p.stageId) : undefined,
    });
    return { a: wrap(a), b: wrap(b), suggestion: suggestSplit(wrap(a), wrap(b), crowd, omap) };
  }, [performanceIds, performanceById, ends, locationById, crowd, omap]);

  const [switchMinute, setSwitchMinute] = useState<number | null>(null);
  if (!base) return null;
  const { suggestion } = base;

  if (!suggestion) {
    return (
      <Sheet panelRef={panelRef} onClose={onClose} title="Can't split these">
        <p className="text-[14px] leading-relaxed text-secondary">
          These two don&apos;t overlap enough to split — by the time you walked over, the second
          set would be finished. Pick one instead.
        </p>
        <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </Sheet>
    );
  }

  const first = performanceById.get(suggestion.firstId)!;
  const second = performanceById.get(suggestion.secondId)!;
  const firstName = artistById.get(first.artistId)?.name ?? 'First set';
  const secondName = artistById.get(second.artistId)?.name ?? 'Second set';
  const firstStage = first.stageId ? locationById.get(first.stageId) : undefined;
  const secondStage = second.stageId ? locationById.get(second.stageId) : undefined;

  const firstStart = hhmmToMinutes(first.startTime!);
  const firstEnd = ends.get(first.id)?.minutes ?? firstStart + 30;
  const secondStart = hhmmToMinutes(second.startTime!);
  const secondEnd = ends.get(second.id)?.minutes ?? secondStart + 30;

  const sw = switchMinute ?? suggestion.switchMinute;
  const arrive = sw + suggestion.walkMinutes;
  const leaveEarly = Math.max(0, firstEnd - sw);
  const arriveLate = Math.max(0, arrive - secondStart);
  const minSwitch = firstStart + MIN_STAY_MINUTES;
  const maxSwitch = Math.min(firstEnd, secondEnd - suggestion.walkMinutes - MIN_STAY_MINUTES);

  const existing =
    hasSplit(selections.find((s) => s.userId === userId && s.performanceId === first.id)) ||
    hasSplit(selections.find((s) => s.userId === userId && s.performanceId === second.id));

  const apply = async () => {
    await setSplitPlan(userId, first.id, { leaveEarlyMinutes: leaveEarly, arriveLateMinutes: 0 });
    await setSplitPlan(userId, second.id, { arriveLateMinutes: arriveLate, leaveEarlyMinutes: 0 });
    onClose();
  };

  const clear = async () => {
    await setSplitPlan(userId, first.id, { leaveEarlyMinutes: 0, arriveLateMinutes: 0 });
    await setSplitPlan(userId, second.id, { leaveEarlyMinutes: 0, arriveLateMinutes: 0 });
    onClose();
  };

  return (
    <Sheet panelRef={panelRef} onClose={onClose} title="Catch part of both">
      <div className="space-y-2">
        <Leg
          name={firstName}
          stage={firstStage?.name}
          line={`Attend ${formatMinutes(firstStart)} to ${formatMinutes(sw)}`}
          sub={`${formatDuration(sw - firstStart)} of the set · leaving ${formatDuration(leaveEarly)} early`}
          tone="pink"
        />
        <div className="flex items-center gap-2 px-1 text-[12px] text-secondary">
          <Footprints size={14} aria-hidden />
          Walk to {secondStage?.shortName ?? secondStage?.name ?? 'the next stage'} — about{' '}
          {formatDuration(suggestion.walkMinutes)}
        </div>
        <Leg
          name={secondName}
          stage={secondStage?.name}
          line={`Arrive ${formatMinutes(arrive)}, stay to ${formatMinutes(secondEnd)}`}
          sub={`${formatDuration(secondEnd - arrive)} of the set · ${formatDuration(arriveLate)} late`}
          tone="blue"
        />
      </div>

      {maxSwitch > minSwitch && (
        <div className="mt-4">
          <label htmlFor="split-slider" className="mb-1 block text-[13px] font-semibold text-primary">
            Leave {firstName} at {formatMinutes(sw)}
          </label>
          <input
            id="split-slider"
            type="range"
            min={minSwitch}
            max={maxSwitch}
            step={5}
            value={sw}
            onChange={(e) => setSwitchMinute(Number(e.target.value))}
            aria-valuetext={formatMinutes(sw)}
            className="w-full accent-warp-pink"
          />
          <div className="flex justify-between text-[11px] text-muted">
            <span>More {firstName}</span>
            <span>More {secondName}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Walk times are approximate and set ends may be estimated. Both sets stay on your plan and
        both count as attending.
      </p>

      <div className="mt-4 flex gap-2">
        {existing && (
          <Button variant="secondary" className="flex-1" onClick={() => void clear()}>
            <RotateCcw size={16} aria-hidden /> Clear split
          </Button>
        )}
        <Button variant="yellow" className="flex-1" onClick={() => void apply()}>
          <Check size={16} aria-hidden /> Save split plan
        </Button>
      </div>
    </Sheet>
  );
}

function Leg({
  name,
  stage,
  line,
  sub,
  tone,
}: {
  name: string;
  stage?: string;
  line: string;
  sub: string;
  tone: 'pink' | 'blue';
}) {
  return (
    <div
      className={cx(
        'rounded-xl border p-3',
        tone === 'pink' ? 'border-warp-pink/40 bg-warp-pink/5' : 'border-warp-blue-500/40 bg-accent-soft',
      )}
    >
      <div className="font-display text-[15px] text-primary">{name}</div>
      {stage && <div className="text-[12px] text-secondary">{stage}</div>}
      <div className="mt-1 text-[14px] font-semibold text-primary">{line}</div>
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  );
}

function Sheet({
  panelRef,
  onClose,
  title,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 max-h-[88%] w-full overflow-y-auto rounded-t-3xl p-4 pb-[calc(var(--safe-bottom)+1rem)] shadow-2xl outline-none"
        style={{ background: 'var(--surface-card)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Split size={18} className="text-accent" aria-hidden />
          <h2 className="flex-1 font-display text-[17px] text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-touch min-w-touch -m-2 flex items-center justify-center text-muted"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
