# How we work

Read this first. It is short on purpose.

**Three sentences carry the rest of it.** The boundary follows what the tests enforce, not
who can read what. The gate runs where the code was written. A pull request is a finished
thing.

## The rules that are never broken

1. **Every change starts from a GitHub issue**, and one issue is one fresh chat. No issue, no
   branch.
2. **Branch from `main`. Never push to `main`.** Hassan merges, and merging deploys.
3. **Work anywhere the issue reaches.** There is one team and no area you may not edit.
   `CODEOWNERS` says who is asked to review a file, and asking is the whole of what it does.
4. **Read [`hard-stops.md`](hard-stops.md) before you start.** Eight things stop everyone
   until the rule beside each is met. Everything else: decide, do it, and say what you
   decided.
5. **Declare every hard stop you touched** in the pull request, with the rule you met.
   Nothing else in this project catches an undeclared one.
6. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
   Say so in the pull request and leave it failing.
7. **A criterion changes only when the decision it pins changes**, and the pull request names
   the criterion and says which decision moved.
8. **Run `npm run gate`, then run the `reviewer` agent.** A pull request exists only after
   both, green on the head commit, and it carries the gate record.
9. **Say you are blocked rather than saying you are done.** A blocked agent is recoverable.
   A false green is not, because everything after it is built on top.
10. **The repository is not a scratchpad.** Anything unresolved is a GitHub issue, not a file.
    Open questions, notes to self, things to come back to: an issue, labelled and assigned.
    Do the work, act on it, then delete the file.
11. **Decide the obvious thing yourself.** Escalate only when the answer changes what Dana
    is, or costs money, or cannot be taken back. Everything else: decide, do it, and say what
    you decided in the pull request.
12. **When the workflow itself is the obstacle, fix it or open an issue about it.** Wrong,
    missing, or in the way of ordinary work. Fixing it in the pull request that hit the
    problem is usually right; where it needs a decision, label the issue `documentation`,
    name the file and the section, and say three things — what you were trying to do, what
    the workflow said or failed to say, and what you did instead. Then **carry on**. This is
    not a way to stop; rule 9 is the one for that. Not for "I would have phrased it
    differently" either: a rule that collects every quibble becomes a list nobody reads,
    which is exactly how specification section 13 reached 57 items.

Merging into `main` deploys to production within minutes. There is no staging. That is why
rules 2, 8 and 9 exist.

## Where to go next

| You are | Read |
| - | - |
| Starting on a screen | [`frontend/README.md`](frontend/README.md). A starting point, not a fence |
| Starting on the server, the database or the suite | [`backend/README.md`](backend/README.md). The same |
| About to do something irreversible or unwatched | [`hard-stops.md`](hard-stops.md). Read it before you start, not when you are unsure |
| Starting a feature too big for one pull request | [`big-features.md`](big-features.md). A note, not a process: there is no separate one, and two things worth keeping. |

**The two starting points are where work usually begins, not where it has to stay.** Each is
the folder map and the non-obvious facts of one half of this codebase, and a task that begins
on a screen and ends in a migration reads both. Where you need the other half and do not want
to learn it, **invoke the other side's agent** — `frontend` or `backend` — with the exact
need, on the same branch, and integrate its commit.

**Your starting point is meant to be enough on its own.** If it is not, that is a bug in it,
and rule 12 says what to do about it.

[`how-we-work.md`](how-we-work.md) is the shared reference behind all of them: the label
table, what an agent may open, the review, versions, and how the changelog is kept. Go there
when you need one of those, not before.

`CLAUDE.md` at the repository root owns the environment: the commands, the machine, and the
ways the test suite fails here that are not your fault. Read it before you run anything.
