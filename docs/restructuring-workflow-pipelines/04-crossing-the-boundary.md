# 4. Crossing the boundary

**Status:** revised 2026-08-31 after Hassan's review.

This is the document that decides whether the whole workflow holds. Everything else — issues,
branches, labels — is ordinary and works the same way in any project. This part is specific to
your situation: one person who cannot read backend code needs to change things that sit in
front of a backend he does not own.

---

## 4.1 The problem, stated honestly

Imran's agent is working on a frontend issue. Halfway through, it finds the screen needs
something the backend does not do yet. A field is missing from the response. A list cannot be
filtered the way the design needs.

Three things can happen next, and two of them are bad:

1. **The agent changes the backend itself.** Fast, often correct. Also how the v2 mess
   happened, when an agent that did not understand the backend decided what was safe.
2. **The agent stops and the work stalls**, waiting for a conversation that may take days.
3. **The agent decides deliberately: do it, or hand it over with everything written down.**

The workflow has to make option 3 cheap. If handing over is painful, the agent quietly does
option 1. But if handing over is *too frequent*, Hassan drowns in handoffs and the workflow
gets abandoned for the same reason. Both failure modes matter.

---

## 4.2 The rule: behaviours, not files

**This replaces the file blacklist in the first draft. Hassan was right to reject it, and it
is worth being precise about why, because the fix is not simply "trust the agent more."**

The first draft said: here is a list of files the frontend agent may never touch. That is too
blunt. Adding a comment, a log line or a type annotation to a file under
`app/src/server/security/` is harmless, and blocking it turns a thirty-second edit into a
handoff, a review and a context switch for Hassan. Do that a few times and nobody uses the
process.

But **"is it small?" is also the wrong question**, and this is where I would push back on
pure size-based judgement. A one-line change to an authorization check is tiny and can expose
another person's data. A three-line migration is tiny and cannot be undone. Size is a decent
proxy for risk almost everywhere, and a terrible one exactly where it matters.

So the rule uses two questions, in order.

### Question 1 — Does this change a behaviour whose failure is silent or irreversible?

If yes: **stop and hand off, regardless of how small it is.**

There are six, and this is the whole list:

| Behaviour | Why judgement cannot save you here |
| --- | --- |
| **Database migrations** | Forward-only, no rollback, and they run against production the moment the merge deploys. A wrong one is not fixable by reverting. |
| **Authorization gates** | There are 25 hand-written `accessOf(...)` checks. Get one wrong and the API returns someone else's data, or hides data that should show. Nothing goes red. |
| **Session and auth handling** | Everything downstream trusts it. A mistake looks like the app working normally for the wrong person. |
| **Fields on a *request* schema** | There is no `.strict()` anywhere in `app/src/shared/`. An unhandled field is accepted and dropped, and the API answers **200 OK**. Your screen looks correct. |
| **The Content Security Policy** | It refuses things *silently*. This already cost months — every Google profile picture failed and looked identical to "no picture set." |
| **Rate limiting** | It is in-memory and assumes exactly one running instance. Changes here fail only under load, in production. |

**The common thread is not importance. It is that the agent cannot tell it got this wrong by
looking.** Everywhere else, a careful agent plus Hassan's review catches the mistake. In these
six, the code compiles, the tests pass, the screen looks right, and the damage is real.

**This is not a ban on the files.** Add a comment in an auth file, fix a typo, add a log line,
tighten a type — all fine. The rule is about changing what these things *do*.

### Question 2 — Otherwise, judge it, using these criteria

This is where Hassan's approach applies, and it applies to everything not caught above.

**Do it yourself if all of these are true:**

- you can describe the change in one sentence;
- it touches at most two files outside your own area;
- it adds no new endpoint, no new table or column, and does not change a response shape that
  other screens already use;
- you can test it, you did, and **you can name the command you ran.** "Tested" is a word an
  agent will write after watching the code compile; a named command is a claim that can be
  checked.

**Hand it off if any of them is false**, or if you are unsure. Unsure is an answer, not a
state to resolve by thinking harder.

### And the thing that makes this safe

Even a change you make yourself lands in a pull request that Hassan reads before it merges.
**The review is the real safety net.** These criteria exist to keep the review small enough
that it actually happens — a frontend pull request carrying fifty lines of backend change has
failed even if every line was fine, because nobody reads the fiftieth line as carefully as the
first.

Which is also why step 8 of the workflow requires the agent to **say in the pull request what
it touched outside its own area, and why.** Hassan should never have to discover a backend
change.

---

## 4.3 The handoff is a GitHub issue

**Decided: handoffs are issues, not files. No folder in 95% of cases.**

A folder of markdown files is not a queue. No notifications, no assignee, no open or closed
state, nothing to tell you a new one arrived. Worse, a file written on Imran's branch is
invisible until that branch merges — and the whole point of a handoff is usually that the
frontend *cannot* merge yet. It would fail in exactly the case it was built for.

Meanwhile a GitHub issue has no length limit. A handoff with full detail, example payloads and
a list of files fits comfortably in an issue body.

### The process

1. **Open a GitHub issue.**
2. **Put everything in the body.** Do not summarise and promise detail elsewhere.
3. **Label it** `handoff-to-backend` or `handoff-to-frontend`. Both already exist.
4. **Assign it** to the person who has to act.
5. **Link both ways** — the handoff issue references the issue it came from, and a comment on
   the original names the handoff. Either one alone leaves a dead end for whoever reads it
   later.
6. If the frontend work cannot continue, label the original issue `blocked`.

### The 5% that need a file

Only genuinely RFC-scale handoffs — a whole new area of API surface, a schema redesign,
something with diagrams or long worked examples. Then:

- the GitHub issue is still opened, labelled and assigned;
- the issue **points to** a document in `docs/handoffs/`;
- the document lives on the branch that produced it.

`docs/handoffs/` does not need creating now. It appears the first time it is genuinely needed,
which may be never. Git does not track empty folders anyway.

### Handoffs are deleted when they are done

**When the work is merged: close the issue, and delete the file if there was one.**

The issue stays searchable in GitHub forever at no cost, which is all the record anyone needs.
The file goes, and git history keeps it.

This repository is working code, not an archive of finished conversations. A folder of stale
handoffs describing an API that has since changed is worse than nothing, because someone will
eventually read one and believe it.

---

## 4.4 What goes in the handoff issue

Write it in the order Hassan reads it — what he has to decide, first.

```markdown
**Blocking:** yes / no — can the frontend continue without this?
**From:** #42

## What I need
One or two sentences. The most important part of this issue.

## Why
What the screen is trying to do, and why the current API cannot do it.

## What the frontend expects
Concrete. Field names, types, what happens when a value is missing or the list is
empty. If it is a request, what gets sent. An example payload helps.

## What is already built
Which files, and whether they work, are stubbed, or are commented out.

## What I think has to change
A guess, not an instruction. Files or areas that look relevant.

## Anything else worth knowing
Edge cases, decisions taken on the frontend that assume a particular answer.
```

Two notes.

**"What I think has to change" is deliberately a guess.** Technical design is Hassan's call.
The section exists so he does not start from a blank page, and it is fine for it to be wrong.
It must never read as though the frontend decided the backend design.

**"Blocking" matters more than it looks.** Blocked means Imran cannot continue at all. Not
blocked means the work goes on and this is a follow-up. Those schedule completely differently.

---

## 4.5 A feature that needs both sides: agree the shape first

> For an **RFC-sized** feature — weeks of work on each side at once — the full process is
> [document 7](07-big-features.md). This is the short version and the reasoning.

**The wrong way is to build the frontend against nothing.** A screen built with no backend has
to invent the data — field names, types, what a missing value looks like. Then either the
backend conforms to shapes it did not choose, or the frontend gets rewritten. That is the same
mechanism that made the v1 and v2 integrations a mess, just smaller.

**Dana is already built for the right way.** `app/src/shared/` holds zod schemas both sides
import, and the client checks every response against them at `app/src/client/api/http.ts:164`.
That folder *is* the contract, in a form the compiler checks.

1. **Agree the shape first**, as a type in `app/src/shared/`, plus a stub endpoint returning
   the right shape with the wrong data. An hour or two.
2. **Both sides build in parallel** against it.
3. **They meet, and the type checker proves they agree.** Integration is a compile, not a
   negotiation.

If Hassan is unavailable, Imran's agent may add the **read** schema itself and have it
confirmed at review — it cannot break the server, since nothing there imports it. Request
schemas are different, and question 1 above says why.

### Do not merge a screen whose backend does not exist

You would ship something that quietly does nothing, and nobody notices until a user finds it.
Label the issue `blocked` and leave the branch. Backend first, then the frontend rebases and
merges.

The exception is when the frontend genuinely degrades — the feature is hidden or shows an
empty state, and nothing is broken for someone who meets it. That is Hassan's call at review,
not the frontend agent's.

---

## 4.6 The other direction: backend to frontend

The reverse happens too, and it needs one rule so it does not get missed.

**When Hassan changes something the frontend depends on, or adds something it should now use,
he opens an issue labelled `handoff-to-frontend` and assigns it to Imran.**

Three cases, and only one is dangerous:

- **Additive** — a new field, a new endpoint. Nothing breaks. Open an issue when there is
  frontend work to do; otherwise say nothing.
- **Breaking, caught by the type checker.** A change to a shared type makes the frontend fail
  to compile. The good case: the problem announces itself. This is an argument for keeping the
  contract in `app/src/shared/` rather than in route handlers.
- **Breaking, caught by nothing.** A field that changes meaning, a value that starts arriving
  as `null`, an endpoint that gets stricter about what it accepts. Nothing fails to compile;
  the screen just misbehaves. **This is the one that needs the handoff issue**, because it is
  invisible from the frontend until a user hits it.

---

## 4.7 Reporting a problem you are not going to fix

Separate from handoffs: if either of you notices a problem outside your own area, **open an
issue; do not fix it.**

Worth saying why, because "I could fix this in two minutes" is a strong pull. The value of two
people is that each sees what the other misses, and that value is realised by *reporting*. It
is destroyed by fixing, because now the owner has to review an unplanned change to their own
area, possibly in files they are halfway through editing.

---

## 4.8 The whole boundary, on one page

```
 Frontend agent working on issue #42
              │
              ▼
   Does the work need anything
   outside app/src/client/ ?
              │
      ┌───────┴────────┐
     NO               YES
      │                │
      ▼                ▼
  Normal PR    Q1: migration, authorization, session/auth,
               request-schema field, CSP, or rate limiting?
                       │
              ┌────────┴─────────┐
             YES                 NO
              │                   │
              │                   ▼
              │        Q2: one sentence, ≤2 files,
              │        no new endpoint/table/shape change,
              │        and tested?
              │                   │
              │          ┌────────┴────────┐
              │         NO                YES
              │      (or unsure)           │
              ▼          ▼                 ▼
        ┌─────────────────────┐    Make the change.
        │ STOP. Hand off.     │    Say so in the PR.
        │ Open an issue,      │           │
        │ label handoff-to-*, │           ▼
        │ assign, link both   │    Hassan reviews
        │ ways. Everything    │    both halves
        │ in the body.        │
        └─────────────────────┘
                   │
                   ▼
        Hassan does the work, merges.
        Issue closed. Handoff deleted.
        #42 rebases and continues.
```

The most important box is **"or unsure"**. An agent that is unsure has already answered the
question.
