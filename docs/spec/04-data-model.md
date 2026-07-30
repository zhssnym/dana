## 4. Data model

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid() unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no workspace table: the workspace is fully derived from users, connections, and memberships, and a table would hold nothing.

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
| created_at | timestamptz | no | now() | none |

UNIQUE INDEX ON (owner_id) WHERE is_default: one Inbox per account (INV-2). ON DELETE RESTRICT on owner_id is a tripwire: the account deletion transaction must transfer or delete owned folders first; if it fails to, the database refuses rather than corrupting. Ownership is read from owner_id only; the role column below never encodes it (one source of truth).

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
| due_time | time | yes | none | minute precision; CHECK (due_time IS NULL OR due_date IS NOT NULL) |
| recurrence_rule | text | yes | none | RRULE subset, section 4.11; CHECK (recurrence_rule IS NULL OR due_date IS NOT NULL); length up to 200 |
| series_id | uuid | yes | none | CHECK (recurrence_rule IS NULL OR series_id IS NOT NULL) (INV-13) |
| assignee_id | uuid | yes | none | see composite FK below |
| created_by | uuid | no | none | FK users(id) ON DELETE RESTRICT (users are soft-deleted) |
| completed_at | timestamptz | yes | none | CHECK ((status = 'completed') = (completed_at IS NOT NULL)) |
| completed_by | uuid | yes | none | FK users(id); CHECK ((status = 'completed') = (completed_by IS NOT NULL)) |
| created_at | timestamptz | no | now() | none |
| updated_at | timestamptz | no | now() | touched on every mutation |

Composite foreign key enforcing INV-4: FOREIGN KEY (folder_id, assignee_id) REFERENCES folder_members (folder_id, user_id) ON DELETE SET NULL (assignee_id). The column-targeted SET NULL form requires Postgres 15 or later; on older engines, drop the ON DELETE clause and unassign inside the member-removal transaction instead (section 8.8 does so anyway; the FK is belt and braces). This constraint also validates folder moves automatically: changing folder_id with a stale assignee fails at the database.

Rationale lines: series_id groups a recurrence chain for guards (INV-7) and Done-page trails; completed_by feeds the My Day recap (Q1R), makes the completion race guard natural (section 8.5), and prepares the v2 activity log; updated_at is the last-write-wins tiebreak evidence and the search recency key.

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
