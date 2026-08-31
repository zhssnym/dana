# 1. What we found

**Status:** discovery. This document summarises seven analyses. The full detail is in
[`analysis/`](analysis/) — each summary below links to the report it came from.

The short version: **the code is in better shape than the documentation is.** The
application works, the boundaries mostly hold, and the backend is disciplined. What has
rotted is everything around the code — the docs point at folders that no longer exist, the
agent personas were written for a build that finished, and there is no rule anywhere that
stops the frontend and backend from being mixed together again.

---

## 1.0 First: the working tree is mid-restructure

Before anything else, because it affects what any implementation session can safely do.

`git status` on this branch shows **365 changes that nobody has committed**:

| What | Count |
| --- | --- |
| Tracked files deleted from disk | 360 |
| Modified (`app/index.html`) | 1 |
| Untracked | 4 |

The deletions are `docs/design/` (270 files), `dana-reports/` (54), `docs/team/` (15),
`docs/ux/` (10), `docs/operator/` (5), `docs/parity/` (4), `docs/security/` (1) and
`AGENTS.md`. `docs/spec/` and `docs/rfcs/` are untouched.

This predates this session — `app/index.html` was last written at 12:54 and the analysis
began at 13:38. **Confirmed in review: the deletions are deliberate**, hand-done cleanup of
the prototypes, the V2 leftovers, the in-progress reports and the operator docs. Thirteen of
the fifteen `docs/team/` files were copied into `.claude/agents/` — `_shared-protocol.md` and
`README.md` were not, which is why phase 0.2 reads them before committing.

Three things follow, and they are the reason this section is first.

**`AGREEMENT.md` and all 13 personas are untracked.** Only `.claude/launch.json` is tracked
under `.claude/`. So the signed founders' agreement and every persona file exist in exactly
one place on earth — this disk. No branch, no remote, no history. This is the most urgent
item in this entire report and it takes one commit to fix.

**A `git add -A` here would delete 360 files in one commit.** That may be exactly what you
want. It should still be a deliberate commit whose message says so, not a side effect of
staging something else.

**The test suite is currently red for a reason unrelated to code.**
`app/src/client/components/ui/foundation.test.ts:192` reads a file inside `docs/design/`,
and `docs/design/` is gone from disk. Any measurement taken before this is resolved will
be misleading.

There is one thing here I cannot explain and will not guess at: at the start of this
session `git status --short` printed nothing while `ls` already showed `AGENTS.md` and
`dana-reports/` missing. Those two readings contradict each other. No sparse-checkout or
`skip-worktree` flags are set now. Recorded as unexplained.

---

## 1.1 The frontend — healthier than its folder names suggest

From [`analysis/a1-client-frontend.md`](analysis/a1-client-frontend.md).

191 files, about 52,000 lines. The important finding first: **nothing under
`app/src/client/` imports server code or database code.** Every import was checked. Every
call to the server goes through one file, `app/src/client/api/http.ts`, which is why the
timezone parameter and the CSRF header are structural rather than something a developer has
to remember.

So the boundary you want to draw already mostly exists in the code. You are formalising
something real, not inventing it.

**The folder names are the mess, and less of it than it looks.** Four suspicious pairs:

| Pair | Verdict |
| --- | --- |
| `state/` vs `states/` | Both real — toasts and connectivity vs loading/empty/error screens. Terrible names, one letter apart in every import. Cheapest fix in the repo. |
| `pages/` vs `screens/` | A real split — wiring vs markup — but applied to only 4 of 20 pages, and one "presentational" screen fetches data anyway (`screens/settings-screen.tsx:99`). |
| `components/` vs `parts/` | `parts/` is leftover. Its own file says it is "the only file left in this directory" and there are now five. Two are colour palettes parked there to dodge a test that forbids hex values under `components/`. |
| `pages/page-heading.tsx` vs `components/page-head.tsx` | Genuine duplication. The old one survives because exactly one page still imports it. |

Also: `lib/` has stopped being a helpers folder — 18 of its 27 files read or write the
server.

**The risk that actually matters is not the folder names.** The tests that prove the
interface works are the 110 Playwright specs in `app/tests/e2e/` — outside anything Imran
would own under a folder-based CODEOWNERS. There are zero component tests. One traced
commit changed 3 client files and 25 test files.

> **Under the ownership split as first proposed, Imran's agent could not make its own work
> green.**

**Settled:** component tests co-locate beside their components, so they are covered by the
existing `/app/src/client/` line and he owns them without any change to `app/tests/`. The
missing piece is that there are currently zero component tests — phase 4.

**One class of bug a frontend agent cannot see.** The Content Security Policy at
`app/src/server/index.ts:180` refuses external images and scripts *silently*. That has
already cost you months — every Google profile picture failed and looked identical to "no
picture set", fixed in commit `359d28d`. A frontend agent will not diagnose that class of
problem, because nothing in the browser says a rule refused anything.

---

## 1.2 The backend — disciplined, with one claim that is not true

From [`analysis/a2-server-backend.md`](analysis/a2-server-backend.md).

The report traces `POST /api/v1/tasks` through 13 stages, naming every file and line. The
headline: **route files make no decisions.** That separation holds across the whole surface
with one exception (`routes/sample.ts:104`, which has SQL in it). There are zero `TODO` or
`FIXME` comments in the entire backend.

**The one claim that is not true, and it is the most important finding in the report.**
Spec section 10.2 says no code path reaches the database without passing an authorization
chokepoint. There is no such chokepoint. There is no authorization middleware, and there
cannot be one, because what counts as authorized depends on what is being asked for.

What exists instead is two things, and both are good — just not what the spec claims:

- the membership check is written *inside the `FROM` clause*, so a query that forgets it
  returns nothing rather than returning someone else's data (`views/cards.ts:166`,
  `domain/tasks.ts:135`, `domain/folders.ts:57`);
- **25 hand-written `accessOf(...)` gates** inside route handlers across six files.

All 19 files that touch `tasks` or `folders` in SQL were checked. The ones without the join
are viewer-keyed tables, the scheduler purge, or documented check-then-use.

`tests/ac-236-structural-guard-sweep.test.ts` walks the mounted router and fails any
mutating route missing a session or CSRF check. Two gaps: it only covers POST, PATCH, PUT
and DELETE — **a new GET route with no session check passes the entire suite** — and
nothing structural checks authorization at all.

**`app/db/` does not need standardizing.** A clear answer to your question. Migration
naming and the journal are consistent, eight files and eight entries, strictly increasing,
zero destructive statements. `constraint-catalog.ts` is current with all eight migrations.
Three real fixes exist and they are small: `verify.ts` does not read `condeferrable` so one
change in migration 0007 is unguarded; `seed.ts` claims to exercise every table but seeds
10 of 22, which means **no browser test ever starts with a comment, file, page, shelf or
saved view**; and its truncate list is stale.

**What to standardize, ranked.** The router preamble is copied 13 times, about 25 lines
each — and that is where the session gets attached, so it is not cosmetic. Then: `parsedId`
implemented three different ways, four import paths to two database functions, two live
settings endpoints over one table, and an **undocumented load-bearing mount order** where
`/views/:id` in `bundle.ts` would shadow six page endpoints if anyone reordered it.

---

## 1.3 `shared/` — the contract, and the real answer to who owns it

From [`analysis/a3-shared-and-contract.md`](analysis/a3-shared-and-contract.md).

**What it is, in one sentence:** the agreement between the browser and the server, written
down once in a form the compiler checks and the running code enforces. 18 source files,
each transcribing one family of spec section 7. Every response the client receives is
checked against these schemas at `app/src/client/api/http.ts:164` before anything renders,
so a mismatch shows up as a visible error rather than a blank field.

**Ownership: Hassan.** Not co-owned, not split. And the decisive argument is that *the
project already decided this* — the old `docs/team/04-api-and-contract.md` (still readable
with `git show HEAD:`) lists `app/src/shared/**` in its Owns section and says a change
there "is a change to section 7 in disguise."

**But a blanket block is already proven not to work here, and the evidence is in your own
history.** Frontend agent sessions edited `shared/` twelve times during the v2 build, five
of them leaving written notes acknowledging they were crossing a line. And in the one case
where an agent *did* obey the boundary, it declared the contract shape privately in
`client/api/mutations.ts:790` and flagged it for someone else to move — **nobody ever moved
it.** Both outcomes broke the rule, in opposite directions, because escalating cost a round
trip and produced no code.

So the recommendation is a narrow standing exception: a frontend pull request may add a new
*read* schema for a shape the server already sends, without opening an issue first. It
cannot break the server, because nothing on the server imports it, and if it is wrong it
fails loudly on one screen.

**The danger is asymmetric, and this is worth internalising.** Adding a field to a
*response* schema is caught by the compiler on both sides — one measured commit touched 15
files. Adding an optional field to a *request body* is caught by **nothing**: spec 7.0
tolerates unknown fields, no schema uses `.strict()`, and the route hands the parsed data to
a domain function that ignores what it does not read. This has already happened —
`app/src/shared/tasks.ts:761-769` records a reminder field that was silently dropped for
four packages.

**Four duplications found, with evidence:**

1. The trash view is defined twice — `shared/trash.ts:26-56` and `server/domain/trash.ts:41-62`,
   identical fields, and **the server imports the shared file zero times**.
2. The nine native view names are defined twice — `shared/bundle.ts:11-22` and
   `client/routes.ts:93-102`. A tenth view would compile fine and silently never draw.
3. Four response shapes stranded in `client/`, each mirroring a server route literal with
   nothing connecting them.
4. `hexColor` is duplicated inside `shared/` itself, already with divergent error messages.

The pattern to copy where a duplicate is unavoidable is at `shared/bundle.ts:102-107` — a
compile-time assertion that the interface and the schema agree.

---

## 1.4 The boundary is a convention, not a rule

This is mine rather than a subagent's, and it is short because it is one fact.

`app/eslint.config.ts` contains exactly one rule: `no-unused-vars`. There are **no import
restrictions of any kind**. Nothing stops a file in `app/src/client/` importing from
`app/src/server/` — not lint, and not TypeScript, which follows imports regardless of which
files a `tsconfig` lists.

So the separation that the whole workflow depends on currently rests entirely on people and
agents choosing to respect it. About twenty lines of `no-restricted-imports` configuration
would turn it into a build failure — the strongest single change available for making this
split real, and it belongs in the first implementation step.

---

---

## 1.5 Tests and CI — the pipeline does not exist

From [`analysis/a4-tests-and-ci.md`](analysis/a4-tests-and-ci.md).

**CI has never run on this repository. Not once.** This is verified against the GitHub API,
not inferred:

- `zhssnym/dana` was created on **30 August**. The project moved here after the old
  `dev-dana` account died (commit `eb5b0cf`).
- Workflow runs, all time: **0**.
- Registered self-hosted runners: **0**.
- `C:\actions-runner\` on this machine holds the unzipped runner but has no `.runner`
  config, no `.env`, and no installed service. Its newest log is from 11 August.

The workflow asks for `runs-on: [self-hosted, windows, x64]`, and nothing currently answers
that label. A push today produces a job that queues until GitHub gives up.

**Every claim about CI in `CLAUDE.md` and the spec describes the old repository.** None of
it is true of this one. That is worth holding on to, because a lot of this project's written
knowledge assumes a working pipeline.

**And a bug is waiting for when it does run.** The step named "Test on PGlite"
(`ci.yml:57`) is a bare `npm test` with no step-level environment. The file's own comment at
`ci.yml:58` says `TEST_DATABASE_URL` arrives from the runner's `.env` **into the job**, and
the later Postgres step fails deliberately if that variable is empty — so it is expected
job-wide. If it is present job-wide, the PGlite step inherits it and runs Postgres too. Two
Postgres legs, no PGlite leg. One line fixes it.

**On your `ac-N` question, the premise is half wrong**, and the half that is right is
interesting. The newest file in `app/tests/` is `ac-360`, added yesterday, and all 316
numbered files carry their number in a test title, so `-t "AC-NNN"` addressing works
everywhere. What you were noticing is a **different directory**: 65 tests co-located next to
the code under `src/` and `db/`, named `<module>.test.ts`. That was a deliberate two-category
rule in the old protocol, not drift.

The recommendation is to leave it alone: `AC-NNN` appears **2,577 times across 194 files
outside `app/tests/`**. Renaming is a five-thousand-reference edit that buys a reader
nothing.

**What Imran can run today:** four legs with zero setup — lint, typecheck, the PGlite test
leg, and build. Playwright needs one browser download. He should never run the Postgres leg,
which needs a database created with an exactly-specified locale.

One correction to `CLAUDE.md` while we are here: its bullet about needing `env -u
TEST_DATABASE_URL` for the browser leg is **stale**. `playwright.config.ts` has pinned
`TEST_DATABASE_URL: ''` since commit `63ecc34` on 14 August.

---

## 1.6 Documentation — the entry point tells agents to stop

From [`analysis/a5-docs-structure.md`](analysis/a5-docs-structure.md).

**`CLAUDE.md:19-21` currently instructs every agent to refuse application work:**

> "If your task touches `app/` and your opening instructions did not give you
> `docs/team/_shared-protocol.md` plus exactly one persona file from `docs/team/`, say so
> and stop."

`docs/team/` does not exist. So an agent that follows the entry point correctly stops before
starting. This is the single most consequential broken reference in the repository and it is
a two-line fix.

**The dead references go much further than the two I found before the analysis ran.**
Counted by literal string in the working tree: `docs/design` appears **107 times** — 49 of
them inside 41 files under `app/src/client/`. `docs/team` appears **46 times**, 26 inside 15
files under `app/src/`. Plus `docs/parity`, `docs/security`, `docs/ux`, `docs/operator`,
`docs/learn`.

Two need judgement rather than search-and-replace: **spec 11.13** is a normative subsection
whose entire content is a table of seven deleted files, and `docs/rfcs/0000-template.md`
carries dead references that would be copied into every future RFC.

**Turning spec sections into folders is much cheaper than it sounds.** The application cites
the spec **by number** — roughly 16,400 numeric citations — and by path exactly once. Total
edits to keep everything working: **32, with zero test changes.** `docs/spec/00-index.md:16`
already says "the numbering is the addressing scheme, not the filenames."

**The changelog is 93% not a changelog.** The `[1.0.0]` block is 207 KB of the 222 KB file,
and it is a decision log of the v1 build — kickoffs and rulings — with only four category
headings across 3,069 lines. It is also a release behind: `v2.2.0` is tagged and shipped
while `[Unreleased]` still says "Nothing yet."

**Your architecture decision records already exist.** RFC 0005's `## Change control` section
is 5,166 lines — 76% of that file — containing 61 numbered decisions. More are in spec 11.14
and in the changelog. They are real and good and have no findable address. That is the thing
to fix, rather than starting a new ADR practice from scratch.

**On `SESSION-LOG.md`: archive it, do not delete it, and do not replace it.** Your instinct
that it is obsolete is right — it bought a session handoff and a state board, and the issue
board does both better. But four code comments cite it by row number, so archiving costs
nothing and deleting breaks them. The one thing it bought that is still worth buying — a
memory of *why* — belongs in decision records.

---

## 1.7 History and hygiene — the split you are making does not exist yet

From [`analysis/a7-history-and-hygiene.md`](analysis/a7-history-and-hygiene.md).

**The most important finding in this report, and it is not what anyone expected: the git
author field does not tell you who did the work.**

941 of 1,021 commits carry a `Co-Authored-By: Claude` trailer. Between 24 and 27 August,
*every* commit in the repository is authored `mranwafa` — including `db:`, `server:` and
`spec:` commits whose bodies name backend personas. Then on 30 August the identity flips to
`zhssnym`, and the client commits start coming from there.

The two names are two checkouts of the same agent swarm.

So the empirical basis for CODEOWNERS is not what it appears to be. **284 files carry both
identities.** `app/src/client/` is 116 of 214 files contested (54%); `app/src/server/` is 46
of 127 (36%), including `routes/tasks.ts`, `domain/folders.ts`, `auth/router.ts` and three
migrations.

> **CODEOWNERS is not describing a split that exists. It is creating one.**

That is a fine thing to do — it is the entire point — but expect friction rather than
recognition. One number to keep: **22% of client-side commits also touched something outside
the client.** That is roughly how often the handoff process will fire.

**Branch protection is not merely unconfigured, it is unavailable.** Both the
branch-protection and ruleset endpoints answer `403: "Upgrade to GitHub Pro or make this
repository public."` `main` is `protected: false`, and **`mranwafa` has write access with
push permission today.** He has already merged into `main` once locally (`f097b8e`,
25 August). This repository has had **zero pull requests, ever**.

**The `.env` risk is narrower than it looks.** A history-wide scan finds `app/.env` as the
only file matching secret patterns, and only one key in it is a live secret —
`GOOGLE_CLIENT_SECRET`, which has had one value and has never been rotated. The other twelve
are empty or not secret. Separately, the commit that started tracking it deleted the
`.env*` / `!.env.example` ignore rules wholesale, so **nothing now stops a future
`.env.production` being committed by accident.**

**Everything else claimed missing is genuinely missing**, verified across the whole history:
no `LICENSE`, no `CODEOWNERS`, no pull request template, no issue templates — none has ever
existed. `AGREEMENT.md:65` promises a CODEOWNERS file that was never written.

The repository is small (20 MiB packed). The one real weight is two complete Vite prototype
applications under `docs/design/` carrying **four lockfiles between them** — npm and pnpm for
each — plus four byte-identical asset duplicates of files already in
`app/src/client/public/`. That goes away with the deletion in
[D1](05-open-decisions.md).

---

---

## 1.8 Agent tooling — the orchestrator plan does not work today

From [`analysis/a6-claude-tooling.md`](analysis/a6-claude-tooling.md).

**The thirteen personas have never been committed. Not on this branch, not on any branch.**
`git log --all -- .claude/agents` is empty. They are byte-identical (checked by hash, all
thirteen) to `HEAD:docs/team/*.md` — somebody copied them across and stopped. **Imran's
machine has never seen them.**

**They are not subagent definitions, and this is the part that matters for your plan.** None
of the thirteen has YAML frontmatter — every first line is a markdown heading. Claude Code
only registers a file in `.claude/agents/` as a subagent if it has that frontmatter.

The proof is this session. Running from `D:\dana`, the agent types available to me are
`claude`, `claude-code-guide`, `Explore`, `general-purpose`, `Plan` and `statusline-setup`.
Not one Dana persona. Claude Code scanned the folder, loaded nothing, and **said nothing
about it.**

So your plan to have the native orchestrator route work to these personas does not work
today, and its failure mode is silence rather than an error. That is worth knowing before
you build a workflow on top of it.

**They are also internally broken.** Nine of the thirteen define "done" as *"the full gate of
protocol section 4 is green"* — pointing at `docs/team/_shared-protocol.md`, which does not
exist. Combined with `CLAUDE.md`'s stop instruction, an obedient agent reading this
repository today refuses to work and then cannot tell you why.

Other dead references: `.claude/launch.json` points at `docs/design/prototype-v2` in **six of
its eight** configurations, and one config has a working directory **on Imran's machine**
(`C:\Users\imran\OneDrive\…\.work\…`) — which also contains a dot segment, the exact thing
`CLAUDE.md` records as breaking the browser test leg. Persona 09 names
`app/src/client/components/task-form/**`, which does not exist and never did.

**Which personas are still worth anything:** 13 (dispatcher) is completely dead — its input
is an RFC implementation plan that has been fully implemented, and its worked example assumes
there is no `app/` directory yet. 12 (integration steward) is dead as an agent and alive as
you. 11 (adversarial test) is the one structural role that matters **more** now than before,
because Imran cannot read a diff and so cannot be the second pair of eyes. The other ten are
real engineering knowledge wrapped in a dead org chart, and **the hazard lists inside them are
the valuable half** — worth extracting before the personas are replaced.

### Your memory question, answered

You asked to "move memory to a local `memory` folder." The honest answer has a verified part
and an unresolved part.

**Verified:** the default location is `~/.claude/projects/<sanitized-cwd>/memory/`, which
matches what is on disk. **There is no automatic repo-local `memory/` scan** — the empty
`.claude/memory/` folder sitting in this repository does nothing at all. Memory is also keyed
to the working directory, so it does **not** follow worktrees: the `D--dana-app` and
`D--dana-client` project directories have no memory.

**Possible:** relocation via an `autoMemoryDirectory` setting.

**Unresolved, and flagged as such rather than guessed:** the settings schema says that
setting is "ignored if set in projectSettings (checked-in `.claude/settings.json`) for
security", while the resolution code appears to read it when the project is trusted. That was
not run, so it is not known which behaviour wins. **The recommendation works either way: put
it in `settings.local.json`.**

**One thing not to commit.** The current memory includes `hassan-profile.md`, which contains
private characterisations of both Imran and yourself. Moving memory into a repository that
Imran and his agent can read would publish that to him. Team knowledge and personal notes need
separating before anything moves.

Finally: `.gitignore` does nothing with `.claude` at all — confirmed with `git check-ignore`.
The current state, where `launch.json` is tracked and the personas are not, is an accident
rather than a policy.
