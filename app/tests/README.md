# The acceptance suite

The numbered behaviors of spec section 12. `CODEOWNERS` asks Hassan to read a
change here, and since 2026-09-04 that is all it does: anyone may edit these
files, and what governs the edit is `docs/workflow/hard-stops.md`. **A criterion
changes only when the decision it pins changes, and the pull request names it.**
Nobody edits one to make their code pass: an acceptance test that seems wrong is
a finding you report and leave failing, which is `docs/workflow/README.md`'s
rule 6. `docs/workflow/backend/README.md` records the two counts in this suite
that are fixtures over the shape of the server rather than behaviours, and the
conditions for moving one.

*(The "Adversarial Test role" and the "protocol section 8" this paragraph used
to name were deleted at the workflow restructure, `a7886df` on 2026-09-01, and
are in git history before that commit. The rule they carried is unchanged.)*

Run one criterion by its number, which matches on the test name rather than the
file name:

```bash
npx vitest run -t "AC-105"
```

Two runners collect this directory and they never overlap. Vitest takes
`tests/**/*.test.{ts,tsx}`; Playwright takes `tests/e2e/**/*.spec.ts`, which is
the browser leg. Its own by-number form is `-g` rather than `-t`, and it needs
no file naming because the runner builds the client and boots the server
itself:

```bash
npx playwright test -g "AC-095"
```

*(That sentence used to say the browser leg is "the only place AC-091 to
AC-100 run". After the 2026-09-20 reduction only AC-091 of that range survives,
so the range is no longer a useful way to describe the leg and the claim was
removed rather than corrected into a list of one.)*

## Layout

**Four folders, one per kind, and nothing loose beside them but this file.**
Until 2026-09-20 this directory was flat: 47 tests, 22 support modules and an
`e2e/` folder all in one listing, which made `e2e/` look like the odd one out
when the real problem was that everything else had been tipped in around it.

```
tests/
  criteria/   ac-NNN-slug.test.ts    one executable criterion from spec section 12
  guards/     guard-slug.test.ts     pins no criterion; keeps the suite honest
  e2e/        ac-NNN-slug.spec.ts    the browser leg, plus its own harness.ts
  support/    harnesses and helpers  imported by tests; never collected as one
```

Neither runner needs telling about the split. Vitest's `include` is
`tests/**/*.test.{ts,tsx}` and matches at any depth; Playwright's `testDir` is
`tests/e2e` and its `testMatch` is `**/*.spec.ts`, so `support/` and
`e2e/harness.ts` are invisible to both by virtue of their suffixes rather than
by an exclusion anyone has to maintain.

`e2e/` keeps its harness rather than sharing `support/`: it is Playwright's,
not Vitest's, and the two harness layers have no code in common.

**Importing across the split.** A criterion or guard reaches its harness at
`../support/x.js` and the application at `../../src/...`. The colocated tests
under `app/src/**` that borrow a harness reach it at
`../../../tests/support/x.js`.

## Naming

**Two families, and the prefix says which.** A listing should be readable top
to bottom without having to open anything, which it was not until 2026-09-20:
three files sat among the criteria under names that described their subject
rather than their kind.

- **`ac-NNN-slug.test.ts`** — one executable criterion from spec section 12.
  `NNN` is the criterion number and it matches the number the test name carries,
  which is what `-t "AC-042"` finds. A file here pins a decision, and
  `docs/workflow/hard-stops.md` governs changing it.
- **`guard-slug.test.ts`** — an infrastructure guard that pins no criterion.
  These exist to keep the suite itself honest rather than to prove product
  behaviour: `guard-postgres-leg-isolation` fails any test that asserts server
  prose, `guard-postgres-leg-connection-loss` goes red if the pool's `'error'`
  listeners are removed, and `guard-document-transaction` covers the document
  transaction seam. They are not criteria and must never be renamed into the
  `ac-` family, which would claim section 12 numbers that do not exist.

Everything else beside them — `helpers.ts`, `*-harness.ts`, `http-client.ts`,
`oidc-stub.ts`, the `postgres-leg-*.ts` setup modules — carries no `.test.ts`
suffix, is collected by neither runner, and is support code rather than a test.

## Coverage

**This suite was cut to a core set on 2026-09-20, and what it covers is no
longer the whole of section 12.** The owner ruled that M1 velocity outweighs
exhaustive criterion coverage. 221 of the 268 criterion files here were
deleted along with 113 of the 119 browser specs, leaving **47 criterion files
carrying 232 cases and 6 browser specs carrying 20**. The colocated unit tests
under `app/src/**` were deliberately left whole: they are not criteria, they
are cheap, and they were not what made the gate slow.

**Section 12 was not cut with them.** Every criterion it states is still the
specification of Dana's behaviour; most of them simply have no executable form
in this directory any more. A criterion number that resolves to no file here is
not a criterion that stopped mattering, and its absence is not licence to change
the behaviour it names. `docs/workflow/hard-stops.md` still governs a criterion
that *does* exist.

The build-era coverage table that used to fill this section recorded, package by
package, what each range did at the merge that wrote it. It described files that
no longer exist, so it was removed rather than left to be read as current. It is
in git before this commit, as is every deleted test.

### Two criteria were failing when they were deleted

**This is the part of the cut worth being uncomfortable about.** The PGlite leg
measured immediately before the deletion was already red: three tests failed on
a tree nobody had touched. Two of the three were criterion files on the delete
list, so the cut turned their red into silence rather than into green:

- `ac-390-export-document-shape` — "it names itself and carries 7.22's
  top-level keys and no others";
- `ac-415-compose-migration-backfill` — "loose tasks, Section intro, Section
  tasks, and following blocks backfill in that order".

The third, `src/shared/workflows.test.ts`'s "a file that is neither arrangement
is still refused" (DES-206), is a colocated unit test and survives, so it is
still red and still visible.

**Both defects are unfixed and now unwatched.** They are plausibly the same
area as the open workflow round-trip issue. Whoever picks that up should start
from the deleted files in git rather than assume the behaviour is sound because
nothing is failing.

### What was kept, and on what rule

Four things earned a file, and nothing else did:

- **The structural sweeps.** `ac-397-authorization-sweep` (what a stranger gets
  from every id-taking route), `ac-001-constraint-catalog` (every named
  constraint and index), `ac-236-structural-guard-sweep`, and
  `ac-399-body-parsing-goes-through-parse-body`. These catch whole classes
  rather than single behaviours, and `hard-stops.md` leans on the first of them
  by name: a new route that takes an id writes its row there in the same change.
- **Anything whose failure loses or leaks data.** The delete cascades, the
  account-deletion scrub, file-serving scope, comment permissions, search scope,
  and the SVG polyglot refusal.
- **The state machine of the core objects.** Task create, patch, complete,
  abandon, uncomplete; folder rename and delete permissions; the Section
  hierarchy the M1 composer work builds on.
- **One smoke case for each expensive subsystem** rather than its matrix:
  recurrence generation, reminder fire instants, Today, invitations, duplication.

Everything else — UI copy, tooltips, empty states, the application shell, the
public surface, drag and drop, first-run, event history, and the long tails of
recurrence, reminders and views — was deleted. The browser leg keeps only what a
browser alone can prove: the offline shell, the landing page, the SPA fallback's
scope, the sidebar, one folder list, and quick-add.

### What this costs, stated plainly

A regression in a deleted area now reaches `main` silently. That is the accepted
trade, not an oversight. Two consequences worth holding onto: the permission
model in `docs/workflow/hard-stops.md` is loose *because* the tests were dense,
so the four sweeps above are now carrying more weight than they were designed
to; and a criterion reintroduced later should come back as a test, not as a
comment claiming it is covered.

## The two amendments these tests read closely

**7.1's tz parameter.** `GET /api/v1/auth/google` takes an optional `tz`. The
amendment specifies four behaviors and AC-005 and AC-007 pin all four, because
three of them are the kind an implementation gets right in one direction and
wrong in the other: a reported zone is stored at provisioning and synced on
return, no zone reported means UTC at provisioning and no sync on return, an
unparseable zone is treated as absent rather than answered 422 (a recorded
deviation from 10.3, so that a stale zone database cannot lock anyone out), and
a tzdb alias of the stored zone is not a different zone. AC-007 also pins the
carrier: 7.1 and 11.6 both say the zone rides the pending-authorization state
and never `redirect_uri` or any redirect target.

**10.1's sessions contract.** Four facts are fixed. Three so this suite can
observe expiry and clean up after itself: the table is named `sessions`,
`user_id` references `users(id)` `ON DELETE CASCADE`, and `expires_at` is a
timestamptz that every authenticated request resets to 30 days out. A fourth so
the migration and the module could be authored by separate owners without a
guess: the lookup key is a `token_hash` text column, the primary key, holding
the lowercase hex sha256 digest of the cookie's token. AC-113 asserts all four
and the behavior they exist for, including that the digest really is the
cookie's and that the raw token appears nowhere in the database. Rows are
addressed by `user_id` and never by the cookie value, because the raw token is
deliberately not there to match against.

The table is outside section 4, so AC-001 admits it as that catalog's one named
exception. Admitted means tolerated, not required: AC-001 is about section 4,
so it neither fails when P1 adds the table nor pretends to assert it. Every
other unexpected table is still a failure.

## The harness

`helpers.ts` is the P0 harness: the database seam, rejection matching by
constraint name, and user cleanup. `auth-harness.ts` adds what the P1 criteria
need, `http-client.ts` carries the transport, `oidc-stub.ts` is the stub
identity provider, and `folders-harness.ts` adds the P2 layer: lazily
signed-in casts, setup through the package's own endpoints, direct seeding
only for surfaces later packages own, and an invariant sweep scoped to named
rows. `bundle-harness.ts` is the thin layer over both for 7.23's settings bundle:
the exact eight-field shape stated once, wire-beside-row state assertions, and
the one place the ruled PATCH response body is judged. It was
`settings-harness.ts` and frozen 7.2's three booleans until issue #113 retired
that endpoint on 2026-09-04. `tasks-harness.ts` is the P3 layer over
the P2 one: the 7.0 TaskCard and TaskDetail shapes restated once and
asserted key-exact, the 7.6, 7.7, and 7.8 transports, seeding for P6's rules
and P7's reminders, and the task half of the invariant sweep, which
delegates the folder half to `expectFolderInvariants` rather than restating
it. `views-harness.ts` is the P4 layer over all of them: `today(tz)` computed
through `Intl` rather than imported, calendar arithmetic on 4.11 date
strings, the nine 7.10 response envelopes restated and asserted key-exact
with every row parsed through the frozen `TaskCard` check, fixtures written
directly with every column named, and cursor paging to exhaustion.
`reminders-harness.ts` is the P7 layer: actors whose users.timezone is stated
and written through 7.1's tz parameter, the frozen 7.9 transports with the
owner's 2026-08-10 ruling judged once, 4.8 rows seeded and read, fire-instant
arithmetic computed through Intl with the two DST policy rules deliberately
excluded from it, reminder sends counted through the ratified sink, and one
pass of 11.7's loop behind the assumed seam.
`e2e/harness.ts` is the P8 layer and the only one that never opens a database:
it reaches the application through a browser and a running server instead, so
its own section above rather than this list is where its decisions are.
`sharing-harness.ts` is the P5 layer: the 7.5 and 7.3 transports and their
frozen shapes restated key-exact where the text enumerates and no further
where it does not, actors signed in with chosen emails for 5.2's matching
rule, invite emails counted by word through the ratified sink, the
last_sent_at backdater, and the DELETE /me transport with the by-id user
reader the 8.10 files inspect the scrub through. Each file's header
explains its own decisions; the eight below are worth knowing before
reading any test.

**Outbound email is observed through an injected recorder.** 11.8's
notification module logs instead of sending under test, and AC-024 counts
share-grant emails, so `startAuthTestApp` offers `createApp` a
`notifications` sink beside `dbClient` and `auth` and exposes what arrived as
`app.emails`. Fields are normalized by property, not name, the same way
cookies are identified. The seam is assumed in one place and its ratification
into 11.10 is escalated to the Integration Steward.

**The stub is the Adversarial Test role's, exclusively.** The Security
engineer's module passes against it unmodified and never edits it (personas 06
and 11). It refuses an authorization request that arrives without a PKCE
challenge, which is what stops AC-107 from being satisfiable by an
implementation that never sends one.

**Cookies are identified by property, never by name.** Spec 11.6 fixes that the
session cookie is httpOnly and the CSRF cookie is not, and fixes no names.

**The auth base is `/api/v1`.** This was probed while 7.0's base path and 7.1's
short spellings could each be read as the mount point. The amendment settles
it, so the probe is gone: tolerating a root mount would now mean tolerating a
specification violation.

**Redirects are asserted through one helper**, `expectRedirect`. Written as a
pair of bounds, a 404 satisfies the lower one and fails the upper one, so the
failure lands on whichever half carries no message and the report names
nothing. Every redirect assertion in the suite goes through the helper for that
reason.

**The timezone predicate is aligned with the shared validator, not imported
from it.** `isIanaTimezone` here refuses identifiers opening with a sign, the
same guard `app/src/shared/timezone.ts` carries, because 11.15 records that
`Intl.DateTimeFormat` accepts ECMA-402 offsets like `+05:30` that are not IANA
names. Importing the validator would be borrowing the definition of correct
from the module under test, so a wrong validator would agree with itself; the
two were checked once, off to the side, and agreed on offsets, aliases, case
variants and malformed input alike.

**Frozen response shapes are restated in the harness, never imported, and
asserted key-exact.** The 7.1 object, the 7.2 booleans, and the 7.0 TaskCard
and TaskDetail each appear as a key list in the harness that reads them, by
the standing Steward ruling: this suite measures `app/src/shared/` and
cannot borrow its definition of correct. Exact because those shapes are
enumerated in a frozen section, so a missing key breaks the client contract
and an extra one is drift it cannot absorb.

The tolerance this paragraph used to record is closed. TaskCard's
`pending_invite_email` was the one value the shape check tolerated, its
derivation from `invites.task_id` belonging to P5, the package that creates
those rows, and nothing in section 12 pinning it. P5's tester session is
this one, and AC-139 pins the derivation end to end, on the
detail read and on a view row, through the newest-invite-wins clearing rule
of 8.7 and back to null on a terminal transition. The shape check in
`tasks-harness.ts` stays value-tolerant on that one key, which is now a
division of labor rather than a gap: a shape judge cannot know which email
a particular card should carry, and the criterion's own file asserts it.

The other tolerance is gone, closed by the thing that created it. TaskDetail's
reminder was read loosely here while 7.0 said only "{offset_minutes or
time_of_day}", which names a 4.8 mode rather than a key list, so a one-key
object and a two-key object with one null were both faithful. The P3 shape
review settled it and the owner entered it on frozen 7.0: both columns
always, exactly one non-null, because a stable key set is what lets a client
read the mode off the values. The harness asserts that now, and the same
paragraph settled the wire format of the floating values, so `due_time` is
`HH:MM` exactly where the seconds Postgres renders `TIME` with used to be
admitted.

**Temporal columns are rendered by the database, never handed over by the
driver.** The two backends disagree about what a date or an instant column
hands to JavaScript: PGlite returns the string Postgres printed, while
node-postgres registers a parser for OID 1082 and OID 1184 and returns a JS
`Date`. A reader that takes either straight from the driver therefore reads
one thing on the default leg and another on the `postgres:18` leg that 11.10
makes the production-fidelity authority. So the readers in `tasks-harness.ts`
project every temporal column through `to_char`, which answers text on both
backends, in 4.11's own format, exactly as the domain module serializes every
floating date. Formatting on the JavaScript side was rejected: `postgres-date`
builds a date-only value at local midnight, so `toISOString()` on it prints
the previous day on any machine east of UTC, which is the shift 4.11 stores
floating dates to avoid.

Instants keep all six digits, which is the half that matters most. A
`Date` stringifies at one-second resolution, so before this the package's
"a no-op wrote nothing" and "the refusal touched nothing" assertions
compared `updated_at` across operations that take microseconds and would
have passed on that leg whatever was written. `tasks-harness.test.ts` is the
guard: a unit test of these readers (protocol section 8, unit tests belong
to the module's owner) that pins the three formats and proves one microsecond
of movement still fails an equality. It runs on both legs, so a reader that
regresses fails there once, attributably, instead of somewhere else twenty
times or nowhere at all.

## What the tests need from outside `app/tests/`

One seam, now recorded in 11.10 rather than assumed. `createApp(options?)` in
`src/server/index.ts` is synchronous, performs no I/O, and opens no database:

```ts
createApp(options?: {
  dbClient?: DbClient
  auth?: {
    issuerUrl: string
    clientId: string
    clientSecret: string
    appOrigin: string
    allowInsecureRequests: boolean
  }
}): Express
```

`options.auth` wins over the environment variables that remain the production
path, and the harness sets both (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_ISSUER_URL`, `APP_ORIGIN`, `OIDC_ALLOW_INSECURE`), so an implementation
reading either is fed. Only the database handle genuinely needs the parameter,
because under the default PGlite backend it is an in-memory object that cannot
arrive as a connection string. Routes that touch the database require
`options.dbClient` and fail only when called without it, which is what lets
AC-114 construct the application bare to ask whether a route exists.

Three implementation properties the tests depend on, all now in the
specification rather than inferred:

- The issuer is injectable (11.10). An implementation that hardcodes
  `accounts.google.com` cannot be tested at all.
- `Secure` is set unconditionally, never derived from the request's transport
  (11.6). The suite speaks plain http, and in production TLS terminates ahead
  of the process.
- `DANA_DEV_LOGIN` is read at `createApp()` call time, never at module load
  (11.6), and the development login route is excluded from the compiled output
  rather than guarded at runtime. 11.15 records why that is delicate: tsc emits
  a tsconfig-excluded file anyway if any resolvable import names it, a literal
  dynamic `import()` included.

## One thing this suite needs from `vitest.config.ts`, and does not have

A global `testTimeout`. The config sets `environment` and `include` and
nothing else, so all but six of this suite's 522 cases run under Vitest's
5000 ms default. The six that do not are AC-114's five and one of AC-109's,
which name their own.

**Counts in this section are from before the 2026-09-20 reduction and are not
re-measured; AC-109 and AC-070, named below, were deleted by it while AC-114
was kept.** The argument survives the cut unchanged, because it is about the
absent default rather than about how many cases sit under it: a smaller suite
under the same 5000 ms ceiling still reports a timeout as an Error that does
not say what it was measuring. The numbers are left as the dated measurement
they were rather than rewritten into a freshness they have not earned.

That default is not a comfortable margin here, and the measurement is this
suite's own rather than an argument from principle. Across five consecutive
full runs on an otherwise idle machine, AC-114's slowest case ranged from
1941 ms to 5811 ms. It crosses the five second line, and the only reason it
is not a failure is the `MODULE_LOAD_TIMEOUT = 120_000` its author wrote for
exactly this reason, recorded in that file's header. Nothing else in the
suite has that protection: AC-070's slowest case measured 1237 ms to 2784 ms
over the same five runs, a spread of more than two to one under a ceiling
less than twice its own maximum, and several P2 cases sit in the same band.

Why it matters more than the seconds suggest. A test that exceeds its
timeout is reported as an Error rather than as an assertion failure, so it
does not say what it was measuring, and a run that loses one this way differs
from the previous run by exactly one failure with nothing in the output
naming what moved. The operator measured two gate runs on a byte-identical
tree at 141 failures and then 140, and the Steward two more at 140 and 140;
this is the only mechanism found so far that produces that shape, and it is
load-dependent, which is why nine clean runs in a row do not clear it.

The change is one line in `vitest.config.ts`, which belongs to Platform, and
is escalated rather than made here. Adding per-case timeouts to 516 cases
instead would be the same fix written 516 times, and would leave the next
file written without one exposed again.
