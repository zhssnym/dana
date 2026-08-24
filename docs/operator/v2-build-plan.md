# The v2 build plan, on one page

For Imran, 2026-08-24. The authorities behind every line: RFC 0005 (the
specification delta), RFC 0004 (the full package plan), `v2-pricing.md` (the
cut list and rulings), the v2 design register (DES-093–225, approved). This
page is the operator's digest — read it to run the build, not to change it.

## The one gate

**RFC 0005's acceptance — yours.** It amends the frozen schema and API
(additively), so the process makes it a human signature. It comes to you
when its last stubbed units are written (see "S0, in progress" below).
After that, no other approval stands between here and release; each package
closes on its own green gates.

## What v2.0 ships (everything in scope)

- **Navigation**: Desk · Today · Scheduled · Assignments · Important · All,
  Done unpinned; the tab strip; the window bar; Library; sidebar drag.
- **Day-level due dates**, due-time deferred; reminders as "remind me at
  HH:MM that day" (the schema already supported it).
- **The role matrix**: owners rename/delete, members leave (confirming, no
  trash row), everything else any-member, arrangement always personal;
  ownership transfer for a departing owner.
- **Six backend systems**: events + history + trash (30 days) +
  notifications · object storage (covers, images, attachments, voice,
  avatars; 1 GB/user) · the page model (blocks, folder identity, shelves) ·
  comments and the folder conversation (likes; poll liveness) · the acts
  (duplicate, workflow import/export, real task and shelf addresses) · the
  person's bundle (theme, density, clock, task-open, pins, saved views,
  arrangements).
- **The full v2 client** replacing the v1 client, screen by screen.
- **Onboarding starter workflows** (rides the import — zero new backend).
- **The September infrastructure**: paid database before **2026-09-12**,
  always-on service, object store, verified backups, dana.so cutover.

**Deliberately out** (deferred by name, not forgotten): tags,
steps-as-objects, check-item notes, shared shelves (Option B), real-time
push, mobile, notification email digests.

## The packages, in running order

| # | What | Who |
| - | - | - |
| S0 | Fold-debt ✅ merged · finalize 0005's section-9 units · **your acceptance** | Claude, then you |
| S1 | Every new acceptance criterion written, red | test persona |
| S2 | The expand migrations + Inbox→Desk rename + settings fold | data persona |
| S3 | Events, notifications, trash, the tick's new duties | api persona |
| S4 | Object storage, files API, quotas, avatar | platform persona |
| S5 | Pages, shelves, duplicate, workflow import, ownership transfer | api persona |
| S6 | Comments, likes, thread permissions | collaboration persona |
| S7 | Preferences, pins, saved views (ids, never names) | query persona |
| S8 | Client foundation: v2 tokens, primitives, animated icons | design-system persona |
| S9 | Shell port: nav, tabs, window bar, sidebar, Trash page | frontend persona |
| S10 | Place pages, filter, saved views, boards, calendar | frontend persona |
| S11 | Row, card, pickers, drag engines, states (one row impl, finally) | interaction persona |
| S12 | Folder page + blocks, shelves, conversation, notifications UI | interaction persona |
| S13 | Public faces (Codex's landing), emails, PWA, starter workflows | frontend persona |
| S14 | Security review → full gates both DB legs + browser → **release 2.0.0** | security, steward, you |
| S-inf | The purchases and cutover — runs on the calendar, not the code | platform + **you** |

Parallelism: S3∥S4 after S2; S5∥S6∥S7 after them; the client arm S8→S13
overlaps the backend arm throughout. Two artifacts gate the client arm: the
`v2-refs/` exports (after Codex lands the landing) before S8, and the
half-day notifications drawing before S12.

## Honest timeline

15 packages; v1's history says some need a fix-round session. **Expect
20–30 working sessions to a live 2.0.0** — a few weeks at the current pace.
The only hard date is S-inf's September 12.

## Whose move, right now

- **Claude**: finish S0's remaining writing (the six section-9 spec
  rewrites — the fold they depend on is merged), then hand you 0005.
- **You**: direct Codex's landing; accept 0005 when it arrives; buy the
  September infrastructure early that month.
- **Codex**: its four-item lane (`codex-handoff.md`), unchanged.
