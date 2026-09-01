# RFC 0005: The v2 specification

**Status:** implemented
**Milestone:** none, this RFC predates the milestone process

The contract for Dana v2, accepted by Imran on 2026-08-24, re-accepted on 2026-08-27
after its delta grew, and implemented on 2026-08-30 as release 2.0.0. It changed what
the sidebar asks (five pages plus an unpinned Done, one question each), made a due date
a day rather than a moment, stated who may do what to a shared folder, and added six
systems the approved v2 design draws and v1 could not store: the event record (history,
trash, notifications), object storage (covers, images, attachments, voice, avatars), the
page model (blocks, folder identity, shelves), the conversation (comments, threads,
likes), the object acts (duplicate, workflows, addresses, ownership transfer), and the
person's bundle (preferences, pins, saved views, arrangements).

It introduced no decision of its own. It is the pricing session's cut list written as
specification text, and RFC 0004 is the work order that built it.

**The delta is not reproduced here.** Every accepted unit was folded into `docs/spec/`
by the S29 and S29a folds of 2026-08-27 and 2026-08-30, and the specification has moved
past this document since. Two thirds of the delta was already byte-identical to the spec
when this trim was made, and where the two differed the spec was newer. Keeping a stale
second copy of the contract next to the contract is how the two come to disagree. The
full original, 6,763 lines, is one command away:

```bash
git show v2.2.0:docs/rfcs/0005-v2-specification.md
```

What is kept below is what the specification cannot carry: the alternatives that lost,
the reasoning behind rules whose shape is not obvious from the rule, and an index of the
sixty-one change-control items, so that the roughly fifty citations of them by number in
`docs/spec/` still resolve.

## One live item: a secret in published git history

**`GOOGLE_CLIENT_SECRET` is in Dana's published git history, at commit `bf90c0a`.**
`app/.env` is a tracked file on `main`, deliberately, and `CLAUDE.md` carries that
policy. This is the separate fact that the policy does not cover.

Rotating the secret in the Google Cloud console, under OAuth client "Dana web", is the
only act that changes the exposure. Untracking the file and restoring the `.gitignore`
rules stop it spreading further; neither removes the value from history, which is why
they are not a substitute. Recorded 2026-08-25 as change control item 21, still true
when this file was trimmed on 2026-09-01, and the owner's to perform.

## Alternatives considered

- **One RFC against several.** The navigation change was owed its own accept line, but
  everything else here is one pricing session's one cut list, and splitting it would
  have re-created the per-entry pricing that hid the shared substrates.
- **Per-viewer folder identity** lost to folder-owned identity. A collaboration product
  where every member sees a different page is two products, and the per-member table
  also doubles the sharing system.
- **CRDTs for page blocks** lost to last-write-wins plus 409. Dana's concurrency is two
  people occasionally, not documents-as-a-service, and the spec already had the conflict
  vocabulary.
- **Real-time push for comments** lost to refetch-and-poll. No new architecture and the
  single instance intact. Deferred by name, not denied.
- **A reminders redesign** lost to the existing `time_of_day` mode. The schema already
  answered day-level reminders, so a new column would have been a worse copy of 4.8.
- **Trash as its own table** lost to `deleted_at` columns. Users already soft-delete
  this way, so it is one pattern, and restore is an UPDATE.

## Rationale the specification does not carry

The spec states each of these rules. It does not state why the rule took this shape, and
each is a place a later session would otherwise re-derive a different answer.

### The hand order of a folder's list

**`tasks.position` is a fractional index, not an integer.** A plain integer renumbers
every row below a drop. The stored value is a string of base-62 digits in ASCII order,
so a key strictly between any two keys can always be computed and a drop writes one row
instead of a tail. The key carries its own integer part, whose first character encodes
its length, because the plain midpoint fails on the least exotic gesture there is:
dragging to the bottom appends after the last key and grows it by a digit every time.
Notion, Linear and Figma use this shape. The column CHECK encodes the alphabet and the
length bounds and no more; the deeper invariant, that a key never ends in the least
digit, is a property of the integer and fractional parts together and belongs in the
module that computes them.

**`COLLATE "C"` is contract, not local optimisation.** The order of a text column is the
order its collation gives it, and Dana's suite runs on two engines under the locale
agreement 11.10 spends a section on. A hand order that reads one way on PGlite and
another on a cluster with a different default breaks section 6's byte-identical
guarantee, and breaks it invisibly. Byte order is byte order in every database that
exists, so both legs and production agree by construction rather than by configuration.

**Null means never arranged**, so no folder anybody has left alone reads differently.
The column ships null on every existing row and there is no backfill, which is why the
migration touches no data at all.

**Nulls first is what keeps the change invisible until somebody drags.** Q2 orders a
folder's undated rows newest first, so a new task appears at the top today. Placed rows
sort after unplaced ones, so a newly created task lands where it always landed. Nulls
last would have moved every new task to the bottom of every arranged folder, which is a
second product decision nobody made. What does change is that `status_rank` stops
leading for placed rows: an arranged folder holds its arrangement when a task is
abandoned. That is what a hand order means, and it is confined to Q7's second section.

**No index ships with the column, and the omission is deliberate.** Section 4.12's rule
is that an index with no named consumer in section 6 does not ship. The one query that
reads it already has its predicate index and sorts a single folder's undated open rows,
which section 6 caps at 1000. `steps.position` has carried the same shape since 4.6 with
no index of its own.

### The order endpoint

**It takes neighbours rather than an index or a key.** The client names the two rows it
dropped between and the server computes the key. A client sending an index would be
sending a claim about a list it may have read a minute ago; a client sending a key would
be an implementation of this contract living on the wrong side of it. For the same
reason `position` does not join TaskCard: section 6 promises every view returns rows
already ordered, and the drag names its neighbours by id, so no client has a use for the
key.

**The first drag places the whole list.** Until a folder is arranged every position is
null, and null leads, so a row dropped at the top would land below every unplaced row
and the gesture would visibly fail. The call assigns keys to the rows that have none, in
the order the list already reads, before placing the dragged one. Nothing a reader can
see moves.

**No `updated_at` moves, the moved task's included**, which is a deliberate deviation
from 4.5's "touched on every mutation". That column has two documented consumers, the
field-level last-write-wins tiebreak and Q8's search recency key, and a row's place in a
list is evidence for neither. Touching it would push every task in a rearranged folder
to the top of that person's search results: a visible defect produced by a bookkeeping
habit. A task's place is the folder's arrangement rather than a field of the task, which
is also why the event this call writes takes the folder as its subject.

**Concurrency needs no lock on the read path.** Two people placing into one gap compute
the same key and produce a tie, which section 6's final id tie-break resolves into one
sequence both of them read. The transaction locks the folder so that two first drags
cannot both seed the list.

### Images and covers

**A dragged image width is stored as a percentage** because a picture should keep its
proportion of the page at any window size. The two bounds in the CHECK, 25 and 100, are
the drag's clamp written where it cannot be edited out. **Null is full width and is not
a default value in disguise**: a block nobody has dragged carries no width, which is a
different fact from a block somebody dragged to 100, and only one of the two is a
decision a person made. A stored 100 would make every existing block look arranged.
**Width belongs to an image alone**, and a constraint is cheaper to relax later than to
add to a column that already carries values nobody meant.

**Place covers are a table rather than six columns because they are per viewer.** A
folder's cover is the folder's and every member sees it. A place page is Dana's own
furniture, and each person's cover on it is theirs. The ruling named six places;
Assignments and Abandoned are place pages by the same definition, so the table carries
eight, and the key vocabulary is 4.19's own so that a place's cover key and its pin key
are one string rather than two spellings of one page.

**The preset is checked for shape and not against a list.** The built-in covers are the
design system's, and freezing their names into section 4 would put a design vocabulary
inside a frozen section where a later swatch could not reach it. **The file reference
cascades where a folder's sets null**, because a cover whose picture is gone is not a
half-set cover, it is no cover, and the one-source CHECK forbids the row that would
otherwise be left.

### The workflow file

**What the import carries and what it refuses.** It widened to take each task's notes,
importance, repeat, reminder and step titles. It refuses ids, people, due dates and
states: a due date is a moment in one run of the work and a template has no run, a
person is an account that may not exist wherever the file is opened, and a conversation
records what was said rather than what to do. **A step's tick is a state**, named
explicitly in the sentence because it is the half a reader would otherwise infer wrong;
the prototype's own workflow file contradicted itself on this and the schema settled it
by carrying no completion.

**The import-day anchor is a reading rather than a ruling, and it is flagged as one.**
Frozen 4.5 checks that a recurrence implies a due date and 8.6 computes a reminder's
instant from the due date, so a repeat and a reminder are both unstorable on a dateless
task. The ruling asked for both and excluded dates, and those two sentences cannot both
be satisfied literally. Anchoring the imported task on the import day satisfies the
ruling's own reason, that a template holds no moment: the file still carries no date,
and the date the task gets is the day its run began. The alternatives were to drop the
repeat and the reminder, which contradicts the ruling, or to relax 4.5's check, which
would leave the recurrence generator with no anchor.

### Events and notifications

**Fan-out is the authorization chokepoint's, not the scheduler tick's.** The
notification rows are written in the mutation's own transaction beside the event, atomic
and never double-sent. A bell that lags a minute is a worse product for no gain at
Dana's scale, and the 4.14 uniqueness constraint stays as the backstop it always was.

### The transactional emails

**The orientation footer goes on the two invitations and on neither of the other two,
and that boundary is a deliverability rule rather than a matter of taste.** The
transactional exemptions in CAN-SPAM and PECR, and a mailbox provider's own promotional
classification, turn on whether a message is functional. Genuinely promotional content
can pull in an unsubscribe requirement, and an unsubscribe link would be a second link,
which 10.7's "one action link each" forbids. A descriptive line to somebody who is not
yet a user stays on the functional side of that line; the same line to an existing
connection is filler that makes a functional message look like a marketing one. For the
same reason the product is named in a subject only as the place an event happened, never
described there.

**A due renders as the stored floating date and its wall time, never as "Today".** 4.4
stores it floating and 8.1 has it read as the reader's own local time, so a server
composing "Today" would have to decide whose today that is, which is the fault that
reading exists to avoid.

### Steps and tasks

**A step promotes to a task and a task never demotes to a step.** Promotion has one
obvious destination, the step's own folder, and the promoted task is editable at once.
Demotion has none, because nothing says which task should become its parent. The
prototype's two-way move became one-way for that reason alone.

### Two lessons from the client lift

**A control that answers no pointer is not operable.** The prototype hid a row's action
strip behind `pointer-events-none` at zero opacity, which is sound on its own terms and
cost four acceptance cases: a control receiving no pointer until its row is hovered
cannot be clicked by anything that hit-tests before it moves the pointer. 9.1's rule
that a control with an empty bounding box is not visible to anything addressing it by
role and name reads the same way for pointers, and the prototype's treatment was given
up rather than the criteria.

**A capability lifted ahead of its consumer fails in neither half loudly.** A cover
picker was built with all four of its tiers and nothing ever passed the prop that would
have narrowed them, so every place page drew three tabs that could not store anything:
two produced a key the writer could not spell and dropped the write without a word, and
the third stored a preset whose object URL did not survive a reload. The seam was built
correctly, the consumer was the next package's, and nothing failed in between. When a
seam lands before its caller, the gap is silent on both sides, so it has to be measured
rather than waited for.

## Change control index

The section this replaces ran 5,167 lines and sixty-one numbered items. Almost all of it
was bookkeeping for a build that finished on 2026-08-30: who owned which directory, what
was routed to whom, and what a session measured on a tree that no longer exists. The
decisions themselves are stated in `docs/spec/`, which is the authority on all of them.

This index exists so that citations by item number resolve. The full text of every item
is at `git show v2.2.0:docs/rfcs/0005-v2-specification.md`, lines 1587 to 6753.

| # | Date | Decided or recorded | Landed in |
| - | - | - | - |
| 1 | 2026-08-24 | A `comment_files` join table exists: 10.3 caps files per comment and 4.15 had no column storing the binding | spec 4.15 |
| 2 | 2026-08-24 | `notifications` carries UNIQUE (user_id, event_id), so a replayed fan-out lands on a constraint rather than double-notifying | spec 4.14 |
| 3 | 2026-08-24 | Two more v1 criteria than were enumerated assert the hard delete 7.13 retires: AC-014 and AC-042 | spec 12 |
| 4 | 2026-08-24 | Fan-out is the authorization chokepoint's, not the tick's: notification rows are written in the mutation's own transaction | spec 4.14, 11.7 (see note below) |
| 5 | 2026-08-24 | AC-200 re-anchors the whole plan rather than each date; leave gains DELETE /folders/:id/my-membership; the 4.3 icon key is pattern-validated, so tightening later is validation and not migration | spec 7.4, 12 |
| 6 | 2026-08-24 | Sidebar pins derive from the three v1 visibility flags until first written, so two records of one fact are never both authoritative | spec 4.10 annotation, 4.19 |
| 7 | 2026-08-24 | The pin fold ships with the server switch, not with the schema package; comments carry the composite scope key (folder_id, task_id) | spec 4.15 |
| 8 | 2026-08-24 | Twenty v1 browser criteria reworked onto the v2 surfaces; three needed Replace units this role could not write | spec 12 |
| 9 | 2026-08-25 | The place pages, nine rulings: the filter carries eight of its nine axes and created-by is escalated; a saved view opens at its place page carrying its id; All keeps Q2's grouping and Anytime does not | spec 9.4, 9.5; the description half is spec 13 item 51 |
| 10 | 2026-08-24 | Section 9.2 stops fixing the landing's marketing copy: the specification is a rulebook and not a transcript | spec 9.2 |
| 11 | 2026-08-24 | The starter workflows gain section 9.13: teach a new person where things live, solve real problems, and say they can be deleted | spec 9.13 |
| 12 | 2026-08-24 | The plan's owner column named a role owning none of the files; the role definitions were the authority, not the column | process only |
| 13 | 2026-08-24 | AC-226 was claimed twice in parallel; the earlier claim keeps the number and the sidebar drag becomes AC-227 | spec 12 |
| 14 | 2026-08-25 | Four v1 browser cases address a folder's overflow menu where 9.1 no longer puts it; raised, not decided | spec 12 |
| 15 | 2026-08-25 | The 9.3 task reunion is larger than its pickers and seven criteria stand between the two; raised, not decided | spec 9.3 |
| 16 | 2026-08-25 | 9.4's abandon confirm was rewritten by v2 and two criteria still asserted the v1 string | spec 9.4, 12 |
| 17 | 2026-08-25 | Two acceptance files moved; AC-228 is new, authored red before the implementation that greens it | spec 12 |
| 18 | 2026-08-25 | The security review's seven findings ruled on: response security headers, the account-deletion avatar step, and the Trash purge collecting the files rows whose objects it must remove | spec 8.10, 10.8, 11.7 |
| 19 | 2026-08-25 | 2.0.0 ships only when the client matches the v2 prototype; the card reunion becomes a question of when and not whether | process; drove RFC 0004 |
| 20 | 2026-08-25 | No numbered section ever named `prototype-v2/`, so client packages built from the v1 prototype while reading the rulebook correctly | spec 11.13 |
| 21 | 2026-08-25 | `app/.env` is tracked on `origin/main` and `GOOGLE_CLIENT_SECRET` is in published history at `bf90c0a`; rotation is the only act that changes the exposure | still open, stated above |
| 22 | 2026-08-25 | The build plan extends past S14 with six parity rows | RFC 0004 |
| 23 | 2026-08-25 | The parity audit is ratified and placed under `docs/parity/`, dated so a second audit appends rather than overwrites | process |
| 24 | 2026-08-25 | The two frozen section 7 widenings are written as unit 12a: `section_block_id` and `created_by` on TaskCard | spec 7.0 |
| 25 | 2026-08-25 | The 9.3 reunion's real surface is thirteen acceptance files rather than seven; two criteria falsified in substance and not only in wording | spec 12 |
| 26 | 2026-08-25 | 10.7 permits HTML with a required text/plain alternative. 11.13's rule that a numbered section beats a design artifact holds until the section is amended, and amending it was the third option nobody had taken | spec 10.7 |
| 27 | 2026-08-25 | A forwardable invite link is parked rather than refused; the schema cannot meet it and the next person will re-derive the same dead end | spec 13 |
| 28 | 2026-08-25 | Section 9 folded: eleven units written into `09-ui.md`, replacing 267 lines of v1 text | spec 9 |
| 29 | 2026-08-25 | Six readings on the unowned surfaces; `/privacy` and `/terms` are the landing's and are not rows of 9.1's route table | spec 9.1, 9.2 |
| 30 | 2026-08-25 | The route-table reading upheld with a stronger reason; 9.7's Appearance section assigned | spec 9.1, 9.7 |
| 31 | 2026-08-25 | The owner's visual review is deferred until the parity rows close: when it happens, not whether | process |
| 32 | 2026-08-25 | DES-034 closed: the four transactional emails get their subjects, bodies and action destinations, and `invite` splits into `invite_folder` and `invite_connection` because one name served two different events and no criterion could tell them apart. The copy itself ships in `app/src/server/notify/templates.ts` | spec 11.8; copy in code |
| 33 | 2026-08-25 | Unit 12a enacted; its implementation surface was seven client files wider than the unit's own list | spec 7.0 |
| 34 | 2026-08-26 | The owner column wrong again, with the call sites four rather than two; a spec citation that read item 25 should have read item 26 | spec 10.7, 11.4 |
| 35 | 2026-08-26 | Four escalations: "Delete for ever" has no endpoint and two sections against it; 9.11 requires a deleter the read does not return; 9.7 names storage used and four Appearance controls the prototype does not draw | spec 7.13, 9.7, 9.11 |
| 36 | 2026-08-26 | Trash gains a permanent delete and it destroys the objects; the frozen 7.13 widening must be written before anything is built | spec 7.13, 9.11 |
| 37 | 2026-08-26 | Dana 2.0 is the exact `prototype-v2`, and the client arm is replanned as a lift rather than a patch | RFC 0004 |
| 38 | 2026-08-26 | The folder-deletion rules, and item 36's open permission question answered: the permanent delete is the folder owner's alone, for a task as for a folder | spec 7.13, 9.11 |
| 39 | 2026-08-26 | Every element's overflow list and every element's view types are the prototype's exactly; both are contracts rather than component-local detail | spec 9 |
| 40 | 2026-08-26 | The three parity documents ratified. (d) records that six Replace units of this RFC had not reached section 12, which the later fold closed | spec 12; process |
| 41 | 2026-08-26 | Ledger L-117 corrected against measurement; the dark ramp stands; the fifty-two prototype decisions are to be folded as written | spec 9 |
| 42 | 2026-08-26 | The theme flash is real and measured here; closing it needs a mechanism this client did not have, so it was routed rather than built | spec 9.7 |
| 43 | 2026-08-26 | Close the theme flash with a write-through `localStorage` mirror read by a pre-mount script; the 4.19 column stays the record and the mirror is a cache | spec 9.1, 9.7 |
| 44 | 2026-08-26 | Fourteen rulings on the lift sheet, five reaching frozen sections 4 or 7: covers native to every page (B1); the folder board's columns are the page's sections (B2); the workflow file carries everything but due dates, people and states (B3); task drag and reorder scoped to folders (B4); voice notes deferred (B5); images resizable by the person (B7); all four cover tiers with a real provider (B8); a step promotes and a task never demotes (B9); a duplicate's tasks belong to whoever made the copy (B10); downscale on upload (B11) | spec 4.5, 4.17, 4.20, 6, 7.6, 7.7, 7.16, 7.19, 10.3 |
| 45 | 2026-08-26 | The proof screen cannot be produced in its own package, and the reason is a property of the prototype rather than a shortfall of the package | RFC 0004 |
| 46 | 2026-08-26 | Item 44's four frozen changes written as nine amendment units, with five readings item 44 did not carry recorded beside them | spec 4.5, 4.17, 4.20, 6, 7.6, 7.16, 7.19, 10.3 |
| 47 | 2026-08-26 | The task surface lift. (b) a task's Duplicate carries the title, steps, notes and attachments and never the conversation. (c) the owner column wrong a fifth time. (e) seven addressing seams the lift owed section 9, five of them invisible to a locator sweep because the disagreement was a default, a computed style or a role. (k) the drag, the hold and selection split out into their own package. (l) the proof screen not taken, on a second unmet dependency. (m) two later packages cannot run beside the shell lift, because the shell is the frame every page mounts inside | spec 7.16, 9.3; RFC 0004 |
| 48 | 2026-08-27 | The shell lift. (a) the owner column wrong a sixth time. (b) three shell mechanisms existed in two copies each, two of them broken by it. Also the `pointer-events-none` finding above | spec 9.1 |
| 49 | 2026-08-27 | The spec fold to v2: four sections still described v1; 8.8 and 5.2 contradicted 7.13 and nobody had found it; the fold debt was far larger than the row's four pieces. (k) this RFC's delta had grown since acceptance, so re-acceptance was put to the owner | spec 1, 2, 5, 8, 9 |
| 50 | 2026-08-27 | The places lift. The owner column wrong a seventh time; the cover landed with half of it unreachable; the place-page description gap is the live half of item 9 | spec 9.4, 9.5; spec 13 items 51, 53 |
| 51 | 2026-08-27 | The folder page and the conversation. The owner column wrong an eighth time; a seam built the package before that nothing ever passed, and three dead tabs that followed from it. (h) all three insert paths already assigned a duplicate to the duplicator. (n) a browser case whose assertion races a UI transition fails in isolation on every commit, so isolation cannot attribute it; now recorded in `CLAUDE.md` | spec 9.6; CLAUDE.md |
| 52 | 2026-08-30 | The systems fold: every remaining accepted unit of this RFC is written into a numbered section, each unit heading marked so nobody folds it twice | spec 4, 6, 7, 10, 11, 13 |
| 53 | 2026-08-30 | The permanent delete built and the Duplicate closed; the object collection moved out of the scheduler pass so that 7.13 and the thirty-day purge share one implementation | spec 7.13, 7.16 |
| 54 | 2026-08-30 | The task machinery: the drag over 7.6's order endpoint, the hold that makes a folder of two tasks, and selection with its bar. A dated row is refused on the client rather than sent to be refused | spec 7.6, 9.3 |
| 55 | 2026-08-30 | The remainder lift. Item 43's mirror built; item 44's import clause was a missing timezone rather than a missing parse. (f) three things the contract could not reach, drawn absent rather than dead, the first being the profile picture's Remove control | spec 7.15, 7.16, 9.7, 9.9, 9.11 |
| 56 | 2026-08-30 | The permanent-delete client half and the owner's leave-or-delete dialog; 7.13's read gains `is_owner` additively | spec 7.13, 9.11 |
| 57 | 2026-08-30 | The delegated sitting: what the tree still owed the rulings sheet. 7.14's read answers a comment's files as objects rather than bare uuids. (D) the fifty-two prototype row and card decisions folded into section 9 | spec 7.14, 9.1, 9.3, 9.5 |
| 58 | 2026-08-30 | The loose-ends row, ten open ledger lines. (C) step promotion gains an address. (E) the folder duplicate answers `shifted_days`. (H) a folder's cover gains `cover_preset` and `cover_focal_y` | spec 4.3, 7.4, 7.7, 7.16 |
| 59 | 2026-08-30 | The close and the 2.0.0 release, ruled by delegation: the local gate was the verdict, the new remote's Actions history being empty | CHANGELOG |
| 60 | 2026-08-30 | The sample workspace: a register table carrying no foreign key, so an object keeps its id through every edit and removal can still find it; written inside the provisioning transaction and removable in one act | spec 4.21, 7.1, 7.20, 9.13 |
| 61 | 2026-08-30 | Avatars by default: the picture was carried everywhere and passed almost nowhere, and underneath that 10.8's CSP was refusing every Google picture silently | spec 9.1, 10.8 |

**One note on item 4.** Spec 11.7's duty list still reads as though the tick fans events
out to notifications and names five duties. The code does the fan-out at the chokepoint,
in `app/src/server/domain/events.ts`, and `app/src/server/scheduler/pass.ts` says so at
the line where the duty used to be. The code and this item agree; that sentence in 11.7
is the one that has not caught up.
