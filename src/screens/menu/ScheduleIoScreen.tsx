import { useMemo, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { Screen, Card, cx } from '@/components/ui';
import { ExportPanel } from '@/components/ExportPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { useApp } from '@/store/appStore';
import { ScheduleStatusStrip } from '@/components/ScheduleStatusStrip';
import { useScheduleStatus } from '@/hooks/useScheduleStatus';
import { encodeSchedule } from '@/domain/share/payloads';
import { timestampSlug } from '@/domain/share/files';
import { scheduleCompletion } from '@/store/selectors';
import type { DayId } from '@/domain/types';

export function ScheduleIoScreen() {
  const performances = useApp((s) => s.performances);
  /**
   * The code carries whoever exported it, and the receiving phone SHOWS it —
   * "Imported from …" on the schedule strip. So send the display name, not the
   * internal id: an id like `sam-k3f9q` is noise, and if you're sharing a code
   * publicly this is the string strangers will read.
   */
  const exportSource = useApp(
    (s) => s.userById.get(s.settings.activeUserId)?.name ?? s.settings.activeUserId,
  );
  const artistById = useApp((s) => s.artistById);
  const provenance = useApp((s) => s.settings.schedule);
  const status = useScheduleStatus();
  const [tab, setTab] = useState<'export' | 'import'>('import');

  const completion = useMemo(() => scheduleCompletion(performances), [performances]);
  // Revision + verified days travel with the code so the receiving phone can
  // tell an update from a re-send, and doesn't inherit a stale "complete"
  // stamp (plan §P0-5).
  const code = useMemo(() => {
    const completeDays = (['saturday', 'sunday'] as DayId[]).filter(
      (d) => status.byDay[d].status === 'complete',
    );
    return encodeSchedule(performances, exportSource, new Date().toISOString(), {
      revision: provenance.scheduleRevision + 1,
      completeDays,
      // Names for any band typed in off the board, so the receiving phone can
      // create it rather than silently skipping the set.
      artistById,
    });
  }, [performances, exportSource, provenance.scheduleRevision, status, artistById]);
  const scheduledCount = performances.filter((p) => p.startTime && p.stageId).length;

  return (
    <Screen>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        <Tab active={tab === 'import'} onClick={() => setTab('import')}>
          <Download size={15} aria-hidden /> Import
        </Tab>
        <Tab active={tab === 'export'} onClick={() => setTab('export')}>
          <Upload size={15} aria-hidden /> Export
        </Tab>
      </div>

      {/* What this phone currently holds, before importing over it. */}
      <ScheduleStatusStrip day="saturday" />
      <ScheduleStatusStrip day="sunday" />

      {tab === 'import' ? (
        <>
          <Card className="mb-4 border-warp-blue-500/30 bg-warp-blue-500/5 p-3">
            <p className="text-[13px] leading-relaxed text-secondary">
              Got the official set times as a Warped code from a friend or your other device? Scan,
              paste, or load the file. You&apos;ll see exactly what changes before anything is saved.
            </p>
          </Card>
          <ImportPanel accept={['schedule']} />
        </>
      ) : (
        <>
          <Card className="mb-4 p-3">
            <p className="text-[13px] text-secondary">
              Share the set times you&apos;ve entered so far. {scheduledCount} performances have a stage
              and start time ({completion.percent}% complete). The code contains the actual data, so it
              works with no signal.
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              Sends as revision {provenance.scheduleRevision + 1}. Days you&apos;ve marked complete
              are sent as complete; the rest arrive as partial.
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              This code says it came from <b>{exportSource}</b>. Everyone who imports it sees that —
              rename your profile in Settings first if you&apos;re sharing it beyond your friends.
            </p>
          </Card>
          <ExportPanel
            code={code}
            filename={`warped-schedule-${timestampSlug()}.json`}
            hint="Your friend imports this on the Schedule Import screen."
          />
        </>
      )}
    </Screen>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-touch flex items-center justify-center gap-1 rounded-lg text-[14px] font-semibold transition',
        active ? 'bg-warp-blue-500 text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}
