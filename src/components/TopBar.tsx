import { Menu } from 'lucide-react';
import { OfflineIndicator } from './OfflineIndicator';
import { WarpedWordmark } from './WarpedWordmark';

/** Branded blue header with the Warped wordmark, menu button, offline badge. */
export function TopBar({
  onMenu,
  showOffline = true,
}: {
  onMenu: () => void;
  showOffline?: boolean;
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
        {showOffline ? (
          <OfflineIndicator />
        ) : (
          <div className="min-w-touch" aria-hidden />
        )}
      </div>
    </header>
  );
}
