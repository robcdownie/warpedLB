import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CornerDownLeft, Info, Plus, Search, Undo2, X } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { Button, cx } from '@/components/ui';
import { applyScheduleEdit } from './scheduleEdit';
import { rankArtists, nearArtists } from '@/domain/matching';
import {
  parseBoardTime,
  shouldAdvanceBoardTime,
  formatTime,
  hhmmToMinutes,
  getNow,
} from '@/domain/time';
import { STAGES } from '@/data/stages';
import type { Artist, DayId, Performance } from '@/domain/types';

type Tone = 'ok' | 'warn' | 'error';
interface Toast {
  text: string;
  tone: Tone;
}

const UNPLUGGED_STAGE_ID = 'warped-unplugged-stage';

/**
 * Board mode — set-time entry that mirrors the physical poster.
 *
 * The official times drop on a wall-sized board about an hour before music
 * starts: one column per stage, each column a top-to-bottom list of TIME then
 * BAND. This screen matches that shape so you can rattle down a column instead
 * of hunting the alphabet: pick a stage, type the time as bare digits, type a
 * few letters of the band, tap. End times are never asked for — a set counts as
 * a typical length for its slot unless the next set on its stage cuts it
 * shorter (see domain/endTimes.ts).
 */
export function BoardEntry() {
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const selections = useApp((s) => s.selections);
  const updatePerformance = useApp((s) => s.updatePerformance);
  const addBoardBand = useApp((s) => s.addBoardBand);
  const updateSettings = useApp((s) => s.updateSettings);
  const undo = useApp((s) => s.undoLastScheduleEdit);
  const savedDay = useApp((s) => s.settings.boardDay);
  const savedStageId = useApp((s) => s.settings.boardStageId);
  const picksOnly = useApp((s) => s.settings.boardPicksOnly);

  // Where you were up to survives a phone lock — losing the column and stage
  // on every relaunch cost five taps to get back, dozens of times a day. With
  // nothing saved, start on today rather than always day one.
  const [day, setDayState] = useState<DayId>(savedDay ?? getNow().day ?? 'saturday');
  const [stageId, setStageIdState] = useState<string>(
    savedStageId ?? STAGES[1]?.id ?? STAGES[0].id,
  );
  const [timeRaw, setTimeRaw] = useState('');
  const [bandQuery, setBandQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const timeRef = useRef<HTMLInputElement>(null);
  const bandRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDay = (d: DayId) => {
    setDayState(d);
    void updateSettings({ boardDay: d });
  };
  const setStageId = (id: string) => {
    setStageIdState(id);
    void updateSettings({ boardStageId: id });
  };

  const isUnplugged = stageId === UNPLUGGED_STAGE_ID;
  const parsedTime = parseBoardTime(timeRaw);

  const flash = (text: string, tone: Tone = 'ok') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === 'ok' ? 2200 : 4000);
  };

  /** Rows that belong in this board column, in time order. */
  const column = useMemo(() => {
    return performances
      .filter((p) => p.stageId === stageId && p.day === day && p.startTime)
      .sort((a, b) => hhmmToMinutes(a.startTime!) - hhmmToMinutes(b.startTime!));
  }, [performances, stageId, day]);

  /** Everything that could go in this column: main sets for the day, or unplugged. */
  const fullPool = useMemo(
    () =>
      performances.filter((p) =>
        isUnplugged ? p.type === 'unplugged' : p.type === 'main' && p.day === day,
      ),
    [performances, day, isUnplugged],
  );

  /** Sets somebody in the crew actually picked. */
  const pickedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of selections) if (s.selected) ids.add(s.performanceId);
    return ids;
  }, [selections]);

  const picked = useMemo(() => fullPool.filter((p) => pickedIds.has(p.id)), [fullPool, pickedIds]);
  // The board has 76 sets; the crew starred maybe 25. Narrowing the pool makes
  // the pre-music job finishable — and it's a shortcut, never a wall: a band
  // outside the picks still surfaces in the search, flagged, so the whole board
  // stays enterable.
  const narrowed = picksOnly && picked.length > 0;
  const pool = narrowed ? picked : fullPool;

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

  /** Band suggestions, best match first. */
  const { rows: suggestions, more } = useMemo(() => {
    const q = bandQuery.trim();
    if (!q) return { rows: [], more: 0 };

    const rank = (perfs: Performance[], outside: boolean) => {
      const byArtist = new Map(perfs.map((p) => [p.artistId, p]));
      const artists = [...byArtist.keys()]
        .map((id) => artistById.get(id))
        .filter((a): a is Artist => !!a);
      return rankArtists(q, artists).map((r) => ({
        perf: byArtist.get(r.artist.id)!,
        artist: r.artist,
        score: r.score,
        outside,
      }));
    };

    let hits = rank(pool, false);
    // Narrowed to the picks and nothing matched? Widen to the rest of the board
    // rather than claiming the band doesn't exist.
    if (narrowed) {
      const rest = fullPool.filter((p) => !pickedIds.has(p.id));
      hits = [...hits, ...rank(rest, true)];
    }

    // Still nothing — a name misread off the board in the sun.
    if (!hits.length) {
      const byArtist = new Map(fullPool.map((p) => [p.artistId, p]));
      const artists = [...byArtist.keys()]
        .map((id) => artistById.get(id))
        .filter((a): a is Artist => !!a);
      hits = nearArtists(q, artists).map((artist) => ({
        perf: byArtist.get(artist.id)!,
        artist,
        score: 3,
        outside: !pickedIds.has(byArtist.get(artist.id)!.id),
      }));
    }

    const rows = hits
      .map((h) => ({
        perf: h.perf,
        name: h.artist.name,
        score: h.score,
        outside: h.outside,
        placedAt:
          h.perf.startTime && h.perf.stageId
            ? `${locationById.get(h.perf.stageId)?.shortName ?? 'Stage'} · ${formatTime(h.perf.startTime)}`
            : null,
      }))
      // Relevance first. An unplaced band breaks ties — that's usually the one
      // being read off the board.
      .sort(
        (a, b) =>
          a.score - b.score ||
          Number(!!a.placedAt) - Number(!!b.placedAt) ||
          a.name.length - b.name.length,
      );

    // Four keeps the picker inside the visible strip above an open iOS
    // keyboard, even on an SE — but say so when there are more.
    return { rows: rows.slice(0, 4), more: Math.max(0, rows.length - 4) };
  }, [bandQuery, pool, fullPool, narrowed, pickedIds, artistById, locationById]);

  const commit = async (perf: Performance, name: string) => {
    // Read the field itself rather than the rendered `parsedTime`: a fast
    // typist can tap a band suggestion in the same frame they finish the time,
    // before React re-renders, and the closure would still hold the old value.
    const startTime = parseBoardTime(timeRef.current?.value ?? timeRaw);
    if (!startTime) {
      flash('Enter a time first.', 'error');
      timeRef.current?.focus();
      return;
    }
    const res = applyScheduleEdit(
      perf,
      { stageId, startTime, day: isUnplugged ? day : perf.day },
      performances,
    );
    if (res.error) {
      flash(res.error, 'error');
      return;
    }
    const stageName = locationById.get(stageId)?.shortName ?? 'Stage';
    await updatePerformance(res.performance, `${stageName} ${formatTime(startTime)} — ${name}`);

    setBandQuery('');
    setTimeRaw('');
    // A warning used to REPLACE the confirmation, so a clashing entry looked
    // like it hadn't saved. Say both: it saved, and here's the catch.
    flash(
      res.warnings[0]
        ? `${name} → ${formatTime(startTime)} — ${res.warnings[0]}`
        : `${name} → ${formatTime(startTime)}`,
      res.warnings[0] ? 'warn' : 'ok',
    );
    // After React flushes the cleared fields, so focus lands reliably on the
    // next row's time input (and iOS keeps the keyboard up).
    requestAnimationFrame(() => timeRef.current?.focus());
  };

  /** Create a band that isn't in the announced lineup, then place it. */
  const addAndCommit = async (raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!parseBoardTime(timeRef.current?.value ?? timeRaw)) {
      flash('Enter a time first.', 'error');
      timeRef.current?.focus();
      return;
    }
    const perf = await addBoardBand({
      name,
      day,
      type: isUnplugged ? 'unplugged' : 'main',
    });
    if (!perf) {
      flash("That name can't be used — check the spelling.", 'error');
      return;
    }
    await commit(perf, name);
  };

  const clearRow = async (perf: Performance, name: string) => {
    const res = applyScheduleEdit(
      perf,
      // An unplugged set keeps its stage — that's a seed invariant, not an
      // assignment, and clearing it strands the row.
      {
        stageId: perf.type === 'unplugged' ? perf.stageId : null,
        startTime: null,
        endTime: null,
      },
      performances,
    );
    await updatePerformance(res.performance, `Cleared ${name}`);
    flash(`Removed ${name} — tap Undo to put it back`, 'warn');
  };

  const doUndo = async () => {
    const ok = await undo();
    flash(ok ? 'Reverted last entry.' : 'Nothing to undo.', ok ? 'ok' : 'error');
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
                // A time left over from the last column would otherwise commit
                // into this one on the next band tap.
                setTimeRaw('');
                e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
                requestAnimationFrame(() => timeRef.current?.focus());
              }}
              aria-pressed={active}
              className={cx(
                'inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
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
      <div className="mb-2 flex items-center justify-between gap-2 text-[12px] text-secondary">
        <span className="min-w-0">
          <b className="text-primary">
            {placedInPool}/{pool.length}
          </b>{' '}
          {narrowed ? 'of our picks' : isUnplugged ? 'unplugged sets' : 'sets on the board'} placed
        </span>
        <Button variant="secondary" className="min-h-touch px-2.5 text-[12px]" onClick={doUndo}>
          <Undo2 size={14} aria-hidden /> Undo
        </Button>
      </div>

      {/* The board has ~76 sets and the crew starred a fraction of them. This
          is the difference between a finishable job and a 76-row transcription
          before music starts. */}
      {picked.length > 0 && (
        <button
          type="button"
          onClick={() => void updateSettings({ boardPicksOnly: !picksOnly })}
          aria-pressed={picksOnly}
          className={cx(
            'mb-3 flex min-h-touch w-full items-center gap-2 rounded-xl border px-3 text-left text-[13px]',
            picksOnly
              ? 'border-[var(--chip-on-border)] bg-accent-soft text-accent'
              : 'border-subtle bg-[var(--surface-card)] text-secondary',
          )}
        >
          <Check size={15} className={cx(!picksOnly && 'opacity-30')} aria-hidden />
          <span className="min-w-0 flex-1">
            {picksOnly ? (
              <>
                Showing our {picked.length} picks — bands outside them still come up when you search
              </>
            ) : (
              <>Showing all {fullPool.length} sets on the board</>
            )}
          </span>
        </button>
      )}

      {/* Add row — type time, type band, tap. Pinned above the column so it
          stays put once the stage chips scroll away. */}
      <div className="surface-card sticky top-0 z-10 mb-3 rounded-xl p-3">
        {/* Names the column being built: the chips are gone once you scroll,
            and typing a whole column into the wrong stage is silent — nothing
            collides, because the wrong column is empty. */}
        <p className="mb-2 font-display text-[17px] leading-tight text-primary">
          {locationById.get(stageId)?.name ?? 'Stage'}
          <span className="ml-1.5 font-sans text-[12px] font-normal text-muted">
            {day === 'saturday' ? 'Saturday' : 'Sunday'}
            {isUnplugged
              ? ' · sets the day too'
              : ` · ${column.length} set${column.length === 1 ? '' : 's'}`}
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
                  if (e.key !== 'Enter' || !suggestions[0]) return;
                  e.preventDefault();
                  // Only commit blind when the top hit is unambiguous: the name
                  // starts with what you typed, or it's the only candidate.
                  // Otherwise Go would silently file the wrong band.
                  if (suggestions.length === 1 || suggestions[0].score === 0) {
                    void commit(suggestions[0].perf, suggestions[0].name);
                  } else {
                    flash('More than one band matches — tap the right one.', 'warn');
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

        {/* Live read-back so a mistyped time is caught before it commits. This
            is the only thing between a typo and a wrong set time, ~76 times a
            day — it gets read at a glance, so it's sized to be glanceable. */}
        <p
          className={cx(
            'mt-1.5 text-[15px] font-semibold',
            !timeRaw ? 'text-muted' : parsedTime ? 'text-accent' : 'text-danger',
          )}
        >
          {timeRaw
            ? parsedTime
              ? `→ ${formatTime(parsedTime)}`
              : "Can't read that time yet"
            : 'Type the time as digits — 205 is 2:05 PM'}
        </p>

        {suggestions.length > 0 && (
          <ul className="mt-2 space-y-2">
            {suggestions.map(({ perf, name, placedAt, outside }) => (
              <li key={perf.id}>
                <button
                  type="button"
                  // Keep focus in the text input so iOS never dismisses the
                  // keyboard between rows — a 250ms animation on every one of
                  // ~150 entries is the difference between fast and unusable.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => void commit(perf, name)}
                  className="flex min-h-[52px] w-full items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 text-left active:opacity-80"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-primary">
                      {name}
                    </span>
                    {outside && (
                      <span className="block text-[11px] text-muted">not in our picks</span>
                    )}
                  </span>
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
        {more > 0 && (
          <p className="mt-1.5 text-[12px] text-muted">
            +{more} more {more === 1 ? 'match' : 'matches'} — type another letter or two.
          </p>
        )}
        {/* A band on the wall that isn't in the announced lineup used to be a
            dead end — the set simply couldn't be entered, and the day would
            still count itself complete around the hole. */}
        {bandQuery.trim() && suggestions.length === 0 && (
          <div className="mt-2">
            <p className="flex items-start gap-1.5 text-[12px] text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              No {isUnplugged ? 'unplugged' : day === 'saturday' ? 'Saturday' : 'Sunday'} band
              matches “{bandQuery.trim()}” — check the spelling, or add it as a late addition.
            </p>
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void addAndCommit(bandQuery)}
              className="mt-1.5 flex min-h-touch w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] px-3 text-left text-[13px] font-semibold text-accent active:opacity-80"
            >
              <Plus size={15} className="shrink-0" aria-hidden />
              Add “{bandQuery.trim()}” to the board
            </button>
          </div>
        )}
      </div>

      {/* Tone and icon, not just text: at 76 rows in sunlight this strip gets
          read by colour and shape. Everything used to be a green tick — including
          "Enter a time first" and "that didn't save". */}
      {toast && (
        <p
          className={cx(
            'mb-2 flex items-start gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
            toast.tone === 'ok'
              ? 'bg-accent-soft text-accent'
              : toast.tone === 'warn'
                ? 'bg-warp-yellow/20 text-warn'
                : 'bg-warp-danger/15 text-danger',
          )}
          role={toast.tone === 'ok' ? undefined : 'alert'}
        >
          {toast.tone === 'ok' ? (
            <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
          ) : toast.tone === 'warn' ? (
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          )}
          {toast.text}
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
                <span className="min-w-0 flex-1 truncate text-[14px] text-primary">
                  {name}
                  {p.addedLocally && (
                    <span className="ml-1.5 rounded-full bg-[var(--surface-sunken)] px-1.5 text-[10px] font-semibold text-muted">
                      added
                    </span>
                  )}
                </span>
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
