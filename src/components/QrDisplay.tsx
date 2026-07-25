import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toChunks } from '@/domain/share/chunker';
import { cx } from './ui';

/**
 * Renders a share code as one or more QR codes. When the code is too large for a
 * single QR, it's split into multiple parts (spec §20) the receiver scans in turn.
 * The QR contains the DATA, never a URL.
 */
export function QrDisplay({ code, className }: { code: string; className?: string }) {
  const chunks = useMemo(() => toChunks(code), [code]);
  const [idx, setIdx] = useState(0);
  const [dataUrls, setDataUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all(
      chunks.map((c) =>
        QRCode.toDataURL(c, { errorCorrectionLevel: 'M', margin: 2, width: 512 }),
      ),
    )
      .then((urls) => {
        if (!cancelled) setDataUrls(urls);
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [chunks]);

  useEffect(() => {
    if (idx >= chunks.length) setIdx(0);
  }, [chunks.length, idx]);

  if (error) {
    return <p className="text-center text-[13px] text-warp-danger">Could not render QR: {error}</p>;
  }

  const multi = chunks.length > 1;

  return (
    <div className={cx('flex flex-col items-center gap-2', className)}>
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        {dataUrls[idx] ? (
          <img
            src={dataUrls[idx]}
            alt={`Share QR code${multi ? ` part ${idx + 1} of ${chunks.length}` : ''}`}
            width={240}
            height={240}
            className="h-60 w-60"
          />
        ) : (
          <div className="flex h-60 w-60 items-center justify-center text-muted">Generating…</div>
        )}
      </div>
      {multi && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + chunks.length) % chunks.length)}
            aria-label="Previous part"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)]"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="text-[13px] font-semibold text-secondary">
            Part {idx + 1} / {chunks.length}
          </span>
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % chunks.length)}
            aria-label="Next part"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)]"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}
      {multi && (
        <p className="max-w-[40ch] text-center text-[12px] text-muted">
          This export needs {chunks.length} codes. Have your friend scan each part — order doesn&apos;t matter.
        </p>
      )}
    </div>
  );
}
