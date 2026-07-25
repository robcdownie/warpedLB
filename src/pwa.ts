import { registerSW } from 'virtual:pwa-register';

// Manual SW registration so we can surface an update prompt instead of
// silently swapping assets mid-festival. `registerType: 'prompt'` in the
// vite config pairs with this.

export type UpdateState = {
  needRefresh: boolean;
  offlineReady: boolean;
  update: () => void;
};

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

const listeners = new Set<(s: UpdateState) => void>();
let state: UpdateState = {
  needRefresh: false,
  offlineReady: false,
  update: () => updateSW?.(true),
};

function emit() {
  for (const l of listeners) l(state);
}

export function onPwaState(cb: (s: UpdateState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function initPwa() {
  if (import.meta.env.DEV) return; // SW disabled in dev
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      state = { ...state, needRefresh: true };
      emit();
    },
    onOfflineReady() {
      state = { ...state, offlineReady: true };
      emit();
    },
    onRegisteredSW(_swUrl, registration) {
      // Periodically check for updates when online (no-op offline).
      if (registration) {
        setInterval(
          () => {
            if (navigator.onLine) registration.update().catch(() => {});
          },
          60 * 60 * 1000,
        );
      }
    },
  });
}
