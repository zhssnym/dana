## 4. Data model

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid()
unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no
workspace table: the workspace is fully derived from users, connections, and memberships,
and a table would hold nothing.

**Two annotations covering the whole section, added by the S29 fold on 2026-08-27. Neither
is an edit: section 4 is frozen, and RFC 0004's S29 row is annotate rather than rewrite.**

**First, this section now carries the whole schema Dana runs, folded by S29a on
2026-08-30.** RFC 0005's accepted units are folded into this frozen file as text and
nothing else: unit 11 replaced 4.3 and 4.5; unit 10 inserted 4.13 to 4.19; change control
item 46's units appended `position` to 4.5, `width_pct` to 4.17 and inserted 4.20. Every
one of them was ruled by the owner before it was written (RFC 0005's acceptance of
2026-08-24, re-accepted 2026-08-27; item 44 for the four frozen changes of item 46), so
the freeze's rule, that section 4 moves only on a human decision, holds through the fold.
The S29 fold of 2026-08-27 annotated rather than folded, and its annotations on 4.3, 4.7
and 4.10 stand where they were.

**Second, the page names in this section's justification prose are v1's.** "My Day recap"
at 4.5's rationale line and "Q1 My Day automatic inclusion" in 4.12's index table both
name a page now called Today; 4.7's own annotation states the rule that governs both,
which is that the queries and the tables kept their names while the pages were renamed.
Every such name in this section is a citation of a query or a table and none of them is a
claim about what Dana's pages are called.

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
