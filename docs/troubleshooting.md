# Troubleshooting

Things in this repository that fail in ways you would not guess. Each entry gives the symptom,
the cause, and what to do. When you hit a new one, add it here in the same shape.

## 1. Before you believe anything

- **A comment says something is true.** Comments here state intent and behaviour in the same
  confident voice, and some have been false since they were written. Treat a comment as a claim
  about intent, and check the behaviour by running it.
- **A test is red.** Several flaky classes (section 4) look exactly like broken code. Work out
  which class it is before you believe it. A class you can't name means you haven't measured it
  yet.
- **A comment cites `RFC 0005 item N`, a unit, an S-row or a P-row.** Those documents were
  deleted, so the citation is not a path. The full text is at
  `git show 9a22b77b8d:docs/rfcs/0005-v2-specification.md`. A citation tells you *why* something
  was decided, not what the code does now. The spec wins.
- **A comment points at a deleted file** (CLAUDE.md, docs/workflow/*.md, docs/team/,
  and others; "hard stop N" was docs/workflow/hard-stops.md and "section 13 item N" was
  docs/spec/13-open-questions/README.md). Find the commit that deleted it with
  `git log --diff-filter=D --oneline -- <path>`, then read it as it was with
  `git show <sha>^:<path>`.
- **Those commands find nothing.** Cloud sessions get a shallow clone. Run
  `git fetch --unshallow` first.

## 2. Things that fail silently

These give no error and no red test. Read your diff for them before opening a PR.

### Migrations
- **A migration never ran, and every read of its columns throws.** The drizzle migrator applies
  a file only when its `when` in `db/migrations/meta/_journal.json` is greater than the last
  applied one. It reads `tag` and `when`; `idx` does nothing. If a higher `when` deploys first,
  every lower migration is skipped without an error. Give a new entry a `when` above every
  existing one, and keep journal entries in ascending order when you resolve a conflict: array
  order is the apply order on a fresh database.
- **Two branches both added `00NN_`.** They merge cleanly and leave one prefix on two files.
  Before merging, check your number against every open branch. Take the next number after the
  highest one, and never fill a gap.
- **You want to undo a migration.** You can't. Migrations are forward-only and run against
  production when the merge deploys, so recovery is a fix-forward migration or a restore. Split
  destructive changes across two releases (expand, then contract). Never edit an applied
  `.sql` file.
- **A constraint has no explicit name.** Name every constraint and index. Tests and error
  handling refer to them by name.
- **A both-or-neither CHECK admits the row it was written to refuse.** A CHECK fails only on
  FALSE, and NULL passes. `(a IS NULL AND b IS NULL) OR (a > 0 AND b > 0)` accepts `a` null
  with `b` set. Write `(a IS NULL) = (b IS NULL) AND (a IS NULL OR (a > 0 AND b > 0))`, and add
  a test that tries the bad row. Nothing checks what a CHECK expression actually does.
- **A migration works on one engine only.** Production is Postgres; local fallback runs are
  PGlite. Run it on Postgres (section 3) before merging.
- **A deploy fails at boot with `boot_failed`, `reason: sqlstate_P0001` and a note
  `Migration check failed, step N: <check>`.** One of the self-checks in `0060`-`0062` found a
  row the migration did not carry over exactly. The log names the check but never the row (10.5
  logs no error messages). The drizzle migrator runs every pending migration in one transaction,
  so all of them rolled back together, not only the one that raised. Fix: run the migrator on a
  copy of production to see the row's id in the full error, rehearse until that check passes, and
  fix forward. Never loosen the check to make the deploy go through.
- **You added a foreign key into `files(id)`.** The reclaim sweep will delete a file that the
  new column still points at. Add the matching `NOT EXISTS` arm to `fileIsUnreferenced()` in
  `src/server/domain/files.ts`, then update the list in
  `tests/data-loss/file-reclaim-spares-references.test.ts`, which fails by design until you do.
  References that aren't foreign keys (such as `users.avatar_url`) are invisible to that guard.

### Request fields
- **A new request field saves nothing, and the API answers 200.** It can be lost two ways:
  - A field the zod schema doesn't declare is stripped by `z.object`. There is no `.strict()`,
    on purpose (spec 11.14). To refuse a field, declare it as
    `z.never({ error: … }).optional()`.
  - A field the schema declares but no route reads is dropped just as quietly. This has cost
    the project most.

  Add the field, the server code that reads it, and a test proving the value arrives, all in
  the same change. Response schemas are safe: the compiler catches a mismatch on both sides.

### Content Security Policy
- **An image or script from a new domain doesn't load, and the page shows nothing.** A source
  missing from the CSP is refused silently; it looks exactly like "no picture set". The browser
  posts the violation to `POST /api/csp-report`, which logs a `csp_violation` event in the
  server's security log. Look there, or in the browser console. Add the source to
  `securityHeaders` in `src/server/index.ts`, say what it's for in the PR, and check it in a
  real browser. A unit test can only show the string is present.

### Authorization
- **A new route that takes an id serves rows to anyone signed in.** There is no authorization
  chokepoint, whatever spec 10.2 says. Authorization is hand-written `accessOf(...)` gates, plus
  membership checks inside SQL `FROM` clauses. Write the gate yourself, and add the route's row
  to `tests/security/authorization-sweep.test.ts` saying what a stranger gets.
- **The authorization sweep is green, but an id-bearing route is still open.** The sweep only drives ids in the
  **path**. An id taken from the query string or the body is invisible to it
  (`GET /events?folder=` is the standing example), and so is a router mounted inside another
  router. `tests/security/session-and-csrf-sweep.test.ts` checks **authentication**
  (session and CSRF) only, never who may see what.

### Storage keys
- **A renamed `localStorage` or `sessionStorage` key resets that preference for everyone.**
  The old value is orphaned, and no later deploy can read it back. Never rename one.

### Styling and display text
- **A wrong colour or a wrong date label passes the whole suite.** No test checks the values in
  `src/client/styles/tokens.css` or the words that `src/client/parts/presenters.ts`
  produces. List any change to either file in the PR, with before and after, and look at the
  result in a browser.

## 3. Tests

All commands run from the repository root.

- **`npm test` failed although every test passed.** `tests/run-suite.mjs` fails any run
  where vitest collected more files than it accounted for, because vitest can lose files to a
  dead worker and still exit 0. Read the file count, not just the exit code. Pass vitest flags
  after `--`, as in `npm test -- --maxWorkers=2 <file>`.
- **A piped `npm test` always "succeeds".** `pipefail` is off in these shells, so
  `npm test 2>&1 | tail` returns `tail`'s exit status. Run it unpiped when you mean to trust
  the exit code.
- **Which database did that run use?** `TEST_DATABASE_URL` set means the Postgres leg; unset or
  empty means PGlite. The variable is ambient and changes between machines and sessions, so
  print it before trusting a green. Use `env -u TEST_DATABASE_URL npm test` to force PGlite.
  Nothing loads `.env` for a test run.
- **You're not sure which Postgres database a test ran in.** `TEST_DATABASE_URL` names a *base*
  database. Each vitest worker gets its own `dana_test_r<run>_w<slot>`, created and migrated at
  the start and emptied before each file (`tests/support/postgres-leg.ts`). The role needs
  `CREATEDB`. A count that climbs across tests on this leg is a real defect, not a flake.
- **Text sorts differently on Postgres and PGlite.** The base database must be created with the
  builtin `C.UTF-8` locale, using the exact statement from `createDatabaseSql` in
  `tests/support/postgres-leg.ts`. Never point the variable at a
  database that inherited the cluster default.
- **A test asserts a server error message and fails on another machine.** Postgres error text
  is translated (it's French on Hassan's PC). Assert the SQLSTATE, the constraint name, or the
  column field instead; `expectRejectedWith` in `tests/support/helpers.ts` does this.
- **Vitest says "No test files found", or `ERR_LOAD_URL`.** In Vitest 4, positional arguments
  are substring filters, not regexes, so `"auth(orization|-sweep)"` matches nothing. And
  `--reporter=basic` no longer exists. To run one test by title, use
  `npx vitest run -t "<words from the title>"`.
- **Your focused tests are green, but something else broke.** Changes under `src/shared/`
  or `src/server/domain/` reach tests nobody was thinking about. Scope the suite while you
  iterate, then run all of it before you say you're done.
- **`npm test` is green, but the screen is broken.** `vitest.config.ts` runs every test
  under `environment: 'node'`, so for client code the suite mostly proves it compiles. To render
  a component in a test, put `// @vitest-environment jsdom` on line 1, call `afterEach(cleanup)`
  (`globals` is off, so Testing Library doesn't unmount on its own), and stub image loading
  (`Avatar` renders no `<img>` until the image loads, and jsdom never loads one). Otherwise, run
  the browser test or the app, or say plainly that it wasn't checked in a browser.
- **Every request answers 500 from session resolution, and the throw is in
  `PglitePreparedQuery.queryWithCache`.** The local .data PGlite directory is corrupt. The
  tell is that the 500s come from `resolveSession`, not from the handler you changed. Run
  `rm -rf .data`; it's scratch and never committed. The cause is unknown.
- **A test that relies on two concurrent connections behaves differently on PGlite.** PGlite is
  single-connection: it serializes statements, so it can't reproduce races between parallel
  transactions. Spec 11.15 says exactly what that does and doesn't cost; test concurrency on
  Postgres.

## 4. Flaky failures

Name the class before you act. Only some of them are answered by re-running. Triage a red in
this order: (1) is it red on `main`'s latest CI run too? then it isn't this branch's;
(2) does it match a class below? (3) does the test compare two values it measured itself?
then it races the UI and running it alone makes it fail *more*; (4) only then treat it as
real. Re-run at most once.

- **Worker-fork death.** You see `[vitest-pool]: Worker forks emitted error`, or whole files
  fail with their tests skipped. Run the affected files alone before believing it. Capping
  workers lowers the odds but doesn't remove them, and costs a lot of time. The run-suite guard
  fails the run when files go missing.
- **Starvation.** You see `Hook timed out in 60000ms` (often in `startAuthTestApp`) or
  `Timeout terminating forks worker`, with **no assertion failures**. The machine is overloaded,
  usually by a CI job beside several agents. Re-run on a quiet machine.
- **Connection reset.** You see `read ECONNRESET`, or a route logs
  `Connection terminated unexpectedly`. `db/client.ts` has `'error'` listeners on the pool
  and on checked-out clients, so a reset socket now drops one connection instead of killing the
  worker; the seam logs `database_connection_lost`. A whole file lost at its start, every test
  skipped, is a connection the server refused with a FATAL (a missing database, too many
  clients): on Windows the backend's exit can reset the socket before the client reads the
  FATAL. So never connect to a database that may not exist; ask `pg_database` from the base
  database, as `tests/support/postgres-leg-admin.ts` does.
- **Two clocks in two zones.** A date comparison is red for an hour or two every evening. The
  server read one timezone (the database session's `current_date`, or the viewer's `tz`) and the
  test read UTC. Force the zone to tell them apart: `TZ=UTC` settles PGlite, but on Postgres the
  cluster's own zone governs. Never read the database's `current_date` for a user-facing day.
- **A climbing count** (`expected 2 to be 1`, then 3, then 4) on the Postgres leg is a real
  defect, not a flake. Every worker has its own database.

## 5. Browser tests

- **Every browser spec fails on a missing sidebar, and `GET /app` answers 404 `bad_request`.**
  The checkout path contains a directory starting with a dot, such as .claude/worktrees/.
  Express's `res.sendFile()` refuses dot segments, so the SPA fallback 404s. Copy or clone the
  tree to a path with no dot directory, or rely on CI.
- **Page crashes, tests failing at 0 ms, and timeouts that pass alone.** Two browser runs are
  sharing a port, both seeding and truncating one database. The port is `DANA_E2E_PORT`
  (default 3100). Give each parallel session its own port.
- **`ECONNREFUSED` scattered across files after you restarted a run.** Killing the server on
  the port doesn't kill `playwright test`, which keeps writing into `test-results/`. Kill every
  process whose command line matches `playwright` or `e2e:app`, then poll until nothing is
  **listening** on the port. On Linux:
  `until ! lsof -nP -iTCP:<port> -sTCP:LISTEN >/dev/null; do sleep 1; done`. Poll for LISTEN
  only, because TIME_WAIT sockets linger for minutes. Delete `test-results/` between runs.
- **Your port check says every port is clear.** Check that the tool exists first
  (`command -v lsof`). A missing command prints nothing, and `until !` reads its failure as
  "quiet".
- **One case, different each time, hits the 120-second timeout and passes alone in seconds.**
  This is memory pressure: it was seen with free memory low and browsers holding gigabytes.
  Re-run the case alone. Read a red of one or two cases in a whole run as unmeasured, not
  broken. Free memory before a run you need to be green.
- **A case fails alone, reliably, but the product looks right.** Check whether the assertion
  compares two numbers the test measured itself, for example reading a width straight after
  `mouse.up()`. That races a UI transition, and a quiet machine makes the race *more* likely.
  A tell is that wrong readings all fall on one side. The fix is a settle in the test.
  Re-running locally only tells you the case *can* fail; re-running the CI job on the same
  commit tells you whether *this commit* fails.
- **Each browser run takes minutes before the first test.** `npm run e2e` starts
  `npm run e2e:app`, which runs `vite build` every time. Set `DANA_E2E_PREBUILT=1` to reuse an
  existing build. `playwright.config.ts` forces `TEST_DATABASE_URL` empty for the server it
  starts, so you don't need to unset it yourself.
- **`Executable doesn't exist at …/chromium_headless_shell-<version>/…`.** The installed
  Playwright browsers don't match the version `@playwright/test` pins. Run
  `npm run e2e:install`, or on a container symlink the installed build to the pinned name.

## 6. Server

- **Page endpoints like `/views/my-day` suddenly answer 404.** Route mount order in
  `src/server/index.ts` is load-bearing: the views router must be mounted before the
  bundle router, or the bundle router's `/views/:id` shadows the page endpoints. Don't
  reorder mounts casually.
- **`Cannot read properties of undefined (reading 'optional')`, or `X is not a function` in
  exactly one file, while the symbol looks fine.** That's an import cycle, usually in
  `src/shared/` or `src/server/domain/`, which are webs rather than trees. The error
  appears where the `undefined` is used, not where the cycle is. Move the shared leaf into a
  module that imports only its own dependencies, and re-export it from the old location.
  `src/shared/rich-content.ts` and `src/server/domain/document-hash.ts` are examples.
- **Rate limits or reminders behave strangely with two instances.** There must be exactly one
  production instance: the in-memory rate limiter and the 60-second reminder tick both assume
  it. Raise it before scaling out.
- **Sentry shows `Connection terminated unexpectedly` with no cause.** The underlying
  `ECONNRESET` appears only in the seam's own `database_connection_lost` log line; drizzle's
  ROLLBACK on the dead connection is what the request reports.
- **`POST /api/v1/auth/dev-login` answers 404.** The development login needs
  `DANA_DEV_LOGIN=1` and exists only when running from source (`npm run dev`, `tsx`). The
  compiled build excludes it, and under `NODE_ENV=production` the server refuses to start
  without the three Google sign-in variables.

## 7. Client

- **A request fails with 403 or 422, and it looks like a backend bug.** Every server call must
  go through `src/client/api/http.ts`, which adds the CSRF header and the timezone. Lint
  refuses direct `fetch(...)` calls, but not an alias like `const g = fetch`.
  `src/client/lib/viewer.ts` is the one exemption (it reads a `data:` URL, not the network).
- **Where does a colour go?** Raw colour, size, spacing and radius values belong only in
  `src/client/styles/tokens.css`, as Tailwind `@theme` variables. Nothing enforces this
  any more, so check your diff for hex values in components.
- **An issue's screenshot won't download.** The repository is private, so `user-attachments`
  URLs need a token:
  `curl -H "Authorization: Bearer $(gh auth token)" -o issue.png "<url>"`. Most client issues
  are a screenshot and one sentence, and the screenshot is the specification.
- **"The sidebar" spans two folders.** Navigation rows are in
  `src/client/shell/app-sidebar.tsx`, and folder rows are in
  `src/client/components/folder-row.tsx`. Grep for what you see on screen rather than
  guessing from folder names.

## 8. Git, GitHub and CI

- **After resolving a rebase conflict, lines starting with `#` vanished from the commit
  message.** Under `GIT_EDITOR=true`, `git rebase --continue` applies `cleanup=strip` to the
  conflicted commit only. Use `git -c core.commentChar=';' rebase --continue`, then diff
  `git log -1 --format=%B` for the old and new sha.
- **Resolving a rebase or merge conflict.**
  - `db/migrations/meta/_journal.json`: keep both entries in ascending `when` order.
    If both sides took the same migration number, renumber the branch's file and journal
    `tag` together and give it a `when` above `main`'s last. Merge several
    migration-carrying branches in `when` order.
  - Section 12 criterion numbers: keep both sides' bullets; if both took the same number,
    renumber the branch's to one past the highest, rename its test file, and move the
    allocator line.
  - A file git auto-merged cleanly where both sides edited the same function: read the
    merged result; a clean merge is the one that bites silently.
  - A branch with a migration: run the suite on both engines (`TEST_DATABASE_URL` set, then
    `env -u TEST_DATABASE_URL`), printing the variable each time.
- **`origin/<branch>` looks stale after `git fetch origin <branch>`.** Here that form doesn't
  always update the remote-tracking ref. `git ls-remote --heads origin <branch>` is the
  authority. Use `git fetch origin <branch>:refs/remotes/origin/<branch>` to update the ref.
- **You staged someone else's work.** Several sessions can share one index. Stage explicit
  paths; never use `git add -A`, `git add .` or `git commit -a`.
- **You re-ran a PR's CI after a fix landed on `main`, and it fails identically.**
  `gh run rerun` replays the original `refs/pull/N/merge` commit, so it measures the old
  `main`. Close and reopen the PR to recompute the merge ref.
- **A PR has no CI result.** CI runs on the self-hosted runner on Hassan's PC (section 12), so
  jobs wait in the queue while that PC is off or nobody is logged in. Nothing is a required
  check (this plan has no branch protection), so a PR with no result can still be merged. Look
  before merging.
- **A `workflow_dispatch` run is green, but the PR isn't checked.** A dispatch builds the
  branch head, not `refs/pull/N/merge`. Close and reopen the PR to fire the real event.
- **Reading CI.** The repository is private, so the unauthenticated API answers 404; use an
  authenticated `gh`. `gh run list --commit` returns nothing here, so list with
  `--workflow ci.yml --json databaseId,headSha` and match the sha yourself.

## 9. Secrets and config

- **`.env` is committed.** This is deliberate: the repository is private and has two
  collaborators. The repo therefore stays private, and any credential that leaves it is
  rotated. Never copy the file anywhere else. A branch that deletes it deletes it from every
  working tree that checks that branch out.
- **Never commit .data.** It's the local PGlite scratch database.

## 10. Tools and libraries

- **Prettier rewrote a whole file to double quotes.** Prettier isn't this repository's
  formatter; `npx prettier` fetches a copy with stock defaults. The only formatter here is
  `npm run lint` (eslint). Revert the change.
- **Library code from memory doesn't work.** Recalled APIs for the installed versions are wrong
  in specific ways: Tailwind 4 CSS-first configuration, React Router library mode, zod 4,
  Express 5, Luxon DST handling, and PGlite's single connection. Read
  `docs/architecture.md` before touching those
  libraries. FullCalendar is no longer a dependency; ignore anything that mentions it.
- **Cutting tests barely sped up typecheck.** `tsconfig.server.json` includes `tests/**`, and
  the colocated tests are most of what it compiles.

## 11. Linux containers (cloud sessions)

To run all the checks on a container:

1. Initialize a cluster as the `postgres` user (`initdb` refuses to run as root) with
   `--locale=C.UTF-8`. The cluster locale matters: `C` and `C.UTF-8` fold case differently.
2. Create a login role with `CREATEDB`, then create the base database with 11.10's statement.
   Servers older than 17 lack `LOCALE_PROVIDER builtin`; the leg detects the version from
   `server_version_num` and falls back to libc `C.UTF-8` automatically.
3. Export `TEST_DATABASE_URL` pointing at that database, and print it.
4. If Playwright reports a missing executable, symlink the installed Chromium build to the
   pinned directory name.
5. Run the browser tests from a path with no dot directory. A .claude/worktrees/ checkout
   cannot run them.
6. Poll ports with `lsof`, which containers usually have instead of `netstat` or `ss`.

## 12. Hassan's Windows PC and the CI runner

- PostgreSQL 18 runs as the service `postgresql-x64-18`, with binaries in
  `C:\Program Files\PostgreSQL\18\bin`, on port 5432. Tests authenticate as `dana_ci`, never
  the superuser. There is no Docker.
- The cluster's own locale is `French_France.1252`, so the tools answer in French, and one
  translated option name is wrong: the real option is `--builtin-locale`. Read option names
  from the English documentation, not from `--help`.
- `gh` isn't on the PATH: use `"C:\Program Files\GitHub CLI\gh.exe"`. The machine has
  `netstat` but no `lsof`.
- The CI runner is a scheduled task, `'GitHub Actions Runner (dana)'`, that starts `run.cmd` at
  logon. When the PC is off or nobody is logged in, jobs queue. The 40-minute timeout only
  kills hung jobs.
- `Stop-ScheduledTask` doesn't stop the runner, because `run.cmd` detaches; stop the
  `Runner.Listener` and `Runner.Worker` processes instead. If you kill it mid-job, cancel the
  stuck run, or GitHub keeps the runner marked busy and dispatches nothing.
- A queued job with a listener but no `Runner.Worker` process is a known idle state with no
  known cause. Don't start cancelling things that are fine.
- A CI job takes about 7.7 GB of the PC's 15.8 GB. With several agents running tests beside it,
  it goes red with starvation timeouts (section 4). Run agents or CI, not both.
