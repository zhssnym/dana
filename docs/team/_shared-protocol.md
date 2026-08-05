# Dana swarm: shared protocol

This file holds the rules that are identical for all thirteen roles. Nothing here is optional, and nothing here is overridden by a persona file; where a persona seems to conflict with this document, this document wins and the conflict is an escalation. Every session also auto-loads the repository's root `CLAUDE.md`. It owns the repository map, this machine's environment and commands, and an orientation sketch of the architecture; it restates no rule from this document. Wherever the two appear to differ, this protocol wins.

## 1. The contract

`../spec/` is the single source of truth for what Dana must do. It is one contract split by numbered section: a reference to "section N.M" resolves to the file whose name begins with N, and `../spec/00-index.md` is the map. It is a specification, not a suggestion. When the spec and your judgment disagree, the spec wins until it is formally amended.

Four consequences:

- **Never implement from memory or inference.** Open the numbered section before you write code that touches it.
- **Read section 11 and its 11.15 hazard list before your first line of code.** Section 11 is normative architecture, and 11.15 exists because training-data recall of the installed libraries is wrong in specific, listed ways.
- **Never silently deviate.** A deviation that is not recorded in the specification is a defect, even if the code works.
- **Never widen a frozen interface.** The schema (section 4) and the API (section 7) are frozen. Changing either invalidates acceptance criteria by number and is a human decision, not yours.

## 2. State comes from artifacts, never from reports

Determine where the project stands by reading the repository, not by asking anyone and not by trusting a previous summary:

- `git log --oneline` for what has landed.
- `cd app && npm test` for what actually passes.
- Grep `app/tests/` for `AC-` to see which acceptance criteria are covered.
- The specification, plus `git log`, for every recorded change.
- The active RFC's implementation plan for the dependency graph and for which packages you are assigned.

If a claim about project state cannot be reproduced from those five sources, treat it as unverified.

## 3. Boundaries are hard

Every persona names the paths and spec sections it owns and the ones it must never touch. These are not guidelines. In a swarm, two agents editing the same file with different assumptions is the primary failure mode.

A persona is permanent. It names ownership that holds for every version of Dana, and it is never rewritten because a new version began. Which packages you are assigned, and in what order, comes from the active RFC's implementation plan alone; a persona names no package, because a package belongs to one release and a role does not.

- Edit only inside your owned paths.
- One sanctioned exception: any role may add a dependency to `app/package.json` (and the lockfile) when its own work needs it. Name the addition and its reason in the commit message; the Integration Steward reviews it at merge. Removing or upgrading someone else's dependency is not covered by this exception.
- If your work requires any other change outside your paths, stop and raise it to the Integration Steward with a precise description of the change you need. Do not make it yourself, and do not work around it with a duplicate implementation.
- Read anything. Reading the whole repository is encouraged. Writing is scoped.

## 4. Definition of done

Work is done when all of the following hold. Not four of five.

1. The behavior matches the numbered spec sections you own.
2. The acceptance criteria assigned to your package pass, by their numbers, in `app/tests/`.
3. `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass, in that order, the same order CI runs them.
4. Nothing outside your owned paths changed, except sanctioned dependency additions.
5. Any deviation from the spec is recorded in the specification with its reasoning.

Reporting work as done when it is not is the worst failure available to you. If you are blocked, say you are blocked and why. A blocked agent is recoverable; a false green is not, because everything downstream builds on it.

## 5. How to verify on this machine

The commands, the database seam, the development login, and what must never be committed live in the repository's root `CLAUDE.md`, which every session auto-loads. They are recorded there rather than here because they are facts about this machine, and they apply to every session, including ones that never receive this protocol. Read that file's "Commands and this machine" section before you verify anything.

The gate itself is section 4 above, and its order is CI's order.

## 6. Escalation

Stop and escalate, rather than deciding, when any of these occur:

| Trigger | Route to |
| - | - |
| The spec is ambiguous, contradictory, or silent on something you need | Integration Steward |
| Your work needs a change to the schema or the API | Integration Steward, who routes to the human owner |
| Another agent's committed work blocks or contradicts yours | Integration Steward |
| An acceptance criterion appears wrong | Adversarial Test Engineer, then Integration Steward |
| You need a file outside your owned paths changed | Integration Steward |
| A third-party library behaves differently from what the spec assumes | Integration Steward, and record it in section 13 |

When you escalate, state the spec section, the exact problem, the options you considered, and your recommendation. Do not escalate without a recommendation.

## 7. Writing conventions

- Never use em dashes or double hyphens in any Dana document, comment, or commit message. Use commas, colons, or separate sentences. Markdown table delimiter rows use a single hyphen per column.
- 24-hour time notation. Use "to" for ranges.
- Comments explain why, not what. Match the density and idiom of surrounding code.
- Commits: a short imperative subject line, a body explaining what changed and which acceptance criteria now pass, and a `Co-Authored-By:` trailer naming the model the session actually ran on, at `<noreply@anthropic.com>`. The name is the session's own and is read from the session, never copied from this sentence: a fixed string here went stale the moment the model lineup changed, and a trailer that misnames its author is worse than no trailer, because attribution is the one thing it exists to carry. Commits already written stay as they are; this governs new ones.
- Work on a branch named for your package, for example `p3-tasks-core`. Never commit directly to `main`; the Integration Steward merges.

## 8. Tests

Two categories, two owners.

- **Acceptance tests** are the numbered acceptance criteria of spec section 12, every number it carries, including those a later amendment appends. The Adversarial Test Engineer owns them exclusively. You do not write them, and you do not edit them to make your code pass. If an acceptance test seems wrong, escalate.
- **Unit tests** inside your own module are yours, encouraged, and unrestricted.

If you find yourself editing a test so your implementation passes, stop. That is the swarm equivalent of grading your own homework, and it is the thing the separation exists to prevent.
