# 7. Building a big feature on both sides at once

**Status:** proposal. This becomes `docs/workflow/big-features.md` at implementation time.

---

## 7.0 When this applies — and when it does not

**This is a rare document. Most work never touches it.**

| The work is… | Use |
| --- | --- |
| A fix, a small change, a normal feature | The [ordinary workflow](03-the-workflow.md). Nothing here applies. |
| Frontend work that turns out to need a bit of backend | The [handoff](04-crossing-the-boundary.md) — a GitHub issue. Still nothing here. |
| **An RFC-sized feature — weeks of backend work and weeks of frontend work, at the same time** | **This document.** |

If you are reading this and there is no RFC, you are almost certainly in the wrong document.

**One file, two roles.** The sequence below is written once, with each side's part marked,
rather than copied into `frontend/` and `backend/`. A handshake described in two places will
eventually be described two different ways — and on this particular protocol a disagreement
between the copies is a silent bug, not a confusing sentence. Both side READMEs link here.

---

## 7.1 The idea in one paragraph

Two people build the same feature at the same time without waiting for each other, and
without inventing the same thing twice. They can do that because **the shape of the data is
agreed and written down before either of them starts**, in a form the compiler checks. When
they are finished, there is no integration step — the two halves already fit, because they
were built against the same contract.

**The test of whether this worked: at the end, nothing has to be connected.** If there is a
"now let's hook the frontend up to the backend" phase, the contract was not real, and you
have rebuilt the v1 and v2 prototype problem inside the repo.

---

## 7.2 The sequence

### Step 1 — The RFC settles the contract *(Hassan)*

Discussion becomes an issue, the issue becomes an RFC, as normal.

The thing that makes this workflow possible is what the RFC contains. It is not enough for it
to describe the feature. **It must settle the contract:** which endpoints exist, their URLs
and methods, the shape of what goes in and comes out, what the errors are, and what a
permitted request looks like.

If the RFC is vague about the data, everything downstream fails, because both people will
fill the vagueness in privately and differently.

### Step 2 — Schemas *and a stub endpoint* land on `main` *(Hassan)*

Write the zod schemas in `app/src/shared/`. Then — and this is the part most people skip —
**ship a working endpoint behind them**, returning hardcoded or empty data that satisfies the
schema.

Real URL. Real method. Behind the real auth chokepoint. Wrong data, right shape.

This is usually an hour or two, and it is what makes the difference between contract-first
working and not:

- A schema alone gives Imran types but nothing to render, so he builds fixtures — and now he
  is developing against a fiction of his own making, which is the small version of the
  problem this whole workflow exists to prevent.
- A stub endpoint means he develops against the **actual API**: real URLs, real auth, real
  error paths, real CSRF. Wiring problems surface on day one instead of at the end.

Merge this to `main` as one small pull request. It is invisible to users — nothing calls it
yet — so it is safe to ship even though `main` deploys.

### Step 3 — Tell Imran to start *(Hassan → Imran)*

A comment on the issue is enough. It should say: the endpoint, the schema file, and anything
in the RFC that changed while you were writing it.

### Step 4 — Both sides build, in parallel *(both)*

**Imran** branches from `main` and builds the screen against the stubbed endpoint. He is
working against real types and a real server. The data is wrong; nothing else is.

**Hassan** branches from `main` and replaces the stub with the real implementation — queries,
permissions, edge cases.

Neither waits for the other. Neither is guessing.

### Step 5 — Merge in slices, not in one lump *(both)*

A month of work does not arrive as one pull request. It arrives as a series of small ones,
each individually harmless:

1. Schema + stub endpoint — nothing calls it, invisible.
2. The real implementation — still nothing calls it, still invisible.
3. Further backend and frontend pieces as they finish.
4. **The screen, last.** This is the moment the feature becomes visible to a user.

This is what lets a long feature exist without a long-lived branch and without a shared
branch. Each piece is reviewed on its own, while it is small enough to review properly.

If a screen genuinely cannot be split, land it on a route that is not linked from the sidebar
yet. Same effect, and no feature-flag machinery to build.

### Step 6 — There is no step 6

The feature is done when the last slice merges. Nothing is connected, because nothing was
ever apart.

---

## 7.3 Imran's part, specifically

**What you can rely on.** The schema in `app/src/shared/` is the truth. If your screen and
that file disagree, your screen is wrong.

**Stub or real?** Assume the endpoint is stubbed until told otherwise. Do not build anything
that depends on the *values* being right — counts, ordering, totals — before Hassan says the
real implementation has landed. Build against the shape.

**What you may add to `app/src/shared/` — and this is narrower than it sounds:**

| | Allowed? | Why |
| --- | --- | --- |
| A new **read** schema, for a shape the server already sends | **Yes**, no issue needed | Nothing on the server imports it. If you get it wrong it fails loudly, on one screen. |
| Adding a field to a **request** schema | **No — never alone** | One of the six always-stop behaviours. See the warning below. |

> **The one trap that will cost you a week if you hit it.**
>
> There is not a single `.strict()` call anywhere in `app/src/shared/`. An unknown field in a
> request body is **accepted and silently ignored**.
>
> So if you add a field to a request schema and the backend does not yet read it, the API
> answers **200 OK** and drops it. Your screen looks like it works. Hassan's server looks
> like it works. Nothing fails, nothing logs, no test goes red.
>
> The codebase documents this in its own words at `app/src/shared/tasks.ts`: *"A route that
> parses one of them and does not act on the field answers its ordinary success with the
> field dropped… AC-149 exists because that failure was invisible for four packages."*
>
> **A request-schema change ships with the backend change that reads it. Always.** If you
> need one, that is a handoff, not a solo edit.

**When the contract turns out wrong.** It will happen sometimes — you will find the agreed
shape does not work for the interface. That is normal, not a failure. Say so on the issue, open
a `handoff-to-backend` issue if it is substantial, and stop building on the assumption. The
type checker will tell both of you exactly what has to change.

---

## 7.4 Hassan's part, specifically

**The stub is not optional.** It is tempting to write the schemas, tell Imran the shape, and
get on with the real implementation. Do not. The hour spent on a stub endpoint is what stops
him building against mocks, and mocks are how the shapes quietly diverge.

**Say when the stub becomes real.** Imran cannot tell by looking. One comment on the issue.
Until he hears it, he is right to distrust every value the API returns.

**Do not change the contract quietly.** Once he is building, `app/src/shared/` is a shared
surface. If the shape has to change, say so on the issue before you push it — his work
against the old shape may be substantial, and the compiler will only tell him after he has
already written it.

**Review his slices as they come**, rather than saving them up. The whole point of merging in
slices is that each one is small enough to actually read.

---

## 7.5 What good looks like

- The RFC names every endpoint and shape before anyone writes a line of implementation.
- A stub endpoint is on `main` within a day or two of the RFC being accepted.
- Neither person is ever blocked waiting for the other.
- Pull requests arrive steadily and small, not in one lump at the end.
- **The last merge is the screen, and it just works.**

If instead you reach the end and spend two days "connecting things," something in steps 1 or 2
was skipped — almost always the contract was agreed loosely, or the stub was never built.
