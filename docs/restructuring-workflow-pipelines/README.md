# Restructuring, workflow and pipelines — discovery and plan

**Written:** 2026-08-31, on branch `pipelines`, at Dana 2.2.0.
**Status:** planning complete, 2026-08-31. Two review rounds; all fourteen decisions settled.
**Nothing has been implemented.** No application code was changed, no folder was restructured,
and no file outside this directory was touched.

This is the answer to: *how should two people — one working on the frontend through AI
agents, one working on the backend — build Dana together, using GitHub as the hub?*

---

## Read in this order

| # | Document | What it answers |
| --- | --- | --- |
| 1 | [What we found](01-what-we-found.md) | The state of the repository today, honestly. Start here. |
| 2 | [The proposed structure](02-repository-structure.md) | Where everything should live, and the `CODEOWNERS` draft. |
| 3 | [The workflow](03-the-workflow.md) | Issue → branch → pull request → review → merge, and the rules that keep it working. |
| 4 | [Crossing the boundary](04-crossing-the-boundary.md) | What happens when frontend work needs the backend. The part that decides whether this works. |
| 5 | [Decisions](05-open-decisions.md) | All fourteen, settled. The index of what was decided and where the reasoning lives. |
| 6 | [Implementation plan](06-implementation-plan.md) | The running order for the next session. |
| 7 | [Building a big feature](07-big-features.md) | Both sides at once, without waiting and without inventing the same thing twice. Rare — RFC-sized work only. |

If you only read two, read **1** and **6**.

---

## The seven analyses

Seven agents each read one part of the repository. Their raw reports are in
[`analysis/`](analysis/) — about 290 KB in total, far more detail than the summaries above.
Every claim in them is tied to a file and a line.

| Report | Covers |
| --- | --- |
| [a1 — client / frontend](analysis/a1-client-frontend.md) | A guided tour of `app/src/client/`, and which folder names are real duplication |
| [a2 — server / backend](analysis/a2-server-backend.md) | The request lifecycle, the authorization story, `app/db/`, and the "minor change" whitelist |
| [a3 — shared and the contract](analysis/a3-shared-and-contract.md) | What `app/src/shared/` is, who should own it, and how contract changes should travel |
| [a4 — tests and CI](analysis/a4-tests-and-ci.md) | The `ac-NNN` scheme, test ownership, what Imran can run, and the state of the pipeline |
| [a5 — documentation](analysis/a5-docs-structure.md) | Dead references, the spec-to-folders move, RFCs, changelog, session log, `CLAUDE.md` |
| [a6 — agent tooling](analysis/a6-claude-tooling.md) | The thirteen personas, `.claude/` layout, and the memory question |
| [a8 — frontend blast radius](analysis/a8-frontend-blast-radius.md) | Which parts of the client a small diff changes far more of than it looks, and why `npm test` proves less about the client than it seems |
| [a7 — history and hygiene](analysis/a7-history-and-hygiene.md) | Who actually worked where, branch protection, `LICENSE`, `CODEOWNERS`, the committed `.env` |

---

## The five things that matter most

If the rest of this is too much to read at once, these are the findings that changed the
plan.

**1. CI has never run on this repository.** Zero workflow runs, zero registered runners. The
project moved to `zhssnym/dana` on 30 August and the runner was never re-registered. Every
statement about CI in `CLAUDE.md` and the spec describes the old repository.

**2. `CLAUDE.md` currently tells agents to stop working.** It requires a file in
`docs/team/` that no longer exists. An agent following it correctly refuses to touch `app/`.

**3. "Imran never pushes to `main`" cannot be enforced by GitHub on this plan.** He has push
permission today, and branch protection returns `403: upgrade to GitHub Pro`. **Settled in
review: it stays a convention** in the workflow files, because the review before merge is the
control that actually matters. See [D3](05-open-decisions.md).

**4. The git history does not support the split you are making.** 941 of 1,021 commits are
co-authored by Claude, and for four days in August every commit in the repository — backend
included — was authored `mranwafa`. `CODEOWNERS` is not describing an existing boundary; it
is creating one.

**5. The agent setup does not work, and fails silently.** The 13 personas have **never been
committed on any branch**, so Imran has never had them. They have no YAML frontmatter, so
Claude Code does not register them as subagents — verified in the session that produced this
report: the available agent types were the six built-in ones and not one Dana persona. Nine
of them define "done" against a file that no longer exists. `AGREEMENT.md` is untracked too.

---

## The principle behind the proposal

You wrote issue #5 yourself: the old workflow was too rigid, and rigidity makes an agent
"put into word games rather than leaving time for actual coding tasks."

That is the constraint this plan is built around. The resolution is not fewer rules or more
rules, but a different kind of rule — **rules a machine enforces instead of rules an agent
must interpret.**

A lint rule that fails the build costs an agent nothing to obey. Six named behaviours that
always stop need no judgement at all. A 500-line protocol costs attention on every single task
and gets obeyed unevenly — which is exactly what you observed.

Where a rule genuinely cannot be mechanised, it is stated as criteria to check rather than a
principle to weigh.

So the plan pushes enforcement into tooling wherever it can, and keeps the written rules
short.

---

## What was deliberately not done

- No code was changed, no files moved, no folders created outside this one.
- No `CODEOWNERS` or `LICENSE` was created — both are drafted in the reports instead.
- No test suite was run. The suite is currently red for an unrelated reason
  (`foundation.test.ts` reads a deleted folder), so any number taken now would mislead.
- The `ac-NNN` test files were not renamed, and the analysis argues against ever renaming
  them.
