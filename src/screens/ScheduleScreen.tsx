import { useMemo, useState } from 'react';
import { CalendarDays, Pencil, AlertTriangle, Upload, LayoutList, ListOrdered, RotateCcw } from 'lucide-react';
import { Screen, Button, Card, cx } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { ConflictCard, DroppedStrip } from '@/components/ConflictCard';
import { PersonalSchedule } from './schedule/PersonalSchedule';
import { ScheduleEditor } from './schedule/ScheduleEditor';
import { BoardEntry } from './schedule/BoardEntry';
import { useApp } from '@/store/appStore';
import { useConflicts } from '@/hooks/useConflicts';
import { useScheduleStatus } from '@/hooks/useScheduleStatus';
import { ScheduleStatusStrip, ProvisionalNote } from '@/components/ScheduleStatusStrip';
import { FirstUseTip } from '@/components/FirstUseTip';
import { conflictSummary, conflictDay, sortByClock } from '@/domain/conflicts';
import { getNow, dayLabel } from '@/domain/time';
import { recoverablePicks, planCount } from '@/domain/recovery';
import { withEffectiveEnds } from '@/domain/endTimes';
import { ART } from '@/config/event';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { DayId } from '@/domain/types';

type View = 'schedule' | 'editor' | 'conflicts';
/** Board mirrors the physical set-time poster; List is the alphabetical editor. */
type EntryMode = 'board' | 'list';

export function ScheduleScreen({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const status = useScheduleStatus();
  const conflicts = useConflicts(activeUserId);
  const performanceById = useApp((s) => s.performanceById);
  const ignoredConflicts = useApp((s) => s.settings.ignoredConflicts);

  const updateSettings = useApp((s) => s.updateSettings);
  const savedView = useApp((s) => s.settings.scheduleView);

  // Today's day, so day two doesn't open on day one's plan.
  const today = getNow().day ?? 'saturday';
  // Come back to whichever view you were last on. The old rule — "any day has
  // sets, so show My Day" — sent you to the plan from Sunday morning onward
  // with Sunday's board still untyped, and every phone lock cost five taps to
  // get back. First run falls back to whether today is entered at all.
  const [view, setViewState] = useState<View>(
    savedView ?? (status.byDay[today].status === 'empty' ? 'editor' : 'schedule'),
  );
  const setView = (v: View) => {
    setViewState(v);
    void updateSettings({ scheduleView: v });
  };
  const [entryMode, setEntryMode] = useState<EntryMode>('board');
  const [day, setDay] = useState<DayId>(today);

  // The badge used to count BOTH days including every info note, in the pink
  // reserved for a real must-see clash — so an unentered board read as ~100
  // alarms, none of which were clashes. Count what's actually a decision, on
  // the day being looked at, and colour it by what it is.
  const summary = useMemo(() => {
    const onDay = conflicts.filter(
      (c) => conflictDay(c, performanceById) === day && !ignoredConflicts.includes(c.id),
    );
    return conflictSummary(onDay);
  }, [conflicts, performanceById, day, ignoredConflicts]);
  const badgeCount = summary.high + summary.warn;

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
          {badgeCount > 0 && (
            <span
              className={cx(
                'ml-0.5 rounded-full px-1.5 text-[10px] font-bold text-white',
                summary.high > 0 ? 'bg-warp-pink' : 'bg-warp-yellow text-warp-ink',
              )}
            >
              {badgeCount}
            </span>
          )}
        </SubTab>
      </div>

      {view === 'editor' && (
        <>
          {/*
            The shortcut belongs here, not in onboarding. Asking a brand-new user
            for a set-times code before they've seen the app reads as a
            requirement they can't meet; offering it to someone already looking
            at an empty board reads as a favour.
          */}
          <FirstUseTip id="board-code">
            Typing the whole board is a chore. If somebody already did it, you can{' '}
            <button
              type="button"
              onClick={() => onOpenMenu('schedule-io')}
              className="font-bold text-warn underline underline-offset-2"
            >
              paste their code instead
            </button>{' '}
            and skip all of this.
          </FirstUseTip>
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
        (status.any ? (
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
            message="Warped posts stage times on a board close to showtime. Paste a code someone else already typed in, or enter them yourself — either way your day builds itself."
            action={
              <div className="mt-1 flex gap-2">
                <Button variant="yellow" onClick={() => onOpenMenu('schedule-io')}>
                  Paste a code
                </Button>
                <Button variant="secondary" onClick={() => setView('editor')}>
                  Enter them myself
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
  const artistById = useApp((s) => s.artistById);
  const selections = useApp((s) => s.selections);
  const performances = useApp((s) => s.performances);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const setAttendance = useApp((s) => s.setAttendance);
  const ignored = useApp((s) => s.settings.ignoredConflicts);
  const ignoreConflict = useApp((s) => s.ignoreConflict);
  const unignoreConflicts = useApp((s) => s.unignoreConflicts);
  const dayComplete = useScheduleStatus().byDay[day].status === 'complete';
  const all = useConflicts(activeUserId);

  const { decisions, notes, hiddenCount } = useMemo(() => {
    const onDay = all.filter((c) => conflictDay(c, performanceById) === day);
    const visible = onDay.filter((c) => !ignored.includes(c.id));
    return {
      // Real clashes in the order they'll happen; missing-data notes below,
      // where they can't bury a decision.
      decisions: sortByClock(
        visible.filter((c) => c.type !== 'missing-stage' && c.type !== 'missing-time'),
        performanceById,
      ),
      notes: visible.filter((c) => c.type === 'missing-stage' || c.type === 'missing-time'),
      hiddenCount: onDay.length - visible.length,
    };
  }, [all, performanceById, day, ignored]);
  const conflicts = [...decisions, ...notes];

  const count = useMemo(
    () => planCount(activeUserId, day, selections, performanceById),
    [activeUserId, day, selections, performanceById],
  );

  // Bands the app dropped for clashes that have since stopped being real. This
  // is the only way back: a skipped pick leaves the conflict engine entirely,
  // so nothing else would ever mention them again.
  const recoverable = useMemo(
    () =>
      recoverablePicks({
        userId: activeUserId,
        selections,
        performanceById,
        artistById,
        ends: withEffectiveEnds(performances, turnoverBuffer),
      }).filter((r) => r.day === day),
    [activeUserId, selections, performanceById, artistById, performances, turnoverBuffer, day],
  );

  const restoreAll = async () => {
    for (const r of recoverable) await setAttendance(activeUserId, r.performanceId, 'undecided');
  };

  // Held here, not in the card: choosing resolves the conflict and unmounts it.
  const [justDropped, setJustDropped] = useState<{ ids: string[]; names: string[] } | null>(null);
  const undoDrop = async () => {
    if (!justDropped) return;
    for (const pid of justDropped.ids) await setAttendance(activeUserId, pid, 'undecided');
    setJustDropped(null);
  };

  return (
    <>
      <DayToggle day={day} setDay={setDay} />
      <ScheduleStatusStrip day={day} compact />

      {justDropped && (
        <DroppedStrip className="mb-2" names={justDropped.names} onUndo={() => void undoDrop()} />
      )}

      {/* How much day is left, while you're deciding — not two screens later. */}
      {count.picked > 0 && (
        <p className="mb-2 px-1 text-[12px] text-secondary">
          <b className="text-primary">
            {count.onPlan} of {count.picked}
          </b>{' '}
          {dayLabel(day)} picks still on your plan.
        </p>
      )}

      {recoverable.length > 0 && (
        <Card className="mb-3 border-warp-ok/40 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <RotateCcw size={15} className="text-ok" aria-hidden />
            <span className="font-display text-[14px] text-primary">
              {recoverable.length === 1
                ? '1 band was dropped for a clash that no longer exists'
                : `${recoverable.length} bands were dropped for clashes that no longer exist`}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-secondary">
            {recoverable.map((r) => r.artistName).join(', ')} — nothing on your plan competes with{' '}
            {recoverable.length === 1 ? 'it' : 'them'} any more.
          </p>
          <button
            type="button"
            onClick={() => void restoreAll()}
            className="mt-2 min-h-touch rounded-lg bg-warp-blue-500 px-3 text-[13px] font-semibold text-white"
          >
            Put {recoverable.length === 1 ? 'it' : 'them'} back on my day
          </button>
        </Card>
      )}
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
          {hiddenCount > 0 && (
            <IgnoredNote count={hiddenCount} onShow={() => void unignoreConflicts()} />
          )}
          <ProvisionalNote day={day} what="clashes" />
        </>
      ) : (
        <>
          {notes.length > 0 && decisions.length > 0 && (
            <p className="mb-2 px-1 text-[12px] text-secondary">
              {decisions.length} to decide · {notes.length} still missing a stage or time
            </p>
          )}
          <div className="space-y-2">
            {conflicts.map((c) => (
              <ConflictCard
                key={c.id}
                conflict={c}
                onIgnore={(x) => void ignoreConflict(x.id)}
                userId={activeUserId}
                onDropped={(ids, names) => setJustDropped({ ids, names })}
              />
            ))}
          </div>
          {hiddenCount > 0 && (
            <IgnoredNote count={hiddenCount} onShow={() => void unignoreConflicts()} />
          )}
          <ProvisionalNote day={day} what="clashes" />
        </>
      )}
    </>
  );
}

/** Ignored conflicts stay counted and reversible — never silently gone. */
function IgnoredNote({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2 px-1">
      <span className="min-w-0 flex-1 text-[12px] text-muted">
        {count} ignored on this day.
      </span>
      <button
        type="button"
        onClick={onShow}
        className="min-h-touch shrink-0 text-[12px] font-semibold text-accent"
      >
        Show again
      </button>
    </div>
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
