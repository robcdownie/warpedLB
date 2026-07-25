import { useRef, type ReactNode, forwardRef, useImperativeHandle } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { Plus, Minus, Maximize2, Crosshair } from 'lucide-react';
import { MAP_IMAGE_URL } from '@/config/event';
import { cx } from '@/components/ui';

export interface MapCanvasHandle {
  centerOn: (xPercent: number, yPercent: number, scale?: number) => void;
  reset: () => void;
}

/**
 * Zoom/pan festival map. Markers live inside the transform (so they stay glued
 * to the image) but counter-scale via the --inv CSS variable so they keep a
 * constant on-screen size at any zoom. Positions are percentages of the image,
 * so they stay aligned on every iPhone size (spec §14).
 */
export const MapCanvas = forwardRef<
  MapCanvasHandle,
  {
    children: ReactNode; // marker layer
    onBackgroundTap?: (xPercent: number, yPercent: number) => void;
    className?: string;
  }
>(function MapCanvas({ children, onBackgroundTap, className }, ref) {
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const imgWrapRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    centerOn(xPercent, yPercent, scale = 2.2) {
      const api = apiRef.current;
      const wrap = imgWrapRef.current;
      if (!api || !wrap) return;
      // Center the given image-percentage point in the viewport at `scale`.
      const rect = wrap.getBoundingClientRect();
      const px = (xPercent / 100) * rect.width;
      const py = (yPercent / 100) * rect.height;
      api.setTransform(
        -(px * scale) + rect.width / 2,
        -(py * scale) + rect.height / 2,
        scale,
        250,
      );
    },
    reset() {
      apiRef.current?.resetTransform(250);
    },
  }));

  const handleTap = (e: React.MouseEvent) => {
    if (!onBackgroundTap || !imgWrapRef.current) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) onBackgroundTap(x, y);
  };

  return (
    <div className={cx('relative overflow-hidden rounded-2xl bg-warp-blue-900', className)}>
      <TransformWrapper
        ref={apiRef}
        minScale={1}
        maxScale={6}
        initialScale={1}
        centerOnInit
        doubleClick={{ mode: 'zoomIn', step: 0.7 }}
        wheel={{ step: 0.15 }}
        onTransformed={(_r, state) => {
          layerRef.current?.style.setProperty('--inv', String(1 / state.scale));
        }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%' }}
        >
          <div ref={imgWrapRef} className="relative w-full" onClick={handleTap}>
            <img
              src={MAP_IMAGE_URL}
              alt="Vans Warped Long Beach festival map"
              className="block w-full select-none"
              draggable={false}
            />
            <div
              ref={layerRef}
              className="pointer-events-none absolute inset-0"
              style={{ ['--inv' as string]: 1 }}
            >
              {children}
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Controls — top-right, clear of the legend baked into the artwork's
          bottom-right corner (water/first-aid entries must stay readable).
          z-30 keeps them tappable above MapScreen's floating banners (z-10/z-20),
          which reserve this column via a right gutter. */}
      <div className="absolute right-3 top-3 z-30 flex flex-col gap-1.5">
        <MapBtn label="Zoom in" onClick={() => apiRef.current?.zoomIn(0.4)}>
          <Plus size={18} aria-hidden />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => apiRef.current?.zoomOut(0.4)}>
          <Minus size={18} aria-hidden />
        </MapBtn>
        <MapBtn label="Reset view" onClick={() => apiRef.current?.resetTransform(250)}>
          <Maximize2 size={18} aria-hidden />
        </MapBtn>
      </div>
    </div>
  );
});

function MapBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-warp-ink shadow-md active:bg-white"
    >
      {children}
    </button>
  );
}

/** A single counter-scaling marker anchored at (x%, y%) by its bottom tip. */
export function MapMarker({
  xPercent,
  yPercent,
  onClick,
  ariaLabel,
  children,
  anchor = 'bottom',
  z = 1,
}: {
  xPercent: number;
  yPercent: number;
  onClick?: () => void;
  ariaLabel?: string;
  children: ReactNode;
  anchor?: 'bottom' | 'center';
  z?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${xPercent}%`, top: `${yPercent}%`, zIndex: z }}
    >
      <div
        className="pointer-events-auto rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warp-yellow"
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ariaLabel}
        style={{
          transform:
            anchor === 'bottom'
              ? 'translate(-50%, -100%) scale(var(--inv, 1))'
              : 'translate(-50%, -50%) scale(var(--inv, 1))',
          transformOrigin: anchor === 'bottom' ? 'bottom center' : 'center',
        }}
        onClick={
          onClick
            ? (e) => {
                // Don't let a pin tap bubble to the map's background-tap handler
                // (it would check the user in at raw coordinates / move a
                // calibration pin instead of selecting this one).
                e.stopPropagation();
                onClick();
              }
            : undefined
        }
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { Crosshair };
