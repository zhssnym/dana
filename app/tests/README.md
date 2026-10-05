# The test suite

A small core. Add a test only for security, data loss or a core path. Do not pin
counts, button names, text on screen, or the structure of source files.

Run it from `app/`: `npx vitest run` (PGlite when `TEST_DATABASE_URL` is unset,
Postgres when it is set). The browser test is `tests/e2e/smoke.spec.ts` (sign in,
create a task, open a folder).

## What is kept

- **Security** (`criteria/`): `ac-397` authorization sweep (each route with an id
  refuses a stranger), `ac-236` session and CSRF sweep, `ac-195` file serving,
  `ac-057` search scope, `ac-205` comment permissions, `ac-231` SVG refusal,
  `ac-366` collection privacy, `ac-865` and `ac-875` unreadable ends stay hidden,
  `ac-1523` and `ac-1528` project members and tabs, `ac-1176` sample people get no
  access, `ac-1546` operator stats; `guards/guard-list-visibility` (lists and search
  show a stranger nothing).
- **Data loss**: `ac-014` delete, trash and purge cascade, `ac-138` account
  deletion, `ac-1170` replies survive a parent delete, `ac-1380` sample removal
  keeps own work, `ac-1525` the Discussion pick keeps writing;
  `guards/guard-account-deletion-sweep`, `guards/guard-reclaim-reference-arms`,
  `guards/guard-document-transaction`, `guards/guard-persistent-file-storage`.
- **Core path**: `ac-025` task create, `ac-036` task complete, `ac-024` membership
  add, `ac-825` workflow export and import; `guards/guard-rung-parity` (server and
  client agree on overdue and today).
- **Pure logic** (next to the code in `src/`): recurrence, today and time zones,
  My Day, calendar dates, fractional index.
- **Repository**: `guards/guard-agent-instructions` (`AGENTS.md` loads and its
  paths exist).

## Support

`support/` holds the harnesses that the kept files import. Delete a harness when
nothing imports it.
