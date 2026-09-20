# How work flows, from issue to production

Dana is built by two people working as one team. Imran leads the product and decides what
Dana should be. Hassan leads the technical side and decides how it is built. Both work
through AI agents, and this file is what those agents follow.

**Deciding is not the same as owning a folder.** Either person's work may reach any file in
this repository; what stays with a person is the decision, not the directory. The rules that
stop a change are in [`hard-stops.md`](hard-stops.md), and they stop everyone.

```
 discuss → issue → label → branch → work → gate → review → pull request → merge → live
```

**The gate and the review both come before the pull request, not after it.** That is the one
place this diagram differs from the shape most projects have, and sections 7 and 8 are why.
The sections are numbered in that order too, except for section 9: it is called Review, it
sits after Open a pull request, and it describes two moments — the reviewer agent the author
runs **before** section 8, and the reading whoever merges does after.

## 1. Discuss, in GitHub Discussions

Ideas, questions, half-formed thoughts: GitHub Discussions, not chat. A decision that lives
only in a chat thread gets argued again in three weeks because nobody can find it.

**Discussions are for thinking. Issues are for work.** A discussion that reaches a
conclusion becomes an issue.

## 2. Open an issue. Always.

**No change to the codebase without an issue.** This includes small ones, and it includes
Hassan's own work.

The issue number is the thread that ties everything together: the branch is named after it,
the pull request closes it, and the changelog traces back to it. If some work has an issue
and some does not, that thread breaks and nothing can be traced later.

Opening one costs twenty seconds, so there is no exception worth having.

How much the issue says depends on the size of the work:

| Size | What it needs |
| - | - |
| A colour, a spacing, an alignment, a bug | One sentence. The issue is the documentation. |
| A normal feature | A few paragraphs in the issue. No separate document. |
| Weeks of work on both sides | Discussion first, then several issues, merged as several pull requests with the screen last. No RFC and no milestone — this repository has never used either. See [`big-features.md`](big-features.md). |

Writing long documents for small changes wasted a great deal of time in version 1. Do not
repeat it.

### What an agent may open, and it is five things

An agent opens an issue in exactly five cases:

1. **The task it was given**, when no issue exists for it yet. Open it first, then branch.
2. **A blocker it cannot resolve**, which is the same moment rule 9 applies: say you are
   blocked, and the issue is where that gets recorded.
3. **A defect it found outside the task it was given.** One issue per defect, and do not fix
   it here; see the end of section 6.
4. **A decision a person must make**, on the `Decision needed` template, whether or not the
   work is blocked on the answer. Section 6 says what counts as one, and the bar is high.
5. **The workflow itself being wrong** in a way the agent cannot simply fix in the pull
   request that hit it. That is rule 12, and it is labelled `documentation`.

**Not for anything else.** Never to park a thought, never to ask a question the agent could
have decided, never to split its own task into pieces so that some of them can be somebody
else's, and never because a file it needed belongs to someone — no file does.

Five shapes, every time. **Always through a template**, because a blank issue is a
paragraph nobody can triage. **Always an area label and a type label.** **One issue per
defect**, because an issue with three defects in it closes when one is fixed.

*Added 2026-09-04 from issue #180, where two overnight runs produced a study branch named
after a tool, issues opened to park a thought, and issues opened to hand work over a boundary
that no longer exists. **The list read three cases when it was first written that day, and
was missing two this same document asks for elsewhere**, sections 6 and rule 12; a list of
permitted cases that excludes the cases its own workflow requires is a list that teaches
people to stop reading it.*

## 3. Label it

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
| `rfc` | This work has an RFC |
| `open-question` | A decision nobody has made yet. Always assigned to whoever decides it |

An issue that needs both sides gets **both** `frontend` and `backend`. **The area label says
where the work is, never who may do it.**

A label is a starting guess, not a verdict. It is chosen before anyone has looked at the
code, so it is often wrong. Either person may change it at any time without asking, and an
agent that discovers the label was wrong should change it as part of the work.

*The two `handoff-to-*` labels were retired on 2026-09-04 with issue #180. Work no longer
crosses a boundary, so there is nothing to hand off; what is left is a decision a person owes,
which is `open-question` and has always been.*

## 4. Branch from `main`

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
weeks later can be traced back. A branch carrying several issues takes the number of one of
them. **The area in the name is where the work started**, and it does not bind what the
branch may touch.

**Three conditions come with carrying several issues**, and together they are what makes it
allowed:

- **Each issue gets its own commit.** The merge squashes the branch into one commit on
  `main`, so that per-issue commit is what a review reads and the only place an issue sits
  beside its own diff.
- **The pull request names every issue it closes**, one line each in the body.
- **Grouping is for avoiding conflicts between your own branches, never for saving CI time
  on unrelated work.** Unrelated issues stay on separate branches, so a failed check points
  at one thing and a review is about one thing.

Added 2026-09-04 from issue #73, where twenty-five backend issues queued behind one
self-hosted runner: taken literally the plain rule cost either a day of serialised runs or a
set of greens measured against a `main` that had moved underneath them.

**A branch lives as long as its work is alive, and not one day longer.** A month is fine if
work is happening. What is not fine is a branch nobody has touched. When the work is done,
the branch is deleted, and GitHub does that automatically on merge.

On a long branch, bring `main` in regularly rather than only at the end. **A conflict is
yours to resolve wherever in the tree it lands**; where resolving it needs a decision rather
than a merge, section 6 says what that is.

## 5. Gather context, in a fresh session

**One issue, one fresh chat.** Then, before writing code:

- read the issue, and anything it links to;
- check whether an open pull request is already touching the same files;
- read your starting point, `frontend/README.md` or `backend/README.md`;
- read [`hard-stops.md`](hard-stops.md);
- read the part of `docs/spec/` the work touches;
- read `CLAUDE.md` for the commands and this machine's quirks.

This exists for a specific failure. Keeping one long chat across many issues is tempting,
because starting fresh feels like re-explaining everything. But the context dilutes and the
model starts inventing. **If an agent can rebuild its own context in thirty seconds,
starting fresh stops being expensive.**

## 6. Work, wherever the issue reaches

Change what the issue needs, and change all of it. A product change that moves a word on a
screen usually also moves the browser criterion that pinned the word and the specification
sentence that named it; those are part of the same change and land in the same pull request.
**A change that cannot be complete on its own is the thing this workflow is built to
avoid.**

Before you start, and again whenever the work turns, read
[`hard-stops.md`](hard-stops.md). Eight things stop everyone until the rule beside each is
met, and they are the whole of what stops you. Everything else: decide, do it, and say what
you decided in the pull request.

### When you need the other half of the codebase

**Invoke the other side's agent.** Give the `frontend` or `backend` agent the exact need, let
it work on the same branch, and integrate its commit. It is not an escalation, it needs no
issue, and it is the ordinary way one pull request covers both halves of one change.

You may also just do it. The agents exist because one of them already knows the folder map
and the traps, not because the other is forbidden.

### When a person has to decide

**An issue exists when a person must decide something, and only then.** A product decision —
what Dana should do or become — is Imran's. A technical decision — how something should work
— is Hassan's. Use the **Decision needed** template, which asks for three things and will not
let you skip the third:

1. what must be decided;
2. who decides it;
3. **what you will do in each case.** An agent that cannot answer this has usually not found
   a decision; it has found a choice it should make and record.

Label it `open-question` plus the area, assign it to whoever decides, and **carry on with
whatever does not depend on the answer.** Label your own issue `blocked` only if nothing does.

Anything going to Imran must be answerable **without reading code**.

### The bar for escalating is high, on purpose

The protocol this workflow replaced made agents escalate rather than decide. It produced 57
parked items in specification section 13, and when they were triaged, **nine of the twenty-one
still live ones turned out to be work an agent should simply have done**: two screens showing
an old name, a limit that disagreed with its endpoint, a spec paragraph nobody had written, a
2.3 MB bundle nobody had split.

None of those needed a person. They needed somebody to decide and get on with it.

So: **escalate only when the answer changes what Dana is, or costs money, or cannot be taken
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
back to, a "we should decide this later", a note to self: that is an issue.

The rule exists because the alternative was tried and it failed in a specific, measurable
way. Specification section 13 accumulated **57 items**, most of them long since decided, in a
file nobody revisited. A question parked in a document is invisible: it notifies nobody, it
has no owner, nothing marks it answered, and it is indistinguishable at a glance from a
question that still matters. Fifty-seven of them together are simply weight, and weight is
what stops a document being read at all.

An issue is the opposite of all of that. It notifies someone, it has an assignee, it closes,
and closed is visibly different from open.

The same rule covers audits, investigations and one-off reports: **do the work, act on it,
then delete the file.** Git history keeps everything, and nothing that has stopped being true
should be sitting in a folder waiting to mislead someone.

The test for whether something belongs in the repository at all: *is this true of the
product today, and will it still be true next month?* A specification is. A workflow rule is.
A question is not.

### A defect you find that is not your task

**Open an issue and do not fix it.** Not because the file is someone else's — no file is —
but because a pull request closes the issues it names and no others, and an unrelated fix
inside it is a change nobody agreed to review. One issue per defect, with what you saw and
where.

The value of two people is that each sees what the other misses, and reporting is how that
value is realised.

## 7. Run the gate

```
npm run gate
```

It runs spec 11.11's six steps in order on this machine — install, lint, typecheck, the
Postgres 18 leg, build, Playwright — stops at the first failure, and prints a
**gate record**: the head sha, whether the tree was dirty at either end of the run, the
machine, the clock, and the tally each step reported. `npm run gate -- --quick` runs lint,
typecheck and build only, and says so in the record; it is for the middle of the work and
never for a pull request.

**The record is the claim, and it is a claim somebody can check.** "Tested" is a word that
gets written after watching code compile. A record naming 295 files and 1961 tests against a
sha is not.

Four things about it:

- **It must be green on the head commit.** A record whose sha is not the tip of your branch
  measured something else, and one that says `tree dirty at <sha>` measured a tree nobody can
  reconstruct.
- **There are three verdicts and only `green` opens a pull request.** `red at <step>` means a
  step failed. **`incomplete` means a step of the six did not run**, and it is neither: not
  red, because there is no defect to point at, and not green, because 11.11 fixes six steps
  and this record is the evidence they were answered for.
- **So the Postgres leg is not optional.** It needs `TEST_DATABASE_URL` set in the process
  that runs the gate, and without it the record ends
  `GATE: incomplete (Postgres leg not available on this machine)` and the gate exits non-zero.
  **A machine that cannot run that leg cannot open a pull request.** The fix is a one-time
  setup rather than an exemption: spec 11.10 carries the `CREATE DATABASE` statement that
  fixes the locale, and it is the same database on every machine. `CLAUDE.md` is emphatic
  that the variable is ambient here and has changed more than once, so read what the record
  printed rather than what you expected.
- **A red is not evidence until you have named which class it is.** `CLAUDE.md` enumerates
  four flake classes and only two are answered by re-running. Say in the pull request which
  one you decided it was, and why.

**The order for a small change: look at it first, gate it last.** The full gate is most of
half an hour, and spending it before anyone has seen a seventeen-line change spends it in the
wrong order; issue #66 measured fourteen minutes before the change could be shown to
anybody. So make the change, run `npm run gate -- --quick`, run the one Playwright spec that
covers that screen, and look at it in a browser. Show it, take the corrections, and run the
whole gate when the work is accepted. **Nothing is weakened by this: the same six steps in
full before every pull request. Only the order moves.**

### What GitHub Actions still does

CI is the safety net, not the gate.

- **On every pull request, without exception**: the branch name, `npm ci`, lint, typecheck,
  build. Minutes, not half an hour, and light enough to run beside the agents that are
  working on this machine. It exists to catch a pull request opened without a gate run, not
  to be that run. **A documentation-only pull request gets it too**, because a branch is
  misnamed whatever files it touches.
- **On a push to `main`**: all six steps of 11.11, unchanged. That is the run that matters,
  because it measures what was actually merged.
- **A documentation-only push to `main` skips that one.** `paths-ignore` in
  `.github/workflows/ci.yml` keeps the full job off `docs/`, `.claude/`, `.vscode/`,
  the issue and pull request templates and the root markdown files, with the reasoning beside
  it. It is on that trigger alone.

**Commit as small and as often as you like.** Successive pushes to an open pull request
collapse into one, `concurrency` cancelling the run in progress when the next arrives, and
`main` is exempt because a cancelled verdict is not a verdict.

## 8. Open a pull request

**A pull request exists only when the work is finished**, which means all of this is already
true:

- `npm run gate` says **`GATE: green` on the head commit**, and its record goes in the body.
  Green and not `incomplete`: a record missing one of the six has not answered for the
  six, whatever the reason it gives;
- the **`reviewer` agent has run** on the branch, and its verdict goes in the body;
- every **hard stop** the change touched is named, with the rule that was met;
- every **criterion** the change moved is named, with the decision that moved;
- the branch name matches the shape in section 4, which CI checks on every pull request.

**Never a draft.** A draft pull request is a way of asking for attention before the work is
worth attention, and the whole of section 7 exists so that it does not have to be.

**It closes the issues it names and no others.** A pull request that closes several names
every one of them, one line each. Section 4 says when a branch may carry more than one.

**An exploration or a study is a branch with an issue, never a pull request without one.**
Push the branch, say what you learned on the issue, and delete the branch. Nothing that is
not meant to merge should be sitting in the pull request list looking like it is.

The title becomes the commit on `main`, because merges are squashed. Write it as a
Conventional Commit, because the version number and the changelog are read from it:

```
feat: assignee avatar in the task row
fix: task list 500s on an empty folder
refactor: one router preamble, not thirteen
feat!: folders are now shelves          the ! means breaking
```

For a change to what a person sees, attach before and after screenshots.

## 9. Review

**The `reviewer` agent is the second reader, on both sides' work including Hassan's own, and
the author runs it before the pull request exists.** It has no write tools on purpose: a
reviewer that can fix what it finds stops looking once it has fixed something.

Its verdict goes in the pull request in one paragraph. "It found nothing" is a verdict and a
good one; a reviewer that always finds something teaches everyone to skim it.

**Then whoever merges reads three things**, in this order:

1. **The gate record against the head sha.** A record for a different commit, or one that
   says the tree was dirty, is not a gate run.
2. **The hard stops declared**, against the diff. This is the box nothing else in this
   project catches.
3. **The criteria changed**, and whether the pull request names the decision that moved each
   one.

Product decisions are Imran's. Technical decisions are Hassan's. That split is already
settled and the review does not reopen it.

## 10. Merge, which means release

**Merging into `main` deploys to production within minutes.** There is no staging.

Hassan merges, and only Hassan. Squash merge, so a pull request becomes one commit. The
branch is deleted automatically. The six steps then run on `main`, and that run is the
verdict on what was merged.

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
to name. Do not hold work back to line up with one.

At release time: bump `app/package.json`, tag `v2.3.0` to match, and write the changelog
entry.

## Changelog

`CHANGELOG.md` at the repository root. **One short paragraph per version, written when the
tag is cut.** Nothing is written per merge, and nothing is written per issue.

Generate the raw list from the commit titles between the last tag and this one, then edit it
into prose a person would want to read. Git already holds the detail; the changelog exists
to say what changed in a way the detail cannot.
