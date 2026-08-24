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
| DES-149 | One head for every place, and a system page's mark is not pickable | PROPOSED | F3 | **Yes**, Imran's look |
| DES-150 | A place-page's controls leave the content column for the bar | APPROVED | F3 | Imran, 2026-08-19; spec 9.4 edit owed as B3 |
| DES-151 | A group heading is the section tier, on every page that has one | PROPOSED | F3 | **Yes**, Imran's look |
| DES-152 | The navigation model: five pages, one question each | APPROVED | F3 | Imran, 2026-08-21; the `?nav=v2` draw, then an RFC |
| DES-153 | A page is a view; the filter is the instrument that makes one | PROPOSED | F3 | **NEEDS BACKEND** for custom views; filter rebuild is design |
| DES-154 | A settled behaviour belongs to the mechanism, not to each screen | APPROVED | F4 | Imran, 2026-08-22 |
| DES-155 | A mark stands on ground, not in a box | APPROVED | F4/F5 | Imran, 2026-08-22; amends DES-130 and DES-149 |
| DES-156 | Grouping replaces a page's arrangement; it never nests inside it | PROPOSED | F5 | **Yes**, Imran's look; the filter rebuild DES-153 owed |
| DES-157 | Every rule proves it still bites, or it fails as blind | APPROVED | F5 | Follows from DES-154; a green check nobody checks is a rumour |
| DES-158 | Undo is an act with a name, not a button pair | PROPOSED | F5 | **Yes**, Imran's look; asked for 2026-08-22 |
| DES-159 | One drawing, one name; one field, one glyph | PROPOSED | F5 | **Yes**, Imran's look; his "no redundant icons" rule, both directions |
| DES-160 | A control comes from the system or it becomes one | PROPOSED | F5 | **Yes**, Imran's look; his shadcn-structure correction |
| DES-161 | A link is a link, not a file with an address | PROPOSED | F5 | **Yes**, Imran's look |
| DES-162 | An icon has a size before anyone chooses one | PROPOSED | F5 | **Yes**, Imran's look; asserted across 86 menus |
| DES-163 | Making a task means making it, from every door | PROPOSED | F5 | **Yes**, Imran's look; eight dead paths closed |
| DES-164 | The calendar's chrome is the shell's chrome | PROPOSED | F5 | **Yes**, Imran's look |
| DES-165 | A section somebody made is the same section | PROPOSED | F5 | **Yes**, Imran's look; unlocks icons on user sections |
| DES-166 | A section is a place a task can be moved to | PROPOSED | F5 | **Yes**, Imran's look; drag across sections, and the path on the row |
| DES-167 | The way in stays until it has been used | PROPOSED | F5 | **Yes**, Imran's look |
| DES-168 | A block earns the top of the page by having something in it | PROPOSED | F5 | **Yes**, Imran asked whether this was good or bad |
| DES-169 | An arrangement is a person's, so it is kept | PROPOSED | F5 | **Yes**, Imran's look; sections now survive navigation |
| DES-170 | Settings is a pin list, and Completed is Done | PROPOSED | F5 | **Yes**, Imran's look; DES-153's second half built |

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

**Ruled by Imran on 2026-08-22 — see [[DES-178]].** The day ships and the time
is deferred rather than deleted: a due-time returns later, alongside a start
date and time. That changes what this record asks of the port. It had said the
port keeps production behaviour until a ruling exists; the ruling exists, and it
is that the RFC **narrows the interface without dropping the data** — the picker
writes a day, the section 7 field keeps its moment, and a task whose time was
set before this ships keeps it.

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

**And prose takes the metadata tier.** The paragraph was set at 14/24, the
same size as the task titles it annotates and with looser leading than any of
them, so a note about the work was louder than the work. It is 12/20 in
graphite-600 now: one step under the row's title, level with the row's own
information line, which is where an annotation belongs.

**The folder description followed it down**, ruled by Imran the same day. It
had been kept at 14/24 on the argument that a page's summary sits at a
different level from a paragraph inside it — but the two are the same kind of
sentence about the same kind of thing, and a reader has no way to know they
were meant differently. One size for prose is the simpler rule and the truer
one. The empty-state ghost moved with it, off an unapproved 13px.

The hierarchy, top to bottom, now reads: page title 24 · section heading 16 ·
task title 14 · all prose and row information 12.

### DES-149, one head for every place, and a system page's mark is not pickable

F3, 2026-08-19, at Imran's direction: bring My Day, Tasks, Planned, Important,
All and Done into the folder page's composition family. **Drawn in the shell**,
on all six.

They had drifted without anyone deciding they should. The folder page grew a
cover, a mark at identity scale and a title with its facts arranged around it,
while the six pages one click away still wore v1's header — a 24px glyph inline
with the name, a subtitle stacked under it, and the page's own controls parked
to the right of its title. Two compositions in one product, and the sidebar
puts them next to each other.

So the folder page's header is **extracted rather than copied** — DES-124's
rule, and the same move DES-141 made for the cover — into
`components/page-head.tsx`. Every place now reads: cover, mark, "Add cover",
title with its fact, description. `PageHead` and `pageBodyClass` are the only
definitions of that arrangement, so the seventh page cannot drift from the
first six by a rounding of padding.

Three things this decides rather than merely moves:

- **A system page's mark is not pickable, and a folder's is.** Same geometry,
  same optical position, same plate-only-over-a-cover rule (DES-130) — but no
  popover. A folder is the person's own thing, so its glyph and colour are
  theirs to choose; My Day's sun is Dana's, and a picker on it would offer a
  choice that does not exist. The honest difference survives, and it is the
  only one.
- **The fact rides the title's line; prose sits under it.** The folder page
  divides this way already, and the six pages follow: "Monday, 10 August" and
  "Starred tasks" are sentences about the place and take DES-148's 12/20 prose
  tier, one step under the row's title. A **progress figure** is the quiet
  figure beside the name — and only My Day and a folder have one, because only
  they are a body of work with a completion. Tasks, Planned, Important, All and
  Done are queries, and nothing completes a query, so their fact slot stays
  empty rather than growing an invented number to fill it. My Day reads
  "4 of 10 done", in the folder page's own words.
- **The cover became reachable.** DES-141 ruled a cover native to every place
  and moved the whole affordance into `page-cover.tsx`, and the shell has been
  rendering `PageCover` on these six pages ever since — but nothing rendered
  `AddCoverAction`, so no page but a folder could ever be given one. The ruling
  was true in the code and false on the screen. The ghost now sits in every
  page's head, hover-revealed, exactly as it is on a folder that already has
  its cover.

One fault found and fixed on the way, and it was the reference design's too:
the header asked *"is a cover key stored?"* while the band asked *"does that
key resolve to something drawable?"*, and those are different questions. An
uploaded cover is an object URL alive for the session only (DES-130), so after
a reload the key is still in the store and draws nothing — and a head that
plated its mark on the key alone would float a white tile over blank page.
`usePageHasCover` now asks the band's question.

**What is owed:** Imran's look. Lane 1 in substance — every part of it is
presentation over behaviour the screens already had — except the cover, which
carries DES-141's Lane 2 mark unchanged and travels with DES-105's storage
question.

### DES-150, a place-page's controls leave the content column for the bar

F3, 2026-08-19, answering the second half of Imran's instruction: *then decide
per page what the bar should hold beyond the filter.* **Drawn in the shell.**

DES-139 ruled that controls belonging to what a tab is showing are chrome, and
that chrome does not live inside the scroll area. The folder page moved; two
pages had not, and each held its control beside its own title where the folder
page's used to be:

- **Planned's list/calendar toggle is now a `ViewStrip` in the bar.** Spec 9.5
  asks for a mode toggle persisted client-side and it still is one, still
  persisted. What went is a bespoke 44px segmented block with two written
  labels, which was the last switcher in the product not obeying DES-137's
  rule that a switcher shows only the view you are in and widens on hover.
  It collapses to one icon, sits left of the filter, and is literally the same
  component the folder page uses — which it now also is: **the folder page had
  its own hand-rolled copy of `ViewStrip`**, written before the component
  existed and identical to it line for line. One copy is a copy; giving Planned
  a second is the moment it becomes a fork, so both were replaced.
- **My Day's "Important only" switch is gone, and the shared filter carries
  it.** This was not a translation but a repair: importance is one of the four
  variables `task-filters.tsx` has held since DES-140, the panel renders a
  switch with the same star and the same words, and My Day's list was already
  being filtered by it. Two controls for one fact, forty pixels apart, either
  of which could contradict the other. `?state=important` seeds the filter now,
  and the strip's active count shows the state without opening anything.

For the other four pages the answer is **nothing beyond the filter**, which is
worth stating rather than leaving as an absence: Tasks, Important, All and Done
have no standing control of their own, and inventing one to make the bars look
alike would be furniture.

The bar learned one mechanical thing to allow this. Two blocks can now fill it
— the shell renders the chrome every place-page shares, a screen with state of
its own portals in separately — and portals land in mount order, which is not
an arrangement anybody chose. `WindowBarActions` takes an `order`, so each
block says where it sits: views, then the filter, then the quiet things, which
is the folder page's own arrangement written down.

**The spec note, and Imran's ruling on it.** Spec 9.4 writes My Day's structure
as "header with the date; important-only toggle switch". The switch still
exists, still on My Day, still a switch, still named "Important only" — but it
is one press deeper, inside the bar's filter, rather than on the page's own
header line. DES-139's reading is that the bar *is* the header of whatever the
tab is showing, which makes this consistent; but 9.4 is normative, and this
plan's own ground rules say a session that wants to change normative material
has found a ruling item rather than a task.

So it was put to Imran as one, and **he ruled it on 2026-08-19, explicitly and
knowing it changes the spec**: the switch belongs in the shared filter, and
**9.4 is to be edited to say so** rather than the design being bent back to the
sentence. This entry is APPROVED on that ruling and the drawing does not wait.

What is owed is the spec sentence itself, tracked as **B3 on the plan's rulings
track**, due before the port to `app/` and not before the next design session.
It is recorded there rather than here because writing it is the repository's
change process, not a design session's — the register says what the product
looks like, `docs/spec` says what it is, and this entry must not be mistaken
for the edit having happened.

Worth naming the contrast, because the two look alike and are not: **DES-122**
(a due date is a day, not a moment) is the same shape of spec conflict and has
*not* been ruled, so the port keeps production behaviour there. This one has.

### DES-151, a group heading is the section tier, on every page that has one

F3, 2026-08-19. DES-148 fixed the hierarchy — page title 24 · section heading
16 · task title 14 · all prose and row information 12 — and fixed it on the
folder page. Three of the six pages disagreed with it, which is finding S1 one
page down from where it was first written.

Measured before: the folder page's sections and All's two labels sit at 16 on
an `h-8` hairline band; My Day's "Carried over" and "Today" and Done's day
groups sit at 13 with no rule under them; Tasks' folder groups sit at 13 with a
folder mark. Three answers to *what does a group look like*, and in two of them
the heading was quieter than the rows it introduced.

All of them are `GroupHeading` now — 16 on the hairline, the mark kept where
there was one, the folder's colour kept on that mark, which is where a folder's
colour belongs.

**No heading grew a count, deliberately.** The folder page's sections carry one
because a person made those sections and can see how big they got. These groups
are computed, and more to the point spec 9.1 makes My Day's three headings
normative *to the letter, the count included* — "Carried over", "Today",
"Done today (N)" — so a count beside the first two would be inventing normative
copy. The tier changed; not one word did.

**One new level, on All only.** All nests folders inside its "Tasks" section,
so its folder headings are genuinely subordinate rather than peers, and they
take the scale's next step down: 14/600, no hairline, mark kept. They were at
13, which is on no scale the contract names — the same off-scale value DES-107
opened and F2a's exit test was written to catch.

**What is not touched:** the collapsed lines at a page's foot. "Done today (N)"
on My Day and "Completed" on a folder are the quiet collapsible grammar DES-142
settled for the conversation, deliberately one tier below a section heading
because they close a page rather than open a group. They already agree with
each other.

### DES-152, the navigation model: five pages, one question each

Opened by Imran 2026-08-19 as a challenge to the six system pages — redundant,
not MECE, named after Microsoft To Do's smart lists. **Settled by him
2026-08-21** after research (`six-pages-review.md`, including its dated
addenda) and four rounds of argument. The model below is APPROVED in
principle; the drawing behind `?nav=v2` is what his eye still has to rule on,
and the spec change is a separate RFC.

**The sidebar:**

```
Desk           unfiled, undated things; where a new account lands
Today          what I am doing today
Scheduled      everything with a date
Assignments    who is carrying what
Important      the starred set
All            everything, completed included
───────────
Personal ▸ …   the folders, user-made and deletable
```

Done is a sixth shipped page that **ships unpinned**, reachable from Settings.

**The rule the model rests on, in Imran's own words:** the native pages are a
filtered view, extract, or window of All. All is the ground truth; every other
page is a window onto it; Desk is where things land when nothing has been
decided about them yet.

**Each page locks its own axis and frees every other one.** Imran's rule,
2026-08-21: a page's identity is its spine, not a filter setting, so no native
page can be turned into something else by adjusting controls — while every
*other* axis stays adjustable, so the page is still useful. Today locks the
day; Scheduled locks has-a-date and offers Today · Week · Month · Year;
Assignments locks the assignee axis; Important locks the flag. Only All locks
nothing. This is also how the category does it: Todoist's built-in views
cannot be edited as filter queries, deliberately, while user-made filters can.

**Every axis has exactly one home**, which is the MECE claim made precisely.
When → Scheduled. Who → Assignments. Importance → Important. Status → Done,
plus the Completed sections on every page. Folder → the folder list. Commitment
→ Today. And All is the deliberate no-axis page. A task still appears on
several pages, and that is now a property with a reason — each page asks it a
different question — rather than six entries that looked like peers and were
not.

#### What the research decided, and what it cost

- **All is provably the union of Tasks and Planned** — the spec's own 6.1
  partition proof, pinned by AC-070 — so All absorbs both and the
  dated/undated split disappears. That split was two *values* of one axis
  promoted to two pages, which is the original non-MECE break.
- **Important survives as a page** rather than folding into the filter, on
  Imran's ruling that native pages exist so a person does not have to reach
  for the filter for the questions they ask constantly. Starring is a
  constant act; setting a repeat is not, which is why Routines is a filter
  variable and not a page.
- **Anytime was considered and rejected.** Things 3 splits its time axis into
  Upcoming and Anytime, and importing that would rebuild Planned + Tasks under
  new names — the very split this entry exists to remove. Undated tasks live
  in their folder and in All; "undated everywhere" is one filter press.
- **My Day became Today, and the mixing question was answered.** Microsoft's
  users are documented as confused by My Day versus Today, because one is
  curated and one automatic and the names do not say which. Dana's Q1 mixes
  the same two mechanisms. The finding: **mixing sources is fine, mixing
  questions is not.** Today holds what is due today, what carried over, and
  what was pulled in — three sources, one question, *what am I doing today* —
  and that is honest as long as the deadline question lives on its own page.
  Which is why Today and Scheduled are two pages and not one zoom.
- **The pull survives** because of that split. Imran's account of why it
  matters: My Day is not a due-date list, it is the page you start a day on,
  reading your folders and pulling in what you actually intend to do.

#### Names, and the principle that settled them

Three rounds failed before the principle was found: **there is a difference
between copying a coinage and using the common word.** "My Day" and "Assigned
to me" are Microsoft's inventions and copying them is copying. "Today",
"Scheduled", "Important", "All" are ordinary English that Apple also uses
because they are the plainest available words. The target is not "a name
nobody has used" — that produces worse names — but "no borrowed invention".

Two supporting findings: navigation labels want **nouns**, which killed the
imperative ("Do it today") and interrogative ("Who's on it") candidates that
were on the table; and a label should say **what is actually inside it**, the
lesson from Todoist renaming a filter from "Anyone" to "Me and Unassigned".

- **Desk**, not Inbox. Imran's ruling: Inbox carries email posture, and most
  of what lands there you wrote yourself. A desk is a place things land before
  being filed, which pairs with folders rather than fighting them. Approved for
  "tasks without any date, importance, assignation, or a user-created folder".
- **Assignments**, not People and not "Assigned to me". Imran's objection to
  People is exact: it "conveys a message of community and connections, not
  assignations", and the footer's People screen already owns that meaning.
  Assignments is the plain noun for what is on the page and is nobody's
  coinage. The footer's People screen is untouched — no rename, no migration.
- **Names never change; scope controls do.** The static-versus-dynamic
  question is answered by naming the *axis* rather than the current value: a
  sidebar entry is always static, the scope control in the controls row
  carries the value, and a pinned custom view is named by whoever saved it.

#### Desk sits with the pages, not the folders

Imran, 2026-08-21: Desk is native and cannot be deleted, so listing it among
user-made groups and folders misrepresents it. It joins the page block as the
home a new account lands on. **Placed first in that block by the studio**, the
position Todoist and Things both give capture, and one line to move if his eye
disagrees.

#### The Assignments page, in detail

Its spine is the assignee. **It defaults to everyone, grouped by person, the
viewer first** — not to "assigned to me" — because the value of a shared
to-do app is seeing the whole household's load at a glance, the viewer's own
tasks are still at the top, and it stops being Microsoft's feature rather than
merely being renamed.

Imran's framing is "assigned tasks from [A] to [B]", and one honest limit was
found against the data model: Dana records who *created* a task and not who
*assigned* it, so after a reassignment the "from" half is the creator rather
than the assigner. So the assignee is the page's slot and creator is a filter
variable. A true assigner field is a backend change worth making only if
people ask "who gave me this?" — recorded, not proposed.

#### Cost

**Frozen sections 4 and 7 take zero edits.** `/views/all` serves All,
`/views/planned` and its calendar serve Scheduled, `/views/my-day` serves
Today, `/views/done` serves Done; `/views/tasks` and `/views/important` simply
stop being called, and Assignments is a client-side composition over cards
that already carry their assignee. A frozen contract obliges the server to
keep answering, not the client to keep asking.

**Sections that change, none frozen:** 1 (scope), 2 (glossary — Home retires,
View narrows), 6 (notes that no page renders Q2/Q3/Q4 alone; 6.1 keeps its
proof and changes its section names), 9.1 (sidebar order, routes, regions,
quick-add placement), 9.3 (entry defaults lose two rows), 9.4 (My Day becomes
Today), 9.5 (rewritten around the new set), 9.7 (the Pages toggles become the
pin list), and roughly a dozen criteria in 12. The default folder's shipped
name changes from Inbox to Desk in provisioning, which is 4.3 prose rather
than a schema change, and 9.2's first-run destination moves to Desk.

**What is owed:** the `?nav=v2` drawing for Imran's eye, then the RFC. See
[[DES-153]] for the machinery this model implies but does not itself decide.

### DES-153, a page is a view, and the filter is the instrument that makes one

The machinery [[DES-152]] implies. Opened 2026-08-21 from Imran's question
about what Settings should list — a fixed set of shipped-but-disabled pages,
or the ability to make a page out of filters you have set. The answer is that
these are one mechanism, and saying so is what stops the sidebar sprawling.

**A view is one object with four parts:** a name; a spine, the one axis it
locks; defaults for every other axis, all still adjustable; and a mode — list,
board, or calendar. Every native page of DES-152 is an instance of it, and so
is a view somebody saves for themselves. Nothing is special-cased.

| View | Spine | Defaults |
| - | - | - |
| Today | the day | anyone, any importance |
| Scheduled | has a date | Today stop; anyone |
| Assignments | the assignee | everyone, grouped by person, viewer first |
| Important | the flag | anyone, any date |
| All | none | nothing filtered, completed included |
| Done | completed | everything else free |

**Settings is a pin list, not a page list.** One list showing every view a
person has, shipped and self-made, each with a pin toggle; the sidebar shows
the pinned ones. That is the constraint on endlessness — make fifty views, pin
three — and it is the shape Dana already ships, `user_settings` carrying
`show_important`, `show_all` and `show_done` with Done defaulting false. Apple
and Linear both work this way, choosing which smart lists appear and
favouriting a view into the sidebar.

**The honest split, and it is a lane boundary.** Toggling *shipped* views is
free: the booleans exist. **User-made views need a backend** — a table to hold
them and endpoints to read and write them — so this entry is NEEDS BACKEND for
that half only, and the design must not wait for it. Build the native pages as
views now so the object is right; custom views then arrive as persistence
rather than as a redesign.

1. **What the user does.** Sets the filters and view mode they keep
   re-creating, presses Save as view, names it, and pins it to the sidebar if
   they want it there. Imran's own example: "10/11/2027 – Ali – Important".
2. **What the product cannot do today.** There is no view entity, nowhere to
   store a filter state, and `user_settings` carries three fixed booleans
   rather than a list.
3. **What it would need.** A guess, marked as one. A `view` table
   (user_id, name, spine, filter state as JSON or columns, mode, pinned,
   position), CRUD endpoints, and the three booleans of 7.2 either migrating
   into rows or staying as the shipped views' pin flags. No change to the
   twelve queries: a view is a filter over results section 6 already returns.
4. **What happens if it never ships.** DES-152 stands entire — six shipped
   views, one unpinned, pinned state in the existing booleans. Only the
   make-your-own half is lost, and nothing else depends on it.

**The filter has to be rebuilt before any of this is credible**, and Imran
said so plainly: it is "far down then our expectations". Today it is a popover
of four single-choice rows, which was adequate as a side control and cannot
carry a model where pages *are* filter states. What it owes:

- more than one value per axis — Sara *and* Hassan, not one or the other;
- real date ranges, not only any / with / without / overdue;
- **repeating** as a variable, since Q3's rules already put every repeating
  task on the dated side and "show me my routines" should be one press rather
  than a page (DES-152's reasoning for why Routines is not a page);
- **created by**, which is Assignments' second half;
- active state visible on the page as removable chips, not a count you must
  open the panel to read;
- **group by** — folder, person, date — which does not exist at all today and
  which every page in DES-152 needs;
- **sort by**, also missing;
- and **Save as view**, the control that turns a filter state into a page,
  which is the bridge between this entry's two halves.

That is its own session, sequenced after the `?nav=v2` drawing, because the
sidebar is what tells the filter what it has to support.

### DES-154, a settled behaviour belongs to the mechanism, not to each screen

Imran's instruction, 2026-08-22, after the fourth round of the same complaint:
*"it seems like it's applying everything separately instead of creating a
logic and rule and working and updating things based on that… if a behavior is
finalized for an element such as TaskRow it should be updated anywhere else."*

He is right, and the evidence was measurable rather than a matter of taste.
Opening a task by pressing its body was "done" three times and was still
missing from **nine** task lists across six files; a folder's chosen glyph was
"done" and stopped at the sidebar's edge; the Desk fallback was written twice
and only one copy was correct. Every one of those was a rule held in a
session's memory and re-applied by hand.

So the rule this entry states is about *where* a rule lives:

> **A behaviour settled for a component is enforced by that component's own
> contract — a required prop, a single resolver, one shared component —
> never by each screen remembering it.**

Five mechanisms were moved onto that footing, and each replaced a class of
bug rather than an instance:

- **`TaskList.onTaskOpen` is required.** Opening by tap is resolved by the
  drag engine, since only the engine knows whether a press became a drag, and
  the engine can only report to whoever the list hands it. Optional, it was
  forgotten once per new list. Required, the compiler asks at every call site
  including the ones nobody has written yet — and asking it named all nine at
  once.
- **One resolver decides what folder a task is in** (`folderNameOf`,
  `useFolderMark`, `folderMarkFor`). A task with no folder is in Desk, and the
  label and the mark ask the same function, so a chip can no longer say "Desk"
  beside a generic folder.
- **One section component** (`TaskSection`). Computed groups and hand-made
  ones are the same thing; "native" is a capability — cannot be renamed or
  deleted — not a different component. Every section collapses.
- **One write path out of the card** (`onPatch` in `useCardWiring`). The card
  had kept edits in local state and reported only completion, which is
  invisible in an inline row and fatal in a surface that unmounts on close.
- **One icon layer is ever visible.** Static at rest, animated while hovered
  or focused, swapping back on leave — so an icon's visibility never depends
  on an animation succeeding, whichever glyph it happens to be.

**What this costs and why it is worth it:** a required prop is a breaking
change to every call site, and that is the feature. The alternative is what
this stretch spent four rounds doing — finding the same rule unapplied in one
more place each time Imran looked at a different page.

**The standing test.** The route sweep now asserts the invariants rather than
only that pages render: no prototype artefact in user-visible copy, exactly
one glyph per sidebar row, no stray title input in a list, no horizontal
overflow, no console error. A rule with no assertion behind it is a rule that
regresses silently, which is how most of these got lost the first time.

### DES-155, a mark stands on ground, not in a box

Imran's ruling, 2026-08-22, on the mark over a cover: the rounded white tile
"does not feel aesthetically strong". Taken at F4, completed at F5, recorded
here because it changes a rule two earlier entries state — [[DES-130]]'s plate
and [[DES-149]]'s "same plate-only-over-a-cover rule" — and an unrecorded
amendment is how a superseded rule gets re-applied by the next session.

**Why the box was wrong, which is not the same as why it looked wrong.** A
bordered white tile with a shadow is a *control's* clothing: it is what a
button wears. Putting the page's identity in it made the one thing on the page
that is unmistakably this place look like something to press — while the mark
that genuinely *is* pressable, a folder's, wore exactly the same tile as My
Day's, which is not.

**What the box was solving, and the better answer.** Notion drops the
container and pays for it over photographs, where a dark glyph on a dark image
disappears. The fix is not a fence around the mark but **ground** under it: a
soft radial scrim, the same trick a caption over an image uses, so the mark
separates from what is behind it without being cut out of it. On a bare page
there is nothing to separate from and the scrim is simply absent.

**And it grows over a cover rather than shrinking** — 32px bare, 40px plated.
The old header went the other way, 32 to 24, which is backwards: a cover is
the one place identity has competition and the one place it should be loudest.

**The F5 half is the DES-154 half.** F4's fix landed in `page-head.tsx`, the
head the six system pages render — and the folder page, the page that
composition was extracted *from*, kept its own copy of the mark and therefore
kept the box. The one page the reference design lives on was the one still
showing the superseded rule. So the mark is now a component, `PageMark`, and
the two call sites differ in the one way they honestly differ: a folder's mark
takes `interactive` and opens the icon picker (DES-130); a system page's is
not a control and is therefore not a button. Geometry, scrim, sizing and the
hover disc are written once. The folder page's reading column went the same
way, from a copied class string to `pageBodyClass()`.

Lane 1 entire: presentation over state the pages already hold.

### DES-156, grouping replaces a page's arrangement; it never nests inside it

The filter rebuilt, F5, 2026-08-22, against [[DES-153]]'s list. Imran's verdict
on what stood there was "far down then our expectations", and it was: four
single-choice rows, adequate as a side control and unable to carry a model
where a page *is* a filter state. All eight owed things are built and each is
exercised by an assertion rather than by having been looked at once:

- **More than one value per axis** — Sara *and* Hassan. Empty means anyone,
  which is the absence of a narrowing rather than a value meaning everything,
  so adding a person can never silently switch off a filter already set.
- **Real date ranges**: five named ranges and a custom one drawn on the shared
  calendar, which grew a range mode for it. The four old shapes survive
  alongside, because *whether* a task has a date is a different question from
  *which days*, and "no due date" is a sentence people say.
- **Repeating** and **created by** as variables.
- **The readout is chips on the page**, in the window bar's left end, one per
  axis and each removable on its own — because the thing a person wants to
  take off is the narrowing, and picking three chosen people apart again is
  what the panel is for. A count you must open a panel to read is not a
  readout. The bar's left end was reserved for breadcrumbs and now holds both:
  a trail and the narrowing applied to it read left to right in the order a
  person would say them.
- **Group by**, **sort by**, and **Save as view**.

**The ruling this entry is named for.** Grouping could have been added to each
place-page, and it must not be. Every page already arranges itself by the one
question it exists to answer — Today by spec 9.1's three normative headings,
Scheduled by its ladder, Assignments by person, All by planned-then-folders —
so a group-by that decorated that arrangement would put folders inside a
folder and people inside a person, and would need writing seven times. So:

> **Asking a page to group by something is asking it to arrange itself that
> way instead.** Today grouped by folder is today's work in folders. The page
> keeps its head, its cover, its bar and its filters, because those belong to
> the place; the one thing you changed is the one thing that changes, and
> returning Group by to Nothing gives the page back untouched, because nothing
> about it was ever edited.

That is also what DES-153 means by *a page is a view*: the spine is a default
arrangement, not a fixed property, and one `GroupedList` serves the six pages
and a folder alike.

**What is deliberately still the page's, not the filter's.** Grouping replaces
arrangement and never **subject**. The first wiring showed the whole database
under Today's head, which is the same class of mistake in the other direction;
each page's spine is now one predicate, said once, and the grouped view scopes
by it.

**Sorting defaults to Manual and Manual means do not touch it.** Every page
arrives in an order something else decided — the server's, a person's own
drag, a date ladder — and a sort that silently overrode it would be the filter
deciding something it was not asked about.

**Lane 1, except saving.** Filtering, grouping and sorting arrange rows the
client already holds. **Saved views are Lane 2** on DES-153's own split: there
is no view entity and nowhere to put one, so what is drawn keeps them in
`localStorage` and the panel says so in those words. Pinning a saved view into
the sidebar arrives with Settings' pin list.

### DES-157, every rule proves it still bites, or it fails as blind

The audit reported **PASS** for a week on "a folder is drawn by the one
resolver" while four surfaces drew the generic mark beside a named folder —
the New folder group dialog, the search overlay, the row's own folder chip and
Scheduled's calendar chip. Imran had named two of those out loud. The matcher
was `/<Folder[\s/>]/` applied line by line, and every one of the four wrote the
tag with its props on the following lines, so there was nothing after `<Folder`
for the character class to match.

The green was worse than no check at all, because it was used as evidence that
the thing it never examined was fine.

> **A check nobody checks is a rumour.** Every rule carries a *probe* — a
> scrap of deliberately wrong source it must flag — and the audit reports
> nothing until each rule has caught its own. A rule that stops biting fails
> as `BLIND`, in the place people are already looking.

It proved itself on its first run: the replacement folder-mark rule came back
blind, because the probe file was named `probe/folder-mark.tsx` and the rule
skips any path containing `folder-mark`.

This is [[DES-154]] applied to the checks themselves. A settled rule belongs to
a mechanism; a mechanism that can rot silently is not one.

### DES-158, undo is an act with a name, not a button pair

Imran, 2026-08-22: "Adding Undo feature in this prototype coz it's very
important, how to do it you know the best."

What stood there was an Undo and a Redo in the task card's footer, and they
were **permanently disabled**: `undoDepth` started at zero, Undo was disabled
at `<= 0` and Redo at `>= 0`, and nothing but those two buttons could move the
number. Four more beside them — Copy link, Share, Email, History — had no
handler at all. Six drawings of controls in the one place the card promises
its safety net.

The wiring was the smaller fault. **A footer with Undo and Redo promises
text-editor semantics a to-do app does not have**: there is no answer to what
"redo" means after un-completing a task, and the pair refers to nothing at all
once the card is shut. What people want to reverse is a discrete act with a
name — I completed the wrong one, I deleted one, I abandoned one.

So: a bar that says **what happened** and offers one press to take it back,
Ctrl/Cmd+Z for the same stack, and **no redo**. The bar expires after eight
seconds; expiring hides the furniture and never the capability, so the
shortcut still reaches the act afterwards. It never steals the keystroke from
a text field, which has its own undo and an older claim on it.

**The entries come from the mutators, not from the screens.** Complete,
reopen, abandon, delete and remove-from-Today register their own inverse as
they run, so every page has undo without knowing it exists — including the
page written next year. A screen that had to remember to call `pushUndo` is a
screen that will forget, which is the class of bug four sessions have spent
their time finding.

What left with it: Undo, Redo, Share and Email. Share and Email were fictions
about the model and the card's own note said so — Dana shares *folders*, so
"share this task" either invites somebody to the whole folder or it is a
sharing model nobody has specified. Copy link stayed and now copies. History
stopped being a second control beside a dead caption: the "Edited just now by
…" line **is** the control now, the same `WindowActivity` the window bar uses.

### DES-159, one drawing, one name; one field, one glyph

Imran's rule, 2026-08-22: "one native concept/feature/function should not
carry two different icons in the prototype and entire platform." It holds in
both directions, and both were broken.

**One drawing had two names.** `AlertCircle` and `CircleAlert` are the same
lucide glyph — lucide keeps the deprecated alias beside its replacement — and
both were live: one saying "this request failed" in the error state, the other
"this task is late" on a row. Same picture, two meanings, and nothing in the
source made it visible. Worse, both were paired with `TriangleAlertIcon`,
because the animated set has no circle-alert, so the resting glyph was a
circle and the hover animation was a triangle: every overdue row changed shape
under the pointer. Failure takes the triangle, which is the conventional glyph
for it and the one with a real animated twin.

**One field had two glyphs.** The due chip wore a calendar when the task was
on time and an alert when it was late — in a row that already says "Overdue"
in danger red, and in a card that already tints the chip. A field that changes
its glyph with its state is a field the eye cannot learn to find. It keeps
`CalendarDays` in every state; colour and copy carry lateness.

Both are asserted now, and the drawings are compared by **rendering** them
rather than by reading their names, because an alias pair is invisible to any
check that trusts a name.

### DES-160, a control comes from the system or it becomes one

Imran, 2026-08-22: the conversation "is still not following the shadcn UI code
or structure."

It was not, and neither were five other surfaces. The count: fifteen bare
`<input>` and `<textarea>` elements outside `components/ui/**`, each carrying
its own border, radius, ring and placeholder; six raw `<button>`s in the
thread alone; the graphite commit colour hand-copied into seven class strings;
and the avatar and the icon-button each **written twice**, once in the card and
once in the thread, both wrapping the same primitive.

Two of those had a cause worth naming. shadcn ships a `Textarea` and this
project never installed one, so there was nothing to reach for and every
multi-line field invented itself. And `comments.tsx` re-stated the avatar and
the icon button on purpose, to avoid an import cycle with the card that
imports it — sound at the time, and the mechanism by which a second copy of
each appeared. That comment predicted its own end: *"if a third file ever
needs it, it moves somewhere neutral."* The filter was the third.

What now exists, and where:

- **`ui/textarea.tsx`** — the missing primitive, and **`ui/inline-field.tsx`**,
  because Dana has *two* kinds of field and only one had a component. A boxed
  field announces itself as somewhere to type; an inline field renders as the
  text it edits and grows a ring only once you are in it. A title, a folder
  name, a description and a paragraph are content first and fields second, and
  boxing them would turn a document into a form.
- **`Button` gains a `commit` variant.** `--primary` is cobalt, which DES-016
  reserves for selection, focus and today; the product's strongest action is
  graphite-900, and it had been retyped in seven places. The sizes in that
  file are already this project's rather than upstream's, so naming a variant
  is in keeping.
- **`person-face.tsx` and `icon-action.tsx`** — one avatar and one icon button,
  in modules that import neither of their old homes, so the cycle they were
  avoiding cannot form.

The rule, asserted: **a bare form control outside `components/ui/**` is a
violation.** The exceptions are a file input, which has no appearance to
inherit, and a checkbox or radio, which has its own primitive.

**A second pass, after Imran sent shadcn's own chat composer as a reference.**
The thread was using system *pieces* while its main assembly was still
bespoke: a bordered `<div>` holding a textarea and three buttons, with the
border, the focus ring and the packing written by hand. shadcn has a component
for precisely that shape and this project had not installed it either. So
`ui/input-group.tsx` exists, with upstream's names and `data-slot`s, and the
composer follows the reference's arrangement — **the text on its own line, the
controls on a row beneath it** — rather than buttons sharing the line and being
shoved sideways as the field grows.

The two attach buttons collapsed into one `+` with a menu, which is the
reference's shape and the honest one: "add a file" and "record a voice
message" are two answers to one question, and two permanent buttons made them
look like two features.

**A fourth pass, read off shadcn's published docs rather than remembered.**
Fetching the real component pages corrected four things the earlier passes had
guessed: `InputGroupAddon` defaults to `inline-start` and `InputGroupButton`
to size `xs`; there is an `InputGroupText`; there is a **`MessageHeader`** (the
sender's name, *above*) distinct from `MessageFooter` (status, below);
grouping happens at the **message** level, not the bubble level; and the
avatar anchors to a message's **bottom** rather than its top. All four are
corrected, and two of upstream's rules are worth restating because they look
wrong until you watch them work: the header stays start-aligned whichever side
the message is on, because a label that swaps sides is a label you have to
find again; and in a run the avatar appears once, at the last message.

**Which controls hide behind the `+`, ruled.** Imran: "the record voice
message button should not be inside a +, it should be easily accessible. The +
icon should carry other related things to a chat." The rule underneath it:
**the `+` holds things you *attach*; a way of *speaking* is not one of them.**
Recording is a second way to write the message you are already writing, so it
sits beside the field as it does in every messaging surface people use. The
row reads *attach · speak · send*, and the `+` carries what a Dana
conversation can actually hold — a file, a link (DES-161 made those real), and
a person to mention — rather than one item that existed only to justify a
menu.

**A third pass, on the messages themselves**, after Imran sent shadcn's
`Message` / `Bubble` set as "a good shadcn reference for messaging". It is,
and it named a fault the thread had that nothing else would have found:
**alignment was re-decided in six places**, once per nested span, each with
its own `mine && "flex-row-reverse"`. A rule six spans had to remember is a
rule five of them will eventually forget. `ui/message.tsx` and `ui/bubble.tsx`
now hold it — the turn carries `data-align` and every part reads the side from
there — and DES-143's tone-not-hue rule stops being a ternary in the thread
and becomes `Bubble`'s two variants, which is where a rule about how something
looks belongs. Reactions moved inside the bubble (`BubbleReactions`), so a
like belongs to a message visibly rather than by sitting near it.

### DES-166, a section is a place a task can be moved to

Imran, 2026-08-22: "A task can't be dragged into a section, and it can be
dragged out either… if a page has no tasks, sections can't be created… A task
inside a section should show somewhere some type of hierarchy."

Three faults with one cause: **a section was a heading with rows under it, not
a place**. It could be made and named, but nothing could be put into it by
hand, nothing could say a task was in one, and on an empty page it could not
even be seen.

**Dragging across sections.** The folder page renders one sortable list per
section, and a list can only sort what it holds — so a row carried from one to
another had nowhere to land and sprang back. The engine gained a single seam
for it: on release it asks the page where the pointer was, *before* deciding
anything about its own order, and the page hit-tests its own sections. The
question outranks both the reorder and the folder-dwell, because neither means
anything once the row has left the list. Dragging *out* is the same gesture in
the other direction, because the page's unsectioned area registers as a target
like any other — to a person those are one act, not two.

**A section on an empty page.** Emptiness was measured in tasks alone, so
pressing "Add section" on a new folder worked, put the section in the model,
and left the empty state on screen. Somebody pressed a button, something
happened, and the screen said nothing had — the most discouraging possible
answer to a first action on a new page. A page with a section on it is a page
with something on it, whether or not anything is in that section yet, which is
the whole point of making one first and filling it after.

**The hierarchy.** A task's section was the one part of its address the row
never carried: visible under its own heading, gone the moment the row was
anywhere else — Completed, the board, a dialog. It rides after the folder chip
now and reads as the path it is, *Travel › Venue & vendors*, with a chevron
rather than a second glyph because what it adds is depth and not a different
kind of thing. Suppressed where it would only repeat the heading above it, and
that is decided once per list rather than per row.

### DES-170, Settings is a pin list, and Completed is Done

DES-153's second half, built. Imran's ask in his own words: an overflow on a
native page with "options of hiding a page and letting the user that you want
to unhide or activate this page you can do it from settings", plus
**Completed** and **Abandoned** pages off by default, plus **Anytime** — and
"'Desk' should not be disabled or hided from the sidebar."

**What Settings was.** Three named booleans — Important, All, Done — and a
line reading "My Day, Tasks, and Planned are always shown": v1's page set,
still being offered two navigation models later. It could only ever describe
the pages it was written against, and adding two views would have meant adding
two more booleans while a person's own saved view could never be in it at all.
It reads `NAV_PAGES` now, so a view added to the model appears here without
anyone editing this file, and each row carries the page's own mark and its own
sentence rather than a second description of it.

**Desk cannot be unpinned**, and the reason is structural rather than a
preference: it is the default folder, the destination every entry default in
spec 9.3 names, and where a task goes when nobody chose. Somebody who hid it
would go on filling it with no way back to what they had filed. A place you
cannot stop using is a place you cannot be allowed to lose. Its row is locked
in Settings and its page offers no hide item at all — a greyed one invites a
question that has no answer.

**Two views added, and one refused.**

- **Completed is Done.** Dana has three task states, and Done already *is* the
  completed one — spec 9.5 names it and `user_settings.show_done` ships it
  unpinned. Two entries for one state is precisely the fault this navigation
  model was built to remove, and it would be a worse instance than the
  six-page one, because the two would sit next to each other in the same list.
- **Abandoned** is the one state with no home at all: neither pending nor
  finished, filtered out of most pages, findable only by knowing where it was.
- **Anytime** is the undated work. DES-152 rejected it as a *page* — "Planned
  + Tasks reborn" — and that ruling stands for the pinned set. As an unpinned
  view it is a different proposition: opt-in, costing nothing if nobody turns
  it on, and the first thing in the product to demonstrate what DES-153 means
  by "a page is a view".

**Both render**, because a switch that turns on a page that does not exist is
a dead control wearing a toggle. They go through the shared view screen, which
learnt one thing to make it possible: an ungrouped view is a list, not an
empty page — which is also what every page becomes the moment somebody sets
Group by back to Nothing.

**Two corrections Imran made to this the same day, and both are about the
same discipline.**

*Anytime wore All's mark.* I gave it `Layers3` while adding it, and All
already had it. The lesson is about the checks, not the glyph:
`one-drawing-one-name` guards the icon *module* — two exported names
resolving to one drawing — and cannot see two entries in a list choosing the
same exported name. That is the same fault one level up, and it is the one a
person actually meets, because they meet it in the sidebar with both rows
visible at once. A new rule, `one-page-one-mark`, checks it; it was written
first and watched to fail on the real fault before the fix went in. Anytime
now wears a calendar with an X — the filter's own "No due date", and the other
value of the axis Scheduled's calendar carries.

*"Danger zone" is gone.* Two faults in two words: it is **GitHub's coinage**,
and DES-152 settled that Dana uses the common word rather than somebody
else's invention — the same rule that left "My Day" to Microsoft. And it
**names a feeling rather than its contents**: somebody scanning Settings for
how to close their account is looking for the word *account*, which was the
one word the heading did not contain. It is "Deleting your account" now, and
the section stopped saying its single idea three times — a heading, a row
title and a button all reading some form of *delete account*, plus "Review the
consequences before continuing", a sentence describing reading rather than
telling you anything. The consequence itself is there instead, in Dana's own
nouns: folders, members, tasks.

**Hiding from the page and from Settings write the same store.** Settings is
where you see the whole list and turn things back on; the page's own menu is
where the thought actually occurs. Neither is a second copy of the decision.

### DES-168, a block earns the top of the page by having something in it

Imran, 2026-08-22: "a section can't be started at the beginning of a folder. I
don't know whether it's good or bad."

It was bad. The loose-task block held the top of a folder page by right rather
than by content, so a folder organised entirely into sections still opened
with an empty capture row, and its first heading could never be the first
thing you saw. A page's opening line is the author's to choose, and this one
was the app's. Every comparable product puts loose items above the first
heading *when there are some* and lets the heading lead when there are none.

So the block appears on three counts, each a real state:

- it holds tasks that are in no section — then it is the page's most urgent
  content and belongs first;
- the page has no sections at all — then it *is* the page, and its capture row
  is the folder's one capture point (W5);
- or every section is shut, which would otherwise leave the page with nowhere
  visible to add a task.

**And the first attempt at the drop target was wrong in a way worth keeping on
record.** Dragging a task *out* of every section needs somewhere to aim, so a
dashed strip appeared at the top while a task was in the air. It read well and
failed twice: inserting a row mid-drag pushes the page down **after** the drag
engine has measured where every row sits, so the drop lands on the wrong slot;
and a target that exists only once you are already dragging is a target nobody
can discover.

Neither was necessary. A folder page is its sections and the space around
them, so *not inside any section* already means unsectioned. Sections are
asked first and the page body is the fallback — always present, nothing
inserted, nothing moved.

### DES-169, an arrangement is a person's, so it is kept

Imran, 2026-08-22: "When you create a section and then you leave the page, in
returning to page the section is gone."

It did. Sections were component state seeded from a fixture, and the shell
navigates by a full page load, so every section somebody made died at the
first click on the sidebar.

That was fine while a section was a drawing. It stopped being fine the moment
a section became something you *arrange* — name it, dress it with a glyph
(DES-165), reorder it, drag tasks into it (DES-166). A folder's glyph, colour,
cover and description have persisted since DES-130; a section is the same kind
of thing, a person's own arrangement of their own folder rather than a task.
Holding one in a store and the other in memory is a distinction only the
implementation can feel.

`lib/folder-layout.ts` keeps them beside the identities, one entry per folder,
in the same shape, so the two can be reasoned about and cleared together. Lane
2 travels with it exactly as it does for the cover (DES-105): there is no
column for a section, no ordering column and no membership table. What this
demonstrates is that the design wants all three, which is the argument the RFC
has to make.

### DES-167, the way in stays until it has been used

Imran, 2026-08-22: "Each of the folder page (native and non native) can get a
cover photo. Home is not getting it."

It was not, and neither was any folder somebody had already dressed. The
control took a `visible` flag; the folder page passed it `pristine` — true only
while the folder had no glyph, no cover *and* no description — and every other
page passed `false` outright. So the moment you gave a folder an icon, the only
route to a cover dropped to opacity zero with nothing to suggest it was still
reachable. Home ships wearing a house, so Home never had it at all.

The flag was measuring the wrong thing, and once the right thing is measured
there is nothing left for it to decide: the control already renders nothing
when a cover exists, so "no cover" is the only state it can be in. **A control
that is the sole way to do something, in the one state where it can be done,
is not a control to hide.** The prop is gone rather than corrected. Once there
is a cover the band itself is the affordance (DES-141) and this is absent.

### DES-165, a section somebody made is the same section

The last of the two-copies faults, and the one that had been blocking a
feature Imran asked for in his first list: *"if a user want they can add an
icon to a section too, but it should be in a way that if a section does not
carry an icon, the section should not feel like it's lacking something."*

[[DES-151]] said every section is one component. [[DES-154]] said a settled
behaviour belongs to the mechanism. `TaskSection` was then built for the
computed sections on the six pages — and **the folder page, the one place a
person actually makes sections, went on rendering its own copy of the same
heading**: its own Collapsible, its own chevron, its own 32px band and border.
Visually matched, structurally separate, which is the state a thing is in just
before the two drift.

It cost the page nothing to give up. The grip stays outside, because it
belongs to the page's drag rather than to the section; the name is handed in
as the heading; the menu goes in the `actions` slot the component had already
reserved for exactly this. `TaskSection` grew one thing to make it possible —
controlled `open`, because a person's folded sections are the page's state
and outlive any one section's mount.

**What it bought** is the glyph. The component that draws a computed section's
mark is now the component drawing these, so a user's section can wear one from
the same 42-glyph table a folder picks from — and Imran's constraint survives
untouched, because the mark is *inline* before the name rather than in a
reserved slot: a section without one simply starts its name earlier and
nothing sits waiting to be filled.

The folder page's Completed block went the same way. It was a second copy of
`CompletedSection`, differing in two ways nobody had chosen: 12px medium
against 13px semibold, and a highlight while a completion notice was showing,
which is the row's own job.

**One bug the merge exposed, and it is a good example of why two copies are
expensive.** Section headings started truncating — "Venue & vendors" became
"Venue & vend…" with two hundred pixels of room beside it. `TaskSection`'s
heading clips, which is right for a string; the name it was now holding is a
control that already truncates itself and sits on a `-mx-1` negative margin so
its hover wash lines up with the text, and an `overflow: hidden` heading
around that clips exactly those eight pixels. So the heading clips only when
it is holding text, and a node is left to manage its own width — which is the
only thing that can, since only it knows whether it is text. `InlineName` also
had `className` first in its `cn()`, so no caller could override anything it
set; that is the house convention repaired too.

### DES-163, making a task means making it, from every door

Imran, 2026-08-22: in Scheduled's calendar "the + inside the days does not
open a new task dialog", and on pages without the floating button the capture
row's options icon "is not functional and do not open the new task in a
sidebar or dialog".

Both were true, and they were the same fault twice. Every "new task" path in
the shell ended at `setTaskFormOpen(true)`, and **nothing has rendered that
since V3 deleted the form** — DES-093 put the task inside its own row, so
there is no sheet left to open. F4 rewired the floating button and left the
other eight paths, which is why the fault looked fixed from the one place
anybody had checked. `taskFormOpen` and four companion variables were set in
eight places and read in none; they are gone with the paths, because state
nothing renders is a promise nothing keeps.

All eight go through `createTaskAndOpen` now: insert a real task with 9.3's
entry defaults for wherever it was made, and open it in the surface with the
title waiting. A calendar cell passes its date, a folder's capture row passes
its folder and section.

One bug the wiring exposed, which no amount of reading would have: a task made
on the 20th arrived showing **"No date"**, because the record and the row
carry the date in two fields and only one was written. One fact in two places
is a fact that will disagree; the row's label is derived from the date now, by
the same function the pickers use.

### DES-164, the calendar's chrome is the shell's chrome

Imran, 2026-08-22: the calendar header "feels a bit oversized". It was 56px,
and the height was a symptom rather than the fault: the row held **four boxed
things** — a bordered pair of arrows with a divider between them, a bordered
44px group wrapping three 32px buttons, an outlined Today, and a shaded ground
with a hairline under it. Boxes inside boxes need a tall bar to sit in.

It is the shell's own grammar now, which this stretch has been applying
everywhere else: tone rather than hairlines, the system's buttons at the
system's sizes, and no container around a group of them, because the gap
already says they belong together. 44px, which is a 32px control with
breathing room and nothing more.

Two things in the grid disagreed with Dana's own date picker two clicks away,
and both are corrected to it: the weekday heads were 9px taller, semibold,
uppercase and tracked where the picker's are 11px medium in graphite-400; and
**today was a filled graphite square**, which is precisely how that picker
draws the day you have *selected*. One shape, two meanings, in one product.
Today is cobalt here as it is there — DES-016 gives cobalt that job and
graphite fill keeps selection.

### DES-161, a link is a link

Imran, 2026-08-22: in an expanded task, "when the links are entered they don't
show as openable links, instead they appear as downloadable assets."

They did, and the row said so in a word. A pasted link was stored as
`kind: "file"`, so it joined the file list wearing a paperclip and a trailing
label reading **"Download"** — while the only thing a press did was open an
image preview, which a link does not have. It was neither downloadable nor
openable.

So `link` is a kind of its own, with a `url`, and the row is a real `<a>`. That
distinction is worth more than it looks: middle-click, ⌘-click, "copy link
address" and the browser's own status bar all work on an anchor and none of
them can be faked by a button styled to look like one. The trailing word is
"Open", with the mark every other *this leaves here* control in Dana carries.

Two things came with it. A link typed without a scheme — `example.com/thing`,
because that is what people copy — gets `https://` rather than resolving
against Dana and going nowhere. And the attachment shape, which had been
declared twice (once for a task, once for a comment), is one type, which is
how one of them could have gained a `link` kind and the other not.

### DES-162, an icon has a size before anyone chooses one

Imran, 2026-08-22: "the icons sizing is also inconsistent in the overflow list
there." It was, and neither file involved was wrong on its own.

shadcn sizes a menu's glyphs with `[&_svg:not([class*='size-'])]:size-3.5`.
Dana's icons are a *span* wrapping an svg that carries `size-full`, and
`size-full` contains the substring that selector excludes — so the primitive's
rule silently skipped every icon in the family, and an icon given no size fell
back to lucide's own 24px. Menus whose author happened to pass `size-4` looked
right; menus that trusted the primitive were half again too big. Two sizes,
depending on whether somebody remembered.

The family carries its own default now — 16px, the compact icon token the
design already had — on both the animated and the static path, which had also
disagreed with each other for the same reason. Measured across 86 menus on
three pages: all 16. The sweep opens every menu on those pages and asserts it,
because this lived in the gap between two stylesheets and no amount of reading
either one would have found it.

Two smaller things in the same control, both consistency faults Imran's rule
covers: the "Open in…" submenu read *Dialog · Sidebar · Open as a tab*, so one
item restated the heading — they are parallel nouns now (**Dialog · Sidebar ·
New tab**), which work equally as menu items and as the view strip's tooltips,
since one array feeds both. And the dialog was drawn with the **fullscreen**
glyph, which is the one place a task can open that a dialog is not.

One thing moved with it, and it moved as one change because it could not
honestly move alone. Imran called the composer's placeholder oversized and
off-hierarchy; it was 14px where DES-148 puts prose at 12. Fixing only the
placeholder would have made the composer smaller than the messages it writes.
So the **message body, the composer and the card's Notes field** all sit at
12/20 now — which is the condition the plan had already recorded against this
question.

### DES-171, the alphabet is a first arrangement, not a permanent one

"Sidebar drag" — folder reorder, in and out of groups, two folders becoming a
group — had been on Imran's original list since the first session and was
still the one item nothing had touched. `app-sidebar.tsx` carried no drag code
at all: groups sorted by label, folders sorted by name, and the alphabet
decided where everything went.

An alphabet is a reasonable *first* arrangement and a poor permanent one,
because the folders somebody reaches for hourly are not the ones whose names
begin with A. [[DES-169]] settled the same question one level down for a page's
sections — an arrangement is a person's, so it is kept — and this is that
ruling applied to the directory.

**Nothing is stored until somebody drags something.** A sidebar nobody has
touched still reads exactly as it did, which is what keeps the clean-handoff
export and every capture stable; from the first drag on, the stored sequence
is the authority for the entries it names and the alphabet places the rest. So
a folder made tomorrow has a defined home without anyone having had to decide
where new things go.

**The directory is one list, not two.** Groups and loose folders share a
column, so a person moving things in that column is arranging one sequence. A
model that kept them apart would have to refuse the obvious drag — a loose
folder above a group — for a reason that exists only in the code. A group is
an entry in the directory and its folders are a list of their own inside it,
which is the same two-level shape the folder page already has in its sections
and their tasks.

**Three gestures, and they are one gesture seen from three angles.**
Stillness is what separates them, and always was ([[DES-103]]):

- **Travelling proposes a slot.** The rows make space and the carried row
  settles into it. Nothing is outlined, because the space is the answer.
- **Resting inside a container proposes that container.** The list stops
  holding a space open and the container answers instead.
- **Resting on a folder proposes that the two become a group**, and that one
  takes a deliberate 1.5-second hold, because making a container is a larger
  act than using one. A group created by every clumsy pass of the pointer
  would be worse than no grouping at all.

Dragging *out* of a group needs no target of its own: a directory is its
containers and the space around them, so *inside the directory but inside no
group* already means unsectioned. That is [[DES-166]]'s lesson repeated — a
target that exists only while you are already dragging is a target nobody can
discover.

**The naming panel is the one that already existed.** The hold hands its pair
to the New folder group dialog with both ticked, so everything about making a
group — the name, the validation, adding a third folder before committing —
stays one surface reached through a second door ([[DES-154]]).

**What `onDropAt` was missing.** F5 gave the drag engine a seam for "this went
somewhere else", and it settled what happens *on release* while saying nothing
before it. A row on its way into another container went on being drawn as a
slot in the list it was leaving, so the list held a gap open for something
that was never going to land there — and a list that lies about what a release
will do is worse than one that cannot do it. The engine gained the other half
(`onOver`), asked as the pointer moves: name a container and the list stops
proposing a slot, the hold stops arming, and the container is drawn as the
answer instead.

**Two deliberate limits.** A group cannot be put inside a group, because Dana
nests one level and the honest answer to that drag is that the group moves
past. And a group is **not** sprung open by hovering it mid-drag: opening it
would move every row below it *after* the engine had measured where they sit,
which is the same fault that retired the folder page's dashed strip. A closed
group takes the drop and says so in words instead.

### DES-172, a tab's controls belong to the window, not to the page inside it

Imran's points 16 and 17: a task opened as a tab had an **empty window bar**,
and its tab **carried no folder mark**.

The bar was gated off at F4 on the reasoning that *a task is not a place*, and
that reasoning holds for a place's chrome — a task has no filter, and DES-141
already refuses it a cover. But [[DES-139]] says the bar's right end holds the
controls for whatever the tab is showing, and a task has controls. What it did
instead was keep them inside the scroll area, which is exactly the arrangement
DES-139 was written to end.

So the same `Actions` cluster is **drawn in the bar rather than in the header**
— one element with one set of handlers, moved and not copied, because a second
menu written for the tab is the fault this repository keeps repairing. The
panel and the floating surface have no window bar, so there the cluster stays
in the header; the page decides where its chrome goes from whether it *is* the
window.

**The bar's left end finally has something true in it.** It was reserved for a
breadcrumb trail and Dana has no nested folders, so it has been empty since it
was drawn. A *task*, though, has an address — its folder, and its section
within that folder — which is precisely the path [[DES-166]] put on the row.
That is what stands there now, with the same chevron and the same reasoning:
depth, not a different kind of thing.

**A task tab wears its folder's mark**, from the one resolver. It wore a
generic tick, which is [[DES-155]]'s fault one level up — an identity only some
surfaces honour is a decoration on one screen. Emphasis rides opacity rather
than hue, the arithmetic the sidebar's folder row settled at F5, because the
colour is the folder's and has to survive.

Two things a tab could not do until now and its own row could — **Abandon and
Delete** — reach it as well. F5 gave them to the floating surface and not to
the tab, so the same page could do less to a task depending on which window it
was in.

### DES-173, a description Dana wrote is a first draft

`nav-model` has documented an editing fallback for a page's sentence since F4
and nothing built it: the six pages rendered theirs as a paragraph, so the
shipped wording was the only wording there could ever be and the note
described a feature that did not exist. Imran's ask was "a short, memorable,
catchy and natural sentence" a person can **edit later**.

It is built, and it is the folder page's own control rather than a second one:
that page has had an editable description since [[DES-130]], and [[DES-149]]
extracted the head from it precisely so the places would stop being written
twice. Both call `PageDescription` now.

**Clearing it restores Dana's sentence**, which is what a fallback means and
why there is no separate reset — and typing Dana's own words back in stores
nothing, so a page that agrees with the shipped wording keeps following it
rather than freezing a copy. A folder has no shipped sentence, so clearing one
there leaves it empty and the ghost returns: the same rule, reading
differently because the two have different defaults.

### DES-174, a board column is a place, and Done is a status

The board could not move a card. Columns moved, cards did not, and the reason
was structural rather than an omission: the board drew its cards by hand, with
their own click handler and no engine at all, while the list beside it had had
cross-section dragging since [[DES-166]]. The board is that page turned
sideways, so it must not grow a second answer to one question ([[DES-154]]).

The cards go on `TaskList` now, with `renderRow` keeping the card's own
presentation — a card is the row's kin, not a row — and each column registers
itself with the same zone registry the sections use, answered by the same
resolver.

**Done is a column that means a status.** A board whose Done column cannot be
dropped into has drawn a control and refused it, and Done is the column
everybody aims at first. So the two columns that are not sections do what they
look like they do: dropping on Done completes the task, and carrying a card
back out reopens it and files it wherever it landed.

**No section is a place on the board and an answer on the list.** On the list,
"not inside any section" is what the space around the sections means, and
[[DES-166]] settled that it needs no target of its own. On the board there
*is* a column for it, and a person aims at it. One resolver, two readings of
the same null.

### DES-175, People is a roster, Assignments is work

Imran, on the sidebar: Assignments and People were both round-head person
glyphs, and at 16px two figures of the same family read as the same row.

The split that fixes it is a real difference rather than a different
accessory. **Assignments is work that belongs to somebody** — a person
carrying a tick, which [[DES-170]] already settled. **People is the roster of
humans you share with**, which is a card with a person on it: the rectangle
dominates at 16px, so the two are told apart by shape rather than by a detail
nobody can see at that size.

`one-page-one-mark` could not have caught this and still cannot: two
*different* names is exactly what that rule wants, and no static rule judges
whether two drawings look alike. What it can see now is the **footer**, whose
two screens moved into `nav-model` in the same pass — they were literals in
the sidebar and the rule reads that file. They are deliberately not
`NAV_PAGES`: neither is a view over tasks, neither can be pinned, and neither
belongs in Settings' pin list. What they share with a page is a name and a
mark, which is the pair the rule cares about.

### DES-176, the shell has no hairlines left

The sidebar's 1px right border was the last rule standing after the shell
pass. Everything else separates tonally — the sidebar's graphite-50 against
the page's white — so the line was drawing a seam the tone already drew.
shadcn ships it because its sidebar and its content share one ground; Dana's
do not.

### DES-177, a view is a shape, not a question

Imran asked for "a proper and strong strategy" for the view controls — which
pages offer list, board and calendar, and why — and it was the one item on his
list with no decision behind it. What stood in its place was three switchers:
the folder page's list / board / **calendar-disabled-with-"not available
yet"**, Scheduled's list / calendar, and nothing anywhere else. Three screens,
three private answers, and a promise on the folder page that was never coming.

**The strategy is one sentence.** A page decides *which* tasks; `Group by`
decides *what they are grouped by*; a view decides only *how those groups are
drawn*. A view is therefore not another way of asking the page's question — it
is a shape for the answer, and the board is the page's current grouping turned
ninety degrees. That is why there is one board component rather than one per
screen, and why choosing Board never changes what is on the page.

**Two tests decide whether a page offers a view**, and both are falsifiable
rather than matters of taste.

**1. It must be able to draw everything the page holds.** A view that silently
drops part of the page is a view that lies about the page. A board can always
draw everything, because *no group* is a column — which is exactly why the
board has a **No section** column ([[DES-174]]). A calendar cannot draw a task
with no date: there is no cell for one. So a calendar is offered only where
**having a date is what puts a task on the page**, which is Scheduled and
nowhere else. A folder holds undated work by definition, so the folder page's
disabled calendar was not unbuilt — it was refused, and saying "not available
yet" promised a thing that is never coming ([[DES-144]]).

**2. It must not collapse to one group.** A page either **pins** a value on
its axis or **spans** it. Desk pins one folder, Today pins one day, Important
pins one value of the flag; Scheduled spans every date, Assignments spans every
person, All pins nothing at all. Arranging by an axis the page has pinned gives
one group, which is a list wearing a different control — a calendar of Today is
a single cell. Arranging by an axis the page **spans** is that page's natural
picture, which is why the calendar belongs to Scheduled and why Assignments'
board is a column per person.

**List is the ground and needs no reason.** Any set of tasks is a list, so it
is offered everywhere, is always the default, and is what a page falls back to
when the remembered view is one this page does not offer.

**What the rule gives:**

| Page | Pins or spans | List | Board | Calendar |
| - | - | - | - | - |
| Desk, and any folder | pins one folder | ✓ | ✓ its sections | ✗ undated work lives here |
| Today | pins one day | ✓ | ✓ | ✗ one cell |
| Scheduled | spans date | ✓ | ✓ | ✓ its own picture |
| Assignments | spans assignee | ✓ | ✓ people | ✗ undated |
| Important | pins the flag | ✓ | ✓ | ✗ undated |
| All | pins nothing | ✓ | ✓ | ✗ undated |

**Where a board's columns come from, when nobody has said.** The board draws
the page's grouping, so it needs one, and choosing Board on an ungrouped page
therefore *sets* one — the two controls are one setting seen twice, and a board
with no columns would be a control that does nothing. The default is the
page's own spine where the page spans a categorical axis, which is Assignments
and people; the sections a person made, inside a folder; and the folder
everywhere else, because the folder is the one categorical value every task
always has ([[DES-155]]'s Desk fallback is what guarantees it).

**One strip, in the bar.** The shell draws it for every place-page from this
rule, leftmost, ahead of the filter — the arrangement the folder page settled
first. Scheduled's own switch and the folder page's own list were both forks of
one component waiting to happen ([[DES-154]]); they are gone.

### DES-178, a due date is a day, and a time is an addition rather than a correction

Imran's ruling, 2026-08-22, closing [[DES-122]], which had been open since F3
and was the last thing blocking the port on this question:

> "A due date is for now a day, later we can add a due-time too, and also a
> start date and time too."

Three things follow, and the order of them matters.

**The day ships.** Everything DES-122 drew stands: the Due picker offers no
time, the reminder presets are day-level, and "due at 17:45" is a reminder
wearing a due date's clothes.

**The time is not deleted, it is deferred.** DES-122 removed the field from the
lab's model on the reasoning that a field nothing can write is a field somebody
has to work out the fate of. That reasoning was right for the prototype and is
now wrong for the spec: the production task carries `due_at` with a time, in
section 7 and in the reminder tick, and this ruling says that column is on its
way back rather than out. So the RFC **narrows the interface without dropping
the data** — the picker writes a day, the API keeps the moment, and a task
whose time was set before this ships keeps it.

**And a start is coming with it.** A start date and time is a second field, not
a variation on the first, and it changes what a task *is* — something with a
span rather than a deadline. It reaches the calendar (a task with a start and a
due is a bar, not a marker), the Scheduled ladder, and every sort by date. It
is named here so the RFC can say the shape it is leaving room for, and it is
**not** drawn in this refresh.

### DES-179, a filter belongs to the page, and to the session

An open question rather than a bug: a filter did not survive leaving the page,
because the shell navigates by full page load and the filter was component
state. Imran had no view; the ruling is the studio's.

**It does not cross to another page.** A filter is a narrowing of the page you
are on. One that followed you would mean arriving somewhere with a constraint
you never set there, and the first thing you would notice is missing work
rather than the reason for it. A narrowing worth keeping across pages is not a
filter at all: it is a view, it has a name, and [[DES-156]] already built Save
as view for exactly that. **Ad hoc is transient, named is kept** — blurring
that line would leave two half-answers where there are now two clear ones.

**It does survive coming back.** Leaving Today to check Scheduled and returning
is one act of looking around, not a decision to stop filtering. The test that
separates the two halves is **visibility**: the active filter is drawn as
removable chips in the window bar ([[DES-153]]), so somebody returning to a
narrowed page can see that it is narrowed and undo it in one press. State you
can see is safe to keep; state you cannot is how a page comes to lie about what
it holds.

Session storage rather than local, which is the same rule a third time: a
filter is working state, not a preference. Closing the tab ends the session of
looking, exactly as it ends the task tabs the page bar holds.

### DES-180, an arrangement is a person's, not the folder's

The second question Imran had no view on: is the sidebar's folder order per
person or per account? The ruling is per person, and it is not a close call
once the neighbouring facts are lined up.

A folder **group** is already a personal label — the group dialog says so in
its own words, "Groups are personal labels… Other members are unaffected" — and
an order is the same kind of fact as a grouping. Both answer *how do I keep my
desk*, and neither says anything about the folder itself. Two people sharing a
folder must never be able to move it in each other's sidebar; that is not
collaboration, it is a fight nobody asked for.

So it goes to Hassan as **per-user** storage — a position beside the existing
per-user membership row rather than a column on the folder — and it travels
with [[DES-113]] (row density), [[DES-121]] (12/24-hour) and the surface
preference, which are the same conversation: four things a person chooses that
currently live in this browser and need a home on the account.

### DES-181, Desk is where the lamp is

Imran, 2026-08-22: Desk's glyph should be a desk lamp.

[[DES-152]] renamed Inbox to Desk because Inbox carries email posture — a place
things arrive — and most of what lands there you wrote yourself. The page then
went on wearing the literal tray, so it had escaped the word and not the
picture. A lamp is where you work rather than where things arrive, which is the
whole distinction the rename was for.

Two things were fixed with it, both instances of faults this register already
names. The mark is decided in the one place a folder's native mark is decided,
so it reaches every surface at once — the page tab was still importing a glyph
of its own, which is [[DES-155]] in miniature: dressing Desk changed the
sidebar and left the tab wearing the shipped drawing. And the animated family
has no desk lamp, so it is drawn plain rather than animated into something
else — reaching for a near-enough animation is exactly how the two alert glyphs
came to morph into a triangle ([[DES-159]]).

### DES-182, a task made on a page belongs to that page, and a column is where you make it

Imran, 2026-08-22, on the board: only a folder's board had "Add task" in each
column and "Add section" for the page; the other native pages had neither. And
then the observation that closes it — "in Board view we don't need the FAB if
add a task and section is accommodated."

He is right on both, and the second is [[DES-133]] arriving at its own
conclusion: **W5 asks for one always-visible capture point per page, and the
floating button is the one that leaves wherever a capture row already exists**,
because the row says where the task will land and the button does not. A board
column says it better than any row: the column *is* the value. So the button
retires in board view on every page, and the rule that was written per page is
now applied per view as well.

**Capture in a column means capture with that column's value.** A task typed
into the Home column is in Home; into Sara's column, Sara's; into a date
column, due that day — and the page's own entry defaults ride underneath, so
one typed into Sara's column on Important is Sara's *and* starred. Two columns
refuse it rather than pretending: **Overdue** is a relation to today rather
than a value, and there is nothing to make.

**A column you can add is a column that is a thing.** Whether a board offers a
new column is not the board's decision — it is a fact about the axis it is
grouped by. Sections are things a person makes, and so are folders, so those
boards offer it and say the name of the thing ("Add section", "New folder").
A person is not something you create because you wanted a column for them, and
every date already exists, so those boards do not offer it at all rather than
offering it and refusing. That is [[DES-177]] one turn further on.

**And then the fault underneath, which was worth the whole exercise.**

Building the column capture made a silent bug visible in a minute: **a task
made on Today never appeared on Today.** Today's spine is `myDayGroup`, not the
due date, and the floating button set a due date and nothing else — so the task
was made, opened in a surface, and was simply not there when the surface
closed. Scheduled would have been worse: its spine is *having* a due date and
the button gave it none. Abandoned worse again — a task made there arrives
pending, and the page holds only what has been given up.

Nobody saw any of it because **the button opens a surface over the page it has
just failed to add to.** The board's capture rows add in place, so the absence
was immediate.

> **A capture point that makes something the page then hides is worse than no
> capture point at all.** You type, you press Enter, and nothing happens.

So the entry defaults stopped being a convenience and became a rule: **they are
whatever satisfies the page's own spine.** Today seeds its membership, Today
and Scheduled seed a date, Important seeds the star, Tasks and Anytime
deliberately seed no date because that is what they are. Done and Abandoned
offer no capture in any view, which AC-096 already required of Done and which
is the same argument for Abandoned. The spine's unnamed else-branch got a name
in the process — three places were spelling out "not any of the others" by
hand, which is why nothing had ever compared the defaults to the spine.

Both capture points share the defaults now, so a third one cannot be written
without them.

### DES-183, a row says what its page does not

Four of the 2026-08-17 review's row findings had sat open since V3 was
chartered, and they turned out to be one fault with four faces:

- **R7** — a finished task on **Done** shows a due date, under headings that
  already group by *when it was finished*. Two dates, and the louder one is
  the one that stopped mattering.
- **R2** — every row on **Important** wears a filled gold star, on the one
  page where the star can distinguish nothing.
- **R4** — every row under **Carried over** paints its date red, on a block
  whose membership *is* being late. A warning true of everything warns nobody,
  and it quietens the genuinely late rows on every other page.
- **R1** — and the mirror image: an unfiled task showed **no folder at all**,
  while [[DES-155]] says it is in Desk. The one task whose address the row
  could not tell you.

> **A row says what its page does not.**

The section chip has worked this way since [[DES-166]] — "absent when the row
is already sitting under that section's own heading, which the page decides
per list rather than per row" — and this is that decision generalised to every
fact a heading can carry: folder, assignee, date, the star, and the tone of a
late date.

**Decided per list, never per row.** A row cannot see the heading above it, so
it cannot possibly know; and a screen that had to remember on every row is a
screen that will forget on one ([[DES-154]]). It arrives as one `given` object
on the list, and the compiler asks for it at the call site.

**The page and the grouping both speak, and they merge.** A folder heading
names the folder; a *page* says something the grouping cannot — Important is
the star whatever it is grouped by, Done is finished whatever it is grouped
by. That distinction is where the fault would have come back: the page's half
reached the six bespoke screens and stopped the moment somebody grouped one of
them, because grouping swaps the screen ([[DES-156]]) and the replacement knew
nothing about which page it was standing on.

**And the card is the row's kin.** The rule reached `TaskRow` first and the
board's card not at all, so Important's board went on drawing six gold stars
and Done's cards went on echoing spent deadlines. The check written for the
row is what said so, within the hour — which is the argument for writing the
check in the same session as the rule.

Two smaller findings closed with them. **R5**: the relative ladder — is it
late, today, tomorrow, or a date — had been written out three times, once for
the row's chip, once for a date grouping's headings and once for the filter's
range labels. The *rung* is shared now and the *words* are not, deliberately:
a row says "Due tomorrow" because it describes one task and a heading says
"Tomorrow" because it names a bucket, so sharing the sentence would have
forced one of them to read wrongly. **R6**: the steps ratio keeps its
compressed form and gains the words it stands for on hover, rather than
spending width the row has not got.

### DES-184, a reference sheet is drawn by the thing it describes

V3's stated deliverable is the states page, and it was still v1's — which is
worse than out of date, because it is **wrong in the one place a person goes
to be right**. It drew a row this product no longer ships, four "interaction
states" that all rendered identically, and two states that rendered nothing at
all.

**The lies were load-bearing.** Five props — `visualState`,
`showSecondaryActions`, `menuOpen`, `unassigned`, `invitePending` — survived on
the shipping row's contract, accepted and ignored, carried "so the states page
keeps compiling". A prop that cannot do anything is [[DES-144]]'s dead control
one level down, and the page that needed them was the only reason they were
alive. Both are gone; the v1 row survives whole at `task-row-baseline.tsx` for
anyone comparing.

**It renders the shipping row now**, so it cannot disagree with the product,
and hover, focus and selection are *done* rather than drawn — every row on the
sheet is live, because the new row draws its own states and the honest way to
show that is to let somebody put a pointer on one.

**And it left the audit's lab exclusion.** It had been excluded as a lab,
which was true when it was one and false the moment it became a deliverable —
and in that gap it drifted for four sessions with nothing able to say so. A
reference nobody checks is a rumour ([[DES-157]]); a wrong one is worse than
none.

The sheet gained one section it never had: **what the page already says** —
[[DES-183]]'s five contexts, the same task drawn in each. That rule is
invisible on any single screen, because seeing it means seeing one task twice
under different headings, and this is the only surface in the product where
that can be arranged.

### DES-185, one task, one copy of it

Imran, 2026-08-22: "A sidebar view of a task row does not carry the edits (in
steps, notes, links, and attachments) which are added in inline view of it.
You know that dialog, sidebar, inline, and maybe more are just views of the
same task row, so the data inside them should be the same and updated
simultaneously."

The model was right and the code was two things short of it.

**Nothing but the surfaces had a write path.** `useCardWiring` has reported
every edit upward since F4 — but only to whoever passed it `onPatch`, and
exactly two callers ever did: the floating surface and the task tab. Every
*inline* row on every screen had none, so a note typed into an expanded row
lived in that row's local state and existed nowhere else. Open the same task
in the sidebar and you were looking at a second copy that had never heard of
it.

Threading a handler would have meant twenty-four list call sites in eleven
files and hoping the twenty-fifth remembered — the fault [[DES-154]] exists to
name. So the shell publishes its write path as a context and the card reaches
for it: **the one component that already wraps every screen provides the one
function every card needs.** This repository normally refuses contexts, and
the reason it refuses them does not apply here — `row-density` is a *value*
read in fifty places, where a provider is a provider around the application;
this is one function with one owner. A screen written next year gets it
without knowing it exists, and a row given `onPatch` still wins, because a lab
may have its own idea of where an edit goes or none at all.

**And the shell dropped most of what it was told.** Its patcher knew five
fields — title, important, folder, assignee, due — and silently discarded the
rest, so steps and notes arrived and went nowhere. Those five are exactly the
ones a *row* also draws, which is why they are mapped by hand; everything else
belongs to the card alone and now rides in one field, `detail`, untouched.

One field rather than one per fact, deliberately: the card gains blocks over
time and each new one would otherwise need a prop, a mapping and a line in the
patcher — three places to forget. It also fixed a quieter fault, that a row's
props carry a step *count* and `toConceptTask` had to **invent** the steps from
it — "Step 1", "Step 2" — so a task could round-trip through the shell and come
back with its steps renamed. The invention survives as a fallback for lab
fixtures that only have a count; anything the shell owns wins.

### DES-186, the page makes room for the panel

Imran, 2026-08-22: "when a right sidebar appears, it would be better to adjust
the view of the page and the sidebar does not overlap the page."

A panel that sits *over* the page hides the row the task came from, which is
the one piece of context a side-by-side surface exists to keep — if covering
the page were acceptable, the dialog would already be the better answer.
Notion, Linear and Things all shrink the page, and for that reason.

The width is published as a variable on the document rather than lifted into
the shell's state, because **the panel owns its width**: it is resizable and
remembered, and threading a live number up so the shell can hand it back down
is a lot of wiring for a fact with one owner. The variable exists only while a
panel is open, so the page's padding is zero the rest of the time and no
component has to be told anything.

### DES-187, an icon animates as itself

Imran, 2026-08-22: some icons are "having one icon but changes with another
when replaced". **Twenty-nine were.** The filter was three lines at rest and a
funnel under the pointer; Settings was sliders and then a gear; Folders opened,
Ban became a crossed flag, the grip became an ellipsis, Palette became a blend.

Every one was a near-enough substitute, chosen when the animated library had
no exact twin — which is the same reach [[DES-159]] ruled against when two
alert glyphs both animated into a triangle. That ruling guarded one pair; this
is the whole family, and it is the axis DES-159 could not see: not two names
for one drawing, but **one name for two drawings, half a second apart**.

They keep their drawings and lose their motion, which is [[DES-181]]'s rule
applied at scale — a smaller loss than a glyph that turns into a different
object under the pointer. A hundred and six of the hundred and thirty-five
still animate.

The audit checks it now by **rendering both and comparing them**, not by
reading names: lucide keeps aliases beside their replacements, so
`CheckCircle2` and `CircleCheckBig` are one picture under two names and must
not be reported.

### DES-188, the star is graphite, and the fill is the whole difference

Imran, 2026-08-22: "the star color are not consistent across the shell,
somewhere it's gold and somewhere it's black, so I think only black is good."

Right twice. It *was* inconsistent, and by my hand — [[DES-183]] took the gold
off Important the same day and left it everywhere else. And the colour was
carrying nothing the fill was not already saying: important is a binary, a
filled star says it, and a second signal on the same fact is one more hue in a
product whose whole palette is one accent and graphite (W1).

So the star is graphite in both states and the fill is the difference. DES-183
still holds on top of it: on Important, where every row is starred, even the
fill goes.

### DES-189, a setting with no way in is a setting nobody has

[[DES-113]] settled the row's two densities and put the choice in Settings.
The module store was built expecting that control — its own note says it is
"read by the row, by every screen that draws a list of rows, by the states
page and by a settings control" — and **the control was never written**. So the
preference existed, was honoured everywhere, and could not be changed by
anybody.

It is an Appearance section now, with two options rather than a switch: a
switch labelled "Compact" would make two lines the *unchecked* state, and
DES-113's whole argument is that two lines is the considered default rather
than the leftover.

### DES-190, a group moves like anything else in its column

Imran, 2026-08-22: "the group of folders are not movable by dragging, it's now
only sorted by alphabetical order."

[[DES-171]] built the directory as one ordered list and made groups
*participate* in it — they made space as folders passed them, and a folder
could land either side — while being the one entry that could not be picked
up. Half-built, and the half showing was the wrong one: **a row that moves for
you but not by you reads as broken rather than as restricted.**

A group is grabbed by its heading, because the middle of a group is one of its
folders and pressing there means dragging that folder. It travels whole, and
pausing mid-drag still commits the move rather than doing nothing — the hold
that makes a group of two folders has no meaning for a group, so it falls back
to the slot the pointer is over.

What it still cannot do is go inside another group: Dana nests one level, and
the honest answer to that drag is that the group moves past.

### DES-191, a caveat belongs in the register, not in the panel

Imran, 2026-08-22, on the filter's closing line: "it's a hint for frontend
explorers and me, but I think we should remove it, so that we not forget it."

It read "Saved views stay in this browser — Dana has nowhere to keep them
yet" — a note from the studio to itself, standing in a person's way, at the
foot of a panel they opened to narrow a list. Where a Lane 2 caveat belongs is
the decision register and the handoff, and [[DES-153]] carries it in both. A
panel is not the place to apologise for a backend nobody was promised.

The second half of his sentence is the sharper one: an honesty line in the
product is also a way of *not* dealing with something. Removing it puts the
obligation back where it can be seen.

### DES-192, keep the animation where the animated drawing is the better one

[[DES-187]] settled the rule — an icon rests as the drawing it animates as —
and left two ways to satisfy it: change the animation, or change the drawing. I
took the drawing every time, which spent the motion on twenty-nine glyphs to
keep pictures that were not always the better ones.

Imran, 2026-08-23: *"I want the icons that are removed instead coz they were
strong, especially for filter and settings."*

He is right, and the correction is a judgement per icon rather than a second
blanket. **Nine went back to their animated drawings** and animate again: the
filter is a **funnel** and Settings is a **gear** — both plainer symbols than
the three lines and the sliders they replace, and both the near-universal
choice for what they name. Film became Video, and Globe2, Clock3, Link2,
Share2, CheckCircle2 and CalendarCheck2 took the current lucide drawings of
the same objects. Three were renamed with their picture, because a name that
says `ListFilter` over a funnel is the fault this rule exists to remove.

The swap also surfaced a collision the new rule caught immediately: `Globe2`
and `Globe` were two names for one drawing the moment the first moved. They are
one now.

**Twenty stay drawn plain, each for a reason.** In every one the animated twin
would have changed the meaning or landed on a name already in the module:
Abandoned is not "unflagged"; a grip is not an overflow menu; `ListPlus`
without its plus is a list; a panel toggle is neither a hamburger nor a list;
`Palette` says colour where `Blend` says opacity; and four of them would have
collided with `ListChecks`, `History` or each other. The full list and its
reasons live in `lib/icons.tsx`, beside the code, so the next person meets the
judgement rather than the outcome.

**One is Imran's to overrule.** `CircleAlert` would animate as a *triangle* —
which is precisely the morph [[DES-159]] removed, and a triangle carries danger
where a circle carries notice. It is left as a circle and flagged, rather than
quietly reversing a ruling of his.

### DES-193, prose runs on; blocks get air

Imran, 2026-08-23: "the gap between two paragraphs in a page is still too
much." Measured: **32px between two lines of 12/20 prose** — more than one and
a half of their own line-heights, which is not a paragraph break, it is a
section break drawn by accident.

The cause is that the gap did not know what it was separating. A folder page
puts an insert strip after every block, at a fixed 24px, and that height is
right between *blocks* — where it separates a heading from what came before —
and wrong between two sentences that continue one another.

> **A gap says how far apart two things are, so it has to know what they are.**

The strip is dense between two paragraphs and full height everywhere else, so
consecutive prose sits 16px apart and a section heading after prose still gets
36px. This is the same correction `dense` was added for at F2, where 24px
between a heading and its first row made the two read as separate things; the
rule was applied once and not generalised, which is [[DES-154]] in miniature.

The Travel fixture gained a second paragraph in the same pass. A page with one
paragraph could never show the gap between two, which is why this was reported
twice before it was measured — and it is now visible at rest and checked by
the sweep.

### DES-194, the row's chips and its assignee are open sets

W2, the last of V3's brief and the last standing constraint with nothing built
against it. It asks for the row's **state-chip and assignee slots cut as open
sets**, and `docs/design/vision.md` says what they are open *for*: work
assigned to "a person, an AI agent, or both", and states like "waiting,
working, blocked, ready for review".

Both were closed, in the way that actually costs something later.

**The chips were eight conditionals in one JSX block.** Nothing declared what
the family was; the order lived in the source sequence, where no one could
review it; `bare` — the flag that hides an empty strip — restated all eight
conditions by hand and **had already drifted**, still counting notes and
attachments, which stopped being chips when the card took them. A ninth chip
meant editing the middle of a hundred lines and hoping it landed in the right
place.

As a list, three things stop being anybody's diligence: **the order is data**,
and it is the order Imran approved on 2026-08-23; **suppression is declared**
beside the chip it silences rather than remembered per chip ([[DES-183]]); and
**`bare` is derived** from what is actually showing, so it cannot drift again.
An audit rule holds it, because the next chip is easiest to add exactly where
the last eight were.

It is deliberately **not populated with the vision's states**. Dana has two —
pulled into Today, and abandoned — and drawing "blocked" or "ready for review"
now would be inventing product rather than shaping a slot for it ([[DES-119]]).
W2 asks for the shape; the contents are the spec's to grow.

**The assignee menu was three names from the row lab.** The same fault
`folderLibrary` was built to fix one axis over ([[DES-114]]) — a lab constant
shipped into the real row — and it had the same visible symptom: the list you
gave work to said *Sara* and *Hassan* with initials SK and HN, while the People
screen two clicks away said **Sara Khan** and **Hassan Ali** with SK and
**HA**. The roster now comes from one fixture that both read.

**And there was no Unassigned.** A row could take an assignee and never let one
go, which is a closed set in its plainest form and a functional gap besides. It
sits last, after a separator, exactly where "New folder…" sits on the folder
menu: the way out of a list belongs at its end.

**Why the slot is open rather than merely longer.** Nothing in it says
*human*: an assignee is a name and a face, so an agent arrives as another
entry, in the same slot, with the same treatment. W1 forbids a separate AI
hue, so the absence of any notion of *kind* is the point rather than an
omission — the day an agent is assignable, nothing in the row changes. No
field was added for it, because a field nothing can write is the fault
[[DES-122]] named.

### DES-195, a Shelf holds folders, and it is yours

Imran, 2026-08-23, on the two options in `f7-brief.md`: **Option A, with B
deferred rather than rejected.** A group of folders stays a personal label, and
gains a page — a cover, an icon, blocks — but no link to send and no members.
And he offered a better name than mine: **Shelf**.

**Shelf is the right name, and Area was the wrong one.** Two reasons, and the
second is the stronger.

*It says what the thing is.* An **area** is a domain of responsibility — Things
uses it that way, and it carries an implication of scope and ownership that
suits Option B and overstates Option A. A **shelf** is somewhere you put things
side by side because you decided to. That is precisely a personal label over
folders: an arrangement its owner made, holding things that exist perfectly
well without it.

*It belongs to a family Dana already has.* The product's nouns are physical and
plain — a **Desk** where you work, **Folders** that hold the work, and now a
**Shelf** the folders sit on. Desk was chosen over Inbox for exactly this
reason (DES-152, DES-181): the concrete word beats the abstract one, and the
metaphor has to hold together. *Area* would have been the one abstraction in a
room full of objects.

**On the hover hint.** Imran asked for a tooltip saying it is a group of
folders. Half of that is right and half is a warning sign, so the split
matters: **a name that needs a tooltip every time has failed; a new idea that
needs explaining once has not.** Shelf is in the first category — it is guessable —
so the explanation goes where every other explanation in Dana goes: the
description under the page's own title, and the sentence in Settings, which is
the pattern the native pages already use ([[DES-173]]). Not a permanent hover
that has to keep explaining itself.

### DES-196, arrangement is cheap; inherited permission is the expensive part

Imran asked the estimation question directly: does real nesting need "an endless
amount of backend time from a team of one or two"? It is the right question and
the honest answer inverts what he was worried about.

**First, his check: does Option A touch nesting? No.** A Shelf page is a *view*
over a label that already exists. The label has no id, no permissions and no
containment, so nothing inherits and nothing recurses: a task is still in a
folder, a folder is still at the top level, and a folder block on a Shelf page
is a **reference**, not a parent. What Option A does add is a third kind of
page — Dana has had system views and folders, and this is neither — which is a
route, a place to keep a cover and an icon, and blocks. That is presentation,
and it is small.

One consequence worth stating rather than discovering: **a Shelf page is
private, necessarily.** Its label is personal, so its cover, its icon and its
arrangement are personal too, and two people looking at the same folders would
see different Shelves. That is coherent, and it makes the Shelf page a personal
workspace view rather than a shared place — which is exactly what Option A is.

**Now the cost of real nesting, part by part.**

- **The data.** A nullable `parent_id` on folders, a recursive query for
  descendants — Postgres does this natively and Dana's scale never strains it —
  and a cycle check on move. Days, not weeks. This is the part people assume is
  expensive and it is not.
- **The interface.** The sidebar becomes a tree: expand at depth, drag into
  depth (the engine built at F6 handles one level and would need to recurse),
  breadcrumbs — which the window bar's left end has been reserved for since
  DES-139 — and every folder picker becoming a tree picker. A couple of weeks,
  and bounded: you can see when it is done.
- **Every folder-scoped question grows a flag.** Does "in Travel" mean Travel,
  or Travel and everything below? Both answers are wanted in different places,
  so counts, filters, the board's columns and the views all have to say which
  they mean. Pervasive, tedious, finite.
- **Permissions. This is the one that is open-ended**, and not because the code
  is hard. Access today is a row per folder per person: one lookup, at the
  10.2 chokepoint every request passes through. Inherited access makes every
  check "is there a grant here *or on any ancestor*", and then the questions
  start: can a child revoke what a parent granted? Answer yes and you need
  explicit deny, which is where permission systems go to die. Answer no and the
  product is simpler but surprising — *I removed them from this folder and they
  can still see it*. And moving a folder silently changes who can see it, for
  everybody, which has to be shown before it happens rather than discovered
  after.

> **So: nesting is affordable. Inherited permission is not — and inherited
> permission is the whole reason anybody wants nesting.**

That reframes the choice. The expensive thing is not the tree; it is the
cascading grant, which is the one part of Option B Imran was ready to accept
and the one part of Option A he is giving up. **Option A is nesting for
arrangement, at exactly one level, with permissions left flat** — which is the
cheap 90% of what nesting is for.

It also names the cheap increment, if depth is ever wanted: **let a Shelf hold
a Shelf, and keep permissions per folder.** Arrangement-only nesting, at any
depth, costs the data and the interface and none of the tail. The moment a
Shelf grants access to what it holds, the tail arrives — and that is Option B,
whenever it is taken.

### DES-197, an object declares what can be done to it

Imran's brief of 2026-08-23 asked for Copy link, Duplicate, Open as a tab, a
Trash, Save as workflow and History — "consistently everywhere". Six asks, and
they are not six features. They are six **acts** on Dana's objects, missing in
different places for one reason: **every overflow menu was written by hand**,
surface by surface, so an act existed exactly where somebody remembered it.

**The proof was one folder with two menus.** Its sidebar row offered Rename,
Label and colour, Move to group and Delete. Its own page's bar offered Rename,
Move to group and Delete — *no Label and colour*. Where you stood decided what
you could do to the same folder. Neither file was wrong; there was simply
nothing that said the two should agree.

This is [[DES-154]] at the largest scale the product has, and the sixth
instance of the same shape: tap-to-open reached six screens of seven, the
folder mark was resolved in two surfaces of thirteen, the row's chips were
eight hand-written branches, the entry defaults were written once on a button.

**So the vocabulary is declared once and the behaviour stays local.**
`lib/object-acts` says, per kind of object, which acts exist, what they are
called, what glyph they wear and in what order and grouping they appear.
`ObjectMenu` draws that. A surface supplies the handlers, because only it knows
how to run one — Copy link from a sidebar row and Copy link from a page bar are
the same act with different plumbing, and only the second half differs.

**An act with no handler does not appear.** That is the safety property that
makes the rest possible: a surface says what it can do by supplying it, so a
menu can never show an item that does nothing ([[DES-144]] made structural
rather than remembered), and the list can name acts that are not built yet
without drawing a single dead control. Save as workflow and History are in the
contract today and appear nowhere, because nothing supplies them.

**Order is data**: *reach it · change it · copy it · destroy it*, with
destructive last and behind a separator, everywhere. A menu whose dangerous
item moves between surfaces is one you cannot use without reading.

Two things were needed to make the folder's two menus actually identical, and
both are worth naming because they are the shape of the next ten:

- **An act may be a choice rather than a press.** "Move to shelf" is a
  submenu of shelves on both surfaces, which is a press shorter than a dialog.
  The act is still declared centrally; only the picker is the surface's, in
  exactly the way a handler is.
- **The picker behind a control had to become reachable.** The folder page's
  Label and colour lives in a popover on the page's mark, which nothing could
  open but a press on the mark — so the menu item and the mark are two doors
  onto one control now, rather than the menu item being quietly dropped.

An audit rule guards it, matching the *labels* rather than the components,
because the next hand-rolled menu will be built from whatever primitives are
nearest. It found a third hand-written folder menu on its first run: the v1
folder page, which is the by-looking control behind `?folder-page=v1` and is
now named in the lab exclusion beside the v1 row — a frozen control is allowed
to be out of date, and the way to say so is to name it rather than keep
repairing it.

**And the bar learned a second kind of message.** Copy link changes nothing, so
an Undo beside it would be a control that cannot mean anything; but it still
has to say it worked. `notice()` puts it in the same bar with no Undo button,
and `undoLast` steps past notices to the last real act — one place answering
*what did I just do*, rather than a second thing in the corner competing with
the capture button.

### DES-198, a copy takes the structure, never the grants or the progress

Imran, 2026-08-23: "When a folder is duplicated, the duplicated folder does not
carry the tasks, sections, text, and the data. I think if they exclude the chat
and members it's good, but other data should be duplicated with it."

He was right and my reason for the first version was bad. I had written that
the prototype "has no folder-to-task ownership it could walk" — a plumbing
excuse dressed as a design position, and factually wrong besides, since a task
carries `folder` and the sections have been in a store since DES-168. A folder
that copies only its glyph and colour is a new folder in the original's costume,
and the structure inside is the thing people duplicate a folder *for*.

**One rule decides everything a copy leaves behind: a grant is not a thing.**

Members and sharing are the obvious cases and Imran named them. The rule earns
its keep on the case he did not name and I would otherwise have got wrong: **an
assignee is a grant too.** Copying Travel would have handed Sara eight tasks she
never accepted, and in the ported product it would have sent her eight
notifications about a folder she has never seen. One principle now covers
members, sharing and assignment, rather than three exceptions somebody has to
remember at three call sites.

The conversation is excluded for a second reason worth stating separately,
because it generalises differently: a message is something a person *said*, to
someone, at a time. Copying it puts their words in a room they were never in.
That reaches the task's own comment count too, which the first pass carried —
a number of remarks about a task that did not exist.

**A copy also arrives unstarted.** Nobody asks for this and everybody wants it:
duplicate a folder that is eight-of-twelve done and the copy is eight-of-twelve
done, so your first act is unchecking eight things. A folder is duplicated to
run the same shape again — a trip, a launch, an onboarding — so the copy takes
the structure and none of the progress: completed and abandoned reset, the steps
inside a task reset, and a My Day pull is dropped, because pulling something
into today is a thing you did on the original's run.

**Due dates are shifted, not copied, and only when they are spent.**

Imran handed this one over. Copying them verbatim is the option that comes free
and it is the worst: duplicate last April's trip and every row arrives red, a
folder that is entirely overdue before you have touched it. Dropping them is
safe and throws away the most useful thing a template holds — the *shape* of the
plan, that booking came six weeks before packing.

So the intervals are kept and the plan is re-anchored to today. The condition is
what keeps it from being too clever: **only when the folder's earliest date has
already passed.** Dates still ahead are a live plan and moving those would be the
surprise; spent dates are a template and leaving those is the surprise. One test
separates them, and the bar says which happened — "Travel copy created from
Travel, dates moved to start today" — so it is never silent.

Three things this turned up, each a fault rather than a preference:

- **A folder's sections were only visible to the screen that drew them.** The
  seed lived in `folder-page-v2` as a module const, so a folder's sections
  reached the store only after somebody had *opened* it, and duplicating Travel
  cold copied an empty page. The fixture moved to `lib/folder-layout`, beside
  the store it seeds. A fixture only one screen can see is one the rest of the
  product cannot copy.
- **A deadline exists twice.** `form.dueDate` is the fact; `due.label` is the
  sentence, written by hand in the fixtures. Shifting only the fact produced a
  copy whose store said 23 August and whose row said "Overdue · 6 Aug". The copy
  rebuilds the label through `dueLabelFor`, the same function the pickers use,
  and recomputes overdue rather than inheriting it.
- **A copy's tasks did not survive one click.** The shell holds tasks in memory
  and every navigation here is a full page load, which has never mattered
  because nothing added at runtime was meant to be found later. A duplicate is
  the first act whose whole point is what you find when you come back, so the
  copies persist — and only the copies, as a stand-in for a row rather than an
  answer to the prototype's in-memory tasks. Lane 2 travels with it.

The act is raised from three surfaces and one of them, the sidebar row through
`app-shell`, has no task list to hand anybody. So `duplicateFolder` makes the
folder and announces; the shell answers with the contents and records the whole
thing as one undo. Two entries would have meant two presses to take back one
press.


### DES-199, the act writes the record

Imran, 2026-08-23: "Task and folder edit history: record the actor and time for
creation, modification, completion, reopening a checked task, and deletion. We
already included this but needs consistency and proper planning."

**What "already included" was.** Three surfaces drew a history and none of them
had one. The folder page's bar, the shell's page bar and a task's footer each
passed `WindowActivity` the same two hand-written lines — an "Edited, just now"
and a "Created, 4 August" — over a folder made that morning and a task you had
just typed. Three drawings of a record that did not exist.

**The record is written by the act, never by the screen.** This is [[DES-158]]'s
lesson at a second scale: undo works because the shell's mutators register the
inverse as they run, so every page gets it without knowing. A log has the same
requirement and the same failure mode — a screen that must remember to write
one will forget on a path, and the missing line is invisible until somebody
asks what happened.

So `reversibly`, the one function five task acts already passed through, stopped
taking the undo bar's **sentence** and started taking the **verb**. Both the
sentence and the log line are derived from it, which means an act cannot be
recorded but unlabelled, or labelled but unrecorded. Folder rename, delete and
shelf-move are written inside their stores for the same reason: three menus can
rename a folder and only one of them would have remembered.

Four things fell out of building it, each a fault rather than a preference:

- **A board drop could not be undone.** `moveTaskToGroup` had four branches that
  each mutated and returned on the spot, so the most mis-aimed gesture in the
  product — a card released over the wrong column — had nothing in the corner to
  take it back. A branch now only *decides* what the drop means and how to say
  it; one tail performs it through `reversibly`, which writes it, records it and
  offers it back. The log did not add undo here so much as reveal it was absent.
- **One press wrote two lines.** A row that ticks its checkbox reports the change
  like any other edit *and* tells the screen a completion happened, because
  completion is the screen's fact rather than the row's. Both calls are correct;
  the log listened to both and recorded `Completed` and `Edited` in the same
  millisecond. The rule belongs to the log — a change already spoken for by a
  stronger verb is not also an edit.
- **A log that wrote every keystroke would be a keylogger with a nicer name.**
  Typing a title fires a change per character. A new event of the same verb on
  the same object within two minutes now replaces the previous one, which is how
  every edit history a person has used already behaves.
- **A task is created when it gets a name.** The floating button makes the task
  the moment it opens the surface, so the commonest way to make a task would
  have left two lines describing one act — `Created ""` then `Renamed`. Naming a
  blank task is its creation, and the two halves of that rule sit in `createTask`
  and in the edit funnel.

**And the native pages lost their Activity control.** Today, Important and All
are views, not things. Nobody edits Today; it edits itself as the clock moves.
The control's whole design is a resting line stating a fact about the object in
front of you, and on a page that cannot be edited there is no true sentence for
it to say. What a person wants there is "what did I finish", and Done is the
page that answers it — so it went, rather than being rewired to a
plausible-looking feed of whatever happened to today's rows.

**The resting line names the act.** The reference's phrasing was "Edited 8m ago"
and a fixed word was the obvious reading, but it made the control lie in the
common case: tick one thing off a folder and the bar said the folder had been
edited while the line one press below said Completed. Same length, same shape,
and now both come from the verb.

The folder page's control shows the folder's own acts **and** what happened to
the work in it, which is a decision rather than a convenience: a folder's own
acts are rare — you name it once and move it once — so a control showing only
those would say "Created, 4 August" for months. What a person means by "what has
been happening here" is the work.

Fixtures-and-presentation, and Lane 2 travels with it: the ported version is an
append-only table written inside the same transaction as the mutation it
describes. The *shape* ports — subject, verb, actor, time, detail — even though
`localStorage` does not.


### DES-200, deleting moves a thing rather than ending it

Imran's brief of 2026-08-23, item 13: a Trash with thirty-day restore, for
"deleted pages", and a sidebar footer that finds room for it, for Help, and for
New folder group.

**Tasks go to the Trash too**, which he did not ask for and which the asymmetry
argues for: a deleted folder is a container you rebuild in a minute, while a
deleted task is a sentence somebody wrote that nobody can reconstruct — and it
is the one people delete by accident, from a row, in one press. Past the undo
window it was gone for ever. Trash then has one rule, *everything deletable is
restorable for thirty days*, rather than a rule with an exception nobody can
predict from outside.

**Undo still comes first, and the two are not redundant.** The bar is for the
half-second where you already know; it puts the thing back with no journey.
Trash is for the hour later, when you no longer remember what it was called.
Remove the bar and every mis-press becomes an errand.

**And Trash deleted seven dialogs.** "Delete this task? This can't be undone."
was written into seven screens — the same fault class as the folder's two
menus, at seven copies instead of two — and the moment the bin existed every
copy was saying something false. But the deeper point is not the copy: **a
confirmation on a reversible act is friction that teaches people to click
through dialogs**, which is what makes the one dialog that matters stop working.
So the rule is now *ask only when there is no way back*, and after this the
product asks exactly twice: delete for ever, and empty the trash. Abandon went
with them, for the same reason — it has a bar and a restore.

One dialog survived the sweep and deserves its place, because it is a different
question. Reopening a repeating task drops the next occurrence and any edits to
it, and nothing about pressing a checkbox says so. That is a question about
**scope**, not about risk, which is why the rule above does not reach it.

**The footer is sorted by role, and that is the whole layout decision.** The row
at the top *makes* things — New folder, and now New shelf beside it, because a
shelf holds folders and a shelf with nothing on it is furniture; it had lived
only in the Folders header's overflow, which is where a thing goes when nobody
has decided where it belongs. The rows beneath *go* somewhere: People, Trash,
Settings. **Help is neither**, so it sits in the account menu with the other
things that are about the application rather than about your work. A sidebar row
for Help would have made the destination list mean two things at once, and that
list's legibility is the only thing holding the footer together as items arrive
— three arrived at once.

Help's content is the harder half, because Help is the easiest control in any
product to fill with a plausible lie: a Getting started that starts nothing, a
Documentation link to a page nobody has written. It lists the shortcuts that are
wired today, read off the handlers, and says one true sentence about what this
build is. Every line in it can be pressed.

Two things this turned up:

- **A page defined as "none of the others" breaks the next time something is
  added.** Trash rendered My Day, because that branch was a hand-written list of
  exceptions that could not know about a page which did not exist yet — the same
  shape that killed `?mode=calendar` at F6. People, Settings and Trash are now
  one named predicate, `isUtilityPage`: pages that render their own body, take
  no task filters and host no floating button. The next one joins in a single
  place and all four branches learn about it together.
- **A deleted task came back from the fixtures on the next click** while still
  sitting in the bin — the same in-memory fault [[DES-198]] hit, wearing a
  second face. The shell now reads the trash when it seeds, rather than keeping
  a second list of deleted ids: the bin already knows, and two stores that must
  agree about one fact is precisely what this session keeps removing.

Lane 2 travels with it. The ported version is a `deleted_at` column rather than
a second table — section 10.2's chokepoint has to see a deleted row in order to
keep it out of every list, which is an argument for soft delete rather than for
moving rows about. Thirty days is counted on read, never by a timer, because an
expiry that only happens while the app is open is not an expiry.


### DES-201, a task is an object too, and it has an address

[[DES-197]] declared what each kind of object supports and wired the folders to
it. The task row was left hand-written, and that is the whole reason a folder
could be copied, linked, duplicated and asked about its history while a task
could not: the acts existed in `lib/object-acts` and there was nothing in the
row reading them. Six items were written into `task-row`; four more were
declared and undrawable. "Consistently everywhere", which is what Imran asked
for on 2026-08-23, means the row as well.

Three things the task forced the contract to learn, each of which improves it
for the kinds already on it:

- **The act is *reaching* the object, not "open in a new tab".** A folder offers
  one way in and a task offers four, so the key was named after the folder's
  only answer. It is `open` now, and each kind says how.
- **Stopping and destroying are two groups.** Abandon says "I am not doing
  this" and keeps the task; Delete says it should not exist. The hand-written
  menu already separated them, noting they "are not neighbours in meaning and
  should not look like neighbours in the menu" — which is a rule about the acts
  rather than about that menu, so it moved into the contract.
- **Abandon and Restore are one slot seen from two states**, and only one is
  ever supplied. No condition is written anywhere: an act with no handler stays
  out of the menu, which is the safety property doing the work a branch used to.

**A task has an address now, `?task=<id>`.** Copy link forced it, and the
forcing was the useful part: the act could not be supplied because a task had no
URL, while every other object in Dana had one. A Copy link that pointed at the
page the task happens to be on would be worse than none — the page changes and
the task does not. It opens in whichever surface the person prefers, the same as
pressing the row, because a link is somebody saying "look at this" rather than
"look at this in a dialog". It is also the review instrument this plan lacked:
until now a link could name a page and not a row.

**History got the fuller view Imran said the footer could not be.** He was right
that they are two jobs: the footer's control answers *is this fresh?* and shows
the last handful beside its own line; the sheet answers *what happened to this?*
— the whole record, grouped by day, with the actor on every line rather than
only where it changes. They are not two readers: both draw the same events
through the same `lineFor`, so the sentence is one string and only the framing
differs.

**And a task's copy keeps its place**, which is where the folder's rules had to
be told apart from a task's. `copyFolderContents` drops My Day membership,
because a folder is duplicated to run the same plan again and pulling something
into today was a decision made during the *original* run. A single task is
duplicated to sit beside the one you are looking at. Clearing it made the copy
vanish from the page it was made on — the exact fault the entry defaults had,
invisible for the same reason: the surface covers the page it failed to add to.
The copy also lands immediately after the original rather than at the end,
because a copy you cannot see is one you assume did not happen.

One seam rather than two: the duplicate event now carries the **kind**. Both
halves have the same shape — the surface raising the act can always *name* the
thing and can never *hold* the result — and a task's row is nested deep enough
that threading a prop down to it through ten screens would have been the same
coupling with more typing. Two events for one idea would have been the
duplication this contract exists to remove.

A guard worth recording, because it was nearly a silent data loss:
`duplicateTask` reuses `copyFolderContents` deliberately, so that what a copy
*is* lives in one place — but that function also writes the folder's section
layout, and a single task duplicated inside its own folder arrives with
`from === to`. Writing the layout then would have replaced that folder's whole
assignment map with the one entry this copy produced, dropping every other task
out of its section.


### DES-202, a page holds headings, prose and pictures

Imran's brief of 2026-08-23, item 5: a folder page should be able to hold an
image. It is also the answer to a question he asked earlier that no control
could answer — *how does the first user get an idea of what to do here* —
because a page that can hold a picture can hold a worked example.

**Three kinds, and the list stays at three.** A page is headings, prose and
pictures; almost everything people ask for on a page like this turns out to be
one of the three wearing a hat. Naming that is what keeps the insert menu one
glance long.

**The block is deliberately small, and every decision in it is about not
becoming a photo editor.** No sizing, no alignment, no columns: a picture sits
in the page's own column at its own aspect ratio, the way a paragraph sits in it
at its own length. The moment an image can be half-width and left-aligned, the
text beside it has to be laid out too, on a page whose whole argument is that it
is a document.

**The caption is prose, on the prose tier.** [[DES-148]] put paragraphs at 12px
in graphite-600 and gave the folder description the same, because they are the
same kind of writing. A caption is too, so it takes the tier rather than
inventing a fourth size — and its placeholder is invisible until you reach for
it, because a picture that explains itself should not carry a blank line.

**It survives a reload, and that is the whole difference from the cover.** The
folder cover takes an upload as a session-only object URL and says so, which is
right for decoration you choose again in a second. An image *block* is content —
it is the worked example — and one that vanished on refresh would make the page
a worse demo than no picture at all. So a file is downscaled on the way in:
1600px on the long edge at 0.72, which puts a photograph near 200KB. PNG keeps
its format, because a screenshot of a UI is the commonest thing anybody will put
on a Dana page and JPEG turns its flat areas to mush at that quality.

**The bytes live in their own store.** A folder's sections, paragraphs and
assignments share one `localStorage` key, and images are three orders of
magnitude larger than anything else on a page. In that key, the first person to
add two photographs loses their sections to a quota error. Separated, a full
store costs pictures and nothing else — and when it does refuse, the block says
so rather than letting the picture disappear on the next load with no
explanation.

**The space is reserved before the picture paints.** `scaleImageFile` returns
the aspect ratio as well as the bytes, and the block holds it, so the page never
jumps by the height of an image — the single most noticeable thing a page of
text can do wrong. A new empty block starts at 16:9 for the same reason: the
drop zone and the picture that replaces it are close to the same height.

Three ways in, because people reach for different ones and all three are one
line apart: choose a file, drop one, paste one. Paste is the one that matters
for a worked example, since the example is usually a screenshot already on the
clipboard — and the listener is scoped to the block rather than the document,
or it would steal the clipboard from every text field on the page.

The audit caught the caption as a bare `<input>` and was right to: a field
spelling its own border, radius and ring is how six spellings of one control
happened last time. It uses `InlineInput` now, differing only by the two things
it genuinely differs by.

Lane 2 travels with it and is larger than usual: the ported version is object
storage plus a row, an upload endpoint, a size limit, a content-type allowlist
and a signed URL. What ports is the *block* — that a page is a list of things
and one of them can be a picture.


### DES-203, search finds everything you can go to

Imran's brief of 2026-08-23, item 7: expand it. It found **tasks**, by title and
notes, and nothing else — so a folder you had made was unfindable by name, a page
you wanted was unreachable by typing it, and the paragraphs written on a folder
page were invisible to the one control in Dana whose job is finding words. The
prose on those pages is the largest body of writing the product holds and
nothing could reach it.

**Three kinds: tasks, folders, pages.** Every kind you can *go to*. Shelves will
be a fourth once they have a page, and until then they are absent rather than
listed and dead — the same rule the object contract follows for an act with no
handler.

**Grouped by kind, ordered by status within Tasks.** Grouping by status at the
top level was right while tasks were the only thing search returned. With three
kinds it would have made "Pending", "Abandoned", "Completed", "Folders" and
"Pages" peers — two classification schemes presented as one list, which is
exactly the fault [[DES-152]] took out of the sidebar. So kind decides the
headings and status decides the order inside Tasks, where every row wears its
own badge anyway.

**Each result matches on more than its title.** A task adds its notes and the
titles of its steps; a folder adds its description and the prose on its page.
A title match still outranks a body match, because somebody typing "venue" means
the thing *called* venue before the thing that mentions it.

**An empty box offers the pages.** `Ctrl/Cmd+K` is a palette, and a palette that
shows a blank panel with "enter at least two characters" until you have typed is
one you have to already know the answer to. The pages are few and fixed, so they
cost a glance and turn the control into a way of *getting somewhere* as well as
a way of finding something.

**Opening one is the shell's business.** Search says which thing and which kind;
the shell opens a task into its surface and navigates for the other two, using
the same folder address `folderLink` copies — so the URL a result navigates to
and the URL a person sends are one string.

A page's glyph now comes from `pageGlyph`, beside the list the sidebar draws,
rather than from an icon imported into the overlay. Importing one is how a
folder ended up wearing a tray in the sidebar and a plain folder on task chips
([[DES-155]]); one resolver, asked by everybody, is the standing answer.

Lane 2 travels with it: [[DES-073]] has owed mixed-result shapes, ordering and
permissions since v1, and this is the *shape* of that answer rather than the
answer. Nothing here is ranked by recency or by anything a server would know,
and the permission line under the results still says what it said.


### DES-204, the picture is the control

Imran's brief of 2026-08-23, item 2: a profile picture, uploaded in Settings.
The row was already there, drawn with initials in a circle; what it lacked was
that the circle could be pressed.

**No "Upload photo" button beside it.** That is a second thing to look at where
there is only one thing to do, and every product a person has used already
teaches that the circle is the button. Hovering says so. The one extra control,
Remove, appears only once there is a picture to remove.

**It is a store, not a Settings detail**, which is the whole reason it lives in
`lib/viewer` rather than in the screen. The viewer's face is drawn in four
places — the sidebar's account button, the Settings row, the sharing panel's
owner line, and a folder page's member group — and all four were spelling out an
`Avatar` with "IW" by hand. Adding a picture to that arrangement means adding it
four times and forgetting one, which is [[DES-154]] at its smallest scale and
exactly as certain. There is one `ViewerFace` now.

**Cropped square and shrunk to 256px.** Square because every avatar in the
product is a circle, and an un-cropped portrait lets the browser choose what to
cut, which is usually the top of somebody's head; centre-cropping to the short
edge is the choice a person would make. 256 because nothing draws an avatar
above 40px, so anything larger is bytes nobody sees.

Lane 2: object storage plus a column, and the more interesting half is that
Google sign-in already carries a picture — the honest ported default is *that*,
with an upload as the override. The drawing is the same either way.

### DES-205, a theme belongs under Appearance, and here is one to rule on

Imran's brief of 2026-08-23, item 6: a dark-mode toggle, scoped to *placement*.

**Placement, which is what he asked.** It goes in Settings under Appearance, and
the two tempting alternatives are wrong for the same reason. **Not the account
menu**, where a lot of products put it: that menu is about *you* — your picture,
your sign-out, help with the app — and a theme is about how Dana draws, which is
what the Appearance section already says it is for. **Not the window bar**,
because a control in the chrome is one you press by accident, and nobody changes
their theme often enough to pay rent there. It sits above Row height because it
is the larger of the two: one changes every colour, the other a list's spacing.

**Three states, not a switch**, and the third is the one people want. A two-way
toggle makes you re-choose at sunset and leaves Dana disagreeing with every other
window on the screen for half the day.

**And a colourway behind it, offered for his ruling.** A control that switches to
nothing is a control that lies, and the toggle is far more useful to rule on with
something behind it than as a placement sketch. So:

- **One ramp, not a hundred edits.** Every surface here draws from
  `--color-graphite-N` and `--color-dana-accent-N`, and the shadcn mapping is
  built on those rather than on values of its own. A dark theme is therefore one
  block that re-authors two ramps. That was the bet the token file made and this
  is it being collected.
- **The ramp is not the light one reversed.** Roles are preserved and values
  re-authored, because the eye separates light greys far better than dark ones,
  so the low end is pushed further apart than a mirror would put it.
- **Elevation inverts.** In light a raised surface is whiter and casts a shadow;
  on near-black a shadow is invisible and raising something means making it
  *lighter*. So `--color-graphite-0`, the sheet the work sits on, is lighter than
  `--color-graphite-25`, the recessed plane the furniture sits on — the
  relationship the light theme states is kept and the physics turned over.
- **The accent lifts a full step**, because cobalt-600 carries text on white and
  disappears on a dark plate, and its tints stop being pale blues and become
  dark ones.

**What is still Imran's**, and why this is a proposal rather than a decision: the
ten folder swatches ([[DES-018]]) are unchanged. They are mid-tone by
construction and survive the move, but DES-018 requires each to travel with a
legible folder name, and that is a judgement per swatch against a new ground
rather than one ruling. Whether the recessed/raised step reads at all on an OLED
panel is the same kind of question — a thing to look at, not to calculate.

**Checked by measurement, because a colourway cannot be checked from here by
looking.** The sweep measures every text pair on four routes and every wide
surface. The first version of that check held dark to WCAG's 4.5:1 and flagged
two things that were not faults: the floating New task button, a deliberate
contrast plate that is near-black in light and near-white in dark — the
inversion working — and a row's count on graphite-400, a deliberately faint step
the *light* theme draws at 2.9:1. Holding dark to a bar the design does not
claim is not a check, it is noise. So the question it asks now is the one a dark
theme actually has to answer: **did anything get worse.** The same page is
measured twice and dark must be no worse than light, which catches a surface
that failed to follow the ramp precisely, because it keeps a light background
under text that went light with everything else.


### DES-206, a workflow is a shape, not a copy

Imran's brief of 2026-08-23, item 14: "a folder or a group saved locally as a
workflow, and imported."

**One sentence settles the format.** Duplicate ([[DES-198]]) makes another
instance of your own folder inside your own account, where keeping somebody
else's assignment would merely be wrong. A workflow *leaves*: it becomes a file,
and a file gets sent to people. So the rule that governed duplicate — a grant is
not a thing — is not enough, because the risk is no longer "Sara gets eight tasks
she did not accept" but "Sara's name, and what she was asked to do, and when, in
a file on somebody else's machine."

So a workflow carries the structure and the words — the folder's name, glyph and
colour, its sections in order, the paragraphs between them, its **images**, its
task titles and which section each sits under, and the titles of a task's steps,
which are the checklist and are the point. It carries **nothing about people or
time**: no assignee, no date, no reminder or repeat, no completion, no comment,
no member, no history.

Images travel with their bytes inlined, because a workflow is one file by design
— a folder of assets beside it is a thing to lose, and the whole promise is "send
this to somebody". A worked example that arrives without its picture is not a
worked example.

**One thing the sweep found that is worth stating rather than fixing:** the prose
on a page can name people. Travel's own paragraph says "Sara is holding the guest
list", and that travels. It is not the same class as an assignee — a paragraph is
the author's own writing, chosen deliberately, and stripping it would gut the
feature. What the bar now says is the honest and checkable claim: "8 tasks and
the page, without dates, assignees or comments." Not "no people".

**Imported as a new folder, never merged.** Merging raises a question with no
good answer — what happens to a section that exists in both — and somebody who
wanted a merge can import and then move things, which is a sequence they can see.
Importing something you already have gives you "Travel 2", the naming duplicate
already uses, because importing a workflow twice is usually a second trip rather
than a mistake.

**Import lives in the Folders menu, not the footer.** It *makes a container*, so
by the footer's own rule ([[DES-200]]) it belongs with New folder and New shelf —
but not as a third button in a row of two, because those are things you do weekly
and this is a thing you do when somebody sends you a file. The rare making act
goes in the menu beside the heading; the common ones keep their buttons.

**And it exposed a contradiction in DES-198 that had shipped.** That entry says
"the copy's work is the duplicator's" and then implemented the assignee as
*empty*, which is not the same thing: an empty assignee means the copy appears in
**nobody's** Assignments, including the copier's, so a folder duplicated to run
again produced eight tasks no page about people would ever show. Importing a
workflow already assigned the work to the importer, the way a task they typed
would be, which is how the two were caught disagreeing. One rule now: a grant
does not travel, and the work lands on whoever made the copy.

The check that found it was wrong first — it asserted "no assignee" on an
imported task, which is the file's property mistaken for the folder's. It asks
two things now, on both paths: nobody else's name came with it, and it belongs to
somebody.

Lane 2 is small, which is why this item was cheap: nothing here needs a server,
and that is what "saved locally" means. A ported Dana that lets people *publish*
workflows needs a validating parser, a size limit, and a decision about images
that this does not make.


### DES-207, a shelf is the folder page one level up

Imran's brief of 2026-08-23, item 15, built to his ruling: **Option A**
([[DES-195]], [[DES-196]]). A shelf stays a personal label and gains a page — a
cover, an icon, a description, blocks — with no link to send and no members.

**It is the folder page at another level, not a second idea.** A folder page is
a cover, a mark, a title, a description, its **tasks**, and blocks arranged
around them; a shelf page is that page whose contents are **folders**. Two ideas
would have drifted; one idea at two levels means somebody who has used one has
used the other, and it is why this took a screen rather than a subsystem.

**The folders are derived, never blocks.** Item 15 asked for "blocks of
folders/sections/text/images", and folders are the one of the four that must not
be a block: a folder is on this shelf because its membership says so, and a
block would be a second record of that — stale the moment somebody drags a
folder in the sidebar. The page shows what the label holds; the blocks are the
writing around it.

**No sections, either**, and for a related reason: the thing a section would
group is derived from a label, and a folder cannot sit under two headings on one
page without the label meaning something it does not. Two block kinds, not
three.

**No Copy link, and that is a ruling rather than an omission.** DES-196 draws
the consequence of Option A: the page is private *by construction*, because the
label is personal, so its cover, icon and arrangement are personal too. A link
you send opens nothing for whoever receives it. It is the one act the contract
declares for the other two kinds and deliberately does not declare here.

**The row's two jobs became two controls.** The whole shelf row used to toggle,
which was right while a shelf was a heading over some folders. It names something
you can open now, so the label goes there and the disclosure keeps the corner it
had already announced — the Folders glyph has swapped to a chevron on hover since
the day it was drawn, which was the affordance saying so all along.

Two faults it surfaced, both the same shape as ones already fixed this session:

- **A third default written as exceptions.** `isDesk` was "no page requested and
  the state is not folder and not done", so `?state=shelf` rendered the Desk
  page. That is the third time — Trash rendered My Day, and `?mode=calendar`
  died at F6 — and the answer is the same: name the list once, and the next
  state joins it there.
- **Shelf membership was resolved inside the sidebar.** *An override if there is
  one, otherwise the fixture's label* — two words of logic living in the surface
  that needed it first, so the Shelf page would have written a second copy and
  the two would disagree the first time somebody moved a folder. It is
  `folderShelf` now, asked by both. The distinction it carries is the part that
  cannot be guessed: **no entry is different from an entry of `null`** — the
  first means "nobody has moved this", the second means "somebody took it off
  its shelf", and collapsing them puts a folder back where its owner removed it
  from.

A note on the check, because the first version of it was weak: asserting the
menu has no Copy link cannot catch a change to the *contract*, since an act
with no handler does not draw either way. The safety property is doing the work,
and the check earns its place by catching the thing that would actually leak —
somebody supplying a handler. Probed that way, it bites.


### DES-208, five faults behind one sentence, and why the sweep missed them

Imran, 2026-08-23, reviewing: folder-as-a-tab is not there, deleting a folder
does not work, Desk still has no description, the dark mode uses the light logo.
Four reports, five faults, and every one had passed a green sweep — which is the
finding worth recording above any of the fixes.

**The sweep read the wiring instead of pressing the control.** Nothing in it had
ever opened a folder row's menu. So:

- **Open in a new tab was never built.** The contract declared the act, both
  folder menus wired a prop for it, and no shell ever supplied one — so the
  safety property correctly drew nothing, and I twice reported it working from
  reading `open: onOpenInTab` in the source. A handler that nobody passes is
  indistinguishable from a feature, in the source and only in the source.
- **Rename and Delete from a folder row did nothing at all.**
  `?folder-action=` has existed since the v1 page and only the v1 page ever read
  it. Both acts navigated here carrying an instruction the shipped page ignored.
- **Then the delete raced its own listener.** Wired up, the act ran from a mount
  effect — and React runs a child's effects before its parent's, so the page
  dispatched `prototype-delete-folder` before `AppShell` had attached the
  listener that answers it. The folder vanished from the screen, came back on
  reload, and left nothing in the Trash. **A destructive act must not depend on
  who mounted first**, so the store is written directly and the event goes out
  only for the bookkeeping that needs it; `deletePrototypeFolder` is idempotent
  so whichever arrives second changes nothing.
- **And two identical handlers meant the fix landed on the wrong page.** The v1
  and v2 call sites were byte-identical, so a string replace patched the one
  nobody uses. Both are patched, by splitting on the text rather than replacing
  it once — the same hazard as any "fix the first match" edit.

**A one-shot instrument.** `?folder-action=delete` now strikes itself from the
URL the moment it is obeyed. A destructive act sitting in the address bar is a
trap: a reload, a bookmark or the back button performs it again, on whatever
folder the URL happens to name. `navigateToPage` also clears `folder`,
`folder-action` and `shelf`, which is how that param survived a navigation and
sat pointing at a folder nobody was looking at.

**The folder's delete confirmation went**, and it is the last of the nine.
[[DES-200]] removed seven and left this one only because nothing could reach it
— so its copy had not been re-read since Trash existed, and it still said "This
**permanently** deletes … for every member". The rule stands: ask only when
there is no way back.

**A folder tab navigates; a task tab replaces the page.** That asymmetry is the
design. A task has no route of its own — its tab *is* where it lives. A folder
already has a route, the one the sidebar uses, and rendering a second copy of
that page inside the strip would mean maintaining forty props at two call sites,
which is the fault this whole stretch has been removing. So a folder tab is what
a browser tab is: a place kept in a strip that you go to.

**Desk's description was a missing fallback, not a missing sentence.**
`PageDescription` has always taken Dana's own wording as a fallback; the folder
page passed none, because a person's own folder has no shipped sentence. Desk is
a folder, so it rendered the empty state. Asking `pageQuestion(storageName)`
gives Desk its line and changes nothing else, since that returns undefined for
every folder somebody made. A rule, not an exception for one name.

**The dark logo was inverted twice, which is the same as not at all.** The rule
said plate: graphite-0, glyph: graphite-950 — the reversal, written against the
*light* ramp's meaning. But the ramp itself reverses in dark, so it resolved to a
near-black tile carrying a white D on a near-black page. **A rule written in
terms of a ramp cannot also be the thing that flips the ramp.** Stated by role —
the plate is the opposite of the page, always — it cannot double-negate.


### DES-209, the second review pass

Imran's list of 2026-08-23, after clicking through. Six changes, and three of
them overturn something I had argued for — which is worth recording as such,
because a decision reversed with a reason is worth more than one defended.

**A workflow carries everything but people and dates.** He drew the line:
"only due dates, people, conversations can't be exported". The first version
carried titles and nothing else, which made a workflow a table of contents
rather than a copy of the work — a template of a launch is not much of one if
the notes, the checklists and the stars have to be typed again. So notes, stars,
repeats, reminders, steps *with their ticks* and the task's own state all
travel; assignee, invitation, due date, conversation, and the completion stamp
and its "by" do not. The consequence, stated: a folder saved half-finished
imports half-finished. That is what a *save* means, where duplicate is a fresh
run — two acts, two rules, deliberately.

**One primary button, then a row of three.** He asked for this twice and I
placed by role instead, arguing Trash was a destination. The shape he described
is better than my argument: New folder stands alone, and under it sit **New
shelf · Import · Trash**, left to right from most to least like making
something. Help stays in the account menu, which is the one departure — it is
neither a thing you make nor a place inside your work, and a fourth item would
have broken the row he asked for.

**The Activity indicator was correct and invisible.** It draws nothing when
nothing has happened, which is right in the small — a control opening onto an
empty popover is a promise the page cannot keep — and wrong in the whole,
because on a fresh browser *nothing* has a history, so it was invisible on every
page at once. A thing that exists was created, and that is a fact rather than a
fiction: every object is seeded with the line that says so, from the fixtures'
own `createdAt`. The store is never empty now, which also changed what the check
can ask — "this press wrote one line", not "the store holds one line".

**And a folder got its History**, which a task has had since [[DES-201]]. On the
question Imran raised — whether the indicator and History should differ by
*restoring* — the answer is no, and structurally rather than by preference.
Restoring needs snapshots, and Dana stores events. A restore offered over an
event log is either a lie or a promise to rebuild state by replaying acts
backwards, which is a different product. The two differ by **depth**: the line
answers *is this fresh*, the sheet answers *what happened to this*. Undo covers
seconds and Trash covers thirty days; between them there is no gap a version
history would fill at a price worth paying here.

**Search reaches the last three sources.** Sections and captions were missed for
one reason — the filter asked for paragraphs *by name* instead of asking each
block for its words, so the next kind of block would have been missed too.
Messages needed the folder conversations to leave the screen that drew them, the
same extraction the page seeds needed when duplicate became their second reader.
Shelves joined because [[DES-207]] gave them somewhere to land and the reason
for leaving them out expired.

**An image resizes, and blocks fold with their heading.** The first version
refused sizing, arguing that a picture which can be half-width and left-aligned
drags the text beside it into a layout problem. Half of that holds: **alignment
is what causes the trouble, not size.** A narrower picture that stays in the
column changes nothing about the text above and below it; a *floated* one makes
the paragraph beside it a layout question. So the handle changes width, the
block stays in the column, and there is no left, no right and no wrap. A drag
rather than Small/Medium/Large, because three named sizes are three guesses at
what somebody wants.

Folding was a plain omission: only tasks answered to a section, so a heading
closed over its prose and its pictures and left them behind. **Belonging is
decided by position**, not by a field on each block — a block after a heading
and before the next is in it, which is what a document means and what a reader
already assumes. A `section` field would be a second fact that can disagree with
the order it is drawn in.

One thing this pass taught about the checks themselves: five of the six failures
on the first run were **my own older checks guarding decisions Imran had since
changed**. A check that outlives its decision reads exactly like a regression,
and the cost of not noticing is undoing good work to satisfy a stale rule. Each
was rewritten to guard the *new* rule with the reason attached, rather than
deleted.

### DES-210, the shelf page earns its place

Imran set the test himself: "If a Shelf page can have an address and can be
saved as a workflow, so we can leave it, otherwise it's good to remove the shelf
pages." Both are true now, so it stays — and it grew into the folder page's
grammar rather than keeping its own.

**Copy link came back, and the distinction it forced is the useful part.**
[[DES-196]] left it out because a shelf page is private by construction, so a
link "would open nothing for whoever received it". That confused **an address**
with **a share**. A shelf page has an address the moment it has a route, and
that address is worth copying for what people copy links for most — a note, a
message to yourself, a document. What it is not is an invitation. Option A ruled
out sharing, not addressing.

**The same components, not lookalikes.** The insert line, the grip, the drag
engine, the collapse rule and the three blocks are the folder page's own. Two
pages that mean the same thing must not grow two grammars for it, or the product
has a page you have to learn twice.

**Sections belong on a shelf after all.** The first version left them out,
reasoning that the thing a section would group is derived from a label. That
answered a different question: a section here groups the **writing**, exactly as
on a folder page. What it does not group is the folders, which still come from
the label — and that remains true.

**A shelf's workflow is its page and its folders' names**, never those folders'
contents. A shelf is an arrangement over things that exist without it, so a file
dragging eight folders' tasks along would be a backup of half an account wearing
a shelf's name.

**And a shelf's duplicate takes no folders.** A folder can only be on one shelf,
so moving them would empty the original — the copy is a second label with the
same page, ready to fill. That falls out of what a shelf is rather than being a
rule to remember, which is the test this whole contract keeps applying to
itself.


### DES-211, an instruction that has been carried out is no longer an instruction

Imran: "whenever you open a folder, a task is always open in the left sidebar."
I could not reproduce it and said so, which was honest and useless — I was
opening tasks by pressing rows, and pressing a row puts nothing in the URL.

**Arrive by a link and it reproduces every time.** [[DES-201]] gave a task an
address, `?task=<id>`. `navigateToFolder` clears `page`, `folder-state`,
`folder-action` and `folder-page` — and had never heard of `task`, because
`task` did not exist when that list was written. So the param rode along: every
folder opened afterwards re-opened the same task, for ever, with the only clue
in the address bar. That is exactly what "always" means, and it is why a
reproduction attempt that never used a link could never find it.

**The third time this shape has failed in one session.** Trash rendered My Day,
because Desk was "no page and not folder and not done". `?state=shelf` rendered
Desk, for the same reason. And now a param survived because a delete-list did
not know about it. All three are *a list somebody has to remember to extend*,
and all three went wrong the first time something was added.

So the fix is not a longer list. **The param removes itself the moment the
surface opens.** An instruction that has been carried out is no longer an
instruction, and nothing downstream has to know it ever existed —
`?folder-action` already worked this way ([[DES-208]]) and this is the same
rule reaching the second instrument. The navigators clear it too, but as a
belt rather than the mechanism.

**What it costs, stated:** the address bar no longer shows the task you are
looking at, so you cannot re-copy the link from it. That is a real loss and a
small one — Copy link is in the task's own menu, which is where people copy it
from, and the alternative was a URL that quietly followed you around the
product changing what every folder looked like.

**And a note on the check.** The first version of it pressed a folder in the
sidebar while the task surface was open, and Playwright could not: the surface
is a panel over the page. That is not a flaw in the test but the real sequence —
a person shuts the panel and *then* presses the folder. The bug survived exactly
that, because it lived in the URL rather than in the surface, which is what made
it feel like the product was broken rather than like something was open.


### DES-212, a layout that cannot be explained cannot be relied on

Imran asked whether I was sure. I was not, and pressing every item found two
more things — one of them a fault in how I had been *measuring* all session,
which matters more than the fix.

**The right edge is a number now, not a CSS variable.** The first version
published the panel's width as a custom property on `<html>` and let the shell
consume it with `padding-right: var(--right-panel-width, 0px)`. On paper that is
the elegant answer: one variable, no wiring, nothing threaded. Measured, the
variable resolved to `360px` on the very element whose padding resolved to
`0px` — and a `!important` pixel value set on that element by hand computed to
`0px` too, while `margin-right` on the same element applied fine. A clone with
the identical classes and the identical inline style computed `360px`.

I could not account for it, and that is the point at which a mechanism has to go
rather than be defended. The width is a number in a store now, read with a hook,
written as a plain pixel padding: nothing resolves at paint time, nothing depends
on inheritance, and **the value that lays the page out is the value you can
print.** The elegance was worth exactly what it laid out, which was nothing.

**And then the real cause turned out to be my instrument.** The browser pane I
verify in is not displayed, so `document.visibilityState` is `hidden` — and a
hidden document does not tick CSS transitions. The scroll container has
`transition-[padding]`, so its transition started, never advanced, and pinned
the computed value at where it began. Every measurement I took of that padding
by hand read `0px` and every one of them was wrong.

**The operational rule this leaves:** *any transitioned or animated property
must be measured in Playwright, never in the pane.* The pane is fine for text,
structure, storage and geometry that does not animate; it silently lies about
anything mid-transition. Checked in a real browser, the page keeps 360px clear
when the conversation panel opens and 0 when it closes — which is what Imran
reported was missing, and is now in the sweep so it cannot go quiet again.

The swap stands regardless. Two mechanisms were candidates and only one could be
explained; keeping the inexplicable one because the fault turned out to be
elsewhere would leave the next person a puzzle in place of a rule.

**Three acts had also never been pressed by anything** — not by me, not by the
sweep: importing a workflow through the new footer button, duplicating a shelf,
and the footer collapsing to icons. All three work, and all three are now
checked. That they were unverified is the same gap that let "open in a new tab"
be reported done twice: **a handler that nobody has pressed is indistinguishable
from a feature, in the source and only in the source.**


### DES-213, Desk stays still, and the swatches were never the problem

Two things Imran's ruling closes, and the second one closes differently from how
it was framed.

**Desk's glyph stays still.** Imran, 2026-08-23. The animated family has no desk
lamp, and the alternatives were to become an animated lightbulb or to have one
hand-written. Staying still is [[DES-187]] applied rather than an exception to
it: an icon with no twin is drawn plain, because the alternative is a glyph that
turns into a *different picture* on hover — the exact fault the share icon had
and that the glyph rule was built to catch. Nothing changed in the code; what
changed is that the question is now answered, so the next person to notice Desk
sitting still while its neighbours move does not re-open it.

**The swatches: measuring first changed what the options are.** [[DES-205]] left
them open on the assumption that a mid-tone palette would go dim on near-black
and that each of the ten would need re-judging against a new ground. Measured,
that assumption is simply wrong, and in the opposite direction:

- against the dark card, the ten score **4.47 to 5.19**
- against white, the same ten score **3.42 to 3.97**

They read **better** on dark than on light. That is what a deliberately mid-tone
set is *for*, and [[DES-018]] chose one on purpose — the low scores on white were
accepted there because a swatch always travels with a legible folder name. The
same property that made them acceptable on white makes them comfortable on dark.

So there is no legibility work to do. Exactly one swatch, plum at 4.47, misses a
4.5 bar that **no swatch meets in the light theme**, which is a rounding-level
miss rather than a fault.

What is left is a question of taste and it is a real one: saturated colour on
near-black vibrates in a way it does not on white. That cannot be settled by
arithmetic, which is the whole reason it was flagged for Imran rather than
decided. So the three options are drawn rather than described, at
`?view=swatches`, as a glyph and a folder name at sidebar size on both grounds
at once:

- **A · As they are** — unchanged.
- **B · Plum nudged** — one value, `#b562a9` → `#b765ab`, nothing else touched.
- **C · Softened** — all ten, 14 points less saturated and lifted back to the
  bar. Vividness traded for calm.

**A caution worth recording with them.** A page that exists to be ruled on is a
page that must not quietly become the ruling. This one is a lab route, excluded
from the audit's rules like the row lab beside it, and it holds no values the
product reads — the three sets are literals in that file. Whichever option is
chosen, the change lands in `tokens.css` and this page stays a comparison.


### DES-214, the accent was greyer than it meant to be

Imran, 2026-08-23: "the vividness is very less in the current brand accents, if
you can change it and make it a bit more vivid according to shadcn UI".

He is right, and the gap is larger than it looks by eye. The shipped accent was
`hsl(226 52% 49%)`. The blue shadcn ships against — Tailwind's `blue-600` — is
`hsl(221 83% 53%)`. **Thirty-one points of saturation.** Beside that, Dana's
read as a greyed blue rather than as a brand, which is exactly what he noticed
without needing the numbers.

Raised to **75%**, `#3b62e3`.

**The hue does not move.** 226 is Dana's cobalt and Tailwind's is 221. Taking
their hue as well as their chroma would be adopting their blue rather than
making ours brighter, and the point of a brand colour is that it is not the
default one.

**And the contrast was budgeted rather than spent**, which is the part worth
keeping. The obvious way to get vivid is to raise saturation and lightness
together until white-on-it just clears 4.5:1 — every candidate produced that way
landed at 4.54 to 4.66, leaving nothing in hand for a focus ring on a tinted row
or for a screen dimmer than the one it was picked on. Tailwind's own 600 keeps
**5.17**. So this is tuned to **5.20**: their headroom, spent on saturation
instead of lightness. The 700 lands at 6.8, which is right for a hover state.

Two things moved with it, and both would have been easy to miss:

- **The tints were re-derived, not kept.** A hover wash that is a paler version
  of a colour the product no longer uses is a colour nobody chose.
- **The dark ramp was re-derived too.** It had been generated from the old,
  greyer 600; leaving it would have made the accent vivid in light and washed in
  dark — two themes drifting apart, in the purest form of the fault this whole
  stretch keeps removing.

**And the dark tints were wrong before this touched them.** They sat at 1.06
against the dark card where the neutral hover step (graphite-50 against
graphite-0) is 1.10. A wash you cannot see is a hover state that does not exist,
so they are stepped to match the neutral: 1.12 and 1.28 against 1.10 and 1.23.
That is a fault the accent change surfaced rather than caused, and it would have
gone on being invisible precisely because it was invisible.

The dial is on the same page as the swatches, at `?view=swatches`: five rows —
52% as it was, 65%, 75% applied, 85%, and Tailwind's own for reference — each
drawn as a primary button, a tinted chip and a link, **all at the same 5.20
contrast** so the only variable changing is chroma. Comparing vividness while
also varying contrast would make the brightest look best on a bright screen and
worst everywhere else.


### DES-215, the whole palette was greyer than it meant to be

Imran, 2026-08-23: 85% for the accent, "and it's not only about accent, the
swatches also lack the vividness, do similar thing to swatches too."

**The accent went to 85%, `#335fee`.** Contrast 5.23 — still the headroom
Tailwind's own 600 keeps, still hue 226 rather than their 221. The dark ramp and
both sets of tints were re-derived from it rather than left, for the reason
[[DES-214]] gives: a wash that is a paler version of a colour the product no
longer uses is a colour nobody chose.

**And the ten folder swatches went up about 30 points each.** The same
complaint, the same answer, applied ten times — and the discipline is what makes
it a change rather than a redraw:

> **Every swatch holds its own hue and its own contrast.** The lightness is
> re-solved per swatch so each lands within 0.02 of the ratio it had on white.
> Clay was 3.61 and is 3.61; teal was 3.42 and is 3.41. The band is **3.41–3.98
> where it was 3.42–3.97**. Nothing became more or less legible. They became
> more coloured.

That is the only honest way to compare a palette, and it is the same rule the
accent got: change one variable. Raising chroma *and* lightness together makes
every candidate look better on the screen it was chosen on and worse on every
other one.

[[DES-018]]'s requirement is untouched and is why these ratios are allowed near
3.5: a swatch never carries meaning alone, it travels with a folder name.

**One collision surfaced, and it is not new.** Folder **cobalt sits at hue 224**
and the brand accent at **226** — two degrees apart, since the palette was
drawn. It was survivable while both were dull enough for lightness to separate
them (49% against 62%). Vivid, they are one colour with two jobs, and DES-018's
own line is that a folder colour is *identity* while the accent is *interaction*.

It is **not silently re-hued**. A folder colour is somebody's choice about their
own folder, and moving it changes what their sidebar looks like tomorrow morning
without them asking. The proposal — cobalt to hue **242**, `#7b77f6`, same
saturation and same contrast, clear of the accent at 226 and still clear of
violet at 259 — is drawn at `?view=swatches` beside the applied value, for Imran
to rule on. Until then cobalt keeps its hue and takes the same lift as the rest.

**A flaky check was hardened rather than shrugged at.** The workflow-import
block failed once in three runs on a fixed 1500ms wait: the import navigates to
a new folder, and a page still mounting has neither its section nor its task in
`innerText` yet. It waits for the content now. A check that cries wolf is worse
than no check, because a suite whose failures get waved through is a suite that
has stopped working while still printing green.


### DES-216, the third review pass: surfaces reasoned about and never operated

Imran's review of 2026-08-23, six reports. The pattern across them is one
sentence: **every fault sat in a place nothing had ever pressed** — not by him,
not by me, not by the sweep. Each is fixed, and each now has an operation in the
sweep rather than a reading.

**History did not open, because the sheet was never rendered.** The folder's
menu had the act, the handler set state, and the `HistorySheet` the state was
for did not exist in the tree — an earlier edit's anchor had not matched and
nothing said so. A handler wired to state that nothing reads is the quietest
form of dead control there is: the menu item exists, the click works, and
nothing happens. The sheet is rendered now, and shelves joined the creation
seed so their History has the line every other object gets.

**Restore made two rows because the sidebar had its own list.** It is built
from three sources — the fixture groups, the unlabelled fixtures, and whatever
a person has made — and any name in two of them drew twice. `folderLibrary()`
has de-duplicated since the day it was written, which is why every picker and
search stayed correct while the one column that *draws* folders doubled. The
sidebar de-duplicates by `folderKey` now: one folder, one row, however the
overlap arises. De-duped by key rather than display name, so a rename can
neither split one folder into two nor merge two into one.

**The folder delete's undo did not exist, twice over.** [[DES-200]] removed the
delete confirmation on the grounds that a folder has two ways back — the bar
and the Trash. First: the record passed no inverse, so the bar never appeared.
Removing a question on the strength of a safety net that was never built is the
worst kind of mistake, because the reasoning reads correct in the decision
record while the product is quietly less safe than it claims. Second, and
found by the new check the moment the first fix landed: the sidebar's delete
**navigated to the folder's page to perform it**, and undo is in-memory, so the
bar died with the page load. Deleting happens where you stand now —
`deleteFolder` in the shell chrome, no travel — and only deleting the folder
you are *standing on* still navigates, because the page under you is gone.

**A shelf file could be written and not read.** The import path checked for
`dana: "workflow"` and a shelf file says `dana: "shelf-workflow"`, so it was
refused by the very guard that exists to refuse *foreign* files. A format you
can export and not import is not a format, it is a leak. `parseAnyWorkflow`
reads both and tags the result. Importing a shelf makes its page and **joins
the folders you already have rather than duplicating them** — a file that
mentions Travel should put your Travel on the shelf, not make a second one —
and folders named but absent are created empty. Shelf names are made unique
among *shelves*, not among folders: `availableFolderName` asks the folder
library, which knows nothing about labels, so importing "Personal" over an
existing Personal silently merged two arrangements.

**The shelf page joined the folder page's measure and got its control row.**
It had `--shell-page-max` and its own padding where every other page uses
`pageBodyClass` — a page written beside a component instead of with it. Its
control row carries the Activity line and the full shelf contract: History,
Rename (which focuses the title field, the folder page's arrangement), Copy
link, Duplicate, Save as workflow, Delete. Deliberately absent: the view strip
and filters. A view switches how a list of tasks is drawn and a shelf holds
folders; a filter narrows a list somebody built, and a shelf's list *is* its
label — narrowing it would be editing it. Deleting a shelf unlabels its
folders and keeps them: the arrangement goes, the things arranged stay
([[DES-195]]).

**The footer's three buttons keep their line as the sidebar narrows.** Imran
pointed at Notion's nav: labels drop, icons hold the row. The trigger is the
sidebar's *width* — a container query on the row, breaking at about 212px —
because the sidebar is draggable from 224 to 360 and a breakpoint someone
guessed would fight the drag. In the fully collapsed 56px rail they do stack,
and that is arithmetic rather than taste: three 32px icons and their gaps need
100px and there are 56.


### DES-217, the tab strip stops having a special first tab

Imran's fourth review pass, 2026-08-24, and four of his reports were one
mechanism: the first tab was wider than the rest, could not be closed, and
silently mirrored the URL — so a folder asked to open as a second tab appeared
to open as the first, because opening navigated and the mirror followed. The
strip drew tabs; it did not have them.

It has them now. **Every tab is the same tab**: one width, one mark-and-title
anatomy, one close control, task tabs and place tabs in one ordered list
(`page:` / `folder:` / `shelf:` / a bare task id — the one-list-with-a-kind
that search and duplicate settled). The place you are standing on is simply
the active tab. Ordinary navigation retargets the tab you were on, the way a
browser's address bar does; **Open in a new tab appends one and goes to it**,
and the tab that was showing the old place keeps saying so, because it is an
entry in a list rather than a mirror. **Closing the active tab lands on the
neighbouring place, and an emptied strip lands on Desk** — Imran's rule, and
the browser's. **Tabs reorder by pointer drag**, a horizontal bespoke like the
board's columns, with a 5px arming threshold so a click is never eaten. And
the strip gained its **"+"**: every shelf and folder, then New folder, New
shelf, Import workflow — the same handlers the sidebar uses, so the two ways
into a tab cannot drift.

One fault this surfaced had been true since the shelf page landed: a shelf
fell through `activePage`'s chain to "Today", so a shelf page lit Today's
sidebar row — and, once the strip drew from one list, dressed the shelf's tab
as Today's. A shelf is its own place now, like a folder.

### DES-218, a shelf's name is its label, so renaming is the shell's act

"Renaming Shelfs doesn't work" — Imran, 2026-08-24 — and it did not, from
either surface. The page's name field wrote a display-name mapping into the
identity store under `shelf:<name>`, which nothing reads, because a shelf *has
no record to rename*: its name is the membership label on its folders. The
sidebar dialog rewrote the labels — the actual rename — but left the page's
stores behind, so a renamed shelf forgot its cover, icon, description and
blocks.

One act now, supplied by the shell: rewrite the label on every member folder,
move the page's stores to the new key (`moveShelfPage`, shared by both
surfaces so they cannot drift), carry any tab naming the shelf, refuse a name
another shelf holds, record `renamed`, and follow the page to its new address.

### DES-219, the shelf page takes the folder page's grammar whole

Imran, 2026-08-24: the shelf page should follow "the exact folder page
structure — distances, dragging, and even kinda hierarchy". Three moves:

**A folder row is a block.** [[DES-207]] kept the folders out of the blocks
entirely, reasoning that a block would be a second record of the membership.
Half right: *which* folders are on the shelf stays the label's fact — a
membership the layout has never seen joins after the last folder row, an
entry whose membership is gone is dropped on read — but *where* a row sits
among the writing is an arrangement, exactly like a task's position on a
folder page. So a folder row moves on the same grip as everything else, sits
under a heading and folds with it, and takes prose before and after it. The
insert strip learned [[DES-193]]'s dense rule for folder runs too, which is
what "the + line is too disconnected" was.

**The page has the folder page's chrome.** Its control row — Activity and the
overflow — moved out of the page body into the window bar, where the folder
page's has lived since [[DES-139]]; and the cover affordance arrived, the F3
fault repeated: the band rendered, nothing offered it.

**It captures like one.** An add-folder row sits at the end of the folder
run, offering every folder not on the shelf — choosing one is the same act as
the sidebar's Move to shelf, live without a reload — plus New folder, which
opens the shell's own dialog with the shelf pre-filled. Desk is refused:
native, undeletable, off every shelf ([[DES-152]]). And a folder pressed on a
shelf **opens as its own tab and lands you there**, the shelf kept open
beside it, because a shelf presents a workflow and what it opens should stay
open.

### DES-220, the sidebar's folder block is labelled Library — PROPOSED

Imran, 2026-08-24: the collapsible "Folders" label "does not feel good" now
that the block holds shelves too, offering "Shelfs and Folders" or "User
Library" and asking for better. **Library** is the offer: one word, plain
English, naming the place rather than half its contents — and it is the room
shelves already stand in, so the metaphor was chosen the day "shelf" was.
"Shelves and folders" names the contents and grows wrong the day the block
holds a third thing. His eye rules; the word swaps in one line.

### DES-221, whose footer label survives narrowing is arithmetic

The three footer words need about 256px and the default row has 240, so at
the default width something must give — which is why "New shelf" was
clipping, the fault Imran named. Equal thirds gave the longest label the same
room as the shortest. The buttons are content-sized now, and the label that
yields is decided by the numbers rather than by rank: **New shelf keeps its
word at every row width** — it was the one clipping, and a truncated "New
she…" is the worst of the three readings — while **Import and Trash go to
their icons until the row genuinely fits all three** (about 262px), which is
the same behaviour the whole row already had when narrowed, applied two at a
time. Tooltips name all three in every state; the collapsed rail still
stacks, which is [[DES-216]]'s arithmetic unchanged.

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
