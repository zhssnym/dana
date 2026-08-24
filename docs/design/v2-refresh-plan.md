# Dana UI v2 refresh: session plan

Status: **DRAFT — awaiting Imran's approval of session V0's start**
Recorded: 2026-08-17. Owner: Imran, with Claude as the design studio.
Scope: **desktop at 1440px, design phase only.** This plan ends at an approved
prototype-v2 and its handoff package. The production port is a separate later
phase (RFC 0004, mirroring RFC 0002's machinery) and is deliberately outside
this plan.

## Inputs

1. The critical review of 2026-08-17 (39 findings, severity-tagged, each
   classified free-to-change vs needs-a-ruling), published as the artifact
   "Dana Frontend Review". Finding IDs below (A/B/L/R/F/C/S/V/P/W) refer to it.
2. `docs/design/vision.md` — via the review's W1–W6 principles, which bind
   every session below as standing constraints.
3. `docs/design/prototype/` — the approved v1 prototype, the fork point.
4. The v1 design records — `design-contract.md`, `screen-registry.csv`,
   `notes.md` — which v2 extends rather than replaces.

## Ground rules, all sessions

- **Fixtures only.** prototype-v2 never gains an API call, auth, or anything
  from `app/`. Nothing under `app/` changes in this plan.
- **Normative material never moves here.** Section 9 copy, control names,
  roles, and regions render exactly as the spec writes them. A session that
  wants to change one has found a ruling item, not a task: it goes on the
  Rulings track below and waits for Imran's decision as spec text.
- **W1–W5 are standing constraints** on every visual decision: one accent and
  no separate AI hue; row state-chip and assignee slots cut as open sets;
  history shaped as a timeline; the search overlay stays palette-shaped; one
  always-visible capture point per page.
- **Every session runs the prototype before it changes anything** (RFC 0002's
  hard-learned rule), and ends with `npm run build` green in prototype-v2.
- **Concepts are compared in a lab; the winner is extracted the moment it
  wins.** Added 2026-08-18 at Imran's instruction, after session V3 learned it
  the expensive way. A lab is the right place to *decide* — seven candidates
  against one fixed set of awkward tasks, compared by scrolling rather than
  from memory, which no screen can offer. But the moment one candidate wins it
  moves into `prototype-v2/src/components/` and the lab **imports** it, so the
  lab and the shell render the same code from that point on. Do not wait for
  "final". A concept that is still living inside its own demo file has no
  component to port, and "just move it to the shell" then means writing the
  component first — which is what turned a day's work into a week's. See
  DES-124 for the full reasoning, and DES-119 for the entry that predicted it
  and was not acted on in time. The exception is anything where the
  surroundings *are* the question — page measure, sidebar, chrome — which is
  judged in the shell because there is nothing to isolate.
- **Colour is named by role, not by value.** Added 2026-08-23, after a count:
  outside `components/ui/`, the prototype makes **813** direct references to the
  graphite ramp — `bg-graphite-50`, `text-graphite-900` — against **195** to the
  semantic roles `tokens.css` already defines at its head. New code writes
  `bg-card`, `text-muted-foreground` and `border-border`, not the ramp step
  underneath them. This costs a session nothing: the same characters, and not
  one pixel moves, because those roles resolve to exactly those graphite steps
  today. What it buys is the second colourway. A role can be redefined once
  under `.dark` and every component follows without being opened; a *value*
  cannot, because `graphite-50` means "very light grey" and is used both where a
  surface must invert and where it must not. `tokens.css` line 279 records what
  that already cost once, when the three dark panels on the public screens
  showed a bare white D. F7 item 6 asks for the dark-mode toggle's placement and
  the F7 sequence puts the colourway itself at stage 6; every component built on
  a ramp step between now and then is one more site that session converts by
  hand, without the light theme moving under it. The ramp stays correct in two
  places — inside `tokens.css`, where the roles are given their values, and on
  the deliberate two-tone surfaces, the public panels and the reversed mark,
  which say so at the call site. This wants a DES number when it is folded into
  `design-contract.md`; it is unnumbered here because a session was running and
  the register was moving.
- **Every session ends with Imran looking at it** — the running prototype
  and/or fresh `handoff=clean` exports — and saying yes or no. An unapproved
  session repeats or returns; it does not roll into the next.
- **Every session appends one line to the session log** in this file: who ran,
  date, what was delivered, verdict. Design decisions that supersede a v1
  DES record are noted in the log line and folded into `design-contract.md`
  at handoff (V9), continuing the DES numbering from DES-092.

## Overview

| # | Session | Delivers | Depends on |
| - | - | - | - |
| V0 | Workspace | prototype-v2 forked, font fixed, baseline exports | — |
| V1 | Layout measure | L1, L2, L5, L6 | V0 |
| V2 | Chrome | L3, L4, L7 | V1 |
| V3 | TaskRow states | R1–R7, W2 | V1 |
| V4 | Task form | F1–F4, W3 | V1 |
| V5 | Calendar | C1–C4 | V1 |
| V6 | Secondary and public | S1–S5 | V1 |
| V7 | Accent and color | V1, V2 (findings), W1 | V3 |
| V8 | Platform and stress | P1, sweep | V2–V7 |
| V9 | References and handoff | A1–A4, W6 | V8 |
| V10 | Imran's visual review | item-33 verdicts, v1 and v2 | V9 |

V3–V6 are independent of each other once V1 lands and may run in any order or
interleave; the numbering is the default order, chosen so the row (V3) settles
before the surfaces that repeat it. V2 may run any time after V1.

## Sessions

### V0 — Workspace

- **Start:** this plan approved; `docs/design/prototype/` as it stands.
- **Steps:**
  1. Copy `docs/design/prototype/` to `docs/design/prototype-v2/` on the
     `design/v2-refresh` branch.
  2. Fix the font stack so the prototype renders the Inter Variable it
     bundles (review A4): the stack's first family must be the name
     `@fontsource-variable/inter` registers.
  3. `npm install`, `npm run dev`, `npm run build` — all green.
  4. Export a baseline set of the sixteen screens from v2-as-forked (real
     typeface, `handoff=clean`), stored under `docs/design/v2-refs/baseline/`.
     These are the "before" for every later approval.
  5. Seed the session log below with V0's line.
- **End state:** prototype-v2 runs and builds; every screen renders Inter;
  baseline exports exist; Imran has seen one screen side by side with v1 and
  confirmed the font change is the only difference.
- **Records:** log line; any surprise found in the fork noted, not fixed.

### V1 — Layout measure

- **Start:** V0's baseline exports; review findings L1, L2, L5, L6.
- **Steps:**
  1. Introduce `--content-list` and `--content-form` width tokens (L6) and
     apply the chosen list measure (L1): first candidate ~800px centered;
     decide against the alternative (full width, metadata pulled to title)
     by looking, not arguing — build both on My Day, pick one with Imran.
  2. Fix the trailing metadata slot order once (L2): state chip → folder →
     assignee → steps → due; star and overflow outermost; due right-aligned
     as a true column. Apply to `task-row.tsx` only.
  3. Confirm sparse pages (Important, Done) read intentional at the new
     measure (L5).
- **End state:** all six list pages and the states page re-exported at the new
  measure; Imran approves the measure and the slot order explicitly.
- **Records:** log line; the measure decision recorded as the first v2 DES
  entry (supersedes the 1120px content area of DES-023 in part).

### V2 — Chrome

- **Start:** V1 approved; findings L3, L4, L7.
- **Steps:**
  1. Page strip (L3): build both candidates — retired (H1 owns identity,
     update pill relocated to sidebar footer) and kept-with-a-job — and put
     them in front of Imran. One decision, recorded.
  2. Quick-add rest state (L4): reveal on group hover/focus with stable
     geometry, or placeholder-text treatment; keep the FAB as the page's
     always-visible capture point (W5). Name and behavior unchanged.
  3. New folder action (L7): drop to the ghost action tier beside
     "+ New group".
- **End state:** shell exports approved; the update affordance has a designed
  home visible in an export for the first time.
- **Records:** log line; DES entries superseding DES-067 (strip) and DES-052
  (New folder) as decided.

### V3 — TaskRow states

- **Start:** V1 approved; findings R1–R7; constraint W2.
- **Steps:**
  1. States lab first: add the Inbox-chip state (R1, production's behavior is
     the reference), fix the canonical slot ordering across all states, and
     document the chip family as an open set (W2).
  2. Important page star rest-state (R2): outline at rest on Important only.
  3. Restore moves to the trailing action slot (R3).
  4. Carried-over overdue quieting (R4): quiet red date inside "Carried
     over", full treatment elsewhere.
  5. Date ladder (R5): one relative ladder, two absolute formats, one module.
  6. Steps/pulled legibility (R6): "2/4 steps" where width allows, tooltips.
  7. Done rows drop the due-date echo (R7).
- **End state:** the states page is the deliverable — every state, one
  ordering, exported and approved. List pages re-exported.
- **Records:** log line; DES entries for R2 and R4 (state-emphasis rules).

### V4 — Task form

- **Start:** V1 approved; findings F1–F4; constraint W3.
- **Steps:**
  1. Recompose the sheet (F1): stacked full-width fields vs tight 110px
     right-aligned label column — build the stacked variant first, show both
     only if it disappoints. Steps and Notes span the sheet either way.
  2. "More options" gets button clothing (F2): ghost treatment, rotating
     chevron; name untouched.
  3. History as a small timeline (F3, W3): actor · action · viewer-local
     time, one row per event, creation and completion today, rows addable
     tomorrow.
  4. Resize affordance (F4): visible grip on hover-intent; 600px edit-mode
     default width.
- **End state:** four form exports approved: create collapsed, create
  expanded, edit with steps and history, edit at default width with long
  step titles (the F4 stress case).
- **Records:** log line; DES entry superseding DES-025's interior composition
  (sheet and resize range unchanged).

### V5 — Calendar

- **Start:** V1 approved; findings C1–C4.
- **Steps:**
  1. Times prefix timed chips at month zoom (C1).
  2. Weekday header one step up (C2).
  3. "+N more" as a control, not a chip (C3).
  4. Abandoned at month zoom: opacity + glyph, no strike (C4); full
     treatment at day/week.
- **End state:** month, week, and day exports approved, including one crowded
  cell and one abandoned-event cell.
- **Records:** log line.

### V6 — Secondary and public

- **Start:** V1 approved; findings S1–S5.
- **Steps:**
  1. People: "Send invite" enabled and disabled states designed and both
     exported (S1).
  2. Settings: ~560px control column (S2); full-height capture including the
     danger zone (closes A3's gap in v2's own references).
  3. Invite gate: drop the duplicate count chip (S3).
  4. Email: dedupe the "Task reminder" label (S4).
  5. Landing headline second line: A/B the opacity cut against a weight
     shift, Imran picks (S5). Copy does not move.
- **End state:** People, Settings (full height), gate, email, and landing
  exports approved.
- **Records:** log line; S5's pick recorded.

### V7 — Accent and color

- **Start:** V3 approved (the row is where most color lands); findings V1,
  V2; constraint W1.
- **Steps:**
  1. Cobalt takes its DES-016 jobs (V1): checked checkboxes and switches,
     the calendar today marker, links. Buttons, stars, and nav stay graphite.
  2. Folder color commits one way (V2): build both — swatch-tinted folder
     name text vs sidebar-only color — and decide by looking.
  3. Write the W1 comment into v2's `tokens.css`: one accent; AI, when it
     comes, renders native and gets provenance, not a hue.
- **End state:** before/after exports of My Day, Planned calendar, Settings,
  and the states page approved.
- **Records:** log line; DES entry for the folder-color decision.

### V8 — Platform and stress

- **Start:** V2–V7 approved.
- **Steps:**
  1. Thin tokenized scrollbars (P1).
  2. Stress pass: 360px sidebar with long folder names, 100-character task
     titles, a 50-step task, 20 folders in one group, every truncation
     looked at.
  3. Motion check against the notes' tiers (100/150/200/240ms) and
     reduced-motion suppression.
  4. The full 32-route sweep from v1's QA: visible content, no broken
     assets, no horizontal overflow, console clean.
- **End state:** sweep recorded green; any finding fixed in-session or
  returned to its owning session.
- **Records:** log line with the sweep's numbers.

### V9 — References and handoff

- **Start:** V8 green.
- **Steps:**
  1. Regenerate the complete reference set from one build (A1, A2, A4):
     all sixteen screens — **Search actually captured this time** — plus
     foundation, component-states, and shell sheets, and full-height
     Settings (A3). Old baseline moves aside; `v2-refs/` is the set.
  2. Write the "ground ready" note (W6): one page recording W1–W5, where
     each seam lives in the v2 tree, and what the AI RFC will find waiting.
  3. Fold v2's DES entries into `design-contract.md`, continuing from
     DES-092; update `screen-registry.csv` statuses; update `notes.md`
     where v2 changed an implementation note.
- **End state:** the v2 handoff package is complete and internally
  consistent: one design generation, one typeface, no missing screen.
- **Records:** log line; the contract and registry updates are the record.

### V10 — Imran's visual review (the item-33 instrument)

- **Start:** V9 complete; production at 1.0.0 running beside prototype-v2.
- **Steps:**
  1. Side-by-side pass, v2 against production, states page and the sixteen
     screens, plus the live checklist from the review's P3: focus rings,
     hover reveals, motion tiers, update pill, offline banner, toast
     stacking, truncation.
  2. Record **two** one-line verdicts in `SESSION-LOG.md`: the retroactive
     v1 line item 33 has been owed since the P8R merge (who looked, date,
     which pages, verdict), and the v2 line for this refresh.
  3. Findings return to their owning session (V1–V8) as one fix session if
     needed (V10a), then this step repeats.
- **End state:** both verdicts recorded; the design phase is closed. What
  follows — RFC 0004, the port sessions, the merge gate — is the next plan,
  written then, not now.
- **Records:** the two SESSION-LOG lines are the record this plan exists to
  produce.

## The naming map

`v2-naming.md` is the shared vocabulary, opened 2026-08-17 after a layout
discussion stalled for want of a word. Sessions, findings and DES entries name
things from it; where the spec, the contract or the code already had a name,
that name is what it carries. Its picture, `v2-refs/naming-map.png`, is
regenerated at V9 with the rest of the reference set.

## The decision register

`v2-decisions.md` is the running record of what this refresh decides, opened
2026-08-17 at Imran's instruction that ideas needing a backend be recorded and
marked as such. It carries two lanes: design-only work, which follows the
normal flow through the sessions above, and **NEEDS BACKEND** proposals, which
may be drawn on fixtures for review but never reach `app/` without an RFC. A
session that finds itself designing something the shipping product cannot do
has found a Lane 2 entry, not a task.

## Notes for the port

Findings that cost nothing here and cost something in `app/`, recorded as they
are found so the port session meets them as a list rather than as a surprise.

- **Production carries two task rows; the design carries one.** Every
  prototype screen that draws a task uses `components/task-row.tsx`, Done
  included. Production forked a second implementation, `DoneRow` in
  `app/src/client/pages/DonePage.tsx:86`, whose class string duplicates
  `task-row.tsx`'s line for line. So a row change agreed here is two edits
  there, and the two can drift without any check noticing. Found 2026-08-17
  while investigating DES-093. The port should reunify them or record why not.

## Rulings track (parallel, not blocking)

Runs beside the sessions, Imran with Hassan, independent of the restyle:

- **B1 — Privacy and Terms.** Owner copy plus a server route; the landing's
  links 404 in production today. Should not wait for v2.
- **B2 — Public 404 copy.** One normative string split by context
  (signed-out surfaces stop mentioning the sidebar).
- **B3 — Spec 9.4's important-only switch. Decided, spec text owed.** Imran
  ruled on 2026-08-19, explicitly and in the knowledge that it changes
  normative material: My Day's important-only switch belongs in the window
  bar's shared filter, not on the page's own header line, and **9.4 is to be
  edited to say so.** The design stands as drawn (DES-150) and does not wait
  for the edit; what is owed is the sentence itself, written against 9.4's
  structure line, before the port to `app/`. Recorded here rather than left in
  a DES entry because the edit is the repository's, not the design's.
- Anything a session escalates lands here with its finding ID.

## Where the next session starts

**A parallel session holds the conversation, from 2026-08-23.** A Codex session
is polishing the messaging surface against `docs/design/messaging-brief.md`,
which is the authority on that boundary. Five files are **its** files and no F7
stage may edit them: `components/comments.tsx` and the four primitives only it
consumes — `ui/message`, `ui/bubble`, `ui/textarea`, `ui/input-group`.
Everything else stays ours, `right-edge.tsx` and `ui/inline-field.tsx`
emphatically included, because both are shared and neither is the thread. Two
F7 stages meet that work later and should expect to: stage 5 reads the message
shape when search learns to reach messages, and stage 6 converts whatever ramp
colour is left in the file. Its session log line is marked parallel, so the log
stops being a strict sequence from this date.

**Reaffirmed by Imran, 2026-08-24**, after the close-out review found the
session had delivered nothing yet: the conversation surface stays with Codex
and the boundary stands. Nothing in that work moves a backend decision — the
conversation's backend shape is already recorded with its four facts
(DES-129, DES-134, DES-142, DES-146), and what Codex owes is polish on a
drawn surface. Its three debts from the brief are unchanged: a diff limited
to the five files, a parallel log line here, and a handoff paragraph.

**And widened the same day, at his instruction** — "hand off every frontend
related thing which will not change backend or a design decision to Codex."
The lane now carries four items, written up as `codex-handoff.md`: the
landing page and the public screens (Imran directing, S5's pick included),
the 650-reference colour-role conversion (prep for the dark session, zero
pixels moved), the card's collapse animation (DES-119's carried fault,
`task-card.tsx` transferring now that F7's stages have landed), and the
messaging surface as before. The studio keeps every token value, all
normative copy, the contracts and models, the comparison instruments, and
V9's records — whose reference set is captured **after** Codex's landing
pass, so the exports show one design.

**F7 in progress, 2026-08-23.** Working through `docs/design/f7-brief.md`, which
reads Imran's fifteen-item brief as a system rather than a list. Stages 1 to 3
of its sequence are done:

1. **The object contract** (DES-197). `lib/object-acts` declares what each kind
   of object supports; `ObjectMenu` draws it; an act with no handler does not
   appear. Both folder menus now come from it and are identical. The stale
   "Label and Color" act was removed: "Label" was v1's word for what is now a
   shelf, so the menu offered "Move to shelf" and "Label and colour" one line
   apart.
2. **Duplicate carries the folder's contents** (DES-198) — tasks, sections,
   paragraphs, section assignments; not members, sharing, the conversation, the
   assignee, or any progress. Due dates re-anchor a spent plan on today and are
   left alone when they are still ahead.
3. **The event log** (DES-199). `reversibly` takes a verb instead of a sentence,
   so an act cannot be recorded but unlabelled or labelled but unrecorded.
   Reading it: the folder page's Activity control, and a task's footer. The
   native pages lost theirs — a view is not a thing you edit.
4. **Trash, and the footer sorted by role** (DES-200). Deleting moves a thing
   rather than ending it, which deleted seven copies of "This can't be undone".
   New shelf joined New folder; Help went to the account menu.

6. **The image block** (DES-202) — a page holds headings, prose and pictures.
   Downscaled on the way in and kept in its own store, so it survives a reload
   and a quota failure costs pictures rather than sections.

7. **Expanded search** (DES-203) — tasks, folders and pages, grouped by kind,
   matching on steps and page prose, and offering the pages when nothing is
   typed.

8. **Profile picture** (DES-204) and **the theme control** (DES-205) — the
   placement Imran asked for, with a first-pass dark colourway behind it so the
   toggle is not a control that switches to nothing. **The ten folder swatches
   are his ruling and are unchanged.**

9. **Workflows** (DES-206) — a folder saved out as a file and imported back as
   a new folder. Structure and words travel; nothing about people or time does.

**Next, in `f7-brief.md`'s order:**
the Shelf page (item 15).

5. **Tasks joined the contract** (DES-201). The row's menu was the last
   hand-written one; it now offers History, Copy link and Duplicate alongside
   what it had. A task has an address, `?task=<id>`, which Copy link forced and
   which is also the review instrument this plan lacked — a link can name a row
   now, not only a page.

**Still owed inside the finished stages:** the shelf is declared in the contract
and has no menu drawing it, because it has no page yet — that is stage 8. Save
as workflow is declared and supplied by nothing, which is stage 7.

**Imran’s third review pass is closed** (DES-216): History renders, restore
makes one row, folder delete has its undo and happens in place, shelf files
round-trip, the shelf page sits on the shared measure with a full control row,
and the footer’s three buttons hold their line as the sidebar narrows.

**Imran’s fourth review pass is closed** (DES-217 to DES-221), 2026-08-24, in
a fresh session after the previous one stalled on server errors with the
batch unanswered. Four of his reports were one mechanism: the tab strip’s
special first tab. The strip is a real tab strip now — every tab equal and
closable, close-active lands on the neighbour and an emptied strip lands on
Desk, tabs reorder by pointer drag, and a “+” at the row’s end opens any
shelf or folder as a tab or makes a new one (DES-217). Shelf rename works
from both surfaces, because a shelf’s name is its membership label and the
shell now performs the whole act — labels, page stores, tabs, history, URL
(DES-218). The shelf page took the folder page’s grammar whole: folder rows
are arrangeable blocks under sections with prose insertable around them, the
control row moved into the window bar, the cover affordance arrived, and an
add-folder capture row lands folders on the shelf live — a folder pressed on
a shelf opens as its own tab beside it (DES-219). The sidebar’s folder block
is labelled **Library** (DES-220, PROPOSED — his word to change), and the
footer’s New shelf label is whole at every width, Import and Trash going to
icons until the row fits all three words (DES-221). Both gates green: 12
audit rules, 29 sweep routes plus a new driven block for the strip, the
rename, the add row and the footer — every new check watched to fail against
a deliberately broken build before being trusted. One incidental fault fixed:
a shelf page lit Today’s sidebar row, because `activePage` had never learned
about shelves.

**Open for Imran:** one colour ruling, drawn at `?view=swatches` — whether
folder cobalt moves off the brand hue (224 → 242) now that both are vivid
(DES-215). The accent is settled at 85% and the ten swatches are applied vivid. Desk’s glyph is settled: it stays
still. DES-155 onwards still await his click-through, DES-217 to DES-221 now
with them.

**The close-out review, 2026-08-24.** At Imran’s instruction — “look 360
degree everywhere, what’s left and what should be done” before the backend
sessions are planned — everything still open was swept into one document:
`docs/design/v2-closeout-review.md`. Its shape: the Lane 2 pile is
priced-ready with the frontend drawn for nearly all of it; six things need
backend and have no drawing (four deliberately, plus **notifications**, which
nothing in the spec or prototype has ever mentioned, and the reminder
question DES-178 opened); one more prototype session of drawing work remains
(V5/V6/V7/V8 remnants); V9 and V10 are untouched; the messaging session has
delivered nothing and needs a decision; and the run order to close the phase
is written at its foot. The next session starts from that document.

**Its step 1 ran the same day (DES-222): the last drawing pass is closed.**
C4 fixed and C1/C3 verified, C2 recorded superseded by DES-164; V6 closed
whole — S2’s 560px column, S3’s chip dropped, S4’s label deduped, S1 verified
built, S5 drawn as the `?headline=weight` instrument for Imran’s pick; W1’s
comment written into `tokens.css`; P1’s scrollbars stated once in tokens; the
`nativeButton` warning killed as a mechanism in `ui/button` with the two
public screens joining the sweep’s routes; and V8’s stress pass now lives as
a sweep block built through the app’s own stores. Statuses settled: L3, L4,
DES-131 and DES-117. **Three rulings landed the same day**: cobalt to hue
242 (DES-215, delegated and ruled), Library accepted (DES-220), and the
messaging boundary reaffirmed with Codex. Still owed to close the phase: S5’s
pick and the DES-155→222 click-through (V10’s side-by-side), V9’s handoff
package, and the two SESSION-LOG verdicts. Then the Lane 2 pricing session.

### The F6 handover, kept


Rewritten 2026-08-22 at the close of session **F6**, which took the largest
remaining item — sidebar drag — went down the rest of Imran's list, and then
closed the four open rulings he answered or handed over. Rulings taken:
**DES-171 to DES-194**, and **DES-122 is closed**. **Read this section first,
then `v2-decisions.md` from DES-155 down (F5's sixteen and F6's twenty-one, all
awaiting Imran's look), then run the prototype before changing anything.**

**Two gates, and both must be green before anything is reported.**
`node docs/design/prototype-v2/tools/audit.mjs` reads the source and needs no
server: eleven rules, each of which proves it still catches its own probe before
any result is printed (DES-157). Then
`node docs/design/prototype-v2/tools/sweep.mjs` against port 5240: 25 routes,
the filter panel opened and every dropdown measured, **the sidebar's three drag
gestures driven with a real pointer, the board's cards carried between columns,
the view strip checked against DES-177's rule page by page, and a filter
watched to stay on its own page**.

### Ground rules for whoever picks this up

- **Never measure a transitioned property in the browser pane.** It is not
  displayed, so `document.visibilityState` is `hidden` and CSS transitions do
  not tick: a transition that has started pins the computed value at where it
  began, for ever. Every hand measurement of the shell’s `padding-right` read
  `0px` and every one was wrong (DES-212). Use Playwright — the sweep, or a
  one-off script — for anything that animates.

- **One session on this task.** Two agents edited this tree at once on
  2026-08-22 and their changes collided mid-turn; the other sessions were
  archived at Imran's instruction. Do not start a second.
- **One dev server, on port 5240.** Stale servers on other ports were the
  cause of three false bug reports — Imran was looking at a dead process while
  the fix was live elsewhere. If a change seems not to have landed, check the
  port before you believe it.
- **Screenshots are not the deliverable; a link is.** Imran reviews by
  clicking. Give him URLs into the running prototype, not images.
- **Verify what you claim.** Every fix in this stretch that was reported
  without an assertion behind it turned out to be wrong at least once. The
  route sweep is the minimum bar, and a gesture needs a driven pointer rather
  than a look — F6's sidebar and board faults were all invisible at rest.
- **A new rule earns a check in the same session.** Every block added to the
  sweep at F6 was watched to fail against a deliberately broken build before it
  was trusted, which is DES-157's discipline applied by hand.
- **DES-154 is the standing lesson**: a behaviour settled for a component
  belongs to that component's contract, not to each screen's diligence. When
  Imran reports something "still broken in one more place", the fix is almost
  never the place — it is the mechanism.

### The state of the navigation model

**DES-152 is ruled and drawn.** The sidebar is now

```
Desk · Today · Scheduled · Assignments · Important · All      (Done unpinned)
———
Personal ▸ Home · Travel      Work ▸ Business · Office      Ideas · Reading list
```

**The new model is the default**; `?nav=v1` shows the superseded six-page
sidebar for comparison, the same way `?folder-page=v1` and `?measure=wide`
work.

**The spec change is owed as its own RFC** — sections 1, 2, 6, 9.1, 9.3–9.5,
9.7 and about a dozen criteria, frozen 4 and 7 untouched — and it now carries
DES-178's narrowing of the due date as well.

**When, corrected 2026-08-22 at Imran's question.** The six-pages review
sequenced it *before V9's reference set*, "so the handoff captures one
navigation, not two". That reason does not hold, and three things say the RFC
belongs after the design phase instead:

- **V9 writes design records, not spec.** Its output is the reference captures,
  the "ground ready" note, `design-contract.md` and `screen-registry.csv`.
  Nothing in it reads or writes `docs/spec/` — and the captures come from the
  prototype, which draws one navigation whether the spec has been edited or
  not. The stated reason was true of the prototype, not of the RFC.
- **This plan already keeps normative material out of the design phase**, and
  B3 on the rulings track is the precedent in this very file: spec 9.4's edit
  is *decided*, and what is owed is "the sentence itself… before the port to
  `app/`" — not before V9.
- **RFC 0002 is the precedent one level up.** The v1 design's entire spec
  delta — 9.1 through 9.8, 11.4, 11.13, 12, 13 — lived inside the *port* RFC,
  written when the design was settled. RFC 0004 is chartered to mirror that
  machinery.

And the reason that matters most today: **the design is not approved.**
Twenty-eight rulings from F5 and F6 have not had Imran's eye. Normative text
written against a drawing that may still move is how a specification comes to
describe a design that changed underneath it.

The review's actual point survives untouched — it should be **its own** RFC,
with its own accept/reject line, rather than a rider on a restyle. That is
about separateness, not about timing.

### What F6 built, all verified with a driven pointer

- **The sidebar drags** (DES-171), the last item on Imran's original list that
  nothing had touched. Folders reorder, move in and out of groups, and two of
  them held together become one. **The alphabet became the seed rather than the
  rule**, so an untouched sidebar reads exactly as it did and the clean-handoff
  export is unaffected; groups and loose folders are one ordered list, because
  they share a column.
- **The drag engine gained the other half of `onDropAt`.** F5's seam settled
  what happens on release and said nothing before it, so a row on its way into
  another container was still drawn as a slot in the list it was leaving.
  `onOver` is asked as the pointer moves.
- **A task tab has a window bar** (DES-172): its folder and section on the
  left — the breadcrumb slot, true for the first time — and its own controls on
  the right, moved out of the page header rather than copied.
- **A page's description is editable** (DES-173), which `nav-model` had
  promised since F4 and nothing had built.
- **The board's cards move** (DES-174), on the same engine and resolver as the
  list's rows. **Dropping on Done completes**; carrying a card out reopens it.
- **People has its own mark** (DES-175); **the shell's last hairline is gone**
  (DES-176).
- **The view controls have a rule** (DES-177), which is the item Imran said had
  no decision behind it. One strip in the bar for every place-page, computed
  from the rule rather than from each screen's own idea. The folder page's
  disabled calendar is gone — refused on principle, not unbuilt. There is one
  board component now, serving the folder's sections and every other page's
  grouping alike.
- **Desk wears a desk lamp** (DES-181), Imran's ruling, resolved through the
  one place a folder's native mark is decided.
- **A due date is a day** (DES-178) — DES-122 closed, with the time and a start
  date deferred rather than dropped.
- **A filter belongs to the page and to the session** (DES-179), and **an
  arrangement is a person's** (DES-180) — the two questions Imran handed over.
- **Seven more from Imran's look at F6's work, 2026-08-23.** One task now has
  one copy of itself — every inline row writes through the shell's own path
  instead of keeping edits to itself, so a note or a step typed inline is
  there in the sidebar (DES-185). The right panel makes the page shrink rather
  than covering it (DES-186). **Twenty-nine icons stopped morphing into a
  different drawing on hover** (DES-187) — the filter was a funnel under the
  pointer, Settings a gear — with a tenth audit rule that renders both and
  compares them. The star is graphite everywhere and the fill is the whole
  difference (DES-188). Row height finally has a control, which DES-113
  assumed for four sessions and nobody built (DES-189). **Folder groups drag**,
  which DES-171 half-built (DES-190). And the filter's honesty line is gone
  from the panel and left in the register where it can be seen (DES-191).
- **Two corrections from Imran on the same day.** The icon rule left two ways
  to satisfy it and F6 took the wrong one twenty-nine times: **nine icons went
  back to their animated drawings** and animate again — the filter is a funnel,
  Settings a gear — while twenty stay plain because the animated twin would
  have changed the meaning or collided with a name already there, each reason
  written beside the code (DES-192). And **two paragraphs on a page sat 32px
  apart**, more than one and a half of their own line-heights: the insert strip
  did not know what it was separating, so prose now runs on at 16px while a
  section after it still gets 36 (DES-193).
- **A row says what its page does not** (DES-183), which is four of the
  review's row findings turning out to be one rule. Done stops echoing a spent
  deadline, Important's star drops its fill, Carried over keeps its words and
  loses its red, and an unfiled task finally says Desk. The page's half and the
  grouping's half merge, because grouping swaps the screen and the replacement
  knew nothing about where it was standing.
- **The state sheet is drawn by the shipping row** (DES-184) and has left the
  audit's lab exclusion. It had been v1's for four sessions — a row this
  product no longer draws, four identical "interaction states", two states that
  rendered nothing — and five dead props survived on the row's contract purely
  to keep it compiling. All five are gone.
- **Every board column captures, and the floating button leaves board view**
  (DES-182), on Imran's observation that a column says where a task lands
  better than a button can. Building it exposed the fault underneath: **a task
  made on Today never appeared on Today**, because the button set a due date
  and Today's spine is membership. The entry defaults are derived from the
  spine now, page by page, so a made task belongs where it was made.

### What is left, in Imran's own order

Items 1 to 3 closed at F5. Items 4 to 11 closed at F6. What follows is the live
list, checked against the code at the close of the session.

1. ~~**Shell pass.**~~ F5 — DES-155.
2. ~~**The filter rebuild.**~~ F5 — DES-156.
3. ~~**Settings as the pin list.**~~ F5 — DES-170.
4. ~~**Sidebar drag.**~~ F6 — DES-171. **One deliberate limit stands: a group
   cannot be dropped inside a group**, since Dana nests one level. A closed
   group is not sprung open by hovering it mid-drag either — it takes the drop
   and says "Into &lt;name&gt;" — because opening it would move every row below
   it after the engine had measured where they sit.
5. ~~**A task tab's empty window bar and unmarked tab.**~~ F6 — DES-172.
6. ~~**Board view.**~~ F6 — DES-174 and DES-177, reachable directly at
   `?folder-view=board`. Board columns still reorder on the folder page's own
   bespoke pointer drag rather than on `use-sortable-list`, which is
   vertical-only; it works and is left alone.
7. ~~**Editable page descriptions.**~~ F6 — DES-173.
8. ~~**Desk's glyph.**~~ F6 — DES-181.
9. ~~**Assignments and People sharing a person glyph.**~~ F6 — DES-175.
10. ~~**The sidebar's 1px right border.**~~ F6 — DES-176.
11. ~~**A rule for the view controls.**~~ F6 — DES-177.
12. **V3's brief and V1's measure, closed** — DES-183 and DES-184. R1, R2, R4, R5, R6 and
    R7 are done and the states page is rebuilt on the shipping row.
    **L2 and L5 are settled by Imran's eye, 2026-08-23**: the chip order under
    a title "looks right", and Important and Done "look good" at the measure.
    **W2 is closed too**, 2026-08-23 — DES-194. It was not a claim to check:
    both slots were shut. The chips were eight conditionals in one block with
    the order living in the source sequence, and the assignee menu was three
    names from the row lab with no way to unassign at all. **V3 and V1 are
    now complete.**
13. **Then the spec change**, as its own RFC — DES-152's navigation plus
    DES-178's narrowing of the due date. **After the design phase, not before
    V9**, and the sequencing is corrected here: see below.

### F7, and the one decision it waits on

Imran gave a brief of fifteen items on 2026-08-23. It is read as a system in
`docs/design/f7-brief.md` rather than answered item by item, because **six of
the fifteen are one missing mechanism**: Dana has no object contract, so every
overflow menu is written by hand and an act exists exactly where somebody
remembered it. Open-as-tab, Copy link, Duplicate, Trash, Save as workflow and
History are six acts on three objects with nine holes in the matrix.

**The decision owed is what a folder group *is*.** Today it is a personal
label — the dialog says so and DES-180 ruled its order per-person. Item 15
gives it a page, a link and members whose access cascades to its folders, which
makes it an object and a second level of hierarchy. The brief sets out both
answers and recommends the container, renamed **Area**, because a thing with a
page and a membership list is not a label and DES-152 already settled that a
name must say what a thing is. Item 15 cannot be built and part of item 14
cannot be shaped until this is ruled.

### Open questions Imran has not ruled

None from his own list — the last two, Desk's glyph and the view-control
strategy, were answered on 2026-08-22, and the two he handed to the studio were
ruled as DES-179 and DES-180.

What remains is not a question but a pile: **thirty-seven rulings from F5 and
F6 have not yet had his eye** — DES-155 to DES-194, less the handful he ruled
on directly at the close of F6. The plan's own rule is that
a session ends with Imran looking at it, and nothing since F4 has had that.

Carried forward for Hassan rather than for Imran: **four things a person
chooses that currently live in this browser and need a home on the account** —
row density (DES-113), 12/24-hour (DES-121), where a task opens (DES-138), and
now the folder arrangement (DES-180). They are one conversation and should go
together.

### The standing test

**There are two, and both must be green.** `node tools/audit.mjs` reads the
source and needs no server: eleven rules, each proving it still catches its own
probe before any result is reported (DES-157). Then the runtime sweep. The
static one is what would have caught the four folder-mark faults that a green
audit hid for a week.

Run this before reporting anything. It asserts invariants, not just that pages
render — no prototype artefact in user-visible copy, exactly one glyph per
sidebar row, no stray title input in a list, no horizontal overflow, no console
error, no glyph drawn out of square. It then **opens the filter panel and walks
every axis**, **drives the sidebar's three drag gestures**, **carries a board
card between columns and onto Done**, **checks every page's view strip against
DES-177's rule**, **watches a filter stay on its own page**, **counts the
rows either side of a capture**, and **measures the star's fill and the overdue
date's colour page by page**, because a task that is made and then filtered off
its own page — or a rule that reaches the row and not the card — is invisible
to every other check, because
everything this refresh has added since F5 is invisible to a page at rest — a
sweep that only measured pages standing still would have gone on passing while
any of it was broken. Each block was watched to fail against a deliberately
broken build before it was trusted. It lives at
`docs/design/prototype-v2/tools/sweep.mjs`, is run from anywhere with
`node docs/design/prototype-v2/tools/sweep.mjs` against port 5240, and resolves
Playwright out of `app/` — the same arrangement `tools/capture.sh` uses and for
the same reason.

Known faults it does not catch, carried forward: the card's collapse is not
animated (DES-119); Vite's React plugin intermittently emits a broken
self-import on this Windows path and blanks the dev server, cleared by a
restart; two public screens log a Base UI `nativeButton` warning (V6's).

## Session log

| # | Date | Who | Delivered | Verdict |
| - | - | - | - | - |
| V0 | 2026-08-17 | Claude, for Imran | prototype-v2 forked; font stack fixed so Inter Variable actually renders (A4); build green; deterministic capture tool at `prototype-v2/tools/capture.sh` with a duplicate check; 19 baseline captures in `v2-refs/baseline/` including the first real Search export; Privacy and Terms drafted as `?view=privacy` / `?view=terms` with a visible draft ribbon (B1, copy awaiting Imran). One review correction found during the fork: v1's stale exports are 02-11, not 01; the committed code matches 01 | **Closed 2026-08-17.** Font settled by record rather than by eye: DES-015 fixes Inter Variable and the fork diff shows the stack line as the only rendering change. Legal copy approved by Imran for v1 scope, ribbon removed. Found during the citation check and escalated separately: RFC 0002's spec delta was never folded into docs/spec despite the Implemented status, and spec 13 item 35 is double-claimed |

| V3 | 2026-08-17/18 | Claude, for Imran | **In progress, not closed.** The row's shape was reopened before its states were touched, and settled first: seven concepts converged to one row at two densities, chosen from Settings with two lines as the default (DES-113). The expandable card is designed and complete against the task form — one header strip of five chips, then Steps, Notes and Attachments as collapsible blocks, a shaded footer band, no Save button because every edit commits as it is made. Drag, the 1.5s hold that makes a folder, press-and-hold selection and the bulk bar are drawn in the lab and marked Lane 2. Rulings taken: DES-093, 095, 106 (five verbs), 107, 108, 109, 111, 113, 116. A first port to the shell was made and then reverted, deliberately, so the lab is the single source until Imran finalises it | **Open.** V3's own brief is largely untouched: only R3 (Restore to the trailing slot) is done. R1, R2, R4–R7 and W2 remain, and the states page is still the deliverable. V1 is also still open, and V3 was started ahead of it |
| V3 (cont.) | 2026-08-18 | Claude, for Imran | **The row and its card declared finalised by Imran.** Three things were rebuilt on his direction after review. Dragging left HTML5 drag-and-drop for a pointer engine, `lib/use-sortable-list.ts`, shared by the task rows, a card's steps and a card's blocks: the carried row tracks the pointer, the rows it passes make space, it settles into the gap, and it brought auto-scroll, touch and arrow-key reordering. The folder gesture arms on stillness rather than hover and is drawn as a ring closing around a folder mark on the carried row, with a rebuilt naming panel. The three pickers were rebuilt twice — first onto presets-plus-calendar, then decluttered to one shape at 270px: resolved answers, a hairline, one expanding custom option. New rulings: DES-120 (picker shape), DES-121 (12/24-hour as a browser preference), DES-122 (a due date is a day, not a moment), DES-123 (the same pickers open from the folded row). DES-103, 102, 099 and 118 updated; DES-113 and DES-119 corrected where the revert had left them naming deleted modules. Four defects found and fixed, all invisible to a screenshot: the calendar never showed its selection (`/d+/` matched the letter d, not a digit), the row hardcoded "Weekly" whatever the rule was, the selection hook's `onPointerDown` overwrote the drag's so the new drag never started, and two time commits in one turn lost the first | **Row and card closed for now.** V3's brief is still open and unchanged: R1, R2, R4–R7, W2 and the states page. V1 is still open. **DES-122 carries a spec ruling that must be settled before the port** — production's due date has a time and removing it is a specification change, not a restyle |
| V3 (final) | 2026-08-18 | Claude, for Imran | **The row and card are ported.** `row-concepts.tsx` fell 4,812 → ~1,200 lines and holds only the lab; `TaskRow`, `TaskCard`, `task-pickers`, `task-model`, `use-sortable-list`, `row-density`, `time-format` and `ui/calendar` are real modules the lab imports. `components/task-form.tsx` deleted — DES-093 put the task inside its row, so nothing opens a sheet. All seven task screens render `TaskList`, which owns reordering, the 1.5s folder hold, press-and-hold selection and the bulk bar; screens with bespoke row logic keep their row via `renderRow`. Icon family adopted (DES-125/126/127) after a parallel session was archived and its results ruled in. Steps, notes and attachments made real (DES-115, DES-128). New rulings: DES-124 (lab-then-extract, now the default flow), DES-125–128. Defects found and fixed: the step row was keyed by its own title so typing remounted the field after one character; the sidebar's collapsed state was never read back from its cookie; `isAnimated` is a gate not a trigger, and dropping the ref silently stopped every icon animating; `space-y-*` outranked every margin form on the expanded card | **Accepted by Imran, 2026-08-18.** Nothing committed yet. V3's own brief (R1, R2, R4–R7, W2, the states page) is still untouched, and V1 is still open — see "Where the next session starts" |
| F1 | 2026-08-18 | Claude, for Imran, overnight | **Out-of-plan concepts session at Imran's direction; V3's tree first committed as the baseline (`3b1f34a`), concepts committed on top so either reverts alone.** Delivered as PROPOSED drawings: the card's Comments block — threads, one-level replies, files, voice notes that really record via MediaRecorder (DES-129); the folder page as a Notion-like page — cover picker in three honest tiers, 21-glyph animated icon library in the ten token colours following the folder into the sidebar, description, rename-in-place title, sticky top-right control cluster with List/Board/Calendar-disabled, sections and paragraphs behind the blank row, board view, FAB retired (DES-130–133); the folder conversation drawn in both placements, end-of-page and side panel, switchable live (DES-134, first drawn tenant for DES-117's freed panel). One thread component serves card, page and panel (DES-123's rule). Previous folder screen kept at `?folder-page=v1`. Typecheck, build and a scripted browser walk all green | **Open — everything awaits Imran's morning look.** The gating rulings: whose identity a folder's look is (DES-130) and commentary-versus-chat (DES-134); DES-133 amends W5's reading. V1 and V3's brief remain open behind it |
| F1 (review) | 2026-08-18 | Claude, for Imran | **Imran's verdict on the F1 concepts: under-refined and underpolished — and the review agrees with him in writing.** `docs/design/f1-review.md`: 30 findings across six areas (header/cover, cluster, sections/board, comments, system/motion/access, process), severity-tagged, each classified polish vs ruling, every number measured off the running page against the contract (28px controls vs the 40px token, an 18px radius the scale does not contain, a 24px avatar nobody approved, a third section-heading style, three capture rows against W5). Diagnosis: complete features in four dialects; refinement is translation back into Dana's one voice, then interaction depth, then the brand layer. Ends in the F2 plan — V1's measure first, then F2a One voice, F2b Structure that works, F2c Brand layer (covers from the mark's ribbon geometry), F2d verdict pass. Also fixed this half-session: the v1-comparison URL param survived navigation and hid the whole concept, which is why the first look showed only comments (`553f25e`) | **F2 plan DRAFT, awaiting Imran.** The seven rulings it needs are gathered in the review's closing paragraph |
| V1 + F2a | 2026-08-18 | Claude, for Imran | **The measure taken provisionally, and the translation pass done.** Imran approved the F2 plan's start; all three measure candidates were built and offered, he expressed no preference, and the 800px reading column landed as the default on the studio's recommendation (DES-135, PROPOSED — his eye rules at F2d, `?measure=wide` and `?measure=pulled` stay until then). F2a (`6f9344a`) retranslated every F1 surface into the contract: docked 40px cluster with radiogroup views and the graphite pill badge, shell heading tier for sections and page comments, system avatar sizes, radius-md composer, graphite recording, attachment-style comment files, reserved hover slots, no reply rail, recomposed header with first-run ghosts and the mark at identity scale, cover band as its own affordance with a foot scrim, panel under the page bar with Escape and focus return, Rename restored to the menu, section-delete undo, ring selection in every picker. Exit test re-measured green: 40px controls, 16px section tier, 6px composer radius, 24px faces, graphite-200 badge | **Open.** F2b (structure), F2c (brand layer), F2d (verdict) remain; V1 still owes L2 and L5 at the new measure |
| F2 (critique round) | 2026-08-18 | Claude, for Imran | **Imran critiqued the F2a screenshots live and the rebuild landed the same session, pulling much of F2b and F2c forward.** The cover picker went Notion-grade: a sectioned Gallery — nine gradients built only from token hexes, and six covers generated from the mark's own ribbon geometry (F2c's centrepiece, early) — plus Upload, Link, and a Photos tab from Lorem Picsum, with Reposition (drag, save, cancel) on photographic covers and legacy key mapping so nothing picked earlier goes blank. The icon library tripled to 42 animated glyphs. The folder controls became a thin strip under the cover (32px controls in a 12-unit band — Imran's ruling that this is chrome, not control surface; recorded against K1), with a refined solid Share and the ⋯ menu carrying Rename and the v1 comparison; the concept-switches card retired. The filter grew real variables: due (any/with/without/overdue), assignee (anyone/member/unassigned), important only, show abandoned — active count on the strip, one-press clear. The description moved to a quiet line under the title. The board took a two-column grid with tall movable section columns (drag writes back to page order) and real per-column capture. The conversation gained four switchable homes — end of page, floating dock (collapsible, pinned composer), side panel, full screen — switched from the surface itself. The insertion line landed between blocks (tasks deliberately absent from its menu pending DES-071). And the task surface arrived: a board card opens the real TaskRow forced open, full screen / sidebar either edge / floating, with **Open as a tab** feeding the page bar's new tab strip (task tabs persist in sessionStorage across navigation) — DES-117's full-screen half, answered by reuse. One real bug found by the capture harness and fixed: the strip's invisible layer swallowed clicks on the overlapping mark; the row is now hit-transparent except its controls | **Open — awaiting Imran's next look.** Remaining from the review: sections/paragraphs on the sort engine, W5's capture consolidation (S2 ruling), motion sweep (Y2), thread metaphor commitment (M1/DES-134) |
| F2 (sweep, reversed) | 2026-08-18 | Claude, for Imran | A shell-wide sweep was built (`03cd83e`: dead paths wired into the task surface, My Day and Important quick-adds, FAB retired except Planned, L7's ghost tier, Settings Appearance, three lucide-import fixes) and **reversed wholesale the same day at Imran's direction** (`5ce52a4`). The standing state is the polish round, `9d26f0a` — menu icons, switches, Openverse, kin cards, reactions and comment editing all stand. The sweep's observations survive as findings SH1–SH6 in `f1-review.md`, fixes explicitly not standing; the reverted answers live in `03cd83e` for selective return on Imran's word | **Ruled by Imran, 2026-08-18: reversed.** Next direction is his |

| F2 (critique rounds) | 2026-08-18 | Claude, for Imran | **Six rounds of Imran's critique, each answered and verified.** The folder page became the reference design: brand-gradient and mark-geometry covers with live Openverse search, a 42-glyph icon library, a thin window bar under the tabs carrying that tab's controls (DES-139), one filter for every place-page (DES-140), covers native to every page but a task's (DES-141). The task surface became a page rather than a forced-open row (DES-136) with three homes and a remembered preference (DES-138, DES-146); switchers became collapsing icon strips (DES-137). The conversation settled on two homes with a closed section at the page foot (DES-142), tone rather than hue for whose message is whose (DES-143), and likes only. The row menu got real actions and Abandon (DES-144); sections got paragraphs above their first row (DES-145, DES-148); popovers stopped imposing 320px on their contents (DES-147). Type settled at 24/16/14/12 with no off-scale sizes left | **Approved by Imran, 2026-08-18: everything from F1 through F2 accepted.** Next is F3 — bringing the other pages into the folder page's composition — then V3's brief and the states page |
| F3 | 2026-08-19 | Claude, for Imran | **The other six place-pages joined the folder page's composition family.** The folder page's header is extracted rather than copied into `components/page-head.tsx` — cover, mark at identity scale, title with its fact, description at the prose tier — and My Day, Tasks, Planned, Important, All and Done all render it (DES-149). A system page's mark keeps the folder mark's geometry and drops its picker, which is the one honest difference between Dana's places and the person's. Only My Day and a folder fill the fact slot, because only they have a completion; the other four leave it empty rather than inventing a number. **A cover reached a place-page for the first time**: DES-141 had moved the affordance and the shell had been rendering `PageCover` for months, but nothing rendered the "Add cover" ghost, so the ruling was true in the code and false on the screen. Their controls left the content column for the bar (DES-150): Planned's list/calendar toggle is now a collapsing `ViewStrip`, the folder page's own hand-rolled copy of that switcher was replaced by the same component, and My Day's "Important only" switch folded into the shared filter that had been filtering the page all along — two controls for one variable, forty pixels apart. `WindowBarActions` gained an `order` so the shell's shared block and a screen's own controls arrange themselves rather than landing in mount order. Group headings took the section tier on My Day, Tasks and Done (DES-151), with no word of copy changed and no count added, because 9.1 makes My Day's three headings normative to the letter; All's nested folder headings moved off an off-scale 13px to 14. Three faults found and fixed: the head asked whether a cover key was *stored* while the band asked whether it *resolved*, so a reloaded upload would have plated the mark over blank page; `CalendarCheck2` was one of the direct `lucide-react` imports and is now in the icon module; My Day's list was already being filtered by the bar while its own switch said otherwise. Typecheck and build green, 32 routes swept clean — no console error, no horizontal overflow, no empty page | **Open — awaiting Imran's look at the drawing.** One ruling taken the same day and not open: spec 9.4 writes My Day's important-only switch into the page header, DES-150 moved it into the bar's filter, and **Imran ruled explicitly on 2026-08-19 that the spec follows the design** — the 9.4 edit is tracked as B3 on the rulings track, owed before the port. DES-149 and DES-151 still want his eye. V3's brief and the states page are still untouched, and V1 still owes L2 and L5 |

| F3 (pages review) | 2026-08-19 | Claude, for Imran | **Imran questioned the six default pages themselves — redundant, not MECE, named like Microsoft To Do — and the research was done the same session.** `docs/design/six-pages-review.md`: every claim examined against the spec's own text. Found: the sidebar mixes four classification schemes (due date, flag, status, curation) plus one union, so one starred dated task pulled into My Day sits on four pages at once; All is provably Tasks ∪ Planned (6.1's partition proof, pinned by AC-070); Important is one switch of the DES-140 filter; the names map to To Do's smart lists four-of-six letter-for-letter, though My Day's carry-over mechanism is Dana's own; and the spec has conceded optionality since v1 — 9.7's three toggles, `show_done` shipping false. My Day and Done are the two no filter can express (membership and history) and every option keeps them. Ends in three options with Option B recommended: **My Day / Tasks (the union page, Q5's exact rendering under a truer name, calendar as a view) / Done** — zero edits to frozen 4 and 7, ~8 spec sections and ~12 criteria touched, its own RFC, sequenced before V9. Registered as DES-152, OPEN. Nothing drawn, deliberately: the instruction was research and a proposal | **Open — Imran picks a direction: A, B (recommended), C, or keep six.** If B or C, next session draws `?nav=v2` for a by-looking comparison, then the RFC. Item 0 of "Do these next" holds the sequencing |

| F3 (pages direction) | 2026-08-21 | Imran, with Claude | **Imran answered the six-pages review with a fourth shape, Option D: the axis sidebar.** One page per question — a renamed My Day widened into the whole time axis (Today · Tomorrow · Week · Month · Year, absorbing Planned), a page for the assignee axis, Important kept, one for totality — the filter staying as the ad-hoc instrument, because "an axis earns a page, a predicate combination earns a filter press." Evaluated against the spec the same day and recorded as the review's addendum: fixes the same MECE break as Option B while keeping one-press access to the axes; four questions for the draw (personal-vs-shared beyond Today, the undated's home, Done's fate, Who-page vs the People screen); frozen 4 and 7 still untouched, with one feasibility note — Year is a list, never a calendar grid, Q3C refusing ranges over 62 days. Names offered, not decided: Agenda for the When-page, Assigned for the Who-page, Everything for totality | **Direction D working, not ruled.** Next session draws `?nav=v2`; the RFC follows Imran's look. DES-152 stays OPEN |

| F3 (navigation settled) | 2026-08-21 | Imran, with Claude | **The navigation model ruled after research into how the category solves it.** Six pages become five plus an unpinned Done: **Desk · Today · Scheduled · Assignments · Important · All**, each locking its own axis and freeing the rest, over the folders. Recorded as DES-152, with the machinery — a page *is* a view, Settings is a pin list, custom views are NEEDS BACKEND — as DES-153. The research that moved it: Microsoft's users are documented as confused by My Day versus Today because one is curated and one automatic, which is Dana's own Q1, and the finding that **mixing sources is fine while mixing questions is not** — so Today (what am I doing) and Scheduled (when is it due) are two pages and the pull survives. Things 3's Anytime was considered and rejected as Planned + Tasks reborn. The naming deadlock broke on one distinction: **copying a coinage differs from using the common word**, so Today, Scheduled, Important and All are taken as plain English while "My Day" and "Assigned to me" are left to Microsoft. Desk replaces Inbox and joins the page block rather than the folders, being native and undeletable; Assignments replaces People, which Imran ruled "conveys community and connections, not assignations", leaving the footer's People screen untouched. Assignments defaults to everyone grouped by person rather than to the viewer, and its "from [A]" half is honestly the creator, Dana recording no assigner. Frozen 4 and 7 still take zero edits | **Model approved; the drawing is owed.** Next: `?nav=v2` for his eye, then the filter rebuild of DES-153, then the RFC before V9 |

| F4 | 2026-08-22 | Claude, for Imran | **The navigation model drawn as the default, and five settled behaviours moved onto their mechanisms (DES-154).** DES-152's sidebar — Desk · Today · Scheduled · Assignments · Important · All, Done unpinned — is what the plain URL now shows, with `?nav=v1` kept as the comparison instrument. Built this stretch: one `TaskSection` for computed and hand-made groups alike, all collapsible, optional glyph or face; Scheduled's time ladder as headings rather than a scope control, with the reasoning that Today is already the first rung; All carrying completed work collapsed; Desk stripped of everything social on INV-2's authority; the FAB wired to create a real task with per-page entry defaults and confined to the three pages with no capture row. **Five bugs found by testing rather than by looking**, each a rule applied in some places and forgotten in others: nine task lists could not open a task by tap (fixed by making `onTaskOpen` required, which is what named all nine); a folder's chosen glyph stopped at the sidebar's edge; the Desk fallback was written twice and only one copy was right; `useCardWiring` kept every edit in local state so a rename in a surface was discarded on close; and the icon wrapper painted the static drawing and the animated overlay together, which is why every glyph read as doubled. Shell pass begun: tonal separation for the hairlines, the repeat picker's weekday row regridded after it was measured overflowing its panel by 24px, and avatars given a deterministic per-person tint from the existing folder swatches. Two prototype-scaffolding leaks removed from user-visible copy and the sweep taught to assert against them | **Open — Imran's look owed on the drawing.** Context handed over in "Where the next session starts". Sessions consolidated to one at his instruction; two concurrent sessions had been editing this tree and colliding |
| F5 | 2026-08-22 | Claude, for Imran | **A long session: the shell pass closed, the filter rebuilt, Settings rebuilt as the pin list, and sixteen rulings taken (DES-155 to DES-170).** The shell pass: the mark became one component after F4's fix reached the six system pages and left the folder page it was extracted from still wearing the old tile (DES-155); tab hover inverted to move *toward* the active tab's white; the attachments pair became one control repeated. **The filter rebuilt whole** against DES-153 — multi-value people axes, five named date ranges plus a custom one drawn on the shared calendar, repeating, created by, group by, sort by, Save as view, and a readout of removable chips in the window bar — with grouping ruled to **replace** a page's arrangement rather than nest inside it (DES-156). **Settings became the pin list** (DES-170): every view read from the model, Abandoned and Anytime added as unpinned views that both render, Completed refused because Done already is it, Desk unpinnable by rule. Then Imran audited the work and found that **the consistency audit had gone blind** — it reported PASS over four real folder-mark violations because its matcher could not see a tag whose props wrapped onto the next line. Every rule now carries a probe it must catch or it fails as BLIND (DES-157), and the mechanism caught its own replacement rule on the first run. **Undo became real** (DES-158): one bar naming the act, Ctrl/Cmd+Z, no redo, entries registered by the shell's own mutators so every page has it without knowing; six dead controls left the card footer with it. **One drawing, one name** (DES-159): the two alert glyphs were the same lucide drawing under two names carrying two meanings, and both animated into a triangle. **The conversation went onto shadcn** across four passes, the last two read off the published docs rather than remembered (DES-160): the missing Textarea and InlineField primitives, InputGroup, Message/Bubble, a `commit` Button variant replacing seven copied class strings, and the avatar and icon-button collapsed from two definitions each to one. Links became a real attachment kind (DES-161) after a pasted link rendered as a row offering to Download itself. Icons gained a default size (DES-162) after menu glyphs were measured at 24px or 16px depending on whether the author had remembered to set one. Eight dead "new task" paths were closed (DES-163); the calendar's chrome thinned from 56px to 44 and aligned to Dana's own date picker (DES-164); the folder page's sections moved onto `TaskSection`, which is what unlocked icons on user-made sections (DES-165); tasks became draggable between sections and the section shows on the row as a path (DES-166); the cover affordance stopped hiding on any folder that had been dressed (DES-167); a section can now be the first thing on a page (DES-168); and sections survive leaving the page (DES-169). | **Open — Imran's look owed on all sixteen.** Both gates green throughout: 9 audit rules, 25 sweep routes, typecheck and build. Next is sidebar drag, the one item on his original list still untouched |
| F6 | 2026-08-22 | Claude, for Imran | **Sidebar drag built — the last untouched item on Imran's original list — then the rest of the list worked down. Six rulings, DES-171 to DES-176.** Folders now reorder, move in and out of groups, and two held together become one; the alphabet became the *seed* rather than the rule, so an untouched sidebar reads exactly as it did and the clean-handoff export is unchanged, and groups and loose folders are one ordered list because they share a column (DES-171). The drag engine gained the half of `onDropAt` F5 never wrote: `onOver`, asked as the pointer moves, so a list stops holding a gap open for a row that is going somewhere else — a list that lies about what a release will do is worse than one that cannot do it. A **task tab has a window bar** (DES-172): its folder and section on the left, which is the first true thing the reserved breadcrumb slot has ever held, and its own controls on the right, *moved* out of the page header rather than copied; its tab wears its folder mark, and Abandon and Delete reach a tab for the first time. **Page descriptions are editable** (DES-173) — promised by `nav-model` since F4, never built, and now the folder page's own control shared rather than a second one; clearing restores Dana's sentence. **The board's cards move** (DES-174) on the same engine and the same resolver as the list's rows, and Done is a column that means a status: drop on it to complete, carry a card out to reopen. **People took its own mark** (DES-175) and the footer's two screens moved into `nav-model` so the collision rule can see them. **The shell's last hairline is gone** (DES-176). Two gaps found by testing rather than looking: `TaskListWiring` had been missing `onNewFolder` and `onRegisterOpen` since F4, so a `renderRow` screen reaching for them was told they did not exist; and the folder page kept a dead `editingDescription` state after its control moved. The sweep grew two driven blocks — the sidebar's three gestures and the board's cards — each watched to fail against a deliberately broken build before being trusted  **Then Imran ruled the two he had held back and handed over the two he had no view on, and F6 continued.** Desk wears a desk lamp (DES-181), resolved through the one place a folder's native mark is decided — the page tab had been importing a glyph of its own, DES-155 in miniature. **The view controls got their rule** (DES-177), the item he said had no decision behind it: a view is a *shape*, not a question, so it is offered when it can draw everything the page holds and refused when it would collapse to one group. That gives list everywhere, a calendar only on Scheduled, and a board wherever there is a grouping — and it retired three private switchers for one strip in the bar, plus the folder page's disabled calendar, which was refused on principle rather than unbuilt. One board component now serves the folder's sections and every other page's grouping alike, and dropping a card in another column takes that column's value: another folder, another person, another day. **DES-122 is closed** (DES-178): a due date is a day, with a due-time and a start date deferred rather than dropped, so the RFC narrows the interface without dropping the data. The two questions he handed over were ruled: **a filter belongs to the page and to the session** (DES-179) — never carried to another page, kept on the way back, because the chips make it visible — and **an arrangement is a person's** (DES-180), which is what a folder group already is. | **Open — Imran's look owed on DES-171 to DES-194.** Both gates green: 9 audit rules, 25 sweep routes plus the filter panel, the sidebar drag, the board, the view rule page by page, and a filter watched to stay put. **Then Imran looked at the boards and found the capture missing everywhere but a folder** — and observed that a board with per-column capture does not need the floating button. Both answered as DES-182: every column takes a task *with that column's value*, a new column is offered only where a column is a thing a person makes (a folder, a section — never a person or a date), and the button retires in board view on every page. Building it exposed the fault underneath: **a task made on Today never appeared on Today**, because the button set a due date while Today's spine is membership — and nobody had seen it because the button opens a surface over the page it has just failed to add to. Scheduled and Abandoned were worse in the same way. Entry defaults are derived from the spine now, page by page; Done and Abandoned offer no capture at all. Two further defects found by building rather than by looking: a blank assignee was read as somebody, so grouping by person opened with a nameless heading over the unassigned work; and the board's hideCreate condition was a precedence bug that made the change a no-op until it was measured. **Then V3's brief, open since the session was chartered, mostly closed.** Four of the review's row findings turned out to be one rule (DES-183): **a row says what its page does not.** Done stopped echoing a spent deadline under headings that already group by completion; Important's star dropped its fill on the one page where it can distinguish nothing; Carried over kept its words and lost its red, because a warning true of every row warns nobody; and the mirror image, an unfiled task, finally says Desk. The section chip has behaved this way since DES-166 and this is that decision generalised — decided per list, never per row, because a row cannot see the heading above it. **The page and the grouping both speak and they merge**, which is where the fault would have returned: the page's half reached the six bespoke screens and stopped the moment somebody grouped one, since grouping swaps the screen. **The board's card is the row's kin** and the rule reached it only after the check said so — Important's board was still drawing six gold stars an hour after the row was fixed, which is the argument for writing the check in the same session as the rule. R5 closed with them: the relative ladder had been written out three times, and the *rung* is shared now while the *words* are not, because a row says "Due tomorrow" about one task and a heading says "Tomorrow" about a bucket. **And the state sheet — V3's stated deliverable — was still v1's** (DES-184): a row this product no longer draws, four "interaction states" that all rendered identically, and two states that rendered nothing. The lies were load-bearing: five props survived on the shipping row's contract, accepted and ignored, carried only so that page would compile. All five are gone, the sheet renders the shipping row, hover and focus are *done* rather than drawn, and it left the audit's lab exclusion — where it had drifted for four sessions with nothing able to say so. **Then Imran looked at all of it and found seven more, 2026-08-23 — six faults and one ruling.** **One task, one copy of it** (DES-185): a note or a step typed into an inline row never reached the sidebar, because `useCardWiring` had reported edits upward since F4 and only two callers ever passed it a handler — the floating surface and the tab. Every inline row on every screen had no write path at all. Threading one would have meant twenty-four list call sites in eleven files and hoping the twenty-fifth remembered, so the shell publishes its write path as a context; the repository's usual refusal of contexts does not apply, because this is one function with one owner rather than a value read in fifty places. The shell was also dropping most of what it was told: its patcher knew five fields and discarded the rest, and a row's props carry a step *count*, so `toConceptTask` had been inventing the steps — a task could round-trip and come back with its steps renamed. **The right panel makes the page shrink** rather than covering the row the task came from (DES-186). **Twenty-nine icons stopped morphing** (DES-187) — the filter was three lines at rest and a funnel under the pointer, Settings sliders and then a gear, Folders opened, the grip became an ellipsis. Each was a near-enough substitute picked when the animated library had no exact twin, which is the reach DES-159 already ruled against; that rule guarded one pair, and this is the axis it could not see — one name for two drawings, half a second apart. A tenth audit rule renders both and compares them, because lucide keeps aliases beside their replacements and `CheckCircle2` and `CircleCheckBig` are one picture. **The star is graphite everywhere** (DES-188), and the inconsistency was mine: DES-183 took the gold off Important the same day and left it everywhere else. The colour was carrying nothing the fill was not already saying. **Row height finally has a control** (DES-189) — DES-113 settled it in Settings, the module store was written expecting one, and it was never built, so the preference existed, was honoured everywhere, and could not be changed by anybody. **Folder groups drag** (DES-190), which DES-171 half-built: a group already made space as folders passed it and was the one entry that could not be picked up, and a row that moves for you but not by you reads as broken rather than as restricted. **And the filter's honesty line left the panel** (DES-191) on Imran's reasoning that a caveat in the product is also a way of not dealing with it. He settled two open items in the same message: the chip order under a title "looks right" (L2) and Important and Done "look good" at the measure (L5). **Then two corrections from him on the icons and the prose, 2026-08-23.** The icon rule left two ways to satisfy it — change the animation or change the drawing — and F6 took the drawing every time, spending the motion on twenty-nine glyphs to keep pictures that were not always the better ones. Imran: "I want the icons that are removed instead coz they were strong, especially for filter and settings." **Nine went back to their animated drawings and animate again** — the filter is a funnel, Settings a gear, three renamed with their picture — while **twenty stay plain**, each because the animated twin would have changed the meaning or landed on a name already in the module: abandoned is not "unflagged", a grip is not an overflow menu, `ListPlus` without its plus is a list, and four would have collided with `ListChecks`, `History` or each other. Every reason is written beside the code so the next person meets the judgement rather than the outcome, and one — `CircleAlert` animating as a *triangle*, the exact morph DES-159 removed — is left flagged for Imran rather than quietly reversing a ruling of his. The swap surfaced a collision the new rule caught at once: `Globe2` and `Globe` became two names for one drawing the moment the first moved (DES-192). **And two paragraphs on a page sat 32px apart** (DES-193), more than one and a half of their own line-heights — a section break drawn by accident. The insert strip did not know what it was separating: 24px is right between blocks and wrong between two sentences that continue one another. Prose runs on at 16px now and a section heading after it still gets 36. The Travel fixture gained a second paragraph in the same pass, because a page with one could never show the gap between two, which is why this was reported twice before it was measured. **And W2 closed, the last of V3's brief** (DES-194). It had been carried as "a claim to check rather than a thing to build", and both slots turned out to be shut. The chips were eight conditionals in one JSX block: nothing declared what the family was, the order lived in the source sequence where nobody could review it, and `bare` restated all eight conditions by hand and had already drifted — it still counted notes and attachments, which stopped being chips when the card took them. As a list the order is data, suppression is declared beside the chip it silences, `bare` is derived, and an eleventh audit rule holds it, because the next chip is easiest to add exactly where the last eight were. The assignee menu was three names from the row lab — the `folderLibrary` fault one axis over, with the same symptom: it said "Sara" and "Hassan" while the People screen said "Sara Khan" and "Hassan Ali" — and it had **no Unassigned at all**, so a row could take an assignee and never let one go. One roster in the fixtures now, and the way out sits last after a separator, where "New folder…" sits. Neither slot was populated with the vision's agent or its waiting/blocked states: W2 asks for the shape, and drawing the contents would be inventing product (DES-119). **V3 and V1 are now complete**, and what remains is the design phase's own close — V8, V9, V10 — and then the spec change. **One sequencing correction, on Imran's question at the close of the session:** the six-pages review had put the navigation RFC *before V9's reference set*, and that is wrong — V9 writes design records and never touches `docs/spec/`, this plan already keeps normative material out of the design phase (B3 owes its sentence "before the port"), and RFC 0002 is the precedent one level up, where the whole v1 spec delta lived inside the port RFC. The design is also not approved, and spec text written against a drawing that may still move is how a specification comes to describe a design that changed underneath it. Corrected in both documents; the review's real point — its own RFC rather than a rider on a restyle — survives untouched |
