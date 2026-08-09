# The acceptance suite

The numbered behaviors of spec section 12, written by the Adversarial Test
role and by nobody else (protocol section 8). Implementers do not edit these
files; an acceptance test that seems wrong is an escalation, not a patch.

Run one criterion by its number, which matches on the test name rather than the
file name:

```bash
npx vitest run -t "AC-105"
```

## Coverage

| Package | Criteria | State |
| - | - | - |
| P0 | AC-001 to AC-004 | Covered, passing |
| P1 | AC-005 to AC-010, AC-105 to AC-115 | Covered, passing |
| P2 | AC-011 to AC-024 | Covered, passing since the P2 merge |
| P2 gate | AC-116 to AC-118 | Covered, passing since the P2 merge |
| P2S | AC-119 to AC-123 | Covered, passing since the P2S merge |
| P3 | AC-025 to AC-044 | Covered, passing since the tasks router was mounted |
| P3 gate | AC-124 | Covered; three arms green since their repairs, the acceptance arm red until P5 mounts its surfaces (the kickoff ruling of 2026-08-09, see below) |
| P4 | AC-045 to AC-058, AC-070 | Covered; AC-046 to AC-048 red on the 7.8 tz defect until the pull takes tz |
| P4 gate | AC-125 to AC-131 | Covered, passing; numbered by the section 12 amendments of 2026-08-07 |
| P4 gate | AC-132 | Covered, red by design; the 7.8 tz ruling of 2026-08-08, implementer follows |
| P5 | AC-059 to AC-069 | Covered, red on the unmounted 7.5 and 7.3 routes until the package lands, the designed order |
| P5 proposals | AC-133 to AC-140, numbers proposed | Written with their tests for the mid-package change control to number, the P4 precedent; the six 8.10 files red against the P1 stub on its missing steps 1 to 6 |
| P6 to P10 | AC-071 to AC-104 | Not yet written |

P2's range was written before its implementation, per the RFC 0001 P2 row,
and failed on sentences naming the missing endpoints until the package
landed, which is the designed order. Its adversarial companions also pin the
amended 7.0 taxonomy on the package's surface, including the two edges the
P1 merge ruled and the P2 merge gate held: a non-object body and an
over-limit body both answer 400.

AC-116 to AC-118 arrived by the mid-P2 section 12 amendment and pin the
merged P1 surface: the exact /me body, the envelope on every 4xx, and the
status taxonomy. AC-118's probes stay on the /me surface deliberately: body
parsing is one boot-level middleware, so pinning the mapping on any real
endpoint pins it for the application.

P2S's range, AC-119 to AC-123, covers frozen 7.2's own endpoints, GET and
PATCH /me/settings; the GET /me object's settings key was already pinned by
AC-116. The criteria landed verbatim by section 12 amendment, carrying the
two readings of frozen 7.2 they rest on: the empty subset is a subset, and
null is a wrong-typed value rather than a clear, because 4.10's columns are
NOT NULL booleans with defaults. They failed on the missing routes until the
package landed, the same designed order as P2, and pass since the P2S merge.

P3's range, AC-025 to AC-044, covers frozen 7.6, 7.7, and 7.8 and the 7.0
TaskCard and TaskDetail shapes those endpoints answer. Written before the
implementation per the RFC 0001 P3 row, so the files fail today on the
routes answering 404, which is again the designed order.

Three things those files are written around, each recorded where it is
asserted rather than left to be rediscovered:

- **Two arms of 7.6's body are not P3's.** The P3 kickoff deferred
  recurrence_rule to P6, which delivers the 4.11 subset validator that
  section requires revalidated server-side, and reminder to P7, which
  delivers the 8.6 fire instant 4.8's NOT NULL fire_at column demands. The
  fixtures AC-028 and AC-040 turn on are therefore seeded directly, the
  folders-harness precedent for surfaces later packages own. The response
  side is not deferred: TaskDetail is 7.0's frozen shape and P3 answers it,
  rule and reminder keys included.
- **AC-039 spans two packages.** Its transition and the state every page
  queries are asserted here; the faded rendering is section 9's and arrives
  with P8, pinned by AC-053 at P4 and AC-097 at P8. The file says so rather
  than skipping the clause silently.
- **Concurrency is asserted twice.** AC-035 runs its two PATCHes as a real
  race and again as a deterministic partial-write probe, because 11.15
  records that PGlite is single-connection and a whole-row write could
  otherwise survive the race by luck.

  What single-connection does and does not cost the suite was measured at
  the P3 merge review rather than assumed, because a package fix was
  routed here on the belief that it costs everything. It does not: one
  connection serializes *statements*, not handler logic, so two requests
  in flight interleave their awaits and a read-then-write race is fully
  expressible on the default backend. Measured both ways on PGlite, at the
  domain level and through HTTP: two concurrent step adds against a task
  holding 49 steps leave 51 under a count-then-insert with nothing tying
  the two together, and answer 201 and 422 for a final 50 once the count
  and the insert are one locked decision. What the backend genuinely
  cannot express is anything needing two *connections* at once, which is a
  narrower set than it sounds.
- **AC-124 is the one criterion here that arrived green.** It rides P3's
  merge gate the way AC-116 to AC-118 rode P2's, and it measures three cap
  repairs that had already landed on this branch, so it passed on arrival
  instead of failing first. That inverts the order every other file in the
  package ran in, and it costs the thing the order buys: a test that has
  never failed has not been shown to discriminate. So the three arms were
  red-proven out of band before the file was written, by reproducing the
  unfixed shape, a count not tied to the write it admits, against the same
  tables on the default backend. Two callers arriving together at the limit
  minus one leave 51 steps, 26 members and 201 folders, where the three arms
  now leave 50, 25 and 200 with one caller refused 422. What could not be
  done is restoring the modules and running the file against them: the
  implementation is not this role's to edit, even temporarily.

  Its member arm carries one assertion the other two do not need. Two of
  7.4's guards answer 422 on that endpoint, the cap and the missing roster
  connection, so a refusal for the wrong reason would satisfy the statuses
  and the count alike. The loser is re-offered once a slot frees, and being
  admitted then is what proves the earlier refusal was the count.

  Since the P5 kickoff ruling of 2026-08-09 the member arm carries a fourth
  call site in the same file: two acceptances of two parked invites racing
  at 24 members, because the 10.3 cap binds every membership 8.7 grants and
  5.3's acceptance row was the fourth instance of this criterion's defect,
  not an exemption. No criterion text moves, the text naming the counted
  value rather than an endpoint. That arm arrives red, its invites and its
  race both traveling P5's unmounted surfaces, which restores the designed
  order for exactly the path whose implementation does not exist yet; the
  ruling's sequential refusals are the proposed AC-140's, in its own file.
- **The settled 7.7 and 7.8 bodies are pinned by AC-043 and AC-044.** Both
  sections were silent on what their mutations answer when those files were
  written, so they asserted statuses alone; the P3 shape review settled it
  and the owner entered it on frozen 7.7 and 7.8. Both step mutations and
  both My Day calls answer the affected TaskDetail, and POST
  /tasks/:id/steps answers 201 with the parent task rather than the created
  step, which rides in its steps array. Judged once each in the harness
  (`addStepOk`, `patchStepOk`, `pullIntoMyDayOk`, `dropFromMyDayOk`), the
  way `patchSettingsOk` judges the ruled 7.2 body: a whole TaskDetail, equal
  to what a fresh GET then answers. AC-044's four-call sequence stays on the
  raw transports, because it is the criterion's own calls in the criterion's
  own order and a GET wedged between them would transcribe something else.

P4's range, AC-045 to AC-058 and AC-070, covers frozen 7.10's nine endpoints
and section 6's twelve queries less the four that are not this package's: Q9
and Q10 already run on main, Q11 rides P7 and Q12 rides P5. Written before
the implementation per the RFC 0001 P4 row, so every file failed on a 7.10
route answering 404 until the views router was mounted, which is the designed
order again; they pass since.

Two of them were wrong when the router landed, and both were this suite's
rather than the router's. Recorded because the way each was settled is worth
more than the repair. AC-052 seeded its two tie rows with a clock read per
row, so they differed by the milliseconds the first insert took, Q3 settled
them on created_at, and the id tie-break the pair exists to reach was never
reached. And AC-052's narrow case asserted the all-day clause across the
whole page, which is not a stronger reading of the criterion but a false one:
due_date and status_rank both outrank the timed flag, so an all-day row on a
later date, and an abandoned all-day row on the same date, each correctly
follow a timed row. What settled the second as the file's own defect before
anything was edited is that the whole-sequence case above it passed against
the same response; both could not hold at once, and the sequence is the one
the file declares correct key by key. AC-126 asserts the same clause needing
only the date narrowing, because 6 Q3C puts the timed flag above status_rank
where Q3 puts it below, so the two files differ on purpose.

Six things those files are written around.

- **Nothing here writes.** Every earlier package set up through the
  endpoints of the package under test. P4 has no create, so its fixtures are
  inserted directly by `views-harness.ts`, and for a reason rather than for
  convenience: Q2 sorts by `created_at`, Q6 pages by `completed_at`, and Q8
  sorts by `updated_at`, and none of those columns can be dictated through
  7.6, whose transitions stamp them with the clock. Each file sweeps section
  3 over its own fixture, so a seed that violated an invariant fails as a bad
  fixture rather than passing as a good result.
- **`today(tz)` is computed in the harness and never imported.** The date
  predicates of Q1 and Q3C live in `src/server/time/**`, which the Scheduling
  engineer writes in the session after the tester's. Importing them would
  borrow the definition of correct from the module under test, the same
  standing ruling the timezone predicate already follows, and a wrong helper
  would then agree with itself while every date criterion passed vacuously.
- **AC-050 gives up its instant and keeps its content.** The criterion names
  2026-07-23 20:30 UTC, and faking the clock would decide for the implementer
  that `today(V)` comes from the process clock rather than from the database,
  which 8.1's "the server computes it" leaves open; the test would then be a
  false red against half of the correct implementations. So the split is
  asserted with Pacific/Kiritimati and Pacific/Honolulu, whose offsets differ
  by exactly 24 hours with neither observing DST, making the ahead zone
  exactly one calendar day ahead at every instant. Measured at every hour of
  2026 before being depended on, 8760 samples with no exception, and at the
  criterion's own instant those two zones read its own two local dates.
  Asia/Karachi and Europe/London are asserted beside them, unconditionally in
  the direction that needs no clock. The change control ruled this the closest
  faithful test rather than a reinterpretation, and section 12 records the
  ruling beside AC-046 and AC-050 without either criterion's text moving.
- **Date-relative fixtures anchor on a zone near local midday.**
  `middayZone()` picks, from twenty-five zones measured DST-free with
  whole-hour offsets at every hour of 2026, whichever is nearest 12:00 local
  now, so a fixture
  cannot be seeded on one side of a local midnight and read on the other. It
  is a function of the instant and no assertion branches on it; the residual
  is caught by `expectStillSameDay` rather than tolerated.
- **Every refusal is asserted beside a success on the same URL.** While the
  routes were unmounted every path answered 404, so a case asserting only a
  404 or only a 422 passed without discriminating anything, and would have
  gone on passing against an endpoint nobody mounted. The successes are
  asserted first, and the pairing stays now that the routes are green: it is
  what keeps a refusal case honest if a route is ever unmounted again.
- **Two criteria are split across packages, and the files say so.** AC-048's
  unassigned chip and AC-053's fading are section 9's and arrive with P8;
  what P4 owes is the null assignee the first is drawn from and the presence
  in Tasks and All that the second is drawn on. AC-058's "collapsed" is P8's
  too, and its 8.11 ratio rides the merged 7.4 Folder object rather than any
  7.10 body.

AC-125 to AC-130 were proposed here with their tests and numbered by the
Integration Steward's section 12 amendment on 2026-08-07. The proposal left
the numbers open on the belief that numbering is the human owner's, cited to
the AC-124 amendment, and the Steward corrected it: that amendment records
only that AC-124 was appended additively, and AC-116 to AC-118, AC-119 to
AC-123 and AC-124 were each numbered on the Steward's authority. An appended
number changes no existing number and therefore invalidates no criterion,
which is what places it there; what is the owner's is the frozen text of
sections 4 and 7. Three of the six cover the surfaces the RFC 0001 P4 row
names as uncovered: the calendar's 62-day refusal, search's keyset and page
size of 20, and the 1000-row cap with its `truncated` flag. Three more come
from that row's own sentence that its list is a floor: the calendar's real
rows, which are the whole substance of the one 7.10 endpoint that would
otherwise carry no criterion at all; Q8's 2-to-100 query length; and the
`tz` that frozen 7.0 gives every view endpoint, where 11.15's hole is live,
since bare `Intl` accepts `+05:30`.

**Every silence these files routed is now text, and the assertions moved with
it.** Seven were carried out of the first session; four were section 6's and
the Steward ruled them at the P4 change control, three were frozen section
7's and the human owner ruled them, all on 2026-08-07.

- `status_rank` gains its third rank, `completed = 2`, in the section 6
  preamble rather than only in Q8. AC-126 asked whether a completed banner
  was present in a calendar cell and now asks for the cell's whole sequence.
- The 1000-row cap is per response, with the rows kept being the first 1000
  in the order 7.10 enumerates that response's own sections. That allocation
  is more than AC-129 routed for, so its fixture gained four undated rows in
  a custom folder and two cases now assert where the cap bites: Tasks fills
  `inbox` before `groups`, and All places `planned` before the Tasks half
  takes the remainder. A total alone cannot see either.
- Q3C refuses an inverted range with 422. AC-125 accepted either answer and
  pins that one now.
- Q8 escapes backslash, percent and underscore in `q`. The three cases were
  written inside AC-057 and are now `ac-131-search-literal-wildcards.test.ts`,
  moved unchanged when the Steward numbered the rule. The judgment that put
  them in AC-057, that escaping is a property of Q8's predicate which that
  file already measures while each of the six numbered criteria closes a
  *number* the specification states and nothing asserts, was right when it
  was made and is superseded rather than contradicted: escaping was a silence
  when those six were authored and became a rule the specification states
  once the change control ruled it. The three were measured against real
  Postgres before being written: percent and underscore make an unescaped
  pattern return an extra row, and an unescaped backslash swaps the answer,
  returning the row without the backslash and missing the one the user typed.
- The `folder` inside `groups`, and inside `tasks_groups` of GET /views/all,
  is the `{id, name, is_default}` stub every `TaskCard` carries rather than
  the 7.0 `Folder` object. `views-harness.ts` asserts it key-exact now
  instead of at the intersection of the two readings.
- An absent `tz` answers 422 naming the field, where 7.0 had named only an
  invalid one. The Steward widened AC-130 rather than appending a number, on
  the ground the test now acts on: an implementation reading `tz` through a
  schema with a UTC default satisfies the invalid half exactly, a present
  wrong value reaching the validator where an absent one never does. The
  absent half is asserted on every endpoint, and it is the sharper of the
  two.
- `section` defaults to `open` on GET /folders/:id/tasks. AC-058 asserts it
  by equality against the explicit request, so a default that answered some
  other envelope fails.

One reading is stated in AC-058 and is not itself ruled: a `section` outside
the enumeration answers 422 rather than falling back to open, since absent
means open by the ruling and a wrong value is not absent. If that is wrong
the case is a false red and should be disputed rather than worked around.

The one silence these files were written around is closed. Frozen 7.2 named
no response body for PATCH /me/settings, only 200, so the opening session
judged none and held a place for the assertion; the owner ruled at the same
amendment, and 7.2 now carries the fresh-GET sentence it shares with PATCH
/me and the 7.4 mutations. The body is judged in that one place,
`patchSettingsOk` in settings-harness.ts: exactly the three booleans, equal
to what a fresh GET then answers. Two callers stay on the unjudged
transport. A refusal answers the envelope rather than the settings object,
and AC-120's raced pair cannot assert the fresh-GET half at all, since each
response is the truth at its own commit while a GET after both reflects
both.

P5's range, AC-059 to AC-069, covers frozen 7.5 and 7.3 and the 8.7 flows
as amended at the package kickoff of 2026-08-09, written before the
implementation per the RFC 0001 P5 row, so every file fails today on the
invite and connection routes answering 404, the designed order. Five
things those files are written around.

- **Two kickoff readings are load-bearing.** The indirect path's wire
  surface is POST /invites carrying folder_id and task_id, V-INV's
  conversion arm when the email is connected (AC-061's adversarial case),
  the parked invite otherwise (AC-065, AC-066); frozen 7.6's PATCH sentence
  stays exactly true. And this package's only 429 is 5.2's per-invite
  resend guard, asserted in AC-068: 10.4's per-user limits are P9's arm,
  AC-101. Beyond not asserting them, every file keeps each actor's POST
  /invites at five or fewer, so the limiter P9 adds ahead of the handlers
  (11.3) cannot trip a P5 file after the fact.
- **Sends are counted through the ratified sink**, the mid-P2 ruling: the
  share grant on conversion, the invite email on create and on resend, and
  the quiet transitions, decline and cancel sending nothing. Invite
  templates are matched by word, /invite/i, the share-grant convention.
- **Matching is equality and nothing more.** AC-064 attacks 8.7's sentence
  from both sides: case folds before comparing, a Gmail dot variant does
  not, and the variant's acceptance attempt answers the leak rule's 404.
- **Three inner shapes ride the endpoint shape review**, recorded at their
  judges in sharing-harness.ts: the object inside 201 { invite }, the
  acceptance response's folder object, and the sent-list element, each of
  which frozen 7.5 names without enumerating. The outer keys it does
  enumerate are asserted key-exact, the house rule.
- **The resend window is crossed by moving last_sent_at**, the AC-113
  precedent for reaching a timed boundary without waiting at it; both
  sides of the 24 hours are asserted, 429 with Retry-After inside, 200
  with one more counted email beyond.

The proposal batch, AC-133 to AC-140 with numbers proposed, rides the same
branch for the mid-package change control to number, the P4 precedent, and
its files carry their proposed texts verbatim so transcription is
mechanical. AC-133 to AC-138 are 8.10's steps 1 to 6, outcome by outcome:
sent invites invalidated with the sweep scoped by inviter and pending
status; transfer to the earliest join with the id tie-break, on seeded
join instants per the AC-019 precedent; the default and sole-member
folders deleted with the whole 8.8 cascade, where a dying folder's invite
is removed by FK while a surviving folder's is invalidated; R-CLEAN per
remaining membership including the drop-to-one INV-5 sweep; connections
deleted outright and My Day emptied, with a bystander pair as the control;
and the scrub with its survivors, created_by, completed_by, and
accepted_by still naming the scrubbed row while the assignment clears.
All six fail today on the P1 stub's missing steps 1 to 6, wrong behavior
rather than absence, their invite and connection fixtures seeded directly
so the red is 8.10's own. AC-139 pins the pending_invite_email derivation
end to end through POST /invites, including 8.7's clearing sentence, and
AC-140 is the kickoff ruling's sequential refusals: a full folder refuses
the conversion with nothing created and refuses the acceptance whole, the
invite left pending and acceptable once room opens.

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
rows. `settings-harness.ts` is the thin P2S layer over both: the exact 7.2
shape stated once, wire-beside-row state assertions, and the one place the
ruled PATCH response body is judged. `tasks-harness.ts` is the P3 layer over
the P2 one: the 7.0 TaskCard and TaskDetail shapes restated once and
asserted key-exact, the 7.6, 7.7, and 7.8 transports, seeding for P6's rules
and P7's reminders, and the task half of the invariant sweep, which
delegates the folder half to `expectFolderInvariants` rather than restating
it. `views-harness.ts` is the P4 layer over all of them: `today(tz)` computed
through `Intl` rather than imported, calendar arithmetic on 4.11 date
strings, the nine 7.10 response envelopes restated and asserted key-exact
with every row parsed through the frozen `TaskCard` check, fixtures written
directly with every column named, and cursor paging to exhaustion.
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
this one, and the proposed AC-139 pins the derivation end to end, on the
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
