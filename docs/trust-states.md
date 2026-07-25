# Trust states — what the app claims and how sure it is

The July 2026 pass had one theme: **several states looked more certain than the
underlying data really was.** A partial schedule read as complete, friends with
no imported plan read as free, and stale check-ins kept overriding current
planned positions. Any one of those could put the crew at the wrong stage.

Six distinctions are now enforced everywhere. If you're adding a screen, this
is the vocabulary to use.

| Never say | Say instead | Enforced by |
|---|---|---|
| Unknown is free | Unknown | `planStatus.ts`, `scheduleStatus.ts` |
| Partial is complete | Partial | `scheduleStatus.ts` |
| Planned is live | Planned | `positions.ts` |
| Stale is current | Stale (history only) | `positions.ts` |
| Imported is fresh | Imported *N hours ago* | `planStatus.ts` |
| Cached is verified | Reference layout | `settings.map` |

---

## 1. Schedule completeness — `src/domain/scheduleStatus.ts`

Each festival day is `empty` | `partial` | `complete`, tracked independently.

```ts
dayScheduleInfo('saturday', performances, settings.schedule)
// → { status: 'partial', entered: 51, expected: 76, verifiedAt: null, … }
```

- **empty** — no set has both a stage and a start time.
- **partial** — at least one does, but not all, and nobody has said otherwise.
- **complete** — every expected set is entered, *or* a human pressed
  **Mark Day Complete** (`settings.schedule.saturdayVerifiedAt`).

A set counts as entered only with **both** a stage and a start time.
Cancelled/removed lineup rows are excluded from `expected`.

**Rules for UI built on this:**

- Never describe unassigned time as free while a day is `partial`.
- Label meetups, free windows and group timelines *provisional*
  (`<ProvisionalNote day={day} what="…" />` does this).
- Selected sets with no time appear in a dedicated "no time yet" section on
  My Day — they are never silently dropped.
- Empty results ("no conflicts") must read "no conflicts **so far**".

Replaces the old `isScheduleLoaded(performances)` boolean, which flipped true
after a single entered set and switched on the entire day view.

---

## 2. Who counts — `src/domain/planStatus.ts`

A profile can exist on a phone without that person's picks ever arriving — you
add someone by name, or they arrive inside an imported code. So "profile
exists" never meant "plan is on this phone".

```ts
planInfo('member-2', settings, selections)
// → { status: 'imported' | 'stale' | 'placeholder' | 'local', eligible: bool, … }
```

- **local** — the active user of this phone. Always eligible.
- **imported** — their code has been scanned and carried selections.
- **stale** — imported over `PLAN_STALE_HOURS` (12) ago. Still eligible, flagged.
- **placeholder** — no import, or an import that carried nothing. **Excluded**
  from every group calculation.

`useGroupCtx()` returns only eligible users, so timelines, meetups, free
windows and positions can't invent a person. Screens that need to *show*
everyone use `usePlanStatuses()` and render placeholders explicitly
("Plan not imported — unknown, not free").

---

## 3. Position confidence — `src/domain/positions.ts`

`positionWithCheckin()` resolves in strict order:

1. **Fresh manual check-in** (newer than `settings.staleMinutes`) → that's the position.
2. **Planned schedule position** → the fallback for everything else.
3. **Stale check-in** → attached as `staleCheckIn` context only. It never places
   the primary marker.

Markers carry a visible badge (`positionBadge()`), never opacity alone:
`Planned` · `Checked in 6m ago` · `Stale 48m` · `Traveling` · `Plan unknown`.

Screen-reader labels come from `positionA11yLabel()` and preserve the real
source — "Sam, manual check-in at Ghost Stage, updated 6 minutes ago", never
"Sam planned at Ghost Stage".

---

## 4. Schedule provenance — `settings.schedule`

```ts
{ scheduleSource, scheduleImportedAt, scheduleExportedAt, scheduleRevision,
  saturdayVerifiedAt, saturdayVerifiedBy, sundayVerifiedAt, sundayVerifiedBy }
```

Stamped by `commitImport()` on a schedule import. Revision and per-day
"complete" flags travel **inside the share code**, so an update that adds sets
can't inherit the sender's old "verified complete" stamp. `resetSchedule()`
clears all of it.

---

## 5. Map verification — `settings.map`

The shipped map was traced from an earlier Long Beach reference. `verified` is
`false` until a human works through the checklist in **Menu → Map Setup**.
Caching the image offline is *not* evidence the layout is right, and the map
screen says so until it's checked.

`calibratedAt` is stamped whenever a pin moves (store `putLocation`) or a
coordinates code is imported. Calibration itself is gated behind
`mapEditingEnabled`, off by default, so a mis-tap during the festival can't
move a stage.

Amenity pins (water, restrooms, First Aid, food, lockers…) live in
`src/data/amenities.ts`, transcribed by eye from the map artwork. They're
starter coordinates — good enough to point at the right corner of the site,
and explicitly part of what Map Setup asks you to verify.

---

## 6. Lineup changes — `src/data/lineupMigrations.ts`

Once the app is installed, a lineup correction can't just be a new seed array:
devices already hold performance records with the user's priorities and notes
attached. Append a `LineupRevision` and bump `LINEUP_REVISION`:

```ts
{ revision: 2, note: 'Official site update, 2026-07-20',
  changes: [{ kind: 'move-day', artist: 'Some Band', from: 'saturday', to: 'sunday' }] }
```

Supported: `rename`, `move-day`, `cancel`, `remove`, `add`. Selections follow
the record; cancelled bands are flagged, never deleted; every change produces a
`LineupNotice` the user sees once via `LineupNoticeBanner`.

---

## 7. Import validation — `src/domain/share/validate.ts`

The CRC32 checksum proves the bytes survived the QR round-trip. It says nothing
about whether the decoded fields make sense. `validateEnvelope()` runs before
the preview is shown and refuses, with a plain sentence, on: unknown stages,
impossible clock times, ends before starts, off-map coordinates, unknown
location categories, unusable ids, oversized avatars, and implausible record
counts. Unknown *performance* ids are a warning (those rows are skipped).

Nothing is partially imported and nothing is silently coerced.
