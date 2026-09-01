# How we work

Read this first. It is short on purpose.

## The rules that are never broken

1. **Every change starts from a GitHub issue.** No issue, no branch.
2. **Branch from `main`. Never push to `main`.** Hassan merges.
3. **Work inside your own area.** `CODEOWNERS` at the repository root says which area is
   whose.
4. **Before changing anything outside your area, read the rules for crossing.** They are in
   your side's folder below. Do not decide for yourself that a change is small.
5. **Name the test commands you ran** in the pull request, and name the ones you could not
   run. "Tested" is not a claim anyone can check.
6. **Declare every file you touched outside your own area**, and why, in the pull request.
   Nothing else in this project catches an undeclared change.
7. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
   Say so in the pull request and leave it failing.
8. **Say you are blocked rather than saying you are done.** A blocked agent is recoverable.
   A false green is not, because everything after it is built on top.
9. **The repository is not a scratchpad.** Anything unresolved is a GitHub issue, not a file.
   Open questions, notes to self, things to come back to: an issue, labelled and assigned.
   Do the work, act on it, then delete the file.
10. **Decide the obvious thing yourself.** Escalate only when the answer changes what Dana
    is, or costs money, or cannot be taken back. Everything else: decide, do it, and say what
    you decided in the pull request.

Merging into `main` deploys to production within minutes. There is no staging. That is why
rules 2 and 8 exist.

## Where to go next

| You are | Read |
| - | - |
| Working on the frontend | [`frontend/README.md`](frontend/README.md), and stop there |
| Working on the backend | [`backend/README.md`](backend/README.md), and stop there |
| Starting a feature that needs both sides for weeks | [`big-features.md`](big-features.md). Rare. |

**Your side's file is meant to be enough on its own.** Read it and start working. If it is
not enough, that is a bug in it, and saying so is more useful than reading around it.

[`how-we-work.md`](how-we-work.md) is the shared reference behind both: the label table, the
review, versions, and how the changelog is kept. Go there when you need one of those, not
before. It was measured once at 222 lines against a task that needed two of them.

`CLAUDE.md` at the repository root owns the environment: the commands, the machine, and the
ways the test suite fails here that are not your fault. Read it before you run anything.
