## 4. Data model

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid() unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no workspace table: the workspace is fully derived from users, connections, and memberships, and a table would hold nothing.

**Two annotations covering the whole section, added by the S29 fold on 2026-08-27. Neither is an edit: section 4 is frozen, and RFC 0004's S29 row is annotate rather than rewrite.**

**First, this section now carries the whole schema Dana runs, folded by S29a on 2026-08-30.** RFC 0005's accepted units are folded into this frozen file as text and nothing else: unit 11 replaced 4.3 and 4.5; unit 10 inserted 4.13 to 4.19; change control item 46's units appended `position` to 4.5, `width_pct` to 4.17 and inserted 4.20. Every one of them was ruled by the owner before it was written (RFC 0005's acceptance of 2026-08-24, re-accepted 2026-08-27; item 44 for the four frozen changes of item 46), so the freeze's rule, that section 4 moves only on a human decision, holds through the fold. The S29 fold of 2026-08-27 annotated rather than folded, and its annotations on 4.3, 4.7 and 4.10 stand where they were.

**Second, the page names in this section's justification prose are v1's.** "My Day recap" at 4.5's rationale line and "Q1 My Day automatic inclusion" in 4.12's index table both name a page now called Today; 4.7's own annotation states the rule that governs both, which is that the queries and the tables kept their names while the pages were renamed. Every such name in this section is a citation of a query or a table and none of them is a claim about what Dana's pages are called.

### 4.1 users

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| google_sub | text | yes | none | UNIQUE (nulls allowed); null only after deletion |
| email | text | yes | none | lowercased: CHECK (email = lower(email)); unique among active: UNIQUE INDEX ON (email) WHERE deleted_at IS NULL; null only after deletion |
| display_name | text | yes | none | length 1 to 200; null after deletion, rendered "Deleted user" |
| avatar_url | text | yes | none | length up to 2000 |
| timezone | text | no | 'UTC' | must validate against the IANA tzdb at write time |
| deleted_at | timestamptz | yes | none | set marks soft deletion |
| created_at | timestamptz | no | now() | none |

Rationale: soft deletion keeps created_by and completed_by references valid on surviving tasks while scrubbing identity (google_sub, email, display_name, avatar_url set null). google_sub is the OpenID Connect subject claim, the stable Google identity; email is display and invite matching only.

### 4.2 connections

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| user_a_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| user_b_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| created_at | timestamptz | no | now() | none |

PK (user_a_id, user_b_id). CHECK (user_a_id < user_b_id): canonical ordering makes INV-9 structural. Index on (user_b_id) for reverse roster lookup (Q9). Users are soft-deleted, so the CASCADE never fires in practice; the account deletion transaction removes rows explicitly.

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
| cover_preset | text | yes | none | CHECK matches '^[a-z0-9-]{1,40}$'; CHECK (cover_file_id IS NULL OR cover_preset IS NULL), one source at most (item 58) |
| cover_focal_y | integer | no | 50 | CHECK 0 to 100 (item 58) |
| deleted_at | timestamptz | yes | none | set marks Trash; purged by the 11.7 pass at 30 days |
| created_at | timestamptz | no | now() | none |

**Annotation, loose-ends row, 2026-08-30.** The two cover rows above are the
Append unit of RFC 0005 change control item 58 (H), ruled by delegation and
folded here the same day: section 13 item 53's first answer, 4.20's preset
and crop mirrored onto the folder so that a folder can wear every tier a
place page can. The one-source rule differs from 4.20's in admitting no
cover at all, which this table has always admitted and which the FK's SET
NULL produces. Migration `0006_folder_cover_tiers.sql`; the three CHECKs are
named in AC-001's catalog.

**Annotation, S29 fold, 2026-08-27. "Inbox" below is v1's name for this row and the row is unchanged.** RFC 0005 renamed the default folder to Desk, and the migration renames only defaults still carrying the old name; a v1 account keeps whatever it was called. Nothing in this table moves for that: `is_default` is the record, the unique index is the constraint, and the name is a value in the `name` column. Section 4 is frozen and this is an annotation rather than an edit, which is RFC 0004's S29 acceptance line. See section 2 for both names and the migration's rule.

UNIQUE INDEX ON (owner_id) WHERE is_default: one Inbox per account (INV-2). ON DELETE RESTRICT on owner_id is a tripwire: the account deletion transaction must transfer or delete owned folders first; if it fails to, the database refuses rather than corrupting. Ownership is read from owner_id only; the role column below never encodes it (one source of truth).

The four identity columns are the folder's, not a member's (pricing decision D1): one look for every member, any member may change it, and the event log of 4.13 records who. A member's personal label and color on 4.4 are untouched and remain per-viewer. Reads exclude rows with deleted_at set except through the Trash surface of 7.13; every query in section 6 gains the implicit `deleted_at IS NULL` guard at fold time.

### 4.4 folder_members

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| folder_id | uuid | no | none | FK folders(id) ON DELETE CASCADE |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| role | text | no | 'member' | CHECK (role IN ('member')); reserved for v2 tiers |
| label | text | yes | none | length 1 to 40; personal sidebar group |
| color | text | yes | none | CHECK matches '#RRGGBB' hex pattern |
| created_at | timestamptz | no | now() | join instant; drives ownership transfer order (section 8.9) |

PK (folder_id, user_id) (INV-10). Index on (user_id): the accessible-folders lookup joined by every page query (Q9). Rationale for label and color living here rather than on folders: they are per-member personal grouping; Imran's label never changes what Hassan sees.

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
| position | text | yes | none | COLLATE "C"; the hand order of a folder's unscheduled list; null until that folder is first arranged by hand; gaps and ties allowed; ordered by (position, id) |

Composite foreign key enforcing INV-4: FOREIGN KEY (folder_id, assignee_id) REFERENCES folder_members (folder_id, user_id) ON DELETE SET NULL (assignee_id). The column-targeted SET NULL form requires Postgres 15 or later; on older engines, drop the ON DELETE clause and unassign inside the member-removal transaction instead (section 8.8 does so anyway; the FK is belt and braces). This constraint also validates folder moves automatically: changing folder_id with a stale assignee fails at the database.

Rationale lines: series_id groups a recurrence chain for guards (INV-7) and Done-page trails; completed_by feeds the My Day recap (Q1R), makes the completion race guard natural (section 8.5), and feeds the activity log of 4.13; updated_at is the last-write-wins tiebreak evidence and the search recency key. Reads exclude rows with deleted_at set except through the Trash surface of 7.13, the same guard 4.3 states for folders; a task in a trashed folder is unreachable while its folder is, and purges with it.

### 4.6 steps

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| task_id | uuid | no | none | FK tasks(id) ON DELETE CASCADE |
| title | text | no | none | length 1 to 300 |
| done | boolean | no | false | none |
| position | integer | no | none | sort key; gaps allowed; order by (position, id) |
| created_at | timestamptz | no | now() | none |

Cap: 50 steps per task, enforced by API guard, not constraint. No coupling with task status in either direction.

### 4.7 my_day_entries

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| task_id | uuid | no | none | FK tasks(id) ON DELETE CASCADE |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| added_on | date | no | none | the adder's local date at pull time |

**Annotation, S29 fold, 2026-08-27. This table keeps its name and its rows are called Today entries.** RFC 0005 renamed the page from My Day to Today and deliberately did not rename the table, section 2 stating the rule that a stored identifier is not display copy. So `my_day_entries` is correct wherever it appears in sections 4, 6 and 7, and "My Day entry" is not: the glossary's term is **Today entry**. Section 4 is frozen and this is an annotation rather than an edit.

PK (task_id, user_id) (INV-12). Index on (user_id) for Q1. Rows are additionally deleted by the member-removal and leave transactions for tasks the user loses access to; the task-deletion cascade covers the rest.

### 4.8 reminders

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| task_id | uuid | no | none | PK and FK tasks(id) ON DELETE CASCADE (one reminder per task) |
| offset_minutes | integer | yes | none | CHECK (offset_minutes BETWEEN 0 AND 10080) |
| time_of_day | time | yes | none | minute precision |
| fire_at | timestamptz | no | none | computed, section 8.6 |
| state | text | no | 'scheduled' | CHECK (state IN ('scheduled','sent','skipped')) |
| fired_at | timestamptz | yes | none | set when state leaves scheduled |
| created_by | uuid | no | none | FK users(id) |

CHECK ((offset_minutes IS NULL) <> (time_of_day IS NULL)): exactly one mode. Which mode is legal depends on the task's due_time (offset requires it, time_of_day requires its absence); that is cross-table and enforced by the API, restated at every write. Partial index ON (fire_at) WHERE state = 'scheduled' for the scheduler poll (Q11). A reminder row existing for a dateless task is impossible via the clear-date cascade (section 8.4), which deletes the row.

### 4.9 invites

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| inviter_id | uuid | no | none | FK users(id) |
| email | text | no | none | CHECK (email = lower(email)); length up to 320 |
| folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE (folder deletion removes pending grants) |
| task_id | uuid | yes | none | FK tasks(id) ON DELETE SET NULL; CHECK (task_id IS NULL OR folder_id IS NOT NULL) |
| status | text | no | 'pending' | CHECK (status IN ('pending','accepted','declined','canceled','invalidated')) |
| last_sent_at | timestamptz | no | now() | resend throttle anchor |
| responded_at | timestamptz | yes | none | set on any terminal transition |
| accepted_by | uuid | yes | none | FK users(id); the account that accepted |
| created_at | timestamptz | no | now() | none |

Partial unique index enforcing INV-11: UNIQUE ON (inviter_id, email, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000')) WHERE status = 'pending'. Index on (email) WHERE status = 'pending' for the at-login lookup (Q12); index on (inviter_id) for the sent list. Rationale: task_id records assignment intent applied at acceptance (section 8.7); a deleted folder cascades its pending invites away, which is the required invalidation expressed as removal; the invalidated status is used when the inviter's account is deleted.

### 4.10 user_settings

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| user_id | uuid | no | none | PK and FK users(id) ON DELETE CASCADE |
| show_important | boolean | no | true | none |
| show_all | boolean | no | true | none |
| show_done | boolean | no | false | Done ships hidden |
| updated_at | timestamptz | no | now() | none |

My Day, Tasks, and Planned have no toggles: they cannot be hidden. Session storage is stack-dependent and out of the core model; its requirements live in section 10.1.

**Annotation, S29 fold, 2026-08-27. The sentence above is v1's page-visibility model and v2 does not use it, though every column in the table is untouched and still written.** RFC 0005 replaced three fixed flags with a pin list: which places appear in the sidebar is 9.7's pin list, stored as `pinned_views` on 4.19, and Done, Abandoned and Anytime ship unpinned. These three columns stay stored, frozen 7.2's `/me/settings` keeps them untouched, and the pins **derive** from them until the person first writes pins, after which the new column is the record for the v2 surface. That derivation is RFC 0005 change control item 6, which took it precisely so that two records of one fact are never both authoritative for one reader. So: the three columns are not dead and are not the answer to "can this page be hidden"; 4.19 is. Section 4 is frozen and this is an annotation rather than an edit.

### 4.11 Storage formats, each against a standard

- **due_date**: SQL DATE, an ISO 8601 calendar date, floating (no timezone). Matches the Todoist and Things convention for task due dates. Deviation from storing UTC instants is deliberate: an instant would shift the printed date across members' timezones.
- **due_time**: SQL TIME, minute precision, floating wall-clock time. Same rationale. Documented caveat: cross-timezone members each read it as their local wall time.
- **timezone**: IANA tzdb identifier (for example "Asia/Karachi"), the standard consumed by every date library; never store raw UTC offsets, they lose DST rules.
- **recurrence_rule**: RFC 5545 RRULE value string. v1 subset, chosen to keep the form preset-driven and the iterator trivial: FREQ one of DAILY, WEEKLY, MONTHLY, YEARLY; INTERVAL 1 to 99 (default 1); BYDAY only with FREQ=WEEKLY, values MO to SU; BYMONTHDAY only with FREQ=MONTHLY, values 1 to 28 (29 to 31 excluded to avoid RFC skip semantics in short months); UNTIL optional, a date, inclusive per RFC 5545; COUNT unsupported in v1 because honoring it requires a durable occurrence ordinal that row deletion would corrupt. DTSTART is never stored in the string: the current occurrence's due_date (plus due_time or 00:00) is the anchor at evaluation time (section 8.5). Free-form RRULE input is rejected; only strings the preset builder can produce are valid, revalidated server-side.
- **reminder**: integer minutes offset (0 to 10080, that is up to 7 days) when due_time exists; TIME time_of_day when it does not. Simpler than RFC 5545 VALARM and loses nothing v1 needs; a defended deviation.
- **completed_at**: timestamptz, a UTC instant per ISO 8601, because completion is an event, not a plan; grouped into days in the viewer's timezone at render.

### 4.12 Index summary, each justified

| Index | Justifies |
| - | - |
| folder_members (user_id) | Q9 accessible-folder resolution on every request |
| tasks (folder_id, status, due_date) | Q2, Q3, Q5, Q7 home and view scans within accessible folders |
| tasks (assignee_id, status, due_date) | Q1 My Day automatic inclusion |
| tasks (series_id) WHERE series_id IS NOT NULL | INV-7 guards, successor lookup (section 8.5) |
| tasks (completed_at DESC, id DESC) WHERE status = 'completed' | Q6 Done keyset pagination |
| tasks GIN trigram on (title, notes) via pg_trgm | Q8 search |
| steps (task_id) | step loading for TaskDetail responses |
| my_day_entries (user_id) | Q1 pulled set |
| reminders (fire_at) WHERE state = 'scheduled' | Q11 scheduler poll |
| invites (email) WHERE status = 'pending' | Q12 at-login invite surfacing |
| invites (inviter_id) | sent-invites list |
| connections (user_b_id) | Q9 roster reverse lookup |

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
| width_pct | integer | yes | none | CHECK (width_pct IS NULL OR width_pct BETWEEN 25 AND 100); CHECK (width_pct IS NULL OR kind = 'image'); the person's dragged width as a percentage of the column |

Task→section assignment is `tasks.section_block_id uuid null` (a 4.5 column
addition, expand-only). Concurrency is last-write-wins per block with the
standard 409 on a stale `updated_at`; there is no operational transform.

Folder identity rides the folder: 4.3 gains `icon text null` (server-known
key set), `color text null` (#RRGGBB), `cover_file_id uuid null FK files`,
`description text null` (up to 500) — expand-only column additions.

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

### 4.20 user_page_covers

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| place | text | no | none | CHECK (place IN ('today','scheduled','assignments','important','all','done','abandoned','anytime')) |
| file_id | uuid | yes | none | FK files(id) ON DELETE CASCADE |
| preset | text | yes | none | CHECK matches '^[a-z0-9-]{1,40}$'; a built-in cover named by the design system |
| focal_y | integer | no | 50 | CHECK (focal_y BETWEEN 0 AND 100); the vertical reposition, as a percentage |
| updated_at | timestamptz | no | now() | none |

PK (user_id, place). CHECK ((file_id IS NULL) <> (preset IS NULL)): a cover
is either a stored file or a built-in, never both and never neither, so a
row exists exactly when a cover was chosen and removal is the row's
deletion. The place set is 4.19's native-view vocabulary minus `desk`, which
is a folder and carries 4.3's own cover column. No index: the primary key
serves the only read this table has, which is one viewer's covers.
