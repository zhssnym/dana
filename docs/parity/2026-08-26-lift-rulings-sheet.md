# The lift rulings sheet: one sitting with Imran

- **Date:** 2026-08-26
- **Package:** RFC 0004's **S20**, written under
  `docs/team/07-frontend-architect.md` beside
  `docs/parity/2026-08-26-prototype-v2-behavioural-ledger.md`, whose entry
  numbers (L-nnn) every row here cites.
- **Why this file exists:** RFC 0004's lift section rules that conflicts
  between the prototype and a numbered section are **batched, not
  scattered**, and that **no session argues a conflict inline**. Protocol
  section 6 requires an escalation to carry the options and a
  recommendation, never just the problem. So every question below carries
  one.
- **The standing direction that answers most of this in advance:** item 37
  records it in Imran's own terms, *sections amend toward the prototype,
  except frozen sections 4 and 7, which are ruled one by one and never
  assumed*. Three questions below reach frozen section 4 and are marked; the
  rest are section 9 amendments the Steward can write once a yes is given.

## How this sheet is meant to be used

The ledger found **66 decisions no numbered section carries**. Sixty-six
questions is not a sitting, it is an afternoon, and most of them have no
live disagreement in them: the prototype decided something, the client
already does it, and all that is owed is a sentence in section 9 so the next
session is not left to remember it. Those are **Part D, one block, one
answer**.

The questions that change what a session builds are **Parts A, B and C, and
there are sixteen of them.** Each is a yes or a no, or a choice of two.
Part D is a seventeenth question asked once over a block of fifty-two.

**S21 cannot close on any surface whose rulings are unanswered**, and which
those are is at the foot of this file.


## Part A. The live conflicts

Two rows. A numbered section and the prototype disagree, criteria assert the
section's side, and 11.13 makes the section win until it is amended.

**A2 was added by the Integration Steward at ratification**, on the criteria
triage's escalation of the same date; it is not the ledger's own row, and the
sheet says so rather than absorbing it, because a question's provenance is
part of the answer's evidence.

### A1. The five ellipsis labels (ledger L-009)

**The question.** The prototype writes five menu labels with a trailing
ellipsis: "Move to folder…", "Delete task…", "Delete folder…", "Leave
folder…", "Delete shelf…". The client writes all five without it, and it is
not a slip: **9.1's names table fixes the member exit as "Leave folder"
exactly**, AC-217 asserts that string, and AC-183 asserts section 9's
strings character for character. The client's own file records the reasoning
it inherited, that two destructive acts differing only in punctuation is a
difference with no meaning. Item 39 says the overflow lists are the
prototype's exactly, which reaches the labels.

**What each answer costs.**

- **The prototype's ellipses.** 9.1's names table changes for "Leave
  folder", 9.3's and 9.6's act names take their ellipses, and **AC-217 moves
  and AC-183 gains a case**, both red first under persona 11 in the package
  that lifts the surface. The gain is honest: an ellipsis promises a further
  step, and four of these five do open a confirm or a picker.
- **The client's plain labels.** The section stands, two criteria stay
  green, and the lift carries one named exemption per 11.13 that the S30
  walkthrough will read every time.

**Recommendation: take the prototype's ellipses**, and take them for the
four labels that genuinely lead somewhere ("Move to folder…", "Delete
task…", "Delete folder…", "Leave folder…", "Delete shelf…", the deletes
confirm through Trash's own dialog or the leave confirm). It is your own
ruling of 2026-08-26 read literally, the cost is one criterion moving and
one gaining a case, and the alternative leaves the first exemption in a plan
whose whole point is that there are none.

### A2. Seven accessible names, against 9.1's names table (triage F3)

**The question.** Outside the two axes item 39 makes mandatory, the
prototype's controls announce themselves differently from 9.1's names table
in seven measured places: "Search Dana" against **"Search"**; "More task
actions", "More folder actions", "More actions for {folder}" and "Manage
{shelf} shelf" against **"More actions"**; "Remove from Important" and "Mark
as Important" against **"Important"** and **"Mark as important"**; "Resize
task panel" against **"Resize panel"**; "Toggle Sidebar" against **"Collapse
sidebar"** and **"Expand sidebar"**; "Open Imran Wafa's account menu" against
**"Account"**; and "Task title", "Task name" and "New task name" against
9.3's **"title"**.

**Why it is worth your minute.** That table is the addressing contract the
whole browser leg is built on: 9.1 says every control it names "is reachable
by its accessible role and by its normative name; the copy above is what a
screen reader announces and what a test addresses". So this is not a matter
of wording. It decides whether about thirty criteria move.

**Recommendation: 9.1's names stand, and the lift transcribes them at the
seam.** None of the seven is visible on screen, none changes what a control
does, and the prototype's variants are longer strings rather than different
behaviour. The cost is one line per control in the lifted files, declared as
a named seam under the lift discipline. The alternative costs about thirty
criteria moving for no gain a person can see.


## Part B. Decisions no section carries, where the answer changes the build

Eleven questions. Each names the entry, the choice, and what it costs.

### B1. Does a place page get a cover? (L-181, L-184), and it reaches frozen section 4

The prototype makes a cover native to **every page except a task's**: Today,
Scheduled, Important, All, Done and every folder can carry one, because a
cover is how a *place* announces itself. The client gives covers to folders
and shelves alone, and its own page-head file records why: **no column
anywhere holds a native page's cover**, a place page having no row to hang
one on. Section 9.4's head names a mark, a title, a fact and a description,
and no cover.

**Recommendation: no, and record it as a decision rather than a gap.** A
folder's cover is the folder's; a place page is Dana's own furniture, the
same for everybody, and a per-person cover on Today needs a new table for
decoration alone. If you want it, it is a schema change and therefore yours,
and the honest sequence is a `user_page_covers` table in a later release
rather than inside the lift.

### B2. What are the folder page's board columns? (L-044, L-045)

The prototype's folder board draws **the page's sections as its columns**,
movable by a grip, with column order **being** page order, plus a **Done
column that is not a section** where dropping a card completes it. The
client's folder board groups by **date**, with its own reasoning recorded: a
folder page has pinned the folder, so a board grouped by folder is one
column, and the date is the axis such a page actually spans.

**Recommendation: the prototype's sections.** Both readings are defensible
and the prototype's is better, because sections are what a folder page's
arrangement *is*, and a board whose columns are the sections makes moving a
task between them one gesture. The date board survives as the filter's
group-by, so nothing is lost. 9.6 gains a sentence.

### B3. What does a workflow file carry? (L-112, L-115)

The prototype's `workflow.ts` says a workflow carries each task's **title,
notes, star, repeat, reminder, steps and whether each is ticked**, and its
state. 7.16's schema, which is what the client imports and exports through,
carries less. The prototype also contradicts itself: one paragraph says a
half-finished folder imports half-finished, another says a duplicate is the
fresh run and a workflow is the save.

**Recommendation: leave 7.16 as it is for 2.0.0.** Widening it is frozen
section 7, it buys a richer template at the cost of a schema decision inside
a lift, and the starters of 9.13 are the only consumer today. Recorded as a
want rather than built.

### B4. Should a task's list order be draggable? (L-092, L-154, L-249), the owner's own list item

Your list names "task drag and sidebar drag as the prototype does them". The
sidebar half is done. **The task half is a question rather than a port**,
and the reason is in the prototype's own file: dragging to reorder a task
list, the 1.5 second hold that makes a folder of two tasks, press-and-hold
selection and the bulk bar are drawn **only in the concept lab** and
deliberately not wired into the prototype's screens, "because they need a
persisted order and endpoints nobody has written". There is no `position`
column on tasks and no section 6 query returns one.

**Recommendation: split it.** Take the **folder page's section drag**, which
the prototype does wire and which needs no new column because
`section_block_id` already exists (S26). Leave the **list reorder and the
hold** out of 2.0.0 and record them as the schema work they are. Building
them would mean a frozen section 4 column, a frozen section 7 field, and a
new ordering rule in section 6, inside a package whose discipline is that a
lifted file diffs empty.

### B5. Voice notes on a comment (L-202, L-256)

The prototype's conversation offers words, **files riding along**, and a
**voice note** that actually records and plays back. 4.15 and 4.16 carry
comments and files, and change control item 1 added `comment_files`
precisely to bind them, so the **files half is a port**. Voice has no kind,
no storage rule and no player.

**Recommendation: build the files half at S26 and leave voice out**, and
record voice as a want. It needs an audio kind in 4.16, a duration, a
player, and a decision about transcription that nobody has had.

### B6. Does the undo bar say what the event log says? (L-088)

The prototype writes the history event and the undo entry in one call, so
the bar's sentence is **derived from the event** and the two can never
disagree. The client writes events at the 10.2 chokepoint and composes the
bar's sentence in the client.

**Recommendation: no change for 2.0.0.** The client's shape is stronger
where it matters, the event being written server-side inside the mutation's
transaction, and 9.1 already fixes the bar's wording ("Deleted "{title}"").
Worth a sentence in 9.1 saying the two are separately specified so a later
reader does not treat one as the source of the other.

### B7. The image block's width handle (L-193, L-194, L-196, L-197)

The prototype's image block takes **a width and only a width**, dragged
rather than chosen from sizes, stored as a percentage, with the space
reserved before the picture loads, and three ways in (choose, drop, paste).
The client's image block has none of the four.

**Recommendation: take the aspect-ratio reservation and paste, leave the
width handle.** The first two are correctness (a page that jumps by the
height of an image is the worst thing a page of text does) and cost little;
the width handle needs a number stored per block, which is 4.17's schema.

### B8. Does a cover come with a gallery? (L-186, L-068)

The prototype offers four cover tiers: nine gradients from the token
palette, six covers drawn from Dana's own ribbon geometry, photographs from
a free source, and upload; plus a **vertical crop** stored per folder for
photographic covers. The client takes an upload and nothing else.

**Recommendation: take the gradients and the mark covers, leave the photo
service and the crop.** The first two are token values and a component, cost
no storage and are the tier no other product can have; the photo tier is a
third-party network dependency the service worker cannot precache (10.6),
and the crop is a column.

### B9. Step promotion (L-159)

The prototype's card can move a step out to become a task and a task in to
become a step. No endpoint exists for either.

**Recommendation: leave it out of 2.0.0** and record it. It is the one
Lane 2 proposal on the card that the v2 schema work did not overtake.

### B10. Where a duplicate's work lands (L-053)

The prototype rules that a duplicate's tasks are assigned to **whoever made
the copy**, never left empty, because empty means the copy appears in
nobody's Assignments including the copier's. 9.6 says grants do not copy and
does not say what replaces them.

**Recommendation: yes, assign to the duplicator**, and add the clause to
9.6. Check it against what the server does today at S26 rather than assuming
either way: this is a one-line reading of `domain/` and it is the sort of
thing that is easier to confirm than to argue.

### B11. The image downscale on the way in (L-106)

The prototype downscales an uploaded image to 1600px on the long edge at
JPEG 0.72, which puts a photograph near 200KB. The client re-encodes for
safety (AC-231) and caps by size (10.3) and does not downscale for weight.

**Recommendation: yes, downscale, and put the numbers in 10.3.** It is one
change at one seam, it protects the 1 GB quota that 9.7 reports, and the
re-encode the security work already does is the natural place for it.


## Part C. Questions the prototype itself left open

Three, each of which the prototype either asks or contradicts itself about.

### C1. The task surface's modes: five, three, or two? (L-039)

The prototype's `task-surface.tsx` header names **five** ways to hold a task
(dialog, full screen, either edge, floating card) plus the tab; its own
`TaskSurfaceMode` type resolves to **two** (dialog, right) plus the tab; and
9.3 names **three** (dialog, panel, tab).

**Recommendation: three, which is 9.3's, and no amendment is needed.** The
prototype's code already agrees with the section once the tab is counted;
only its prose is ahead of it. S23 builds three, and the preference
(`task_open`) already stores exactly those three.

### C2. The dark swatches (L-244)

`swatch-options.tsx` exists to have you choose between three treatments of
the ten folder swatches on a dark ground, having measured that the palette
reads **better** on dark (4.47 to 5.19) than on light (3.42 to 3.97), so it
is a question of taste rather than of legibility. **Whether you ruled on it
is not visible from this repository.**

**Recommendation: rule it now or say it stands.** S21 reconciles the dark
theme against the prototype's values, and it should not have to guess. If
you already answered, the design contract's DES-205 and DES-214 rows are
where the answer should be, and S21 reads them there.

### C3. What is a shelf's page? (L-247, and RFC 0004's S27 row asks it)

RFC 0004's S27 row says "the shelf page including whatever S20's rulings
decide a shelf's page is". **The answer is: nothing further is owed.** 9.10
and the prototype agree line for line: cover, mark, name, description,
blocks, folder rows as blocks whose presence is derived and whose position
is arranged, "Add folder", the object contract's overflow, no views, no
filter, private by construction with a copyable address, and the client is
built to both and asserted by AC-203, AC-223 and AC-257.

**Recommendation: no question. This row can be struck from S27's scope**,
which is a correction the Steward owes RFC 0004's table rather than a
decision of yours.


## Part D. The batched block: fifty-two decisions, one answer

These are the ledger rows whose section column reads *unspecified* and where
**the client already draws the prototype's answer**, or where the prototype's
answer is the only one on the table and nothing disputes it. There is
nothing to decide in any of them individually; what is owed is that section 9
say so, and until it does, 11.13's mechanism is still running and the next
session is still working from memory.

**The question, once: may the Steward fold these into section 9 as written,
in S29's spec fold, without a separate ruling each?**

**Recommendation: yes.** They are listed here rather than summarised so that
nothing is folded you have not seen, and the fold is a Steward act under
change control with the list attached.

**The arithmetic, so nothing is lost between the two files.** The ledger
carries **66** entries whose section column reads *unspecified*. **Fourteen**
of them are raised as questions above (L-028 under item 39's own ruling, and
L-044, L-045, L-053, L-068, L-092, L-106, L-154, L-185, L-186, L-193, L-194,
L-196, L-197 in Part B). The remaining **52** are this block, in full:

**L-002, L-003, L-004, L-005, L-006, L-008, L-014, L-029, L-030, L-031,
L-032, L-033, L-034, L-037, L-055, L-070, L-071, L-074, L-076, L-077, L-080,
L-090, L-091, L-093, L-096, L-098, L-117, L-127, L-128, L-136, L-138, L-139,
L-141, L-142, L-143, L-144, L-145, L-148, L-150, L-151, L-152, L-153, L-157,
L-163, L-170, L-172, L-173, L-190, L-199, L-200, L-214, L-219.**

Four of them are worth a glance on the way past, because folding them into
section 9 is what makes them real rather than remembered:

- **L-029 to L-033**, the view strip's collapsing radiogroup. Item 39
  already decides that the strip becomes the prototype's; what is
  unspecified is the *behaviour*: icons with words on hover, only the
  current view visible at rest, every option in the DOM at zero width so the
  keyboard sees the whole group. That last clause is an accessibility
  property and belongs in 9.1's roles table rather than in a component.
- **L-046**, Assignments' whose-assignments strip. 9.5 fixes the grouping
  and names no scope control, and `nav-model`'s rule is that a page's name
  never changes while the value it shows lives in a scope control. Folding
  it is what makes S25 owe it.
- **L-141 to L-145**, the animated mark. Nothing in any section says Dana's
  mark is drawn rather than fetched, which is exactly why five files still
  point at an SVG file. One sentence in 9.1 fixes it for good.
- **L-153**, a row carrying its section as a path after its folder chip.
  `section_block_id` has ridden the card since S18 and no row draws it; 9.3's
  field table does not mention it.


## What is blocked until this sitting happens

**S21 (the foundation) cannot close** on: the dark theme, until **C2**; the
animated mark, which is unblocked (item 39 and the ledger settle it) but
which S21 should not start before the mark's section sentence exists (**D**);
the view strip, which item 39 decides and whose behaviour needs **D**.

**S23 (the task surface) cannot close** on: the row and card addresses, until **A2**; the row's menu labels, until
**A1**; the surface's modes, which **C1** answers without you if you accept
the recommendation; the list drag, until **B4**.

**S26 (the folder page and the conversation) cannot close** on: the board's
columns, until **B2**; the conversation's attachments and voice, until
**B5**; the image block, until **B7**; covers, until **B1** and **B8**.

**S27 (the remainder) loses a clause** on **C3**, and gains nothing.

**S25 (the places) is blocked by nothing here.** Assignments' from half and
the created-by axis are already specified in 9.1 and 9.5 and only need
building, which is why the ledger marks them S25 rather than *ruling*.
