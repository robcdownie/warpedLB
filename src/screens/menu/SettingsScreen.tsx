import { Sun, Moon, Smartphone, MapPinned, Compass, ListChecks, Maximize2 } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { SetupCard } from '@/components/SetupCard';
import { useApp } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';
import type { TabId } from '@/store/appStore';

export function SettingsScreen({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const settings = useApp((s) => s.settings);
  const users = useApp((s) => s.users);
  const updateSettings = useApp((s) => s.updateSettings);
  const restartOnboarding = useApp((s) => s.restartOnboarding);
  const setTab = useApp((s) => s.setTab);
  const activeUser = users.find((u) => u.id === settings.activeUserId);

  return (
    <Screen>
      {/* Profile */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-display text-[14px] uppercase tracking-wide text-secondary">Profile</h2>
        <button
          type="button"
          onClick={() => onOpenMenu('friends')}
          className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-left"
        >
          {activeUser && <FriendAvatar user={activeUser} size={40} ring />}
          <div className="flex-1">
            <div className="font-display text-[15px] text-primary">{activeUser?.name}</div>
            <div className="text-[12px] text-secondary">This device · tap to switch or add photo</div>
          </div>
        </button>
      </Card>

      {/* Setup progress stays reachable after it's been tucked away on Now. */}
      <SetupCard onGoTab={(t: TabId) => setTab(t)} onOpenMenu={onOpenMenu} />

      {/* Festival mode */}
      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-display text-[14px] uppercase tracking-wide text-secondary">Festival day</h2>
        <label className="flex items-center justify-between gap-3 py-1">
          <span className="flex-1">
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-primary">
              <Maximize2 size={15} className="text-accent" aria-hidden /> Festival mode
            </span>
            <span className="block text-[12px] text-muted">
              One-handed screen: what&apos;s next, when to leave, where the crew is. Everything else
              moves behind the menu.
            </span>
          </span>
          <Toggle on={settings.festivalMode} onChange={(v) => updateSettings({ festivalMode: v })} />
        </label>
      </Card>

      {/* Guidance */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-display text-[14px] uppercase tracking-wide text-secondary">Guidance</h2>
        <Button
          variant="secondary"
          className="mb-2 w-full justify-start"
          onClick={() => void restartOnboarding()}
        >
          <Compass size={17} aria-hidden /> Restart welcome guide
        </Button>
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Replays the four setup screens. Your bands, schedule, friends and check-ins are not
          touched.
        </p>
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={() => void updateSettings({ dismissedTips: [] })}
          disabled={settings.dismissedTips.length === 0}
        >
          <ListChecks size={17} aria-hidden />
          {settings.dismissedTips.length
            ? `Show the ${settings.dismissedTips.length} dismissed tips again`
            : 'No dismissed tips'}
        </Button>
      </Card>

      {/* Appearance */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-display text-[14px] uppercase tracking-wide text-secondary">Appearance</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          <ThemeBtn active={settings.theme === 'system'} onClick={() => updateSettings({ theme: 'system' })} Icon={Smartphone} label="System" />
          <ThemeBtn active={settings.theme === 'light'} onClick={() => updateSettings({ theme: 'light' })} Icon={Sun} label="Light" />
          <ThemeBtn active={settings.theme === 'dark'} onClick={() => updateSettings({ theme: 'dark' })} Icon={Moon} label="Dark" />
        </div>
      </Card>

      {/* Thresholds */}
      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-display text-[14px] uppercase tracking-wide text-secondary">Planning</h2>
        <Row
          label="Check-in goes stale after"
          hint="Manual check-ins are marked old past this."
          value={settings.staleMinutes}
          suffix="min"
          onDec={() => updateSettings({ staleMinutes: Math.max(5, settings.staleMinutes - 5) })}
          onInc={() => updateSettings({ staleMinutes: Math.min(120, settings.staleMinutes + 5) })}
        />
        <Row
          label="Shortest useful meetup"
          hint="Meetups shorter than this are ignored."
          value={settings.minMeetupMinutes}
          suffix="min"
          onDec={() => updateSettings({ minMeetupMinutes: Math.max(5, settings.minMeetupMinutes - 5) })}
          onInc={() => updateSettings({ minMeetupMinutes: Math.min(60, settings.minMeetupMinutes + 5) })}
        />
        <label className="mt-2 flex items-center justify-between gap-3 py-2">
          <span className="flex-1">
            <span className="block text-[14px] font-semibold text-primary">Allow meetups during Must See sets</span>
            <span className="block text-[12px] text-muted">Off by default — we never suggest leaving a Must See early.</span>
          </span>
          <Toggle on={settings.allowMeetupDuringMustSee} onChange={(v) => updateSettings({ allowMeetupDuringMustSee: v })} />
        </label>
      </Card>

      {/* Admin */}
      <Card className="p-4">
        <h2 className="mb-3 font-display text-[14px] uppercase tracking-wide text-secondary">Admin</h2>
        <button
          type="button"
          onClick={() => onOpenMenu('map-setup')}
          className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-left"
        >
          <MapPinned size={20} className="text-accent" aria-hidden />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-primary">Map setup</div>
            <div className="text-[12px] text-secondary">
              {settings.map.verified ? 'Verified' : 'Unverified'} ·{' '}
              {settings.mapEditingEnabled ? 'editing on' : 'editing off'}
            </div>
          </div>
        </button>
      </Card>
    </Screen>
  );
}

function ThemeBtn({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: typeof Sun; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx('flex flex-col items-center gap-1 rounded-xl border-2 p-3', active ? 'border-warp-pink bg-warp-pink/5' : 'border-subtle')}
    >
      <Icon size={20} className={active ? 'text-warp-pink' : 'text-secondary'} aria-hidden />
      <span className="text-[13px] font-semibold text-primary">{label}</span>
    </button>
  );
}

function Row({
  label,
  hint,
  value,
  suffix,
  onDec,
  onInc,
}: {
  label: string;
  hint: string;
  value: number;
  suffix: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-subtle py-2 last:border-0">
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-primary">{label}</div>
        <div className="text-[12px] text-muted">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDec} aria-label="Decrease" className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[18px] font-bold">−</button>
        <span className="w-14 text-center text-[14px] font-bold text-primary">{value} {suffix}</span>
        <button type="button" onClick={onInc} aria-label="Increase" className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[18px] font-bold">+</button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  // Visual track is 28px tall; padding extends the tap target to 44px.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="min-h-touch min-w-touch -m-2 flex shrink-0 items-center justify-center p-2"
    >
      <span className={cx('relative block h-7 w-12 rounded-full transition', on ? 'bg-warp-ok' : 'bg-[var(--track-off)]')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}
