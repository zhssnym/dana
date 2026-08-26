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
12a. Replace the TaskCard line of section 7.0: `section_block_id` and `created_by`, both additive — **verbatim below**, added 2026-08-25 by change control item 24 on Imran's item 19 approval. **This is the only unit in this RFC that touches frozen section 7**
13a. Insert new section 10.8, response security headers — **verbatim below**, added 2026-08-25 by change control item 18
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
| Workflow import | up to 50 folders, 500 blocks and 1000 tasks per file; structure and titles only, never ids, people, dates or states |
| Saved views per account | 50 |
| JSON request body | up to 3 MB, sized above the largest legal workflow file so every cap in this table is reachable |

All numbers are server-enforced and returned as 422 with the field named, except the storage quota, which returns 413 with the copy of section 9, and the body ceiling, which the parser refuses as 400 before any field is read. The task cap and the body row were added 2026-08-25 by change control item 18: the parser's undocumented 100 kB default was refusing legal workflow files before this table's own import cap could, and was the only bound on the task array.
```

### Insert new section 10.8 after 10.7

```markdown
### 10.8 Response security headers

Every response carries Content-Security-Policy with default-src 'self' and
frame-ancestors 'none', sized to what the client actually loads and no wider,
plus Referrer-Policy: strict-origin-when-cross-origin. HSTS is the edge's,
set by the host in front of the process, never by the process itself. The
7.15 serving rules keep their own stricter per-file headers (nosniff on
everything served, attachment for kind file) and this section does not relax
them. Added 2026-08-25 by change control item 18: section 10 was silent on
response headers, the whole posture was one disabled x-powered-by, and the
upload path's safety rested on a single predicate with no second line behind
it. One acceptance criterion is owed; its number is the test persona's to
assign.
```

### Replace section 11.7

```markdown
### 11.7 Reminder scheduler

The 8.6 delivery loop runs in-process: a 60-second interval in the server, guarded against overlapping passes, executing the poll-classify-send-mark cycle in a transaction that claims due rows with SELECT ... FOR UPDATE SKIP LOCKED. Consequences, each intended:

- A missed tick self-heals: the poll is over fire_at <= now(), so the next pass picks up anything a missed one would have sent, inside the 6-hour stale window.
- The deploy overlap window can run two instances for about ninety seconds; SKIP LOCKED makes concurrent ticks contend safely instead of double-sending. A crash between send and mark can duplicate at most one batch; 8.6 accepts duplicates.
- Tick liveness is monitored separately from process liveness (11.12), because a dead interval inside a live server is invisible to an uptime check.
- The same pass prunes expired session rows, purges Trash rows whose deleted_at is older than 30 days and events older than 90 (RFC 0005), and fans events out to notification rows — so 8.6's statement that the reminder loop is the only background execution stays true: one scheduled process, five duties. The Trash purge collects the files rows its folder deletes will cascade away and removes their objects from the store after the delete commits, because those rows are the only index to the bytes and a purge that drops them without the objects grows the disk without bound (change control item 18, 2026-08-25). Each added duty claims its rows the way the reminder duty always has, SKIP LOCKED in its own transaction, and each is idempotent, so the missed-tick and overlap properties above hold for all five unchanged. This is also three more reasons the single-instance rule of 11.2 must be flagged before it ever changes, and none of these duties may migrate into request handlers.

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

### 7.17b Replace the TaskCard line of section 7.0

The two widenings Imran approved at change control item 19, written as one
unit because they land on one line. **Frozen section 7 moves only here**, and
the line below replaces the `TaskCard` bullet of 7.0 entire:

```markdown
- TaskCard: { id, title, status, important, due_date, due_time, folder: {id, name, is_default}, assignee: {id, display_name, avatar_url} or null, is_recurring: bool, steps_done: int, steps_total: int, pulled: bool (viewer has a My Day entry), pending_invite_email: string or null (from invites.task_id), section_block_id: string or null, created_by: {id, display_name, avatar_url} or null, created_at, updated_at }.
```

Three readings, so no implementing session has to guess.

**`section_block_id` rides TaskCard rather than the folder read alone**, which
is a deliberate departure from item 19's phrasing ("on the folder read") and
is flagged here rather than made quietly. The reason is the contract's own,
already ruled on this exact question: 7.0's P4 note settles a group's folder
stub as one shape across two keys because "the two keys spell one thing, so
they answer one shape". `GET /folders/:id/tasks` answers `{ scheduled:
[TaskCard], unscheduled: [TaskCard], truncated }`, so section on the folder
read *is* section on TaskCard; giving the folder read a private element shape
would put two task shapes on the wire, which is the drift 11.13 and this
role's own mandate exist to refuse. It is null for every task not placed
under a section, which is every task on every view that is not a folder page,
so no other surface changes meaning.

**`created_by` is the person stub, not an id.** It is the same
`{id, display_name, avatar_url}` object `assignee` already carries, for the
reason 7.4's note gives about the members element: a heading that names a
person needs exactly what a card's person label needs. It is null only where
the creator's account was scrubbed by 8.10, which is what "renders as Deleted
user" in that section means on the wire. TaskDetail already carries a
`created_by` and its value becomes this same stub, so the two shapes agree
rather than one being an id and the other an object.

**What this invalidates, which is a criteria change as much as an API one**,
exactly as item 19 warned. `app/src/shared/tasks.test.ts` asserts that
TaskCard carries exactly the keys 7.0 enumerates, so it goes red on this unit
by design and is the unit's own proof. Persona 11 reads that test and every
criterion asserting a TaskCard key set **before** `04-api-and-contract.md`
writes a line, and the widening is additive so no existing key moves, changes
type or changes meaning.

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

### Insert new section 9.13 after 9.12

Added at S13 on 2026-08-24, from the owner's ruling of that date; ADD-1 in
`v2-pricing.md` named the feature and no section described it, which is the
gap this unit closes.

```markdown
### 9.13 First run and the starter workflows

A person signing in for the first time arrives at Desk (9.1) holding nothing. That empty Desk is the one screen every account sees and no account keeps, and it is where the product either teaches itself or does not.

Beneath Desk's own empty state, a fresh account is offered the starter workflows: bundled workflow files (7.16) that import with one press, each a worked example of a real piece of work rather than a tour of the interface. The purpose is navigation. A person who imports one has a folder in their Library, a page with sections, and tasks reaching the views of 9.4 and 9.5, which teaches where things live by putting something in each place rather than by describing it.

**Fresh** means the account holds no folder but Desk and no task anywhere. Both facts are already in what the client read to draw the page, so the offer needs no endpoint of its own. It stops being drawn the moment either is false, which includes the moment an import lands, and it does not return: a person who imports one or dismisses it has left first run, and asking again would be the product failing to notice it had already been answered.

**Each starter is an ordinary import.** POST /api/v1/workflows/import (7.16) takes the file, through the same endpoint and the same validation a person's own exported workflow goes through. Nothing is seeded, nothing is special-cased in the server, and no row is created that a person could not have created themselves. This is why the feature costs no backend, and it is also why it cannot drift from the import: a starter that stopped importing would fail the same way any workflow file would.

**What a starter may contain is what a workflow file may contain**: a folder name, task titles, and page blocks. It follows that a starter carries no comment and no reminder, and this section does not enforce that, because 7.16's schema has no key for either and a constraint the format makes impossible needs no rule. What is recorded here is why it is right that the format forbids them, so that a later widening of the format does not take these two with it by accident.

A comment would have to be attributed to somebody. Every comment in Dana is a thing a person said (4.15), and a fabricated one on a fresh account would be the product inventing a colleague, which is a lie about the one subject a collaboration tool cannot afford to lie about. A reminder would send email about a plan the person did not make, at an hour they did not choose, most probably after they had forgotten the starter was there; the person likeliest to receive it is the one who never came back, and a starter that mails a person who has left is the worst version of this feature.

**Every starter says in its own page that it can be deleted**, as the first paragraph block of its folder, because the offer's own copy is gone the moment it is answered and the page is what the person still has.

Copy, normative:

| Element | Copy |
| - | - |
| The offer's heading | "Start with an example" |
| The offer's body | "Import a worked example to see how Dana holds a real piece of work. Nothing here is fixed: change anything, or delete it all." |
| Dismiss | "No thanks" |
| The first paragraph block of every starter folder | "This is an example, and it is yours now. Change anything you like, or delete the whole folder from its menu when you are done with it." |

The starter files themselves are the design record's, on the 9.2 ruling of the same date: this section fixes that they exist, what they may hold, and what they must say, and does not transcribe them. What they must be is worked examples of problems a person actually has, each one solved the way Dana solves it, because a starter that demonstrates the interface rather than the work teaches a person how to click and not why to return.
```

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
6. **The pin fold is a derivation, not a drop (S7, 2026-08-24).** AC-208
   settles the design: pinned_views is one nullable column, null meaning
   never chosen, and the pins derive from the three v1 flags until the
   person first writes pins, after which the column is the record for the
   v2 surface. The flags stay stored and frozen 7.2's /me/settings keeps
   them untouched, so AC-119 to AC-123 hold as written and no data
   migration runs at all. "Two records of one fact are not kept" is
   enforced by derivation: at no moment are two records authoritative for
   one reader. The v2 surface is GET and PATCH /settings, beside
   /me/settings and never instead of it.
7. **The pin fold ships with S7, not S2.** The rule that the show_* flags
   fold into the pinned-views value in the same migration that adds it is
   kept literally: that migration is S7's, landing beside the server switch
   whose acceptance line owns "one record of visibility". S2 adding the
   column would keep two records of one fact between packages, and S2
   cannot touch the v1 handlers that still bind the flags. Comments also
   carry a composite scope key, FOREIGN KEY (folder_id, task_id) REFERENCES
   tasks (folder_id, id), the assignee precedent applied: a comment's
   visibility scope cannot drift from its task's folder.
8. **Twenty v1 browser criteria were reworked onto the v2 surfaces, and
   three of them raise Replace units this role may not write (2026-08-24).**
   The rework is the package Imran ruled on that day: eighteen numbered
   criteria plus `rendered-halves` and `session-path` addressed a section 9.1
   this RFC replaced, and 46 of their cases were red at S9 for four reasons,
   all deliberate. /app/tasks and /app/planned redirect; /app is Desk;
   the capture rule inverted; the page block carries the DES-152 names. All
   46 are green against the v2 addresses, and no criterion's text was edited
   to get there, which is what the three units below exist for. Each carries
   a recommendation, as protocol section 6 requires.

   **AC-165 quotes a string 9.4 has rewritten.** Its text is "then it
   carries 'Remove from My Day'", and 9.4 now says the control reads
   "Remove from Today". Recommended Replace, name only, on the AC-005 and
   AC-025 precedent, the logic being untouched:

   ```markdown
   - AC-165 Given a Today row whose inclusion came from an entry, then it carries "Remove from Today"; given one that also qualifies automatically, then it does not, and using the control removes the row at once.
   ```

   **AC-167 names a control 9.4 deletes.** Its text is "the important-only
   toggle on My Day", and 9.4 now reads "the important-only narrowing is the
   window bar filter's important switch; the page's header carries no control
   of its own for it." What the criterion measures is Q1's closing line, that
   the narrowing is client-side over already-fetched groups and changes no
   query, and nothing else asserts it: AC-222 is about a filter belonging to
   its page and its session, not about the wire. Recommended Replace,
   repointing the criterion at the control that survived rather than retiring
   it:

   ```markdown
   - AC-167 Given the window bar filter's important switch on Today, then it filters the rows already fetched and issues no request, and turning it off restores them without one either.
   ```

   **AC-183 enumerates a confirmation 9.6 removes.** Its list of nine strings
   includes "9.6's ... delete-folder confirm", and 9.6 now reads "deleting
   moves the folder to Trash for every member at once, with the undo bar and
   no confirmation: two ways back is why the question left." Recommended
   Replace, dropping that clause and leaving the other eight strings
   verbatim; what replaced the confirm is the undo bar, which AC-225 reads:

   ```markdown
   - AC-183 ... 9.6's leave and remove-member confirms ... (otherwise verbatim)
   ```

   **All three were accepted as recommended, by Imran on 2026-08-24**, and
   section 12 now carries the amended sentences. Two of them are red on
   acceptance and that is the direction acceptance is supposed to run: the
   control AC-165 names is renamed by S10 or S11, the filter AC-167 names is
   built by S10, and each criterion now states the contract and waits for the
   code rather than the other way round. AC-183 loses one case and stays
   green. The three tests were moved onto the amended texts in the same act,
   so no criterion and its test are left disagreeing.

   **The list of twenty was three short, and the three were reworked with
   it.** Running the whole browser leg rather than the twenty named files
   found AC-091, AC-092 and AC-093 red for the same causes: AC-091 reads a
   sidebar entry called My Day, AC-092 and AC-093 open the task form from a
   floating add button on pages 9.1's v2 capture rule takes it off. S9
   enumerated the failures it had diagnosed and the enumeration was short,
   which is a counting error rather than a ruling, so the three were reworked
   under the same ruling rather than carried red through the merge. Every
   other v1 browser spec file is green, several of them through the AC-215
   redirects rather than by addressing a v2 path; that is a tidiness debt and
   not a defect, and it is named here so the session that clears it knows the
   list is `grep -l "routes\." app/tests/e2e/*.spec.ts`.

   **AC-093's replacement text is four assertions wider than its surfaces.**
   Its v2 row set is nine and six are asserted; All's undated capture waits
   for S10 to redraw that page's two halves and rename the region it sits in,
   Assignments and any board column wait for S10's place pages, a section's
   capture waits for S12's page blocks, and Today's row asks for a Today
   membership the shell deliberately does not write. AC-221 already reads the
   board column and the Today membership against the sharper case. What is
   left owing is All's arm to S10 and the section capture to S12, recorded
   here as well as in the file because a coverage gap that lives only in a
   comment is a gap the next session does not know it inherited.

   Two adjacent notes, so that a later reader does not take them for
   oversights. AC-162 needs no unit: its text quantifies rather than
   enumerates, "each destructive action section 9 puts a confirm on", so the
   two confirmations v2 removes leave that criterion by its own words when
   S11 and S12 land the surfaces, and its file records that. And AC-094's
   Replace unit above is asserted by AC-220 rather than by AC-094's own
   browser test, which stays on the v1 form until S11 lands the v2 assignee
   menu; that split is S1's and is recorded in AC-220's file.

9. **S10, the place pages, 2026-08-25: nine rulings, two of them silences in
   this RFC's own text and one an escalation against frozen section 7.**

   **The filter carries eight of its nine axes, and created-by is an
   escalation.** 9.1 lists "created-by" among the filter's variables and 9.5
   gives an Assignments row a "from" half naming the creator. Neither can be
   drawn: a filter and a row both run over frozen 7.0's `TaskCard`, which has
   no `created_by`, the field being TaskDetail's. The two ways to have it are
   both refused here rather than taken quietly. Widening TaskCard is a change
   to a frozen interface, which protocol section 3 makes the owner's decision
   and not a package's. Reading a detail per row is a request per row on a
   page that fetched one, at every scroll. So the axis is absent and the
   "from" half is absent, and this is the record of it. Recommended, if it is
   wanted: add `created_by` to TaskCard as an additive field, the way this RFC
   already adds columns and endpoints additively, at which point both surfaces
   are a few lines each. Nothing asserts either today.

   **A saved view opens at its place-page carrying its id, not at a path of
   its own.** 9.1's routes table has sixteen rows and none of them is a saved
   view, while the same section's page block ends with "any unpinned view the
   pin list of 9.7 has pinned ... and the viewer's saved views, each present
   only when pinned and each a link". A link needs an address. DES-153 decides
   which one: "a view is one object with four parts, a name; a spine, the one
   axis it locks; defaults for every other axis; and a mode", and "every
   native page of DES-152 is an instance of it, and so is a view somebody
   saves for themselves. Nothing is special-cased." A saved view made on
   Scheduled is therefore Scheduled with a filter, and its address is
   Scheduled's carrying the filter: `/app/scheduled?view=<id>`. The rejected
   alternative is a route of its own, which would have made a view a
   seventeenth kind of surface rather than a view of a page, and would have
   put a row in a table this RFC wrote deliberately closed. The query
   parameter joins `?mode=` and `?state=important`, which that section already
   uses for exactly this: a link that seeds a page's client state.

   **A saved view is pinned when it is saved, until 9.7's pin list exists.**
   DES-153 makes saving and pinning two choices, and the surface the second
   belongs to is the v2 Settings pin list, "every view Dana has, native and
   saved alike, each with a pin switch". That page is still v1's three
   booleans: RFC 0004 gives the Settings rewrite to no package, and S10's row
   is the place pages. A view saved unpinned would therefore have no address a
   person could reach, which is DES-189 exactly, "a setting with no way in is a
   setting nobody has". So "Save as view" writes `pinned: true` and the view
   appears in the page block at once; the pin list takes it out again the day
   that page is written, and no data moves when it does.

   **Assignments and Abandoned gained an empty state each, and they are the
   only copy S10 wrote.** Section 6 gives every query an empty state and
   section 9 writes none for these two, because neither is a query: this RFC's
   own preamble insert says so of Assignments in terms, and Abandoned is a
   client-side narrowing of Q5 by status. A page that arrives empty with
   nothing to say is the one state the other eight all have words for, so two
   strings were written in the register of those eight, what the page holds
   and then how something gets here:

   ```
   Assignments: Nothing assigned yet. Open tasks appear here under whoever is carrying them.
   Abandoned:   Nothing abandoned. Tasks you decide not to do wait here in case you change your mind.
   ```

   They live in `app/src/client/pages/empty-states.ts` beside the eight
   transcribed ones and are marked there as not being section 6's. They fold
   into section 9 with the rest of this delta.

   **The board's drop is S11's, and Done offers no board until S11.** 9.1
   gives a board column a drop that writes the column's value. RFC 0004
   assigns every drag engine to S11 with the sentence that decided the sidebar
   drag on 2026-08-24: one drag engine total. Building a second one here is
   the shape that move exists to prevent, so the board captures and does not
   yet receive a drop; nothing asserts the drop, AC-221 reading the capture.
   Done is list-only for the neighbouring reason: it draws `DoneRow` where
   every other page draws `TaskRow`, which 11.15 records as the duplication to
   reunify and RFC 0004 assigns to S11 as "one task-row implementation total".
   A board here would have to pick one of the two now, on a package that owns
   neither, and whichever it picked is the copy S11 then unpicks.

   **A place-page has no cover and no editable description, and both are
   storage rather than drawing.** DES-141 makes a cover native to every place
   and DES-149 puts it in the head every page shares; 9.4 writes Today's head
   as "the page's mark, title, editable description, and the fact 'N of M
   done'". Nothing stores either for a native view: 4.3's identity columns
   belong to a folder, 4.17's blocks belong to a folder or a shelf, and a
   query has no row of its own to hang a cover or a description on. The head
   therefore draws the mark, the title, the fact where a page has one, and the
   page's DES-152 question as its prose line. What is missing is a table, not
   a component, and it is named here so the session that adds one knows the
   head is waiting for it rather than that the head forgot.

   **All keeps Q2's grouping and Anytime does not, and the two sentences are
   about two surfaces.** 9.5 writes Anytime as "Q2's rows, ungrouped"; section
   6's Q5, which this RFC does not touch, writes All's second half as "'Tasks'
   rendered exactly as Q2 groups it. No third scheme exists." Each is followed
   where it is the authority: the Anytime page is one list, All's undated half
   keeps the default-folder block over folder-headed groups. A person who
   wants Anytime in folders asks the filter for it, which is DES-156's whole
   argument. The two halves are renamed with their home pages, "Scheduled" and
   "Anytime", which is what 9.1's regions table asks for ("its two halves'
   regions as their home pages define them") and what AC-093's All arm was
   waiting on.

   **All has one capture point and it is the undated one.** v1's All carried a
   quick-add in each half. 9.1 gives a page "one always-visible capture point"
   and 9.3's entry table gives All one row, "Desk, All, or the bare strip
   control: folder Desk, undated". The dated half's quick-add is therefore
   gone rather than kept for symmetry; AC-096 still reads the floating
   button's absence on All, which the surviving capture is what earns.

   **The filter panel commits and closes on every axis but the assignee.**
   Section 9 fixes the control's name, its axes and its readout and says
   nothing about whether its surface stays open. Choosing a due range, a
   grouping, a sort, or one of the three switches is one answer to one
   question, so it is written and the panel closes the way a select does, and
   the chips in the window bar are what say it happened, which is DES-156's
   readout argument. The assignee axis stays open because it is the one that
   takes several values, "Sara *and* Hassan", and closing after each would
   make a multi-value axis single-value in practice.

   **AC-093's All arm was written by S10 and the boundary is flagged.**
   Protocol section 8 gives the acceptance tests to persona 11. Imran's
   instruction of 2026-08-25 was to close All's owed row with the surface that
   makes it assertable, and the case is in `ac-093-entry-point-defaults.spec.ts`
   with a paragraph naming its author, on the precedent of the browser half of
   S1, which was written under persona 11 on his instruction and flagged
   rather than crossed silently. AC-165 and AC-219 were left alone on the
   other side of the same line: both are S11's by RFC 0004's row, the first
   naming a string that lives in the row's copy module and the second the v2
   pickers, and this package renamed neither.

10. **Section 9.2 stops carrying the landing's copy (S13, 2026-08-24, the
    owner's ruling).** This RFC replaced 9.1 and 9.3 to 9.9 and left 9.2
    alone, so the landing section still fixed seven marketing strings in a
    table, named My Day as where a first run lands, and fixed a preview panel
    beside the copy. All three are false against the landing the Codex lane
    built and the owner directed. The owner ruled that the specification is a
    rulebook and not a transcript: 9.2 now states the rules copy is written
    under, the design record holds the sentences, and one string stays
    normative there because it discloses what Dana takes rather than claiming
    what Dana does. The amendment is written into `docs/spec/09-ui.md`
    directly rather than as a unit here, this RFC never having owned that
    section, and section 13 item 14 closes a third time against it.

    **One rule is new rather than moved**, and it is the reason the ruling
    was worth making: the page may claim no capability Dana does not ship.
    The standing text carried a no-AI-claim rule, which is that rule's
    instance for the one capability anybody was tempted to claim in 2026;
    stating the general form means the next temptation is covered before it
    has a name. AC-159 asserts the instance and is untouched, so nothing
    about the protection depends on this paragraph being read.

11. **ADD-1 gains a section, and its two exclusions gain reasons (S13,
    2026-08-24, the owner's ruling).** `v2-pricing.md` named onboarding
    starter workflows and nothing described them, so the package had no
    contract to be done against; the unit above inserts 9.13. The owner
    ruled the feature's purpose is teaching a new person where things live,
    that the examples must solve real problems rather than tour the
    interface, and that a person must be told they can delete them.

    He also ruled out comments and reminders in starters, and the finding
    worth recording is that **7.16's schema already makes both impossible**:
    a workflow file carries folder names, task titles and page blocks, and
    has no key for either. So no rule was added and no validation was
    written. 9.13 records the product reasons instead, because a constraint
    that holds only by accident of a format is a constraint a later widening
    of that format removes without anyone deciding to.
12. **S12's owner cell read against the persona files it repeats (Imran,
   2026-08-24, ruled at S12's opening).** RFC 0004's table assigns S12 and
   S11 to `09-complex-interaction.md`, whose Owns section holds exactly the
   calendar, task-form and search directories; every surface S12 builds (the
   9.6 folder page, 9.10's shelves, the conversation, 9.12's bell) sits in
   `07-frontend-architect.md`'s claim, which names the page assembly of 9.4
   to 9.8 and the residue of `app/src/client/**`. RFC 0004's own sentence
   decides it: the persona files are the authority on ownership and the
   table repeats their claims. So the repeat is corrected rather than the
   source: S12 runs under persona 07, no persona file is edited, and S11,
   which carries the same mismatch for the task components, takes the same
   answer when it opens. Options weighed and rejected: widening persona
   09's Owns (rewrites two permanent files for one release) and splitting
   the package (cuts the folder page from its own conversation).

13. **AC-226 was claimed twice, and S13's claim keeps the number (Imran,
    2026-08-24, ruled at S12's opening).** The S9 close moved the sidebar
    drag to S11 and wrote that S11 owes AC-226; `s13-public`, unmerged and
    invisible to that session, had already spent AC-226 on the starter
    workflows, in section 12's text and in a built test. Two sessions
    reached for the next free number in parallel and drew the same one.
    S13's criterion is written and asserted, S11's is a debt with no text
    yet, so S13 keeps AC-226 and S11's sidebar-drag criterion is AC-227.
    The SESSION-LOG row that says "S11 owes AC-226" stays as written, the
    record being what happened; this item is the correction it points to.

14. **Four v1 browser cases address a folder's overflow menu where 9.1 no
    longer puts it, and one of them asserts a dialog 9.6 retires (S12,
    2026-08-25; raised, not decided here).** The same shape as item 8 and
    found the same way, by running the whole leg rather than the four
    criteria this package owns. 9.1's replacement puts "the object's
    overflow menu" at the window bar's right end, and the v2 folder page
    renders it there; `regionOf(page, 'Folder header')` therefore finds no
    menu, and four cases fail against a surface that satisfies the section
    they cite. None is a defect in S12's code and none was edited to get
    green, protocol section 8 putting acceptance tests with persona 11.

    Three want a locator and no new sentence: AC-162's folder-counts and
    leave-confirm cases, and AC-183's leave-confirm case. Recommended
    correction, the S9 precedent of a locator fixed inside a criterion whose
    text is untouched: reach the menu by its name, "More actions", without
    scoping it to the folder header, since 9.1 gives the string to the
    active tab's object menu wherever the bar draws it.

    The fourth is a criterion text that v2 makes false. AC-181's second case
    asserts 9.6's "Label and color" dialog, and 9.6 now reads "The 'Label
    and color' dialog is retired: the folder's icon and colour are the
    shared identity above, set from the mark". Recommended Replace, keeping
    the first half of the criterion, which 9.1's "New folder" action still
    earns, and retiring the second with the dialog it names:

    ```markdown
    - AC-181 Given the "New folder" action of 9.1, then it opens a dialog taking a name and creating the folder.
    ```

    A fifth case is adjacent and needs nothing: AC-162's folder-delete
    confirm fails because 9.6 replaced that confirm with the undo bar, which
    is the removal AC-162's own file already anticipates in terms, under
    that criterion's own quantifier. It goes when persona 11 next opens the
    file, and AC-225 is what reads what replaced it.

    **Accepted as recommended, by Imran on 2026-08-25**, and section 12 now
    carries the amended AC-181, its "Label and color" case deleted with the
    dialog it asserted and its "New folder" case untouched. The rework found
    this item's own enumeration one case wide, corrected here the way item 8
    corrects its list of twenty: the "folder-counts" case and the
    folder-delete confirm are one test, the case whose confirm carries the
    three counts, so there was no fifth case. The locator corrections were
    therefore two rather than three, the two leave-confirm cases, each
    reaching the menu the way AC-217 already does, by role and name inside
    the main landmark, with neither criterion's sentence moving; and the one
    counts-and-delete case was removed under AC-162's quantifier as its file
    had anticipated, a locator fixed inside a deleted case being nothing.

15. **9.3's v2 reunion is larger than its pickers, and seven criteria stand
    between the two (S11, 2026-08-25; raised, not decided here).** 9.3 opens
    "There is no task form. A task is its row, its card, and its page: the
    row expands in place into the card", and adds that "every edit commits
    as it is made, there is no Save control and no draft state". S11 has
    built the half that can be built without touching a criterion: the card
    now carries 9.3's header strip of chips with a picker behind each, the
    chips commit as they are answered on an existing task, and AC-219 and
    AC-220 are green on them.

    What it has not done is retire the v1 form beneath the strip, and the
    reason is not schedule. Seven criteria address that form by 9.3's v1
    apparatus, its "More options" expander and its ten labelled field names:
    AC-092, AC-093, AC-094, AC-161, AC-169, AC-170 and AC-179. All seven
    pass today. Three harness helpers address it the same way and would move
    with them: `formField`, which resolves a field by its label;
    `setOfferedReminder` and `clearOfferedReminder`, which dispatch on
    whether that control is an input or a select; and `waitForSaveToSettle`,
    which sequences a read behind the form *closing*, an event a surface
    with no Save control never has. Protocol section 8 does not let the
    implementing role edit any of them so its code passes, and a session
    that rewrote the surface anyway would turn seven green criteria red with
    no authority to make them green again, which is the false green point 4
    of the definition of done exists to forbid.

    So the strip sits above the fields rather than in place of them, and the
    interim is recorded in `components/task-card/chips.tsx` and in section
    13 rather than left to be found. Its one visible cost is that five
    fields have two controls on one surface; they share one state and one
    write path, so they cannot disagree about what the surface holds, and
    the chips are deliberately named so that they are not the ten names 9.3
    makes normative and `formField` still resolves one control per field.

    **Recommendation: the reunion is its own package, sequenced criteria
    first.** Persona 11 reworks the seven criteria and the four helpers onto
    the v2 card, red, in their own commits; the implementing session then
    retires the fields, the expander and the Save control together. Splitting
    it the other way round is what this session declined to do.

16. **9.4's abandon confirm was rewritten by v2 and two criteria still
    assert the v1 string (S11, 2026-08-25; raised, not decided here).**
    Exactly item 8's shape, found the same way and missed by that item's
    enumeration. v1's 9.4 wrote "Abandon this task? It stops appearing in My
    Day but stays everywhere else"; the v2 replacement carries the sentence
    with the page's new name, "It stops appearing in Today". AC-162's
    abandon case and AC-183's abandon case both assert the v1 spelling
    through the harness's `copy.abandonConfirm`, and both pass, so the code,
    the harness and the two criteria agree with each other and all four
    disagree with the section. That is the one arrangement item 8's own
    closing sentence names as the worst available.

    S11 renamed the un-pull control in the same file at the same time,
    because item 8 had already amended AC-165 to quote the new string and
    the criterion was red waiting for it. It did not touch this one, because
    nothing has amended these two and an implementation that changes a
    string two green criteria assert is an implementation grading its own
    homework.

    **Recommended Replace, neither criterion's structure moving and only the
    quoted string changing**, with the harness constant following it:

    ```markdown
    - AC-162 ... "Abandon this task? It stops appearing in Today but stays everywhere else." ... (otherwise verbatim)
    - AC-183 ... the same sentence, as 9.4 now writes it ... (otherwise verbatim)
    ```

17. **Two acceptance files moved at S11 under persona 11, and both are
    recorded rather than assumed (S11, 2026-08-25).** AC-228 is new: 9.1's
    view strip sentence has two halves and AC-221 asserted one, so the
    board's drop was buildable and unmeasured, which the S10 session
    recorded in its own header. It is authored red on the tree before the
    implementation that greens it, numbered from the next free number, and
    section 12 carries its text and its reasoning.

    AC-219's day-grid locator is corrected with the criterion's sentence
    unmoved, on the S9 precedent and on item 14's reading. It read
    `picker.getByRole('grid').or(picker.getByRole('gridcell').first())`,
    which binds `.first()` to one side of the `or`, so a picker carrying a
    grid *and* gridcell children matches twice and the assertion dies of
    strict mode. Every conformant day grid carries both, that being what the
    two roles are for, so the locator could only ever have passed against a
    picker missing one of them. The `.first()` moves outside the `or`.

18. **S14's steward clause: the security review's seven findings ruled on,
    its record ratified, and the amendments applied (Integration Steward,
    2026-08-25).** The review is
    `docs/security/2026-08-25-s14-uploads-import-links.md`, written by
    persona 06 against `48183c8` and merged with this item; its home is
    ratified as `docs/security/`, dated in the filename so a second review
    appends rather than overwrites, and RFC 0004's S14 row now points at it,
    which makes the record reachable from a protocol section 2 state source
    rather than by luck. Dispositions, one per finding:

    F-1, account deletion left the person's files and avatar readable:
    accepted at moderate. 8.10 gains step 6a naming the files cleanup, the
    amendment applied to `docs/spec/08-business-logic.md` directly because
    8.10 has no Replace unit in this RFC and section 8 is not frozen. The
    implementation is two routed legs, the transaction's step to
    `03-collaboration-and-permissions.md` and the store removals to
    `10-platform.md`.

    F-2, hard-deleting a folder orphans its bytes: accepted at moderate. The
    11.7 unit's purge sentence now requires the purge to collect the files
    rows its cascades drop and remove their objects after commit; 8.10's
    step 6a covers the account-deletion path. Routed with F-1's legs, the
    purge to `10-platform.md`.

    F-3, the boot guard accepts the dev-login door a production build does
    not have: accepted at low, no spec change needed, the guard's own
    comment already states the intent it misses. Routed to `10-platform.md`
    with the reviewer's second option recommended: require the Google trio
    whenever NODE_ENV is production.

    F-4, no response security headers: ruled a real gap, resolved by
    decision rather than silence. New section 10.8 inserted (unit 13a) with
    the reviewer's recommended set; the middleware is `10-platform.md`'s to
    wire. The criterion it owes is the test persona's to number.

    F-5 and F-6, the unreachable import cap and the uncapped task array:
    ruled together as the reviewer asked, taking the first option. The 10.3
    unit's import row gains a 1000-task cap, the table gains a 3 MB JSON
    body row sized above the largest legal workflow file, and the closing
    sentence now records the parser's 400 as the body ceiling's honest
    answer. The `express.json` limit is `10-platform.md`'s (`index.ts`), the
    schema's `.max()` is `04-api-and-contract.md`'s.

    F-7, uploads buffer before judging quota: accepted as an observation.
    An upload-specific limiter is agreed, the limiter module being persona
    06's own and the wiring `10-platform.md`'s, and it is deferred to 2.0.x
    rather than gating the release, the worst case being bounded and
    already refused at 413. The sharp `limitInputPixels` note is asked of
    `10-platform.md` as a comment beside the call.

    The eight proposed criteria go to `11-adversarial-test.md` with the
    numbering confirmed against the merged tree at this item's writing:
    AC-229 is the highest in section 12 and `app/tests/`, S11's remainder
    having merged, so the eight take AC-230 to AC-237 as proposed, plus
    10.8's owed criterion at that persona's discretion. AC-236, the
    structural sweep, is endorsed hardest here for the reviewer's own
    reason: it is the one that makes the next review's route sweep
    unnecessary.

    The steward's release ruling, subject to Imran's veto because it adds a
    fix package RFC 0004's table does not name: F-1, F-2, F-3, F-4 and
    F-5's one-line body limit are release-gating and land as one fix
    session before S14's gate runs, with the new criteria red-first ahead
    of it; F-6's schema `.max()` rides the same session; F-7's limiter does
    not gate. Three items stay Imran's alone and are not closed here: the
    GOOGLE_CLIENT_SECRET rotation (`bf90c0a` is still in published
    history), and the two frozen section 7 widenings the S10 session
    escalated, `created_by` on TaskCard and `section_block_id` on the
    folder read.

    **F-8, found by running rather than reading, and not part of the review's
    clause.** A signed-out visit to `/app` renders the whole shell and then
    fails every read, showing "Couldn't load this. Nothing was changed." over
    an empty Library with an unnamed avatar, plus a "Something went wrong"
    toast. Verified at this session against the running dev server: the API
    is healthy and answers `401 unauthenticated` to each read, exactly as
    frozen 7.0 says it should, so the fault is entirely on the client side.
    `AppShell` calls `useMe()` ([app-shell.tsx:245](app/src/client/shell/app-shell.tsx:245))
    and never branches on its failure, and no redirect to `/` exists anywhere
    in `Router.tsx` or the shell. Nothing in section 9 states what the client
    does when it holds no session, which is why no persona deviated: this is a
    silence, not a defect against a written rule, and it reaches the Steward
    under protocol section 6 the same way F-4 did.

    It matters because 10.1 gives sessions 30 days, so **every account meets
    this screen eventually**, and what it says to the person is that Dana
    broke rather than that their session ended. A bookmark, a shared link or
    a second browser reaches it on the first click. AC-174 asserts that the
    avatar menu offers Sign out and nothing asserts what happens afterwards,
    so the suite is silent here too.

    **Ruling: an unauthenticated read at any `/app` route sends the person to
    `/` rather than rendering the shell, and section 9.1 gains the sentence
    saying so** when the fold writes it; the landing already refuses to
    redirect signed-in visitors away, so the two rules meet without
    contradiction. Routed to `07-frontend-architect.md`, whose S9 built the
    shell and the router, with one criterion owed by
    `11-adversarial-test.md` beside AC-230 to AC-237. **Release-gating**, on
    the same footing as F-1 and F-4: it is the first screen a lapsed session
    sees. It rides the fix package item 18 already names.

19. **Imran's rulings on S11's two open items and on what 2.0.0 must be
    (2026-08-25, at S11's close).** Four answers, transcribed as given and
    each with what it settles.

    **2.0.0 ships only when the client matches the v2 prototype we designed
    and built.** This settles item 15 and settles more than item 15. The card
    reunion is no longer a question of whether but of when: 9.3's v2 opening,
    "There is no task form", is a release gate rather than a preference, so
    the chip strip standing above a surviving v1 form is a defect to close
    before release and not an interim to ship. Section 13 item 40, which
    recorded that interim and its cost, is now a defect record with a
    deadline rather than an accepted trade. The recommendation item 15
    carries stands and is unaffected by the ruling: persona 11 reworks the
    seven criteria and the four harness helpers onto the v2 card, red, in
    their own commits, and the implementing session then retires the fields,
    the expander and the Save control together. What the ruling adds is that
    this package is not optional and blocks S14's release clause.

    One thing this must not be read as overturning, because the two sit
    close: 11.13's rule that section 9 always wins over any design artifact
    on structure and copy is unchanged. RFC 0002 already makes the prototype
    the source the client is built from rather than a reference it is
    compared against, "so a difference between it and `app/src/client` is a
    defect in the port unless a numbered section says otherwise", and that
    exception clause is the whole of the reconciliation. Parity with the
    prototype is the release gate; a numbered section still wins where the
    two disagree, and such a disagreement is an escalation as it has always
    been.

    **"My Day" is replaced with "Today".** Item 16 accepted as recommended.
    9.4's abandon confirm reads "Abandon this task? It stops appearing in
    Today but stays everywhere else", `ABANDON_CONFIRM` in
    `components/ui/copy.ts` follows it, and AC-162's and AC-183's abandon
    cases take the new string with the harness constant beside them. The
    criteria move under persona 11 and neither one's structure changes; only
    the quoted sentence does, which is item 8's shape exactly. Whoever takes
    it should sweep for the same word elsewhere rather than fixing the one
    string this item found: the constant's own name and 7.8's endpoint path
    both still say my-day, and the endpoint is frozen section 7 and stays.

    **The frozen section 7 surface may be widened, and tasks are to be drawn
    into a folder's sections.** This answers the two widenings the S10
    session escalated and item 18 left with the owner. `section_block_id` on
    the folder read is approved, which is what unblocks the placement S12
    could not build: Q7 answers 7.0 TaskCards, those carry no section, so
    nothing could draw a task under the section it belongs to and AC-093's
    section-capture arm has been owed since. `created_by` on TaskCard is
    approved on the same ruling. Neither is done by this ruling. Section 7 is
    frozen, so each needs a Replace unit written and accepted before any code
    moves, and the criteria that assert the current shapes need reading first
    for the same reason item 8 and item 14 existed: a widening that
    invalidates a green criterion is a criteria change as much as an API
    change. Routed to the Integration Steward to author the units, with
    `04-api-and-contract.md` implementing and persona 11 taking the criteria.

    **The visual review is Imran's and he will do it before release.** S14's
    acceptance clause and section 13 item 33's revisit trigger are both
    answered: the review happens rather than being waived, so the recorded
    line will name him, the date, the pages and the verdict.

    **The `GOOGLE_CLIENT_SECRET` rotation stays open and stays his.**
    Deferred deliberately at this close rather than forgotten: `bf90c0a`
    carries the secret in published history and untracking the file did not
    remove it, so the rotation is a new secret in Google Cloud and nothing
    less. It gates nothing in the build and should not wait for the release.

20. **No artifact ever named `prototype-v2/`, which is why the v2 row was
    never ported (Integration Steward, 2026-08-25, on the S14 session's
    escalation).** Item 19 makes parity with the v2 prototype the release
    gate. It binds no build session's source, because the artifact table
    that does bind them, 11.13, still named `docs/design/prototype/`, the v1
    prototype of thirteen screens, as "the source the client is built from",
    and no numbered section anywhere named `docs/design/prototype-v2/` at
    all. Every session that read the rulebook correctly was pointed at v1.

    **Verified rather than accepted, this role's own rule.** All four claims
    were reproduced against the tree at `3bb6500` before any amendment:
    `docs/design/prototype-v2/src/screens/` holds 23 screens; `grep -rl
    prototype-v2 docs/spec/` returns nothing; 11.13's `prototype/` row reads
    as quoted; `docs/spec/09-ui.md` still says "My Day" thirteen times,
    RFC 0005's section 9 units never having been folded.

    **The measured consequence is the task row.**
    `app/src/client/components/task-row.tsx` is 609 lines and its own header
    says it is "the designer's `src/components/task-row.tsx`, ported at P8R
    session R3", which is the v1 file.
    `docs/design/prototype-v2/src/components/task-row.tsx` is 2867 lines and
    its header says it "replaced the v1 row on 2026-08-18". It was never
    ported by anybody. Three checks say so independently rather than by
    reading headers: `density` appears nowhere in `app/src/client`, so
    DES-113's two densities do not exist; the app's `components/task-card/`
    holds only `chips.tsx` and `copy.ts`, S11's 9.3 chip strip, so DES-093's
    expand-in-place card does not exist; and `components/task-form` still
    exists, which the v2 prototype deliberately has none of. S11 built the
    v2 chip strip and pickers onto the v1 row, correctly by the rulebook it
    was given, which is precisely the defect: the rulebook was wrong.

    **Three amendments, all inside this role's authority, none touching a
    frozen section.** First, 11.13's table gains a `prototype-v2/` row
    naming it the v2 client's source and carrying RFC 0002's sentence
    forward, and the `prototype/` row is marked superseded for appearance
    while staying the record of v1; item 19's gate is now a gate on a named
    directory. Second, `screen-registry.csv`'s `implementation_status`
    column is declared non-authoritative and must not be read as state: all
    31 rows still say NOT VERIFIED or NOT WIRED, including surfaces built,
    routed and green, because the column was written in the design phase and
    no build session owns it. Third, **the section 9 fold is owed as its own
    documentation package**: sessions are reading a section 9 that is wholly
    v1 text while RFC 0005's replacements sit unfolded in this file, which is
    the same class of defect as the one above and the next one to bite.

    What this item does not do is decide scope. The parity audit the S14
    session is running will produce the defect list, and that list plus its
    sequencing against item 19's gate is Imran's, not this role's: it is a
    build-order resequencing and the persona sends those to the owner.

21. **`app/.env` is tracked on `origin/main` and the deferral that allowed
    it has now expired by its own terms (Integration Steward, 2026-08-25).**
    The S14 remainder merged origin's `v2-build` as it stood, on the owner's
    instruction of 2026-08-25 that the secret "stays as it is until the app
    goes live", and routed the resulting contract disagreement here rather
    than resolving it. Recorded now, with the state verified rather than
    reported.

    What is true at `e5bf809` and `50a4298`: `app/.env` is tracked on
    `origin/main`, on `origin/v2-build` and on the local branch, and no
    `.gitignore` on any of the three carries an env rule at all. `b9b2cfa`
    had untracked the file and restored those rules on `v2-build`;
    `c399147` reversed both halves, re-adding 44 lines of `app/.env` and
    removing 2 lines from `.gitignore`, and the production merge carried
    that state to `main`. One correction to row 16a's phrasing while the
    facts are being written down: PR #9 does not fix this on `main`.
    `51c3ff6` is the tip of its own branch and is **not** an ancestor of
    `origin/main`, which has never received it; the only commit that ever
    touched `app/.env` on `main` is `bf90c0a`, which added it.

    This contradicts 11.11, whose secrets rule reads "a gitignored .env
    locally, and an `.env.example` naming every variable". The contradiction
    is recorded rather than corrected, because the owner ruled and a ruling
    is not this role's to overturn.

    **What is new, and why this item exists rather than a note:** the
    deferral was conditional, and the condition is now met. The app went
    live at `e5bf809`. So the sentence that authorised leaving the file
    tracked no longer authorises anything, and the three acts it was holding
    off are due: rotate `GOOGLE_CLIENT_SECRET` in the Google Cloud console
    under OAuth client "Dana web", untrack `app/.env` on both branches with
    `git rm --cached` so the working copy the dev server reads survives, and
    restore the `.env*` and `!.env.example` rules. **Rotation is the only
    one of the three that changes the exposure**, because the value is in
    published history at `bf90c0a` and untracking has never removed it from
    there; the other two stop it spreading further. All three are the
    owner's to authorise and the first is his alone to perform. Not
    attempted here: `main` is production and outward-facing, and acting on
    this role's own reading of when "goes live" was satisfied is exactly the
    interpretation a Steward does not make unilaterally.

22. **The plan extends past S14 with six rows, on Imran's parity ruling
    (2026-08-25).** Relayed by the S14 session in his words: prototype-v2 is
    his source of truth and every feature and frontend interaction designed
    in it must be the same in Dana v2. **Recorded as relayed rather than as
    read from an artifact**, which is this role's standard for a ruling it
    did not receive directly. It is consistent with item 19 and extends it
    from "the client matches the v2 prototype" to the whole gap rather than
    a subset; if the relay is wrong the rows below are wrong with it, and
    Imran should say so.

    RFC 0004 gains S15 to S19 and S-fold, drafted by the S14 session and
    landed here with this role's own additions. They are numbered after S14
    because they were unforeseen, not because they follow the release:
    **2.0.0 ships after them.** All take their source from
    `docs/design/prototype-v2/` per 11.13 as item 20 amended it, and mobile
    stays out under section 13 item 32.

    Two things this role checked rather than transcribed. **The S16 legal
    routes are a live production defect and the brief described them
    imprecisely.** They were relayed as "live-404"; verified against dana.so
    on 2026-08-25, `/privacy` and `/terms` both answer **200**, because the
    SPA fallback serves `index.html` and the client, which defines neither
    route, then renders its not-found page. The distinction is not pedantry:
    a monitor or a criterion written against a 404 will call these healthy
    forever. The footer linking to them is `LandingPage.tsx:951` and `:957`,
    on the landing page dana.so serves today, and Google's OAuth consent
    configuration and 8.10's deletion policy text both need those
    destinations to exist. Second, every prototype-v2 source the rows name
    was confirmed present, screens and components alike, so no row points at
    a file that is not there.

    S19 is entered **blocked rather than scheduled**, DES-034 being open in
    the design contract: its bodies and destinations need Imran or the
    designer first. S-fold is entered unsequenced because it gates nothing,
    but it is the item most likely to cause the next item 20, sessions still
    reading a section 9 that is wholly v1 text.

23. **The parity audit is ratified, S17 is scoped from it, and two of its
    findings are not a session's to close (Integration Steward,
    2026-08-25).** The audit written by the S14 session is placed at
    `docs/parity/2026-08-25-prototype-v2-parity-audit.md`, on the
    `docs/security/` precedent: dated so a second audit appends rather than
    overwrites, and pointed at from RFC 0004's S15-to-S17b block, because
    that table is a protocol section 2 state source and the audit file is
    not. This is the same reasoning as item 18's, applied a second time, and
    it is now the pattern for any record of this kind.

    **Spot-checked before ratifying, this role not ratifying a record it has
    not tested.** The search finding was re-derived from the source rather
    than read: `views/search.ts:146` returns `rows`, `folders`, `shelves`
    and `pages`, and `SearchOverlay.tsx:159` consumes `results.data?.rows`
    alone. The trap is real and is now noted in the file: the overlay's
    `useFolders()` on the next line is the sidebar's folder list, not the
    search response's folders, so a careless reader will conclude the
    finding is wrong. It is not. The measurement stands: 31 surfaces, 14
    PORTED, 12 PARTIAL, 5 V1-ERA or MISSING.

    S17 splits into **S17a**, the shared surfaces every page shows, and
    **S17b**, the per-screen remainder, as the audit recommends and for its
    reason: the head, the marks, the faces and the sections repeat on every
    page, so closing them once closes many rows at once.

    **`components/page-bar.tsx` is not an unowned tidy-up, and the ruling is
    against deleting it on its own.** Checked rather than assumed: it is
    still exported from the barrel at `components/index.ts:37` and named
    **twice** in `components/ui/foundation.test.ts`, at lines 75 and 107,
    which are S8's both-ways exemption lists. A bare deletion therefore
    edits a test file to make the tree pass, which protocol section 8 does
    not allow the deleting session to do casually. It goes to S17a, whose
    tab-menu and page-head work removes the last live reason to keep it, and
    the exemption lines go with it in the same commit.

    **Two things are routed rather than scheduled.** The transactional email
    row is a **conflict, not a port**: 10.7 fixes "plain, short, one action
    link each" and the prototype designs three HTML cards, so a session
    cannot resolve it by building either one. It goes to Imran, compounded
    by DES-034 being open, and S19 stays blocked until he rules; the
    Steward's recommendation is that 10.7 wins unless he says otherwise,
    because a numbered section beats a design artifact under 11.13's own
    first paragraph and that is exactly the exception clause item 19
    preserved. And the two frozen section 7 widenings he approved still need
    **this role's Replace units before S18 can start**; until they exist the
    folder page cannot draw tasks under their sections and Assignments
    cannot carry its "from" half, so they are the cheapest unblocking act
    left on the board and are owed by the Steward, not by any session.

24. **The two section 7 widenings are written, as unit 12a, and S18 is
    unblocked (Integration Steward, 2026-08-25).** Owed by this role at item
    23 and discharged in the same session rather than carried: they were the
    cheapest unblocking act on the board and nothing else could start
    without them. Unit 12a replaces 7.0's TaskCard line and is **the only
    unit in this RFC that touches frozen section 7**, which is why it is
    numbered into the inventory rather than left in prose.

    One departure from item 19's wording, made openly. Imran approved
    `section_block_id` "on the folder read"; the unit puts it on **TaskCard**
    instead, because `GET /folders/:id/tasks` answers arrays of TaskCards, so
    section on the folder read is section on TaskCard, and a private element
    shape for one endpoint is two task shapes on the wire. The contract has
    already ruled this exact question the same way at the P4 change control,
    where a group's folder stub is one shape across two keys because "the two
    keys spell one thing, so they answer one shape". If he meant a second
    shape, this is the sentence to correct and the unit changes with it.

    `created_by` is the `{id, display_name, avatar_url}` person stub rather
    than an id, matching `assignee` and making TaskDetail's existing
    `created_by` agree with it instead of one being an id and the other an
    object. Both fields are additive; no existing key moves, changes type or
    changes meaning.

    **The unit names what it invalidates, which item 19 required.**
    `shared/tasks.test.ts` asserts TaskCard's exact key set and goes red on
    this unit by design, which is the unit's own proof rather than a
    casualty. Persona 11 reads it and every criterion asserting a TaskCard
    key set before `04-api-and-contract.md` writes a line.

25. **The 9.3 reunion's real surface is thirteen acceptance files, not the
    seven item 15 named, and two criteria are falsified in substance rather
    than in wording (S15, 2026-08-25; four sentences taken under item 19,
    two recommended and left with the owner).**

    **The enumeration first, because it is the third time in this build that
    a short list has been the finding.** Item 8's list of twenty was three
    short and item 14's list of four was one wide; both were found by running
    the leg rather than by reading the list. Item 15 named seven criteria
    (AC-092, AC-093, AC-094, AC-161, AC-169, AC-170, AC-179). Measured on the
    tree by grepping the browser suite rather than trusting that list:

    - Nine files reference the v1 "More options" expander, the seven above
      plus **AC-098** and **AC-183**.
    - Eight use the four harness helpers, and it is not the same eight:
      AC-092, AC-093, AC-094, **AC-098**, **AC-156**, AC-161, AC-169,
      AC-170. AC-179 names the expander in an assertion message and uses no
      helper.
    - Union of those two: ten.

    **Three more address the v1 form by apparatus neither grep looks for**,
    and they are the ones a reader of item 15 would not expect. **AC-178**
    opens the form by clicking a row, scopes to `getByRole('dialog')` and
    dismisses it by a Cancel-or-Close control; it uses no helper and never
    writes "More options", so it is invisible to both sweeps and is squarely a
    9.3 criterion, its whole subject being the history block that section puts
    on the card. **AC-182**'s fourth case opens the form from the floating
    button and drags its resize handle. **AC-162**'s delete case opens the
    form and reaches the overflow menu inside it for 9.3's delete confirm.
    So the surface is **thirteen**: AC-092, AC-093, AC-094, AC-098, AC-156,
    AC-161, AC-162, AC-169, AC-170, AC-178, AC-179, AC-182, AC-183.

    **What creation is on the v2 surface, settled against the prototype
    rather than reasoned.** 9.3's v2 says "every edit commits as it is made,
    there is no Save control and no draft state" and still carries an entry
    defaults table, which reads two ways until something decides it. 9.1's
    capture rule decides it in terms, "every capture creates the task with the
    entry defaults of 9.3 for where it stands", and `prototype-v2`'s shell
    does exactly that: its full-form affordance is `createTaskAndOpen`, which
    creates the row with the page's defaults and then opens it. There is no
    draft anywhere in the parity target. So capture creates, and the card is
    only ever opened on a task that already exists.

    **That is what falsifies AC-169, and it is recommended rather than
    taken.** AC-169 and AC-170 are a pair, and item 15 lists both because
    "create and edit are two paths to two different endpoints": the reminder
    arm of frozen 7.6's create body, and frozen 7.9's PUT. On the v2 surface
    the client reaches only the second, every reminder being set on a row that
    exists, so AC-169's premise "a reminder set in the task form while a task
    is being created" has no client path and its distinction from AC-170 has
    closed. Both endpoints stay frozen and stay asserted server-side by
    AC-149, AC-146 and AC-148, so nothing about the contract is unmeasured;
    what is gone is the client-side half of the split. **Recommended
    Replace**, the criterion kept and re-aimed at the path v2 does have,
    rather than retired, on the ground that a client which offers a reminder
    on a freshly captured task and drops it is still the defect this number
    was written for:

    ```markdown
    - AC-169 Given a task captured from any of 9.1's capture points and its surface opened on the created row, when a reminder is set there, then the stored task carries it in 4.8's time_of_day mode and a fresh read reports it; and given a capture that offers none, then the task stores none.
    ```

    **AC-182's fourth case has lost the sentence it was written against.**
    Its text reads "given the task form resized, then each state survives a
    reload", and v1's 9.3 carried "The form's width is the viewer's,
    persisted client-side, on the sidebar's rule in 9.1". The v2 replacement
    drops that sentence: it says only that "the side panel makes the page
    narrower rather than covering it" and fixes one width for the pickers.
    The behaviour survives in the parity target, `task-surface.tsx`
    remembering a panel width under DES-138, so this is a section that went
    quiet rather than a design that changed, which is the silence trigger of
    protocol section 6 and the shape F-4 reached the Steward as. **Two
    options, and no recommendation between them is offered because they turn
    on what the owner wants asserted rather than on evidence**: either 9.3
    regains a width sentence and AC-182's case stands unchanged, or the case
    goes the way item 14's counts-carrying folder-delete case went and
    AC-182 keeps its three sidebar arms. Left standing and passing in the
    meantime, which is the state that assumes least.

    **Four sentences were taken, and they are the ones item 19 authorised.**
    AC-161, AC-170, AC-178 and AC-179 each addressed "the task form" and
    assert nothing that moved; "the form" becomes "the task surface", 9.1's
    own name for it, and every other clause is verbatim. Section 12 records
    them together with why the two above are not among them.

    **One harness helper could not be ported and is replaced rather than
    moved**, which item 15 predicted and is worth writing down because the
    replacement is not the obvious one. `waitForSaveToSettle` sequenced a read
    behind the form *closing*, an event a surface with no Save control never
    has. Waiting on API quiet alone is not the substitute it looks like: quiet
    is also true in the window between a press and the request that press
    causes, so a barrier built on it returns before the commit leaves the
    browser and the read after it reports a stale row, which is the exact
    shape of the defect AC-169 and AC-170 exist to catch. The replacement is
    positive rather than negative: `watchCommit` takes the count of requests
    the page has started, before the interaction, and waits for it to move
    before it waits for quiet. A commit that never happens then fails as an
    assertion about 9.3's commit rule rather than as a timeout.

26. **10.7 is amended to permit HTML with a required text/plain alternative,
    and this role's own recommendation is superseded (Imran, 2026-08-25).**
    Item 23 recommended that 10.7 win over the prototype's three designed
    emails, on 11.13's rule that a numbered section beats a design artifact.
    He ruled the other way, and the resolution was available all along and
    this role did not see it: 11.13 says the section wins **until it is
    amended**, and amending 10.7 was a third option that was neither keeping
    the rule nor ignoring it. The section still wins; it now says something
    else. Recorded rather than quietly buried, because a recommendation that
    loses is evidence about this role's judgement and belongs in the record.

    **Relayed, and more thinly than item 22's.** The decision reached here as
    the numeral "1" against the S14 session's numbered list, read by that
    session as this amendment and disclosed to Imran as its reading before
    anything landed. It is amended on that basis because the change is
    reversible and S19 was otherwise stalled, but **this is the likeliest of
    the relayed rulings to be a misread**, and 10.7's own sentence is the
    thing to correct if it is.

    The amendment keeps "short" and "one action link each", the halves doing
    the deliverability work, and makes the text part mandatory: it must carry
    the same words and the same one link, so HTML alone does not meet the
    section. The grounds sit in 10.7 itself rather than only here, because a
    rule whose reason lives in a change log gets re-litigated.

    **Two findings widen S19 past styling, both verified in code by this role
    rather than taken from the brief.** The invite and share-grant emails
    **cannot name anybody**: `templates.ts:83` renders "Someone has invited
    you to share a list on Dana" because the 7.5 and 7.4 call sites pass no
    payload, and `RenderedEmail` is `{subject, text}` with no html field at
    all. S19 is therefore a payload widening on `OutboundMessage` and its two
    call sites, plus a second rendered part, rather than a re-skin. That half
    needs no amendment, 10.7 constraining shape and not content. DES-034
    remains open and still gates the actual words.

27. **A forwardable invite link is a real intention the schema cannot meet,
    and the owner has parked it (Imran, 2026-08-25).** He asked for an invite
    link a person could forward over WhatsApp, then parked it: "leave the
    WhatsApp requirement for now". Parked, not refused, and recorded here and
    in section 13 rather than dropped, because the next person to read the
    invite emails will have the same idea from nothing and re-derive the same
    dead end.

    Why no email change reaches it, verified against
    `0000_core_schema.sql`: `invites` has **no token column**, its `email` is
    `NOT NULL` under a lowercase check, 7.5's accept and decline are
    matched-recipient-only under the 404 leak rule, and Q12's index is
    `invites (email) WHERE status = 'pending'`. An invite is bound to an
    address by the schema, so a forwarded link lands a stranger on an empty
    `/app`, which is the current behaviour working as designed. Delivering it
    needs a token column (**frozen section 4**), a public redemption route
    (**frozen section 7**), and a ruling on whether possession of a link
    grants access, which is a security decision rather than a schema one and
    is the part to decide first. Scoped by this role on his word, not before.

28. **Section 9 is folded, and one unit of this RFC was malformed (S-fold,
    Integration Steward, 2026-08-25).** The eleven section 9 units are
    written into `docs/spec/09-ui.md`: 9.1, 9.3, 9.4, 9.5, 9.6, 9.7 and 9.9
    replaced, and 9.10 Shelves, 9.11 Trash, 9.12 Notifications and 9.13
    First run inserted. That file was 267 lines of wholly v1 text and is now
    276 lines of v2, 177 inserted against 169 deleted. This closes the debt
    item 20 recorded and RFC 0004's S-fold row.

    **Done mechanically rather than by hand, deliberately.** Each unit's
    verbatim block was extracted from this file by its fence and spliced by
    heading, and the assembly refuses to write unless every block's first
    line is the `### 9.N` heading it claims to be. Nothing was retyped, so
    no unit can have been silently paraphrased in transit, which is the
    failure a hand fold of eleven units invites.

    **The extraction found a defect in this RFC: 9.12's fenced block was
    never closed.** It ran straight into "### Insert new section 9.13 after
    9.12", so anyone taking 9.12 verbatim would have carried the next unit's
    heading into the specification, which is precisely what the first
    assembly did before the check caught it. The closing fence is added.
    Recorded rather than quietly fixed, because these units have sat
    accepted since S0 and nobody read 9.12 to its end in the five weeks
    since, which is the same "written but never read" shape as item 20.

    **9.2 and 9.8 are carried unchanged and that is correct.** 9.2 was
    amended directly at S13 under item 10 and already read v2 (Desk at
    `/app`, rules rather than copy); 9.8 was never replaced by this RFC.

    **Item 16's sweep needed nothing further in section 9**, checked rather
    than assumed. Two "My Day" strings survive and both are right: 9.4 names
    the v1 `"Remove from My Day"` control as the thing carried forward and
    states its new reading `"Remove from Today"` in the same sentence, and
    9.8 records a superseded ruling of 2026-08-11 in its own historical
    terms. That sweep's live targets were always the client copy constant
    and 7.8's `my-day` endpoint path, and the path is frozen section 7 and
    stays.

29. **S16's six readings, the three unowned surfaces built (2026-08-25).**
    Each is recorded because a session that decided it silently would have
    left the next reader with no way to tell a decision from an accident.

    **`/privacy` and `/terms` are not rows of 9.1's route table, and are not
    meant to become them.** That table is the application's: every row of it
    is under `/app` except the landing. These two are the landing's
    neighbours, they are outside `/app` precisely so AC-239's signed-out
    redirect does not reach them, and a person reads them before there is
    anything to sign into. The precedent is `views/saved-views.ts`, where S10
    put a `?view=` address outside that table and recorded the reason here
    rather than adding a row. RFC 0004's S16 row and item 22 already name
    both paths, and item 22 verified them against production; this is the
    reading that keeps the table honest, not a request to widen it.

    **Item 30 upholds this and supplies the argument this paragraph did not
    have.** Raised to the Integration Steward while it was being made rather
    than after, and answered the same evening: the precedent above is sound
    but is only precedent, and the operative reason is F-8's own. AC-239
    sends *any* unauthenticated read of an `/app` route to `/`; a privacy
    policy is read overwhelmingly by people with no session, and Google's
    OAuth consent configuration fetches it with none at all. A row in that
    table would bounce the exact audience these pages exist for, breaking the
    obligation S16 was opened to satisfy in the act of satisfying it. So a
    row would be a **defect** rather than a tidier arrangement, which is
    stronger than "unnecessary" and is what `routes.ts` and `Router.tsx` now
    say at the point a future reader meets the question.

    **DES-032's status is settled from the register rather than picked.** The
    design contract's table still reads "DES-032 | Privacy and terms
    destinations | OPEN | Before Session 7", which is the v1 row, while
    `docs/design/v2-decisions.md` records in the same register's own words
    that DES-032 is "closed in v2: pages drafted and approved 2026-08-17,
    still to be routed in production", and `public-legal-screen.tsx` carries
    Imran's approval of the copy with its date and his sentence. So the copy
    is approved and what stood open was the routing, which is this package.
    The stale row is left as it is: `docs/design/` is a directory every role
    reads and no agent writes.

    **One word of that approved copy moved, and the source file is what
    required it.** Terms read "you get an account, an Inbox, and these
    terms"; the default folder is Desk since this RFC renamed it and S2
    migrated the data. The prototype header's own instruction is the
    authority: its facts "were taken from the shipping product ... and must
    be re-verified at the port if any of that moves". The other five were
    re-verified and none has moved: Google sign-in only (11.6), folder
    sharing (5.3), Resend email (11.8), sanitized Sentry errors and 30 day
    Axiom logs (11.12, 10.5), and hard deletion behind a typed DELETE (8.10).

    **The help sheet lists six shortcuts and every one was read off its
    handler, which is what its own header demands and what AC-242 measures.**
    Ctrl+K and "/" in `shell/overlays.ts`, Ctrl+Z in `shell/app-shell.tsx`,
    Enter in `components/task-row.tsx` and `components/quick-add.tsx`, Escape
    in the dialog primitive and `lib/use-sortable-list.ts`, and the arrows in
    `components/search/SearchOverlay.tsx`. Nothing was dropped, because
    nothing on the prototype's list turned out to be untrue here; a shortcut
    this client did not bind would have been reported rather than shipped.
    **One sentence could not be ported**, the sheet's description reading
    "This is a design prototype of Dana. What you change here is kept in this
    browser and nowhere else", which is true there and false here. A Help
    sheet is the last surface in the product that may carry a false sentence,
    so it states what the sheet is and nothing more. The gap the sheet leaves
    stays named in the source file rather than papered over with a link to a
    page nobody has written, which is DES-144's judgement applied to a
    sentence.

    **Item 9's open question is answered by the prototype and the answer is
    "no choice at the save".** That item asked whether "Save as view" keeps
    forcing `pinned: true` or starts offering the choice once the pin list
    exists, and referred the answer to what the prototype's save flow does.
    It names the view and saves it, with no pin control anywhere in the flow
    (`components/task-filters.tsx`), so the save is unchanged. What changes
    is the half the interim was waiting on: a view that lands pinned can now
    be unpinned from 9.7's list, which is the surface item 9 said did not
    exist, and a view saved unpinned by any other route is reachable there
    too. AC-241's saved-view case uses an unpinned fixture for exactly that
    reason.

    **Two things 9.7 names were unbuilt and belonged to no row, and item 30
    has since assigned both to S17b.** The **Appearance** section (theme, row
    density, the clock, where a task opens) has its stored fields in the 4.19
    bundle since S7 and no control anywhere, so the client persists four
    preferences a person has no way to set; the **storage used against
    10.3's quota** line waits on a read that reports it. This package flagged
    them rather than absorbing them, because its scope is the row it was
    given and a session that widened that quietly would be item 20's failure
    running in the other direction. Item 30 records the shape behind all
    three outings of it, items 9, 20 and this one: **scoping a package by
    naming what it includes silently orphans the remainder**, and the guard
    is to name what a row is *not* taking whenever it takes part of a
    numbered section.
30. **S16's route-table reading is upheld with a stronger reason, and 9.7's
    Appearance section is assigned (Integration Steward, 2026-08-25).** Two
    answers to the S16 session. Numbered 30 because that session holds 29 on
    an unpushed branch; if these land out of order, that is why.

    **`/privacy` and `/terms` correctly have no row in 9.1's route table, and
    adding one would be a defect rather than a tidy-up.** S16 kept them out
    on the S10 saved-views precedent and asked to be corrected if that was
    wrong. It was right, and the reason is stronger than the precedent it
    used: F-8's ruling, now AC-239, sends **any** unauthenticated read of an
    `/app` route to `/`. A privacy policy is read overwhelmingly by people
    who are not signed in, and Google's OAuth consent configuration fetches
    it with no session at all. Putting those two paths in the application's
    table would make that redirect bounce precisely the audience they exist
    for, breaking the obligation S16 was built to satisfy in the act of
    satisfying it. They are the landing's neighbours, 9.2 names them, and
    they stay outside `/app`. Verified rather than assumed: section 9
    mentions them only in 9.2 and never in 9.1's table.

    **9.7's Appearance section, and the Account storage line, are assigned to
    S17b.** The S16 session found them owned by nobody and was right to stop
    rather than absorb them: 9.7 names five sections, that package's scope
    was the Views pin list, and neither S17a nor S17b named the rest.
    Verified here: the 4.19 bundle carries `theme`, `density`, `clock` and
    `task_open`, all four stored since S7, while `SettingsPage.tsx` renders
    Pages, Account and Danger zone with **no Appearance section and no
    control for any of the four**. The client therefore persists four
    preferences a person has no way to set.

    This is item 9's and item 20's shape a third time, one level down: a
    thing section 9 names, that a package's scope excluded, that no later row
    picked up. Recorded as a pattern rather than an incident, because three
    occurrences is where it stops being bad luck: **scoping a package by
    naming what it includes silently orphans the remainder.** The cheap guard
    for whoever writes the next plan row is to name what a row is *not*
    taking whenever it takes part of a numbered section.

31. **The visual review is deferred until S17 closes, on Imran's ruling of
    2026-08-25, and this changes when it happens rather than whether.** He
    opened both surfaces side by side, the prototype at its own server and
    the built client at the dev server, and ruled that the application is
    "way way different" from prototype-v2 and that reviewing now is not
    worth doing. Item 19's sentence stands unaltered: the review is his, it
    happens rather than being waived, and it precedes release. What is new
    is its position, which is now **after S17b** rather than anywhere in
    S14's clause.

    **The reasoning is the parity audit's own numbers, and the deferral is
    the correct reading of them.** That file measures 5 surfaces V1-ERA or
    MISSING and 12 PARTIAL against 14 PORTED, and its "five gaps that most
    change what a person sees on first open" are all still open: the task
    row and card, the six place-page heads, folder identity not travelling,
    search finding only tasks, and the folder page's missing board. A review
    against that state would spend the owner's judgement re-finding defects
    already written down, which is the one thing a list of known defects
    exists to prevent. The review's value is what the audit could not see,
    because the audit was produced by reading files rather than by looking,
    and that value is only available once the known gaps are shut.

    Recorded so no session asks him for it early: **S14's release clause
    cannot close on the visual review until S17b is done**, and any package
    that finds itself blocked on that line should read this item rather than
    escalating. The practical arrangement is also recorded because it cost
    an hour to rediscover: the review is done locally against both servers,
    never against dana.so, which serves `main` and was seventeen commits
    behind `v2-build` on the day this was written, lacking S15's card
    entirely.

32. **DES-034 is closed on Imran's ruling of 2026-08-25: the transactional
    emails have their subjects, bodies and action destinations, `invite`
    splits into two templates, and S19 is scheduled rather than blocked.**
    That decision had been open since before Session 7 and was the only
    thing standing between RFC 0004's S19 row and a session, item 26 having
    already removed the other one by permitting HTML with a text
    alternative.

    **What shipped in the meantime was worse than a placeholder and the
    reason is structural, not editorial.** `notify/templates.ts` renders the
    invite as "Someone has invited you to share a list on Dana" and the
    share grant as "Someone has shared a folder with you on Dana", and
    neither can name a person or a folder because `OutboundMessage` is
    `{template, to, reminder?}` and the two call sites, `invites.ts:238`
    and `folders.ts:370`, pass nothing but a recipient. The template file
    says so in its own header and says what would change it. So the copy
    below is not a re-skin of those sentences; it is what becomes sayable
    once S19 widens the payload, and the widening is the larger half of
    that row.

    **The `invite` template splits into `invite_folder` and
    `invite_connection`.** 7.5 makes `folder_id` optional, so one template
    serves two genuinely different events, and a single conditional
    sentence would not have been enough: the subject, the heading, the
    context card and the icon each differ, which is two templates wearing
    one name. The testability half is the stronger argument. 11.8's
    template name is what the acceptance suite counts sends through, the
    11.10 sink reading a message's template and recipient and nothing else,
    so under one name no criterion can tell a folder invitation from a
    connection invitation. Under two, it can.

    **The four templates, as ruled.** Placeholders are the inviter's
    `display_name`, the folder `name`, the task `title` and the stored due.

    | Template | Subject | Heading | Body |
    | - | - | - | - |
    | `invite_folder` | `{inviter} invited you to {folder} on Dana` | You're invited to {folder} | {inviter} invited you to join this folder in Dana. Accepting adds it to your sidebar, with everything already in it. |
    | `invite_connection` | `{inviter} wants to connect on Dana` | Connect with {inviter} | {inviter} invited you to connect on Dana. Once you're connected, either of you can share a folder in a single step. |
    | `share_grant` | `{inviter} shared {folder} with you on Dana` | {folder} was shared with you | {inviter} shared this folder with you. It's in your sidebar now, ready to open. |
    | `reminder` | `Reminder: {task}` | {task} | You set a reminder for this task. |

    Context card and action, in the same order: `{folder}` with "Shared
    folder · From {inviter}", **Review invitation** to the invites view;
    `{inviter}` with "Connection invitation", **Review invitation** to the
    invites view; `{folder}` with "Shared folder · Shared by {inviter}",
    **Open {folder}** to that folder; the due with "In {folder}", **Open
    task** to that task. Four destinations replacing the one
    `${appOrigin}/app` every template lands on today, which is the half of
    this ruling most easily lost, `actionLink()` being a single function
    that takes no argument.

    **`share_grant` stays one template across both its call sites**, the
    direct member add of 7.4 and the instant-share conversion of 7.5, the
    ruled sentence being true of both.

    **The reminder body deliberately names neither the folder nor the due**,
    both of which the context card carries. The prototype's "A reminder from
    your Travel folder" said the card's own line twice and reads oddly when
    the task is in Desk.

    **An orientation footer goes on the two invitations and on neither of
    the others**, replacing "Sent by Dana" there: "Dana keeps a project's
    tasks, notes and people on one page. You'll sign in with Google —
    there's no password to create." The discriminator is whether the
    recipient knows what Dana is. An invitation is sent to a bare email
    address that may have no account, so the line is orientation the reader
    needs before deciding to click, and its second clause is the single most
    useful thing to tell them, Google being the only sign-in method. A share
    grant reaches an existing connection and a reminder reaches the person
    who set it; the same line there is filler that makes a functional
    message look like a marketing one.

    **That boundary is a deliverability rule and not a matter of taste.**
    The transactional exemptions in CAN-SPAM and PECR, and a mailbox
    provider's own promotional classification, turn on whether a message is
    functional; genuinely promotional content can pull in an unsubscribe
    requirement, and an unsubscribe link would be a **second** link, which
    10.7's unchanged "one action link each" forbids. A descriptive line to
    somebody who is not yet a user stays on the functional side of that
    line. For the same reason the product is named in a subject only as the
    place an event happened, never described there.

    **Two implementation readings are recorded here so S19 does not
    re-decide them.** The due renders as the stored floating date and its
    wall time, never as "Today": 4.4 stores it floating and 8.1 has it read
    as the reader's own local time, so a server composing "Today" would have
    to decide whose today that is, which is exactly the fault that reading
    is written to avoid; the prototype's "Today, 2:00 PM" is a fixture and
    not a specification. And "Someone" survives as the fallback when a
    `display_name` cannot be resolved, 8.10 being able to scrub an account
    between the act and the send; it stops being the default sentence and
    becomes the edge case it should always have been.

    **The register carries the closure too, written on his direct
    instruction.** `design-contract.md`'s DES-034 row reads APPROVED and
    `v2-decisions.md`'s open-owner-rulings paragraph carries the closed
    marker, both pointing here for the copy. `docs/design/` is human-committed
    material that no session writes on its own judgement, which is the
    discipline row 29 held for DES-032's contradictory status; the exception
    is the owner directing the edit himself, which is what happened here and
    is recorded so the next session reads a rule with a named exception
    rather than a rule that was broken.

33. **Unit 12a is enacted, and its implementation surface is wider than the
    unit's own list by seven client files (S18, 2026-08-25).** Numbered 33
    with 32 reserved rather than spent, which was the only place in this
    list where a number was held for work written elsewhere.
    `des-034-email-copy` carried a written but at that moment unmerged
    **item 32**, Imran's DES-034 ruling on the transactional emails,
    authored eight minutes before this one and already cross-referenced
    three times from RFC 0004's S19 row. This package merged first only
    because its gate finished first, which is no claim on the number, and
    item 13's precedent turns on which claim is written and asserted rather
    than on merge order. **The reservation was honoured and is now spent**:
    item 32 merged into `v2-build` directly after this package and sits
    above it in this list, so the gap this paragraph was written to protect
    no longer exists and neither session edited the other's references.

    The two widenings Imran approved at item 19 and this role wrote at item
    24 are on the wire. `TaskCard` carries `section_block_id` and the `created_by`
    person stub, `TaskDetail`'s bare uuid `created_by` became that same
    stub, no migration was owed, and the read shape moved in the two
    producers the RFC 0001 P4 row named on the record and nowhere else.
    Four readings, each recorded because a session that decided it quietly
    leaves the next reader unable to tell a decision from an accident.

    **The unit named one casualty and there were two.** Item 24 named
    `shared/tasks.test.ts`, which asserts TaskCard's exact key set and went
    red by design. The second was **AC-138's wire arm**, which asserted that
    a scrubbed creator still reads as a bare id on the TaskDetail; the unit
    makes that value null, so a green criterion went red on a contract
    change exactly as items 8 and 14 warned. Its text did not move and did
    not need to: what AC-138 promises is that `tasks.created_by` keeps
    pointing at the scrubbed row, which is the column, and that assertion is
    untouched and now sits beside the wire in the same test. This is the
    third time in this build that a short list has been the finding, after
    item 8's list of twenty that was three short and item 14's list of four
    that was one wide, and it was found the same way both of those were, by
    running the leg rather than by reading the list.

    **"Null on every surface that is not a folder page" is about which tasks
    are placed, not about which endpoint is answering.** The unit's own
    sentence reads that way at a glance, and taken literally it would mean
    nulling the field off every body but Q7, which is the private element
    shape in disguise and is the exact thing the unit spends a paragraph
    refusing: "a private element shape for one endpoint is two task shapes
    on the wire". So the field is read straight off 4.5's column in one
    projection, a placed task names its section wherever it is read, and a
    task under no section is null everywhere. AC-248's second case asserts
    it, and the criterion is written so that a session which ever disagrees
    disputes that case rather than working around it.

    **Seven client files moved and none by choice.** The package's own
    prompt named two, the comments in `AssignmentsPage.tsx` and
    `views/filter.ts` that asserted the old shape in prose. What it could
    not have known is that the widened type is imported by client code:
    `TaskHistory` took `created_by` as a `string` and now takes the stub's
    id or null, which renders identically because "Deleted user" arrives
    through the same `nameOf` either way, and five client unit-test fixtures
    build a whole `TaskCard` and stop compiling without the two keys. Every
    one is a mechanical consequence of a type, not a behaviour change, and
    they are named here rather than escalated because the alternative was to
    block a contract change on a null literal and leave the tree red. The
    real client work this unblocks is untouched and stays where it is: the
    stub's `display_name` is what a ported history block should read, and
    that belongs to the session that ports the block.

    **What this unblocks rather than closes.** The parity audit's 31
    surfaces gain nothing finished here and three gain their missing field.
    The folder page can draw tasks under their sections, which is S17b's row
    and `task-section.tsx` as a component is S17a's; Assignments can carry
    its "from {creator}" half; and the filter's created-by axis, recorded in
    `views/filter.ts` since S11 as an escalation rather than an omission,
    now has the field it was waiting for. AC-093's section-capture arm, owed
    since S12, is client work and rides the package that draws the capture.

    **The fold of unit 12a into `docs/spec/07-api.md` is not taken and is
    not owed by this package.** Section 7 is frozen and its file still
    carries the v1 TaskCard line, exactly as sections 4.3 and 4.5 still
    carry theirs for unit 11; S-fold at item 28 folded section 9 and only
    section 9. The unit is the contract and is cited as 7.17b throughout
    this package's code and criteria. Whether the fold is owed, and to whom,
    is left with the Steward as change control rather than decided by a
    session editing a frozen section on its own authority.

34. **S19's owner column named a role that owns none of its files, the call
    sites are four rather than two, and the 11.4 reading section 13 item 34
    asked for is recorded here before a line was written (S19, 2026-08-26).**

    **The owner correction, on item 12's precedent.** RFC 0004's S19 row
    named `07-frontend-architect.md` with `10-platform.md`. Role 07 owns
    `app/src/client/**` and spec section 9.2, and this package has no client
    file in it: both surfaces are server-rendered. Read against the Owns
    sections, which RFC 0004's own sentence makes that table's authority,
    the package needs four roles and runs them in sequence in separate
    commits: **11** for the criteria, **10** for `app/src/server/notify/**`
    and the `app/src/server/scheduler/**` claim that feeds the reminder
    template, **03** for the call sites, and **06** for
    `app/src/server/auth/pages.ts`. The row is corrected rather than the
    persona files, exactly as S12's was.

    **Role 03 is the addition this package's brief did not make, and it is
    not optional.** `10-platform.md` says it from its own side, "the
    Collaboration engineer owns the call sites", and role 03's Owns section
    names "the routes for folders, members, invites, connections, tasks,
    steps, my-day, and the reminder endpoint" plus `app/src/server/domain/**`.
    The whole of this package is a payload widening, and a payload no call
    site fills is the defect item 32 describes rather than a fix for it.
    Working the call sites as role 10 would be the two-directory crossing
    protocol section 3 forbids.

    **The call sites are four, not two.** Items 26 and 32 both say two,
    `invites.ts` and `folders.ts`, and item 32 knows about the second share
    grant without counting it. Verified in the tree at `9257eb4`:
    `folders.ts:369` share grant on the 7.4 member add, `invites.ts:209`
    share grant on the 7.5 instant-share conversion, `invites.ts:237` the
    invite on create, and `invites.ts:474` the invite on **resend**, which
    neither item names and which splits on `folder_id` exactly as create
    does. The reminder's own site is `scheduler/pass.ts:206` and is role
    10's. So the split reaches three invite-bearing sites, and a session
    that widened only the two named would have shipped a resend still saying
    "Someone".

    **Every payload is assembled from a read its site already makes, which
    is what keeps a second query out of a route handler.** `createInvite`
    already selects the inviter's row to compare addresses, so it selects
    the display name in the same statement; `accessOf` already reads the
    folder row, so it returns the name from the same statement;
    `inviteFactsFor` already joins the viewer's own row as `me`, so the
    resend site reads the inviter's name from it; `membersOf` and
    `inviteById` are already called at their sites and move ahead of the
    send rather than being called twice; and the reminder claim already
    joins `folders`, so it selects the folder name there. The 5.2 and 5.3
    ordering rule is untouched at all four sites: the send still follows the
    commit, so a rolled-back write can never have mailed anybody.

    **The 11.4 reading, which section 13 item 34 asks for before the work
    rather than during it.** Neither surface can import
    `app/src/client/styles/tokens.css`: an email client reads no external
    stylesheet, and a server-rendered string never passes through Vite. So
    both write the design's values a second time, and 11.4's rule is
    unamended and unweakened, because what it governs is the client.
    `app/src/server/auth/pages.ts` has carried this duplication with its
    reason in its own header since `ef6f39a` and is the nearer precedent;
    the `vite.config.ts` and `tokens.css` pair item 34 names is the shape,
    a comment on both sides. This package takes that shape: the two server
    files each name the rule they cannot reach and why, and the crossing
    into `tokens.css` for the matching comment is **not taken**, that file
    being the Component engineer's. It is named here instead, which is the
    honest half of a comment on both sides that one role can write.

    **11.8's template list grows from three to four**, invite splitting into
    `invite_folder` and `invite_connection` per item 32. That section's
    sentence is amended with this item as its reason, on the shape item 26
    used for 10.7. The two harness matchers were read before the split
    rather than after: `auth-harness.ts` matches share grants with
    `/share[\s_-]?grant/i` and `sharing-harness.ts` matches invites with
    `/invite/i`, so every existing criterion that counts an invite send
    keeps counting it, and the tolerance those matchers were written for is
    what makes the split cost nothing.

    **Item 32's four action destinations resolve to three distinct
    addresses, and the reason is a deliberate absence from 9.1's route
    table.** Both invitations land on "the invites view", and 9.8's invite
    gate has no path: `routes.ts` records that it renders in place of the
    application whenever Q12 is non-empty, mounted by `app-shell.tsx` over
    whatever `/app` route is beneath it. So an invitation's link is
    `${appOrigin}/app`, which is 10.6's start URL and where a recipient who
    has just signed in meets the gate; the share grant lands on
    `/app/folders/{id}` and the reminder on `/app/tasks/{id}`. Four
    destinations in the ruling, three addresses in the client, and nothing
    is lost: what item 32 rules is that a template stops landing on one
    fixed address, and three of the four now do not.

    **Two glyphs of the prototype's treatment are not carried into the
    email, under 11.13's rule that section 9 wins on structure and copy and
    a design artifact is read for what the medium can hold.**
    `transactional-email-screen.tsx` draws a lucide glyph in the icon tile
    and a second in the context card. Both are inline SVG, which Gmail
    strips and which the Word rendering engine behind Outlook on Windows
    does not draw, so in the majority of clients the tile would be an empty
    bordered box rather than an icon. The purpose badge carries the same
    fact in words on every client, so the badge is kept and the two tiles
    that would otherwise be blank are dropped. The mark is carried as
    `${appOrigin}/icon-192.png` with `alt="Dana"`, so a client with remote
    images blocked reads the wordmark rather than nothing. Everything else
    of the composition is carried: the top rule, the header, the badge, the
    heading, the body, the context card's two lines, the one dark action
    button, and the footer.

    **The auth refusal page needed work, measured rather than assumed.**
    Section 13 item 34 calls its appearance deferred and that is stale;
    what is true is narrower. The page was styled at `ef6f39a` against the
    **v1** designer's gate card, and item 20 moved the standard to
    `docs/design/prototype-v2/`, whose counterpart is
    `public-auth-screen.tsx`'s `UnverifiedEmailScreen`. Compared value by
    value, the two agree on the card's 940 by 520 frame, the 320 pixel dark
    panel, the 48 pixel icon tile at radius 12, the 44 pixel action button
    at 20 pixels of side padding, and every colour, each of which is a
    graphite token written out. They differ in nine places, all of them
    v2's own moves: the card's radius (18 against 16), its border (a
    graphite-200 hairline against none) and its shadow; the dark panel's
    padding and its closing hairline; the mark's size; the icon tile's
    border step and its shadow; the heading's size, tracking and colour (36
    pixels at -0.035em in graphite-950 against 32 at -0.02em in
    graphite-900); the body's leading; and the action's weight. So the page
    is reworked onto the v2 card and 9.2's copy does not move a character,
    which keeps this inside role 06 rather than making it the escalation
    the row flagged: 9.2 is role 07's section, and only the presentation
    moved.

    **10.7's own amendment cites the wrong item and is corrected with this
    one.** Its second paragraph says "RFC 0005 change control item 25";
    item 25 is the 9.3 reunion's acceptance surface and item **26** is the
    amendment that sentence records. A one word citation fix inside role
    10's own spec section.

    **Numbers, read at this package's opening on `v2-build` at `9257eb4`
    and again at its merge**, which is the check items 13 and 25 exist
    because three sessions skipped it. AC-251 to AC-257, SESSION-LOG row
    32, and this item 34. **AC-257 was released rather than spent**, recorded
    at the criteria commit: the refusal page owes nine values rather than a
    behaviour, AC-008 already pins its 9.2 copy through the rework, and
    values belong in the owning module's unit test under protocol section 8.
    The spent range is AC-251 to AC-256 and 257 is free for the next session.

35. **S17b raises three reads that a numbered section requires and no route
    answers, and one prototype-versus-frozen-section disagreement it did not
    settle (2026-08-26, at the package's opening).** Item 20's rule is that a
    difference between `prototype-v2/` and the client is a defect in the port
    "unless a numbered section says otherwise", and that a disagreement between
    the prototype and a numbered section is escalated rather than picked. Three
    of the four below are the second shape and one is the first. All four were
    verified against the tree at `9257eb4` before they were written, this
    package's own rule, and each carries a recommendation as protocol section 6
    requires.

    **(a) "Delete for ever" has no endpoint and two numbered sections against
    it. Recommendation: do not port it.** `prototype-v2/src/screens/trash-screen.tsx`
    offers a per-row "Delete for ever" and an "Empty Trash" behind one confirm,
    and argues for the confirm well: "it is the only act in Dana with no way
    back, which is the entire reason to confirm, not because it is destructive,
    since abandon and delete are destructive too, but because every other
    destructive act in the product has a bar in the corner offering it back and
    this one cannot." Two sections disagree and neither is silent. **7.13**:
    "DELETE of a task or folder sets deleted_at (soft); purge is the tick's, at
    30 days, permanent." **9.11** enumerates the page and names restore alone.
    And there is no permanent-delete route anywhere in
    `app/src/server/routes/`, checked. So this is a section 7 widening, a human
    decision under protocol section 1, and the recommendation is to leave the
    control unbuilt: the retention window is the product's promise, and a
    control that shortens it for one person removes a row another member with
    access could still restore, which is the property 9.11's "Trash is scoped
    by access, not by who deleted" rests on. **AC-262's last arm asserts the
    absence**, so if the ruling goes the prototype's way that arm moves with it
    rather than the defect going unrecorded.

    **And if it does go that way, one sentence has to travel with the
    ruling.** 11.7 as change control item 18 amended it says the Trash purge
    "collects the files rows its folder deletes will cascade away and removes
    their objects from the store after the delete commits, because those rows
    are the only index to the bytes and a purge that drops them without the
    objects grows the disk without bound"; `scheduler/pass.ts` implements it
    and `domain/accountDeletion.ts` carries the same rule for 8.10. A manual
    "Delete for ever" is that same act arriving from a request instead of from
    the tick, so an endpoint that deleted the rows without the collection
    would leak bytes with no index left to find them by, silently and for
    ever, and would be the one path in Dana that grows the disk without
    bound. The recommendation is therefore that such an endpoint call the
    collection the purge already does rather than write a delete beside it.
    Recorded now because it is far cheaper to say before a ruling than to
    discover after one, and it is the half of this escalation a reviewer
    reading only 7.13 and 9.11 would not see. Raised by the S19 session on
    2026-08-26 and verified here against 11.7 and `pass.ts` before it was
    written down; the three roles it would land on are 04's for the frozen
    section 7 address, 03's for the transaction, and 10's for the store.

    **(b) 9.11 requires the deleter on every Trash row and the read does not
    carry one. Recommendation: widen the 7.13 read, which is not frozen.**
    9.11: "each row naming what it was, where it lived, **who deleted it and
    when** (from 4.13)". `shared/trash.ts` carries `deleted_at` and no actor,
    and `server/domain/trash.ts` selects none, though 4.13's event log records
    one for every delete. So the client cannot draw a clause the section
    requires, by any client-side work. The recommended shape is
    `deleted_by: { id, display_name, avatar_url } | null` on both
    `trashedTask` and `trashedFolder`, joined from the delete event, null where
    the actor's account has since been scrubbed under 8.10, which is AC-250's
    own shape for `created_by` and needs no new convention. **7.13 is an RFC
    0005 route rather than part of frozen 7.0 to 7.11**, so this is narrower
    than the widenings item 19 approved and does not need their machinery.
    S17b escalated rather than writing it, protocol section 3 forbidding the
    reach into `src/server/**`, and the criterion was not written as a failing
    case, because a criterion no client-side work can make green is a false red
    rather than a finding.

    **(c) 9.7's Account section names storage used against 10.3's quota and
    nothing reports usage. Recommendation: add `storage_used` to the
    `/settings` bundle.** The quota is real and enforced:
    `server/domain/files.ts` holds `QUOTA_BYTES = 1 GB`, which is RFC 0005's
    replacement 10.3 row, and refuses an upload that would cross it with a 413.
    What does not exist is any read that reports the total: `grep -rn
    storage_used app/src docs/spec` returns nothing, and
    `server/routes/files.ts` exposes upload, fetch and delete with no listing
    to sum. The recommended shape is one additive number, `storage_used`, on
    the `GET /settings` bundle of 4.19, computed as the same `SUM` over the
    owner's `files` rows that `files.ts` already runs at every upload. That
    keeps one query in one place, needs no migration, and touches no frozen
    section, `/settings` being 4.19's own v2 surface. S17b built the
    Appearance section item 30 assigned it and **left the storage line
    unbuilt**, because the alternative is a client-side estimate or a
    fabricated number, and a label with an invented figure behind it is worse
    than an absent label.

    **(d) 9.7 names four Appearance controls and `prototype-v2` draws two.
    Recorded as a reading rather than escalated, because 11.13 already
    settles it.** `settings-screen.tsx` offers Row height and Theme and no
    clock and no task-open control. 11.13: "section 9 always wins over any
    design artifact on structure and copy", and the prototype is *short* here
    rather than contradictory, so there is nothing to escalate: all four are
    built, theme and density in the prototype's own shape and idiom, the other
    two beside them. Two consequences are recorded so they are not
    rediscovered. The prototype's density values are "two" and "one" lines and
    4.19's column is `comfortable | compact`; the column is the record and
    DES-113's two row *shapes* need the v2 task row that S15's own log row
    reports as not ported, so S17b's control writes the preference and drives
    the list's spacing, and AC-261 asserts exactly that and not the row shape.
    And `lib/time-format.ts` keeps the clock in `localStorage`, its header
    saying an account-level version "needs a column, an endpoint and therefore
    an RFC"; 4.19 and `/settings` are that column and that endpoint, live since
    S7, so S17b repointed that module at the bundle rather than leaving two
    records of one fact, which is item 6's rule applied a second time.

    **One documentation gap found in passing and not taken.** The S-fold of
    item 28 folded section 9 alone. RFC 0005's units for **7.12 to 7.18** and
    the replacement **10.3** are still unfolded: `docs/spec/07-api.md` ends at
    7.11 and mentions shelves nowhere, and `docs/spec/10-non-functional.md`'s
    10.3 table carries no file, comment, storage or body rows. So a session
    reading the numbered sections for the Trash routes, the shelf routes, the
    search extension or the storage quota finds nothing and has to know to read
    this file, which is item 20's own mechanism one section over. Named here
    rather than absorbed: it is a documentation package like the section 9
    fold was, and it belongs to the Steward.

## Implementation plan

One row: RFC 0004 is this RFC's implementation plan in full — packages,
owners, order, gates, boundaries. It exists as a separate document because
the plan is a work order and this delta is a contract, and they are accepted
by different judgments.

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| — | See RFC 0004 | this RFC accepted | — | — | — |
