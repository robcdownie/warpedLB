import { useState } from 'react';
import { Copy, Download, QrCode, Check } from 'lucide-react';
import { Button, cx } from './ui';
import { QrDisplay } from './QrDisplay';
import { downloadText, copyToClipboard } from '@/domain/share/files';

/** Offers a share code as QR, copyable text, or a downloadable file. */
export function ExportPanel({
  code,
  filename,
  hint,
}: {
  code: string;
  filename: string;
  hint?: string;
}) {
  const [tab, setTab] = useState<'qr' | 'code'>('qr');
  const [copied, setCopied] = useState(false);

  const doCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div>
      <div className="mb-3 flex rounded-xl bg-[var(--surface-sunken)] p-0.5">
        <TabBtn active={tab === 'qr'} onClick={() => setTab('qr')}>
          <QrCode size={15} aria-hidden /> QR Code
        </TabBtn>
        <TabBtn active={tab === 'code'} onClick={() => setTab('code')}>
          <Copy size={15} aria-hidden /> Text Code
        </TabBtn>
      </div>

      {tab === 'qr' ? (
        <QrDisplay code={code} className="mb-3" />
      ) : (
        <textarea
          readOnly
          value={code}
          onFocus={(e) => e.target.select()}
          rows={5}
          className="mb-3 w-full resize-none break-all rounded-xl border border-subtle bg-[var(--surface-sunken)] p-3 font-mono text-[12px] text-primary outline-none"
        />
      )}

      {hint && <p className="mb-3 text-center text-[12px] text-muted">{hint}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={doCopy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <Button variant="secondary" onClick={() => downloadText(filename, code)}>
          <Download size={16} aria-hidden />
          Save file
        </Button>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'min-h-touch flex flex-1 items-center justify-center gap-1 rounded-lg text-[14px] font-semibold transition',
        active ? 'bg-warp-blue-500 text-white shadow-sm' : 'text-secondary',
      )}
    >
      {children}
    </button>
  );
}
