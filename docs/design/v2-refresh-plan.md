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

## The decision register

`v2-decisions.md` is the running record of what this refresh decides, opened
2026-08-17 at Imran's instruction that ideas needing a backend be recorded and
marked as such. It carries two lanes: design-only work, which follows the
normal flow through the sessions above, and **NEEDS BACKEND** proposals, which
may be drawn on fixtures for review but never reach `app/` without an RFC. A
session that finds itself designing something the shipping product cannot do
has found a Lane 2 entry, not a task.

## Rulings track (parallel, not blocking)

Runs beside the sessions, Imran with Hassan, independent of the restyle:

- **B1 — Privacy and Terms.** Owner copy plus a server route; the landing's
  links 404 in production today. Should not wait for v2.
- **B2 — Public 404 copy.** One normative string split by context
  (signed-out surfaces stop mentioning the sidebar).
- Anything a session escalates lands here with its finding ID.

## Session log

| # | Date | Who | Delivered | Verdict |
| - | - | - | - | - |
| V0 | 2026-08-17 | Claude, for Imran | prototype-v2 forked; font stack fixed so Inter Variable actually renders (A4); build green; deterministic capture tool at `prototype-v2/tools/capture.sh` with a duplicate check; 19 baseline captures in `v2-refs/baseline/` including the first real Search export; Privacy and Terms drafted as `?view=privacy` / `?view=terms` with a visible draft ribbon (B1, copy awaiting Imran). One review correction found during the fork: v1's stale exports are 02-11, not 01; the committed code matches 01 | **Closed 2026-08-17.** Font settled by record rather than by eye: DES-015 fixes Inter Variable and the fork diff shows the stack line as the only rendering change. Legal copy approved by Imran for v1 scope, ribbon removed. Found during the citation check and escalated separately: RFC 0002's spec delta was never folded into docs/spec despite the Implemented status, and spec 13 item 35 is double-claimed |
