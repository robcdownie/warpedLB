import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MapPin, Clock, Check, Music, Unplug, Filter, Star } from 'lucide-react';
import { Screen, cx } from '@/components/ui';
import { plural } from '@/domain/plural';
import { FriendAvatar } from '@/components/FriendAvatar';
import { PriorityBadge } from '@/components/PriorityControl';
import { BandDetailSheet } from './bands/BandDetailSheet';
import { useApp } from '@/store/appStore';
import { searchArtists } from '@/domain/matching';
import { useScheduleStatus } from '@/hooks/useScheduleStatus';
import { FirstUseTip } from '@/components/FirstUseTip';
import { formatTime, dayLabel } from '@/domain/time';
import type { Performance, Priority, DayId } from '@/domain/types';

type SelState = 'selected' | 'unselected' | null;

export function BandsScreen() {
  const artists = useApp((s) => s.artists);
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const selections = useApp((s) => s.selections);
  const users = useApp((s) => s.users);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const toggleSelection = useApp((s) => s.toggleSelection);

  const [query, setQuery] = useState('');
  const [day, setDay] = useState<DayId | null>(null);
  const [type, setType] = useState<'main' | 'unplugged' | null>(null);
  const [selState, setSelState] = useState<SelState>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [openPerf, setOpenPerf] = useState<Performance | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // Measure the sticky header so the letter headers and A-Z rail stick exactly
  // below it — a hardcoded offset drifts whenever the header's height changes.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(152);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Collapse the title row while scrolling — the full sticky stack ate almost
  // half an iPhone SE screen, leaving ~2.5 of 183 cards visible at a time.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const main = headerRef.current?.closest('main');
    if (!main) return;
    const onScroll = () => setCollapsed(main.scrollTop > 56);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  // Drag-to-scrub on the A-Z rail (precision taps are hard mid-crowd).
  const railRef = useRef<HTMLDivElement>(null);
  const lastScrubbed = useRef<string | null>(null);
  const scrub = (clientY: number) => {
    const rail = railRef.current;
    if (!rail || !sections.length) return;
    const rect = rail.getBoundingClientRect();
    const idx = Math.min(
      sections.length - 1,
      Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * sections.length)),
    );
    const letter = sections[idx]?.[0];
    if (letter && letter !== lastScrubbed.current) {
      lastScrubbed.current = letter;
      jumpTo(letter, true);
    }
  };

  const activeSelById = useMemo(() => {
    const m = new Map<string, (typeof selections)[number]>();
    for (const s of selections) {
      if (s.userId === activeUserId) m.set(s.performanceId, s);
    }
    return m;
  }, [selections, activeUserId]);

  const matchedArtistIds = useMemo(
    () => searchArtists(query, artists),
    [query, artists],
  );

  const filtered = useMemo(() => {
    const rows = performances.filter((p) => {
      if (type && p.type !== type) return false;
      if (day && p.day !== day) return false;
      if (!matchedArtistIds.has(p.artistId)) return false;
      const sel = activeSelById.get(p.id);
      const isSel = !!sel?.selected;
      if (selState === 'selected' && !isSel) return false;
      if (selState === 'unselected' && isSel) return false;
      if (priority) {
        if (!isSel || sel?.priority !== priority) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const an = artistById.get(a.artistId)?.name ?? '';
      const bn = artistById.get(b.artistId)?.name ?? '';
      const c = an.localeCompare(bn, undefined, { sensitivity: 'base' });
      if (c !== 0) return c;
      // stable secondary: main before unplugged
      return a.type === b.type ? 0 : a.type === 'main' ? -1 : 1;
    });
    return rows;
  }, [performances, type, day, matchedArtistIds, activeSelById, selState, priority, artistById]);

  const selectedCount = useMemo(
    () => selections.filter((s) => s.userId === activeUserId && s.selected).length,
    [selections, activeUserId],
  );

  // Group by first letter for section headers + A-Z index.
  const sections = useMemo(() => {
    const map = new Map<string, Performance[]>();
    for (const p of filtered) {
      const name = artistById.get(p.artistId)?.name ?? '#';
      const letter = /[a-z]/i.test(name[0]) ? name[0].toUpperCase() : '#';
      const arr = map.get(letter) ?? [];
      arr.push(p);
      map.set(letter, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, artistById]);

  const anyFilter = day || type || selState || priority || query;
  const scheduleLoaded = useScheduleStatus().any;

  const clearAll = () => {
    setQuery('');
    setDay(null);
    setType(null);
    setSelState(null);
    setPriority(null);
  };

  const jumpTo = (letter: string, instant = false) => {
    const el = listRef.current?.querySelector(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <Screen>
      <div ref={headerRef} className="sticky top-0 z-10 -mx-4 border-b border-subtle bg-[var(--surface-app)] px-4 pb-2 pt-3">
        <div
          className={cx(
            'flex items-center justify-between overflow-hidden transition-all duration-200',
            collapsed ? 'mb-0 max-h-0 opacity-0' : 'mb-2 max-h-10 opacity-100',
          )}
          aria-hidden={collapsed || undefined}
        >
          <h1 className="font-display text-[22px] text-primary">My Bands</h1>
          <span className="rounded-full bg-warp-pink/15 px-2.5 py-1 text-[13px] font-bold text-pink">
            {selectedCount} selected
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists"
            aria-label="Search artists"
            className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-card)] pl-10 pr-10 text-[15px] text-primary outline-none focus:border-warp-blue-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-[var(--press)]"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="no-scrollbar scroll-fade-r -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip active={day === 'saturday'} onClick={() => setDay(day === 'saturday' ? null : 'saturday')}>
            Sat
          </Chip>
          <Chip active={day === 'sunday'} onClick={() => setDay(day === 'sunday' ? null : 'sunday')}>
            Sun
          </Chip>
          <Divider />
          <Chip active={selState === 'selected'} onClick={() => setSelState(selState === 'selected' ? null : 'selected')}>
            Selected
          </Chip>
          <Chip active={selState === 'unselected'} onClick={() => setSelState(selState === 'unselected' ? null : 'unselected')}>
            Unselected
          </Chip>
          <Divider />
          <Chip active={priority === 'must-see'} onClick={() => setPriority(priority === 'must-see' ? null : 'must-see')}>
            Must See
          </Chip>
          <Chip active={priority === 'want-to-see'} onClick={() => setPriority(priority === 'want-to-see' ? null : 'want-to-see')}>
            Want
          </Chip>
          <Chip active={priority === 'optional'} onClick={() => setPriority(priority === 'optional' ? null : 'optional')}>
            Maybe
          </Chip>
          <Divider />
          <Chip active={type === 'main'} onClick={() => setType(type === 'main' ? null : 'main')}>
            <Music size={13} aria-hidden /> Main
          </Chip>
          <Chip active={type === 'unplugged'} onClick={() => setType(type === 'unplugged' ? null : 'unplugged')}>
            <Unplug size={13} aria-hidden /> Unplugged
          </Chip>
          {anyFilter && (
            <>
              <Divider />
              <Chip active={false} onClick={clearAll}>
                <X size={13} aria-hidden /> Clear
              </Chip>
            </>
          )}
        </div>
      </div>

      <FirstUseTip id="bands" className="mt-3">
        Tap the star to add a band. Tap the card to set Must See, Want to See, or Maybe.
      </FirstUseTip>

      {/* Result count. One shared line replaces 183 identical per-card
          "Stage & time pending" rows while no set times exist. */}
      <p className="mb-2 mt-1 text-[12px] text-muted">
        {filtered.length} {filtered.length === 1 ? 'set' : 'sets'}
        {!scheduleLoaded && ' · stage & times drop close to show day — cards fill in automatically'}
      </p>

      {/* List + A-Z rail. min-w-0 is load-bearing: without it the column's
          intrinsic min-content forces the row wider than the viewport and
          pushes the A-Z rail off-screen entirely. */}
      <div className="flex gap-1" style={{ '--bands-header-h': `${headerH}px` } as React.CSSProperties}>
        <div ref={listRef} className="min-w-0 flex-1 space-y-4">
          {sections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-subtle px-6 py-10 text-center">
              <Filter size={30} className="mx-auto mb-2 text-accent" aria-hidden />
              <p className="text-[14px] text-secondary">No artists match these filters.</p>
              {anyFilter && (
                <button type="button" onClick={clearAll} className="mt-2 min-h-touch text-[13px] font-semibold text-accent">
                  Clear filters
                </button>
              )}
            </div>
          )}
          {sections.map(([letter, rows]) => (
            <div key={letter} data-letter={letter} className="scroll-mt-[calc(var(--bands-header-h)+4px)]">
              <div className="sticky top-[var(--bands-header-h)] z-[1] mb-1 bg-[var(--surface-app)] py-0.5 font-display text-[13px] text-muted">{letter}</div>
              <div className="space-y-2">
                {rows.map((p) => (
                  <BandCard
                    key={p.id}
                    perf={p}
                    name={artistById.get(p.artistId)?.name ?? 'Unknown'}
                    stageName={
                      p.stageId ? locationById.get(p.stageId)?.shortName ?? locationById.get(p.stageId)?.name : undefined
                    }
                    selection={activeSelById.get(p.id)}
                    friends={selections
                      .filter((s) => s.performanceId === p.id && s.selected && s.userId !== activeUserId)
                      .map((s) => users.find((u) => u.id === s.userId))
                      .filter((u): u is NonNullable<typeof u> => !!u)}
                    onOpen={() => setOpenPerf(p)}
                    onToggle={() => void toggleSelection(activeUserId, p.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {sections.length > 3 && (
          <div
            ref={railRef}
            className="sticky top-[calc(var(--bands-header-h)+4px)] flex h-min touch-none flex-col items-center justify-between py-1"
            /* Cap to the visible area so the rail never runs under the bottom
               nav — every letter stays reachable even on an iPhone SE. */
            style={{ maxHeight: 'calc(100dvh - var(--bands-header-h) - 170px)' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e.clientY);
            }}
            onPointerMove={(e) => {
              if (e.buttons) scrub(e.clientY);
            }}
            onPointerUp={() => { lastScrubbed.current = null; }}
          >
            {sections.map(([letter]) => (
              <button
                key={letter}
                type="button"
                onClick={() => jumpTo(letter)}
                className="flex min-h-0 w-8 flex-1 items-center justify-center text-[11px] font-bold leading-none text-accent"
                aria-label={`Jump to ${letter}`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      <BandDetailSheet
        performance={openPerf}
        artist={openPerf ? artistById.get(openPerf.artistId) : undefined}
        onClose={() => setOpenPerf(null)}
      />
    </Screen>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        onClick();
        // Keep the chip you just tapped fully visible instead of half-clipped
        // at the row's faded edge.
        e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      }}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition',
        active
          ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white'
          : 'border-subtle bg-[var(--surface-card)] text-secondary',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 w-px shrink-0 self-stretch bg-[var(--border-subtle)]" aria-hidden />;
}

function BandCard({
  perf,
  name,
  stageName,
  selection,
  friends,
  onOpen,
  onToggle,
}: {
  perf: Performance;
  name: string;
  stageName?: string;
  selection?: { selected: boolean; priority: Priority };
  friends: { id: string; name: string; initials: string; avatar: string | null; colorKey: string }[];
  onOpen: () => void;
  onToggle: () => void;
}) {
  const selected = !!selection?.selected;
  const isUnplugged = perf.type === 'unplugged';
  const hasSchedule = perf.startTime && perf.stageId;

  // Wrapper is a div so the card can hold TWO controls: the main area opens
  // the detail sheet, the star toggles selection in one tap (the core loop —
  // requiring the sheet for every pick made 183 cards a chore).
  return (
    <div
      className={cx(
        'surface-card flex w-full items-center gap-3 rounded-2xl p-3 transition',
        selected && 'ring-2 ring-warp-pink',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-90"
      >
      {/* selection indicator */}
      <span
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          selected ? 'bg-warp-pink text-white' : 'bg-[var(--surface-sunken)] text-muted',
        )}
        aria-hidden
      >
        {selected ? <Check size={18} /> : isUnplugged ? <Unplug size={16} /> : <Music size={16} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[15px] text-primary">{name}</span>
          {selection?.selected && <PriorityBadge priority={selection.priority} />}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-secondary">
          {/* Day always shows — unplugged acts have a day too. */}
          <span className="inline-flex items-center rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
            {dayLabel(perf.day)}
          </span>
          {isUnplugged && (
            <span className="inline-flex items-center rounded bg-warp-orange/15 px-1.5 py-0.5 text-[11px] font-semibold text-warp-orange">
              Unplugged
            </span>
          )}
          {hasSchedule && (
            <>
              <span className="inline-flex items-center gap-0.5">
                <Clock size={12} aria-hidden />
                {formatTime(perf.startTime)}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <MapPin size={12} aria-hidden />
                {stageName}
              </span>
            </>
          )}
        </span>
      </span>

      {friends.length > 0 && (
        <span
          className="flex shrink-0 -space-x-2"
          aria-label={`${plural(friends.length, 'friend')} also picked this`}
        >
          {friends.slice(0, 3).map((f) => (
            <FriendAvatar key={f.id} user={f as never} size={24} className="ring-2 ring-[var(--surface-card)]" />
          ))}
        </span>
      )}
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={selected ? `Remove ${name} from my bands` : `Add ${name} to my bands`}
        className="min-h-touch min-w-touch -my-1 -mr-1.5 flex shrink-0 items-center justify-center rounded-full active:bg-[var(--press)]"
      >
        <Star
          size={22}
          className={selected ? 'text-warp-pink' : 'text-muted'}
          fill={selected ? 'currentColor' : 'none'}
          aria-hidden
        />
      </button>
    </div>
  );
}
