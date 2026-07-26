import { useMemo, useRef, useState } from 'react';
import { MapPin, Crosshair, X, Check, Clock, Sparkles, Filter, Footprints, TriangleAlert, Trash2 } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { MapCanvas, type MapCanvasHandle } from './map/MapCanvas';
import { LocationPin, FriendPin, FriendClusterPin } from './map/MapPins';
import { EssentialsStrip, nearestMatch, type Essential } from './map/EssentialsStrip';
import { FriendAvatar } from '@/components/FriendAvatar';
import { FirstUseTip } from '@/components/FirstUseTip';
import { useApp } from '@/store/appStore';
import { useGroupCtx } from '@/hooks/useGroupCtx';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { useFestivalClock } from '@/hooks/useFestivalClock';
import { positionWithCheckin, positionBadge, type PlannedPosition } from '@/domain/positions';
import { locationVisible, stagesWithSelections } from './map/visibility';
import { FILTER_LABELS, type FilterKey } from './map/markerMeta';
import { travelMinutes, overrideMap, MAP_ASPECT } from '@/domain/travel';
import { formatMinutes, hhmmToMinutes, formatRelative, formatDuration } from '@/domain/time';
import { withEffectiveEnds } from '@/domain/endTimes';
import { EVENT } from '@/config/event';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { DayId, MapLocation, User } from '@/domain/types';

const OPEN = hhmmToMinutes(EVENT.festivalHours.opens);
const CLOSE = hhmmToMinutes(EVENT.festivalHours.closes);

const FILTER_ORDER: FilterKey[] = [
  'friends', 'stages', 'selected', 'food', 'water', 'restrooms', 'firstaid',
  'bars', 'lockers', 'merch', 'accessibility', 'vip', 'entrances',
  'experiences', 'extreme', 'vendors', 'sponsor', 'custom',
];

interface FriendPosition {
  user: User;
  pos: PlannedPosition;
  loc?: MapLocation;
}

export function MapScreen({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const { now, day: defaultDay, atMinute: liveMinute, live } = useFestivalClock(30000);

  const locations = useApp((s) => s.locations);
  const checkins = useApp((s) => s.checkins);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const staleMinutes = useApp((s) => s.settings.staleMinutes);
  const mapMeta = useApp((s) => s.settings.map);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const overridesArr = useApp((s) => s.travelOverrides);
  const putCheckIn = useApp((s) => s.putCheckIn);
  const clearCheckInsFor = useApp((s) => s.clearCheckInsFor);
  const ctx = useGroupCtx();
  const plans = usePlanStatuses();

  // Stages + entrances start explicitly ON (they used to be an invisible
  // "empty set" default, which made the Stages chip look like a no-op — the
  // chips should honestly reflect what's on the map).
  const [active, setActive] = useState<Set<FilterKey>>(new Set(['friends', 'stages', 'entrances']));
  const [matterNow, setMatterNow] = useState(false);
  const [essential, setEssential] = useState<Essential | null>(null);
  const [day, setDay] = useState<DayId>(defaultDay);
  const [sliderMin, setSliderMin] = useState<number>(() => (live ? liveMinute : 15 * 60));
  const [followNow, setFollowNow] = useState(live);
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [checkInMode, setCheckInMode] = useState(false);
  const mapRef = useRef<MapCanvasHandle>(null);

  // Following live time must NOT be clamped: at 10:20 PM the "Following now"
  // pill was lit while the clock read 10:00 and every friend was frozen there.
  const atMinute = followNow && live ? liveMinute : sliderMin;
  // And the slider has to reach whatever the day actually runs to — a 9:50 PM
  // set with a 50-minute assumed end lives past the published closing time.
  const sliderMax = useMemo(() => {
    const ends = withEffectiveEnds(ctx.allPerformances, ctx.turnoverBuffer);
    let latest = CLOSE;
    for (const p of ctx.allPerformances) {
      if (p.day !== day || !p.startTime) continue;
      const end = ends.get(p.id)?.minutes;
      if (end && end > latest) latest = end;
    }
    // Ceiling allows the after-midnight window the clock now keeps running.
    return Math.min(27 * 60, Math.max(latest, live ? liveMinute : CLOSE));
  }, [ctx.allPerformances, ctx.turnoverBuffer, day, live, liveMinute]);

  const selectedStages = useMemo(
    () => stagesWithSelections(selections, performanceById),
    [selections, performanceById],
  );

  const locFilters = useMemo(() => new Set([...active].filter((k) => k !== 'friends')), [active]);
  const showFriends = active.has('friends') || matterNow;

  // Friend positions at the chosen time. A person with no imported plan gets
  // NO pin — an invented position is worse than an absent one (plan §P0-2).
  const friendPositions = useMemo<FriendPosition[]>(() => {
    return ctx.users.map((u) => {
      const pos = positionWithCheckin(u.id, day, atMinute, checkins, now.getTime(), staleMinutes, {
        selections: ctx.selections,
        performanceById: ctx.performanceById,
        locationById: ctx.locationById,
        allPerformances: ctx.allPerformances,
        crowd: ctx.crowd,
        turnoverBuffer: ctx.turnoverBuffer,
        overrides: ctx.overrides,
      });
      const locId = pos.towardLocationId ?? pos.locationId;
      const loc = locId ? ctx.locationById.get(locId) : undefined;
      return { user: u, pos, loc };
    });
  }, [ctx, day, atMinute, checkins, now, staleMinutes]);

  // Co-located friends collapse into one cluster chip — the old x-offset
  // fan-out still half-hid avatars at default zoom, and a hidden pin reads
  // as a lost friend.
  const friendGroups = useMemo(() => {
    const byLoc = new Map<string, FriendPosition[]>();
    // A check-in on bare map has coordinates but no known location. It used to
    // be dropped here and never drawn — so "I'm here" on a spot with no pin
    // removed you from the map for the whole staleness window.
    const loose: FriendPosition[][] = [];
    for (const fp of friendPositions) {
      if (!fp.loc) {
        if (fp.pos.coordinates) loose.push([fp]);
        continue;
      }
      const arr = byLoc.get(fp.loc.id) ?? [];
      arr.push(fp);
      byLoc.set(fp.loc.id, arr);
    }
    return [...byLoc.values(), ...loose];
  }, [friendPositions]);

  // Alternate stage labels above/below by x-order so near neighbors don't
  // merge into false compound names ("BeatBox Ghost").
  const stageLabelBelow = useMemo(() => {
    const stages = locations
      .filter((l) => l.category === 'stage')
      .sort((a, b) => a.xPercent - b.xPercent);
    const below = new Set<string>();
    stages.forEach((s, i) => { if (i % 2 === 1) below.add(s.id); });
    return below;
  }, [locations]);

  // "Matter now" essential amenity types.
  const matterAmenity = new Set(['Water Stations', 'Restrooms', 'First Aid']);

  const visibleLocations = useMemo(() => {
    if (essential) return locations.filter(essential.match);
    return locations.filter((loc) => {
      if (matterNow) {
        if (loc.category === 'stage') return selectedStages.has(loc.id);
        if (loc.category === 'amenity') return loc.amenityType ? matterAmenity.has(loc.amenityType) : false;
        return false;
      }
      return locationVisible(loc, locFilters, selectedStages);
    });
  }, [locations, essential, matterNow, locFilters, selectedStages]);

  const toggle = (k: FilterKey) => {
    setMatterNow(false);
    setEssential(null);
    setActive((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const onLocationTap = (loc: MapLocation) => {
    setSelected(loc);
    mapRef.current?.centerOn(loc.xPercent, loc.yPercent, 2.4);
  };

  /** My own position, used as the origin for "nearest water" style answers. */
  const myPosition = friendPositions.find((f) => f.user.id === activeUserId);

  const pickEssential = (e: Essential) => {
    if (essential?.key === e.key) {
      setEssential(null);
      setSelected(null);
      return;
    }
    setEssential(e);
    setMatterNow(false);
    // Turn the matching filter chip on so the chip bar tells the truth.
    setActive((prev) => new Set(prev).add(e.key));
    const nearest = nearestMatch(
      locations,
      e,
      myPosition?.loc ? { xPercent: myPosition.loc.xPercent, yPercent: myPosition.loc.yPercent } : null,
      MAP_ASPECT,
    );
    if (nearest) {
      setSelected(nearest);
      mapRef.current?.centerOn(nearest.xPercent, nearest.yPercent, 2.6);
    }
  };

  const doCheckIn = async (loc: MapLocation | null, coords?: { xPercent: number; yPercent: number }) => {
    await putCheckIn({
      id: `checkin-${activeUserId}-${Date.now()}`,
      userId: activeUserId,
      locationId: loc?.id ?? null,
      customCoordinates: coords ?? null,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    });
    setCheckInMode(false);
    setSelected(null);
  };

  const myCheckin = checkins
    .filter((c) => c.userId === activeUserId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

  // Walking time from where I am to the selected pin.
  const omap = useMemo(() => overrideMap(overridesArr), [overridesArr]);
  const walkToSelected =
    selected && myPosition?.loc && myPosition.loc.id !== selected.id
      ? travelMinutes(myPosition.loc, selected, crowd, omap).minutes
      : null;

  return (
    // min-h-0 on the column AND the map cell: without it the map's intrinsic
    // height wins over flex-1, the screen grows past the viewport, and the
    // controls at the bottom (slider, day toggle, Check in) end up under the
    // fixed nav where they can't be reached.
    <div className="flex h-full min-h-0 flex-col">
      {/* ONE scrollable row. Essentials lead — the things people actually open
          a festival map for aren't stages — then the rest of the filters.
          Two stacked rows plus two banners cost ~260px of a 690px screen. */}
      <div className="shrink-0 px-3 pb-1.5 pt-2">
        <div className="no-scrollbar scroll-fade-r flex items-stretch gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => { setMatterNow((v) => !v); setEssential(null); }}
            aria-pressed={matterNow}
            className={cx(
              'inline-flex min-h-touch shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-bold',
              matterNow ? 'border-warp-yellow bg-warp-yellow text-warp-ink' : 'border-warp-yellow/60 bg-warp-yellow/10 text-warn',
            )}
          >
            <Sparkles size={14} aria-hidden /> Now
          </button>

          <EssentialsStrip active={essential?.key ?? null} onPick={pickEssential} />

          <span className="my-1.5 w-px shrink-0 bg-[var(--border-subtle)]" aria-hidden />

          {FILTER_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={(e) => {
                toggle(k);
                e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
              }}
              aria-pressed={active.has(k)}
              className={cx(
                'inline-flex min-h-touch shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold',
                active.has(k) && !matterNow && !essential ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white' : 'border-subtle bg-[var(--surface-card)] text-secondary',
              )}
            >
              {FILTER_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/*
        In flow above the map, not floating over it. `map.verified` defaults to
        false, so this banner is permanent on every fresh install — and as a
        floating overlay it sat on top of the map's top strip forever, hiding
        stage labels and friend pins underneath it (pins render inside
        MapCanvas, which has no z-index, so they were untappable too). A hidden
        friend pin reads as a lost friend. One line of height is the cheaper
        trade. The one-time tip below can still float, because it gets dismissed.
      */}
      {!mapMeta.verified && (
        <button
          type="button"
          onClick={() => onOpenMenu('map-setup')}
          className="mx-3 mb-1.5 flex items-center gap-1.5 rounded-lg bg-warp-warn/95 px-2.5 py-1.5 text-left text-[12px] font-semibold text-warp-ink"
        >
          <TriangleAlert size={13} className="shrink-0" aria-hidden />
          <span className="flex-1">Reference layout — check against the official 2026 map.</span>
          <span className="shrink-0 underline">Verify</span>
        </button>
      )}

      {/* Map */}
      <div className="relative min-h-0 flex-1 px-3">
        <MapCanvas
          ref={mapRef}
          className="h-full"
          onBackgroundTap={(x, y) => {
            if (checkInMode) doCheckIn(null, { xPercent: x, yPercent: y });
          }}
        >
          {visibleLocations.map((loc) => (
            <LocationPin
              key={loc.id}
              loc={loc}
              labeled={loc.category === 'stage'}
              labelBelow={stageLabelBelow.has(loc.id)}
              highlighted={
                (loc.category === 'stage' && selectedStages.has(loc.id) && (active.has('selected') || matterNow)) ||
                selected?.id === loc.id
              }
              onClick={() => onLocationTap(loc)}
            />
          ))}
          {showFriends &&
            friendGroups.map((group) =>
              group.length === 1 ? (
                <FriendPin
                  key={group[0].user.id}
                  user={group[0].user}
                  position={group[0].pos}
                  loc={group[0].loc}
                  onClick={() => group[0].loc && setSelected(group[0].loc)}
                />
              ) : (
                <FriendClusterPin
                  key={`cluster-${group[0].loc!.id}`}
                  users={group.map((g) => g.user)}
                  loc={group[0].loc!}
                  sourceSummary={summarizeSources(group)}
                  onClick={() => setSelected(group[0].loc!)}
                />
              ),
            )}
        </MapCanvas>

        {/* Banners float OVER the map rather than pushing it down — on a
            375×667 phone they'd otherwise eat most of the map.
            The right gutter is reserved for MapCanvas's zoom column (44px at
            right-3, so 56px total): full-width banners used to land underneath
            it, which buried this tip's "Got it" button and made both it and the
            zoom buttons look broken. */}
        <div className="pointer-events-none absolute left-3 right-16 top-2 z-10 space-y-1.5">
          {/* Opaque backing: FirstUseTip's own fill is bg-warp-yellow/10, which
              is legible on a page background but not over map artwork — the
              wordmark and sponsor logos showed straight through the text. */}
          <div className="pointer-events-auto rounded-xl bg-[var(--surface-card)] shadow-lg">
            {/* The old wording ("unless someone manually checks in") implied a
                friend's check-in could turn up here. Nothing syncs, and there
                is no way to send one, so it never can — say so. */}
            <FirstUseTip id="map" className="mb-0">
              Everyone&apos;s position here is worked out from their schedule — not live GPS.
              Checking in only changes your own pin on your own phone; it is not sent to anyone.
            </FirstUseTip>
          </div>

        </div>

        {/* Empty hint if map has nothing */}
        {visibleLocations.length === 0 && !showFriends && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-white">
              <Filter size={13} aria-hidden /> No pins for these filters
            </span>
          </div>
        )}

        {/* Check-in mode banner — z-20 so it sits above the notices. */}
        {checkInMode && (
          <div className="absolute left-3 right-16 top-2 z-20 flex items-center gap-2 rounded-xl bg-warp-blue-800/95 px-3 py-2 text-white shadow-lg">
            <Crosshair size={16} aria-hidden />
            <span className="flex-1 text-[13px] font-semibold">Tap the map or a pin to check in</span>
            <button type="button" onClick={() => setCheckInMode(false)} aria-label="Cancel" className="p-1">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}

        {/* Location detail card */}
        {selected && (
          <LocationCard
            loc={selected}
            people={friendPositions.filter((f) => f.loc?.id === selected.id)}
            missing={plans.missing}
            walkMinutes={walkToSelected}
            activeUserId={activeUserId}
            onClose={() => setSelected(null)}
            onCheckIn={() => doCheckIn(selected)}
            onRecenter={() => mapRef.current?.centerOn(selected.xPercent, selected.yPercent, 2.6)}
          />
        )}
      </div>

      {/* Bottom controls: time slider + check-in. pb clears exactly the fixed
          nav (--nav-h) — the old hardcoded 5rem was a guess that left the
          slider and Check in button stranded underneath it. */}
      <div className="shrink-0 border-t border-subtle bg-[var(--surface-card)] px-3 pb-[calc(var(--nav-h)+0.5rem)] pt-2">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="flex rounded-lg bg-[var(--surface-sunken)] p-0.5">
            {(['saturday', 'sunday'] as DayId[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDay(d); setFollowNow(false); }}
                className={cx('rounded px-2 py-1 text-[12px] font-bold', day === d ? 'bg-[var(--chip-on)] text-white' : 'text-secondary')}
              >
                {d === 'saturday' ? 'Sat' : 'Sun'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[13px] font-bold text-primary">
            <Clock size={14} aria-hidden />
            {formatMinutes(atMinute)}
            <span className="ml-1 rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">
              Planned from schedule
            </span>
          </div>
          <div className="flex-1" />
          {live && (
            /* "Live time" read as live friend tracking — it only ever meant
               "keep the slider on the current clock" (plan §P1-13). */
            <button
              type="button"
              onClick={() => setFollowNow((v) => !v)}
              aria-pressed={followNow}
              className={cx('rounded-full px-2 py-1 text-[11px] font-bold', followNow ? 'bg-warp-ok/15 text-warp-ok' : 'bg-[var(--surface-sunken)] text-secondary')}
            >
              {followNow ? 'Following now' : 'Follow current time'}
            </button>
          )}
        </div>
        <input
          type="range"
          min={OPEN}
          max={sliderMax}
          step={5}
          value={atMinute}
          onChange={(e) => { setFollowNow(false); setSliderMin(Number(e.target.value)); }}
          aria-label="Time of day"
          aria-valuetext={formatMinutes(atMinute)}
          className="w-full accent-warp-pink"
        />
        <div className="mt-1 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-muted">
            {myCheckin
              ? `You checked in ${formatRelative(myCheckin.updatedAt)} — only on this phone`
              : 'Positions are planned, not live GPS.'}
          </span>
          {myCheckin && (
            <button
              type="button"
              onClick={() => void clearCheckInsFor(activeUserId)}
              className="min-h-touch inline-flex items-center gap-1 px-2 text-[12px] font-semibold text-secondary active:opacity-70"
            >
              <Trash2 size={13} aria-hidden /> Clear
            </button>
          )}
          <Button variant={checkInMode ? 'primary' : 'secondary'} className="px-3 py-1.5" onClick={() => setCheckInMode((v) => !v)}>
            <MapPin size={15} aria-hidden /> Check in
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "2 planned, 1 checked in" — never left to be inferred from a dim avatar. */
function summarizeSources(group: FriendPosition[]): string {
  const manual = group.filter((g) => g.pos.source === 'manual').length;
  const planned = group.length - manual;
  const parts: string[] = [];
  if (manual) parts.push(`${manual} checked in`);
  if (planned) parts.push(`${planned} planned`);
  return parts.join(', ');
}

function LocationCard({
  loc,
  people,
  missing,
  walkMinutes,
  activeUserId,
  onClose,
  onCheckIn,
  onRecenter,
}: {
  loc: MapLocation;
  people: FriendPosition[];
  missing: User[];
  walkMinutes: number | null;
  activeUserId: string;
  onClose: () => void;
  onCheckIn: () => void;
  onRecenter: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-[var(--surface-card)] p-3 shadow-2xl ring-1 ring-black/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-[15px] text-primary">{loc.name}</div>
          {/* normal-case on the walk span: the parent capitalizes the category
              label, which otherwise turns "~4 min walk" into "~4 Min Walk". */}
          <div className="flex items-center gap-2 text-[12px] capitalize text-secondary">
            {loc.amenityType ?? loc.category.replace('-', ' ')}
            {walkMinutes != null && (
              <span className="inline-flex items-center gap-1 normal-case text-muted">
                <Footprints size={11} aria-hidden /> ~{formatDuration(walkMinutes)} walk
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted">
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* One row per person, each stating its OWN source. Lumping everyone
          under "Planned here" hid the difference between a live check-in and
          a guess from the schedule (plan §P1-14). */}
      {people.length > 0 && (
        <ul className="mt-2 space-y-1">
          {people.map(({ user, pos }) => (
            <li key={user.id} className="flex items-center gap-2">
              <FriendAvatar user={user} size={20} />
              <span className="text-[12px] font-semibold text-primary">
                {user.id === activeUserId ? 'You' : user.name}
              </span>
              <span className="flex-1 truncate text-[12px] text-secondary">
                {pos.source === 'manual'
                  ? `Checked in ${pos.ageMinutes ?? 0} min ago`
                  : pos.kind === 'traveling'
                    ? 'Heading here'
                    : `Planned here${pos.performanceId ? '' : ''}`}
              </span>
              <span
                className={cx(
                  'shrink-0 rounded-full px-1.5 text-[10px] font-bold',
                  pos.source === 'manual' ? 'bg-warp-ok/15 text-ok' : 'bg-accent-soft text-accent',
                )}
              >
                {positionBadge(pos)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Stale history is context, not a position. */}
      {people.some((p) => p.pos.staleCheckIn) && (
        <ul className="mt-1 space-y-0.5">
          {people
            .filter((p) => p.pos.staleCheckIn)
            .map(({ user, pos }) => (
              <li key={`stale-${user.id}`} className="text-[11px] text-muted">
                {user.name}: last manual check-in {pos.staleCheckIn!.locationName ?? 'a custom pin'},{' '}
                {pos.staleCheckIn!.ageMinutes} min ago
              </li>
            ))}
        </ul>
      )}

      {missing.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {missing.map((u) => u.name).join(', ')}: plan not imported — could be anywhere.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1 py-1.5" onClick={onRecenter}>
          <Crosshair size={15} aria-hidden /> Recenter
        </Button>
        <Button variant="yellow" className="flex-1 py-1.5" onClick={onCheckIn}>
          <Check size={15} aria-hidden /> Check in here
        </Button>
      </div>
    </div>
  );
}
