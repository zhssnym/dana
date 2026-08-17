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
| DES-094 | One icon vocabulary, shared by the row and the form | OPEN | V3 | No |
| DES-095 | Rename a task in place, in its row | OPEN | V3 | **Yes**, see below |
| DES-096 | Details on a second line beneath the title | OPEN | V3 | Depends on DES-095 |
| DES-097 | A motion scale in the tokens | OPEN | V3 | No |

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

### DES-094, one icon vocabulary shared by the row and the form

Imran's idea, recorded 2026-08-17 at session V3, drawn as concept I in the row
lab. **Verdict: no backend. Lane 1, and no ruling either.**

The idea as put: the row's detail chips become single icons, hovering one
gives you its words, and the icons are the same everywhere in the app,
including inside the expanded card.

The investigation turned up the thing that makes this worth doing, which is
that **the vocabulary already half-exists and nobody decided it**.
`components/task-row.tsx` and `components/task-form.tsx` independently reached
for the same three glyphs, Folder, ListChecks and Repeat2, and then diverged
where no one was comparing them: the form uses CalendarDays for a due date and
AlignLeft for notes, while the row draws a due date as bare text and has no
notes glyph at all. So this is not a proposal to invent an icon language. It
is a proposal to finish one and write it down, and concept I therefore adopts
the form's existing choices rather than nicer new ones.

Two exceptions are built into the concept rather than left to be discovered.
The due date keeps its words, because a date is the fact people scan a list
*for* and an icon you must hover to answer "when" trades the row's whole job
for tidiness. The assignee stays a round avatar rather than becoming a
UserRound glyph, because faces are recognised rather than decoded, and because
concept H's rule that shape carries kind has to hold.

**The cost that has to be weighed, not waved at.** Hover does not exist on
touch and Dana is a PWA. Icon-only detail is learned rather than read, so the
first week is worse than today's row even if the second month is better. And
reserving a slot per detail type — which is the whole point, because it is
what makes the glyphs line up in columns down the list — spends horizontal
width on details a given task does not have.

If this is approved it is a design-system decision rather than a row decision,
and it should be recorded as its own table in the contract, because the row is
only the densest place the vocabulary appears. It is also **separable**: it can
be adopted whichever row concept wins, including the current one.

### DES-095, rename a task in place, in its row

Imran's idea, recorded 2026-08-17 at session V3. Arrived as half of concept J
and was promoted to every concept in the lab once it existed, because it is
not really a property of any one row treatment. **Verdict: no backend. Lane 1,
and a ruling.**

1. **What the user does.** Clicks a task's name in the list and types. Enter
   keeps it, Escape puts it back. No sheet opens.
2. **What the product cannot do today.** Nothing about the data. Renaming is a
   title change through the same endpoint the form already uses.
3. **What it would need.** A ruling on the gesture, which is the whole of the
   cost. Today a click anywhere on a row opens the task. If a click on the
   title edits the title, then the row has two meanings depending on where in
   it you press, and the place you press for the commonest edit is the place
   you used to press to open. The lab assumes title-edits / elsewhere-opens,
   which is what Notion and Linear do, but nothing in section 9 says so and
   the browser cases that open a task by clicking its row text would need
   rewriting. Also unresolved: whether renaming in place is undoable, and what
   a rename does to a row that another person is editing at the same time.
4. **What happens if it never ships.** Nothing breaks; renaming stays a sheet.

Worth noting for whoever rules on it: this is the single most frequent edit a
to-do list receives, and it currently costs open, focus, type, save, close.

### DES-096, details on a second line beneath the title

Concept J, recorded 2026-08-17 at session V3. **Verdict: no backend. Lane 1.**

The title takes a full-width line of its own and the details sit beneath it,
quieter and smaller. It buys the one thing every other concept on the page
pays for: the title stops being truncated. It costs height, 64px against 44px,
so a viewport that held sixteen tasks holds eleven, and that trade is the
whole decision. It is entangled with DES-095 rather than independent of it,
because the reason a full-width title matters most is that you can then read
a long name *while you are renaming it*.

### DES-097, a motion scale in the tokens

Opened 2026-08-17 at session V3 because the row concepts needed durations and
`styles/tokens.css` had none. **Verdict: no backend. Lane 1, no ruling.**

Three durations and three easings, with the rule keyed to what moves rather
than how far: `--duration-fast` (120ms) for a colour or an opacity,
`--duration-base` (200ms) for anything that changes size or position,
`--duration-slow` (320ms) for a surface arriving from nowhere. Reaching for
slow on a hover means the choice is wrong.

The part that matters beyond the numbers: `prefers-reduced-motion` collapses
the tokens themselves at the source, so a transition written against
`--duration-base` stops moving without its component knowing anything about
it, and no future component can forget to honour the preference. This is why
it belongs in the token file rather than in the components that needed it.

Nothing in the v1 contract sets durations, so this fills a gap rather than
changing a decision, which is why it carries no ruling. It should be folded
into the contract at V9 alongside the palette and spacing scales.

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
