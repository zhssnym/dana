# AGENTS.md

Dana is a collaborative to-do PWA. One Node 24 process runs the Express 5 API and serves
the Vite/React SPA. Production is Postgres on one Render instance; local development and
tests default to PGlite. All code lives in `app/`.

This file is short on purpose. It points at the documents that hold the detail.

## Where things are

| Path | What it is for |
| - | - |
| `docs/troubleshooting.md` | Pitfalls, flaky tests, machine and container setup. Read it before you believe a red test. |
| `docs/spec/` | The contract: what Dana must do. `docs/spec/README.md` explains how sections are numbered. |
| `docs/spec/11-architecture/11.15-known-hazards-for-implementers.md` | Library traps (Tailwind 4, React Router, zod 4, Express 5, Luxon, PGlite). Read it before touching those libraries. |
| `docs/spec/12-acceptance-criteria/README.md` | The acceptance criteria index and the allocator for new `AC-NNN` numbers (`## The next number`). |
| `docs/milestones/` | What is being built and why, one brief per milestone. |
| `docs/README.md` | What belongs in `docs/` at all. Read it before writing a document. |
| `app/tests/README.md` | What the test suite keeps and why. |
| `AGREEMENT.md` | The working agreement between Imran and Hassan. A human document, not agent rules. |

## Commands

Run everything from `app/`. There is no `package.json` at the repository root.

```bash
npm ci
DANA_DEV_LOGIN=1 npm run dev        # API + client dev server, with dev login
npm run lint                        # eslint; never run prettier here
npm run typecheck
npm run build
npm test                            # whole vitest suite
npm test -- --maxWorkers=2 <files>  # vitest flags go after --
npx vitest run <file>               # one file
npx vitest run -t "AC-NNN"          # one acceptance criterion
npm run e2e                         # browser tests (Playwright)
npm run gate -- --quick             # lint, typecheck, build; ends "GATE: incomplete" by design
npm run gate                        # the full gate; optional before a PR
```

- Print `TEST_DATABASE_URL` before you trust a run. Set means the Postgres leg; unset means
  PGlite. It is ambient and changes; never assume which one you got.
- Run `npm test` unpiped when you mean to read its exit code, and read the file count in
  the summary, not only "passed".
- Vitest positional arguments are substring filters, not regexes.

## Getting a change in

1. Branch from `main` (any name) and open a pull request. Issues are optional.
2. Before opening it:
   - `npm run gate -- --quick` passes, plus the tests for what you changed.
   - Get a second read: a fresh, read-only agent (or pass) reviews the diff using the
     checklist in "Reviewing a change" below. Put its verdict in the PR description.
3. The PR title is a Conventional Commit (`feat:`, `fix:`, `docs:`, ...). Use `!` only when
   people using Dana must relearn something.
4. CI runs the whole suite on every PR and on `main`: lint, typecheck, build, tests on
   Postgres, and a browser smoke test. It runs on Hassan's self-hosted Windows runner, so
   it waits while that PC is off.
5. Never merge while the PR check is red or pending.
6. Anyone may merge, with squash. **Merging to `main` deploys to production** within
   minutes; there is no staging. Agents merge only when a person asks them to.
7. A red `main` is fixed before anything else merges.

## Working rules

- **Comments are claims about intent, not facts about behaviour.** Many here are long,
  confident, and wrong. Verify by running the code.
- Never edit a test to make code pass. Change a test or criterion only when the behaviour it
  pins actually changes, and say which behaviour moved in the PR.
- **One PR carries the whole change.** A server change takes the screen that shows it; a
  changed word on screen takes the criterion and spec sentence that named it.
- **Verify by running or reading code, never by reading a document.** Check that code you
  found actually runs (something imports it, a route or screen reaches it). Counts and
  inventories in docs are the first thing to drift.
- Say how you verified UI: `npm test` proves the client compiles and little else. Say
  whether you ran the screen, or say plainly that you did not.
- Add a test only for security, data loss, or a core smoke path. Never pin counts (number
  of routes, files, rows in a list) in a test. A test worth having: asserts the stored row,
  not just the response; asserts what was removed as well as what was kept; was seen to go
  red when you broke the code the way it exists to catch; never asserts server message prose
  (assert SQLSTATE or constraint name); never compares two values it measured itself
  without a settle.
- Report "blocked" rather than "done" when something is unverified, and list what you did
  not verify.
- Stage explicit paths; never `git add -A` in a shared tree.
- Product calls are Imran's; technical calls are Hassan's. Decide the obvious yourself and
  say what you decided in the PR. Ask in the issue or PR only when a call is really theirs.
- `app/.env` is committed on purpose (private repo). Never copy its values anywhere else,
  and never commit the local `.data` directory.
- Design tokens live only in `app/src/client/styles/tokens.css`. Every client HTTP call goes
  through `app/src/client/api/http.ts`.

## Things that fail silently

Each of these passes every test when wrong. Details in `docs/troubleshooting.md`.

- **Migrations.** Files in `app/db/migrations/` are forward only and deploy on merge. Pick a
  number and a journal `when` in `app/db/migrations/meta/_journal.json` that are higher than
  anything on `main` and on other open branches; a lower `when` than one already applied is
  skipped with no error. Name every constraint and index.
- **Request fields.** A field in `app/src/shared/` that no server code reads is accepted,
  dropped, and answered 200. Ship the field, the server code that reads it, and a test that
  proves the value arrives, together.
- **Content Security Policy.** A source missing from `securityHeaders` in
  `app/src/server/index.ts` fails silently in the browser. Check new sources in a real
  browser.
- **Authorization.** There is no chokepoint. A new route that takes an id needs its own
  `accessOf(...)` gate and a row in the ac-397 authorization sweep saying what a stranger
  gets. That sweep sees path parameters only; ids from the query or body are unchecked.
- **Storage keys.** Never rename a `localStorage` or `sessionStorage` key. It silently
  resets that setting for every existing user, with no way back.
- **Tokens and presenters.** No test checks the values in
  `app/src/client/styles/tokens.css` or the words produced by
  `app/src/client/parts/presenters.ts`. Call out changes to either in the PR, with before
  and after.

## Docs and the spec

- Change `docs/spec/` only when a product rule or a contract changes, following its README.
  Never renumber a section; other files cite the numbers.
- Take new acceptance criterion numbers from the allocator in
  `docs/spec/12-acceptance-criteria/README.md`, and bump it in the same change.
- New pitfalls go in `docs/troubleshooting.md`, as symptom, cause, fix.
- Nothing unresolved lives in a file. Open questions go in an issue or the PR.
- Old comments cite `RFC 0005`, `CLAUDE.md`, or docs/workflow. Those are gone; read the
  citation as history, and see `docs/troubleshooting.md` for resolving them through git.

## Reviewing a change

Merging deploys straight to production, so the review is the second reader. Read the diff
itself, not the PR description, and check in this order:

1. The silent failures in `docs/troubleshooting.md`: a migration's number and journal
   `when` against `main` and open branches; a request field no server code reads; a new
   CSP source; an id-bearing route without an `accessOf(...)` gate and its ac-397 row (path
   ids only; query/body ids are invisible to it); a renamed storage key; `tokens.css` or
   `presenters.ts` changes.
2. Evidence: `--quick` output and focused tests for the change; PR CI green on the head.
3. Claims vs evidence: a "flake" must match a class in `docs/troubleshooting.md`.
4. What no test covers, and whether it matters (security, data loss, core path).
5. What breaks that nobody looked at: callers, screens reading a changed field, a
   migration's effect on existing rows, route mount order in `app/src/server/routes/bundle.ts`.

Report file:line and what would go wrong, ranked by impact, ending with a one-line verdict.
If you find nothing, say so; never invent findings.

## Claude Code notes

- Claude Code reads this file only when no `CLAUDE.md` or `CLAUDE.local.md` exists. Do not
  create a `CLAUDE.md` and do not run `/init`. Check with `/memory` that this file loaded.
- If it did not load (older client, third-party provider), create an untracked
  `CLAUDE.local.md` at the repository root containing the single line `@AGENTS.md`.
- There are no predefined subagents. Brief any agent you spawn with the task and the parts
  of this file it needs; the built-in Explore and Plan agents do not receive this file.
- Agent worktrees are created under the `worktrees` directory in .claude. That path has
  a dot segment, so `npm run gate` refuses the browser leg there and browser tests fail
  there. Use `npm run gate -- --quick` in a worktree, or copy the tree to a dot-free path.
- `DANA_GATE_PORT` (default 3100) gives each parallel browser run its own port. Two runs on
  one port corrupt each other with errors that look like real failures.
