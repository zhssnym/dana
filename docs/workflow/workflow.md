# How we work

Read this first. It is short on purpose.

```
 discuss → issue → label → branch → work → gate → review → pull request → merge → live
```

**The gate and the review both come before the pull request, not after it.** That is the one
place this differs from the shape most projects have.

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
    name the file and the section, and say what you were trying to do, what the workflow
    said or failed to say, and what you did instead. Then **carry on** — this is not a way to
    stop, rule 9 is the one for that, and it is not for "I would have phrased it differently"
    either.

Merging into `main` deploys to production within minutes. There is no staging. That is why
rules 2, 8 and 9 exist.

## Where to go next

| You are | Read |
| - | - |
| Starting on a screen | [`frontend.md`](frontend.md). A starting point, not a fence |
| Starting on the server, the database or the suite | [`backend.md`](backend.md). The same |
| About to do something irreversible or unwatched | [`hard-stops.md`](hard-stops.md). Read it before you start, not when you are unsure |

**The two starting points are where work usually begins, not where it has to stay**, and a
task that begins on a screen and ends in a migration reads both. **Each is meant to be enough
on its own**; if yours is not, that is a bug in it and rule 12 says what to do. `CLAUDE.md`
owns the environment: the commands, the machine, and the ways the test suite fails here that
are not your fault.

## Issues

**Discussions are for thinking. Issues are for work.** A discussion that reaches a conclusion
becomes an issue. The issue number is the thread that ties everything together: the branch is
named after it, and the pull request closes it. How much the
issue says depends on the size of the work, and writing long documents for small changes
wasted a great deal of time in version 1:

| Size | What it needs |
| - | - |
| A colour, a spacing, an alignment, a bug | One sentence. The issue is the documentation. |
| A normal feature | A few paragraphs in the issue. No separate document. |
| Weeks of work on both sides | Discussion first, then several issues, merged as several pull requests with the screen last. No RFC: that process is retired. It may belong to a milestone, which names direction and never tracks progress (`../milestones/`). |

### What an agent may open, and it is five things

1. **The task it was given**, when no issue exists for it yet. Open it first, then branch.
2. **A blocker it cannot resolve**, which is the same moment rule 9 applies: say you are
   blocked, and the issue is where that gets recorded.
3. **A defect it found outside the task it was given.** One issue per defect, and do not fix
   it here; see *A defect you find that is not your task* below.
4. **A decision a person must make**, on the `Decision needed` template, whether or not the
   work is blocked on the answer. *When a person has to decide* says what counts as one, and
   the bar is high.
5. **The workflow itself being wrong** in a way the agent cannot simply fix in the pull
   request that hit it. That is rule 12, and it is labelled `documentation`.

**Not for anything else.** Never to park a thought, never to ask a question the agent could
have decided, never to split its own task into pieces so that some of them can be somebody
else's, and never because a file it needed belongs to someone — no file does.

**Always through a template**, because a blank issue is a paragraph nobody can triage.
**Always an area label and a type label.** **One issue per defect**, because an issue with
three defects in it closes when one is fixed. *(Added 2026-09-04 from issue #180.)*

### Labels

Every issue gets an **area** and a **type**.

| Label | Meaning |
| - | - |
| `frontend` | The work is in `app/src/client/` |
| `backend` | Server, database, tests, or infrastructure |
| `bug` | Something is broken |
| `enhancement` | Something new |
| `documentation` | Docs and process |
| `breaking` | Changes something people already rely on |
| `blocked` | Cannot proceed until something else lands. Say what, in a comment |
| `open-question` | A decision nobody has made yet. Always assigned to whoever decides it |

An issue that needs both sides gets **both** `frontend` and `backend`. **The area label says
where the work is, never who may do it.** It is a starting guess chosen before anyone has
looked at the code, so either person may change it at any time without asking, and an agent
that discovers it was wrong changes it as part of the work.

## Branch from `main`

Always from current `main`, never from another branch. **One issue, one branch**, unless
several issues touch the same files, in which case one branch may carry them.

```
frontend/42-assignee-avatar-in-task-row
backend/57-assignee-name-in-task-response
chore/61-drop-dead-launch-config
```

The shape is `<area>/<issue-number>-<short-description>`, lower case with hyphens, and
**CI fails a pull request whose branch does not match it**:

```
^(frontend|backend|chore)/[0-9]+-[a-z0-9-]+$
```

Area first, so the branch list sorts by where the work is. The number, so a branch found six
weeks later can be traced back. **The area in the name is where the work started**, and it
does not bind what the branch may touch.

**Three conditions come with carrying several issues**, and together they are what makes it
allowed. **Each issue gets its own commit**, because the merge squashes the branch into one
commit on `main` and that per-issue commit is the only place an issue sits beside its own
diff. **The pull request names every issue it closes**, one line each. And **grouping is for
avoiding conflicts between your own branches, never for saving CI time on unrelated work**.
*(Added 2026-09-04 from issue #73, where twenty-five backend issues queued behind one
self-hosted runner.)*

**A branch lives as long as its work is alive, and not one day longer.** On a long branch,
bring `main` in regularly rather than only at the end, and **a conflict is yours to resolve
wherever in the tree it lands**.

## Work, wherever the issue reaches

Change what the issue needs, and change all of it. A product change that moves a word on a
screen usually also moves the browser criterion that pinned the word and the specification
sentence that named it; those are part of the same change and land in the same pull request.
**A change that cannot be complete on its own is the thing this workflow is built to avoid.**

**When you need the other half of the codebase, invoke the other side's agent.** Give the
`frontend` or `backend` agent the exact need, let it work on the same branch, and integrate
its commit; it is not an escalation and it needs no issue. You may also just do it — the
agents exist because one of them already knows the traps, not because the other is forbidden.

### A feature too big for one pull request

There is no separate process: it becomes several issues and merges as several pull requests.
Two things carry it, and neither is visible in the code once it has worked.

**The shape lands on `main` before either side builds against it.** The zod schema in
`app/src/shared/` is the contract, and it lands together with a working endpoint behind it
that returns empty or hardcoded data of the right shape — real URL, real method, real auth.
A schema with no endpoint behind it leaves the client building against fixtures of its own
invention, and the two shapes then diverge quietly. [`hard-stops.md`](hard-stops.md) carries
the half of this that is a hard stop: a request-schema field the server does not read is
accepted, dropped and answered 200.

**The screen merges last.** Schema and stub, then the real implementation, then the screen —
each slice harmless on its own, so a long feature needs no long-lived branch and no feature
flag. Where a screen genuinely cannot be split, land it on a route the sidebar does not link
yet. **The test of whether this worked: at the end, nothing has to be connected.** A phase
for wiring the two sides together means the contract was never real.

### When a person has to decide

**An issue exists when a person must decide something, and only then.** A product decision —
what Dana should do or become — is Imran's. A technical decision — how something should work
— is Hassan's. Use the **Decision needed** template, label it `open-question` plus the area,
assign it to whoever decides, and **carry on with whatever does not depend on the answer**;
label your own issue `blocked` only if nothing does. Anything going to Imran must be
answerable **without reading code**.

**The bar is high on purpose.** The protocol this workflow replaced made agents escalate
rather than decide, and it produced the 57 parked items in specification section 13: when
those were triaged, **nine of the twenty-one still live ones turned out to be work an agent
should simply have done** — two screens showing an old name, a limit that disagreed with its
endpoint, a spec paragraph nobody had written, a 2.3 MB bundle nobody had split. So
**escalate only when the answer changes what Dana is, or costs money, or cannot be taken
back.**

- "Which of two spellings does the product use?" is not a question. The rename is decided.
- "Should Dana let anyone sign up, or only invited people?" is a question. It changes what
  the product is, and Imran owns that.
- "Should this list paginate?" is not a question. Pick the sensible thing and note it.
- "Should Dana email people a weekly digest?" is a question. It changes what Dana does to
  someone's inbox.

An agent that escalates an obvious thing costs a person a decision they did not need to make.
An agent that decides a product question costs the project its direction. The first failure
is far more common here than the second, and this workflow is deliberately tuned against it.

### The repository is not a scratchpad

**Anything unresolved lives in GitHub, not in a file.** An open question, a thing to come
back to, a "we should decide this later", a note to self: that is an issue. A question parked
in a document notifies nobody, has no owner, and nothing marks it answered, which is how
specification section 13 reached 57 items — most of them long since decided, in a file nobody
revisited. The same rule covers audits, investigations and one-off reports: **do the work,
act on it, then delete the file.** Git history keeps everything. The test for whether
something belongs in the repository at all: *is this true of the product today, and will it
still be true next month?* A specification is. A workflow rule is. A question is not.

### A defect you find that is not your task

**Open an issue and do not fix it.** Not because the file is someone else's — no file is —
but because a pull request closes the issues it names and no others, and an unrelated fix
inside it is a change nobody agreed to review. One issue per defect, with what you saw and
where.

## The gate, and the pull request

**The order for a small change: look at it first, gate it last.** The full gate is most of
half an hour: make the change, run `npm run gate -- --quick`, run the one Playwright spec
that covers that screen, look at it in a browser, show it, take the corrections, and run the
whole gate when the work is accepted. **The same six steps in full before every pull request
— only the order moves.** *(Issue #66 measured fourteen minutes spent before a seventeen-line
change could be shown to anybody.)*

**A pull request exists only when the work is finished**, and the template asks for what that
means. **Never a draft** — a draft asks for attention before the work is worth attention.
**It closes the issues it names and no others**, one line each in the body. **An exploration
or a study is a branch with an issue, never a pull request without one**: push the branch,
say what you learned on the issue, and delete the branch. Nothing that is not meant to merge
should sit in the pull request list looking like it is.

**The `reviewer` agent is the second reader, on both sides' work including Hassan's own, and
the author runs it before the pull request exists.** It has no write tools on purpose: a
reviewer that can fix what it finds stops looking once it has fixed something. "It found
nothing" is a verdict and a good one; a reviewer that always finds something teaches everyone
to skim it.

Then Hassan merges, and only Hassan. Squash merge, so a pull request becomes one commit on
`main`, and that is what the version number is read from.

## Versions

A version number says **what changed for the person using Dana**, not how hard it was to
build. A one-line change can be a major break. A week of refactoring can be invisible.

- **Patch** (`2.2.1`): bug fixes and polish.
- **Minor** (`2.3.0`): new features, visible changes.
- **Major** (`3.0.0`): the product changed enough that someone has to relearn it. A joint
  decision, not a consequence of how much was built.

The bump follows what is in the release, read from the squashed commit titles: any breaking
change makes it major, any `feat:` makes it minor, otherwise patch.

**Versions are marked, not scheduled.** Merges ship continuously. A tag is a point you chose
to name. Do not hold work back to line up with one. At release time: bump `app/package.json`,
and tag `v2.3.0` to match.
