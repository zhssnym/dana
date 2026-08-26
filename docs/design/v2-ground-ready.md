# The ground is ready: what the AI RFC will find waiting

W6's deliverable, written 2026-08-24 at V9. Dana v2 draws **no AI** — that is
DES-007's line carried forward, and the register withdrew the one agent-states
concept that approached it. What the refresh did instead is shape the ground
so that an AI feature, when its RFC comes, lands in seams that already exist
rather than being bolted to surfaces that never expected it. This page records
the five standing constraints (the review's W1–W5), where each seam lives in
the v2 tree, and what is deliberately absent.

## W1 — one accent; provenance, not a hue

Dana has one interaction accent, and AI does not get a second one. The
constraint is written where the port reads first: the comment beside the
accent ramp in `prototype-v2/src/styles/tokens.css` — *AI renders native, its
work drawn with the same ink as a person's, marked by provenance, never by a
second colour.* The folder swatches were re-hued (cobalt 224 → 242, DES-215)
precisely to keep the accent's meaning single; do not spend that meaning on a
machine.

**The seam:** provenance already exists as data. Every history event carries
an `actor` (`lib/history.ts`), every comment an author, and `lib/viewer.ts`
names the current person. An agent is one more actor name flowing through
records that already render actors — no new field, no new colour.

## W2 — the row's slots are open sets

The state-chip family and the assignee slot were cut as open sets and then
**made** open at DES-194: the chips are one declared list in
`components/task-row.tsx` (order as data, suppression beside the chip, an
audit rule holding the shape), and the assignee menu reads the real roster
with a way to unassign. An agent state ("waiting", "blocked", "delegated to
Dana") is one list entry; an agent assignee is one roster entry with a face.
**Deliberately not populated:** drawing those contents now would be inventing
product ahead of its RFC (DES-119's line).

## W3 — history is a timeline

"What happened to this thing" is one event log (`lib/history.ts`, DES-199):
actor · verb · time, written by the acts themselves, read by the window bar's
Activity, the History sheets and a task's footer. An AI act that goes through
the same mutators is recorded, attributed and undoable exactly like a
person's — the log needs a name for the actor, nothing else. The audit-model
backend for this is Lane 2 (DES-199, answering v1's DES-076).

## W4 — search stays palette-shaped

The overlay (`components/search-overlay.tsx`, DES-203) is a command-palette
shape: one field, grouped results by kind, keyboard-first, offering
destinations before you type. An AI answer or action is **one more group in
the palette**, not a chat surface grafted beside it. The grouped-by-kind
list is the extension point; the backend for reaching new kinds is Lane 2
(DES-073/DES-203).

## W5 — one always-visible capture point per page

Capture is disciplined: a quick-add row where the page has a natural landing
place, a column's own capture on boards (DES-182), the floating button only
on the three pages with neither (DES-133) — never two capture points for one
page. An "ask Dana" affordance must live by the same rule: it replaces or
inhabits the page's one capture point, it does not add a second. This is the
constraint most likely to be broken by an enthusiastic AI feature; it is the
one to defend in the RFC review.

## What is deliberately absent

No agent chips, no AI assignee, no generated-content surface, no chat, no
second hue — absent by decision, not omission (DES-098 withdrawn,
DES-119/194 holding the slots empty, W1's comment in the tokens). The
notifications proposal (DES-223) is the one adjacent system an AI feature
would likely lean on and is recorded, undrawn, in the Lane 2 pile.

The seams cost nothing while empty. The day the AI RFC is written, it should
cite this page and fill them — and if it finds itself needing a surface this
page does not name, that is a signal the feature is fighting the product's
grain, which is worth knowing before it is priced.
