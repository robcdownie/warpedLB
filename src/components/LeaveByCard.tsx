import { useMemo } from 'react';
import { Footprints, MapPin, Clock, TriangleAlert } from 'lucide-react';
import { Card, cx } from './ui';
import { useApp } from '@/store/appStore';
import { leaveByPlan, urgencyLabel, crowdLabel, type LeaveByInfo } from '@/domain/leaveBy';
import { formatMinutes, formatDuration } from '@/domain/time';
import type { DayId } from '@/domain/types';

const URGENCY_STYLE: Record<LeaveByInfo['urgency'], { bg: string; text: string; border: string }> = {
  plenty: { bg: 'bg-warp-ok/10', text: 'text-ok', border: 'border-warp-ok/30' },
  soon: { bg: 'bg-warp-yellow/15', text: 'text-warn', border: 'border-warp-yellow/50' },
  now: { bg: 'bg-warp-pink/10', text: 'text-pink', border: 'border-warp-pink/50' },
  late: { bg: 'bg-warp-danger/10', text: 'text-danger', border: 'border-warp-danger/50' },
};

/** Shared hook so Now and the Festival screen agree on the numbers. */
export function useLeaveBy(userId: string, day: DayId, atMinute: number, limit = 3): LeaveByInfo[] {
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const locationById = useApp((s) => s.locationById);
  const allPerformances = useApp((s) => s.performances);
  const crowd = useApp((s) => s.settings.crowdDelay);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const overrides = useApp((s) => s.travelOverrides);

  return useMemo(
    () =>
      leaveByPlan(
        userId,
        day,
        atMinute,
        {
          selections,
          performanceById,
          locationById,
          allPerformances,
          crowd,
          turnoverBuffer,
          overrides,
        },
        limit,
      ),
    [userId, day, atMinute, selections, performanceById, locationById, allPerformances, crowd, turnoverBuffer, overrides, limit],
  );
}

/**
 * "Leave by 2:57 PM — about 8 minutes to Ghost Stage" (add-on §2).
 *
 * Deliberately the countdown to LEAVING, not to the set starting: the walk is
 * the part people misjudge. No push notifications are involved — this is a
 * card you can see, because the app can't be relied on to run in the
 * background with no signal.
 */
export function LeaveByCard({
  info,
  artistName,
  className,
  compact,
}: {
  info: LeaveByInfo;
  artistName: string;
  className?: string;
  compact?: boolean;
}) {
  const locationById = useApp((s) => s.locationById);
  const to = info.toLocationId ? locationById.get(info.toLocationId) : undefined;
  const style = URGENCY_STYLE[info.urgency];
  const slack = info.slackMinutes;

  const countdown =
    slack > 0 ? `Leave in ${formatDuration(slack)}` : slack === 0 ? 'Leave now' : 'Leave-by time has passed';

  if (compact) {
    return (
      <div className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5', style.bg, className)}>
        <Clock size={14} className={style.text} aria-hidden />
        <span className={cx('text-[13px] font-bold', style.text)}>{countdown}</span>
        <span className="truncate text-[12px] text-secondary">
          · {formatDuration(info.walkMinutes)} to {to?.shortName ?? to?.name ?? 'the stage'}
        </span>
      </div>
    );
  }

  return (
    <Card className={cx('border p-3', style.border, className)}>
      <div className="flex items-center gap-2">
        <span className={cx('rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide', style.bg, style.text)}>
          {urgencyLabel(info.urgency)}
        </span>
        <span className={cx('font-display text-[17px]', style.text)}>
          Leave by {formatMinutes(info.leaveMinute)}
        </span>
      </div>

      <p className="mt-1.5 text-[14px] font-semibold text-primary">{artistName}</p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-secondary">
        <span className="flex items-center gap-1">
          <Footprints size={13} aria-hidden /> about {formatDuration(info.walkMinutes)}
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={13} aria-hidden /> {to?.name ?? 'Stage TBA'}
        </span>
        <span className="text-muted">{crowdLabel(info.crowd)} setting</span>
        <span className="text-muted">starts {formatMinutes(info.startMinute)}</span>
      </div>

      <p className={cx('mt-1.5 text-[13px] font-bold', style.text)}>{countdown}</p>

      {info.usesEstimated && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-warn">
          <TriangleAlert size={11} aria-hidden /> Uses an estimated end time for the set before it.
        </p>
      )}
    </Card>
  );
}
