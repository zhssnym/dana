# A4: Tests and CI

Written 2026-08-31 on branch `pipelines`, against the working tree at that
moment. Discovery only: nothing was changed, nothing was pushed, and no test
leg was run. Every number below comes from reading a file, counting files, or
asking GitHub's API a read-only question. Where I am inferring rather than
reading, the sentence says so.

Two notes on what I was reading. The `pipelines` branch has **no commits ahead
of `main`**; the docs restructuring is 360 uncommitted deletions in the working
tree. `app/` and `.github/` are untouched except `app/index.html`, so
everything in this report describes the code as shipped at `v2.2.0`. And
`docs/team/` is deleted in the working tree, so the protocol quotes below come
from `git show main:docs/team/_shared-protocol.md`.

---

## 0. The one thing to read first

**CI does not exist right now.** Not "is slow", not "waits for the machine" —
it has never run once on this repository.

Verified against the GitHub API today:

- `zhssnym/dana` was created `2026-08-30T08:27:21Z`. The repo used to be
  `github.com/dev-dana/dana`; commit `eb5b0cf` says that account died.
- The CI workflow is registered and active, created 2026-08-30.
- `repos/zhssnym/dana/actions/runs` → `total_count: 0`. Zero runs, any status.
- `repos/zhssnym/dana/actions/runners` → `total_count: 0`. Zero self-hosted
  runners registered.
- On this machine, `C:\actions-runner\` holds the unzipped runner but **no
  `.runner` config file, no `.env`, and no installed service**. Its newest
  diagnostic log is `Runner_20260811-202233-utc.log` — 11 August.
- Only one branch exists on the remote: `main`.

The runner was registered to the dead `dev-dana` account. The job asks for
`runs-on: [self-hosted, windows, x64]`, and nothing on earth currently answers
that label for this repository. A push today produces a queued job that waits
until GitHub gives up on it.

So the whole of section 6 below — "what happens to Imran when the machine is
off" — is downstream of a simpler fact: before any of that matters, the runner
has to be re-registered against `zhssnym/dana`. Section 6 argues that this is
the moment to reconsider whether it should be re-registered *as it was*.

Two more live facts from the API, both load-bearing for section 5:

- `mranwafa` is a collaborator with **push** permission. He can push directly
  to `main` today. The agreement says he does not; nothing stops him.
- Branch protection and rulesets both answer **403: "Upgrade to GitHub Pro or
  make this repository public to enable this feature."** Spec 11.11 recorded
  this on 2026-08-11 and it is still true. "Imran never pushes to main" is a
  promise, not a mechanism.

---

## 1. The `ac-NNN` scheme

### 1.1 What is actually on disk

Hassan's question was "why is there an `ac-N` naming pattern while the latest
tests do not follow the same pattern?" Before answering it I counted. There are
**three** naming schemes in this repository, not two, and they are not in
conflict — each has a job.

| Scheme | Where | Files | Cases (approx) | What it is |
| - | - | - | - | - |
| `ac-NNN-slug.test.ts` | `app/tests/` | 209 | ~922 | Acceptance criteria, API level. Boots the Express app in-process, opens a database. |
| `ac-NNN-slug.spec.ts` | `app/tests/e2e/` | 107 | (of ~280) | Acceptance criteria, browser level. Drives a real Chromium against a real built client and a real server. |
| `<module>.test.ts` | `app/src/**`, `app/db/**` | 65 | ~902 | Unit tests, sitting next to the module they test. |
| `*-harness.ts` | `app/tests/` (11) + `app/tests/e2e/harness.ts` | 12 | — | Shared test machinery. Not tests. |
| `*-harness.test.ts` | `app/tests/` | 4 | 21 | Unit tests **of the harnesses**. Each header says "not an acceptance criterion". |
| `helpers.ts`, `http-client.ts`, `oidc-stub.ts`, `vitest-setup.ts` | `app/tests/` | 4 | — | The P0 database seam, the HTTP transport, a stub identity provider, one line of global config. |
| `rendered-halves.spec.ts`, `session-path.spec.ts` | `app/tests/e2e/` | 2 | (of ~280) | Browser specs that deliberately carry **no** AC number. More on these below. |

Case counts are static counts of `test(`/`it(` at line start, so they are
approximate — a `test.each` counts once here and many times at runtime.
`app/tests/` has 230 top-level entries and 339 files recursively; `tests/e2e/`
has 110 entries (109 specs + `harness.ts`). Those match the numbers in the
brief.

`s22a-harness.ts` is the odd name in the list. It is a normal harness — the
fixtures for AC-266 to AC-273 — named after the *session* that wrote it (S22a)
rather than after the feature. Eight files import it. It is the only harness
named that way; the other eleven are named for their subject (`tasks-`,
`views-`, `reminders-`, `uploads-`…). Nothing breaks, but it is the one file
whose name will mean nothing to a reader in six months.

### 1.2 Where the numbers come from, and what they buy

`docs/spec/12-acceptance-criteria.md` is the source. It holds **324 numbered
criteria**, running from AC-001 to AC-360. The scheme buys exactly one thing,
and it is a good thing: a single token joins four places.

1. A sentence in section 12 (`- AC-360 Given an uploaded avatar…`).
2. A filename (`app/tests/ac-360-avatar-removal.test.ts`).
3. A test title (`describe('AC-360 the picture can be taken away again')`).
4. A command that runs just that one thing (`npx vitest run -t "AC-360"`).

I checked link 3 mechanically. **All 316 numbered files name their own number
inside a `describe`/`test`/`it` title — no exceptions.** So the `-t "AC-NNN"`
and `-g "AC-NNN"` addressing in `app/tests/README.md:11` works everywhere, not
just where someone remembered.

That is the payoff. A red line in a CI log names a promise, and the promise is
a sentence a non-programmer can read. For a build where the spec came first and
thirteen separate agent sessions had to agree on what "done" meant, it was
worth the bookkeeping.

### 1.3 Where it breaks down — six places, all verified

**(a) The numbers are not contiguous, and never were.** Section 12 has 324
criteria in a range that would hold 360. Missing numbers: 229, 286–289,
304–309, 314–329, 343–349, 358–359. The spec is explicit that this is by
design — line 317 calls them "append-only identifiers rather than a sequence".

**(b) A gap means three different things and the number cannot tell you
which.** Sometimes the number was spent on an unmerged branch and later
released (AC-243 to AC-247, recorded at line 473). Sometimes it was
*deliberately* not spent, because the thing it would have asserted was a
stylesheet rather than a behaviour (AC-257, line 486). Sometimes it was simply
never allocated. A reader who finds a hole has to go read prose to find out
which — and the prose is 607 lines long.

**(c) One AC is not one file, in either direction.**

- `ac-297-sample-workspace.test.ts` covers **six** criteria: AC-297 through
  AC-302. That is why AC-298 to AC-302 have no files of their own.
- AC-101 (invite rate limiting) has no file. It is asserted across many P5
  files plus `src/server/security/rate-limit.test.ts`. AC-102 lives inside
  `ac-146-reminder-delete.test.ts`. AC-103 and AC-104 live only in unit tests.
  `app/tests/README.md:52` is the only place that records where they went.
- Six criteria are **split across two runners**: AC-039, AC-047, AC-048,
  AC-053, AC-058 and AC-141 have their server half in `app/tests/` and their
  "what the viewer sees" half in the browser leg
  (`app/tests/README.md`, the P8 row).

**(d) Two browser specs have no number at all, and shouldn't.**
`tests/e2e/session-path.spec.ts` walks the app the way a person does and
asserts three properties over *everything the client sent*: every view request
carried a `tz`, every mutation carried the CSRF header, every page went through
the authorization chokepoint. `tests/e2e/rendered-halves.spec.ts` closes the
rendering halves of criteria that live in other packages. Neither maps to one
promise, so neither got a number. **These two files are the proof that the
scheme has a shape it cannot express**, and they are also the precedent for
what section 2 recommends.

**(e) `ac-229-done-row-drops-the-due-echo.spec.ts` has a file but no spec
sentence.** Section 12 line 442 says so out loud: "AC-229's text lives in its
own test file on the S11 precedent; from AC-230 on, the text returns here." So
one criterion's contract is in a `.spec.ts` header comment. That is the only
one, but the door is open.

**(f) Parallel work collides on numbers. Five times, that I can find.** This is
the real cost, and it is the one that matters for the new workflow. Two agents
on two branches both read "the next free number is N" and both take N. Each
occurrence cost a rename plus a paragraph of spec explaining it:

| Collision | Recorded at |
| - | - |
| AC-154 / AC-164 (P8 vs P7) | Section 12 line 317; git commit `9d25ad5` renames two e2e files |
| AC-226 (S11 vs S13) | Section 12 line 434 |
| AC-243 to AC-247 (S17a vs S18) | Section 12 line 473 |
| AC-251 to AC-256 (S19 vs S17b) | Section 12 line 495 — "the **fourth** occurrence" |
| AC-274 / AC-275 (S27 browser vs S28a server) | **Nowhere.** Found only in git. |

The fifth is the one worth staring at. On 2026-08-30, commit `3e9d78a` added
`tests/e2e/ac-274-theme-before-first-paint.spec.ts` and
`ac-275-import-control-reads-the-widened-file.spec.ts`. On the same day, commit
`0be4d48` added `tests/ac-274-permanent-delete-of-a-task.test.ts` and
`ac-275-…`. Both survive today, but the browser pair now sits at AC-281 and
AC-282. The rename happened and **the spec has no paragraph about it**. The
first four collisions were expensive enough to document; the fifth was routine
enough not to be.

Section 12 line 495 names the cause precisely: "both sessions read the file
twice and neither scan could see an unmerged branch."

That failure mode does not go away in the new workflow. It gets worse. Two
people on two machines, each with an agent that branches from `main` and picks
"the next free number", is exactly the same race with a slower feedback loop.

### 1.4 Hassan's question, answered

> Why is there an `ac-N` naming pattern while the latest tests do not follow
> the same pattern?

**Half the premise is false.** The single newest test file in the repository is
`app/tests/ac-360-avatar-removal.test.ts`, added yesterday (2026-08-31, commit
`359d28d`). The newest browser specs are `ac-330` to `ac-357`, added 2026-08-30.
Inside `app/tests/`, the pattern has held right to the last commit.

**Half is true, and the true half is a different directory.** The 65 tests
under `app/src/**` and `app/db/**` have never used the pattern. They are named
after the module they sit beside: `src/server/time/recurrence.test.ts`,
`src/client/views/grouping.test.ts`. Of those 65, **45 cite AC numbers inside
the file**, and 17 put the number right in a test title:

```
it('is AC-155 order: groups by label ascending, then loose folders by name…
test('a forged state is refused and provisions nothing (AC-105)…
```

So `npx vitest run -t "AC-105"` finds them too, because `vitest.config.ts:39`
includes `src/**/*.test.{ts,tsx}` in the same collection.

**This is deliberate, and the rule is written down.** Protocol section 8:

> - **Acceptance tests** are the numbered acceptance criteria of spec section
>   12 … The Adversarial Test Engineer owns them exclusively.
> - **Unit tests** inside your own module are yours, encouraged, and
>   unrestricted.

Two categories, two owners, two naming schemes. It is not drift. The four
`*-harness.test.ts` files say the same thing in their own headers: "A unit test
of the P3 harness readers, **not an acceptance criterion**."

So the honest answer to Hassan is: the newer tests in `app/tests/` do follow
the pattern; the newer tests under `app/src/` follow a second pattern on
purpose; and the second pattern is the one worth keeping.

---

## 2. Is `ac-N` still the right scheme? One recommendation

### The recommendation

**Freeze the `ac-NNN` range. Rename nothing. New tests use the co-located
module pattern that already exists, and carry a one-line `Protects:` header
that names an issue or a spec section instead of a number.**

That is one option, not three, and here is why it is the one.

### Why not rename the 316 files

I counted the cross-references. `AC-NNN` appears **2,577 times across 194
files** outside `app/tests/`, and **2,909 times inside it**. Those references
are in the spec, in five RFCs, in the changelog, in source-file headers, and in
test titles. A rename is not a rename; it is a five-and-a-half-thousand-token
find-and-replace across the entire written history of the project, and it buys
nothing a reader can see. The existing numbers work. They address real files,
they run from the command line, and they point at real sentences. Leave them.

### Why not keep allocating new numbers

Three reasons, all evidenced above.

1. It has collided five times in one month of parallel work, and the new
   workflow is *more* parallel, not less.
2. Allocating a number requires reading a 607-line file, plus every unmerged
   branch, plus `app/tests/`. Section 12 line 495 records that two sessions did
   the first two checks twice each and still collided. That check is not
   something Imran's agent can do at all — it cannot see Hassan's unpushed
   branches.
3. The number's whole value came from a spec-first, package-by-package build
   where the spec existed before the code. That build is finished. From here
   the promise arrives as a GitHub issue, which **already has a number GitHub
   allocated, atomically, with no collisions possible.** Issue numbers are free
   and correct. AC numbers are expensive and occasionally wrong.

### The rule, concretely

Four lines. Put them in `app/tests/README.md` and in whatever brief each agent
gets.

> **1. Logic tests sit next to the module.** `app/src/**/<name>.test.ts`, beside
> `<name>.ts`. Vitest already collects them.
>
> **2. Browser tests sit in `app/tests/e2e/` and are named for the behaviour,
> not a number.** `<subject>-<behaviour>.spec.ts`.
>
> **3. Every new test file opens with one `Protects:` line** naming an issue,
> a spec section, or both. Test titles stay full sentences.
>
> **4. `app/tests/ac-*.test.ts` and `app/tests/e2e/ac-*.spec.ts` are closed.**
> Nobody adds a new `ac-` file. Editing an existing one is allowed *only* when
> the promise itself changed, and that is Hassan's call.

Example filenames under the new rule:

```
app/src/client/shell/sidebar-collapse.test.ts     # issue #12, pure logic
app/tests/e2e/sidebar-collapse.spec.ts            # issue #12, what you see
app/src/server/routes/avatar.test.ts              # issue #13, server side
app/tests/e2e/settings-profile-picture.spec.ts    # issue #13, what you see
```

And the header:

```ts
/*
Protects: issue #12 (sidebar collapsed version not aligned), spec 9.1.

The rail keeps its width when collapsed and the folder count stays on the
row's edge. Asserted after a reload, because a control that writes nothing
still changes the page it is on.
*/
```

`Protects:` is a grep target. `grep -rn "Protects:" app/` answers "what does
this suite promise" in one screen, which is what the AC number was for.

### What this costs and what it does not

It costs the ability to say "run AC-217". It does not cost the ability to run
one file (`npx vitest run app/src/client/shell/sidebar-collapse.test.ts`) or to
run by title (`-t "collapsed rail"`). Those are the two things anybody actually
does.

It does not touch the 316 existing files, the 2,577 references to them, the CI
workflow, `vitest.config.ts` (whose include globs already cover both patterns),
or `playwright.config.ts` (whose `testMatch: '**/*.spec.ts'` never cared about
the prefix).

The one genuinely new obligation: **when a change makes an existing AC false,
somebody has to edit that AC file and the spec sentence behind it.** That has
happened repeatedly already — section 12 records AC-165, AC-167, AC-173,
AC-180, AC-181 and AC-183 being reworked when the design moved under them. It
stays Hassan's, because it is a change to what the product promises, not to how
it is tested.

---

## 3. Test ownership under the two-person split

### 3.1 The existing rule already fits, almost

Protocol section 8's two categories map cleanly onto two people:

- **Unit tests belong to whoever owns the module.** Imran's agent owns
  `app/src/client/**`, so it owns `app/src/client/**/*.test.ts`.
- **Acceptance tests belong to one owner.** In the old build that was persona
  11. There is no persona 11 any more; there is Hassan.

The gap is the browser leg. It lives in `app/tests/e2e/`, it asserts things
only Imran's side can change, and under the old rule Imran's agent may not
touch it.

### 3.2 What the two runners actually assert

I read the harnesses to check whether the split is real or just directory
convention. It is real.

**`app/tests/e2e/harness.ts` never opens a database.** Its own header says so,
and I confirmed it: the only import from outside `tests/e2e/` in all 109 specs
is `seedIds` from `../../db/seed.js` — a frozen list of UUIDs. There is no
`drizzle`, no `pg`, no `createDbClient`. Everything a spec knows, it learns
through a browser or through `page.request`, which is the same HTTP a real
client speaks.

The harness's own rules make it a client-behaviour instrument:

- "Controls are addressed by accessible role and normative name, never by
  class, DOM shape or test identifier."
- "Section 9's copy is restated here, never imported from `src/client`" —
  because "a suite that imports the string it asserts measures nothing."
- `watchWire` and `waitForApiIdle` record what the client *sent*, so a spec can
  assert "the drag wrote `POST /tasks/:id/order`" without reading a table.

**`app/tests/*.test.ts` is the mirror image.** It uses `helpers.ts`, which
calls `createDbClient()` directly, runs migrations under an advisory lock, and
hands the test a live `db` handle. Those files assert rows, constraint names,
transaction behaviour, concurrency races, and HTTP status codes. Imran's agent
cannot meaningfully write one and cannot read one.

So the two suites are already split by *what they can see*, not just by folder.

### 3.3 The layer that is missing, and it is Imran's

`app/package.json` installs `@testing-library/react`, `@testing-library/dom`,
`@testing-library/jest-dom`, `@testing-library/user-event` and `jsdom`.

**Nothing imports any of them.** I grepped `src/` and `tests/` for
`@testing-library` and for `@vitest-environment`: zero hits. There are no
`.test.tsx` files anywhere in the repository. `tsconfig.client.json` and
`tsconfig.server.json` both carry long comments explaining how the `.tsx`
component-test leg is routed between projects — and that leg is empty.

The 14 client test files that do exist test pure functions: date formatting,
grouping, sorting, calendar grid arithmetic, presenter strings. Good tests, but
none of them renders a component.

**This matters for the new workflow more than anything else in this section.**
Today, the only way to check that a React change did what it should is the
browser leg — which takes 15 to 20 minutes, needs a built client, a seeded
database and a running server, holds a hardcoded port, and cannot run twice on
one machine. That is a terrible inner loop for the person doing the most UI
work.

A component test renders one component under `jsdom` in about 50 milliseconds.
Everything needed to write one is already installed. This is the layer Imran's
agent should live in, and it is the cheapest thing on this whole list to start.

### 3.4 Should `app/tests/` be split by area? Yes.

It is one flat folder of 230 entries with one owner, and CODEOWNERS matches on
paths. As it stands, the only lines you can write are "all of `app/tests/` is
Hassan's" — which locks Imran's agent out of every browser spec — or "all of it
is shared", which means nothing.

The move I would make, in one commit, with `git mv` so history follows:

```
app/tests/
  api/          <- the 209 ac-*.test.ts files, unmoved otherwise
  support/      <- helpers.ts, http-client.ts, oidc-stub.ts,
                   vitest-setup.ts, the 11 *-harness.ts,
                   the 4 *-harness.test.ts
  e2e/          <- unchanged, 109 specs + harness.ts
```

Costs: `vitest.config.ts:38` already globs `tests/**/*.test.{ts,tsx}`, so
collection is unaffected. Every `./auth-harness.js` import inside the moved
files becomes `../support/auth-harness.js` — mechanical, and the typecheck step
catches any miss. `tsconfig.server.json`'s `exclude: ["tests/**/*.tsx"]` still
holds. `playwright.config.ts`'s `testDir: 'tests/e2e'` does not move at all.

Then CODEOWNERS reads as a sentence anyone can check:

```
# Everything, unless something below overrides it.
*                             @zhssnym

# Imran's side: the client, its unit tests, and the design tokens.
/app/src/client/              @mranwafa
/app/tests/e2e/               @mranwafa

# Hassan keeps these even inside Imran's tree.
/app/src/client/lib/api*      @zhssnym
/app/tests/e2e/harness.ts     @zhssnym

# The contract between the two sides. Neither changes it alone.
/app/src/shared/              @zhssnym @mranwafa
/docs/spec/                   @zhssnym
```

Two of those lines deserve a word. `tests/e2e/harness.ts` stays Hassan's
because it is where the sign-in path, the seed identifiers and the normative
copy live; a change there silently changes 109 specs. And `app/src/shared/` is
listed for both because it is the zod schemas and API types both sides compile
against — a change there is a change to the wire, and it should stop both
people.

### 3.5 The split, stated plainly

**Imran's agent writes and runs:**

- `app/src/client/**/*.test.ts` — pure client logic.
- `app/src/client/**/*.test.tsx` — component render tests. New layer, nothing
  there yet.
- `app/tests/e2e/*.spec.ts` — new browser specs, named by behaviour, not `ac-`.

**Hassan keeps:**

- All 209 `app/tests/api/ac-*.test.ts` and all 107 existing
  `app/tests/e2e/ac-*.spec.ts`. These are the record of what was promised.
- All of `app/tests/support/**` — the harnesses and the database seam.
- `app/tests/e2e/harness.ts`.
- Everything under `app/src/server/**`, `app/src/shared/**`, `app/db/**`.
- `app/scripts/run-suite.mjs`, `vitest.config.ts`, `playwright.config.ts`,
  `.github/workflows/**`.

**The escalation rule survives intact and should be restated in the new docs:**
if a change makes an existing `ac-` test fail, that is not a test to fix. It is
either a bug, or a promise that needs renegotiating — and renegotiating it is a
conversation, not a commit.

---

## 4. What Imran can run on his own machine

### 4.1 What he needs to have

- **Node 24.** `.nvmrc` says `24`; `package.json` says `>=24 <25`.
- **A clone, and `npm ci` from `app/`.** That is the whole install.
- **No Docker.** Spec 11.10: PGlite is "embedded Postgres 18, in-process, no
  Docker, runs on Windows". `app/db/client.ts` falls back to it whenever no
  connection string is present.
- **No Postgres install** for the default legs.
- **No secrets to obtain.** `app/.env` is a tracked, committed file (I checked:
  `git ls-files .env` returns it, and `.gitignore` does not list it). It
  carries `DANA_DEV_LOGIN=1`, `APP_ORIGIN=http://localhost:3000`, empty
  `DATABASE_URL` and `TEST_DATABASE_URL`, and live Google client credentials.
  So a plain clone boots and signs in.

  Two things follow from that, and neither is optional. The file's own first
  line still says "Gitignored, never committed" — that comment is wrong and
  should be corrected to match the owner's 2026-08-25 ruling that CLAUDE.md
  records. And a second person now holds those Google credentials on a second
  machine; that is a decision, not an accident, and it is worth saying out loud
  before it happens rather than after.

- **`TEST_DATABASE_URL` must be unset on his machine, and by default it is.**
  Nothing loads `app/.env` for a test run — `process.loadEnvFile()` is called
  inside `main()` in `src/server/index.ts:461`, the server boot only. So unless
  he sets the variable himself, it is absent, and `db/client.ts` opens PGlite.
  He should never set it.

### 4.2 Leg by leg

| Leg | Command (from `app/`) | Setup needed | Verdict |
| - | - | - | - |
| Lint | `npm run lint` | none | **Runs.** `eslint .` over `app/`. Seconds. |
| Typecheck | `npm run typecheck` | none | **Runs.** Three `tsc` projects. Seconds. |
| Vitest, PGlite | `npm test` | none | **Runs.** In-memory PGlite, one fresh database per `createTestDb()`. |
| Build | `npm run build` | none | **Runs.** `vite build` + `tsc -p tsconfig.build.json`. |
| Vitest, real Postgres | `npm test` with `TEST_DATABASE_URL` set | Postgres 18 **plus an exactly-specified locale** | **Should not attempt.** See below. |
| Playwright | `npx playwright install chromium` then `npx playwright test` | one browser download | **Runs, with three catches.** See below. |

**Why he should not attempt the Postgres leg.** Spec 11.10 does not just want
"a Postgres". It fixes the database's collation:

```sql
CREATE DATABASE dana_test OWNER dana_ci TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C' LC_CTYPE 'C';
ALTER DATABASE dana_test SET lc_messages = 'C';
```

Both statements are normative, and the spec records that the second was learned
the hard way: AC-001 reads Postgres's own error prose, and on a French cluster
it fails. A database created any other way produces red tests that look like
code faults and are not. This leg exists to catch engine differences that only
show up with a real client, a real socket and a real planner — none of which is
in Imran's lane. **It is Hassan's leg and CI's leg. Imran's agent should never
set that variable, and should be told so in one sentence.**

**The three catches on the browser leg**, all from CLAUDE.md's environment
notes rather than from my own measurement — I did not run this leg:

1. **The checkout path must contain no directory starting with a dot.** The SPA
   fallback serves client routes with `res.sendFile()` on an absolute path, and
   Express 5 refuses any path with a dot segment, so `GET /app` answers 404 and
   every spec fails on a missing sidebar. It reads as a broken app and is not
   one. If Imran clones to something like `~/.projects/dana`, the entire leg is
   red for a reason nothing tells him.
2. **Only one browser leg per machine.** `playwright.config.ts` hardcodes port
   3100 and sets `reuseExistingServer: false`, so every run starts its own
   server. Two overlapping runs seed and truncate each other's database
   underneath the browser, and the report shows page crashes and timeouts
   rather than a port error.
3. **A whole-leg red of one or two cases means "unmeasured", not "broken".**
   CLAUDE.md records four CI runs across two byte-identical trees reading
   green, green, red, green on the same case. Imran's agent must not chase one
   red case.

**One correction to the CLAUDE.md notes, which I did verify.** That file says
the browser leg "must have that variable unset for the whole run" and to invoke
it as `env -u TEST_DATABASE_URL npx playwright test`. That is one revision
stale. `playwright.config.ts` pins both `DATABASE_URL: process.env.DATABASE_URL ?? ''`
and `TEST_DATABASE_URL: ''` inside `webServer.env`, and the seed runs *inside*
`npm run e2e:app`, which is that `webServer.command`. `db/client.ts` treats an
empty string as unset. So the seed and the server both land on `.data`
regardless of the ambient variable. The fix landed in commit `63ecc34`
("Isolate Playwright from the Postgres test leg", 2026-08-14); the CLAUDE.md
measurement it replaced is dated 2026-08-12. The `env -u` prefix is now
harmless belt-and-braces, not a requirement. Worth correcting in CLAUDE.md so
the next reader does not treat the stale half as still load-bearing.

### 4.3 The smallest command set before Imran opens a PR

Four commands, in this order, from `app/`:

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

Then, **only if the change touched anything a person can see** — and it usually
will:

```bash
npx playwright install chromium     # first time only
npx playwright test tests/e2e/<the-one-or-two-specs-that-cover-this>.spec.ts
```

Four things his agent needs told, and each of them is a thing that produces a
false red otherwise:

- **Never set `TEST_DATABASE_URL`.** Ever. If it is set, `npm test` silently
  becomes the Postgres leg and fails on locale.
- **Read the file count in the vitest summary, not the exit code.** CLAUDE.md
  records two independent reasons: a dying worker fork can exit 0 having lost
  five files, and a piped `npm test` returns `tail`'s status because this shell
  runs with `pipefail` off. `app/scripts/run-suite.mjs` exists precisely to
  catch the first — it compares the categories vitest resolved against the
  total it collected and fails the difference — **but only if you run it
  unpiped.**
- **Re-run a lost file alone before believing it.** PGlite workers die
  mid-run and it reads as broken code.
- **Do not run the whole browser leg.** Run the specs the change touches. The
  whole leg is 15 to 20 minutes and, per CLAUDE.md, loses about one case a run
  anyway.

**Do not ask him to run the whole vitest suite before every push.** CLAUDE.md's
measurements: ~200 seconds for the PGlite leg in parallel, up to 25 minutes
serially, on 228 files. He should run it, but the honest framing is "this takes
a few minutes, run it and go make tea", not "this is instant".

---

## 5. `.github/workflows/ci.yml` — what it enforces, and what it does not

### 5.1 What it does today, step by step

Triggers: `on: push:` with **no branch filter**, plus `workflow_dispatch`.
Concurrency group per ref, cancelling in-progress runs on every branch except
`main`. `runs-on: [self-hosted, windows, x64]`. `timeout-minutes: 40`. Every
step runs in `app/` with `shell: cmd`.

| # | Step | What it actually enforces |
| - | - | - |
| 1 | `actions/checkout@v4` | — |
| 2 | `actions/setup-node@v4` | Node from `.nvmrc`; npm cache keyed on `app/package-lock.json` |
| 3 | `npm ci` | The lockfile installs cleanly |
| 4 | `npm run lint` | ESLint over `app/`, recommended + typescript-eslint recommended, plus one unused-vars rule |
| 5 | `npm run typecheck` | Three `tsc` projects: server+shared+db+tests, client+shared+`tests/**/*.tsx`, and the four config files |
| 6 | `npm test` — "Test on PGlite" | The vitest suite. **See finding A.** |
| 7 | `npm test` — "Test on a real Postgres 18" | Guarded: if `%TEST_DATABASE_URL%` is empty, the step prints an explanation and exits 1 |
| 8 | `npm run build` | `vite build` + `tsc -p tsconfig.build.json` |
| 9 | `npx playwright install chromium && npx playwright test` | The browser leg, guarded on `hashFiles('app/playwright.config.ts') != ''` |

Two guards deserve credit, because both were written after a real false green.
Step 7's `if "%TEST_DATABASE_URL%"=="" ( … exit /b 1 )` stops the Postgres leg
passing by silently re-running PGlite. And `app/scripts/run-suite.mjs` wraps
every `npm test` and fails a run that exits 0 without accounting for every file
it collected — written 2026-08-24 after a run reported `223 passed (228)` and
returned zero.

### 5.2 Finding A — the PGlite step is probably not PGlite

**This is inference, not measurement, but it is high-confidence and it is
cheap to check.**

Step 6 is a bare `npm test` with no step-level `env:` block. Where does
`TEST_DATABASE_URL` come from on this runner? Spec 11.11 says: it "lives in the
runner installation's own `.env` file, outside the repository and outside every
working tree, **which the runner reads into each job's environment**."

Each job's environment. Not each step's. So step 6 sees it too, and
`db/client.ts` opens Postgres.

The git history confirms the mechanism by showing what changed. On the original
hosted form (commit `59737a8`'s diff), the variable was set **only on the
Postgres step**, as a step-level `env:` block beside a `postgres:18` service
container. The move to self-hosted deleted that block and replaced it with the
runner's `.env`, which is job-wide. Nothing was added to step 6 to compensate.

If that reading is right, CI has been running the Postgres leg twice and the
PGlite leg zero times since 2026-08-11 — the exact false green step 7's guard
was written to prevent, in the mirror image. And nobody would notice, because
both legs are green.

**Check:** add a temporary step before step 6 printing
`if defined TEST_DATABASE_URL (echo SET) else (echo UNSET)`. One CI run
answers it.

**Fix, if confirmed — one line:**

```yaml
      - name: Test on PGlite
        env:
          TEST_DATABASE_URL: ''
        run: npm test
```

`db/client.ts` treats `''` as unset (`process.env.TEST_DATABASE_URL === '' ? undefined : …`),
and step 7's guard treats unset and empty as the same case by construction. So
the two agree without either being kept in step with the other.

### 5.3 What CI does not enforce, and a two-person flow needs

**B. Nothing runs on `pull_request`.** `on: push:` fires for every branch, and
GitHub attaches those runs to a PR by head SHA, so a PR does get a check. What
it never gets is a run against the **merge result**. A branch that is green
alone can break `main` if `main` moved underneath it. With two people merging
into one branch, that goes from theoretical to weekly.

  Add `pull_request:` alongside `push:`. Then narrow `push:` to
  `branches: [main]` so a branch does not burn two full 40-minute runs for one
  commit.

**C. Nothing checks that a PR stayed in its lane.** There is no CODEOWNERS
file anywhere in the repository (I looked). Nothing fails a PR from Imran's
branch that edits `app/src/server/**` or `app/db/migrations/**`. Under the
agreement that is the single most important structural rule, and today it is
enforced by nobody reading the diff carefully.

  Add a small job that runs on `pull_request`, diffs against the base, and
  fails if a PR labelled `frontend` touches a path outside the frontend set.
  Twenty lines of shell. It is not a security control — Imran could remove the
  label — it is a **guard rail against an agent that wandered**, which is the
  actual failure mode.

**D. Branch protection is unavailable on this plan.** Verified live today:
`GET /repos/zhssnym/dana/branches/main/protection` → 403 "Upgrade to GitHub Pro
or make this repository public." Same for rulesets. Spec 11.11 recorded this on
2026-08-11 and it has not changed.

  **This means the whole agreement clause "Imran does not push to main" has no
  mechanism behind it.** `mranwafa` has push permission today. Three ways out,
  and I would take the third:

  1. **GitHub Pro on Hassan's account.** Turns on branch protection and
     required status checks for private repos on a personal account. From
     recall, roughly $4/month — *verify at the pricing page; I could not reach
     it from here.* This is the only option that makes the rule real.
  2. **Drop Imran to `triage` permission** (read + issue management, no push).
     He would work from a fork. Costs nothing, but forks make the flow clumsier
     and, importantly, a fork's PR does **not** get a self-hosted runner by
     default, so his PRs would get no CI at all.
  3. **Leave it as a promise, and write it down where both agents read it.**
     Free, and honest about what it is. Add it to CLAUDE.md and to Imran's
     agent brief as a hard rule, and pair it with option 1 when the flow is
     otherwise settled. The realistic risk here is not Imran; it is an agent
     that runs `git push` on the wrong branch, which is exactly the failure
     mode CLAUDE.md's own "co-lead commits under live sessions" note records
     having happened before.

**E. Nothing is uploaded when a run fails.** No `actions/upload-artifact` step,
no `if: failure()` anywhere in the file. `playwright.config.ts` writes an HTML
report and retains a trace on failure, and `.gitignore` excludes both, so those
artifacts exist only in the runner's working directory — on Hassan's machine.

  **For Imran this is the difference between a usable CI and a useless one.**
  A red browser leg gives him a log line and nothing else. He cannot open the
  trace, cannot see the screenshot, cannot see what the page looked like. Add:

  ```yaml
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: app/playwright-report/
          retention-days: 7
  ```

  This is the cheapest high-value addition on the whole list.

**F. Nothing lints the docs, and the docs are half the project.** No
markdownlint config, no prettier, no editorconfig, no link checker. `npm run
lint` is `eslint .` from `app/`, so it never sees `docs/`, `.github/`, or the
root markdown. With the spec as the contract between two people, a dead
cross-reference is a real defect. Something as small as a link checker over
`docs/**/*.md` would have caught the `dev-dana/dana` URL that commit `eb5b0cf`
fixed by hand.

**G. No path filter.** A commit that touches only `docs/` runs the whole
40-minute gate, browser leg included. On a self-hosted runner that is 40
minutes of Hassan's machine for a typo fix. Add `paths-ignore` for
docs-and-markdown-only pushes — but keep the docs *lint* job unfiltered, so
docs still get checked by something.

**H. Small things, listed for completeness.** The workflow has no `permissions:`
block; the repository default is already `read` (verified), so this is
cosmetic — but writing `permissions: contents: read` in the file makes it true
regardless of a settings change. `forbidOnly: inCI` in `playwright.config.ts`
catches a stray `.only` in the browser leg; vitest's `allowOnly` defaults to
false when `CI` is set, so that side is covered by default rather than by
configuration — worth pinning explicitly in `vitest.config.ts` so it does not
depend on a default.

### 5.4 The additions, in the order I would do them

1. Register a runner (section 6) — nothing below matters until CI runs at all.
2. Prove or disprove finding A, and add the one-line `env:` if confirmed.
3. Add the failure-artifact upload. Ten lines, and it is what makes CI legible
   to the person who cannot read the backend.
4. Add `pull_request:` to the triggers; narrow `push:` to `main`.
5. Add CODEOWNERS (section 3.4), even though it cannot be *enforced* on this
   plan — it still auto-suggests reviewers and, more usefully, it is a written
   map both agents can be pointed at.
6. Add the lane-check job.
7. Add a docs lint / link check job.
8. Add `paths-ignore` for docs-only pushes.

---

## 6. The self-hosted runner

### 6.1 The honest state

Section 0 has the evidence. To restate it as a sentence: **there is no runner,
so there is no CI, so the "wait for a green check" step in the proposed
workflow currently waits forever.**

That is a repair, not a design problem, and it should be done first.

### 6.2 The design problem underneath it

Even after the runner is re-registered, three things are true, and spec 11.11
states all three itself.

**One: no machine, no verdict.** "CI then exists only while that machine is
powered and the runner service is up, and a job queued against an absent runner
waits rather than failing, so a pushed branch has no verdict until the machine
is available: a cost the release ritual pays, not a defect to debug."

That sentence was written for a build where one person ran every session on the
machine in question. It is a very different sentence when the person waiting is
Imran, in a different place, on a different schedule, and the agreement's own
response window is **72 hours**. He pushes a branch on Saturday, gets nothing,
and cannot tell the difference between "Hassan's PC is off", "the runner
service stopped", and "my code is broken". All three look identical: a grey
check that never resolves.

**Two: the spec's own revisit trigger fires here.** 11.11 again: "A self-hosted
runner executes whatever a workflow on any pushed branch tells it to, on a
machine holding the owner's own data, which is acceptable exactly while this
repository is private and every writer is the owner or a session he runs;
making it public, or **admitting an outside collaborator**, revokes that and is
the revisit trigger."

Imran is a partner, not an outsider, so the letter of that clause is arguable.
The substance is not. Once a second person's agent can push a branch, that
agent can change `app/package.json`'s scripts, or add a test file, and the next
CI run executes it as Hassan's user on Hassan's PC, next to Hassan's `.env`,
his SSH keys and his Postgres cluster. Nobody has to intend harm for this to
go wrong; an agent that writes a broken `postinstall` is enough.

**Three: `concurrency: cancel-in-progress` on non-`main` branches means two
people pushing at once is fine, but two people pushing to two branches is
still one queue.** One machine serves every branch. Imran's branch and
Hassan's branch take turns, and each full run is on the order of 25 to 40
minutes given CLAUDE.md's measurements (~200s PGlite, ~60s Postgres, 15-20
minutes browser). Two active branches on a shared machine is a slow afternoon.

### 6.3 Options, with the trade-off of each

**Option 1 — Re-register the runner as it was.**
Free. Restores the status quo. Keeps every problem in 6.2. Reasonable as a
*today* action so that CI exists again, and I would do it regardless of which
option is chosen for the long run.

**Option 2 — Re-register, and make Imran's local gate the real gate.**
Free. Imran's agent runs the four commands from section 4.3 before opening a
PR and pastes the output into the PR body. CI becomes a second opinion Hassan
reads at merge time, not a gate Imran waits on. This matches how the project
already worked (11.11: "This project enforces that through the Integration
Steward rather than through a protected branch"). The cost is that Imran's
green is self-reported and is measured on his machine, not a clean one — but
lint, typecheck and the PGlite leg are genuinely deterministic and machine-
independent, so it is not as weak as it sounds. **This is the pragmatic option
and I would pair it with option 1.**

**Option 3 — Move the cheap legs to hosted Linux, keep the Postgres leg
self-hosted.**
Split the workflow in two jobs. A hosted `ubuntu-latest` job runs npm ci, lint,
typecheck, PGlite, build, Playwright — everything that needs no local database.
A self-hosted job runs only the real-Postgres leg. Imran gets a verdict in
minutes on everything he can affect; the one leg that needs Hassan's cluster
waits for Hassan's machine, and it is the one leg Imran's changes almost never
touch.

Cost: hosted minutes, discussed below. Complexity: the workflow becomes two
jobs, and spec 11.11 fixes the *seven steps and their order* as normative —
splitting them across jobs is a change to the shape it names and should be an
explicit amendment rather than an edit.

**Option 4 — All hosted, Linux.**
One job on `ubuntu-latest`, with a `postgres:18` service container for the
second leg, exactly the form the workflow had before commit `59737a8`. Hassan's
machine leaves the loop entirely. Both people get the same verdict from the
same clean box.

Costs beyond minutes, and they are real:

- The Postgres leg's database must be created with 11.10's exact statement
  (`LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`, plus
  `ALTER DATABASE … SET lc_messages='C'`). The `postgres:18` image will not do
  this by default; the old workflow used the image's plain `POSTGRES_DB` and
  therefore ran on glibc `en_US.utf8`. That is one extra step, not a blocker,
  but it must be written or AC-001 goes red in French.
- The Playwright step needs `--with-deps` back for Linux.
- Nothing in `app/` is platform-specific — I grepped `tests/`, `scripts/`,
  `db/` and `src/server/` for `win32`, `process.platform`, drive letters and
  `postgresql-x64` and found **zero hits** — so the suite should run on Linux.
  "Should" is inference; nobody has run it there since 2026-08-11.

**Option 5 — Hosted for pull requests, self-hosted for `main`.**
PRs get a fast, always-available verdict from a clean machine. `main` gets the
full self-hosted run that produces the release verdict. Costs hosted minutes
only for PR runs, which is the smaller share, and keeps the "the verdict a
merge is checked against" property that the `concurrency` block's comment
already protects for `main`.

### 6.4 What hosted minutes would cost — what I know and what I don't

**I could not verify current pricing from this session** and I am not going to
pretend otherwise. What follows is recall, and it should be checked against
GitHub's billing page before any decision rests on it.

From recall: a free personal account gets **2,000 Actions minutes per month**
for private repositories. Minutes are charged at a **multiplier by runner OS**:
Linux ×1, Windows ×2, macOS ×10. Beyond the included allowance, roughly
**$0.008/minute for Linux** and **$0.016/minute for Windows** on the standard
2-core runners.

What that implies, using CLAUDE.md's own timings (~200s PGlite, ~60s Postgres,
15-20 minutes browser, plus install/lint/typecheck/build):

- A full run is somewhere around **25-35 minutes**.
- On **Linux**, that is 25-35 billed minutes. 2,000 free minutes ≈ **60 to 80
  runs a month**. For two people on a side project, that is plausibly free.
- On **Windows**, the ×2 multiplier makes it 50-70 billed minutes per run, so
  ≈ **30 to 40 runs a month** before paying. Tighter, and there is no reason to
  choose Windows: the suite has no Windows-specific code.
- The browser leg is most of the bill. Option 5 (hosted PRs, self-hosted
  `main`) roughly halves it.

**Two things I want to flag rather than bury.** The reason hosted CI stopped on
2026-08-11 was, per spec 11.11, "an account billing failure" — not exhausted
minutes. That account (`dev-dana`) is gone. `zhssnym` is a fresh personal
account and would have its own allowance and its own payment method. Whether
the original failure would recur is not something I can determine from here.

And CLAUDE.md records that the owner "chose not to buy hosted minutes". That
decision was made when the only person waiting on CI was the owner himself,
sitting at the machine that ran it. The decision is worth re-taking now that a
second person waits on it from somewhere else, but it is Imran's to fund and
Hassan's to specify, per the agreement's sections 3 and 4.

### 6.5 What I would recommend

Do option 1 today, because CI existing at all is worth more than which shape it
has. Then run option 2 as the working rule: Imran's agent gates itself locally
and shows its work in the PR, and CI is Hassan's second opinion at merge time.
Then, once the flow has run a few times and there is real evidence about how
often Imran is actually blocked, decide between options 3 and 5 with a number
instead of a guess.

Add the failure-artifact upload (5.3 E) regardless of which option wins. It is
ten lines and it is the difference between Imran being able to debug a red
check and having to ask.

---

## What I could not verify

- **Finding A** — that the "Test on PGlite" step actually runs Postgres on the
  self-hosted runner. It follows from spec 11.11's own sentence about the
  runner `.env` being read "into each job's environment", plus the fact that
  the step-level `env:` block was deleted when the job moved from hosted to
  self-hosted. But there is no runner and no CI run to observe, so it is
  inference. One temporary echo step in CI settles it.
- **Current GitHub Actions pricing and the free-minute allowance.** Recall
  only, cutoff May 2026. Every number in 6.4 needs checking.
- **Whether GitHub Pro is roughly $4/month**, and whether it enables branch
  protection on a *personal* private repository. The 403 message names Pro
  explicitly, so the direction is right; the price is recall.
- **Whether CODEOWNERS review-enforcement works on this plan.** The
  `codeowners/errors` endpoint returns 404, which just means no CODEOWNERS
  file exists — it says nothing about plan support. My understanding is that
  CODEOWNERS *review requirement* needs branch protection, so on this plan it
  would be advisory only, but I could not confirm it.
- **Any test timing.** I ran nothing, as instructed. Every duration quoted is
  from CLAUDE.md or from a comment in the repository, attributed where used.
- **Whether the suite passes on Linux.** No platform-specific code exists in
  `tests/`, `scripts/`, `db/` or `src/server/`, which is evidence but not proof.
  Nobody has run it on Linux since 2026-08-11.
- **What operating system Imran uses.** Everything in section 4 assumes only
  Node 24 and a path with no dot-directories.
- **Whether the `pipelines` branch's uncommitted docs deletions are intended.**
  360 deletions sit unstaged, including all of `docs/team/`. I read the
  protocol from `main` instead. Not my scope, but worth someone confirming
  before a commit sweeps them up — CLAUDE.md records that two sessions sharing
  `D:\dana` share one index.

## Open questions for Hassan

1. **Do you want the runner re-registered against `zhssnym/dana` before
   anything else?** Nothing in the proposed workflow functions until it is, and
   right now the last CI verdict this project has is on an account that no
   longer exists.
2. **Finding A: is the "Test on PGlite" step really running Postgres?** If it
   is, the suite has not run on PGlite in CI since 11 August, and the two-leg
   guarantee spec 11.10 rests on has been half-empty for three weeks.
3. **Is section 3.4's folder move (`tests/api/`, `tests/support/`, `tests/e2e/`)
   worth one mechanical commit?** It is what makes CODEOWNERS say anything
   useful. If you would rather not touch 230 files, the alternative is
   CODEOWNERS lines matching the `ac-*` glob directly, which works but reads
   worse and breaks the day a filename does not match.
4. **Component tests: yes or no?** Five devDependencies are installed and
   unused, there are zero `.tsx` tests, and two tsconfig files carry long
   comments describing a leg that does not exist. If yes, it is the natural home
   for Imran's agent and the fastest loop in the project. If no, delete the
   dependencies and the comments, because right now the config describes a
   thing that is not there.
5. **Does Imran hold the committed Google credentials now?** `app/.env` is
   tracked and carries live values, so a clone hands them over. That was ruled
   deliberately on 2026-08-25 when there was one machine; it is a different
   decision with two. Also, the file's own first line still says "Gitignored,
   never committed", which is now false and should be fixed.
6. **Is `s22a-harness.ts` worth renaming to something a stranger can read?**
   Eight files import it. It is the only harness named after a session rather
   than a subject.
7. **Who renumbers when two branches take the same AC number?** Under section
   2's recommendation nobody ever needs to again, because nobody allocates new
   numbers. But if you would rather keep allocating them, this needs an answer
   before the first parallel pair of branches, because it has already happened
   five times and the fifth went unrecorded.
