import { useRef } from 'react';
import {
  Settings,
  Users,
  Upload,
  Database,
  ShieldCheck,
  FlaskConical,
  Info,
  MapPinned,
  Footprints,
  LifeBuoy,
  Maximize2,
  X,
} from 'lucide-react';
import { cx } from './ui';
import { useApp } from '@/store/appStore';
import { useModalA11y } from '@/hooks/useModalA11y';

export type MenuRoute =
  | 'settings'
  | 'friends'
  | 'schedule-io'
  | 'data'
  | 'offline-test'
  | 'demo'
  | 'about'
  | 'map-setup'
  | 'calibration'
  | 'travel'
  | 'emergency';

const ITEMS: { route: MenuRoute; label: string; Icon: typeof Settings; desc: string }[] = [
  { route: 'friends', label: 'Friends & Sharing', Icon: Users, desc: 'Import / export selections' },
  { route: 'schedule-io', label: 'Schedule Import / Export', Icon: Upload, desc: 'Set times as QR, code, or file' },
  { route: 'offline-test', label: 'Offline Test', Icon: ShieldCheck, desc: 'Verify offline readiness' },
  { route: 'travel', label: 'Travel & Crowd', Icon: Footprints, desc: 'Walk-time matrix & crowd level' },
  // Calibration lives inside Map Setup: it's a pre-festival admin task, not
  // something to reach for while standing in a crowd (plan §P1-12).
  { route: 'map-setup', label: 'Map Setup', Icon: MapPinned, desc: 'Verify the map & calibrate pins' },
  { route: 'emergency', label: 'Emergency Schedule', Icon: LifeBuoy, desc: 'Plain-text backup plan' },
  { route: 'data', label: 'Backup & Data', Icon: Database, desc: 'Export / import / reset' },
  { route: 'demo', label: 'Demo Mode', Icon: FlaskConical, desc: 'Try the app with sample times' },
  { route: 'settings', label: 'Settings', Icon: Settings, desc: 'Profile, theme, thresholds' },
  { route: 'about', label: 'About', Icon: Info, desc: 'Disclaimer & version' },
];

export function MenuDrawer({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (r: MenuRoute) => void;
}) {
  const activeUser = useApp((s) => s.userById.get(s.settings.activeUserId));
  const festivalMode = useApp((s) => s.settings.festivalMode);
  const updateSettings = useApp((s) => s.updateSettings);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="pb-safe absolute left-0 top-0 h-full w-[86%] max-w-[360px] overflow-y-auto shadow-2xl outline-none"
        style={{ background: 'var(--surface-card)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-4 pt-[calc(var(--safe-top)+1rem)]"
          style={{ background: 'linear-gradient(180deg,#1f5fa8,#0b2f6b)' }}
        >
          <div>
            <div className="font-display text-white">Menu</div>
            {activeUser && (
              <div className="text-[12px] text-white/80">Active: {activeUser.name}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-white active:bg-white/10"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        {/* Festival Mode is a display mode, not a screen, so it had no home in
            this list — it lived behind an icon on the Now dashboard that only
            appears once set times exist, plus a Settings toggle. Neither is
            somewhere you'd look. It's reachable from every screen now. */}
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={() => {
              void updateSettings({ festivalMode: !festivalMode });
              onClose();
            }}
            role="switch"
            aria-checked={festivalMode}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left',
              festivalMode
                ? 'border-warp-pink bg-warp-pink/10'
                : 'border-subtle active:bg-[var(--press)]',
            )}
          >
            <span
              className={cx(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                festivalMode ? 'bg-warp-pink text-white' : 'bg-accent-soft text-accent',
              )}
            >
              <Maximize2 size={20} aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-primary">Festival Mode</span>
              <span className="block text-[12px] text-muted">
                {festivalMode
                  ? 'On — tap to get the full app back'
                  : "One screen: what's next, when to leave, where the crew is"}
              </span>
            </span>
            <span
              className={cx(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                festivalMode ? 'bg-warp-pink text-white' : 'bg-[var(--surface-sunken)] text-muted',
              )}
            >
              {festivalMode ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        <ul className="p-2">
          {ITEMS.map(({ route, label, Icon, desc }) => (
            <li key={route}>
              <button
                type="button"
                onClick={() => onNavigate(route)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left',
                  'active:bg-[var(--press)]',
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-primary">{label}</span>
                  <span className="block text-[12px] text-muted">{desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-5 py-4 text-[11px] leading-relaxed text-muted">
          Unofficial personal companion app. Not affiliated with or endorsed by Vans or
          Vans Warped Tour.
        </p>
      </div>
    </div>
  );
}
