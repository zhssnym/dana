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
| `docs/operator/` | The human operator's own folder: `runbook.md` (tracked, so it survives losing his machine) plus his logbook and reference material (local, untracked, absent from a fresh clone). Do not load any of it into your reasoning |
| `app/` | The application. Arrives with P0 |

## Commands and this machine

Nothing runs until P0 lands `app/`. After that, everything runs from `app/`:

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build   # the gate, in CI's order
npm run dev                                # API server plus client dev server
npx vitest run tests/some-file.test.ts     # one file (Vitest 4 is the runner)
npx vitest run -t "AC-042"                 # one acceptance criterion by number
```

Environment specifics, hard-won and non-obvious. This file is their home; the
protocol points here rather than repeating them.

- There is no Docker on this machine. Tests default to PGlite, an embedded Postgres
  18 needing no setup, selected by the single seam in `app/db/client.ts`. Set
  `TEST_DATABASE_URL` to run against a real Postgres instead; CI runs both, with
  `postgres:18` as the production-fidelity authority (spec 11.10).
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
