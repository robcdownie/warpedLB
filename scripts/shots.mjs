// Device-faithful screenshot harness for the Warped Long Beach Companion.
// Adapted from the bazaar-brawler "Tavern Bash" harness: serves dist/ locally,
// drives Chromium via Playwright with iPhone settings (DPR 3, isMobile, hasTouch),
// walks the app's screens, and writes a contact sheet to shots/index.html.
//
// Usage:  npm run build && node scripts/shots.mjs
// The base path matches the vite `base` so the built asset URLs resolve.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const OUT = join(root, 'shots');
const BASE = '/warpedLB/';

/**
 * Fictional profiles for the contact sheet. The app ships with an empty roster,
 * so the harness creates its own — there is no seeded name to tap or reuse.
 */
const SHOT_USERS = [
  { id: 'alex', name: 'Alex', initials: 'A', avatar: null, colorKey: 'pink' },
  { id: 'sam', name: 'Sam', initials: 'S', avatar: null, colorKey: 'blue' },
  { id: 'jordan', name: 'Jordan', initials: 'J', avatar: null, colorKey: 'orange' },
];

const VIEWPORTS = [
  { name: 'iphone-390x844', width: 390, height: 844, colorScheme: 'light' },
  { name: 'iphone-390x844-dark', width: 390, height: 844, colorScheme: 'dark' },
  { name: 'iphone-se-375x667', width: 375, height: 667, colorScheme: 'light' },
  // Installed-PWA simulation: headless Chromium resolves env(safe-area-inset-*)
  // to 0, so standalone-only layout bugs (double insets, home-indicator
  // collisions) are invisible in the passes above. The app reads insets via
  // --safe-top/--safe-bottom (theme.css), which this pass injects to match an
  // iPhone 16 Pro Max home-screen launch.
  {
    name: 'iphone-16pm-standalone-440x956',
    width: 440, height: 956, colorScheme: 'light',
    safeArea: { top: 59, bottom: 34 },
  },
];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveDist() {
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      if (p.startsWith(BASE)) p = '/' + p.slice(BASE.length);
      if (p.endsWith('/')) p += 'index.html';
      let file = join(DIST, p);
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      // SPA fallback to index.html for navigations.
      if (!existsSync(file)) file = join(DIST, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e && e.message));
    }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

const log = [];
function note(vp, screen, kind, detail) {
  log.push({ vp, screen, kind, detail });
  console.log(`  [${vp}] ${screen} ${kind}${detail ? ': ' + String(detail).slice(0, 200) : ''}`);
}

async function walk(browser, base, vp) {
  const dir = join(OUT, vp.name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: vp.colorScheme ?? 'light',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  if (vp.safeArea) {
    // Inline styles on <html> beat the :root declarations and survive the
    // SW-controlled reload below (init scripts re-run on every navigation).
    await context.addInitScript(({ top, bottom }) => {
      const apply = () => {
        const s = document.documentElement.style;
        s.setProperty('--safe-top', `${top}px`);
        s.setProperty('--safe-bottom', `${bottom}px`);
      };
      if (document.documentElement) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    }, vp.safeArea);
  }
  const page = await context.newPage();
  let screen = 'boot';
  const shots = [];
  page.on('console', (m) => { if (m.type() === 'error') note(vp.name, screen, 'console-error', m.text()); });
  page.on('pageerror', (e) => note(vp.name, screen, 'page-error', e.message));

  let n = 0;
  async function shoot(label, opts = {}) {
    n++;
    const name = `${String(n).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: join(dir, name), fullPage: !!opts.full });
    shots.push({ file: `${vp.name}/${name}`, label });
    return name;
  }
  async function tap(sel, ms = 6000) {
    try {
      await page.waitForSelector(sel, { timeout: ms });
      await page.click(sel);
      return true;
    } catch {
      note(vp.name, screen, 'selector-missing', sel);
      return false;
    }
  }

  // Boot: register SW on first load, then reload so it controls (mirrors real use).
  screen = 'boot';
  await page.goto(base + BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // First run lands on the welcome flow. Capture the steps at this viewport
  // (it's what a new user meets first, and the SE has the least room for it),
  // then finish setup programmatically and continue as normal.
  //
  // The walk taps by role/label only — never by a person's name. The roster
  // starts empty in this build, so there is no seeded name to tap, and the
  // profile step renders a form rather than a list of people.
  screen = 'onboarding';
  const onboarding = await page
    .waitForSelector('text=Plan Warped Tour without depending on cell service', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (onboarding) {
    await page.waitForTimeout(500);
    await shoot('onboarding-1-welcome', { full: true });
    if (await tap('button:has-text("Get Started")')) {
      await page.waitForTimeout(400);
      // Welcome goes straight to the profile form now; the set-times code step
      // was removed because it read as a requirement to anyone without one.
      await shoot('onboarding-2-profile', { full: true });
    }
    // However far the walk got, land on the real app for the rest of the sheet.
    await page.evaluate(async (users) => {
      const st = window.__WLB__?.state();
      if (!st) return;
      for (const u of users) await st.putUser(u);
      await window.__WLB__.completeOnboarding(users[0].id);
    }, SHOT_USERS).catch(() => {});
    await page.waitForTimeout(400);
  }

  await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15000 }).catch(() =>
    note(vp.name, screen, 'selector-missing', 'primary nav'),
  );
  await page.waitForTimeout(800);

  screen = 'now';
  await shoot('now', { full: true });

  screen = 'bands';
  if (await tap('nav[aria-label="Primary"] button[aria-label="Bands"]')) {
    await page.waitForTimeout(500);
    await shoot('bands', { full: true });
    // Viewport-clipped scrolled frame: fullPage shots never engage sticky or
    // fixed positioning, so this is the only still that shows the pinned
    // search header, letter tuck-under, A-Z rail, and BottomNav inset.
    await page.evaluate(() => { document.querySelector('main').scrollTop = 600; });
    await page.waitForTimeout(400);
    await shoot('bands-scrolled');
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await page.waitForTimeout(200);
  }

  screen = 'schedule';
  if (await tap('nav[aria-label="Primary"] button[aria-label="Schedule"]')) {
    await page.waitForTimeout(400);
    await shoot('schedule', { full: true });
  }

  screen = 'group';
  if (await tap('nav[aria-label="Primary"] button[aria-label="Group"]')) {
    await page.waitForTimeout(400);
    await shoot('group', { full: true });
  }

  screen = 'map';
  if (await tap('nav[aria-label="Primary"] button[aria-label="Map"]')) {
    await page.waitForTimeout(700);
    await shoot('map', { full: true });
  }

  // Menu -> Offline Test
  screen = 'offline-test';
  await tap('header button[aria-label="Open menu"]');
  await page.waitForTimeout(400);
  if (await tap('button:has-text("Offline Test")')) {
    await page.waitForTimeout(1500);
    await shoot('offline-test', { full: true });
  }

  // Menu -> About
  screen = 'about';
  await tap('header button[aria-label="Open menu"]');
  await page.waitForTimeout(400);
  if (await tap('button:has-text("About")')) {
    await page.waitForTimeout(500);
    await shoot('about', { full: true });
  }
  // close menu route
  await tap('button[aria-label="Back"]', 2000);

  // ---- seeded pass: populate a realistic day so data-rich screens render ----
  screen = 'seed';
  const seeded = await page.evaluate(async () => {
    const W = window.__WLB__;
    if (!W) return false;
    const perfs = W.state().performances;
    const sat = perfs.filter((p) => p.type === 'main' && p.day === 'saturday');
    const byName = (n) => sat.find((p) => W.state().artistById.get(p.artistId)?.name === n);
    const plan = [
      ['Jimmy Eat World', 'ghost-stage', '15:05', '15:50'],
      ['The Story So Far', 'rex-stage', '16:10', '16:55'],
      ['Simple Plan', 'vans-stage', '17:30', '18:20'],
      ['Underoath', 'beatbox-stage', '15:20', '16:05'],
      ['Bowling For Soup', 'doordash-stage', '16:30', '17:15'],
    ];
    for (const [name, stage, s, e] of plan) {
      const p = byName(name);
      if (p) await W.updatePerformance({ ...p, stageId: stage, startTime: s, endTime: e, scheduleStatus: 'scheduled' });
    }
    const pick = (name, user, pri) => {
      const p = byName(name);
      if (p) { W.toggleSelection(user, p.id); W.setPriority(user, p.id, pri); }
    };
    await pick('Jimmy Eat World', 'alex', 'must-see');
    await pick('The Story So Far', 'alex', 'want-to-see');
    await pick('Simple Plan', 'alex', 'must-see');
    await pick('Jimmy Eat World', 'sam', 'must-see');
    await pick('Underoath', 'sam', 'must-see');
    await pick('Bowling For Soup', 'jordan', 'want-to-see');
    await pick('Simple Plan', 'jordan', 'must-see');
    // mark friend imports so metadata shows
    const st = W.state();
    await st.updateSettings({
      friendImports: {
        sam: { userId: 'sam', importedAt: new Date(Date.now() - 22 * 60000).toISOString(), selectionCount: 2 },
        jordan: { userId: 'jordan', importedAt: new Date(Date.now() - 5 * 60000).toISOString(), selectionCount: 2 },
      },
    });
    return true;
  }).catch(() => false);

  if (seeded) {
    // Group timeline
    screen = 'group-seeded';
    await tap('nav[aria-label="Primary"] button[aria-label="Group"]');
    await page.waitForTimeout(500);
    await shoot('group-timeline', { full: true });
    if (await tap('button:has-text("Shared")')) { await page.waitForTimeout(300); await shoot('group-shared', { full: true }); }
    if (await tap('button:has-text("By Person")')) { await page.waitForTimeout(300); await shoot('group-person', { full: true }); }
    if (await tap('button:has-text("Free Time")')) { await page.waitForTimeout(300); await shoot('group-free', { full: true }); }

    // Schedule -> My Day (personal schedule with data)
    screen = 'schedule-seeded';
    await tap('nav[aria-label="Primary"] button[aria-label="Schedule"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("My Day")')) { await page.waitForTimeout(300); await shoot('schedule-myday', { full: true }); }
    if (await tap('button:has-text("Conflicts")')) { await page.waitForTimeout(300); await shoot('schedule-conflicts', { full: true }); }

    // Board mode — the poster-shaped entry screen, mid-entry so the band
    // picker and the running column are both captured.
    screen = 'schedule-board';
    if (await tap('button:has-text("Enter Times")')) {
      await page.waitForTimeout(300);
      await tap('button:has-text("Ghost")', 2000);
      await page.waitForTimeout(300);
      await page.fill('#board-time', '352').catch(() => {});
      await page.waitForTimeout(150);
      await page.fill('#board-band', 'simple').catch(() => {});
      await page.waitForTimeout(300);
      await shoot('schedule-board', { full: true });
    }

    // Friends screen
    screen = 'friends-seeded';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Friends & Sharing")')) { await page.waitForTimeout(400); await shoot('friends', { full: true }); }
    await tap('button[aria-label="Back"]', 2000);

    // Map with pins + friends
    screen = 'map-seeded';
    await tap('nav[aria-label="Primary"] button[aria-label="Map"]');
    await page.waitForTimeout(700);
    // Move the time slider to 5:45 PM so friends are spread across stages.
    await page.evaluate(() => {
      const el = document.querySelector('input[type="range"][aria-label="Time of day"]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '1065');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);
    await shoot('map-friends');
    // Toggle stages filter to show stage pins clearly
    if (await tap('button:has-text("Stages")')) { await page.waitForTimeout(400); await shoot('map-stages'); }

    // Group meetups
    screen = 'group-meetups';
    await tap('nav[aria-label="Primary"] button[aria-label="Group"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Meetups")')) { await page.waitForTimeout(400); await shoot('group-meetups', { full: true }); }

    // Now dashboard (schedule now loaded)
    screen = 'now-dashboard';
    await tap('nav[aria-label="Primary"] button[aria-label="Now"]');
    await page.waitForTimeout(400);
    await shoot('now-dashboard', { full: true });

    // Travel settings
    screen = 'travel';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Travel & Crowd")')) { await page.waitForTimeout(400); await shoot('travel', { full: true }); await tap('button[aria-label="Back"]', 2000); }

    // Emergency schedule
    screen = 'emergency';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Emergency Schedule")')) { await page.waitForTimeout(400); await shoot('emergency', { full: true }); await tap('button[aria-label="Back"]', 2000); }

    // Settings
    screen = 'settings';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Settings")')) { await page.waitForTimeout(400); await shoot('settings', { full: true }); await tap('button[aria-label="Back"]', 2000); }

    // Data / backup
    screen = 'data';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Backup & Data")')) { await page.waitForTimeout(400); await shoot('data', { full: true }); await tap('button[aria-label="Back"]', 2000); }

    // Demo mode
    screen = 'demo';
    await tap('header button[aria-label="Open menu"]');
    await page.waitForTimeout(300);
    if (await tap('button:has-text("Demo Mode")')) { await page.waitForTimeout(400); await shoot('demo', { full: true }); await tap('button[aria-label="Back"]', 2000); }
  }

  await context.close();
  return shots;
}

function contactSheet(all) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const groups = VIEWPORTS.map((vp) => {
    const shots = all[vp.name] || [];
    const tiles = shots
      .map(
        (s) =>
          `<figure><a href="${s.file}"><img loading="lazy" src="${s.file}" alt="${esc(s.label)}"></a><figcaption>${esc(s.label)}</figcaption></figure>`,
      )
      .join('');
    return `<h2>${vp.name}</h2><div class="grid">${tiles}</div>`;
  }).join('\n');
  const errs = log.filter((l) => l.kind === 'console-error' || l.kind === 'page-error').length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Warped LB shots</title><style>
    body{background:#0b2f6b;color:#eaf1fb;font:14px/1.5 system-ui,sans-serif;margin:24px}
    h1{font-size:20px}h2{margin-top:28px;border-bottom:1px solid #2f66c4;padding-bottom:6px}
    .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
    figure{margin:0}img{width:100%;border:1px solid #2f66c4;border-radius:8px;background:#000}
    figcaption{color:#93b4e6;font-size:12px;margin-top:4px;text-align:center}
  </style></head><body><h1>Warped Long Beach Companion — contact sheet</h1>
  <p>${errs} console/page error(s). See shots/console-log.json.</p>${groups}</body></html>`;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html missing. Run `npm run build` first.');
    process.exit(1);
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const srv = await serveDist();
  const base = 'http://localhost:' + srv.address().port;
  console.log('serving dist/ at ' + base + BASE);
  const browser = await chromium.launch();
  const all = {};
  try {
    for (const vp of VIEWPORTS) {
      console.log('viewport ' + vp.name);
      all[vp.name] = await walk(browser, base, vp);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  await writeFile(join(OUT, 'index.html'), contactSheet(all));
  await writeFile(join(OUT, 'console-log.json'), JSON.stringify(log, null, 1));
  const errs = log.filter((l) => l.kind === 'console-error' || l.kind === 'page-error');
  const total = Object.values(all).reduce((s, a) => s + a.length, 0);
  console.log(`${total} stills, ${errs.length} error(s). Contact sheet: shots/index.html`);
}

main().catch((e) => { console.error(e); process.exit(1); });
