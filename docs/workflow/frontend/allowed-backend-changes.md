# Changing the backend from a frontend task

You are working on a frontend issue and you have found that the screen needs something the
server does not do yet. This file tells you what to do.

There are two questions. Ask them in order.

---

## Question 1: is it one of these six?

**If yes, stop and hand it off. It does not matter how small the change is.**

| Behaviour | Where | Why you must not judge this one |
| - | - | - |
| A database migration | `app/db/migrations/` (8 files) | Migrations are forward only. There is no rollback, and they run against production the moment the merge deploys. A wrong one is not fixed by reverting. |
| An authorization check | `accessOf(...)`, about 20 calls across 9 files in `app/src/server/` | Get one wrong and the API returns another person's data, or hides data that should show. Nothing goes red. |
| Session or sign-in handling | `app/src/server/auth/` | Everything downstream trusts it. A mistake looks exactly like the application working normally, for the wrong person. |
| A field on a **request** schema | `app/src/shared/` | There is no `.strict()` anywhere in that folder. An unhandled field is accepted and thrown away, and the API answers **200 OK**. Your screen looks correct and the feature does nothing. |
| The Content Security Policy | `app/src/server/index.ts:177` | It refuses things **silently**. This already cost months: every Google profile picture failed and looked identical to "no picture set". |
| Rate limiting | `app/src/server/index.ts`, `auth/router.ts`, `routes/bundle.ts`, `routes/connections.ts` | It is held in memory and assumes exactly one running server. Changes here fail only under load, in production. |

**What these six have in common is not that they are important. It is that you cannot tell
you got them wrong by looking.** The code compiles, the tests pass, the screen looks right,
and the damage is real. Everywhere else, a careful agent plus a human review catches the
mistake. Here, nothing does.

**This is not a ban on those files.** Add a comment, fix a typo, add a log line, tighten a
type: all fine. The rule is about changing what these things *do*.

---

## Question 2: otherwise, judge it

**Make the change yourself if all four are true:**

- you can describe it in one sentence;
- it touches at most two files outside `app/src/client/`;
- it adds no new endpoint, no new table or column, and does not change a response shape that
  other screens already use;
- you tested it, and **you can name the command you ran**.

**Hand it off if any of those is false, or if you are unsure.** Unsure is an answer. It is
not a state to be resolved by thinking harder about it.

That last criterion is deliberate. "Tested" is a word that gets written after watching the
code compile. A named command is a claim someone can check.

---

## The one thing you may add to `app/src/shared/` on your own

**A new read schema, for a shape the server already sends.**

You may do this without opening an issue first. Nothing on the server imports these, so it
cannot break the backend, and if you get it wrong it fails loudly on one screen.

**A request schema is the opposite and is question 1 above.** Adding a field the server does
not read gets you a 200 and a silently dropped value. A request-schema change ships with the
backend change that reads it, always.

---

## When you stop, hand off properly

1. Open an issue with the **Handoff to backend** template. It sets the label and the
   assignee for you.
2. Put everything in the body. Field names, types, what happens when a value is missing or
   the list is empty, an example payload. There is no length limit.
3. Say whether you are **blocked** or can continue without it. Those schedule very
   differently.
4. Link both ways: name your issue in the handoff, and comment on your issue naming the
   handoff.
5. If you are blocked, label your issue `blocked` and leave the branch.

Guess at what has to change on the backend if you can. Mark it as a guess. It is fine for it
to be wrong, and it saves Hassan starting from a blank page.

---

## When you do make a backend change

**Say so in the pull request, in the section that asks.** Name each file and give one line
on why.

Nothing else in this project catches an undeclared backend change. `CODEOWNERS` requests a
review but cannot force one on the current GitHub plan, so the only thing standing between
your change and production is Hassan reading the diff. Do not make him find it.

---

## Why the rule is shaped like this

An agent that has spent twenty minutes building a screen and needs one endpoint to finish it
will find writing that endpoint reasonable. It will be right nine times out of ten. The
tenth time it edits an authorization check.

The six above are where the tenth time is unrecoverable. Everything else is where a review
works. That is the whole design.
