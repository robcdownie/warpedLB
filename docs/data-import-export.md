# Importing & exporting data

Everything moves between phones as **QR codes, short text codes, or files** — never over the internet. The data itself is inside the code, so it works with no signal.

> **Why not automatic sync?** Two phones with no signal can't talk to each other. Rather than fake it, the app moves data with a QR scan or a pasted code. This is a real limitation, stated plainly.

## Share your band picks (each person → the others)

1. **Menu → Friends & Sharing**, make sure “This device is …” is set to you.
2. Tap **Export mine**. You get a **QR** (and a copyable code / downloadable file).
3. Your friend opens **Friends & Sharing → Import a friend**, then either:
   - **Scan** your QR with their camera, or
   - **Paste** the text code you sent them (AirDrop / Messages / etc.), or
   - **Choose a file** (the `.json` you exported, or a screenshot of the QR).
4. They see a **preview** (how many picks are new / updated) before anything saves, then tap **Import now**.
5. Re-importing the same person later just **updates** them — no duplicates. Each friend shows “updated N minutes ago.”

Every import can be **undone** immediately (a snapshot is saved first).

## Share the set times

Once someone types in the official schedule, they can share it with the group:

- **Schedule tab → the up/down arrows** (or **Menu → Schedule Import / Export**).
- **Export**: produces a schedule QR/code/file.
- **Import**: scan/paste/load it on another phone. Preview first, then apply.

## Multi-part QR codes

If an export is too big for one QR (big schedules, full backups), the app splits it into **numbered parts**. The receiver scans each part — order doesn't matter — and the app reassembles them.

## Backups

**Menu → Backup & Data**:

- **Export complete backup** — everyone's data on this device, one code/file.
- **Import complete backup** — restore it (with preview).
- **Export schedule / map coordinates** — individual pieces.

Keep a backup file somewhere (email it to yourself) before the festival as insurance against the OS clearing site data.

## What's in each export

Every code carries a schema version, event id, source user, data type, export timestamp, and a checksum. Importing a damaged or wrong-version code fails with a clear message rather than corrupting your data.
