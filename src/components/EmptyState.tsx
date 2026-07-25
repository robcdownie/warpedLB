import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Friendly empty/placeholder state — never a blank screen (spec §32). */
export function EmptyState({
  Icon,
  image,
  title,
  message,
  action,
}: {
  Icon: LucideIcon;
  /** Optional spot illustration (see ART in config/event.ts); replaces the icon. */
  image?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-subtle px-6 py-8 text-center">
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden
          className="h-32 w-32 rounded-2xl object-cover shadow-md"
          loading="lazy"
        />
      ) : (
        <Icon size={36} className="text-accent" aria-hidden />
      )}
      <h3 className="font-display text-[16px] text-primary">{title}</h3>
      {message && <p className="max-w-[36ch] text-[14px] text-secondary">{message}</p>}
      {action}
    </div>
  );
}
