import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';
import { ChunkCollector } from '@/domain/share/chunker';
import { cx } from './ui';

/**
 * Camera QR scanner using getUserMedia + jsQR. Collects multi-part codes until
 * complete, then calls onComplete with the joined code string. All offline —
 * no network. If the camera is unavailable, the parent should offer paste/file.
 */
export function QrScanner({
  onComplete,
  className,
}: {
  onComplete: (code: string) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const collectorRef = useRef(new ChunkCollector());
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [mixed, setMixed] = useState<string | null>(null);
  const lastSeen = useRef<string>('');

  /** Throw away a half-collected scan — needed after a mid-scan re-export. */
  const startOver = () => {
    collectorRef.current.reset();
    lastSeen.current = '';
    setProgress(null);
    setMixed(null);
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      setStatus('starting');
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Unconstrained, iOS hands back 640x480, which puts a dense
          // multi-part code right at jsQR's resolution floor before glare is
          // even in the picture.
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus('scanning');
        tick();
      } catch (e) {
        setStatus('error');
        setError(
          (e as Error).name === 'NotAllowedError'
            ? 'Camera permission denied. Use Paste or File instead.'
            : 'No camera available. Use Paste or File instead.',
        );
      }
    }

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (found && found.data && found.data !== lastSeen.current) {
          lastSeen.current = found.data;
          handleText(found.data);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function handleText(text: string) {
      const res = collectorRef.current.add(text);
      setProgress({ received: collectorRef.current.received, total: collectorRef.current.total });
      if (res.error) {
        // Swallowing this left the counter frozen at "1 / 4" forever with no
        // explanation — the sender re-exporting mid-scan is enough to cause it,
        // and the only escape was to leave the screen and come back.
        setMixed(res.error);
        return;
      }
      setMixed(null);
      if (res.complete && res.code) {
        stopped = true;
        cleanup();
        onComplete(res.code);
      }
    }

    function cleanup() {
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    }

    start();
    return () => {
      stopped = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cx('flex flex-col items-center gap-2', className)}>
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ width: 260, height: 260 }}>
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
        <canvas ref={canvasRef} className="hidden" />
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            {status === 'error' ? <CameraOff size={28} aria-hidden /> : <Camera size={28} aria-hidden />}
            <span className="px-4 text-center text-[13px]">
              {status === 'starting' ? 'Starting camera…' : error ?? 'Camera'}
            </span>
          </div>
        )}
        {/* framing guide */}
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-warp-yellow/80" aria-hidden />
        )}
      </div>
      {progress && progress.total > 1 && (
        <p className="text-[13px] font-semibold text-secondary">
          Scanned {progress.received} / {progress.total} parts
        </p>
      )}
      {mixed && (
        <div className="flex flex-col items-center gap-1.5 rounded-lg bg-warp-yellow/20 px-3 py-2">
          <p className="text-center text-[12px] font-semibold text-warn">{mixed}</p>
          <button
            type="button"
            onClick={startOver}
            className="min-h-touch text-[13px] font-bold text-accent"
          >
            Start over
          </button>
        </div>
      )}
      {!mixed && progress && progress.total > 1 && progress.received < progress.total && (
        <button
          type="button"
          onClick={startOver}
          className="min-h-touch text-[12px] font-semibold text-muted"
        >
          Start over
        </button>
      )}
      {status === 'scanning' && (!progress || progress.total <= 1) && (
        <p className="text-[13px] text-muted">Point at the QR code…</p>
      )}
    </div>
  );
}

/** Decode a QR from an uploaded image file (offline). */
export async function decodeQrImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(data.data, canvas.width, canvas.height);
    return found?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
