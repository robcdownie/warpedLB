import { cx } from './ui';
import { APP_NAME } from '@/config/event';

/**
 * Text-based Warped Long Beach wordmark rendered from local fonts + SVG shapes.
 * No remote logo images (offline-safe, and avoids copying official artwork).
 */
export function WarpedWordmark({ className }: { className?: string }) {
  return (
    <div
      className={cx('relative flex select-none items-center', className)}
      aria-label={APP_NAME}
      role="img"
    >
      <div
        className="flex flex-col items-center leading-none"
        style={{ transform: 'rotate(-2deg)' }}
      >
        <span
          className="font-display text-white"
          style={{
            fontSize: '19px',
            letterSpacing: '0.01em',
            // Layered punk offset: pink pass under an ink pass.
            textShadow: '1.5px 1.5px 0 #ff2d78, 3px 3px 0 #0a0f1c',
          }}
        >
          WARPED
        </span>
        <span
          className="font-display"
          style={{
            fontSize: '9px',
            letterSpacing: '0.16em',
            background: '#ffd21e',
            color: '#0a0f1c',
            padding: '1.5px 5px 1px',
            marginTop: '2px',
            transform: 'rotate(-1deg)',
            boxShadow: '1.5px 1.5px 0 #0a0f1c',
          }}
        >
          LONG BEACH
        </span>
      </div>
      <span
        aria-hidden
        className="ml-2 inline-block"
        style={{
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderLeft: '12px solid #ff2d78',
          filter: 'drop-shadow(1.5px 1.5px 0 #0a0f1c)',
        }}
      />
    </div>
  );
}
