## 12. Acceptance criteria

Given/when/then, one behavior each. Each criterion is asserted by an automated test under
`app/tests/` named for its number, and this section is the definition of done. Who added a
criterion and when is git's: `git log -S 'AC-268' -- docs/spec/` finds the commit that
introduced one, with its date and its message.

The criteria are grouped by what they are about. A criterion that could honestly sit in two
groups has exactly one home rather than a copy in each, and each file opens by naming the
groups next to it.

## Numbers

`AC-NNN` numbers are append-only: never renumbered, never reused, and a retired criterion is
marked rather than removed. A gap in the run is ordinary, and it is not a free number by
default, so read this list before spending one.

- **@@TOTAL@@ criteria carry their text in the files below.** Every number from AC-001 to AC-@@MAX@@
  not named below is one of them.
- **AC-229 is spent and its text is not here.** It was written into its own test file,
  `app/tests/e2e/ac-229-done-row-drops-the-due-echo.spec.ts`, which is built, named for the
  number and running. The number is taken; do not spend it again.
- **Never spent, and free to take: @@RANGES@@.** @@COUNTWORD@@ numbers. Each gap is a range
  that was allocated ahead of the work and only partly used, which is the ordinary cost of
  allocating a range before writing it.
- **AC-361 to AC-365 were taken from the tail on 2026-09-03** (issues #27 and #30) rather
  than out of the gaps above, because several branches were open at once and **a gap is the
  one place two of them silently collide**. A branch that spends a gap and a branch that
  spends the tail cannot pick the same number; two branches both picking "the next free
  gap" can. AC-314 and AC-315 (issue #68) and AC-343 to AC-346 (issues #17, #22, #28) were
  spent out of the gaps on the same night, which is why those ranges have moved.
  **Whoever merges last re-derives the total** rather than taking either side of the
  conflict: it is arithmetic over the files, not a preference between two diffs.

The subsection numbers obey the same rule. 12.1 to 12.23 are addresses rather than an
ordering: a group that dies becomes a tombstone row in the table below, and a new topic takes
12.24.

## The files

| | File | Covers |
| - | - | - |
| 12.1 | [`12.1-schema-and-migrations.md`](12.1-schema-and-migrations.md) | 12.1 Schema and migrations, 5 criteria |
| 12.2 | [`12.2-sign-in-and-sessions.md`](12.2-sign-in-and-sessions.md) | 12.2 Sign-in and sessions, 17 criteria |
| 12.3 | [`12.3-the-account.md`](12.3-the-account.md) | 12.3 The account: profile, settings, deletion, 20 criteria |
| 12.4 | [`12.4-folders-and-membership.md`](12.4-folders-and-membership.md) | 12.4 Folders and membership, 19 criteria |
| 12.5 | [`12.5-sharing-roster-and-people.md`](12.5-sharing-roster-and-people.md) | 12.5 Sharing, the roster and people, 17 criteria |
| 12.6 | [`12.6-tasks-steps-and-the-task-surface.md`](12.6-tasks-steps-and-the-task-surface.md) | 12.6 Tasks, steps and the task surface, 39 criteria |
| 12.7 | [`12.7-today.md`](12.7-today.md) | 12.7 Today, 10 criteria |
| 12.8 | [`12.8-views-filters-and-search.md`](12.8-views-filters-and-search.md) | 12.8 Views, filters and search, 32 criteria |
| 12.9 | [`12.9-pages-blocks-and-covers.md`](12.9-pages-blocks-and-covers.md) | 12.9 Pages, blocks and covers, 14 criteria |
| 12.10 | [`12.10-shelves-and-the-library.md`](12.10-shelves-and-the-library.md) | 12.10 Shelves and the Library, 6 criteria |
| 12.11 | [`12.11-recurrence.md`](12.11-recurrence.md) | 12.11 Recurrence, 15 criteria |
| 12.12 | [`12.12-reminders.md`](12.12-reminders.md) | 12.12 Reminders, 24 criteria |
| 12.13 | [`12.13-events-history-and-notifications.md`](12.13-events-history-and-notifications.md) | 12.13 Events, history and notifications, 9 criteria |
| 12.14 | [`12.14-comments-and-likes.md`](12.14-comments-and-likes.md) | 12.14 Comments and likes, 6 criteria |
| 12.15 | [`12.15-files-images-and-avatars.md`](12.15-files-images-and-avatars.md) | 12.15 Files, images and avatars, 12 criteria |
| 12.16 | [`12.16-duplicating-and-importing.md`](12.16-duplicating-and-importing.md) | 12.16 Duplicating, importing and workflow files, 10 criteria |
| 12.17 | [`12.17-first-run-and-the-sample-workspace.md`](12.17-first-run-and-the-sample-workspace.md) | 12.17 First run and the sample workspace, 9 criteria |
| 12.18 | [`12.18-the-application-shell.md`](12.18-the-application-shell.md) | 12.18 The application shell, 15 criteria |
| 12.19 | [`12.19-drag-drop-selection-and-undo.md`](12.19-drag-drop-selection-and-undo.md) | 12.19 Drag, drop, selection and undo, 12 criteria |
| 12.20 | [`12.20-deletion-trash-and-restore.md`](12.20-deletion-trash-and-restore.md) | 12.20 Deletion, Trash and restore, 17 criteria |
| 12.21 | [`12.21-transactional-email.md`](12.21-transactional-email.md) | 12.21 Transactional email, 6 criteria |
| 12.22 | [`12.22-the-public-surface.md`](12.22-the-public-surface.md) | 12.22 The public surface: landing, legal, install, offline, 7 criteria |
| 12.23 | [`12.23-security-limits-and-rate-limits.md`](12.23-security-limits-and-rate-limits.md) | 12.23 Security, limits and rate limits, 9 criteria |
