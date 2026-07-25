import { useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui';
import { useModalA11y } from '@/hooks/useModalA11y';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const msgId = useId();
  useModalA11y(open, panelRef, onCancel);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={msgId}
    >
      <button type="button" aria-label="Cancel" className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-[360px] rounded-2xl p-5 shadow-2xl outline-none"
        style={{ background: 'var(--surface-card)' }}
      >
        {danger && <AlertTriangle size={28} className="mb-2 text-danger" aria-hidden />}
        <h2 id={titleId} className="font-display text-[17px] text-primary">{title}</h2>
        <p id={msgId} className="mt-1 text-[14px] text-secondary">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
