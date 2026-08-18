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
| DES-099 | The expanded card: one header strip, then Steps and Notes | OPEN | V3 | No |

## Lane 2: needs backend

| ID | Proposal | Status | Recorded | Blocked on |
| - | - | - | - | - |
| DES-098 | Custom tags or labels on a task | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-100 | A step as a first-class object: its own menu, promote to task | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-101 | Notes that can contain check items | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-102 | The card body as movable blocks, and an Attachments block | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-103 | Drag a task row; hold 1.5s on another to make a folder of both | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-104 | Make this task a folder; its steps become the tasks | PROPOSED | V3 | **NEEDS BACKEND**, see below |
| DES-105 | What an attachment may be, and which ones can be viewed | PROPOSED | V3 | **NEEDS BACKEND**, see below |

### DES-098, custom tags or labels on a task

Imran's idea, recorded 2026-08-17 at session V3, in the same breath as
withdrawing the agent-states concept: machine states are not the direction,
tags might be. **Not drawn.** It is recorded here first because the four facts
below decide whether it is worth drawing at all, and because a Lane 2 idea
that gets drawn before it gets priced is how a proposal turns into an
assumption.

1. **What the user does.** Puts one or more free-form labels on a task —
   `errand`, `waiting on Sara`, `Q3` — and then finds every task carrying one,
   across folders. The point of a tag is precisely that it crosses the folder
   it lives in; a label that only works inside one folder is a folder.
2. **What the product cannot do today.** Everything about this is missing.
   There is no tag column, no tag table, no join. Section 7 has no tag
   resource and no arm on any existing endpoint that would carry one. Folders
   are the only classification a task has and a task belongs to exactly one,
   which is the assumption the twelve queries of section 6 are written
   against: every one of them scopes by folder membership first.
3. **What it would need.** A guess, marked as one. A `tag` table plus a
   `task_tag` join, rather than a text array on `task` — the array is much
   cheaper and cannot be renamed, recoloured or listed without a full scan,
   and every product that took that shortcut has migrated off it. Tag CRUD, or
   tags embedded in the task write. New indexes for the crossing query. And
   one genuine design question that has to be answered before any of it is
   priced: **whose tags are they?** A task is shared, so a tag on it is either
   shared with everyone who can see the task, or private to the person who
   applied it. Those are different data models, different permission rules,
   and different products. Shared tags also collide with DES-073, the search
   proposal, which already owes mixed-result shapes and ordering.
4. **What happens if it never ships.** Nothing breaks. Folders, Important and
   My Day stay the only classification. But there is a live dependency on the
   V3 row decision worth naming now rather than discovering later: **several
   of the row concepts have no room left for a tag.** If tags are likely
   within a year, that is an argument for a row with somewhere to put them —
   concept J's second line, or the expanded card — and against the densest
   single-line treatments. If tags are unlikely, that argument disappears.

### DES-100, a step as a first-class object

Imran's idea, recorded 2026-08-17 at session V3. **Recorded only. Explicitly
not to be drawn or built yet, at his direction** — it is here so the thought
survives the session, not so it becomes work.

The observation was that a step row in the expanded card has no affordances of
its own. It can be ticked and that is all. It wants an overflow menu, and the
most interesting thing in that menu is **promote this step to a task of its
own**, for the very common case where something written as a step turns out to
be a job in its own right.

1. **What the user does.** Opens the menu on a step and picks Promote. The step
   becomes a real task and stops being a step.
2. **What the product cannot do today.** There is no endpoint that turns a step
   into a task. Section 7 has task arms and step arms and nothing that crosses
   between them, and the crossing is not a client-side sequence of two calls
   that anyone should be happy with: create-then-delete across two resources
   with no transaction leaves a duplicate on any failure between them.
3. **What it would need.** A guess, marked as one. Most likely one endpoint that
   does both halves in a single transaction, because the two-call version is a
   correctness problem rather than a convenience one. Then a pile of product
   questions that are cheap to ask now and expensive to discover later: which
   folder does the new task land in, the parent's or the inbox; does it inherit
   the parent's due date, assignee, or neither; is the parent left with a
   reference to it or is the link severed; and what a person sees if they were
   looking at that step on another device while it stopped existing. The
   ordinary menu items — rename, delete, reorder — are Lane 1 and need nothing,
   but reorder collides with DES-071.
4. **What happens if it never ships.** Nothing breaks. Retyping the step as a
   task and deleting the step is the current workaround and it is fine, which
   is a reason to be honest that this is a nicety rather than a gap.

### DES-101, notes that can contain check items

Imran's idea, recorded 2026-08-17 at session V3, in the same breath as DES-100.
**Recorded only, not to be drawn or built yet.** It is closely related to
DES-055, the v1 proposal for custom fields, attachments and content blocks, and
should probably be resolved as part of it rather than separately.

1. **What the user does.** Writes a note on a task and puts tickable items
   inside it, the way any modern editor lets you.
2. **What the product cannot do today.** Notes are a single plain text column.
   There is no structure in them to tick.
3. **What it would need.** A document model rather than a string: stored
   structure, a schema for it, an editor, and a migration for existing notes.
   This is the expensive kind of change, and DES-055 is where the cost was
   already acknowledged.
4. **What happens if it never ships.** Nothing breaks. Steps already exist and
   already tick.

**The question to settle before any of it is priced**, because it decides
whether this is one feature or two: if a note can hold check items, what is the
difference between a note check item and a step? Two tickable lists on one task
with no rule about which to use is a product that has to explain itself. Either
notes get checkboxes *and* steps go away, or steps stay and notes stay prose.
Answering that is cheaper than building either.

### DES-102, the card body as movable blocks, and an Attachments block

Imran's idea, recorded 2026-08-17 at session V3. **Drawn in the lab, and marked
here as a proposal because part of it cannot ship without a backend.** It is
live in every concept that expands: Steps, Notes and Attachments each carry a
menu on their heading with Move up and Move down, and each keeps its own
open state across a move.

Imran also asked whether the card could work "like a block in Notion, where
the user writes it and it appears". The useful answer is that **the question
contains two different products, and only one of them is affordable.**

**The cheap one, which is what is drawn.** A closed set of typed blocks —
Steps, Notes, Attachments — that the person can reorder. Each block already
knows how to render and edit itself. This gives most of what people mean by
"Notion-like", because the felt quality is that the card is a stack you arrange
rather than a form somebody laid out for you. The only new thing that has to be
stored is an order.

**The expensive one.** Notion's actual model: a document of arbitrary blocks,
any type, any depth, created by typing. That is a stored document schema, a
rich text editor, collaborative editing rules for a task two people can hold at
once, and a migration for every note ever written as a string. It is DES-055
and DES-101 and it has been owed since v1 because it is that large.

The limit of the cheap version, stated so it is chosen rather than discovered:
**you cannot invent a block Dana does not already have.** No table, no second
note block, no heading. Whether that is acceptable is the product question this
entry is really asking.

1. **What the user does.** Reorders the blocks in a task's card, and attaches
   files to a task.
2. **What the product cannot do today.** Two separate gaps. Block order has
   nowhere to live: there is no column for it, and it is not obvious it belongs
   on the task at all — see below. Attachments have nothing at all: no storage,
   no upload endpoint, no size or type limits, no permission rule, no answer on
   what happens to a file when its task is deleted, and no virus story. DES-055
   has owed the attachment half since v1.
3. **What it would need.** For order, one small decision that is bigger than it
   looks: **is the order a property of the task or of the person looking at
   it?** On the task, it is one column and everybody sharing the task sees the
   arrangement somebody else chose. Per person, it is a preferences row per
   task per user, which is a much larger table and a much smaller surprise. The
   drawn version is per person in spirit, since nothing is shared. For
   attachments: object storage, an upload path that never trusts a
   client-supplied content type, quotas, and the deletion cascade.
4. **What happens if it never ships.** The card falls back to a fixed order,
   which is what it had this morning and which nobody complained about, so the
   reordering half is a genuine nicety. Attachments are different: they are a
   real gap that people will hit, and they are already recorded under DES-055.

**Do not port the Attachments block from the prototype as if it worked.** It is
fixtures, drawn so the card could be judged with three blocks in it rather than
two, and it is excluded from the port by this entry rather than by anyone
remembering.

### DES-103, drag a row, and the 1.5 second dwell that makes a folder

Imran's idea, recorded 2026-08-17 at session V3 and **drawn in the lab**, in
every concept that expands. The gesture has two meanings and a dwell separates
them: drop a row straight onto another and the list reorders; hold for 1.5
seconds and releasing puts both tasks in a new folder instead.

The design note worth keeping is about the dwell rather than the folder. **A
gesture that changes meaning after a delay is a hidden mode**, and a hidden
mode is a bad idea unless it announces itself. So the target row fills a bar
over exactly the dwell duration and then says, in words, what releasing will
now do. The bar is not decoration; it is the entire reason the delay is not a
mystery, and if the ported version drops it, the feature should be dropped
with it.

Nothing happens on release. The drop opens a small panel that names the folder
and can be cancelled, because "I dragged a task slightly too far" and "I want a
new folder" must not be the same gesture with no way back.

1. **What the user does.** Reorders tasks by dragging. Holds one over another
   to group them.
2. **What the product cannot do today.** Two gaps. Manual order has no
   persistence at all and is DES-071, carried unresolved from v1: every view
   sorts by its own rule, and there is no position column to write. Grouping
   two tasks into a new folder has no endpoint that does it as one operation.
3. **What it would need.** For order, DES-071's answer, whatever it turns out
   to be, and it has to cover ordering inside *every* view rather than only the
   one being dragged. For grouping, one transactional endpoint that creates a
   folder and moves both tasks into it, plus the permission question: if the
   two tasks come from two different folders with different members, who is in
   the new one? That question has no obviously right answer and should be
   settled before any of it is built.
4. **What happens if it never ships.** Nothing breaks. Tasks are ordered by
   the view's own rule, which is what happens today, and folders are made from
   the sidebar.

**On 1.5 seconds specifically:** the number is a guess made to be felt rather
than defended. Judge it in the lab. Too short and a slow drag across a list
starts making folders nobody asked for; too long and nobody discovers the
gesture exists.

### DES-104, make this task a folder, and its steps become the tasks

Imran's idea, recorded 2026-08-17 at session V3, **drawn in the lab** on every
concept's overflow menu. The task becomes a folder named after itself, each of
its steps becomes a task inside that folder, and the original task stops
existing. In the lab you can watch one row become five, which is the fastest
way to judge whether it is a good idea.

It is the same shape as DES-100 in the other direction — that one promotes a
step to a task, this one promotes a task to a folder — and the two should be
designed together, because a product with one and not the other has a ladder
missing a rung.

1. **What the user does.** Picks "Make this a folder…" and confirms.
2. **What the product cannot do today.** No endpoint creates a folder from a
   task, and none turns steps into tasks. As with DES-100, a client-side
   sequence is not acceptable: this one creates a folder, creates N tasks,
   and deletes the original, and a failure anywhere in the middle leaves a
   person with a half-converted mess and no way to name what went wrong.
3. **What it would need.** One transactional endpoint. Then the decisions:
   what the new folder's members are (the task's assignee, the source folder's
   members, or just the actor); what each new task inherits, since the drawn
   version passes down the due date and assignee and that is a guess; whether
   the original task's notes, attachments and history are carried anywhere or
   destroyed with it; and whether this is undoable, which matters far more here
   than for DES-103 because **this one destroys something**.
4. **What happens if it never ships.** Nothing breaks; making a folder and
   retyping the tasks is the current path.

Recorded plainly: of everything drawn at V3 this is the most dangerous, because
it is one menu click away from deleting a task and its notes, and the panel
that confirms it is the only thing standing between a person and that.

### DES-105, what an attachment may be, and which ones can be viewed

Imran's question, 2026-08-17: can people attach images, GIFs, video and more or
less any file, with the viewable ones openable in place? **Yes, and the useful
part of the answer is what "viewable" has to mean.** The list side is drawn in
the lab; the rest is recorded here.

**Viewable is a decision the server makes, not a property of the file's name.**
Three tiers, and every file lands in exactly one:

- **Shown** — images and video: a thumbnail in the list, and the thing itself
  inline when opened, without leaving the task.
- **Openable** — PDFs and anything the browser has a viewer for: no thumbnail,
  opened in place on request.
- **Handed over** — everything else: an icon, a name, a size, a download, and
  no pretence that Dana can display a .docx.

1. **What the user does.** Attaches files to a task and views the ones that can
   be viewed without downloading them.
2. **What the product cannot do today.** Everything. No storage, no upload
   path, no size or type limits, no thumbnail pipeline, no permission rule, no
   deletion cascade. DES-055 has owed this since v1.
3. **What it would need.** Object storage rather than the instance's disk,
   because there is exactly one instance today and its disk is not a place to
   keep the only copy of somebody's file. An upload endpoint that decides the
   file's type by **sniffing the bytes**, never by trusting what the client
   declared. A thumbnail job for the first tier. Quotas. And the security rule
   that this whole entry exists to write down: **an SVG or an HTML file served
   inline from Dana's own origin runs as Dana.** Either those are sanitised, or
   they are demoted to the third tier and served with
   `Content-Disposition: attachment`. Serving user files from a separate origin
   is the version of this that is hard to get wrong.
4. **What happens if it never ships.** Nothing breaks; links in notes are the
   workaround, and they are a poor one.

### Withdrawn at V3

The **Actor and state** concept, which drew agent work in the row (waiting,
working, blocked, ready for review), was removed from the lab on 2026-08-17 at
Imran's direction. It never reached a DES entry and does not need one; it is
noted here so that a later session finds the decision rather than the idea.
The reasoning was that machine states are not the direction the product is
being taken in right now, and a concept lab carrying a direction nobody is
pursuing spends a reviewer's attention on a question that is not being asked.

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

**Revised the same day, and the revision is the interesting part.** The glyphs
were first drawn in reserved slots, one per detail type, present whether or not
the task had anything to put in them, so that they lined up in columns down the
list. The claim was that a column which always means one thing can be scanned
vertically, and "which of these repeat?" stops being reading. Imran read the
result as disorganised and asked for the icons packed to the right instead.

He is right about what he saw, and it is worth writing down why, because the
principle sounded good enough to survive a review it should not have. A task
with two details rendered as two marks adrift in a field of empty slots, and
the eye reads the gaps as legibly as the marks — so the row looked ragged at
exactly the moment the theory promised order. The vertical scan only pays once
you already know the alphabet cold, and it charges every reader on every row
until then. A benefit deferred to fluency, paid for by everyone before it, is
a bad trade for a product whose users open it a few times a day.

So the concept is now packed right, tidy per row, with no vertical scan. That
makes it a quieter idea than it was: what survives is the shared vocabulary
and the density, which was always the half that generalises beyond the row.

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

### DES-099, the shape of the expanded card

Imran's direction, 2026-08-17 at session V3. **Verdict: no backend. Lane 1, no
ruling.** It applies to whichever concepts expand, so it is recorded
separately from DES-093 rather than inside it.

The card first drew every property as its own row: folder, assignee, due,
reminder, repeat, then steps, then notes, seven bands of equal weight. That is
what a form looks like when nobody has decided what matters, and it made the
card tall enough that the two things a person actually opened the task to read
were below the fold of the card itself.

The card now has three parts, and the split is by kind rather than by taste:

- **One header strip** carrying everything that is a single short value —
  folder, assignee, due, reminder, repeat. Five answers, not five sections.
  Each is a chip that opens its own menu, so the strip is also where those
  values are changed.
- **Steps**, then **Notes**, each as its own block with its own heading and its
  own collapse. These two differ in kind from the five above: they hold as much
  content as the task needs rather than one value, and they are the reason
  somebody opens a task.

Both blocks **start open**. Collapsing exists for the person who has already
read the notes and wants them out of the way, which is a second-visit need; a
card that opens tidy and makes you ask again has optimised for the wrong
visit.

One consequence worth keeping when this is ported: steps are the items
themselves rather than a count, so ticking one inside the card moves the count
in the row behind it. A number that cannot disagree with the thing it counts
is worth more than the line of code it saves.

**Revised the same day: no rules inside the card.** The first version of this
structure still drew a hairline above the property strip, above Steps, above
Notes and above the footer. Imran asked for them gone, and for the card to feel
like a Notion page: spacing and hierarchy doing the organising, nothing boxed.

He is right, and the reason is worth keeping because it generalises past this
card. A rule is the cheapest possible way to say "these things are different",
and cheap is exactly the problem — it works without requiring the layout to be
correct, so it hides a spacing system that has not been thought through. Four
rules across a card this small also compartmentalise it into a database record,
which is the opposite of the feeling wanted from a task you opened to read.

What replaces them: a 16px gap between sections against a 2px gap inside one,
so proximity alone groups; headings a size smaller and a step greyer than the
content they own; and each section's content indented to sit under its heading,
so the indent says what the line used to. The section chevron sits at 40%
opacity until hover, which is what keeps a heading reading as a label rather
than a control.

The check on whether it is working, for whoever ports it: cover the headings
and you should still see where one section ends. If you cannot, the spacing is
wrong, and the fix is more spacing rather than a line put back.

**One shaded exception, added the same day: the details strip.** The five short
values sit on a graphite-50 band with a 10px radius, and it is the only filled
region in the card. This does not reopen the no-lines decision, it is the same
decision applied properly — the strip needs to read as one object rather than
five loose chips, and filling a region says that without drawing an edge. It
pays a second time on interaction, because the chips turn white on hover and a
white chip needs something to be white against.

The rule that falls out of it, for the port: **fill a region to group, never to
decorate, and never fill two regions in the same card.** A second band would
turn the shade back into the compartment the rules were removed for being.

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
