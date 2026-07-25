import { useState } from 'react';
import { CalendarCheck, CalendarClock, CircleAlert, Check } from 'lucide-react';
import { Card, Button, Pill, cx } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { useApp } from '@/store/appStore';
import { useDayScheduleStatus } from '@/hooks/useScheduleStatus';
import { completionLabel } from '@/domain/scheduleStatus';
import { formatRelative, dayLabel } from '@/domain/time';
import type { DayId } from '@/domain/types';

/**
 * Honest header for a day's set times (plan §P0-1 + §P0-5).
 *
 * Shows how much of the day is actually entered, where the times came from,
 * and — when the day is only partially entered — says plainly that anything
 * derived from it (free time, meetups, friend positions) is incomplete.
 */
/**
 * The caveat that has to accompany any "nothing found" result on a day that
 * isn't fully entered. An empty result from partial data means "nothing found
 * YET", and saying otherwise is the exact over-confidence this pass removes.
 */
export function ProvisionalNote({
  day,
  what,
  className,
}: {
  day: DayId;
  /** e.g. "conflicts", "shared sets", "meetup windows". */
  what: string;
  className?: string;
}) {
  const info = useDayScheduleStatus(day);
  if (info.status === 'complete') return null;
  return (
    <p
      className={cx(
        'mt-3 flex items-start gap-1.5 rounded-lg bg-warp-warn/15 px-2.5 py-2 text-[12px] leading-relaxed text-warn',
        className,
      )}
    >
      <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {info.status === 'empty'
          ? `No set times entered for ${dayLabel(day)}, so no ${what} can be found yet.`
          : `Only ${info.entered} of ${info.expected} ${dayLabel(day)} sets have times — more ${what} may appear as the rest are entered.`}
      </span>
    </p>
  );
}

export function ScheduleStatusStrip({
  day,
  compact,
  className,
}: {
  day: DayId;
  /** One line, no actions — for embedding above a list. */
  compact?: boolean;
  className?: string;
}) {
  const info = useDayScheduleStatus(day);
  const provenance = useApp((s) => s.settings.schedule);
  const activeUser = useApp((s) => s.userById.get(s.settings.activeUserId));
  const markDayComplete = useApp((s) => s.markDayComplete);
  const unmarkDayComplete = useApp((s) => s.unmarkDayComplete);
  const [confirming, setConfirming] = useState(false);

  const tone =
    info.status === 'complete' ? 'ok' : info.status === 'partial' ? 'warn' : 'default';
  const Icon = info.status === 'complete' ? CalendarCheck : CalendarClock;

  if (compact) {
    return (
      <div
        className={cx(
          'mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]',
          info.status === 'complete'
            ? 'bg-warp-ok/10 text-ok'
            : info.status === 'partial'
              ? 'bg-warp-warn/15 text-warn'
              : 'bg-[var(--surface-sunken)] text-secondary',
          className,
        )}
      >
        <Icon size={13} aria-hidden />
        <span className="font-semibold">{dayLabel(day)}:</span>
        <span>{completionLabel(info)}</span>
        {info.status === 'partial' && <span className="ml-auto shrink-0">Partial</span>}
      </div>
    );
  }

  return (
    <>
      <Card
        className={cx(
          'mb-3 p-3',
          info.status === 'partial' && 'border-warp-warn/40',
          className,
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <Icon size={16} className={info.status === 'complete' ? 'text-ok' : 'text-warn'} aria-hidden />
          <span className="font-display text-[14px] text-primary">
            {dayLabel(day)} schedule
          </span>
          <Pill color={tone} className="ml-auto">
            {info.status === 'complete' ? 'Complete' : info.status === 'partial' ? 'Partial' : 'Not entered'}
          </Pill>
        </div>

        <p className="text-[13px] font-semibold text-primary">{completionLabel(info)}</p>

        {/* Provenance — an imported schedule must never look like one you typed. */}
        <p className="mt-0.5 text-[12px] text-secondary">
          {provenance.scheduleSource && provenance.scheduleImportedAt ? (
            <>
              Imported from {provenance.scheduleSource} {formatRelative(provenance.scheduleImportedAt)}
              {provenance.scheduleRevision > 0 && <> · revision {provenance.scheduleRevision}</>}
            </>
          ) : info.status === 'empty' ? (
            'No set times on this phone yet.'
          ) : (
            'Entered on this phone.'
          )}
        </p>

        {info.status === 'complete' ? (
          <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-ok">
            <Check size={13} aria-hidden />
            {info.verifiedAt
              ? `Verified complete by ${info.verifiedBy ?? 'you'} ${formatRelative(info.verifiedAt)}`
              : 'Every set on this day has a stage and a time.'}
          </p>
        ) : info.status === 'partial' ? (
          <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-warn">
            <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
            Partial schedule — free time, meetups and friend positions for this day may be
            incomplete. Sets without a time show as unknown, not free.
          </p>
        ) : null}

        <div className="mt-2 flex gap-2">
          {info.status === 'partial' && (
            <Button
              variant="secondary"
              className="flex-1 px-3 py-1.5 text-[13px]"
              onClick={() => setConfirming(true)}
            >
              Mark {dayLabel(day)} complete
            </Button>
          )}
          {info.verifiedAt && (
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-[13px]"
              onClick={() => void unmarkDayComplete(day)}
            >
              Undo complete
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        title={`Mark ${dayLabel(day)} complete?`}
        message={
          `Only ${info.entered} of ${info.expected} sets have a stage and time. Marking the day ` +
          'complete tells the app to treat unassigned time as genuinely free — do this only if ' +
          "you've checked the board and the remaining sets really aren't happening."
        }
        confirmLabel="Mark complete"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void markDayComplete(day, activeUser?.name ?? 'you');
          setConfirming(false);
        }}
      />
    </>
  );
}
