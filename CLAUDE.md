# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

Dana is a collaborative to-do PWA, specification-first, built by role-scoped agent
sessions. Pre-release: the repository is documentation only until package P0 lands
`app/`.

**What this file owns:** the repository map, this machine's environment and commands,
and an orientation sketch of the architecture. **Everything else is a pointer.**
`docs/team/_shared-protocol.md` is the operative rulebook: the contract, boundaries
and owned paths, the definition of done, escalation, test ownership, and writing
conventions all live there and are deliberately not restated here, because a rule
stated twice is a rule that will one day disagree with itself. Wherever the two
appear to differ, the protocol wins.

## Before implementation work

If your task touches `app/` and your opening instructions did not give you
`docs/team/_shared-protocol.md` plus exactly one persona file from `docs/team/`, say
so and stop. That pairing is required, and this file is not a substitute for it.

Read spec section 11, including the 11.15 hazard list, before your first line of
code. It exists because training-data recall of the installed library versions is
wrong in specific, listed ways: FullCalendar 7 plugin entrypoints, Tailwind 4
CSS-first configuration, React Router library mode, zod 4, Express 5, Luxon DST
handling, and PGlite's single connection.

## Repository map

| Path | What it is |
| - | - |
| `docs/spec/` | The single source of truth, one contract split by numbered section. `00-index.md` maps section numbers to files; a reference to "section N.M" resolves to the file whose name begins with N. Sections 4 and 7 are frozen |
| `docs/rfcs/` | The change process (preamble of `0000-template.md`) and the active build plan, RFC `0001-mvp.md`, whose implementation plan is the authority on packages P0 to P10, their dependency order, and their owners |
| `docs/team/` | The shared protocol and thirteen role personas. A persona's Owns section is the only statement of ownership |
| `docs/design/` | Human-committed design material. Read it, never write it |
| `docs/learn/` | The operator's personal learning material, written only by a tutor session he opens. Build sessions never read or write it |
| `docs/operator/` | How this build is operated rather than written: the runbook, the co-lead's contract, and the prompting guide. It describes the coordination around you, not the contract that binds you, so there is nothing in it to reason from |
| `SESSION-LOG.md` | Every agent session that has run, in order, one table per package. A record written after the fact, and deliberately not one of the five state sources protocol section 2 names. Read it for context; never reason from it |
| `app/` | The application. Arrives with P0 |

## Commands and this machine

Everything runs from `app/`, never from the repository root, where there is no
`package.json` and the suite dies before running anything:

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build   # the gate, in CI's order
npm run dev                                # API server plus client dev server
npx vitest run tests/some-file.test.ts     # one file (Vitest 4 is the runner)
npx vitest run tests/ac-05*.test.ts tests/ac-06*.test.ts   # one package's range
npx vitest run -t "AC-042"                 # one acceptance criterion by number
```

Environment specifics, hard-won and non-obvious. This file is their home; the
protocol points here rather than repeating them.

- Scope the suite while you iterate and run it whole before you report. Measured
  2026-08-13 at 189 files and 1530 tests: the PGlite leg is about 200 seconds and
  the Postgres leg about 60, one package's range about 33. The full run is not
  ceremony, it is the only one that sees a cross-package regression, and a change
  under `app/src/shared/**` or `app/src/server/domain/**` reaches criteria in
  packages nobody was thinking about. Both scoped forms cost the same wall clock:
  naming files imports only those, while `-t` imports every file and skips
  execution in the rest. The Playwright leg is separate and is 135 cases.
- Two Vitest 4 flags fail in ways that read as a broken suite and are not. Positional
  arguments are substring filters, not regular expressions, so `"ac-(059|06[0-9])"`
  matches nothing and exits 1 with "No test files found". And `--reporter=basic` was
  removed; it dies with `ERR_LOAD_URL` while trying to load `basic` as a custom
  reporter module.
- There is no Docker on this machine and there will not be. Tests default to PGlite,
  an embedded Postgres 18 needing no setup, selected by the single seam in
  `app/db/client.ts`. The second leg runs against the PostgreSQL 18 installed here:
  service `postgresql-x64-18`, binaries in `C:\Program Files\PostgreSQL\18\bin`,
  port 5432, reached through `TEST_DATABASE_URL`. Nothing loads `app/.env` for a
  test run, only the server boot does, so a value sitting in that file will not be
  picked up by `npm test`.
- **`TEST_DATABASE_URL` is already set machine-wide here, so a bare `npm test` is
  the Postgres leg and not the PGlite one.** Running `npm test` twice measures one
  leg twice and reports both green, which is the false green the CI workflow's own
  guard exists to stop. Select the leg explicitly rather than by habit: the PGlite
  leg is `env -u TEST_DATABASE_URL npm test` (`$env:TEST_DATABASE_URL=''` in
  PowerShell), the Postgres leg is a plain `npm test`.
- **The browser leg must have that variable unset for the whole run**, and the
  reason is a seam that treats its two processes differently. `npm run e2e:app`
  seeds through `app/db/client.ts`, which prefers `TEST_DATABASE_URL`, and then
  boots the server through `app/src/server/index.ts`, which deletes it per 11.10
  and falls back to `.data`. With the variable set, the seed writes to `dana_test`
  while the browser is shown a `.data` nothing truncated, so the leg fails on
  missing fixtures with a count that drifts as that directory accumulates. Run it
  as `env -u TEST_DATABASE_URL npx playwright test`. Measured 2026-08-12 at the
  P8D session 1 verification: 97 of 97 in 1.2 minutes, run immediately after the
  five other legs with no cooldown and no process kill. The older belief that this
  leg needs a quiet machine, and the counts recorded for it, were this fault
  rather than load; `C:\Users\hassan\gate.ps1` still carries the superseded
  explanation and a stale count of 94.
- The cluster's own locale is French_France.1252 under libc, which is not what the
  suite runs on and must never become it. The `dana_test` database is created with
  the builtin C.UTF-8 locale so that it orders text exactly as PGlite does; spec
  11.10 carries the CREATE DATABASE statement, the reasoning, and the two checks
  that prove the two legs agree. Never point `TEST_DATABASE_URL` at a database that
  inherited the cluster default. The string authenticates as `dana_ci`, never the
  superuser, and lives in the runner installation's `.env` and in a gitignored
  `app/.env`; it is never committed and never stored as a GitHub secret (11.11).
- CI runs on a self-hosted GitHub Actions runner on this machine (spec 11.11), so
  there is no CI while the machine is off or the runner service is stopped: a pushed
  branch simply has no verdict until then, rather than failing. Hosted runs stopped
  starting on 2026-08-11 on an account billing failure, and the owner chose not to
  buy hosted minutes.
- The Postgres tooling here answers in French, `initdb --help` and `pg_controldata`
  included, and one translated flag name is wrong: the option is `--builtin-locale`,
  which the French help prints as `--builtin-provider`. Read option names from the
  English documentation, not from `--help` on this machine.
- The GitHub CLI is installed and authenticated but is on no shell's PATH. Call it
  by its full path, `"C:\Program Files\GitHub CLI\gh.exe"`, to read CI. The
  repository is private, so the unauthenticated API answers 404 and this is the only
  way to see a run. `gh run list --commit` returns nothing here; list runs with
  `--json databaseId,headSha` and match the sha yourself.
- `DANA_DEV_LOGIN=1` enables `POST /api/v1/auth/dev-login` for sessions without
  Google credentials. It is absent from production builds regardless of environment
  variables.
- Never commit `.data/` (the local PGlite directory) or any `.env` file.

## Architecture in brief

Orientation only. Normative detail is spec section 11, and it wins.

- **One deployable.** A single Node 24 process runs the Express 5 API, serves the
  landing page, and serves the Vite-built React SPA. One origin, so there is no CORS
  surface. TypeScript strict plus `noUncheckedIndexedAccess`, ESM, one package at
  `app/`, no workspaces.
- **Exactly one production instance.** In-memory rate limiting and the in-process
  60-second reminder tick both assume it. A second instance would need a shared rate
  limit store and a single elected tick owner, and must be flagged before it happens,
  never discovered after.
- **The section 7 API is the only mutation path.** No server-side rendering of
  application data, and no code path reaches the database without passing the 10.2
  authorization chokepoint. This is why the SPA-plus-API shape was chosen: the
  chokepoint is architectural rather than merely mandated.
- **Forward-only migrations.** Hand-authored SQL in `app/db/migrations/`, applied
  by the migrator in one transaction per run (spec 11.5), every constraint and
  index explicitly named because AC-001 asserts them by name. There is no down migration; recovery is a fix-forward
  migration or a restore. Destructive changes split expand-and-contract across two
  releases.
- **Ownership boundaries are directories:** `app/src/server/**`, `app/src/client/**`,
  `app/src/shared/**` (zod schemas and API types used by both sides), `app/db/**`,
  and `app/tests/**` (the acceptance suite).
- **Design tokens live in exactly one file**, `app/src/client/styles/tokens.css`, as
  Tailwind `@theme` variables. It is the only place raw color, type, spacing, and
  radius values may appear.
