import { MapPin, Clock, Music, Unplug } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { PriorityControl } from '@/components/PriorityControl';
import { ConflictCard } from '@/components/ConflictCard';
import { useApp } from '@/store/appStore';
import { useConflicts } from '@/hooks/useConflicts';
import { formatTime, dayLabel } from '@/domain/time';
import type { Performance, Artist } from '@/domain/types';

export function BandDetailSheet({
  performance,
  artist,
  onClose,
}: {
  performance: Performance | null;
  artist: Artist | undefined;
  onClose: () => void;
}) {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const locationById = useApp((s) => s.locationById);
  const getSelection = useApp((s) => s.getSelection);
  const toggleSelection = useApp((s) => s.toggleSelection);
  const setPriority = useApp((s) => s.setPriority);
  const setNotes = useApp((s) => s.setNotes);
  const conflicts = useConflicts(activeUserId);

  if (!performance) return null;

  const sel = getSelection(activeUserId, performance.id);
  const selected = !!sel?.selected;
  const stage = performance.stageId ? locationById.get(performance.stageId) : undefined;
  const isUnplugged = performance.type === 'unplugged';

  const friendsOn = selections.filter(
    (s) => s.performanceId === performance.id && s.selected && s.userId !== activeUserId,
  );
  const relevantConflicts = conflicts.filter((c) => c.performanceIds.includes(performance.id));

  return (
    <Sheet
      open={!!performance}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {isUnplugged ? <Unplug size={16} aria-hidden /> : <Music size={16} aria-hidden />}
          {artist?.name ?? 'Artist'}
        </span>
      }
    >
      {/* Meta row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={cx(
            'rounded-full px-2.5 py-1 text-[12px] font-semibold',
            isUnplugged ? 'bg-warp-orange/15 text-warp-orange' : 'bg-accent-soft text-accent',
          )}
        >
          {isUnplugged ? 'Warped Unplugged' : dayLabel(performance.day)}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] text-secondary">
          <MapPin size={14} aria-hidden />
          {stage ? stage.name : 'Stage pending'}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] text-secondary">
          <Clock size={14} aria-hidden />
          {performance.startTime ? formatTime(performance.startTime) : 'Time pending'}
        </span>
      </div>

      {/* Select toggle */}
      <Button
        variant={selected ? 'secondary' : 'yellow'}
        className="mb-4 w-full"
        onClick={() => toggleSelection(activeUserId, performance.id)}
      >
        {selected ? 'Remove from my bands' : 'Add to my bands'}
      </Button>

      {/* Priority */}
      {selected && (
        <div className="mb-4">
          <div className="mb-1.5 text-[13px] font-semibold text-secondary">Priority</div>
          <PriorityControl
            value={sel?.priority ?? 'want-to-see'}
            onChange={(p) => setPriority(activeUserId, performance.id, p)}
          />
        </div>
      )}

      {/* Notes */}
      {selected && (
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-semibold text-secondary" htmlFor="band-notes">
            Notes
          </label>
          <textarea
            id="band-notes"
            defaultValue={sel?.notes ?? ''}
            onBlur={(e) => setNotes(activeUserId, performance.id, e.target.value)}
            placeholder="e.g. meet at the barricade, or a can't-miss song"
            rows={2}
            className="w-full resize-none rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 py-2 text-[14px] text-primary outline-none focus:border-warp-blue-400"
          />
        </div>
      )}

      {/* Friends */}
      <div className="mb-4">
        <div className="mb-1.5 text-[13px] font-semibold text-secondary">Friends on this set</div>
        {friendsOn.length ? (
          <div className="flex flex-wrap gap-2">
            {friendsOn.map((f) => {
              const u = users.find((x) => x.id === f.userId);
              if (!u) return null;
              return (
                <span key={f.userId} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2 py-1">
                  <FriendAvatar user={u} size={22} />
                  <span className="text-[12px] font-semibold text-primary">{u.name}</span>
                  {f.attendanceDecision === 'attending' && (
                    <span className="text-[11px] text-warp-ok">attending</span>
                  )}
                  {f.attendanceDecision === 'skipping' && (
                    <span className="text-[11px] text-muted">skipping</span>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            No imported friends have this set yet.
          </p>
        )}
      </div>

      {/* Conflicts */}
      {relevantConflicts.length > 0 && (
        <div className="mb-2">
          <div className="mb-1.5 text-[13px] font-semibold text-secondary">
            Conflicts ({relevantConflicts.length})
          </div>
          <div className="space-y-2">
            {relevantConflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} userId={activeUserId} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
