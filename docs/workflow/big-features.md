# Building a big feature on both sides at once

**This is a rare document. Most work never touches it.**

| The work is | Use |
| - | - |
| A fix, a small change, a normal feature | [`how-we-work.md`](how-we-work.md). Nothing here applies. |
| Screen work that needs a bit of server | Do it, or invoke the `backend` agent on the same branch. Still nothing here. |
| **An RFC-sized feature, weeks of work on each side at the same time** | **This document.** |

If there is no RFC, you are in the wrong file.

## The idea

Both sides build at once, without waiting for each other and without inventing the same
thing twice. That works because **the shape of the data is agreed and written down before
either side starts**, in a form the compiler checks.

**The test of whether it worked: at the end, nothing has to be connected.** If there is a
"now let us hook the frontend up to the backend" phase, the contract was not real, and you
have rebuilt the problem that made the v1 and v2 integrations a mess.

## The sequence

### 1. The RFC settles the contract (Hassan)

Not just what the feature does. **Which endpoints exist, their URLs and methods, the shape
of what goes in and comes out, the errors, and what a valid request looks like.**

If the RFC is vague about the data, both people fill the vagueness in privately and
differently, and everything downstream fails.

### 2. A milestone, and the work broken into issues (Hassan)

Create a **GitHub milestone named for the RFC**, and set the RFC's status to
`accepted -> Milestone #N`.

Then break the work into issues, all of them in that milestone. Each is an ordinary
issue and goes through the ordinary flow: branch, pull request, review, merge. The
slices in step 5 below are those issues.

**The milestone is the only record of progress.** The RFC says why and what, and never
says how far along, because two places tracking one thing is how a document starts
lying. The milestone updates itself; a status line in a file does not.

Give the milestone a **due date** if the work has one. A date on a milestone is visible
on the issues page every day. A date in the body of a long document is not, which is how
a hard-dated hosting deadline sat unread at line 360 of a 369-line RFC until eleven days
before it expired.

### 3. Schemas *and a stub endpoint* land on `main` (Hassan)

Write the zod schemas in `app/src/shared/`. Then ship a working endpoint behind them that
returns hardcoded or empty data of the right shape. Real URL, real method, behind the real
auth. Wrong data, right shape. An hour or two.

**Do not skip the stub.** A schema alone gives Imran types but nothing to render, so he
builds fixtures, and now he is developing against a fiction of his own making. A stub means
he develops against the real API: real URLs, real auth, real CSRF, real error paths. Wiring
problems surface on day one instead of at the end.

Merge it as one small pull request. Nothing calls it yet, so it is invisible to users and
safe to ship even though `main` deploys.

### 4. Tell Imran to start (Hassan)

A comment on the issue. Name the endpoint, the schema file, and anything in the RFC that
changed while you were writing it.

### 5. Both sides build, in parallel

**Imran** branches from `main` and builds the screen against the stubbed endpoint. Real
types, real server, wrong data.

**Hassan** branches from `main` and replaces the stub with the real implementation.

Neither waits. Neither guesses.

### 6. Merge in slices, not one lump

A month of work does not arrive as one pull request. It arrives as several, each harmless on
its own:

1. Schema and stub endpoint. Nothing calls it.
2. The real implementation. Still nothing calls it.
3. Further pieces as they finish.
4. **The screen, last.** This is when the feature becomes visible.

This is what lets a long feature exist without a long-lived branch and without both people
on one branch. Each piece is reviewed while it is still small enough to review properly.

If a screen genuinely cannot be split, land it on a route that is not linked from the
sidebar yet. Same effect, no feature-flag machinery.

### 7. There is no step 7

The feature is done when the last slice merges, and the milestone says so without anyone
writing it down. Nothing is connected, because nothing was ever apart.

## Imran's part

**The schema in `app/src/shared/` is the truth.** If your screen and that file disagree,
your screen is wrong.

**Assume the endpoint is stubbed until told otherwise.** Do not build anything that depends
on the *values* being right, such as counts, ordering or totals, before Hassan says the real
implementation has landed. Build against the shape.

**A read schema is free. A request field is a hard stop.** A read schema cannot break the
server and fails loudly on one screen if it is wrong. A request field nothing on the server
reads is accepted and dropped, and the API answers 200: your screen looks correct and the
feature does nothing. So the field, the code that reads it and the criterion that proves it
land together, which [`hard-stops.md`](hard-stops.md) says in full.

**When the contract turns out wrong**, and sometimes it will, say so on the issue and stop
building on the assumption. That is a normal event, not a failure, and the type checker will
tell both of you what has to change.

## Hassan's part

**The stub is not optional.** It is tempting to write the schemas, describe the shape, and
get on with the real implementation. That hour is what stops Imran building against mocks,
and mocks are how the two shapes quietly diverge.

**Say when the stub becomes real.** He cannot tell by looking, and until he hears it he is
right to distrust every value the API returns.

**Do not change the contract quietly.** Once he is building, `app/src/shared/` is a surface
two branches are reading at once. If the shape has to change, say so on the issue before you
push it. His work against the old shape may be substantial, and the compiler will only tell
him after he has written it.

**Review his slices as they arrive**, not in a batch at the end. That is the entire point of
slicing.

## What good looks like

- The RFC names every endpoint and shape before anyone writes an implementation.
- A stub endpoint is on `main` within a day or two of the RFC being accepted.
- Neither person is ever blocked waiting for the other.
- Pull requests arrive steadily and small.
- **The last merge is the screen, and it just works.**

If instead you reach the end and spend two days connecting things, step 1 or step 2 was
skipped: the contract was agreed loosely, or the stub was never built.
