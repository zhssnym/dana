## 4. Data model

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid()
unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no
workspace table: the workspace is fully derived from users, connections, and memberships,
and a table would hold nothing.

Columns, types, defaults and every named constraint and index are in
`app/db/migrations/`, which is the truth for them. The files below carry only what a
column or constraint means and why it is shaped that way.

Table and query names are v1's ("My Day" for Today, for example). A stored identifier is
not display copy, so such a name is a citation of a table or query, never a claim about
what a page is called.

| | File | Covers |
| - | - | - |
| 4.1 | [`04.1-users.md`](04.1-users.md) | 4.1 users |
| 4.2 | [`04.2-connections.md`](04.2-connections.md) | 4.2 connections |
| 4.3 | [`04.3-folders.md`](04.3-folders.md) | 4.3 folders |
| 4.4 | [`04.4-folder-members.md`](04.4-folder-members.md) | 4.4 folder_members |
| 4.5 | [`04.5-tasks.md`](04.5-tasks.md) | 4.5 tasks |
| 4.6 | [`04.6-steps.md`](04.6-steps.md) | 4.6 steps |
| 4.7 | [`04.7-my-day-entries.md`](04.7-my-day-entries.md) | 4.7 my_day_entries |
| 4.8 | [`04.8-reminders.md`](04.8-reminders.md) | 4.8 reminders |
| 4.9 | [`04.9-invites.md`](04.9-invites.md) | 4.9 invites |
| 4.10 | [`04.10-user-settings.md`](04.10-user-settings.md) | 4.10 user_settings |
| 4.11 | [`04.11-storage-formats-each-against-a-standard.md`](04.11-storage-formats-each-against-a-standard.md) | 4.11 Storage formats, each against a standard |
| 4.12 | [`04.12-index-summary-each-justified.md`](04.12-index-summary-each-justified.md) | 4.12 Index summary, each justified |
| 4.13 | [`04.13-events.md`](04.13-events.md) | 4.13 events |
| 4.14 | [`04.14-notifications.md`](04.14-notifications.md) | 4.14 notifications |
| 4.15 | [`04.15-comments.md`](04.15-comments.md) | 4.15 comments |
| 4.16 | [`04.16-files.md`](04.16-files.md) | 4.16 files |
| 4.17 | [`04.17-page-blocks.md`](04.17-page-blocks.md) | 4.17 page_blocks |
| 4.18 | [`04.18-shelves.md`](04.18-shelves.md) | 4.18 shelves |
| 4.19 | [`04.19-user-views.md`](04.19-user-views.md) | 4.19 user_views |
| 4.20 | [`04.20-user-page-covers.md`](04.20-user-page-covers.md) | 4.20 user_page_covers |
| 4.21 | [`04.21-sample-objects.md`](04.21-sample-objects.md) | 4.21 sample_objects |
| 4.22 | [`04.22-user-page-descriptions.md`](04.22-user-page-descriptions.md) | 4.22 user_page_descriptions |
| 4.23 | [`04.23-task-dependencies.md`](04.23-task-dependencies.md) | 4.23 task_dependencies |
| 4.24 | [`04.24-labels.md`](04.24-labels.md) | 4.24 labels |
| 4.25 | [`04.25-task-personal-labels.md`](04.25-task-personal-labels.md) | 4.25 task_personal_labels |
| 4.26 | [`04.26-folder-personal-labels.md`](04.26-folder-personal-labels.md) | 4.26 folder_personal_labels |
| 4.27 | [`04.27-task-folder-labels.md`](04.27-task-folder-labels.md) | 4.27 task_folder_labels |
| 4.28 | [`04.28-folder-responsibilities.md`](04.28-folder-responsibilities.md) | 4.28 folder_responsibilities |
| 4.29 | [`04.29-folder-responsibility-history.md`](04.29-folder-responsibility-history.md) | 4.29 folder_responsibility_history |
| 4.30 | [`04.30-folder-facets.md`](04.30-folder-facets.md) | 4.30 folder_facets |
