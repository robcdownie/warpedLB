import { useMemo, useRef, useState } from 'react';
import { Check, CornerDownLeft, Search, Undo2, X } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { Button, cx } from '@/components/ui';
import { applyScheduleEdit } from './scheduleEdit';
import { searchArtists, matchArtist } from '@/domain/matching';
import { parseBoardTime, shouldAdvanceBoardTime, formatTime, hhmmToMinutes } from '@/domain/time';
import { STAGES } from '@/data/stages';
import type { Artist, DayId, Performance } from '@/domain/types';

const UNPLUGGED_STAGE_ID = 'warped-unplugged-stage';

/**
 * Board mode — set-time entry that mirrors the physical poster.
 *
 * The official times drop on a wall-sized board about an hour before music
 * starts: one column per stage, each column a top-to-bottom list of TIME then
 * BAND. This screen matches that shape so you can rattle down a column instead
 * of hunting the alphabet: pick a stage, type the time as bare digits, type a
 * few letters of the band, tap. End times are never asked for — a set counts as
 * a typical half hour unless the next set on its stage cuts it shorter (see
 * domain/endTimes.ts).
 */
export function BoardEntry() {
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const updatePerformance = useApp((s) => s.updatePerformance);
  const undo = useApp((s) => s.undoLastScheduleEdit);

  const [day, setDay] = useState<DayId>('saturday');
  const [stageId, setStageId] = useState<string>(STAGES[1]?.id ?? STAGES[0].id);
  const [timeRaw, setTimeRaw] = useState('');
  const [bandQuery, setBandQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const timeRef = useRef<HTMLInputElement>(null);
  const bandRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUnplugged = stageId === UNPLUGGED_STAGE_ID;
  const parsedTime = parseBoardTime(timeRaw);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  /** Rows that belong in this board column, in time order. */
  const column = useMemo(() => {
    return performances
      .filter((p) => p.stageId === stageId && p.day === day && p.startTime)
      .sort((a, b) => hhmmToMinutes(a.startTime!) - hhmmToMinutes(b.startTime!));
  }, [performances, stageId, day]);

  /** The pool this column draws from: main sets for the day, or any unplugged. */
  const pool = useMemo(
    () =>
      performances.filter((p) =>
        isUnplugged ? p.type === 'unplugged' : p.type === 'main' && p.day === day,
      ),
    [performances, day, isUnplugged],
  );

  const placedInPool = pool.filter((p) => p.startTime && p.stageId).length;

  /** Placed counts per stage chip, so the board fills up visibly. */
  const countByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of performances) {
      if (!p.startTime || !p.stageId) continue;
      if (p.stageId !== UNPLUGGED_STAGE_ID && p.day !== day) continue;
      m.set(p.stageId, (m.get(p.stageId) ?? 0) + 1);
    }
    return m;
  }, [performances, day]);

  /** Band suggestions: unplaced first, then already-placed (which move). */
  const suggestions = useMemo(() => {
    if (!bandQuery.trim()) return [];
    const poolArtists = pool
      .map((p) => artistById.get(p.artistId))
      .filter((a): a is Artist => !!a);

    const hits = searchArtists(bandQuery, poolArtists);
    let rows = pool.filter((p) => hits.has(p.artistId));

    // Nothing contained the query — fall back to fuzzy (handles a misread
    // letter off the board, e.g. "underoth").
    if (!rows.length) {
      const { exact, suggestions: near } = matchArtist(bandQuery, poolArtists);
      const ids = new Set([exact?.id, ...near.map((n) => n.artist.id)].filter(Boolean) as string[]);
      rows = pool.filter((p) => ids.has(p.artistId));
    }

    return rows
      .map((p) => ({
        perf: p,
        name: artistById.get(p.artistId)?.name ?? 'Unknown',
        placedAt:
          p.startTime && p.stageId
            ? `${locationById.get(p.stageId)?.shortName ?? 'Stage'} · ${formatTime(p.startTime)}`
            : null,
      }))
      .sort((a, b) => {
        // Unplaced bands first — those are what you're looking for.
        if (!a.placedAt !== !b.placedAt) return a.placedAt ? 1 : -1;
        return a.name.localeCompare(b.name);
      })
      // Four keeps the picker inside the visible strip above an open iOS
      // keyboard, even on an SE.
      .slice(0, 4);
  }, [bandQuery, pool, artistById, locationById]);

  const commit = async (perf: Performance, name: string) => {
    // Read the field itself rather than the rendered `parsedTime`: a fast
    // typist can tap a band suggestion in the same frame they finish the time,
    // before React re-renders, and the closure would still hold the old value.
    const startTime = parseBoardTime(timeRef.current?.value ?? timeRaw);
    if (!startTime) {
      flash('Enter a time first.');
      timeRef.current?.focus();
      return;
    }
    const res = applyScheduleEdit(
      perf,
      { stageId, startTime, day: isUnplugged ? day : perf.day },
      performances,
    );
    if (res.error) {
      flash(res.error);
      return;
    }
    const stageName = locationById.get(stageId)?.shortName ?? 'Stage';
    await updatePerformance(res.performance, `${stageName} ${formatTime(startTime)} — ${name}`);

    setBandQuery('');
    setTimeRaw('');
    flash(res.warnings[0] ?? `${name} → ${formatTime(startTime)}`);
    // After React flushes the cleared fields, so focus lands reliably on the
    // next row's time input (and iOS keeps the keyboard up).
    requestAnimationFrame(() => timeRef.current?.focus());
  };

  const clearRow = async (perf: Performance, name: string) => {
    const res = applyScheduleEdit(perf, { stageId: null, startTime: null, endTime: null }, performances);
    await updatePerformance(res.performance, `Cleared ${name}`);
    flash(`Removed ${name}`);
  };

  const doUndo = async () => {
    flash((await undo()) ? 'Reverted last entry.' : 'Nothing to undo.');
  };

  return (
    <div>
      {/* Day */}
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

      {/* Stage chips — one per board column */}
      <div className="no-scrollbar scroll-fade-x -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
        {STAGES.map((s) => {
          const active = s.id === stageId;
          const n = countByStage.get(s.id) ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={(e) => {
                setStageId(s.id);
                setBandQuery('');
                e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
              }}
              aria-pressed={active}
              className={cx(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
                active
                  ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white'
                  : 'border-subtle bg-[var(--surface-card)] text-secondary',
              )}
            >
              {s.shortName ?? s.name}
              {n > 0 && (
                <span
                  className={cx(
                    'rounded-full px-1.5 text-[11px] font-bold',
                    active ? 'bg-white/25 text-white' : 'bg-[var(--surface-sunken)] text-muted',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress for the pool this column draws from */}
      <div className="mb-2 flex items-center justify-between text-[12px] text-secondary">
        <span>
          {placedInPool}/{pool.length} {isUnplugged ? 'unplugged' : day === 'saturday' ? 'Saturday' : 'Sunday'} sets
          placed
        </span>
        <Button variant="secondary" className="min-h-9 px-2.5 text-[12px]" onClick={doUndo}>
          <Undo2 size={14} aria-hidden /> Undo
        </Button>
      </div>

      {/* Add row — type time, type band, tap. Pinned above the column so it
          stays put once the stage chips scroll away. */}
      <div className="surface-card sticky top-0 z-10 mb-3 rounded-xl p-3">
        {/* Names the column being built: the chips are gone once you scroll. */}
        <p className="mb-2 font-display text-[13px] text-primary">
          {locationById.get(stageId)?.name ?? 'Stage'}
          <span className="ml-1.5 font-sans text-[12px] font-normal text-muted">
            {isUnplugged ? `${day === 'saturday' ? 'Saturday' : 'Sunday'} · sets the day too` : `${column.length} set${column.length === 1 ? '' : 's'}`}
          </span>
        </p>
        <div className="flex gap-2">
          <div className="w-[38%]">
            <label className="mb-0.5 block text-[11px] font-semibold text-muted" htmlFor="board-time">
              Time
            </label>
            <input
              id="board-time"
              ref={timeRef}
              value={timeRaw}
              onChange={(e) => {
                const next = e.target.value;
                setTimeRaw(next);
                // Hop to the band field the moment the digits can only mean
                // one time — saves a tap on every row.
                if (shouldAdvanceBoardTime(next)) bandRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  bandRef.current?.focus();
                }
              }}
              // Digits only: the board's times are unambiguous inside festival
              // hours, so "205" is enough for 2:05 PM — no AM/PM tap needed.
              inputMode="numeric"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="205"
              className="min-h-touch w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-2 text-[16px] font-semibold text-primary outline-none focus:border-warp-blue-400"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-0.5 block text-[11px] font-semibold text-muted" htmlFor="board-band">
              Band
            </label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="board-band"
                ref={bandRef}
                value={bandQuery}
                onChange={(e) => setBandQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && suggestions[0]) {
                    e.preventDefault();
                    void commit(suggestions[0].perf, suggestions[0].name);
                  }
                }}
                enterKeyHint="go"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Type a few letters"
                className="min-h-touch w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-sunken)] pl-8 pr-2 text-[16px] text-primary outline-none focus:border-warp-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Live read-back so a mistyped time is caught before it commits. */}
        <p className={cx('mt-1.5 text-[12px]', parsedTime ? 'text-accent' : 'text-muted')}>
          {timeRaw
            ? parsedTime
              ? `→ ${formatTime(parsedTime)}`
              : "Can't read that time yet"
            : 'Type the time as digits — 205 is 2:05 PM'}
        </p>

        {suggestions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {suggestions.map(({ perf, name, placedAt }) => (
              <li key={perf.id}>
                <button
                  type="button"
                  // Keep focus in the text input so iOS never dismisses the
                  // keyboard between rows — a 250ms animation on every one of
                  // ~150 entries is the difference between fast and unusable.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => void commit(perf, name)}
                  className="flex min-h-touch w-full items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 text-left active:opacity-80"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-primary">{name}</span>
                  {placedAt ? (
                    <span className="shrink-0 text-[11px] font-semibold text-warn">on {placedAt} — move</span>
                  ) : (
                    <CornerDownLeft size={15} className="shrink-0 text-accent" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {bandQuery.trim() && suggestions.length === 0 && (
          <p className="mt-2 text-[12px] text-muted">
            No {isUnplugged ? 'unplugged' : day === 'saturday' ? 'Saturday' : 'Sunday'} band matches
            “{bandQuery}”.
          </p>
        )}
      </div>

      {toast && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">
          <Check size={13} aria-hidden /> {toast}
        </p>
      )}

      {/* The column as it stands, in board order */}
      {column.length === 0 ? (
        <p className="rounded-xl border border-dashed border-subtle px-4 py-6 text-center text-[13px] text-muted">
          Nothing on this stage yet. Read down the board column and add each set above.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {column.map((p) => {
            const name = artistById.get(p.artistId)?.name ?? 'Unknown';
            return (
              <li key={p.id} className="surface-card flex items-center gap-3 rounded-xl p-2.5">
                <span className="w-[74px] shrink-0 font-display text-[14px] text-primary tabular-nums">
                  {formatTime(p.startTime)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-primary">{name}</span>
                <button
                  type="button"
                  onClick={() => void clearRow(p, name)}
                  aria-label={`Remove ${name} from this stage`}
                  className="min-h-touch min-w-touch -my-1 flex shrink-0 items-center justify-center rounded-full text-muted active:bg-[var(--press)]"
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
