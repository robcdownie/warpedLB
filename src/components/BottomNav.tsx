import { Home, Star, CalendarDays, Users, MapPin } from 'lucide-react';
import type { TabId } from '@/store/appStore';
import { cx } from './ui';

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: 'now', label: 'Now', Icon: Home },
  { id: 'bands', label: 'Bands', Icon: Star },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'group', label: 'Group', Icon: Users },
  { id: 'map', label: 'Map', Icon: MapPin },
];

export function BottomNav({
  active,
  onChange,
}: {
  /** null = no tab active (a menu screen is showing). */
  active: TabId | null;
  onChange: (t: TabId) => void;
}) {
  return (
    <nav
      // after:… paints the nav colour from the nav's bottom edge downward. On
      // iOS home-screen installs, a fixed bottom-0 element can sit ABOVE the
      // physical bottom (iOS reserves the home-indicator strip), leaving the
      // light page background showing under the bar. This filler covers that
      // gap; where the bar already reaches the bottom it paints below the
      // screen and is never seen.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-black/40 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-[var(--nav-bg)] after:content-['']"
      style={{ background: 'var(--nav-bg)' }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-[560px] items-stretch justify-around pb-safe">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className={cx(
                'min-h-touch flex flex-1 flex-col items-center gap-0.5 py-1.5',
                isActive ? 'text-warp-pink' : 'text-white/70',
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.6 : 2}
                fill={isActive && id === 'now' ? 'currentColor' : 'none'}
                aria-hidden
              />
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
