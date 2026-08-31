# 6. Implementation plan

**Status:** revised 2026-08-31, after both review rounds. This is the running order for the
implementation session.

---

## Progress

**Complete, 2026-09-01.** Everything below landed on the `pipelines` branch.

| Phase | State |
| --- | --- |
| 0 — Safety | Done |
| 1 — Boundary, CI, templates, settings | Done. The runner is registered and CI has run |
| 2 — Workflow folder and three agents | Done, and rehearsed: a cold agent ran a real issue end to end and its report produced seven fixes |
| 3 — Documentation | Done, including the two parts deferred to the end: the RFCs and the spec directories |
| 4 — The component test layer | Done. Two guards, each proved by reintroducing the bug it guards |
| 5 — The findings backlog | Filed as issues 32 to 45. Not restructure work, and deliberately not done here |

Open questions from retired specification section 13 are issues 15 to 30, and the
contradiction found in section 12 is issue 31.

**What this plan does not cover, and never did:** issue #15, the September hosting move.
That is operational, it has a hard date, and it outranks everything in this document.

---

## How to run this

**Not as one enormous session.** Almost every step below is an ordinary issue. Open it, do it,
merge it, move on. That is the point of issue #5 and it applies to this work first of all.

**Follow the workflow while you build the workflow.** From phase 1 onwards, every step here
gets a GitHub issue, a branch, a pull request and a review. If the process cannot survive
being used on itself, it will not survive Imran using it in three weeks — and it is the
cheapest possible rehearsal.

**Phases 0 and 1 are the ones that matter.** If nothing else here ever happens, those two
still leave you with a working two-person setup.

---

## Phase 0 — Stop the bleeding

*Under an hour. Do this before anything else, including before agreeing with the rest of this
plan. It is all recovery from the half-finished restructure sitting in the working tree.*

### 0.1 Commit `AGREEMENT.md`

`AGREEMENT.md` is untracked. It exists on one disk, no history, no remote. One commit.

**The thirteen personas do not need committing.** All thirteen are byte-identical to what is
already in git at `HEAD:docs/team/` — verified file by file. They are already recoverable from
history, so they can simply be deleted in phase 2.2 along with everything else. Nothing is
lost and there is no reason to commit a copy of a file you are about to delete.

### 0.2 Commit the 360 deletions

**Confirmed intentional** — deliberate cleanup done by hand before the analysis: the
prototypes, the V2 leftovers, the in-progress reports, and the operator docs describing a
workflow being replaced.

**Nothing needs rescuing. `docs/team/_shared-protocol.md` has been read, and its three
useful items are carried below.** Everything else in it is swarm machinery — the five
artifact sources, escalation routed to an Integration Steward who no longer exists, a
package-by-package definition of done — and dies with the personas.

The three items, to fold into `docs/workflow/` in phase 2:

1. **House writing conventions.** No em dashes or double hyphens in any Dana document,
   comment or commit message; commas, colons or separate sentences instead, and a single
   hyphen per column in table delimiter rows. 24-hour time, "to" for ranges. Comments explain
   *why*, not *what*, matching surrounding density. Commits: short imperative subject, a body
   saying what changed, and a `Co-Authored-By:` trailer naming **the model the session
   actually ran on**, read from the session rather than copied from a fixed string.
2. **"Never edit a test to make your code pass."** Still exactly right, and more relevant
   now: Imran must not edit an e2e spec to turn it green. If a test seems wrong, that is a
   finding, not an obstacle.
3. **"A false green is worse than a blocked agent."** Reporting work as done when it is not
   is the worst available failure, because everything downstream builds on it. A blocked
   agent is recoverable. This is the same instinct as the name-your-test-commands rule in
   step 7.

Then commit the deletions **on their own**, with a message saying what went and why. Do not
let 360 deletions ride along inside another commit.

**One deliberate tightening to note.** The old protocol let any role add a dependency to
`app/package.json` on its own, naming the reason in the commit message. The new `CODEOWNERS`
puts that file with Hassan. Under the convention-not-gate model Imran's agent can still add
one; it simply shows up in review, which is where a bundle-size, licence and supply-chain
decision belongs.

### 0.3 Fix `CLAUDE.md`'s stop instruction

`CLAUDE.md:19-21` tells any agent touching `app/` to halt unless it was handed
`docs/team/_shared-protocol.md` — which no longer exists. **An agent obeying your entry point
today refuses to do any work at all.**

Two lines. Do not wait for the full `CLAUDE.md` rewrite in phase 3.

### 0.4 Fix the test that reads a deleted folder

`app/src/client/components/ui/foundation.test.ts:192` reads a file inside `docs/design/`.
Until this is fixed the suite is red for a reason unrelated to any code — so **no test result
from this branch means anything**, including any result used to judge later steps.

### 0.5 Land this planning work

The `pipelines` branch holds these documents. Open an issue for it, merge it, delete the
branch. The plan itself should not be the one thing that skips the process.

---

## Phase 1 — Make the boundary real

*One or two sessions. This is the phase that delivers what you actually asked for.*

### 1.1 Import restrictions in eslint — **the highest-leverage step in this plan**

About twenty lines of `no-restricted-imports` in `app/eslint.config.ts`, so a file in
`app/src/client/` importing from `server/` or `db/` fails `npm run lint`.

Today there are **no import rules at all** — the config holds one rule, `no-unused-vars`. The
client happens to be clean, every import checked, so you are locking in a property you already
have rather than fixing a violation.

This is the one rule that costs an agent zero attention to obey, which is exactly the kind
issue #5 argues for. Do it first.

### 1.2 Add `CODEOWNERS`

Draft in [2.8](02-repository-structure.md). Ten minutes.

Remember what it is here: **a map the agents read**, not a gate. Branch protection is
unavailable on this plan and you chose not to buy it, so nothing enforces it.

**One five-minute experiment while you are there:** open a throwaway pull request touching
`app/src/client/` and see whether GitHub auto-requests a review. That behaviour may be tied to
the same paid tier as branch protection. Knowing beats assuming, and it changes nothing about
the workflow either way.

### 1.3 Bring CI back to life

CI has **never run on this repository** — zero workflow runs, zero registered runners. Four
things, one session:

1. **Re-register the self-hosted runner against `zhssnym/dana`.** It is still registered to
   the dead `dev-dana` account, which is why nothing has ever run.
2. **Add `env: TEST_DATABASE_URL: ''` to the "Test on PGlite" step.** Without it that step
   inherits the runner's job-wide variable and runs Postgres — two Postgres legs, no PGlite
   leg, and both green.
3. **Add failure-artifact upload** for Playwright traces and screenshots. Ten lines, and the
   difference between Imran debugging a red check himself and having to ask you.
4. **Add `pull_request` as a trigger**, so what gets tested is the merge result rather than
   the branch in isolation.

### 1.4 Issue and pull request templates

Issue #5 asks for this directly: *"future issues must be posted in their own template… pin
pointing exact files or dirs."*

- **Issue templates:** bug, feature, handoff.
- **Pull request template**, which must ask for the two things the review depends on:
  **which files outside the author's own area were touched, and why**, and **which test
  commands were run, by name, with what result.**

Add the three missing labels: `breaking`, `blocked`, `rfc`. The two handoff labels already
exist, and the unused GitHub defaults are already cleaned out.

---

### 1.5 Repository settings

Not files — GitHub's own configuration, and nothing else in this plan touches it:

- **Squash merge as the default**, and disable merge commits, so one issue becomes one commit
  on `main`. This is what makes the version and changelog derivable from `git log`.
- **Auto-delete head branches on merge**, so "the branch is deleted when the work is done"
  happens without anyone remembering.
- Discussions are already enabled. Nothing to do.

---

## Phase 2 — The workflow folder and the agents

*One or two sessions. This is what Imran's agent actually reads, so it comes before the
general documentation cleanup.*

### 2.1 Write `docs/workflow/`

Seven files ([2.7](02-repository-structure.md)):

```
docs/workflow/
├── README.md                       the hard rules, ~10 lines, then an index
├── how-we-work.md                  issue → branch → PR → review → merge
├── big-features.md                 the parallel RFC process — document 7, near-final
├── frontend/
│   ├── README.md                   self-contained brief for Imran's agent
│   └── allowed-backend-changes.md  six always-stop behaviours + criteria
└── backend/
    ├── README.md                   self-contained brief for Hassan's agent
    └── allowed-frontend-changes.md the same, pointing the other way
```

Most of the content already exists in documents [3](03-the-workflow.md),
[4](04-crossing-the-boundary.md) and [7](07-big-features.md) — this is largely a move and a
trim, not fresh writing.

**Do not create `docs/handoffs/`.** Handoffs are GitHub issues. The folder appears only if
something is ever too big for an issue body, which may be never.

**Three conventions decided in review must land in `how-we-work.md`, or they are lost:**

- **Conventional Commits in the pull request title** — `feat:`, `fix:`, `refactor:`, `feat!:`
  for breaking. Because the squash merge turns the title into the commit on `main`, this is
  what makes the version bump and the changelog derivable rather than hand-maintained.
- **The version rules** — bump at release time, not per issue; any breaking → major, any
  `feat:` → minor, otherwise patch; major is a product decision, not an RFC trigger.
- **Automated before/after screenshots for frontend pull requests.** Playwright is already
  installed and already drives the app, so this is a small script the frontend agent calls.
  Build it once here; it costs nothing per pull request afterwards.

**`allowed-frontend-changes.md` mirrors the backend file:** small changes, just do them; big
changes, open an issue and follow the normal process. Same two-question shape.

But be honest about the asymmetry rather than manufacturing a matching list. The backend's
six always-stop behaviours exist because their failures are **silent or irreversible** — a
dropped request field answers 200, a migration cannot be rolled back. **Most frontend
mistakes are visible**: a broken screen looks broken, and Imran will see it.

So the frontend's question 1 is about **blast radius**, not silence — the few places where a
small diff changes far more than it appears to. Candidates, to be confirmed by reading the
code rather than assumed: `styles/tokens.css` (one value, every screen), widely-used shared
components, and `api/http.ts` (where the CSRF header and timezone parameter are structural
per the a1 analysis). If that list turns out to be genuinely short, say so and let question 2
carry the weight. A padded list is worse than a short one.

### 2.2 Replace the thirteen personas with three agents

`.claude/agents/` becomes `frontend.md`, `backend.md`, `reviewer.md` — **with YAML
frontmatter**, which is the part that was missing. Without it Claude Code registers nothing,
silently, which is why your orchestrator plan does not work today.

Before deleting the old set, **harvest the hazard lists** out of the ten domain personas. The
org chart around them is dead; the version-specific traps they record are not.

The reviewer agent is the old adversarial-tester role, and it runs on **both** sides' work —
including yours, which is what closes the "nobody reviews Hassan" gap.

Delete or rewrite `.claude/launch.json`: six of its eight configurations point at
`docs/design/`, and one has a working directory on Imran's machine.

### 2.3 `.claude` settings and memory

Commit `.claude/settings.json` and `.claude/agents/`; gitignore `settings.local.json`. **No
blanket `.claude/` ignore** — it would hide the one file whose job is constraining an agent
nobody can review.

**Memory stays per-machine — decided, nothing to build.** Shared knowledge goes into
`docs/workflow/` instead, where it is reviewed, versioned, free of merge conflicts, and
carries no risk of publishing private notes to the other partner. Leave
`autoMemoryDirectory` alone.

### 2.4 Rehearse it

**Done. A cold agent ran issue #12 end to end and reported back.** The fix was correct and it
found the workflow in about ninety seconds from `CLAUDE.md`, which is the structure working.
Seven documentation fixes came out of it and are committed. Three findings could not be fixed
from inside the documentation and are recorded here instead:

**The entry point an agent is handed is `main`'s, not this branch's.** The harness injects
`CLAUDE.md` from the checked-out state, and on `main` that file still names
`docs/team/_shared-protocol.md` as the rulebook and says the repository is documentation only
until P0 lands. Worse than stale: **`docs/team/` still exists on `main`**, so a session that
starts there reads the wrong rulebook cover to cover and never learns it was wrong. This
resolves itself on merge and cannot be fixed before it. It is an argument for merging sooner
rather than accumulating more phases first.

**The workflow tells agents to branch from `main`, and the restructure itself branches from
`pipelines`.** Every agent reading these documents during the transition reads a rule the
transition is breaking. Also resolves on merge.

**A frontend fix currently ships with nothing guarding it.** Imran does not own `app/tests/`,
and there is no component test leg, so there is usually no way for him to leave a regression
test behind. The frontend brief now says to declare this in the pull request. The real fix is
phase 4.



Before declaring the workflow done, **run one real frontend issue end to end.** Pick something
small and real, and take it the whole way: fresh session, gather context, branch, work, test,
pull request naming its test commands, review agent, your review, merge.

You will find two or three things wrong with the documents. That is the point, and it is much
cheaper to find them now than when Imran hits them alone.

---

## Phase 3 — Documentation

*Two or three sessions, none urgent. Work can already flow safely by this point.*

### 3.1 Trim `CLAUDE.md`

It **stays at the root and keeps the environment lore** — that is its own declared job: "this
file owns the repository map, this machine's environment and commands." Three things come out:

1. the stop instruction (already fixed in 0.3);
2. every dead pointer — `docs/team/`, `docs/design/`, `docs/learn/`, `docs/operator/`;
3. the process content, replaced by a pointer to `docs/workflow/`.

While editing, correct the stale bullet claiming the browser leg needs
`env -u TEST_DATABASE_URL`. `playwright.config.ts` has pinned `TEST_DATABASE_URL: ''` since
commit `63ecc34`.

### 3.2 Fix the dead references

`docs/design` appears **107 times**, including in 40 files under `app/src/`. `docs/team`
appears **46 times**, in 13 files under `app/src/`. Plus `docs/parity`, `docs/security`,
`docs/ux`, `docs/operator`, `docs/learn`.

Two need judgement rather than search-and-replace:

- **spec 11.13** is a normative subsection whose entire content is a table of seven deleted
  files. Rewrite or remove it; do not repoint it.
- **`docs/rfcs/0000-template.md:195,197`** carries dead references that would be copied into
  every future RFC.

While you are in the code READMEs, **trim them** — 3,200 lines across five files, much of it
build-era narrative, and they hold a good share of these dead references.

### 3.3 Trim `CHANGELOG.md` in place

Stays at the root. The `[1.0.0]` block is 207 KB of the 222 KB file — 93% — and it is a
decision log, not a changelog. Cut it to a few paragraphs. Nothing is lost: git history keeps
the full text, which is your own principle for deleted material.

Then fix the immediate problem — **the file is a release behind.** `v2.2.0` is tagged and
shipped while `[Unreleased]` still says "Nothing yet."

From here: one short paragraph per version, written when the tag is cut, derived from the
squashed commit titles. The rule lives in `how-we-work.md`, not in a file of its own.

### 3.4 Delete `SESSION-LOG.md`

Nobody reads it. Archiving a file nobody reads is hoarding with extra steps.

**One step comes with it:** `SESSION-LOG` is referenced 31 times across 9 files, including two
source files that cite it by row number to explain why code is the way it is —
`app/src/client/components/page/BlocksEditor.tsx:37` and `app/tests/e2e/harness.ts:525`.
Rewrite those two comments to state the reason directly. The rest are in documents being
reworked anyway.

### 3.5 RFCs, and the decision records you already have

Move from version-shaped (`0004-v2-port-and-build`) to feature-shaped, with a status line:
proposed / accepted / implemented / superseded.

The useful discovery: **your architecture decision records already exist.** RFC 0005's
`## Change control` section is 5,166 lines — 76% of that file — holding 61 numbered decisions,
with more in spec 11.14 and in the changelog. They are real and good and have no findable
address. Give them one.

### 3.6 `docs/spec/` sections become folders

**Least urgent thing in this plan.** Do it when convenient.

It is cheap — the app cites the spec by number (~16,400 citations) and by path exactly once,
so it is **32 edits and zero test changes**. But the reason to do it is that each change gets a
home, *not* that the files are too big to read. They are not: fourteen files, 2,641 lines
total, largest 607.

---

### 3.7 Correct spec 10.2 — it describes a system that does not exist

Spec section 10.2 states that no code path reaches the database without passing an
authorization chokepoint. **There is no such chokepoint, and there cannot be one** — what
counts as authorized depends on what is being asked for.

What actually protects the data is two things, both good: the membership check written inside
the `FROM` clause, so a query that forgets it returns nothing rather than someone else's rows;
and 25 hand-written `accessOf(...)` gates across six route files.

This matters because the spec is the source of truth, and it is currently wrong about the
single most important safety property in the system. Rewrite 10.2 to describe the mechanism
that exists. An agent that believes in a chokepoint will not add the gate that is actually
required.

---

## Phase 4 — The missing test layer

**Done.** The layer exists, two guards are in it, and both were proved by reintroducing the
bug they guard rather than by assuming. What follows is the plan as written, kept because its
reasoning is still the reasoning.

One correction to it. The claim that the client was untested was too strong: there are
fourteen co-located client test files, and `parts/presenters.test.ts` alone is 744 lines. The
client's *pure logic* is well covered. What did not exist was any way to test that a component
**renders** the right thing, and the analysis's "no acceptance criterion sees this file" was
about `app/tests/ac-*`, not about unit tests. Worth knowing before anyone reads that sentence
again.

Depends on nothing; blocks Imran's first real frontend issue.

There are **zero component tests**, though five testing-library and jsdom packages are
installed and imported by nothing. That is the layer where Imran's agent can make its own work
green without touching anything of yours.

**There is a prerequisite the first draft of this plan missed.** `app/vitest.config.ts:5`
sets `environment: 'node'` for the whole suite, so a component test cannot render anything
today. Nothing imports jsdom or `@testing-library` anywhere in the repository, and
`src/client/lib/use-sortable-list.test.ts:5` says so in as many words: "this repository has no
component test leg to render one in."

The consequence is larger than a missing test layer, and it is why this phase matters more
than it looked: **for an agent working from a terminal, `npm test` proves only that the client
compiles.** What the screen does is covered by 109 Playwright specs and nothing else. So most
of the frontend is, to an agent, as silent as a migration.

1. Give client files a jsdom environment, either per-file or by an `environmentMatchGlobs`
   style rule for `src/client/**`. Do this first; nothing else in this phase works without it.
2. Write two or three example component tests, co-located beside their components.
3. Put the rule in `docs/workflow/frontend/README.md`: a component test lives beside its
   component.

**`app/tests/` is not split.** Co-location is the standard pattern, this repo already uses it
in 65 places, and ownership then follows the existing `/app/src/client/` CODEOWNERS line with
no extra rules.

Watch P5 in [document 2](02-repository-structure.md): Imran can *run* the browser tests but
not edit them. If that becomes a handoff every week, revisit — but not pre-emptively.

---

## Phase 5 — The findings backlog

**This is not the restructure. It is everything the seven analyses found that is worth doing
and is not restructure work.**

The distinction matters, because conflating the two is how a restructure never finishes.
Phases 0 to 4 change how you work. This changes the code, and none of it blocks anything.

**Turn this table into GitHub issues at the end of phase 2** — once the issue templates exist
— and then work them like any other issue. Filed, they are a backlog. Left here, they are
290 KB of analysis nobody reads again.

Two of them are risk rather than tidiness and are marked accordingly.

### Correctness and risk

| What | Where | Why |
| --- | --- | --- |
| **⚠ The Postgres leg is structurally flaky: every file shares one database** | `app/vitest.config.ts`, `app/db/client.ts` | Measured on the first two CI runs this repository has ever had. PGlite gives each worker its own in-process database; the Postgres leg points 278 parallel files at one `dana_test`, so files see each other's rows. The fingerprint is unmistakable: `expected 2 to be 1`, then `3`, then `4`, then `5` across successive tests — a count accumulating from concurrent writers, not a constant wrong answer. Both affected files pass alone in 2.4s. This matters beyond tidiness: **a check that is red for reasons unrelated to the change trains both of you to ignore it**, and Imran cannot tell a flake from a real failure. Likely direction, not yet verified: one database per vitest worker rather than one per run. |
| **⚠ The structural guard misses GET routes** | `app/tests/ac-236-structural-guard-sweep.test.ts` | It walks the router and fails any mutating route missing session or CSRF — but only POST/PATCH/PUT/DELETE. **A new GET route with no session check passes the entire suite.** Nothing structural checks authorization at all. |
| **⚠ Is the inline theme script refused in production?** | `app/index.html`, CSP at `app/src/server/index.ts:180` | Flagged as inference, not fact. The CSP has no `script-src` and no nonce, so the theme-preload script may be blocked — meaning **every dark-mode user gets a white flash on cold load**. Ten minutes with a browser console settles it. |
| `domain/pages.ts` exports two functions taking no viewer | `app/src/server/domain/` | The sharpest case of authorization living in the caller rather than the query. |

### Backend standardization

| What | Where | Why |
| --- | --- | --- |
| Extract the router preamble | `app/src/server/routes/` | Copied 13 times, ~25 lines each — and it is where the session gets attached, so it is not cosmetic. |
| **Document the load-bearing mount order** | `app/src/server/routes/bundle.ts` | `/views/:id` would shadow six page endpoints if anyone reordered it. Undocumented today. Cheapest possible fix: a comment. |
| `parsedId` implemented three different ways | server | Pick one. |
| Four import paths to two database functions | server | Including `auth/account.ts` importing `rowsOf` from `provisioning.js`. |
| Two live settings endpoints over one table | server | One should go. |
| SQL leaking into a route handler | `routes/sample.ts:104` | The one exception to "route files make no decisions". |
| Stale comment claiming two duties | `scheduler/pass.ts:36` | There are four. |
| Mixed camelCase / kebab-case filenames | server | Pick one convention. |

### The contract

| What | Where | Why |
| --- | --- | --- |
| Trash view defined twice | `shared/trash.ts:26-56` and `server/domain/trash.ts:41-62` | Identical fields, and the server imports the shared copy **zero times**. Nothing links them. |
| Nine native view names defined twice | `shared/bundle.ts:11-22` and `client/routes.ts:93-102` | A tenth view would compile fine and **silently never draw**. |
| Four response shapes stranded in the client | `client/api/http.ts:292`, `:313`, `mutations.ts:770`, `:790` | Each mirrors a server route literal with no type connecting them. `mutations.ts:790` was flagged for someone to move and nobody ever did. |
| `hexColor` duplicated inside `shared/` | `folders.ts:37-39` vs `shelves.ts:20-24` | Already diverging — the error messages differ. |
| Consider `.strict()` on request schemas | `app/src/shared/` | Would turn the silent-drop failure into a loud one. Needs care: spec 7.0 deliberately tolerates unknown fields, so this is a contract change, not a tidy-up. |

### Client

| What | Where | Why |
| --- | --- | --- |
| `state/` vs `states/` | client | One letter apart in every import. Cheapest fix in the repo. |
| Remove `parts/` | client | Leftover. Its own file says it is "the only file left" and there are five — two of them colour palettes parked there to dodge a test that forbids hex under `components/`. |
| Remove the duplicate page heading | client | `pages/page-heading.tsx` vs `components/page-head.tsx`. One importer left. |
| `pages/` vs `screens/` | client | A real split applied to only 4 of 20 pages, and one "presentational" screen fetches anyway (`screens/settings-screen.tsx:99`). Either finish it or drop it. |
| `lib/` is no longer a helpers folder | client | 18 of its 27 files read or write the server. The name lies about what is in it. |
| A `fetch` call outside `api/http.ts` | `components/folder-cover.tsx:192` | `http.ts:4` claims nothing else calls `fetch` directly, and that claim is already false. Route it through `http.ts` or amend the comment. Nothing enforces this: the eslint boundary rules restrict `server/` and `db/` imports, not this. |
| `presenters.ts` is untested and load-bearing | `client/parts/presenters.ts` | 32 dependents, and its own header says "no acceptance criterion sees this file". It already shipped a real bug: `359d28d`, where `personDisplay` dropped `avatar_url` across nine surfaces. |

### Database

| What | Where | Why |
| --- | --- | --- |
| `seed.ts` seeds 10 of 22 tables | `app/db/seed.ts` | It claims to exercise every table. **No browser test ever starts with a comment, file, page, shelf or saved view.** |
| Its truncate list is stale | `app/db/seed.ts` | Same file, separate problem. |
| `verify.ts` does not read `condeferrable` | `app/db/verify.ts` | Migration 0007's deferrability change is unguarded. |

### Repository

| What | Where | Why |
| --- | --- | --- |
| Restore a narrow `.env*` ignore | `.gitignore` | `app/.env` stays tracked as decided, but nothing currently stops a future `.env.production` being committed by accident. One line. |
| Add `LICENSE` | root | Proprietary, all rights reserved, naming both partners. Draft in `analysis/a7-history-and-hygiene.md`. |

---

## What NOT to do

Each of these is a plausible idea the analysis argues against:

- **Do not rename the `ac-NNN` tests.** `AC-NNN` appears 2,577 times across 194 files outside
  `app/tests/`. Freeze the range, leave the files, use co-located naming for new ones.
- **Do not add size labels.** They are a guess made before the work, and you identified the
  failure yourself. `breaking` is the label that earns its keep.
- **Do not tie the version number to issue size.** The version describes what changed for the
  user, not how hard it was. Take it from the pull request title.
- **Do not make the repository public** for free branch protection. `app/.env` holds one live,
  never-rotated secret.
- **Do not create `docs/handoffs/`, `docs/product/` or `docs/audits/`.**
- **Do not restructure `app/src/server/`.** It is the healthiest part of the repository.
- **Do not port the thirteen personas.** Harvest the hazard lists; delete the rest.

---

## Rough shape

| Phase | Size | Blocks what |
| --- | --- | --- |
| 0 — Safety | Under an hour | Everything. The suite is red, and `AGREEMENT.md` exists in one place only. |
| 1 — Boundary and settings | One or two sessions | The workflow does not mean much without it |
| 2 — Workflow folder and agents | One or two sessions | Imran's first issue |
| 3 — Documentation | Two or three sessions | Nothing |
| 4 — Test layer | One session | Imran's first issue |
| 5 — Findings backlog | Filed as issues, worked over weeks | Nothing |

**Phases 0 to 4 are the restructure and they are finite.** Phase 5 is a backlog — file it, do
not try to finish it. If it is treated as part of the restructure, the restructure does not
end.

## Coverage — what this plan does and does not carry

Checked document by document rather than assumed:

| Source | Carried by |
| --- | --- |
| [2 — repository structure](02-repository-structure.md) | Phases 1, 2, 3 in full. Every folder, `CODEOWNERS`, `.claude/`, the six problems P1–P6. |
| [3 — the workflow](03-the-workflow.md) | Phase 1.4 (labels, templates), 1.5 (repo settings), 2.1 (the documents, conventional commits, versioning, screenshots). |
| [4 — crossing the boundary](04-crossing-the-boundary.md) | Phase 2.1 — `allowed-backend-changes.md`, `allowed-frontend-changes.md`, and the handoff templates in 1.4. |
| [5 — decisions](05-open-decisions.md) | An index. No actions of its own; all fourteen are executed elsewhere. |
| [7 — big features](07-big-features.md) | Phase 2.1, as `docs/workflow/big-features.md`. |
| [1 — what we found](01-what-we-found.md) | Phase 3 for the documentation findings, **phase 5 for every code finding**. |

The one thing deliberately *not* carried: the analyses' many observations that are neither
restructure work nor defects — architecture description, request-lifecycle traces, the guided
tour of the client. Those stay in `analysis/` as reference. They are not tasks.

## How you know it is done

- An agent can start cold on an issue, read `docs/workflow/`, and know what to do without
  being told.
- `npm run lint` fails if client code imports server code.
- A pull request arrives naming its test commands and its out-of-area file changes.
- CI produces a verdict.
- Imran has run one real issue end to end without asking you a process question.

The last one is the only one that actually proves it.
