# Correcting artist data

The lineup is seeded from the official Saturday, Sunday, and Warped Unplugged lists. If a name is wrong or the lineup changes, edit the source and redeploy.

## Where the lists live

- `src/data/artists-saturday.ts` — Saturday main lineup (verbatim names)
- `src/data/artists-sunday.ts` — Sunday main lineup
- `src/data/artists-unplugged.ts` — Warped Unplugged & special appearances

Each is a plain array of display names. IDs are derived automatically from the name, and are stable as long as the name doesn't change.

## Rules the app enforces

- Every main artist appears **once per day**. No duplicate main performances.
- An artist in both the main lineup **and** Unplugged reuses **one** artist record with **two** performances (e.g. Hawthorne Heights). Don't create a second artist.
- A performer only in the Unplugged list becomes a new `unplugged-special` artist.

These are covered by tests: `npm test` (`src/data/seed.test.ts`).

## To add / remove / rename an artist

1. Edit the appropriate list file.
2. Bump `SEED_VERSION` in `src/data/seed.ts` so existing installs pick up the change on next open. (Seeding is idempotent and won't erase anyone's picks or entered set times — but note that **renaming** changes an artist's derived ID, which will orphan existing picks for that artist. Prefer fixing typos before anyone has shared selections.)
3. `npm test` to confirm integrity, then commit & push (auto-deploys).

## Fixing a confirmed day (admin)

Normal users can't move an artist between Saturday and Sunday by accident. A day change is a data correction: edit the list files and redeploy, as above.

## Fuzzy matching on import

When importing selections, slightly-off names are matched automatically (ignoring case, spaces, punctuation, and accents), e.g. `3OH3 → 3OH!3`, `Lolo → LØLØ`, `MXPX → MxPx`. The canonical spelling is always kept.
