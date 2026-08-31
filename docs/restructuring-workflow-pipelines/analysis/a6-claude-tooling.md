# A6: Claude tooling

Scope: `.claude/**`, `.vscode/settings.json`, `.gitignore`, and the Claude Code
memory directory at `C:\Users\hassan\.claude\projects\D--dana\memory\`.

Every claim below comes from a file or command output I actually opened. Where I
am inferring rather than reporting, the sentence says so.

Read on branch `pipelines`, HEAD `9a22b77`, Claude Code `2.1.251`.

## Three findings that change the plan before anything else

**1. The thirteen persona files are not in git.** `git ls-files .claude` returns
exactly one path, `.claude/launch.json`. `git status --porcelain .claude` returns
`?? .claude/agents/`. `git log --all -- .claude/agents` is empty: they have never
been committed, on any branch. They are also byte-identical to the old
`docs/team/*.md` (I compared all thirteen by md5 against `HEAD:docs/team/`, all
thirteen identical). So somebody copied them into `.claude/agents/` and stopped
there. Imran's machine has never seen these files and never will until they are
committed.

**2. They are not Claude Code subagent definitions.** None of the thirteen has
YAML frontmatter. Every one begins with a markdown H1 (`# 01. Data and
Invariants Engineer`), verified with `cat -A` on all thirteen first lines. The
proof that this matters is in this session: I am running from `D:\dana`, and the
agent types available to me are `claude`, `claude-code-guide`, `Explore`,
`general-purpose`, `Plan`, `statusline-setup`. Not one Dana persona. Claude Code
scanned `.claude/agents/`, found no loadable definitions, and moved on silently.
Detail in section 4.

**3. `docs/team/` and `docs/design/` are deleted in the working tree but not in
git.** They exist in `HEAD` (`git ls-tree -d --name-only HEAD -- docs/` lists
`docs/design`, `docs/operator`, `docs/parity`, `docs/rfcs`, `docs/spec`,
`docs/team`, `docs/ux`). `git status --short` shows 364 changed paths, 305 of
them deletions under `docs/`, none committed. This is good news for the broken
references in section 2: the content is one `git show` away, not lost. It is
also a warning. The restructure is mid-flight in an uncommitted working tree, so
anything the implementation session does must start by deciding what to do with
those 364 pending changes, not by discovering them halfway through.

---

## 1. The thirteen personas

They were written for a swarm: thirteen role-scoped sessions building numbered
packages P0 to P10 against a frozen spec, coordinated by a Steward and a
Dispatcher, with no human in the loop except for schema and API amendments. Read
`docs/team/README.md` at HEAD for the design intent; it is the missing half of
this set and it is worth reading before deleting anything.

That world is over. The build shipped as 2.2.0. Work now arrives as GitHub
issues labelled `frontend` or `backend`, and there are two people, one of whom
cannot read code.

The useful distinction is not "keep or delete". It is **role** versus
**knowledge**. The role scaffolding (who owns which spec section, which
acceptance criteria, which package, who escalates to whom) is dead. The
knowledge inside these files (the hazards each role existed to prevent) is the
most expensive thing in the repository and would take months to rediscover.

| # | Role | What it was for | Still a job? | Verdict |
| - | - | - | - | - |
| 01 | Data and Invariants | Schema, migrations, the 14 invariants, cascade semantics | The work is real and ongoing, the role is not | Fold into Hassan's backend agent. Keep the hazard list (`01:52-54`) |
| 02 | Scheduling and Time | Recurrence, DST, reminder instants, timezone anchors | Yes, and it is the sharpest knowledge in the set | Fold into backend. Keep `02:25-31` and `02:53-55` verbatim as a hazards reference |
| 03 | Collaboration and Permissions | Membership, invites, task lifecycle, cleanup on departure | Yes | Fold into backend. Keep the hazard list |
| 04 | API and Contract | One HTTP dialect across forty endpoints, error taxonomy | Yes, though its premise slipped | Fold into backend. See note below on the freeze |
| 05 | Query and Read-Path | The page queries, deterministic ordering, indexes | Yes | Fold into backend. Keep the "every order terminates in `id`" rule |
| 06 | Security and Privacy | OIDC, sessions, CSRF, the 10.2 chokepoint, log policy | Yes, and this is the one area where an independent second pass still pays | Fold into backend, but keep its "no other reviewer" framing (`06:56`) |
| 07 | Frontend Architect | Client structure, data layer, routing, PWA shell | Yes, but ownership is now genuinely unclear | See the seam question in section 3 |
| 08 | Component and Design System | Component library, `tokens.css`, copy fidelity, accessibility | Yes, and it is the closest existing match to Imran's domain | Rewrite as Imran's frontend agent |
| 09 | Complex Interaction | Calendar, task form, search overlay | The surfaces exist and still get changed | Fold into whichever side owns the client. Not its own role |
| 10 | Platform | CI, deploys, the scheduler tick, email, backups | Yes, but it is now maintenance not construction | Fold into backend, or keep as a thin ops agent |
| 11 | Adversarial Test | Writes every acceptance test, never implements | **Yes, and it matters more now, not less** | Keep as a real agent. See below |
| 12 | Integration Steward | Merge authority, spec change control, the seams | The job survives, the agent does not | Hassan is now the Steward. Delete the file, keep its review checklist |
| 13 | Dispatcher | Computes which numbered package is startable from the RFC plan | **No. Nothing left of it** | Delete |

**Dead weight, bluntly.**

*13 Dispatcher* is completely dead. Its whole mandate is "determine what is
startable right now from artifacts alone" (`13:9`), computed from five inputs of
which one is "the active RFC's implementation plan for the dependency graph"
(`13:17`). RFC 0001's plan is fully implemented. Its worked example (`13:41-46`)
opens with "Suppose `git log` shows only documentation commits, there is no
`app/` directory". There is an `app/` directory with 230 files in `app/tests/`.
The role has no input and nothing to compute. Delete it.

*12 Integration Steward* is dead **as an agent** and alive as Hassan. The
agreement puts review and merge on him (clause 5, and "Imran does not push
directly to the main branch"). An agent cannot hold merge authority in a
two-person repo where one human is accountable for the code. But the file's
review list (`12:20-27`) is a good checklist and should survive as one: does the
branch match what it claims, did it stay inside its owned paths, does it
conflict with anything in flight, did response shapes drift, is anything
implemented in the client but not the server.

*11 Adversarial Test* is the one structural role I would keep as an actual
agent, and the reason is stronger than it was during the build. Its argument was
"if the agent that implements recurrence also writes the recurrence tests, it
will test its own misunderstanding and report green" (`11:50`). That still
holds. What is new is that Imran cannot read the diff, so for anything Imran's
agent produces, an independently written test is the only check that does not
depend on a human reading code. Its premise does need rescoping: it currently
claims exclusive ownership of every acceptance test in `app/tests/**` (`11:14`),
which was right for a thirteen-agent swarm and is too rigid for two people
fixing a button.

*Everything else* is a real engineering domain with a dead org chart wrapped
around it. Each file spends roughly half its length on ownership of numbered
spec sections, acceptance criteria ranges, handoff contracts between roles, and
escalation routes to a Steward who no longer exists. That half is the dead
weight. The Mindset, Hard boundaries, and "Dana-specific hazards you exist to
prevent" sections are the part worth carrying forward.

**One correction while you are in here.** Persona 04 says the API is frozen and
that changing a response shape "after the freeze" requires a human decision
routed through the Steward (`04:34`). Per your own memory file
`dana-build-state.md:43-44`, section 7's freeze was already waived by you in
your own words during polish round 2, for `routes/cover-photos.ts`. The persona
now states a rule the project has already stopped following. That is exactly the
kind of drift that makes agents argue with reality.

---

## 2. Broken references inside `.claude/`

I grepped every backticked path-like string across `.claude/**` and tested each
one for existence, then swept again for unbackticked references to docs, the
protocol, and READMEs.

### Broken, with file and line

| File:line | Reference | State |
| - | - | - |
| `.claude/agents/07-frontend-architect.md:20` | `docs/design/` | Missing from the working tree. Present in `HEAD` |
| `.claude/agents/08-component-and-design-system.md:10` | `docs/design/**` | Same |
| `.claude/agents/08-component-and-design-system.md:20` | `docs/design/brief.md` | Same. Exists at `HEAD:docs/design/brief.md` |
| `.claude/agents/09-complex-interaction.md:11` | `app/src/client/components/task-form/**` | **Does not exist and is not in git either.** The v2 client replaced it |
| `.claude/agents/12-integration-steward.md:15` | "this directory's README" | `.claude/agents/README.md` does not exist. The README was `docs/team/README.md` and was not copied across |
| `.claude/launch.json:11` | `docs/design/prototype-v2` | Missing from the working tree. Present in `HEAD` |
| `.claude/launch.json:25` | `docs/design/prototype-v2` | Same |
| `.claude/launch.json:45` | `docs/design/prototype-v2` (as `cwd`) | Same |
| `.claude/launch.json:55` | `docs/design/prototype` | Same |
| `.claude/launch.json:78` | `docs/design/prototype-v2` | Same |
| `.claude/launch.json:92` | `docs/design/prototype-v2` | Same |
| `.claude/launch.json:106` | `C:\Users\imran\OneDrive\Documents\ChatGPT\Dana App\.work\hassan-repo-audit/app` | A path on **Imran's** machine, committed into the repo. Cannot resolve here |

Your report that `launch.json` points at `docs/design/prototype-v2` is correct.
Six of its eight configurations do, five by `--prefix` and one by `cwd`.

### The big one, which is not a path string

Every persona ends its Definition of done with "the full gate of protocol
section 4 is green" (`01:38`, `02:39`, `03:38`, `05:37`, `06:40`, `07:39`,
`08:38`, `09:38`, `10:39`). Persona 10 line 11 and persona 12 line 21 also cite
"protocol section 3" for sanctioned dependency additions.

"Protocol section 4" is `docs/team/_shared-protocol.md`, which is gone from the
working tree. So **nine of the thirteen personas define done by pointing at a
file that no longer exists**, and none of them says what the gate actually is.
An agent given one of these files today learns that its work must pass a gate,
and cannot find out what the gate is.

CLAUDE.md still calls that file "the operative rulebook" and says "Wherever the
two appear to differ, the protocol wins", and its "Before implementation work"
section still tells a session to stop if it was not given the protocol plus one
persona from `docs/team/`. That instruction is now unsatisfiable: an obedient
agent reading CLAUDE.md today will refuse to work. `AGENTS.md` (deleted in the
working tree, still at `HEAD`) repeats the same instruction at lines 11 to 17.

The gate itself is recoverable and is worth writing down plainly rather than
by reference. From `HEAD:docs/team/_shared-protocol.md:45` and from
`.github/workflows/ci.yml:50-81`, CI runs, in order: `npm ci`, `npm run lint`,
`npm run typecheck`, `npm test` on PGlite, `npm test` on real Postgres 18 (with
a guard that fails the step if `TEST_DATABASE_URL` is empty), `npm run build`,
then `npx playwright test`.

### What resolves fine

Every `app/**` path in every persona resolves except the `task-form` directory
above. So does `.github/workflows/**`, `.gitignore`, `.nvmrc`, `CLAUDE.md`,
`CHANGELOG.md`, `app/.env.example`, `app/package.json`, and
`app/src/client/styles/tokens.css`. The directory ownership model in these files
is still largely accurate against the real tree, which is the strongest argument
for rewriting them rather than starting over.

---

## 3. A new persona set for two people

### The shape

Four agents, not thirteen. Two belong to Imran's side of the work, one, and only
one, is his to run.

| File | Whose | What it does |
| - | - | - |
| `.claude/agents/frontend.md` | **Imran's** | Takes a `frontend` issue, works only in the client, opens a PR |
| `.claude/agents/backend.md` | Hassan's | Takes a `backend` issue: server, database, shared contract, platform |
| `.claude/agents/test-author.md` | Hassan's | Writes acceptance tests. Never implements the thing under test |
| `.claude/agents/reviewer.md` | Hassan's | Pre-merge check of a branch: boundaries, gate, drift. Optional but cheap |

Everything else that is worth keeping is **reference material, not an agent**.
The hazard lists, the recurrence and DST rules, the ordering rules, the
authorization chokepoint: those are things an agent should read when the task
touches them, not roles a session should inhabit. Where that material lives is a
question for whoever is designing the docs tree, so I am not proposing a path
for it here beyond saying it should not live in `.claude/agents/`, because
Claude Code treats every `.md` in that folder as a candidate agent definition.

### `frontend.md`: the safety device

This is the one that has to be right. Imran cannot read the diff, cannot read
the test output, and cannot tell a real green from a claimed one. So every
guardrail that would normally be "Hassan will catch it in review" has to be
written into the persona, and the persona has to assume the reviewer arrives
late.

State the reason inside the file, not just the rules. An agent that knows *why*
a boundary exists will hold it in situations the rules did not anticipate.

**Must always:**

- Refuse to start without a GitHub issue labelled `frontend`. No issue, no work.
- Branch from the real `main`, freshly fetched, never from whatever happens to be
  checked out. On this machine that means
  `git fetch origin main:refs/remotes/origin/main` then
  `git switch -c <branch> origin/main`. The plain `git fetch origin main` form
  does not update the remote-tracking ref here, which CLAUDE.md records and
  which caught two sessions in one evening.
- Read the branch back before every commit, with
  `git rev-parse --abbrev-ref HEAD`. Your memory file
  `co-lead-commits-under-live-sessions.md` records two commits landing on the
  wrong branch because `git rev-parse --short HEAD` answers the same on any
  branch and therefore cannot detect the error.
- Commit with an explicit pathspec, never a bare `git commit`. Two sessions in
  `D:\dana` share one index, recorded in
  `concurrent-sessions-share-one-git-index.md`.
- Run the whole gate from `app/`, never from the repository root, and read the
  **file count** rather than the exit code. CLAUDE.md gives two independent
  reasons the exit code lies here.
- Push the branch and open a pull request. Then stop.
- Report back in language Imran can act on: what changed, which files, the test
  counts as numbers, and an explicit list of what it could not do or could not
  verify.

**Must never:**

- Commit or push to `main`. Not for a one-line fix, not because the branch
  "obviously" works, not because Hassan is asleep. This is a clause of the
  founders' agreement, not a preference.
- Write anywhere outside `app/src/client/**` and `app/src/client/styles/tokens.css`.
  In particular, never `app/src/server/**`, `app/db/**`, `app/src/shared/**`,
  `app/tests/**`, `.github/**`, `app/package.json`, `app/.env`, `CLAUDE.md`,
  `.claude/**`, `CODEOWNERS`, or `agreement.md`.
- Touch `app/src/shared/**` specifically, and know why: I checked, and
  `app/src/client/**` imports from `app/src/shared/*.js` and from nothing under
  `app/src/server/**` (the only `server/` strings in client files are prose in
  comments). That makes `shared/` the contract between the two sides. A change
  there is a change to the server wearing client clothes.
- Touch `app/tests/**` for any reason, and know why: an agent that can edit the
  acceptance suite can make its own work pass, and the only person who would
  notice cannot read tests. This is the single most important forbid in the file.
- Weaken a test to get green: no `.skip`, no `.only`, no relaxed assertion, no
  raised timeout, no deleted case. If a test fails, that is information, not an
  obstacle.
- Add or upgrade a dependency in `app/package.json`.
- Report done while the gate is red, or while it has not run the gate.

**When it is uncertain, which is the part that actually saves you:**

- Stop and write, do not guess. Produce a short report Imran can paste into a
  new GitHub issue labelled `backend`, containing: what he asked for, what the
  agent found, the exact file and line, and what it needs from Hassan. This is
  clause 5 of the agreement expressed as agent behaviour: problems outside your
  domain get reported, not fixed.
- Stop specifically when: the change needs a new API field, endpoint or response
  shape; a test fails in a file it did not touch; the fix would require an edit
  outside the client; the issue's described behaviour contradicts what the code
  does; or the gate is red for a reason it does not understand.
- Never route around a boundary by reimplementing server behaviour in the
  client. A duplicated rule in the client is worse than a blocked task, because
  it looks like it works.
- Never state something to Imran with more confidence than it earned. Tell him
  "I could not verify this" whenever it is true. He cannot check, so a confident
  wrong sentence is not a small error, it is the entire failure mode.

The mechanical half of these guardrails should not live only in prose. Claude
Code supports path-scoped permission rules (`Edit(...)`, `Write(...)`, deny
rules, all present as literals in the binary), and agent frontmatter accepts
`tools`, `disallowedTools`, `permissionMode` and `hooks`. Write the boundary
twice: once as a rule the agent understands, once as a deny rule it cannot talk
its way past.

### The other three, in a paragraph each

**`backend.md` (Hassan's).** Takes a `backend` issue and owns `app/src/server/**`,
`app/db/**`, `app/src/shared/**`, `app/scripts/**`, `.github/**`, and the tool
configuration. Carries the merged hazard knowledge from old personas 01 to 06
and 10: the invariants and why they are constraints rather than checks, the
recurrence and DST rules of 11.9, the 404-not-403 chokepoint, deterministic
ordering ending in `id`, and the single-instance assumptions behind the
in-memory rate limiter and the 60-second tick. Reads spec section 11 including
the 11.15 hazard list before writing code, for the reason CLAUDE.md already
gives: training-data recall of the installed library versions is wrong in
specific listed ways. Branches from `main` and opens a PR like everyone else,
because a two-person repo where one person commits straight to `main` has no
review at all.

**`test-author.md` (Hassan's).** Writes acceptance tests against the spec and
never writes the code they test. This is old persona 11 with its scope loosened:
it no longer claims exclusive ownership of every file in `app/tests/**`, but it
keeps the rule that the agent implementing a behaviour does not write that
behaviour's acceptance test. It is worth invoking for anything Imran's agent
produces that has user-visible behaviour, because it is the only check in the
new workflow that does not require a human to read a diff. It should also carry
the flake knowledge, since a test author that cannot tell a flake from a defect
will write around the flake: the PGlite worker-fork failures, the Postgres leg
sharing one `dana_test`, the browser leg's single-case marginals, and the rule
that a whole-leg red of one case is unmeasured rather than broken.

**`reviewer.md` (Hassan's, optional).** Runs before Hassan reads a PR and answers
four mechanical questions: did the branch stay inside its owned paths, does the
gate pass in CI's order, did any test get weakened, and did any response shape
or shared type change. This is old persona 12's review list minus its merge
authority, which now belongs to you. Its value is highest on Imran's PRs, where
you are the only reviewer and the diff arrives without a human author who can
explain it. It is optional because a `CODEOWNERS` file plus a branch protection
rule does part of the same job with no tokens spent, and because you are
entitled to decide that you would rather just read the diff.

### The seam I cannot resolve for you

Old persona 07 (Frontend Architect) owned the client's data layer, routing,
caching, and the PWA shell. Old persona 08 owned the component library and the
tokens. Both are inside `app/src/client/**`.

The agreement says Imran leads "design direction, branding, visual language,
colors, animations, spacing, layouts, and how the application looks and behaves"
and that Hassan leads technical implementation, "connecting Imran's frontend work
to them". Those two sentences do not partition `app/src/client/**`.

Concretely: `app/src/client/api/`, `app/src/client/state/`,
`app/src/client/pwa/`, and `app/src/client/observability/` are engineering, not
design. `app/src/client/components/`, `app/src/client/styles/`,
`app/src/client/parts/`, and `app/src/client/screens/` are design. `pages/`,
`views/`, `shell/` and `states/` are genuinely both. This has to be settled
before CODEOWNERS is written, because CODEOWNERS is where the answer becomes
enforceable. I have listed it as an open question rather than deciding it for
you.

---

## 4. Personas versus Claude Code subagents

**What I found.** None of the thirteen files has YAML frontmatter. I checked all
thirteen first lines with `cat -A`; every one is a markdown H1 followed by a
blank line and `## Mindset`. There is no `---` delimiter, no `name:`, no
`description:`, no `tools:`, no `model:`. They are plain documents that happen to
sit in a folder Claude Code scans.

**The proof that this matters.** I am a Claude Code session running with `D:\dana`
as the working directory, right now, on version 2.1.251. The agent types
available to me are `claude`, `claude-code-guide`, `Explore`, `general-purpose`,
`Plan`, and `statusline-setup`. Not one of the thirteen. Claude Code looked in
`.claude/agents/`, found nothing it could load, and said nothing about it. That
is the whole failure in one observation: **it does not error, it just does
nothing**, so the plan looks like it is working right up until you notice the
orchestrator has never once routed to a Dana persona.

**What the tool expects.** `.claude/agents/` is confirmed as the custom-agents
directory: the binary carries the literal string `.claude/agents` in its ignore
and scan lists, the status display renders a "Custom agents" section labelled
`.claude/agents/`, and there is a warning path for "Agent descriptions are over
the [N]-token limit". The loader validates agent definitions and emits
`Failed to load agent from ${e}: ${x}`, `[agents] Duplicate agent name '`, and
`: agent names must not start with '-'`. The definition fields I can see in the
binary include `name`, `description` (with a `when-to-use` alias), `tools`,
`disallowedTools`, `model`, `color`, `permissionMode`, `hooks`, `mcpServers`,
`maxTurns`, `effort`, `background`, `isolation`, `memory`, and `cacheTtl`. Note
that `permissionMode`, `hooks` and `mcpServers` are honoured in `.claude/agents/`
files and ignored only for *plugin* agents, which the binary states explicitly:
"which is ignored for plugin agents. Use .claude/agents/ for this level of
control."

**What would have to change.** Three things, and none is hard:

1. Add YAML frontmatter to each file that is meant to be an agent. At minimum a
   `name` and a `description`. The `description` is what the orchestrator reads
   when deciding whether to route a task, so it has to describe *when to use this
   agent*, not what the role believes about databases. A short imperative line.
2. Move everything that is not an agent out of `.claude/agents/`. Reference
   documents in that folder are at best noise the loader ignores and at worst
   descriptions eating the token budget the warning above exists to police.
3. Commit them. Untracked files help exactly one machine.

And one thing that is not about frontmatter: **thirteen agents was never going to
route well anyway.** The orchestrator picks by description, so thirteen
overlapping backend descriptions would produce thirteen near-misses. Four sharply
distinct descriptions will route far better than thirteen careful ones.

---

## 5. Memory

### What is there

Eleven files at `C:\Users\hassan\.claude\projects\D--dana\memory\`, one of which
is the `MEMORY.md` index. Every file carries YAML frontmatter with
`node_type: memory` and a `type` of `user`, `project`, `feedback`, or
`reference`. Total about 30 KB. I read all eleven in full.

**Personal to this machine, or to Hassan.** These should never go in the repo.

- `hassan-profile.md`: who you are, how you want to be talked to, your standing
  instructions. Also contains judgements about Imran ("Imran is his collaborator
  on design, not an engineer") and about your own working patterns ("He gets lost
  when detail piles up"). See the warning below.
- `hassan-shell-is-powershell-51.md`: your shell is PowerShell 5.1, so commands
  handed to you must not use `&&`. Facts about your terminal, not the project.
  Also records three of the assistant's own mistakes.
- `background-bash-cwd-resets.md`: Bash cwd behaviour in this tool on this
  machine.
- `co-lead-commits-under-live-sessions.md`: how to commit safely when another
  session is live in `D:\dana`.
- `gate-runs-under-concurrent-sessions.md`: running the browser leg from a
  worktree, and the `mklink /J` junction recipe that only works on `D:`.
- `concurrent-sessions-share-one-git-index.md`: two sessions share one index.
- `verify-briefed-environment-claims.md`: treat briefed facts as unverified.

The last four are about *this machine running many agents at once*. In the new
two-person workflow they are less relevant, but they are not wrong, and the
lesson underneath all of them (state comes from artifacts, never from reports) is
the most valuable single idea in the whole memory set.

**Shared team knowledge that belongs in the repo.** These are facts about Dana,
not about Hassan:

- `test-database-url-is-ambient.md`: a bare `npm test` is the Postgres leg here,
  and the Playwright leg seeds one database while serving another unless the
  variable is unset.
- `postgres-leg-shared-database-flake.md`: AC-086 and AC-090 flake on the
  Postgres leg because roughly 146 files share one `dana_test`. Re-run the file
  alone to tell flake from defect.

Both are already in CLAUDE.md in fuller and better-corrected form. The
`TEST_DATABASE_URL` one is a good example of why: CLAUDE.md records that the
variable's state has flipped at least twice and instructs sessions never to trust
a written answer about it, while the memory file states flatly that it is set.
The memory file is not wrong today, but it is the kind of claim that goes stale
silently. **Do not copy these into the repo. They are already there.**

**Already stale.** `dana-build-state.md` contradicts itself inside one file.
Lines 11 to 17 record that Render was repointed to `main` on 2026-08-31 and that
`v2-build` was deleted, and then lines 69 to 71, under "How to apply", still say
"Render still deploys `v2-build` ... it must be pointed back at `main`". Lines 59
to 61 also claim "no CI runner is registered since the repo moved, Actions
history is empty", which sits against CLAUDE.md's account of a self-hosted runner
on this machine, and I did not test which is true today. The whole file is a
build log of a build that has finished. It is history, and history belongs in
`SESSION-LOG.md` and `CHANGELOG.md`, not in a file that is injected into every
session's context.

### The mechanics, and what I actually verified

You asked me not to guess here, so here is exactly what I checked.

**Verified: the default location is outside the repository, and is derived from
the working directory.** The Claude Code binary carries the settings-schema
description for a setting named `autoMemoryDirectory`, in full:

> "Custom directory path for auto-memory storage. Supports ~/ prefix for home
> directory expansion. Ignored if set in projectSettings (checked-in
> .claude/settings.json) for security. When unset, defaults to
> `~/.claude/projects/<sanitized-cwd>/memory/`."

That matches what is on disk exactly: `D:\dana` sanitizes to `D--dana`. It is
also visible in the code, which sets `var w7="memory", P7="MEMORY.md"`.

**Verified: it is per working directory, and does not follow worktrees.**
`~/.claude/projects/` holds 22 entries including `D--dana`, `D--dana-app`, and
`D--dana-client`. Only `D--dana` has a `memory/` folder. The other two have none.
So every session that ran in a worktree started with no memory at all. This is
worth knowing regardless of what you decide: if agents work in worktrees, memory
does not travel with them today.

**Verified: there is no automatic repo-local `memory/` folder.** I found no code
path or string suggesting Claude Code scans the repository for a `memory/`
directory on its own. The default is the per-project directory outside the repo,
full stop. The empty `.claude/memory/` directory currently sitting in your repo
does nothing. It is untracked (git does not track empty directories, which is why
it does not appear in `git status`) and nothing reads it.

**Verified: relocation is supported, through a setting.** `autoMemoryDirectory`
is read, in this precedence order, from `policySettings`, then `flagSettings`,
then (only when the project is trusted) `localSettings` or `projectSettings`,
then `userSettings`. A sibling setting `autoMemoryEnabled` turns the whole
feature off per project, and an environment variable
`CLAUDE_CODE_DISABLE_AUTO_MEMORY` does the same.

**Not resolved, and I am flagging it rather than guessing.** The schema
description says `autoMemoryDirectory` is "Ignored if set in projectSettings
(checked-in .claude/settings.json) for security". The code I read does consult
`projectSettings.autoMemoryDirectory` when the project is trusted, and there is a
separate function that collects which of `.claude/settings.json` and
`.claude/settings.local.json` set it, apparently to disclose it in the trust
dialog. **Those two pieces of evidence disagree**, and I could not settle which
behaviour ships without actually running it, which I did not do because it means
writing settings files. The safe reading, and the one I would build on: put
`autoMemoryDirectory` in `.claude/settings.local.json` (personal, gitignored),
not in the committed `.claude/settings.json`. That works under either reading.

**Not verified: whether a relative path is accepted.** The path validator
rejects a value when a helper function returns false for it, and separately
rejects any bare Windows drive letter like `D:`. Combined with the explicit `~/`
expansion branch, my **inference** is that the value must be absolute or
`~/`-prefixed, and that a relative path such as `./memory` will be silently
dropped. I could not confirm the helper is `path.isAbsolute` because the binary
is minified and the identifier is reused across module scopes. **Do not build a
plan that depends on a relative path working without testing it first.** The test
is cheap: set it, start a session, and see whether the memory files load.

**There is also a separate team-memory feature, and it is not this.** The binary
contains an org-memory system with `scope: "team"`, mount points, an
`allow_memory_sync` capability, discovery over a `/v1/code/memory/` endpoint, and
a `CLAUDE_MEMORY_STORES` environment variable. It is gated on organization
configuration. Your `~/.claude/settings.json` records "**Organization**: None
configured". So this is not a route available to you, and it is not what "move
memory to a local folder" would give you.

### What should move, what should stay

**Move nothing by copying.** The two shared-knowledge files are already in
CLAUDE.md in better form, and copying them creates the second copy that CLAUDE.md
itself warns about: "a rule stated twice is a rule that will one day disagree
with itself".

**What I would actually do,** and this is a recommendation, not a finding:

1. Leave the auto-memory directory where it is. It is Hassan's per-machine
   working memory, it works, and the risk of moving it is real while the benefit
   is unclear.
2. Delete or archive `dana-build-state.md`. It is a finished build's log
   contradicting itself, injected into every session.
3. If you want shared, versioned team knowledge, that is CLAUDE.md and the
   reference documents beside it, not the memory system. They are committed, they
   are reviewable in a PR, and Imran's agent reads them automatically.

### What would be unwise to commit

Concretely, if the memory folder moved into the repository as-is:

- **`hassan-profile.md` is the clear problem.** It says "Imran is his
  collaborator on design, not an engineer" (line 11), that Hassan "gets lost when
  detail piles up" (line 17), and it records his standing instruction to "enforce
  standardization over his and Imran's frequently self-contradictory instincts"
  (line 14). None of that is malicious and all of it is useful to the assistant.
  It is also a private note about a business partner written for an audience of
  one, and it would land in a repository that partner's agent reads, four days
  after both of you signed an agreement whose section 1 opens "It is not about
  distrust." Do not commit this file.
- **The self-critical files read as an incident log.** Three of them
  (`co-lead-commits-under-live-sessions.md`,
  `hassan-shell-is-powershell-51.md`, `verify-briefed-environment-claims.md`)
  are lists of specific mistakes with dates and commit hashes. They are exactly
  the kind of honest engineering record that is valuable in private and awkward
  in a shared repo. That is a judgement call, not a rule, and it is yours.
- **No credentials.** I checked. The memory files name
  `postgres://dana_ci@127.0.0.1:5432/dana_test` in
  `test-database-url-is-ambient.md`, which is a local connection string with no
  password. Nothing else in the eleven files is a secret.

---

## 6. `.claude/` layout for a two-person repo

### What `.gitignore` currently does with `.claude`

Nothing. The root `.gitignore` is twelve lines (`node_modules/`, `.next/`,
`.data/`, `dist/`, `test-results/`, `playwright-report/`, `desktop.ini`,
`Thumbs.db`, `.DS_Store`, `*.tsbuildinfo`) and does not mention `.claude` at all.
I confirmed with `git check-ignore -v` on two files under `.claude/`: not
ignored. There is no `app/.gitignore`.

So the current state is not a policy, it is an accident: `.claude/launch.json`
got committed because someone ran `git add` on it, and `.claude/agents/` did not.
`.vscode/settings.json` is likewise untracked and has never been committed
(`git log --all -- .vscode` is empty). Its entire content is
`{"folder-color.pathColors": []}`, an empty setting for a folder-colouring
extension. It carries nothing and either decision about it is fine.

### What should be committed

| Path | Committed? | Why |
| - | - | - |
| `.claude/agents/*.md` | **Yes** | This is the whole point. Imran's agent persona is a safety device, and a safety device on one machine protects nobody. It also has to be reviewable: a change to `frontend.md` is a change to what Imran's agent is allowed to do, and that belongs in a PR |
| `.claude/settings.json` | **Yes**, once it exists | Shared permission rules, especially the path denies backing Imran's boundaries. Does not exist today |
| `.claude/settings.local.json` | **No**, gitignore it | Personal permissions, personal model choice, and `autoMemoryDirectory` if you ever set it |
| `.claude/launch.json` | Yes, but fix it | Six of eight entries point at a deleted directory and one points at a path on Imran's machine |
| `.claude/memory/` | Delete it | Empty, unread, and misleading. Nothing writes there |
| `.claude/worktrees/` | Gitignore it | Empty here. If it ever holds worktrees, it must never be committed |
| `.vscode/settings.json` | Either | Empty of content. If you commit it, commit it deliberately |

Add to `.gitignore`:

```
.claude/settings.local.json
.claude/worktrees/
```

Do **not** add a blanket `.claude/` ignore. That is the common default and it is
exactly wrong here, because it would hide the one file whose job is to constrain
an agent whose output nobody can review.

### Sensitive content in `.claude/`, given that `app/.env` is deliberately committed

Two things, and only one of them is in the repo.

**In the repo: `.claude/launch.json:106`.** The `dana-app-audit-dev` entry has
`"cwd": "C:\\Users\\imran\\OneDrive\\Documents\\ChatGPT\\Dana App\\.work\\hassan-repo-audit/app"`.
That is Imran's Windows username, his OneDrive layout, and the fact that he keeps
the project under a folder named `ChatGPT`. It is not a credential. It is
personal filesystem detail about your partner, committed without any obvious
decision to commit it, in an entry that cannot work on any machine but his. It
should come out. Two separate reasons: it is his information, and the path
contains a `.work` dot segment, which CLAUDE.md records as breaking the browser
leg outright.

**Not in the repo, and worth knowing about:** your user-level
`~/.claude/settings.json` carries an `autoMode.environment` block that is a
security briefing about this project. It names the repository, the deploy target,
the production instance, the trusted domains, and, under "Sensitive data
locations & audiences", it names `app/.env` as holding live credentials and lists
three specific files and an RFC as sensitive, "share only with the two named
collaborators". That file is at `C:\Users\hassan\.claude\settings.json`, outside
the repository, which is the right place for it. I am flagging it because a
future session tidying settings might reasonably think that block belongs in the
project, and it does not: it is a map of what is worth stealing, and its current
location is correct.

Beyond that, `.claude/` holds no credentials. `app/.env` staying committed is a
ruling you already made and it is unaffected by anything here, except in one
direction worth stating once: Imran's agent must never write to `app/.env`, and
the repository's privacy is still the only thing standing between those
credentials and the world.

---

## What I could not verify

- **Whether `autoMemoryDirectory` set in a committed `.claude/settings.json` is
  honoured or ignored.** The settings-schema description in the binary says it is
  ignored there "for security"; the resolution code appears to read it when the
  project is trusted. I did not run it, because testing means writing settings
  files, which is outside this task's one permitted write. Use
  `.claude/settings.local.json`, which is safe under both readings.
- **Whether `autoMemoryDirectory` accepts a relative path.** My inference is no,
  absolute or `~/` only, based on the validator rejecting bare drive letters and
  on the explicit `~/` expansion branch. I could not confirm the helper function
  is `path.isAbsolute` because the binary is minified. Test before relying on it.
- **The exact required set of YAML frontmatter fields for a subagent
  definition.** I confirmed the loader validates definitions and I recovered the
  field names it accepts, but the expensive regex needed to recover the required
  or optional flags on each field timed out. What I can say without qualification
  is that the current files have *no* frontmatter and are *not* being loaded,
  which is what actually matters.
- **Whether CI currently has a runner.** `dana-build-state.md:59-61` says no
  runner is registered and Actions history is empty; CLAUDE.md describes a
  self-hosted runner on this machine. I did not call `gh` to settle it. If it is
  true that CI has no runner, then "Hassan reviews and merges after CI is green"
  has no CI to wait for, and that is worth checking before the workflow is
  written.
- **Whether `.claude/agents/` ever contained anything other than these thirteen
  copies.** `git log --all -- .claude/agents` is empty, so git cannot tell me,
  and I did not search the session transcripts.

## Open questions for Hassan

1. **The 364 uncommitted deletions.** `docs/team/`, `docs/design/`,
   `docs/operator/`, `docs/parity/`, `docs/security/`, `docs/ux/`,
   `dana-reports/`, and `AGENTS.md` are all deleted in the working tree and all
   still present at `HEAD`. Nothing is lost yet. Is that deletion the intended
   restructure, and should the implementation session commit it, or is it debris
   from an exploratory pass that should be restored first?

2. **Where does `app/src/client/**` split between you and Imran?** `api/`,
   `state/`, `pwa/` and `observability/` are engineering. `components/`,
   `styles/`, `parts/` and `screens/` are design. `pages/`, `views/`, `shell/`
   and `states/` are both. CODEOWNERS cannot be written until this is decided,
   and Imran's agent's owned-paths list is the same decision.

3. **Does Imran's agent get to open the pull request, or does it stop at pushing
   the branch?** The agreement says he does not push to `main`, which a PR does
   not violate. But a PR is a request for your attention, and it may be better
   for the report-to-Imran step to come first so he can decide whether it is
   ready.

4. **Do you want the `reviewer` agent, or is a CODEOWNERS file plus branch
   protection enough?** Branch protection is free and does not consume tokens.
   The reviewer agent catches things a rule cannot, like a response shape
   drifting or a test quietly weakened. You could have both, and you could also
   reasonably have neither and just read the diff.

5. **Should `dana-build-state.md` be deleted from memory?** It contradicts itself
   about Render, and it is a finished build's history being injected into every
   session's context. `SESSION-LOG.md` and `CHANGELOG.md` already hold that
   record, in the repository, where it is reviewable.

6. **CLAUDE.md's opening instruction is now unsatisfiable.** Its "Before
   implementation work" section tells a session to stop unless it was given
   `docs/team/_shared-protocol.md` plus one persona from `docs/team/`. Neither
   exists in the working tree. Whichever session rewrites CLAUDE.md needs to fix
   that paragraph in the same change that lands the new personas, or the first
   agent that reads it will refuse to work.
