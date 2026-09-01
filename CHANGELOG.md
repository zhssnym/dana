# Changelog

Notable changes to Dana, per release. Curated for humans: not every commit appears
here, only things worth knowing about. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

Nothing yet.

## [2.2.0] - 2026-08-31

Profile pictures, folder cover photos, and the polish round that reorganised the
sidebar and the open task.

### Added

- **Profile pictures, on by default.** A Google account's picture is used unless
  the person removes it, and there is now a Remove control for that. The pictures
  had in fact been failing for months: the Content Security Policy refused every
  one of them silently, which looked identical to nobody having set one.
- **Cover photos for folders, searched from Openverse.** The search is proxied
  through this origin rather than called from the browser, so the content policy
  does not have to widen to a third-party image host.
- **Import from the plus menu**, alongside the other ways of creating things.

### Changed

- **The sidebar gives its room to the Library.** One "+" on the heading instead
  of several, a folder count at the row's edge, and a collapsed rail that shows
  what is currently open rather than everything.
- **The open task is reorganised.** Capture moved to the foot, the title is
  draggable, the share link left the footer for the three-dot menu, and the
  provenance chip sits in the footer.
- **The folder page has a real tab strip**, its chrome moved into the bar, and
  Settings found its centre. The Install section left Settings.
- **Dark mode was passed over end to end**, including a white that knows which
  theme it is in.

### Fixed

- The task title stayed editable while the list was choosing rows.
- The workflow file the product writes is now the one the import reads. They had
  drifted apart.

## [2.1.0] - 2026-08-30

The UI polish round and the sample workspace. Ten adversarial "first-time
user" sessions drove every component of the running app and wrote what did
not feel right (`docs/ux/2026-08-30-adversarial/`); three fixer sessions
took the findings, one area each, and a merge sitting reconciled them.
Nothing was redesigned; what was duplicated, hidden or clunky was tidied.

### Added
- A sample workspace on every new account: three shelves (Life, Studies,
  Work), seven folders, forty-three tasks showing steps, dates, repeats,
  reminders, sections, conversations and a thread inside a task; removable
  in two clicks from the strip on Desk or from Settings, restorable from
  there too (`GET/POST/DELETE /api/v1/sample`, RFC 0005 item 60).
- A phone shell: a top bar with a menu that opens the sidebar as a drawer,
  search and the bell reachable, the task surface filling the width.
- A "More" row in the sidebar reaching Done, Anytime and Abandoned; Trash,
  People and Settings as plain rows in the foot.
- The row menu offers Add to Today; the card's menu carries Delete, Abandon
  and History like the row's; the due picker has a time.
- Notifications for comments on a task you created or are assigned to, in
  sentences, landing on the open thread.
- A task opened "in a tab" is now the editor rather than a read-only page.
- Calendar drag reschedules; a section deletes with undo; folder history
  reads as sentences; the import toasts its folder count.

### Changed
- One word, "shelf", everywhere a folder group or label used to be named.
- Settings offered once; one rule for opening a page from the sidebar or the
  tab strip's "+", which never opens a duplicate; the active tab is lifted.
- The list/board/calendar switch and the page tools rest visible instead of
  appearing on hover; star and "..." are visible at rest on touch.
- "Add a step" opens an empty field saved on Enter; a step renames in place.
- Bulk delete says it moves tasks to Trash, and its undo restores all of them.
- Quick-add carries its title into the full form; new tasks land at the foot.
- "Move to shelf" lists your shelves; the phantom "someone else changed this
  block" toast on shelf pages is gone; a saved view lives in the filter panel
  rather than the Library; a done task is drawn once on a board.
- Dev only: `POST /auth/dev-login` reads its identity from the query string.

Acceptance criteria AC-297 to AC-357; SESSION-LOG rows 51 to 54.

## [2.0.0] - 2026-08-30

Dana 2.0 is the v2 prototype, lifted rather than re-derived. Imran ruled on
2026-08-26 that 2.0 is the exact `prototype-v2`, and RFC 0004's second arm
(S20 to S30) replaced `app/src/client` with the prototype's own component
files, verbatim except at named adapter seams, bound to the unchanged API.
Released under his full delegation: every ruling from S23a onward, the
rulings sitting included, is recorded in RFC 0005's change control (items 41
to 59) and none was taken quietly. The behavioural ledger the arm was built
against, `docs/parity/2026-08-26-prototype-v2-behavioural-ledger.md`, reads
251 closed and 9 exempted with their reasons, the last line (L-253, pixel
fidelity) judged by delegation against the running app rather than by the
owner's eye, which is the one thing the delegation could not supply. That
walkthrough found two things no criterion had, both fixed here: every folder
page's rows said "Desk", and a missing folder's address toasted "Nothing was
saved" beside its not-found state (item 59).

**The release gate, run locally on 2026-08-30 as the verdict.** The
repository moved and no CI runner is registered against its new home, so
S30 ran 11.11's seven steps in CI's order from a dot-free worktree: lint and
typecheck green; the PGlite leg 271 files, 1852 tests; the Postgres 18 leg
on the builtin C.UTF-8 `dana_test`; the build; and the browser leg on a port
of its own. The numbers per leg, what the gate found and what was fixed are
SESSION-LOG row 50. The 11.11 production smoke subset after the deploy is
health (`GET /api/health`), one Google sign-in round trip, and one CRUD
cycle: a task created on Desk, edited, completed and deleted to Trash, with
the undo bar seen once. Render is to be pointed back at `main` after the
merge, this arm having deployed `v2-build` directly.

**What a person sees that 1.0 did not.** The whole front end is the
prototype's: its tokens and its dark theme value for value (S21); the
animated mark; the task row in DES-113's two shapes and the task card with
its chip strip, its steps written to the wire, its thread and its
attachments, and no task form at all (S23, S26, the loose ends); a drag that
persists a hand order in a folder with no filter or sort and springs back
everywhere else, a hold that makes a folder of two or more tasks, and a
selection bar that completes, stars, pulls, moves, duplicates or deletes what
was held (S23a, S28b, the loose ends); the shell with the sidebar's drag, the
tab strip, the window bar, the Library and the undo bar (S24); every place
page with its cover, its filter, its saved views and its board, Assignments
with its from half and the created-by axis, Done with a board and the folder
board with a Done column (S25, the loose ends); the folder page with blocks,
covers on all four tiers, images with a dragged width, the sharing panel, the
history sheet and the conversation with files (S26); the shelf page, the
search overlay, Settings with Appearance's pre-paint theme mirror, and the
Trash page (S27); and permanent deletion from Trash, with the owner's
leave-or-delete question on a shared folder (S28a, S28b).

**What the server gained for it, all additive to the frozen contract.** A
fractional `position` on tasks with 7.6's order endpoint, a per-viewer cover
table for the place pages, a width on page blocks, and the 7.16 workflow file
widened to blocks and each task's title, notes, star, repeat, reminder and
steps (S22a); `DELETE /trash/tasks/:id` and `DELETE /trash/folders/:id`, the
purge's own collection called by both the tick and the endpoint, which also
found and closed a task purge that left its conversation's files as
unreachable rows (S28a); `POST /tasks/:id/duplicate` given 9.6's date rule;
step promotion at `POST /tasks/:id/steps/:stepId/promote`; `shifted_days` on
a folder duplicate; and `cover_preset` with `cover_focal_y` on folders by
migration 0006. The specification was folded whole to v2 (S29, S29a): no
section states a v1 behaviour v2 retired, and sections 4 and 7 carry only
the accepted units' text. Acceptance criteria run AC-001 to AC-296.

**Everything below this line shipped on `v2-build` before the lift**, S0 to
S14, and is part of this release.

Dana v2 is the whole of RFC 0005's specification delta, built by sessions S0
to S14. The frozen core contract of sections 4 and 7 did not move: every wire
change is additive, and a v1 account opens v2 with nothing migrated by hand.
The major version is for the product rather than the API: the surfaces were
redrawn around DES-152's places, and bookmarks to the retired paths redirect
rather than 404.

**Every page is now a place, and every place is the same object (S9, S10).**
Desk is `/app` and is where undated, unfiled capture lands; Today, Scheduled,
Assignments, Important, All, Done, Anytime and Abandoned are each one view
with a spine it locks, defaults for its other axes, and a mode. Pages open as
tabs in a strip you can reorder by pointer, the window bar carries the active
object's menu and the filter whose readout is chips, and a board mode stands
beside the list where the page's question makes columns sensible. A filter
arrangement worth keeping can be saved as a view of its own; it opens at its
page's address carrying its id, and appears pinned in the sidebar's page
block at once.

**The task form is becoming the task card (S11).** The card carries 9.3's
header strip: due date, folder, assignee, reminder and repeat as chips, each
opening a picker in place, each committing as it is answered. The due picker
offers days and no clock; the reminder picker offers the time on the day. One
drag engine serves the sidebar's folder groups, the tab strip and the board's
columns, so a card dropped in a column writes the column's value through the
same mutation a quick-add there would use. The v1 fields sat under the strip
until S23 lifted the prototype's card whole and retired them with the Save
control, item 15's package done.

**Things that happened are now things Dana can say (S3, S6).** Mutations
record activity events, a folder and any object can answer "what happened
here", and the bell's rows are fanned out in the same transaction as the act
they report. Comments arrived as one-level threads on a task with likes and
up to ten attachments each; deleting is the author's, and the thread lives
with the folder's visibility, never wider. Trash holds deleted folders and
tasks for 30 days with restore, and the purge is the scheduler's duty rather
than anybody's chore.

**Files arrived, and they are as private as their folder (S4).** Uploads to
25 MB per file and 1 GB per account: images for pages and comments, covers,
avatars, voice notes. Images are re-encoded and downscaled on the way in, so
a file that claims to be a picture either is one or is refused; serving is
authenticated, per-folder, and carries nosniff with kind file confined to an
attachment. There are no public URLs.

**A folder can carry writing, and workflows can be imported (S5, S7).** Page
blocks, sections and paragraphs, on folders and shelves; a workflow file
carries structure and titles only, never ids, people, dates or states, capped
at 50 folders, 500 blocks and 1000 tasks per file.

**The release was gated by a security review, and the review is a record
(S14, 2026-08-25).** `docs/security/2026-08-25-s14-uploads-import-links.md`
records what was examined and found clean, uploads, import, links, the
chokepoint, the logging boundary, and its seven findings were each ruled in
RFC 0005 change control item 18, the release-gating ones fixed in this
release and pinned by AC-230 to AC-239: account deletion now destroys the
account's uploads and its avatar with the rows (8.10 step 6a); the Trash
purge removes the stored objects its cascades orphan; every response carries
section 10.8's security headers; the import caps became reachable when the
JSON body ceiling rose to 3 MB, and the task array gained its cap; the boot
guard requires the Google trio in production, where the development login
does not exist; and a signed-out visit to any `/app` route lands on the
landing rather than a shell full of refusals.

**A folder is a page now, and so is a shelf (S12, 2026-08-25).** The folder
screen was a list with a header; it is now a page in the full sense. It can
wear a cover and a mark, its icon and colour belong to the folder rather than
to each member, so everybody sees the same thing, and it carries a
description and a body of writing: sections, paragraphs and pictures, added
from a quiet line that appears between blocks when you reach for it. The
conversation lives either at the foot of the page or in a side panel, and you
switch between the two from the surface itself.

**A shelf gained a page of its own.** A shelf used to be a label on a group of
folders in the sidebar. It is now the folder page one level up: the same
cover, mark, name, description and blocks, with the folders themselves sitting
among the writing as rows you can put where you like. Which folders are on a
shelf is still the membership's fact, so one moved away disappears from the
page whatever the layout says. Pressing a folder row opens it as its own tab
beside the shelf's, because a shelf is where a piece of work is laid out and
you generally want both.

**The bell arrived.** The sidebar header carries a notifications bell beside
Search, with an unread count that a screen reader announces rather than only
draws. Each row is one sentence saying who did what to which thing, and
pressing it marks that row read and takes you to the thing. Nothing is deleted
by hand; rows age out on their own. "Mark all read" is the only other control.

**What each role may do is now what each role is offered.** A folder's menu
shows a member Leave and an owner Rename and Delete, and a member is no longer
shown a title they cannot edit. Deleting a folder no longer asks: it moves to
Trash for everyone with the undo bar as the way back. An owner who wants to
leave a shared folder is offered the ownership transfer that 5.3 requires
first, defaulting to the longest-standing member.

**The landing page is the Codex lane's, and section 9.2 stopped carrying its
copy (S13, 2026-08-24).** The public page at `/` is now the ten-section design
the owner directed, replacing the two-column composition that shipped at P8.
The specification changed with it, on his ruling: 9.2 used to fix seven
marketing strings in a table, and now fixes the rules that copy is written
under while the design record holds the sentences. One rule is new rather than
moved, and it is the point of the exercise: **the landing may claim no
capability Dana does not ship.** The standing no-AI-claim rule is that rule's
instance for the one capability anybody was tempted to claim, and AC-159
asserts it unchanged.

Two things the design draws are deliberately not shipped. The second "Continue
with Google" in the closing block is gone, 9.2 admitting one and AC-159
counting the page; the header is sticky in exchange, so the single path stays
reachable from the foot of a long page. The copyright year is computed rather
than typed.

**New accounts are offered a worked example (S13, 2026-08-24).** A person whose
account holds no folder but Desk and no task is offered three starter
workflows on Desk: a trip, a small team, and something to learn. Choosing one
posts an ordinary 7.16 workflow file, so it creates nothing a person could not
have created themselves and costs no new backend. Each arrives with a folder
page that says, in its first paragraph, that the example is theirs to change or
delete.

No starter carries a comment or a reminder. The owner ruled both out, and the
workflow file format already had no key for either: a fabricated comment would
attribute words to somebody who never said them, and a reminder would mail a
person about a plan they did not make, most likely long after they forgot the
example was there. New section 9.13 records the reasoning, and AC-226 asserts
the behaviour.

## [1.0.0] - 2026-08-16

The first shipping release of Dana, the whole of RFC 0001's packages P0 to P10.

**First restore drill, 2026-08-16, green.** Render's free instance type carries no
point in time recovery, so the drill ran the runbook's other route: a custom
format `pg_dump` of production, restored into a scratch `dana_restore_drill`
database on the local PostgreSQL 18 created with the 11.10 builtin C.UTF-8
locale, with AC-001's constraint catalog asserted against the restored copy. 24
of 24 green. The run was proved to have used the restored database rather than
falling back to PGlite by repeating it against a nonexistent database name and
confirming it fails instead of passing. The scratch database was dropped and
`dana_test` was not touched.

**Production smoke, 2026-08-16, green**, including one reminder email that really
arrived. That leg found the only defect the automated suite cannot see: a
`RESEND_FROM` that was not an address, which Resend refused with HTTP 422 while
the scheduler retried silently every 60 seconds. Configuration only, no code
change.

### What it shipped

The whole product, as RFC 0001 specified it: Google sign-in, folders shared with
other people, tasks with due dates, reminders and recurrence, the native views
(Desk, Today, Scheduled, Assignments, Important, All, Done), saved views, search,
file attachments, a calendar, and an installable offline-capable shell. What each
of those does is `docs/spec/`, which is the contract rather than a summary of it.

### A note on what used to be here

**This entry was 2,826 lines, 92% of the file, and almost none of it was a
changelog.** It was the decision log of the v1 build: package kickoff rulings,
mid-package change controls, ledger annotations, items routed to the owner,
disclosures ratified at merge reviews. Real records, and valuable ones, but a
reader asking "what changed in 1.0.0" was not their audience and could not find
the answer among them.

Trimmed 2026-08-31 at the workflow restructure. Nothing is lost: the full text is
in git history at the commit before this one, and the decisions it records also
live in RFC 0005's change control section and in specification section 13. From
2.2.0 onward this file is one short section per version, written when the tag is
cut.
