APPROVED Carried by DES-113 |APPROVED Carried by DES-113 |APPROVED Carried by DES-113 |APPROVED Carried by DES-113 |APPROVED Carried by DES-113 |APPROVED Carried by DES-113 |APPROVED Imran, 2026-08-17, front end only |APPROVED Imran, 2026-08-17 |APPROVED Imran, 2026-08-17 |APPROVED Imran, 2026-08-17 |# Dana UI v2: decision register

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
| DES-093 | Expand a task in place, inside its row | APPROVED | V3 | Imran, 2026-08-17 |
| DES-094 | One icon vocabulary, shared by the row and the form | APPROVED | V3 | Carried by DES-113 |
| DES-095 | Rename a task in place, in its row | APPROVED | V3 | Imran, 2026-08-17 |
| DES-096 | Details on a second line beneath the title | APPROVED | V3 | Carried by DES-113 |
| DES-097 | A motion scale in the tokens | APPROVED | V3 | Carried by DES-113 |
| DES-099 | The expanded card: one header strip, then Steps and Notes | APPROVED | V3 | Carried by DES-113 |
| DES-107 | A fifth type size the contract does not name | APPROVED | V3 | Imran, 2026-08-17 |
| DES-108 | A CSS reset silently suppresses text sizes on every control | APPROVED | V3 | Imran, 2026-08-17, applied |
| DES-109 | The card has no Save button; the footer is a toolbar | APPROVED | V3 | Imran, 2026-08-17, undo in scope |
| DES-110 | The V3 question, reduced: is a task row one line or two? | SUPERSEDED | V3 | By DES-113 |
| DES-111 | A row is as tall as it needs to be | APPROVED | V3 | Imran, 2026-08-17 |
| DES-112 | What a selection can do, at both levels | APPROVED | V3 | Carried by DES-113 |
| DES-113 | Row density is a setting; two lines is the default | APPROVED | V3 | Imran, 2026-08-17, front end only |
| DES-114 | Every folder list ends in "New folder…" | APPROVED | V3 | Carried by DES-113 |
| DES-115 | An empty block is the control that fills it | APPROVED | V3 | Carried by DES-113 |
| DES-116 | Icon sizes: the card's metadata icons are 14px, not 16px | APPROVED | V3 | Imran, 2026-08-17 |
| DES-117 | One form, two presentations; the right panel is freed | OPEN | V3 | **Yes**, see below |
| DES-118 | The card is missing nine of the form's fields | APPROVED | V3 | Imran, 2026-08-17; header revised |
| DES-119 | What the port left behind, and why | OPEN | V3 | No |
| DES-120 | The three pickers open on the answer, not the instrument | APPROVED | V3 | Imran, 2026-08-18 |
| DES-121 | The clock is a preference; 12-hour default, whole day reachable | APPROVED | V3 | Imran, 2026-08-18, browser only |
| DES-122 | A due date is a day, not a moment | APPROVED | V3 | Imran, 2026-08-18; **spec ruling owed before the port** |
| DES-123 | One picker, wherever it is opened from | APPROVED | V3 | Imran, 2026-08-18 |
| DES-124 | Compare concepts in a lab; extract the winner the moment it wins | APPROVED | V3 | Imran, 2026-08-18, the default flow |
| DES-125 | The icon family is animated Lucide | APPROVED | V3 | Imran, 2026-08-18; two substitutions owed a look |
| DES-126 | The logo is a component; its mark draws itself on hover | APPROVED | V3 | Imran, 2026-08-18 |
| DES-127 | The mark has two colourways, for light and dark panels | APPROVED | V3 | Imran, 2026-08-18 |
| DES-128 | A step is a label; a note is a field | APPROVED | V3 | Imran, 2026-08-18 |
| DES-131 | The folder page's controls live in one small steady cluster | PROPOSED | F1 | Imran's look owed |
| DES-133 | The floating New task button retires where a quick-add row lives | PROPOSED | F1 | **Yes** — W5 names a capture point |
| DES-135 | The list measure is a reading measure: 800px | PROPOSED | F2a | **Yes** — Imran's eye at F2d; supersedes DES-023 in part |
| DES-136 | A task in a surface is a page, not a row | APPROVED | F2 | Imran, 2026-08-18 |
| DES-137 | A view switcher is a strip of icons; labels live in the tooltip | APPROVED | F2 | Imran, 2026-08-18 |
| DES-138 | Where a task opens is a preference, not a window manager | APPROVED | F2 | Imran, 2026-08-18, scope A |
| DES-139 | The window bar: chrome belongs to the window, not the page | APPROVED | F2 | Imran, 2026-08-18 |
| DES-140 | One filter, every place-page | APPROVED | F2 | Imran, 2026-08-18 |
| DES-141 | A cover is native to every page except a task | APPROVED | F2 | Imran, 2026-08-18 |
| DES-142 | The conversation has two homes; the page's is a closed section | APPROVED | F2 | Imran, 2026-08-18 |
| DES-143 | A message is told apart by tone, never by hue | APPROVED | F2 | Imran, 2026-08-18 |
| DES-144 | The row menu: every item real, and Abandon among them | APPROVED | F2 | Imran, 2026-08-18 |
| DES-145 | A paragraph belongs between a heading and its first row | APPROVED | F2 | Imran, 2026-08-18 |
| DES-146 | Three homes for a task; a like is the whole reaction set | APPROVED | F2 | Imran, 2026-08-18 |
| DES-147 | A popover is as wide as what it holds | APPROVED | F2 | Imran, 2026-08-18 |
| DES-148 | An affordance may not charge rent for unused space | APPROVED | F2 | Imran, 2026-08-18 |

## How Lane 2 is being run, decided 2026-08-17

**Imran's ruling: record them, do not chase them.** Everything in the table
below stays a written proposal while the front end is being settled. When the
design is finished enough to be worth pricing, a separate session takes the
whole Lane 2 pile at once, with Hassan, and turns whichever parts survive into
RFCs.

This is why no Lane 2 entry blocks a Lane 1 approval, and why a drawn Lane 2
idea in `prototype-v2` is not a commitment to build it. It also means the four
facts each entry carries are the deliverable for now: they are what that later
session will be priced from, so an entry with a vague third fact is an entry
that will cost time later.

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
| DES-106 | One verb for moving things between levels: **Move to…** | APPROVED | V3 | Imran, 2026-08-18: five verbs |
| DES-129 | Comments on a task: words, voice notes, files, replies | PROPOSED | F1 | **NEEDS BACKEND**, see below |
| DES-130 | A folder wears an identity: icon, colour, cover, description | PROPOSED | F1 | **NEEDS BACKEND**, see below |
| DES-132 | Sections and paragraphs organise a folder page | PROPOSED | F1 | **NEEDS BACKEND**, see below |
| DES-134 | A folder's conversation, and where it lives | PROPOSED | F1 | **NEEDS BACKEND**, see below |

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

**Accepted in principle by Imran, 2026-08-17, and generalised by him.** His
correction to how this was written: it is not one step becoming one task. It is
that **one or more steps can be turned into a task**, and that the same move
exists at every level — a task can be promoted, and so can a folder.

That makes this entry and DES-104 two instances of one idea rather than two
features, which is exactly what DES-106 proposes to name. The ladder as he
describes it:

> steps → a task · a task → a folder · a folder → promoted

**The third rung looked like it had nowhere to go, and Imran's answer is that
it already does.** Dana has folder groups. They are labels rather than
containers — DES-086 gives every custom folder a `Move to group` submenu whose
destinations are the viewer's existing labels plus `No group`, and the mutation
is `PATCH /api/v1/folders/:id/my-membership` with `{ label }`. Selecting one
moves the sidebar row and changes nothing else: not the folder, not its tasks,
not sharing, not anybody else's organisation.

So the ladder is complete without a new level, and the third rung is a
different kind of move from the first two:

> **steps → a task** and **a task → a folder** are promotions: the thing
> changes what it *is*, and the original stops existing.
> **a folder → a group** is classification: the folder is unchanged and simply
> gains a label.

Worth keeping that distinction visible in whatever is built, because the two
carry different risk. A promotion destroys something and needs the confirmation
DES-104 already has; a grouping is reversible with one more click and needs
none.

**Nested folders are explicitly deferred, not rejected.** Imran, 2026-08-17:
a real containment hierarchy is a separate future decision, to be taken on
worth against cost rather than because the ladder looked incomplete. Its cost,
sketched here so the later conversation does not start cold: a parent column
and a cycle rule, every one of the twelve section 6 queries becoming recursive
or being bounded to a depth, sharing and permission inheritance down the tree,
and a sidebar that has to render and reorder arbitrary depth. It is named here
so a later session recognises a deferred decision rather than opening it as a
fresh idea.

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

**Updated 2026-08-18.** The blocks moved onto the same pointer engine as the
task rows and the steps, `lib/use-sortable-list.ts`, so one gesture is learned
once at all three levels. The drop line went with it: the blocks either side
now move out of the way, which says where this one lands without drawing
anything, and the line had always competed with the shaded details strip above
it. The Move up and Move down menu items are unchanged and remain the answer
for anybody not using a pointer, alongside the grip's arrow keys.

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

**Rebuilt 2026-08-18, approved by Imran.** Three changes, in the order they
were asked for.

**The mechanics left HTML5 drag-and-drop** for a pointer engine,
`lib/use-sortable-list.ts`. The old API was why the gesture never felt
finished, and the faults were its own: a drag image the browser composites and
we cannot style, a `dragleave` that fires when the pointer crosses onto a child
so the target flickers, no auto-scroll, and nothing at all on touch. What it
gave back was a drop target, which is the least interesting half of the
problem. Now the carried row tracks the pointer exactly and the rows it passes
slide out of its way by its own height, so where it will land is *shown* rather
than outlined; on release it settles into the gap they left. The engine also
brought auto-scroll, touch, `Escape` to abandon, and arrow-key reordering from
the grips with focus following the moved item.

**The dwell now arms on stillness rather than on hover**, which is what makes
two gestures out of one drag legible: moving means reorder, stopping means
folder. When it arms, the list relaxes back to its resting order — a list still
holding a space open for a reorder you are no longer proposing is lying about
what happens next.

**The treatment is a folder rather than a sentence.** The bar this entry
argued for was right about *why* and wrong about *what*: it was three pixels
along the bottom edge of the target row, the least visible place on screen, and
nothing anywhere in the gesture was a folder — the idea was carried entirely by
the words "make a folder", which have to be read. The countdown and the folder
are now the same object: a ring closing over exactly the dwell duration around
the folder mark it is closing on, so what is about to happen needs no reading
and how long is left needs no second glance. On completion the badge fills; a
change of state, not of volume.

The badge rides **the row being carried**, not the target. It was on the target
first and was invisible there, because the carried row sits above it at exactly
the pointer. Raising the target above the carried row would have put a tinted
row on top of the one being moved, which reads as the wrong thing moving.

The paragraph above still stands with one word changed: if the ported version
drops **the ring**, the feature should be dropped with it.

**The panel was rebuilt too.** It was prose, an empty field and a disabled
button. It now carries the same folder mark the ring closes around, shows the
two tasks as themselves rather than counting them in a sentence, and always
has a name in the field — the longest word the two titles share, selected on
open, so Enter accepts and typing replaces. Nothing starts disabled.

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

### DES-106, one verb for moving things between levels

Imran asked for movable steps, multi-select, and options to make a new task
from a selection or to turn the selection into separate tasks here or in
another folder — and said he had not decided. **This is the recommendation.**
It is drawn in the lab so it can be rejected by using it rather than by
reading about it.

**The problem is not any of those commands. It is how many there are.**
Counting only what has been asked for in this session, the menu was heading
for: promote a step to a task (DES-100), make a task into a folder and its
steps into tasks (DES-104), make a new task from these steps, make these steps
into separate tasks here, and make these steps into separate tasks somewhere
else. Five names for one idea, which is always the same idea: *this thing
belongs somewhere else now.* A product that needs five verbs for one operation
has not found the operation yet, and every one of those five needs its own
menu wording, its own endpoint, its own confirmation and its own bug reports.

**The recommendation: one verb, `Move to…`, and the destination decides what
the thing becomes.**

Strengthened 2026-08-17 by DES-100's third rung: the rule already describes a
move Dana ships today. A folder moved into a group keeps being a folder and
gains a label, which is DES-086's `Move to group` — the same verb, a different
destination, a different outcome, and no new command. A rule that turns out to
cover behaviour written before the rule existed is a rule worth trusting.

> A step moved into a **folder** becomes a task, because folders hold tasks.
> The same steps moved into a **task** stay steps, because tasks hold steps.

Level is a consequence of where something lands, never a separate command.
Everything collapses into it: "make a new task from these" is Move to → New
task; "make them separate tasks in another folder" is Move to → that folder;
DES-100 is Move one step to a folder. The rule also extends without new menu
items the day Dana can hold something new — which is the real test of whether
a rule is a rule or just a tidier menu.

What it buys beyond tidiness: one endpoint shape instead of five, one
confirmation, one undo story, and one sentence in the help. What it costs: the
destination picker has to be good, because it is now carrying five features. If
it is a plain flat list of folders it will be worse than the five commands were.

**The picker's real constraint, from Imran, 2026-08-17.** The folders in the
prototype are four fixtures. A real person has an arbitrary number, and the
menu as drawn — every folder listed, every one carrying a sentence — stops
working somewhere around seven and is unusable at thirty.

So the direction carries a condition rather than being approved as drawn:

> **The destination picker is a search field with results under it, not a
> list.** It opens focused, typing filters, and the folders are ordered by
> recency rather than alphabetically, because the folder somebody wants next is
> usually the one they touched last.

Two things worth being clear about. First, **this is not a cost of the one-verb
model**: five separate commands would each need the same picker the moment one
of them said "move to a folder", so the searchable picker is owed either way.
Second, it is **why the picker is the part to build carefully** — under one verb
it is the whole feature, so a weak picker is a weak product rather than one
weak menu item.

**The alternative, stated fairly.** Keep the explicit commands. They are more
discoverable — "Make a new task from these" tells you exactly what will happen,
where "Move to… → New task" asks you to know the rule. For a person who does
this twice a year, the explicit version is genuinely kinder. The case for one
verb is strongest if Dana expects people to reorganise often; the case for
explicit commands is strongest if this is rare and the menu is where people
learn what is possible.

**Also drawn, and uncontroversial:** steps reorder by dragging their handle,
and multi-select is by clicking a step's *text* while the tick box still only
ticks. Those are two different intentions, and giving them one target is how
people complete things they meant to select.

1. **What the user does.** Selects one or more steps and moves them somewhere.
2. **What the product cannot do today.** Steps have no manual order to persist
   and no endpoint moves a step anywhere. Same gap as DES-100 and DES-104,
   which is the point: three entries, one missing capability.
3. **What it would need.** If this rule is adopted, one endpoint that takes a
   set of things and a destination, and does the whole move in one transaction.
   That is a smaller surface than the five commands it replaces, which is the
   main practical argument for it.
4. **What happens if it never ships.** Nothing breaks. Steps stay steps.

**RULED by Imran, 2026-08-18: five verbs.** Dana keeps explicit, separately
named commands rather than one `Move to…` whose destination decides the
outcome. DES-100 and DES-104 therefore stand as their own designs and each
needs its own name, menu placement and confirmation.

The case for the single verb is left below rather than deleted, because the
argument that lost is the one a later session is most likely to re-open, and it
should find the reasoning already weighed rather than fresh. The case against
it, which decided it: an explicit command says what it will do before you
choose it, and somebody reorganising twice a year should not have to know a
rule to move a step.

What the ruling does not change: the destination picker still has to be
searchable, for the reason recorded below — every command that ends in "…to a
folder" needs it the moment a person has more than about seven folders.

**The original framing, kept for the record:**

**What is being asked of Imran here is not which menu items to build, it is
whether Dana has one verb or five.** DES-100 and DES-104 should be resolved
together with this one, because if the answer is one verb, both of them are
already written and neither needs its own design.

**The decision is free to take now, which is the practical point.** All three
entries are Lane 2 and nothing is built until the backend session. The
prototype already draws the one-verb version, so choosing it writes an RFC
rather than any code, and choosing five commands would mean *more* drawing
rather than less. There is no version of this where deferring the decision
saves work.

It is also the cheaper mistake in the direction of one verb: if it proves too
clever in use, splitting it into named commands later is a menu change. Going
the other way, after people have learned five command names, is a migration.

### DES-107, a fifth type size the contract does not name

Found 2026-08-17 while bringing the expanded card onto the approved scale,
after Imran said the typography felt inconsistent with the brand direction. He
was right, and the cause turned out to be in two places rather than one.

**In the concept lab, which is now fixed.** The card had drifted to 11px, 13px
and 15px — none of which exist in DES-015, which approves exactly four steps:
24/32 page title, 16/24 section heading, 14/20 body and controls, 12/16
metadata. Every one of those is now on the scale, in the concepts and in the
lab's own chrome.

**In the shipping prototype, which is not.** `folder-row.tsx` and
`search-overlay.tsx` already use a fifth size, 10px (`text-[0.625rem]`), for
count badges, keyboard hints and section eyebrows, and the small avatar uses it
for initials. This predates the refresh and nothing in the contract mentions
it, so the product has a size nobody approved.

**The ruling wanted, and it is small but real:** either DES-015 gains a fifth
"micro" step at 10/12 with a stated purpose — badges, kbd hints and avatar
initials, never running text — or those components move to 12px and the size
disappears. Doing neither leaves the guide describing a product that does not
exist, which is how a type scale quietly stops being enforced.

Recommendation: name it. 10px is genuinely useful for a two-character avatar
inside a 20px circle, and 12px does not fit there. A scale that admits its
exceptions is followed; one that pretends they are not there is edited around.

**APPROVED by Imran, 2026-08-17: the fifth size is named.** DES-015 gains a
micro step of **10/12**, and it carries a stated job so it cannot spread:

> **10/12 is for marks, not for language.** Count badges, keyboard hints, and
> the initials inside a small avatar. Never a sentence, never a label somebody
> has to read to operate the product, and never a control's own text.

That last clause is the one that keeps it honest. The reason 10px is acceptable
on an avatar is that nobody reads "IW" — they recognise it. The moment a 10px
string has to be read, it is the wrong size, and the fix is to shorten the
string rather than to shrink the type further.

To fold into `design-contract.md` at V9 as an amendment to DES-015 rather than
a new entry, since it changes that decision rather than standing beside it.

### DES-108, a CSS reset that silently suppresses text sizes on every control

Found 2026-08-17 at session V3, chasing why an expanded task title carrying
`text-[16px]` kept rendering at 14px. **This is a bug rather than a design
question, but the fix is an owner decision, which is why it is here.**

`app.css` resets controls so they inherit the page's font:

    button, input, textarea, select { font-size: inherit; ... }

Those four lines are **unlayered**, and unlayered CSS beats layered CSS
regardless of specificity. Tailwind 4 puts every utility in
`@layer utilities`. So this rule silently wins against every text-size
utility applied to a button, input, textarea or select anywhere in the
prototype. The class is in the markup, the rule is in the stylesheet, and the
rendered size is the inherited one. Nothing warns; the code reads as if it
works.

**The fix is one line** — wrap the block in `@layer base`, which keeps the
reset doing its real job while letting a utility override it.

**Corrected 2026-08-17, and the correction matters.** An earlier note in this
entry said 54 of 56 controls would change size. **That was wrong**, and it was
wrong in the direction that made the fix look dangerous. It came from measuring
the page *after* applying the fix and assuming every control carrying a size
class was being suppressed.

Measured properly — comparing what each control's class asks for against what
it actually renders, with the bug still in place:

| View | Controls with a size class | Actually wrong today |
| - | - | - |
| Shell | 23 | **3** |
| States page | 3 | **3** |

The bug is real but mostly invisible, because `font-size: inherit` gives a
control its *parent's* size — and most controls happen to sit inside a parent
of the size they were asking for anyway. The class is still being ignored; it
just does not show.

**So the answer to "are they too big or too small?" is both, depending on where
they sit:**

- A control asking for 13px inside a 14px area renders 14px — **too big**.
  Two on the shell: the account button and "Done today (4)".
- A control asking for 14px inside a 12px area renders 12px — **too small**.
  One on the shell and all three on the states page: Restore, Remove from My
  Day, Retry.

**APPLIED by Imran's instruction, 2026-08-17.** The reset now sits in
`@layer base` in `app.css`, so it still does its job — controls inherit the
page's font rather than the browser's — while a utility can override it.

Verified after the change: the shell has 23 controls carrying a size class and
**0 now render at a size they did not ask for**; the states page has 3 and 3
correct. The six that moved:

| Control | Was | Now |
| - | - | - |
| Account button, sidebar foot | 14 | **13** |
| Done today (4) | 14 | **13** |
| Remove from My Day | 12 | **14** |
| Restore (states) | 12 | **14** |
| Remove from My Day (states) | 12 | **14** |
| Retry (states) | 12 | **14** |

Two of those were chrome written at 13px to sit below body text and rendering
at body size, so the intended hierarchy was simply not happening. The other
four are inline row actions written to match the task title beside them, and
they were rendering two pixels quieter than intended in exactly the place an
action needs to be findable.

**Three workarounds were removed with it**, which is the real payoff. The
expanded title's size had been forced with an inline style; the block
placeholders and the Move to… trigger had their labels wrapped in spans purely
so the size would land somewhere the reset could not reach. All three are gone
and the code says what it means again.

The lesson worth carrying past this entry: **the bug's cost was never the six
pixels, it was that the codebase had started growing workarounds for it.** Two
appeared in a single session before anyone knew why.

Note the overlap with DES-107: the suppressed sizes include 13px and 11px,
neither of which DES-015 names. Fixing the cascade would make two off-scale
sizes visible for the first time. The two entries should be settled together.

The concept lab does not depend on the outcome: the one size that had to
change is set inline, with a comment pointing here.

### DES-109, the card has no Save button, and its footer is a toolbar

Imran's call, 2026-08-17. **Lane 1 for the removal, Lane 2 for two of the
icons.**

**Why removing Save is right rather than merely tidier.** Every edit in the
card already commits the moment it is made: a rename on Enter or blur, a
property on choosing it, a step on ticking it. A Save button at the bottom of
a card that has already saved is a promise the interface cannot keep, and the
honest name for the button people press afterwards is Close. Removing it also
removes Cancel, because there is no uncommitted state for Cancel to discard.

**What replaces the escape hatch.** Undo and redo, which are not decoration
here: they are the safety net Save-and-Cancel used to provide, and the reason
it is safe to have no Cancel. If undo is not built, Save should not be removed.

**The row, and the reasoning per icon.** Undo, redo · copy link, share, email ·
history, full screen, close.

- **Full screen** is the most valuable of them and was Imran's own question.
  The card lives inside a list column, and DES-093's strongest objection is
  width: a form comfortable at 540px has to stack into something much
  narrower. An expand that opens the same task full-width answers that
  objection rather than arguing with it.
- **Copy link** is recommended as the primary sharing action, over email.
  Sharing usually means putting a link where a conversation already is, and a
  link works in every one of those places; email is one destination.
- **Share** and **email** are **Lane 2 and neither is small.** Dana shares
  *folders*: membership is a property of a folder, and a task has no
  independent audience. So "share this task" either invites somebody to the
  whole folder — which is not what the button appears to promise — or it is a
  new sharing model with its own permissions. Recorded rather than assumed.
- **History** answers "who changed this" and is where an undone change goes to
  be understood. `task-form.tsx` already reaches for the same icon.
- **Delete is deliberately absent.** The row's overflow already carries it, and
  this repository has been bitten once by two menus both called "More
  actions"; a destructive action in a second place is how that happens again.

**APPROVED by Imran, 2026-08-17, with undo brought into scope.** Removing Save
depended on undo existing, and rather than keep Save, Imran's ruling is the
other way round: **undo and redo become scope.** Where they need server work
they go to an RFC, in the Lane 2 session, and they are to be treated as part of
the refresh rather than as a nicety that might not arrive.

Two things that ruling adds:

- **Undo and redo must have keyboard shortcuts.** The conventional pair, and
  they have to work from the list as well as from inside an open card, because
  the actions that need undoing most — a bulk delete, a task turned into a
  folder — are started from the list.
- **The footer buttons are then a second route to the same thing**, not the
  only one. That is the right relationship: discoverable in the card, fast from
  the keyboard.

Still owed, and now the only part: spec text, since 9.3 describes a form with
Save and a dialog. It rides along with DES-093's escalation rather than needing
its own.

### DES-110, the V3 question reduced to one

Recorded 2026-08-17 at the close of session V3, when the lab reached two
candidates and Imran noticed. **Two is not what is left over; it is what the
lab produced.**

Seven treatments went in. They did not survive as seven separate answers
because most of what each was arguing for turned out to be either right for
all of them or wrong for all of them, and every time that happened the idea
stopped being a concept and became part of the baseline:

- **Renaming in place** was concept J's, and is now in both. Better than a
  sheet, and no concept should lose for lacking it.
- **Opening in place** was concept D's whole argument. Both rows do it, so D
  had nothing left to argue.
- **Editable details** were concept E's whole argument, and were the last
  thing separating the two survivors. Making J's second line editable — done
  the same day — removed the final confound.
- **The icon vocabulary** was concept I's, and merged into J when it turned
  out that a second line is exactly the room needed to put the word back
  beside the icon, which was the objection I could never answer on touch.
- **Actor and state** and **two lines on selection** were withdrawn outright.

What is left is one variable, and the page now says so:

> **Should a task row be one line or two?**

Everything else is identical between them by construction — same rename, same
expansion, same card, same chips, same selection, same drag, same motion. The
measurement that states the trade: the long sample title is 68 characters;
it truncates in the one-line row and does not in the two-line one, and the
one-line row is 46px against 66px, which is sixteen tasks per screen against
eleven.

**Why this is the right shape for the question.** A reviewer asked to rank
seven treatments compares finish, novelty and taste, and the answer is mostly
noise. A reviewer asked whether they would rather see more tasks or more of
each task's name is being asked something they actually know the answer to,
about their own list. That is the question the shared page now puts.

**What is owed:** the answer, and it is Imran's. Nothing else in V3 is
blocked on it — DES-095, DES-099, DES-106 and DES-109 all apply whichever way
it goes.

### DES-111, a row is as tall as it needs to be

Imran's refinement, 2026-08-17, on the two-line row: a task carrying no
details, no steps and no notes should be one line rather than two with a gap
in it. Drawn.

It changes what the two-line concept costs. The height was being paid by every
row in the list; it is now paid only by rows that have something to show for
it. In the lab's own sample that is one row of six, and in a real list of
quick captures it would be many more.

**What it trades, and this is the thing to judge:** the list's rhythm stops
being regular. A column of mixed 44px and 64px rows either reads as responsive
— each row sized to its content — or as ragged. That is a genuine judgement
about a real list rather than a sample of six, and it is the reason this is an
entry rather than a tidy-up.

Also done in the same pass, from the same observation that the chips were
dominating the title: the title takes medium weight (500, on the approved
scale) so it leads without changing size; the second line's icons go a step
lighter than its own text; and the note preview is reduced to its glyph with
the text in a tooltip. That preview was a whole sentence of prose competing
with the title directly above it, and was the single heaviest thing on the
line.

### DES-112, what a selection can do, at both levels

Imran's direction, 2026-08-17: "Move to…" alone was not enough on the
selection bar. Drawn, and the reasoning generalises.

**A selection is a held intention**, and the whole value of holding one is
acting on all of it at once. Offering a single verb makes a person leave the
mode and repeat themselves for everything else they meant to do, which is the
opposite of why they selected anything.

The set is what a to-do list can genuinely do to several things at once,
rather than a set chosen to fill a bar:

- **Tasks**: complete · important · add to My Day · move to a folder ·
  duplicate · delete.
- **Steps**: mark done · duplicate · move to (a new task or a folder, per
  DES-106) · delete.

Two rules the drawing follows and a port should keep. **Delete is last, behind
a divider, and is the only control that colours on hover** — it is the one
action here that loses work. And **the two levels offer the same verbs where
the verbs exist**, because a gesture that means one thing on a step and a
narrower thing on a task is a gesture people stop trusting.

Everything here is Lane 2 in the same way DES-103 and DES-104 are: bulk
operations need endpoints that apply to a set in one transaction, and a
partial failure across six tasks is a state the UI has no way to describe
today.

### Faces on people, at V3

Recorded here rather than as its own decision, because it is presentation with
no ruling attached: people are drawn with a picture rather than initials,
everywhere a person appears — the row, the second line, the card's assignee
chip, and every menu that lists people. Initials remain as the fallback,
because a real product has people who have not set a picture and that state
has to keep working.

The pictures in the prototype are inline SVG portraits, deliberately
illustrative rather than photographic, and generated in the file so the shared
build stays one document that asks the network for nothing. A fake photograph
of somebody who does not exist is a worse thing to put into a design review
than an obvious drawing.

### DES-113, row density is a setting, and two lines is the default

Imran's proposal, 2026-08-17, in answer to DES-110's question. **Ship both
rows and let the person choose.** Drawn in the lab in the shape of a real
settings row. **This supersedes DES-110**, which asked which row to pick.

**Why it is a good answer here and not a dodge.** "Make it a setting" is
usually how a team avoids deciding, and it usually costs two implementations
for one feature. That is not the situation. The two rows converged over the
course of V3 onto the same renaming, the same expansion, the same card, the
same chips, the same selection, the same drag and the same motion. What is
left between them is height and where the details sit. So this is **one layout
switch over one row component**, which is the only condition under which a
preference is cheap.

**The costs, named rather than discovered later:**

- Every future change to the row must be right in both. That is a permanent
  tax on the most-touched component in the product.
- The acceptance suite doubles at the seams: any criterion asserting a row's
  geometry now has two answers, and browser cases measuring height must say
  which density they are in.
- **They will drift apart** unless it is forbidden. The rule that keeps this
  affordable, and it should be written into the contract with the decision:
  *the two densities may differ in height and in where the details sit, and in
  nothing else.* The moment one grows a behaviour the other lacks, the tax
  stops being layout and becomes logic.

**Why two lines is the right default.** A default is for the person who has
not thought about it, and the two failure modes are not symmetric. The cost of
two lines is seeing fewer tasks at once — visible, and self-correcting: you
scroll, you notice, you go and change it. The cost of one line is a truncated
title, which is **invisible**, because you do not know what you did not read.
Defaulting to the mode whose downside announces itself is the safer half of
the choice.

**The open question, and the only thing owed: where the preference lives.**

- **In the browser** — Lane 1, ships with the refresh, and does not follow a
  person from laptop to phone.
- **On the account** — follows them everywhere, needs a column and an endpoint,
  Lane 2, and waits on an RFC.

**Ported to the shell 2026-08-17 and reverted the same night.** The preference
lived in `lib/density.tsx`, backed by localStorage, exposed through
`useRowDensity()` and set from a new Appearance section in Settings; the row
read the context rather than taking a prop, which is why no screen had to
change to gain the setting. **That module no longer exists.** The revert
(`89ca018`) took the whole port back so the lab would be the single source
until the design settled, and the density control now lives in the lab's own
settings block in `row-concepts.tsx`.

The shape is still the right one and the port should rebuild it that way.
Recorded here on 2026-08-18 because the revert commit did not touch this
entry, which left it naming a file the tree does not have — exactly the drift
DES-119's rule exists to stop, in the one commit that did not apply it.

Recommended: **the browser now.** A display preference that resets on a new
device is a small annoyance; waiting on a backend to see the feature at all is
a large one. Syncing it later is a clean, separate want and does not invalidate
anything shipped in the meantime.

One consequence for the port worth flagging: DES-111, the row that is only as
tall as it needs to be, currently belongs to the two-line density. Whether the
one-line density also collapses — it has nothing to collapse, being one line
already — is not a question, but whether the *two-line* default should keep
that behaviour is, and it should be answered with this entry rather than
separately.

### DES-114, every folder list ends in "New folder…"

Imran's direction, 2026-08-17. Wherever Dana offers a list of folders — the
row's folder chip, the expanded card's folder chip, the selection bar's move
menu, and the step move menu — the list ends with **New folder…**, which opens
the same naming panel the other folder gestures already use.

The reason is small and general: **wanting a folder that does not exist yet is
the most likely moment to want one at all.** A picker that only lists what
exists makes a person abandon what they were doing, go to the sidebar, create
the folder, come back, and start again. The option costs one row at the bottom
of a menu and removes that whole detour.

Two details the drawing settles, and a port should keep:

- **All four routes end at one panel.** The panel that names a folder for a
  drag-merge, for a promoted task, for a selection and for a step selection is
  the same component with the same copy shape, so a new folder is created one
  way rather than four.
- **The panel says what will happen to what**, not just "name your folder" —
  "1 task will move into it", "3 steps become tasks inside it". The sentence
  changes with the route because the consequence does.

Lane 1 in the prototype. In the product the naming panel is client-side but
folder creation is not, so this rides on whatever the existing create-folder
endpoint already does; it adds a new entry point rather than a new capability.

### DES-115, an empty block is the control that fills it

Imran's direction, 2026-08-17: "No steps yet" should say something a person can
act on. It now reads **Add a step**, **Write a note**, **Add a file**.

The change is more than wording, and the reason generalises past these three.
"No steps yet" is a **status report**, which is a strange thing to put in a card
where every other line is edited where it sits: it names the absence and leaves
the person to work out what to do about it, usually by looking elsewhere for a
button that is not there.

So the empty state became the affordance. It sits exactly where the first item
will appear, it is the same 32px height as the row it will become, and it
carries the same icon vocabulary. Hovering it behaves like the row it is
standing in for. Nothing about the block's shape changes when the first item
arrives — the placeholder simply becomes real.

The phrasing is the action rather than the absence, and singular rather than
plural: "Add a step", not "Add steps here". A control should say what it does,
and what it does is add one. "Here" is doing no work when the control is
already in the place it refers to.

**Drawn but dead until 2026-08-18, which is worth recording as its own
lesson.** All three of these controls existed and none of them did anything:
each was `onClick={(e) => e.stopPropagation()}` and nothing more, so pressing
"Add a step" only stopped the click reaching the row. The empty state had been
built as a *picture* of the affordance. They now add a step, fill the note, and
open a real file picker respectively — see DES-128 for steps and notes, and the
note on attachments below. A design that specifies an affordance is not
finished until the affordance does the thing.

**Attachments, specifically.** The block now takes real files: a picker, a drop
target on the block itself, and a "From a link" field. A chosen image becomes
an object URL so it previews exactly as a served thumbnail would. That is as
far as a prototype can honestly go, and it is still Lane 2 for the port —
there is no storage, no upload path, no quota and no virus story behind it
(DES-055, DES-105). What it buys is a card judged with real files in it rather
than three fixtures.

This should be the rule for empty states across the refresh rather than a fix
in one card: **where a person can create the thing, the empty state is the
control that creates it, and it says the verb.** Where they cannot — an empty
search result, a folder somebody else owns — a status report is correct,
because there is nothing to offer.

**Two corrections from the same review, both of which became rules.**

*The placeholder sits at the metadata step, not the content step.* It was first
drawn at 14px, the size of a real step, while the heading naming its own block
was 12px — so an empty block was louder than the label telling you what it
was, which is the hierarchy upside down. A placeholder is not content yet. At
12/16 an empty block is quiet all the way through and grows a voice only when
something real is in it. The 32px target survives the change, because type size
is a typographic decision and touch target is not, and those two should never
be allowed to argue.

*The placeholder never repeats its block's icon.* The attachments placeholder
used the same paperclip as the Attachments heading directly above it, saying
the same thing twice while leaving the verb undrawn. The rule: **the heading's
icon says what the block is, and the placeholder's icon says what you are about
to do** — which is always add, so it is always a plus.

Worth noting for the port: setting the placeholder to 12px required moving the
class off the button and onto a span inside it, because of DES-108. This is the
second time that cascade bug has cost real work in one session, which is part
of the argument for fixing it.

### DES-116, the card's metadata icons are 14px and DES-021 says 16px

Surfaced 2026-08-17 when Imran asked which icon family Dana uses. The answer is
settled — **Lucide**, by DES-021, "16px for metadata/chips, 20px for
controls/navigation/actions, 1.75 stroke, round caps and joins, no library
mixing" — and checking the row work against it found a deviation I introduced
without recording it.

**The expanded card sets its metadata icons at 14px**, not 16px: the details
strip, the block headings, the footer actions and the second line's detail
marks. It happened while quietening the card at Imran's request, twice, and
each step was reasonable on its own — but the result is a third icon size that
DES-021 does not allow.

**Why it happened, which is the part that matters for the ruling.** DES-021
pairs 16px icons with metadata, and DES-015 sets metadata type at 12px. The
shipping row uses exactly that pairing and it works there, because the row is
sparse — a folder mark, a date, a person. The card is dense: five property
chips on one strip, three block headings, eight footer actions. At that density
a 16px mark beside 12px text reads as the loudest thing in the card, which is
what Imran reported twice before the sizes came down.

So the two rules are not in conflict in general, only at density. The options:

1. **Bring the card back to 16px.** Consistent with the contract and the
   shipping row, and it undoes a change Imran twice asked for. Not recommended.
2. **Amend DES-021 with a third size**, the way DES-015 was amended with 10/12.
   A **14px compact step, for icons inside dense card metadata only**, never in
   a row, never for a control that is not beside 12px text.

**APPROVED by Imran, 2026-08-17: option 2, DES-021 is amended.** The icon
scale gains a third, scoped step:

> **14px — dense.** Icons inside dense card metadata only. Never in a task row,
> never on navigation, never away from 12px type.
>
> A mark qualifies when both are true: **it sits beside 12px text inside a
> card, and more than three of its kind are in view at once.** If either is
> false the mark is 16px compact or 20px default, as DES-021 already says.

The two-condition test is the whole point of the amendment. A third size
justified by "it looked better" spreads until there is no scale; a third size
justified by a density that can be checked stays where it was put.

Tokenised as `--icon-size-dense` in `styles/tokens.css`, beside the two
DES-021 already named, so the scale is legible in one place. Components express
it with the matching Tailwind step, which is the convention the existing two
already follow rather than a new one.

To fold into `design-contract.md` at V9 as an amendment to DES-021 rather than
a new entry, since it extends that decision rather than standing beside it —
the same treatment DES-107 gets for the 10/12 type step.

Recorded rather than quietly kept, because a deviation nobody wrote down is
indistinguishable from a mistake when somebody finds it later.

### DES-117, one form in two presentations, and what happens to the right panel

Imran's question, 2026-08-17: if rows expand, is the right-side sheet still
needed — and could that space become something else, AI or chat between the
members of a folder?

**The half that is a design answer.** DES-093 left a real gap: seven places
open the task form with no row to expand — the floating add button, the four
quick-add escalations, a calendar empty cell, the calendar ghost, and a search
result. Keeping the sheet only for those would make the form two artifacts,
which contradicts 9.3's own heading that create and edit are the same thing.

The card already carries a full-screen action, and that is the resolution:

> **One form, two presentations.** Inline, where there is a row to expand.
> Full-screen, where there is not — creating from nowhere, opening from search,
> opening a calendar cell or a ghost.

One artifact, one set of fields, one save behaviour, two sizes. It answers
DES-093's outstanding question without inventing a third thing, and it retires
the sheet as the task form rather than as a component.

**The half that is a product question, and should not be answered yet.** The
panel mechanism is worth keeping; the panel's *tenant* is a separate decision.
Recommended framing: the right panel is **available, not allocated.**

- Keeping the sliding-panel capability costs nothing while it is unused, and
  the layout already supports it.
- Reserving the space for an unbuilt feature is how a product ends up with a
  permanently empty column that everything else has to lay out around.
- Both candidates named are expensive and neither is current. **Member chat**
  is a messages table, realtime delivery, unread state, notifications and
  permissions — a large Lane 2 feature in its own right. **AI** is explicitly
  not the direction: the agent-states concept was withdrawn from the lab
  earlier the same day.

So: retire the sheet as the task form, keep the component, and let whatever
eventually occupies that space earn it on its own merits rather than inheriting
it because it happened to be free.

**What is owed:** confirmation that full-screen is the answer for the seven
row-less entry points, since that is what lets the sheet be retired. The
full-screen view itself is undrawn — it is an action in the card's footer and
nothing behind it yet.

**Addendum 2026-08-18, session F1.** The right panel has its first drawn
candidate tenant: the folder conversation of DES-134, switchable on the
folder page concept. Drawn is still not allocated — this entry's ruling stays
open, and DES-134 carries the backend facts. AI remains not the direction.

### DES-118, the card is missing nine of the form's fields

Imran asked, 2026-08-17, whether everything in the task form had made it into
the expandable card. **It has not**, and the gap matters more than its size
suggests, because DES-093 and DES-117 both rest on the card being *the same
artifact* as the form rather than a lighter cousin of it.

Compared field by field against what `task-form.tsx` actually renders:

| In the form, not in the card | Why it matters |
| - | - |
| **Due time** | The card's date chip sets a day and nothing finer. A person with a 3pm task cannot express it. |
| **Repeat interval**, **Every**, **On day**, **Ends on**, **Weekly repeat days** | The card's repeat chip picks a preset. Every custom recurrence is unreachable. |
| **Invite** | The row shows an invite-pending badge; the card offers no way to act on it. |
| **Task history** | The footer has a History icon with nothing behind it. |
| **Resize task form** | Has no meaning inline, and is expected to go — flagged in DES-093 from the start. |

Attachments go the other way: the card has a block the form has none of, which
is fine because it is Lane 2 and drawn empty (DES-105).

**Why this is not a to-do list of missing chips.** If the card cannot set a due
time or a custom repeat, people will still open the form for those, and the
form becomes the place where the *real* editing happens. That is precisely the
two-artifact outcome 9.3's own heading forbids and DES-093 was approved to
avoid. A card that handles the easy eighty percent and hands the rest to a
sheet has not replaced the sheet; it has added a step in front of it.

**The resolution is already in the form's own design.** `task-form.tsx` hides
the same advanced fields behind a **More options** disclosure — it does not
show due time and the repeat editor by default either. So the card does not
need to be denser than the form; it needs the same disclosure. The chips stay
as they are, and one **More options** in the card reveals exactly what the same
control reveals in the form.

That keeps the promise: same fields, same defaults, same progressive
disclosure, two sizes.

**SUPERSEDED the same day by the five-chip header, and the history is kept
because the reasoning changed rather than the goal.**

It was first implemented as the form's own More options disclosure. Imran then
found it made the card harder rather than fuller, and the diagnosis holds up:
**the form's disclosure hides whole fields, while this one was hiding parts of
fields.** Due time is not separate from due date; "every 2", "on Mo" and "until
December" are not separate from repeat. Splitting them produced eleven controls
for five facts, repeated CalendarDays four times, and made a person open a
disclosure to finish answering a question they had already started.

**What replaced it, and what is true now:** five chips, each owning its whole
fact and stating it in full — "14 Aug at 15:00", "Weekly on Mo until 12 Dec" —
each with one menu that offers only the detail the chosen mode actually has, so
a weekly rule is never asked which day of the month it falls on. Five facts,
five chips, five distinct marks, and every chip names what it *is* on hover
rather than only what it says. Invite left the strip for the footer beside
Share, because it is not a property of a task but something you do to a person.

The coverage claim below still holds — the card carries every field the form
renders — but it holds without a disclosure.

The card now covers every field the form renders. What sits behind **More
options**, which is closed by default and placed directly under the strip
because everything it reveals belongs to that strip:

- **Due time** — a time belongs to the date above it.
- **Repeat interval**, **weekly repeat days**, **on day**, **ends on** — the
  whole custom recurrence editor, which the chip alone could only preset.
- **Invite** — resolved into this group rather than left as an open question.
  It is a field on the task in the form, so it is a field here.

**Task history** is resolved differently and better: the footer already had a
History icon with nothing behind it, and it now opens a History block. The
icon was implying that behaviour already; giving it the behaviour costs
nothing and removes a control that lied.

**Resize task form** is the only thing not carried across, as DES-093
anticipated from the start: it has no meaning for a card that is as wide as the
list it sits in.

**The result is the claim DES-093 was approved on, and it can now be checked
rather than asserted:** same fields, same defaults, same progressive
disclosure, two sizes. If a later change adds a field to the form and not to
the card, that claim breaks — so the field-by-field comparison in this entry is
worth re-running whenever either one changes.

### DES-119, what the port left behind, and why

Imran asked why the ported row and card do not carry the dragging, grouping,
selection and other controls the concept lab had. The answer is in two parts
and only one of them is a decision.

**Corrected 2026-08-18. The first version of this entry was wrong.** It argued
that Lane 2 behaviour had no place in the prototype at all, which is the
opposite of what this register says at the top: a Lane 2 idea *may* be drawn in
`prototype-v2`, and is "excluded from the port by that mark rather than by
being invisible". Leaving it out made the prototype look finished when it was
not, and made a design decision look like a missing feature.

The confusion was between two different things wearing the same words. **Needs
a backend** means do not build it in `app/` yet. It does not mean do not show
it in the prototype, which runs on fixtures and exists precisely so an idea can
be seen before it is priced.

**So the behaviour is restored.** Reordering, the 1.5-second folder gesture,
press-and-hold selection and the bulk bar are all live in the lab again.

**Where it lives, corrected 2026-08-18.** This entry said the behaviour sat in
`lib/task-list-interactions.tsx`, its own module, "so the exclusion is one
decision at port time about one file". That module was deleted by the revert
(`89ca018`) along with the rest of the port, and the revert did not update this
entry — the same omission recorded against DES-113, and the second half of the
one process failure this entry was written about.

The mechanics now live in **`lib/use-sortable-list.ts`**, which is a better
version of the same idea: it is the engine rather than the policy, it is shared
by the task rows, a card's steps and a card's blocks, and what the port must
exclude is not the module but the two callbacks a caller passes it — `onDwell`
and, until DES-071 has a persisted order, `onReorder`.

**The module layout the port is building, recorded 2026-08-18 as it lands** —
because the last port's whole failure was that nobody could tell what had moved
where:

| Module | Holds | Port |
| - | - | - |
| `lib/task-model.ts` | `ConceptTask`, the date ladder, the repeat and due summaries | Lane 1 |
| `lib/use-sortable-list.ts` | The pointer sort engine | Lane 1; its two callbacks are not |
| `lib/time-format.ts` | 12/24-hour preference, DES-121 | Lane 1 |
| `lib/row-density.ts` | One line or two, DES-113 | Lane 1 |
| `components/ui/calendar.tsx` | The month grid and the clock | Lane 1 |
| `components/task-pickers.tsx` | Due, Reminder, Repeat, DES-120 and DES-123 | Lane 1 |
| `components/task-card.tsx` | The expanded card, and `Reveal` and `Face` with it | Lane 1 |
| `components/task-row.tsx` | The row at both densities, plus the selection and drag machinery the lab composes and the screens do not | Lane 1 |
| `lib/shell-task.ts` | The shell's task record, which used to live inside the task form | Lane 1 |
| `components/task-row-baseline.tsx` | The v1 row, frozen, for the lab's C0 control only | Never |

**Done 2026-08-18.** Selection and the bulk bar came out with the row, so
`row-concepts.tsx` is 4,812 lines lighter and holds only the lab: its fixtures,
its concept prose and the two concepts. The task form went with them — DES-093
put the whole of a task inside the row, so the prototype has nothing left to
open a sheet for, and `components/task-form.tsx` is deleted.

**The port is complete, 2026-08-18.** `row-concepts.tsx` fell from 4,812 lines
to about 1,200 and holds only the lab — its fixtures, its concept prose and the
two concepts. `components/task-form.tsx` is deleted: DES-093 put the whole of a
task inside its row, so the prototype has nothing left to open a sheet for. All
seven task screens render `TaskList`, which owns what belongs to a list rather
than to a row — reordering, the 1.5-second hold that makes a folder, press-and-
hold selection and the bulk bar. Screens whose rows carry logic of their own
keep that row and are handed the list wiring through `renderRow`.

**Lane 2 is drawn in the shell as well as the lab**, which is this entry's own
rule and which the port initially got backwards a second time: the register
says a Lane 2 idea *may* be drawn in `prototype-v2`, and excluding it made the
prototype look finished when it was not. The table above is what keeps it out
of `app/`.

**One thing was lost on the way and is recorded rather than absorbed.** The
card's reveal animated its height, first with the 0fr-to-1fr grid trick and
then with a measured max-height. Both worked in the lab and both computed zero
in the shell against 318px of real content — the max-height one held at zero
even when set `!important`, which is not a cascade problem and was not worth
more of the session to chase remotely. The card now mounts when it opens and
fades in, so opening is animated and closing is immediate. That is a real loss
against DES-097's motion scale. Reopening it needs the layout context
understood with a screenshot rather than a DOM query.

What the port must still leave behind:

| Left out of the port | Why | Entry |
| - | - | - |
| Drag a row to reorder | No persisted order exists for any view | DES-071, DES-103 |
| Hold 1.5s to make a folder of two tasks | Needs one transactional endpoint | DES-103 |
| Select rows, bulk complete / star / My Day / move / duplicate / delete | Needs bulk endpoints and a partial-failure story | DES-112 |
| Select steps, move them to a task or folder | Same, plus DES-106's unsettled verb | DES-100, DES-106 |
| Make this task a folder | Destroys a task; needs a transaction and an undo | DES-104 |
| Drag the card's blocks to reorder | Block order has nowhere to live | DES-102 |
| Attachment thumbnails and inline viewing | No storage, no upload path, no viewing rules | DES-105 |

Each of those is drawn in the prototype and carries its entry. None of them may
reach `app/` until its entry says so.

**The part that was my omission, now fixed.** Three things were Lane 1,
approved, and simply did not survive the port — which is different from being
left out, and reads as loss rather than a decision:

- the **drawn tick** on the row's checkbox, replaced by a plain shadcn Checkbox
- the **drawn strike** on a completed or abandoned title, replaced by CSS
  `line-through`
- **New folder…** at the end of the card's folder picker (DES-114)

All three are restored.

**The process failure underneath, and the rule that follows.** The port commit
listed what changed and not what was deliberately dropped, so a reader could
not tell the two apart — and neither could I a day later. The rule, which
belongs in the working practice rather than in any one entry:

> **A change to the row or the card updates its DES entry in the same commit.**
> If the change supersedes what an entry describes, the entry says so and keeps
> the old reasoning; if it drops something an entry approved, the entry records
> it as dropped and why.

The structural half of this is already done: the lab renders `TaskRow` and
`TaskCard` themselves, so the *code* can no longer drift. This rule covers the
half that can still drift, which is the writing.

Four concepts have left the lab, all on 2026-08-17 at Imran's direction. They
are listed here so a later session finds the decision rather than re-proposing
the idea.

**Actor and state**, which drew agent work in the row (waiting, working,
blocked, ready for review). Machine states are not the direction the product is
being taken in right now, and a concept lab carrying a direction nobody is
pursuing spends a reviewer's attention on a question that is not being asked.

**Expand in place (D)** and **Two lines on selection (F)**, withdrawn together.
D's inline expansion survives rather than dying with it: every remaining
concept now opens its card in place, so what D was arguing for became the
baseline and the separate concept had nothing left to argue. F was the
half-measure it always described itself as — it let you learn more about a task
without letting you change anything — and once every row could open properly,
the half-measure had no constituency.

**One vocabulary (I)** was not withdrawn but **merged into J**, which is the
more interesting outcome. I's whole difficulty was that icon-only detail has to
be hovered to be read, and hover does not exist on touch. J's second line is
exactly the room needed to put the word back beside the icon. So the merged
concept keeps the shared alphabet — the same marks in the row, in the card, and
eventually across the app — and drops the constraint that made it expensive.
DES-094 and DES-096 are now one design rather than two, and should be ruled on
together.

The lab is therefore down to three candidates plus the baseline, which is the
right number for asking somebody which they prefer.

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

**APPROVED by Imran, 2026-08-17.** His reasoning, recorded because it is the
part a later session will need rather than the verdict: the inline card gives
the product a better structure to grow into, it is distinct from Todoist and
Notion rather than an imitation of either, and it is easier to use — what you
are already looking at becomes editable in place, instead of moving your
attention to a left panel or a new dialog.

This closes the question the entry itself raised, about the seven places that
open the form with no row to expand. Those still need an answer, but it is now
a design task inside the approved direction rather than a reason not to take
it.

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

**Amended 2026-08-17, when Imran asked for the footer to be shaded too.** That
looks like a second filled region and is not, and the distinction is the
portable part of this entry:

> **An inset rounded fill groups content. A full-bleed edge band is chrome.**
> A card may have one of each and still not have two groups.

The details strip groups content: it is inset from the card's edges, rounded on
four sides, sitting inside the content column. The footer does not group
anything — it is the card's edge, carrying the actions that belong to the whole
task rather than to any part of it. So it is drawn as an edge: full-bleed to
the card's sides, square at the top, following the card's own radius at the
bottom. It reads as "this is where the card ends" rather than "these things
belong together", which is the depth that was wanted.

No separator above it either. A shaded band already has an edge — the line
where the shade begins — and a rule drawn along that line says the same thing
twice, which is exactly the fault the block icons had before they were
merged into one mark.


**The header strip's five chips were rebuilt 2026-08-18** — the pickers
behind them, not the strip itself. The strip is still five chips and still
the shape this entry describes; what changed is what opens when one is
clicked. See DES-120, and DES-122 for the due chip losing its clock.

### DES-120, the three pickers open on the answer, not on the instrument

Imran's direction, 2026-08-18, ruled and built in the same session. Due,
Reminder and Repeat all now open on a short list of resolved answers, keep a
hairline beneath it, and put everything exact behind **one** option that
expands. Only that option can expand, and only one thing is ever expanded.

**What was wrong.** The pickers this replaces were a label, a row of three or
four pills, and a bare month grid. The fault was not that they were plain. It
was that they **made the rare answer and the common one cost the same**: nearly
every date anybody sets is today, tomorrow, this weekend or next week, and all
four of those were being spelled out on a calendar. So each list now leads with
those, and each shows the date it resolves to — "Tomorrow" is only useful next
to the day it means, and "1 week before" should not be arithmetic somebody does
in their head.

**Why one shape for all three.** Learning one teaches the other two, and it is
the shape the product's other menus already have. The three differ only in what
their custom option opens:

| Picker | Presets | The one expanding option |
| - | - | - |
| Due | Today, Tomorrow, This weekend, Next week, No date | **Custom date…** — a calendar, no clock |
| Reminder | On the day it is due, 1 day / 2 days / 1 week before, No reminder | **Custom date & time…** — a calendar with the time row at its foot |
| Repeat | Does not repeat, Daily, Weekly on ‹day›, Every weekday, Monthly on the ‹n›th, Yearly on ‹date› | **Custom repeat…** — interval, unit, weekdays, end |

Every preset is resolved against **this task's own date** rather than written
as a generic word: "Weekly on Thursday", "Monthly on the 13th". A preset that
names the thing it will do is a preset nobody has to try first.

**The size rule this settles.** A first version stood the calendar and two
sixty-row time columns open at all times, and Imran's word for it was
cluttered. Every panel was the size of its worst case. The rule is now: **a
panel is the size of the question being asked, not the size of the largest
question it could ask.** All three are 270px wide and open at about 210–240px
tall.

**Two defects fell out of the rebuild**, both worth recording because both were
invisible and neither would have been found by looking at a screenshot:

- The old calendar **never showed which day was selected.** It read the day out
  of the label with `/d+/` — a pattern matching the letter d rather than a
  digit — so the highlight had nothing to land on, in every picker, always.
- The row **hardcoded the word "Weekly"** whatever the rule actually was, so
  setting "Every weekday" in the card left the row two lines above it saying
  something untrue. The row and the card now derive from one function, and the
  same is true of the due chip. This is the second time in V3 that two places
  each wrote their own copy of one fact and disagreed; it is worth treating as
  a pattern rather than as two accidents.

Behaviour is DES-109's: there is no Save and no Done. Choosing commits.

The calendar itself is `components/ui/calendar.tsx`, written for this rather
than taken from shadcn — shadcn's Calendar depends on `react-day-picker`, which
this prototype does not install. It follows the same idiom and the same tokens:
32px day targets, always six weeks so the popover never changes height as you
page, adjacent-month days drawn rather than left as holes, today marked whether
or not it is selected, and a roving-tabindex grid so the arrow keys walk it.
**Selection is graphite** like every other selected thing in the lab; **today is
cobalt**, which is one of the jobs DES-016 already gave the accent. That is one
element of V7's work landing early, and Imran was told so rather than it being
slipped in.

### DES-121, the clock is a preference, and the picker offers the whole day

Imran's ruling, 2026-08-18. **24-hour or 12-hour is the person's choice**, set
from a control beside row density, and the picker reaches every hour and every
minute whichever they chose. The setting decides how a time is *written*, never
which times can be *reached*.

**The control, and why it is shaped this way.** At rest it is two typed
segments and, in 12-hour mode, an AM/PM pair. Clicking a segment opens that
segment's grid beneath it, and only that one; picking an hour advances to the
minutes on its own, and picking a minute closes. Typing works instead, arrow
keys step and wrap.

Two controls for one value, because **the two things a person does with a time
are not the same job.** Typing is for the time you already know — 07:45, and
you knew it before you opened anything. The grid is for the time you are
choosing rather than recalling, where seeing the neighbours is the whole point.
The version before this had only a list, of half-hours from 06:00 to 22:00, so
a quarter past anything was unreachable and so was every hour before breakfast.

Grids rather than columns: twenty-four things in four rows can be read at a
glance where twenty-four things in a column cannot, and sixty minutes is ten
rows instead of a scroll with no end in sight.

**Times are stored as 24-hour and converted only when drawn.** Storing what is
displayed is how a preference change quietly rewrites data, and 12-hour text
cannot represent midnight without a convention nobody agreed to. One function,
`formatTime`, is the only place a time becomes words, so the preference cannot
be honoured in one place and forgotten in another.

**The default is 12-hour**, ruled by Imran 2026-08-18. The setting moves it to
24-hour, and the picker reaches every hour and every minute either way.

**Where it lives: the browser**, in `lib/time-format.ts`, as a module store
read through `useSyncExternalStore` rather than a context — times are written
in the row, in two pickers and in a settings control, and a provider would have
to wrap all of them. This is the shape `lib/density.tsx` used before the revert,
and if row density comes back it should come back like this.

Lane 1 as built. **Syncing it to the account is Lane 2** and is the same
conversation DES-113 parked for row density: a column, an endpoint, an RFC.
The two preferences should be taken to Hassan together, because one settings
row that syncs and one that does not is worse than either answer applied twice.

### DES-122, a due date is a day, not a moment

Imran's ruling, 2026-08-18: **the Due picker offers no time at all.** A task is
due on a day; a task that needs a time of day has a reminder, and a reminder
carries one. "Due at 17:45" is a reminder wearing a due date's clothes.

The field is gone from the lab's model rather than left unset, because a field
nothing can write is a field the next person has to work out the fate of.

**One consequence, which follows from the ruling rather than being a separate
decision:** the reminder presets were minute-level — "at the time it is due",
"10 minutes before", "1 hour before" — and with no due time there is nothing
for them to be relative to. They are now day-level, and any exact moment is
reached through Custom date & time.

**This one is not only a design decision and must not be ported as though it
were.** The shipping product's due date carries a time: it is in the task form,
in the section 7 API, and in the reminder tick that fires against it. Removing
it is a specification change, not a restyle. It goes to Imran and Hassan as a
ruling with the Lane 2 pile, and until that ruling exists **the port keeps the
production behaviour and takes only the picker's shape.** Recorded here so the
port session meets it as a decision rather than as a missing field.

### DES-123, one picker, wherever it is opened from

Imran's direction, 2026-08-18. The date and repeat pickers open from the
**folded row** as well as from the expanded card, and they are the same
pickers.

The row used to offer four preset labels for a due date while the card two
pixels below it offered a calendar and five presets. That is two answers to one
question, and the row's was the worse one often enough that changing a date
meant opening the card first — which makes the row's editable details, DES-096
and concept E's whole argument, a promise the row only half kept.

The trigger is a button, so the row's drag surface ignores a press that lands
on it and the two gestures never compete.

**Imran's reason for accepting it, 2026-08-18, and it is the more general
statement:** the date and time pickers are constant to the Dana brand. They
are one component wherever they appear, so changing them changes every place
that uses them at once. That is the standard the rest of the refresh should be
held to — a picker copied into a second place is a picker that will one day
disagree with itself, which is the fault DES-120 found twice in one session.
This entry is therefore not only about the row: it is the rule that any new
surface needing a date takes this picker rather than growing its own.

**What is deliberately not in the row.** The reminder picker, because the row's
own vocabulary says a reminder is card-only and never fits the row; and a due
picker on a task that has no due date, because the row draws what exists and a
row of empty affordances is a different design with a different argument. Both
are open to change and neither was changed on a session's own say-so.

### DES-124, concepts are compared in a lab; the winner is extracted the moment it wins

Imran's ruling, 2026-08-18, made the default flow for every design session
rather than advice for one. **Design in a concept lab. The moment a concept
wins, move it into `components/` and have the lab import it — before
finalising it, not after.**

**Where this came from.** V3 designed the row and the card inside
`screens/row-concepts.tsx`, a single file that reached 4,812 lines. Seven
candidates lived there, and the row's markup lived *inside* the concept demos
rather than in a component of its own. Imran's expectation, reasonably, was
that finalising the design and moving it to the shell would be quick. It was
not, and the reason had nothing to do with the design being unfinished: **there
was no `TaskRow` and no `TaskCard` to move.** The port had to begin by writing
the components that had never existed, out of a file where the row, the card,
the pickers, the selection bar and the drag layer were all interleaved.

The repository had already worked this out and written it down. DES-119, on the
first port's failure, says extracting selection and the bulk bar is "worth
doing **before** the port rather than during it". That entry was read, quoted
and extended during this very session — and the extraction still happened
during the port, which cost most of a day and produced two rounds of broken
intermediate states that had to be repaired from backups.

**Why the lab still exists.** Nothing here argues for designing in the shell.
The lab is the only place a comparison is possible: seven rows against one
fixed set of deliberately awkward tasks, judged by scrolling one page rather
than by remembering what the last one looked like. A shell shows one row
against nothing. The lab is also what Imran shares to collect opinions from
people who have never seen Dana, which is why every concept states what to try.

**What changes is only the timing of the extraction.** Once a candidate wins:

1. It moves to `prototype-v2/src/components/`.
2. The lab imports it and renders the real component.
3. The losing concepts stay in the lab as prose and fixtures.

From that moment the lab and the shell render the same code, so they cannot
drift — the fault DES-119 exists to prevent — and "port it" becomes changing
which screens call it, which is an afternoon rather than a week.

**The one exception.** Where the surroundings *are* the question — the page
measure, the sidebar, the chrome, anything whose whole argument is how it sits
next to everything else — judge it in the shell. There is nothing to isolate,
and a lab would be showing it without the thing being decided.

**Evidence this is the right call, from the same session.** After the row and
card were extracted, adding drag, dwell-to-folder and bulk selection to all
seven screens took one new component and seven small edits, because
`TaskRow`, `TaskCard` and `task-pickers` were by then real components with real
call sites. The identical work, attempted before the extraction, was what had
to be reverted at `89ca018`.

Recorded in `v2-refresh-plan.md`'s ground rules as well as here, because a
session reads the plan before it reads the register.

### DES-125, the icon family is animated Lucide

Imran's ruling, 2026-08-18: **`@animateicons/react/lucide` is Dana's icon
family.** The same Lucide drawings the product already used, with a
motion/react animation per icon. Where the animated set lacks an icon, another
icon from the same family is substituted rather than falling back to static
Lucide — the family is the decision, not the individual glyph.

**How it was decided.** A session of its own built a three-way switcher —
Lucide, animated, and Phosphor at six weights — behind `?icons=`, so the same
shell could be looked at in each. That comparison is what produced this ruling.
The switcher and the Phosphor dependency are gone now; there is nothing left to
compare, and a comparison instrument left in the tree is a thing a later
session mistakes for a feature.

**One module owns it.** `lib/icons.tsx` exports every icon Dana uses, and
nothing imports `lucide-react` directly. The family is therefore one decision in
one file rather than four hundred import lines, which is the same argument
DES-123 makes for the date pickers and should be the standing rule for anything
that is a family rather than a component.

**Two workarounds that are not obvious, kept from the experiment.**

- An animated icon renders a `div` around its `svg`, takes a numeric `size`
  rather than a class, and hardcodes `strokeWidth` at 2. The wrapper reads the
  pixel size back off the Tailwind `size-*` class the call site used, and
  swallows `strokeWidth` rather than spreading it onto a div. Every call site in
  the shell still passes `strokeWidth={1.75}` from the Lucide days; accepting
  and ignoring it beats four hundred edits that change nothing.
- More subtly: because the size class lands on the wrapper, the `svg` inside is
  left classless — and a classless svg is exactly what the shadcn primitives'
  `[&_svg:not([class*='size-'])]:size-3.5` selector is looking for, so every
  icon with its own size would silently collapse to the container's default.
  The wrapper fills itself with `[&>svg]:!size-full` to put the size back.
  Verified 2026-08-18: 44 icons on My Day, none zero-sized, at 14/16/18/20/24px
  exactly as their call sites ask.

**The animation plays from the control, not the glyph.** The library fires on
the icon's own hover, and a 14px target inside a row is a target nobody hits.
Attaching a ref disables the built-in hover and hands over an imperative
handle, so the wrapper walks up to the enclosing button, link, menu item, list
item or sidebar row and plays from there. This is what makes the family feel
like it belongs to the interface rather than to the picture. Verified on the
sidebar's Search button: the icon animates on the button's hover.

**Nineteen substitutions.** Thirty-seven of Dana's fifty-six icons exist
name-for-name; the rest are chosen by meaning and each carries its reason in
`lib/icons.tsx`. Most are unremarkable — Clock3 to Clock, MoreHorizontal to
Ellipsis, Settings2 to Settings, Link2 to Link, Share2 to Share, Film to Video,
CircleAlert to TriangleAlert, Undo2 and Redo2 to CornerUpLeft and CornerUpRight.

**Two are worth Imran's eye rather than being quietly accepted:**

- **`GripVertical` becomes a vertical ellipsis.** A vertical ellipsis is a
  common drag handle and reads well enough, but Dana's overflow menu is a
  *horizontal* ellipsis, so the two now differ only in rotation while meaning
  entirely different things. The drag handle and the menu sit within a few
  pixels of each other on a step row.
- **`Folders` becomes a closed folder.** It is used in one place — the badge
  that says two tasks are about to become a folder — and a single closed folder
  says less there than the original stack did.

Neither blocks the ruling; both are a five-minute change if Imran wants
something else, and they are written here so nobody has to rediscover that a
choice was made.

**How the library is actually driven, learned the hard way 2026-08-18 and
written down because guessing it cost two rounds.** `isAnimated` is a **gate**,
not a trigger: it defaults to true and only decides whether an icon *may*
animate. The trigger is the imperative handle, and attaching a ref changes the
contract — with a ref the component stops animating on its own hover and defers
entirely to you. Setting `isAnimated` from hover state while dropping the ref,
which this file did for one revision, leaves nothing driving anything and every
icon in the product silently stops moving. The ref is not optional.

**The sidebar animates.** It was made static for a while, to stop icons
blinking; Imran asked for the motion back, and the blinking turned out to be
the broken trigger above rather than the animation itself. `IconMotion` remains
as the mechanism for switching a region to plain Lucide, because it is the
right tool if a surface ever needs stillness — it renders the static component
rather than suppressing a listener, so nothing can flash on a remount.

**Not yet swept:** the icons on the public, email and settings surfaces were
not part of the experiment's Inbox-screen scope and should be checked before
V9's reference set is regenerated.

### DES-126, the logo is a component, and its mark draws itself on hover

Imran's request, 2026-08-18, following DES-125: **the D-like mark inside the
Dana logo animates the way the icon family does.** It does so by inlining the
drawing as `components/dana-mark.tsx` and revealing it with a swept mask, and
every one of the nine places the logo appears now renders that component
instead of `<img src="/dana-mark.svg">`.

**An `<img>` cannot be animated**, which is the whole of why this is a
component. The mark inside a referenced file is unreachable from the document:
there is no element to mask, no path to stroke, nothing to move. The file
stays where it is — `public/dana-mark.svg` is still what a favicon, a manifest
icon or a real email points at — and the component carries a verbatim copy of
its two paths, which is a duplication and is written down as one in the
module's header so the pair are changed together.

**A second, unlooked-for thing was wrong and is now fixed.** `build:share`
flattens the prototype into a single self-contained HTML file precisely
because the places it is shared to refuse every external request the page
makes. Each `<img src="/dana-mark.svg">` was one such request. Verified by
grepping the built file: **nine literal `/dana-mark.svg` hrefs before, zero
after**, which means every shared copy of the prototype since the mark was
introduced has been showing reviewers a missing logo where the brand should
be. Nobody reported it, which is the useful part: a broken image in a corner
is exactly the defect a reviewer edits out of their own perception.

**Why the pen is a mask.** The family's vocabulary is drawing, wiggling and
popping a 24px glyph, and the mark is not a glyph — it is a filled spiral.
Tracing its outline puts a hairline pen around a contour that runs inward and
back out, which is invisible at the 28px the sidebar renders it at. So the pen
became the mask instead: a wide stroke laid along the ribbon's own centreline,
drawn from the tail's inner tip outward, with the mark appearing wherever that
stroke has reached. It reads at 28px because the moving edge is as wide as the
ribbon it uncovers, and it holds up at the 520px watermark size because what it
traces is real geometry rather than an effect laid over the top.

**The centreline had to be measured, because it is in no file.** The drawing is
a filled outline; nothing in it says where the middle of the ribbon runs. So the
mark was rasterised and sampled along rays from its centre every two degrees,
and the white bands on each ray followed from one to the next — the band nearest
the last one is the same ribbon, one step on. That walk is also what finally
said what the drawing *is*: a spiral of just under two turns, opening as a
sliver at r≈218 pointing down-and-left, widening to about 105 units, closing as
another sliver at r≈516 in the same direction, which is the D's opening. 368
midpoints, reduced to 80 by Douglas–Peucker at a tolerance of 2 units, which is
invisible under a stroke 150 wide.

**150 wide, butt-capped, linear.** The ribbon is ~105 units across and the turns
sit ~200 apart, so 150 clears the ribbon everywhere while leaving ~25 units to
the neighbouring turn — the reveal must never uncover a stretch the pen has not
reached. A round cap would push the leading edge 75 units past the pen; a butt
cap keeps it square across the ribbon. And linear, which here is the considered
answer rather than the unconsidered one: constant progress along a real
centreline *is* constant pen speed. Every curve tried broke on the same rock —
the inner turn is short and the outer turn is long, so any easing slow at one
end spends its slowness where there is nothing to see. Measured at 25/50/75% of
the duration, ease-in-out drew 7/50/93%, a quarter-second of apparent nothing
while the pen inched off the tip; every ease-out drew 55/87/98%, whipping
through the tail to crawl around the bowl. Linear draws 25/50/75%.

**An earlier version of this entry described an angular sweep** — one enormous
circular stroke pivoting clockwise from nine o'clock. It was built, checked and
shown, and Imran's reading of it was exact: it moved the whole body of the mark
at once rather than travelling along it. A wedge reveals every radius
simultaneously, so all the turns brighten together; only a stroke that follows
the ribbon reveals the logo in the order it was drawn. The sweep is recorded
here rather than deleted because it is the obvious first answer, and the next
person to reach for it should know it was reached for and found wanting.

**What plays it** is the enclosing link, button or menu item — the same
walk-up `lib/icons.tsx` does, for the same reason — or the mark itself where
there is no such ancestor, which a 28px logo is a large enough target for in a
way a 14px row icon is not. Deliberately one and never both: `mouseenter`
fires on every element being entered, so a mark listening alongside its own
link redraws from nothing the moment the pointer crosses from the wordmark to
the glyph. The two decorative watermarks are `pointer-events-none` and have no
interactive ancestor, so they stay still without being told to, and the
transactional email mock-up is switched off by hand, because it is standing in
for a surface that cannot run an animation at all.

**Four things checked rather than assumed**, since a hover animation is the
kind of change a screenshot cannot audit:

- **That it finishes at the whole logo.** Anything the pen misses is a piece of
  the mark that never arrives. Rasterised at full reveal and counted: 100.00% of
  the mark's 62,385 pixels, with the path extended eight degrees past each
  tapered tip so neither sliver is clipped.
- **That it reveals in ribbon order.** Every revealed pixel was mapped back to
  its position along the spiral. At five points across the animation the
  revealed set always begins at the inner tip and its frontier only advances —
  122°, 275°, 452°, 588°, 679° of 730°. This is the property Imran asked for,
  and it is the one a still frame cannot show.
- **The restart.** Entering the link and then crossing onto the glyph keeps
  the same `Animation` object rather than replacing it.
- **The nine call sites.** Each screen was walked: sizes 28, 32, 36, 440 and
  520 as their classes ask, mask ids unique per instance, no `<img>` left, and
  the watermarks and the email inert.

The earlier angular version was also checked pixel-for-pixel against reference
markup, and that check earned its keep: it found a rotation constant declared
and never applied, so the wedge started at three o'clock and revealed the bowl
before the stem — plausible enough in isolation to have passed on the eye.

`prefers-reduced-motion` disables it, which is reasoned from the code path
rather than exercised: the media query cannot be forced from inside the
preview browser.

### DES-127, the mark has two colourways, and the dark panels were showing neither

Imran's request, 2026-08-18, following DES-126: **a light version of the mark
for dark mode.** It is the inversion he expected — plate to graphite-0, glyph
to graphite-950 — and the work in it was not the drawing.

**The three dark panels were already broken, and had been since they were
drawn.** The plate is `#0A0A0A` and `--color-graphite-950` is `#0a0a0a`, so on
the ProductPreview panel and the two invitation panels the tile was not dark
against the panel, it was *the panel*. What those screens have been showing is
a bare white D with nothing under it. It reads as a deliberate treatment, which
is why nobody caught it, and at the 14% watermarks it genuinely is the better
picture — but on the two 36px lockups it is a logo missing half of itself.

**So the prop names the surface, not the colour.** `surface="dark"` says the
mark is sitting on a dark panel; the colourway follows. The alternative,
`tone="light"`, requires whoever reads the call site to hold in their head
which way round "light" points — the tile or the ground it sits on — and that
is the sort of thing a person gets right until the day they do not. The
default, `auto`, follows the document.

**Two colourways, one pair of tokens.** `--dana-mark-plate` and
`--dana-mark-glyph` live in `tokens.css` with the rest of the palette rather
than in the component, because two colourways is where a component picking its
own hex values starts to drift from the file it copied them from.

**The watermarks keep their picture, and now ask for it.** They are
`plate={false}`: the glyph alone. They had that by accident, from the plate
happening to match the panel, and an accident is not a thing that survives the
plate changing colour. Without a tile the glyph inherits the tile's job — it
becomes the shape that must stand off the surface — so it takes the tile's
colour, which is why one variable drives both.

**One rule is dark-mode-aware, and it is the point of the exercise.** A `.dark`
selector flips the default pair. Nothing in the prototype adds that class and
`tokens.css` still says a dark theme is out of scope; that stands, and one
component being ready for a theme is not the same undertaking as building one.
Without it this would be a second asset somebody has to remember to reach for,
which is the failure mode DES-125 wrote a whole module to avoid.

**Saved as assets, and documented.** `docs/design/brand-mark.md` is the
sheet to reach for while designing: the files, which surface each belongs on,
the sizes it ships at and the two things not yet settled. The reversed
colourway also exists as a standalone file, `public/dana-mark-reverse.svg`,
for the places a React component cannot go — a deck, a favicon, a mail
template. It is **generated rather than authored**: `scripts/make-mark-reverse.mjs`
reads the original, swaps its two fill declarations and refuses to write if
anything else differs, because a hand-edited copy is how two files stop being
the same drawing. Verified by rasterising both against a mid-grey ground and
counting: the dark and light pixel populations swap (27,966/9,200 to
9,187/27,986) and the antialiased footprint between them does not move.

**Checked:** every mark on every screen, with its panel colour read off the
document rather than assumed — the shell, both invitation screens, the landing
page, the legal pages and the email mock-up. In each case the front-most shape
contrasts with what it sits on. Toggling `.dark` on the shell flips the
sidebar's mark and flips back. The pinned panels do not move when it is
toggled, which is correct: those panels are graphite-950 whatever the theme
does. And the reveal is unchanged — the plate is not masked, so the tile is
present from the first frame and only the D draws itself, measured at
0/23/49/75/100% across the sweep on the reversed lockup.

### DES-128, a step is a label; a note is a field

Imran's ruling, 2026-08-18, after both were briefly made fields and one of them
was clearly wrong.

**Steps are labels that become fields when you click them.** The same
rename-in-place rule the task title follows (DES-095): the thing itself is the
control, but it still *looks* like the thing until somebody decides to change
it. Click, and it is a field with its text selected, because renaming is
usually replacing. Enter or blur commits, Escape reverts.

**Notes is a field, always.** No label, no reveal, no edit affordance — the
block is the note, it grows with its content, and you write into it the way you
would write into any document.

**The asymmetry is the decision, and it is not arbitrary.** A step name is a
short thing you occasionally correct; a note is prose you sit down and write.
Making the step permanently a field turned a checklist into a column of input
boxes — the list stopped reading as a list. Making the note a label with an
edit hidden behind it would put a step between wanting to write and writing,
which is the one thing a notes field must not do.

**A bug hid inside the wrong version and is worth recording**, because it is a
general trap. The step row was keyed by its own title:

    key={`${step.title}-${i}`}

so every keystroke produced a new key, React unmounted and remounted the input,
and the caret was thrown out after a single character. Typing was impossible
and the cause was invisible — the field looked perfectly ordinary. **Never key
a row by content the row can edit.** Keyed by position now.

**Two gaps found while doing this, both closed:**

- **"Add a step" only appeared when the list was empty.** Once a step existed
  there was no way to add another without going through press-and-hold
  selection first. It now sits at the foot of the list permanently. A checklist
  you can start once and never extend is not a checklist.
- **Removing one step required making a selection.** Each step now carries a
  remove control that appears on hover in its own trailing slot, which is where
  the task row keeps its actions too.

### DES-129, comments on a task: words, voice notes, files, replies

Imran's direction, 2026-08-18, opening session F1: the expanded card ends in a
comments section — expandable, where people leave comments, share voice
messages, reply to each other and share files. **Drawn in the card as a pinned
block**, live on every task in the shell, with two tasks seeded so the thread
is judged as a conversation rather than an empty composer.

The design decisions taken in the drawing, each reversible by looking:

- **Comments are pinned after the content blocks and sit outside their
  order.** Steps, Notes and Attachments are what the task *is* and may be
  arranged (DES-102); the conversation is what people *say about it*. A
  conversation filed between two content blocks would read as neither content
  nor commentary, so the block has no drag grip and always ends the card, the
  way Linear and Notion both end in their threads.
- **Replies nest one level and no further.** A task's conversation is a short
  thread between a handful of people. Unbounded nesting is how a card grows a
  forum inside it, and one level is enough to answer someone without starting
  a second column of rails.
- **The composer is one quiet line** — a face and a rounded field — because
  the conversation must not out-shout the task above it. Attach, voice and
  send live in the field's trailing slot, and send only appears once there is
  something to send.
- **Recording is real.** The mic button runs MediaRecorder: a pulsing mark,
  the clock counting up, live bars, cancel or post. A voice note recorded in
  the prototype actually plays back, because judging a voice-message design
  that cannot make a sound is judging a picture of one (the DES-115
  principle). Fixture voice notes sweep their progress silently, which is as
  far as a drawing can honestly go. Where the microphone is refused, the
  control says so in words rather than pretending.
- **One thread component for every conversation surface.** The card's block,
  the folder page's comments and the folder side panel all render
  `components/comments.tsx` — DES-123's rule applied on day one, so a thread
  can never disagree with itself across surfaces.
- **Delete appears only on my own comments**, on hover, in the row's trailing
  slot like every other row in the product. Editing is deliberately not drawn:
  whether a comment is editable, for how long, and what edited history shows
  is a product decision that belongs with the backend conversation.

1. **What the user does.** Writes a comment on a task, replies to somebody
   else's, records a voice message, attaches a file to a comment, and reads
   the conversation on any device.
2. **What the product cannot do today.** Everything. There is no comment
   table, no arm on any section 7 endpoint, and `taskDetail` carries no
   conversation. Voice and files additionally need the storage DES-055 and
   DES-105 have owed since v1 — an audio clip is an attachment with a duration.
   And nothing in the product delivers a message to somebody who is looking at
   the same task, which is the half that is easy to underestimate.
3. **What it would need.** A guess, marked as one. A `comment` table
   (task_id, author, body, parent_id, created_at, deleted_at), list and write
   arms scoped by the 10.2 chokepoint to folder membership, pagination for
   long threads, and a deletion story when the task or a member goes. Voice
   and file comments ride the DES-055/DES-105 storage machinery and add
   nothing of their own beyond a duration column. Then the expensive half:
   delivery. Polling is cheap and stale; push is realtime and is exactly the
   infrastructure the one-instance architecture (spec 11) does not have.
   Unread state and notification rules are their own product decisions —
   recorded here as the questions Hassan should price, not answered.
4. **What happens if it never ships.** The card stands without the block;
   notes remain the one shared writing surface, which is what people use
   today. Voice and files degrade away with the block. Nothing else in the
   refresh depends on it.

### DES-130, a folder wears an identity: icon, colour, cover, description

Imran's direction, 2026-08-18. The folder page opens like a Notion page:
a cover that can be changed, a folder mark from a small library in a colour
the person picks, and an optional description paragraph under the title.
**Drawn in the shell** — the folder page concept renders all of it, the
picked mark follows the folder into the sidebar, and everything persists in
the prototype's own storage so it survives navigation.

- **The icon library is twenty-one glyphs and every one is animated.** The
  plain folder plus twenty, all from the family DES-125 ruled in, chosen
  *from* what the family can animate rather than trimmed to it afterwards.
  None of them is a glyph Dana's chrome uses, so a folder's mark can never be
  mistaken for a control. The picker names the glyph under the pointer,
  because choosing is reading one word rather than decoding twenty-one small
  drawings. Colours are the ten folder swatches the tokens have carried since
  v1, plus graphite — no new colour enters the product here. This absorbs
  DES-054, which has proposed the icon half since v1.
- **Covers come in three honest tiers**: patterns (CSS), illustrations
  (inline SVG generated in the file, so the shared build asks the network for
  nothing — the portraits' rule), and upload (a real file into an object URL,
  alive for the session, gone on reload, and the picker says so). Persisting
  image bytes into localStorage would be inventing a worse version of the
  storage problem the real feature has (DES-105), so it is deliberately not
  done.
- **On a cover the mark stands on a white plate; on a bare page there is no
  plate**, because with nothing behind it a plate is decoration.
- **The title renames in place** — DES-095's rule reaching the folder title —
  and the description is a field in the header, quiet at 14px, following
  DES-128's notes rule: prose you write into, not a label with an edit behind
  it. "Add cover" and "Add description" are hover-revealed ghosts above the
  title, present only while absent, which is DES-115 applied to a page.

1. **What the user does.** Gives a folder a mark, a colour, a cover and a
   sentence of context, and recognises it at a glance everywhere the folder
   appears.
2. **What the product cannot do today.** There is no icon column, no
   description column, no cover anything. Folder colour exists only as the
   *viewer's* label colour on their membership (DES-086's
   `PATCH /folders/:id/my-membership`), which is a different fact from a
   colour the folder itself wears.
3. **What it would need.** A guess, marked as one. Columns on `folder` —
   icon key (validated against a server-known set), colour, description text,
   cover key — and arms on the folder endpoints to write them. A custom cover
   image needs the DES-105 storage machinery; pattern and illustration covers
   are just keys. And one genuine design question that has to be ruled before
   pricing, the same shape as DES-102's: **whose identity is it?** A shared
   folder's cover and icon are either the folder's (one look for every
   member, anyone-or-owner-can-change rules needed) or the viewer's (a
   per-member table, and the same folder looks different to each person).
   The drawn version reads as the folder's; the shipping colour precedent
   (DES-086) is per-viewer. Those pull in opposite directions and Hassan
   should price the ruling, not both.
4. **What happens if it never ships.** The page keeps the plain folder glyph
   and no cover, which is exactly today. Nothing else depends on it; the
   cluster, sections and comments all stand without it.

### DES-131, the folder page's controls live in one small steady cluster

Imran's direction, 2026-08-18: sharing, filtering, view type and the folder's
other options want "a strong position — small and steady." **Drawn: one
cluster, pinned top-right, sticky over the scroll.** It holds, in order: the
view switcher (List, Board, Calendar), the open-task filter, the conversation
button with its count, the member avatars, Share, and the overflow menu. It
is the only chrome that does not scroll away, which is what steady means: the
folder's controls are always exactly where they were.

Lane 1 in substance — everything in it is presentation over behaviour the
screens already had — with three honest edges:

- **Board is real but rides DES-132**: its columns are the sections, so the
  view ships when sections do. Drawn as cards with title, due and assignee,
  a per-column capture point, and Done as the last column.
- **Calendar is a disabled control saying where it comes from** (V5's C1–C4),
  rather than a drawn view. An enabled control promising nothing is the
  fault DES-118 removed from History; it is not reintroduced here.
- **The Label-and-colour dialog does not exist on this page** — the icon
  picker (DES-130) took colour, and rename moved into the title. The v1
  screen keeps the dialog at `?folder-page=v1`, and the reconciliation with
  DES-086's per-viewer label colour is inside DES-130's ruling, not a second
  copy of it here.

What is owed: Imran's look, and one honest question for it — whether the
cluster should also absorb the page-bar strip's job when V2 (Chrome) rules on
L3, or stay inside the content column as drawn.

### DES-132, sections and paragraphs organise a folder page

Imran's direction, 2026-08-18: after the blank task row, a block for adding
**sections** — a section folds many tasks — and **paragraphs**, so the folder
page can be organised the way a page is. **Drawn in the shell**: the Wedding
fixture arrives with a paragraph and two sections, so the mechanism is judged
inhabited.

- **Capture stays first.** The blank row sits above the organising tier —
  "Add section" and "Add a paragraph" are the ghost tier below it, in
  DES-115's voice. A person in a hurry should never have to pass structure to
  reach capture.
- **A section is a collapsible heading with its own quick-add**, renamed in
  place (DES-095's rule again), deleted from its hover slot — and deleting a
  section returns its tasks to the folder rather than taking them along,
  because a heading should never be a place tasks can die.
- **A paragraph is a field, always** (DES-128's notes rule at page scale). An
  emptied paragraph removes itself on blur, so there is no zombie block to
  manage.
- **Board view is the same structure turned sideways**: columns are the
  sections. One model, two projections, which is the argument for sections
  being worth a backend at all.

1. **What the user does.** Groups tasks under named sections inside a folder,
   collapses a section they are not working in, writes a paragraph of context
   between sections, and sees the same sections as board columns.
2. **What the product cannot do today.** There is no section entity, no
   `section_id` on a task, no stored order for sections or for tasks within
   one (DES-071 again — every ordering conversation lands on that entry), and
   no storage for a free text block on a folder page.
3. **What it would need.** A guess, marked as one. A `section` table
   (folder_id, name, position), a nullable `task.section_id`, and the
   paragraph blocks either as a minimal `page_block` table or as the smallest
   honest slice of DES-055's content-block model — this is the entry where
   that decision stops being avoidable. Ordering needs DES-071's answer.
   And the same ruling DES-130 needs: **is the arrangement the folder's or
   the viewer's?** Sections feel shared (they are the work's structure, like
   the task list itself), which is the opposite pull from DES-086's
   per-viewer labels; it should be ruled once for this entry and DES-130
   together.
4. **What happens if it never ships.** The folder stays a flat list with the
   filter, which is today, and the header work (DES-130) still stands alone.
   Board view dies with sections; the cluster (DES-131) simply loses one
   switch position.

### DES-133, the floating New task button retires where a quick-add row lives

Imran's ruling, 2026-08-18: remove the floating "New task" button on the
folder page, because a blank task row is already there. **Drawn: the concept
page hides it, and the blank row is the page's capture point.**

The reasoning, recorded because W5 is a standing constraint and this entry
amends its reading rather than violating it: W5 requires **one always-visible
capture point per page**, and the plan's V2 session notes assumed that point
was the FAB. On the folder page it now is not — the quick-add row is always
visible, nearer the tasks it adds to, already knows which section it feeds,
and does not float over content. Two capture points on one page is one more
than W5 asks for, and the one that leaves is the one that says less about
where the task will land.

What this does not decide: the other screens. My Day, Planned and the rest
still show the FAB, and whether the retirement extends to every page with a
quick-add row is a per-page look, not a policy — Planned's calendar mode, for
instance, has no blank row at month zoom. The shell therefore takes the
retirement as a per-page prop rather than a rule. **The ruling owed** is
Imran confirming the folder page reading, and V2's L4 session (quick-add rest
state) inherits the question for the remaining screens.

### DES-134, a folder's conversation, and where it lives

Imran's question, 2026-08-18: comments should also work at the folder level —
"but where?" **Both credible answers are drawn**, switchable on the folder
page so the choice is made by looking, and both render the same thread
component as the card (DES-129, DES-123's rule):

- **End of the page** — the Notion reading. The page runs: header, the work,
  Completed, and then what everyone said about it. Comments belong to the
  page like a document's margin notes; the cluster's conversation button
  scrolls there.
- **Side panel** — the chat reading. A 360px panel slides from the right,
  non-modal on purpose (a conversation about the work should not cover the
  work), toggled from the cluster. This is the first drawn candidate tenant
  for the right panel DES-117 left "available, not allocated" — drawn is
  still not allocated, and DES-117's ruling stays open.

The honest difference: the page placement reads as *commentary* (slow,
attached to the work, read when you visit), the panel reads as *messaging*
(fast, presence-flavoured, glanced at while working). Which one Dana means
decides more than layout — it decides whether unread counts and notification
expectations follow, which is most of fact 3's cost. The count on the
cluster button is drawn in both.

1. **What the user does.** Talks to the folder's members about the folder —
   not about one task — with the same words, voice notes and files as
   DES-129, and finds that conversation where they expect it.
2. **What the product cannot do today.** Everything DES-129 lists, keyed by
   folder instead of task: no message table, no endpoint, no delivery, no
   unread state.
3. **What it would need.** DES-129's machinery with `folder_id` in place of
   `task_id` — the two should be priced as one system, because two message
   models is how a product ends up migrating one into the other. The panel
   placement raises the delivery stakes: a surface that looks like chat will
   be judged as chat, and chat without realtime and unread reads as broken
   where page comments read as fine. That asymmetry is a real cost input,
   recorded so the placement ruling and the infrastructure ruling are taken
   together.
4. **What happens if it never ships.** The cluster drops one button; the page
   ends at Completed. Task comments (DES-129) are unaffected either way.

### DES-135, the list measure is a reading measure

V1's first step, taken 2026-08-18 during F2a. The review's L1 finding: a task
title is a sentence, and 1120px of sentence is a stretch no typographer would
set. Three candidates were built and offered — the ~800px reading column, the
full width with metadata pulled to the title, and the incumbent — and
**Imran expressed no preference when asked**, so the studio recommendation
was applied rather than left hanging: `--shell-content-max` now takes
`--content-list` (800px) and every list screen, the folder page and the
states page lay out against it.

**Provisional, and honestly so.** A measure is the kind of decision the
plan's own rule says is made by looking, and the look that matters is
Imran's. The comparison instruments therefore stay until the F2d verdict
pass: `?measure=wide` restores DES-023's 1120px, `?measure=pulled` shows the
packed-metadata alternative. When Imran confirms, this entry moves to
APPROVED, supersedes DES-023's content-area width in part, and the
instruments leave — the same retirement the losing row concepts had.

Why 800 and not the other two, recorded so the reasoning survives: the
two-line row (DES-113) already pulled the details under the title, which is
most of what the pulled variant offers, without giving up the aligned due
column; and the visible cost of the narrow column — margin on wide screens —
is the self-announcing kind of cost, where a truncated or far-flung title is
the invisible kind. Dana chooses the honest cost, the same argument DES-113
used for its default.

What V1 still owes, unchanged: the L2 slot order pass on `task-row.tsx` and
the L5 sparse-page check, both to be judged at this measure.

### DES-136, a task in a surface is a page, not a row

Imran's ruling, 2026-08-18, opened as his own question: if a task can be
opened full screen or in a tab, should it still be the expandable task row
there? **No.**

**Why the row cannot travel.** Every affordance the row carries answers *this
task among others*: the collapse chevron means "back to scanning the list",
the hover-reveal actions mean "act without leaving the flow", the 14px title
means "one line among many". Take the list away and each one turns to noise —
the chevron worst of all, because at full screen it collapses the card and
leaves a naked 44px row floating in an empty page. That state shipped in the
first surface build and is exactly the borrowed-instead-of-composed fault the
critique rounds keep finding.

**What travels instead: the card.** The surface composes its own header —
the title at page scale (24/32, renaming in place by DES-095), a deliberate
completion control, the star — over *the same* `TaskCard` blocks the inline
row opens. Both go through one extracted wiring layer, `useCardWiring`, so
DES-117's one-artifact promise stays checkable rather than asserted: same
fields, same commit-as-made behaviour, one edits layer, two compositions.

**Five modes and a sixth that is the strip's.** Dialog, full screen, sidebar
right, sidebar left, floating — plus *open as a tab*, which is an action
rather than a mode, since it hands the task to the page bar. The card's
footer offers full screen where a host exists (the old disabled "not yet
available" is retired) and offers neither view nor close inside a surface,
because two closes in one surface is one too many.

Lane 1: presentation over the row's existing state.

**One defect found and fixed by measuring rather than looking:** switching
between the left and right sidebar left the panel parked off-screen at
x = −440. React reused the element across the class change, and `animate-in`'s
`fill-mode: both` then held the *new* animation's start state. Keyed by side
now. A still frame would never have shown it.

### DES-137, a view switcher is a strip of icons

Imran's ruling, 2026-08-18: where a surface offers views, the options are a
horizontal row of small icons — labels on hover, never written out. It
applies to the conversation's four homes and the task's six, and "inline"
earns an icon of its own rather than being the one option named in words.

One component, `components/view-strip.tsx`, in two shapes: `ViewStrip` for a
standing choice (the active view sits on the graphite wash) and `ActionStrip`
for a row of one-shot actions (the task row's "Open in…", where picking does
something once rather than switching a state). Two shapes, one grammar —
DES-123's rule applied to chrome, so a switcher can never disagree with
itself across surfaces.

What it buys beyond tidiness: the strip costs about the width one written
label did, so the six task modes fit where "Full screen ⌄" used to sit.

### DES-138, where a task opens is a preference, not a window manager

Imran's question, 2026-08-18, and the sharpest one of the round: should the
surface become a **movable** workspace — a dialog dragged anywhere on screen,
docking itself to either edge, everything customisable? He asked to be told
if the idea was wrong or if there was a better approach.

**The goal is right and the mechanism is not, for four reasons specific to
Dana.** Recorded in full because the idea will be proposed again:

1. **It collides with the gesture the product already teaches.** Dragging in
   Dana means *reorder* — rows, steps, card blocks, sections, board columns
   all learned it. "Drag moves a window" makes one gesture mean two things
   depending on what was grabbed, which is the exact fault the F2 rounds
   have been removing.
2. **Dana is a PWA.** A draggable window is meaningless on a phone, so every
   layout decision would need a second answer for touch.
3. **Unbounded positions create lost states** — off-screen windows, z-order,
   stacking, persistence, resize handles, and focus semantics for a surface
   with no fixed home. That is a window-manager project, not a task surface.
4. **No comparable product ships it.** Linear, Notion, Height and Todoist
   converge on the set Dana already has — peek panel, dialog, full page —
   plus keyboard navigation. What they *do* offer as customisation is
   remembering the choice, which is the part people use.

**What was built instead, ruled scope A by Imran:**

- **The choice is remembered.** Picking a mode from the row's strip, from the
  card's footer, or from inside an open surface stores it, and the next task
  opens there. `lib/task-surface-preference.ts`, the same module-store shape
  as `row-density` and `time-format` — the third preference to take it, which
  is now a pattern rather than a coincidence.
- **`tab` is deliberately not remembered.** A tab is an action, not a home:
  somebody who opens one tab has not asked for every task to become one.
- **The card's footer offers the same strip the row does.** It jumped
  straight to full screen before, which made one control a choice and the
  other a verdict.
- **The side panel resizes**, 360–720px, dragged from its inner edge or the
  arrow keys, double-click to reset, and the width is remembered too. The
  mirrored arithmetic is the only thing that differs by side.

**Deferred, not refused** — and worth revisiting only with evidence that
snap-docking is not enough: free XY positioning, drag-to-dock at the edges,
several floating tasks at once, saved layouts. Two tasks side by side is
already answered by tabs.

**Where this preference goes next:** it joins DES-113 (row density) and
DES-121 (the clock) in the Lane 2 conversation about syncing preferences to
the account. Three browser-side preferences is the point at which "does this
follow me between devices" stops being a per-entry question and becomes one
decision taken once.


### DES-139, the window bar: chrome belongs to the window, not the page

Imran's direction, 2026-08-18, against Notion's own arrangement: a thin strip
under the tabs, acting as the header of whatever that tab is showing. The
controls move to its right; the left stays empty until Dana has nested
folders and a breadcrumb trail to put there.

**Why the folder page's own strip was wrong**, and it only became visible
once tabs existed: controls that belong to *the thing this tab is showing*
are chrome, and chrome does not live inside the scroll area. The old strip
docked and un-docked, needed a sentinel and a scroll listener, and repeated
the folder's name that the tab two centimetres away already said. All of
that is deleted rather than improved.

**Left empty is the honest state.** A breadcrumb of one item is not a
breadcrumb, and inventing one would be inventing a hierarchy Dana does not
have. It is reserved, not forgotten.

**How a screen fills it:** the bar registers its right-hand container in a
module store and screens portal into it (`WindowBarActions`), so a screen
keeps its own state and still renders into shell chrome — no lifting half a
screen into the shell, and no render prop threaded through four components.

**The controls got quieter with it**, at Imran's word: Share is an icon
rather than a filled block, everything sits at 32px in a 40px strip, and the
bar gained **Activity** — a line of text ("Edited just now") that opens who
edited and who created, because its resting job is to tell you something and
only its second job is to open. Activity is drawn on fixtures; the real thing
needs the audit trail DES-076 has owed since v1.

**The bar is thin and the switcher is one icon**, refined 2026-08-18: a
36px strip with 28px controls and 14px marks, and the view switcher shows
*only the view you are in* until it is hovered or focused, when it widens to
all three. A switcher spends its life being read rather than used, so at rest
it should cost the width of what it is showing and nothing more. All three
options stay in the DOM at every width, so the keyboard and a screen reader
see the whole group however narrow it looks.

**A tab says what kind of thing it holds.** Task tabs carry a task mark; a
folder's tab carries the glyph its owner chose (DES-130) rather than the
generic folder, because a tab that disagrees with the sidebar row beside it
is a tab nobody trusts.

### DES-140, one filter, every place-page

Imran's direction, 2026-08-18: the strip is native to every window — My Day,
Tasks, Planned, Important, All and every folder — not a folder feature.

So the filter model and its panel left the folder page for
`components/task-filters.tsx`, and every place-page reads the same one: same
variables (due, assignee, importance, abandoned), same wording, same active
count, same clear. A control that means one thing in one place and something
narrower in another is a control people stop trusting — the same argument
DES-123 makes for the pickers and DES-137 for the view strips.

The folder page keeps its own filter *state*, because its list is sectioned
and its filtering has more to do; what it shares is the model and the panel.

### DES-141, a cover is native to every page except a task

Imran's direction, 2026-08-18. A cover is how a **place** announces itself,
and My Day, Tasks, Planned, Important, All, Done and every folder are all
places. A task is not a place — it is a thing inside one — so a task surface
and a task tab have no cover.

`components/page-cover.tsx` carries the whole affordance out of the folder
page: the band, the picker, the reposition drag, the foot scrim, and the
quiet "Add cover" ghost. No page grows a second, slightly different cover,
which is what would have happened had this been copied instead of moved.

The controls stay minimal at Imran's word: one joined Change·Reposition group
in the band's corner, revealed on hover, never a toolbar.

Lane 2 for the port: no page has a cover column, and the storage question is
DES-105's. Keyed by page name in the store folders already use.


### DES-142, the conversation has two homes, and the page's is a closed section

Imran's ruling, 2026-08-18, narrowing DES-134's four homes to two and
quieting the one at the foot of the page.

**Two homes, not four.** Floating and full screen are gone. A folder's
conversation is either *inline at the end of the page* — where it reads as
the page's own last section — or a *side panel* beside the work. The two that
left were the two that duplicated something else: a floating conversation is
the panel with worse ergonomics, and a full-screen one is a page that hides
the work it is about.

**The page's conversation is a closed section.** It was an open thread with a
heading; it is now one quiet collapsible line — chevron, mark, "Comments (4)"
— in exactly the grammar Completed uses directly above it, so the foot of a
folder reads as two peers rather than a control and an essay. A page ends in
its work; the talk about the work is one line you choose to open.

**Opening it from the bar opens the section**, rather than merely scrolling to
a heading, because a control that scrolls you to something still shut has not
finished the job.

**The panel starts under the window bar**, not under the tabs, which is what
makes it read as *this window's* conversation rather than a slab over the
app. The bar's height became a token (`--shell-windowbar-height`) so every
surface that sits below the chrome can agree on where the chrome ends —
measured: panel top 60px, bar bottom 60px.

**Its switcher collapses like every other**, per DES-137's refined rule: one
icon showing where the conversation is now, widening to both on hover or
focus. That behaviour moved into `ViewStrip` itself as a `collapse` prop, so
the folder's view switcher and the conversation's are the same component
rather than two implementations of one idea — which is the whole reason
DES-137 exists.


### DES-143, a message is told apart by tone, never by hue

Imran's direction, 2026-08-18: my own messages take a different accent — and
explicitly *not* a coloured one — while everyone else's sit in a light
container.

**Mine on graphite-900 with light text; theirs on the graphite-50 wash.** No
hue enters the thread at all, which is the part worth keeping: cobalt has
been the interaction colour since DES-016, and a message is not an
interaction. Tinting a message blue would spend the accent on something
nobody clicks and quietly weaken every control that needs it.

**The corner nearest its own author tightens to 4px** against 14px elsewhere.
It is the one detail that makes a container read as *spoken by* somebody
rather than as a box, and it costs a single class — no tails, no pointers,
nothing to redraw when a bubble wraps.

**Media is not put in a container.** A voice note and a file row are already
self-contained objects with their own edges; nesting them inside a bubble is
how a thread starts looking cluttered, and it would have forced a second
colourway for every one of them. Their side is said by alignment alone.

**The row lost its hover wash** with this: it was the same graphite-50 as the
other person's container, so hovering used to make a message look like
somebody else's. The actions still arrive on hover; the ground no longer
moves.

### DES-144, a menu of dead items is the least premium thing an interface owns

Imran, 2026-08-18, on the task row's overflow: it should look fully refined,
and it is missing Abandon.

Both faults had the same root. The menu was drawn before its actions existed,
so four of its five items did nothing at all — and being drawn rather than
built, nobody had noticed the words no longer fitted: every item wrapped onto
two lines at the default width.

What it is now: **Open full screen** (real, through the surface), **Move to
folder…** as a submenu that actually moves it, **Abandon**, and **Delete**.
Duplicate left rather than being wired, because the selection bar is where it
is real; a menu is better one item shorter than one item hollow.

**"Open in…" lives in two places, not three** (Imran, 2026-08-18). The row
carried a standalone icon for it beside the chevron while the open card
carried the same control in its footer — the same choice offered twice within
a centimetre. The icon is gone; the menu item took its job and grew into a
submenu of all six homes, so a *shut* row can still send a task anywhere
without expanding first. Two routes are enough: the menu while the row is
shut, the footer strip once it is open.

**Abandon sits above Delete and behind its own divider.** One says "I am not
doing this" and keeps the task; the other destroys it. They are not
neighbours in meaning and should not look like neighbours in a menu. On an
abandoned task the same slot reads **Restore**, because the row's inline
restore should not be the only way back.

### DES-145, a paragraph belongs between a heading and its first row

Imran found the gap, 2026-08-18: the insertion lines sat between *page*
blocks, so there was nowhere to write between a section's heading and the
first task under it — the one place a section most wants a sentence.

A section now carries its own opening paragraph, reached by an insertion line
directly under its heading. That line offers **only** "Paragraph here": a
section inside a section is not a thing Dana has, and a menu item that cannot
mean anything is worse than a shorter menu.


### DES-146, three homes for a task, and a like is the whole reaction set

Two rulings from Imran, 2026-08-18, both subtractions.

**Three homes, not six.** Dialog, sidebar, and open-as-a-tab. Full screen,
the left sidebar and the floating card are gone from everywhere — the row's
menu, the surface's chrome, and the stored preference. Each removal has a
reason worth keeping: full screen is what a tab already gives *with a way
back*; a second sidebar edge is a mirror nobody asked for; and floating is
the dialog with worse ergonomics. Three destinations a person can hold in
their head beats six they have to read.

Removing the left sidebar also retired a bug and a bad glyph together: the
two sidebar options shared one icon (the family has no panel-right, and the
substitute was a hamburger), and switching between them was the case that
parked the panel off-screen. The survivor takes a truer mark.

**A like is the whole reaction set.** The six-emoji picker is gone. A palette
asks a person to *choose a feeling* before they can agree, which is more
thought than the gesture is worth — and it put emoji, a vocabulary Dana owns
nowhere else, in the middle of the product's own typography. Liking is now
one press, drawn with the icon family like everything else, and the count
pill is an icon and a number.

**The actions moved down to the message.** Like, reply, edit and delete used
to ride the name-and-time line, floating above the thing they act on; they
now sit level with the message on its outer side — measured at 1px off the
bubble's centre, 4px clear of its edge.

### DES-147, a popover is as wide as what it holds

Found by Imran in the cover picker, 2026-08-18: the panel's tabs and its
Remove control were spilling outside the white.

`PopoverContent` carries a base width of `w-80`, and the cover picker's
content is 440px, so every popover in the product was silently imposing 320px
on whatever it was given. The two pickers now set `w-auto` and let their
content decide, with a viewport cap so a wide panel can never leave the
screen.

The same fault explains the gap Imran caught in the icon picker earlier: the
grid was measured to 264px while the popover stayed 320px, which is why the
right edge looked empty however carefully the grid was sized.


### DES-148, an affordance may not charge rent for space it is not using

Imran, 2026-08-18, on the insertion line under a section heading: keep the
ability to write a paragraph there, but the task row now feels disconnected
from its section when nobody has.

The line was a real 24px strip in the flow — correct for the gaps *between*
page blocks, and wrong immediately under a heading, where it pushed the first
row far enough from its own title that the two stopped reading as one thing.
An affordance that is used occasionally must not cost layout permanently.

So that one gets a **dense** variant: 12px tall with 4 of them borrowed back
by a negative margin, which leaves the heading and its first row 15px apart
— close enough to belong together, and still a target the pointer can find.
The page-level lines keep their full height, because there the space *is* the
separation between two blocks.

**And the paragraph takes the metadata tier.** It was set at 14/24, the same
size as the task titles it annotates and with looser leading than any of
them, so a note about the work was louder than the work. It is 12/20 in
graphite-600 now: one step under the row's title, level with the row's own
information line, which is where an annotation belongs. The folder's
description keeps 14/24 — it sits directly under the 24px page title as the
page's own summary, and that is a different job at a different level.

The hierarchy, top to bottom, now reads: page title 24 · section heading 16 ·
task title 14 · row information and paragraphs 12.

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
