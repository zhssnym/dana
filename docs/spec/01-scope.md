## 1. Product definition and scope boundary

### 1.1 What Dana is

Dana is a collaborative to-do web application delivered as an installable PWA. A user signs in with Google and gets a set of folders; every task lives in exactly one folder, and a non-deletable default folder named Desk catches anything not filed. Folders are flat, never nested, and are the only shareable unit: sharing one grants another person full access to every task inside it, via an email invite that also creates a lasting people connection for one-tap future sharing. Scheduling is derived, never filed: a task with a due date appears on Scheduled, and Today, Assignments, Important, All, Done, Abandoned and Anytime are queries over the same rows, one page per question, each locking its own axis (RFC 0005, recording DES-152). Today mixes automatic inclusion (assigned to you, due on or before today) with manually pulled tasks, and unfinished items carry forward daily until completed or abandoned. Tasks carry notes, steps, an important flag, optional recurrence, one email reminder, and comments; folders carry an identity (icon, colour, cover, description), page blocks, and a conversation; a member arranges folders on personal shelves. Everything is manual in v2: no AI, no integrations. The goal is unchanged: a boring, correct, low-operations product that a two-person team can run.

### 1.2 What Dana does as of now

- Google OAuth sign-in, session management, account deletion.
- Folders: one Desk per account plus custom folders; rename (owner); delete to Trash (owner); leave (member); icon, colour, cover and description shared by the folder; page blocks; per-member shelf placement; completion count; duplicate; save and import as a workflow file.
- Sharing: email invites (with or without a folder attached), roster connections, instant sharing to connected people, invite cancel, resend, decline; sharing triggered by assigning to a non-member.
- Tasks: title, notes, important, due date (day-level in v2 interfaces; a stored due time is honored), recurrence (optionally end-bounded), one reminder at a time of day, steps, assignee (assignable and unassignable), comments with likes and files; three statuses (pending, completed, abandoned) with restore; delete to Trash; duplicate; a URL of its own.
- Pages: Desk, Today, Scheduled (list, board and calendar), Assignments, Important, All, and the unpinned views Done, Abandoned and Anytime, governed by the pin list; folder pages; shelf pages; Trash; global search; saved views.
- Activity and notifications: every mutation records an event, a folder and any object can answer what happened to it, and the bell carries the viewer's own notifications with a read state (sections 4.13, 4.14, 7.12, 9.12).
- Files: images and documents attached to comments and page blocks, served only to people who can already read what they hang on, under a per-account quota (sections 4.16, 7.15, 10.3).
- Email notifications: invite, share grant, reminder. Nothing else.
- PWA: installable shell, offline banner, online-only data.

### 1.3 What Dana does not do as of now

| Item | Reason | Earliest return |
| - | - | - |
| Dana AI chat | Deferred by design; needs model infrastructure | Deferred, no date |
| Sharing content with Dana (extraction) | Reuses the chat engine; must follow it | Deferred, no date |
| Automatic email inbox scanning | Sensitive Gmail OAuth scope, security assessment and annual re-verification burden on a two-person team | Deferred, no date |
| Calendar linking | Unsolved design problem: free-slot inference is wrong too often | Unscheduled |
| Stats page | Value unclear; the folders and durations it would need are themselves reduced | Deferred, no date |
| Templates as an object of their own | Far future. A folder or shelf is already saved and imported as a workflow file (7.16), which is the structural half; what is absent is a named, reusable template with a life of its own | Unscheduled |
| Realtime sync, presence | Last-write-wins with refetch is sufficient at current scale | Deferred, no date |
| Offline writes and sync engine | Largest hidden subsystem in the category | Deferred, no date |
| SMS reminders | Vendor, cost, sender registration | Unplanned |
| Web push reminders | Per-device subscriptions; iOS constraints need verification | Deferred, no date |
| Natural-language date parsing | Belongs to the AI bundle; keeps the manual line clean | Deferred, no date |
| Duration field | Cut; no consumer | Deferred, no date |
| Year calendar zoom | Cut: projecting daily recurrences at year scale needs density rendering that is not designed; day, week, month remain | Deferred, no date |
| Roles and permission tiers | role column reserved, single value | Deferred, no date |
| Multiple reminders per task | One reminder is the contract | Deferred, no date |
| Task-level sharing | Folder is the only shareable unit, by design | Never |
| Native iOS/Android/desktop builds | PWA covers installation | Unplanned |

**Three rows left this table at the S29 fold of 2026-08-27 because Dana now does the thing**, and each is named here rather than deleted silently, since a reader who knew the old table will look for them. **Attachments** are sections 4.16, 7.15 and 10.3, and the quota is what answers the storage and scanning cost that row gave as its reason. **Activity log** is 4.13 and 7.12, and the `completed_by` column that row said was preparing for it is now one of its inputs. **Drag reordering of tasks and folders** is `tasks.position` plus the shelf and sidebar arrangements of 4.18 and 4.19; the "personal-versus-shared ordering unanswered" that row gave as its reason was answered by RFC 0005 change control item 44, a hand order being the folder's and a shelf arrangement being the member's.

**Dana AI chat stayed and its date did not.** That row read "earliest return v2", and v2 is the release this table now describes; the cell was a promise the product had already broken. It is called out separately from the three above because the shape of the mistake is the opposite one, and both shapes are what this table has to be audited for whenever a release lands.

**Every "v1" and "v1.1" in the last column is now a date rather than a version number, and where re-dating a row would have been a product decision it reads "Deferred, no date".** Those cells were written when v1 was the next release and v1.1 was a real slot on somebody's plan. Neither is true now, and a specification carrying a stale schedule teaches a reader to trust a date nobody set. Re-dating them is the owner's, and one sentence from him closes as many rows as he likes.
