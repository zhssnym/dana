## 2. Glossary

Agents must use these exact terms. Each term has one meaning; no synonym introduces a second one.

- **User**: an account row created at first Google sign-in. Soft-deleted users keep their row with identity fields scrubbed and are excluded from every picker and roster.
- **Viewer (V)**: the authenticated user making the current request.
- **today(V)**: the current calendar date computed in the IANA timezone the client sent with the request.
- **Floating date / floating time**: a calendar date or wall-clock time stored without timezone. Every member sees the same digits; each evaluates them in their own timezone.
- **Workspace**: the derived view a user has of the system: their roster plus their accessible folders. Not a stored entity; there is no workspace table.
- **Roster connection**: a symmetric link between two users, one row per unordered pair, created by invite acceptance. Grants nothing except the ability to share folders without a new invite.
- **Folder**: the single organizing primitive. Holds tasks, never other folders. Has exactly one owner and one or more members.
- **Default Folder / Inbox**: the one folder per account created at signup, initial name "Inbox". Cannot be shared or deleted; always exactly one member, its owner.
- **Owner**: the user a folder's owner_id names. Holds the destructive rights of section 5.4. Ownership transfers only via the rules in section 8.9.
- **Member**: a user with a membership row for a folder. Owners are also members.
- **Accessible folder (to V)**: a folder where V holds a membership row. The universal scope filter of every query.
- **Task**: a row with a title, exactly one folder, and a status in {pending, completed, abandoned}.
- **Open task**: a task whose status is pending or abandoned. Open tasks populate Tasks, Planned, All, and Important.
- **Home**: the page a task belongs to by derivation: Tasks when due_date is null, Planned when set. Never assigned manually.
- **View**: a page that queries tasks without being their home: My Day, Important, All, Done.
- **Assignee**: the single member a task is assigned to, or null (unassigned). Must be a member of the task's folder.
- **Step**: a checklist row inside a task: title, done flag, position. No dates, no assignee.
- **Pull into focus**: the manual act of adding a task to the viewer's own My Day, stored as a My Day entry.
- **My Day entry**: a row (task_id, user_id, added_on) recording a pull. Personal to one user.
- **Snowball**: the property that a qualifying My Day item keeps appearing every day until completed or abandoned; nothing leaves My Day by time passing.
- **Carried**: the My Day group for items whose qualify date is before today; the complement is the Today group.
- **Recap**: My Day's collapsed section of tasks completed today.
- **Abandoned**: the status meaning given up: excluded from My Day and Done, visible faded in its home, All, and Important, restorable.
- **Restore**: the transition abandoned to pending. Dates are untouched.
- **Series**: the chain of task rows produced by one recurrence, linked by series_id. Exactly zero or one pending row per series.
- **Occurrence**: one task row of a series. The **current occurrence** is its only pending row and the only row carrying the rule.
- **Recurrence rule**: an RFC 5545 RRULE string (subset, section 4.11) stored on the current occurrence, anchored at that row's due date.
- **Virtual instance**: a computed calendar marker for a future rule instance, never stored, strictly after the current occurrence's due date.
- **Reminder**: at most one per task: an offset before the due instant (when due_time exists) or a time on the due date (when it does not), delivered by email to the assignee.
- **Invite**: a pending grant addressed to an email, optionally carrying a folder and optionally an intended assignment (task_id).
- **Completion count**: per folder, completed over (pending plus completed), abandoned excluded, identical for every member.
