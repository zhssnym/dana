# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

Dana is a collaborative to-do PWA, specification-first. Version 2.2 is shipped and
deployed from `main`; the application lives in `app/`.

**What this file owns:** the repository map, this machine's environment and commands,
and an orientation sketch of the architecture. **Everything else is a pointer.** A rule
stated twice is a rule that will one day disagree with itself, so nothing here restates
a rule that lives elsewhere.

**How work flows is `docs/workflow/`.** Start at `docs/workflow/workflow.md`, then read the
file for your side: `docs/workflow/frontend.md` or `docs/workflow/backend.md`.
Each side's file is meant to be complete enough to work from on its own. Nothing about
process is restated in this file.

That workflow replaced an earlier one built for a fleet of thirteen agent personas working
package by package. The former rulebook at `docs/team/_shared-protocol.md` is deleted along
with the personas, and three agents in `.claude/agents/` replaced them; that directory
holds seven as of 2026-09-20, #246 having added four more. The restructure that
did it ran on 2026-08-31 and 2026-09-01; its reasoning is in git, and what it left undone is
in the GitHub issues.

## Before implementation work

**Comments in this repository state intent and behaviour in the same voice, and nothing
distinguishes them.** They are long, confident, and often describe what a piece of code is
*supposed* to do rather than what it does. At least one has been provably false since it was
written: `app/src/client/components/folder-row.tsx` claimed "one centred glyph per folder in
the rail" for a row that had never been centred, and a session working from that comment
concluded the reported bug was impossible. **Treat a comment as a claim about intent. Verify
behaviour by running it.** This is the most likely way a session here goes wrong.

Read spec section 11, including the 11.15 hazard list, before your first line of
code, **when the work touches the libraries it names**. For a change confined to markup or
styling it is a tax, and section 11.15's list will tell you within a minute whether it bears
on what you are doing. It exists because training-data recall of the installed library
versions is
wrong in specific, listed ways: FullCalendar 7 plugin entrypoints, Tailwind 4
CSS-first configuration, React Router library mode, zod 4, Express 5, Luxon DST
handling, and PGlite's single connection.

## Repository map

| Path | What it is |
| - | - |
| `docs/README.md` | **What belongs in `docs/` at all, added 2026-09-20.** One rule: if an agent could answer it by reading the code or running something in under a minute, it does not go there; if an agent could not answer it at all, it goes there and nowhere else. Read it before writing any document, and before defending one against deletion |
| `docs/spec/` | The single source of truth, one contract split by numbered section. `README.md` maps the numbers; **section N is the directory beginning with N, section N.M is the file inside it beginning with N.M**. Sections 4 and 7 are frozen |
| `docs/milestones/` | **What Dana is building and why, one brief file per milestone.** Added 2026-09-20, replacing `docs/rfcs/`. A milestone file is a wishlist and never a progress tracker: status lives in the coordinating issue, contracts in `docs/spec/`. `M0.md` is the retroactive name for everything before the numbering started, and is the one written as a record |
| `AGREEMENT.md` | The working agreement between the two people building Dana. A human document, not a specification. **No rule for an agent is derived from it** |
| `app/` | The application |

Deleted, and mentioned here only because references to them survive elsewhere in the
repository: `docs/team/`, `docs/design/`, `docs/learn/`, `docs/operator/`, `docs/ux/`,
`docs/parity/`, `docs/security/`, `dana-reports/`, `AGENTS.md`, `SESSION-LOG.md`.
Where one appears in a dated record inside the specification or in `docs/milestones/M0.md`, it is history
and accurate as history. Where one appears anywhere else, it is a mistake worth fixing.

### Resolving an `RFC 000N` citation

**About 480 comments across 256 files cite decisions by number, and the documents they
name no longer exist in the tree.** `docs/rfcs/` was deleted on 2026-09-20 with the
milestone restructure. The citations were deliberately left alone: roughly 90 of them
name unit, S-row and P-row numbers that no index has ever covered, so a rewrite could
not have resolved them, and doing it by hand meant editing 165 files under `app/src`.

They are not broken links. Nothing in a citation is a path. Two commands resolve them,
and they do different jobs:

```bash
# The index. One row per change-control item: its date, what it decided, and which
# spec sections took it. Fastest for "what was item 44?" - it is line 289.
git show a7886dfe:docs/rfcs/0005-v2-specification.md

# The full originals, 6,763 lines for RFC 0005. Needed for a unit, an S-row, a P-row,
# or the full text of an item. Item 44's four frozen changes start at line 997.
git show v2.2.0:docs/rfcs/0005-v2-specification.md
```

**The release tags are load-bearing and must not be deleted.** A clone fetched without
tags resolves none of this; `git fetch origin --tags` first. `docs/milestones/M0.md`
carries the same pointer and the reasoning.

**What the citation is evidence of is a ruling, not current behaviour.** The spec is the
authority on every one of these decisions and has moved past them. Read the citation to
learn why something is the way it is, never to learn what it does.

## Commands and this machine

Everything runs from `app/`, never from the repository root, where there is no
`package.json` and the suite dies before running anything:

```bash
npm ci
npm run gate                               # the gate: 11.11's six steps, in order, with a record
npm run gate -- --quick                    # lint, typecheck, build only
npm run lint && npm run typecheck && npm test && npm run build   # four of the six, by hand
npm test -- --maxWorkers=2                 # vitest flags go after the --
npm run dev                                # API server plus client dev server
npx vitest run tests/criteria/ac-025-create-defaults.test.ts   # one file (Vitest 4 is the runner)
npx vitest run tests/criteria/ tests/guards/     # a whole category
npx vitest run -t "AC-042"                 # one acceptance criterion by number
```

Environment specifics, hard-won and non-obvious. This file is their home; the
protocol points here rather than repeating them.

- **The acceptance suite was cut to a core set on 2026-09-20, and every count below it
  predates that.** 221 of 268 criterion files and 113 of 119 browser specs were deleted
  on the owner's ruling that M1 velocity outweighs exhaustive criterion coverage; 47
  criterion files carrying 232 cases and 6 browser specs carrying 20 remain, and the
  colocated tests under `app/src/**` were left whole. **Measured on a Linux container
  rather than this machine, PGlite leg: 681 seconds for 362 files and 2216 tests before,
  181 seconds for 141 files and 1344 tests after.** That container runs 3 workers against
  this machine's 12, so read the *ratio* and not the seconds: the leg lost roughly
  three quarters of its wall clock. lint went 13s to 9s and typecheck 26s to 23s there,
  which is the part worth knowing — **cutting tests barely moves typecheck**, because
  `tsconfig.server.json` still includes `tests/**` and the colocated tests are most of
  what it compiles. `app/tests/README.md` carries what was kept and on what rule.
  **Two of the deleted criteria were failing when they were deleted** — `ac-390` and
  `ac-415`, both red on an untouched tree in the run measured immediately before — so
  their defects are unfixed and now unwatched rather than fixed.
- **The PGlite leg stopped being one of the steps on 2026-09-20, and the gate now runs one
  test leg rather than two.** 11.11's amendment is the ruling and `scripts/gate.mjs` the
  implementation. Postgres is the leg, because it is the engine production runs and, at the
  2026-09-03 measurement on this machine, the faster of the two: **94 seconds against 291**.
  **PGlite is the fallback and never the gate** — a process with no `TEST_DATABASE_URL` runs
  the suite on PGlite rather than running nothing, and that record is `incomplete` rather
  than green. Two things follow for a session here. The bullet below about selecting a leg
  explicitly still holds and matters more, not less: there is no second leg left to notice
  that this one fell back, so **print the variable before you trust a green**. And the
  cross-engine class recorded further down — the `current_date` zone defect — is now caught
  by whichever leg ran rather than by two legs disagreeing.
- **The whole gate runs on a Linux container as well as on this machine, since 2026-09-20
  and issue #235, and that is new.** The Postgres leg used to refuse any server below 18:
  11.10's `CREATE DATABASE` carries `LOCALE_PROVIDER builtin`, which arrived in Postgres 17,
  and a 16 server answers `option "builtin_locale" not recognized` in global setup before
  one file runs. The leg now picks the clause from `server_version_num`, so 17 and above
  get 11.10's statement unchanged and anything older gets libc `LC_COLLATE 'C'`, the same
  code-point ordering from a weaker source, **and ctype `C.UTF-8` rather than `C`**: those
  two order identically and fold differently, `C` folding ASCII only, so the first draft of
  the fallback passed every test in the suite while answering `ORDER BY lower(name)` in a
  different sequence from the gate machine. 11.10's amendment carries the measurement.
  **Read the consequence rather than the fix:
  until this landed, exactly one machine could produce a green gate record**, the gate
  having been one leg since #229, and #231 merged unverified on Postgres while #232 sat red
  for three days because a pull request's `check` job runs lint, typecheck and build and
  nothing else. **Measured 2026-09-20 on a 2026-09 container, on the #235 branch rather
  than on `main`** — `main` at 4783810 cannot run this leg on a 16 server at all, which is
  the point — **the whole six steps in 2 minutes 10 seconds**: lint 6s, typecheck 16s,
  Postgres leg 55s for 141 files, build 7s, browser leg 46s for 20 cases, 4 of them the
  pre-existing failures of #234. Two setup notes, both outside the repository. The cluster's own locale must be C.UTF-8, which `initdb
  --locale=C.UTF-8` gives, and `initdb` refuses to run as root, so it runs as `postgres`.
  And the container's Playwright browsers are a different build from the one
  `@playwright/test` pins, which fails as `Executable doesn't exist at
  …/chromium_headless_shell-<pinned>/…` and is answered by symlinking the installed build
  into the pinned name rather than by `playwright install`.
- Scope the suite while you iterate and run it whole before you report. **Measured
  2026-09-03 on this machine, both legs green: 295 files and 1961 tests.** It was 279 and
  1899 on 2026-09-01, so read every count in this file as a dated measurement rather than
  a target. Wall clock that night on a quiet machine: the PGlite leg **291 seconds**, the
  Postgres leg **94** (it was about 240 before issue #32 gave each worker its own
  database, so that leg got *faster*), the browser leg **9.7 minutes for 289 cases**, and
  a range of criteria about 33. The full run is not
  ceremony, it is the only one that sees a cross-package regression, and a change
  under `app/src/shared/**` or `app/src/server/domain/**` reaches criteria in
  packages nobody was thinking about. Both scoped forms cost the same wall clock:
  naming files imports only those, while `-t` imports every file and skips
  execution in the rest. The Playwright leg is separate and is 135 cases.
- PGlite workers can die mid-run: the report shows "[vitest-pool]: Worker
  forks emitted error" or whole files failed with their tests skipped, and
  both read as broken code and are not. Rerun the affected files alone before
  believing any of those failures.
- **A local `app/.data` can reach a state where every query throws and the
  application looks comprehensively broken while the code is fine.** Seen once,
  2026-08-26, at S17b. Every request answers 500, `resolveSession` included,
  and the throw is at `PglitePreparedQuery.queryWithCache`. **The tell is that
  the 500s come from session resolution rather than from the handler under
  test**, so a package that changed one route appears to have broken every
  route it never touched. `rm -rf app/.data` fixes it and costs nothing, that
  directory being a local scratch database that is never committed. **The cause
  is unknown and is deliberately not guessed at here.** The session that hit it
  had no dev server on that worktree, had run roughly twenty focused Playwright
  runs against the directory over one evening, and had not captured the first
  failing run; whether the fault was two of those overlapping, accumulated
  state across their seed-and-truncate cycles, or something else is not known.
  A wrong cause in this file is worse than none, and the corrected
  "capping the workers is not certainty" bullet below is that mistake already
  made once: it named load, was measured wrong, and until it was corrected it
  was teaching sessions to serialise runs that never needed serialising.
- **Capping the workers is not certainty, corrected 2026-08-24 against
  measurement.** This bullet used to say "cap the workers (`--maxWorkers=2`,
  or 1 for certainty)" and named load as the cause, a dev server or a second
  agent running. Both halves are now known to be too confident. That day a
  `--maxWorkers=1` run on a machine with no CI job and no second agent on it
  lost five files, and a parallel CI run half an hour earlier lost two; three
  other runs of the same commit were clean. Capping lowers the odds and buys
  nothing certain, and it is expensive: measured that day at about 25 minutes
  serially against roughly 4 in parallel, at 228 files and 1665 tests. Prefer
  the parallel default and read the file count, which is what actually tells
  you whether a run measured the suite.
- **`npm test` runs through `app/scripts/run-suite.mjs`, which fails a run
  that exited 0 without accounting for every file it collected.** Written
  2026-08-24 after a serial run reported `Test Files 223 passed (228)` and
  `Tests 1636 passed (1665)`, emitted five worker-fork errors, warned that
  this "might cause false positive tests", and returned exit code 0, which is
  all CI's test steps read. The guard compares the categories vitest resolved
  against the total it collected and refuses the difference; a non-zero exit
  passes straight through, and a summary it cannot parse is passed through
  rather than invented into a failure. It is proven both ways against the two
  real runs of that day. Pass vitest flags after `--`, as in
  `npm test -- --maxWorkers=2 tests/some-file.test.ts`.
- **A piped `npm test` has no exit code worth reading, whatever the suite did.**
  This shell runs with `pipefail` off, measured 2026-08-26: `(exit 7) | tail -1`
  answers 0 while `(exit 7)` answers 7. So `npm test 2>&1 | tail -N`, which is
  how a session usually runs it, yields tail's status and the run-suite guard's
  non-zero can never reach the caller. This is a **second and independent
  reason** for the instruction above to read the file count rather than the exit
  code, and it bites earlier than the worker-fork one: piped, there is no
  meaningful code to read at all, and no fork has to die for that to be true.
  Run the leg unpiped when the code is what you intend to trust.
- **`git fetch origin <branch>` does not update `refs/remotes/origin/<branch>`
  here, and the stale ref reads as other people's work being unpushed.** It
  caught two sessions independently on the evening of 2026-08-26. One fetched,
  read `origin/v2-build` three merges behind its true head, and was composing a
  message to the owner saying three packages had never been pushed; the other
  told a peer a branch head that was already stale when it said it. The failure
  is alarming in the direction that makes a session act, which is what makes it
  worth a bullet. Two commands settle it: `git ls-remote --heads origin <branch>`
  reads the remote itself and is the authority, and
  `git fetch origin <branch>:refs/remotes/origin/<branch>` updates the local ref
  so `git merge --ff-only origin/<branch>` is then safe. Read the remote before
  believing anything about what is or is not published.
- **`git rebase --continue` deletes every `#`-line from a conflicted commit's
  message here, and nothing reports it.** Measured 2026-09-20 on
  `backend/227-label-lifecycle` (issue #277): **15 lines eaten** from one commit —
  seven `##` headings, their blank lines, and a body line beginning
  `#226 and #228)`. The mechanism is two defaults meeting. `git rebase --continue`
  opens an editor for the message of a commit that had a conflict; under
  `GIT_EDITOR=true`, which is how an agent drives a non-interactive rebase, the
  editor "succeeds" instantly, and git then applies its own default
  `cleanup=strip`, which removes every line beginning with `#`. Two of this
  repository's conventions are exactly that: commit messages are long markdown with
  `##` headings, and issue references routinely begin a line. **Only the conflicted
  commit is touched** — a clean replay step opens no editor and neither does
  `git cherry-pick` — so a rebase with one conflict damages exactly one message and
  leaves the rest intact, which is what makes it easy to miss. It is invisible in
  `git log --oneline`. Pass `git -c core.commentChar=';' rebase --continue`, or
  `--cleanup=verbatim`, and **diff the message afterwards**, which is the only
  thing that actually catches it: write `git log -1 --format=%B` of the original
  and of the rebased sha to two files and `diff` them. Why this costs more here
  than in most repositories: `docs/workflow/workflow.md` makes the message
  load-bearing — the hard stops declared, the criteria named with the decision
  behind each, the gate record quoted — so the failure is **a commit that no longer
  declares what it declared**, with no error and a log that looks fine. This
  project's whole defence against an undeclared hard stop is that somebody wrote it
  down, and this deletes the writing down.
- **Prettier is not this repository's formatter and must not be run here.** Same
  issue, same reading. It is absent from `app/package.json` entirely — `"lint":
  "eslint ."` is the whole toolchain and there is no `.prettierrc` — so
  `npx prettier --write` does not fail for want of a config: `npx` fetches a
  transient copy and applies stock defaults. An agent on #228 ran it on one
  criterion file and **rewrote all 459 lines to double quotes**. Reverted
  immediately, and it is recorded because it is the same class as the trap above: a
  tool that looks like it belongs here and does not. What exists is `npm run lint`.
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
- **Never select a test leg by habit; select it explicitly and check which one
  you got.** `TEST_DATABASE_URL` was set machine-wide when this file was first
  written, which made a bare `npm test` the Postgres leg. A later revision of
  this bullet claimed it was "no longer set in any scope, verified 2026-08-16 at
  the 2026-08-16 release, so a bare `npm test` is now the PGlite leg"; **that is
  false again, and the flip-flop is the point of the bullet rather than an
  embarrassment to it.** Measured 2026-08-30 at the eight-agent polish round:
  the variable is set in the **user** scope, four sessions found it independently
  (three subagents printing it before their gate, and the integrating session
  reading it back after), and so a bare `npm test` here is the **Postgres** leg
  once more. Nobody recorded setting it back, which is exactly why the state of
  this variable must never be read from this file: **it is ambient, it has
  changed at least twice, and the only trustworthy answer is the one your own
  process prints.** Either way,
  running `npm test` twice measures one leg twice and reports both green, which
  is the false green the CI workflow's own guard exists to stop. Print the
  variable before you trust a leg: the Postgres leg needs an explicit
  `TEST_DATABASE_URL` in that process, the PGlite leg needs it unset
  (`env -u TEST_DATABASE_URL npm test`, `$env:TEST_DATABASE_URL=''` in
  PowerShell). CI runs both as separate named steps and is the authority.
- **The browser leg cannot pass from a checkout whose path contains a directory
  beginning with a dot, and the worktree an agent gets by default is one.**
  `.claude/worktrees/` begins with a dot, as the older `.work` did, so what used to
  be a fact about one session's scratch checkout is now the default path on every
  host — and #235 made the browser leg runnable on the containers agents run in, so
  it is reachable from there rather than theoretical. **Run the browser leg from a
  dot-free path, and know that your worktree is probably not one.** Since 2026-09-20
  and issue #273 `npm run gate` refuses to start the leg from such a path and says
  why, rather than producing twenty reds that look like a broken application. The SPA fallback
  answers client routes with `res.sendFile()` on an absolute path, and Express
  refuses any path carrying a dot segment, so `GET /app` returns 404 with a
  `bad_request` body while `GET /` still succeeds through `express.static`.
  Every spec then fails on a missing sidebar, which reads as a broken
  application and is not one. Verified 2026-08-16 by serving one file from two
  paths differing only in a dot directory: 404 against 200, and again 2026-09-20
  on Express 5.2.1 on Linux, which is what `tests/guards/guard-gate-host.test.ts`
  now measures on every run so that the refusal outlives nobody's memory. CI's
  workspace and Render's `/opt/render/project/src` carry no dot segment, so both
  are green and only a run from a dot path is red. To run this leg locally, copy or clone
  the tree to a path with no dot directory; otherwise read CI's Playwright step
  as the verdict.
- **The browser leg needed that variable unset for the whole run, and no longer
  does. Corrected 2026-08-31.** `playwright.config.ts:146` now pins
  `TEST_DATABASE_URL: ''` inside `webServer.env`, with a comment describing the
  same seam this bullet describes, so the `env -u` prefix below is redundant and
  has been since commit `63ecc34` on 2026-08-14. The reasoning is kept because it
  is still the reason the config line exists, and deleting it would leave that
  line looking arbitrary. The seam treats its two processes differently. `npm run e2e:app`
  seeds through `app/db/client.ts`, which prefers `TEST_DATABASE_URL`, and then
  boots the server through `app/src/server/index.ts`, which deletes it per 11.10
  and falls back to `.data`. With the variable set, the seed writes to `dana_test`
  while the browser is shown a `.data` nothing truncated, so the leg fails on
  missing fixtures with a count that drifts as that directory accumulates. That is
  what the config line prevents; you no longer need to prefix the command.
  Measured 2026-08-12 at the
  verification on that date: 97 of 97 in 1.2 minutes, run immediately after the
  five other legs with no cooldown and no process kill. The older belief that this
  leg needs a quiet machine, and the counts recorded for it, were this fault
  rather than load; `C:\Users\hassan\gate.ps1` still carries the superseded
  explanation and a stale count of 94.
- **Two browser legs cannot share a port, and the collision does not
  announce itself as one.** Measured 2026-08-25. `playwright.config.ts`
  served on port 3100 and sets `reuseExistingServer: false`, so every run starts
  an `e2e:app` of its own; a run that has printed its tally has *not* released
  the port, because the `npx` process outlives the report. That session's own
  finished full leg held 3100 for over an hour while a concurrent
  verification and a re-run each started a third and second server, all three
  seeding and truncating one another's database underneath the browser. What it
  looks like from the report is code: `Page crashed`, tests failing at 0 ms,
  assertions timing out at 2.2 minutes that pass in 3 seconds alone, and one
  criterion red twice in a row for what looks like a reproducible reason. The
  whole leg read 141 of 158; the eight affected files re-run alone on a quiet
  machine read 17 of 19 in 1.5 minutes against 32.8 for the contended whole, and
  the two remaining reds were the genuine ones. So: **before a browser leg,
  check that nothing else is on the port you are about to use and that no stale
  `npx playwright` survives a previous run**, and where two sessions must overlap,
  give each its own port. **Since 2026-09-20 and issue #254 that is
  `DANA_GATE_PORT`, which both `playwright.config.ts` and the gate read, and
  which defaults to 3100** — so two sessions overlap by each exporting one, and
  `npm run gate` works on an alternate port rather than only a bare
  `npx playwright test`. The workaround this bullet used to carry, an untracked
  `sed 's/3100/3110/' playwright.config.ts > s10-verify.config.ts`, is superseded:
  it produced no gate record, which is what made it useless for the thing that was
  actually queued, and `gate.mjs` passes no `--config` so it could never have
  reached one. This is not
  the vitest fork-flake and must not be treated as it: that one is not caused by
  load, corrected above, and `run-suite.mjs` fails a run that loses files.
  Separate worktrees make vitest legs genuinely independent, having no port and
  no shared database; only the browser leg has a port at all.
- **Killing a browser leg's server does not kill the leg, and the next run
  then collides with the survivor.** Measured 2026-08-27, and it is
  the collision two bullets above caused by one session rather than two.
  `playwright.config.ts` starts `npm run e2e:app` per run, so a session that
  wants a fresh run against new code kills the process listening on the port
  and starts again. That kills the *server*. The parent `playwright test`
  process survives it, keeps its workers, and goes on writing into the same
  `test-results/` the new run is writing into; the new run then starts a
  second server on the same port. What it looks like from the report is not a
  port error: it is `apiRequestContext.post: connect ECONNREFUSED` and
  `page.goto: net::ERR_CONNECTION_REFUSED` on a scattering of files, mixed in
  with real failures, and stale artifacts from the dying run sitting beside
  fresh ones with indistinguishable timestamps. That session read contaminated
  counts for about an hour before finding two `playwright test` processes
  alive at once. **Kill by command line rather than by port**, every `node.exe`
  whose command line matches `playwright` or `e2e:app`, then poll until
  no listener is left on the port. **Two forms, because there are two hosts, and
  running the wrong one is the whole hazard (corrected 2026-09-20, issue #273).**
  On this machine, which has `netstat` and no `lsof`:
  `until ! netstat -ano | findstr LISTENING | findstr ":<port>"` — or with `grep`
  in place of `findstr` under Git Bash, which is where that line was born. On a
  Linux container, which has `lsof` and often neither `netstat` nor `ss`:
  `until ! lsof -nP -iTCP:<port> -sTCP:LISTEN >/dev/null; do sleep 1; done`.
  **Check the command exists before trusting its silence**, `command -v lsof` or
  `where netstat`: a missing command writes nothing, nothing greps to nothing,
  and the loop then reports **every port on the machine clear**. That is not a
  weak check, it is an unconditional all-clear from the one check whose whole job
  is to refuse, and it is what a container found when this bullet carried only
  the `netstat` form. `until !` cannot save you either — a missing command exits
  non-zero, which it reads as "the port is quiet". `npm run gate` no longer
  depends on any of this: it reads the socket table itself with whichever of
  `lsof`, `ss` and `netstat` the host has, and **refuses the browser leg outright
  on a host where none of them can read one**.
  Poll for LISTENING only, corrected 2026-09-04 (issue #141): a finished leg
  leaves dozens of client sockets in TIME_WAIT for minutes (85 measured on one
  port with no listener), so a bare grep on the port never clears, and it is the
  listener the next run's readiness probe needs gone. And **delete
  `test-results/` between runs**, so that no
  artifact you are about to read belongs to a run that is already dead.
- **A lone browser leg on its own port still loses about one case a run when
  commit charge is short, and the port-collision bullet above does not cover
  it.** Measured 2026-08-26, three whole runs of one commit on an owned
  port 3122 with nothing listening on 3100 and no stale `npx playwright`:
  **227 of 228, then 227 of 228, then 228 of 228.** The two reds were
  different cases (`session-path.spec.ts:133`, then
  `ac-217-folder-menu-by-role.spec.ts:83`), each hit the 120-second test
  timeout, and each passed alone in under 7 seconds against a 2.2-minute
  failure in the leg. **The presenting shape is the same as the collision
  above and the cause cannot be it**, which is the whole reason for this
  bullet: a session that reads the port note, checks the port, finds it clear
  and therefore believes the red, believes a defect that is not there. What
  was true instead was `FreeVirtualMemory` around 3.5 GB of 33.9 with two
  Chrome processes holding 4.4 GB of private bytes each, the same commit-charge
  ceiling the vitest bullets record, and the leg ran 14.4 and 20.3 minutes
  against 17.2 for the clean one. **The cause is not asserted further than
  that**, on the corrected-bullet lesson above: memory pressure is what was
  measured alongside it, not what was proven to produce it. What to do is
  cheap and does not depend on the cause. **Re-run a failing case alone before
  believing it, and read a whole-leg red of one or two cases as unmeasured
  rather than as broken**, exactly as the vitest fork-flake bullet says for its
  own leg. Where a green whole leg is what you owe, freeing commit charge
  first is worth more than re-running: closing the two browsers was worth
  8.8 GB, more than every test process on the machine put together.
- **"Re-run a failing case alone before believing it" is wrong for a case whose
  assertion races a UI transition, and there it manufactures a false
  confirmation rather than a check. Measured 2026-08-27, and
  scoped rather than added to the bullet above, which stands for the flake it
  was written about.** Two sessions independently re-ran
  `ac-182-view-preferences-persist.spec.ts:227` alone, each on a quiet machine
  on its own port from a dot-free worktree, each saw it fail, and each read that
  as proof the red was real; one of them went on to attribute it to the other's
  merge. It was neither. The case drags a resize handle and reads the width
  **immediately after `mouse.up()` with no settle**, so it can read a value the
  interface is still passing through: the stored and restored width is 590 on
  every run, which is exactly `DIALOG_DEFAULT` 680 minus the 90px drag, while
  the value the case compares against reads 591, 592 or 593. **The direction is
  the whole point and it is the opposite of the flake above: a quiet machine
  shortens the gap between the gesture and the read, so isolation makes this
  class fail sometimes where the flake above fails less.** That is a direction
  and **not a rate**: five samples in all, and nothing here supports a
  frequency. **Two tells, and the second is the one that
  separates this from an ordinary off-by-one.** The assertion compares two
  measurements the test took itself rather than one measurement against a
  constant. And the wrong readings are all **on one side**: every one was larger
  than the restored value and none smaller, because the drag shrinks the dialog
  and the values it passes through are all earlier and wider. A race against a
  UI update hands you a number the interface was on its way through, so the
  error always sits on the side the change came from. **What to do**: before
  believing either verdict, check whether the expected value is a number the
  test measured or a number the spec fixes; if it measured it, the case needs a
  settle and the red is a criterion defect rather than a client one, which is
  the reviewer agent's to catch, and the acceptance suite's owner to fix. **The cause is deliberately not
  asserted past "it races the UI update"**, on the same rule the `.data` bullet
  above keeps: what was measured is that the case fails alone on both commits,
  that the restored number is always the specified one, and that every wrong
  reading is larger. Which frame the read lands on is arithmetic that fits, not
  something either session instrumented, and a wrong cause here is worse than
  none. The measurement is RFC 0005 change control item 51(n).
  **And the case is marginal in CI too, which settles it: the same job re-run
  on the same commit answered 229 of 229 green against 228 of 229 an hour
  earlier.** Across two byte-identical `app/` trees the four CI runs read green,
  green, red, green. So **a whole-leg red of this one case carries no
  information about the commit under it**, and the cheapest move when a browser
  leg loses exactly one case is to re-run the CI job on the unchanged commit
  before doing anything else at all: it costs one job and needs no worktree.
  **And it is not merely cheaper, it is the only one of the two aimed at the
  question you have.** Re-running the case locally asks whether the case *can*
  fail, and for a marginal case the answer is yes on every commit, which is how
  it confirmed a false attribution for two sessions independently on the same
  evening. Re-running the CI job asks whether *this commit* fails. **A green
  re-run is also weaker evidence than the red it answers**: it says the case can
  pass here, not how often, so read it as settling the attribution and not as
  measuring the case. **And never attribute a red to a commit by comparing
  a CI run against an isolation run**: `app/` was byte-identical across the two
  commits compared that day, so one tree was green in CI and red alone, and the
  comparison measured the environment rather than the code.
- The cluster's own locale is French_France.1252 under libc, which is not what the
  suite runs on and must never become it. The `dana_test` database is created with
  the builtin C.UTF-8 locale so that it orders text exactly as PGlite does; spec
  11.10 carries the CREATE DATABASE statement, the reasoning, and the two checks
  that prove the two legs agree. Never point `TEST_DATABASE_URL` at a database that
  inherited the cluster default. The string authenticates as `dana_ci`, never the
  superuser, and lives in the runner installation's `.env` and in `app/.env`, which
  is committed (see the last bullet) and is never stored as a GitHub secret (11.11).
- **CI runs on a self-hosted GitHub Actions runner on this machine, and it is not a
  Windows service: it is a scheduled task that starts at logon** and runs `run.cmd`
  hidden. So there is no CI while the machine is off or before anyone has logged in.
  A pushed branch has no verdict until then rather than failing. Hosted runs stopped
  on 2026-08-11 on an account billing failure and the owner chose not to buy hosted
  minutes, which is why the runner is here at all. **A self-hosted runner costs no
  Actions minutes and has no time limit; the 40 in the workflow is a hang killer.**
  Manage it with `Start-ScheduledTask` and `Stop-ScheduledTask` on
  `'GitHub Actions Runner (dana)'`.
- **`gh run rerun` re-uses the stale merge commit, and the failure is silent and
  self-consistent.** CI checks `refs/pull/N/merge`, which is right and is what `ci.yml`
  says it does. But **re-running a run does not recompute that merge commit** — it replays
  the SHA the run was created against. So after a fix lands on `main`, re-running a pull
  request's failed job measures the branch against the **old** `main` and fails identically.
  Measured 2026-09-03: eight pull requests re-run after the fix in #127 merged, all eight
  failing on `ac-001` exactly as before, the catalog expecting 6 `shelves` constraints
  against a database holding 9 — the pre-fix state. **The re-run fails the same way, which
  reads as "the fix did not work" rather than "you measured the wrong thing"**, and that
  reading sends you back to a fix that was already correct. What does work is **closing and
  reopening the pull request**, which fires a `pull_request` event and makes GitHub
  recompute the merge ref against current `main`; verified the same day.
- **The runner can sit idle with work queued, and there is no explanation here.** Observed
  2026-09-03: a job queued at 07:59Z did not start until 09:08Z, seventy minutes later, with
  the runner online and nothing else executing for most of that window. **The cause is
  deliberately not guessed at**, on the same rule the `.data` bullet keeps. It is recorded
  because the next person to meet a long queue will otherwise assume something is running
  that is not, and start cancelling or restarting things that were fine. `Get-Process
  Runner.Worker` settles it: a listener with no worker, and a job queued, is this state.
- **CI triggers on pull requests and on pushes to `main`, not on every push, and since
  2026-09-04 the two run different jobs.** A pull request gets `check`: the branch name
  against `^(frontend|backend|chore)/[0-9]+-[a-z0-9-]+$`, then `npm ci`, lint, typecheck,
  build. A push to `main` gets `ci`, all six steps of 11.11 unchanged. **The gate is
  now `npm run gate` on the machine the code was written on**, which runs the same six
  and prints a record a pull request carries; issue #180 and 11.11's dated amendment are
  the reasoning. A branch with no pull request still gets no verdict, which is correct
  under a workflow where nothing reaches `main` except through one.
- **The CI runner and your own agents cannot share this machine, and the way that
  fails reads exactly like broken code. Scoped 2026-09-04: this is about the `main`
  job, and no longer about every job.** Measured 2026-09-03 across a night of eight
  branches, when a pull request ran the full gate. A full CI job holds about
  **7.7 GB of this machine's 15.8**: killing the runner
  mid-job took free memory from **2.0 GB to 9.7 GB** in one step. With five or six
  agents running vitest beside it, the job goes red with
  `Hook timed out in 60000ms` in `startAuthTestApp` and
  `[vitest-pool]: Timeout terminating forks worker`, **and zero assertion failures** —
  the tell, and the thing to check first. One run lost 20 files that way and every one
  passed alone. A second job died with **no steps recorded and no log at all**, which is
  the runner losing the job rather than the job failing.
  **So run agents or run a `main` job, not both.** The pull-request `check` job is a
  different matter and is *why* the split exists: `npm ci`, lint, typecheck and build hold
  no database, start no browser and run no vitest pool, so it can run beside agents.
  **This is a measurement about the full gate and it does not license the four**; a
  `check` job that ever grows a leg back stops being covered by this sentence.
  Queue the work when the full job is what you need: stopping the runner leaves jobs
  queued at GitHub harmlessly, and they run clean afterwards. Three things about doing
  that, all learned the hard way the same night. `Stop-ScheduledTask` does **not** stop
  it — `run.cmd` detaches, the task reports `Ready` while `Runner.Listener` keeps
  running; stop the processes. Killing it mid-job leaves GitHub believing the runner is
  `busy=true` with a session that no longer exists, and it dispatches nothing to a busy
  runner, so **cancel the stuck run** to free it. And the job it was running is lost, so
  stop it between jobs where you can.
- **`npm run gate` is the local six steps, and it is what a pull request carries.**
  Added 2026-09-04 with issue #180. It runs lint, typecheck, **one** test leg — Postgres
  with whatever `TEST_DATABASE_URL` this process has, or PGlite as a fallback when it has
  none, the PGlite leg having stopped being mandatory at 11.11's 2026-09-20 amendment —
  build, and
  Playwright, stops at the first failure, and prints a record naming the head sha, whether
  `git status --porcelain` was empty at **either end** of the run, the machine, the clock
  and each step's tally. Five things worth knowing before you run it. **It prints three
  verdicts and only `GATE: green` opens a pull request**: `red at <step>` is a failure, and
  **`incomplete` is a step of the six that did not run** — this machine without
  `TEST_DATABASE_URL`, or `--quick`. Incomplete exits non-zero for the first and zero for
  the second, because the exit code answers "did you get what you asked for" while the
  verdict line answers "is this a pull request's gate". **A leg that reports no tally at
  all is red rather than ok**, an exit code with no summary behind it being the same false
  green one layer up. It **refuses to start the browser leg when anything answers on the
  port it is about to serve on**, which is the port collision two bullets below written as
  a precondition rather than as a postmortem, and it deletes `test-results/` first.
  **Two more refusals since 2026-09-20 and issue #273, and an agent will meet the second
  of them.** The port check reads the host's own socket table with `lsof`, `ss` or
  `netstat` as well as connecting, because a listener bound to an address the connect
  probe does not ask still takes the port; **a host where none of the three exists is
  refused rather than reported clear.** And the leg is refused outright from a checkout
  whose path carries a dot segment, which `.claude/worktrees/` is — the reason is the
  `res.sendFile()` bullet below, and the refusal exists so that it costs one line rather
  than twenty reds. **That one is asked before lint**, so a worktree that can never get a
  verdict is told in a second rather than after the whole gate, and **`npm run gate --
  --quick` is exempt and still runs there**: lint, typecheck and build do not care about
  the path and start no browser. **The engine line in the record is a reading now** rather than the
  literal `Postgres 18` it was: the gate asks the server its version before the leg, and
  names the installed PGlite on the fallback path.
  **That port is `DANA_GATE_PORT` since 2026-09-20 and issue #254, and unset it is 3100**,
  so nothing about an existing invocation moved; setting it is how two gates run on one
  machine at once, and the record names the port it used so that two records taken in
  parallel can be told apart afterwards. `app/scripts/gate-port.mjs` is the one place the
  number is resolved, for gate.mjs and `playwright.config.ts` alike, and
  `app/tests/guards/guard-gate-port.test.ts` fails if those two ever disagree or if the
  precondition stops biting, and `guard-gate-host.test.ts` beside it fails if the version
  goes back to being written down, if the dot-segment refusal is not asked, or if Express
  ever stops refusing a dot segment — which is the day that refusal can be deleted. It reaches the vitest legs
  through `npm test`, so `run-suite.mjs`'s false-green guard is in the path and the record
  prints the file count that guard checks. And it runs **`npm ci` only when
  `package-lock.json` moved since `git merge-base HEAD origin/main`**, since that command
  deletes `node_modules`, which is right for a fresh runner and expensive for a working
  tree that never touched the lockfile; the record says which of the two happened.
  `npm run gate -- --quick` is lint, typecheck and build, for the middle of the work and
  never for a pull request.
- **A fourth flake class, and it is this one wearing a different hat.** The
  `beforeAll` hook timeout above is **not** the worker-fork class the bullets further up
  describe, and a session reading only those will not recognise it: no fork dies, no file
  is skipped, whole files fail with `Hook timed out in 60000ms` and no test fails an
  assertion. It is starvation, it is caused by load, and unlike the fork class it is
  answered by re-running on a quiet machine. Four agents hit it independently that night.
- **Five classes now, counting the starvation one above and the reset one in the bullet
  after this list, and only two of them are answered by re-running.** These three were
  measured in CI on 2026-08-31 and 2026-09-01, on the first runs this repository has
  ever had.
  - **The Postgres leg used to share one `dana_test`, and does not any more. Closed
    2026-09-03 by issue #32.** Every file pointed at one database and they saw each
    other's rows; the fingerprint was a count that climbed across successive tests,
    `expected 2 to be 1`, then 3, then 4. Each vitest pool slot now gets its own
    `dana_test_r<run>_w<slot>`, created with 11.10's locale statement, migrated at run
    start and emptied before every file. **So a climbing count on that leg is now a
    defect rather than a flake — read it.** Two things follow. `TEST_DATABASE_URL` names
    the *base* database the worker ones are derived from, not the one your test runs in.
    And no file runs against that base, `ac-001` included: it did until issue #92, because
    it asserted the English text of a server message and only a superuser can give a
    created database `lc_messages = C`, and a migration any branch ran into `dana_test`
    stayed there and failed `ac-001` for every branch behind it. It now asserts the
    SQLSTATE and the `column` field of the server's error, which no locale translates;
    never assert server prose, and `tests/guards/guard-postgres-leg-isolation.test.ts` fails by name
    any test that does.
  - **The browser leg loses about one case a run** under memory pressure, and the
    bullets above cover it. Re-run the case alone, and read the note on when isolation
    lies.
  - **A test comparing two clocks in two zones. Corrected 2026-09-03, and the
    correction is the point of the bullet rather than an embarrassment to it.** This
    said "a test that reads the clock twice fails when a run crosses midnight", caught
    once at 23:59:39Z. **It is not a midnight race.** `duplicateTask` re-anchors with
    SQL `current_date`, which reads in the **database session's** timezone, while the
    criterion read the process clock at UTC. Measured: PGlite reports `Etc/GMT-1` here
    and the local cluster `Europe/Paris`, so it was false for **the whole window in
    which local date leads UTC date** — one to two hours every evening, not a fraction
    of a second. Proved three ways on unchanged code: red at 23:16Z, **green under
    `TZ=UTC` at the same minute**, green again in local TZ at 00:31Z. Note `TZ=UTC`
    settles only the **PGlite** leg; on Postgres the cluster's own zone governs and the
    process variable changes nothing. Three agents reached this independently. The
    criterion was fixed first (#46), and **the product defect underneath it is fixed
    too, on 2026-09-04 by #76**: both duplicate endpoints take a `tz` and re-anchor on
    the caller's day, `current_date` is gone from that path, and AC-277 and AC-200 pin a
    zone and assert an exact date in the same commit. **A duplicate criterion failing on
    a date is a defect now, not this class.** The class is kept because the shape
    recurs: two clocks in two zones read as a midnight race and are not one, and forcing
    the zone is what separates them.
- **The fifth class, measured and fixed on 2026-09-04: `read ECONNRESET` takes a whole
  file with nothing having asserted anything.** Issue #174. Three times in one day, on
  three commits, the Postgres leg lost one file to `Error: read ECONNRESET` with its
  tests skipped, zero assertion failures, a different file each time, and every one of
  them green when run alone. **It is not connection exhaustion and the cluster is not
  killing anything**, which is what everyone assumed including the issue: sampled every
  500 ms across whole parallel 12-worker legs the peak is **17 and 18 client backends
  against a `max_connections` of 100**, and the cluster log carries no `too many clients`, no
  terminated connection and no crashed backend on any of the days a file was lost.
  **The cause was in the seam.** `app/db/client.ts` built its `pg.Pool` with no
  `'error'` listener: node-postgres re-emits an **idle** pooled connection's socket
  error on the pool, and a connection **checked out** by `pool.connect()` — every
  transaction, every migration run — emits its own; an EventEmitter `'error'` with no
  listener throws, so one reset socket ended the worker process with an uncaught
  exception, and vitest attributes an uncaught exception to whichever file was running.
  That is exactly why the lost file differed every time and passed alone. Both windows
  were measured with a TCP proxy resetting a real pooled socket on demand, both now
  carry a listener that reports the loss once and lets the pool discard the connection,
  and `tests/guards/guard-postgres-leg-connection-loss.test.ts` goes red if either is removed. **What
  a route sees is not this error**, which is worth knowing before you go looking for it:
  a socket that dies inside a transaction rejects the statement and drizzle then runs its
  ROLLBACK on the same dead connection, so the request error line and Sentry carry
  `Connection terminated unexpectedly` while the `ECONNRESET` underneath it lives only in
  the seam's own `database_connection_lost` line. The same
  listener is why the single production instance no longer dies when an idle connection
  is reset, which it would have. **What resets the socket in the wild is still not known
  and is deliberately not guessed at**, on the rule the `.data` bullet keeps: TIME_WAIT
  peaked at 1120 of this machine's 16384 ephemeral ports, so it is not port exhaustion
  either. It also does not need to be known, which is the point of fixing it here: a
  transient reset is now a discarded connection rather than a lost file. Two whole
  Postgres legs after the fix, each accounting for every file: **345 files and 2141
  tests, twice, and zero `ECONNRESET`**. A red of this shape after that fix is something
  else, and re-running the file alone is still the honest first check.
- **Between them these are why a red is not evidence until you have named which class it
  is.** In three CI runs of one commit, every step passed at least once and no run passed
  all of them together, with nothing wrong in the commit.
- **Two migrations authored in parallel can silently not run, and nothing reports it.**
  Verified 2026-09-03 in the installed drizzle source rather than recalled:
  `node_modules/drizzle-orm/pg-core/dialect.js` applies a file only when
  `Number(lastDbMigration.created_at) < migration.folderMillis`. So the **`when` in
  `app/db/migrations/meta/_journal.json` is the apply gate, not decoration** — `idx` is
  decorative and the migrator reads only `tag`, `when` and `breakpoints`. If a
  migration with a **higher** `when` deploys first, every lower one is treated as
  already applied and skipped: no error, no columns, and the application then throws on
  every read that wanted them. Two agents on two branches picking "the next number"
  independently is exactly how you get there. Assign the numbers **and** the `when`
  values up front when branches overlap, check them against each other before merging,
  and keep the journal entries in ascending order when resolving that conflict, because
  array order is the apply order on a fresh database.
- The Postgres tooling here answers in French, `initdb --help` and `pg_controldata`
  included, and one translated flag name is wrong: the option is `--builtin-locale`,
  which the French help prints as `--builtin-provider`. Read option names from the
  English documentation, not from `--help` on this machine.
- The GitHub CLI is installed and authenticated but is on no shell's PATH. Call it
  by its full path, `"C:\Program Files\GitHub CLI\gh.exe"`, to read CI. The
  repository is private, so the unauthenticated API answers 404 and this is the only
  way to see a run. `gh run list --commit` returns nothing here; list runs with
  `--json databaseId,headSha` and match the sha yourself. **Pass
  `--workflow ci.yml` as well, since 2026-09-20**: the watchdog in the bullet below
  is scheduled every ten minutes, which is 144 records a day by arithmetic off the
  cron rather than by measurement — it has not run yet — and an unfiltered list will
  be mostly those. **That filter also hides the watchdog's own runs**, and a red one
  of those is the thing saying a pull request was never checked at all, so read them
  on their own — `--workflow pull-request-run-watchdog.yml` — rather than never.
- **A pull request can get no CI run at all, and nothing used to say so. Issue #248,
  and the cause is still not known.** Pull request #244 was opened at 14:08Z on
  2026-09-20 with no workflow run of any kind — not queued, not cancelled, not
  failed, absent — and sat looking mergeable for twenty minutes. It is the third
  mechanism in one day with that consequence and the only one not understood, and
  **the absence of a verdict is worse than a red, because a red gets looked at.**
  `.github/workflows/pull-request-run-watchdog.yml` now reads every open pull
  request every ten minutes and on every pull request event, and where a head has
  no `ci.yml` run it posts a failing `ci/pull-request-has-a-run` commit status,
  comments once on the pull request, and goes red.
  Everything in this bullet describes what that workflow is configured to do: as
  of 2026-09-20 it has never executed, so none of it is a measurement.
  `app/scripts/pull-request-run-watchdog.mjs` carries the predicate and the
  reasoning; `node app/scripts/pull-request-run-watchdog.mjs --repo zhssnym/dana
  --audit` replays it over the whole history from any machine with a token, and
  **that one runs from the repository root rather than from `app/`**, which is the
  exception to this section's opening rule — it locates `ci.yml` relative to itself.
  It writes nothing without `--write`, and **`--audit` with `--write` is refused
  with exit 2 before any network call**, because audit reads closed and merged pull
  requests and a comment on a merged one has no undo. Four things to know before
  you read one of its reds. **It reads a conclusion for one thing only**: a
  `ci.yml` run from the `pull_request` event that ended `cancelled`, `skipped`,
  `action_required` or `stale` verified nothing and told nobody, so a head whose
  runs all ended that way is `inconclusive` and takes the same red as a missing
  one — which is reachable on purpose, cancelling a stuck run to free the runner
  being something the bullet above tells you to do. It is still never the thing
  telling you a run *failed*: that is loud, it is mailed, and it is the `check`
  job's. **An asleep runner does not trip it**: a run created while the machine is
  off exists as a `queued` record from the instant the event fires — measured here
  at eleven hours and twenty-seven minutes of waiting, run 24 — and the job itself
  runs on the same runner, so it is silent while the machine is. **It cannot catch
  its own pull request** if the `pull_request` event is what failed, which is what
  the schedule is for. And **it refuses to run at all if `on.pull_request` in
  `ci.yml` ever grows a `types`, `paths`, `paths-ignore` or `branches` filter**,
  because a filter makes a missing run legitimate; a guard test fails that in the
  gate first. The workaround when it fires is the issue's: `workflow_dispatch`
  against the branch, which queues immediately and runs all six steps. **That is
  more testing than a pull request's `check` job runs and strictly less of what
  `check` is for** — a dispatch run makes no branch-name check, `github.head_ref`
  being empty on any event but a pull request, and it builds the branch head rather
  than `refs/pull/N/merge`. Closing and reopening the pull request is what fires
  the real event again.
- **Branch protection and rulesets are unavailable on this plan, measured
  2026-09-20 rather than recalled.** `GET /repos/zhssnym/dana/rulesets` answers 403
  with "Upgrade to GitHub Pro or make this repository public to enable this
  feature", and the repository stays private because `app/.env` is committed to it.
  So **nothing can be a required status check here**, and a pull request with no run
  is not blocked from merging by anything but a person reading. That is why the
  watchdog above exists at all, and it is the weaker of the two answers: a required
  `check` would make a missing run a *pending* check and block the merge, where the
  watchdog only makes it loud.
- `DANA_DEV_LOGIN=1` enables `POST /api/v1/auth/dev-login` for sessions without
  Google credentials. It is absent from production builds regardless of environment
  variables.
- Never commit `.data/`, the local PGlite directory. **`app/.env` is committed, and
  deliberately so**, on the owner's ruling of 2026-08-25: this repository is private
  with two collaborators, and one shared working config is worth more to them than
  each machine rebuilding one from `app/.env.example`. Two consequences follow and
  neither is optional. The repository's privacy is now the only thing standing
  between live credentials and the world, so it stays private, and a credential that
  leaves it is rotated rather than argued about. And the file is an ordinary tracked
  file, so a branch that drops it deletes it from the working tree of every machine
  that checks that branch out; this was measured on the day the ruling landed, when
  switching from `main` to a branch without it removed the operator's own copy.

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
