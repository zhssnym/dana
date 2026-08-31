# How work flows, from issue to production

Dana is built by two people. Imran leads the product and owns what the user sees. Hassan
leads the technical side and owns everything behind it. Each works through an AI agent, and
this file is what those agents follow.

```
 discuss  →  issue  →  label  →  branch  →  work  →  test  →  pull request  →  review  →  merge  →  live
```

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
| Weeks of work on both sides | Discussion first, then Hassan writes an RFC. It becomes a milestone, and the work becomes issues inside it. See [`big-features.md`](big-features.md). |

Writing long documents for small changes wasted a great deal of time in version 1. Do not
repeat it.

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
| `handoff-to-backend` | The frontend needs something from the server |
| `handoff-to-frontend` | The backend needs something from the client |

An issue that needs both sides gets **both** `frontend` and `backend`.

A label is a starting guess, not a verdict. It is chosen before anyone has looked at the
code, so it is often wrong. Either person may change it at any time without asking, and an
agent that discovers the label was wrong should change it as part of the work.

## 4. Branch from `main`

Always from current `main`, never from another branch. One issue, one branch.

```
frontend/42-assignee-avatar-in-task-row
backend/57-assignee-name-in-task-response
chore/61-drop-dead-launch-config
```

The shape is `<area>/<issue-number>-<short-description>`. Area first, so the branch list
sorts by owner. The number, so a branch found six weeks later can be traced back.

**A branch lives as long as its work is alive, and not one day longer.** A month is fine if
work is happening. What is not fine is a branch nobody has touched. When the work is done,
the branch is deleted, and GitHub does that automatically on merge.

On a long branch, bring `main` in regularly rather than only at the end. A conflict inside
your own area is yours to fix. A conflict outside it goes to whoever owns that area.

## 5. Gather context, in a fresh session

Start a new session per issue. Then, before writing code:

- read the issue, and anything it links to;
- check whether an open pull request is already touching the same files;
- read `docs/workflow/` for your own side;
- read `CODEOWNERS`;
- read the part of `docs/spec/` the work touches;
- read `CLAUDE.md` for the commands and this machine's quirks.

This exists for a specific failure. Keeping one long chat across many issues is tempting,
because starting fresh feels like re-explaining everything. But the context dilutes and the
model starts inventing. **If an agent can rebuild its own context in thirty seconds,
starting fresh stops being expensive.**

## 6. Work, inside your area

Change what the issue needs, inside the area you own.

If the work reaches outside your area, stop and read your side's rules before touching
anything:

- frontend: [`frontend/allowed-backend-changes.md`](frontend/allowed-backend-changes.md)
- backend: [`backend/allowed-frontend-changes.md`](backend/allowed-frontend-changes.md)

Both files work the same way. There is a short list of things that **always stop you**, no
matter how small the change looks. Everything else is judged against written criteria. If
you cannot tell which applies, that is an answer: hand it off.

### Handing off

A handoff is a **GitHub issue**, not a file. An issue has no length limit, it notifies
someone, it has an assignee, and it can be closed. A file has none of that.

1. Open an issue using the `Handoff to backend` or `Handoff to frontend` template.
2. Put everything in the body. Do not summarise and promise detail somewhere else.
3. The template sets the label and the assignee for you.
4. Link both ways: name the issue you came from, and comment on that issue naming the
   handoff. One direction alone leaves a dead end for whoever reads it later.
5. If your own work cannot continue, label your issue `blocked`.

Only an RFC-scale handoff earns a document, and then it goes in `docs/handoffs/` and the
issue points at it. That folder does not exist yet, which is the expected state.

**When the work is merged, close the handoff issue and delete the document if there was
one.** This repository is working code, not an archive of finished conversations.

### The repository is not a scratchpad

**Anything unresolved lives in GitHub, not in a file.** An open question, a thing to come
back to, a "we should decide this later", a note to self: that is an issue.

The rule exists because the alternative was tried and it failed in a specific, measurable
way. `docs/spec/13-open-questions.md` accumulated **57 items**, most of them long since
decided, in a file nobody revisited. A question parked in a document is invisible: it
notifies nobody, it has no owner, nothing marks it answered, and it is indistinguishable at a
glance from a question that still matters. Fifty-seven of them together are simply weight,
and weight is what stops a document being read at all.

An issue is the opposite of all of that. It notifies someone, it has an assignee, it closes,
and closed is visibly different from open.

**When you meet an open question:**

1. Open an issue, labelled `open-question`.
2. **Assign it.** A product question, about what Dana should do or become, goes to Imran: he
   decides where the product goes. A technical question, about how something should work,
   goes to Hassan.
3. Write it so the assignee can answer it. Anything going to Imran must be answerable
   **without reading code**.
4. Do not also write it into a document. The issue is the record.

The same rule covers audits, investigations, handoffs and one-off reports: **do the work,
act on it, then delete the file.** Git history keeps everything, and nothing that has stopped
being true should be sitting in a folder waiting to mislead someone.

The test for whether something belongs in the repository at all: *is this true of the
product today, and will it still be true next month?* A specification is. A workflow rule is.
A question is not.

### Reporting a problem you are not going to fix

If you notice something wrong outside your own area, **open an issue and do not fix it**.

The value of two people is that each sees what the other misses, and that value is realised
by reporting. It is destroyed by fixing, because now the owner has to review an unplanned
change to their own area, possibly in files they are halfway through editing.

## 7. Test

Run what you can. Then **name the commands in the pull request**, and name what you could
not run and why.

```
Ran:     npm run lint · npm run typecheck · npm test (PGlite leg, 1893 tests)
Did not: Playwright (browser not installed) · Postgres leg (no local database)
```

Naming matters. "Tested" is a word that gets written after watching the code compile. A
command is a claim someone can check. An unstated gap is worse than a known one.

## 8. Open a pull request

Not a draft. The template asks for what the review depends on, and two of its sections are
not optional:

- **which files outside your own area you touched, and why.** Nothing else in this project
  catches an undeclared change. "None" is the usual and best answer.
- **which test commands you ran**, with results.

The title becomes the commit on `main`, because merges are squashed. Write it as a
Conventional Commit, because the version number and the changelog are read from it:

```
feat: assignee avatar in the task row
fix: task list 500s on an empty folder
refactor: one router preamble, not thirteen
feat!: folders are now shelves          the ! means breaking
```

For frontend work, attach before and after screenshots.

## 9. Review

Hassan reviews everything that reaches `main`. A review agent runs first, on both sides'
work, including his own.

For frontend work the review is four questions, not a style opinion:

1. Did it stay inside `app/src/client/`?
2. If it went outside, was that allowed, and was it declared?
3. Do the tests pass?
4. Does it do what the issue asked?

Product decisions are Imran's. Technical decisions are Hassan's. That split is already
settled and the review does not reopen it.

## 10. Merge, which means release

**Merging into `main` deploys to production within minutes.** There is no staging.

Hassan merges, and only Hassan. Squash merge, so one issue becomes one commit. The branch is
deleted automatically.

## Versions

A version number says **what changed for the person using Dana**, not how hard it was to
build. A one-line change can be a major break. A week of refactoring can be invisible.

- **Patch** (`2.2.1`): bug fixes and polish.
- **Minor** (`2.3.0`): new features, visible changes.
- **Major** (`3.0.0`): the product changed enough that someone has to relearn it. A joint
  decision, not a consequence of having written an RFC.

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
