# Dana

Dana is a collaborative to-do web application, delivered as an installable PWA.
Google sign-in, shareable folders as the single organizing primitive, and derived
scheduling: a task with no due date lives on Tasks, a dated task lives on Planned,
and My Day, Important, All, and Done are queries over the same rows. Version 1 is
deliberately manual and boring: no AI, no integrations, no offline writes.

The repository is specification-first. The product was fully specified before any
code existed, and it is implemented by AI coding agents working in role-scoped
sessions against that specification, which is the contract no session may
contradict.

## Where things are

| Path | What it is |
| - | - |
| `docs/spec/` | The contract, one file per numbered section. Start at `00-index.md` |
| `docs/rfcs/` | Proposed changes; `0001-mvp.md` is the build plan and its package order |
| `docs/team/` | The thirteen agent roles and the shared protocol that binds them |
| `docs/operator/` | How the build is run rather than written |
| `docs/design/` | The design brief, and the screens and notes as they land |
| `CHANGELOG.md` | What the product became |
| `SESSION-LOG.md` | How it was built: every session that has run, in order |
| `app/` | The application |

## Running it

```bash
cd app
npm ci
npm test        # against an embedded Postgres; no Docker needed
npm run dev     # API server plus client dev server
```

Specification section 11 records the stack and why each piece was chosen. The short
version: a Vite React single-page app and an Express API in one Node deployable,
Postgres 18, and a one-minute in-process reminder tick, hosted on Render as a single
always-on instance.

## Status

Pre-release. RFC 0001's implementation plan is the build order and says which
packages exist; `SESSION-LOG.md` records which have actually run, and `git log` is
the authority over both.
