# 5. Decisions

**Status:** closed 2026-08-31. **Fourteen decisions opened, fourteen settled, none open.**

The planning phase is complete. The implementation plan in
[document 6](06-implementation-plan.md) can be executed as written.

The reasoning behind each decision lives in the document that acts on it. This page is the
index.

---

## The decisions

| Decision | Settled as |
| --- | --- |
| **Enforcing "no push to `main`"** | A convention in the workflow files. No GitHub Pro, no fork, no git hook. The review before merge is the control. |
| **Test ownership** | Co-locate component tests beside their components. `app/tests/` is not split. Ownership follows the existing `/app/src/client/` line. |
| **Who owns `app/src/shared/`** | Hassan. The frontend may add a **read** schema alone; request schemas ship with the backend change that reads them. |
| **Prototypes** | There are none. Branch from `main` and work in the real client. |
| **Handoffs** | GitHub issues, labelled and assigned. A file only for the rare RFC-scale case. Deleted when the work merges. |
| **`ac-NNN` test naming** | Freeze the range, rename nothing. New tests co-locate. |
| **The thirteen personas** | Deleted. Three agents — frontend, backend, reviewer — with YAML frontmatter. Harvest the hazard lists first. |
| **Commit the untracked files** | Yes. `AGREEMENT.md` and `.claude/agents/` — phase 0.1. |
| **CI** | Re-register the self-hosted runner now. Revisit hosted runners later, with data rather than a guess. |
| **The eslint import boundary** | Yes — phase 1.1, and the highest-leverage step in the plan. |
| **The 360 deletions** | **Intended.** Deliberate cleanup done by hand before the analysis. Commit them. See below. |
| **Memory** | **Per-machine.** Shared knowledge goes in `docs/workflow/` instead — reviewed, versioned, no conflicts, and nothing private gets published. |
| **`GOOGLE_CLIENT_SECRET`** | **Left as is** while the repo is private with two collaborators. See the note below. |
| **Licence** | **Proprietary, all rights reserved, naming both partners.** Draft in `analysis/a7-history-and-hygiene.md`. |

And the structural decisions taken during review, which were never numbered:

| | |
| --- | --- |
| **`docs/` folders** | Four: `spec/`, `rfcs/`, `workflow/`, `handoffs/`. `product/` and `audits/` cut. |
| **`SESSION-LOG.md`** | Deleted, with its two code citations rewritten. |
| **`CHANGELOG.md`** | Stays at the root, trimmed in place, one short paragraph per version. |
| **`CLAUDE.md`** | Stays at the root and keeps the environment lore. Loses the stop instruction, the dead pointers, and the process content. |
| **Versioning** | From the pull request title, at release time — not per issue, and not from issue size. |
| **Labels** | No size labels. Add `breaking`, `blocked`, `rfc`. |
| **Branch lifetime** | Measured by activity, not age. Deleted when the work is done. |
| **The backend rule** | Six always-stop behaviours plus stated criteria. Not a file blacklist. |
| **`docs/workflow/`** | Seven files. `big-features.md` is one file with both roles, not one per side. |
| **Big features** | Contract first — schema **and stub endpoint** — then parallel work, merged in slices. |
| **Merge deploys to production** | Kept. No staging, consistent with the app being pre-release and needing no hotfix process. |

---

## Two notes attached to the answers

### On the deletions — two files did not make the move

Confirmed intentional, and the reasoning holds: the prototypes are gone because there are no
prototypes, `docs/operator/` described a workflow being replaced, and the reports were
in-progress notes. All of it stays recoverable from git.

**One correction, because it changes phase 0.2.** The answer was that the team files were
moved into `.claude/agents/`. Thirteen of the fifteen were — but two were left behind:

| File | Lines | Why it matters |
| --- | --- | --- |
| `docs/team/_shared-protocol.md` | 87 | `CLAUDE.md` calls it "the operative rulebook", and **nine of the thirteen personas define "done" against it.** The single most-referenced file in the old system, and the one that did not come across. |
| `docs/team/README.md` | 56 | The index for the set. |

`_shared-protocol.md` has eight sections — the contract, state from artifacts, hard
boundaries, definition of done, how to verify on this machine, escalation, writing
conventions, and tests. Several of those are being replaced by `docs/workflow/`, so most of it
is genuinely obsolete. But it should be **read once before the deletion commits**, so anything
still true moves into the new workflow files rather than being rediscovered later.

That is phase 0.2, already in the plan. This just explains why that step exists.

### On the secret — one free thing still worth doing

Leaving `GOOGLE_CLIENT_SECRET` as it is closes the rotation question. It does **not** close a
separate one, which costs nothing and is unrelated to rotating:

The commit that started tracking `app/.env` deleted the `.env*` / `!.env.example` ignore rules
**wholesale**. So nothing currently stops a future `.env.production` — or any other `.env`
file — from being committed by accident.

Restoring a narrow rule keeps `app/.env` tracked exactly as you decided, while making every
other `.env*` file ignored. It stays in phase 5 of the plan as a one-line change.
