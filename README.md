# Dana

Dana is a collaborative to-do web application, delivered as an installable PWA.
Google sign-in, shareable folders as the single organizing primitive, and derived
scheduling: a task with no due date lives on Tasks, a dated task lives on Planned,
and My Day, Important, All, and Done are queries over the same rows. Version 1 is
deliberately manual and boring: no AI, no integrations, no offline writes.

This repository is specification-first. The product was fully specified before any
code; implementation is performed by AI coding agents in role-scoped sessions, and
the specification, not any agent's memory, is the contract.

## Repository map

| Path | What it is |
| - | - |
| `docs/spec/` | The single source of truth, one file per numbered section: data model, invariants, state machines, queries, API, UI, architecture, acceptance criteria. Start at `00-index.md` |
| `docs/rfcs/` | Numbered RFCs proposing changes; `0001-mvp.md` is the build plan (packages P0 to P10) |
| `docs/team/` | The thirteen agent role definitions and the shared protocol every session loads |
| `docs/design/` | The design brief for the designer, plus exported screens and notes as they land |
| `docs/runbook.md` | How the human operator drives agent sessions, merges, and releases |
| `CHANGELOG.md` | Release history; empty until 1.0.0 |
| `app/` | The application (arrives with package P0) |

## How this gets built

Work is broken into packages P0 to P10, executed in dependency order, one agent
session per package. A separate session writes the acceptance tests (AC-001
onward), and a third reviews and merges. The rules that make this safe live in
`docs/team/_shared-protocol.md`: implement only from the numbered specification
sections, never edit outside your owned paths, and never mark work done unless the
tests, build, and typecheck all pass.

## Running it

Until P0 lands there is nothing to run. Once `app/` exists:

```bash
cd app
npm ci
npm test        # unit and acceptance tests against an embedded Postgres, no Docker needed
npm run dev     # API server plus client dev server
```

The specification's section 11 records the stack and the reasons for it. The short
version: a Vite React single-page app and an Express API in one Node deployable,
Postgres 18, and a one-minute in-process reminder tick, hosted on Render as a
single always-on instance.

## Status

Pre-build. The specification is complete, the architecture is decided (section 11),
and P0 is the next action.
