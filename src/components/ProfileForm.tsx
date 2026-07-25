import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { COLOR_CHOICES, COLOR_VALUES } from '@/data/users';
import { newUserId, initialsFor, nextFreeColor } from '@/domain/ids';
import type { ColorKey, User } from '@/domain/types';

/**
 * Create or edit one profile. Used in three places — first-run setup, "add
 * person" on Friends, and editing an existing person — so the id rules live
 * here rather than being re-derived at each call site.
 *
 * Asks for a display name, initials and a colour. Never an email, phone
 * number, password or legal name: there is no account to attach them to.
 */
export function ProfileForm({
  user,
  takenIds,
  takenColors = [],
  onSave,
  onCancel,
  submitLabel,
  autoFocus = true,
}: {
  /** Omit to create a new profile. */
  user?: User;
  /** Existing ids, so a generated one can't collide on this device. */
  takenIds: string[];
  /** Colours already in use, so a new person gets a distinguishable default. */
  takenColors?: ColorKey[];
  onSave: (u: User) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const nameId = useId();
  const initialsId = useId();

  const [name, setName] = useState(user?.name ?? '');
  const [initials, setInitials] = useState(user?.initials ?? '');
  const [colorKey, setColorKey] = useState<ColorKey>(
    user?.colorKey ?? nextFreeColor(takenColors, COLOR_CHOICES),
  );
  /**
   * Once someone types their own initials we must stop overwriting them.
   * Editing an existing profile counts as already-chosen from the start.
   */
  const [initialsTouched, setInitialsTouched] = useState(!!user);
  const [saving, setSaving] = useState(false);

  const effectiveInitials = (initialsTouched ? initials : initialsFor(name)) || '?';
  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        // Editing keeps the original id. Regenerating it on rename would orphan
        // every selection and check-in, which are keyed by user id.
        id: user?.id ?? newUserId(trimmed, takenIds),
        name: trimmed,
        initials: effectiveInitials.slice(0, 2),
        colorKey,
        avatar: user?.avatar ?? null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <FriendAvatar
          user={{ name: trimmed || '?', initials: effectiveInitials, avatar: user?.avatar ?? null, colorKey }}
          size={56}
          ring
        />
        <p className="text-[13px] leading-snug text-secondary">
          This is how you&apos;ll appear on this phone, and on any phone you share a code with.
        </p>
      </div>

      <label htmlFor={nameId} className="mb-1 block text-[13px] font-semibold text-primary">
        Display name
      </label>
      <input
        id={nameId}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={autoFocus}
        maxLength={24}
        autoComplete="off"
        enterKeyHint="done"
        placeholder="e.g. Sam"
        className="mb-4 w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 py-2.5 text-[16px] text-primary outline-none focus:border-warp-pink"
      />

      <label htmlFor={initialsId} className="mb-1 block text-[13px] font-semibold text-primary">
        Initials
      </label>
      <input
        id={initialsId}
        type="text"
        value={initialsTouched ? initials : initialsFor(name)}
        onChange={(e) => {
          setInitialsTouched(true);
          setInitials(e.target.value.slice(0, 2));
        }}
        maxLength={2}
        autoComplete="off"
        className="mb-1 w-20 rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 py-2.5 text-center text-[16px] uppercase text-primary outline-none focus:border-warp-pink"
      />
      <p className="mb-4 text-[12px] text-muted">Shown on map pins and avatars when there&apos;s no photo.</p>

      <span className="mb-1 block text-[13px] font-semibold text-primary">Colour</span>
      <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Profile colour">
        {COLOR_CHOICES.map((c) => {
          const selected = c === colorKey;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c}
              onClick={() => setColorKey(c)}
              style={{ background: COLOR_VALUES[c].bg }}
              className={cx(
                'flex h-11 w-11 items-center justify-center rounded-full transition',
                selected ? 'ring-2 ring-offset-2 ring-offset-[var(--surface-card)] ring-primary' : '',
              )}
            >
              {selected && (
                <Check size={20} strokeWidth={3} style={{ color: COLOR_VALUES[c].text }} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="yellow" className="flex-1 py-3 text-[16px]" disabled={!canSave}>
          {submitLabel ?? (user ? 'Save changes' : 'Create profile')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
