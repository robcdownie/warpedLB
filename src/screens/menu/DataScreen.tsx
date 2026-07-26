import { useMemo, useState } from 'react';
import { Database, Upload, Download, CalendarX, MapPinned, Trash2, ChevronRight } from 'lucide-react';
import { Screen, Card } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ExportPanel } from '@/components/ExportPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApp } from '@/store/appStore';
import { encodeBackup, encodeSchedule, encodeCoordinates } from '@/domain/share/payloads';
import { timestampSlug } from '@/domain/share/files';

type SheetKind = null | 'backup-export' | 'backup-import' | 'schedule' | 'coords';
type ConfirmKind = null | 'schedule' | 'map' | 'all';

export function DataScreen() {
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const performances = useApp((s) => s.performances);
  const artistById = useApp((s) => s.artistById);
  const locations = useApp((s) => s.locations);
  const checkins = useApp((s) => s.checkins);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const exportSource = useApp(
    (s) => s.userById.get(s.settings.activeUserId)?.name ?? s.settings.activeUserId,
  );
  const resetSchedule = useApp((s) => s.resetSchedule);
  const resetMap = useApp((s) => s.resetMap);
  const resetAllLocalData = useApp((s) => s.resetAllLocalData);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const settings = useApp((s) => s.settings);
  // Timestamp computed inside each memo — a top-level `new Date()` would be a
  // fresh dep every render and defeat the memoization entirely.
  const backupCode = useMemo(
    () =>
      encodeBackup(
        { users, selections, performances, locations, checkins, settings },
        activeUserId,
        new Date().toISOString(),
      ),
    [users, selections, performances, locations, checkins, settings, activeUserId],
  );
  // Codes show their sender on the receiving phone, so send the display name
  // rather than the internal id — see ScheduleIoScreen for the full reasoning.
  const scheduleCode = useMemo(
    () => encodeSchedule(performances, exportSource, new Date().toISOString(), { artistById }),
    [performances, exportSource, artistById],
  );
  const coordsCode = useMemo(
    () => encodeCoordinates(locations, exportSource, new Date().toISOString()),
    [locations, exportSource],
  );

  return (
    <Screen>
      <Card className="mb-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] text-primary">
          <Database size={16} className="text-accent" aria-hidden /> Backup &amp; restore
        </h2>
        <div className="space-y-2">
          <RowBtn Icon={Upload} label="Export complete backup" desc="Everything, as one code/file" onClick={() => setSheet('backup-export')} />
          <RowBtn Icon={Download} label="Import complete backup" desc="Restore from a backup (with preview)" onClick={() => setSheet('backup-import')} />
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 font-display text-[15px] text-primary">Export pieces</h2>
        <div className="space-y-2">
          <RowBtn Icon={CalendarX} label="Export schedule" desc="Just the set times" onClick={() => setSheet('schedule')} />
          <RowBtn Icon={MapPinned} label="Export map coordinates" desc="Calibrated pin positions" onClick={() => setSheet('coords')} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-display text-[15px] text-primary">Reset</h2>
        <p className="mb-3 text-[13px] text-secondary">These can&apos;t be undone. Export a backup first if unsure.</p>
        <div className="space-y-2">
          <RowBtn Icon={CalendarX} label="Reset schedule only" desc="Clear all set times, keep your picks" danger onClick={() => setConfirm('schedule')} />
          <RowBtn Icon={MapPinned} label="Reset map only" desc="Restore seed pin positions" danger onClick={() => setConfirm('map')} />
          <RowBtn Icon={Trash2} label="Reset all local data" desc="Wipe everything and re-seed" danger onClick={() => setConfirm('all')} />
        </div>
      </Card>

      {/* Export sheets */}
      <Sheet open={sheet === 'backup-export'} onClose={() => setSheet(null)} title="Complete backup">
        <ExportPanel code={backupCode} filename={`warped-backup-${timestampSlug()}.json`} hint="This includes everyone's data on this device." />
      </Sheet>
      <Sheet open={sheet === 'backup-import'} onClose={() => setSheet(null)} title="Import backup" size="tall">
        <ImportPanel accept={['backup']} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'schedule'} onClose={() => setSheet(null)} title="Export schedule">
        <ExportPanel code={scheduleCode} filename={`warped-schedule-${timestampSlug()}.json`} />
      </Sheet>
      <Sheet open={sheet === 'coords'} onClose={() => setSheet(null)} title="Export coordinates">
        <ExportPanel code={coordsCode} filename={`warped-coords-${timestampSlug()}.json`} />
      </Sheet>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirm === 'schedule'}
        title="Reset schedule?"
        message="This clears every stage and set time. Your band picks and priorities stay."
        confirmLabel="Reset schedule"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await resetSchedule(); setConfirm(null); }}
      />
      <ConfirmDialog
        open={confirm === 'map'}
        title="Reset map?"
        message="This restores all pins to their starting positions and removes custom pins and walk-time overrides."
        confirmLabel="Reset map"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await resetMap(); setConfirm(null); }}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        title="Erase everything?"
        message="Wipes all local data on this device — picks, schedule, friends, check-ins, calibration — then re-seeds the fresh lineup. This cannot be undone."
        confirmLabel="Erase all"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await resetAllLocalData(); setConfirm(null); }}
      />
    </Screen>
  );
}

function RowBtn({
  Icon,
  label,
  desc,
  danger,
  onClick,
}: {
  Icon: typeof Database;
  label: string;
  desc: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-left active:opacity-80"
    >
      <Icon size={20} className={danger ? 'text-danger' : 'text-accent'} aria-hidden />
      <span className="flex-1">
        <span className={`block text-[14px] font-semibold ${danger ? 'text-warp-danger' : 'text-primary'}`}>{label}</span>
        <span className="block text-[12px] text-muted">{desc}</span>
      </span>
      <ChevronRight size={18} className="text-muted" aria-hidden />
    </button>
  );
}
