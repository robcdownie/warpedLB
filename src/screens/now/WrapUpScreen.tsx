import { Star, Users, MapPin, Download, ChevronRight } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { Screen, Card, Button } from '@/components/ui';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { buildWrapUp } from '@/domain/wrapUp';
import { formatTime } from '@/domain/time';
import { ART } from '@/config/event';
import type { MenuRoute } from '@/components/MenuDrawer';

/**
 * The weekend, after it's over.
 *
 * Shown on the Now tab once the festival has closed, because a countdown and a
 * "what's next" dashboard are both nonsense on Monday. Dismissible — it stores
 * itself through the same dismissedTips mechanism as every other one-time
 * surface, so it never becomes a wall between someone and their own data.
 *
 * Everything here is phrased as a *plan*, never as attendance. The app had no
 * GPS, no background tracking and no server; it cannot know whether anyone
 * actually reached a stage. Saying "you saw 14 bands" would be a comfortable
 * fiction, and refusing comfortable fictions is the point of this app.
 */
export function WrapUpScreen({
  onOpenMenu,
  onDismiss,
  final = false,
}: {
  onOpenMenu?: (r: MenuRoute) => void;
  onDismiss?: () => void;
  /**
   * Wind-down mode: this screen IS the public app, not a card inside it. There
   * is nowhere to go back to and no menu to open, so anything that navigates
   * is left out rather than rendered dead.
   */
  final?: boolean;
}) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const artistById = useApp((s) => s.artistById);
  const checkins = useApp((s) => s.checkins);
  const plans = usePlanStatuses();

  const friendPlanCount = plans.eligible.filter((u) => u.id !== activeUserId).length;
  const w = buildWrapUp({
    selections,
    performanceById,
    checkins,
    userId: activeUserId,
    friendPlanCount,
  });

  return (
    <Screen>
      <div className="relative -mx-4 mb-4 overflow-hidden">
        <img
          src={ART.hero}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(8,36,80,0.35) 0%, rgba(8,36,80,0.15) 40%, rgba(5,25,58,0.85) 100%)',
          }}
        />
        <div className="relative px-5 pb-5 pt-14 [@media(max-height:700px)]:pt-8">
          <div
            className="font-display text-[30px] leading-none text-white"
            style={{ textShadow: '2px 2px 0 #0a0f1c' }}
          >
            THAT&apos;S A WRAP
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-warp-yellow px-2 py-0.5 font-display text-[13px] text-warp-ink shadow-[1.5px_1.5px_0_#0a0f1c]">
              LONG BEACH
            </span>
            <span
              className="font-display text-[15px] text-warp-pink"
              style={{ textShadow: '1.5px 1.5px 0 #0a0f1c' }}
            >
              2026
            </span>
          </div>
        </div>
      </div>

      {final && (
        <Card className="mb-4 p-4">
          <h2 className="font-display text-[17px] text-primary">Thank you for using this</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
            Warped Long Beach is done, and so is the planning half of this app — the schedule, map,
            group and conflict screens have gone with it. What&apos;s left is your weekend and a way
            to say thanks.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            It was built by one person, for free, with no ads and no accounts, and it never sent
            your plans anywhere. Thanks for trusting it with your weekend.
          </p>
        </Card>
      )}

      {w.empty ? (
        <Card className="mb-4 p-4">
          <h2 className="font-display text-[17px] text-primary">No picks to look back on</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
            Nothing was ever starred on this phone, so there is no weekend to replay. Hope it was a
            good one anyway.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <h2 className="font-display text-[17px] text-primary">Your weekend, as planned</h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Stat Icon={Star} n={w.totalPlanned} label={w.totalPlanned === 1 ? 'band picked' : 'bands picked'} />
              <Stat Icon={Star} n={w.mustSee} label="marked must-see" />
              {w.friendPlans > 0 && (
                <Stat
                  Icon={Users}
                  n={w.friendPlans}
                  label={w.friendPlans === 1 ? 'friend’s plan' : 'friends’ plans'}
                />
              )}
              {w.checkIns > 0 && (
                <Stat Icon={MapPin} n={w.checkIns} label={w.checkIns === 1 ? 'check-in' : 'check-ins'} />
              )}
            </div>

            {/*
              The one claim this screen must never make. Everything above is a
              plan; the app had no way to observe whether it happened.
            */}
            <p className="mt-3 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-[12px] leading-relaxed text-secondary">
              This is what you <em>planned</em>. The app never tracked where you actually were, so
              whether you made it to all of them is between you and the corndogs.
            </p>
          </Card>

          {w.hasTimeline &&
            w.days
              .filter((d) => d.timeline.length > 0)
              .map((d) => (
                <Card key={d.day} className="mb-4 p-4">
                  <h2 className="font-display text-[15px] uppercase tracking-wide text-secondary">
                    {d.label}
                  </h2>
                  <ol className="mt-2.5 space-y-1.5">
                    {d.timeline.map((p) => (
                      <li key={p.id} className="flex items-baseline gap-2.5 text-[13px]">
                        <span className="w-[64px] shrink-0 tabular-nums text-secondary">
                          {formatTime(p.startTime)}
                        </span>
                        <span className="font-semibold text-primary">
                          {artistById.get(p.artistId)?.name ?? 'Unknown artist'}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {d.planned > d.timeline.length && (
                    <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                      {d.planned - d.timeline.length} more{' '}
                      {d.planned - d.timeline.length === 1 ? 'pick' : 'picks'} never got a set time,
                      so they can&apos;t be placed on the clock.
                    </p>
                  )}
                </Card>
              ))}

          {!w.hasTimeline && (
            <Card className="mb-4 p-4">
              <p className="text-[13px] leading-relaxed text-secondary">
                No set times were ever entered on this phone, so there&apos;s no timeline to lay out
                — just the picks above. That&apos;s the honest version.
              </p>
            </Card>
          )}
        </>
      )}

      <Card className="mb-4 border-warp-pink/40 bg-warp-pink/5 p-4">
        <h2 className="font-display text-[17px] text-primary">Help me recover from my corndogs</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          This app was free, had no ads, and never sent your plans anywhere. If it earned its keep
          this weekend, you can chip in toward the damage a festival weekend does to a person.
        </p>
        <a
          href="https://venmo.com/u/robbie-downie"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 flex min-h-touch items-center justify-center rounded-lg bg-warp-pink px-4 font-display text-[15px] text-white active:bg-warp-pink-dark"
        >
          Venmo @robbie-downie
        </a>
        <p className="mt-2 text-center text-[11px] text-muted">
          Opens Venmo — needs a connection, unlike the rest of the app.
        </p>
      </Card>

      {/* The tour rolls on. A third of the Long Beach lineup plays Montréal,
          and the people holding this wound-down page are the only crowd who
          already know the app works. One pointer, nothing pushy. */}
      <Card className="mb-4 p-4">
        <h2 className="font-display text-[15px] text-primary">Going to Warped Montréal?</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          Aug 21–22 at Parc Jean-Drapeau — a lot of this lineup plays there too. There&apos;s a
          version of this app for that stop, same offline everything.
        </p>
        <a
          href="https://robcdownie.github.io/warpedmtl/"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 flex min-h-touch items-center justify-center rounded-lg bg-warp-blue-500 px-4 font-display text-[15px] text-white"
        >
          Open the Montréal app
        </a>
      </Card>

      {!final && !w.empty && (
        <Card className="mb-4 p-4">
          <h2 className="font-display text-[15px] text-primary">Keep a copy</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
            Your picks live only on this phone. Clearing your browser data wipes them. Export a file
            if you want to keep the weekend.
          </p>
          <Button
            variant="secondary"
            className="mt-3 w-full py-2.5"
            onClick={() => onOpenMenu?.('data')}
          >
            <Download size={15} aria-hidden /> Export my plan
          </Button>
        </Card>
      )}

      {!final && (
        <Button variant="ghost" className="mb-2 w-full py-3 text-[15px]" onClick={onDismiss}>
          Back to the app <ChevronRight size={16} aria-hidden />
        </Button>
      )}
      <p className="px-1 text-center text-[11px] text-muted">
        Thanks for using it. Have a great rest of your year.
      </p>
    </Screen>
  );
}

function Stat({
  Icon,
  n,
  label,
}: {
  Icon: typeof Star;
  n: number;
  label: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
      <div className="flex items-center gap-1.5 text-accent">
        <Icon size={14} aria-hidden />
        <span className="font-display text-[22px] leading-none text-primary">{n}</span>
      </div>
      <div className="mt-1 text-[12px] leading-snug text-secondary">{label}</div>
    </div>
  );
}
