# Working on the backend

**One issue, one fresh chat.** Read this before you start. It is everything you need to begin
a task on the system rather than on a screen.

## Where this starts

Everything except `app/src/client/`. In practice:

| Path | What it is |
| - | - |
| `app/src/server/` | The API and everything behind it |
| `app/src/shared/` | The contract both sides import. See below, it is the delicate one |
| `app/db/` | Migrations, the seed, the constraint catalog |
| `app/tests/` | The acceptance suite and the browser tests |
| `.github/`, `docs/`, root config | Infrastructure and documentation |

**A starting point and not a fence.** The same task may end in a component, and a screen
change may end in a migration; change what the issue needs and change all of it.
[`frontend.md`](frontend.md) is the map of the other half.

## The rules that are never broken

1. **Every change starts from a GitHub issue**, and one issue is one fresh chat. This
   includes your own work.
2. **Read [`hard-stops.md`](hard-stops.md) before you start.** Most of the eight live
   on this side. Everything else: decide, do it, and say what you decided.
3. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
   A criterion changes only when the decision it pins changes, and the pull request names it.
4. **Say you are blocked rather than saying you are done.** A false green is the worst
   available failure, because everything after it is built on top.
5. **Run `npm run gate`, then run the `reviewer` agent.** The pull request exists only after
   both, green on the head commit, and it carries the record. The reviewer is the second
   reader on every branch, including the one you are on.
6. **When the workflow itself is wrong, fix it or open an issue labelled `documentation`.**
   Fixing it in the pull request that hit the problem is usually right. What is not an option
   is working around it in silence and leaving the next person to pay the same tax. Shared
   rule 12.

## Starting a task

A fresh chat per issue. Read the issue, check for open pull requests on the same files,
branch from `main` as `backend/<issue>-<short-description>` — CI checks that shape,
`^(frontend|backend|chore)/[0-9]+-[a-z0-9-]+$` — read
[`hard-stops.md`](hard-stops.md), and read `CLAUDE.md` for the commands and this
machine's failure modes.

## The server, folder by folder

**Every count below is `find app/src/server/<folder> -type f | wc -l`, measured 2026-09-04,
and it counts the tests that live beside the code.** Re-measure rather than trusting the
number; the previous table was measured without them and read about half of this.

| Folder | Files | What it is |
| - | - | - |
| `domain/` | 23 | The rules. Business logic and the database work behind it. |
| `routes/` | 23 | HTTP handlers. **They make no decisions**; they parse, call domain, map the result to a status. |
| `time/` | 20 | Timezones, recurrence, DST. Luxon lives here. |
| `auth/` | 19 | Sign-in, sessions, provisioning. `auth/router.ts` attaches the session for every `/api/v1` request. |
| `http/` | 12 | The request and response plumbing: `parse-body.ts`, the error envelope, and ten contract tests over the wire shapes. |
| `views/` | 11 | The read path for saved and native views. |
| `observability/` | 7 | Logging, error tracking, and the database fallback. |
| `security/` | 6 | Rate limiting, the security log, the CSP report endpoint. |
| `notify/` | 5 | Email: the four 11.8 templates and the Resend transport. |
| `scheduler/` | 5 | The in-process 60 second reminder tick. |
| `sample/` | 2 | The sample workspace a new account is offered. |
| `files/` | 1 | `store.ts`, the upload store. |

`index.ts` and `database.ts` sit at the root of `app/src/server/` and are in none of those.

`app/db/` holds `client.ts` (the one seam that chooses PGlite or Postgres), `migrate.ts`,
`seed.ts`, `verify.ts` and `constraint-catalog.ts`.

## Things that are true and not obvious

**The heading used to say "Five" and the section had long outgrown it** before this branch
added to it again, so it now says neither a number nor a promise to keep one in step. The
count is deliberately not restated here: a number in a heading is a thing every later edit
has to remember, no test can see it, and this sentence naming one would be the same
mistake one line further down. Count them if you need the figure.

**There is no authorization chokepoint, despite what spec 10.2 says.** There cannot be one,
because what counts as authorized depends on what is being asked for. What exists instead is
two good things: the membership check is written **inside the `FROM` clause**, so a query
that forgets it returns nothing rather than someone else's rows; and there are hand-written
`accessOf(...)` gates — 22 call sites across 12 files outside the tests, measured 2026-09-04
with `grep -rn "accessOf(" app/src/server --include="*.ts"`; the sentence this replaces read
"about 20 across 9 files". **When you add a route, the gate is your job.** Nothing adds it
for you.

**What is structurally checked, since 2026-09-04 and issue #74**, is that no id-bearing route
is left ungated *silently*. `app/tests/criteria/ac-397-authorization-sweep.test.ts` walks the mounted
router, takes every route whose path carries a parameter, and drives each as a signed-in
person with no relationship to the row that id names. It pins the count, and it asserts its
hand-written expected-status table against the enumeration in both directions — so **a route
you add with no row in that table fails the sweep**, and a row naming a route you deleted
fails it too. What is still entirely yours: **writing the gate**, and **writing the row that
says what a stranger gets**. The sweep cannot tell that you thought about either, only that
you did both. It is also **path-only** — an id you take from the query string or the body is
invisible to it, and `GET /events?folder=` is the existing example — and one level deep, so a
router mounted inside another router would leave it proving less than it says while staying
green. **It found one defect on its first run**, fixed the same day: `DELETE /api/v1/files/:id`
answered 404 where 10.2 wants 403, to a member who reads the same file at 200 (AC-398, and
7.15's dated amendment).

**The structural guard covers authentication, on every method. Authorization is a second
guard's, and it landed the same day — the paragraph above.**
`app/tests/criteria/ac-236-structural-guard-sweep.test.ts` walks the mounted router and fails any
mutating route missing a session or CSRF check, and since issue #33 any GET that answers
something other than 401 without a session. Three reads are exempt by name — the health
probe and the two OAuth legs — and since issue #99 two mutations are: the development
login, and `POST /api/csp-report`, which a browser sends of its own accord with no cookie
and no CSRF header for this application to require. Each of the five carries its reason
in the test beside it. A read exemption is asserted in both directions, so one that stops
being true fails; the mutating half cannot be, the development login being absent from
that harness entirely, and what holds it honest instead is the route count and the reason
a reviewer reads. **It checks authentication and not authorization**, which until
2026-09-04 nothing checked: a GET that took a session and then read whatever id it was
handed passed the entire suite. `ac-397` is now the other half, and it is the same shape —
one walk, one pinned count, one allowlist asserted both ways. The `accessOf(...)` gate is
still yours to write; what has changed is that forgetting it on an id-bearing route now
fails something.

**Route mount order is load-bearing and undocumented.** In `app/src/server/routes/bundle.ts`,
`/views/:id` would shadow six page endpoints if anyone reordered it. Do not reorder mounts
casually.

**An import cycle in `app/src/shared/` or `app/src/server/domain/` fails as broken code, in a
file that has nothing to do with it.** Added 2026-09-20 from issue #230, which closed two of
them in one branch. Node evaluates a cycle in whatever order the **entry point** reaches it,
so the binding is initialized for most importers and `undefined` for whichever one enters the
cycle first — and the error is thrown wherever that `undefined` is finally *used*, which is
not where the cycle is. Both of #230's read as ordinary bugs:

- `TypeError: Cannot read properties of undefined (reading 'optional')`, pointing at a
  perfectly ordinary `.optional()` in `shared/folders.ts`, three modules from anything to do
  with the rich-text primitive that was actually cycling;
- `TypeError: documentHash is not a function` **in exactly one file of the whole suite**,
  pointing four modules away at a function every other file was calling successfully.

The second is the expensive one, because a function that works everywhere but here reads as
a test-environment problem rather than as an import graph. **The tell is that the named
symbol is fine when you look at it**; if a symbol is `undefined` at module scope and its
definition is obviously correct, follow the imports rather than the symbol.

Both are answered the same way: move the shared leaf into a module that imports nothing but
its own dependency, and re-export it from where it used to live so no call site changes.
`app/src/shared/rich-content.ts` and `app/src/server/domain/document-hash.ts` are the two,
and each opens with a sentence saying it exists to break a cycle and naming the symptom —
which is the cheap part, and the part that stops the next person paying for it.

**The reason it bites this directory in particular** is that `shared/` and `domain/` are both
webs rather than trees: `folders` reaches `responsibility` reaches `page-document` reaches
`tasks` reaches `folders` is four ordinary, individually reasonable imports. A new module
that both imports from and is imported by that web is the shape to watch for.

**Migrations are forward only.** No down migration exists, and a migration runs against
production the moment the merge deploys. Recovery is a fix-forward migration or a restore.
Destructive changes split across two releases: expand, then contract. Every constraint and
index is explicitly named, because AC-001 asserts them by name, and
`app/db/migrations/meta/_journal.json` must gain a matching entry whose `when` is strictly
greater than every existing one — the drizzle migrator reads that value and not the
filename.

**Two numbers to pick, and the second has a rule the first did not (added 2026-09-03 from
issue #65).** Acceptance criteria are numbered by `docs/spec/12-acceptance-criteria/README.md`,
which tells you to take from the tail rather than from a gap when several branches are open,
because two branches both picking "the next free gap" collide silently. **Nothing said the
same thing about migration numbers, and they collide the same way**: two branches each
adding `0011_` merge cleanly, leave two files with one prefix and two journal entries with
one `idx`, and the fault does not appear until the migrator runs. So: **when you are one of
several branches open at once, have your number assigned by whoever opened them, and if
nobody did, take the next free one and say in your pull request that you took it
unassigned.** A collision is trivial to fix before a merge and is a production incident
after one.

**Seven counts in the suite are fixtures over the implementation, and moving them is not
breaking rule 3 (added 2026-09-04 from issues #116 and #128; corrected from two to six on
2026-09-20, issue #240, and to seven the same day by issue #263).** Rule 3 says never edit a test to make your code pass, and it is
the right rule; these are the exception it needs stated, because otherwise the honest reading
is to stop — and three of the six spent a month in exactly that position, named by no
document, while a session that added a route and watched one go red had been told in effect
that it must not touch it.

**The rule, rather than the examples.** A count is movable when three things hold together:

1. it describes the **shape of the server** rather than a behaviour anybody asked for;
2. it **says so beside itself**, in its own file, with the instruction for moving it;
3. the sweep it belongs to **passed on your new code** — so the count was the only thing that
   failed.

The third is the whole safeguard. If the sweep itself failed, the number is telling you
something and moving it is precisely the thing rule 3 forbids.

Seven lines across five files meet all three today:

| File | What it counts |
| - | - |
| `app/tests/criteria/ac-236-structural-guard-sweep.test.ts` | **mutating** routes the walker found |
| `app/tests/criteria/ac-236-structural-guard-sweep.test.ts` | **reading** routes (added by issue #33) |
| `app/tests/criteria/ac-397-authorization-sweep.test.ts` | routes carrying a **path parameter** |
| `app/tests/criteria/ac-399-body-parsing-goes-through-parse-body.test.ts` | `parseBody` **call sites** |
| `app/tests/criteria/ac-399-body-parsing-goes-through-parse-body.test.ts` | **modules** that read a request body |
| `app/src/server/scheduler/interval.test.ts` | statements the 11.7 pass runs **after its delivery transaction** |
| `app/tests/guards/guard-reclaim-reference-arms.test.ts` | **foreign keys into `files(id)`**, each an arm of the reclaim sweep (issue #263) |

Three of them carry a further condition that is theirs alone, and the third is the reclaim
list in the paragraph below. `ac-236`'s mutating count moves only once the sweep passed on
your new route — 401 bare, 403 without CSRF. And `interval.test.ts`'s comment **enumerates
which statements they are**: keep that enumeration in step or the next person cannot tell a
legitimate move from a lost duty.

**The seventh is the strictest, and it is the one a migration will hit.** A new foreign key
into `files(id)` fails `guard-reclaim-reference-arms` by design. Add the matching
`NOT EXISTS` to `fileIsUnreferenced()` in `app/src/server/domain/files.ts`, write the
criterion on the AC-700 to AC-705 pattern that proves a picture held through the new column
survives the 11.7 pass past thirty days, and then move the list.

**Moving the list first does not make that guard green, and the sentence here that said it
did was half wrong** (corrected 2026-09-20 by the adversarial review of #263). It read
"doing step 4 on its own makes this file green and leaves the 11.7 tick deleting a picture
somebody is looking at". For a new **table** that was never true — the guard's second test
went red naming the relation. For a second key on a table it already lists, such as a
`banner_file_id` beside `shelves.cover_file_id`, it was true, because that test matched on
the relation name alone; it now ties each relation to the alias the predicate gives it and
looks for that alias's own column, so both cases are red. The old list's step 3, "watch the
second test pass on the new arm", is gone for the same review's other reason: that test
iterates the list, which does not hold the new arm until the step after it, so it passed
vacuously.

**What no guard sees, and what does.** Writing the criterion is on you; nothing structural
can tell that you did. And a reference that is **not a foreign key** is invisible to that
guard entirely, because it reads `pg_constraint` — `users.avatar_url` is a `text` URL, so
every avatar in the product is unreferenced as far as the sweep's own query is concerned,
and what spares it is the sweep's `kind IN ('cover', 'image')` clause. **AC-705 is what
holds that line**, and it is the criterion to read before editing the sweep's scope rather
than its arms.

**When two branches both move one of these, the resolution is the sum and it is neither
side.** This is not arithmetic you do on two diffs — run the sweep on the merged tree and
read the number it reports. Two sides agreeing on a number is not the same as the number
being right, because each counted its own routes against a base that did not hold the
other's: on 2026-09-20 issues #223, #224 and #226 all independently read 40 reading routes,
and 41 was correct. Every one of the seven carries a worked example of this in its own
comment.

Move the number **and** its comment in the same change, say in the pull request that you did,
and say which. A moved count with no note is indistinguishable from the thing rule 3 exists
to stop.

**A CHECK over a nullable column passes on NULL, and AC-001 cannot see the difference.**
Added 2026-09-03 from issue #27, where it cost a red run and would otherwise have cost a
fix-forward migration. A CHECK fails only on FALSE; UNKNOWN is as good as TRUE to it. So the
obvious spelling of a both-or-neither rule,
`((a IS NULL AND b IS NULL) OR (a > 0 AND b > 0))`, admits exactly the row it was written to
refuse: with `a` null and `b` set, the first branch is FALSE and the second is NULL, because
`NULL > 0` is NULL, and `FALSE OR NULL` is NULL. Write it so no possibly-null value is
compared until both are known to be present — `(a IS NULL) = (b IS NULL) AND (a IS NULL OR
(a > 0 AND b > 0))`, `IS NULL` always yielding a real boolean. **The reason this is worth a
bullet rather than a footnote is the second half: AC-001 asserts constraints by name and by
which columns they mention, never by what the expression does**, so a toothless CHECK is
green across the whole suite. Only a behavioural case that tries the bad row catches it, and
if your migration adds a CHECK, writing that case is your job.

## `app/src/shared/` is the contract

22 modules of zod schemas that both the browser and the server import, with 10 test files
beside them, 32 files in all (`find app/src/shared -type f | wc -l`, measured 2026-09-04; the
sentence this replaces read 19 on 2026-09-03 and counted only the schema modules). The client validates
every response against them before rendering, so a mismatch surfaces as a visible error
rather than a blank field.

Changing a **response** schema is caught by the compiler on both sides. That is the safe
case.

Changing a **request** schema is caught by nothing, and there are two ways to lose a field
rather than one. Both answer 200 and neither leaves anything on the wire.

- **A field the schema does not declare** is stripped by `z.object` and dropped. There is no
  `.strict()` anywhere in that folder and there is deliberately not going to be: spec 11.14
  records the ruling and what is done instead, and an endpoint that means to refuse a field
  declares it as `z.never({ error: … }).optional()` rather than making the object strict.
- **A field the schema declares and the route does not act on** is dropped just as quietly,
  and this is the one that has actually cost this project. `app/src/shared/tasks.ts` records
  a reminder field lost for four packages, and it was **declared** the whole time — so
  strictness would not have seen it, and neither would any unknown-key check. Only a
  criterion catches this class, which is what AC-149 is.

**So: if you add a request field, add the code that reads it in the same change, and add the
criterion that proves it.** Spec 11.15 names both classes and what catches each.

## Testing

**`npm run gate` is what a pull request carries.** It runs spec 11.11's six steps in order
on this machine, stops at the first failure, and prints the record: the head sha, whether the
tree was dirty, the machine, the clock, and each step's tally.

```
npm run gate              the six steps
npm run gate -- --quick   lint, typecheck and build, for the middle of the work
```

The individual commands, for when you want one of them:

```
npm run lint
npm run typecheck
npm test          picks a leg from TEST_DATABASE_URL, see below
npm run build
npm run e2e       the browser leg
```

**There is one database leg since 11.11's 2026-09-20 amendment, and it is Postgres.**
PGlite is the fallback when `TEST_DATABASE_URL` is absent, never the gate.

**Never select a leg by habit. Print the variable and check.** `TEST_DATABASE_URL` is
ambient on this machine and has changed more than once, and **this matters more now than it
did when there were two legs, not less**: nothing else is left to notice that your run fell
back to PGlite and told you it was green. The gate makes the selection explicitly and writes
into the record which engine it got, which is the answer to read rather than any file's.

**A gate that could not run the Postgres leg is `incomplete`, not green, and exits non-zero.**
Green means all six of 11.11's steps ran and the test step reached Postgres, and a pull
request needs green, so a machine with
no `TEST_DATABASE_URL` cannot open one. **The setup is one-time and lives in spec 11.10**: its
`CREATE DATABASE` statement fixes the builtin `C.UTF-8` locale so the leg orders text the way
the application expects, and `CLAUDE.md` describes this cluster, whose own locale is French
and must never become the suite's. Point the variable at a database that inherited the
cluster default and the leg stops matching production.

`CLAUDE.md` holds the environment lore, and it is worth reading before you believe a red: the
PGlite worker crashes, the port collisions on the browser leg, and the counts that turn out
to be measurement rather than code. Three known flake classes will cost you time if you do
not know them, and **only two of them are answered by re-running**:

- **The browser leg loses about one case a run.** Re-run the case alone, and read
  `CLAUDE.md`'s note on when isolation lies.
- **A test comparing a date the server computed against a date the test computed is red for
  the hours when this machine's date is already tomorrow, and re-running does not help.**
  `ac-277` was the one that fired. It read the duplicate's re-anchored due date, which the
  server takes from the database's `current_date`, against `todayInUtc()`, which the test
  took from `new Date().toISOString()`. Measured 2026-09-02 at 23:10Z, already the 3rd here:
  PGlite's session zone is `Etc/GMT-1` and the local cluster's is `Europe/Paris`, so
  `current_date` read `2026-09-03` while UTC was still the 2nd. **It is not the fork flake
  and isolation confirms nothing**: on one commit, `TZ=UTC env -u TEST_DATABASE_URL npx
  vitest run tests/criteria/ac-277-task-duplicate-copy-rules.test.ts` was 2 of 2 while the same
  command without `TZ=UTC` was 1 of 2. **So the check that separates this class from a
  defect is the timezone, not a second run** — force the zone, and if it goes green the red
  is the clock. Note `TZ=UTC` settles only the PGlite leg; on Postgres the cluster's own
  zone governs and the process variable changes nothing.

  **Closed 2026-09-04 by issue #76, and left here because the way it presented is what to
  recognise.** The interim fix of #46 made the criterion's oracle the database's own clock,
  bracketed across the operation, and said in terms that it described the behaviour without
  blessing it. #76 is the product defect underneath — the endpoint anchored on the database's
  day rather than the viewer's, which 8.1 forbids by name — and it has landed: both
  duplicates take `tz`, they do not read `current_date` at all, and AC-277 and AC-200 pin a
  zone and assert an exact date in the same commit. **So a duplicate criterion that fails on
  a date is now a defect rather than this class.** What remains true in general is the shape:
  where an assertion compares a date the server computed against a date the test computed,
  check which clock each one read before believing the red, and force the zone to tell them
  apart.

**The Postgres leg used to be a third one, and is not any more (issue #32, 2026-09-03).**
It pointed all 282 files at one `dana_test`, they saw each other's rows, and the fingerprint
was a count that climbed across successive tests, `expected 2 to be 1`, then 3, then 4.
Each Vitest pool slot now gets a database of its own, `dana_test_r<run>_w<slot>`, created and
migrated at run start and emptied before every file; the machinery is
`app/tests/postgres-leg*.ts` and the contract is spec 11.10. Three things follow for you. A
count that climbs on that leg is now a defect rather than a flake, so read it.
`TEST_DATABASE_URL` names the base database the worker ones are derived from rather than the
one your test runs in, and no file runs in that base any more: `ac-001` did until issue #92,
because it asserted the English text of a server message and only a superuser can give a
created database `lc_messages = C`, and that made it the one file another branch's
forward-only migrations could break, since whatever a branch migrates into `dana_test`
stays there. And so the third: **never assert the prose of a server message.** The created
databases answer in this cluster's language, which is French. Assert a constraint name,
which every translation keeps verbatim, or the SQLSTATE and the table or column field of
the error, which no locale touches; `expectRejectedWith` in `tests/support/helpers.ts` does the
second, and `tests/guards/guard-postgres-leg-isolation.test.ts` fails by name any test that reads prose.

## When the work needs the client

**Most of the client is as silent as a migration from a terminal**, and this is the one thing
to know before you touch it. `app/vitest.config.ts:5` sets `environment: 'node'` for the
whole suite, so `npm test` proves the client **compiles** and almost nothing about what it
does; six files opt into `jsdom` per file and are the only ones in the suite that render
anything (measured 2026-09-04, and the count moved twice that day). Everything a screen actually does is covered by the Playwright specs and by nothing
else. A person with a browser would see the broken screen; you will not.

So say honestly how you checked a client change: you ran the Playwright spec that covers it
and you name it, or you ran the app and looked, or **you say it was not verified in a
browser**. The third is an acceptable answer. Claiming the first while having done the third
is not.

Two ways to make the change, and both are ordinary:

- **Do it.** [`frontend.md`](frontend.md) is the folder map and the
  things that bite.
- **Invoke the `frontend` agent** with the exact need, on the same branch, and integrate its
  commit. That is not an escalation and it needs no issue.

Two files in there are hard stops because no criterion sees them —
`app/src/client/styles/tokens.css` and `app/src/client/parts/presenters.ts` — and a renamed
`localStorage` key is the one genuinely irreversible thing in the client.
[`hard-stops.md`](hard-stops.md) carries all three.

## Labels, in one line

Your issue needs an area label (`backend`) and a type label (`bug`, `enhancement` or
`documentation`). Add `blocked` if you stop, `breaking` if it changes something people rely
on. The full table is in [`workflow.md`](workflow.md); you rarely need the rest
of that file.

## Opening the pull request

**Only when the work is finished**, which means `npm run gate` is green on the head commit
and the `reviewer` agent has run. Never a draft.

The template asks for four things and none is optional: the **gate record**, pasted; the
**hard stops** you touched with the rule you met, or "none"; the **criteria** you changed and
why, or "none"; and the **reviewer's verdict** in a paragraph. Title it as a Conventional
Commit, because the version is read from it.

Then Hassan merges. Merging deploys to production within minutes, and the six steps run
again on `main`, which is the verdict on what was merged.
