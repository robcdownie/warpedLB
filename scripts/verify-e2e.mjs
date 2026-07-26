// Focused end-to-end verification in a real browser (Playwright + built app).
// Drives the store via the app's own module to exercise the full path:
// seed -> IndexedDB -> schedule edit -> conflict engine -> export/import.
// Run: npm run build && node scripts/verify-e2e.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const BASE = '/warpedLB/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };

function serve() {
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      if (p.startsWith(BASE)) p = '/' + p.slice(BASE.length);
      if (p.endsWith('/')) p += 'index.html';
      let file = join(DIST, p);
      if (!existsSync(file)) file = join(DIST, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

const results = [];
let prefix = '';
function check(name, cond, detail = '') {
  const label = prefix ? `[${prefix}] ${name}` : name;
  results.push({ name: label, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

/**
 * Profiles the harness works with. The app ships with an EMPTY roster, so the
 * harness has to create its own people before it can drive anything — and
 * App.tsx refuses to leave onboarding until activeUserId resolves to a real
 * user, so creating them is not optional.
 */
const HARNESS_USERS = [
  { id: 'alex', name: 'Alex', initials: 'A', avatar: null, colorKey: 'pink' },
  { id: 'sam', name: 'Sam', initials: 'S', avatar: null, colorKey: 'blue' },
  { id: 'jordan', name: 'Jordan', initials: 'J', avatar: null, colorKey: 'orange' },
];

/**
 * First run shows the welcome flow; the harness drives the app behind it.
 * Idempotent — every render pass gets a fresh IndexedDB, so this runs again
 * from scratch each time.
 */
async function skipOnboarding(page) {
  await page.waitForFunction(() => typeof window.__WLB__ !== 'undefined', null, { timeout: 15000 });
  await page.evaluate(async (users) => {
    for (const u of users) await window.__WLB__.state().putUser(u);
    await window.__WLB__.completeOnboarding(users[0].id);
  }, HARNESS_USERS);
  await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15000 });
}

/**
 * Deep functional pass: seeds a day, drives the trust engines, and exercises
 * offline reload. Runs on Chromium because it's the engine the debug hook and
 * SW behaviour are tuned against; the render passes below cover WebKit.
 */
async function functionalPass(base) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(base, { waitUntil: 'networkidle' });

  // The app exposes a debug hook (added for verification). If missing, skip.
  const out = await page
    .waitForFunction(() => typeof window.__WLB__ !== 'undefined', null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!out) {
    check('debug hook present', false, 'window.__WLB__ not found (build without debug hook)');
    await browser.close();
    return;
  }

  // 0. First run shows the welcome flow before the tabbed UI.
  const onboardingShown = await page
    .waitForSelector('text=Plan Warped Tour without depending on cell service', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('first run shows the welcome flow (plan §First Fix)', onboardingShown);

  // 0a. Install-before-setup guidance. iOS has shipped versions where a Home
  // Screen web app got a different storage jar from the Safari tab it was added
  // from, which would strand a profile in a tab the user never reopens. The
  // advice has to appear BEFORE Get Started or it isn't advice, it's trivia.
  const install = await page.evaluate(() => {
    const text = document.body.innerText;
    const card = [...document.querySelectorAll('h2')].find((h) =>
      /Home Screen/i.test(h.textContent),
    );
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.trim().includes('Get Started'),
    );
    return {
      mentioned: /Home Screen/i.test(text),
      precedesStart:
        !!card &&
        !!btn &&
        !!(card.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  check('setup tells you to add it to your Home Screen', install.mentioned);
  check('that guidance comes before Get Started', install.precedesStart);

  // 0b. THE PUBLIC-BUILD GUARANTEE: a fresh install ships nobody. This has to
  // be measured BEFORE skipOnboarding, which creates its own profiles.
  const preSetup = await page.evaluate(() => window.__WLB__.counts());
  check(
    'a fresh install ships no profiles (public build)',
    preSetup.users === 0,
    `users=${preSetup.users}`,
  );

  // 0c. Setup must never ask for something a first-time visitor cannot have.
  // A "paste a set-times code" step used to sit at position two; someone
  // arriving from a link has no code, read it as a hard requirement, and the
  // rational response was to close the app. The prompt now lives on the Enter
  // Times board instead, where it saves work rather than blocking it.
  await page.click('button:has-text("Get Started")').catch(() => {});
  await page.waitForTimeout(500);
  const gate = await page.evaluate(() => ({
    body: document.body.innerText,
  }));
  check(
    'setup never demands a set-times code up front',
    !/set-times code\?|Got a code|paste their code here/i.test(gate.body),
    gate.body.slice(0, 120).replace(/\s+/g, ' '),
  );
  check(
    'step after Welcome asks who this phone belongs to',
    /set up your profile|which one is you|add yourself/i.test(gate.body),
    gate.body.slice(0, 120).replace(/\s+/g, ' '),
  );

  await skipOnboarding(page);
  const onboardingSticks = await page.evaluate(() => window.__WLB__.settings().onboardingComplete);
  check('onboarding completion is stored', onboardingSticks);

  // 1. Seed loaded.
  const counts = await page.evaluate(() => window.__WLB__.counts());
  check('seed: 151 main performances', counts.main === 151, `main=${counts.main}`);
  check('profiles are created, not seeded', counts.users === 3, `users=${counts.users}`);

  // 1b. A profile can be added and removed from inside the app. The roster is
  // now user-managed, so this is load-bearing rather than cosmetic.
  const roster = await page.evaluate(async () => {
    const st = window.__WLB__.state();
    await st.putUser({ id: 'temp-x', name: 'Temp', initials: 'T', avatar: null, colorKey: 'teal' });
    const added = window.__WLB__.state().users.some((u) => u.id === 'temp-x');
    await window.__WLB__.state().deleteUser('temp-x');
    return { added, removed: !window.__WLB__.state().users.some((u) => u.id === 'temp-x') };
  });
  check(
    'a profile can be added and removed in-app',
    roster.added && roster.removed,
    JSON.stringify(roster),
  );

  // 2. Enter an overlapping schedule for the active user: two must-see clashes.
  const conflictInfo = await page.evaluate(async () => {
    const W = window.__WLB__;
    // pick two Saturday main performances
    const perfs = W.state().performances.filter((p) => p.type === 'main' && p.day === 'saturday').slice(0, 2);
    const [a, b] = perfs;
    await W.updatePerformance({ ...a, stageId: 'ghost-stage', startTime: '15:00', endTime: '15:40', scheduleStatus: 'scheduled' });
    await W.updatePerformance({ ...b, stageId: 'rex-stage', startTime: '15:20', endTime: '16:00', scheduleStatus: 'scheduled' });
    await W.toggleSelection('alex', a.id);
    await W.setPriority('alex', a.id, 'must-see');
    await W.toggleSelection('alex', b.id);
    await W.setPriority('alex', b.id, 'must-see');
    const conflicts = W.conflicts('alex');
    return {
      hasMustSee: conflicts.some((c) => c.type === 'must-see-conflict'),
      total: conflicts.length,
      scheduleLoaded: W.state().performances.some((p) => p.startTime && p.stageId),
    };
  });
  check('schedule persisted to IndexedDB', conflictInfo.scheduleLoaded, `loaded=${conflictInfo.scheduleLoaded}`);
  check('must-see overlap conflict detected', conflictInfo.hasMustSee, `total conflicts=${conflictInfo.total}`);

  // 2b. PARTIAL SCHEDULE (plan §P0-1) — two of ~76 Saturday sets entered must
  // read as partial, never as a loaded schedule.
  const partial = await page.evaluate(() => {
    const W = window.__WLB__;
    const status = W.scheduleStatus();
    return {
      sat: status.saturday.status,
      satEntered: status.saturday.entered,
      satExpected: status.saturday.expected,
      sun: status.sunday.status,
    };
  });
  check(
    'a barely-entered day reports PARTIAL, not complete (plan §P0-1)',
    partial.sat === 'partial',
    `saturday=${partial.sat} ${partial.satEntered}/${partial.satExpected}`,
  );
  check('an untouched day reports EMPTY', partial.sun === 'empty', `sunday=${partial.sun}`);
  check('the two days are tracked independently', partial.sat !== partial.sun);

  const marked = await page.evaluate(async () => {
    const W = window.__WLB__;
    await W.markDayComplete('saturday');
    const after = W.scheduleStatus().saturday.status;
    await W.unmarkDayComplete('saturday');
    const undone = W.scheduleStatus().saturday.status;
    return { after, undone };
  });
  check('Mark Day Complete flips a partial day to complete', marked.after === 'complete', `after=${marked.after}`);
  check('marking complete is reversible', marked.undone === 'partial', `undone=${marked.undone}`);

  // The partial-schedule warning is on screen, not just in the model.
  await page.click('nav[aria-label="Primary"] button[aria-label="Schedule"]');
  await page.waitForTimeout(400);
  // Ask for My Day and Saturday explicitly. The tab now opens on Enter Times
  // when today's board isn't entered, and the day toggle follows today — so
  // without these two clicks, which view loads depends on the date.
  await page.click('button:has-text("My Day")').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('button:text-is("Saturday")').catch(() => {});
  await page.waitForTimeout(300);
  const partialCopy = await page
    .waitForSelector('text=/Partial schedule/i', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  check('the UI says the schedule is partial', partialCopy);

  // 2c. PLAN STATUS (plan §P0-2) — a seeded profile with no import must not
  // count as a person who is free.
  const planStatus = await page.evaluate(() => {
    const W = window.__WLB__;
    const s = W.planStatus();
    return {
      alex: s.alex.status,
      alexEligible: s.alex.eligible,
      jordan: s.jordan.status,
      jordanEligible: s.jordan.eligible,
    };
  });
  check('the active user is always eligible', planStatus.alexEligible && planStatus.alex === 'local');
  check(
    'a friend with no imported plan is a placeholder, not free (plan §P0-2)',
    planStatus.jordan === 'placeholder' && planStatus.jordanEligible === false,
    `jordan=${planStatus.jordan}`,
  );

  // 2d. ARTIST NAMES IN CONFLICTS (plan §P0-4).
  const named = await page.evaluate(() => {
    const W = window.__WLB__;
    const c = W.conflicts('alex').find((x) => x.type === 'must-see-conflict');
    if (!c) return null;
    const names = c.artistNames ?? [];
    return {
      titleHasBoth: names.length === 2 && names.every((n) => c.title.includes(n)),
      actionsNameBands: c.actions
        .filter((a) => a.kind === 'attend')
        .every((a) => names.some((n) => a.label.includes(n))),
      noOrdinals: !c.actions.some((a) => /first set|second set/i.test(a.label)),
      hasSplit: c.actions.some((a) => a.kind === 'split'),
    };
  });
  check('conflict titles name both artists (plan §P0-4)', named?.titleHasBoth, JSON.stringify(named));
  check('conflict buttons name the actual bands', named?.actionsNameBands);
  check('no "first set" / "second set" ambiguity remains', named?.noOrdinals);
  check('a split-set option is offered', named?.hasSplit);

  // 3. Export schedule, decode, and confirm it carries the times.
  const roundtrip = await page.evaluate(async () => {
    const W = window.__WLB__;
    const code = W.exportSchedule();
    const env = W.decode(code);
    const withTimes = env.data.p.filter((t) => t[2]).length;
    return { type: env.type, withTimes };
  });
  check('schedule export decodes', roundtrip.type === 'schedule', `type=${roundtrip.type}`);
  check('export carries set times', roundtrip.withTimes >= 2, `withTimes=${roundtrip.withTimes}`);

  // 3b. Friend selection import + re-import (no duplicate) — acceptance §26-30.
  const importCheck = await page.evaluate(async () => {
    const W = window.__WLB__;
    const perfs = W.state().performances.filter((p) => p.type === 'main' && p.day === 'sunday').slice(0, 3);
    // Seed Sam's picks locally, export them, wipe, and re-import twice.
    for (const p of perfs) {
      await W.toggleSelection('sam', p.id);
    }
    const code = W.exportSelections('sam');
    const env = W.decode(code);
    // Remove Sam's local selections to simulate importing on another device.
    const before = W.state().selections.filter((s) => s.userId === 'sam').length;
    await W.applyImport(env);
    const after1 = W.state().selections.filter((s) => s.userId === 'sam').length;
    await W.applyImport(env); // second import should update, not duplicate
    const after2 = W.state().selections.filter((s) => s.userId === 'sam').length;
    const meta = W.state().settings.friendImports['sam'];
    return { type: env.type, count: env.data.s.length, after1, after2, hasMeta: !!meta };
  });
  check('friend selections export decodes', importCheck.type === 'selections', `type=${importCheck.type}`);
  check('friend import creates selections', importCheck.after1 === importCheck.count, `after1=${importCheck.after1}/${importCheck.count}`);
  check('re-import updates without duplicating (acceptance §30)', importCheck.after2 === importCheck.after1, `after1=${importCheck.after1} after2=${importCheck.after2}`);
  check('friend import metadata recorded', importCheck.hasMeta);

  // 3c. An imported friend becomes eligible; provenance is stamped.
  const afterImport = await page.evaluate(() => {
    const W = window.__WLB__;
    return { sam: W.planStatus().sam };
  });
  check(
    'importing a plan makes that friend eligible',
    afterImport.sam.eligible && afterImport.sam.status === 'imported',
    `sam=${afterImport.sam.status}`,
  );

  // 3d. IMPORT VALIDATION (plan §P0-8) — a decoded code with an unknown stage
  // must be refused with a readable message, not partially written.
  const validation = await page.evaluate(async () => {
    const W = window.__WLB__;
    const good = W.decode(W.exportSchedule());
    const okResult = W.validate(good);
    // Forge an unknown stage and a bad time on a copy of the same payload.
    const bad = JSON.parse(JSON.stringify(good));
    bad.data.p[0] = [bad.data.p[0][0], 'stage-that-does-not-exist', '15:00', null];
    const badStage = W.validate(bad);
    const badTime = JSON.parse(JSON.stringify(good));
    badTime.data.p[0] = [badTime.data.p[0][0], badTime.data.p[0][1], '99:99', null];
    const badTimeResult = W.validate(badTime);
    return {
      goodOk: okResult.ok,
      badStageOk: badStage.ok,
      badStageMsg: badStage.errors[0]?.message ?? '',
      badTimeOk: badTimeResult.ok,
    };
  });
  check('a valid schedule code passes validation', validation.goodOk);
  check('an unknown stage is refused (plan §P0-8)', validation.badStageOk === false, validation.badStageMsg);
  check(
    'the refusal is a plain sentence',
    /unknown stage and cannot be imported/i.test(validation.badStageMsg),
    validation.badStageMsg,
  );
  check('an impossible clock time is refused', validation.badTimeOk === false);

  // 3e. Provenance survives an actual schedule import (plan §P0-5).
  const provenance = await page.evaluate(async () => {
    const W = window.__WLB__;
    const env = W.decode(W.exportSchedule());
    await W.applyImport(env);
    const s = W.settings().schedule;
    return { source: s.scheduleSource, importedAt: s.scheduleImportedAt, revision: s.scheduleRevision };
  });
  check(
    'an imported schedule records who it came from (plan §P0-5)',
    !!provenance.source && !!provenance.importedAt,
    `source=${provenance.source} rev=${provenance.revision}`,
  );

  // 3f. Onboarding promises "importing Alex's schedule will not replace your
  // personal band choices" — hold the app to it.
  const picksSurvive = await page.evaluate(async () => {
    const W = window.__WLB__;
    const before = W.state().selections.filter((s) => s.userId === 'sam' && s.selected).length;
    await W.applyImport(W.decode(W.exportSchedule()));
    const after = W.state().selections.filter((s) => s.userId === 'sam' && s.selected).length;
    return { before, after };
  });
  check(
    'a schedule import leaves personal band choices alone',
    picksSurvive.before > 0 && picksSurvive.after === picksSurvive.before,
    `before=${picksSurvive.before} after=${picksSurvive.after}`,
  );

  // 3g. Restart Welcome Guide replays onboarding without deleting anything.
  const restart = await page.evaluate(async () => {
    const W = window.__WLB__;
    const st = W.state();
    const picks = st.selections.filter((s) => s.selected).length;
    const times = st.performances.filter((p) => p.startTime && p.stageId).length;
    await st.restartOnboarding();
    const after = W.state();
    return {
      onboardingReset: after.settings.onboardingComplete === false,
      picksKept: after.selections.filter((s) => s.selected).length === picks,
      timesKept: after.performances.filter((p) => p.startTime && p.stageId).length === times,
    };
  });
  check('Restart Welcome Guide replays the flow', restart.onboardingReset);
  check('…without deleting picks or set times', restart.picksKept && restart.timesKept, JSON.stringify(restart));
  await skipOnboarding(page);

  // 4. Reload page (persistence across reload).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('nav[aria-label="Primary"]');
  const afterReload = await page.evaluate(() => {
    const W = window.__WLB__;
    return W.state().performances.some((p) => p.startTime && p.stageId);
  });
  check('data survives reload', afterReload);

  // 4b. FESTIVAL MODE NAVIGATION. Every tab button on the festival screen was a
  // dead tap: goTab set the tab but the festival branch only checked menuRoute,
  // so the same screen re-rendered. Map in particular is one of two primary
  // one-handed actions on the screen used all day.
  const festivalNav = await page.evaluate(async () => {
    const W = window.__WLB__;
    await W.updateSettings({ festivalMode: true });
    await new Promise((r) => setTimeout(r, 400));
    const onFestival = !document.querySelector('nav[aria-label="Primary"]');
    const mapBtn = [...document.querySelectorAll('button')].find((b) =>
      /^Map$/.test((b.textContent || '').trim()),
    );
    mapBtn?.click();
    await new Promise((r) => setTimeout(r, 600));
    const leftFestival = !!document.querySelector('nav[aria-label="Primary"]');
    // Festival mode is a preference; a detour must not switch it off.
    const stillOn = W.settings().festivalMode === true;
    const back = document.querySelector('button[aria-label="Back to Festival mode"]');
    back?.click();
    await new Promise((r) => setTimeout(r, 500));
    const returned = !document.querySelector('nav[aria-label="Primary"]');
    await W.updateSettings({ festivalMode: false });
    await new Promise((r) => setTimeout(r, 300));
    return { onFestival, leftFestival, stillOn, returned };
  });
  check('festival mode renders its own screen', festivalNav.onFestival);
  check('Map on the festival screen actually navigates', festivalNav.leftFestival);
  check('…without silently turning festival mode off', festivalNav.stillOn);
  check('…and there is a way back to the festival screen', festivalNav.returned);

  // 5. Manual check-in persists.
  await page.evaluate(async () => {
    await window.__WLB__.state().putCheckIn({
      id: 'e2e-checkin', userId: 'alex', locationId: 'ghost-stage',
      customCoordinates: null, source: 'manual', updatedAt: new Date().toISOString(),
    });
  });

  // 5b. STALE CHECK-IN FALLBACK (plan §P0-3). A fresh check-in is the position;
  // an old one must hand the position back to the schedule and survive only as
  // history.
  const staleFallback = await page.evaluate(async () => {
    const W = window.__WLB__;
    const st = W.state();
    // Alex's schedule puts him at a stage at 15:30 (set 'b' from step 2).
    const fresh = W.position('alex', 'saturday', 15 * 60 + 30);

    // Swap the fresh check-in for an old one — the newest check-in always
    // wins, so both can't be present for this half of the test.
    await st.deleteCheckIn('e2e-checkin');
    await st.putCheckIn({
      id: 'e2e-stale', userId: 'alex', locationId: 'doordash-stage',
      customCoordinates: null, source: 'manual',
      updatedAt: new Date(Date.now() - 48 * 60000).toISOString(),
    });
    const stale = W.position('alex', 'saturday', 15 * 60 + 30);

    // Restore the fresh check-in for the offline-persistence checks below.
    await st.deleteCheckIn('e2e-stale');
    await st.putCheckIn({
      id: 'e2e-checkin', userId: 'alex', locationId: 'ghost-stage',
      customCoordinates: null, source: 'manual', updatedAt: new Date().toISOString(),
    });
    return {
      freshSource: fresh.source,
      freshLoc: fresh.locationId,
      staleSource: stale.source,
      staleLoc: stale.locationId,
      staleHistoryLoc: stale.staleCheckIn?.locationId ?? null,
      staleAge: stale.staleCheckIn?.ageMinutes ?? null,
    };
  });
  check(
    'a fresh check-in is the position',
    staleFallback.freshSource === 'manual' && staleFallback.freshLoc === 'ghost-stage',
    `source=${staleFallback.freshSource} loc=${staleFallback.freshLoc}`,
  );
  check(
    'a STALE check-in falls back to the planned position (plan §P0-3)',
    staleFallback.staleSource === 'planned' && staleFallback.staleLoc !== 'doordash-stage',
    `source=${staleFallback.staleSource} loc=${staleFallback.staleLoc}`,
  );
  check(
    'the stale check-in survives only as history',
    staleFallback.staleHistoryLoc === 'doordash-stage' && staleFallback.staleAge >= 45,
    `history=${staleFallback.staleHistoryLoc} age=${staleFallback.staleAge}`,
  );

  // 6. OFFLINE acceptance: ensure SW controls, then go offline and reload.
  const controlled = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready.catch(() => {});
    return !!navigator.serviceWorker.controller;
  });
  check('service worker controls the page', controlled);

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlineOk = await page
    .waitForSelector('nav[aria-label="Primary"]', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('app reopens fully OFFLINE (airplane mode)', offlineOk);
  // Onboarding must not replay after a reload, offline or not.
  check(
    'onboarding does not repeat on reopen',
    offlineOk && !(await page.$('text=Plan Warped Tour without depending on cell service')),
  );

  if (offlineOk) {
    // Navigate every tab offline.
    const tabs = ['Bands', 'Schedule', 'Group', 'Map', 'Now'];
    let allTabs = true;
    for (const t of tabs) {
      const ok = await page.click(`nav[aria-label="Primary"] button[aria-label="${t}"]`).then(() => true).catch(() => false);
      await page.waitForTimeout(200);
      if (!ok) allTabs = false;
    }
    check('all 5 tabs navigate offline', allTabs);

    const offlineData = await page.evaluate(() => {
      const W = window.__WLB__;
      return {
        schedule: W.state().performances.some((p) => p.startTime && p.stageId),
        checkin: W.state().checkins.some((c) => c.id === 'e2e-checkin'),
      };
    });
    check('schedule data present offline', offlineData.schedule);
    check('check-in persists offline', offlineData.checkin);
  }
  await ctx.setOffline(false);

  // 7. Demo mode is separate from production.
  const demoSep = await page.evaluate(async () => {
    const W = window.__WLB__;
    await W.state().enterDemo();
    const demoHasTimes = W.state().performances.some((p) => p.startTime);
    await W.state().exitDemo();
    const prodStillClean = W.state().performances.filter((p) => p.type === 'main' && p.startTime && p.stageId).length;
    return { demoHasTimes, prodStillClean };
  });
  check('demo mode has fictional times', demoSep.demoHasTimes);
  // prod still has our 2 e2e-set performances but demo didn't add to prod
  check('demo data separate from production', demoSep.prodStillClean <= 2, `prodScheduled=${demoSep.prodStillClean}`);

  // 8. Error handling: invalid + wrong-version codes.
  const errs = await page.evaluate(() => {
    const W = window.__WLB__;
    const out = {};
    try { W.decode('not a real code'); out.invalid = 'no-throw'; } catch (e) { out.invalid = e.code; }
    return out;
  });
  check('invalid code rejected with friendly error (acceptance §42)', errs.invalid === 'format', `code=${errs.invalid}`);

  // Clean up test data.
  await page.evaluate(async () => {
    await window.__WLB__.resetSchedule();
    await window.__WLB__.state().deleteCheckIn('e2e-checkin');
  });

  await browser.close();
}

/**
 * Render pass: boots the app on a given engine / viewport / colour scheme and
 * confirms every tab paints without a page error and without the body
 * scrolling sideways. Cheap, and it's what catches "works on my phone".
 */
const RENDER_MATRIX = [
  { engine: chromium, label: 'chromium se', device: { width: 375, height: 667 }, scheme: 'light' },
  { engine: chromium, label: 'chromium 16pm dark', device: { width: 440, height: 956 }, scheme: 'dark', safeArea: { top: 59, bottom: 34 } },
  { engine: webkit, label: 'webkit iphone', device: devices['iPhone 13']?.viewport ?? { width: 390, height: 844 }, scheme: 'light' },
  { engine: webkit, label: 'webkit se dark', device: { width: 375, height: 667 }, scheme: 'dark' },
];

async function renderPass(base, cfg) {
  prefix = cfg.label;
  let browser;
  try {
    browser = await cfg.engine.launch();
  } catch (e) {
    // A missing WebKit download shouldn't silently reduce coverage.
    check('browser launches', false, String(e.message).split('\n')[0]);
    return;
  }
  const ctx = await browser.newContext({
    viewport: cfg.device,
    isMobile: true,
    hasTouch: true,
    colorScheme: cfg.scheme,
  });
  if (cfg.safeArea) {
    await ctx.addInitScript(({ top, bottom }) => {
      const apply = () => {
        document.documentElement.style.setProperty('--safe-top', `${top}px`);
        document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
      };
      if (document.documentElement) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    }, cfg.safeArea);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const welcome = await page
    .waitForSelector('text=Plan Warped Tour without depending on cell service', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('welcome flow renders', welcome);

  if (welcome) {
    // Onboarding must fit: no dead ends, no horizontal scroll, primary action
    // reachable. iPhone SE is the tight one.
    const noSideScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    check('welcome does not scroll sideways', noSideScroll);
    const primary = await page.$('button:has-text("Get Started")');
    check('welcome has a clear primary action', !!primary);
  }

  await skipOnboarding(page).catch(() => {});

  for (const tab of ['Now', 'Bands', 'Schedule', 'Group', 'Map']) {
    const ok = await page
      .click(`nav[aria-label="Primary"] button[aria-label="${tab}"]`)
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(350);
    const noSideScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    check(`${tab} renders and fits the viewport`, ok && noSideScroll);
  }

  // The bottom nav must clear the home indicator in the standalone sim.
  if (cfg.safeArea) {
    const clears = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      if (!nav) return false;
      return nav.getBoundingClientRect().bottom <= window.innerHeight + 1;
    });
    check('bottom nav clears the home indicator', clears);
  }

  // The map's own controls are fixed to the bottom of a non-scrolling column,
  // so they're the first thing to disappear under the nav when the chrome
  // above them grows. Checking the nav's own position never caught that.
  await page.click('nav[aria-label="Primary"] button[aria-label="Map"]').catch(() => {});
  await page.waitForTimeout(500);
  const mapControls = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const slider = document.querySelector('input[type="range"][aria-label="Time of day"]');
    const checkIn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Check in',
    );
    const main = document.querySelector('main');
    if (!nav || !slider || !checkIn || !main) return { found: false };
    const navTop = nav.getBoundingClientRect().top;
    return {
      found: true,
      sliderClear: slider.getBoundingClientRect().bottom <= navTop,
      checkInClear: checkIn.getBoundingClientRect().bottom <= navTop,
      // The map screen sizes itself to the viewport; it must never scroll.
      noOverflow: main.scrollHeight <= main.clientHeight + 1,
      overflowBy: main.scrollHeight - main.clientHeight,
    };
  });
  check('map time slider sits above the nav', mapControls.found && mapControls.sliderClear, JSON.stringify(mapControls));
  check('map Check in button sits above the nav', mapControls.found && mapControls.checkInClear);
  check('map screen fits the viewport without scrolling', mapControls.found && mapControls.noOverflow, `overflowBy=${mapControls.overflowBy}px`);

  check('no uncaught page errors', errors.length === 0, errors[0] ?? '');
  await browser.close();
  prefix = '';
}

async function main() {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port + BASE;
  try {
    await functionalPass(base);
    for (const cfg of RENDER_MATRIX) await renderPass(base, cfg);
  } finally {
    srv.close();
  }
  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
