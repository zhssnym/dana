# RFC 0004: The v2 build — implementing RFC 0005 and porting the approved design

- **Status:** Draft
- **Created:** 2026-08-24
- **Target release:** 2.0.0, September 2026; the infrastructure package is
  hard-dated (database expiry 2026-09-12)
- **Spec sections touched:** none — every specification change this plan
  implements is RFC 0005's delta; this RFC alters no specified behavior
- **Frozen interfaces touched:** none directly (RFC 0005 carries the 4/7
  amendments this plan builds)

> Numbering note: the refresh plan has called the port "RFC 0004" since it
> was chartered, so this file keeps that number; RFC 0005 carries the
> specification and is **accepted first**. File numbers are identities, not
> order (0003 was claimed in the interim).

## Summary

Build RFC 0005's six backend systems onto the existing single-deployable
server, then replace the client with the approved v2 design
(`docs/design/prototype-v2/`, register approved through DES-225), mirroring
RFC 0002's machinery: criteria first and red, one package per agent session,
persona owners, file boundaries where sessions could collide, and the full
gate on both database legs plus the browser leg before release. The
September hosting move rides inside as a date-anchored package.

## Motivation

The design phase is closed pending V10's recorded verdicts; the pricing
session (`docs/design/v2-pricing.md`) cut the scope and ruled its decisions.
What remains is exactly a work order, and RFC 0002 is the precedent for its
shape — including the lesson its plan carries in its own acceptance column:
every session runs the thing before it writes anything.

## Specification delta

None. This RFC is a work order; RFC 0005 is the contract it builds. (The
template's bootstrap exception generalized: a plan-only RFC has no "before"
to replace because it changes no specified behavior.)

## Compatibility and migration

Omitted — RFC 0005 owns it; this plan's S2 executes it.

## Alternatives considered

- **One combined RFC** (0002's shape) lost to the split: the navigation was
  owed its own accept line, and a contract and a work order are judged by
  different questions — one "is this what Dana should be", one "is this how
  we get there".
- **Port first, backend after** lost: half the approved screens draw
  backend-less features (trash, history, comments, shelves' pages), and a
  port against fixtures-in-production would re-create the prototype's
  name-keyed hazards in shipping code.
- **Big-bang client swap without the S8 foundation package** lost to
  0002's own experience: tokens and primitives land first or every arm
  re-imports its own.

## Open questions

- The v2 reference exports (`v2-refs/`) regenerate after the Codex landing
  pass; S8–S13 compare against them, so the export set must exist before S8
  starts (it gates no backend package).
- ~~The notifications surface drawing~~ — done 2026-08-24 (DES-226, the
  sidebar bell, gated and probed); S12 builds against it and RFC 0005's
  9.12.

## Implementation plan

Never merges. One branch continuing from the current head; sessions run in
order and each is sized for one agent. Owners are the persona files in
`docs/team/`, the authority on ownership; this table repeats their claims
for scheduling. Section 9 is touched, so the design artifacts that must
exist before the UI packages start are named here per the template:
`design-contract.md`'s v2 part (done), `v2-ground-ready.md` (done), the
`v2-refs/` export set (owed, post-Codex-landing), and the notifications
drawing (owed, before S12).

**One package per chat, and the chat ends when the package does.** Added
2026-08-24 at S9, from measurement rather than preference: that session
carried S8, the browser-leg criteria and four parts of S9, and spent 72% of
a session window and about 280 million cached tokens doing it. A session
that runs out of window mid-package is the expensive failure, because the
next one pays to rediscover what the last one knew and the artifacts do not
record reasoning that never got written down.

So: a session takes one row of the table below, finishes it through the
gate, merges it, writes its SESSION-LOG row, and then **tells Imran to open
a new chat rather than starting the next row**. The handoff is the log row
plus the branch, which is what protocol section 2 already says state comes
from; a session that ends cleanly needs no summary of itself, because the
next one reads the repository. Where a row is genuinely large, splitting it
is a judgement the session makes out loud and records, as S9 did in four
commits.
**Every session in this plan runs the app before it writes anything, and
scopes the suite while iterating but runs it whole before reporting** — both
lessons are in the acceptance column because that is where sessions read.

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| S0 | RFC 0002's fold-debt resolved; V10's two SESSION-LOG verdicts recorded; RFC 0005's [STUB] units finalized against the folded baseline; RFC 0005 accepted | V10's hour with Imran | everything | `12-integration-steward.md`, then Imran | Spec and RFC agree; CHANGELOG entries; 0005 status Accepted |
| S1 | The criteria package: every new AC numbered and red, every invalidated v1 criterion rewritten by Replace unit | S0 | S2–S14 | `11-adversarial-test.md` | Criteria exist by number and fail for the right reason; RFC 0005 unit 17 completed by them |
| S2 | The expand migrations: tables 4.13–4.19, the 4.3/4.5 column additions, Inbox→Desk data migration, the settings fold | S1 | S3–S7 | `01-data-and-invariants.md` | Migrator green on both legs; every constraint and index named (AC-001's discipline); no existing column reshaped |
| S3 | System A: events written at the 10.2 chokepoint, notifications fan-out, trash endpoints, the three tick jobs | S2 | S5, S6, S12 | `04-api-and-contract.md` | Chokepoint writes exactly one event per mutation; tick jobs idempotent; criteria green; `02-scheduling-and-time.md` reviews the tick change |
| S4 | System B: the object store behind one interface, files API, quotas, downscale, authenticated serving, avatar upload | S2 | S5, S6, S12 | `10-platform.md` | Quota enforced; no public URLs; provider swap needs no API change; `06-security-and-privacy.md` reviews upload handling |
| S5 | System C+E APIs: folder identity, page blocks (LWW+409), shelves, duplicate endpoints, workflow import under its caps, ownership transfer, task/shelf routes | S2, S3, S4 | S10–S12 | `04-api-and-contract.md` | DES-198's copy rules asserted server-side; import refuses ids/people/dates/states; transfer follows 8.9's order |
| S6 | System D: comments, one reply level, likes, thread reads, notification triggers | S2, S3, S4 | S12 | `03-collaboration-and-permissions.md` | Member-only throughout; author-or-owner delete; the DES-225 matrix's server half enforced and tested for every act |
| S7 | System F: settings expansion, user_views (ids only), arrangements, pins | S2 | S10 | `05-query-and-read-path.md` | The BUG-8 fold leaves one record of visibility; a saved view survives a rename because it stored ids |
| S8 | The client foundation: v2 `tokens.css` (accent 85%, swatches, cobalt 242), the role-not-ramp discipline, primitives, the animated icon module | S0; the `v2-refs/` export set | S9–S13 | `08-component-and-design-system.md` | Tokens byte-match the approved prototype's; no direct lucide import; no raw ramp outside `components/ui/` |
| S9 | The shell port: DES-152 navigation, the tab strip, the window bar, Library, the undo bar, Trash page (the sidebar drag moved to S11, see below) | S8; S3 for trash reads | S10–S13 | `07-frontend-architect.md` | The prototype's sweep assertions re-expressed as tests pass against the real API |
| S10 | The place pages: Today, Scheduled (+calendar), Assignments, Important, All, Done; the shared filter, saved views, grouping, boards | S9, S7 | S14 | `07-frontend-architect.md` | Page spines match section 6's queries; entry defaults per spine (DES-182) |
| S11 | The row, card, pickers, drag engines, the sidebar drag of DES-171, states page; day-level dates and time-of-day reminders in the UI | S8, S9 | S14 | `09-complex-interaction.md` | One task-row implementation total (the DoneRow reunion, 11.15); one drag engine total, the sidebar's arrangement running on the same one as the rows and the boards; reminder picker writes time-of-day mode only; AC-226 authored by `11-adversarial-test.md` alongside |
| S12 | The folder page with blocks and identity, shelves, the conversation surfaces, notifications UI from its drawing | S5, S6, S9; the notifications drawing | S14 | `09-complex-interaction.md` | LWW/409 handled visibly; the DES-225 client half supplies acts by role; poll liveness per D3 |
| S13 | The public faces from the Codex lane's approved output, emails, PWA, onboarding starter workflows (ADD-1) | S9 | S14 | `07-frontend-architect.md` | S5's import serves the starter files; landing carries Imran's S5 pick |
| S14 | Security review of uploads/import/links; the full gate in CI's order on both database legs plus the browser leg; release 2.0.0; the release verdict lines | S10–S13 | none | `06-security-and-privacy.md`, then `12-integration-steward.md`, then Imran | All legs green; the visual review recorded; CHANGELOG and version |
| S-inf | The September move: paid Postgres before **2026-09-12**, always-on service, object-store provisioning, verified-restorable backups, domain cutover | none (parallel; hard-dated) | S14's release | `10-platform.md` with Imran (purchases are his) | The new database restored-from-backup once before cutover; dana.so serves the release |

**The sidebar drag moved from S9 to S11 on 2026-08-24, on Imran's ruling.**
S9 shipped six of its seven items and left DES-171 untouched, and the reason
it could not simply be finished afterwards is a dependency this table had
back to front: the row above assigns "drag engines" to S11, and the sidebar
drag is one of the things that runs on them. DES-171 is written as though the
engine already exists, naming its `onDropAt` seam and the `onOver` half it
gained, but no drag code exists in `app/` and none exists in `prototype-v2`
to port, both searched at the S9 close. So building the sidebar drag on its
own schedule meant writing a second engine for S11 to duplicate or replace,
which is the shape 11.15 tells this port to avoid at the task row and which
is cheaper to prevent than to unpick.

The item moves rather than disappearing, and it takes its criterion with it:
nothing in section 12 asserts drag today, AC-214 reading the page block's
order and the Library heading and stopping there, so S11 owes AC-226 and owes
it from `11-adversarial-test.md` rather than from its own hand. Nothing else
waits on it: S10 never touches the Library block, and S12's shelves read the
same membership label the drag would write.

**Critical path**: S0 → S1 → S2 → S3 → S5 → S12 → S14, with S4 beside S3,
S6/S7 beside S5, and the client arm S8 → S9 → (S10 ∥ S11) → S12 overlapping
the backend arm once S0 lands. S-inf runs from day one against its own
calendar, not the code's.

**File boundaries where sessions could collide.** S2 owns `app/db/**` alone.
S3–S7 own `app/src/server/**` and `app/src/shared/**` by subsystem
directory, one package in the server tree at a time. S8 owns
`app/src/client/components/ui/**` and `styles/**` and no page; S9 the shell
and router; S10 the place pages; S11 the task components; S12 the folder
page, shelves and conversation; S13 the public pages. A session that needs a
file across its line has found an escalation, not a task — 0002's sentence,
still true.

**What is not replaced.** The server's existing endpoints, the 10.2
chokepoint, the auth flow, the reminder scheduler's machinery and the
migration discipline all survive and are extended, never rewritten. The
prototype ships nothing: no fixture, no name-keyed store, no pattern from
`fixtures.ts` arrives in `app/` (11.15's new hazard rows exist because that
sentence needed a place to bite).
