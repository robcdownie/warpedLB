import { useMemo, useState } from 'react';
import { Upload, Download, UserCheck, Camera, Check, UserPlus, Pencil, Trash2 } from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FriendAvatar } from '@/components/FriendAvatar';
import { ExportPanel } from '@/components/ExportPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { ProfileForm } from '@/components/ProfileForm';
import { useApp } from '@/store/appStore';
import { usePlanStatuses } from '@/hooks/usePlanStatus';
import { planStatusLabel, planStatusBadge } from '@/domain/planStatus';
import { plural } from '@/domain/plural';
import { encodeSelections } from '@/domain/share/payloads';
import { timestampSlug } from '@/domain/share/files';
import type { User } from '@/domain/types';

export function FriendsScreen() {
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const updateSettings = useApp((s) => s.updateSettings);
  const putUser = useApp((s) => s.putUser);
  const deleteUser = useApp((s) => s.deleteUser);
  const plans = usePlanStatuses();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  /** Profile sheet: a User to edit, 'new' to create, or null when closed. */
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

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

  /**
   * Why removal is ever blocked, stated rather than implied by a dead button:
   * App.tsx sends you back to setup when activeUserId stops resolving, so
   * deleting yourself — or the last profile — would eject you from the app.
   */
  const blockedReason = (u: User): string | null => {
    if (u.id === activeUserId) return 'This is you. Switch this phone to another profile first.';
    if (users.length <= 1) return 'You need at least one profile on this phone.';
    return null;
  };

  return (
    <Screen>
      {/*
        "How do I join a group?" is the first thing anyone asks, and the honest
        answer is that there is no group to join — there is no server to host
        one. A roster is per-phone and built by hand or by import. Saying that
        plainly here is cheaper than every user discovering it by hunting for a
        Join button that cannot exist.
      */}
      <Card className="mb-4 border-warp-blue-500/30 bg-accent-soft p-4">
        <h2 className="mb-2 font-display text-[15px] uppercase tracking-wide text-secondary">
          How groups work here
        </h2>
        <ol className="space-y-2 text-[13px] leading-relaxed text-secondary">
          <li className="flex gap-2.5">
            <Step n={1} />
            <span>
              There&apos;s no group to join and no account. This phone only knows the people you add
              below, or the people whose codes you import.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Step n={2} />
            <span>
              Add everyone you&apos;re going with. Then swap codes — <b>both directions</b>. They
              send you their picks, you send them yours. Importing someone&apos;s code adds them and
              their plan to your phone automatically.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Step n={3} />
            <span>
              Nothing you do here reaches anyone else until you hand them a code. There is no
              background sync, so a plan you change is stale on their phone until you resend.
            </span>
          </li>
        </ol>
      </Card>

      {/* Who am I */}
      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[15px] uppercase tracking-wide text-secondary">
          This device is
        </h2>
        <p className="mb-3 text-[13px] text-secondary">
          Each person picks bands on their own phone, then shares. Choose whose phone this is.
        </p>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(84px,1fr))]">
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
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-pink">
                  <UserCheck size={11} aria-hidden /> You
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex min-h-touch flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-subtle p-2 text-muted"
          >
            <UserPlus size={22} aria-hidden />
            <span className="text-[12px] font-semibold">Add person</span>
          </button>
        </div>
      </Card>

      {/* Share my selections */}
      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[15px] uppercase tracking-wide text-secondary">
          Share my bands
        </h2>
        <p className="mb-3 text-[13px] text-secondary">
          You have <b>{plural(myCount, 'band')}</b> selected. Send them to {othersLabel} by QR or
          code.
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
        {users.length <= 1 && (
          <p className="mb-3 text-[13px] leading-relaxed text-secondary">
            Just you so far. Add a friend above, or import their code — importing someone&apos;s plan
            adds them here automatically.
          </p>
        )}
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
                      <span className="rounded-full bg-warp-pink/15 px-1.5 text-[10px] font-bold text-pink">
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
                <button
                  type="button"
                  onClick={() => setEditing(u)}
                  aria-label={`Edit ${u.name}`}
                  className="min-h-touch min-w-touch flex items-center justify-center rounded-lg text-secondary active:bg-[var(--press)]"
                >
                  <Pencil size={17} aria-hidden />
                </button>
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
      <Sheet open={exporting} onClose={() => setExporting(false)} title={`${activeUser?.name ?? 'Your'} bands`}>
        <ExportPanel
          code={exportCode}
          filename={`warpedlb-${activeUser?.id ?? 'me'}-selections-${timestampSlug()}.json`}
          hint="Your friend opens Import a friend and scans this."
        />
      </Sheet>

      {/* Import sheet */}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Import a friend's bands" size="tall">
        <ImportPanel accept={['selections']} onDone={() => setImporting(false)} />
      </Sheet>

      {/* Add / edit profile sheet */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a person' : 'Edit profile'}
        size="tall"
      >
        {editing && (
          <>
            <ProfileForm
              user={editing === 'new' ? undefined : editing}
              takenIds={users.map((u) => u.id)}
              takenColors={users.map((u) => u.colorKey)}
              onSave={async (u) => {
                await putUser(u);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />

            {editing !== 'new' && (
              <div className="mt-6 border-t border-subtle pt-4">
                {blockedReason(editing) ? (
                  <p className="text-[13px] leading-relaxed text-muted">
                    {blockedReason(editing)}
                  </p>
                ) : (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => {
                      const target = editing;
                      setEditing(null);
                      setRemoving(target);
                    }}
                  >
                    <Trash2 size={16} aria-hidden /> Remove from this phone
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name ?? ''}?`}
        message={`Removes ${removing?.name ?? 'them'}, their imported picks, and their check-ins from this phone. It does not affect their own phone. You can re-import their code any time.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          const id = removing?.id;
          setRemoving(null);
          if (id) void deleteUser(id);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
      {n}
    </span>
  );
}
