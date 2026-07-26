import { Menu, Minimize2 } from 'lucide-react';
import { OfflineIndicator } from './OfflineIndicator';
import { WarpedWordmark } from './WarpedWordmark';

/** Branded blue header with the Warped wordmark, menu button, offline badge. */
export function TopBar({
  onMenu,
  showOffline = true,
  onBackToFestival,
}: {
  onMenu: () => void;
  showOffline?: boolean;
  /** Present while festival mode is on and you've stepped into the full app. */
  onBackToFestival?: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 pt-safe"
      style={{
        background: 'linear-gradient(180deg, #1f5fa8 0%, #0b2f6b 100%)',
      }}
    >
      <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="min-h-touch min-w-touch -ml-2 flex items-center justify-center rounded-xl text-white active:bg-white/10"
        >
          <Menu size={24} aria-hidden />
        </button>
        <WarpedWordmark className="h-9" />
        {onBackToFestival ? (
          <button
            type="button"
            onClick={onBackToFestival}
            aria-label="Back to Festival mode"
            title="Back to Festival mode"
            className="min-h-touch min-w-touch -mr-2 flex items-center justify-center rounded-xl text-white active:bg-white/10"
          >
            <Minimize2 size={20} aria-hidden />
          </button>
        ) : showOffline ? (
          <OfflineIndicator />
        ) : (
          <div className="min-w-touch" aria-hidden />
        )}
      </div>
    </header>
  );
}
