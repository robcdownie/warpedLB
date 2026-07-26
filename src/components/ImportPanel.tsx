import { useRef, useState } from 'react';
import { Camera, ClipboardPaste, FileUp, Check, AlertTriangle, Undo2, CheckCircle2 } from 'lucide-react';
import { Button, Card, cx } from './ui';
import { QrScanner, decodeQrImage } from './QrScanner';
import { collectPastedCode } from '@/domain/share/chunker';
import { decodeEnvelope, DecodeError, type Envelope, type PayloadType } from '@/domain/share/codec';
import { previewImport, type ImportPreview } from '@/domain/share/payloads';
import { validateEnvelope, validateRawCode, type ValidationIssue } from '@/domain/share/validate';
import { readTextFile } from '@/domain/share/files';
import { useApp } from '@/store/appStore';

type Method = 'scan' | 'paste' | 'file';

/**
 * Unified import flow: acquire a code (scan / paste / file), decode it, show a
 * non-destructive merge preview, then commit — with a rollback option (spec §20).
 */
export function ImportPanel({
  accept,
  onDone,
}: {
  /** Restrict which payload types are accepted (e.g. ['selections']). */
  accept?: PayloadType[];
  onDone?: () => void;
}) {
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const performances = useApp((s) => s.performances);
  const locations = useApp((s) => s.locations);
  const applyImport = useApp((s) => s.applyImport);
  const rollback = useApp((s) => s.rollbackImport);

  const [method, setMethod] = useState<Method>('paste');
  const [pasteText, setPasteText] = useState('');
  const [env, setEnv] = useState<Envelope | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Blocking validation problems, shown instead of a preview. */
  const [blocked, setBlocked] = useState<ValidationIssue[]>([]);
  const [extraWarnings, setExtraWarnings] = useState<ValidationIssue[]>([]);
  const [committed, setCommitted] = useState<{ backupId: number; summary: string } | null>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCode = (code: string) => {
    setError(null);
    setBlocked([]);
    setExtraWarnings([]);
    const sizeIssue = validateRawCode(code);
    if (sizeIssue) {
      setError(sizeIssue.message);
      return;
    }
    try {
      const decoded = decodeEnvelope(code);
      if (accept && !accept.includes(decoded.type)) {
        setError(`This is a "${decoded.type}" code, but this screen imports ${accept.join(' / ')}.`);
        return;
      }
      // Checksum only proves the bytes survived; the FIELDS still have to make
      // sense before anything reaches IndexedDB (plan §P0-8).
      const result = validateEnvelope(decoded, {
        knownPerformanceIds: new Set(performances.map((p) => p.id)),
        knownStageIds: new Set(locations.filter((l) => l.category === 'stage').map((l) => l.id)),
        knownLocationIds: new Set(locations.map((l) => l.id)),
      });
      if (!result.ok) {
        setBlocked(result.errors);
        return;
      }
      setExtraWarnings(result.warnings);
      setEnv(decoded);
      setPreview(previewImport(decoded, { users, selections, performances, locations }));
    } catch (e) {
      if (e instanceof DecodeError) setError(e.message);
      else setError('Could not read that code.');
    }
  };

  const handlePaste = () => {
    // Supports multi-part paste (one chunk per line) and single codes that were
    // hard-wrapped in transit — see collectPastedCode.
    const { code, error: collectError } = collectPastedCode(pasteText);
    if (code) handleCode(code);
    else if (collectError) setError(collectError);
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      if (file.type.startsWith('image/')) {
        const code = await decodeQrImage(file);
        if (code) handleCode(code);
        else setError('No QR code found in that image.');
      } else {
        const text = await readTextFile(file);
        // Could be a raw code or a JSON we exported.
        const trimmed = text.trim();
        handleCode(trimmed);
      }
    } catch {
      setError('Could not read that file.');
    }
  };

  const doCommit = async () => {
    if (!env) return;
    const res = await applyImport(env);
    setCommitted(res);
  };

  const doRollback = async () => {
    if (!committed) return;
    const ok = await rollback(committed.backupId);
    setRolledBack(ok);
  };

  // ----- committed state -----
  if (committed) {
    return (
      <Card className="p-4 text-center">
        {rolledBack ? (
          <>
            <Undo2 size={32} className="mx-auto mb-2 text-accent" aria-hidden />
            <p className="font-display text-[16px] text-primary">Import undone</p>
            <p className="mt-1 text-[13px] text-secondary">Your data was restored to before the import.</p>
          </>
        ) : (
          <>
            <CheckCircle2 size={32} className="mx-auto mb-2 text-warp-ok" aria-hidden />
            <p className="font-display text-[16px] text-primary">Imported</p>
            <p className="mt-1 text-[13px] text-secondary">{committed.summary}</p>
          </>
        )}
        <div className="mt-4 flex justify-center gap-2">
          {!rolledBack && (
            <Button variant="secondary" onClick={doRollback}>
              <Undo2 size={16} aria-hidden /> Undo import
            </Button>
          )}
          <Button variant="primary" onClick={() => onDone?.()}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  // ----- blocked state: the code decoded but its contents are unusable -----
  if (blocked.length > 0) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={20} className="text-warp-danger" aria-hidden />
          <p className="font-display text-[16px] text-primary">This code can&apos;t be imported</p>
        </div>
        <ul className="mb-3 space-y-1.5">
          {blocked.map((issue) => (
            <li key={issue.code} className="text-[13px] leading-relaxed text-secondary">
              {issue.message}
            </li>
          ))}
        </ul>
        <p className="mb-3 text-[12px] text-muted">
          Nothing on this phone was changed.
        </p>
        <Button variant="secondary" className="w-full" onClick={() => setBlocked([])}>
          Try another code
        </Button>
      </Card>
    );
  }

  // ----- preview state -----
  if (env && preview) {
    return (
      <Card className="p-4">
        <p className="mb-1 font-display text-[16px] text-primary">Review import</p>
        <p className="mb-3 text-[13px] text-secondary">
          From <b>{preview.source}</b> · exported {new Date(preview.exportedAt).toLocaleString()}
        </p>
        <div className={cx('mb-3 grid gap-2 text-center', preview.removals ? 'grid-cols-4' : 'grid-cols-3')}>
          <Stat n={preview.adds} label="New" color="var(--ok-text)" />
          <Stat n={preview.updates} label="Updated" color="var(--warn-text)" />
          {preview.removals > 0 && <Stat n={preview.removals} label="Removed" color="var(--danger-text)" />}
          <Stat n={preview.unchanged} label="Same" color="var(--text-muted)" />
        </div>
        <ul className="mb-3 space-y-1">
          {preview.lines.map((l, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[13px] text-secondary">
              <Check size={14} className="mt-0.5 shrink-0 text-warp-ok" aria-hidden /> {l}
            </li>
          ))}
        </ul>
        {[...preview.warnings, ...extraWarnings.map((w) => w.message)].map((w, i) => (
          <p key={i} className="mb-1.5 flex items-start gap-1.5 text-[12px] text-warp-warn">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {w}
          </p>
        ))}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => { setEnv(null); setPreview(null); setExtraWarnings([]); }}>
            Cancel
          </Button>
          <Button variant="yellow" className="flex-1" onClick={doCommit}>
            Import now
          </Button>
        </div>
      </Card>
    );
  }

  // ----- acquire state -----
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-sunken)] p-0.5">
        <MethodTab active={method === 'scan'} onClick={() => setMethod('scan')}>
          <Camera size={15} aria-hidden /> Scan
        </MethodTab>
        <MethodTab active={method === 'paste'} onClick={() => setMethod('paste')}>
          <ClipboardPaste size={15} aria-hidden /> Paste
        </MethodTab>
        <MethodTab active={method === 'file'} onClick={() => setMethod('file')}>
          <FileUp size={15} aria-hidden /> File
        </MethodTab>
      </div>

      {method === 'scan' && <QrScanner onComplete={handleCode} className="mb-3" />}

      {method === 'paste' && (
        <div className="mb-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder="Paste a Warped share code here (one part per line for multi-part codes)"
            className="w-full resize-none break-all rounded-xl border border-subtle bg-[var(--surface-sunken)] p-3 font-mono text-[12px] text-primary outline-none focus:border-warp-blue-400"
          />
          <Button variant="primary" className="mt-2 w-full" onClick={handlePaste} disabled={!pasteText.trim()}>
            Read code
          </Button>
        </div>
      )}

      {method === 'file' && (
        <div className="mb-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
            <FileUp size={16} aria-hidden /> Choose a .json or QR image
          </Button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-warp-danger/10 px-3 py-2 text-[13px] text-warp-danger">
          <AlertTriangle size={15} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] py-2">
      <div className="font-display text-[20px]" style={{ color }}>{n}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function MethodTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-touch flex items-center justify-center gap-1 rounded-lg text-[13px] font-semibold transition',
        active ? 'bg-warp-blue-500 text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}
