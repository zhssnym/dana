# The acceptance suite

The numbered behaviors of spec section 12, written by the Adversarial Test
role and by nobody else (protocol section 8). Implementers do not edit these
files; an acceptance test that seems wrong is an escalation, not a patch.

Run one criterion by its number, which matches on the test name rather than the
file name:

```bash
npx vitest run -t "AC-105"
```

Two runners collect this directory and they never overlap. Vitest takes
`tests/**/*.test.{ts,tsx}`; Playwright takes `tests/e2e/**/*.spec.ts`, which is
P8's browser leg and the only place AC-091 to AC-100 run. Its own by-number
form is `-g` rather than `-t`, and it needs no file naming because the runner
builds the client and boots the server itself:

```bash
npx playwright test -g "AC-095"
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
| P3 gate | AC-124 | Covered, passing; three arms green since their repairs and the fourth, the 8.7 acceptance arm of the 2026-08-09 kickoff ruling, since P5 mounted its surfaces |
| P4 | AC-045 to AC-058, AC-070 | Covered, passing since the 7.8 tz repair and the P4 merge |
| P4 gate | AC-125 to AC-131 | Covered, passing; numbered by the section 12 amendments of 2026-08-07 |
| P4 gate | AC-132 | Covered, passing since the same repair; written red by design, green once the implementer's session followed the tester's |
| P5 | AC-059 to AC-069 | Covered, passing since the P5 merge; written red against the unmounted 7.5 and 7.3 routes, the designed order |
| P5 gate | AC-133 to AC-140 | Covered, passing since the P5 merge; proposed here with their tests and numbered by the section 12 amendment of 2026-08-09, written red against the P1 stub's missing 8.10 steps 1 to 6 |
| P5 gate | AC-141 | Covered, passing since the P5 merge; appended by the same date's amendment from the owner's ruling rather than proposed here |
| P6 | AC-071 to AC-082 | Covered, passing since the grammar reached 7.6's write bodies, generation and G-SERIES reached the transition seams, and Q3C's virtual arm got its own fetch; written red before any of it existed |
| P6 gate | AC-142, AC-143 | Covered, passing since the same four commits; proposed here with their tests and numbered by the section 12 amendment of 2026-08-10 |
| P7 | AC-083 to AC-090 | Covered, failing against the unmounted 7.9 routes and the absent scheduler module, the designed order |
| P7 gate | AC-144 to AC-153 | Covered, failing the same way; proposed here with their tests and numbered by the section 12 amendment of 2026-08-10 |
| P7 gate | AC-154 | Covered, failing the same way; appended by the same amendment from the change control's own ruling rather than proposed here |
| P7 gate | AC-164 | Covered, passing on arrival; the one criterion in this package written after its implementation, numbered from outside the branch because P8 held a concurrent range |
| P7 gate | AC-168 | Covered, red on one arm by design: 8.5's copy writes a past instant scheduled, which is the defect the third change control ruled. The three other arms pass, and only the PUT pair is a regression guard |
| P8 | AC-091 to AC-100 | Covered, passing in the Playwright leg since the grouped run built the client; written red against P0's placeholder and green in the order that was designed |
| P8 | The halves of AC-039, AC-047, AC-048, AC-053, AC-058 and AC-141 that earlier files recorded as arriving here | Covered, passing in the Playwright leg. Those criteria stay in their own packages with their server halves green where they are |
| P8 gate | AC-155 to AC-163, AC-165 to AC-167 | Covered, passing in the Playwright leg; proposed here with their tests and numbered by the section 12 amendment of 2026-08-11. The gaps at 154 and 164 belong to package P7 and are deliberate |
| P8 gate | AC-169 to AC-172 | Covered in the Playwright leg; appended by the second section 12 amendment of 2026-08-11 from that change control's rulings rather than proposed here. AC-171 and AC-172 pass; AC-169 and AC-170 are red by design against the reminder write the client does not yet have |
| P9 to P10 | AC-101 to AC-104 | Not yet written |

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
  ruling's sequential refusals are AC-140's, in its own file.
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
implementation per the RFC 0001 P5 row, so every file failed on the invite
and connection routes answering 404 until the package landed, the designed
order. Five things those files are written around.

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

AC-133 to AC-140 were proposed here with their tests and numbered by the
Integration Steward's section 12 amendment on 2026-08-09, the AC-125 to
AC-130 precedent for a batch authored on the branch and numbered at a
mid-package change control. AC-133 to AC-138 are 8.10's steps 1 to 6,
outcome by outcome:
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

AC-141 did not come from here, and the difference is worth keeping. This
session escalated the bare invite to an already-connected email as a
genuine silence in 8.7's conversion arm and recommended 200 with nothing
created; the Steward recommended 409, and the human owner ruled 409 on
2026-08-09, so 7.5, 8.7 and 9.8 now carry the refusal and the Steward
appended the criterion from the ruling, the AC-124 shape rather than the
AC-125 one. Only its test is this role's, which is why its file states the
criterion as settled text and records the recommendation it lost. The
discriminator is what the file is built around: the same email answers 409
bare and runs AC-061's conversion with a folder attached, so both arms are
asserted in one file against one roster, and neither can be satisfied by an
endpoint that simply refuses or simply converts everything.

P6's range, AC-071 to AC-082, covers the 4.11 subset on frozen 7.6's two
write bodies, 8.5's generation and projection, and 5.1's G-SERIES guard,
written before the implementation per the RFC 0001 P6 row and passing since
it landed. Its layer is `recurrence-harness.ts`. Five things those files are
written around.

- **Rules are seeded and transitions are requested.** No API attached a
  recurrence_rule until this package's schema arm landed, so every fixture
  creates its task through POST /tasks and then writes the rule with the P3
  harness's `seedRecurrence`. Without that split each generation criterion
  would have failed on a validator rather than on the engine it is about, and
  the split still earns its keep now that both exist: a generation failure
  stays attributable to generation. AC-071 is the exception and the reason
  the exception is safe: it is the criterion that asserts the write path, so
  it sends rules through both bodies.
- **Four criteria are asserted by their content, not at their dates.** The
  section 12 ruling of 2026-08-10 covers AC-072 to AC-075, the AC-046 and
  AC-050 treatment from P4: each computes today in the midday zone, dates its
  occurrence relative to it, and builds a weekly rule on that date's own
  weekday. That mapping is one function in the harness with a unit test of
  its own, because a wrong weekday would fail four criteria in the engine's
  name. AC-082 is outside the ruling and runs literally at July 2026, on the
  six-week grid 9.5 fixed at the same change control after this range
  escalated the silence; its range constants already spelled those six weeks.
- **UNTIL is written in RFC 5545's DATE form, YYYYMMDD.** These files derived
  it from frozen 4.11, which calls the column an RFC 5545 RRULE value string
  and UNTIL "a date, inclusive per RFC 5545", and escalated it as the one
  piece of the grammar the suite spells rather than quotes, since the grammar
  module would otherwise derive it separately and could derive it
  differently. 11.9 records the reading at the P6 change control of
  2026-08-10, as a reading of frozen 4.11 rather than a change to it, and it
  is the form these files already used.
- **The criteria that assert an absence run a positive control first.**
  AC-078 and AC-082 both assert that something does not happen, and nothing
  happening was also what a branch with no engine did: the 7.10 virtual array
  answered empty from P4 until this package filled it. Eight of AC-082's ten
  cases and four of AC-078's six passed on arrival for that reason, which is
  why the controls are there and why they stay: they are what makes each of
  those cases discriminate now. AC-082 requires the
  2026-08-03 ghost in the same response before asserting any date is empty,
  and AC-078 completes an unbounded occurrence through the same call, which
  must generate and must move its rule.
- **AC-077 is a real race, and its header says what each leg proves.** Both
  completes are issued under Promise.all. Each transition is one transaction,
  so on PGlite the pair queues and on CI's postgres:18 leg it overlaps; the
  assertions are the criterion's own outcome, one successor and one
  completed_by, which both legs satisfy identically. Asserting that an
  overlap was observed would be a false red about the backend.

Two defects in these files were found by the implementer sessions rather than
by the suite, escalated rather than edited, and repaired here. Both are worth
keeping because neither was a wrong expectation about the specification.

- **A shared helper answered NaN and nobody saw it.** `countRows` reads one
  column named n, the `count(*)::int AS n` contract all forty-six call sites
  in the suite were written to, and three P6 sites passed `SELECT id`
  instead. One met `.toBe(0)` and failed visibly. The other two compared a
  count before an operation against the count after: NaN on both sides,
  `toBe` uses `Object.is`, and `Object.is(NaN, NaN)` is true, so AC-071's "a
  refused create writes no task at all" passed while reading no count at all.
  A vacuous green is worse than a red because nothing reports it. The call
  sites carry the contract now, `countRows` asserts it rather than returning
  NaN, and `folders-harness.test.ts` guards both halves.
- **AC-080's third companion asserted the wrong outcome.** It expected 409
  where 5.1's first branch requires 200. Reopening the newest row of a series
  puts a pending sibling back into it, and "S exists: allowed" carries no
  positional condition, so the sibling is what admits the older row's
  un-complete rather than a second reason to refuse it. That file's own
  header had already reasoned exactly this, three paragraphs above the
  assertion contradicting it. The companion now walks one series through all
  three branches in order, refused, reopened, then admitted, and asserts the
  first branch's full effect: S deleted, its rule copied back, the older row
  pending again, reaching across the completed middle row to do it.

AC-142 and AC-143 were proposed here with their tests and numbered by the
Steward's section 12 amendment of 2026-08-10, the AC-125 and AC-133
precedent; both criteria are section 12's own text now, taken whole from
these two file headers, so no assertion in either file moved when they were
numbered. AC-142 pins the cutoff's zone: the owner ruled on 2026-08-10 that
complete and abandon take tz and frozen 7.6 carries it, and nothing numbered
touched any of it, which was AC-132's hole one package later and with worse
arithmetic, since every criterion in this range is satisfiable from the wrong
zone for part of every day. Its discriminator is AC-132's, two zones exactly
a day apart, and no single stored or process or database clock can date both
successors. AC-143 is the surface the RFC 0001 P6 row routed to this session
to judge: Q3C projects for every accessible pending rule-carrying series,
including one whose current occurrence falls before the range, and nothing
asserted that scope while AC-082's own series sits inside its range, so an
implementation projecting off the range-bounded real rows passed the whole
existing suite and emptied every month-ahead view.

P7's range, AC-083 to AC-090, covers 8.6's computation and trigger list,
frozen 7.9 as ruled on 2026-08-10, 4.8's three states, and 11.7's loop with
its three skips. Its layer is `reminders-harness.ts`. Written before the
implementation per the RFC 0001 P7 row, so the write half fails on PUT
/tasks/:id/reminder answering 404 and the delivery half fails on one named
assertion saying no scheduler module could be loaded. Seven things those files
are written around.

- **The computation criteria go through the write path and the delivery
  criteria seed their rows.** This is P6's rules-seeded, transitions-requested
  split applied to the other half of the same problem. AC-083 to AC-086 and
  the recompute numbers create their reminders through 7.9's PUT or 7.6's
  create body, because what a write path computes is what they are about;
  AC-087 to AC-090 and AC-153 seed a 4.8 row with a chosen mode, value,
  fire_at and state, so their failures stay attributable to the loop rather
  than to a PUT nobody has written. Instants are moved with SQL, the AC-113
  and P5 precedent for reaching a timed boundary without waiting at it.
- **Fire instants are computed in the harness through Intl, and the two DST
  policy rules are not computed at all.** The standing rule is the suite's:
  importing the module under test would borrow its definition of correct.
  Section 13 item 25 makes Intl inadmissible for 8.6's two rules specifically,
  being Luxon's own engine, so the gap and fold instants are hand-derived
  constants carried beside the instant 11.9 records raw Luxon would answer.
  `reminders-harness.test.ts` is the guard on the rest, and it records one
  measured correction: the harness's read-back check catches a gap and does
  not catch a fold, where both instants read back correctly and the helper
  reaches the later one, which is the instant 8.6 refuses.
- **Every DST fixture is a historical transition and asserts it still is.**
  Item 25's reason is that the Node runtime and the embedded engine of 11.10
  carry tzdb copies that move independently, so a fixture on a future
  transition is a flake waiting for an upstream release. America/New_York
  under the rule unchanged since 2007 and Europe/London under the EU rule
  unchanged since 1996, both in 2010, and `expectGapFixture` and
  `expectFoldFixture` read the transition off the runtime before anything
  leans on it.
- **11.9's claim that AC-083 to AC-086 pin both DST rules was closed by
  splitting it.** Those four now instantiate DST arithmetic, which is the
  tzdb half: AC-084 puts one wall time on two due dates either side of a
  transition, AC-085 moves a due date across one, AC-086 moves two due dates
  with one login. The two policy rules, which have no correct answer to
  compute, are AC-144 and AC-145, numbered on item 25's recorded expectation
  that a case buried inside another criterion is invisible to the grep this
  role's First moves prescribe. 11.9 names the two groups separately now, and
  item 25's coverage half is closed while its no-oracle reasoning, its fixture
  rule and its Luxon-upgrade revisit trigger stand.
- **Two criteria cannot discriminate in the fixture they name, and both files
  say so.** AC-090's "the recipient is that member" is satisfied in a
  single-member folder by an implementation that mails every member, INV-5
  making those the same person, and AC-088's "no broadcast" is unobservable
  for the same reason. Each asserts its criterion's own fixture and then a
  three-member one where the assignee and the folder are different sets.
- **AC-089 states what each backend leg proves.** 11.7 claims due rows with
  SELECT ... FOR UPDATE SKIP LOCKED, which is contention between concurrent
  transactions, and 11.15 records that PGlite is single-connection and that
  what genuinely needs a second connection is a second concurrent transaction.
  So two passes issued together queue locally and overlap only on CI's
  postgres:18 leg, and the assertions are the outcome both must produce, one
  email and one fired_at. That an overlap was observed is asserted nowhere,
  which would be a false red about the backend; AC-021, AC-077 and AC-124
  carry the same sentence. AC-088 records the neighbouring limit: the 11.10
  seam makes sends observable and nothing else, 10.5 keeping addresses out of
  the logs on purpose, so that criterion's "logged" is asserted as 4.8's state
  and fired_at and the file says so rather than skipping the clause.
- **One seam is stated in one place, and 11.7 now carries it.** That section
  makes the delivery loop a plain callable rather than a route and frozen
  section 7 offers no endpoint that runs one pass, so the suite cannot reach
  it over HTTP the way 11.10 reaches everything else.
  `reminders-harness.ts` loads `app/src/server/scheduler/index.ts` through a
  computed specifier, the loader shape 11.15 records and
  `src/server/auth/router.ts` already uses, so its absence is one named
  assertion rather than a module-load crash that would take a whole file's
  coverage with it. Proposed here and ratified into 11.7 at the change control
  of 2026-08-10, the options.notifications precedent; the export-name
  tolerance was kept on purpose, so the implementing session picks
  `createReminderPass` or `runReminderPass` and this loader accepts either.

Three cases in this range arrive green, and each is a property main already
has that P7's own work could take away: AC-087's "the transition leaves the
reminder row untouched", and AC-150's two controls, the closing occurrence
keeping its own reminder and a rule-less series acquiring none. AC-124's
header records why a test that has never failed is worth naming as such.

AC-164 arrives green in full, and it is the one criterion here written after
its implementation. The reason is outside the branch and is recorded rather
than smoothed over: P8 was live in a second tree proposing criteria
concurrently, neither branch could see the other's range, and section 12 held
this one under a pending heading until the coordinating session assigned the
number across both ledgers. AC-131 is the precedent. Two things limit the
cost. Both arms were fully specified in 8.4 and frozen 7.6 before the
implementing session read either, so the file tests a written rule rather than
a silence; and both wrong cascade rules, deleting on no due_time edit and
deleting on every one, were red-proven against the same tables in a throwaway
file before the green was believed, the repayment AC-124 made for the same
debt.

**The six files that run a pass count only their own emails.** A pass polls
every due row in the database, which is 8.6's poll and not something an
implementation may narrow, and under TEST_DATABASE_URL every file shares one
database with no fileParallelism set, so one file's pass can deliver another's
due rows through the same sink and redden both. `reminderEmailsOf` takes the
file's own `ZoneCast` and filters by recipient address, and `reminderEmails` is
no longer exported, so the scope is structural rather than remembered at each
call site. It weakens nothing: a broadcast to a folder is a broadcast to that
file's own members. This was reasoned from 8.6 and from the vitest config
rather than measured, because this machine has neither Docker nor a
TEST_DATABASE_URL, and it was fixed rather than deferred because CI stops at
its first failing step, so the postgres leg had never run on this branch.

AC-144 to AC-153 were proposed here with their tests and numbered by the
Integration Steward's section 12 amendment on 2026-08-10, the AC-125, AC-133
and AC-142 precedent for a batch authored on the branch and numbered
additively so nothing moves. AC-144 and AC-145 are the two DST policy rules
above. AC-146 to AC-150 are five of the six surfaces the RFC 0001 P7 row
listed as unasserted and called a floor: the reminder DELETE, which no
criterion touched at all; the 7.9 write guards AC-090 does not cover,
including the no-due_date refusal 7.9 names separately; the upsert and its
state reset; the reminder arm of 7.6's create body, deferred since P3 and
silently dropped until it lands; and 8.5's copy onto a generated successor,
which P6 recorded as asserted by no criterion in its own range either. The
sixth, AC-089's six-hour boundary from both sides, is inside AC-089. AC-151 to
AC-153 come from the row's sentence that its list is a floor: 8.6 names five
recompute triggers and section 12 asserted three, so due_time and assignee_id
gain one each, and AC-153 pins that 8.6's poll filters on state, without which
one deadline sends an email every sixty seconds for six hours.

Two of the amendment's texts carried a clause the proposals had left to their
assertions, and no assertion moved for either. AC-144 and AC-145 now name the
raw Luxon answer each rule refuses, which `expectNotFireAt` had asserted since
those files were written. And AC-148 now states that its instant is in the
future, which both its cases already used: the change control qualified frozen
7.9's PUT bullet on this suite's own escalation, so a past instant answers
skipped, and the criterion states the condition rather than leaving the two
texts to meet later. Two assertion messages in that file quoted the old
phrasing and were refreshed to the qualified one, quotations only.

AC-154 did not come from here. The change control ruled the silence this suite
escalated and appended the criterion from its own ruling, the AC-124 and
AC-141 shape, so only its test is this role's. What it settles is narrower
than the ground this suite argued: the recommendation carried "a sent reminder
is history", and the Steward declined that as over-general, since generalized
across all five triggers it would leave a user who pushes a deadline out by a
week hearing nothing while still seeing a reminder configured. The line drawn
instead is what the trigger changes. Four of the five change the occasion, its
deadline, its lead time or the person owed it, and a new occasion earns a
delivery, which is why AC-148 pins that a PUT does revive a sent row. A zone
change re-expresses an unchanged occasion on a different wall clock, so it
alone leaves a delivered row alone; frozen 7.1 scoping its recompute to
scheduled reminders while 7.7 scopes its own to no state was the contract
drawing that same line already.

Both silences these files routed are now text. Frozen 7.9 said a PUT resets
state to scheduled while 8.6 says a recompute landing in the past sets it to
skipped and never fires retroactively, and a PUT computing a past instant
satisfied both differently; the owner qualified the bullet, skipped, on the
ground that a scheduled row with a past instant is delivered by the very next
pass inside 11.7's six-hour window, which makes 8.6's own rule unreachable
rather than merely disagreeing with it. AC-083 still asserts fire_at and not
state, because that criterion is about the instant, and AC-148 still confines
itself to future instants, which is now what isolates the revival from the
refusal sharing its bullet. And whether a reminder already sent recomputes
under a zone change is 8.6's own text now and AC-154's; AC-086 continues to
assert neither reading of it, deliberately, so the two files do not both own
one rule.

P8's range, AC-091 to AC-100, is the first that runs in a browser, and it runs
in the Playwright leg alone: protocol section 4's gate does not name Playwright
and 11.11's CI order does, so a P8 session reporting the four-command gate
green has not shown its criteria pass. The seam splits by file. The
configuration, `@playwright/test`, the browser install and the npm script are
Platform's; every spec and every harness under `tests/e2e/` is this role's, by
its Owns section. `vitest.config.ts` includes `tests/**/*.test.{ts,tsx}` and
`playwright.config.ts` collects `tests/e2e/**/*.spec.ts`, so no file is claimed
by both and neither config knows about the other.

Written before the implementation per the RFC 0001 P8 row, so every case fails
today against P0's placeholder client. That is the designed order again, and it
costs more here than in any earlier package: a page that renders nothing
satisfies every assertion of an absence, so **every absence in this leg is
paired with the same locator finding the thing on a page that must have it**.
AC-096 finds the floating add button on Tasks before asserting it is not on
Done; AC-157 asserts the general error toast on an ordinary failure so that its
two "not the general toast" cases are not vacuous; AC-161 reads the step cap
notice at forty-nine steps before asserting it at fifty. This is the P4
discipline of asserting every refusal beside a success on the same URL, applied
to a leg where the whole application is the thing that does not exist yet.

Six things these files are written around.

- **`tests/e2e/harness.ts` is the P8 layer**, the analogue of
  `views-harness.ts`: 11.10's development login, the CSRF token, fixtures
  through section 7, section 9's copy, 9.1's route table, and the addressing
  helpers. Sign-in is keyed by `google_sub` and never by email, measured by the
  Platform session that landed the runner: the endpoint provisions a fresh sub
  for an email it does not know, so posting a seeded address collides on 4.1's
  unique email and answers 500, where posting the sub finds the seeded user
  through the same uniqueness 7.1's transaction is idempotent under.
- **Controls are addressed by accessible role and normative name**, which is
  9.1's addressing sentence, landed at the P8 kickoff so that this suite could
  ask for a control without reaching for a test identifier. No selector in these
  files names a class or a DOM shape. What the sentence fixes is
  identification, not construction: section 9 specifies structure, states and
  copy rather than widgets, so the two helpers that operate a picker dispatch on
  what the element turned out to be instead of assuming a native select. Eight
  controls the section described without naming were matched by description
  while this leg was first written, each with the gap recorded; 9.1 gained a
  control table naming all eight at the P8 change control on 2026-08-11, and
  every match is a string now and every one is exact. Exactness is the point
  rather than a habit: three of the eight names begin with "add" and two of
  them are "More actions", so a loose match restores exactly the collision the
  naming removed.
- **Section 9's copy is restated in the harness, never imported from
  `src/client`.** The standing Steward ruling for the frozen response shapes,
  applied where it bites hardest: a suite that reads the string it asserts out
  of the code under test asserts that the code equals itself.
- **No acceptance test runs against mocked data.** The P8 kickoff's ruling: the
  RFC row's permission to build page structure against mocks is about package
  dependencies, and 11.10 puts these tests on the seed dataset and the
  development login. Every fixture here is a real row created through section 7
  with the session the spec already holds.
- **One worker, one seeded database, no retries, and specs are not isolated
  from each other.** So the rule these files run under is that a spec never
  transitions, edits or deletes a seeded row: it creates its own, titled for its
  own file. Reads of seed rows are free, and the two specs that must change
  shared state put it back, AC-095 restoring the 4.10 settings defaults through
  7.2. Counts are compared against what the API reports at that moment rather
  than against constants, which is why AC-155 reads the Inbox badge against GET
  /folders instead of expecting an integer.
- **The browser's zone is pinned to UTC.** `db/seed.ts` dates its rows with
  `toISOString().slice(0, 10)` and the client reports the browser's zone as `tz`
  on every view request, so the specs declare `timezoneId: 'UTC'` and the
  harness computes the same dates the same way. The residual is a run crossing
  a UTC midnight in the seconds between the seed and the spec, which
  `middayZone()` avoids in the vitest leg and this one cannot, the seed's dates
  not being ours to choose.

**The second change control's four criteria, and what their colours mean.**
AC-169 and AC-170 are red by design and are the standing order working: the
client carries a mutation for every write of section 7 except frozen 7.9's,
so a reminder set in the task form was held in the form's state and discarded
at save, and the whole suite was green over it because AC-092 reads the form,
AC-146 to AC-150 read the endpoints, and nothing read the two together. Both
assert the stored row rather than the form, which is the only question that
separates a value that was written from one that is merely remembered, and
the red was confirmed to land there rather than earlier before either was
committed. They are two numbers because create and edit reach two endpoints,
and one number would pass on whichever path its author happened to wire.

AC-171 and AC-172 pass on arrival, which is worth saying because that is the
inverse of the order everything else here ran in. Both come from rulings
rather than from defects: 9.1's inline state copy was adopted from the
client's own first pass, and 9.8's invite list was already a standing section
of both pages, so what the change control did was write down what was there
and make it assertable. A criterion that arrives green has not been shown to
discriminate, so each carries its own control: AC-171 asserts the failure
copy absent on the 404 arm and the not-found copy absent on the failure arm,
since a client rendering one state for both passes any case that looks for
one string; AC-172 asserts the list gone from both pages after the invite is
answered.

**AC-162's folder case is red on purpose, and it is the only case here whose
colour was traded deliberately.** It reached 9.6's overflow menu as the first
"More actions" on the page, which is position, and position is not a property
this suite may address by; the second change control named "Folder header"
and "Sharing panel" as regions for exactly that. Scoped to the region it is
red, because the client shipped before the ruling and exposes only Q7's three
body sections as regions. Green by luck became red by contract, which is the
trade this suite exists to make. The sharing panel is already a named region,
which is why the new remove case passes while the new leave case fails on the
same missing header.

**Nine reds outlived the client and none of them was the client's.** The
grouped run left them deliberately, no implementer phase being permitted to
edit this directory, and each was measured passing in isolation before it was
routed here. Eight were fixtures of two kinds, both of which this leg's own
rules already forbade. Two asserted `getByText` on a word their own fixture
title contained, and since that matcher takes a case-insensitive substring,
the title answered alongside the chip; the titles carry neither word now. Six
created a row whose title their file had already used, against a database the
runner seeds once and never resets, so the second case of each pair resolved
its locator to both rows. `caseTitle` tags a title with `testInfo.testId`,
which is stable per case across runs and distinct between any two, so a
case's rows are its own; the titles are locals rather than module constants,
because a module constant is computed once per file and that is the scope
that was too wide. Cleanup between cases was rejected: it would fight the
single seed and the single worker rather than use them.

A ninth surfaced only once the eight were repaired, and it is worth keeping
for what it shows about addressing. AC-162 reached for the last "More
actions" on the page, and 9.1's control table gives that name to the form's
overflow menu and to a task row's alike, on purpose. Position was the only
thing separating them, position is not a property this suite may address by,
and it held only while the row inventory left the form's button last;
changing the inventory landed the click on a row's menu behind the form's own
scrim. It is scoped to the open dialog now, which is what actually
distinguishes the two.

The tenth red was a mechanism rather than a fixture. AC-100 faked a deploy on
the wire with `context.route()` over the worker's script URL, and Playwright
does not intercept the browser's fetch of a service worker script during
`registration.update()`, so the script came back byte-identical and the
affordance correctly never appeared. The deploy is real now: one comment
appended to the file the page's own registration names, `update()` called,
and the bytes restored in a `finally`. That is the event the criterion names
rather than a picture of it, and a changed byte is a new version by the only
rule the browser applies. It writes to `dist/client`, which is build output
rather than source, gitignored and rebuilt at the start of every run.

Two things this leg asserts that no single criterion could. `session-path.spec.ts`
walks the sidebar through six pages, a folder and the search overlay and then
asserts over everything the client sent that every view request carried `tz`
and every mutation carried `X-CSRF-Token`. AC-130 and AC-111 pin the server's
two refusals; nothing pinned that the client sends either, and a client can
carry `tz` on the one endpoint a criterion happens to read and omit it
everywhere else while every criterion passes. Its third case is 10.2 from the
client side, on the other seeded user's Inbox, which exists.

And `rendered-halves.spec.ts` closes the clauses earlier packages recorded as
P8's half, found by the grep those records were left for. AC-047's assignee
chip, AC-048's unassigned chip, AC-058's collapsed Completed section and
AC-141's People screen copy are there; AC-039's faded home and AC-053's fading
in Tasks and All are in the AC-097 file, which is where the fixture for them
already was. None of this renumbers or re-owns those criteria, and none of it
re-asserts server behavior through a browser, which buys latency rather than
truth.

**One recorded half left this package rather than being closed, and the
specification it comes from was not corrected.** AC-138's file records that a
scrubbed user's surviving history "renders as Deleted user" and calls that
P8's half of 8.10's sentence. Section 9 names no surface that displays
`created_by`, `completed_by` or `accepted_by`, so this leg escalated it and
recommended lifting the sentence. The P8 change control ruled the other way
on 2026-08-11 and the difference matters: 4.1 and 8.10 are both correct, and
section 9's silence is a consequence of 8.10's own ordering rather than an
omission, since step 4 clears the assignments and drops the memberships and
7.3 excludes soft-deleted users from the roster, so every path a page renders
a display name through is already empty. The clause is correct and dormant.
The obligation lifts from this package as section 13 item 27, recorded as a
reading of frozen 4.1, and AC-138 pins the server half unchanged.
`rendered-halves.spec.ts` says so in full, because a reader finding the
clause gone will otherwise assume it was found wrong.

AC-155 to AC-163 and AC-165 to AC-167 were authored here with their tests and
numbered by the Integration Steward's section 12 amendment on 2026-08-11, the
AC-125, AC-133 and AC-142 precedent. Ten stand at the numbers this leg
proposed; two moved, because package P7 had by then assigned AC-154 and AC-164
in the second working tree, and renumbering a criterion another branch has
already assigned is the one move that would make appending unsafe. The file
proposing AC-154 carries AC-166 and the one proposing AC-164 carries AC-167,
with no assertion changed and no fixture moved. The gaps this leaves in the
range are section 12's own and are deliberate: a later reader finding 154 and
164 outside this range finds them inside P7's rather than finding nothing.
The standard is the one those batches were admitted under, a rule the
specification states that no numbered criterion asserts, and section 9 is thick
with them: the quick-add row's enter and escape, the sidebar's folder ordering
against a frozen 7.4 order it deliberately is not, the search overlay's
debounce and its two shortcuts, a 409 showing 5.1's copy verbatim, the eight
empty states, the landing page, the shell fallback's scope, the form's
validation copy, the four destructive confirms, the manifest half of 10.6,
Q1's important toggle changing no query, and the un-pull control's absent half.

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
