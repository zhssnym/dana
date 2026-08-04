## 12. Acceptance criteria

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

**Auth security (P1; added by amendment on 2026-07-29, numbered additively so no existing number changes)**

These belong to package P1 alongside AC-005 to AC-010. Rationale: with no human review on this project, the acceptance tests are the only reviewer of the authentication module (11.6), and AC-005 to AC-010 test provisioning behavior, not security properties. In tests, the Google endpoints are a local stub OIDC provider so requests and tokens can be crafted.

- AC-105 Given an OAuth callback whose state does not match the value issued for this browser, when it is processed, then sign-in fails, no session exists, and no user row was created or modified.
- AC-106 Given an ID token whose nonce does not match the pending authorization's nonce, when the callback validates it, then sign-in fails.
- AC-107 Given an authorization request, when it is issued, then it carries a PKCE S256 code challenge, and a token exchange with a non-matching verifier fails.
- AC-108 Given a session identifier that existed before sign-in, when sign-in completes, then the authenticated session uses a newly issued identifier and the old identifier grants nothing.
- AC-109 Given crafted return-target parameters or Host headers on the auth endpoints, when they respond with redirects, then every redirect target is on the application origin.
- AC-110 Given the session cookie, when inspected, then it is httpOnly, Secure, and SameSite=Lax, and its value is an opaque identifier carrying no session data.
- AC-111 Given a mutation with a valid session cookie but a missing or mismatched X-CSRF-Token header, when processed, then 403 and no change; given the session's own token, then the mutation proceeds.
- AC-112 Given a user with two active sessions on different clients, when DELETE /me completes, then both sessions answer 401 immediately.
- AC-113 Given a session past its 30-day expiry, when presented, then 401; given a session used before expiry, then its expiry extends (rolling).
- AC-114 Given a production build, when the development login route is called, then it does not exist (404), regardless of environment variables.
- AC-115 Given a completed sign-in, when the database is inspected, then no Google access, refresh, or ID token is stored anywhere.
- AC-116 Given GET /me or PATCH /me answers 200, when the body is inspected, then it is exactly the 7.1 object: the same keys and shapes, nothing extra, nothing missing.
- AC-117 Given any request the mounted surface answers with a 4xx status, when the body is inspected, then it carries the 7.0 envelope with error.code and error.message both non-empty strings.
- AC-118 Given a body that does not parse as JSON, parses to something other than an object, or exceeds the parse limit, when any endpoint receives it, then 400 in the envelope and no side effects; given a parsed object carrying a wrong-typed field, then 422 naming the field; given unknown fields beside valid ones, then they are ignored and the request is processed as if they were absent.
