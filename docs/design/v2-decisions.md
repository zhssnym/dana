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
| DES-108 | A CSS reset silently suppresses text sizes on every control | OPEN | V3 | **Yes**, see below |
| DES-109 | The card has no Save button; the footer is a toolbar | OPEN | V3 | **Yes**, see below |
| DES-110 | The V3 question, reduced: is a task row one line or two? | SUPERSEDED | V3 | By DES-113 |
| DES-111 | A row is as tall as it needs to be | APPROVED | V3 | Imran, 2026-08-17 |
| DES-112 | What a selection can do, at both levels | OPEN | V3 | No |
| DES-113 | Row density is a setting; two lines is the default | APPROVED | V3 | Imran, 2026-08-17, front end only |
| DES-114 | Every folder list ends in "New folder…" | APPROVED | V3 | Carried by DES-113 |
| DES-115 | An empty block is the control that fills it | APPROVED | V3 | Carried by DES-113 |

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
| DES-106 | One verb for moving things between levels: **Move to…** | PROPOSED | V3 | **Owner ruling wanted**, see below |

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

**One thing that has to be settled before the ladder is drawn, and it is a
model question rather than a design one.** The first two rungs have somewhere
to go. The third does not: Dana's folders are **flat**, stated as recently as
DES-088 ("None of this changes Dana's flat-folder model"), so there is no level
above a folder for one to be promoted into. Promoting a folder means either
nested folders — a real change to the data model, every one of the twelve
section 6 queries, and the sidebar — or it means something else that has not
been named yet.

Recorded as a question rather than assumed away: **what is a folder promoted
into?** Until that is answered the ladder has two rungs, not three, and the
two-rung version is buildable as one endpoint under DES-106.

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

**What is being asked of Imran here is not which menu items to build, it is
whether Dana has one verb or five.** DES-100 and DES-104 should be resolved
together with this one, because if the answer is one verb, both of them are
already written and neither needs its own design.

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

**Recommendation: apply the fix.** Six controls change across the two views
measured, each by one or two pixels, and each change moves the control *to* the
size its own code asks for. The risk that made this look like an owner decision
was a measurement error, and with the real number the fix is ordinary
maintenance. It should be done before V3's states work, since two of the six
are on the states page itself.

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

### Withdrawn at V3

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
