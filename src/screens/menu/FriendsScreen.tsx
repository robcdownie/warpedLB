import { useMemo, useState } from 'react';
import { Upload, Download, UserCheck, Camera, Check } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { FriendAvatar } from '@/components/FriendAvatar';
import { ExportPanel } from '@/components/ExportPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { useApp } from '@/store/appStore';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { planStatusLabel, planStatusBadge } from '@/domain/planStatus';
import { encodeSelections } from '@/domain/share/payloads';
import { timestampSlug } from '@/domain/share/files';

export function FriendsScreen() {
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const updateSettings = useApp((s) => s.updateSettings);
  const putUser = useApp((s) => s.putUser);
  const plans = usePlanStatuses();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const activeUser = users.find((u) => u.id === activeUserId);
  const myCount = useMemo(
    () => selections.filter((s) => s.userId === activeUserId && s.selected).length,
    [selections, activeUserId],
  );
  // The people to send selections to — everyone except whoever this device is.
  const otherNames = users.filter((u) => u.id !== activeUserId).map((u) => u.name);
  const othersLabel = otherNames.length ? otherNames.join(' & ') : 'your friends';

  const exportCode = useMemo(
    () => (activeUser ? encodeSelections(activeUser, selections, new Date().toISOString()) : ''),
    [activeUser, selections],
  );

  const setAvatar = async (file: File, userId: string) => {
    // Store the image locally as a data URL (offline-safe).
    const reader = new FileReader();
    reader.onload = async () => {
      const u = users.find((x) => x.id === userId);
      if (u) await putUser({ ...u, avatar: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Screen>
      {/* Who am I */}
      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[15px] uppercase tracking-wide text-secondary">
          This device is
        </h2>
        <p className="mb-3 text-[13px] text-secondary">
          Each person picks bands on their own phone, then shares. Choose whose phone this is.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => updateSettings({ activeUserId: u.id })}
              className={cx(
                'flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition',
                u.id === activeUserId ? 'border-warp-pink bg-warp-pink/5' : 'border-subtle',
              )}
            >
              <FriendAvatar user={u} size={44} ring={u.id === activeUserId} />
              <span className="text-[13px] font-semibold text-primary">{u.name}</span>
              {u.id === activeUserId && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-warp-pink">
                  <UserCheck size={11} aria-hidden /> You
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Share my selections */}
      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[15px] uppercase tracking-wide text-secondary">
          Share my bands
        </h2>
        <p className="mb-3 text-[13px] text-secondary">
          You have <b>{myCount}</b> bands selected. Send them to {othersLabel} by QR or code.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="yellow" className="whitespace-nowrap text-[14px]" onClick={() => setExporting(true)} disabled={!myCount}>
            <Upload size={16} aria-hidden /> Export mine
          </Button>
          <Button variant="secondary" className="whitespace-nowrap text-[14px]" onClick={() => setImporting(true)}>
            <Download size={16} aria-hidden /> Import a friend
          </Button>
        </div>
      </Card>

      {/* Friends list */}
      <Card className="p-4">
        <h2 className="mb-3 font-display text-[15px] uppercase tracking-wide text-secondary">
          The crew
        </h2>
        <ul className="space-y-3">
          {users.map((u) => {
            const info = plans.byUser.get(u.id)!;
            const isMe = u.id === activeUserId;
            return (
              <li key={u.id} className="flex items-center gap-3">
                <label className="relative cursor-pointer">
                  <FriendAvatar user={u} size={44} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label={`Set a photo for ${u.name}`}
                    onChange={(e) => e.target.files?.[0] && setAvatar(e.target.files[0], u.id)}
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-warp-blue-500 text-white ring-2 ring-[var(--surface-card)]">
                    <Camera size={11} aria-hidden />
                  </span>
                </label>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[15px] text-primary">{u.name}</span>
                    {isMe && (
                      <span className="rounded-full bg-warp-pink/15 px-1.5 text-[10px] font-bold text-warp-pink">
                        You
                      </span>
                    )}
                    <span
                      className={cx(
                        'rounded-full px-1.5 text-[10px] font-bold',
                        info.status === 'placeholder'
                          ? 'bg-[var(--surface-sunken)] text-muted'
                          : info.status === 'stale'
                            ? 'bg-warp-warn/20 text-warn'
                            : 'bg-warp-ok/15 text-ok',
                      )}
                    >
                      {planStatusBadge(info.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] text-secondary">
                    {info.status === 'imported' && <Check size={12} className="text-warp-ok" aria-hidden />}
                    {planStatusLabel(info)}
                  </div>
                  {/* The whole point of the distinction, said out loud. */}
                  {!info.eligible && !isMe && (
                    <div className="text-[11px] text-muted">
                      Left out of group timelines, meetups and free-time — unknown, not free.
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
        Two phones can&apos;t sync over the air with no signal — that&apos;s why sharing uses a QR
        code or a short text code you scan or paste. Re-importing the same person just updates them.
      </p>

      {/* Export sheet */}
      <Sheet open={exporting} onClose={() => setExporting(false)} title={`${activeUser?.name}'s bands`}>
        <ExportPanel
          code={exportCode}
          filename={`warped-${activeUser?.id}-selections-${timestampSlug()}.json`}
          hint="Your friend opens Import a friend and scans this."
        />
      </Sheet>

      {/* Import sheet */}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Import a friend's bands" size="tall">
        <ImportPanel accept={['selections']} onDone={() => setImporting(false)} />
      </Sheet>
    </Screen>
  );
}
