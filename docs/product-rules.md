# Product rules

The core rules of Dana that the code does not show quickly. If the code disagrees, the code is correct.

## What Dana is

Dana is a collaborative to-do web app, installable as a PWA. A person signs in with Google.
Each person has a private Desk and can make more projects. A project holds pages, and
pages hold tasks and text. People share a project, never a single task. Dates and
lists come from the data: Dana computes Today, Upcoming and the other lists from task
dates and assignees. Dana has no AI and no integrations. The email messages are invite,
share grant and reminder.

## Terms

Only words that have a special sense in Dana. The code name is in brackets.

- **Page** (`folders` row): one place that holds tasks or text. A page can have sub-pages.
- **Project**: a top-level page with all pages under it. Its root row has `id = project_id`.
  Members, Access and ownership belong to the project, not to a single page.
- **Tab**: a top-level page of a project with a `tab_position`. The kind is Work (tasks),
  Doc (text) or Discussion. The root is always a tab. The app tab strip is a different thing.
- **Desk** (`is_default`): the one default project of each account. It is private.
  It has a Work root and Doc tabs, and no Discussion.
- **Collection** (`shelves`): one person's private group of projects. It has no members.
- **Focus list**: a task list across all projects in the sidebar. The lists are Today,
  Upcoming, Assigned, Important, Overdue, No date and All open. Each person picks the lists to show.
- **Today** (`my_day`): the open work of the viewer for the current day.
- **Pull**: a person adds a task to their own Today by hand (`my_day_entries`).
- **Discussion**: a conversation in a project. Its state is open or resolved.
  A Discussion can link to one or more tasks.
- **Outcome**: the recorded result of a Discussion. Outcomes never change.
- **Access**: the preset of one member on one project. See "Permissions".
- **Owner** (`owner_id`): the person with custody of a project. Custody is not authority.
- **Responsibility**: a document that says what one member does in a project.
- **Connection**: a link between two people. Either can add the other to a project directly.
- **Series**: the task rows that one repeat rule makes. The **current occurrence** is
  the one open row of the series. Only that row holds the rule.
- **Activation date**: the start date of a task, or the due date when it has no start date.
- **Status words on screen**: To do (`pending`), Done (`completed`), Dropped (`abandoned`).

## Permissions

`RULES` in `app/src/shared/folder-actions.ts` is the full table. `mayPerform` is the one
resolver for the server and the client. The presets are a ladder. Each preset can do all
that the presets below it can do.

| Preset | What it adds |
| - | - |
| Can view | Read the project, its Discussions, Access history and Responsibilities. Leave. Personal acts: pull to Today, Collection placement, personal labels, view settings. |
| Can comment | Comment, react, attach files to comments. Start a Discussion. Edit, resolve or reopen your own Discussion. Edit or delete your own comment. |
| Assigned work | On a task assigned to you: complete, uncomplete, tick checklist items, set or clear the reminder. |
| Can contribute | Create tasks. On a task assigned to you: edit, move, abandon, restore, apply labels. |
| Can edit | All shared work. Edit, assign, move, complete, abandon and duplicate any task. Move tasks to Trash and restore them. Edit pages, tabs, the project identity and the label list. Edit, resolve, move to Trash and restore any Discussion. |
| Full control | People and acts that you cannot undo. Add and remove members, change Access, invite, cancel and resend invites. Manage Responsibilities. Delete the comments of other people. Delete files. Delete tasks permanently. Move the project to Trash or Archive. Restore a project. Purge a Discussion. |

The owner is not a preset. Only the owner can:

- transfer ownership,
- delete the project permanently (the owner must also have Full control),
- restore the project from Trash or Archive at any Access,
- restore their own Access to Full control.

Rules that the table does not show:

- The server checks every act. The client hides controls by the same table only.
- A person who is not a member gets 404, never 403. Dana does not confirm that a project
  exists to an outsider. A member below the bar gets 403.
- A grant for "a task assigned to you" reads the assignees under the row lock in the
  transaction that writes. A cached "assigned to me" never authorizes.
- Desk refuses share, invite, leave, Trash, Archive and transfer with 409.

## Membership

- A member of a project sees every page of the project.
- The person who makes a project becomes its owner with Full control.
- A Full control member can add a person directly only when the two have a connection.
  The add must name a preset. There is no default preset.
- A project has a member cap. Every grant locks the project row, then counts members.
- A Full control member can remove another member. Nobody can remove the owner.
- Any member can leave. The owner must transfer ownership first.
- The owner can transfer ownership only to a member who has Full control now.
- Only the owner can change the Access of the owner. The owner can lower their own Access
  only when another member has Full control.
- The last Full control member cannot leave, be removed, or lose Full control.
- Each Access change writes its history row in the same transaction.

When a member leaves or a person removes them, one transaction does all of these steps:

1. It ends their Responsibility. The document and its history stay for the other members.
2. It removes them from the assignees of each task. Other assignees stay.
3. It deletes their Today entries for tasks in the project.
4. It deletes their membership.
5. If one member remains, that member becomes the assignee of every unassigned task.

The removal never deletes a task. The `pending` invites that the leaver sent stay valid.

## Invites and shares

An invite goes to an email address. It can carry a project and a task.

- An invite with no project makes only a connection. Any person can send one.
- An invite with a project must name a preset. Only Full control can send it. It always
  points at the project root.
- Dana refuses an invite to your own email, to a current member, or to Desk.
- If the address belongs to a connected person and the invite has a project, Dana adds
  them at once. Dana sends a share-grant email and writes no invite row.
- If the address belongs to a connected person and the invite has no project, Dana
  refuses it with 409.
- One person can have one `pending` invite per email and project.

Acceptance and later acts:

- Only the signed-in person whose lowercase Google email equals the invite email can
  accept or decline.
- Dana compares addresses exactly. It does not remove Gmail dots or plus parts.
  A wrong rule merges two people.
- Acceptance is one transaction. It makes the connection, adds the membership with the
  preset, and adds the person as assignee when the task is still in the project.
- Dana refuses acceptance when the project is in Trash or full. The invite stays `pending`
  and becomes valid again after a restore or when the project has room.
- A new invite for a task clears the task from older `pending` invites for that task.
- Full control members cancel and resend project invites. For an invite with no project,
  only the sender can do this.
- A person can resend one invite once in 24 hours.
- Invites never expire. Acceptance needs a sign-in, and the link holds no secret.
- The final states are accepted, declined, canceled and invalidated. No act leaves a final state.
- Account deletion invalidates the `pending` invites of that person.
- You can assign a task only to a member. To assign an outsider, send an invite with the task.

## Task status

Status changes go only through four acts. Each is a guarded update on the expected status.
A repeat of an act on a task already in the target status returns 200 and does nothing.

| From | Act | To | Effect |
| - | - | - | - |
| pending | complete | completed | Sets `completed_at` and `completed_by`. Makes the next occurrence of a series. |
| pending | abandon | abandoned | Makes the next occurrence of a series. |
| completed | uncomplete | pending | Clears `completed_at` and `completed_by`. The series guard applies. |
| abandoned | restore | pending | Dates and reminder do not change. The series guard applies. |

All other changes return 409. For example, uncomplete a task before you abandon it.

The series guard, for a row with a `series_id`:

- If the series has another open row, Dana deletes that row and moves its rule back to this row.
- If not, and this row is the newest of the series, the row opens again with its rule.
- Otherwise Dana refuses with 409.

Delete is not a status. A task in Trash keeps its status, and a restore from Trash keeps it too.

Assignees: a task has zero or more assignees. Each is a member of the project, with no
repeats. The first assignee sets the reminder time zone.

## Time

- Plans use floating dates and times: start date, start time, due date, due time.
  Every member sees the same digits.
- Records (events, completion, reminder instants) use UTC instants.
- Every request that reads, writes or filters by date sends `tz`, the IANA zone of the
  client. The server computes today in that zone. The client never filters by date.
- `users.timezone` has one use: the reminder fire time. Dana updates it at each login and
  each time a session reports a different zone. An alias of the same zone changes nothing.
- The day starts at local midnight. Dana compares dates with dates, never instants.
  Clock changes thus never break date rules.

Due relations use the due date only:

- **Overdue**: the task is `pending` and its due date is before today.
- **Due today**: the due date is today.
- A start date never makes a task overdue. A task with only a start date is never overdue.

Home of a task: Anytime with no dates, Scheduled with a start or due date. Nobody sets it.

### Today

A task is on the Today of viewer V when it is `pending`, V is a member, and one of these is true:

- V is an assignee and the activation date is today or earlier.
- V pulled the task.

- The qualify date is the earlier of the activation date and the pull date.
- The Carried group holds rows with a qualify date before today. Nothing leaves Today
  because time passes. Work stays until a person completes or abandons it.
- A task with no dates never comes to Today by itself.
- A pull stores today in the zone of the person who pulls. A pull is personal.
  Any member can pull any task, also a task of another person.
- An abandoned task leaves Today at once. The recap shows tasks completed today.

### Repeat rules

- A rule is an RRULE subset. Only the current occurrence holds it. A rule needs a due date.
- Dana makes the next occurrence only when a person completes or abandons the current one,
  in the same transaction. No background job makes occurrences.
- The cutoff is the later of the due date and today in the `tz` of that request.
  The next due date is the first rule date after the cutoff.
- A late completion skips missed dates. An early completion keeps the schedule.
- UNTIL is inclusive. At the end of the rule, Dana makes nothing and the rule stays.
- The new row copies the title, notes, important flag, due time, assignees, rule,
  creator, and the body with each checklist item unticked. It copies the reminder with
  the same mode. It does not copy Today entries or the start date.
- An edit to the rule changes the series from now on. Old rows do not change.
- A new due date on the current occurrence moves the anchor of the series.
- A rule set to null ends the series. A new rule on a task without one starts a new series.
- The calendar draws future dates of the rule only after the current due date. Dana never
  stores them. A click on one opens the current occurrence.

### Clear a due date

One transaction clears the due date, the due time and the rule, and deletes the reminder.
The client warns first. The series keeps its `series_id` for history.

### Reminders

- A task has at most one reminder.
- A time-of-day reminder fires at a time on the due date. The interface makes only this kind.
- An offset reminder fires a number of minutes before the due time. It needs a due time.
- A change to the due time that breaks the reminder mode deletes the reminder.
- The zone is that of the first assignee, or of the creator when nobody is assigned.
- Each write sets the state from the instant: scheduled in the future, skipped in the past.
  Dana never sends a reminder late.
- Dana computes the instant again when the due date, due time, reminder value, assignee,
  or zone of the assignee changes.
- A zone change computes again only scheduled rows. The occasion is the same, so a sent
  reminder must not go out twice.
- A scheduler runs each minute. It sends the email to every assignee with an address.
- The scheduler skips a reminder when the task is not `pending`, has no assignee, or is in
  Trash or Archive. It also skips one that is more than six hours late.
- Dana never sends a reminder to a whole project. A crash can send one email two times.

## Concurrency

There is no realtime sync. Clients fetch again on focus and after each change. A PATCH
sends only changed fields, and the last write wins. The guarded status update makes each
series occurrence exactly once.

## Trash, archive and purge

Trash:

- A delete of a task, page or Discussion moves it to Trash. It leaves every view but Trash.
  Nothing cascades.
- A page goes to Trash with each live sub-page that the actor can also move to Trash.
  A restore brings the set back.
- Can edit moves tasks to Trash and restores them. Full control moves a page or project
  to Trash. Full control or the owner restores it.
- Full control deletes a task permanently. The owner with Full control deletes a project
  permanently.
- After 30 days the scheduler purges the item. A page purge removes its members, tasks,
  checklists, Today entries, reminders, `pending` invites and files. File bytes go after commit.
- Dana purges events after 90 days.

Archive:

- Full control archives a page with all its live sub-pages. Desk cannot be archived.
- Archived pages stay with no time limit. The scheduler does not purge them.
- Full control or the owner restores an archived page. The parent page must be live.
- A project has at most one live Discussion tab. A restore that makes a second one fails with 409.

### Account deletion

Before the deletion, the person must transfer each owned project that has other members.
Dana refuses with 409 until they do. Then one transaction does these steps:

1. Invalidate the `pending` invites that the person sent.
2. Transfer each owned shared project to the member who joined first.
3. Delete each project the person still owns, Desk too. These skip Trash.
4. Run the leave cleanup on each other membership.
5. Delete all connections and Today entries of the person.
6. Delete each file the person owns, also in shared projects. The bytes go after commit.
7. Delete the rows in each personal table.
8. Clear the identity fields of the user row and set `deleted_at`.
9. End all sessions.

Dana keeps the user row with no identity. References to it show "Deleted user". Dana also
keeps Responsibility history, archive records and page document receipts of the project.

Dana never deletes the user row, so no `ON DELETE` rule on `users(id)` fires.
Each new table that refers to a user needs its own step in `account-deletion.ts`.

## Invariants

Rules that must always hold. A plain database constraint does not enforce these.

- Each live user has exactly one Desk. Desk has one member, its owner. Nobody can share,
  delete, archive or transfer it.
- Each project has at least one member with Full control.
- The owner of a project is always a member of it.
- Each page has the owner of its project. Triggers keep this true.
- Dana reads membership only on the project root.
- In a project with one member, that member is an assignee of every task.
- A series has at most one `pending` row. Only that row holds the rule.
- A reminder exists only while its task has a due date.
- A Today entry date is never after today in the zone of the person who pulled it.
- Each live user has one settings row and a valid IANA zone.
- A status changes only through the four transition acts.
- An Access change and its history row commit together.
- A `pending` project invite always points at a project root.
