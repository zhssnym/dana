# Dana UI v2: decision register

The running record of decisions made during the v2 refresh, opened 2026-08-17.
It continues the `DES-` numbering of `design-contract.md`, which ends at
DES-092, and is folded into that file at session V9 of
`v2-refresh-plan.md`. Until then this is the live list and that file is v1's
settled contract.

Statuses are `design-contract.md`'s own: `OPEN`, `PROPOSED`, `APPROVED`,
`LOCKED`, `SUPERSEDED`.

## The two lanes

Every idea entering the refresh goes into one of two lanes, and the lane is
decided by one question: **can the shipping product do this today?**

**Lane 1, design-only.** Everything the current data model, the section 7 API
and the shipping server already support. This is presentation, composition,
copy that section 9 leaves free, emphasis, density, and behaviour that lives
entirely in the client. It follows the normal flow: designed in
`prototype-v2`, reviewed by Imran, recorded as a DES entry here, folded into
the contract at V9, ported to `app/` under the later RFC. No backend
conversation, no waiting.

**Lane 2, needs backend.** Anything that would require a new column, a new
table, a new endpoint or a changed response, new permission rules, or new
server behaviour. These are recorded here as `PROPOSED` and carry the
**NEEDS BACKEND** flag with the four facts Hassan needs, listed below. They
are never ported on a design session's say-so; they become real through the
repository's own change process, an RFC that amends the specification, and
until that RFC is accepted the idea stays a proposal however finished it
looks on screen.

**A Lane 2 idea may still be drawn.** The prototype runs on fixtures, so it
can render anything, and seeing an idea is usually what settles whether it is
worth a backend. So a Lane 2 item may be built in `prototype-v2` for review,
clearly marked as a proposal in its DES entry and in this register, and it is
excluded from the port by that mark rather than by being invisible. What must
never happen is a Lane 2 idea reaching `app/` because a session forgot which
lane it was in; that is the failure `design-contract.md`'s own PROPOSED
entries exist to prevent, and it is why the flag is on the entry rather than
in someone's memory.

## What a NEEDS BACKEND entry must carry

Four facts, so Hassan can price the work without reconstructing the idea:

1. **What the user does.** The behaviour in one sentence, from the person's
   side of the screen.
2. **What the product cannot do today.** The specific gap: the column that
   does not exist, the endpoint that has no arm for it, the rule nobody wrote.
3. **What it would need.** Data model, API shape, permissions, and any effect
   on the twelve queries of section 6 or the frozen sections 4 and 7. A guess
   is fine and is marked as one; the point is to name the surface area.
4. **What happens if it never ships.** Whether the v2 design degrades
   gracefully without it, or whether some other decision depends on it.

## Lane 1: design-only decisions

| ID | Decision | Status | Session | Ruling owed? |
| - | - | - | - | - |
| DES-093 | Expand a task in place, inside its row | OPEN | V3 | **Yes**, see below |

## Lane 2: needs backend

| ID | Proposal | Status | Recorded | Blocked on |
| - | - | - | - | - |
| — | *empty* | — | — | — |

### DES-093, expand a task inside its TaskRow

Imran's idea, recorded 2026-08-17 at the opening of session V3, investigated
the same day against the code, the specification and the acceptance suite.
**Verdict: no backend. Lane 1, and a ruling.**

1. **What the user does.** Opens a task without leaving the list: the row
   grows in place and shows everything `TaskForm` shows, notes, steps, folder,
   assignee, dates, reminder, repeat, history, completion, delete. The list
   around it stays where it is.
2. **What the product cannot do today.** Nothing about the data. Measured:
   the view queries return a `taskCard` (`app/src/shared/tasks.ts:858`) which
   carries step *counts* and a recurring *flag* but no notes, no step rows, no
   rule and no reminder; the full `taskDetail` (`:911`) carries all eight, and
   `GET /tasks/:id` already serves it. The client already fetches it on every
   edit-open through `useTask` (`app/src/client/api/queries.ts:312`), so an
   expanded row would make the request the sheet makes today. Reads are not
   rate-limited at v1 (10.4). **No new endpoint, no changed response, no new
   permission rule, no column, no table.**
3. **What it would need.** An owner ruling and spec text, because presentation
   here is normative: 9.3 says "the form is a dialog over the page it was
   opened from", 9.1's roles table fixes the form as a dialog, and 9.3's width
   sentence and the "Resize task form" name lose their subject inside a row.
   The route is 11.13's escalation, the one the four rulings of 2026-08-13
   took. On the suite: AC-182's text needs amending; AC-178, AC-179, AC-162
   and AC-182 have browser cases that address the form by its dialog role and
   would be rewritten; the criterion *texts* otherwise say "the task form" and
   not "the dialog", so the cost is tests rather than contract. One trap
   recorded rather than discovered later: `harness.ts`'s save barrier waits
   for the dialog to disappear, and with no dialog it would pass instantly and
   vacuously, quietly destabilising AC-169 and AC-170, the two criteria minted
   because a reminder was being dropped at save with the whole suite green.
4. **What happens if it never ships.** Nothing breaks. The right-side sheet of
   DES-025 remains and this becomes one more explored concept in the V3
   record.

**The question this turns on, and it is Imran's rather than a designer's.**
Seven of the places that open the form have no row to expand: the floating
add button, the four quick-add escalations, a calendar empty cell, the
calendar ghost (a projection whose real task sits elsewhere on the grid) and
a search result (whose task is generally not on the page beneath). So either
the sheet survives for those and the form becomes two artifacts, which
contradicts 9.3's own heading that create and edit are the same artifact, or
something else is invented for them. Every concept in V3 that carries inline
expansion has to answer this, and the answer is a product decision.

Three further problems worth knowing before choosing: the row's overflow menu
and the form's overflow menu share the normative name "More actions" and the
dialog's scrim is what currently separates them, a collision this repo has
already been bitten by once and wrote down; a form nested inside a row nests
list items inside a list item, which strains the accessibility shape 9.1
fixes; and focus management, escape and focus-return come free from the
dialog library today and would be hand-written for the first time.

Note for whoever picks this up: DES-025 chose the right-side sheet
deliberately in Session 5, but no record anywhere rejects inline editing, so
this is a fresh question rather than a re-litigated one.

## Carried from v1, still unresolved

These are `design-contract.md`'s existing Lane 2 items, listed so a v2 session
recognises an old proposal rather than opening it again as new. None of them
is v2 work unless Imran says so.

| ID | Proposal | Needs |
| - | - | - |
| DES-054 | Per-folder icon or emoji picker | A persistence field; no column exists |
| DES-055 | Custom task fields, attachments, content blocks | Data model, API, storage, permissions, security |
| DES-071 | Drag reordering of task rows and steps | A persisted position model and ordering rules for every view |
| DES-073 | Search across folders, group labels and steps | Mixed-result shapes, permissions, ordering, pagination, indexes |
| DES-076 | Immutable task audit trail (reopen, delete history) | An audit data model, retention and permission rules; v1 clears the fields it would need |

And the open owner rulings, which need a decision rather than a backend:
DES-032 privacy and terms destinations (**closed in v2**: pages drafted and
approved 2026-08-17, still to be routed in production), DES-033 sent-invite
placement, DES-034 exact email copy, DES-035 truncation notice copy, DES-084
whether an owner gets Leave or ownership transfer.
