import { Wifi, WifiOff, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/store/appStore';
import { cx } from './ui';

/** Compact online/offline + offline-ready badge shown in the header. */
export function OfflineIndicator({ className }: { className?: string }) {
  const online = useApp((s) => s.online);
  const offlineReady = useApp((s) => s.settings.offlineReady);

  return (
    <div className={cx('flex flex-col items-end gap-0.5', className)}>
      <div className="flex items-center gap-1.5 text-white">
        {online ? (
          <Wifi size={16} aria-hidden />
        ) : (
          <WifiOff size={16} aria-hidden />
        )}
        <span className="text-[12px] font-bold uppercase tracking-wide">
          {online ? 'Online' : 'Offline Mode'}
        </span>
        <span
          className={cx(
            'ml-0.5 h-2 w-2 rounded-full',
            online ? 'bg-warp-ok' : 'bg-warp-yellow',
          )}
          aria-hidden
        />
      </div>
      {offlineReady && (
        <span className="flex items-center gap-1 text-[11px] text-white/90">
          <CheckCircle2 size={12} aria-hidden />
          Ready for offline use
        </span>
      )}
    </div>
  );
}
