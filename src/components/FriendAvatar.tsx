import type { User } from '@/domain/types';
import { COLOR_VALUES } from '@/data/users';
import { cx } from './ui';

export function FriendAvatar({
  user,
  size = 40,
  ring = false,
  dim = false,
  className,
}: {
  user: Pick<User, 'name' | 'initials' | 'avatar' | 'colorKey'>;
  size?: number;
  ring?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const color = COLOR_VALUES[user.colorKey] ?? COLOR_VALUES.blue;
  return (
    <div
      className={cx('relative shrink-0 overflow-hidden rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: user.avatar ? undefined : color.bg,
        boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${color.ring}` : undefined,
        opacity: dim ? 0.45 : 1,
      }}
      role="img"
      aria-label={user.name}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-display"
          style={{ color: color.text, fontSize: size * 0.42 }}
        >
          {user.initials}
        </span>
      )}
    </div>
  );
}
