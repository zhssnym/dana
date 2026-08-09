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

Two of these are asserted by their content rather than at the instant they name, ruled at P4 mid-package change control on 2026-08-07 and recorded here because neither criterion's text changes. AC-046's "on every subsequent day" and AC-050's named instant both require owning the clock, and the acceptance suite deliberately does not: faking it would decide, on behalf of an implementer who has not yet written a line, that today(V) is read from the process clock rather than from the database, which 8.1's "the server computes it" admits either way, so the test would fail against half of the correct implementations. AC-046 is asserted as the property its clause follows from, that Q1's predicate carries no upper bound on how far past a due_date may be and that 8.2's qualify_date minimum keeps a pulled overdue row in Carried. AC-050 keeps the criterion's structure, one task and one instant read under two zones landing in two groups, with a zone pair whose offsets differ by exactly 24 hours and which observes no DST, so the relationship holds at every instant instead of in the few hours a day when Karachi and London happen to differ; the named pair is asserted too, in both directions available without the clock. Neither criterion is reinterpreted. The clock is the only thing given up, and it is given up because owning it would test the implementer's choice rather than this specification's rule.

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
- AC-118 Given a body presented as JSON that does not parse, parses to something other than an object, or exceeds the parse limit, when any endpoint receives it, then 400 in the envelope and no side effects; given a parsed object carrying a wrong-typed field, then 422 naming the field; given unknown fields beside valid ones, then they are ignored and the request is processed as if they were absent.

**Settings (P2S; added by amendment on 2026-08-04, numbered additively so no existing number changes)**

These belong to package P2S, the frozen 7.2 endpoints GET and PATCH /me/settings, which RFC 0001 scheduled after the P2 merge because no original row claimed them. The Adversarial Test role authored them with their tests on the package branch; they are transcribed here unchanged.

Two readings of frozen 7.2 they rest on, both grounded in the P2 merge's ratified any-subset reading of section 7's PATCH conventions. The empty subset is a subset: a body carrying none of the three fields answers 200 and changes nothing, and an implementation refusing it with an at-least-one-field rule is refusing a body the frozen sentence admits. Null is a wrong-typed value here rather than a clear: 4.10's three columns are NOT NULL booleans with defaults, so there is nothing to clear back to, unlike the label and color of 7.4's my-membership, which the frozen text itself marks nullable. The frozen sentence is unchanged in both cases; the reading is the record.

- AC-119 Given a fresh account, when GET /me/settings, then 200 and the body is exactly the three 7.2 booleans at their 4.10 defaults: show_important true, show_all true, show_done false, nothing extra, nothing missing.
- AC-120 Given PATCH /me/settings with any subset of the three booleans, the empty subset included, then 200, present fields take the sent values, absent fields keep theirs, and both GET /me/settings and the settings key of GET /me read the new values afterwards.
- AC-121 Given PATCH /me/settings carrying a non-boolean value for any of the three fields, null included since 4.10 admits no null state, then 422 naming the field and no setting changes.
- AC-122 Given two users, when one PATCHes their settings, then the other's stored settings and GET bodies are unchanged.
- AC-123 Given tasks of every status with steps, My Day entries, and reminders in the viewer's folders, when the viewer PATCHes any of the three toggles, then no row outside user_settings changes: hidden pages are a navigation preference only.

**Limit enforcement under concurrency (P3 gate; added by amendment on 2026-08-07, numbered additively so no existing number changes)**

This rides package P3's merge gate beside AC-025 to AC-044, the way AC-116 to AC-118 rode P2's. It exists because the P3 merge review found one defect in three places: the guards for 10.3's step, member, and custom-folder caps each counted outside the write the count admitted, so two callers arriving together at the limit both passed and the stored count went one past it. Two of the three were in code merged at P2, and the repairs landed on P3's branch. Section 10.3 calls these numbers server-enforced, and a cap two callers walk through is not enforced.

The criterion exists rather than the repairs standing alone because those repairs are otherwise proven only by a statement-order probe inside the implementing module, which is the implementer attesting to their own work: the arrangement protocol section 8 and the team's first structural rule exist to prevent. It is also backend-agnostic where that probe is not, and it would have caught all three defects.

One reading it rests on, recorded because the test's shape turns on it: on a single-connection backend the interleaving that produces the breach is likely but not guaranteed, so the criterion asserts the outcome rather than asserting that a breach was attempted. A run in which the two requests serialize completely satisfies it for the same reason an interleaved run does, that the limit held and one caller was refused.

- AC-124 Given two concurrent requests that would each take a 10.3 count from its limit to one past it, a 51st step, a 26th member, a 201st custom folder, then exactly one succeeds, the other is refused 422, and the stored count equals the limit.

**Views and search, uncovered surfaces (P4; added by amendment on 2026-08-07, numbered additively so no existing number changes)**

These ride package P4's gate beside AC-045 to AC-058 and AC-070. The RFC 0001 P4 row named three surfaces the package delivers that no criterion in any range covered, and said its list of three was a floor rather than a ceiling. The Adversarial Test role authored six with their tests on the package branch: AC-125, AC-127, and AC-129 close the three the row named, and AC-126, AC-128, and AC-130 were found under that sentence. They are transcribed unchanged but for the leading capital this section's style takes.

Numbering additively is the Integration Steward's, as AC-116 to AC-118, AC-119 to AC-123, and AC-124 each were. An appended number changes no existing number and therefore invalidates no criterion, which is what puts it here rather than with the human owner; what is the owner's is the frozen text of sections 4 and 7, and none of these six moves any of it. The proposing session recorded the opposite belief, that numbering is the owner's, and it is corrected here rather than left standing in the test headers alone.

Each of the six exists because a number stated in the specification is asserted nowhere. Three are in 10.3's table of server-enforced limits: the calendar's 62 days, search's 2 to 100 characters, and the 1000-row cap with its flag. One is search's page size of 20, set in Q8 and distinct from Done's keyset in key, page size, and status set, so an implementation can page Done correctly and search by OFFSET with nothing noticing. One is the calendar's real rows, which are the only 7.10 endpoint's answer left unasserted once AC-045 to AC-058 land, AC-082 belonging to P6 with the projection it draws. And one is 7.0's tz rule, which every endpoint of this package carries and which AC-007 currently teaches backwards, that section recording a deliberate deviation for sign-in alone.

Two readings of section 6 they rest on were ruled at the same change control and are recorded in section 6 itself rather than here: the 1000-row cap is per response rather than per array, which AC-129 asserts and which the proposing session routed for exactly this ratification; and status_rank's third rank is completed = 2 wherever a query admits completed, which Q3C had used without saying. AC-126 orders only the two ranks the preamble already defined and asserts presence for the third, so the second ruling tightens the specification without moving the criterion.

- AC-125 Given GET /views/planned/calendar with end minus start greater than 62 days, then 422 naming the range; given exactly 62 days, then 200.
- AC-126 Given tasks due inside and outside an accepted calendar range in all three statuses, when GET /views/planned/calendar, then real carries exactly the accessible rows due within the inclusive bounds, in all three statuses, ordered all-day banners before timed rows within each date.
- AC-127 Given more than 20 accessible tasks matching a query, then GET /search answers 20 rows with a next_cursor, and the cursor's page carries the rest in Q8's order with no overlap and no gap.
- AC-128 Given a search query that is shorter than 2 or longer than 100 characters after trimming, then 422 naming the field; given 2 and given 100, then 200.
- AC-129 Given more than 1000 rows qualifying for a capped list, then the response carries at most 1000 of them and truncated is true; given fewer, then every row is present and truncated is false.
- AC-130 Given any view endpoint called with a tz that is not a valid IANA identifier, or with no tz at all, then 422 naming the field; given a valid one, then 200.

AC-130 gained its absent half on 2026-08-07, when the owner ruled that a view endpoint called without tz answers 422 the same as one called with a bad tz, and 7.0 was amended to say so. The criterion is widened rather than a new number appended because it is one rule of 7.0, that every view endpoint takes tz, and the ruling made its two failures one answer; the number does not move, nothing already written cites the narrower text, and the test the number owns has not yet run green. The widening is not cosmetic. An implementation that reads tz through a schema with a UTC default satisfies the invalid half exactly, because a value that is present and wrong still reaches the validator, while an absent one never does; the defect the ruling exists to prevent is therefore invisible to the criterion as it was first written. Extending the test is the Adversarial Test role's, and is routed to the session that holds this range.

**Q8's literal wildcards (P4; added by amendment on 2026-08-07, numbered additively so no existing number changes)**

The escaping rule was a silence when the six above were authored, and it stopped being one at the same change control that ruled it: Q8 now says a backslash, percent, or underscore inside q is escaped before interpolation, so a search for "50%" matches those three characters rather than everything containing "50". The Adversarial Test role asserted it as three adversarial cases inside AC-057 rather than under a number, judging it a property of Q8's predicate that AC-057 already measures, unlike the six, each of which closes a number the specification states and nothing asserts. It offered to move the three unchanged if the Steward preferred a number, and the Steward does.

The grounds are the role's own standard rather than a different one. A rule the specification states and no numbered criterion asserts is exactly what the six were admitted under, and escaping became such a rule the moment it entered section 6; before the ruling it was a silence, which is why the judgment was right when it was made and is superseded by the ruling rather than by a disagreement. What a number buys is small and durable: section 12 is the definition of done, and a reader of it should be able to see that this behavior is required without reading a test file to discover it. What it costs is one number and a file move, the tests themselves unchanged, since the role wrote them to stand alone.

The backslash case is the one worth naming here, because it fails in the opposite direction from the other two and was measured against real Postgres rather than reasoned about. An unescaped percent or underscore returns an extra row. An unescaped backslash is read as LIKE's own escape character, so the pattern finds the row without the backslash and misses the row the user typed: a leak that loses the right answer instead of adding wrong ones, and the harder of the two to notice in use.

- AC-131 Given a search query containing a percent, an underscore, or a backslash, then those characters match themselves and the row carrying the literal character is returned while the row that only satisfies the wildcard reading is not.

**The My Day pull's zone (P4; added by amendment on 2026-08-08, numbered additively so no existing number changes)**

This rides P4's merge gate. It exists because the defect that held that merge survived three packages unseen: frozen 7.8 said `added_on = today(V)` and 8.1 said today(V) comes from the request's tz, but the pull took no tz, so the implementation read `users.timezone` and nothing in this section could tell the difference. The two civil dates differ for a large part of every UTC day, so a pulled task landed in Carried instead of Today and AC-047 and AC-048 failed whenever a run crossed that window. Four sessions carried it as a non-deterministic failure that was never load-dependent and never backend-dependent, only clock-dependent. The owner ruled tz onto 7.8 on 2026-08-08; this is the guard that would have named the defect on its first run, authored at the Steward's recommendation and numbered here.

One case is why it is a number rather than an assertion inside AC-047. Two tasks pulled at one instant under two different tz values must receive `added_on` values exactly one calendar day apart, which is impossible for any implementation reading the zone from anywhere but the request: `users.timezone` is one value, the process clock is one value, the database clock is one value, and each yields the same civil date for both calls. The zone pair is Pacific/Kiritimati and Pacific/Honolulu, whose offsets differ by exactly 24 hours with neither observing DST, so the one-day gap holds at every instant rather than inside a window. No clock is owned and no run time is assumed, the same discipline AC-046 and AC-050 are asserted under.

- AC-132 Given POST /tasks/:id/my-day with tz, then added_on is today in that zone rather than in the account's stored zone, and the pulled task appears in the Today group of a My Day read in the same zone; given an absent or invalid tz, then 422 naming the field and no entry is written.

**Account deletion and the sharing derivations (P5; added by amendment on 2026-08-09, numbered additively so no existing number changes)**

These ride package P5's merge gate beside AC-059 to AC-069. The Adversarial Test role authored eight with their tests on the package branch and proposed their numbers in the file headers; assigning them is the Integration Steward's, as AC-116 to AC-118, AC-119 to AC-123, AC-124, AC-125 to AC-130, AC-131, and AC-132 each were. An appended number changes no existing number and therefore invalidates no criterion, which is what puts it here rather than with the human owner. The eight are transcribed unchanged but for the leading capital this section's style takes, and the transcription was checked against the eight test files rather than against the proposal text alone.

Six of them close the account deletion transaction of 8.10, routed here by the RFC 0001 P5 row's kickoff decision of 2026-08-09. Its steps are covered by no criterion in any package: AC-009 pins the confirm string and AC-112 the session revocation, and the P1 stub already satisfies both, so a transaction that lands whole in this package would otherwise arrive with its ordered steps proven by nothing. The six take one step's observable outcome each, AC-137 taking steps 5 and 6 together, because both outcomes are an absence and step 6 is a remainder sweep whose rows steps 3 and 4 may already have taken.

AC-138 reaches step 7, which the kickoff did not route, and it is admitted rather than trimmed back to the routed six. The scrub is what the P1 stub already does, so that half of it arrives green; what it adds, and what fails today, is the surviving-references sentence the whole ordering of 8.10 exists to protect. History keeps its author while identity is gone, which is what 4.1 stores soft deletion for and what 4.5's RESTRICT on created_by enforces, and no criterion asserted it. The criterion discriminates exactly the two implementations that make deletion easy by breaking it, one that hard-deletes the user row and one that nulls the history columns.

AC-139 closes a derivation the specification states and nothing pinned: 7.0 gives TaskCard a pending_invite_email derived from invites.task_id. P3 asserted the key's presence and could do no more, creating no invites, and `app/tests/README.md` has carried the value as a recorded tolerance since. The read side has computed the field since P3, so it can only ever have answered null, and a derivation that has never answered anything is pinned by no green test.

AC-140 is the sequential half of the kickoff ruling of 2026-08-09, that the 10.3 member cap binds every membership 8.7 grants. The concurrent half rides AC-124's member arm, whose text already names the counted value rather than an endpoint. One reading it rests on is recorded here because the criterion asserts it: an invite created against a full folder is not refused, creation granting no membership, and it is exactly that parked invite whose acceptance the cap then refuses until the folder has room. Refusing creation instead would invent a refusal frozen 7.5 does not enumerate and would contradict the ruling's own ground, that what the cap binds is the grant.

- AC-133 Given a user with pending sent invites, bare and folder alike, when DELETE /me completes, then each is invalidated and gone from its recipient's pending list, while the user's already-terminal invites and invites merely addressed to their email are untouched.
- AC-134 Given DELETE /me by the owner of shared folders, then each survives under the remaining member with the earliest join, ties to the lower user id, the new owner's membership row otherwise unchanged, and the deleted owner's membership and assignments in it are gone.
- AC-135 Given DELETE /me, then the default folder and every owned folder without other members are deleted with the full 8.8 cascade: their tasks of all statuses, steps, My Day entries, reminders, and pending invites carrying them are gone.
- AC-136 Given DELETE /me by a member of others' folders, then each membership is removed through R-CLEAN: their assigned tasks in the folder unassigned, their My Day entries for its tasks deleted, and a folder left with exactly one member has every task in it assigned to that member.
- AC-137 Given DELETE /me, then no connection row contains the user and both former rosters drop them, no My Day entry of theirs remains anywhere, and connections between other users are untouched.
- AC-138 Given DELETE /me, then the user row survives scrubbed, google_sub, email, display_name, and avatar_url null with deleted_at set, and surviving tasks keep created_by and completed_by pointing at it, readable by remaining members with the assignee cleared; an accepted invite keeps its accepted_by.
- AC-139 Given a pending invite carrying task_id, then every TaskCard of that task carries the invite's email as pending_invite_email; given a newer assignment-invite for the same task, then the older invite's task_id is cleared and the card carries the newest email; given no pending invite carries the task, then null.
- AC-140 Given a folder holding 25 members, when an invite that would convert to an instant share is created, with or without a task attached, then 422 naming the cap and nothing is created, neither membership nor invite row nor assignment; when a pending folder invite for it is accepted, then 422, the whole acceptance rolls back leaving the invite pending with no connection made, and the same acceptance succeeds once the folder has room.

Two distinctions the account deletion criteria pin as pairs, recorded because an implementation can satisfy either half alone. A pending invite whose folder survives by transfer is invalidated and keeps its row, which is AC-133's outcome, while one whose folder dies at step 3 is removed by the FK cascade of 5.2's folder-deleted row, which is AC-135's; invalidation is for rows that survive. And step 4 is not new machinery but 5.3's R-CLEAN, which AC-016 and AC-018 already pin for removal and leave, so what AC-136 adds is the caller: an implementation that revokes the memberships without the cleanup, or sweeps My Day entries by user rather than by the folder's tasks, passes both of those and corrupts here.

**The bare invite to an existing connection (P5; added by amendment on 2026-08-09, numbered additively so no existing number changes)**

This rides P5's gate beside the range above. It exists because the human owner ruled on that date that POST /invites answers 409 when the email belongs to a roster connection of V and no folder is attached, and no numbered criterion asserted that edge in either direction, which is a good part of why it stayed open long enough to need a ruling. A rule the specification states and nothing asserts is the standard AC-125 to AC-131 were admitted under, and 7.5 and 8.7 now state this one.

The number is appended rather than AC-061 being widened, and the difference from AC-130, which was widened for what can look like the same reason, is worth stating so neither is read as the precedent for the other. AC-130's two inputs, an invalid tz and an absent one, are one rule of 7.0 whose two failures the owner's ruling made one answer, so one criterion holds both. Here the two inputs take different answers: with a folder the conversion runs, and without one the request is refused. AC-061 is therefore the conversion's folder arm and its text does not move. It is silent on the bare input rather than wrong about it, since its consequent, a membership and a share-grant email, could only ever have described a folder. What the new number adds is the discriminator itself, that the folder is what separates the two outcomes.

Its test is routed to the Adversarial Test role, the way AC-124's was when the Steward appended a criterion from a ruling rather than from a proposal, and P5's merge gate holds for it.

- AC-141 Given an invite whose email belongs to a roster connection of V and which carries no folder, then 409 naming the existing connection, and nothing is created: no invite row, no second connection row, and no email sent; given the same email with a folder attached, then AC-061's conversion runs instead, the folder being the discriminator.
