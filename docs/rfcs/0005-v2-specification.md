# RFC 0005: The v2 specification — navigation, day-level dates, roles, and the six systems

- **Status:** Draft
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

1. Replace section 1.x product summary sentences naming the six pages — **[STUB]**
2. Replace glossary entries in section 2: My Day→Today, Planned→Scheduled, Inbox→Desk, add Shelf, Board, Event, Notification, Workflow file — **[STUB]**
3. Replace section 6 view names where Q1–Q8 headings name pages (queries themselves unchanged; All remains Q5's union, Today remains Q1's membership, Scheduled remains Q3) — **[STUB]**
4. Replace section 9.1 global chrome: the DES-152 sidebar, the tab strip (DES-217), the window bar (DES-139), Library block, footer by role (DES-209/221) — **[STUB]**
5. Replace section 9.3 task authoring: the row/card/page in place of the form (DES-093/136), day-level due date, reminder as time-of-day, entry defaults per page spine (DES-182) — **[STUB]**
6. Replace section 9.4 Today: carried/today groups kept; the important-only switch **is the bar filter's switch** (B3's owed sentence lands here) — **[STUB]**
7. Replace section 9.5 the other views: Scheduled's ladder and calendar, Important, All, Done unpinned, Abandoned and Anytime as unpinned pinnables (DES-170) — **[STUB]**
8. Replace section 9.6 folder page and roles — **the DES-225 matrix**, verbatim body below, woven into the folded 9.6 at finalization — **[PARTIAL: matrix text final]**
9. Replace section 9.7 settings: the pin list, appearance, preferences bundle — **[STUB]**
10. Insert new sections 4.13–4.19 — the six systems' tables, **verbatim below**
11. Replace sections 4.3 and 4.5 — `deleted_at` plus the folder identity columns and the task's section assignment (expand-only) — **verbatim below**
12. Insert new sections 7.12–7.17 — the six systems' endpoint families, **verbatim below**
13. Replace section 10.3: the limits table gains the v2 rows — **verbatim below**
14. Replace section 11.7: the pass gains two duties — **verbatim below** (11.5's rules need no change; the Inbox→Desk migration is Compatibility's, executed by RFC 0004's S2)
15. Append rows to the table in section 11.13 for `prototype-v2/` and `v2-refs/` — **verbatim below**
16. Append to section 11.15 hazards: ids-never-names in stored client state; the DoneRow duplication to reunify; prototype name-keyed stores are not a storage design — **verbatim below**
17. Append to section 12: acceptance criteria for each unit above, numbered from the next free number at acceptance — **[STUB: drafted with the criteria package, RFC 0004 S1]**
18. Append to section 13: the open external facts below — **verbatim below**

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
DES-224). Existing criteria invalidated or reworded are enumerated with the
criteria package (RFC 0004, S1) and land as Replace units before acceptance.

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

- The folded section 9 baseline (RFC 0002's fold-debt) — resolves by the
  Steward folding 0002 before this RFC's Replace units are finalized.
- The notifications surface drawing (DES-223 is deliberately undrawn) —
  resolves at RFC 0004's S1 window, half a design day, before 9.1's unit is
  finalized to name the bell.

## Implementation plan

One row: RFC 0004 is this RFC's implementation plan in full — packages,
owners, order, gates, boundaries. It exists as a separate document because
the plan is a work order and this delta is a contract, and they are accepted
by different judgments.

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| — | See RFC 0004 | this RFC accepted | — | — | — |
