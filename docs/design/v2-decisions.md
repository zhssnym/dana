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

| ID | Decision | Status | Session |
| - | - | - | - |
| — | *opens at session V1* | — | — |

## Lane 2: needs backend

| ID | Proposal | Status | Recorded | Blocked on |
| - | - | - | - | - |
| DES-093 | Expand a task in place, inside its row | OPEN | 2026-08-17 | Lane under investigation |

### DES-093, expand a task inside its TaskRow

Imran's idea, recorded 2026-08-17 at the opening of session V3. **The lane is
not yet decided**, which is why this sits here rather than in Lane 1: the
question is being investigated rather than assumed, and it moves to Lane 1 if
the answer is that nothing behind the API changes.

1. **What the user does.** Opens a task without leaving the list: the row
   grows in place and shows everything `TaskForm` shows, notes, steps, folder,
   assignee, dates, reminder, repeat, history, completion, delete. The list
   around it stays where it is.
2. **What the product cannot do today.** Nothing about the data, as far as the
   design can see; the same task, the same fields. What it contradicts is
   *presentation* that the specification fixes: 9.3 makes the form a dialog
   over the page, 9.1's roles table makes a task row a list item or a row and
   the form a dialog, and 9.4 says a row opens that task's form. An inline
   form is a different structure, so this needs an owner ruling and spec text
   under the item-37 route even if no backend moves.
3. **What it would need.** Under investigation. The two candidates: nothing at
   all beyond a per-task read that already exists, or a change to what the
   view queries of section 6 return so a row can render its own detail
   without a second request. The first is Lane 1 plus a ruling; the second is
   Lane 2.
4. **What happens if it never ships.** Nothing breaks. The right-side sheet of
   DES-025 remains, and this becomes one more explored concept in the V3
   record rather than a gap.

Note for whoever picks this up: DES-025 chose the right-side sheet
deliberately in Session 5, so this is a reconsideration of a decided question
rather than a blank one, and the reasoning there is owed a reading before this
is decided either way.

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
