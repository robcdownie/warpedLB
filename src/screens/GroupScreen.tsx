import { useMemo, useRef, useState } from 'react';
import { Users, MapPin, CalendarClock, Coffee, AlertTriangle, Star, Handshake, Scale, HelpCircle } from 'lucide-react';
import { Screen, Card, cx } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { FriendAvatar } from '@/components/FriendAvatar';
import { FirstUseTip } from '@/components/FirstUseTip';
import { PlanStatusRow, MissingPlansNote } from '@/components/PlanStatusRow';
import { ScheduleStatusStrip, ProvisionalNote } from '@/components/ScheduleStatusStrip';
import { DecisionBoard } from '@/components/DecisionBoard';
import { useApp } from '@/store/appStore';
import { useGroupCtx } from '@/hooks/useGroupCtx';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { useConflicts } from '@/hooks/useConflicts';
import { useScheduleStatus, useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { groupTimeline, sharedSets, freeWindows, type GroupSlot } from '@/domain/group';
import { MeetupCard } from '@/components/MeetupCard';
import { useMeetups } from '@/hooks/useMeetups';
import { itinerary } from '@/store/selectors';
import { formatMinutes, formatTime, formatDuration, hhmmToMinutes, dayLabel } from '@/domain/time';
import { EVENT, ART } from '@/config/event';
import type { DayId, User } from '@/domain/types';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';

type ViewMode = 'decisions' | 'timeline' | 'person' | 'shared' | 'meetups' | 'conflicts' | 'free';

const VIEWS: { id: ViewMode; label: string; Icon: typeof Users }[] = [
  // Unresolved decisions first: they're the only thing here that needs a
  // conversation rather than a glance (plan §"Recommended hierarchy").
  { id: 'decisions', label: 'Decisions', Icon: Scale },
  { id: 'shared', label: 'Shared', Icon: Star },
  { id: 'meetups', label: 'Meetups', Icon: Handshake },
  { id: 'free', label: 'Free Time', Icon: Coffee },
  { id: 'timeline', label: 'Timeline', Icon: CalendarClock },
  { id: 'person', label: 'By Person', Icon: Users },
  { id: 'conflicts', label: 'Conflicts', Icon: AlertTriangle },
];

export function GroupScreen({
  onGoTab,
  onOpenMenu,
}: {
  onGoTab: (t: TabId) => void;
  onOpenMenu: (r: MenuRoute) => void;
}) {
  const [day, setDay] = useState<DayId>('saturday');
  const [view, setView] = useState<ViewMode>('decisions');
  const scheduleLoaded = useScheduleStatus().any;
  const plans = usePlanStatuses();

  return (
    <Screen>
      <h1 className="mb-3 font-display text-[22px] text-primary">Group</h1>

      <FirstUseTip id="group">
        This combines imported plans. Missing plan data does not mean someone is free.
      </FirstUseTip>

      {/* Who is actually in these numbers. */}
      <div className="mb-3 space-y-0.5">
        {plans.all.map((u) => (
          <PlanStatusRow
            key={u.id}
            user={u}
            info={plans.byUser.get(u.id)!}
            compact
            onClick={() => onOpenMenu('friends')}
          />
        ))}
      </div>
      <MissingPlansNote missing={plans.missing} />

      {/* Day toggle */}
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

      {/* View chips */}
      <div className="no-scrollbar scroll-fade-x -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              setView(id);
              e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
            }}
            aria-pressed={view === id}
            className={cx(
              'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold',
              view === id ? 'border-[var(--chip-on-border)] bg-[var(--chip-on)] text-white' : 'border-subtle bg-[var(--surface-card)] text-secondary',
            )}
          >
            <Icon size={14} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {!scheduleLoaded && view !== 'person' ? (
        <EmptyState
          Icon={CalendarClock}
          image={ART.emptyGroup}
          title="Set times needed"
          message="Once set times are entered, the group timeline, shared sets, and meetups fill in here."
          action={
            <button
              type="button"
              onClick={() => onGoTab('schedule')}
              className="mt-1 rounded-xl bg-warp-yellow px-4 py-2 text-[14px] font-bold text-warp-ink"
            >
              Go to Schedule
            </button>
          }
        />
      ) : (
        <>
          <ScheduleStatusStrip day={day} compact />
          {view === 'decisions' && <DecisionBoard day={day} />}
          {view === 'timeline' && <TimelineView day={day} />}
          {view === 'person' && <PersonView day={day} />}
          {view === 'shared' && <SharedView day={day} />}
          {view === 'meetups' && <MeetupsView day={day} />}
          {view === 'conflicts' && <ConflictsView day={day} />}
          {view === 'free' && <FreeView day={day} />}
        </>
      )}
    </Screen>
  );
}

function AttendeeAvatars({ slot, users }: { slot: GroupSlot; users: User[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {slot.attendees.map((a) => {
        const u = users.find((x) => x.id === a.userId);
        if (!u) return null;
        return (
          <span key={a.userId} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5">
            <FriendAvatar user={u} size={18} dim={a.decision === 'undecided'} />
            <span className="text-[11px] font-semibold text-primary">{u.name}</span>
            {/* One word, not a bare "?" — the glyph read as a rendering bug. */}
            {a.decision === 'undecided' && (
              <span className="text-[9px] font-bold uppercase text-warp-warn">maybe</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TimelineView({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  const artistById = useApp((s) => s.artistById);
  const slots = useMemo(() => groupTimeline(day, ctx), [day, ctx]);
  if (!slots.length)
    return (
      <EmptyState
        Icon={CalendarClock}
        image={ART.emptyTimeline}
        title="Nothing planned yet"
        message="No one has a scheduled set this day."
      />
    );
  return (
    <div className="space-y-2">
      {slots.map((slot) => (
        <Card key={slot.performance.id} className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-14 shrink-0 text-center">
              <div className="font-display text-[14px] text-primary">{formatMinutes(slot.startMinute)}</div>
              <div className="text-[10px] text-muted">{formatMinutes(slot.endMinute)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[15px] text-primary">
                {artistById.get(slot.performance.artistId)?.name ?? 'Artist'}
              </div>
              <div className="mb-1.5 flex items-center gap-1 text-[13px] text-secondary">
                <MapPin size={13} aria-hidden />
                {slot.stage?.name ?? 'Stage TBA'}
              </div>
              <AttendeeAvatars slot={slot} users={ctx.users} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PersonView({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  const artistById = useApp((s) => s.artistById);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  return (
    <div>
      {/* Person switcher — without it the third crew member sat fully
          off-screen with no cue that the columns scroll. */}
      <div className="mb-2 flex gap-1.5">
        {ctx.users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() =>
              colRefs.current.get(u.id)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
            }
            className="flex min-h-touch items-center gap-1.5 rounded-full border border-subtle bg-[var(--surface-card)] px-2.5 text-[13px] font-semibold text-secondary active:bg-[var(--press)]"
          >
            <FriendAvatar user={u} size={20} />
            {u.name}
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 px-4 pb-2">
      {ctx.users.map((u) => {
        const stops = itinerary(ctx.selections, ctx.performanceById, u.id, day).filter(
          (p) => p.type === 'main',
        );
        return (
          <div
            key={u.id}
            ref={(el) => { if (el) colRefs.current.set(u.id, el); }}
            className="w-[70%] max-w-[240px] shrink-0 snap-start"
          >
            <div className="mb-2 flex items-center gap-2">
              <FriendAvatar user={u} size={28} ring />
              <span className="font-display text-[14px] text-primary">{u.name}</span>
              <span className="text-[12px] text-muted">{stops.length}</span>
            </div>
            {stops.length ? (
              <div className="space-y-2">
                {stops.map((p) => (
                  <div key={p.id} className="surface-card rounded-xl p-2.5">
                    <div className="font-display text-[13px] text-primary">{formatTime(p.startTime)}</div>
                    <div className="truncate text-[13px] text-secondary">{artistById.get(p.artistId)?.name}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted">
                      <MapPin size={11} aria-hidden />
                      {ctx.locationById.get(p.stageId ?? '')?.shortName ?? 'TBA'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-subtle p-3 text-center text-[12px] text-muted">
                No scheduled sets
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function SharedView({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  const artistById = useApp((s) => s.artistById);
  const shared = useMemo(() => sharedSets(day, ctx), [day, ctx]);
  if (!shared.length)
    return (
      <>
        <EmptyState
          Icon={Star}
          image={ART.emptyShared}
          title="No shared sets yet"
          message="When two or more of you pick the same set, it shows here."
        />
        <ProvisionalNote day={day} what="shared sets" />
      </>
    );
  return (
    <div className="space-y-2">
      {shared.map((slot) => (
        <Card key={slot.performance.id} className="border-warp-pink/30 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-[15px] text-primary">{artistById.get(slot.performance.artistId)?.name}</div>
              <div className="flex items-center gap-1 text-[13px] text-secondary">
                <MapPin size={13} aria-hidden /> {slot.stage?.name ?? 'TBA'} · {formatMinutes(slot.startMinute)}
              </div>
            </div>
            <span className="rounded-full bg-warp-pink/15 px-2 py-1 text-[12px] font-bold text-warp-pink">
              {slot.attendees.length} picked this
            </span>
          </div>
          <div className="mt-2">
            <AttendeeAvatars slot={slot} users={ctx.users} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function MeetupsView({ day }: { day: DayId }) {
  const meetups = useMeetups(day);
  if (!meetups.length)
    return (
      <>
        <EmptyState
          Icon={Handshake}
          image={ART.emptyMap}
          title="No meetups found yet"
          message="Once a couple of you have set times entered, the app finds windows where you're all free and picks an easy spot."
        />
        <ProvisionalNote day={day} what="meetup windows" />
      </>
    );
  return (
    <div className="space-y-2">
      {meetups.map((m, i) => (
        <MeetupCard key={m.id} meetup={m} highlight={i === 0} />
      ))}
    </div>
  );
}

/**
 * Conflicts per person. Iterates the eligible users rather than a fixed
 * roster, so any group size (or a phone where only some plans are
 * imported) stays correct (plan §P1-10).
 */
function ConflictsView({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  if (!ctx.users.length) {
    return (
      <EmptyState
        Icon={AlertTriangle}
        image={ART.noConflicts}
        title="No plans to check"
        message="Import at least one plan and conflicts show up here."
      />
    );
  }
  return <ConflictsList day={day} users={ctx.users} />;
}

function ConflictsList({ day, users }: { day: DayId; users: User[] }) {
  return (
    <div className="space-y-3">
      {users.map((u) => (
        <UserConflicts key={u.id} user={u} day={day} />
      ))}
      <p className="px-1 text-[11px] text-muted">
        Only people whose plans are on this phone are checked.
      </p>
    </div>
  );
}

/** One card per person — a component so the hook count stays stable. */
function UserConflicts({ user, day }: { user: User; day: DayId }) {
  const performanceById = useApp((s) => s.performanceById);
  const list = useConflicts(user.id).filter(
    (c) => performanceById.get(c.performanceIds[0])?.day === day,
  );
  if (!list.length) return null;
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <FriendAvatar user={user} size={24} ring />
        <span className="font-display text-[14px] text-primary">{user.name}</span>
        <span className="rounded-full bg-warp-pink px-1.5 text-[11px] font-bold text-white">{list.length}</span>
      </div>
      <ul className="space-y-1">
        {list.map((c) => (
          <li key={c.id} className="flex items-start gap-1.5 text-[13px] text-secondary">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warp-warn" aria-hidden />
            <span><b>{c.title}.</b> {c.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FreeView({ day }: { day: DayId }) {
  const ctx = useGroupCtx();
  const plans = usePlanStatuses();
  const dayInfo = useDayScheduleStatus(day);
  const open = hhmmToMinutes(EVENT.festivalHours.opens);
  const close = hhmmToMinutes(EVENT.festivalHours.closes);
  const windows = useMemo(() => freeWindows(day, ctx, { open, close }), [day, ctx, open, close]);
  const byUser = ctx.users.map((u) => ({
    user: u,
    windows: windows.filter((w) => w.userId === u.id && w.endMinute - w.startMinute >= 15),
  }));

  const provisional = dayInfo.status !== 'complete';

  return (
    <div className="space-y-3">
      {/* A partial schedule cannot produce a confident free-time claim.

          The message body must be ONE flex item: with the text sitting directly
          in the flex container, every text node and the <b> became a separate
          flex child and the sentence rendered as interleaved columns. */}
      {provisional && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warp-warn/15 px-2.5 py-2 text-[12px] leading-relaxed text-warn">
          <HelpCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {dayLabel(day)} is only {dayInfo.entered} of {dayInfo.expected} sets entered, so these
            are windows with <b>no known set</b> — not confirmed free time. Picks without a time
            could land in any of them.
          </span>
        </p>
      )}
      {byUser.map(({ user, windows: ws }) => (
        <Card key={user.id} className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <FriendAvatar user={user} size={24} ring />
            <span className="font-display text-[14px] text-primary">{user.name}</span>
            {plans.byUser.get(user.id)?.status === 'stale' && (
              <span className="rounded-full bg-warp-warn/20 px-1.5 text-[10px] font-bold text-warn">
                may be outdated
              </span>
            )}
          </div>
          {ws.length ? (
            <div className="flex flex-wrap gap-1.5">
              {ws.map((w, i) => (
                <span
                  key={i}
                  className={cx(
                    'rounded-lg px-2 py-1 text-[12px] font-semibold',
                    provisional ? 'bg-warp-warn/15 text-warn' : 'bg-warp-ok/10 text-warp-ok',
                  )}
                >
                  {formatMinutes(w.startMinute)}–{formatMinutes(w.endMinute)}
                  <span className="ml-1 text-[10px] opacity-70">({formatDuration(w.endMinute - w.startMinute)})</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">Packed day — no windows over 15 min.</p>
          )}
        </Card>
      ))}
      <MissingPlansNote missing={plans.missing} />
    </div>
  );
}
