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

Timezone: every view endpoint takes tz, an IANA identifier, 422 naming the field if it is invalid or absent. Idempotency: GETs are safe; PUT and DELETE are idempotent; status transitions are idempotent by the no-op rows of 5.1; POST creations are not idempotent and clients must disable double submit.

The absent half of that sentence was escalated at the P4 change control and entered by owner ruling on 2026-08-07; this section had named only the invalid one. A view endpoint called without tz is missing a required parameter rather than accepting a default: 8.1 makes tz an input of every request that evaluates dates, and the only plausible default, UTC, would hand most of the world the wrong day with nothing on the wire to say it had been substituted. 7.1's treatment of the same parameter is the opposite and stays so, an unparseable zone on GET /auth/google being read as absent rather than refused; that section records it as a deliberate deviation so a stale zone database cannot lock anyone out of signing in, and it does not generalize past sign-in.

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

The email field of GET /me is nullable, settled at the P5 shape review and entered by owner ruling on 2026-08-10. 4.1's column is nullable because 8.10's scrub empties it, and this response reports the column: a live account always has an address, since provisioning always writes one and /me answers only for rows with deleted_at null, but nothing in this section excludes a scrubbed row the way 7.3 excludes soft-deleted users from its list, so the shape does not promise what the section does not. 7.3 reaches the opposite conclusion about the same column for that reason, and the difference between the two is deliberate; each shape states what its own endpoint guarantees rather than agreeing about a column neither of them is.

### 7.2 Settings

- GET /me/settings. { show_important, show_all, show_done }.
- PATCH /me/settings. Any subset of the three booleans. Hidden pages are a navigation preference only; no data changes. 200.

Response body, escalated from the P2S opening session and entered by owner ruling: PATCH /me/settings answers the GET /me/settings object, the same fresh-GET convention 7.1 carries on PATCH /me and 7.4 carries on each of its mutations.

### 7.3 Connections (roster)

- GET /connections. List of { user: {id, display_name, avatar_url, email}, connected_at }, excluding soft-deleted users. Sorted display_name ascending, id.
- DELETE /connections/:userId. Either side may call. Deletes the pair row; both rosters lose the entry; existing memberships untouched. 204; 404 if no such connection.

The roster element's email is not nullable, settled at the P5 shape review and entered by owner ruling on 2026-08-10, and it is the one person shape in this contract that carries an address at all. The exclusion this section's own bullet states, "excluding soft-deleted users", is what makes the field total: 8.10's scrub is the only thing that empties 4.1's column, and a scrubbed account is soft-deleted and therefore absent from this list. Stating it in the shape rather than leaving it to the query is deliberate, because it is what makes a lost deleted_at filter a failure rather than a null. 7.1 types the same column nullable for the converse reason, that section carrying no equivalent exclusion; the asymmetry is intended and neither reading generalizes to the other.

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

The bare invite to an existing connection, escalated at P5's mid-package change control and entered by owner ruling on 2026-08-09: POST /invites answers 409 "already connected" when the email belongs to a roster connection of V and no folder is attached, and creates nothing. The conversion clause in the bullet above is therefore folder-conditional, and is written that way in V-INV; the instant share it describes creates a membership, only a folder defines one, and the clause had stated its connected-email condition without naming a folder, so the bare case had no specified outcome at all. This paragraph carries the rule rather than the bullet being rewritten, the shape 7.2 and 7.4 took for the same reason: the bullet text that rulings and tests already quote stays byte-identical.

The refusal is symmetrical with the 409 this section already enumerates one clause earlier, for a folder invite whose target is already a member. Each answers a request whose whole purpose already holds, membership there and connection here. Two alternatives were before the owner and were not taken. Answering 200 with nothing created would introduce a third outcome for this endpoint, where 5.2's create row either parks an invite with one email sent or refuses, and it is the one answer the inviter cannot read: nothing enters the pending list that 8.7 makes visible precisely so a stranded invite can be repaired, and the roster already held the person, so a sent invite and a no-op look identical. Falling through to the ordinary 201 would park a row whose acceptance is an idempotent no-op under INV-9, mail "invited you to connect" to somebody already connected, and surface it through Q12 at their next login. The principle separating this from the 10.3 cap ruled at the same package's kickoff, where an invite against a full folder still parks: refuse when the request can accomplish nothing, permit when it can accomplish something later, since a parked invite becomes acceptable the moment a member leaves while a bare invite to a connected person can never become anything.

Response shapes, settled at the P5 shape review and entered by owner ruling on 2026-08-10, the same way 7.4's four shape sentences were entered at P2. This section names four objects without enumerating them, and each is settled below against the route that answers it.

The object inside 201 { invite } and the element of GET /invites/sent are one object: { id, email, folder_id, folder_name, task_id, status, created_at, last_sent_at, responded_at }. The rows GET /invites/sent lists are the rows POST /invites creates, and this section's own "any status" for that list is only meaningful if status is a field of them. It is four fields wider than 7.4's pending_invites element, which is not a divergence between the two: the folder detail's list is scoped to one folder and to pending rows, where folder_id, folder_name, status and responded_at would each be constant. accepted_by is deliberately absent, being a bare user id this surface offers no person shape to render.

POST /invites/:id/decline, /cancel and /resend each answer that same object in that same wrapper, { invite }. This section gives each of them "200." and no body, so the convention decides: a mutation answers what a fresh GET would, as PATCH /me does in 7.1, PATCH /me/settings in 7.2, and each 7.4 mutation, and the fresh read of a settled invite is the sent-list element.

The conversion answers 200 { converted_to_share: true, membership }, the membership being the member element of 7.4, which is what POST /folders/:id/members answers. The conversion is 8.7's grant and so is that endpoint, so one concept answers one object; the second half of this section's "membership created" is the effect, and membership is the key that reports it.

The folder inside the acceptance response is the full Folder object of 7.0, what a fresh GET would give, and null when no folder was granted. This is 7.4's reading and deliberately not the {id, name, is_default} stub ruled for 7.10's grouped views on 2026-08-07, and the two rulings do not conflict because they answer different questions. That one reasoned that a group heading needs what a card's folder label needs, and that Folder's counts, is_owner, member_count, my_label and my_color are 7.4's business where a client that wants them already goes. An acceptance is not a heading. It is the moment a client acquires a folder it did not have, and those five are exactly what it then needs and has no other way to learn from this response, so the stub would force a second request for a folder the client learned about one line earlier. Neither reading generalizes to the other surface.

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
- POST /tasks/:id/complete?tz, /uncomplete, /abandon?tz, /restore. Transitions per 5.1 with its guards and no-ops; complete and abandon run generation when a rule is present; uncomplete and restore apply G-SERIES. Responses: 200 { task: TaskDetail, generated_task: TaskCard or null, deleted_successor_id or null }.

The move refusal above was narrowed at the P3 shape review and entered by owner ruling: it reads 404 where it read "404 or 422". A 422 for a target folder the caller is not a member of confirms that the folder exists, which is the existence leak this section's own 404 rule and the chokepoint of 10.2 are built to prevent, so the wider text admitted what the rest of the surface forbids. No response gains or loses a field; one of two admitted statuses is withdrawn.

The tz query parameter on the two generating transitions, escalated at the P6 kickoff and entered by owner ruling on 2026-08-10. POST /tasks/:id/complete and POST /tasks/:id/abandon take tz, an IANA identifier, validated the way every other zone this contract accepts is. It is optional in shape and required in effect exactly where a date is evaluated, which is two rules rather than one. A present value that fails that validation answers 422 naming tz, always, on either endpoint and whatever the row holds, because 7.0 refuses a value outside what a parameter admits rather than narrowing it to a default. An absent one answers 422 naming tz exactly when the transition would run generation, which is the winning guarded update of 5.1 landing on a pending row that carries a recurrence_rule; the transaction changes nothing, so the row does not transition, no successor is created, and the same call retried with a zone gets the transition it asked for. Every other call these two endpoints serve is untouched, because a row with no rule evaluates no date and neither do 5.1's no-ops and conflicts: a repeat complete on a settled row and a complete on an abandoned one answer what they always answered. POST /tasks/:id/uncomplete and POST /tasks/:id/restore gain nothing, the shape frozen 7.8's DELETE has, because G-SERIES reads the shape of a series and evaluates no calendar date.

Why it was missing and what it cost. 8.5 computes the successor from cutoff = max(t.due_date, current_date(actor.tz)), so these two endpoints decided a calendar date while carrying nothing from which that date could be computed. The only zone an endpoint without tz can reach is users.timezone, and 8.1 reserves that column for reminder fire instants alone. This is 7.8's defect a second time in a different endpoint group, and the one difference is when it was caught. The pull's cost was measured: an entry dated in the account's zone while My Day grouped it by the request's, and a P4 acceptance failure in CI at 22:00 UTC on a suite that had passed an hour earlier. Here nothing is built yet, because P3 deferred the recurrence_rule arm of the two write bodies above with the validator it needs, so no row this API can create carries a rule and no implementation has read a zone here. What it would have cost is the pull's cost compounded one step: a traveler's completion would place the successor from the zone they left, so the skipped slot of a late close and the kept alignment of an early one would each land a day out for part of every UTC day, and AC-072 to AC-075, which pin exactly those relationships, would have been written against a boundary the request could not state.

No other text moves, frozen or otherwise. 5.1's table names generation as a side effect of complete and abandon and names no parameter, so it reads correctly once the request carries one, and 7.0's tz sentence stays scoped to view endpoints: the rule is stated here rather than by widening that sentence, which is the reason 7.8 gave for stating it on the pull, a transition being no more a view than a pull is. No response gains or loses a field, and no acceptance criterion is invalidated: nothing in the repository transitions a row carrying a rule, the suite's one rule-carrying fixture being seeded directly and only ever PATCHed, so nothing that passes today asserts a call these paragraphs change.

### 7.7 Steps

- POST /tasks/:id/steps. { title, position optional (defaults to max plus 1) }. 422 over 50. 201.
- PATCH /steps/:id. { title, done, position } any subset. 200.
- DELETE /steps/:id. 204.
All require membership of the parent task's folder (404 otherwise). No effect on task status ever.

Response bodies, settled at the P3 shape review and entered by owner ruling: POST /tasks/:id/steps and PATCH /steps/:id each answer the affected TaskDetail, which is what a fresh GET /tasks/:id would give, the same convention 7.1 carries on PATCH /me and 7.2 and 7.4 carry on each of their mutations. A step is not a resource this contract shapes: 7.0 gives it no object of its own and this section offers no GET for one, while a step mutation moves steps_done and steps_total as well as the steps array, so the parent task is the only object that reports what the call did. POST therefore answers 201 with that task rather than with the step it created, and the created step rides in the steps array carrying the id and position the server assigned it. DELETE /steps/:id keeps the 204 above and carries no body.

### 7.8 My Day membership

- POST /tasks/:id/my-day?tz. Inserts entry (task, V, added_on = today(V)); repeat calls are 200 no-ops keeping the original added_on (INV-12). 404 if not accessible.
- DELETE /tasks/:id/my-day. Removes V's entry; 200 even when absent (idempotent). The task remains in My Day when it still qualifies automatically.

Response bodies, settled at the same review and entered by the same ruling: both calls answer the affected TaskDetail. A My Day entry is no more a resource here than a step is, and a pull moves pulled, which 7.0 makes a field of the task rather than of the entry, so the task is again the only object that reports the change. The statuses above are unchanged, on the repeat no-op and the absent-entry delete alike.

The tz query parameter on the pull, escalated at the P4 merge review and entered by owner ruling on 2026-08-08. It is an IANA identifier, and an absent or invalid one answers 422 naming tz, the same treatment 7.0 gives the parameter on every view endpoint; the rule is stated here rather than by widening 7.0's sentence, because this is a mutation and 7.0's sentence is about views. DELETE gains nothing: it evaluates no date.

Why it was missing and what it cost. This endpoint required added_on = today(V) while carrying nothing from which today(V) could be computed, and 8.1 defines today(V) as the current date in tz, the zone the request carries. The only zone an endpoint without tz can reach is users.timezone, which is what the P3 implementation used, and 8.1 reserves that column for reminder fire instants alone. The consequence was not theoretical: the pull dated the entry in the account's zone while My Day grouped it by the request's, so for a large part of every day a task pulled now appeared under Carried rather than Today, and the P4 acceptance suite failed on it in CI at 22:00 UTC while passing an hour earlier. The alternative reading, letting the pull keep the account's zone and saying so, was rejected because it blesses that defect rather than fixing it: the two zones still disagree, the row still lands in the wrong group, and the criteria asserting a user-visible behavior would have had to be weakened to match.

Frozen 4.7 needs no amendment and gets none. Its column note reads "the adder's local date at pull time", which names neither a zone source nor a mechanism, and once the request carries the zone that phrase reads correctly and more accurately than before: the adder's local date is the date where the adder now is, which is what tz reports and what a stored users.timezone can only approximate, since 8.1 has travel move today. The same holds for INV-12's "the adder's timezone at insert time". The implementation followed 4.7 rather than deviating from it, having no other zone within reach.

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

Response body, escalated at the P4 kickoff and entered by owner ruling on 2026-08-07: GET /folders/:id/tasks answers { scheduled: [TaskCard], unscheduled: [TaskCard], truncated } on section=open, and { days: [{date, rows: [TaskCard]}], next_cursor } on section=completed. This was the one body of the nine this section described without naming, and the keys are the ones the other eight already use for the same things: truncated because section 6's cap rule covers folder open sections and one flag is the only way this contract reports it, days and next_cursor because Q7's third section is Q6 entire and Q6 is what GET /views/done answers. Nothing here is new behavior; a body that was described in prose is now enumerated like its neighbors.

Two further readings, escalated at the P4 change control and entered by owner ruling on the same date. The folder inside groups: [{folder, rows}], and inside the tasks_groups of GET /views/all, is the {id, name, is_default} stub 7.0 gives every TaskCard, not the Folder object of 7.0's third shared schema. A group heading needs exactly what a card's folder label needs and no more: Folder's counts are the per-folder computation of 8.11, which Q2 does not do and which no grouped view asks for, and its is_owner, member_count, my_label and my_color are 7.4's business, where a client that wants them already goes. The two keys spell one thing, so they answer one shape. And section on GET /folders/:id/tasks defaults to open when absent, rather than being required: Q7 renders its completed section collapsed, so open is the state the page opens in, and the enumeration above names it first.

The cursor's contract, escalated from the P4 shape review and entered by owner ruling on 2026-08-07, in three clauses. A cursor is opaque: a client sends back the next_cursor it received, byte for byte, and reads nothing out of it. The encoding is deliberately not part of this contract, because a client that decodes one has taken a dependency on the sort keys of Q6 and Q8, and section 6 revised one of those at this package's own change control. A null next_cursor means the list ended; it is the only end-of-list signal, and an empty page is not one. And a cursor an endpoint did not issue answers 422 naming cursor, never a silent first page: answering 200 with page one turns a client's bug into wrong data, because the caller is handed rows it has already seen while the rows it was paging toward never arrive, and nothing on the wire says so.

A cursor's kind names the order it pages, not the endpoint that issued it. A completed cursor is portable between GET /views/done and section=completed on the folder page, because section 6 defines Q7's third section as Q6's predicate, order and pagination scoped to one folder, which is the same order and therefore the same cursor. What 422 refuses is a value this contract never minted or one whose kind does not match the order being paged, not a well-formed completed cursor arriving at the second of the two endpoints that page that order.

One rule covers both that refusal and section: a query parameter this section enumerates, given a value outside what it enumerates, is a validation failure answering 422 naming the parameter, and is never quietly narrowed to a default or to the nearest legal value. Absent and wrong are different states. Where this section gives a parameter a default, as it does for section, the default answers absent alone; section=completed misspelled would otherwise be handed the open body, so a typo becomes a shape the client discovers by breaking on it instead of a 422 that names the field. Ratified with the same ruling for AC-058's reading, which the acceptance suite had twice recorded as its own reading rather than as settled text.

### 7.11 Server-authoritative versus client convenience

Server-authoritative, always revalidated regardless of client behavior: every permission cell of 5.4; membership scope on every query; assignee membership and INV-5 forcing; the date-dependency rules and clear-date cascade; status transitions, G-SERIES, and generation; invite validations, matching, throttles, and rate limits; all input limits of 10.3; sort orders of section 6; today evaluation given tz; reminder computation and delivery decisions.

Client conveniences with no authority, each shadowed by a server rule: disabling due_time, reminder, recurrence inputs until a date exists; hiding the assignee field in single-member folders; filtering the assignee dropdown to members; pre-filling defaults per entry point; warning dialogs before destructive calls; disabling double submit. Any rule found only in the client and not in this section's server list is a specification violation. As specified, there are none.
