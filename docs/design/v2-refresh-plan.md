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
- Anything a session escalates lands here with its finding ID.

## Where the next session starts

Rewritten 2026-08-18 at the close of session F2, when **Imran approved every
change from F1 through F2** — the folder page, the window bar, the task
surface, the conversation, and the whole polish sequence. Everything below
that line is settled; everything in "Do these next" is not yet begun.

**Read first, in order:** `docs/design/v2-decisions.md` — the two-lane rule at
its top governs everything, and DES-129 to DES-148 are this stretch's; then
this file's ground rules; then `docs/design/f1-review.md` for the findings
that drove it and the F2 plan's shape.

**Everything runs from `docs/design/prototype-v2`.** `npm run dev` is the
prototype; `npm run typecheck` is `tsc -p tsconfig.app.json` — the root
tsconfig checks nothing. `npm run build` before reporting. Nothing under
`app/` changes in this plan.

**How to look:** `/?state=folder&folder=Wedding` is the reference surface —
the folder page carries the cover, the mark, the window bar, sections,
paragraphs, the board and the conversation. On My Day, expand "Review
community grant application" for the card's Comments block, and use any
row's ⋯ → *Open in…* for the task surface.

### Settled in this stretch, approved 2026-08-18

- **The folder page is the reference design** (DES-130 to DES-133): cover
  (brand gradients, mark-geometry covers, upload, link, live Openverse
  search), a 42-glyph icon library in the ten token colours, description,
  rename in place, sections and paragraphs with positional insertion, a
  two-column board with movable sections, no floating New task button.
- **The window bar** (DES-139 to DES-141): a 36px strip under the tabs
  belonging to the window, left reserved for breadcrumbs, right carrying that
  tab's controls; one filter model for every place-page; covers native to
  every page except a task's.
- **The task surface** (DES-136 to DES-138, DES-146): a task in a surface is
  a *page*, not a row — its own header over the same `TaskCard`, wired
  through one `useCardWiring` layer. Three homes: dialog, sidebar, tab. Where
  a task opens is a remembered preference.
- **The conversation** (DES-142 to DES-146): two homes — a closed section at
  the page's foot, or a side panel under the bar. Mine on graphite-900,
  everyone else's on the graphite-50 wash, no hue. Likes only, actions level
  with the message.
- **Switchers are icon strips that collapse** (DES-137): one icon showing the
  current view, widening on hover or focus. One `ViewStrip` for all of them.
- **The type hierarchy** (DES-148): page title 24 · section heading 16 · task
  title 14 · all prose and row information 12. No off-scale sizes remain on
  the folder page.

### Do these next, in this order

1. **F3 — the other pages catch up to the folder page.** This is the largest
   remaining "one brand" gap and the obvious next step: My Day, Tasks,
   Planned, Important, All and Done still wear the v1 header composition
   beside the folder page's new one, even though they already have the window
   bar and can carry a cover. Bring their headers into the same family, then
   decide per page what the bar should hold beyond the filter.
2. **V3's own brief, still untouched since it was written.** R1 (the Inbox
   chip), R2 (Important's star at rest), R4 (carried-over overdue quieting),
   R5 (the date ladder), R6 (steps legibility), R7 (Done rows drop the due
   echo), W2 (the chip family as an open set) — and **the states page is the
   deliverable**, never rebuilt on the new row.
3. **V1's remainder**: L2 (the trailing metadata slot order, one pass on
   `task-row.tsx`) and L5 (sparse pages read intentional) at the 720px
   measure DES-135 now sets.
4. **V2 chrome, reframed by what has happened since**: L3 is no longer "does
   the page strip earn its place" but "the strip is a tab strip now, so what
   else does it owe"; L4 (quick-add rest state) inherits DES-133's question
   for the pages that still show the floating button; the collapsed sidebar
   rail still hides folder rows entirely, and the new folder glyphs are what
   would make a collapsed rail legible.
5. **Then V4–V8** in the plan's order, and **V9's reference set** last.

### Known open edges, written down rather than rediscovered

- **The shell sweep was built and reversed** (`03cd83e` → `5ce52a4`) at
  Imran's direction. Its findings survive as SH1–SH6 in `f1-review.md`,
  fixes explicitly *not* standing: several shell paths still set state
  nothing renders (row-body click, search result, the FAB, sidebar capture,
  calendar cells), My Day and Important have no quick-add, the New folder
  button is still the filled block, Settings has no Appearance section, and
  fourteen files still import `lucide-react` directly against DES-125. Any
  of it can return piece by piece on Imran's word — the answers are in
  `03cd83e`'s diff.
- **DES-135, the 720px measure, is still provisional.** `?measure=wide`
  restores DES-023's 1120px for a side-by-side.
- **Uploaded covers and recorded voice notes are session-only**; sections,
  paragraphs and new comments reset on navigation, like every task fixture.
- **The microphone path is verified by code reading, not by exercise** — the
  headless browser cannot grant permission.
- **Board cards do not drag between columns yet** (the columns themselves
  move). It is the one piece of F2b's "structure that works" still owed.


### Owed rulings, none blocking

- **DES-122 needs a spec ruling before the port to `app/`.** The design made a
  due date a day rather than a moment; production's due date carries a time, in
  the form, the section 7 API and the reminder tick. That is a specification
  change, not a restyle. Until it is ruled, the port keeps production behaviour.
- **DES-117** is still OPEN — one form, two presentations, and what the right
  panel is for.
- **Two icon substitutions** want a second look (DES-125): `GripVertical`
  became a vertical ellipsis, which sits close to the overflow menu's
  horizontal one; `Folders` became a closed folder, which says less than the
  stack it replaced.
- **The Lane 2 pile** (DES-098, 100–105, 112) is parked for a separate session
  with Hassan, after the UI refresh closes. Row density and time format both
  want the same account-sync conversation (DES-113, DES-121).

### Known faults, written down so they are not rediscovered

- **The card's collapse is not animated.** Opening fades in; closing is
  immediate. Two height mechanisms were tried and both computed zero in the
  shell while working in the lab. DES-119 carries the detail. It is a real loss
  against DES-097 and wants eyes on the layout, not another DOM query.
- **Vite's React plugin intermittently emits a broken absolute self-import** for
  HMR on this Windows path, which blanks the dev server with a 500. `npm run
  build` is unaffected. Restart the dev server to clear it.
- **The collapsed sidebar hides folder rows entirely** — their whole ancestor
  chain is zero-width. This predates all V3 work and is really a V2 (Chrome)
  question about what a collapsed rail shows.

### The rule that matters most

DES-124: **compare concepts in a lab, but move the winner into `components/`
the moment it wins — before finalising, not after.** V3 learned this the
expensive way. A concept still living inside its own demo file has no component
to port, and "just move it to the shell" then means writing the component
first.

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