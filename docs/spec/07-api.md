## 7. API surface

### 7.0 Conventions

Base path /api/v1. JSON bodies. Authentication: server session established by Google OAuth; every endpoint below requires it except the auth endpoints themselves. Mutations require a CSRF token header when cookie sessions are used (section 10.1).

Error envelope: { "error": { "code": string, "message": string } }. Status usage, uniform:
- 400 malformed request: a body that does not parse as JSON, or parses to something other than an object. On a parsed object, unknown fields are tolerated and wrong types are not: they are validation failures answering 422 with the field named. This bullet governs bodies presented as JSON. A request that claims no JSON content type presents nothing to parse, whatever bytes it carries, so an endpoint needing a body answers 422 for the body it did not receive rather than 400 for one it could not read.
- 401 no valid session.
- 403 authenticated, resource visible, action not permitted by the matrix in 5.4.
- 404 resource nonexistent, or existent but not accessible to V. Inaccessible always reads as 404, never 403, to avoid existence leaks.
- 409 state machine violation or rule conflict (section 5 tables name each).
- 422 validation failure (limits in section 10.3), with field errors.
- 429 rate limited (limits in section 10.4), with Retry-After.

Timezone: every view endpoint takes tz, an IANA identifier, 422 if invalid. Idempotency: GETs are safe; PUT and DELETE are idempotent; status transitions are idempotent by the no-op rows of 5.1; POST creations are not idempotent and clients must disable double submit.

Shared schemas:
- TaskCard: { id, title, status, important, due_date, due_time, folder: {id, name, is_default}, assignee: {id, display_name, avatar_url} or null, is_recurring: bool, steps_done: int, steps_total: int, pulled: bool (viewer has a My Day entry), pending_invite_email: string or null (from invites.task_id), created_at, updated_at }.
- TaskDetail: TaskCard plus { notes, recurrence_rule, series_id, reminder: {offset_minutes or time_of_day} or null, steps: [{id, title, done, position}], completed_at, completed_by, created_by }.
- Folder: { id, name, is_default, is_owner: bool, member_count, counts: {pending, completed}, my_label, my_color }.

Two readings of the shapes above, settled at the P3 shape review and entered by owner ruling. Floating values ride the wire in the 4.11 formats they are stored in: due_date as YYYY-MM-DD and due_time as HH:MM, never as instants, because an instant reintroduces the timezone the floating format exists to remove. TaskDetail's reminder carries both 4.8 columns, offset_minutes and time_of_day, with exactly one of the two non-null: "{offset_minutes or time_of_day}" above names the 4.8 mode rather than a key list, and a stable key set is what lets a client read the mode off the values instead of narrowing a union to learn which keys it holds.

### 7.1 Auth and account

All 7.1 endpoints mount under the 7.0 base path like the rest of this section: GET /auth/google is GET /api/v1/auth/google, and likewise throughout. Recorded so the short spellings below cannot be read as root-mounted.

- GET /auth/google. Unauthenticated. Takes an optional tz query parameter, an IANA identifier: the client's detected zone, carried to the callback through the pending-authorization state (11.6), never through redirect_uri and never composed into a redirect target. A value that fails the same IANA validation that guards users.timezone writes (section 4) is treated as absent rather than answered 422, a deliberate deviation from the 10.3 rule: sign-in must not fail over a stale zone database. Redirects to Google with scopes openid email profile.
- GET /auth/google/callback. Establishes the session. First login runs the provisioning transaction: insert user (google_sub, lowercased email, display_name, avatar_url, timezone from the reported tz, UTC when none was reported), insert default folder name "Inbox" with owner membership, insert user_settings row; the whole transaction is idempotent under the google_sub unique constraint (a concurrent duplicate loses and adopts the winner's rows). Every successful login also syncs users.timezone to the reported tz when one was reported and it differs (8.1); a login carrying no tz syncs nothing. Sign-in is rejected with an explanatory page (copy in 9.2) if Google reports the email unverified. Redirects into the app, which immediately surfaces Q12 pending invites.
- POST /auth/logout. Destroys the session. 204.
- GET /me. Returns { user: {id, email, display_name, avatar_url, timezone}, settings, pending_invite_count }.
- PATCH /me. Body { timezone }. 422 if not IANA. Recomputes fire_at for scheduled reminders on tasks assigned to V (section 8.6). 200, returning the GET /me object, so a client that changed the timezone holds the same truth a fresh GET would give it.
- DELETE /me. Body { confirm: "DELETE" }, literal string required, else 422. Runs the account deletion transaction (section 8.10), destroys all sessions. 204. Invariants enforced: INV-1, INV-2, INV-10 survive via transfer-before-delete ordering.

### 7.2 Settings

- GET /me/settings. { show_important, show_all, show_done }.
- PATCH /me/settings. Any subset of the three booleans. Hidden pages are a navigation preference only; no data changes. 200.

Response body, escalated from the P2S opening session and entered by owner ruling: PATCH /me/settings answers the GET /me/settings object, the same fresh-GET convention 7.1 carries on PATCH /me and 7.4 carries on each of its mutations.

### 7.3 Connections (roster)

- GET /connections. List of { user: {id, display_name, avatar_url, email}, connected_at }, excluding soft-deleted users. Sorted display_name ascending, id.
- DELETE /connections/:userId. Either side may call. Deletes the pair row; both rosters lose the entry; existing memberships untouched. 204; 404 if no such connection.

### 7.4 Folders and membership

- GET /folders. All accessible folders as Folder objects. Sort: is_default first, then lower(name), id.
- POST /folders. { name }. Creates folder with owner = V plus owner membership (one transaction). 201 Folder. 422 name length; 422 when V already has 200 custom folders (limit, section 10.3).
- GET /folders/:id. Folder plus members [{user, role, joined_at, is_owner}] plus pending invites [{id, email, task_id, created_at, last_sent_at}]. 404 if not member.
- PATCH /folders/:id. { name }. Owner only (403 otherwise); works for the default folder too (rename allowed). 200.
- DELETE /folders/:id. Owner only. 409 if is_default (INV-2). Executes the deletion cascade (section 8.8). Response 200 { deleted: {tasks_open, tasks_completed, tasks_abandoned} } so the client can confirm what the dialog promised. Invariants: INV-1 via cascade.
- PATCH /folders/:id/my-membership. { label, color }, either nullable. Any member, own row only. 200.
- POST /folders/:id/members. { user_id }. Any member; guards per 5.3 row 1: 409 default folder, 409 already member, 422 no roster connection between V and target, 422 member cap 25. Sends share-grant email. 201.
- DELETE /folders/:id/members/:userId. Three legal shapes per 5.3: owner removes another member; non-owner removes self (leave); owner removes self, which transfers ownership first when other members exist and is 409 "delete the folder instead" when sole member. All run R-CLEAN. 204. Invariants: INV-4, INV-5, INV-10.

Response shapes, settled at the P2 shape review and entered by owner ruling: GET /folders answers the bare array of Folder objects, no wrapper key. The folder detail's invite key is pending_invites, its elements carrying exactly the five fields above. The user object inside a members element is {id, display_name, avatar_url}, the person shape TaskCard's assignee carries, and includes no email. A 7.4 mutation answers what a fresh GET would: PATCH /folders/:id and PATCH /folders/:id/my-membership answer the Folder object, and POST /folders/:id/members answers the members element it created.

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
- PATCH /tasks/:id. Any member. Partial body; only present fields change (field-level last write wins). Special rules:
  - folder_id change is a move: V must be member of both source and target (404); if the current assignee is not a member of the target, assignee becomes null; if the target has exactly one member, assignee becomes that member (INV-5).
  - due_date set to null triggers the clear-date cascade (section 8.4): due_time null, recurrence_rule null, reminder row deleted, in the same transaction.
  - due_date changed (non-null): reminder fire_at recomputed; the series anchor moves with it (section 8.5).
  - recurrence_rule set on a task without one: requires due_date (422) and assigns a new series_id; changed on a current occurrence: replaces the rule from now on, past rows untouched; set null: series ends, row stays a normal task.
  - assignee_id: setting to null is rejected with 409 in single-member folders (INV-5); setting to a non-member fails (422 via composite FK).
  - status is not accepted here (409 if present): transitions have their own endpoints.
  200 TaskDetail.
- DELETE /tasks/:id. Any member. 204. Cascades per 5.1 delete row.
- POST /tasks/:id/complete, /uncomplete, /abandon, /restore. Transitions per 5.1 with its guards and no-ops; complete and abandon run generation when a rule is present; uncomplete and restore apply G-SERIES. Responses: 200 { task: TaskDetail, generated_task: TaskCard or null, deleted_successor_id or null }.

The move refusal above was narrowed at the P3 shape review and entered by owner ruling: it reads 404 where it read "404 or 422". A 422 for a target folder the caller is not a member of confirms that the folder exists, which is the existence leak this section's own 404 rule and the chokepoint of 10.2 are built to prevent, so the wider text admitted what the rest of the surface forbids. No response gains or loses a field; one of two admitted statuses is withdrawn.

### 7.7 Steps

- POST /tasks/:id/steps. { title, position optional (defaults to max plus 1) }. 422 over 50. 201.
- PATCH /steps/:id. { title, done, position } any subset. 200.
- DELETE /steps/:id. 204.
All require membership of the parent task's folder (404 otherwise). No effect on task status ever.

Response bodies, settled at the P3 shape review and entered by owner ruling: POST /tasks/:id/steps and PATCH /steps/:id each answer the affected TaskDetail, which is what a fresh GET /tasks/:id would give, the same convention 7.1 carries on PATCH /me and 7.2 and 7.4 carry on each of their mutations. A step is not a resource this contract shapes: 7.0 gives it no object of its own and this section offers no GET for one, while a step mutation moves steps_done and steps_total as well as the steps array, so the parent task is the only object that reports what the call did. POST therefore answers 201 with that task rather than with the step it created, and the created step rides in the steps array carrying the id and position the server assigned it. DELETE /steps/:id keeps the 204 above and carries no body.

### 7.8 My Day membership

- POST /tasks/:id/my-day. Inserts entry (task, V, added_on = today(V)); repeat calls are 200 no-ops keeping the original added_on (INV-12). 404 if not accessible.
- DELETE /tasks/:id/my-day. Removes V's entry; 200 even when absent (idempotent). The task remains in My Day when it still qualifies automatically.

Response bodies, settled at the same review and entered by the same ruling: both calls answer the affected TaskDetail. A My Day entry is no more a resource here than a step is, and a pull moves pulled, which 7.0 makes a field of the task rather than of the entry, so the task is again the only object that reports the change. The statuses above are unchanged, on the repeat no-op and the absent-entry delete alike.

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

Client conveniences with no authority, each shadowed by a server rule: disabling due_time, reminder, recurrence inputs until a date exists; hiding the assignee field in single-member folders; filtering the assignee dropdown to members; pre-filling defaults per entry point; warning dialogs before destructive calls; disabling double submit. Any rule found only in the client and not in this section's server list is a specification violation. As specified, there are none.
