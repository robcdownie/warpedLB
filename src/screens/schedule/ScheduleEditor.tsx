import { useMemo, useState } from 'react';
import { Search, Undo2, List, Columns3, X } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { Button, cx } from '@/components/ui';
import { PerfRowEditor } from './PerfRowEditor';
import { scheduleCompletion } from '@/store/selectors';
import { searchArtists } from '@/domain/matching';
import { STAGES } from '@/data/stages';
import type { DayId, Performance } from '@/domain/types';

type Layout = 'assign' | 'timeline';
type MissFilter = 'all' | 'no-stage' | 'no-time';

export function ScheduleEditor() {
  const performances = useApp((s) => s.performances);
  const artists = useApp((s) => s.artists);
  const artistById = useApp((s) => s.artistById);
  const undo = useApp((s) => s.undoLastScheduleEdit);

  const [day, setDay] = useState<DayId>('saturday');
  const [layout, setLayout] = useState<Layout>('assign');
  const [miss, setMiss] = useState<MissFilter>('all');
  const [query, setQuery] = useState('');
  const [undone, setUndone] = useState<string | null>(null);

  const dayMain = useMemo(
    () => performances.filter((p) => p.type === 'main' && p.day === day),
    [performances, day],
  );

  const completion = useMemo(() => {
    const scheduled = dayMain.filter((p) => p.startTime && p.stageId).length;
    return { total: dayMain.length, scheduled, percent: dayMain.length ? Math.round((scheduled / dayMain.length) * 100) : 0 };
  }, [dayMain]);

  const overall = useMemo(() => scheduleCompletion(performances), [performances]);

  const matched = useMemo(() => searchArtists(query, artists), [query, artists]);

  const filtered = useMemo(() => {
    return dayMain
      .filter((p) => {
        if (!matched.has(p.artistId)) return false;
        if (miss === 'no-stage' && p.stageId) return false;
        if (miss === 'no-time' && p.startTime) return false;
        return true;
      })
      // Stable alphabetical order so a row does NOT jump around while you're
      // filling in its time. Use the "No time"/"No stage" filters to find blanks.
      .sort((a, b) =>
        (artistById.get(a.artistId)?.name ?? '').localeCompare(artistById.get(b.artistId)?.name ?? ''),
      );
  }, [dayMain, matched, miss, artistById]);

  const doUndo = async () => {
    const ok = await undo();
    setUndone(ok ? 'Reverted last change.' : 'Nothing to undo.');
    setTimeout(() => setUndone(null), 2000);
  };

  return (
    <div>
      {/* Completion */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[12px] text-secondary">
          <span>
            {day === 'saturday' ? 'Saturday' : 'Sunday'}: {completion.scheduled}/{completion.total} sets
          </span>
          <span>Overall {overall.percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className="h-full rounded-full bg-warp-ok transition-all"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
      </div>

      {/* Day + layout + undo */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-xl bg-[var(--surface-sunken)] p-0.5">
          <DayTab active={day === 'saturday'} onClick={() => setDay('saturday')}>Sat</DayTab>
          <DayTab active={day === 'sunday'} onClick={() => setDay('sunday')}>Sun</DayTab>
        </div>
        <div className="flex rounded-xl bg-[var(--surface-sunken)] p-0.5">
          <IconTab active={layout === 'assign'} onClick={() => setLayout('assign')} label="Artist list">
            <List size={16} aria-hidden />
          </IconTab>
          <IconTab active={layout === 'timeline'} onClick={() => setLayout('timeline')} label="Stage timeline">
            <Columns3 size={16} aria-hidden />
          </IconTab>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" className="px-3" onClick={doUndo}>
          <Undo2 size={16} aria-hidden />
          Undo
        </Button>
      </div>

      {undone && (
        <p className="mb-2 rounded-lg bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">
          {undone}
        </p>
      )}

      {/* Search + miss filter */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an artist to assign"
            className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-card)] pl-9 pr-9 text-[14px] text-primary outline-none focus:border-warp-blue-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <MissChip active={miss === 'all'} onClick={() => setMiss('all')}>All</MissChip>
          <MissChip active={miss === 'no-stage'} onClick={() => setMiss('no-stage')}>No stage</MissChip>
          <MissChip active={miss === 'no-time'} onClick={() => setMiss('no-time')}>No time</MissChip>
        </div>
      </div>

      {layout === 'assign' ? (
        <AssignLayout perfs={filtered} artistById={artistById} />
      ) : (
        <TimelineLayout perfs={filtered} artistById={artistById} />
      )}
    </div>
  );
}

function AssignLayout({
  perfs,
  artistById,
}: {
  perfs: Performance[];
  artistById: Map<string, { name: string }>;
}) {
  if (!perfs.length) {
    return <p className="py-8 text-center text-[14px] text-muted">No artists match — try a different filter.</p>;
  }
  return (
    <div className="space-y-2">
      {perfs.map((p) => (
        <PerfRowEditor key={p.id} perf={p} artistName={artistById.get(p.artistId)?.name ?? 'Unknown'} />
      ))}
    </div>
  );
}

function TimelineLayout({
  perfs,
  artistById,
}: {
  perfs: Performance[];
  artistById: Map<string, { name: string }>;
}) {
  // Group by stage; unassigned in their own bucket.
  const byStage = new Map<string, Performance[]>();
  const unassigned: Performance[] = [];
  for (const p of perfs) {
    if (!p.stageId) unassigned.push(p);
    else {
      const arr = byStage.get(p.stageId) ?? [];
      arr.push(p);
      byStage.set(p.stageId, arr);
    }
  }
  for (const arr of byStage.values()) {
    arr.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  }
  return (
    <div className="space-y-4">
      {STAGES.map((stage) => {
        const rows = byStage.get(stage.id);
        if (!rows?.length) return null;
        return (
          <div key={stage.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-warp-blue-500" aria-hidden />
              <h3 className="font-display text-[14px] text-primary">{stage.name}</h3>
              <span className="text-[12px] text-muted">{rows.length}</span>
            </div>
            <div className="space-y-2 border-l-2 border-warp-blue-500/20 pl-3">
              {rows.map((p) => (
                <PerfRowEditor key={p.id} perf={p} artistName={artistById.get(p.artistId)?.name ?? 'Unknown'} lockStage />
              ))}
            </div>
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden />
            <h3 className="font-display text-[14px] text-secondary">No stage yet</h3>
            <span className="text-[12px] text-muted">{unassigned.length}</span>
          </div>
          <div className="space-y-2">
            {unassigned.map((p) => (
              <PerfRowEditor key={p.id} perf={p} artistName={artistById.get(p.artistId)?.name ?? 'Unknown'} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-touch rounded-lg px-4 text-[14px] font-semibold transition',
        active ? 'bg-[var(--chip-on)] text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}

function IconTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'min-h-touch flex items-center justify-center rounded-lg px-3 transition',
        active ? 'bg-[var(--chip-on)] text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}

function MissChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'min-h-9 rounded-full border px-3 text-[12px] font-semibold',
        active ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white' : 'border-subtle bg-[var(--surface-card)] text-secondary',
      )}
    >
      {children}
    </button>
  );
}
