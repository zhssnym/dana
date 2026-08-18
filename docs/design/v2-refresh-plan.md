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

Written 2026-08-18 at the close of session F1 (folder page and comments
concepts, run overnight at Imran's direction while he slept). Read this, then
`v2-decisions.md`, then run the prototype.

**Read first, in order:** `docs/design/v2-decisions.md` (DES-093 to DES-134;
the two-lane rule at the top governs everything), this file's ground rules,
then the two concept surfaces: `src/screens/folder-page-v2.tsx` and
`src/components/comments.tsx`.

**Everything runs from `docs/design/prototype-v2`.** `npm run dev` is the
prototype; `npm run typecheck` is `tsc -p tsconfig.app.json` — the root tsconfig
checks nothing. Nothing under `app/` changes in this plan.

### State

The row and its card are **finalised, ported, and committed** — the V3 tree
landed as `3b1f34a`, so the baseline is reversible history rather than a
working tree. On top of it, session F1 drew Imran's next round of ideas as
concepts, committed separately so they can be reverted without touching V3:

- **Comments on a task** (DES-129): a pinned block ending the expanded card —
  threads, one-level replies, file chips, and voice notes that really record
  and play. Two My Day tasks arrive with seeded threads (the grant review and
  the venue deposit).
- **The folder page as a page** (DES-130 to DES-133): cover (patterns /
  illustrations / real upload), a 21-glyph animated icon library with the ten
  token colours, a description field, rename-in-place title, one sticky
  top-right control cluster (views · filter · conversation · people · share ·
  overflow), sections and paragraphs after the blank row, a real board view,
  and no floating New task button. The picked mark follows the folder into
  the sidebar.
- **The folder conversation in both placements** (DES-134): end-of-page and
  side-panel, switchable live from the "Concept switches" card bottom-left.

**How to look:** `npm run dev`, then `/?state=folder&folder=Wedding` for the
folder page (the Wedding fixture is seeded with sections, a paragraph and a
conversation), the concept card bottom-left to flip comments placement, and
`?folder-page=v1` for the previous screen side by side. On My Day, expand
"Review community grant application" for the card's Comments block.

### Do these next, in this order

Reordered 2026-08-18, after Imran reviewed F1 and found it under-refined.
**`docs/design/f1-review.md` is the operative document now**: a hard critical
review of all six F1 concepts — findings H/K/S/M/Y/P, severity-tagged,
grounded in measurements against the contract — ending in the four-pass F2
refinement plan (DRAFT, awaiting Imran). Its diagnosis in one line: the
features are complete but speak four dialects where Dana has one voice.

1. **V1's measure ruling** — one sitting, the plan's own V1 steps. It now
   blocks all F2 layout work (review finding H6/P1: F1 repeated V3's mistake
   of running ahead of the measure).
2. **F2a — One voice.** Every F1 surface translated back into the tokens:
   the 40px cluster as docked flat chrome, one section-heading tier, system
   avatars/radii/badges, recording de-escalated. Exit: zero unexplained
   computed styles.
3. **F2b — Structure that works.** Positional insertion, sections and
   paragraphs on the sort engine, W5's one-capture-point ruling applied, the
   board reaching feature honesty or demoting to disabled.
4. **F2c — The brand layer.** Covers from the mark's own ribbon geometry in
   folder-colour tints (replacing the clip-art tier), the motion sweep, the
   first-run empty state, the thread committed to one metaphor.
5. **F2d — The verdict pass**, finding by finding; winners extract to
   `components/` under DES-124.
6. Then the standing queue: **V3's brief** (R1, R2, R4–R7, W2, the states
   page) and **V2, V4–V8** in the plan's order.

The rulings F2 needs, gathered in the review's last paragraph: commentary or
chat (DES-134) · whose identity a folder wears (DES-130) · covers from the
mark (H4) · the capture point's shape (S2/W5) · the measure (V1) · Rename's
second route (K5) · board task naming (Y5).

### Known faults and honest edges of F1, so they are not rediscovered

- **Uploaded covers do not survive a reload** — deliberate (an object URL,
  not storage; the picker says so). Patterns and illustrations persist.
- **Sections, paragraphs and new comments reset on navigation**, like every
  task fixture; the folder's icon, colour, cover and description persist in
  localStorage with the rename/delete presentation state.
- **The microphone path is verified by code reading, not by exercise** — the
  preview browser cannot grant mic permission. Denial shows the inline
  message; a grant records and plays back. Worth one manual try.
- **Calendar in the view switcher is a disabled control on purpose**, saying
  it arrives with V5.
- **The side panel is viewport-fixed** and will want a look below ~1100px
  width; the design phase is 1440px (this plan's scope line).

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
