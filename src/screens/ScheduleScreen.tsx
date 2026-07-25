import { useState } from 'react';
import { CalendarDays, Pencil, AlertTriangle, Upload, LayoutList, ListOrdered } from 'lucide-react';
import { Screen, Button, cx } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { ConflictCard } from '@/components/ConflictCard';
import { PersonalSchedule } from './schedule/PersonalSchedule';
import { ScheduleEditor } from './schedule/ScheduleEditor';
import { BoardEntry } from './schedule/BoardEntry';
import { useApp } from '@/store/appStore';
import { useConflicts } from '@/hooks/useConflicts';
import { useScheduleStatus } from '@/hooks/useScheduleStatus';
import { ScheduleStatusStrip, ProvisionalNote } from '@/components/ScheduleStatusStrip';
import { FirstUseTip } from '@/components/FirstUseTip';
import { conflictSummary } from '@/domain/conflicts';
import { ART } from '@/config/event';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { DayId } from '@/domain/types';

type View = 'schedule' | 'editor' | 'conflicts';
/** Board mirrors the physical set-time poster; List is the alphabetical editor. */
type EntryMode = 'board' | 'list';

export function ScheduleScreen({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const scheduleLoaded = useScheduleStatus().any;
  const conflicts = useConflicts(activeUserId);
  const summary = conflictSummary(conflicts);

  const [view, setView] = useState<View>(scheduleLoaded ? 'schedule' : 'editor');
  const [entryMode, setEntryMode] = useState<EntryMode>('board');
  const [day, setDay] = useState<DayId>('saturday');

  return (
    <Screen>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-[22px] text-primary">Schedule</h1>
        <div className="flex gap-1.5">
          {/* One labeled control — the twin unlabeled glyphs read as two
              mystery buttons fused together. */}
          <Button variant="secondary" className="px-3 text-[13px]" onClick={() => onOpenMenu('schedule-io')}>
            <Upload size={15} aria-hidden />
            Import / Export
          </Button>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        <SubTab active={view === 'schedule'} onClick={() => setView('schedule')}>
          <CalendarDays size={15} aria-hidden /> My Day
        </SubTab>
        <SubTab active={view === 'editor'} onClick={() => setView('editor')}>
          <Pencil size={15} aria-hidden /> Enter Times
        </SubTab>
        <SubTab active={view === 'conflicts'} onClick={() => setView('conflicts')}>
          <AlertTriangle size={15} aria-hidden /> Conflicts
          {summary.total > 0 && (
            <span className="ml-0.5 rounded-full bg-warp-pink px-1.5 text-[10px] font-bold text-white">
              {summary.total}
            </span>
          )}
        </SubTab>
      </div>

      {view === 'editor' && (
        <>
          <div className="mb-3 flex rounded-xl bg-[var(--surface-sunken)] p-0.5">
            <ModeTab active={entryMode === 'board'} onClick={() => setEntryMode('board')}>
              <LayoutList size={15} aria-hidden /> Board
            </ModeTab>
            <ModeTab active={entryMode === 'list'} onClick={() => setEntryMode('list')}>
              <ListOrdered size={15} aria-hidden /> A–Z list
            </ModeTab>
          </div>
          {entryMode === 'board' ? <BoardEntry /> : <ScheduleEditor />}
        </>
      )}

      {view === 'schedule' &&
        (scheduleLoaded ? (
          <>
            <DayToggle day={day} setDay={setDay} />
            <ScheduleStatusStrip day={day} />
            <FirstUseTip id="schedule-import">
              Sets without a time stay listed as unknown — they are not treated as free space in
              your day.
            </FirstUseTip>
            <PersonalSchedule day={day} />
          </>
        ) : (
          <EmptyState
            Icon={CalendarDays}
            image={ART.emptySchedule}
            title="No set times yet"
            message="Warped releases stage times close to the show. Enter them here fast, or import them, and your day builds itself."
            action={
              <div className="mt-1 flex gap-2">
                <Button variant="yellow" onClick={() => setView('editor')}>
                  Enter set times
                </Button>
                <Button variant="secondary" onClick={() => onOpenMenu('schedule-io')}>
                  Import
                </Button>
              </div>
            }
          />
        ))}

      {view === 'conflicts' && (
        <ConflictsView day={day} setDay={setDay} />
      )}
    </Screen>
  );
}

function ConflictsView({ day, setDay }: { day: DayId; setDay: (d: DayId) => void }) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const performanceById = useApp((s) => s.performanceById);
  const dayComplete = useScheduleStatus().byDay[day].status === 'complete';
  const conflicts = useConflicts(activeUserId).filter((c) => {
    const p = performanceById.get(c.performanceIds[0]);
    return p?.day === day;
  });

  return (
    <>
      <DayToggle day={day} setDay={setDay} />
      <ScheduleStatusStrip day={day} compact />
      {conflicts.length === 0 ? (
        <>
          <EmptyState
            Icon={CalendarDays}
            image={ART.noConflicts}
            title={dayComplete ? 'No conflicts' : 'No conflicts so far'}
            message={
              dayComplete
                ? 'Nothing clashes on your plan for this day. Nice.'
                : 'Nothing clashes among the sets that have times yet.'
            }
          />
          <ProvisionalNote day={day} what="clashes" />
        </>
      ) : (
        <>
          <div className="space-y-2">
            {conflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} userId={activeUserId} />
            ))}
          </div>
          <ProvisionalNote day={day} what="clashes" />
        </>
      )}
    </>
  );
}

function DayToggle({ day, setDay }: { day: DayId; setDay: (d: DayId) => void }) {
  return (
    <div className="mb-3 flex rounded-xl bg-[var(--surface-sunken)] p-0.5">
      {(['saturday', 'sunday'] as DayId[]).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDay(d)}
          className={cx(
            'min-h-touch flex-1 rounded-lg text-[14px] font-semibold transition',
            day === d ? 'bg-[var(--chip-on)] text-white shadow-sm' : 'text-secondary',
          )}
        >
          {d === 'saturday' ? 'Saturday' : 'Sunday'}
        </button>
      ))}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'min-h-touch flex flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition',
        active ? 'bg-[var(--chip-on)] text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-touch flex items-center justify-center gap-1 rounded-lg text-[13px] font-semibold transition',
        active ? 'bg-[var(--chip-on)] text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}
