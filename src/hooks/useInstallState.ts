import { useEffect, useState } from 'react';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallState {
  /** True when running from the Home Screen / app launcher rather than a tab. */
  installed: boolean;
  platform: InstallPlatform;
}

/**
 * Whether the app is running installed, and which install instructions apply.
 *
 * Worth detecting rather than always showing a nudge: telling someone who is
 * already looking at an installed app to go and install it makes the app look
 * like it doesn't know what's happening, and trains people to skip its advice.
 */
export function useInstallState(): InstallState {
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    // iOS switches display-mode when launched from the Home Screen rather than
    // firing an event, so watch the media query instead of listening for one.
    const mq = window.matchMedia('(display-mode: standalone)');
    const sync = () => setInstalled(isStandalone());
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return { installed, platform: detectPlatform() };
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `minimal-ui` and `fullscreen` are also launched-from-home-screen states, so
  // matching only `standalone` would nag people who did install the app.
  const byDisplayMode = ['standalone', 'minimal-ui', 'fullscreen'].some(
    (m) => window.matchMedia(`(display-mode: ${m})`).matches,
  );
  // Pre-iOS-16 Safari never implemented the display-mode query for home-screen
  // apps and exposes this non-standard flag instead.
  const iosLegacy = (navigator as { standalone?: boolean }).standalone === true;
  return byDisplayMode || iosLegacy;
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports a Mac user agent; touch points are what separate it from
  // an actual desktop Safari, where the Share-sheet instructions would be wrong.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
