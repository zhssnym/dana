# The v2 close-out review: what is left, looked at from every side

Recorded 2026-08-24, at Imran's instruction to "look 360 degree everywhere,
what's left and what should be done" before the backend sessions are planned.
Every claim below was checked against the thing itself — the plan's session
table, the decision register's two lanes, the F7 brief, the rulings track, the
prototype's source, the reference exports on disk, and the git history — not
against memory of them.

## The verdict in one paragraph

The design phase is **nearly closed but not closed**. What remains falls into
five piles: a last round of drawing work inside the prototype (§3, roughly one
session); the plan's own closing machinery — the stress pass, the reference
set, the two recorded verdicts (§4); a queue of rulings waiting on Imran's eye
(§5); the spec and process debts, including one stalled parallel session
nobody has noticed is stalled (§4); and the Lane 2 pile itself, which is in
good shape — almost everything that needs a backend **has** its frontend drawn
and priced-ready (§1), with a short deliberate list that has no drawing yet
(§2). Nothing here blocks starting the backend *planning*; several things
block calling the design phase *done*.

## Addendum, later the same day

Step 1 of the run order ran immediately (DES-222): **§3 is closed** — C4
fixed, C1/C3/S1 verified, C2 recorded superseded, S2/S3/S4 fixed, S5 drawn
as the `?headline=weight` instrument awaiting Imran's pick, W1's comment and
P1's scrollbars in the tokens, the `nativeButton` warning killed as a
mechanism, and the V8 stress pass now a repeatable sweep block. **Three of
§5's rulings landed**: cobalt moved to hue 242 (DES-215, delegated), Library
accepted (DES-220), and CircleAlert resolved as moot — it appears in no
shipping screen. **§4's messaging question is answered**: the surface stays
with Codex, boundary reaffirmed; nothing in it moves a backend decision.
What remains to close the phase: S5's pick, the DES-155→222 click-through
with V10's two verdicts, and V9's handoff package. The ramp-to-role
conversion stays with the dark session by design.

## 1. Requires backend, frontend already drawn — the priceable pile

This is what the Lane 2 pricing session with Hassan works through. Each line
is drawn in prototype-v2, reviewable by clicking, and carries its DES entry
with the four facts. Grouped by the system the backend would have to grow:

**Objects and their acts** (the DES-197 contract's server half)
- Duplicate, carrying a folder's contents by the copy rules — DES-198
- Trash with 30-day restore: a `deleted_at` state and a purge, for tasks,
  folders and shelves — DES-200
- The event log: actor · verb · time written by every act, read by Activity,
  History sheets and a task's footer — DES-199 (answers v1's DES-076)
- Addresses: a task's `?task=<id>` and a shelf's link as real routes —
  DES-201, DES-210
- Workflows: export is client-side, but import means create-folder-with-
  structure endpoints — DES-206

**Content and pages**
- Folder identity: icon, colour, cover, description — DES-130, storage
  question DES-105; covers on every place-page — DES-141
- Page blocks: sections, paragraphs, ordering, per-person arrangements —
  DES-132, DES-165/166/168/169
- Image blocks: object storage plus a quota — DES-202
- Editable page descriptions on native pages — DES-173
- Shelf pages: the per-person label plus its page (cover, icon, description,
  blocks, folder-row arrangement) — DES-195, DES-207, DES-219

**Conversation and social**
- Task comments: threads, replies, likes, files, voice notes — DES-129,
  DES-143, DES-146
- The folder conversation and its homes — DES-134, DES-142
- Links and attachments as first-class kinds — DES-161, DES-102/105

**A person's own things** (one conversation with Hassan, one settings shape)
- Profile picture — DES-204 · theme — DES-205 · row density — DES-113/189 ·
  12/24-hour clock — DES-121 · where a task opens — DES-138 · folder and
  shelf arrangement, sidebar order — DES-171/180 · pinned pages — DES-170 ·
  saved views ("Save as view" is drawn and wired) — DES-153. Per-page filters
  are session-scoped **by ruling** (DES-179); syncing them is a choice to
  make, not an oversight.

**Spec-level changes riding with the port**
- The navigation model — DES-152 (its own RFC, after the design phase)
- A due date is a day; due-time and start date deferred, not dropped —
  DES-178/DES-122. **This collides with the reminder tick**, which assumes
  `due_at` carries a time — see §2.
- Spec 9.4's sentence (the important-only switch into the bar) — B3, ruled,
  text owed

## 2. Requires backend, and has **no frontend yet** — the gap this review was asked to find

Six things, and it is worth saying that four of the six are *deliberately*
undrawn — the register's own rule is that a Lane 2 idea drawn before it is
priced becomes an assumption.

1. **Custom tags on a task** — DES-098. Recorded, never drawn, by design.
2. **A step as a first-class object** — DES-100: its own menu, promote to
   task. The lab drew neighbouring gestures (DES-103/104); the shipped
   prototype draws none of it.
3. **Notes that contain check items** — DES-101. Not drawn.
4. **The shared shelf (Option B / "Area")** — a link to send, members,
   permission cascading to the folders inside. Deferred by ruling, not
   rejected (DES-195/196: "nesting is affordable; inherited permission is
   not"). Item 15's sharing half lives here.
5. **Notifications — a genuine new find.** Nothing in the spec or the
   prototype tells anyone that they were assigned a task, mentioned in a
   comment, or handed a share. The moment comments ship, this exists as a
   product question: in-app, email, or both, and what a notification row
   looks like. No spec section, no drawing, no DES entry — it should get one
   before the pricing session so it is priced with its cause.
6. **Reminders under day-level due dates.** The prototype's reminder presets
   went day-level with DES-178, but production's reminder tick and `due_at`
   column assume a time of day. The RFC has to say what a reminder *is* when
   a date has no time — and if "remind me at 17:45" survives, that picker
   needs a drawing. Spec work first, possibly one small drawing after.

Also deliberately undrawn: **the AI seams** (vision W1/W2 — the open chip and
assignee sets, provenance-not-hue). Their deliverable is not a drawing but the
W6 "ground ready" note, which is owed at V9.

## 3. Design work still owed inside the prototype

One session's worth, none of it blocked on anyone:

- **V5 remnants (calendar):** the weekday header's one-step-up (C2) and the
  abandoned-cell treatment at month zoom — the cell still draws a
  line-through where the finding asked for opacity + glyph, no strike (C4).
  C1 (times prefixing timed chips) wants a verifying look; C3 ("+N more" as a
  real control) is done.
- **V6, whole (secondary and public):** Send-invite enabled/disabled states
  (S1), the Settings control column against the finding (S2 — Settings was
  rebuilt as the pin list since, so re-read the finding before "fixing"),
  the invite gate's duplicate count chip (S3), the email label dedupe (S4),
  the landing headline A/B (S5). Plus the Base UI `nativeButton` warning the
  two public screens still log.
- **V7 remnant:** the W1 comment is **not** in `tokens.css` — one accent, AI
  renders native. Two minutes, and it is the vision's anchor in the one file
  the port will read first.
- **V8, whole (platform and stress):** thin tokenized scrollbars (P1) — no
  scrollbar styling exists; the stress pass (360px sidebar with long names,
  100-character titles, a 50-step task, 20 folders in a group); the motion
  check against the tiers and a reduced-motion sweep (the mark honours it;
  nothing proves the rest does). The invariant sweep is green and is not
  this: it asserts rules, not extremes.
- **Colour by role:** 650 raw ramp references remain outside `components/ui/`
  (down from 813 when the rule was written). Every one is hand-work for the
  dark-colourway session; the first-pass dark theme behind the toggle
  (DES-205) is a sketch, not the approved ramp.
- **Standing faults, carried:** the card's collapse is not animated
  (DES-119); Vite's React plugin intermittently blanks the dev server on
  this Windows path (restart clears it); the `nativeButton` warning above.
- **Loose DES statuses to settle while closing:** DES-117 (the freed right
  panel — largely answered by DES-142/186, wants its status written),
  DES-131 (the control cluster — superseded by the window bar, should say
  so), L3 (the page strip — superseded by DES-139/217, should say so), L4
  (the quick-add rest state — verify the shipped row against the finding).

## 4. Records and process debts

- **V9, the handoff package**, untouched: fold DES-093 through DES-221 into
  `design-contract.md` (it stops at DES-092 today — about 128 entries to
  fold); update `screen-registry.csv` and `notes.md`; regenerate the
  reference set from one build — `v2-refs/` holds only V0's baseline and the
  naming map today — with Search actually captured, full-height Settings,
  foundation and state sheets; and write the **W6 ground-ready note**.
- **V10, the two verdicts**: the retroactive v1 line spec 13 item 33 has owed
  since the P8R merge, and the v2 line — recorded in `SESSION-LOG.md` after a
  side-by-side against production at 1.0.0. The design phase is closed by
  those two lines and nothing else.
- **The spec-change RFC**, its own RFC after the design phase closes:
  DES-152's navigation, DES-178's due date, B3's 9.4 sentence.
- **The rulings track:** B1 — Privacy and Terms are drawn and approved in the
  prototype but production's links still 404, and the track says this should
  not wait for v2; B2 — the public 404 copy split, still a ruling.
- **The messaging session has delivered nothing.** Its brief owed a diff on
  its five files, a parallel session-log line, and a handoff paragraph;
  `comments.tsx` is untouched since the baseline commit and no log line
  exists. Decide: revive it with the same brief, or take the five files back
  into the main line. Until then the conversation surface is frozen by a
  boundary protecting work that is not happening.
- **Housekeeping:** the stalled F6/F7 session should be archived (one-session
  rule); F7's own session-log line is owed when Imran's verdict closes it.

## 5. Waiting on Imran, in one list

- The cobalt ruling at `?view=swatches` — does folder cobalt move off the
  brand hue, 224 → 242 (DES-215)?
- **Library** as the sidebar block's name (DES-220 — offered, not ruled).
- DES-192's flagged icon: `CircleAlert` animating as a *triangle* — kept or
  reversed, it is your DES-159 ruling either way.
- The measure's formal eye (DES-135 was provisional; nothing since has been
  the promised look).
- The click-through: DES-155 through DES-221 — the plan's own rule is that a
  session ends with you looking, and everything since F4 is still waiting.
- Later, with the dark session: the dark ramp and the ten swatches' dark
  variants — a dozen judgements in one sitting.

## The order I would run it

1. **One prototype session** closes §3 — the last drawing work, ending with
   both gates green and fresh exports of the touched screens.
2. **V9** builds the handoff package and the ground-ready note.
3. **Your click-through and V10** — the side-by-side, findings returned if
   any, then the two SESSION-LOG lines. The design phase is closed here.
4. **The Lane 2 pricing session with Hassan** over §1 and §2 — every entry
   kept, cut, or deferred with a number on it — and out of it, the backend
   plan: the spec RFC (navigation, due date, 9.4) and RFC 0004's port plan,
   mirroring RFC 0002's machinery, packages and owners and gates. That plan
   is deliberately *not* written here; it is the next thing, and it should be
   written against this list once you have cut it.
