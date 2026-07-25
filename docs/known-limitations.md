# Known limitations

Honest constraints, by design. The app never fakes around these.

## Offline phones can't sync on their own
Two phones with no signal have no way to talk to each other. Sharing picks, schedules, and check-ins happens by **QR scan or a pasted/loaded code** — a deliberate manual step. A check-in made on one offline phone will not appear on another until you share the code. The app says so rather than pretending otherwise.

## Travel times are approximate
The festival map has no guaranteed pedestrian route network or precise scale. Walking times are **estimates** from map distance × a crowd factor, always labeled “approximate,” and every stage-to-stage pair is adjustable on-site (**Menu → Travel & Crowd**). They are not GPS-accurate directions.

## Positions are planned, not live
Friend markers on the map show where each person **plans** to be based on their schedule — never a live GPS location. Markers are labeled “Planned from schedule.” Manual check-ins are the only real-position input, and they go stale after 20 minutes (adjustable).

## Live GPS sharing is out of scope
Real-time location sharing between phones needs connectivity or a supported peer-to-peer transport and explicit consent. It's intentionally not part of the core offline app. If added later it must require permission, be toggleable, show last-update time, mark stale data, fall back to planned positions, and never run continuous tracking without consent.

## Set times are entered by you
This is an unofficial companion. It has no feed of the official schedule; someone types the set times in when they're released (then shares them). Nothing is invented in production mode — [Demo Mode](../README.md) is the only place you'll see sample times, and it's clearly labeled and kept separate.

## iOS storage eviction
iOS can clear a web app's stored data after long disuse. The app requests persistent storage, but the OS may decline. Mitigation: keep a **backup export** (Menu → Backup & Data). For a festival happening now, this is a non-issue.

## Schedule photo import (OCR)
Not included — the manual editor is faster and can't silently mis-read a stage or time. If added, any recognized result must be human-reviewed before saving.
