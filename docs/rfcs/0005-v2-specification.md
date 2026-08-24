# RFC 0005: The v2 specification — navigation, day-level dates, roles, and the six systems

- **Status:** Accepted — by Imran, 2026-08-24 ("accepted, start S1"), recorded
  the same day. Provisional numbers checked against the specification at
  acceptance: sections 4.13 to 4.19, 7.12 to 7.18, 9.10 to 9.12 and criteria
  from AC-184 are unclaimed and stand. The criteria units arrive from S1 per
  the plan and complete inventory item 17.
- **Created:** 2026-08-24
- **Target release:** 2.0.0, September 2026 — a plan, not a promise; the
  infrastructure half is date-bound (database expiry 2026-09-12)
- **Spec sections touched:** 1, 2, 6, 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 10, 11.5,
  11.7, 11.13, 11.15, 12, 13; sections 4 and 7 **additively**
- **Frozen interfaces touched:** **Yes — 4 and 7, additive only** (new tables,
  new columns with defaults, new endpoint families; no existing column or
  response changes shape). Human decision required and expected: this RFC is
  the pricing session's cut list (`docs/design/v2-pricing.md`) written as
  specification.

> **Draft note on baselines — updated 2026-08-24, S0 in progress.** The RFC
> 0002 fold-debt is **resolved**: the prepared fold branch
> (`claude/rfc-0002-spec-fold`, sixteen units, the section 13 renumbering
> documented in the RFC's own Folded line) was reviewed and merged at
> `04465d1`, so section 9's baseline is now unambiguous. Units 10, 11, 12,
> 13, 14, 15, 16 and 18 below are merge-ready verbatim. Still **[STUB]**,
> being the RFC's remaining authoring work against the folded text: units
> 1–3 (the section 1/2/6 renames), 4–9 (the six section 9 rewrites), and 17
> (criteria, written red-first by RFC 0004's S1).

## Summary

Dana v2 changes what the sidebar asks (five pages plus an unpinned Done, one
question each), makes a due date a day (deferring due-time and adding nothing
to reminders, whose `time_of_day` mode already covers day-level tasks), states
who may do what to a shared folder (owners rename and delete; members leave;
everything else is any member's; arrangement is always personal), and adds six
systems the approved v2 design draws and the current product cannot store:
the event record (history, trash, notifications), object storage (covers,
images, attachments, voice, avatars), the page model (blocks, folder identity,
shelves), the conversation (comments, threads, likes), the object acts
(duplicate, workflows, addresses, ownership transfer), and the person's bundle
(preferences, pins, saved views, arrangements).

## Motivation

The design authority is the v2 register (`docs/design/v2-decisions.md`,
DES-093 to DES-225, approved through Imran's zero-findings pass of
2026-08-24) and the pricing session's record (`docs/design/v2-pricing.md`,
decisions D1–D7 ruled, the role matrix DES-225 ruled). This RFC is those
decisions written as specification text; it introduces no decision of its
own. The navigation change is its own accept line here rather than a rider on
the restyle, per the six-pages review's standing correction. The evidence for
each behavior is the running prototype (`docs/design/prototype-v2/`), which
every cited DES entry links to a screen.

## Specification delta

*Inventory first, so acceptance can see the whole shape; verbatim units
follow; [STUB] units carry full intent and are finalized against the folded
section 9 baseline before acceptance (see the Draft note).*

**Unit inventory**

1. Replace section 1.1's summary paragraph and three bullets of 1.2 — **verbatim below**
2. Replace and append glossary entries in section 2 — **verbatim below**
3. Replace five query headings in section 6 and insert one preamble paragraph — **verbatim below**
4. Replace section 9.1 global chrome — **verbatim below**
5. Replace section 9.3 task authoring — **verbatim below**
6. Replace section 9.4 Today — **verbatim below** (B3's owed sentence lands here)
7. Replace section 9.5 the views — **verbatim below**
8. Replace section 9.6 folder page — **verbatim below** (carries the DES-225 matrix)
9. Replace section 9.7 settings — **verbatim below**
9a. Replace section 9.9 search overlay; insert new sections 9.10 (shelves) and 9.11 (Trash); insert new section 7.18 (search extension) — **verbatim below**. Section 9.12 (notifications surface) is written after its half-day drawing and before acceptance — the delta's one remaining opening, tracked in Open questions.
10. Insert new sections 4.13–4.19 — the six systems' tables, **verbatim below**
11. Replace sections 4.3 and 4.5 — `deleted_at` plus the folder identity columns and the task's section assignment (expand-only) — **verbatim below**
12. Insert new sections 7.12–7.17 — the six systems' endpoint families, **verbatim below**
13. Replace section 10.3: the limits table gains the v2 rows — **verbatim below**
14. Replace section 11.7: the pass gains two duties — **verbatim below** (11.5's rules need no change; the Inbox→Desk migration is Compatibility's, executed by RFC 0004's S2)
15. Append rows to the table in section 11.13 for `prototype-v2/` and `v2-refs/` — **verbatim below**
16. Append to section 11.15 hazards: ids-never-names in stored client state; the DoneRow duplication to reunify; prototype name-keyed stores are not a storage design — **verbatim below**
17. Append to section 12: acceptance criteria for each unit above, numbered from the next free number at acceptance — **[STUB: drafted with the criteria package, RFC 0004 S1]**
18. Append to section 13: the open external facts below — **verbatim below**

### Replace the summary paragraph of section 1.1

```markdown
Dana is a collaborative to-do web application delivered as an installable PWA. A user signs in with Google and gets a set of folders; every task lives in exactly one folder, and a non-deletable default folder named Desk catches anything not filed. Folders are flat, never nested, and are the only shareable unit: sharing one grants another person full access to every task inside it, via an email invite that also creates a lasting people connection for one-tap future sharing. Scheduling is derived, never filed: a task with a due date appears on Scheduled, and Today, Assignments, Important, All, Done, Abandoned and Anytime are queries over the same rows — one page per question, each locking its own axis (RFC 0005, recording DES-152). Today mixes automatic inclusion (assigned to you, due on or before today) with manually pulled tasks, and unfinished items carry forward daily until completed or abandoned. Tasks carry notes, steps, an important flag, optional recurrence, one email reminder, and comments; folders carry an identity (icon, colour, cover, description), page blocks, and a conversation; a member arranges folders on personal shelves. Everything is manual in v2: no AI, no integrations. The goal is unchanged: a boring, correct, low-operations product that a two-person team can run.
```

### Replace three bullets of section 1.2

*The Folders, Tasks, and Pages bullets; the other bullets of 1.2 are untouched.*

```markdown
- Folders: one Desk per account plus custom folders; rename (owner); delete to Trash (owner); leave (member); icon, colour, cover and description shared by the folder; page blocks; per-member shelf placement; completion count; duplicate; save and import as a workflow file.
- Tasks: title, notes, important, due date (day-level in v2 interfaces; a stored due time is honored), recurrence (optionally end-bounded), one reminder at a time of day, steps, assignee (assignable and unassignable), comments with likes and files; three statuses (pending, completed, abandoned) with restore; delete to Trash; duplicate; a URL of its own.
- Pages: Desk, Today, Scheduled (list, board and calendar), Assignments, Important, All, and the unpinned views Done, Abandoned and Anytime, governed by the pin list; folder pages; shelf pages; Trash; global search; saved views.
```

### Replace and append glossary entries in section 2

*Each named entry replaces its current line; entries not named are untouched; the new entries append at the end of the list.*

```markdown
- **Default Folder / Desk**: the one folder per account created at signup, initial name "Desk" (accounts created before RFC 0005 had "Inbox"; the migration renames only defaults still carrying that name). Cannot be shared, deleted, or left; always exactly one member, its owner; never on a shelf.
- **Home**: the view a task belongs to by derivation: Anytime when due_date is null, Scheduled when set. Never assigned manually.
- **View**: a page that queries tasks without being their home: Today, Assignments, Important, All, Done, Abandoned. A view is pinned or unpinned per the pin list of 9.7.
- **Pull into focus**: the manual act of adding a task to the viewer's own Today, stored as a Today entry.
- **Today entry**: a row (task_id, user_id, added_on) recording a pull. Personal to one user. Stored in the table 4.7 names my_day_entries, which keeps its name; a stored identifier is not display copy.
- **Carried**: the Today group for items whose qualify date is before today; the complement is the Today group.
- **Recap**: Today's collapsed section of tasks completed today.
- **Reminder**: at most one per task: an offset before the due instant (when a stored due_time exists) or a time on the due date — the only mode v2 interfaces create — delivered by email to the assignee.
- **Shelf**: a per-user container arranging folders, stored as 4.18 plus the member's label of 4.4, held in step by the API. Private by construction: no members, no sharing.
- **Shelf page**: a shelf's own page of blocks and folder references (4.17), one per shelf, the viewer's alone.
- **Page block**: one ordered unit of a folder or shelf page: a section, a paragraph, an image, or (shelf pages only) a folder reference.
- **Event**: one recorded act (4.13): actor, verb, subject, time. The source of history, Activity, and notifications.
- **Notification**: an event fanned out to a recipient with a read state (4.14).
- **Trash**: where deleted tasks and folders wait 30 days (deleted_at), restorable by anyone with access to the object, then purged.
- **Workflow file**: an exported shape of a folder or shelf — structure and titles only, never ids, people, dates, or states — importable to create new folders.
- **Saved view**: a named, pinnable filter definition of the viewer's (4.19), serialized by ids.
- **Board**: a page's grouped columns rendered as cards; dropping a card into a column writes that column's value. Offered wherever the page has a grouping; Done's column completes.
- **Tab strip**: the client's row of open places and tasks. Working state, session-scoped, never stored server-side.
```

### Replace five query headings in section 6

*Heading lines only; every query's logic, ordering and criteria references are untouched. The v1 page name stays in parentheses because acceptance criteria and older RFCs cite these queries by their original names.*

```markdown
### Q1: Today, open list (v1: My Day)
### Q1R: Today, recap section (v1: My Day recap)
### Q2: Undated open tasks (v1: Tasks; serves Desk's grouping and the Anytime view)
### Q3: Scheduled, list mode (v1: Planned)
### Q3C: Scheduled, calendar mode (v1: Planned calendar)
```

### Insert a paragraph at the end of section 6's preamble

```markdown
Two v2 notes that touch every query above. First, rows with deleted_at set are excluded everywhere except the Trash surface of 7.13; the guard is implicit in each query rather than restated per query. Second, Assignments is not a query of its own: it is a client-side composition over the open tasks the viewer can already read, grouped by assignee with the unassigned last, which is why it appears in section 9 and not here.
```

### Insert new section 4.13 after 4.12 (events)

```markdown
### 4.13 events

One row per recorded act, written at the section 10.2 authorization
chokepoint by the mutation that passed it. Read by history surfaces and
fanned out to notifications. Retention: 90 days rolling, purged by the
section 11.7 tick.

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| actor_id | uuid | no | none | FK users(id) ON DELETE RESTRICT (users soft-delete) |
| verb | text | no | none | CHECK (verb IN ('created','renamed','edited','moved','completed','reopened','abandoned','restored','duplicated','removed','deleted','left')) |
| subject_kind | text | no | none | CHECK (subject_kind IN ('task','folder','shelf','comment')) |
| subject_id | uuid | no | none | no FK: the subject may be purged before the event |
| subject_name | text | no | none | the name at act time, so a line reads after a rename |
| folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE; the visibility scope |
| detail | text | yes | none | length up to 200; the half a verb cannot carry |
| created_at | timestamptz | no | now() | none |

Index ON (folder_id, created_at DESC) for folder activity; ON (subject_kind,
subject_id, created_at DESC) for one object's history. Visibility follows the
subject: an event is readable by whoever could read its folder scope at read
time, enforced at 10.2 like every read.
```

### Insert new section 4.14 after 4.13 (notifications)

```markdown
### 4.14 notifications

The fan-out of an event to the people it concerns: the assignee of an
assignment, the participants of a thread, the members of a deleted shared
folder. Derived rows; deleting an event does not retract its notifications.

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE; the recipient |
| event_id | uuid | no | none | FK events(id) ON DELETE CASCADE |
| read_at | timestamptz | yes | none | null is unread |
| created_at | timestamptz | no | now() | none |

Partial index ON (user_id) WHERE read_at IS NULL for the badge count. An
actor is never notified of their own act.
```

### Insert new section 4.15 after 4.14 (comments)

```markdown
### 4.15 comments

A comment on a task or on a folder's conversation. One level of replies
(INV: a parent comment has a null parent_id).

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| folder_id | uuid | no | none | FK folders(id) ON DELETE CASCADE; visibility scope |
| task_id | uuid | yes | none | FK tasks(id) ON DELETE CASCADE; null is the folder's own thread |
| parent_id | uuid | yes | none | FK comments(id) ON DELETE CASCADE; CHECK one level (parent's parent is null, enforced by the API and restated at write) |
| author_id | uuid | no | none | FK users(id) ON DELETE RESTRICT |
| body | text | yes | none | length up to 4000; null when the comment is a file or voice note alone |
| created_at | timestamptz | no | now() | none |
| edited_at | timestamptz | yes | none | none |

`comment_likes` rides beside it: (comment_id FK ON DELETE CASCADE, user_id FK
ON DELETE CASCADE, created_at), PK (comment_id, user_id). A like is the whole
reaction set (DES-146).
```

### Insert new section 4.16 after 4.15 (files)

```markdown
### 4.16 files

One row per stored object: an image on a page, a comment's attachment or
voice note, a cover upload, an avatar. Bytes live in the object store
(section 11); this table is the authority on existence, ownership and quota.

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK; also the object-store key |
| owner_id | uuid | no | none | FK users(id) ON DELETE RESTRICT; whose quota it spends |
| folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE; visibility scope; null for avatars |
| kind | text | no | none | CHECK (kind IN ('image','file','voice','cover','avatar')) |
| name | text | no | none | length 1 to 300 |
| mime | text | no | none | server-validated against the kind |
| bytes | integer | no | none | CHECK (bytes > 0); quota arithmetic |
| duration_ms | integer | yes | none | voice only |
| created_at | timestamptz | no | now() | none |

Per-user quota: 1 GB (D5, revisited with usage). Serving passes 10.2 like
every read; there are no public object URLs.
```

### Insert new section 4.17 after 4.16 (page blocks)

```markdown
### 4.17 page_blocks

The writing arranged on a folder page or a shelf page: sections, paragraphs
and images, ordered, with tasks assigned to sections by position's record.
The page is the folder's — one page for every member, any member edits, the
event log says who (pricing decision D1).

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE |
| shelf_id | uuid | yes | none | FK shelves(id) ON DELETE CASCADE; CHECK exactly one of folder_id/shelf_id |
| kind | text | no | none | CHECK (kind IN ('section','paragraph','image','folder_ref')) |
| position | integer | no | none | ordering within the page |
| text | text | yes | none | section name (1-120) or paragraph body (up to 4000) |
| file_id | uuid | yes | none | FK files(id) ON DELETE SET NULL; image kind |
| ref_folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE; folder_ref kind, shelf pages only |
| updated_at | timestamptz | no | now() | stale-write 409 per 7.0's conflict rule |

Task→section assignment is `tasks.section_block_id uuid null` (a 4.5 column
addition, expand-only). Concurrency is last-write-wins per block with the
standard 409 on a stale `updated_at`; there is no operational transform.

Folder identity rides the folder: 4.3 gains `icon text null` (server-known
key set), `color text null` (#RRGGBB), `cover_file_id uuid null FK files`,
`description text null` (up to 500) — expand-only column additions.
```

### Insert new section 4.18 after 4.17 (shelves)

```markdown
### 4.18 shelves

A person's shelf: the per-user container whose *membership* remains
`folder_members.label` (unchanged, frozen) and whose page needs a stable key
that a rename cannot move. The API holds label and shelf name in step in one
transaction; the id never changes.

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| name | text | no | none | length 1 to 40; UNIQUE (user_id, name) |
| icon | text | yes | none | server-known key set |
| color | text | yes | none | #RRGGBB |
| cover_file_id | uuid | yes | none | FK files(id) ON DELETE SET NULL |
| description | text | yes | none | length up to 500 |
| created_at | timestamptz | no | now() | none |

Shelves are private by construction (DES-195/196): no member rows, no share.
```

### Insert new section 4.19 after 4.18 (user views and the settings expansion)

```markdown
### 4.19 user_views

A saved view: a filter state given a name and a pin (DES-153's second half).
Serialized by ids, never display names.

| column | type | null | default | notes |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| name | text | no | none | length 1 to 40 |
| definition | jsonb | no | none | the filter model; zod-validated at write; ids only |
| pinned | boolean | no | false | none |
| created_at | timestamptz | no | now() | none |

`user_settings` gains (all with defaults, expand-only): row density, clock
(12/24), theme (system/light/dark), task-open surface, pinned native views
(migrating show_important/show_all/show_done in one migration — two records
of one fact are not kept), sidebar order, per-shelf/folder arrangement keys.
```

### Replace section 4.3

```markdown
### 4.3 folders

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| owner_id | uuid | no | none | FK users(id) ON DELETE RESTRICT |
| name | text | no | none | length 1 to 100 |
| is_default | boolean | no | false | none |
| icon | text | yes | none | key from the server-known icon set (RFC 0005) |
| color | text | yes | none | CHECK matches '#RRGGBB' hex pattern |
| cover_file_id | uuid | yes | none | FK files(id) ON DELETE SET NULL |
| description | text | yes | none | length up to 500 |
| deleted_at | timestamptz | yes | none | set marks Trash; purged by the 11.7 pass at 30 days |
| created_at | timestamptz | no | now() | none |

UNIQUE INDEX ON (owner_id) WHERE is_default: one Inbox per account (INV-2). ON DELETE RESTRICT on owner_id is a tripwire: the account deletion transaction must transfer or delete owned folders first; if it fails to, the database refuses rather than corrupting. Ownership is read from owner_id only; the role column below never encodes it (one source of truth).

The four identity columns are the folder's, not a member's (pricing decision D1): one look for every member, any member may change it, and the event log of 4.13 records who. A member's personal label and color on 4.4 are untouched and remain per-viewer. Reads exclude rows with deleted_at set except through the Trash surface of 7.13; every query in section 6 gains the implicit `deleted_at IS NULL` guard at fold time.
```

### Replace section 4.5

```markdown
### 4.5 tasks

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| folder_id | uuid | no | none | FK folders(id) ON DELETE CASCADE |
| title | text | no | none | length 1 to 300 |
| notes | text | yes | none | length up to 10000 |
| status | text | no | 'pending' | CHECK (status IN ('pending','completed','abandoned')) |
| important | boolean | no | false | none |
| due_date | date | yes | none | floating calendar date |
| due_time | time | yes | none | minute precision; CHECK (due_time IS NULL OR due_date IS NOT NULL); v2 interfaces do not set it (RFC 0005); existing values are honored |
| recurrence_rule | text | yes | none | RRULE subset, section 4.11; CHECK (recurrence_rule IS NULL OR due_date IS NOT NULL); length up to 200 |
| series_id | uuid | yes | none | CHECK (recurrence_rule IS NULL OR series_id IS NOT NULL) (INV-13) |
| assignee_id | uuid | yes | none | see composite FK below |
| section_block_id | uuid | yes | none | FK page_blocks(id) ON DELETE SET NULL; the section this task sits under on its folder's page (4.17); null is the loose block |
| created_by | uuid | no | none | FK users(id) ON DELETE RESTRICT (users are soft-deleted) |
| completed_at | timestamptz | yes | none | CHECK ((status = 'completed') = (completed_at IS NOT NULL)) |
| completed_by | uuid | yes | none | FK users(id); CHECK ((status = 'completed') = (completed_by IS NOT NULL)) |
| deleted_at | timestamptz | yes | none | set marks Trash; purged by the 11.7 pass at 30 days |
| created_at | timestamptz | no | now() | none |
| updated_at | timestamptz | no | now() | touched on every mutation |

Composite foreign key enforcing INV-4: FOREIGN KEY (folder_id, assignee_id) REFERENCES folder_members (folder_id, user_id) ON DELETE SET NULL (assignee_id). The column-targeted SET NULL form requires Postgres 15 or later; on older engines, drop the ON DELETE clause and unassign inside the member-removal transaction instead (section 8.8 does so anyway; the FK is belt and braces). This constraint also validates folder moves automatically: changing folder_id with a stale assignee fails at the database.

Rationale lines: series_id groups a recurrence chain for guards (INV-7) and Done-page trails; completed_by feeds the My Day recap (Q1R), makes the completion race guard natural (section 8.5), and feeds the activity log of 4.13; updated_at is the last-write-wins tiebreak evidence and the search recency key. Reads exclude rows with deleted_at set except through the Trash surface of 7.13, the same guard 4.3 states for folders; a task in a trashed folder is unreachable while its folder is, and purges with it.
```

### Replace section 10.3

```markdown
### 10.3 Input validation and limits

| Value | Limit |
| - | - |
| Task title, step title | 1 to 300 characters |
| Notes | up to 10000 characters |
| Folder name | 1 to 100 characters |
| Personal label, shelf name | 1 to 40 characters |
| Steps per task | 50 |
| Custom folders per account | 200 |
| Members per folder | 25 |
| Recurrence rule string | up to 200 characters, subset of 4.11 only |
| Reminder offset | 0 to 10080 minutes |
| Search query | 2 to 100 characters |
| Calendar range | up to 62 days |
| List responses | capped at 1000 rows with truncated flag |
| Email address | up to 320 characters, syntactically valid, stored lowercased |
| Timezone | valid IANA identifier |
| Comment body | up to 4000 characters |
| Page paragraph | up to 4000 characters |
| Page section name | 1 to 120 characters |
| Folder and shelf description | up to 500 characters |
| Blocks per page | 500 |
| One uploaded file | up to 25 MB; a voice note up to 10 minutes |
| Files per comment | 10 |
| Storage per account | 1 GB across every kind of 4.16 |
| Workflow import | up to 50 folders and 500 blocks per file; structure and titles only, never ids, people, dates or states |
| Saved views per account | 50 |

All numbers are server-enforced and returned as 422 with the field named, except the storage quota, which returns 413 with the copy of section 9.
```

### Replace section 11.7

```markdown
### 11.7 Reminder scheduler

The 8.6 delivery loop runs in-process: a 60-second interval in the server, guarded against overlapping passes, executing the poll-classify-send-mark cycle in a transaction that claims due rows with SELECT ... FOR UPDATE SKIP LOCKED. Consequences, each intended:

- A missed tick self-heals: the poll is over fire_at <= now(), so the next pass picks up anything a missed one would have sent, inside the 6-hour stale window.
- The deploy overlap window can run two instances for about ninety seconds; SKIP LOCKED makes concurrent ticks contend safely instead of double-sending. A crash between send and mark can duplicate at most one batch; 8.6 accepts duplicates.
- Tick liveness is monitored separately from process liveness (11.12), because a dead interval inside a live server is invisible to an uptime check.
- The same pass prunes expired session rows, purges Trash rows whose deleted_at is older than 30 days and events older than 90 (RFC 0005), and fans events out to notification rows — so 8.6's statement that the reminder loop is the only background execution stays true: one scheduled process, five duties. Each added duty claims its rows the way the reminder duty always has, SKIP LOCKED in its own transaction, and each is idempotent, so the missed-tick and overlap properties above hold for all five unchanged. This is also three more reasons the single-instance rule of 11.2 must be flagged before it ever changes, and none of these duties may migrate into request handlers.

The pass is a plain callable function and must stay one: if hosting ever moves somewhere without an always-on process, the replacement is an external per-minute trigger (Google Cloud Scheduler or equivalent) hitting an authenticated endpoint that runs one pass.

That callable is the acceptance suite's only way in, ratified here at the P7 mid-package change control on 2026-08-10 rather than left assumed, the way 11.10 ratified options.notifications when the same need appeared for sends. Everything else the suite reaches, it reaches over HTTP through the 11.10 seam, and frozen section 7 offers no endpoint that runs a pass, so without this the delivery criteria could not be written at all. `app/src/server/scheduler/index.ts` exports the pass as `createReminderPass(deps)` or as `runReminderPass(deps)`, either name, with deps of { dbClient, notifications } reusing 11.10's own option names for the same two things. The tolerance over the name is deliberate and costs nothing: the harness accepts both, so the choice is the implementing session's and no drift is possible in the suite. What is fixed is only what the suite must know in advance, the module path and the two dependencies, both already determined by 11.10 and by the scheduler directory this section's implementer owns; the pass's internals, its transaction shape and its return value are untouched by this and stay that session's. Two things it is not. It is not an HTTP endpoint, adding one being a change to frozen section 7 that the paragraph above contemplates only if hosting moves. And it is not a second export path for production, which composes the same callable at boot as it always did.
```

### Insert new sections 7.12–7.17 after 7.11

```markdown
### 7.12 Events and notifications

GET /api/v1/events?folder=… — a folder's activity, newest first, member-only.
GET /api/v1/events?subject=kind:id — one object's history, access via 10.2.
GET /api/v1/notifications · POST /api/v1/notifications/:id/read ·
POST /api/v1/notifications/read-all — the recipient's list and read state.
Events are never written by clients; the chokepoint writes them.

### 7.13 Trash

GET /api/v1/trash — the caller's reachable deleted tasks and folders inside
the 30-day window. POST /api/v1/tasks/:id/restore ·
POST /api/v1/folders/:id/restore — access by folder membership, not by who
deleted. DELETE of a task or folder sets deleted_at (soft); purge is the
tick's, at 30 days, permanent.

### 7.14 Comments

GET /api/v1/folders/:id/comments?task=… · POST same (body, parent_id,
file_id) · PATCH /api/v1/comments/:id · DELETE /api/v1/comments/:id (author
or folder owner) · PUT/DELETE /api/v1/comments/:id/like. Member-only
throughout; one reply level enforced.

### 7.15 Files

POST /api/v1/files (multipart; kind; folder scope; quota- and rate-limited;
images downscaled server-side) · GET /api/v1/files/:id (authenticated
serving) · DELETE /api/v1/files/:id (uploader or folder owner). Avatar: POST
/api/v1/me/avatar updates users.avatar_url to the stored object.

### 7.16 Pages, shelves and acts

GET/PUT /api/v1/folders/:id/page — the block list, LWW per block, 409 on
stale updated_at. CRUD /api/v1/shelves and GET/PUT /api/v1/shelves/:id/page.
POST /api/v1/tasks/:id/duplicate · POST /api/v1/folders/:id/duplicate — the
DES-198 copy rules server-side. POST /api/v1/workflows/import — zod-validated
structure file, caps per section 10, creates folders/sections/titles only;
never ids, people, dates or states. POST /api/v1/folders/:id/transfer-ownership
{ to: user_id } — owner-only, member target, the DES-225/8.9 flow.

### 7.17 View routes

Client routes /app/tasks/:id and /app/shelves/:id resolve by the SPA against
existing reads; the section 10.2 not-found discipline covers both. No new
server rendering.
```

### Replace section 9.1

```markdown
### 9.1 Global chrome

- Sidebar: a navigation landmark and the application's only side chrome. Header carrying the app name (links to /app), the notifications bell (9.12), and the global search control (Ctrl+K or /). Then the page block, in fixed order: Desk, Today, Scheduled, Assignments, Important, All, plus any unpinned view the pin list of 9.7 has pinned (Done, Abandoned, Anytime, and the viewer's saved views), each present only when pinned and each a link. Then the Library block; then the footer.
- Library: a collapsible block headed "Library", holding the viewer's shelves and folders as one ordered list. A shelf is a collapsible group of folder rows headed by its name; folders on no shelf follow. Each folder row carries the folder's mark (its icon in its colour, 4.3), its name, and its pending count. The order is the viewer's own, seeded alphabetically and rearranged by dragging: rows reorder, move onto and off shelves, and two folders held together create a shelf; shelf headings drag as rows too. A group being closed is never sprung open by a drag hovering it; the drop reads "Into {shelf}".
- Footer: one primary "New folder" action; then a row of three placed by role — "New shelf", "Import" (a workflow file), and "Trash", the first two acts of making and the third a destination. When the sidebar narrows, "New shelf" keeps its label and the other two drop to icons, all three named by tooltip in every state. Then People and Settings as links; then the avatar menu ("Account": Settings, Help, Sign out).
- Tab strip: a row of tabs above the window bar, session-scoped working state, never stored server-side. Every tab is the same tab: one anatomy (mark, title, close control), equal treatment, closable, and reorderable by drag. The place the viewer stands on is the active tab. "Open in a new tab" on a folder, shelf, or task appends a tab and goes to it; ordinary navigation retargets the active tab, as an address bar does. Closing the active tab lands on the neighbouring place; closing the last tab lands on Desk. A "+" at the row's end opens any shelf or folder as a tab, or begins New folder, New shelf, or Import.
- Window bar: a thin strip under the tabs belonging to the window, not the page. Its left end holds the active filter's removable chips; its right end holds the active tab's controls — the view strip, the filter control, the Activity line ("{verb} {ago}", opening the recent events of the thing shown), and the object's overflow menu. The page's title is not repeated in it; the tab already says it.
- The view strip: one control per place-page offering the views the page can honestly draw — list always; board wherever the page has a grouping (a board column captures with its own value, and dropping a card in a column writes that value); calendar only where having a date is what puts a task on the page, which is Scheduled. The chosen view is one client-side preference across pages; a page not offering the remembered view falls back to list without forgetting it. `?mode=` names a view in the URL.
- The filter: one control with the same meaning on every place-page — due presence and ranges, assignee (multi-value, "Unassigned" included), important, repeating, created-by, show-abandoned, group-by, sort, and "Save as view". Active state renders as removable chips in the window bar, never as a count alone. A filter belongs to the page and to the session: kept on return to that page, never carried to another. Grouping replaces the page's own arrangement rather than nesting inside it.
- Capture: each page has one always-visible capture point. Quick-add rows sit where a page has a natural landing place (a section, a group, a list foot); in board view every column captures and the floating button is absent; the floating "Add task" button appears only on the pages with no capture affordance of their own — Today, Important, and Assignments — and never on Done or Abandoned. Every capture creates the task with the entry defaults of 9.3 for where it stands, so a task made on a page appears on that page.
- Undo: one bar for the whole window, bottom-left, naming the act it can take back ("Deleted "{title}""), for five seconds, with Ctrl+Z or Cmd+Z as its shortcut; no redo. Acts register their own inverse; the bar is the same sentence the event log records. Undo issues the inverse mutation — no write is ever held back waiting for the window to close.
- Offline banner (global, persistent while offline): "You're offline. Dana needs a connection; changes can't be saved right now." Writes attempted offline fail with the toast "Couldn't save. You're offline."
- Global error toast for failed requests: "Something went wrong. Nothing was saved. Try again." 409 conflicts show the state machine copy of 5.1 verbatim; a stale page-block write (4.17) uses the same treatment.

Routes. The paths are derived as before: 11.1 gives the server the landing page and the built client, 10.6 fixes the installed app's start_url at /app, and the page set and order are this section's own. /app renders Desk, the account's default folder, which is where the product lands a person with nothing else asked for.

| Surface | Path |
| - | - |
| Landing (9.2) | / |
| Desk | /app |
| Today | /app/today |
| Scheduled | /app/scheduled |
| Assignments | /app/assignments |
| Important | /app/important |
| All | /app/all |
| Done | /app/done |
| Abandoned | /app/abandoned |
| Anytime | /app/anytime |
| Folder page (9.6) | /app/folders/:id |
| Shelf page (9.10) | /app/shelves/:id |
| A task (9.3) | /app/tasks/:id |
| Trash (9.11) | /app/trash |
| Settings (9.7) | /app/settings |
| People (9.8) | /app/people |

The two retired v1 paths redirect rather than 404, because bookmarks exist: /app/planned to /app/scheduled, and /app/tasks to /app. A hidden (unpinned) page still renders at its URL, as AC-095 has always required. The search overlay, Planned's old mode split, the unverified-email response and the invite gate keep their pathless rationales unchanged. /app/tasks/:id opens the task in the viewer's preferred surface over the page beneath; an inaccessible or absent id answers with the 404 copy of this section under 10.2.

Addressing. Every control this section names is reachable by its accessible role and by its normative name; the copy above is what a screen reader announces and what a test addresses. Roles, carried and amended:

| Element | Role |
| - | - |
| The sidebar | A navigation landmark |
| The page entries, and each folder and shelf row | Links |
| A task row | A list item, or a row |
| A tab in the strip | A tab, current when active |
| The task surface | A dialog when opened as one; a page when opened as a tab or by its URL |
| A toggle switch | A switch |
| A calendar day | A grid cell within a grid |
| A board column | A named region; its cards, list items or rows |

Names, the fixed strings a criterion may address; a control not named here is reached by its role in the ordinary sense:

| Control | Name |
| - | - |
| Global search control | "Search" |
| Floating add button | "Add task" |
| Inline quick-add, collapsed and expanded alike | "Add a task" |
| The strip's new-tab control | "New tab" |
| A tab's close control | "Close tab", addressed within the tab its title names |
| Every overflow menu (a row's, a folder's, a shelf's, the surface's) | "More actions" |
| The two controls of every confirmation | "Continue" and "Cancel" |
| The inline retry control | "Try again" |
| A task's completion control | "Complete task" when open, "Mark as not done" when complete |
| The footer's four actions | "New folder", "New shelf", "Import", "Trash" |
| The important star | "Important" when on, "Mark as important" when off |
| The filter control | "Filter" |
| The save-view control inside it | "Save as view" |
| The notifications bell | "Notifications", suffixed ", N unread" while any are — the badge said aloud |
| The read-all control inside it | "Mark all read" |
| A folder's member exit | "Leave folder" |
| The avatar menu | "Account" |
| The sidebar's rail control | "Collapse sidebar" / "Expand sidebar" |
| The two resize handles | "Resize sidebar" and "Resize panel" |

Regions. Every section a page's structure names is a named region; the name is the heading where this section gives one and the datum the section is generated from where it does not. Per page: the sidebar, one region per shelf named by it; Today, "Carried over", "Today", "Done today (N)"; Scheduled's list, one per ladder rung named as its heading reads; Assignments, one per person named by them, "Unassigned" last; All, its two halves' regions as their home pages define them; Done, one per day group; a folder page, one per user section named by it, plus "Completed" and "Sharing panel"; a board, one region per column named by its value; the tab strip's tabs, each addressed by its title. A collapsible section remains a named region plus a control carrying that name, whose expanded state is what open and collapsed mean.

Inline state copy, normative and unchanged from v1:

| State | Copy |
| - | - |
| A read that failed, beside the thing that failed | "Couldn't load this. Nothing was changed.", with "Try again" |
| A resource that answers 404 (10.2) | "Not found. This may have been deleted, or it may never have been yours to see." |
| A response carrying truncated (section 6's cap rule) | "This list is long, so only the first part is shown. Narrow it down to see the rest." |
| A write refused by the storage quota (10.3) | "Out of space. Delete some files in Settings, or remove attachments you no longer need." |

The inline failed-read line is the page's own words and never the global toast's; the two answer different questions, and a page showing "Nothing was saved" where nothing was being saved tells a person something false about their own data.
```

### Replace section 9.3

```markdown
### 9.3 The task (create and edit are one artifact, and the artifact is the task)

There is no task form. A task is its row, its card, and its page: the row expands in place into the card; the card is the same surface a dialog, a side panel, or a tab presents; and /app/tasks/:id is that surface as a page. Every edit commits as it is made — there is no Save control and no draft state — and the undo bar of 9.1 covers the destructive ones. Where a task opens (dialog, panel, or tab) is a client-side preference; a row offers the choice and remembers it. The side panel makes the page narrower rather than covering it. A task opened as a tab carries its own window-bar controls, and its folder and section stand at the bar's left.

The card holds, in order: the title (editable in place, required); a header strip of chips — due date, folder, assignee, reminder, repeat — each opening its picker in place; then Steps, Notes, and Attachments as blocks; then Comments (9.6's conversation rules apply); then a footer toolbar carrying the completion control, the star, and "More actions" (History, Copy link, Duplicate, Move to folder, Make this a folder, Abandon or Restore, Delete). The pickers open on the answer, not the instrument: resolved presets first, a calendar or list behind them, one shape at one width.

Field rules:

| Field | Rule |
| - | - |
| title | 1 to 300; empty commits are refused with "Give it a title" |
| due date | a day; the pickers offer no time of day (a stored due_time from v1 is displayed and clearable, never settable) |
| reminder | requires a due date; one picker, a time on that day, writing 4.8's time_of_day mode; disabled helper "Set a due date first" |
| repeat | requires a due date; preset-driven exactly as v1 (daily, weekdays, weekly on chosen days, every N days or weeks, monthly on day 1 to 28, yearly, optional "Ends on"); never a raw RRULE box; same helper |
| folder | the real folder library plus "New folder…" |
| assignee | the target folder's members plus "Invite by email", and — new in v2, closing section 13 item 28 — "Unassigned", offered last after a separator; hidden in single-member folders (INV-5) |
| steps | add, check, delete, reorder by drag or keyboard; cap notice "Limit 50 steps" |
| notes | up to 10000 |
| attachments | files and links per 4.16 and 10.3; a pasted URL becomes a link, never a fake file |

Clearing the date keeps 8.4's warning verbatim: "Clearing the date also ends the repeat and removes the reminder." Moving keeps the unassign warning: "Moving will unassign Sara; she isn't a member of Home." Deleting moves the task to Trash with the undo bar, and no confirmation: two ways back is why the question left. The completion control and the history read stay: the footer renders the task's own events from 4.13 — created, completed, and the rest — actor and viewer-local time, "Deleted user" fallback unchanged.

Entry defaults, derived from the page's own spine so a made task appears where it was made:

| Opened from | defaults |
| - | - |
| Desk, All, or the bare strip control | folder Desk, undated |
| Today | folder Desk, a Today entry (membership), dated today |
| Scheduled list | folder Desk, dated today |
| A calendar cell | folder Desk, dated that cell's day |
| Important | folder Desk, important on |
| Assignments | folder Desk, assigned to the viewer |
| A folder page, its loose block | that folder |
| A section's capture | that folder, that section |
| A board column | that column's value, whatever its axis — folder, person, day, or section |

Validation copy is v1's: "Give it a title", "Too long: limit N characters", 422 with the field named.
```

### Replace section 9.4

```markdown
### 9.4 Today

Structure: the shared page head (the page's mark, title, editable description, and the fact "N of M done"); then the Carried group (heading "Carried over"); the Today group (heading "Today"); and the recap collapsed at bottom (heading "Done today (N)").

The important-only narrowing is the window bar filter's important switch; the page's header carries no control of its own for it, because two controls for one variable forty pixels apart is how the two disagree. `?state=important` (and any link that means "Today, important only") seeds that filter rather than a page-local switch.

Row elements are the row's own (9.3), with this page's emphasis rules: a carried row keeps its "Carried over" words and drops the red — a warning true of every row in the group warns nobody; the pulled marker and its "Remove from My Day" un-pull control carry from v1 unchanged in behavior, the control reading "Remove from Today"; an unfiled task's folder chip says Desk. Abandon-from-here copy carries: "Abandon this task? It stops appearing in Today but stays everywhere else." Empty state per Q1. Error state: global toast plus inline retry.

A task row opens that task, on every page that draws one and whatever the task's status — the rule of v1's 9.4, unchanged, now through the surfaces of 9.3.
```

### Replace section 9.5

```markdown
### 9.5 Scheduled, Assignments, Important, All, and the unpinned views

- Scheduled: everything with a date. The list is Q3's order under a ladder of headings — Today, Tomorrow, the days of this week, then week and month rungs — headings being structure, not controls; a row says "Due tomorrow" about one task and a heading says "Tomorrow" about a bucket, one date vocabulary at two altitudes. The calendar keeps Q3C whole: day, week, month zooms; previous/next/today; six-week month grid, Monday start; all-day before timed; times prefix timed chips at every zoom; ghost styling and the banner "Upcoming occurrence of a repeating task"; empty cell creates with that date; "+N more" is a control opening the day. An abandoned chip at month zoom quiets to its glyph and a faded tone, the strike appearing only at day and week. Mode and zoom persist client-side; `?mode=` reaches them by URL.
- Assignments: who is carrying what — every open task the viewer can read, grouped by person, the viewer's own group first, "Unassigned" last; the "from" half of a row names the creator, Dana recording no assigner. The board groups by person; dropping a card on a person assigns them. Capture assigns the viewer.
- Important: single list per Q4; un-star removes immediately; the star's two names are 9.1's. On this one page the star rests unfilled, because a filled star on every row of the starred page distinguishes nothing.
- All: locks nothing — Q5's union rendered whole, with completed work carried in a collapsed section at the foot. Section labels are static.
- Done: unpinned by default (the pin list governs); day-grouped infinite scroll per Q6; rows drop the spent due-date echo under headings that already group by completion; "Mark as not done" with the G-SERIES successor confirmation verbatim; no capture anywhere on the page.
- Abandoned: an unpinned view of the one status with no other home; faded, struck, chip and "Restore" per the row's rules; no capture, because a task made pending would be filtered off the page it was made on.
- Anytime: an unpinned view of undated open work (Q2's rows, ungrouped).

Completing is immediate on the wire, as v1 ruled: no write is held back. What v2 adds is the undo bar of 9.1, which takes a completion back by issuing the inverse transition as a new mutation — the same "Mark as not done" a person could press on Done, offered for five seconds where they stand.
```

### Replace section 9.6

```markdown
### 9.6 Folder page

The folder page is a page in the full sense: a cover it can be given; its mark (the identity control — pressing it opens the icon-and-colour picker, writing 4.3's shared identity); its name (inline rename, owner only; members read a heading); its editable description; and its body — the loose open tasks with a quick-add, then the page's blocks (sections, paragraphs, images, per 4.17) with tasks assigned to sections, a capture per section, an insert affordance between blocks, and the Completed section collapsed at the foot. Ordering within sections and the block arrangement are the folder's, shared by every member; the filter of 9.1 narrows the page without touching its arrangement. The folder's conversation has two homes — a closed section at the page's foot, or the side panel — switched from the surface itself; a message is told apart by tone, never hue; likes are the whole reaction set.

Who may do what, the role matrix (RFC 0005, recording DES-225):

| Act | Owner | Member |
| - | - | - |
| Rename, Delete | yes | no — the name is the folder's address, and delete ends it for everybody |
| Leave | only via ownership transfer (below) | yes |
| Tasks: create, edit, complete, abandon, delete-to-Trash | yes | yes |
| The page: blocks, cover, icon, colour, description | yes | yes — the event log says who |
| History, Copy link, Duplicate, Save as workflow | yes | yes |
| Share, remove a member | per the 5.4 matrix, unchanged | per 5.4 |
| Shelf placement, sidebar arrangement, label colour | personal, always | personal, always |

A surface offers exactly the acts the viewer's role permits — Leave where Delete would be, never both — and the server refuses the rest regardless (10.2). Deleting moves the folder to Trash for every member at once, with the undo bar and no confirmation; members are notified (4.14). Leaving confirms — the way back is an invitation, not a Trash row — writes no Trash entry, offers no undo, and records "Left": "Leave Work? You lose access to it, and anything in it assigned to you becomes unassigned." An owner with other members leaves only by transferring ownership first (7.16), choosing a successor, defaulting to the longest-standing member per 8.9's order; a sole owner is offered Delete instead, 5.3's rule unchanged. Remove-a-member keeps its v1 confirmation verbatim. Each confirmation renders as one sentence, restyled never reworded.

Duplicate takes the structure and never the grants or the progress: tasks, sections, paragraphs, and section assignments copy; members, sharing, the conversation, assignees, and completion do not; spent due dates re-anchor on today and future ones keep. The copy is the duplicator's own private folder.

The sharing panel carries v1's spec unchanged: member list with joined dates and remove controls per 5.4, roster picker, email invite, pending list with Cancel and Resend ("Resent recently" inside 24 hours).

The "Label and color" dialog is retired: the folder's icon and colour are the shared identity above, set from the mark; a member's personal shelf placement is "Move to shelf" on the row; and 4.4's per-member color column is no longer written by any v2 surface (existing values are simply unused — the column is frozen and stays).
```

### Replace section 9.7

```markdown
### 9.7 Settings

Sections, each a named region:

- Views — the pin list: every view Dana has, native and saved alike, each with the page's own mark, its one-line question, and a pin switch; Desk locked with the note "Desk cannot be unpinned: it is where a task goes when you have not said where, so it has to stay reachable." Done, Abandoned and Anytime ship unpinned; there is no "Completed" entry, Done already being it.
- Appearance — the theme control (system, light, dark); row density (comfortable, compact); the clock (12-hour, 24-hour); where a task opens (dialog, panel, tab).
- Account — Google identity display; profile picture upload (7.15); detected timezone display with the note "Dana follows your device's timezone automatically"; storage used against the quota of 10.3; Sign out.
- People — a link to 9.8's screen.
- Danger zone — Delete account, unchanged from v1: two sentences of consequence, typed DELETE, then 8.10: "Folders you share will be handed to their longest-standing member. Private folders and their tasks are permanently deleted."
```

### Replace section 9.9

```markdown
### 9.9 Search overlay

Opened by the sidebar's search control or shortcut; input with 300 ms debounce; before anything is typed it offers the places — pages, folders, shelves — as rows to go to. Results group by kind: tasks (matching title, notes, and step titles), folders and shelves (name and description), and pages (matching a page's own prose — sections, paragraphs, captions). Task results keep the Pending, Abandoned, Completed subgrouping of Q8; enter opens the first result; a row opens its thing in place. Footer: "Showing matches from every folder you can access."
```

### Insert new section 9.10 after 9.9

```markdown
### 9.10 Shelves

A shelf is the folder page one level up: a per-user arrangement of folders with a page of its own — cover, mark (icon and colour), name (inline rename; renaming rewrites the member labels and re-addresses the page in one act), editable description, and blocks. Folder rows appear on the page as blocks among the writing: their presence is the membership's fact, their position the page's arrangement; a folder row under a heading folds with it; pressing one opens that folder as its own tab. An "Add folder" row offers every folder not on the shelf (never Desk) and "New folder…". The shelf's overflow carries its contract: History, Rename, Copy link, Duplicate (the page, no folders — a folder is on one shelf), Save as workflow, Delete. Deleting a shelf unlabels its folders and keeps them. A shelf offers no views and no filter: a view redraws tasks and a shelf holds folders; its list is its label, and narrowing it would be editing it. Shelves are private by construction — no link to send grants anything, no members exist (DES-195/196); the page's address is still copyable, an address not being an invitation.
```

### Insert new section 9.11 after 9.10

```markdown
### 9.11 Trash

One page listing every deleted task and folder the viewer can still reach, inside the 30-day window of 4.3/4.5, newest first, each row naming what it was, where it lived, who deleted it and when (from 4.13). Restore puts the thing back where it was as exactly one row; a restored folder returns with its membership intact. Anyone with access to the object may restore it — Trash is scoped by access, not by who deleted. The page states the rule once: "Deleted things stay here for 30 days, then they're gone for good." Empty state: "Nothing in the Trash." No capture anywhere on the page.
```

### Insert new section 9.12 after 9.11

```markdown
### 9.12 Notifications

The bell sits in the sidebar header (9.1) with a monochrome badge carrying
the unread count, capped at "9+". It opens a list of the viewer's
notifications (4.14), newest first, each row one sentence — the actor
emphasised, the act, the thing, and a relative or short time — with unread
told by tone and a dot, never by hue, and no more than the last 30 days
rendered. A notification is a pointer, not a task: pressing a row marks it
read and opens its subject — a task in the viewer's preferred surface via
its /app/tasks/:id address, a folder at its page — and carries no per-row
actions; invites never appear here, the gate of 9.8 being theirs. "Mark all
read" shows while any row is unread and is the surface's only other verb;
nothing here is deleted by hand, rows aging out with 4.13's retention. An
actor is never notified of their own act (4.14's rule, restated where a
reader will look). Empty state: "Nothing new. When someone assigns you a
task or answers you, it lands here."
```

### Insert new section 7.18 after 7.17

```markdown
### 7.18 Search extension

GET /api/v1/search gains additive result kinds beside Q8's tasks: folders and shelves (matched on name and description) and pages (matched on block text), each entry carrying its kind, id, name, and route. Task matching extends to step titles. The query contract, debounce expectations, the 2-to-100-character limit, and the 1000-row cap are unchanged; a client that ignores the new kinds sees exactly the v1 response.
```

### Append rows to the table in section 11.13

```markdown
| `docs/design/prototype-v2/` | The approved v2 design prototype (fixtures only; the v2 register and `design-contract.md`'s v2 part index it). Never imported by `app/` |
| `docs/design/v2-refs/` | The v2 reference exports, regenerated at V9 from one build; comparison references, not specifications |
```

### Append to section 11.15

```markdown
- **Stored client state serializes ids, never display names.** The v2
  prototype keys folders, shelves and people by name because fixtures have
  no ids; a port that copies that shape breaks on the first rename. Saved
  views, arrangements and orders store uuids.
- **Production carries two task rows** — `DoneRow` in `DonePage.tsx`
  duplicates `task-row.tsx` line for line. The v2 port reunifies them or
  records why not.
- **The single-instance tick now carries three jobs** — reminders,
  trash purge, notification fan-out. The second-instance flag rule of 11.2
  has three reasons now; none of the jobs may move to request handlers.
```

### Append to section 12

*Authored by S1 (the Adversarial Test Engineer package), numbered from
AC-184, the next free number at acceptance. AC-184 to AC-213 run in the API
legs; AC-214 to AC-225 run in the browser leg. The v1 criteria on leave and
transfer (AC-015 to AC-020) already assert 5.3's server rules and stay
untouched; the new criteria extend them rather than restate them.*

```markdown
- AC-184 Given any authenticated mutation that changes a task, folder, shelf, or comment, when it succeeds, then exactly one events row records it, carrying the actor, the verb, and the subject.
- AC-185 Given a folder member, when they list the folder's events, then events return newest first; given a non-member, then the 10.2 not-found shape.
- AC-186 Given an event whose subject the viewer cannot read, when they read events by subject, then the 10.2 not-found shape.
- AC-187 Given a task assigned to another member, when the assignment commits, then the assignee gains one unread notification and the actor gains none.
- AC-188 Given unread notifications, when the recipient marks one read and then all read, then read_at is set accordingly and the unread count agrees at each step.
- AC-189 Given a task, when it is deleted, then deleted_at is set, the row leaves every section 6 query, and it appears in the Trash listing of every member of its folder.
- AC-190 Given a trashed task, when a different member of its folder restores it, then the task returns exactly once with its fields intact.
- AC-191 Given a trashed folder 30 days old, when the 11.7 pass runs, then the folder and its tasks are permanently gone; given one 29 days old, then both remain.
- AC-192 Given a folder owner, when they delete the folder, then deleted_at is set and each other member gains a notification; given a non-owner member attempting the delete, then 403 and no change.
- AC-193 Given a non-owner member, when they rename the folder, then 403; when they set its icon, colour, cover, or description, then success, and every member reads the same identity.
- AC-194 Given an upload within the 10.3 caps, then a files row exists and the uploader's quota is spent; given an account at quota, then 413; given a mime that does not match the declared kind, then 422 naming the field.
- AC-195 Given a stored file in a shared folder, when a non-member requests it, then the 10.2 not-found shape; when a member requests it, then the bytes.
- AC-196 Given an avatar upload, then users.avatar_url resolves to the stored object.
- AC-197 Given a page-block write carrying a stale updated_at, then 409 with the 5.1 conflict copy; given a fresh one, then success and the last write stands for that block.
- AC-198 Given a page holding 500 blocks, when one more is added, then 422.
- AC-199 Given a task assigned to a section block, when that section is deleted, then the task survives with section_block_id null.
- AC-200 Given a folder duplicated, then the copy carries tasks, sections, paragraphs, and section assignments; carries no members, comments, assignees, or completion; re-anchors spent due dates on today and keeps future ones; and belongs to the duplicator alone.
- AC-201 Given a workflow file naming ids, members, dates, or statuses, when imported, then only structure and titles are created; given a file over the 10.3 import caps, then 422.
- AC-202 Given an owner and another member, when ownership is transferred to that member, then owner_id changes and the previous owner may leave; the default successor is the longest-standing member per 8.9.
- AC-203 Given shelves, then (user_id, name) is unique; renaming keeps the shelf's id and its page; deleting clears the member labels and keeps every folder.
- AC-204 Given a reply to a reply, then 422; comment threads hold one level.
- AC-205 Given a comment in a folder, when a non-member reads or writes its thread, then the 10.2 not-found shape; when the author or the folder owner deletes it, then success; when another member tries, then 403.
- AC-206 Given the same user liking a comment twice, then one like exists; unliking removes it.
- AC-207 Given a comment in a thread with participants, then each participant except the actor gains a notification.
- AC-208 Given the v2 settings fields written and re-read, then they round trip; given a v1 account with show_done true, when the migration runs, then Done is pinned for it.
- AC-209 Given a saved view naming an assignee by id, when that person's display name changes, then the view still matches them.
- AC-210 Given a search term matching a page paragraph, a shelf name, and a step title, then each returns under its kind; given a reader consuming only the v1 task results, then its view of the response is unchanged.
- AC-211 Given default folders named Inbox, when the migration runs, then they are named Desk; given a default the owner renamed, then its name is kept.
- AC-212 Given a task with a due date and no due time, when a reminder is set for 17:45, then the reminder stores time_of_day mode and the 11.7 pass fires it on the due date at 17:45 in the viewer's timezone.
- AC-213 Given events older than 90 days, when the 11.7 pass runs, then they are purged and newer events remain.
- AC-214 Given the sidebar, then Desk, Today, Scheduled, Assignments, Important, and All are links in that order, Done is absent until pinned, and the folder block is headed Library.
- AC-215 Given /app/planned and /app/tasks, then the browser lands on /app/scheduled and /app respectively.
- AC-216 Given a strip of two tabs, when the active one closes, then the neighbouring place shows; when the last one closes, then Desk; tabs reorder by pointer drag; the strip's plus opens a folder as a new tab beside the current one.
- AC-217 Given a folder shared with the viewer, then its menu offers Leave folder and neither Rename nor Delete folder, and its page title is not editable; given an owned folder, then the reverse.
- AC-218 Given unread notifications, then the bell's accessible name carries the count; pressing a row opens its subject and marks it read; Mark all read zeroes the badge.
- AC-219 Given the due picker, then it offers no time-of-day control; given the reminder picker on a dated task, then it offers a time on that day.
- AC-220 Given the assignee menu in a multi-member folder, then it lists that folder's members, Invite by email, and Unassigned last; choosing Unassigned clears the assignment.
- AC-221 Given a board on Today grouped by folder, when a task is captured in a column, then it lands in that column's folder and appears on Today; given board view, then no floating add button renders.
- AC-222 Given a filter set on Scheduled, when the viewer navigates away and returns, then it holds; when they visit Today, then Today's filter is independent.
- AC-223 Given a shelf page, when a folder row is pressed, then the folder opens as its own tab beside the shelf's; when Add folder places an existing folder, then it joins the page without a reload.
- AC-224 Given Trash holding a deleted folder, when Restore is pressed, then the folder returns to the sidebar exactly once with its tasks.
- AC-225 Given a completion, when Ctrl+Z is pressed within five seconds, then the task is pending again through an ordinary mutation, and the wire never held the completion back.
```

### Replace AC-093

*The entry-point defaults change again with 9.3's v2 table.*

```markdown
- AC-093 Given the capture points of 9.3's entry table, when a task is created from each, then it carries exactly that row's defaults: Desk and undated from Desk, All, or the bare control; a Today membership and today's date from Today; today's date from the Scheduled list; the cell's date from a calendar cell; important from Important; assigned to the viewer from Assignments; the folder from a folder page's loose block; the folder and section from a section's capture; and the column's value from any board column.
```

### Replace AC-094

*The dropdown's closed list gains a way out; the API half of AC-220.*

```markdown
- AC-094 Given the assignee control in a multi-member folder, then its choices are that folder's members, Invite by email, and Unassigned; given a single-member folder, then the control is hidden and the server still enforces INV-5.
```

### Replace AC-014

*Deletion splits into mark and purge (7.13, 11.7); the frozen 7.4 response and 8.8's cascades are unchanged, the cascades firing at the purge.*

```markdown
- AC-014 Given the owner deletes a custom folder, then the response carries 7.4's exact counts, the folder leaves every list and view, and it waits in Trash with its memberships, tasks of all statuses, steps, My Day entries, reminders, and pending invites held; when the 30 day window lapses and the pass runs, then the folder, all of those rows, and the folder's invites are gone, bare invites and other folders untouched.
```

### Replace AC-042

*The same split for a task; 4.9's SET NULL asymmetry now fires at the purge.*

```markdown
- AC-042 Given a task deletion, then the task leaves every list and view and waits in Trash with its steps, My Day entries, and reminder held for restore, any invite keeping its task_id; when the 30 day window lapses and the pass runs, then the row and those dependents are gone and the invite survives with task_id null.
```

### Replace AC-005 and AC-025, name only

*The Inbox becomes Desk (section 2); each criterion's logic is untouched and only the asserted name moves.*

```markdown
- AC-005 ... the default folder is named Desk ... (otherwise verbatim)
- AC-025 ... a title-only create lands in the caller's Desk ... (otherwise verbatim)
```

### Replace AC-066, the deleted-in-the-meantime arm only

*A delete now marks (7.13), so the parked task_id survives the trip to Trash and the acceptance skips the assignment because the task is trashed, not because 4.9 fired; 4.9 fires at the purge.*

```markdown
- AC-066 ... given the task was deleted before acceptance, then the invite keeps its parked task_id, the acceptance grants the folder and skips the assignment, and the task waits in Trash unassigned ... (the moved-folder arms verbatim)
```

### Append to section 13

```markdown
- The object-store provider (S3-compatible vs host disk) is a deployment
  fact to verify against the September hosting move, not a design choice;
  the files API above must not change either way.
- Whether notification email digests join the in-app list is deferred until
  real usage; the events/notifications split above supports either without
  schema change.
```

## Compatibility and migration

Expand-and-contract per 11.5, expand-only in this RFC: every new column is
nullable or defaulted; no column changes shape; no response field is removed.
Data migrations: (1) default folders still named "Inbox" rename to "Desk";
owner-renamed defaults keep their names (DES-152). (2) `user_settings`
visibility flags fold into the pinned-views value in the same migration that
adds it. (3) Existing offset-mode reminder rows keep firing wherever a
`due_time` exists; the v2 interface creates time-of-day rows only (DES-178,
DES-224).

Consequences the delta above creates, stated so none is met as a surprise:

- The retired paths redirect: /app/planned → /app/scheduled, /app/tasks →
  /app. No bookmark 404s.
- `my_day_entries` (4.7) keeps its table name while every surface says
  Today; a stored identifier is not display copy.
- `folder_members.color` stops being written by any v2 surface; the frozen
  column stays, existing values unused. The folder's colour is 4.3's.
- Section 13 item 28 closes: the assignee control offers "Unassigned"
  (DES-194), so AC-094's list is reworded by the criteria package.
- The due-time and start-date interfaces are deferred, not removed: the
  columns stay, stored values display and clear, nothing new writes them.
- Existing criteria invalidated or reworded are enumerated by the criteria
  package (RFC 0004, S1) and land as Replace units before acceptance.

## Alternatives considered

- **One RFC vs several.** The navigation was owed its own accept line
  (six-pages review); everything else here is one pricing session's one cut
  list, and splitting it would re-create the per-entry pricing that hid the
  shared substrates. One RFC, one accept, with the nav delta first among
  units so a partial acceptance could sever it cleanly if Imran wants.
- **Per-viewer folder identity** (DES-086's precedent) lost to
  folder-owned (D1): a collaboration product where every member sees a
  different page is two products; the per-member table also doubles System C.
- **CRDTs for page blocks** lost to LWW-plus-409: Dana's concurrency is two
  people occasionally, not documents-as-a-service; the spec already has the
  conflict vocabulary.
- **Real-time push for comments** lost to refetch-and-poll for 2.0 (D3):
  no new architecture, single instance intact; deferred by name, not denied.
- **A reminders redesign** lost to the existing `time_of_day` mode (BUG-1):
  the schema already answers day-level reminders; inventing a column would
  have been building a worse copy of 4.8.
- **Trash as its own table** lost to `deleted_at` columns: users already
  soft-delete this way (4.1); one pattern, and restore is an UPDATE.

## Open questions

- ~~The folded section 9 baseline~~ — resolved 2026-08-24: the fold merged
  at `04465d1` and every section-9 unit above is written against it.
- ~~The notifications surface drawing~~ — resolved 2026-08-24: drawn as
  DES-226 in the prototype (the sidebar bell), gated and probed; section
  9.12 and the bell's names-table rows are in the delta above. **The delta
  is now complete.**
- The criteria units (inventory item 17) are authored red-first by RFC
  0004's S1 and land here as Append/Replace units before acceptance — the
  one remaining opening, and it is S1's by design.

## Change control

S2 mid-package, 2026-08-24, three schema rulings recorded for the section 4
fold, the way P7's mid-package change control ratified the pass callable:

1. **comment_files exists.** 10.3 caps files per comment at 10, and 4.15's
   table text has no column that stores the binding; a join table
   (comment_id, file_id, PK pair, both FKs CASCADE) is the only shape that
   does. The 4.15 fold gains it beside comment_likes.
2. **notifications carries UNIQUE (user_id, event_id).** 11.7 requires each
   tick duty to be idempotent, and fan-out replayed after a crash must land
   on a constraint rather than double-notify. The 4.14 fold gains the line.
3. **Two more v1 criteria were invalidated than S1 enumerated.** Found
   opening S3: AC-014 and AC-042 assert the v1 hard delete that 7.13
   retires. Their Replace units are above, added 2026-08-24 with the tests
   reworked red-first, the criteria package's own discipline applied late
   rather than skipped.
4. **Fan-out is the chokepoint's, not the tick's.** AC-187 and AC-188 read
   a notification in the same breath as the mutation, and they are right
   to: a bell that lags a minute is a worse product for no gain at Dana's
   scale. The chokepoint writes the notification rows in the mutation's own
   transaction beside the event, atomic and never double-sent, and 11.7's
   five duties become four (reminders, session prune, the 30 day Trash
   purge, the 90 day event purge). The 4.14 uniqueness stays as the
   backstop it always was.
5. **S5 mid-package, 2026-08-24, three notes.** First, AC-200's date arm
   first asserted the per-date rule DES-198 rejected; corrected to the
   design record's whole-plan re-anchor (intervals kept, earliest spent
   date landing on today). Second, the leave gains an address of its own,
   DELETE /folders/:id/my-membership, an alias of 5.3's leave with the
   target fixed to the caller; the 9.6 door and AC-202 walk through it.
   Third, the 4.3 icon key is pattern-validated until S8 exports the set;
   the server stores the key opaquely, so tightening to the allowlist later
   is a validation change and not a migration.
6. **The pin fold ships with S7, not S2.** The rule that the show_* flags
   fold into the pinned-views value in the same migration that adds it is
   kept literally: that migration is S7's, landing beside the server switch
   whose acceptance line owns "one record of visibility". S2 adding the
   column would keep two records of one fact between packages, and S2
   cannot touch the v1 handlers that still bind the flags. Comments also
   carry a composite scope key, FOREIGN KEY (folder_id, task_id) REFERENCES
   tasks (folder_id, id), the assignee precedent applied: a comment's
   visibility scope cannot drift from its task's folder.

## Implementation plan

One row: RFC 0004 is this RFC's implementation plan in full — packages,
owners, order, gates, boundaries. It exists as a separate document because
the plan is a work order and this delta is a contract, and they are accepted
by different judgments.

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| — | See RFC 0004 | this RFC accepted | — | — | — |
