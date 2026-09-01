## 2. Glossary

Agents must use these exact terms. Each term has one meaning; no synonym introduces a
second one.

- **User**: an account row created at first Google sign-in. Soft-deleted users keep their
  row with identity fields scrubbed and are excluded from every picker and roster. -
  **Viewer (V)**: the authenticated user making the current request. - **today(V)**: the
  current calendar date computed in the IANA timezone the client sent with the request. -
  **Floating date / floating time**: a calendar date or wall-clock time stored without
  timezone. Every member sees the same digits; each evaluates them in their own timezone.
  - **Workspace**: the derived view a user has of the system: their roster plus their
  accessible folders. Not a stored entity; there is no workspace table. - **Roster
  connection**: a symmetric link between two users, one row per unordered pair, created by
  invite acceptance. Grants nothing except the ability to share folders without a new
  invite. - **Folder**: the single organizing primitive. Holds tasks, never other folders.
  Has exactly one owner and one or more members. - **Default Folder / Desk**: the one
  folder per account created at signup, initial name "Desk" (accounts created before RFC
  0005 had "Inbox"; the migration renames only defaults still carrying that name). Cannot
  be shared, deleted, or left; always exactly one member, its owner; never on a shelf. -
  **Owner**: the user a folder's owner_id names. Holds the destructive rights of section
  5.4. Ownership transfers only via the rules in section 8.9. - **Member**: a user with a
  membership row for a folder. Owners are also members. - **Accessible folder (to V)**: a
  folder where V holds a membership row. The universal scope filter of every query. -
  **Task**: a row with a title, exactly one folder, and a status in {pending, completed,
  abandoned}. - **Open task**: a task whose status is pending or abandoned. Open tasks
  populate Anytime, Scheduled, All, and Important. - **Home**: the view a task belongs to
  by derivation: Anytime when due_date is null, Scheduled when set. Never assigned
  manually. - **View**: a page that queries tasks without being their home: Today,
  Assignments, Important, All, Done, Abandoned. A view is pinned or unpinned per the pin
  list of 9.7. - **Assignee**: the single member a task is assigned to, or null
  (unassigned). Must be a member of the task's folder. - **Step**: a checklist row inside
  a task: title, done flag, position. No dates, no assignee. - **Pull into focus**: the
  manual act of adding a task to the viewer's own Today, stored as a Today entry. -
  **Today entry**: a row (task_id, user_id, added_on) recording a pull. Personal to one
  user. Stored in the table 4.7 names my_day_entries, which keeps its name; a stored
  identifier is not display copy. - **Snowball**: the property that a qualifying Today
  item keeps appearing every day until completed or abandoned; nothing leaves Today by
  time passing. - **Carried**: the Today group for items whose qualify date is before
  today; the complement is the Today group. - **Recap**: Today's collapsed section of
  tasks completed today. - **Abandoned**: the status meaning given up: excluded from Today
  and Done, visible faded in its home, All, and Important, restorable. Abandoned is also a
  page of its own in v2, unpinned by default, listing exactly those rows. - **Restore**:
  the transition abandoned to pending. Dates are untouched. Not to be confused with
  restoring from Trash, which returns a deleted row to whatever status it held. -
  **Series**: the chain of task rows produced by one recurrence, linked by series_id.
  Exactly zero or one pending row per series. - **Occurrence**: one task row of a series.
  The **current occurrence** is its only pending row and the only row carrying the rule. -
  **Recurrence rule**: an RFC 5545 RRULE string (subset, section 4.11) stored on the
  current occurrence, anchored at that row's due date. - **Virtual instance**: a computed
  calendar marker for a future rule instance, never stored, strictly after the current
  occurrence's due date. - **Reminder**: at most one per task: an offset before the due
  instant (when a stored due_time exists) or a time on the due date, the only mode v2
  interfaces create, delivered by email to the assignee. - **Invite**: a pending grant
  addressed to an email, optionally carrying a folder and optionally an intended
  assignment (task_id). - **Completion count**: per folder, completed over (pending plus
  completed), abandoned excluded, identical for every member. - **Shelf**: a per-user
  container arranging folders, stored as 4.18 plus the member's label of 4.4, held in step
  by the API. Private by construction: no members, no sharing. - **Shelf page**: a shelf's
  own page of blocks and folder references (4.17), one per shelf, the viewer's alone. -
  **Page block**: one ordered unit of a folder or shelf page: a section, a paragraph, an
  image, or (shelf pages only) a folder reference. - **Event**: one recorded act (4.13):
  actor, verb, subject, time. The source of history, Activity, and notifications. -
  **Notification**: an event fanned out to a recipient with a read state (4.14). -
  **Trash**: where deleted tasks and folders wait 30 days (deleted_at), restorable by
  anyone with access to the object, then purged. - **Workflow file**: an exported shape of
  a folder or shelf, structure and titles only, never ids, people, dates, or states,
  importable to create new folders. - **Saved view**: a named, pinnable filter definition
  of the viewer's (4.19), serialized by ids. - **Board**: a page's grouped columns
  rendered as cards; dropping a card into a column writes that column's value. Offered
  wherever the page has a grouping; Done's column completes. - **Tab strip**: the client's
  row of open places and tasks. Working state, session-scoped, never stored server-side.

**Folded from RFC 0005 by the S29 fold on 2026-08-27, and the shape of the fold is worth
one paragraph because this file is where every other section gets its words.** Eight
entries above are that RFC's own replacement text verbatim (Default Folder, Home, View,
Pull into focus, Today entry, Carried, Recap, Reminder) and thirteen are its appends
(Shelf through Tab strip). Three more entries were **not** named by that unit and were
corrected anyway, and the reason is that they defined a v2 term using v1's page names:
Open task listed "Tasks, Planned", Snowball was written entirely in terms of My Day, and
Abandoned excluded a task from My Day. A glossary that fixes vocabulary while three of its
own entries use the retired vocabulary is the one place the debt compounds, so those three
were folded with the eight rather than left for a later audit to find. Two sentences were
added beyond any of that and both are cross-references rather than rules: Abandoned notes
that it is also a page in v2, which 9.5 and 1.2 already say, and Restore distinguishes
itself from restoring out of Trash, which 5.1 and 9.11 already separate. This paragraph
and those two sentences are recorded as RFC 0005 change control item 49.

**Two names in this file are deliberately not the page names.** `my_day_entries` is a
table and keeps its name; `/views/my-day`, `/views/planned` and `/views/tasks` are
addresses and keep theirs. RFC 0005 renamed the pages and renamed neither, because the
client, the acceptance suite and the migrations all address those strings literally, and
section 4's and section 7's own annotations say the same at the point of use. A term in
this glossary is what a person is shown; an identifier in sections 4, 6 and 7 is what the
machine is told, and the two are allowed to differ as long as exactly one document says
so. This is that document.
