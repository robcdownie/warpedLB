# Warped LB Companion

An **unofficial, fan-made planning app** for Vans Warped Tour Long Beach 2026 (Sat Jul 25 – Sun Jul 26). It's an installable Progressive Web App that works **fully offline** once installed — built for the reality that festival cell service is terrible.

> **Unofficial fan-made app.** Not affiliated with, endorsed by, or connected to Vans, Vans Warped Tour, or the venue. Set times are entered by you or imported from a code — always check the official board.

**Live app: https://robcdownie.github.io/warpedLB/**

No account. No login. No server. Nothing you do in this app is uploaded anywhere.

---

## What it does

- Pick from all 151 main-lineup artists plus the Warped Unplugged appearances, tagged **Must See / Want to See / Maybe**.
- Flag **overlapping sets** and tight walking windows between stages.
- Compare plans with friends and find **windows where everyone is actually free**.
- Show where each person *plans* to be through the day, on the real festival map.
- Keep working with no signal — force-close, airplane mode, reopen, and your plan is still there.

## Where do set times come from?

Warped doesn't publish stage times in advance. They go up on a big board close to showtime. So the app ships with the **lineup but no times**, and there are two ways to fill them in:

1. **Paste a code someone already typed.** If somebody has entered the board and shared a code (check the thread you found this app in), paste it into **Menu → Schedule Import/Export**. Your whole weekend fills in at once. You'll see a preview of exactly what changes before anything is saved, and you can roll it back.
2. **Type them yourself.** **Schedule → Enter Times → Board** is laid out like the physical poster — one column per stage, times then bands — so it's quick to copy across.

Either way: **check the official board.** A code is only as accurate as the person who typed it, and the app tells you who that was.

Importing set times never touches your band picks. They're stored separately, on purpose.

## Sharing with friends

Everyone installs the app on their own phone and picks their own bands. To compare plans you trade codes — a QR code you scan, or a short text code you paste. Importing someone's plan also creates their profile on your phone automatically, so the group builds itself as you trade.

**Two offline phones cannot sync on their own.** That's a genuine limitation of offline devices, not something the app is hiding — which is why sharing is a deliberate scan-or-paste step rather than a fake "syncing…" spinner.

## Install on iPhone

1. Open the live URL in **Safari** (in-app browsers like Instagram's won't let you install).
2. Wait for the header to show **"Ready for offline use"**, or open **Menu → Offline Test** and confirm the essential checks are green.
3. Tap **Share** → **Add to Home Screen** → **Add**.
4. Open it once more from the Home Screen icon *while you still have signal*, so caching finishes.
5. Done — it now works in Airplane Mode.

On Android/Chrome, use the **Install app** prompt or the ⋮ menu → **Add to Home screen**.

> **Heads up on iOS:** Safari and the installed Home Screen app get *separate* storage. Pick your bands in the installed app, not in Safari, or your picks will look like they vanished.

## Prove it works offline

**Menu → Offline Test** checks: service worker active, app shell cached, festival map cached, artist database, stage database, local-data read/write, and reopen-offline. The "Ready for offline use" badge only appears when every essential check passes.

Then actually test it: **turn on Airplane Mode, force-close the app, reopen from the Home Screen, and walk every tab.** Do this the night before, not in the parking lot.

## What leaves your phone

Nothing, unless you choose to export a code. There is no analytics, no advertising, no tracker, no account system, no email collection, no remote profile storage, and no background location. Profile photos are stored locally on your device. The app makes no network requests after it has cached itself.

Positions on the map are **planned from schedules**, not live GPS. If someone checks in manually, that's stored on *their* phone — it can't reach yours without a code.

---

## Development

Vite · React · TypeScript · Tailwind CSS v4 · IndexedDB (`idb`) · Zustand · Service Worker (`vite-plugin-pwa` / Workbox). No backend, no remote fonts or images.

```bash
npm install
npm run dev            # http://localhost:5173/warpedLB/
```

Service workers only run in a real build, so offline behaviour must be tested against a build:

```bash
npm run build
npm run preview
```

Checks:

```bash
npm test               # unit tests on the pure domain logic
npm run verify         # real-browser end-to-end checks (Chromium + WebKit)
```

`npm run verify` gates the deploy — see `.github/workflows/deploy.yml`. Pushing to `main` builds and publishes to GitHub Pages automatically. One-time repo setup: **Settings → Pages → Source = GitHub Actions**.

Regenerate app icons and splash screens:

```bash
npm run assets
```

To replace the festival map image, see [`docs/replace-map.md`](docs/replace-map.md) — you supply your own source image; the cropped result is committed at `public/map/festival-map.webp`.

### Layout

```
scripts/         # asset pipeline (icons, splash) + e2e and screenshot harnesses
public/          # festival map (webp) + app icons (committed, used by the build)
docs/            # guides
src/
  config/        # event configuration
  data/          # seed data: artists, stages, locations, amenities
  db/            # IndexedDB schema, migrations, repository
  domain/        # pure logic: time, conflicts, meetups, positions, sharing
  store/         # Zustand app store + selectors
  screens/       # Now, Bands, Schedule, Group, Map + menu screens
  components/    # shared UI
```

There is **no seeded roster** — the app starts with zero profiles and you create your own on first run, or import one. Add people in **Menu → Friends & Sharing**.

Read [`docs/trust-states.md`](docs/trust-states.md) before adding a screen. The app enforces six rules in code, not just in copy: unknown ≠ free, partial ≠ complete, planned ≠ live, stale ≠ current, imported ≠ fresh, cached ≠ verified. Empty results are claims too — "no conflicts" on a day with 5 of 76 sets entered is over-confidence, not good news.

## Known limitations

- **Two offline phones cannot sync on their own.** Sharing needs a QR scan or a pasted code.
- **Set times are not official.** They're typed in by a human, from a board, and the app shows you who.
- Travel times are **approximate** walking estimates, not GPS routing.
- Map pin positions are eyeballed starter coordinates against the map artwork, not survey data.
- Live GPS location sharing is intentionally out of scope.
