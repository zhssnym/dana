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
| S12 | The folder page with blocks and identity, shelves, the conversation surfaces, notifications UI from its drawing | S5, S6, S9; the notifications drawing | S14 | `07-frontend-architect.md` (corrected from 09 at S12's opening; RFC 0005 change control item 12, the persona files being this table's own authority) | LWW/409 handled visibly; the DES-225 client half supplies acts by role; poll liveness per D3 |
| S13 | The public faces from the Codex lane's approved output, emails, PWA, onboarding starter workflows (ADD-1) | S9 | S14 | `07-frontend-architect.md` | S5's import serves the starter files; landing carries Imran's S5 pick |
| S14 | Security review of uploads/import/links; the full gate in CI's order on both database legs plus the browser leg; release 2.0.0; the release verdict lines | S10–S13 | none | `06-security-and-privacy.md`, then `12-integration-steward.md`, then Imran | All legs green; the visual review recorded, **which now waits on S17b by Imran's ruling of 2026-08-25 (item 31): the review happens, and it happens after the parity work, not before**; CHANGELOG and version. The review's first clause is done, 2026-08-25: its record is `docs/security/2026-08-25-s14-uploads-import-links.md` and its dispositions are RFC 0005 change control item 18, which names the release-gating fix package still owed before the gate runs |
| S-inf | The September move: paid Postgres before **2026-09-12**, always-on service, object-store provisioning, verified-restorable backups, domain cutover | none (parallel; hard-dated) | S14's release | `10-platform.md` with Imran (purchases are his) | The new database restored-from-backup once before cutover; dana.so serves the release |

**The plan extends past S14, because S14's release clause did not close (2026-08-25).** Item 19 gates 2.0.0 on the client matching the v2 prototype, item 20 records why it did not, and the rows below are the work that closes that gate. They are numbered after S14 because they were not foreseen, not because they come after the release: **2.0.0 ships after these, not before**. Every one of them takes its source from `docs/design/prototype-v2/` per 11.13 as item 20 amended it, and mobile stays out of all of them under the desktop-first ruling of 2026-08-12 (section 13 item 32).

| # | What | Depends on | Owner | Acceptance |
| - | - | - | - | - |
| S15 | The task surface port: `task-row`, `task-card`, `task-surface`, `task-pickers` from prototype-v2, the v1 row and the surviving task form retired together | S14's fix package | `11-adversarial-test.md` for the criteria rework, then `09-complex-interaction.md` | The two densities of DES-113 exist, DES-093's card expands in place, and no task form remains; the criteria reworked red-first ahead of the port |
| S16 | The three surfaces this table assigned to no package, all client-only against endpoints that already exist: `/privacy` and `/terms` from `public-legal-screen.tsx` (DES-032), the Settings pin list from `settings-screen.tsx` (DES-170, DES-222, the 4.19 server side already built), and the help sheet from `help-sheet.tsx` into the account menu | S9 | `11-adversarial-test.md`, then `07-frontend-architect.md` | The two legal routes render their pages rather than the client's not-found; the pin list writes 9.7's list; the help sheet opens from the account menu |
| S17a | The shared surfaces every page shows, which is why they come first: the v2 page-head across the six place pages (DES-149's F3 rework), `folder-mark` as one resolver so a folder's chosen glyph and colour travel into the sidebar, the task rows and the tab menu (DES-130), `person-face`'s deterministic per-person tint, `task-section`'s collapsing sections with their marks and counts, and the `object-menu` contract of DES-201 so a folder's menu is one menu wherever it is drawn. Retires the dead `components/page-bar.tsx` and its two `foundation.test.ts` exemption lines with it | S15 | `07-frontend-architect.md`, criteria from `11-adversarial-test.md` | Each surface matches `prototype-v2`; folder identity resolves through one module rather than per surface |
| S17b | The per-screen remainder: the search overlay reading 7.18's four kinds and DES-203's pre-typed places, the folder page's board and view strip with DES-132's two columns, `right-edge` taking room instead of covering (DES-154, DES-186), shelf reachability, DES-209's sidebar footer including Import, Trash's per-row countdown and deleter, and the completed foot on Important and Scheduled. **Plus the rest of 9.7 that S16's scope excluded** (item 30): the **Appearance** section entire, theme, row density, clock and where a task opens, whose four fields the 4.19 bundle has stored since S7 with no control anywhere, and the Account section's storage-used-against-quota line. **Shelf reachability starts at the data path, not the controls** (audit addendum): `app-shell.tsx` fetches `useShelves` and never passes a `shelves` prop to `AppSidebar`, so the Library cannot draw shelves at all and the heading and New-shelf control are symptoms of that | S17a | `07-frontend-architect.md` and `09-complex-interaction.md` by surface | Each defect in the audit closed against `prototype-v2`, or carried with a numbered section's exemption named per 11.13 |
| S18 | The two frozen section 7 widenings item 19 approved: `section_block_id` and `created_by`, both on TaskCard per **RFC 0005 unit 12a** | **Unblocked**: the Replace unit was written 2026-08-25 and is the only unit touching frozen section 7 | `04-api-and-contract.md`, criteria first from `11-adversarial-test.md` | `shared/tasks.test.ts` and every TaskCard key-set criterion read and reworked red **before** the implementation; task-section placement (`task-section.tsx`) and Assignments' "from" half become buildable, which is why this is parity work and not only API work |
| S19 | The transactional email surfaces and the auth refusal page, section 13 item 34's four orphans, from `transactional-email-screen.tsx`. **Larger than a re-skin**: `RenderedEmail` is `{subject, text}` with no html part, and the invite and share-grant templates cannot name anybody, `templates.ts:83` saying "Someone has invited you to share a list on Dana" because the 7.5 and 7.4 call sites pass no payload. So the row is a payload widening on `OutboundMessage` and its two call sites, plus a second rendered part, plus the styling | **Unblocked, 2026-08-25**: the 10.7 conflict was resolved by item 26, which permits HTML with a required text/plain alternative, and **DES-034 is now closed** by Imran's ruling at change control **item 32**, which carries the four subjects, bodies, context lines and action destinations, splits `invite` into `invite_folder` and `invite_connection`, and rules the orientation footer onto the two invitations only. Item 34 still wants a recorded reading of 11.4 on the tokens import | `11-adversarial-test.md`, then `10-platform.md`, then `03-collaboration-and-permissions.md`, then `06-security-and-privacy.md` (corrected from 07 at S19's opening; RFC 0005 change control item 34, the persona files being this table's own authority: role 07 owns no file this package edits, and the call sites are role 03's by its own Owns section) | Each email carries both parts, the text one saying the same thing with the same single link; the invite and share-grant emails name the inviter and the folder. Read item 32 for the ruled copy rather than composing any of it; the invite template splits, so 11.8's template list grows by one and the 11.10 sink can tell the two invitations apart |
| S-fold | ~~The section 9 fold~~ **Done 2026-08-25** (change control item 28): the eleven units are written into `docs/spec/09-ui.md`, 9.1 and 9.3 to 9.7 and 9.9 replaced, 9.10 Shelves, 9.11 Trash, 9.12 Notifications and 9.13 First run inserted. Item 16's sweep needed nothing further there, both surviving "My Day" strings being historical by design | none | `12-integration-steward.md` | **Met.** Sessions from S16 on read a v2 section 9. The fold was done mechanically, block by fence and splice by heading, and it found 9.12's unit unterminated in RFC 0005 |

**The defect list these rows close is `docs/parity/2026-08-25-prototype-v2-parity-audit.md`**, ratified there on 2026-08-25 and pointed at from here deliberately, this table being one of protocol section 2's state sources where the audit file is not. It measures 31 surfaces: 14 PORTED, 12 PARTIAL, 5 V1-ERA or MISSING. **The ported majority is real and the gap is concentrated**, which is what makes S15 to S17b a checklist rather than a rewrite. Its "five gaps that most change what a person sees on first open" is the order to work in if these rows are ever cut short.

**S16 carries a live production defect and should not be read as cosmetic.** `LandingPage.tsx` links to `/privacy` and `/terms` from the footer of the landing page that dana.so serves today, and the client router defines neither route. Verified against production on 2026-08-25: both paths answer **200 rather than 404**, because the SPA fallback serves `index.html` and the client then renders its not-found page, so anything testing for a 404 will report these as healthy. Google's OAuth consent configuration and the account-deletion policy text of 8.10 both depend on those destinations existing, which is why this sits above the fidelity work rather than inside it.

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

The criterion it owes is **AC-227 and not AC-226**, corrected at S12's
opening: `s13-public` had already spent AC-226 on the starter workflows and
was unmerged where this close could not see it. RFC 0005 change control item
13 carries the ruling.

**S13 ran ahead of S10 to S12 and closes with S12 (Imran, 2026-08-24).** It
depends on S9 alone, so it was built as soon as that merged rather than waiting
for its row's turn, and the whole of it is written: the 9.2 amendment, the
landing, section 9.13 and AC-226. Three things were left open and the owner
ruled they close with S12 rather than in a fix round of their own. The Postgres
leg and CI's verdict, because the machine's test credentials are not readable
without elevation and no session should escalate to pass its own gate. The
merge, which follows that verdict. And 9.13's deletion paragraph, which is
stored on every starter's page and asserted by AC-226 over section 7 but drawn
by nothing, because 9.6's block rendering is S12's. The grouping is the natural
one: S12 lands the surface that paragraph is waiting for, so both packages
become visible in the same act and one gate run covers them together.
S13's acceptance cell above is also superseded in one clause, its S5 headline
pick having been overtaken by the Codex lane's redesign; change control item 10
records that.

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


## The prototype lift: S20 to S30, added 2026-08-26 on the owner's ruling (RFC 0005 change control item 37)

**The ruling.** Imran reviewed the deploy at dana.so serving `4dbe6fb`, the
tree carrying every parity row S15 to S17b closed, and ruled on 2026-08-26:
Dana 2.0 is the exact `prototype-v2`, the front end, the interactions, the
rules, and almost everything, not a client that resembles it. His own words
at the review: it is not one thing, it is the drag of tasks and sidebar
items, the tab strip, the animated mark, the dark mode, the task row, a
shelf's page, the thread inside a task, and decisions in the tens and
hundreds that the prototype records and the client does not carry.

**Why the patch strategy is superseded rather than extended.** It has now
missed the same target twice with a recorded mechanism both times. Change
control item 20 found the first: no artifact ever named `prototype-v2/`, so
S8 to S13 built the client from the v1 prototype while reading the rulebook
correctly, and S14's checkpoint showed the owner a client that was never
being built from his design. The parity audit and S15 to S17b then closed
what that audit measured, and the audit measured 31 surfaces for appearance
and structure, so the second checkpoint showed him surfaces that match and
behaviour that does not: a surface audit marks a task card ported without
ever noticing that the prototype's card carries a comment thread. 11.13's
own sentence is the deeper mechanism, a design decision reaches Dana only by
being read into a numbered section, so every prototype decision that never
reached a section was never handed to any session and was never going to be
built. Patching fixes what the last instrument measured. The target is the
prototype itself, so the instrument must be the prototype itself.

**The strategy: lift, do not re-derive.** `app/src/client` is replaced by
`prototype-v2`'s own code, surface by surface, bound to the existing API
through an adapter seam. Measured before this was written rather than
assumed: the prototype's coupling to its fixtures is concentrated, not
spread. Its components import a small set of named lib modules,
`task-writer`, `folder-library`, `people-library`, `task-acts`, and navigate
by query parameters; the markup, classes, pickers, drags and animations
touch no data directly. So the seam is those modules rewritten over the
query layer, plus one navigation adapter mapping the prototype's parameter
navigation onto 9.1's router paths, and the component files themselves cross
verbatim. **The lift discipline, binding on every session in this table: a
lifted file diffs empty against its prototype original except at named
seams, and every seam carries a comment saying which adapter it crosses and
why.** A session that finds itself rewriting a component's body has left the
strategy and found an escalation.

**What survives, because it was never the problem.** The server whole:
sections 4 and 7 frozen and untouched, the 10.2 chokepoint, auth, the
scheduler, the notify module, the migrations. And the client's plumbing
ring: the API client and query layer under `api/`, the auth glue, the
service worker and manifest, observability, and the route table's paths,
which are 9.1's rather than the v1 client's. What retires is what was built
from the wrong source: the shell, the pages, the task components, and every
part whose shape came from the v1 prototype.

**One sentence of this RFC is amended by this section.** The close below
reads "The prototype ships nothing: no fixture, no name-keyed store, no
pattern from `fixtures.ts` arrives in `app/`". Its fixture half stands
unchanged and is restated here: no fixture data, no name-keyed store, and
nothing of `fixtures.ts` crosses. Its code half is superseded by item 20's
own ruling, made before this one: the directory it guarded against is the
named source the client is built from, and from this section on it is built
from it literally.

**Conflicts between the prototype and a numbered section are batched, not
scattered.** 11.13 stands: the section wins until amended, and amending it
is the resolution, the shape item 26 gave 10.7 and item 32 gave the emails.
S20's ledger collects every such conflict into one rulings sheet for one
sitting with Imran, whose standing direction this section records: sections
amend toward the prototype, except frozen sections 4 and 7, which are ruled
one by one and never assumed. No session argues a conflict inline.

**Criteria are the expensive half and are priced in, not discovered.** The
browser leg holds about 223 cases asserting the current client. S20 triages
every one into three piles: asserts the spec and survives the lift, asserts
a v1-derived shape and is reworked red first by persona 11 in the package
that lifts its surface, or asserts a retired surface and is retired with it.
Nothing is weakened silently, item 8's discipline, and acceptance numbers
are read from section 12 and `app/tests/` at each session's opening and
merge, the check items 13 and 25 exist for. Next free at this writing:
AC-265, SESSION-LOG row 34.

**Continuous acceptance is the checkpoint fix.** Render deploys `v2-build`
directly during this arm, so every merged package is reviewable at dana.so
the same day, and the owner reviews surfaces as they land rather than
meeting the whole at a third checkpoint. The release act at S30 points
Render back at `main`.

**The owner's own list from the 2026-08-26 review, carried here so no item
of it is lost to a ledger.** S20 must account for each by name: the v2 task
row and its two shapes (DES-113), the thread inside a task, a shelf's page,
the tab strip's fidelity, task drag and sidebar drag as the prototype does
them, the animated mark, dark mode quality, and pixel fidelity throughout.
Row 33's residue joins them: Assignments' from half and the created-by
filter axis, both unblocked by S18, and the conversation's attachments.

**Two axes the ledger carries rather than discovers, added 2026-08-26 as RFC
0005 change control item 39, on Imran's ruling at S20's opening**: the
overflow list of every element and the view types of every element are
`prototype-v2`'s exactly. Both are declared contracts in the prototype —
`lib/object-acts.ts` and `components/view-strip.tsx` with each surface's
option set — and both already disagree with the client in four measured
ways the item names, one of them a reasoned departure the ruling overrides.
So they are columns of the ledger, not findings it might reach.

**S20 is done, and two of its outputs bind the rows below it.** The ledger at
`docs/parity/2026-08-26-prototype-v2-behavioural-ledger.md` is the list every
session from S21 on lifts against, and its last column names the row that
owes each entry. The rulings sheet at
`docs/parity/2026-08-26-lift-rulings-sheet.md` is **one sitting with Imran
that has not happened yet**, and until it does, S21 cannot close its dark
theme, S23 cannot close its menu labels or its list drag, and S26 cannot
close the folder board's columns, the conversation's attachments or the
image block. The sheet's own last section names them. Nothing in the table
below is blocked from *starting* by that sitting; what is blocked is
closing.

| # | What | Depends on | Owner | Acceptance |
| - | - | - | - | - |
| S20 | The behavioural ledger and the criteria triage. Walk every `prototype-v2` screen and component and enumerate every capability, interaction and decision each implies; three verdict columns per entry: in the client, in a numbered section, asserted by a criterion. Absorb the owner's named list and row 33's residue. Produce the batched rulings sheet for the unspecified and the conflicting. Persona 11 triages the browser criteria into survives, rework, retire, per surface. **Done 2026-08-26, ratified at RFC 0005 change control item 40**, and its three files are `docs/parity/2026-08-26-prototype-v2-behavioural-ledger.md` (260 entries), `docs/parity/2026-08-26-lift-rulings-sheet.md` (16 questions plus one batched block of 52) and `docs/parity/2026-08-26-browser-criteria-triage.md` (223 cases: 203 survive, 19 rework, 1 retires). Every session from S21 on opens with the ledger | none | `07-frontend-architect.md` for the ledger, `11-adversarial-test.md` for the triage, `12-integration-steward.md` ratifies into `docs/parity/` | Every prototype screen and component appears by name; every unspecified decision is on the rulings sheet; the owner's list is accounted for item by item; the triage covers every browser case; every element with an overflow menu carries its acts in order and every element offering views carries them, item 39 |
| S21 | The foundation lift: tokens and the dark theme reconciled against `prototype-v2`'s values in the 11.4 file, the animated `dana-mark`, the motion constants, the ui primitives diff, `row-density`, `folder-mark`, `person-face`, `icon-action` | S20 | `08-component-and-design-system.md`, criteria from `11-adversarial-test.md` where the triage moved any | Dark mode matches the prototype on every lifted surface; the mark animates; the token diff against the prototype is vocabulary only, the 11.13 standard |
| S22 | The adapter seam: `task-writer` over the mutation layer, `folder-library`, `people-library`, `task-acts`, the navigation adapter from parameter navigation onto 9.1's paths, and the mapping between the prototype's task shape and the shared `TaskCard`. Proof: one prototype screen runs end to end on real data with its component file unmodified | S21 | `07-frontend-architect.md` | The proof screen's lifted files diff empty against the prototype except imports; every adapter carries the seam comment |
| S22a | **The ruled schema, added 2026-08-26 at RFC 0005 change control item 44.** One migration and the endpoints it needs, carrying the four frozen changes item 44 ruled and nothing else: a position on `tasks` as a fractional index with the endpoint that writes it (B4); a per-viewer cover table for the place pages, which have no row to hang one on where `folders` and `shelves` already carry `cover_file_id` (B1); a width on `page_blocks` (B7); and 7.16's workflow file widened to the folder's page blocks and each task's title, notes, star, repeat, reminder and steps, excluding due dates, people and chats (B3). **Lettered rather than renumbered so every S-row reference in the ledger, the triage and the session log keeps its meaning**; it is a package of its own and not a half of S22. **It exists because none of the four may ride a lift package**, whose discipline is that a lifted file diffs empty against its original. Section 6's eleven query orders are untouched but one: only a folder's unscheduled list reads the new column | S22 | `01-data-and-invariants.md` for the migration, `04-api-and-contract.md` for 7.16 and the order endpoint, criteria first from `11-adversarial-test.md` | The migration applies forward in one transaction with every constraint and index named; the frozen 4 and 7 amendments are written before the code, item 37's rule; no lift package is blocked on it afterwards |
| S23 | The task surface lift: `task-row`, `task-card`, `task-surface`, `task-pickers`, `task-board`, `task-section`, verbatim, task drag riding the code; the current row and card retire in the same act. **Item 44 adds four rulings to this row and no new package**: the drag persists in a folder with no filter or sort applied and springs back everywhere else (B4); holding two or more tasks together makes a folder, which needs no new endpoint, `POST /folders` and `PATCH /tasks/:id` already carrying it; selection and the bulk bar are client state over endpoints that exist; a step promotes to a task and a task never demotes (B9); and the surface's modes are 9.3's three plus DES-093's inline expansion, which is not a fourth (C1) | S22a | `09-complex-interaction.md`, criteria first from `11-adversarial-test.md` | DES-113's two row shapes; the card carries its thread mount; the triage's rework pile for this surface is red first, then green |
| S24 | The shell lift: `app-shell`, the sidebar with DES-171's drag, the tab strip, the window bar, the Library and groups, the undo bar, `right-edge` | S22 | `07-frontend-architect.md`, criteria from `11-adversarial-test.md` | The tab strip and drags behave as the prototype's do; the shell criteria rework pile closes |
| S25 | The places lift: Desk, Today, Scheduled with the calendar, Assignments including its from half, Important, All, Done, Anytime, Abandoned; `page-head`, the filter, saved views, the boards. **Item 44**: each place page carries a cover with the prototype's treatment, reposition and removal included, on the table S22a lands, and its defaults are generic and non-personal by the owner's own words (B1) | S22a, S23, S24 | `07-frontend-architect.md`, the calendar under `09-complex-interaction.md`, criteria from `11-adversarial-test.md` | Each page against its prototype screen; the created-by axis lands |
| S26 | The folder page and the conversation lift: blocks and the page editor, covers and images, the sharing panel, the history sheet, comments including the thread inside a task and its attachments, the notifications bell. **Item 44 adds five rulings to this row and no new package**: the folder board's columns are the page's sections by default and the filter changes the grouping, the date board surviving as one of its axes (B2); covers offer all four tiers, gradients, marks drawn from Dana's ribbon, a stock library and upload, with Unsplash recommended and its network tier declared uncacheable against 10.6 (B8); an image takes a dragged width on the column S22a lands, plus the aspect-ratio reservation and paste (B7); an upload downscales on the way in, the numbers going to 10.3 (B11); and a duplicate's tasks are assigned to whoever made the copy, checked against `domain/` rather than assumed (B10). Voice notes are deferred by that item and the files half alone is built | S22a, S23, S24 | `07-frontend-architect.md` and `09-complex-interaction.md` by surface, criteria from `11-adversarial-test.md` | The thread mounts on a task; the folder page against its prototype screen |
| S27 | The remainder lift: the shelf page, the search overlay, Settings including Appearance, the Trash page, onboarding touches. **Item 43**: Appearance gains the pre-paint theme mirror, and 9.7 gains the sentence that makes it real. **Item 44**: the Import control reads the widened 7.16 file S22a lands. **The shelf clause is struck at S20's ratification (RFC 0005 change control item 40)**: this row used to read "the shelf page including whatever S20's rulings decide a shelf's page is", and the ledger's answer is that nothing further is owed, 9.10 and the prototype agreeing line for line with the client built to both | S24, S25 | `07-frontend-architect.md` and `09-complex-interaction.md` by surface, criteria from `11-adversarial-test.md` | Each against its prototype screen, or carried with a numbered exemption per 11.13 |
| S28 | Change control item 36 enacted, with the owner's folder-deletion prompts of 2026-08-26, whose rules and their mapping onto 5.3, 8.8 and 8.9 are RFC 0005 change control item 38: the frozen 7.13 address as a Replace unit by role 04 through the Steward before any code, the transaction by role 03, the purge's own object collection called by role 10, the Trash control and the owner's leave-or-delete dialog by role 07, criteria first from role 11; the shared-folder permission question item 36 left open is answered at item 38, permanent deletion of a shared folder being the owner's | S27; the rulings sitting | `11-adversarial-test.md`, then `04-api-and-contract.md`, `03-collaboration-and-permissions.md`, `10-platform.md`, `07-frontend-architect.md` in sequence | Item 36's requirement holds: the endpoint calls the purge's collection; AC-262's last arm moves in the amendment's own commit, red first |
| S29 | The spec fold to v2: `01-scope.md` rewritten whole, the v1-name debt audited across all thirteen sections, 8.8's "nothing is recoverable" contradiction first, **RFC 0005's six section 12 Replace units, which were accepted and never folded so that section 12 and `app/tests/` disagree in writing today (AC-005, AC-014, AC-025, AC-042, AC-066, AC-093, AC-094; added at S20, change control item 40)**, the glossary last | S20; runs parallel to S21 onward | `12-integration-steward.md` | No section states a v1 behaviour v2 retired; frozen 4 and 7 annotated rather than rewritten |
| S30 | The close: a fresh walkthrough against S20's ledger, item 31's visual review by Imran against the running dana.so, release 2.0.0: version, CHANGELOG, merge to `main`, Render pointed back at `main`, the 11.11 smoke subset | everything above | `12-integration-steward.md`, then Imran | The ledger reads closed or exempted on every line; the review is his; dana.so serves the release from `main` |

**Critical path**: S20, then S21, then S22, then **S22a**, then S23 and S24 in
either order, then S25 and S26, then S27, then S28, then S30. S29 runs beside
anything after S20. **S22a is the only row item 44 added**, and it is one row
rather than several on purpose: every other ruling folds into a package that
was already going to open that file, so the sitting of 2026-08-26 cost the
plan one package and no re-sequencing.

S-inf is unchanged and hard-dated: the purchases on
2026-09-10 or 2026-09-11, before the database expiry of 2026-09-12, and the
always-on instance is worth buying early because the spin-down is visible to
every reviewer of this arm's continuous deploys.

**One package per chat, unchanged.** Each session opens with the protocol,
its persona files, this table's row, and S20's ledger once it exists. The
machine notes live in CLAUDE.md and bind every session here: worktrees at
dot-free paths, one browser leg at a time on an owned port, numbers read at
opening and merge, and no push to `v2-build` while another session's run is
in flight, the clearance distinction row 33 records.
