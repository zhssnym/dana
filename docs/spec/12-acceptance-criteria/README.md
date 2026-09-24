## 12. Acceptance criteria

Given/when/then, one behaviour each; this section is the definition of done. A criterion is a
requirement whether or not a test runs it: only a small core is executable, and
`app/tests/README.md` says which.

## The rules

- One line per criterion: `- AC-NNN Given…, when…, then… (spec N.M)`.
- A criterion has exactly one home: the file whose topic it is about, never a copy in two.
- Numbers are never reused. A new criterion takes the number named below, and the same
  commit moves that line on by one past the highest number it spent.
- Retiring a criterion is deleting its bullet; its number stays spent.
- History is git's: `git log -S 'AC-NNN' -- docs/spec/` finds every commit that touched one.

## The next number

**The next number to take from the tail is 1175.**

## The files

| File | Topic |
| - | - |
| [`12.1-schema-and-migrations.md`](12.1-schema-and-migrations.md) | Schema constraints and data migrations |
| [`12.2-sign-in-and-sessions.md`](12.2-sign-in-and-sessions.md) | Sign-in, OAuth and sessions |
| [`12.3-the-account.md`](12.3-the-account.md) | The account: profile, settings, export, deletion |
| [`12.4-folders-and-membership.md`](12.4-folders-and-membership.md) | Folders, membership, Access, Responsibilities, facets |
| [`12.5-sharing-roster-and-people.md`](12.5-sharing-roster-and-people.md) | Sharing, invites, the roster and people |
| [`12.6-tasks-steps-and-the-task-surface.md`](12.6-tasks-steps-and-the-task-surface.md) | Tasks, steps, dependencies and the task surface |
| [`12.7-today.md`](12.7-today.md) | Today |
| [`12.8-views-filters-and-search.md`](12.8-views-filters-and-search.md) | Views, filters, search and Dana Links |
| [`12.9-pages-blocks-and-covers.md`](12.9-pages-blocks-and-covers.md) | Pages, blocks and covers |
| [`12.10-shelves-and-the-library.md`](12.10-shelves-and-the-library.md) | Shelves and the Library |
| [`12.11-recurrence.md`](12.11-recurrence.md) | Recurrence |
| [`12.12-reminders.md`](12.12-reminders.md) | Reminders |
| [`12.13-events-history-and-notifications.md`](12.13-events-history-and-notifications.md) | Events, history and notifications |
| [`12.14-comments-and-likes.md`](12.14-comments-and-likes.md) | Comments and likes |
| [`12.15-files-images-and-avatars.md`](12.15-files-images-and-avatars.md) | Files, images and avatars |
| [`12.16-duplicating-and-importing.md`](12.16-duplicating-and-importing.md) | Duplicating, importing and workflow files |
| [`12.17-first-run-and-the-sample-workspace.md`](12.17-first-run-and-the-sample-workspace.md) | First run and the sample workspace |
| [`12.18-the-application-shell.md`](12.18-the-application-shell.md) | The application shell |
| [`12.19-drag-drop-selection-and-undo.md`](12.19-drag-drop-selection-and-undo.md) | Drag, drop, selection and undo |
| [`12.20-deletion-trash-and-restore.md`](12.20-deletion-trash-and-restore.md) | Deletion, Trash and restore |
| [`12.21-transactional-email.md`](12.21-transactional-email.md) | Transactional email |
| [`12.22-the-public-surface.md`](12.22-the-public-surface.md) | The public surface: landing, legal, install, offline |
| [`12.23-security-limits-and-rate-limits.md`](12.23-security-limits-and-rate-limits.md) | Security, limits and rate limits |
| [`12.24-labels.md`](12.24-labels.md) | Labels |
