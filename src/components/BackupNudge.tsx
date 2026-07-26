import { HardDriveDownload } from 'lucide-react';
import { Card, Button } from './ui';
import { useApp } from '@/store/appStore';
import { useScheduleStatus } from '@/hooks/useScheduleStatus';
import { plural } from '@/domain/plural';
import type { MenuRoute } from './MenuDrawer';

/** Below this, losing the entry is annoying rather than a real setback. */
const WORTH_BACKING_UP = 10;

/**
 * "These set times only exist on this phone."
 *
 * A hand-typed board is the most expensive thing in the app and IndexedDB is
 * its only copy — iOS can evict it, and `requestPersistentStorage` is commonly
 * refused. Nothing ever mentioned that, and `scheduleExportedAt` was only
 * written on import, so the app couldn't have said whether a copy existed even
 * if it wanted to. Both now true, so this can be honest and can shut up once
 * a copy has actually been made.
 */
export function BackupNudge({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const status = useScheduleStatus();
  const provenance = useApp((s) => s.settings.schedule);
  const entered = status.byDay.saturday.entered + status.byDay.sunday.entered;

  if (entered < WORTH_BACKING_UP) return null;
  // Exported since the last time anything was entered? Then it's covered.
  if (provenance.scheduleExportedAt) return null;

  return (
    <Card className="mb-3 border-warp-yellow/50 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <HardDriveDownload size={15} className="text-warn" aria-hidden />
        <span className="font-display text-[14px] text-primary">
          {plural(entered, 'set time')} live only on this phone
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-secondary">
        Nothing is backed up anywhere else. Send a copy to your group, or save the code
        somewhere — it takes a few seconds and it works with no signal.
      </p>
      <Button variant="yellow" className="mt-2 text-[13px]" onClick={() => onOpenMenu('schedule-io')}>
        Export a copy
      </Button>
    </Card>
  );
}
