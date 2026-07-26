import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
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
  // Cycling beats hand-cranking: the sender can't see the receiver's progress
  // counter, so every frame needed a spoken handshake. The collector keys parts
  // by index, so re-scanning a part is free and order doesn't matter — one
  // person holds the phone still, the other just points until they're done.
  const [playing, setPlaying] = useState(true);

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

  useEffect(() => {
    if (!playing || chunks.length < 2 || !dataUrls.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % chunks.length), 900);
    return () => clearInterval(t);
  }, [playing, chunks.length, dataUrls.length]);

  // Hold the screen on while a code is up: iOS dims at 30s, which is exactly
  // when the other phone is still fighting the glare.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    void wakeLock?.request('screen').then(
      (l) => {
        if (released) void l.release();
        else lock = l;
      },
      () => undefined,
    );
    return () => {
      released = true;
      void lock?.release().catch(() => undefined);
    };
  }, []);

  if (error) {
    return <p className="text-center text-[13px] text-warp-danger">Could not render QR: {error}</p>;
  }

  const multi = chunks.length > 1;

  return (
    <div className={cx('flex flex-col items-center gap-2', className)}>
      {/* Bigger than it was: the old 240px box put a dense code at ~2.7 screen
          pixels per module, right at the scanner's floor before sunlight. */}
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        {dataUrls[idx] ? (
          <img
            src={dataUrls[idx]}
            alt={`Share QR code${multi ? ` part ${idx + 1} of ${chunks.length}` : ''}`}
            width={320}
            height={320}
            className="h-[min(80vw,320px)] w-[min(80vw,320px)]"
          />
        ) : (
          <div className="flex h-[min(80vw,320px)] w-[min(80vw,320px)] items-center justify-center text-muted">
            Generating…
          </div>
        )}
      </div>
      {multi && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setIdx((i) => (i - 1 + chunks.length) % chunks.length);
            }}
            aria-label="Previous part"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)]"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause cycling' : 'Cycle through parts'}
            className="flex min-h-touch items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 text-[13px] font-semibold text-secondary"
          >
            {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            Part {idx + 1} / {chunks.length}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setIdx((i) => (i + 1) % chunks.length);
            }}
            aria-label="Next part"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)]"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}
      {multi && (
        <p className="max-w-[40ch] text-center text-[12px] text-muted">
          {playing
            ? `Cycling through ${chunks.length} codes — just hold the phone still and let them point at it until their counter fills up.`
            : `This export needs ${chunks.length} codes. Order doesn't matter, and re-scanning one is harmless.`}
        </p>
      )}
    </div>
  );
}
