import { useEffect, useState } from 'react';
import { useApp, type TabId } from './store/appStore';
import { useThemeEffect, useOnlineEffect } from './hooks/useTheme';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { MenuDrawer, type MenuRoute } from './components/MenuDrawer';
import { UpdateToast } from './components/UpdateToast';
import { NowScreen } from './screens/NowScreen';
import { BandsScreen } from './screens/BandsScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { GroupScreen } from './screens/GroupScreen';
import { MapScreen } from './screens/MapScreen';
import { MenuScreen } from './screens/menu/MenuScreen';
import { WarpedWordmark } from './components/WarpedWordmark';
import { OnboardingFlow } from './screens/onboarding/OnboardingFlow';
import { FestivalScreen } from './screens/FestivalScreen';
import { LineupNoticeBanner } from './components/LineupNoticeBanner';
import { WrapUpScreen } from './screens/now/WrapUpScreen';
import { useClock } from './hooks/useClock';
import { windDownStarted } from './domain/time';

export function App() {
  useThemeEffect();
  useOnlineEffect();
  const hydrated = useApp((s) => s.hydrate);
  const isHydrated = useApp((s) => s.hydrated);
  const hydrateError = useApp((s) => s.hydrateError);
  const activeTab = useApp((s) => s.activeTab);
  const setTab = useApp((s) => s.setTab);
  const mode = useApp((s) => s.mode);
  const onboardingComplete = useApp((s) => s.settings.onboardingComplete);
  const festivalMode = useApp((s) => s.settings.festivalMode);
  // Not just "did onboarding finish" — does this phone actually resolve to a
  // real profile? See the gate below.
  const activeUser = useApp((s) => s.userById.get(s.settings.activeUserId));

  // Tick so the wind-down happens on its own. Someone holding the app at 21:29
  // shouldn't have to reload to reach the send-off — and at 21:29 in a crowd
  // they very likely can't. A minute is plenty for a once-a-weekend switch.
  const windDown = windDownStarted(useClock(60_000));

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRoute, setMenuRoute] = useState<MenuRoute | null>(null);
  // Festival mode is a persisted preference, so leaving it to look at the Map
  // shouldn't switch it off. A detour renders the full app with a way back.
  const [festivalDetour, setFestivalDetour] = useState(false);

  useEffect(() => {
    void hydrated();
  }, [hydrated]);

  // A blocked openDB never rejects, so an error flag alone isn't enough to get
  // off the splash screen. Offer the retry anyway after a while.
  const [slowToStart, setSlowToStart] = useState(false);
  useEffect(() => {
    if (isHydrated) return;
    const t = setTimeout(() => setSlowToStart(true), 10000);
    return () => clearTimeout(t);
  }, [isHydrated]);

  const openMenuRoute = (r: MenuRoute) => {
    setMenuRoute(r);
    setMenuOpen(false);
  };

  const goTab = (t: TabId) => {
    setMenuRoute(null);
    setTab(t);
  };

  /**
   * Navigation out of the Festival screen.
   *
   * `goTab` alone did nothing here: the festival branch below only checks
   * `menuRoute`, so setting the tab re-rendered the same screen. Map, Schedule,
   * Group and "Decide now" were all dead taps in the mode built for the day
   * itself — which is why the walking times never got looked at.
   */
  const goTabFromFestival = (t: TabId) => {
    setFestivalDetour(true);
    goTab(t);
  };

  const backToFestival = () => {
    setFestivalDetour(false);
    setMenuRoute(null);
  };

  if (!isHydrated) {
    // A throw, or an openDB that never settles (it can be blocked by another
    // tab), used to leave this splash up forever with a hand-typed board
    // sitting unreachable behind it.
    const stuck = hydrateError || slowToStart;
    return (
      <div className="surface-app flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
        <WarpedWordmark className="h-14 scale-150" />
        {stuck ? (
          <>
            <p className="text-sm text-primary">
              Couldn&apos;t open your saved plan on this phone.
            </p>
            <p className="text-[13px] text-secondary">
              Your set times are still stored here — this is the app failing to read them, not
              losing them. Close any other tab with the app open, then try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-touch rounded-xl bg-warp-yellow px-6 text-[15px] font-bold text-warp-ink"
            >
              Try again
            </button>
            {hydrateError && (
              <p className="max-w-[320px] break-words text-[11px] text-muted">
                {hydrateError.message}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-warp-pink" />
            </div>
            <p className="text-sm text-secondary">Loading your festival plan…</p>
          </>
        )}
      </div>
    );
  }

  // Wind-down: from 21:30 on the final day the public app is a thank-you, the
  // weekend's band list, and a Venmo link. Nothing else is routed to.
  //
  // Ahead of onboarding on purpose — a stranger who installs it on the Monday
  // after should get the send-off, not a setup flow for a festival that's over.
  // Behind the hydration gate, also on purpose: the band list is the point, and
  // it can't be read until IndexedDB is open.
  //
  // Reads the device clock, so it flips with no signal. Every other screen is
  // still in this build; see WIND_DOWN_AT in domain/time.ts.
  if (mode === 'prod' && windDown) {
    return (
      <div className="surface-app relative flex h-full flex-col">
        <main className="flex-1 overflow-y-auto">
          <WrapUpScreen final />
        </main>
        <UpdateToast />
      </div>
    );
  }

  // First run: a short setup flow, not a splash screen. Demo mode keeps its
  // own settings record, so it never replays production's onboarding.
  //
  // The `!activeUser` half matters as much as the flag: the roster ships empty,
  // so without it a phone could reach the tabbed UI with an activeUserId that
  // resolves to nobody — and every band starred there would be filed under a
  // profile the user never created. Bouncing back to onboarding is the only
  // honest response, and it also covers the case where someone removes the
  // profile this device was set to.
  if (mode === 'prod' && (!onboardingComplete || !activeUser)) {
    return (
      <OnboardingFlow
        onFinish={({ tab, menu }) => {
          if (menu) openMenuRoute(menu);
          else goTab(tab ?? 'now');
        }}
      />
    );
  }

  // Festival Lock Screen: one-handed, answers-in-seconds mode for the day
  // itself. The full app is one tap away and the menu still works.
  if (festivalMode && !menuRoute && !festivalDetour) {
    return (
      <div className="surface-app relative flex h-full flex-col">
        <FestivalScreen
          onOpenMenu={openMenuRoute}
          onOpenDrawer={() => setMenuOpen(true)}
          onGoTab={goTabFromFestival}
        />
        <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={openMenuRoute} />
        <UpdateToast />
      </div>
    );
  }

  return (
    <div className="surface-app relative flex h-full flex-col">
      <TopBar
        onMenu={() => setMenuOpen(true)}
        onBackToFestival={festivalMode ? backToFestival : undefined}
      />
      {/* Below TopBar so it clears the iOS status bar in the installed PWA. */}
      {mode === 'demo' && (
        <div className="bg-warp-yellow px-3 py-1 text-center text-[12px] font-bold text-warp-ink">
          DEMO MODE — sample set times, not the real schedule
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <LineupNoticeBanner />
        {menuRoute ? (
          <MenuScreen route={menuRoute} onBack={() => setMenuRoute(null)} onNavigate={setMenuRoute} />
        ) : (
          <>
            {activeTab === 'now' && <NowScreen onOpenMenu={openMenuRoute} onGoTab={goTab} />}
            {activeTab === 'bands' && <BandsScreen />}
            {activeTab === 'schedule' && <ScheduleScreen onOpenMenu={openMenuRoute} />}
            {activeTab === 'group' && <GroupScreen onGoTab={goTab} onOpenMenu={openMenuRoute} />}
            {activeTab === 'map' && <MapScreen onOpenMenu={openMenuRoute} />}
          </>
        )}
      </main>

      <BottomNav
        active={menuRoute ? null : activeTab}
        onChange={festivalMode ? goTabFromFestival : goTab}
      />

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={openMenuRoute}
      />
      <UpdateToast />
    </div>
  );
}
