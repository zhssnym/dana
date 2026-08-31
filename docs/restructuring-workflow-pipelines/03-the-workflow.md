# 3. The workflow

**Status:** revised 2026-08-31 after Hassan's review of the first draft.

Where his feedback and my judgement differ, the disagreement is marked **⚠ Architect's note**
and argued rather than quietly resolved. Everything else is his decision, adopted.

**One rule about sources.** `AGREEMENT.md` is a document between two people. It is not a
specification and no agent should derive rules from it. Every rule below stands on its own
reasoning and is stated here in full.

---

## 3.1 One thing to understand before anything else

**Merging into `main` deploys to production.** Render deploys from `main` on push
(`docs/spec/11-architecture.md:126`). There is no staging.

So merging is releasing. Every merge puts code in front of users within minutes. That is why
Hassan merges, why a branch must be green before it lands, and why "we will fix it after"
is not a plan.

---

## 3.2 The short version

```
 discuss  →  issue  →  label  →  branch  →  work  →  test  →  pull request  →  review  →  merge  →  deployed
(Discussions) (GitHub)  (area+type) (from main) (agent) (agent)   (GitHub)    (review agent) (Hassan) (Render)
```

---

## 3.3 Step by step

### Step 1 — Discuss, in GitHub Discussions

**GitHub is the place. Not WhatsApp.**

Anything about the application — ideas, features, questions, half-formed thoughts — goes in
GitHub Discussions. WhatsApp mixes project work into personal life and makes it clunky, and
a decision that lives only in a chat thread gets re-argued in three weeks because nobody can
find it.

Discussions are already enabled on the repository, so there is nothing to set up.

The split is simple: **Discussions are for thinking. Issues are for work.** A discussion that
reaches a conclusion becomes an issue.

### Step 2 — Open an issue. Always.

**No change to the codebase without an issue. No exceptions, including Hassan's own work.**

The issue number is the thread tying everything together: the branch is named after it, the
pull request closes it, and the changelog traces back to it. If some work has an issue and
some does not, that thread breaks.

This is cheap to obey — `gh issue create` takes twenty seconds — so there is no reason for an
exception to exist.

**How much detail depends on the size of the work:**

| Size | What it needs |
| --- | --- |
| **Small** — a colour, spacing, an alignment, a bug | One sentence. The issue *is* the documentation. |
| **Feature** — profile pictures, a new view | A few paragraphs in the issue. Still no separate document. |
| **Big / structural** — integrating AI, reworking the data model | Discussion first, then Hassan turns it into an RFC. The issue links the RFC. |

Version 1 wasted a lot of time writing heavy documents for small things. That mistake is not
repeated: the issue is the record.

### Step 3 — Label it

Every issue gets **an area** and **a type**. Two labels minimum, both chosen when the issue is
written.

| Label | Status | Meaning |
| --- | --- | --- |
| `frontend` | exists | Work in `app/src/client/` |
| `backend` | exists | Server, database, tests, infrastructure |
| `bug` | exists | Something is broken |
| `enhancement` | exists | Something new |
| `documentation` | exists | Docs and process |
| `breaking` | **add** | Changes something people already rely on. Drives the version — see 3.5 |
| `blocked` | **add** | Waiting on something else. Say what, in a comment |
| `rfc` | **add** | This work has an RFC. Links the process; does not decide the version |
| `handoff-to-backend` | exists | Imran needs backend work from Hassan |
| `handoff-to-frontend` | exists | Hassan needs frontend work from Imran |

An issue needing both sides gets **both** `frontend` and `backend`. No third label.

> **⚠ Architect's note — I recommend against size labels.**
>
> You proposed `small` / `medium` / `big`, and then immediately identified why they fail:
> *"an issue might seem small initially, but once you start working on it, it turns into
> something bigger."* That is the well-known reason size labels decay, and it is not solvable
> — the label is a guess made before the work.
>
> Size labels earn their keep on teams that do sprint planning and capacity allocation. You
> are two people who look at a list and pick something. They would cost you a decision on
> every issue and pay nothing back.
>
> The label that genuinely matters is **`breaking`**, because that is the one that changes
> what you do — see 3.5. Priority would be the next most useful axis if you ever want one,
> because "what next" is a real question. "How big" is not.

### Step 4 — Branch from `main`

Always from current `main`, never from another branch. One issue, one branch.

```
frontend/42-assignee-avatar-in-task-row
backend/57-assignee-name-in-task-response
chore/61-drop-dead-launch-config
```

`<area>/<issue-number>-<short-description>`. Area first so the branch list sorts by owner;
issue number so a branch found six weeks later can be traced.

### Step 5 — The agent gathers context

Before writing code, from a **fresh session**:

- read the issue, and anything it links to;
- check for an open pull request touching the same files;
- read `docs/workflow/` for its own side;
- read `CODEOWNERS` to know where the boundary is;
- read the relevant part of the spec.

This step exists for a specific failure. A non-technical person tends to keep one long chat
running across many issues, because starting fresh means re-explaining everything. The context
dilutes and the model starts inventing. **If the agent can rebuild its own context in thirty
seconds, starting a new session stops being expensive** — and that is what keeps the sessions
short and accurate.

### Step 6 — Work, inside the boundary

The agent changes what the issue needs. If that reaches outside its own area, it opens
`crossing-the-boundary.md` and follows it: small change, do it; large change, hand it off.

Details in [document 4](04-crossing-the-boundary.md).

### Step 7 — Test

Each side has its own list of what must pass. The agent runs what it can and **names the
commands it ran in the pull request.**

Naming matters more than it looks. "Tested" is a word an agent will write after watching the
code compile. A list of commands is a claim that can be checked:

```
Ran:     npm run lint · npm run typecheck · npm test (PGlite leg — 1530 passed)
Did not: Playwright (browser not installed) · Postgres leg (no local database)
```

An unstated gap is worse than a known one, and **an unnamed test run is not a test run.**

Note that CI does not currently exist on this repository — zero runs, no registered runner —
so until phase 1 of the implementation plan is done, local tests are the only verification
there is.

### Step 8 — Open a pull request

**Regular pull requests, not drafts.** Both of you work through AI of similar capability, so
there is no skill asymmetry that a draft would bridge, and drafts add review overhead nobody
wants.

The pull request says:

- what changed and why, with `Closes #42`;
- **which files outside its own area it touched, and why** — the reviewer should not have to
  discover this by reading the whole diff;
- **which test commands it ran, by name, with the result** — and which it could not run, and
  why;
- what was left out, and why;
- **for frontend work, before-and-after screenshots.**

The screenshots should be automated rather than remembered. Playwright is already installed
and already drives the app, so the frontend agent can capture both states and attach them.
Worth building once into the frontend workflow; it costs nothing per pull request afterwards.

### Step 9 — Review

**A review agent runs before anything merges — including on Hassan's own work.**

This closes a real gap. Hassan reviews Imran's work, but nobody was reviewing Hassan's, and
Imran cannot read backend code. Running the review agent on his own branches before pushing
means both sides get a second reader.

So the sequence is the same on both sides: finish the work → spawn the review agent → it
checks and gives a verdict → then merge. The review agent and the old "adversarial tester"
persona are the same role and become one agent.

Hassan still reads Imran's diff himself. The agent is a first pass, not a replacement — under
this workflow **the review is the only control standing between a change and production**, so
it is worth doing properly.

### Step 10 — Hassan merges

Merging is the release. See 3.1.

**Squash merge**, so one issue becomes one commit on `main`. The pull request title becomes
that commit message, which matters for versioning — see 3.5.

**Delete the branch on merge.** GitHub can do it automatically.

---

## 3.4 The rules that keep this working

### Imran never pushes to `main` — a convention, deliberately

Decided: this is a rule in the workflow files, not something GitHub enforces. No GitHub Pro,
no fork, no git hook.

The facts: `mranwafa` has push permission and branch protection is unavailable on this plan
(`403: Upgrade to GitHub Pro or make this repository public`). The reasoning for leaving it:
**the control that matters is Hassan reading the diff before it merges**, and that happens
either way. Deciding in advance which files Imran may touch adds friction without adding
safety.

So Imran's agent may touch backend files when an issue needs it. It pushes to its own branch.
Hassan reviews everything — backend included — and merges.

> **⚠ Architect's note — one correction.** Your feedback said: *"if you have a `CODEOWNERS`
> file, then even for the small changes it makes, it natively passes by me."*
>
> It does not, on this plan. CODEOWNERS only forces review when branch protection requires it,
> and branch protection is the thing you have chosen not to buy. It may not even
> auto-request a reviewer on a free private repository — that is worth a five-minute test.
>
> **This does not break your workflow**, because you are reviewing every branch before merging
> anyway. But do not rely on GitHub to surface a backend change for you. That is why step 8
> requires the agent to *declare* out-of-area edits in the pull request. Here, CODEOWNERS is
> a **map the agents read**, not a gate.

**A short list of behaviours always stops**, not as a gate on files but because these are the
changes whose damage a diff review cannot show: migrations, authorization gates, session and
auth handling, request-schema fields, the CSP, and rate limiting. Six behaviours, not a file
blacklist — everything else is judged against stated criteria. See
[4.2](04-crossing-the-boundary.md).

### A branch lives as long as its work, and not one day longer

**The test is activity, not age.** A branch with work happening on it is fine at a week, a
month, or longer — a big feature takes as long as it takes. A branch with no work happening
on it is the problem, however young it is.

So the rule is simply: **when the work is done, the branch is deleted.** Merge the pull
request, delete the branch. No branch outlives its issue.

What this is guarding against is the branch list becoming unreadable — a dozen names where
nobody can tell which two are alive. If a branch has gone quiet and its issue is not marked
`blocked`, close it and say why. It can always be reopened.

The one cost of a long-lived branch is drift from `main`, and that is managed rather than
avoided: bring `main` into the branch regularly, not just at the end. A conflict inside your
own area, you fix. A conflict outside it, hand to the owner. For a big feature there is a
better answer than a long branch anyway — merge it in slices, described in
[document 7](07-big-features.md).

### There are no prototypes

**This is the most important rule in the document, and it is the one that was learned twice
the hard way.**

Imran does not build a frontend from scratch on his own machine and call it a prototype. That
happened in v1 and again in v2, and both times connecting it to the backend afterwards was a
mess — because a prototype invents its own data shapes, its own state handling and its own
assumptions, and every one of them has to be renegotiated at integration time.

There is no separate place to build one, so it cannot happen again. It is designed out, not
forbidden.

**Everything is issue-based, and the workflow is identical at every size:**

- **Small** — fix it directly, standard workflow.
- **Medium** — fix it directly, standard workflow.
- **Big** — an RFC exists, and the branch references the issue *and* the RFC. Otherwise the
  same workflow.

The RFC changes what you read before starting. It does not change how the work flows.

### A feature that touches both sides is split, never shared

Two issues, two branches, two people. Never one branch with both people in it.

> **⚠ Architect's note — this is where I disagree most, and it matters.**
>
> You wrote that the frontend should build *"as if there is no backend"* and then document the
> open endpoints in a handoff for the backend to attach to.
>
> **That is the prototype failure in miniature.** A frontend built against nothing has to
> invent the shape of the data — field names, types, what a missing value looks like. Then the
> backend either conforms to shapes it did not choose, or Imran rewrites. The integration mess
> you described is exactly what invented shapes cause. Building inside the real repo makes it
> much less bad, but it does not remove the cause.
>
> **The fix is small and Dana is already built for it.** `app/src/shared/` holds zod schemas
> that both sides import, and the client checks every response against them at
> `app/src/client/api/http.ts:164`. That folder *is* the contract. So:
>
> 1. **Agree the shape first, in `app/src/shared/`.** Hassan writes the type — an hour, not a
>    week. Nothing is implemented.
> 2. **Both sides build in parallel.** Imran against the real type with mock data; Hassan
>    implements the endpoint behind it.
> 3. **They meet, and the type checker proves they agree.** Integration is a compile, not a
>    negotiation.
>
> This gives you the parallel work you want — nobody waits weeks — without inventing shapes
> twice. And if Hassan is unavailable, Imran's agent may propose the read schema itself and
> have it confirmed at review, so he is never blocked.
>
> The handoff keeps its job: it is how Imran **requests** the contract. It just gets written
> before he builds against it rather than after.

### No hotfix process

The application is pre-release. And the hotfix path is the normal workflow with the ceremony
skipped — branch, fix, merge — so there is nothing separate to define. Add one when there are
users who would notice.

---

## 3.5 Versions and releases

> **⚠ Architect's note — this is the one substantial thing in your feedback that I think is
> wrong, so it is argued in full.**

You proposed that issue size drives the version number: small issues bump the patch, features
bump the minor, RFCs bump the major, and *"when you finish working on an issue, it affects the
version number of the whole application."*

**Three problems, and the third is the one that will actually bite:**

**A tiny change can be a big break.** Renaming a field in an API response, changing a URL,
changing how a date is interpreted — one-line changes that break things people rely on. Under
a size rule those are patches, which is exactly backwards.

**A huge amount of work can be invisible.** Extracting the router preamble that is copied
across 13 files is days of work and changes nothing a user could notice. That is not a minor
release. It might not be a release at all.

**Versioning every issue produces noise, and it re-creates the problem you are trying to
escape.** If every merge deploys *and* every issue bumps a version, you get 2.2.1, 2.2.2,
2.2.3 several times a week, each needing a changelog entry. That is how you get back to a
222 KB changelog — the thing you just asked me to cut by 93%.

**The principle underneath:** a version number describes **what changed for the person using
the app**, not how hard it was to build. Effort and impact are different axes and the version
tracks impact.

### What to do instead — and it answers your labels question too

**Take the change type from the pull request title, using Conventional Commits.** This is the
industry standard, it is mechanical rather than a judgement call, and **you are already half
using it** — your history has `feat:`, `fix:`, `docs:` and `test:` alongside `ux:` and
`polish:`.

```
feat: assignee avatar in the task row        → a minor when released
fix: task list 500s on an empty folder       → a patch
refactor: one router preamble, not thirteen  → no version impact
feat!: folders are now shelves               → breaking
```

Because you squash-merge, the pull request title *becomes* the commit on `main`. So the
version and the changelog can both be derived from `git log` between two tags. Nothing extra
to maintain.

### The rules

- **Bump at release time, not per issue.** A release is when you decide there is something
  worth naming. Merges ship continuously regardless.
- **The bump follows what is in the release:** any `!`/`breaking` → major; any `feat:` →
  minor; otherwise patch.
- **Major is a product decision, not a process trigger.** An RFC-sized feature that breaks
  nothing is a minor, however much work it was. "Integrate AI" might be 2.5.0. A major means
  the product changed enough that someone has to relearn it — which is Imran's call, not a
  consequence of having written a document.
- `app/package.json` and the git tag always match. Tag `v2.3.0`.
- **The changelog entry is written when the tag is cut** — a short paragraph, generated from
  the commit list and then edited into prose.

### On your "agent updates the severity at the end" idea

The instinct is good — the agent *does* know more at the end than anyone did at the start. But
the useful thing for it to report is not a size label, it is the **change type**: did this
break anything, is it a feature, is it a fix. That feeds the version and the changelog
directly, and it is a fact about the change rather than an opinion about the effort.

So: the agent sets the pull request title prefix, and adds the `breaking` label if it applies.
That is the whole mechanism.
