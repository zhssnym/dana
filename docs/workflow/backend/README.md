# Working on the backend

Read this before you start. It is everything you need for a backend task.

## What you own

Everything except `app/src/client/`. In practice:

| Path | What it is |
| - | - |
| `app/src/server/` | The API and everything behind it |
| `app/src/shared/` | The contract both sides import. See below, it is the delicate one |
| `app/db/` | Migrations, the seed, the constraint catalog |
| `app/tests/` | The acceptance suite and the browser tests |
| `.github/`, `docs/`, root config | Infrastructure and documentation |

## The rules that are never broken

1. **Every change starts from a GitHub issue.** This includes your own work.
2. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
3. **Say you are blocked rather than saying you are done.** A false green is the worst
   available failure, because everything after it is built on top.
4. **Run the review agent before merging your own work.** Imran cannot read backend code, so
   nothing else reviews it. That agent is the second reader you would otherwise not have.
5. **When the workflow itself is wrong, fix it or open an issue labelled `documentation`.**
   `docs/workflow/` is yours, so unlike the frontend you have both options; fixing it in the
   pull request that hit the problem is usually right. What is not an option is working
   around it in silence and leaving the next person to pay the same tax. Shared rule 11.

## Starting a task

New session per issue. Read the issue, check for open pull requests on the same files,
branch from `main` as `backend/<issue>-<short-description>`, and read `CLAUDE.md` for the
commands and this machine's failure modes.

## The server, folder by folder

| Folder | Files | What it is |
| - | - | - |
| `domain/` | 17 | The rules. Business logic and the database work behind it. |
| `routes/` | 14 | HTTP handlers. **They make no decisions**; they parse, call domain, map the result to a status. |
| `auth/` | 14 | Sign-in, sessions, provisioning. `auth/router.ts` attaches the session for every `/api/v1` request. |
| `time/` | 11 | Timezones, recurrence, DST. Luxon lives here. |
| `views/` | 9 | The read path for saved and native views. |
| `scheduler/` | 3 | The in-process 60 second reminder tick. |
| `notify/`, `observability/` | 6 | Email, logging, error tracking. |
| `security/`, `http/`, `files/`, `sample/` | 6 | Headers, helpers, uploads, sample data. |

`app/db/` holds `client.ts` (the one seam that chooses PGlite or Postgres), `migrate.ts`,
`seed.ts`, `verify.ts` and `constraint-catalog.ts`.

## Four things that are true and not obvious

**There is no authorization chokepoint, despite what spec 10.2 says.** There cannot be one,
because what counts as authorized depends on what is being asked for. What exists instead is
two good things: the membership check is written **inside the `FROM` clause**, so a query
that forgets it returns nothing rather than someone else's rows; and there are about 20
hand-written `accessOf(...)` gates across 9 files. **When you add a route, the gate is your
job.** Nothing adds it for you.

**The structural guard does not cover GET.** `app/tests/ac-236-structural-guard-sweep.test.ts`
walks the mounted router and fails any mutating route missing a session or CSRF check. It
checks POST, PATCH, PUT and DELETE only. **A new GET route with no session check passes the
entire suite.** Nothing structural checks authorization at all.

**Route mount order is load-bearing and undocumented.** In `app/src/server/routes/bundle.ts`,
`/views/:id` would shadow six page endpoints if anyone reordered it. Do not reorder mounts
casually.

**Migrations are forward only.** No down migration exists, and a migration runs against
production the moment the merge deploys. Recovery is a fix-forward migration or a restore.
Destructive changes split across two releases: expand, then contract.

## `app/src/shared/` is the contract

18 files of zod schemas that both the browser and the server import. The client validates
every response against them before rendering, so a mismatch surfaces as a visible error
rather than a blank field.

Changing a **response** schema is caught by the compiler on both sides. That is the safe
case.

Changing a **request** schema is caught by nothing. There is no `.strict()` anywhere in that
folder, so an unhandled field is accepted and thrown away and the API answers 200. This has
already happened: `app/src/shared/tasks.ts` records a reminder field that was silently
dropped for four packages. **If you add a request field, add the code that reads it in the
same change.**

## Testing

There are two database legs and they are not interchangeable.

```
npm run lint
npm run typecheck
npm test          picks a leg from TEST_DATABASE_URL, see below
npm run build
npm run e2e       the browser leg
```

**Never select a leg by habit. Print the variable and check.** `TEST_DATABASE_URL` is
ambient on this machine and has changed more than once. Set it for Postgres, empty it for
PGlite. Running `npm test` twice measures one leg twice and reports two greens.

`CLAUDE.md` holds the environment lore, and it is worth reading before you believe a red: the
PGlite worker crashes, the port collisions on the browser leg, and the counts that turn out
to be measurement rather than code. Three known flake classes will cost you time if you do
not know them, and **only two of them are answered by re-running**:

- **The Postgres leg shares one database across all 278 files.** Files see each other's rows.
  The fingerprint is a count that climbs across successive tests, `expected 2 to be 1`, then
  3, then 4. Re-run the file alone before believing it.
- **The browser leg loses about one case a run.** Re-run the case alone, and read
  `CLAUDE.md`'s note on when isolation lies.
- **A test comparing a date the server computed against a date the test computed is red for
  the hours when this machine's date is already tomorrow, and re-running does not help.**
  `ac-277` is the one that fires. It reads the duplicate's re-anchored due date, which the
  server takes from the database's `current_date`, against `todayInUtc()`, which the test
  takes from `new Date().toISOString()`. Measured 2026-09-02 at 23:10Z, which was already the
  3rd on this machine: PGlite's session zone here is `Etc/GMT-1`, so `current_date` read
  `2026-09-03` while UTC was still `2026-09-02`, and the file failed alone, twice, on that
  hour. **It is not the fork flake and
  isolation confirms nothing**: on the same commit, `TZ=UTC env -u TEST_DATABASE_URL npx
  vitest run tests/ac-277-task-duplicate-copy-rules.test.ts` was 2 of 2 green while the same
  command without `TZ=UTC` was 1 of 2. So the check that separates this class from a defect
  is the timezone, not a second run: force the zone, and if it goes green the red is the
  clock. The criterion is tracked as issue #46 and **is not yours to edit** on the way past.

## When the work needs the frontend

Read [`allowed-frontend-changes.md`](allowed-frontend-changes.md). The same two-question
shape as the frontend's file, pointing the other way. **The rule binds you too.** A quick
frontend fix is how Imran discovers his own area changed underneath him.

## Labels, in one line

Your issue needs an area label (`backend`) and a type label (`bug`, `enhancement` or
`documentation`). Add `blocked` if you stop, `breaking` if it changes something people rely
on. The full table is in [`../how-we-work.md`](../how-we-work.md); you rarely need the rest
of that file.

## Opening the pull request

Same template as everyone. Declare files touched outside your area, name the test commands
you ran, and title it as a Conventional Commit because the version is read from it.

Then run the review agent, read its verdict, and merge. Merging deploys to production within
minutes.
