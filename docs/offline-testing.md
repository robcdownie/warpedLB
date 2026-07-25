# Offline testing

The app is built to survive a dead phone signal. Here's how to prove it, and what the in-app test checks.

## In-app Offline Test

Menu (≡) → **Offline Test**. It runs these checks and only shows **“Ready for offline use”** when every essential one passes:

| Check | What it means |
|---|---|
| Service worker active | The offline engine is installed and running |
| App shell cached | The HTML/JS/CSS are stored on the phone |
| Festival map cached | The map image is available with no signal |
| Artist database ready | All 151 main sets + Unplugged appearances are in local storage |
| Stage database ready | All 9 stages + map locations present |
| Local data saves | IndexedDB read/write works |
| Can reopen offline | The start page is cached |
| Persistent storage *(optional)* | The OS agreed not to evict data (often denied on iOS — keep a backup as insurance) |

## On-device airplane-mode acceptance

1. Open the app online once and confirm “Ready for offline use.”
2. Turn on **Airplane Mode**.
3. **Force-close** the app.
4. **Reopen** from the Home Screen.
5. Pull-to-refresh / reload.
6. Navigate all five tabs (Now, Bands, Schedule, Group, Map).
7. Open and pinch-zoom the map.
8. Select an artist; edit a set time in Schedule.
9. Close and reopen again.
10. Confirm all your data is still there.

## Automated verification (developers)

From a checkout:

```bash
npm run verify   # builds, then runs a real headless-Chromium acceptance pass
```

It checks seed integrity, schedule persistence, conflict detection, schedule + friend export/import (including no-duplicate re-import), **offline reload with the service worker controlling**, all-tabs-offline, check-in persistence, demo/production separation, and invalid-code error handling. All checks must pass.

Unit tests for the pure engines:

```bash
npm test         # vitest: conflicts, end-times, travel, positions, meetups, matching, codec, chunker, seed
```
