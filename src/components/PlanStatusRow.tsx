import { UserRoundX, Clock3, Check, Smartphone } from 'lucide-react';
import { FriendAvatar } from './FriendAvatar';
import { cx } from './ui';
import { planStatusLabel, planStatusBadge, type PlanInfo } from '@/domain/planStatus';
import type { User } from '@/domain/types';

const META = {
  local: { Icon: Smartphone, className: 'text-accent' },
  imported: { Icon: Check, className: 'text-ok' },
  stale: { Icon: Clock3, className: 'text-warn' },
  placeholder: { Icon: UserRoundX, className: 'text-muted' },
} as const;

/**
 * One person + the true state of their plan (plan §P0-2).
 *
 * Every surface that lists people uses this so "Plan not imported" can never
 * be mistaken for "free all day". State is carried by an icon and a word, not
 * by dimming alone.
 */
export function PlanStatusRow({
  user,
  info,
  right,
  onClick,
  compact,
}: {
  user: User;
  info: PlanInfo;
  right?: React.ReactNode;
  onClick?: () => void;
  compact?: boolean;
}) {
  const meta = META[info.status];
  const body = (
    <>
      <FriendAvatar user={user} size={compact ? 28 : 34} ring dim={info.status === 'placeholder'} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-primary">{user.name}</span>
          <meta.Icon size={12} className={meta.className} aria-hidden />
          <span className={cx('text-[11px] font-semibold', meta.className)}>
            {planStatusBadge(info.status)}
          </span>
        </span>
        <span className="block truncate text-[12px] text-secondary">{planStatusLabel(info)}</span>
      </span>
      {right}
    </>
  );

  const cls = 'flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'active:bg-[var(--press)]')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The banner shown wherever group results are computed from an incomplete
 * roster. Naming who is missing is the point — a silent omission is what made
 * the old "everyone is free" claims wrong.
 */
export function MissingPlansNote({
  missing,
  className,
}: {
  missing: User[];
  className?: string;
}) {
  if (!missing.length) return null;
  const names = missing.map((u) => u.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    <p
      className={cx(
        'mb-3 flex items-start gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-[12px] leading-relaxed text-secondary',
        className,
      )}
    >
      <UserRoundX size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
      <span>
        {list} {names.length === 1 ? "hasn't" : "haven't"} shared a plan with this phone, so
        {names.length === 1 ? ' their' : ' their'} time is unknown — not free. Nothing below counts
        {names.length === 1 ? ' them' : ' them'} in.
      </span>
    </p>
  );
}
