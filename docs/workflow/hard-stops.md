# Hard stops

**Eight things stop everyone, whatever the change looks like from where you are standing.**
Each has a rule beside it. Meet the rule and carry on; there is no permission to ask for and
nobody to hand the work to. What you may not do is meet none of them and merge anyway.

**Everything else: decide, do it, and say what you decided in the pull request.** The
boundary in this project follows what the tests enforce, not who can read what, and the tests
enforce a great deal now: the structural sweeps, the boundary lint rules, the type checker
across `app/src/shared/`, and the browser leg. This page is the short list of places where
they enforce nothing, or where being wrong cannot be taken back.

**Read it before you start, and again when the work turns.** Most work touches none of these,
and finding that out costs a minute.

---

## The eight

| What you are about to do | The rule that releases it |
| - | - |
| **A database migration** — a new file under `app/db/migrations/`, or an edit to one | Assign the number **and** the `when` in `meta/_journal.json` before you write it, and check them against every other branch open at the same time. Run **both** legs. Name every constraint and index. Say in the pull request that you did, and whether the number was assigned or you took it unassigned. |
| **A change to spec section 4 or 7** | Those two are frozen. Get a **ruling comment on the issue before the code**: a product ruling is Imran's, a technical ruling is Hassan's. The pull request quotes it or links to it. A criterion that *transcribes* the frozen text — `ac-001`'s `SECTION_4_TABLES`, the exact-key lists — moves with the code and ahead of the ruling; see below. |
| **A field on a request schema** in `app/src/shared/` | The field, **the server code that reads it**, and **an acceptance criterion that proves the value arrives**, all in the same change. |
| **A source in the Content Security Policy** — `securityHeaders` in `app/src/server/index.ts` | Name the source and what it is for in the pull request, and check it in a real browser rather than in a test. |
| **A new route that takes an id** | Write the `accessOf(...)` gate, and write the route's row in `app/tests/criteria/ac-397-authorization-sweep.test.ts` saying what a stranger gets. Both, in the same change. |
| **Renaming a `localStorage` or `sessionStorage` key** | Never. There is no rule that releases this one. |
| **Deleting or weakening an acceptance criterion** | A criterion changes only when **the decision it pins** changes. The pull request names the criterion, says which decision moved, and links the issue where that was decided. |
| **A value in `app/src/client/styles/tokens.css`, or anything in `app/src/client/parts/presenters.ts`** | Declare it in the pull request, file and line, with what it looked like before and after. No acceptance criterion sees either. |

---

## Why each one is on the list

**A migration is forward only.** There is no down migration, and a migration runs against
production the moment the merge deploys. Recovery is a fix-forward migration or a restore, so
a wrong one is not undone by reverting the pull request. Two numbers collide silently and in
different ways: two branches each adding `0016_` — the next free prefix as of 2026-09-04, the
tree holding `0000_` to `0015_` — merge cleanly and leave one prefix on two
files, and the drizzle migrator applies a file only when its journal `when` is greater than
the last applied one, so a migration that deploys with a **higher** `when` than a sibling
makes that sibling be skipped with no error and no columns. `CLAUDE.md` carries the reading
of the installed migrator that proves it. Destructive changes split across two releases:
expand, then contract.

**Sections 4 and 7 are frozen**, which means the contract stopped moving on purpose and not
that it is perfect. A frozen section changes by a person's ruling on the issue, before any
code exists, because the code is the expensive way to discover that the ruling would have
gone the other way. Product rulings are Imran's and technical rulings are Hassan's; that
split is settled and neither the work nor the review reopens it.

**One thing in the suite necessarily moves ahead of that ruling, and it is not a breach of
this stop** (added 2026-09-20, issue #240). A handful of criteria hold **transcriptions** of a
frozen section: `SECTION_4_TABLES` in `app/tests/criteria/ac-001-constraint-catalog.test.ts`
is section 4's table list, and `expectExactKeys` lists in `app/tests/support/` are section
7's response shapes. They are exact in both directions, so **a tree carrying the code without
the transcription edit cannot be green at all** — and this stop says the ruling comes before
the code. Both rules are right on their own and they point opposite ways.

The order that works: write the code and the transcription edit, get the suite green, take
the ruling, then amend the frozen section. Put a paragraph beside the transcription saying it
has moved ahead of the ruling and that the ruling is the authoritative restatement — if the
ruling comes back with a different shape, the transcription follows it. #224 ran in that
order on 2026-09-20 and `tasks-harness.ts` carries the paragraph as an example.

Nothing about this stop weakens. The ruling is still required, it is still a person's, and
the pull request still quotes it. What moves first is a list that *describes* the frozen
text, never the frozen text itself, and the pull request is where the two are reconciled.

**A request-schema field the server does not read is accepted, dropped, and answered 200.**
Two ways to lose one, and neither leaves anything on the wire. A field the schema does not
declare is stripped by `z.object` — there is no `.strict()` in `app/src/shared/` and
deliberately will not be, spec 11.14 carrying the ruling. And a field the schema *does*
declare that no route acts on is dropped just as quietly; that is the one that has actually
cost this project, a reminder field in `app/src/shared/tasks.ts` lost for four packages while
being declared the whole time. Strictness would not have caught it and no unknown-key check
would either. Only a criterion does, which is what AC-149 is.

**The Content Security Policy refuses things silently.** A new image or script source that is
not listed does not error, does not log, and looks exactly like a missing image. This cost
this project months on Google profile pictures, where every one failed and was
indistinguishable from "no picture set". A test can assert that a directive contains a
string; it cannot tell you the browser was happy.

**There is no authorization chokepoint**, whatever spec 10.2 says, and there cannot be one:
what counts as authorized depends on what is being asked for. What exists is hand-written
`accessOf(...)` gates and two structural sweeps. `ac-236` fails a mutating route with no
session or CSRF check, and any GET that answers something other than 401 without one.
`ac-397` drives every route whose **path** carries a parameter as a signed-in stranger, and
asserts its expected-status table in both directions, so a route with no row fails and a row
naming a deleted route fails too. **Neither writes the gate for you**, and `ac-397` is
path-only: an id you take from the query string or the body is invisible to it, and
`GET /events?folder=` is the standing example.

**A renamed storage key is the only genuinely irreversible thing in the client.** The rename
silently resets that preference for every existing person using Dana, and no later deploy can
reach the orphaned value. There is no migration for it and no way to read it back.

**A criterion is a decision written down where it cannot drift.** Deleting one or loosening
its assertion makes the suite agree with the code, which is the one thing a suite must not do
on request; that is the same rule as never editing a test to make your code pass, said for
the case where the edit looks reasonable. **The legitimate case is real and is why this is a
rule rather than a ban**: when the decision a criterion pins actually changes, the criterion
moves in the same pull request as the change, and the pull request says which decision moved.
A criterion that moved with no such sentence is indistinguishable from one that was in the
way.

**No acceptance criterion reads `tokens.css` or `presenters.ts`, and what does read them
reads less than it looks.** Every colour, size, spacing and radius in the product is in the
first, and `components/ui/foundation.test.ts` asserts that **two strings** are present in it
and nothing at all about whether any value is right, so a wrong hex passes the whole suite.
The second turns data into the words on screen; `parts/presenters.test.ts` is 782 lines and
its own header says why it had to be written — the criteria assert that a due badge *exists*
and never what it *says*, so every one of them would still pass if the date came out wrong.
That test pins what somebody thought to pin, which is not the same as the file being watched:
it has already shipped a real bug, commit `359d28d`, where `personDisplay` dropped
`avatar_url` across nine surfaces and a person found it by looking at the product. Neither
file is banned. Both are declared, because the pull request is the reader that would have
caught that one.

---

## What is not a hard stop

**Everything else, including all of these**, which used to stop one side or the other:

- editing a test, an acceptance criterion or a browser spec that your change makes wrong,
  under the rule above;
- editing the specification section your change makes wrong, sections 4 and 7 excepted;
- an endpoint, a table, a column, a response shape, a component, a screen;
- `app/src/client/api/http.ts` and `queryClient.ts`, where a lint rule and a criterion now
  watch the two things that used to be watched by a sentence;
- session handling and rate limiting, which are ordinary changes read by the reviewer agent
  and by whoever merges.

The last two came off the list on 2026-09-04 with issue #180. Nothing about them got safer;
what changed is that a list long enough to cover everything dangerous is a list nobody reads
before starting, and the two structural sweeps, the boundary lint rules and the local gate
now stand where the list used to.

**"I am not sure" is not a reason to stop any more.** It is a reason to read the file, run
the gate, and say in the pull request what you were unsure about. Whoever merges reads that
sentence first.

**And a gate that could not run all six steps is not a green one.** `npm run gate` says
`GATE: incomplete` rather than green when a step of 11.11's six did not run — the usual
reason being a machine with no `TEST_DATABASE_URL` — and a pull request needs green. That is
a one-time setup rather than a hard stop: spec 11.10 carries the `CREATE DATABASE` statement,
and once it is run the leg runs with everything else.

---

## When one side's work needs the other side

Invoke the other side's agent — `frontend` or `backend` — with the exact need, on the same
branch, and integrate its commit. That is not an escalation and it does not need an issue.

**An issue exists when a person must decide something**, and only then: a product decision is
Imran's, a technical one is Hassan's. Use the `Decision needed` template, say what must be
decided and what you will do in each case, and carry on with whatever does not depend on the
answer. A file belonging to someone else is not a reason to open one, because no file does.

---

## Staging, because the index is shared

**Stage with explicit pathspecs. Never `git add -A`, never `git add .`, never
`git commit -a`.** A checkout has one working tree and one index, and two sessions in it share
both, so a sweeping `add` takes whatever the other session had half-finished and puts it in
your commit. Nothing announces that: the commit succeeds, the diff looks like yours plus
something, and the work it swept up is now attributed to your pull request.

**A sub-agent invoked on the same branch commits only the files it touched, and names every
one of them in its report.** Whoever invoked it reads that list against `git show --stat`.
Where the two disagree, the extra files came from somewhere else and belong to somebody
else's work — put them back before anything else happens.

This is the one item on this page that is not about the product. It is here because it is the
only place every agent is told to read before it starts.
