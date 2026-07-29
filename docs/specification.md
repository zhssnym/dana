# Dana v4 Technical Specification

Version 4.0, dated 2026-07-24. This document supersedes dana_pdd_v3.md entirely and is standalone: no rule below requires reading v3. It is built on the phase 1 adversarial audit (dana_pdd_v3_audit.md), whose 34 resolutions were confirmed without override on 2026-07-24.

Provenance markers, used throughout:
- [ISSUE-NN] means the rule descends from that audit resolution.
- [SPEC] means the decision is first made in this document, with its rationale inline. Nothing marked [SPEC] came from the source material.

Conventions: 24-hour clock; ISO 8601 dates; ranges written with "to". SQL fragments are Postgres dialect and are reference, not normative; the prose rule wins if they ever disagree. "The viewer" always means the authenticated user making the request, abbreviated V. today(V) means the current calendar date in V's request timezone (section 8.1).

## 1. Product definition and scope boundary (brief 7.1)

### 1.1 What Dana is

Dana is a collaborative to-do web application delivered as an installable PWA. A user signs in with Google and gets a set of folders; every task lives in exactly one folder, and a non-deletable default folder named Inbox catches anything not filed. Folders are flat, never nested, and are the only shareable unit: sharing one grants another person full access to every task inside it, via an email invite that also creates a lasting people connection for one-tap future sharing. Scheduling is derived, never filed: a task without a due date lives on the Tasks page, a task with one lives on Planned, and My Day, Important, All, and Done are queries over the same rows. My Day mixes automatic inclusion (assigned to you, due on or before today) with manually pulled tasks, and unfinished items carry forward daily until completed or abandoned. Tasks carry notes, steps, an important flag, optional recurrence, and one email reminder. Everything is manual in v1: no AI, no integrations. The v1 goal is a boring, correct, low-operations product that a two-person team can run.

### 1.2 In scope for v1

- Google OAuth sign-in, session management, account deletion.
- Folders: one Inbox per account plus custom folders; rename; delete; per-member label and color; completion count.
- Sharing: email invites (with or without a folder attached), roster connections, instant sharing to connected people, invite cancel, resend, decline; sharing triggered by assigning to a non-member.
- Tasks: title, notes, important, due date, due time, recurrence (optionally end-bounded), one reminder, steps, assignee; three statuses (pending, completed, abandoned) with restore.
- Pages: My Day, Tasks, Planned (list and calendar), Important, All, Done; folder detail; global search; page visibility settings.
- Email notifications: invite, share grant, reminder. Nothing else.
- PWA: installable shell, offline banner, online-only data.

### 1.3 Out of scope for v1

| Item | Reason | Earliest return |
| - | - | - |
| Dana AI chat | Deferred by design; needs model infrastructure | v2 |
| Sharing content with Dana (extraction) | Reuses the chat engine; must follow it | v2 |
| Automatic inbox scanning | Sensitive Gmail OAuth scope, security assessment and annual re-verification burden on a two-person team | v3 or later |
| Calendar linking | Unsolved design problem: free-slot inference is wrong too often | Unscheduled |
| Stats page | Value unclear; folders and durations it would need are themselves reduced in v1 | v1.1 or later |
| Templates | Far future | Unscheduled |
| Attachments | Storage, scanning, and quota complexity | v2 |
| Activity log | Not needed at current trust scale; completed_by column prepares for it | v2 |
| Realtime sync, presence | Last-write-wins with refetch is sufficient at v1 scale [ISSUE-10] | v2 |
| Offline writes and sync engine | Largest hidden subsystem in the category [ISSUE-19] | v2 or later |
| SMS reminders | Vendor, cost, sender registration [ISSUE-16] | Unplanned |
| Web push reminders | Per-device subscriptions; iOS constraints need verification [ISSUE-16] | v1.1 |
| Natural-language date parsing | Belongs to the AI bundle; keeps the manual line clean | v2 |
| Duration field | Cut per audit; no v1 consumer [ISSUE-28] | v1.1 if calendar blocks feel wrong |
| Drag reordering of tasks and folders | Personal-versus-shared ordering unanswered; position subsystem avoided [ISSUE-30] | v1.1 |
| Year calendar zoom | [SPEC] Cut: projecting daily recurrences at year scale needs density rendering that is not designed; day, week, month remain | v1.1 |
| Roles and permission tiers | role column reserved, single value in v1 [ISSUE-03] | v2 |
| Multiple reminders per task | One reminder is the v1 contract | v1.1 |
| Task-level sharing | Folder is the only shareable unit, by design | Never |
| Native iOS/Android/desktop builds | PWA covers installation | Unplanned |

## 2. Glossary (brief 7.2)

Agents must use these exact terms. Each term has one meaning; no synonym introduces a second one.

- **User**: an account row created at first Google sign-in. Soft-deleted users keep their row with identity fields scrubbed and are excluded from every picker and roster.
- **Viewer (V)**: the authenticated user making the current request.
- **today(V)**: the current calendar date computed in the IANA timezone the client sent with the request.
- **Floating date / floating time**: a calendar date or wall-clock time stored without timezone. Every member sees the same digits; each evaluates them in their own timezone [ISSUE-06].
- **Workspace**: the derived view a user has of the system: their roster plus their accessible folders. Not a stored entity; there is no workspace table [ISSUE-32].
- **Roster connection**: a symmetric link between two users, one row per unordered pair, created by invite acceptance. Grants nothing except the ability to share folders without a new invite.
- **Folder**: the single organizing primitive. Holds tasks, never other folders. Has exactly one owner and one or more members.
- **Default Folder / Inbox**: the one folder per account created at signup, initial name "Inbox" [ISSUE-33]. Cannot be shared or deleted; always exactly one member, its owner.
- **Owner**: the user a folder's owner_id names. Holds the destructive rights of section 5.4. Ownership transfers only via the rules in section 8.9.
- **Member**: a user with a membership row for a folder. Owners are also members.
- **Accessible folder (to V)**: a folder where V holds a membership row. The universal scope filter of every query.
- **Task**: a row with a title, exactly one folder, and a status in {pending, completed, abandoned}.
- **Open task**: a task whose status is pending or abandoned. Open tasks populate Tasks, Planned, All, and Important [ISSUE-01].
- **Home**: the page a task belongs to by derivation: Tasks when due_date is null, Planned when set. Never assigned manually.
- **View**: a page that queries tasks without being their home: My Day, Important, All, Done.
- **Assignee**: the single member a task is assigned to, or null (unassigned). Must be a member of the task's folder.
- **Step**: a checklist row inside a task: title, done flag, position. No dates, no assignee.
- **Pull into focus**: the manual act of adding a task to the viewer's own My Day, stored as a My Day entry.
- **My Day entry**: a row (task_id, user_id, added_on) recording a pull. Personal to one user [ISSUE-07].
- **Snowball**: the property that a qualifying My Day item keeps appearing every day until completed or abandoned; nothing leaves My Day by time passing.
- **Carried**: the My Day group for items whose qualify date is before today; the complement is the Today group.
- **Recap**: My Day's collapsed section of tasks completed today.
- **Abandoned**: the status meaning given up: excluded from My Day and Done, visible faded in its home, All, and Important, restorable.
- **Restore**: the transition abandoned to pending. Dates are untouched [ISSUE-34].
- **Series**: the chain of task rows produced by one recurrence, linked by series_id. Exactly zero or one pending row per series.
- **Occurrence**: one task row of a series. The **current occurrence** is its only pending row and the only row carrying the rule.
- **Recurrence rule**: an RFC 5545 RRULE string (subset, section 4.11) stored on the current occurrence, anchored at that row's due date.
- **Virtual instance**: a computed calendar marker for a future rule instance, never stored, strictly after the current occurrence's due date [ISSUE-14].
- **Reminder**: at most one per task: an offset before the due instant (when due_time exists) or a time on the due date (when it does not), delivered by email to the assignee [ISSUE-16].
- **Invite**: a pending grant addressed to an email, optionally carrying a folder and optionally an intended assignment (task_id).
- **Completion count**: per folder, completed over (pending plus completed), abandoned excluded, identical for every member [ISSUE-18].

## 3. Invariants (brief 7.3)

Properties that must hold at all times, phrased as testable assertions. "Constraint" means a database constraint enforces it; "transaction" means the owning server transaction enforces it; "guard" means an API precondition enforces it. An automated test suite must assert each after every mutation-heavy test.

| ID | Assertion | Enforced by |
| - | - | - |
| INV-1 | Every task's folder_id references an existing folder and is never null | NOT NULL plus FK |
| INV-2 | Every non-deleted user has exactly one folder with is_default true; that folder is never shared, never deleted, and its owner never changes | Partial unique index; guards on share, delete, transfer |
| INV-3 | A default folder has exactly one membership row, its owner's | Guards on member add; invite validation rejects default folders |
| INV-4 | tasks.assignee_id is null or (folder_id, assignee_id) exists in folder_members | Composite FK (section 4.5) |
| INV-5 | In a folder with exactly one member, every task has assignee_id equal to that member | Transactions: create, move, unassign guard, member removal, leave |
| INV-6 | due_time, recurrence_rule, and a reminder row exist only while due_date is set | CHECK constraints; clear-date cascade (section 8.4) |
| INV-7 | Per series_id, at most one task row has status pending | Generation transaction; un-complete and restore guards |
| INV-8 | status = completed exactly when completed_at is set and exactly when completed_by is set | CHECK constraints |
| INV-9 | At most one connection row per unordered user pair, and user_a_id < user_b_id on every row | PK plus CHECK |
| INV-10 | At most one membership per (folder, user); the folder owner always holds a membership | PK; transactions on create, transfer, removal |
| INV-11 | At most one pending invite per (inviter, email, folder), counting the no-folder case as one folder value | Partial unique index |
| INV-12 | At most one My Day entry per (task, user); added_on is not after today in the adder's timezone at insert time | PK; guard |
| INV-13 | recurrence_rule set implies series_id set | CHECK constraint |
| INV-14 | Every non-deleted user has exactly one user_settings row and a valid IANA timezone | Provisioning transaction; timezone validation |

## 4. Data model (brief 7.4)

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid() unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no workspace table: the workspace is fully derived from users, connections, and memberships, and a table would hold nothing [ISSUE-32].

### 4.1 users

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| google_sub | text | yes | none | UNIQUE (nulls allowed); null only after deletion |
| email | text | yes | none | lowercased: CHECK (email = lower(email)); unique among active: UNIQUE INDEX ON (email) WHERE deleted_at IS NULL; null only after deletion |
| display_name | text | yes | none | length 1 to 200; null after deletion, rendered "Deleted user" |
| avatar_url | text | yes | none | length up to 2000 |
| timezone | text | no | 'UTC' | must validate against the IANA tzdb at write time |
| deleted_at | timestamptz | yes | none | set marks soft deletion [ISSUE-05] |
| created_at | timestamptz | no | now() | none |

Rationale: soft deletion keeps created_by and completed_by references valid on surviving tasks while scrubbing identity (google_sub, email, display_name, avatar_url set null). google_sub is the OpenID Connect subject claim, the stable Google identity; email is display and invite matching only.

### 4.2 connections

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| user_a_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| user_b_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| created_at | timestamptz | no | now() | none |

PK (user_a_id, user_b_id). CHECK (user_a_id < user_b_id): canonical ordering makes INV-9 structural [ISSUE-17]. Index on (user_b_id) for reverse roster lookup (Q9). Users are soft-deleted, so the CASCADE never fires in practice; the account deletion transaction removes rows explicitly.

### 4.3 folders

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| owner_id | uuid | no | none | FK users(id) ON DELETE RESTRICT |
| name | text | no | none | length 1 to 100 |
| is_default | boolean | no | false | none |
| created_at | timestamptz | no | now() | none |

UNIQUE INDEX ON (owner_id) WHERE is_default: one Inbox per account (INV-2). ON DELETE RESTRICT on owner_id is a tripwire: the account deletion transaction must transfer or delete owned folders first; if it fails to, the database refuses rather than corrupting [ISSUE-05]. Ownership is read from owner_id only; the role column below never encodes it (one source of truth) [ISSUE-03].

### 4.4 folder_members

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| folder_id | uuid | no | none | FK folders(id) ON DELETE CASCADE |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| role | text | no | 'member' | CHECK (role IN ('member')); reserved for v2 tiers [ISSUE-03] |
| label | text | yes | none | length 1 to 40; personal sidebar group [ISSUE-22] |
| color | text | yes | none | CHECK matches '#RRGGBB' hex pattern |
| created_at | timestamptz | no | now() | join instant; drives ownership transfer order (section 8.9) |

PK (folder_id, user_id) (INV-10). Index on (user_id): the accessible-folders lookup joined by every page query (Q9). Rationale for label and color living here rather than on folders: they are per-member personal grouping; Imran's label never changes what Hassan sees.

### 4.5 tasks

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| folder_id | uuid | no | none | FK folders(id) ON DELETE CASCADE [ISSUE-04] |
| title | text | no | none | length 1 to 300 |
| notes | text | yes | none | length up to 10000 |
| status | text | no | 'pending' | CHECK (status IN ('pending','completed','abandoned')) |
| important | boolean | no | false | none |
| due_date | date | yes | none | floating calendar date [ISSUE-06] |
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

Cap: 50 steps per task, enforced by API guard, not constraint [ISSUE-23]. No coupling with task status in either direction.

### 4.7 my_day_entries

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| task_id | uuid | no | none | FK tasks(id) ON DELETE CASCADE |
| user_id | uuid | no | none | FK users(id) ON DELETE CASCADE |
| added_on | date | no | none | the adder's local date at pull time |

PK (task_id, user_id) (INV-12). Index on (user_id) for Q1. Rows are additionally deleted by the member-removal and leave transactions for tasks the user loses access to [ISSUE-07]; the task-deletion cascade covers the rest.

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

CHECK ((offset_minutes IS NULL) <> (time_of_day IS NULL)): exactly one mode. Which mode is legal depends on the task's due_time (offset requires it, time_of_day requires its absence); that is cross-table and enforced by the API, restated at every write [ISSUE-16]. Partial index ON (fire_at) WHERE state = 'scheduled' for the scheduler poll (Q11). A reminder row existing for a dateless task is impossible via the clear-date cascade (section 8.4), which deletes the row.

### 4.9 invites

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| id | uuid | no | generated | PK |
| inviter_id | uuid | no | none | FK users(id) |
| email | text | no | none | CHECK (email = lower(email)); length up to 320 |
| folder_id | uuid | yes | none | FK folders(id) ON DELETE CASCADE (folder deletion removes pending grants) [ISSUE-04] |
| task_id | uuid | yes | none | FK tasks(id) ON DELETE SET NULL; CHECK (task_id IS NULL OR folder_id IS NOT NULL) [ISSUE-08] |
| status | text | no | 'pending' | CHECK (status IN ('pending','accepted','declined','canceled','invalidated')) |
| last_sent_at | timestamptz | no | now() | resend throttle anchor |
| responded_at | timestamptz | yes | none | set on any terminal transition |
| accepted_by | uuid | yes | none | FK users(id); the account that accepted |
| created_at | timestamptz | no | now() | none |

Partial unique index enforcing INV-11: UNIQUE ON (inviter_id, email, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000')) WHERE status = 'pending'. Index on (email) WHERE status = 'pending' for the at-login lookup (Q12); index on (inviter_id) for the sent list. Rationale: task_id records assignment intent applied at acceptance (section 8.7); a deleted folder cascades its pending invites away, which is the invalidation the audit asked for expressed as removal; the invalidated status is used when the inviter's account is deleted [ISSUE-12].

### 4.10 user_settings

| Column | Type | Null | Default | Constraint |
| - | - | - | - | - |
| user_id | uuid | no | none | PK and FK users(id) ON DELETE CASCADE |
| show_important | boolean | no | true | none |
| show_all | boolean | no | true | none |
| show_done | boolean | no | false | Done ships hidden [ISSUE-26] |
| updated_at | timestamptz | no | now() | none |

My Day, Tasks, and Planned have no toggles: they cannot be hidden. Session storage is stack-dependent and out of the core model; its requirements live in section 10.1.

### 4.11 Storage formats, each against a standard

- **due_date**: SQL DATE, an ISO 8601 calendar date, floating (no timezone). Matches the Todoist and Things convention for task due dates. Deviation from storing UTC instants is deliberate: an instant would shift the printed date across members' timezones [ISSUE-06].
- **due_time**: SQL TIME, minute precision, floating wall-clock time. Same rationale. Documented caveat: cross-timezone members each read it as their local wall time.
- **timezone**: IANA tzdb identifier (for example "Asia/Karachi"), the standard consumed by every date library; never store raw UTC offsets, they lose DST rules.
- **recurrence_rule**: RFC 5545 RRULE value string. v1 subset [SPEC], chosen to keep the form preset-driven and the iterator trivial: FREQ one of DAILY, WEEKLY, MONTHLY, YEARLY; INTERVAL 1 to 99 (default 1); BYDAY only with FREQ=WEEKLY, values MO to SU; BYMONTHDAY only with FREQ=MONTHLY, values 1 to 28 (29 to 31 excluded to avoid RFC skip semantics in short months); UNTIL optional, a date, inclusive per RFC 5545; COUNT unsupported in v1 [SPEC] because honoring it requires a durable occurrence ordinal that row deletion would corrupt. DTSTART is never stored in the string: the current occurrence's due_date (plus due_time or 00:00) is the anchor at evaluation time (section 8.5). Free-form RRULE input is rejected; only strings the preset builder can produce are valid, revalidated server-side.
- **reminder**: integer minutes offset (0 to 10080, that is up to 7 days) when due_time exists; TIME time_of_day when it does not. Simpler than RFC 5545 VALARM and loses nothing v1 needs; a defended deviation.
- **completed_at**: timestamptz, a UTC instant per ISO 8601, because completion is an event, not a plan; grouped into days in the viewer's timezone at render [ISSUE-06].

### 4.12 Index summary, each justified

| Index | Justifies |
| - | - |
| folder_members (user_id) | Q9 accessible-folder resolution on every request |
| tasks (folder_id, status, due_date) | Q2, Q3, Q5, Q7 home and view scans within accessible folders |
| tasks (assignee_id, status, due_date) | Q1 My Day automatic inclusion |
| tasks (series_id) WHERE series_id IS NOT NULL | INV-7 guards, successor lookup (section 8.5) |
| tasks (completed_at DESC, id DESC) WHERE status = 'completed' | Q6 Done keyset pagination |
| tasks GIN trigram on (title, notes) via pg_trgm | Q8 search |
| steps (task_id) | step loading for TaskDetail responses (added 2026-07-24, P0; see changelog) |
| my_day_entries (user_id) | Q1 pulled set |
| reminders (fire_at) WHERE state = 'scheduled' | Q11 scheduler poll |
| invites (email) WHERE status = 'pending' | Q12 at-login invite surfacing |
| invites (inviter_id) | sent-invites list |
| connections (user_b_id) | Q9 roster reverse lookup |

## 5. State machines (brief 7.5)

Every transition not listed is forbidden and must be rejected by the API with 409 (state conflict) or 403 (actor not permitted). Same-state repeats listed as no-op return 200 without side effects, which is the idempotency contract for retried requests [ISSUE-10].

### 5.1 Task status

Actors: any member of the task's folder. All transitions execute as guarded single-row updates (UPDATE ... WHERE id = X AND status = 'expected'); zero rows updated means the caller lost a race and the server re-reads to classify no-op versus conflict.

| Current | Event | Guard | Next | Side effects |
| - | - | - | - | - |
| pending | complete | none | completed | set completed_at = now(), completed_by = actor; if recurrence_rule set, run generation (section 8.5) in the same transaction |
| pending | abandon | none | abandoned | if recurrence_rule set, run generation (section 8.5) in the same transaction [ISSUE-02] |
| completed | uncomplete | G-SERIES (below) | pending | clear completed_at, completed_by; recurring branch of G-SERIES may delete the successor and reclaim the rule [ISSUE-13] |
| abandoned | restore | G-SERIES | pending | dates, due_time, reminder configuration untouched [ISSUE-34] |
| completed | complete | none | completed | no-op, 200 |
| abandoned | abandon | none | abandoned | no-op, 200 |
| pending | uncomplete | none | pending | no-op, 200 |
| pending | restore | none | pending | no-op, 200 |
| completed | abandon | never | rejected | 409, copy: complete tasks cannot be abandoned; un-complete first |
| abandoned | complete | never | rejected | 409, copy: restore the task first |
| abandoned | uncomplete | never | rejected | 409 |
| completed | restore | never | rejected | 409 |
| any | delete | actor is member | row removed | cascades: steps, my_day_entries, reminder, invites.task_id set null |

G-SERIES guard, applied when the row has a series_id: let S be the pending row with the same series_id other than this row (INV-7 makes it unique or absent).
- S exists: allowed. In the same transaction, delete S (its steps and reminder cascade), copy S.recurrence_rule back onto this row, and this row becomes the current occurrence. The confirmation dialog warns that the next scheduled occurrence is removed, including any edits made to it.
- S absent and this row has the greatest created_at among rows sharing series_id: allowed. The row returns to pending keeping whatever recurrence_rule it holds (an exhausted series keeps its rule on the last row and simply resumes).
- Otherwise: rejected, 409, copy: this repeating task has already moved on; restore is only possible on its latest occurrence.

### 5.2 Invite lifecycle

| Current | Event | Actor guard | State guard | Next | Side effects |
| - | - | - | - | - | - |
| (none) | create | any authenticated user | validations V-INV (section 8.7) | pending | one email sent; last_sent_at = now() |
| pending | accept | user whose lowercased Google email equals invites.email | acceptor not soft-deleted | accepted | acceptance transaction, section 8.7: connection upsert, membership grant if folder attached and absent, conditional assignment if task_id set; responded_at, accepted_by set |
| pending | decline | matched recipient (same rule as accept) | none | declined | responded_at set; no email to inviter |
| pending | cancel | inviter, or owner of the attached folder | none | canceled | responded_at set |
| pending | resend | inviter | now() minus last_sent_at at least 24 hours, else 429 | pending | email re-sent; last_sent_at updated |
| pending | inviter account deleted | system | none | invalidated | part of the account deletion transaction (section 8.10) |
| pending | folder deleted | system | none | row removed | via FK cascade [ISSUE-04] |
| any terminal | any event | any | never | rejected | 409 |

Terminal states: accepted, declined, canceled, invalidated. A new invite to the same email and folder may be created after a terminal state; INV-11 only restricts pending duplicates.

### 5.3 Folder membership

| Current | Event | Actor guard | State guard | Next | Side effects |
| - | - | - | - | - | - |
| non-member | add | any current member of the folder | target has a roster connection with the actor; folder not default; member count below cap | member | membership row created; share-grant email to target [ISSUE-31] |
| non-member | add via invite acceptance | system (section 8.7) | folder not default | member | membership row created |
| member (not owner) | remove | folder owner | none | non-member | R-CLEAN below |
| member (not owner) | leave | the member themselves | none | non-member | R-CLEAN below |
| member (owner) | leave | the owner | at least one other member exists, else 409 with copy: delete the folder instead | non-member | ownership transfers first (section 8.9), then R-CLEAN |
| member | add | any | never (already member) | rejected | 409, copy: already a member |

R-CLEAN, the removal side-effect block, one transaction: set assignee_id null on the leaver's assigned tasks in the folder (the composite FK also enforces this); delete the leaver's my_day_entries for tasks in the folder; if the folder's remaining member count is exactly one, assign every unassigned task in it to the remaining member (INV-5) [ISSUE-20]; the leaver's pending invites for this folder remain valid (they were sent by a then-member; revisit only if abused).

### 5.4 Permission matrix (authorization, not state)

Server-enforced on every endpoint; the client merely hides controls [ISSUE-03].

| Action | Owner | Member (not owner) | Non-member |
| - | - | - | - |
| See folder and every task in it | yes | yes | no (404) |
| Create, edit, complete, abandon, restore, delete any task | yes | yes | no |
| Move a task in or out (must be member of both folders) | yes | yes | no |
| Pull any visible task into own My Day | yes | yes | no |
| Set or clear own label and color on the folder | yes | yes | no |
| Add members, send folder invites, cancel own invites | yes | yes | no |
| Cancel any invite for the folder | yes | no (only own) | no |
| Rename folder | yes | no (403) | no |
| Delete folder | yes | no (403) | no |
| Remove another member | yes | no (403) | no |
| Leave folder | via transfer rule | yes | no |
| Share or delete a default folder | no (409) | n/a | n/a |

## 6. Query specifications (brief 7.6)

Definitions used by every query:
- ACCESSIBLE(V) = set of folder_id from folder_members where user_id = V.
- open statuses = pending, abandoned. status_rank: pending = 0, abandoned = 1 [ISSUE-01].
- today = today(V), from the request's tz parameter.
- All orders end in id (ascending unless stated) as the final tie-breaker, so any two agents produce byte-identical result sequences [ISSUE-30].
- Every view returns rows already ordered; clients never re-sort.
- List caps [SPEC]: My Day, Tasks, Planned list, Important, All, and folder open sections return at most 1000 rows and set truncated = true beyond it; the UI shows a notice. Done, folder completed sections, and search are keyset-paginated. Rationale: at v1 scale the caps are unreachable; cursors everywhere would be speculative complexity.

### Q1: My Day, open list

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'pending' AND ((assignee_id = V AND due_date IS NOT NULL AND due_date <= today) OR EXISTS my_day_entries(task_id = t.id, user_id = V)).
qualify_date per row = least of: due_date when the automatic clause holds; added_on when the entry exists. (At least one exists by the predicate.)
Grouping: Carried group where qualify_date < today; Today group where qualify_date = today. Carried renders above Today [ISSUE-30].
Sort inside each group: due_date ascending nulls last, due_time ascending nulls first, id.
Abandoned tasks never match (status filter). The important toggle is a client-side filter to important = true within already-fetched groups; it changes no query.
Empty state (both groups empty): "Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."

### Q1R: My Day, recap section

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed' AND completed_at falls on today in V's timezone AND (assignee_id = V OR completed_by = V OR EXISTS my_day_entries(t.id, V)).
Sort: completed_at descending, id descending. Rendered collapsed with a count; independent of the open list [ISSUE-07].
Empty state: section hidden entirely.

### Q2: Tasks

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NULL AND status IN (pending, abandoned).
Grouping: rows from V's default folder first, ungrouped, no heading; then one group per remaining folder having at least one row, ordered by lower(folder name) ascending, folder id. (The only accessible default folder is V's own: defaults are never shared.)
Sort inside a group: status_rank, created_at descending, id descending.
Row adornments: assignee chip except on rows in V's own default folder; star when important.
Empty state: "No undated tasks. Anything you capture without a date lands here."

### Q3: Planned, list mode

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NOT NULL AND status IN (pending, abandoned).
Sort: due_date ascending, status_rank, timed flag (all-day rows first: due_time IS NOT NULL sorts after IS NULL), due_time ascending, created_at ascending, id. Overdue pending rows appear first naturally by date.
Completed rows never appear in list mode; the look-back lives in calendar mode only.
Row adornments: folder name label, assignee chip (same default-folder exception), star, "unassigned" chip when assignee_id is null and the folder has more than one member [ISSUE-20].
Empty state: "Nothing scheduled. Give any task a due date and it moves here."

### Q3C: Planned, calendar mode

Parameters: start and end dates, inclusive, with end minus start at most 62 days [SPEC]; zoom levels day, week, month. v3's year zoom is overturned: quoting v3, "Calendar mode: the same tasks laid out on an actual grid, day, week, month, or year zoom"; year is cut for v1 because projecting a daily rule at year scale produces hundreds of markers with no designed density rendering [SPEC].
Real rows: folder_id IN ACCESSIBLE(V) AND due_date BETWEEN start AND end, all three statuses. Pending renders normal (overdue styled on past dates), completed faded and checked, abandoned faded and struck: the calendar is a record [ISSUE-01].
Virtual instances: for every accessible pending task with a recurrence_rule, the rule instances strictly after that task's due_date, intersected with [start, end] (section 8.5). Ghost style, click opens the current occurrence [ISSUE-14].
Cell order: all-day banners first (status_rank, id), then timed rows (due_time, status_rank, id), then ghosts (date order, task id).
Empty state (no rows in range): the bare grid; no message.

### Q4: Important

Predicate: folder_id IN ACCESSIBLE(V) AND important = true AND status IN (pending, abandoned).
Sort: due_date ascending nulls last, then within dated rows the Q3 keys (status_rank, timed flag, due_time, created_at, id), within undated rows the Q2 keys (status_rank, created_at descending, id descending). Effect: dated block first, undated block after, exactly one list.
Row adornments: dated rows show due date and time like a Planned row; undated rows show their folder like a Tasks row; assignee chip; the star tooltip here points outward ("Also in Planned, due 2026-07-28" or "Also in Tasks, in Work") since every row here is important by definition.
Un-starring a row removes it from the result on the next fetch; nothing else about the task changes.
Empty state: "Nothing marked important. Star any task and it shows up here."

### Q5: All

Predicate: folder_id IN ACCESSIBLE(V) AND status IN (pending, abandoned). No other condition.
Rendering: two stacked sections in one scroll: "Planned" rendered exactly as Q3 orders it, then "Tasks" rendered exactly as Q2 groups it. No third scheme exists.
Empty state: "Nothing here yet. Add your first task with the + button."

### Q6: Done

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed'.
Sort and pagination: keyset on (completed_at descending, id descending), page size 50; cursor is the last row's (completed_at, id). Grouped for display by the completed_at date in V's timezone, most recent day first.
Row adornments: folder name, due date if it had one, star when important, "un-complete" affordance.
Abandoned rows never appear here.
Empty state: "Nothing completed yet. Finished tasks build your history here."

### Q7: Folder detail (member only, else 404)

Three sections over folder F:
1. Scheduled: Q3 predicate and order, folder_id = F.
2. Unscheduled: Q2 row order, folder_id = F (no folder grouping).
3. Completed: Q6 predicate, order, and pagination, folder_id = F, rendered collapsed.
Header: name, completion count per section 8.11, member avatars, share entry point.
Empty states: sections 1 and 2 absent when empty with a single line "No tasks yet. Add one below." when both are empty; section 3 hidden while empty.

### Q8: Search

Input: q, trimmed, 2 to 100 characters, else 422.
Predicate: folder_id IN ACCESSIBLE(V) AND (title ILIKE pattern OR notes ILIKE pattern), pattern = '%' q '%', backed by the trigram index. All three statuses [ISSUE-21].
Sort: status_rank with completed = 2 (pending, abandoned, completed), updated_at descending, id descending. Keyset pagination, page size 20.
Row: title, folder, status chip, due date if any.
Empty state: "No matches for that search."

### Q9 to Q12 (internal)

Q9 accessible folders and roster: folder_members by user_id; connections by either column. Q10 folder counts: section 8.11. Q11 scheduler poll: reminders where state = 'scheduled' and fire_at <= now(). Q12 login invites: invites where email = viewer's lowercased email and status = 'pending'.

### 6.1 Partition proof

Claim: Tasks (Q2) and Planned (Q3) partition All (Q5) with no gap and no overlap. Proof: all three share the identical scope predicate, folder_id IN ACCESSIBLE(V) AND status IN (pending, abandoned). Q2 adds due_date IS NULL; Q3 adds due_date IS NOT NULL. For any row in Q5's result, due_date is a single column that is either null or not null, exclusively and exhaustively; therefore the row satisfies exactly one of the two added conjuncts, so it appears in exactly one of Q2 and Q3. Conversely any row in Q2 or Q3 satisfies Q5's predicate by construction. Hence Q5 = Q2 union Q3 and Q2 intersect Q3 is empty. The proof depends only on the three scopes staying textually identical; acceptance test AC-070 pins that with a property check.

Coverage corollary: every task row is visible somewhere. Open rows (pending, abandoned) appear in Q5 and their home (Q2 or Q3); completed rows appear in Q6. No status escapes every page [ISSUE-01].

## 7. API surface (brief 7.7)

### 7.0 Conventions

Base path /api/v1. JSON bodies. Authentication: server session established by Google OAuth; every endpoint below requires it except the auth endpoints themselves. Mutations require a CSRF token header when cookie sessions are used (section 10.1).

Error envelope: { "error": { "code": string, "message": string } }. Status usage, uniform:
- 400 malformed request (unparseable body, unknown fields tolerated but wrong types not).
- 401 no valid session.
- 403 authenticated, resource visible, action not permitted by the matrix in 5.4.
- 404 resource nonexistent, or existent but not accessible to V. Inaccessible always reads as 404, never 403, to avoid existence leaks [SPEC].
- 409 state machine violation or rule conflict (section 5 tables name each).
- 422 validation failure (limits in section 10.3), with field errors.
- 429 rate limited (limits in section 10.4), with Retry-After.

Timezone: every view endpoint takes tz, an IANA identifier, 422 if invalid. Idempotency: GETs are safe; PUT and DELETE are idempotent; status transitions are idempotent by the no-op rows of 5.1; POST creations are not idempotent and clients must disable double submit [SPEC].

Shared schemas:
- TaskCard: { id, title, status, important, due_date, due_time, folder: {id, name, is_default}, assignee: {id, display_name, avatar_url} or null, is_recurring: bool, steps_done: int, steps_total: int, pulled: bool (viewer has a My Day entry), pending_invite_email: string or null (from invites.task_id), created_at, updated_at }.
- TaskDetail: TaskCard plus { notes, recurrence_rule, series_id, reminder: {offset_minutes or time_of_day} or null, steps: [{id, title, done, position}], completed_at, completed_by, created_by }.
- Folder: { id, name, is_default, is_owner: bool, member_count, counts: {pending, completed}, my_label, my_color }.

### 7.1 Auth and account

- GET /auth/google. Unauthenticated. Redirects to Google with scopes openid email profile.
- GET /auth/google/callback. Establishes the session. First login runs the provisioning transaction: insert user (google_sub, lowercased email, display_name, avatar_url, timezone from the login page's detected zone), insert default folder name "Inbox" with owner membership, insert user_settings row; the whole transaction is idempotent under the google_sub unique constraint (a concurrent duplicate loses and adopts the winner's rows) [ISSUE-32]. Every login also syncs users.timezone to the client-detected zone when different [ISSUE-06], and rejects sign-in with an explanatory page if Google reports the email unverified [SPEC]. Redirects into the app, which immediately surfaces Q12 pending invites.
- POST /auth/logout. Destroys the session. 204.
- GET /me. Returns { user: {id, email, display_name, avatar_url, timezone}, settings, pending_invite_count }.
- PATCH /me. Body { timezone }. 422 if not IANA. Recomputes fire_at for scheduled reminders on tasks assigned to V (section 8.6). 200.
- DELETE /me. Body { confirm: "DELETE" }, literal string required, else 422 [SPEC]. Runs the account deletion transaction (section 8.10), destroys all sessions. 204. Invariants enforced: INV-1, INV-2, INV-10 survive via transfer-before-delete ordering.

### 7.2 Settings

- GET /me/settings. { show_important, show_all, show_done }.
- PATCH /me/settings. Any subset of the three booleans. Hidden pages are a navigation preference only; no data changes. 200.

### 7.3 Connections (roster)

- GET /connections. List of { user: {id, display_name, avatar_url, email}, connected_at }, excluding soft-deleted users. Sorted display_name ascending, id.
- DELETE /connections/:userId. Either side may call. Deletes the pair row; both rosters lose the entry; existing memberships untouched [ISSUE-17]. 204; 404 if no such connection.

### 7.4 Folders and membership

- GET /folders. All accessible folders as Folder objects. Sort: is_default first, then lower(name), id.
- POST /folders. { name }. Creates folder with owner = V plus owner membership (one transaction). 201 Folder. 422 name length; 422 when V already has 200 custom folders (limit, section 10.3).
- GET /folders/:id. Folder plus members [{user, role, joined_at, is_owner}] plus pending invites [{id, email, task_id, created_at, last_sent_at}]. 404 if not member.
- PATCH /folders/:id. { name }. Owner only (403 otherwise); works for the default folder too (rename allowed) [ISSUE-33]. 200.
- DELETE /folders/:id. Owner only. 409 if is_default (INV-2). Executes the deletion cascade (section 8.8). Response 200 { deleted: {tasks_open, tasks_completed, tasks_abandoned} } so the client can confirm what the dialog promised. Invariants: INV-1 via cascade.
- PATCH /folders/:id/my-membership. { label, color }, either nullable. Any member, own row only. 200.
- POST /folders/:id/members. { user_id }. Any member; guards per 5.3 row 1: 409 default folder, 409 already member, 422 no roster connection between V and target, 422 member cap 25. Sends share-grant email. 201.
- DELETE /folders/:id/members/:userId. Three legal shapes per 5.3: owner removes another member; non-owner removes self (leave); owner removes self, which transfers ownership first when other members exist and is 409 "delete the folder instead" when sole member. All run R-CLEAN. 204. Invariants: INV-4, INV-5, INV-10.

### 7.5 Invites

- POST /invites. { email, folder_id optional, task_id optional }. Validations V-INV (section 8.7): lowercase and syntax-check email (422), reject own email (422), reject default folder (409), reject when target of a folder invite is already a member (409 "already a member"), reject task_id without folder_id or task not in folder (422), convert to instant share when the email belongs to a roster connection of V (response 200 { converted_to_share: true, membership created }), dedupe against INV-11 (409 with existing invite id). Rate limits in 10.4. Sends one email. 201 { invite }.
- GET /invites/sent. V's invites, newest first, any status.
- GET /invites/pending. Invites addressed to V's email with status pending: [{id, inviter: {display_name, avatar_url}, folder_name or null, created_at}]. Backs the login surface.
- POST /invites/:id/accept. Matched recipient only (404 otherwise, not 403, per the leak rule). Runs the acceptance transaction (section 8.7). 200 { connection_created, folder or null, assigned_task_id or null }.
- POST /invites/:id/decline. Matched recipient only. 200.
- POST /invites/:id/cancel. Inviter or attached folder's owner. 200.
- POST /invites/:id/resend. Inviter only; 429 within 24 hours of last_sent_at. 200.
All five transition endpoints: 409 when the invite is not pending. Invariants: INV-9, INV-11.

### 7.6 Tasks

- POST /tasks. Body { title required, folder_id default V's Inbox, notes, important default false, due_date, due_time, recurrence_rule, assignee_id default V, reminder {offset_minutes or time_of_day}, steps [titles] }. Guards: member of folder (404), title 1 to 300 (422), dependency checks (due_time, recurrence_rule, reminder require due_date; 422), recurrence_rule must parse within the 4.11 subset and gets a fresh series_id, assignee must be a member (composite FK, surfaced as 422), single-member folder forces assignee to that member ignoring the input (INV-5), steps at most 50 (422). 201 TaskDetail.
- GET /tasks/:id. TaskDetail. 404 if folder not accessible.
- PATCH /tasks/:id. Any member. Partial body; only present fields change (field-level last write wins [ISSUE-10]). Special rules:
  - folder_id change is a move: V must be member of both source and target (404 or 422); if the current assignee is not a member of the target, assignee becomes null; if the target has exactly one member, assignee becomes that member (INV-5) [ISSUE-15].
  - due_date set to null triggers the clear-date cascade (section 8.4): due_time null, recurrence_rule null, reminder row deleted, in the same transaction [ISSUE-09].
  - due_date changed (non-null): reminder fire_at recomputed; the series anchor moves with it (section 8.5).
  - recurrence_rule set on a task without one: requires due_date (422) and assigns a new series_id; changed on a current occurrence: replaces the rule from now on, past rows untouched; set null: series ends, row stays a normal task.
  - assignee_id: setting to null is rejected with 409 in single-member folders (INV-5); setting to a non-member fails (422 via composite FK).
  - status is not accepted here (409 if present): transitions have their own endpoints.
  200 TaskDetail.
- DELETE /tasks/:id. Any member. 204. Cascades per 5.1 delete row.
- POST /tasks/:id/complete, /uncomplete, /abandon, /restore. Transitions per 5.1 with its guards and no-ops; complete and abandon run generation when a rule is present; uncomplete and restore apply G-SERIES. Responses: 200 { task: TaskDetail, generated_task: TaskCard or null, deleted_successor_id or null }.

### 7.7 Steps

- POST /tasks/:id/steps. { title, position optional (defaults to max plus 1) }. 422 over 50. 201.
- PATCH /steps/:id. { title, done, position } any subset. 200.
- DELETE /steps/:id. 204.
All require membership of the parent task's folder (404 otherwise). No effect on task status ever [ISSUE-23].

### 7.8 My Day membership

- POST /tasks/:id/my-day. Inserts entry (task, V, added_on = today(V)); repeat calls are 200 no-ops keeping the original added_on (INV-12). 404 if not accessible.
- DELETE /tasks/:id/my-day. Removes V's entry; 200 even when absent (idempotent). The task remains in My Day when it still qualifies automatically [ISSUE-07].

### 7.9 Reminder

- PUT /tasks/:id/reminder. { offset_minutes } when the task has due_time, { time_of_day } when it does not; wrong mode 422; task without due_date 422 (INV-6). Upserts the single row, computes fire_at (section 8.6), state resets to scheduled. 200.
- DELETE /tasks/:id/reminder. 204, idempotent.

### 7.10 Views and search

All take tz. All return rows fully ordered per section 6; ordering is server work, never client work.
- GET /views/my-day. { carried: [TaskCard], today: [TaskCard], recap: [TaskCard], truncated }.
- GET /views/tasks. { inbox: [TaskCard], groups: [{folder, rows: [TaskCard]}], truncated }.
- GET /views/planned. { rows: [TaskCard], truncated }.
- GET /views/planned/calendar?start&end. 422 when the range exceeds 62 days. { real: [TaskCard], virtual: [{task_id, title, date, due_time, folder_id}] }.
- GET /views/important. { rows: [TaskCard], truncated }.
- GET /views/all. { planned: [TaskCard], tasks_inbox: [TaskCard], tasks_groups: [{folder, rows}], truncated }.
- GET /views/done?cursor. { days: [{date, rows: [TaskCard]}], next_cursor }.
- GET /folders/:id/tasks?section=open|completed&cursor. Open returns scheduled plus unscheduled arrays; completed is paginated like done.
- GET /search?q&cursor. { rows: [TaskCard with status chip], next_cursor }.

### 7.11 Server-authoritative versus client convenience

Server-authoritative, always revalidated regardless of client behavior: every permission cell of 5.4; membership scope on every query; assignee membership and INV-5 forcing; the date-dependency rules and clear-date cascade; status transitions, G-SERIES, and generation; invite validations, matching, throttles, and rate limits; all input limits of 10.3; sort orders of section 6; today evaluation given tz; reminder computation and delivery decisions.

Client conveniences with no authority, each shadowed by a server rule: disabling due_time, reminder, recurrence inputs until a date exists; hiding the assignee field in single-member folders; filtering the assignee dropdown to members; pre-filling defaults per entry point; warning dialogs before destructive calls; disabling double submit. Any rule found only in the client and not in this section's server list is a specification violation, per the brief's instruction to call these out: as specified, there are none.

## 8. Business logic specifications (brief 7.8)

### 8.1 Timezone anchors and today

Model: floating dates and times everywhere a human plans; UTC instants everywhere the system records an event [ISSUE-06].

- Every request that evaluates dates carries tz, the client's current IANA zone. today(V) = the current date in tz at the moment of evaluation. The server computes it; the client never filters by date itself.
- users.timezone exists for one consumer only: reminder fire-instant computation for that user as assignee. It auto-syncs at login and whenever a session reports a different zone; there is no manual lock in v1. Traveling therefore moves both today and future reminder instants to the new zone.
- The day boundary is local midnight in tz. DST changes move that instant but never break date arithmetic, because comparisons are date against date, never instant against instant.
- Boundary statement, exact: a task with due_date D is due today when D = today(V), overdue when D < today(V), future when D > today(V). My Day's automatic clause admits D <= today(V).

### 8.2 My Day evaluation

```
def my_day(V, tz):
    today = current_date(tz)
    open_rows = tasks where folder_id in ACCESSIBLE(V)
                and status = 'pending'
                and ( (assignee_id = V and due_date is not null and due_date <= today)
                      or exists my_day_entry(task, V) )
    for t in open_rows:
        auto_q  = t.due_date  if (t.assignee_id = V and t.due_date <= today) else None
        pull_q  = entry.added_on if entry exists else None
        t.qualify_date = min(x for x in [auto_q, pull_q] if x is not None)
    carried = rows where qualify_date < today   # ordered per Q1
    today_g = rows where qualify_date = today
    recap   = Q1R rows
    return carried, today_g, recap
```

Consequences, each intended: nothing ever leaves this page by time passing (snowball); a pull is one decision, not a daily ritual; pulling a future or someone else's task shows it with its assignee chip; completing from anywhere surfaces it in the recap; abandoning removes it from the open groups instantly and keeps it out of the recap [ISSUE-07].

### 8.3 Concurrency policy

- Reads: no realtime channel in v1. Clients refetch the active view on window focus and after each own mutation. Staleness between those points is accepted [ISSUE-10].
- Field writes: PATCH sends only changed fields. Two members editing different fields both win; the same field is last write wins, and the lost update is accepted and documented. No version columns, no ETags in v1.
- Status writes: only through the four transition endpoints, implemented as guarded updates:

```
rows = execute("update tasks set status='completed', completed_at=now(), completed_by=:actor,
                updated_at=now() where id=:id and status='pending'")
if rows == 1: run_generation_if_recurring(); return task
state = reload(id)                       # lost a race or repeat call
if state.status == 'completed': return task            # idempotent no-op
if state is missing: return 404
return 409                                              # cross-state conflict per 5.1
```

The guard makes recurrence generation exactly-once under any race: only the single winning transition executes it, inside the same transaction. Operations on deleted rows return 404 and the client drops the row.

### 8.4 Clearing a due date

```
def clear_due_date(task):                 # inside PATCH when due_date := null
    assert_member(V, task.folder_id)
    task.due_date = null
    task.due_time = null                  # INV-6
    if task.recurrence_rule is not null:
        task.recurrence_rule = null       # the series ends; series_id stays for history
    delete reminder where task_id = task.id
```

One transaction with the PATCH itself. The client shows a warning first when a rule or reminder exists: "Clearing the date also ends the repeat and removes the reminder." The database checks of 4.5 make the ordering unskippable [ISSUE-09].

### 8.5 Recurrence

**Evaluation.** A rule string is always evaluated with DTSTART = the current occurrence's due_date (at due_time or 00:00). nextInstance(rule, anchor, after) returns the earliest rule instance whose date is strictly after the date "after", or null when UNTIL bounds it out. UNTIL is inclusive per RFC 5545: an instance equal to UNTIL is valid; the next one is not.

**Generation**, run inside the same transaction as a pending-to-completed or pending-to-abandoned transition when recurrence_rule is set [ISSUE-02]:

```
def generate_successor(t, actor):
    cutoff = max(t.due_date, current_date(actor.tz))
    next_due = nextInstance(t.recurrence_rule, anchor=t.due_date, after=cutoff)
    if next_due is null:                          # UNTIL exhausted
        return null                               # rule stays on t; series may resume via restore
    s = insert task(title=t.title, notes=t.notes, folder_id=t.folder_id,
                    assignee_id=t.assignee_id, important=t.important,
                    due_date=next_due, due_time=t.due_time,
                    recurrence_rule=t.recurrence_rule, series_id=t.series_id,
                    status='pending', created_by=t.created_by)
    copy steps of t onto s with done=false, same order
    if reminder exists on t: insert reminder on s with same mode and value,
                             fire_at recomputed per 8.6, state='scheduled'
    # My Day entries are never copied
    t.recurrence_rule = null                      # the rule lives only on the current occurrence
    return s
```

Worked consequences, with a weekly Monday rule:
- On time: due 2026-07-20, completed 2026-07-20. cutoff 07-20, next 2026-07-27.
- Late, slots skipped: due 2026-07-20, completed 2026-07-28. cutoff 07-28, next 2026-08-03; the 07-27 slot is skipped and the calendar shows an honest gap.
- Early, alignment kept: due 2026-07-27, completed 2026-07-25. cutoff 07-27, next 2026-08-03.
- Daily late, no pile-up: daily due 2026-07-20, completed 2026-07-24. cutoff 07-24, next 2026-07-25.
Nothing is ever generated by the passage of time; a missed occurrence just snowballs in My Day until acted on. There is no recurrence background job.

**Un-complete and restore** apply the G-SERIES guard of 5.1: delete the pending successor and reclaim the rule, or, when this row is the newest of its series, reopen it as the current occurrence; otherwise 409 [ISSUE-13] [ISSUE-34].

**Editing mid-series.** The rule exists only on the current occurrence, so editing recurrence_rule there changes the series from now on; completed and abandoned rows are historical and untouched. Changing the current occurrence's due_date re-anchors the series (the next generation evaluates from the new date). Setting the rule to null ends the series; the row remains a normal dated task. Setting a rule on a task that never had one requires a due_date and mints a fresh series_id.

**Calendar projection** [ISSUE-14]:

```
def virtual_instances(t, range_start, range_end):
    if t.status != 'pending' or t.recurrence_rule is null: return []
    lo = max(range_start, t.due_date + 1 day)     # strictly after the real row
    return [d for d in instances(t.recurrence_rule, anchor=t.due_date)
            if lo <= d <= range_end]
```

Real rows draw on their own dates in any status; ghosts appear only after the current occurrence's date; therefore no date can ever show the same series twice, and no past date shows an occurrence that never existed. Clicking a ghost opens the current occurrence.

### 8.6 Reminders

**Computation** [ISSUE-16] [ISSUE-06]:

```
def compute_fire_at(task, reminder):
    zone = users.timezone of task.assignee_id, else of reminder.created_by when unassigned
    if reminder.offset_minutes is not null:        # requires task.due_time
        local = datetime(task.due_date, task.due_time) minus offset_minutes
    else:                                          # date-only task
        local = datetime(task.due_date, reminder.time_of_day)
    return to_utc_instant(local, zone)
    # IANA rules absorb DST. A nonexistent local time in a spring-forward gap
    # resolves to the first valid instant after the gap. An ambiguous time in a
    # fall-back overlap resolves to the earlier instant. [SPEC]
```

**Recompute triggers.** fire_at is recomputed, and state reset to scheduled when the new instant is in the future, whenever any of these change: due_date, due_time, the reminder's own value or mode, assignee_id, or the assignee's users.timezone. When the recomputed instant is already past, the row is set state = skipped, never fired retroactively. The reminder row is deleted by: reminder removal, the clear-date cascade, task deletion. It survives completion and abandonment untouched, but delivery requires a pending task, so it silently never fires; un-completing before the instant lets it fire normally.

**Delivery loop**, the only background execution in v1, an operational burden named plainly: a scheduler ticks every minute.

```
every 60 seconds:
    due = select reminders where state='scheduled' and fire_at <= now()
    for r in due:
        t = task(r.task_id)
        if t.status != 'pending' or t.assignee_id is null: r.state='skipped'; r.fired_at=now(); continue
        if now() minus r.fire_at > 6 hours:          # stale catch-up after an outage [SPEC]
            r.state='skipped'; r.fired_at=now(); continue
        send email to assignee (template REMINDER); r.state='sent'; r.fired_at=now()
```

Delivery is at-least-once: a crash between send and the state write can duplicate one email; accepted for v1. The unassigned-at-fire-time skip is deliberate: reminders are never broadcast to a whole folder.

### 8.7 Invites and sharing

**V-INV validations on create**, in order: email syntactically valid and lowercased; not the inviter's own email; folder, when given, accessible to the inviter and not a default folder; task, when given, inside that folder; if the email belongs (case-insensitively) to an active user already connected to the inviter, convert to an instant share: create the membership immediately, send the share-grant email, create no invite row; if a pending invite by this inviter to this email for this folder exists, 409 pointing at it; rate limits per 10.4.

**Three entry paths, one mechanism** [ISSUE-08]:
1. Direct: enter an email in the sharing panel (folder attached) or in the People screen (bare).
2. Roster pick: choose a connected person in the sharing panel; no invite, immediate membership, share-grant email [ISSUE-31].
3. Indirect via assignment: assigning a task to someone outside the folder. Connected target: membership created instantly, then the assignment applies, one transaction. Unconnected target: an invite is created with folder_id and task_id set; the task's assignee stays unchanged, and the UI shows the "invite pending" chip derived from that row.

**Acceptance transaction**, in order, all or nothing:

```
def accept(invite, acceptor):
    assert lower(acceptor.email) == invite.email and invite.status == 'pending'
    upsert connection(minmax(invite.inviter_id, acceptor.id))          # INV-9, idempotent
    if invite.folder_id is not null and acceptor not member:
        insert folder_members(invite.folder_id, acceptor.id)           # INV-10
    if invite.task_id is not null:
        t = task(invite.task_id)
        if t exists and t.folder_id == invite.folder_id and t.assignee_id is null:
            t.assignee_id = acceptor.id                                # else skip silently
    invite.status='accepted'; invite.accepted_by=acceptor.id; invite.responded_at=now()
```

Matching is case-insensitive equality and nothing more; no Gmail dot or plus normalization. A stranded invite (address variant mismatch) is repaired by the inviter through the visible pending list with cancel and resend [ISSUE-11]. Multiple pending invites to one email are all surfaced at login; each acceptance grants only its own folder; the connection is created once. Creating a new assignment-invite for a task clears task_id on any earlier pending invite for that task.

### 8.8 Folder deletion and member removal

Folder deletion (owner only, never the default folder), one transaction [ISSUE-04]: count open, completed, abandoned tasks for the confirmation response; delete the folder row; the database cascades memberships, tasks, and through tasks the steps, my_day_entries, and reminders; pending invites carrying the folder cascade away. Nothing is recoverable; the dialog said so with counts.

Member removal and leave both run R-CLEAN of 5.3: unassign the leaver's tasks in the folder, delete the leaver's My Day entries for the folder's tasks, and, when exactly one member remains, assign every unassigned task in the folder to that member (INV-5) [ISSUE-20]. Removal never deletes a task [quoting the confirmed rule: removal only unassigns].

### 8.9 Ownership transfer

One deterministic rule, two callers (owner leave; account deletion): the new owner is the remaining member with the earliest folder_members.created_at, ties broken by lower user id. Update folders.owner_id, keep the new owner's membership row unchanged (role stays 'member'; ownership is the folder column, one source of truth). Default folders never transfer (INV-2) [ISSUE-05].

### 8.10 Account deletion

One transaction, ordered so the RESTRICT tripwire on folders.owner_id can never fire [ISSUE-05]:

```
1  set status='invalidated' on the user's pending sent invites
2  for each owned non-default folder with other members: transfer ownership (8.9)
3  for each owned folder now without other members, plus the default folder:
       delete folder (cascades per 8.8)
4  for each remaining membership in others' folders: run R-CLEAN, delete membership
5  delete all connection rows containing the user
6  delete remaining my_day_entries of the user
7  scrub the user row: google_sub, email, display_name, avatar_url set null; deleted_at = now()
8  destroy all sessions of the user
```

Surviving references (tasks.created_by, tasks.completed_by, invites.accepted_by) keep pointing at the scrubbed row and render as "Deleted user". Google requires apps offering account creation to offer deletion; verify the current policy text before launch (section 14).

### 8.11 Completion count

Per folder, identical for every member [ISSUE-18]:

```
completed = count(tasks where folder_id=F and status='completed')
pending   = count(tasks where folder_id=F and status='pending')
display: none when completed + pending = 0, else "completed / (pending + completed)"
```

Abandoned rows count on neither side. Each completed occurrence of a recurring series adds one to both sides over time; accepted as honest history. The sidebar badge shows the pending number alone; the folder header shows the full ratio [SPEC].

## 9. UI specification (brief 7.9)

Structure, states, and behavior only; no colors, typography, or spacing. Every page has five possible states unless narrowed: loading (skeleton rows), populated, empty (copy below), error (copy below), plus the global offline banner. Exact copy is normative; design may restyle, not reword, without a spec change.

### 9.1 Global chrome

- Top bar: app name (links to My Day), global search control (keyboard shortcut Ctrl+K or /) [ISSUE-21], avatar menu (Settings, Sign out).
- Sidebar: pages in fixed order My Day, Tasks, Planned, Important, All, Done, each present only if permanent or toggled visible; divider; folder list; "New folder" action; Settings link.
- Folder list: Inbox pinned first with pending-count badge; then per-member label groups (collapsible, labels ascending), each folder showing color dot, name, pending count; unlabeled folders after the labeled groups, name ascending [ISSUE-22].
- Floating add button: bottom right on every page except Done; opens the task form with the entry-point defaults of 9.3.
- Inline quick-add row: at the bottom of Tasks groups, Planned list, and folder sections; a single title input; enter saves immediately with all other fields at that entry point's defaults; escape clears.
- Offline banner (global, persistent while offline): "You're offline. Dana needs a connection; changes can't be saved right now." Writes attempted offline fail with the toast "Couldn't save. You're offline."
- Global error toast for failed requests: "Something went wrong. Nothing was saved. Try again." 409 conflicts show the state machine copy of 5.1 verbatim.

### 9.2 Landing and login

Public page: one screen describing the shipping product, collaborative to-do lists in shareable folders; no AI claim anywhere in v1 copy [ISSUE-24]; a single "Continue with Google" button; privacy and terms links. After callback, first-run lands on My Day; pending invites, when any exist, surface first as 9.8 describes.

### 9.3 Task form (create and edit are the same artifact)

Always visible: title (required), inline quick-set for due date, inline toggle for important. Behind one "More options" expander: notes, folder, assignee, due time, reminder, repeat, steps.

Dependency graph (disabled means visible but inoperable with helper text; hidden means absent) [ISSUE-27]:

| Field | Visible when | Enabled when | On disable, helper |
| - | - | - | - |
| title | always | always | none |
| due date | always | always | none |
| important | always | always | none |
| notes | expanded | always | none |
| folder | expanded | always | none |
| assignee | expanded and target folder has 2 or more members | always when visible | hidden in single-member folders (INV-5) |
| due time | expanded | due date set | "Set a due date first" |
| reminder | expanded | due date set | "Set a due date first" |
| repeat | expanded | due date set | "Set a due date first" |
| steps | expanded | always | none |

Moment of enablement: the instant due date receives a value, in the same render; clearing it disables and clears the three dependents after the 8.4 warning: "Clearing the date also ends the repeat and removes the reminder."

Behavior rules: folder selection re-filters the assignee dropdown to that folder's members plus "Invite by email", which opens the sharing flow with this folder attached and, on send, shows the pending chip [ISSUE-08]; assignee defaults to the viewer; reminder control switches mode with due time (offset picker with due time, time-of-day picker without); repeat control is preset-driven (daily, weekdays, weekly on chosen days, every N days or weeks, monthly on day 1 to 28, yearly) with an optional "Ends on" date, never a raw RRULE box; steps editor: text row, enter appends the next row, per-row check, delete, and up or down reorder controls, cap notice at 50.

Entry-point defaults:

| Opened from | due date | important | folder | other |
| - | - | - | - | - |
| Tasks, All, or bare button | empty | off | Inbox | none |
| My Day | today | off | Inbox | none |
| Planned list | today | off | Inbox | none |
| Planned calendar cell | that cell's date | off | Inbox | none |
| Important | empty | on | Inbox | none |
| Folder page | per that folder's section context | off | that folder | none |

Validation copy: empty title, "Give it a title"; over-limit fields show "Too long: limit N characters"; reminder mode mismatch is impossible in the UI and returns 422 server-side regardless.

Edit mode differences: fields pre-filled; folder change shows, when the assignee would not survive the move, "Moving will unassign Sara; she isn't a member of Home." Delete lives in the form's overflow menu with confirm "Delete this task? This can't be undone."

### 9.4 My Day

Structure: header with the date; important-only toggle switch; Carried group (heading "Carried over"); Today group (heading "Today"); recap collapsed at bottom (heading "Done today (N)").
Row elements: complete checkbox, title, folder label, due badge (overdue styled when due_date < today), assignee chip when not the viewer, star, pulled marker with un-pull control when inclusion came from an entry ("Remove from My Day"; absent when the row also qualifies automatically), overflow (edit, abandon, delete).
Abandon from here uses copy: "Abandon this task? It stops appearing in My Day but stays everywhere else." Empty state: per Q1. Error state: global toast plus inline retry.

### 9.5 Tasks, Planned, Important, All, Done

- Tasks: ungrouped Inbox block, then folder-headed groups; inline quick-add per group adds into that folder, undated.
- Planned: mode toggle list/calendar (persisted per user client-side); list per Q3; calendar per Q3C with day, week, month zooms, previous/next/today controls, all-day banner lane, timed lane when due_time set, ghost styling for virtual instances, click on empty cell opens the form with that date, click on any row opens the task, click on a ghost opens the current occurrence with the banner "Upcoming occurrence of a repeating task".
- Important: single list per Q4; star on each row un-stars it with immediate removal from view; star tooltip points outward as Q4 defines.
- All: two labeled sections, "Planned" then "Tasks", each rendered by its home page's rules; section headers are static labels, not links.
- Done: day-grouped infinite scroll per Q6; each row has "Mark as not done", which runs uncomplete and, on the G-SERIES successor branch, first confirms "This removes the next scheduled occurrence (including any edits to it). Continue?"; no add affordance anywhere on this page.
- Abandoned rows on Tasks, Planned, Important, All, and folder pages render faded and struck with an "Abandoned" chip and a "Restore" control [ISSUE-01].

### 9.6 Folder page

Header: name (inline rename for owner), completion ratio, member avatar stack, Share button, overflow menu (Rename owner-only, Label and color personal, Leave non-owner, Delete owner-only with confirm listing counts: "Delete Work? This permanently deletes 28 open, 12 completed, and 3 abandoned tasks for every member.").
Body: Scheduled section, Unscheduled section, collapsed Completed section, per Q7; inline quick-add in both open sections; FAB present.
Sharing panel: member list with joined dates and remove controls per the 5.4 matrix; roster picker ("Share with someone you're connected to"); email field ("Invite by email"); pending invites list with exact email, sent time, Cancel, Resend (disabled within 24 hours, tooltip "Resent recently").

### 9.7 Settings

Sections: Pages (three toggles with one-line descriptions: Important, All, Done; note under the trio: "My Day, Tasks, and Planned are always shown."); Account (Google identity display, detected timezone display with note "Dana follows your device's timezone automatically", Sign out); Danger zone (Delete account: explains transfer and deletion consequences in two sentences, requires typing DELETE, then runs 8.10: "Folders you share will be handed to their longest-standing member. Private folders and their tasks are permanently deleted.").

### 9.8 People and invites

People screen (reachable from sidebar footer or Settings): roster list with remove control ("Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."); bare invite by email.
Login surface: when Q12 is non-empty, an invite list renders before anything else: each row "Hassan invited you to Wedding" (or "Hassan invited you to connect"), Accept and Decline buttons; accepting a folder invite lands inside that folder.
Assignment chip: rows and the form show "Invite pending: sara@example.com" while an assignment-invite is outstanding.

### 9.9 Search overlay

Opened by the top-bar control or shortcut; input with 300 ms debounce; results per Q8 grouped under Pending, Abandoned, Completed headings; enter opens the first result; row click opens the task; footer "Showing matches from every folder you can access."

## 10. Non-functional requirements (brief 7.10)

### 10.1 Authentication and sessions

Google OAuth 2.0 with OpenID Connect, scopes openid email profile only; no Gmail or Calendar scopes exist anywhere in v1. Sessions are server-side, referenced by an httpOnly, Secure, SameSite=Lax cookie, 30-day rolling expiry [SPEC]; mutations additionally require a CSRF token when cookies are the carrier. Sign-out destroys the session; account deletion destroys all sessions (8.10). Sign-ins with an unverified Google email are rejected with an explanatory page [SPEC]. Session storage lives wherever the chosen auth library puts it and is outside the core data model.

### 10.2 Authorization enforcement points

One chokepoint: every data query joins folder_members on the viewer, and every mutation resolves the 5.4 matrix server-side before touching rows. Inaccessible resources answer 404 (never 403) to avoid existence leaks; permitted-visibility but forbidden-action answers 403. No endpoint trusts a folder_id, task_id, or user_id from the client without these checks. The composite FK of 4.5 and the constraints of section 4 are the last line, not the first.

### 10.3 Input validation and limits

| Value | Limit |
| - | - |
| Task title, step title | 1 to 300 characters |
| Notes | up to 10000 characters |
| Folder name | 1 to 100 characters |
| Personal label | 1 to 40 characters |
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

All numbers are [SPEC], server-enforced, and returned as 422 with the field named.

### 10.4 Rate limits

Per user: invites 5 per minute and 20 per day; invite resend 1 per invite per 24 hours; search 30 requests per minute; general mutations 120 per minute; all others unlimited in v1 [SPEC]. Responses use 429 plus Retry-After. Enforcement is per deployment instance in v1 (single-instance hosting per section 11); revisit if horizontally scaled.

### 10.5 Logging

Logged: authentication events, invite lifecycle transitions (invite id, not the email address), folder deletion and account deletion with row counts, status transitions (task id, actor id), reminder sends and skips, request errors with status codes. Never logged: task titles, notes, step titles, email bodies, OAuth tokens, session identifiers. Retention 30 days [SPEC]. No analytics or tracking in v1 [SPEC].

### 10.6 PWA requirements

Manifest: name Dana, display standalone, start_url /app, icons 192 and 512, theme and background colors design's choice. Service worker: precaches the versioned application shell (HTML, JS, CSS, fonts, icons); API requests are network-only, never cached; navigations fall back to the cached shell so the installed app always opens. Updates: new versions activate on next load; when detected mid-session, an unobtrusive "Update available, reload" affordance appears; no forced reload. Install: rely on the browser's native install affordance; Settings carries a short "Install Dana" hint section; no custom install prompt interception in v1 [SPEC]. Offline behavior is the ISSUE-19 contract: shell loads, banner shows, reads need network, writes fail fast with the 9.1 toast. No IndexedDB mirror, no background sync.

### 10.7 Email deliverability

One transactional provider serves invite, share-grant, and reminder templates. Launch checklist: sending domain with SPF, DKIM, DMARC configured; from-address noreply@ the product domain; plain, short templates with one action link each. This is a named operational setup cost, done once.

## 11. Recommended implementation stack (brief 7.11)

**This section is a proposal and is the only non-normative section of the spec.** Every other section is implementation-agnostic and must survive a different stack choice. Weighting: a two-person team, one semi-technical builder driving agents, no dedicated ops.

- **Application framework: Next.js (current stable, App Router) with TypeScript.** One codebase and one deployable for landing page, app shell, and API routes; the largest documentation and agent-training surface of any option, which materially helps agent-driven implementation. Alternative: SvelteKit, lighter runtime and simpler mental model; pick it if the builder prefers Svelte, nothing in this spec cares.
- **Database: managed Postgres 16 (Neon or the host's managed Postgres).** The spec leans on partial unique indexes, composite foreign keys, CHECK constraints, and pg_trgm, all first-class in Postgres. Alternative: SQLite via Turso or LiteFS for even lower ops; costs the composite FK ON DELETE SET NULL form and pg_trgm (FTS5 differs), so several constraints move into transactions; choose only if hosting collapses to a single tiny box.
- **ORM and migrations: Drizzle.** SQL-shaped, generates plain migrations agents can read and review, no runtime magic. Alternative: Prisma, better tooling polish, heavier runtime and a schema DSL further from the SQL in section 4.
- **Auth: Auth.js (NextAuth v5) with the Google provider and database sessions.** Boring, documented, revocable sessions per 10.1. Alternative: Better Auth, cleaner API and first-class TypeScript, younger project; verify maintenance cadence before committing.
- **Email: Resend.** Minimal API, template-friendly, cheap at v1 volume. Alternatives: Postmark, the deliverability benchmark, slightly more setup; AWS SES, cheapest at scale, most configuration. All three satisfy 10.7.
- **Hosting: one always-on Node service on Railway or Render, plus managed Postgres.** The deciding constraint is the reminder scheduler (8.6): a persistent process makes the one-minute tick a ten-line in-process cron (node-cron), with no platform cron tier to fight. Serverless-first platforms constrain schedule frequency by plan (Vercel's Hobby cron, for instance, is documented as daily-frequency; verify current limits, section 14). Alternative: Vercel plus Neon plus an external minute-tick (Upstash QStash schedules hitting a secured endpoint); choose it if the team prefers Vercel's deploy ergonomics and accepts one more vendor.
- **Libraries:** rrule for RRULE iteration (verify UNTIL inclusivity against 8.5 before relying on it); Luxon for timezone math over the IANA database; Serwist (or a hand-rolled service worker of under a hundred lines) for 10.6. Exact APIs need verification at build time; section 14 flags this.
- **Named ongoing burdens with this stack:** DNS and DKIM setup once; watching one hosting dashboard and one database dashboard; Sentry free tier for error reporting [SPEC recommended]; an uptime ping (UptimeRobot free) against /api/health. Total steady-state ops: minutes per week.

## 12. Build order (brief 7.12)

Work packages sized for parallel agent execution. Interfaces that must freeze before parallel work: the schema of section 4 (freezes at the end of P0) and the API contract of section 7 (this document is the contract; freezes on review of this spec). TaskCard and TaskDetail shapes belong to that contract.

| ID | Delivers | Depends on | Blocks | Acceptance |
| - | - | - | - | - |
| P0 | Repo, CI, migrations implementing all of section 4, seed script, /api/health | nothing | everything | migrations apply cleanly; every constraint of section 4 provably present (constraint-catalog test); AC-001 to AC-004 pass |
| P1 | Auth: Google OAuth, sessions, provisioning transaction, /me, DELETE /me skeleton (transaction stub), timezone sync | P0 | P2 onward | AC-005 to AC-010 |
| P2 | Folders and membership: CRUD, matrix 5.4, R-CLEAN, labels, counts, transfer 8.9 | P1 | P3, P5 | AC-011 to AC-024 |
| P3 | Tasks core: create, PATCH with move and cascade rules, delete, steps, transitions with guards, my-day pull endpoints | P2 | P4, P6, P7 | AC-025 to AC-044 |
| P4 | Views and search: every endpoint of 7.10 with the exact orders of section 6 | P3 | P8 integration | AC-045 to AC-058, AC-070 |
| P5 | Sharing: connections, invites lifecycle, acceptance transaction, emails (invite, share-grant), indirect-assignment path | P2 (task_id link finalized after P3 schema, already frozen in P0) | P8 | AC-059 to AC-069 |
| P6 | Recurrence engine: 4.11 parser and validator, generation, G-SERIES, projection endpoint behavior | P3 | P8 calendar | AC-071 to AC-082 |
| P7 | Reminders: computation, recompute triggers, scheduler loop, reminder email | P3, email setup from P5 or standalone provider setup | P8 | AC-083 to AC-090 |
| P8 | Web client: shell, all pages and states of section 9, task form, PWA layer of 10.6 | API contract (frozen at spec review); integrates against P4 to P7 as they land | P10 | AC-091 to AC-100 plus every UI-facing AC above exercised end to end |
| P9 | Hardening: rate limits, logging policy, limits table sweep, Sentry, uptime | P3 onward | release | AC-101 to AC-104 |
| P10 | Release: deploy, domain, DKIM, manifest icons, acceptance suite green in production smoke | all | none | full suite green against staging; smoke on production |

Critical path: P0 to P1 to P2 to P3 to P4 to P8 to P10. Parallel without coordination once P3 lands: P5, P6, P7 (they touch disjoint modules against the frozen schema). P8 starts UI structure against mocked contract data on day one of the freeze and integrates per package. Two agents must never share a package without a named file boundary; cross-package changes go through a contract amendment to this document first.

## 13. Acceptance criteria (brief 7.13)

Given/when/then, one behavior each, numbered to match the build order ranges. An agent writes these as automated tests before or alongside the package.

**Schema (P0)**
- AC-001 Given migrations on an empty database, when the constraint catalog is diffed against section 4, then every table, FK with its on-delete action, CHECK, unique index, and index exists.
- AC-002 Given inserts violating INV-6 or INV-8 (due_time without due_date; completed without completed_at), when attempted, then the database rejects them.
- AC-003 Given a second is_default folder for the same owner, when inserted, then rejected (INV-2).
- AC-004 Given a connection row with user_a_id greater than user_b_id, when inserted, then rejected (INV-9).

**Auth and provisioning (P1)**
- AC-005 Given a first Google sign-in, when the callback completes, then one user, one Inbox folder with owner membership, and one settings row exist, created atomically (INV-14).
- AC-006 Given two concurrent first sign-ins with the same google_sub, when both finish, then exactly one user row exists and both sessions reference it.
- AC-007 Given a returning login from a device in a different timezone, when the session starts, then users.timezone equals the new zone.
- AC-008 Given Google reports the email unverified, when the callback runs, then sign-in is refused with the explanation page and no rows are created.
- AC-009 Given DELETE /me without the literal confirm string, when called, then 422 and no change.
- AC-010 Given a session, when POST /auth/logout, then the next API call returns 401.

**Folders and membership (P2)**
- AC-011 Given a non-owner member, when renaming the folder, then 403.
- AC-012 Given the owner, when renaming, then 200 and every member reads the new name.
- AC-013 Given the owner of a default folder, when deleting it, then 409.
- AC-014 Given the owner deletes a custom folder, when the transaction ends, then the folder, its tasks of all statuses, steps, My Day entries, reminders, and pending folder invites are gone, and the response counts match what was deleted.
- AC-015 Given a non-owner member, when deleting the folder, then 403.
- AC-016 Given the owner removes a member holding assigned tasks, then those tasks are unassigned, the member's My Day entries for the folder's tasks are deleted, and their access ends.
- AC-017 Given a removal leaves exactly one member, then every unassigned task in the folder is assigned to the remaining member (INV-5).
- AC-018 Given a non-owner member leaves, then the same cleanup as removal runs.
- AC-019 Given the owner leaves a folder with other members, then ownership transfers to the earliest-joined member (tie: lower user id) and the leave proceeds.
- AC-020 Given the owner is the sole member, when leaving, then 409 with the delete-instead message.
- AC-021 Given two members race to add the same person, when both POST, then one 201 and one 409 (INV-10).
- AC-022 Given a member adds someone they hold no roster connection with, when POST members, then 422.
- AC-023 Given a member sets a personal label and color, then another member's view of the folder shows no label change.
- AC-024 Given any member adds from their roster, then 201 and one share-grant email is sent to the target.

**Tasks core (P3)**
- AC-025 Given creation with only a title, then the task lands in the caller's Inbox, assigned to the caller, pending, undated.
- AC-026 Given creation in a single-member folder with assignee_id null in the body, then the stored assignee is that member.
- AC-027 Given creation with due_time and no due_date, then 422.
- AC-028 Given a PATCH clearing due_date on a task with due_time, a rule, and a reminder, then all three are cleared or deleted in the same transaction.
- AC-029 Given a move whose target folder the caller is not a member of, then the request fails and nothing changes.
- AC-030 Given a move where the assignee is not a member of the target, then the task arrives unassigned.
- AC-031 Given a move into a single-member folder, then the task arrives assigned to that member.
- AC-032 Given a PATCH setting assignee to null in a single-member folder, then 409.
- AC-033 Given a PATCH setting assignee to a non-member, then 422.
- AC-034 Given a PATCH containing a status field, then 409.
- AC-035 Given two concurrent PATCHes touching different fields, then both changes persist.
- AC-036 Given complete on a pending task, then completed_at and completed_by are set to the acting time and user.
- AC-037 Given complete on an already completed task, then 200, and completed_by is unchanged.
- AC-038 Given complete on an abandoned task, then 409.
- AC-039 Given abandon on a pending task, then it leaves My Day, appears faded in its home, and never appears in Done.
- AC-040 Given restore on an abandoned non-recurring task, then it is pending with every date and the reminder configuration untouched.
- AC-041 Given uncomplete on a completed non-recurring task, then it is pending and completed_at and completed_by are null.
- AC-042 Given a task deletion, then its steps, My Day entries, and reminder are gone and any invite task_id pointing at it is null.
- AC-043 Given a 51st step, then 422.
- AC-044 Given POST my-day twice then DELETE my-day twice, then one entry existed with its original added_on, and every call returned 200 (INV-12).

**Views and search (P4)**
- AC-045 Given a task due today assigned to the viewer, when GET /views/my-day, then it is in the Today group.
- AC-046 Given a pending task due three days ago assigned to the viewer, then it is in the Carried group on every subsequent day.
- AC-047 Given a task assigned to someone else pulled by the viewer, then it appears in the viewer's My Day with an assignee chip, and in nobody else's.
- AC-048 Given an unassigned task due today in a multi-member folder, then it is in no one's My Day and carries the unassigned chip in Planned.
- AC-049 Given a task assigned to the viewer due next week completed today, then it appears in the recap section today.
- AC-050 Given the instant 2026-07-23 20:30 UTC and a task due 2026-07-23 assigned to the viewer, then with tz Asia/Karachi it is Carried (local 2026-07-24) and with tz Europe/London it is Today (local 2026-07-23).
- AC-051 Given undated tasks in the Inbox and in a custom folder, then Tasks renders Inbox rows ungrouped on top and the rest under folder headings.
- AC-052 Given dated tasks including an all-day and a timed task on one date, then Planned lists by date ascending with the all-day row first.
- AC-053 Given an abandoned undated task, then it renders faded in Tasks and All, and is absent from My Day and Done.
- AC-054 Given important tasks with and without dates, then Important shows the dated block first (soonest first) and undated after (newest first).
- AC-055 Given un-star on a row in Important, then the next fetch omits it and the task is otherwise unchanged.
- AC-056 Given 120 completed tasks, then Done pages by 50 using the (completed_at, id) cursor, grouped by completion day in the viewer's timezone.
- AC-057 Given a query matching tasks in accessible and inaccessible folders across all three statuses, then search returns only accessible rows grouped pending, abandoned, completed.
- AC-058 Given a folder page, then it renders Scheduled, Unscheduled, and collapsed Completed sections and the 8.11 ratio.

**Sharing (P5)**
- AC-059 Given an invite addressed to the inviter's own email, then 422.
- AC-060 Given an invite for a folder to an email belonging to a current member, then 409.
- AC-061 Given an invite to an email belonging to a roster connection, then no invite row is created and the membership plus share-grant email exist instead.
- AC-062 Given a duplicate pending invite for the same inviter, email, and folder, then 409 naming the existing invite.
- AC-063 Given a bare invite accepted, then one connection row exists serving both rosters and no membership was granted.
- AC-064 Given a folder invite, when a Google account with the exact lowercased email signs in, then the invite is waiting and acceptance grants connection plus membership; a different account's pending list is empty.
- AC-065 Given an invite carrying task_id accepted while the task is still in the folder and unassigned, then the acceptor becomes the assignee.
- AC-066 Given an invite carrying task_id accepted after the task was moved or assigned, then the assignment is skipped and the membership is still granted.
- AC-067 Given a decline, then the invite is terminal, the inviter sees declined, and a fresh invite to the same email is allowed.
- AC-068 Given a cancel by the inviter or folder owner, then the recipient's pending list no longer contains it; given a resend within 24 hours, then 429, and after 24 hours the email is sent again.
- AC-069 Given a connection removal by either side, then both rosters drop the pair, existing shared memberships stay intact, and a new share to that person requires a fresh email invite.

**Query partition property (P4)**
- AC-070 Property: for randomized datasets, All equals Tasks union Planned exactly, the two are disjoint, every non-completed task appears in All, and every completed task appears in Done.

**Recurrence (P6)**
- AC-071 Given a rule outside the 4.11 subset (COUNT, or BYMONTHDAY 29 to 31), then 422.
- AC-072 Given weekly Monday due 2026-07-20 completed that day, then the successor is due 2026-07-27, carries the rule, and the completed row keeps its date with rule null.
- AC-073 Given the same task completed 2026-07-28, then the successor is due 2026-08-03 and no occurrence exists for 2026-07-27.
- AC-074 Given daily due 2026-07-20 completed 2026-07-24, then the successor is due 2026-07-25.
- AC-075 Given weekly Monday due 2026-07-27 completed 2026-07-25, then the successor is due 2026-08-03.
- AC-076 Given abandon on a recurring occurrence, then a successor generates exactly as on completion.
- AC-077 Given two concurrent completes on one occurrence, then exactly one successor exists and one completed_by is recorded.
- AC-078 Given UNTIL equal to the current due date, when completed, then no successor is created and the rule remains on the closing row.
- AC-079 Given uncomplete while the successor is pending and edited, then the successor is deleted, the rule returns, and the restored row is the current occurrence.
- AC-080 Given uncomplete while the successor is already completed, then 409.
- AC-081 Given steps on an occurrence, when completed, then the successor carries the same steps unchecked and no My Day entries.
- AC-082 Given a July 2026 month view with completed occurrences on the 13th and 20th and the current occurrence due the 27th, then each of those dates draws exactly one row, ghosts appear only after the 27th, and the 6th shows nothing.

**Reminders (P7)**
- AC-083 Given due 2026-07-28 15:00, offset 30, assignee timezone Asia/Karachi, then fire_at is the UTC instant of 2026-07-28 14:30 Karachi time.
- AC-084 Given a date-only task with time_of_day 09:00, then it fires at 09:00 in the assignee's zone on the due date.
- AC-085 Given the due date moves, then fire_at is recomputed; given it recomputes into the past, then the reminder is skipped, never sent.
- AC-086 Given the assignee's timezone changes via login sync, then scheduled fire_at values recompute.
- AC-087 Given the task is completed before the instant, then the scheduler records skipped and sends nothing.
- AC-088 Given the task is unassigned at fire time, then skipped and logged, no broadcast.
- AC-089 Given the scheduler was down across fire_at and restarts within 6 hours, then it sends; beyond 6 hours, it skips.
- AC-090 Given PUT reminder with offset_minutes on a task without due_time, then 422; given a valid reminder in a single-member folder, then the recipient is that member.

**Client and PWA (P8)**
- AC-091 Given one prior online load, when the installed app opens offline, then the shell renders with the offline banner and a write attempt shows the failure toast with nothing queued.
- AC-092 Given the form holds a rule and reminder, when the date is cleared, then the warning copy shows and, on confirm, the three dependents are disabled and empty.
- AC-093 Given the form opened from each of the six entry points of 9.3, then the defaults match the table in all six cases.
- AC-094 Given a single-member folder selected, then no assignee field renders; given a multi-member folder, then the dropdown lists exactly its members plus the invite option.
- AC-095 Given Important, All, and Done toggled hidden, then the sidebar omits them while their URLs still render the pages (visibility is navigation preference only).
- AC-096 Given the Done page, then no floating add button and no quick-add row exist on it.
- AC-097 Given an abandoned row, then it renders faded and struck with a Restore control, and restoring an overdue assigned task returns it to My Day immediately.
- AC-098 Given a calendar ghost clicked, then the current occurrence opens with the upcoming-occurrence banner.
- AC-099 Given star hover on Important, then the tooltip names the task's home page with its date or folder; on any other page it confirms importance.
- AC-100 Given a new build is deployed mid-session, then the reload affordance appears and no forced reload occurs.

**Hardening (P9)**
- AC-101 Given a sixth invite within one minute or a twenty-first within a day, then 429 with Retry-After.
- AC-102 Given a fetch of an existing task in an inaccessible folder, then the response is indistinguishable from a nonexistent id (404).
- AC-103 Given the logs after a full suite run, then no task title, note, step title, email address in invite events, or token appears in them.
- AC-104 Given /api/health, then 200 with the build version, and a deliberately thrown test error reaches the error tracker.

## 14. Open questions and assumptions (brief 7.14)

Every unresolved external fact and every assumption this spec rests on, each with what changes if it is wrong. Nothing else in the document is knowingly uncertain.

1. **Google email claim for dotted Gmail variants.** Unverified whether the OpenID email claim returns the address exactly as registered. The matching rule (lowercase equality) and its mitigation (visible pending invites with cancel and resend) hold either way; if variants prove common, add gmail.com dot-normalization behind a feature flag in v1.1.
2. **Google account deletion policy text.** The mechanism of 8.10 is required regardless; verify the current policy wording during launch review to confirm nothing extra (such as a data export) is mandated.
3. **Hosting cron frequency tiers.** The claim that serverless hobby tiers restrict schedule frequency (Vercel Hobby documented as daily) needs verification at build time; it decides between the always-on host and the external-tick alternative in section 11. The reminder contract of 8.6 does not change either way.
4. **rrule library conformance.** UNTIL inclusivity (RFC says inclusive) and subset iteration must be pinned by AC-071 to AC-078 against the chosen library before P6 is declared done; a divergence means wrapping or replacing the library, not changing the spec.
5. **iOS PWA push constraints.** Irrelevant to v1 (email only); verify before scheduling push for v1.1.
6. **Scale assumption behind caps.** Open lists cap at 1000 rows instead of paginating, assuming personal-scale data. If real accounts approach the cap, add keyset cursors to the view endpoints; the change is isolated to section 7.10 responses.
7. **Single reminder per task.** Assumed sufficient (the source design always spoke of one). If multiple are demanded, reminders gets its own id key and PUT becomes POST plus DELETE; fire logic is unchanged per row.
8. **Silent timezone auto-sync.** Assumed acceptable that travel moves today and reminder instants. If travelers complain, add a per-user timezone lock toggle; one column, one guard in the sync.
9. **Verified email presence.** Assumed every allowed Google sign-in supplies a verified email (unverified ones are rejected outright). If Workspace edge cases surface, the rejection page is the containment.
10. **Floating due_time across timezones.** Accepted that a shared 15:00 reads as each member's local 15:00. If cross-timezone coordination becomes a real use case, a per-task timezone column is the v2 change; storage stays floating.
11. **Postgres 15 or later.** Assumed for the column-targeted ON DELETE SET NULL in 4.5; on older engines the member-removal transaction alone enforces the unassignment, which 8.8 already performs.
12. **Invite non-expiry.** Assumed safe because acceptance is login-gated with no secret in the link. Revisit trigger: any report of confusing stale grants; the change is a status sweep job plus an expires display, no schema change.
13. **UNTIL-only recurrence ends.** COUNT stays unsupported. If demanded, it requires a durable occurrence ordinal on the series; that is a schema addition, deliberately deferred.
14. **Landing copy.** Final wording is the designer's; the binding constraint is section 9.2's no-AI-claim rule.