## 1. Product definition and scope boundary

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
| Realtime sync, presence | Last-write-wins with refetch is sufficient at v1 scale | v2 |
| Offline writes and sync engine | Largest hidden subsystem in the category | v2 or later |
| SMS reminders | Vendor, cost, sender registration | Unplanned |
| Web push reminders | Per-device subscriptions; iOS constraints need verification | v1.1 |
| Natural-language date parsing | Belongs to the AI bundle; keeps the manual line clean | v2 |
| Duration field | Cut; no v1 consumer | v1.1 if calendar blocks feel wrong |
| Drag reordering of tasks and folders | Personal-versus-shared ordering unanswered; position subsystem avoided | v1.1 |
| Year calendar zoom | Cut: projecting daily recurrences at year scale needs density rendering that is not designed; day, week, month remain | v1.1 |
| Roles and permission tiers | role column reserved, single value in v1 | v2 |
| Multiple reminders per task | One reminder is the v1 contract | v1.1 |
| Task-level sharing | Folder is the only shareable unit, by design | Never |
| Native iOS/Android/desktop builds | PWA covers installation | Unplanned |
