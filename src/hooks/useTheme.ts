import { useEffect } from 'react';
import { useApp } from '@/store/appStore';

/**
 * Applies the user's theme choice to the document root.
 *
 * Daylight mode is light + boosted contrast in one switch. Outdoors, dark mode
 * is measurably worse — less emitted light to overcome reflection, and the
 * phone's sun-boost helps a white background far more than a navy one — and
 * the theme defaults to whatever the phone says, so anyone on auto-dark spent
 * the afternoon on the harder-to-read option with nothing telling them.
 */
export function useThemeEffect() {
  const theme = useApp((s) => s.settings.theme);
  const daylight = useApp((s) => s.settings.daylightMode);
  useEffect(() => {
    const root = document.documentElement;
    if (daylight) root.setAttribute('data-theme', 'light');
    else if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    if (daylight) root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');
  }, [theme, daylight]);
}

/** Keeps store.online in sync with the browser. */
export function useOnlineEffect() {
  const setOnline = useApp((s) => s.setOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);
}
