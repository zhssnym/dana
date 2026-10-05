# The test suite

A small core. Add a test only for security, data loss or a core path. Do not pin
counts, button names, text on screen, or the structure of source files.

Run it from the repository root: `npx vitest run` (PGlite when `TEST_DATABASE_URL` is unset,
Postgres when it is set). The browser test is `tests/e2e/smoke.spec.ts` (sign in,
create a task, open a folder).

## Folders

| Folder | What its tests protect |
| - | - |
| `security/` | Authorization (a stranger gets nothing), sessions and CSRF, file serving, search and list scope, comment permissions, SVG refusal, operator stats |
| `data-loss/` | Delete and purge cascades, account deletion, file reclaim, document transactions, file storage, content that must survive a delete |
| `core/` | Task create and complete, membership add, workflow export and import, server and client agreement on Today and overdue |
| `repo/` | `AGENTS.md` loads and its paths exist |
| `e2e/` | The browser smoke test |
| `support/` | Harnesses that the tests import. Delete a harness when nothing imports it. |

Pure logic tests (recurrence, time zones, My Day, calendar dates, fractional index)
are next to their code in `src/`.
