# AGENTS.md

Dana is a collaborative to-do PWA. One Node 24 process runs the Express 5 API and sends
the Vite/React app. Production is Postgres on Render. Uploaded files are in Cloudflare R2.
Local development and tests use PGlite. All code is in `app/`.

The goal of this file: make a change fast and safe. Each rule here protects production.
If a rule does not do that, remove it.

## Commands

Run these from `app/`.

```bash
npm ci
DANA_DEV_LOGIN=1 npm run dev        # API + client, with dev login
npm run lint                        # eslint. Do not run prettier.
npm run typecheck
npm test                            # the whole vitest suite (about one minute)
npx vitest run <file>               # one file. Arguments are substring filters.
npm run gate -- --quick             # lint, typecheck and build
npm run e2e                         # browser tests (Playwright)
```

`TEST_DATABASE_URL` set means Postgres. Unset means PGlite.

## Work fast: the local loop

1. Run `DANA_DEV_LOGIN=1 npm run dev`. A saved change shows in the browser in about one
   second. Make and check all small changes here, not on GitHub.
2. Commit locally and often. A local commit costs nothing.
3. Push only when the feature or fix is complete. Do not push each small change.

## Ship a change

1. Make a branch from `main`. Open a pull request. The title is a Conventional Commit
   (`feat:`, `fix:`, `chore:`, `docs:`).
2. Before you push, run `npm run gate -- --quick` (about 30 seconds) and the tests for the
   code you changed.
3. CI runs lint, typecheck, build, all tests on Postgres and a browser smoke test. CI runs
   on Hassan's Windows PC, so CI waits when that PC is off.
4. Merge with squash only when CI is green. **A merge to `main` deploys to production.**
   There is no staging.
5. If `main` is red, repair it first.
6. Agents merge only when a person tells them to merge.

Say in the PR what you checked and what you did not check. For a screen change, say if
you ran the screen.

## Things that fail silently

These pass every test when they are wrong. Look for them in your diff.
`docs/troubleshooting.md` has the details.

- **Migrations.** Files in `app/db/migrations/` go forward only and run on merge. Give a
  new migration a number and a `when` in `app/db/migrations/meta/_journal.json` that are
  higher than all others on `main` and on open branches. A lower `when` never runs, and
  no error shows. Give each constraint and index a name.
- **Request fields.** A field in `app/src/shared/` that no server code reads is accepted,
  dropped, and answered 200. Add the server code that reads the field in the same PR.
- **Content Security Policy.** A source that is not in `securityHeaders` in
  `app/src/server/index.ts` fails only in the browser. Check a new source in a browser.
- **Authorization.** Each route that takes an id needs its own `accessOf(...)` check.
  The ac-397 test checks ids in the path only. It does not check ids in the query or body.
- **Storage keys.** Never rename a `localStorage` or `sessionStorage` key. A rename resets
  that setting for all users.

## Code

- Keep the diff small. Do not add abstractions, options or refactors that the change does
  not need.
- **Comments:** write a comment only when the reason is not clear from the code. Use one or
  two lines. Do not write long comment blocks. When you change code that has a long
  comment, you can make the comment short or remove it.
- Many old comments are long and some are wrong. Trust the code, not the comment.
- Every client HTTP call goes through `app/src/client/api/http.ts`.
- `app/.env` is in git on purpose (private repo). Do not copy its values to other places.
  Do not commit the local `.data` folder.

## Tests

- Add a test only for security, data loss or a core path. Do not add a test for each
  change.
- Do not pin counts (routes, files, rows). Do not assert server message text.
- Do not change a test only to make your code pass. Change it when the behaviour changes,
  and say so in the PR.
- `app/tests/README.md` lists the tests that we keep.

## Design

- Calm and plain. Space, not decoration. One strong element on each screen.
- Colors, sizes, spaces and radii come only from `app/src/client/styles/tokens.css`. Do not
  write a raw value.
- Light and dark themes both work, and follow the system setting.
- No gradients, decorative shadows or glow. Sentence case. A button says what it does.

## Docs

- `docs/spec/` is reference for product rules. Update it when a product rule changes. You
  do not have to update it for each change.
- An acceptance criterion number (`AC-NNN`) is optional. If you add one, take the next
  number from `docs/spec/12-acceptance-criteria/README.md`.
- Add new traps to `docs/troubleshooting.md`: symptom, cause, fix.
- Do not add other documents. Notes and open questions go in the issue or the PR.

## Claude Code

- Claude Code reads this file only when no `CLAUDE.md` exists. Do not create a
  `CLAUDE.md`.
- Agent worktrees are in the worktrees folder in .claude. The browser part of `npm run gate` does not
  work there. Use `npm run gate -- --quick`.
- Give each parallel browser run its own `DANA_GATE_PORT` (default 3100).
