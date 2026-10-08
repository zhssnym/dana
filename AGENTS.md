# AGENTS.md

Dana is a collaborative to-do PWA. One Node 24 process runs the Express 5 API and sends
the Vite/React app. Production is Postgres on Render. Uploaded files are in Cloudflare R2.
Local development and tests use PGlite. The code is in `src/`, `db/` and `tests/`.

The goal of this file: make a change fast and safe. Each rule here protects production.
If a rule does not do that, remove it.

## Commands

Run these from the repository root.

```bash
npm ci
DANA_DEV_LOGIN=1 npm run dev        # API + client, with dev login
npm run lint                        # eslint. Do not run prettier.
npm run typecheck
npm test                            # the whole vitest suite (about one minute)
npx vitest run <file>               # one file. Arguments are substring filters.
npm run gate                        # lint, typecheck and build, at the same time
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
2. Before you push, run `npm run gate` (about 30 seconds) and the tests for the
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

- **Migrations.** Files in `db/migrations/` go forward only and run on merge. Give a
  new migration a number and a `when` in `db/migrations/meta/_journal.json` that are
  higher than all others on `main` and on open branches. A lower `when` never runs, and
  no error shows. Give each constraint and index a name.
- **Request fields.** A field in `src/shared/` that no server code reads is accepted,
  dropped, and answered 200. Add the server code that reads the field in the same PR.
- **Content Security Policy.** A source that is not in `securityHeaders` in
  `src/server/index.ts` fails only in the browser. Check a new source in a browser.
- **Authorization.** Each route that takes an id needs its own `accessOf(...)` check.
  `tests/security/authorization-sweep.test.ts` checks ids in the path only. It does not check ids in the query or body.
- **Storage keys.** Never rename a `localStorage` or `sessionStorage` key. A rename resets
  that setting for all users.

## Writing

- Write technical text in Simplified Technical English (ASD-STE100): docs, comments,
  commit messages, PR and issue text. Use short sentences, active voice and no
  contractions. The `asd-ste100` skill has the full rules.
- Write only what is necessary. Make the text as long as the change needs: a small fix
  gets a one-line commit message and a short PR description.
- Do not repeat what the diff or the code shows. Write the reason, the risk, and what you
  checked.
- Code, commands, file paths and quoted errors stay as they are.

## Code

- Keep the diff small. Do not add abstractions, options or refactors that the change does
  not need.
- For code work, use the `ponytail` skill.
- **Comments:** write a comment only when the reason is not clear from the code. Use one or
  two lines. Do not write long comment blocks. When you change code that has a long
  comment, you can make the comment short or remove it.
- Many old comments are long and some are wrong. Trust the code, not the comment.
- Every client HTTP call goes through `src/client/api/http.ts`.
- `.env` is local only. Copy `.env.example` to `.env`. Never commit `.env` or the local
  `.data` folder.

## Tests

- Add a test only for security, data loss or a core path. Do not add a test for each
  change.
- Do not pin counts (routes, files, rows). Do not assert server message text.
- Do not change a test only to make your code pass. Change it when the behaviour changes,
  and say so in the PR.
- `tests/README.md` lists the tests that we keep.

## Design

- Calm and plain. Space, not decoration. One strong element on each screen.
- Colors, sizes, spaces and radii come only from `src/client/styles/tokens.css`. Do not
  write a raw value.
- Light and dark themes both work, and follow the system setting.
- No gradients, decorative shadows or glow. Sentence case. A button says what it does.
- For UI work, use the `impeccable` skill.

## Skills

Read the skill before you do the work it covers. Each skill is one file. When a skill and
this file do not agree, this file wins.

- `.agents/skills/ponytail/SKILL.md`: all code work, code review and repo audits.
- `.agents/skills/impeccable/SKILL.md`: all UI work.
- `.agents/skills/asd-ste100/SKILL.md`: all technical text.

## Docs

- `docs/` holds the rules that the code does not show: `docs/product-rules.md`,
  `docs/security.md` and `docs/architecture.md`. Update them when a rule changes. You do
  not have to update them for each change.
- Add new traps to `docs/troubleshooting.md`: symptom, cause, fix.
- Do not add other documents. Notes and open questions go in the issue or the PR.

## Claude Code

- Claude Code reads this file only when no `CLAUDE.md` exists. Do not create a
  `CLAUDE.md`.
- Agent worktrees are in the worktrees folder in .claude. `npm run e2e` does not work there.
- Give each parallel browser run its own `DANA_E2E_PORT` (default 3100).
