import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { repoFor } from '@/db/repo';
import { pendingLineupNotices, clearLineupNotices, type LineupNotice } from '@/data/lineupMigrations';
import { useApp } from '@/store/appStore';

/**
 * Tells the user what a lineup correction did to their saved plan (plan §P0-7).
 *
 * Migrations run silently at seed time, which is exactly why this exists: a
 * band moving day or getting cancelled changes someone's plan, and finding
 * that out at the stage is not acceptable.
 */
export function LineupNoticeBanner() {
  const mode = useApp((s) => s.mode);
  const users = useApp((s) => s.users);
  const [notices, setNotices] = useState<LineupNotice[]>([]);

  useEffect(() => {
    let alive = true;
    void pendingLineupNotices(repoFor(mode)).then((n) => {
      if (alive) setNotices(n);
    });
    return () => {
      alive = false;
    };
  }, [mode]);

  if (!notices.length) return null;

  const dismiss = async () => {
    await clearLineupNotices(repoFor(mode));
    setNotices([]);
  };

  return (
    <div className="mx-auto mb-1 w-full max-w-[560px] px-4 pt-2">
      <div className="rounded-xl border border-warp-yellow/60 bg-warp-yellow/10 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <Megaphone size={16} className="text-warn" aria-hidden />
          <span className="flex-1 font-display text-[14px] text-primary">
            {notices.length === 1 ? 'Lineup update' : `${notices.length} lineup updates`}
          </span>
          <button
            type="button"
            onClick={() => void dismiss()}
            aria-label="Dismiss lineup updates"
            className="min-h-touch min-w-touch -m-2 flex items-center justify-center text-muted"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
        <ul className="space-y-1">
          {notices.map((n, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-secondary">
              {n.message}
              {n.affectedUserIds.length > 0 && (
                <span className="text-muted">
                  {' '}
                  (affects {n.affectedUserIds
                    .map((id) => users.find((u) => u.id === id)?.name ?? id)
                    .join(', ')})
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
