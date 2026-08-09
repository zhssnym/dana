# Changelog

Notable changes to Dana, per release. Curated for humans: not every commit appears
here, only things worth knowing about. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

Planning and design. No software has been released yet.

### Added

- A ruling of the Integration Steward at the P5 kickoff, 2026-08-09, closing
  the question the AC-124 amendment parked in the P5 row: **the 10.3 member
  cap binds every membership section 8.7 grants**. The acceptance transaction
  and the instant-share conversion each lock the folder, count, and refuse
  422 at 25, the corrected shape the P3 repairs gave POST /members; section
  5.3's acceptance row gains the guard words its direct-add row always
  carried, and 8.7 states the rule once with its reasoning. The exemption
  reading, an accepted person joining a full folder rather than being turned
  away at the door, lost on four grounds: 10.3 calls the number
  server-enforced and records no exemption, where this specification
  deviates it says so in place, 7.1's tz treatment being the model; AC-124's
  own text names the counted value, a 26th member, never an endpoint, so an
  exemption would have needed that criterion narrowed; the P3 merge review
  accepted the addMember repair partly on the recorded ground that P5's
  membership-granting path would read the corrected shape; and refusal is
  the only outcome that preserves both the number and the invite, since the
  all-or-nothing transaction leaves a refused invite pending and acceptable
  once the folder has room, while an exemption makes 25 advisory and a
  silent skip would consume the invite and grant nothing. Frozen sections 4
  and 7 are untouched: 7.0's uniform status table and 10.3's blanket
  sentence already carry the 422 on the wire, so the ruling is the
  Steward's, not the owner's. The sequential refusal criteria arrive
  tester-proposed at this package's change control; AC-124's member arm
  gains the acceptance-path call site in its existing file with no text
  change. Recorded with the same kickoff, in the RFC 0001 P5 row: the 8.10
  deletion transaction's steps 1 to 6, covered by no criterion in any
  package, get tester-proposed criteria at the same change control, the P4
  precedent; the pending_invite_email derivation the suite README routes to
  this package rides that proposal batch; and the co-lead's premise on
  V-INV's closing pointer to 10.4 is answered in place, that arm being
  P9's, where AC-101 already asserts the per-user limits by number behind
  11.3's third middleware link, this package's only 429-shaped surface
  being 5.2's resend guard, asserted as AC-068.
- Package P4 of RFC 0001, views and search: every endpoint of frozen 7.10 and
  the eight queries of section 6 this package owns, Q1 with Q1R, Q2, Q3 with
  Q3C, Q4, Q5, Q6, Q7 and Q8, each answering rows the server has already
  ordered, plus the 6.1 partition proof pinned as a property. The date
  predicates behind them live in `src/server/time` on Luxon 3, read only in
  the instant-to-local direction, where the math is total and none of 11.15's
  DST hazard applies; the local-day window Q1R and Q6 need is derived by
  binary search from that direction rather than by asking a library for a
  midnight that twice a year does not exist or exists twice. The calendar's
  virtual arm defers to P6 with the 4.11 iterator it needs. Search escapes
  the wildcards a user types. Cursors are opaque, one per order rather than
  one per endpoint, and a cursor nothing issued answers 422 rather than a
  silent first page. The full gate is green at 908 tests across 112 files,
  AC-045 to AC-058, AC-070 and AC-125 to AC-132 passing by number beside
  every earlier range, on PGlite and on postgres:18.
- The defect that held P4's merge, and the reason it is worth a changelog
  entry rather than a commit message: `POST /tasks/:id/my-day` dated its
  entry in the account's stored zone while My Day grouped by the request's,
  so for a large part of every day a task pulled now appeared under Carried
  rather than Today. Four sessions carried it as a non-deterministic test
  failure. It was never load-dependent and never backend-dependent, only
  clock-dependent, and it was found by holding a merge on a red postgres:18
  leg rather than by any test written to look for it. The owner ruled `tz`
  onto frozen 7.8; the pull now dates from it through the same `today()` the
  view reads, so the two are one computation over one input rather than two
  that had agreed by luck. AC-132 is the guard that would have named it on
  the first run.
- A ruling of the human owner, Hassan, on 2026-08-08, on the escalation that
  held P4's merge. **Frozen 7.8's pull now takes `tz`**: POST
  /tasks/:id/my-day carries the zone, so it is given what 8.1 already says
  every date-evaluating request carries, and an absent or invalid one
  answers 422 naming the field. DELETE gains nothing, evaluating no date.
  The endpoint had required `added_on = today(V)` while carrying nothing
  from which today(V) could be computed, so the only zone within reach was
  `users.timezone`, which 8.1 reserves for reminder fire instants. The cost
  was not theoretical: the pull dated the entry in the account's zone while
  My Day grouped it by the request's, so for a large part of every day a
  task pulled now appeared under Carried rather than Today. The rejected
  alternative, letting the pull keep the account's zone and saying so, does
  not fix that defect but blesses it, and would have required weakening
  AC-047 and AC-048 to stop asserting a behavior a user can see.
- Frozen 4.7 confirmed to need no amendment, checked rather than assumed,
  because it is frozen and amending it would be a second owner decision. Its
  column note reads "the adder's local date at pull time" and names neither
  a zone source nor a mechanism; once the request carries the zone, that
  phrase reads correctly and more accurately than a stored zone can, since
  8.1 has travel move today. INV-12's "the adder's timezone at insert time"
  reads the same way. So the tension spanned two frozen sections and only
  one of them was wrong, and the P3 implementer was following 4.7 rather
  than deviating from it. Section 8.1 gains one sentence, not a restatement
  of the rule but of its consequence: "every request that evaluates dates
  carries tz" binds section 7 as much as the code, so an endpoint that
  stores or filters by a date and takes no tz is an incomplete surface
  rather than an invitation to substitute the stored zone.
- A second P4 change control, 2026-08-07, after the three implementing
  sessions landed. Two acceptance tests are ruled wrong while the criteria
  they carry stand, both verified from the fixtures rather than taken from
  the sessions that reported them: AC-057's expected sequence has positions
  two and three transposed against its own timestamps, and AC-052's two tie
  rows never tie, because the helper that stamps them is called once per
  loop iteration, so the created_at key resolves the pair before the id
  tie-break the case exists to reach. The repairs are the Adversarial Test
  role's, which is why the session that had to pass them escalated rather
  than edited, and they move in opposite directions: AC-057's expected array
  is the derived value, AC-052's fixture is the thing at fault.
- AC-131, Q8's literal wildcards, numbered on the offer the Adversarial Test
  role recorded when it asserted the rule as three adversarial cases inside
  AC-057 instead. Its judgment was right when it was made and is superseded
  rather than contradicted: escaping was a silence when AC-125 to AC-130
  were authored and became a rule the specification states when the first
  change control ruled it, which is the standard those six were admitted
  under. Section 13 gains item 21, Q4's Important page having no index of
  its own and that being adequate for v1, an accepted bet of item 6's kind
  with a revisit trigger, recorded because an EXPLAIN record inside a
  package cannot outlive it.
- Ratified from the P4 sessions' disclosures: Luxon 3 at `^3.7.2` with its
  types, the branch's only dependency addition, pre-authorized by the RFC
  0001 P4 row and made normative for IANA timezone math by spec 11.9 (the
  package entry at merge will carry it in P4's stack sentence, where every
  package records its own); and the cursor's opaqueness left where the
  session put it, carried to the endpoint shape review, since frozen 7.10
  writes `?cursor` and `next_cursor` and says nothing about what a cursor
  is. Routed rather than ratified: `tsconfig.build.json` needs
  `src/server/views/explain.ts` excluded, because `npm run build` emits a
  diagnostic module into production output today, and that file is
  Platform's.
- A hazard of how this build measures itself, recorded because it produced a
  false signal inside the session that found it. Checking out another branch
  while a suite run is still going makes test files vanish from collection:
  six files under `src/` reported `Cannot find module` and 127 tests
  silently did not run, while the failure count stayed at exactly the number
  a reader checks. Coverage disappeared and the headline number did not
  move. Two counts taken across a git operation are not two measurements of
  one tree.
- Three rulings of the human owner, Hassan, on 2026-08-07, closing the frozen
  section 7 silences the P4 change control routed to him. He took all three
  of the Steward's recommendations. They are transcribed onto frozen 7.0 and
  7.10 on branch `p4-views`, so they merge with the package.
  - **An absent tz answers 422 naming the field**, where 7.0 had named only
    an invalid one. A view endpoint called without tz is missing a required
    parameter rather than accepting a default: 8.1 makes tz an input of every
    request that evaluates dates, and UTC, the only plausible default, would
    hand most of the world the wrong day with nothing on the wire to say it
    had been substituted. 7.1's opposite treatment of the same parameter,
    where an unparseable zone is read as absent rather than refused, stays a
    deviation scoped to sign-in and does not generalize.
  - **The `folder` inside `groups: [{folder, rows}]` is the
    `{id, name, is_default}` stub every TaskCard already carries**, not the
    7.0 Folder object, and the `tasks_groups` of GET /views/all answers the
    same shape. A group heading needs exactly what a card's folder label
    needs: Folder's counts are the per-folder computation of 8.11 that no
    grouped view asks for, and its `is_owner`, `member_count`, `my_label` and
    `my_color` are 7.4's business.
  - **`section` defaults to `open` on GET /folders/:id/tasks** when absent,
    rather than being required. Q7 renders its completed section collapsed,
    so open is the state the page opens in, and 7.10's own enumeration names
    it first.
- AC-130 widened with the first of those rulings rather than joined by a new
  number: one rule of 7.0, two failures, now one answer, and no number moves.
  The widening is not cosmetic. An implementation reading tz through a schema
  with a UTC default satisfies the invalid half exactly, a present wrong
  value reaching the validator where an absent one never does, so the defect
  the ruling exists to prevent was invisible to the criterion as first
  written. The test is the Adversarial Test role's and is routed to the
  session already scheduled next.
- P4 mid-package change control, 2026-08-07, the amendments on branch
  `p4-views` so they merge with the package. One ruling was the human
  owner's: frozen 7.10 named a response object for eight of its nine
  endpoints, and GET /folders/:id/tasks now carries `scheduled`,
  `unscheduled`, and `truncated` on section=open and `days` with
  `next_cursor` on section=completed, the keys the other eight bodies
  already use for the same things. Six acceptance criteria are appended as
  AC-125 to AC-130, each closing a number the specification states and
  nothing asserts: the calendar's 62-day refusal and its real rows, search's
  page size of 20 and its 2-to-100 character bound, the 1000-row cap with
  its flag, and 7.0's tz rule across every view endpoint. Four silences are
  closed in section 6, which is the Steward's: `status_rank` gains
  completed = 2 in the preamble rather than only inside Q8, which had left a
  completed row's position in a calendar cell undefined; the 1000-row cap is
  per response rather than per array, since section 6 enumerates pages and
  each body carries one flag, with the kept rows a prefix of the order 7.10
  enumerates that response's sections in; Q3C refuses an inverted range,
  which its own arithmetic admits by accident, rather than answering it with
  the bare grid an empty month gets; and Q8 escapes a backslash, percent, or
  underscore the user typed, so a search for "50%" stops matching everything
  containing "50". Three silences are frozen section 7's and are routed to
  the owner with a recommendation each, blocking nothing: the shape of
  `folder` inside `groups`, what an absent tz gets where 7.0 names only an
  invalid one, and the default `section` of the folder page. And the tester's
  report that one clause each of AC-046 and AC-050 cannot be tested as
  written is ruled the closest faithful test rather than reinterpretation,
  recorded beside both criteria: owning the clock would decide, for an
  implementer who has not yet written a line, that today(V) comes from the
  process clock rather than the database, which 8.1 admits either way.
- A provenance defect and its repair, recorded because the record is the
  point. `app/tests/ac-058-folder-sections.test.ts` asserts the 7.10 body
  above as settled and states that the owner ruled it at the P4 kickoff. The
  substance is right and the timing is not: the kickoff recommended, the
  owner ruled on 2026-08-07, and the tester session ran in between on a
  prompt the operator wrote with "the human owner has ruled" in it, expecting
  the answer. The ruling is now transcribed, so the test cites text that
  exists. The header itself is inside `app/tests/`, which the Adversarial
  Test role owns exclusively, so its correction is a routed return rather
  than a Steward edit, and the P4 row now carries that session.
- P4's session order, traced into its RFC row at the package's kickoff on
  2026-08-07, with the premise check that preceded it. Two premises were
  wrong. The row named `05-query-and-read-path.md` as the only owner, and
  that role's own hard boundaries forbid it date arithmetic while the first
  seam of the team README gives the date predicates inside Q1 and Q3C to
  Scheduling; so P4 owes a `02-scheduling-and-time.md` session ahead of its
  implementer, for the `app/src/server/time/**` helpers that role's Owns
  section already names and that do not exist, and that session carries
  Luxon 3, which 11.9 makes normative for all IANA timezone math and which
  the package manifest does not have. And "every endpoint of 7.10" holds for
  the endpoints while one arm of one of them defers: GET
  /views/planned/calendar answers Q3C's real rows at P4, and its virtual
  array is 8.5's rule projection over the 4.11 iterator that P6 delivers.
  The plan's own evidence for that split is AC-082, the criterion that draws
  ghosts on a month view, written into P6's range and not into P4's. Two
  premises held, one of them for a reason unlike the one P3's kickoff
  recorded: no Data session is owed, because this package writes no table at
  all and every index of 4.12 landed in migration 0000, the pg_trgm
  extension and the GIN trigram index included and the extension wired into
  the PGlite client so both test legs carry it. Recorded rather than
  smoothed over: 4.12 names an index for every query of section 6 except Q4,
  there being none on `tasks.important`, and routing that gap to the Data
  engineer with the query that justifies it is the only door by which this
  package acquires a Data session.
- The carried items placed against P4 at the same kickoff. Only one touches
  it. The recurrence arm of the standing P6 list is the calendar's virtual
  instances, deferred above with AC-082 as its criterion; TaskCard's
  `is_recurring` is not part of it, being a read of a column P3 already
  answers. The rest wait where they are, and why is recorded so the next
  kickoff does not re-derive it: 7.6's fire_at recompute and the reminder
  arm stay at P7 because 7.10 answers TaskCard and reminder is a TaskDetail
  field, so no view carries it; the real 8.10 transaction and the 8.7 cap
  question stay at P5 because this package writes nothing; and
  pending_invite_email's unpinned derivation stays at P5 for the reason
  already recorded there, that P4, like P3, carries the key and cannot
  create an invite to fill it, so P5 remains the first package that can
  cover it. The `domain/db.ts` consolidation stays at P9 and gains weight
  rather than urgency: P4 imports its `rowsOf` rather than restating it and
  becomes the third consumer. The sessions.user_id index is untouched by a
  package that reads no session table. Section 13 item 20 was checked
  against P4 specifically and asks nothing of it: it records GET /folders,
  a 7.4 endpoint merged at P2, as deliberately outside the 1000-row caps
  precisely because section 6 enumerates the capped lists and the folder
  list is not among them. P4 is where the enumerated ones become code, so
  what this package implements is item 6's accepted bet, not item 20's
  exception.
- Package P3 of RFC 0001, tasks core: the frozen 7.6, 7.7, and 7.8 surfaces,
  which is create with the 7.6 guards and the INV-5 forcing, PATCH with the
  move rules and 8.4's clear-date cascade in one transaction, delete with its
  5.1 cascades, steps under the 50 cap, the four 5.1 transitions written as
  8.3's guarded single-row updates so a lost race is detectable and a repeat
  is a 200 no-op, and the My Day pull endpoints with INV-12's idempotency.
  Every one of them answers 7.0's TaskCard and TaskDetail, declared once in
  the shared contract and bound to the wire by a contract test rather than
  restated per route. Access is resolved through the P2 module's own accessOf,
  widened to take an executor so a move decides inside the transaction it
  writes in. Two arms of frozen 7.6 are deliberately absent and recorded as
  such: recurrence_rule waits for P6's 4.11 validator and reminder for P7's
  8.6 fire instant. And the three 10.3 caps in the domain directory, steps,
  members, and custom folders, now count under a lock, two of them repairs to
  code that merged at P2. The full gate is green at 604 tests across 83 files,
  AC-025 to AC-044 and AC-124 passing by number beside the P0, P1, P2, and
  P2S ranges.
- Package P2S of RFC 0001, the settings surface: frozen 7.2's GET and PATCH
  /me/settings, mounted in the auth router beside the 7.1 account endpoints
  because they speak for one authenticated person and take no id at all, so
  every statement is keyed by the session's user id and nothing the request
  carries; the 7.2 object declared once in the shared contract and reused by
  the GET body, the ruled PATCH body, and the settings key of GET /me, which
  retires the inline copy the /me response schema carried since P1; a PATCH
  naming only the columns its body carried, which is what lets two concurrent
  disjoint subsets compose instead of one overwriting the other from a stale
  read, and which answers from RETURNING so the ruled fresh-GET body is the
  row the write produced; and account.ts's local MeBody interface converged
  on the shared response type, the one-line item carried since the P1 merge
  review. The full gate is green at 404 tests across 57 files, AC-119 to
  AC-123 passing by number beside the P0, P1, and P2 ranges.
- Package P2 of RFC 0001, folders and membership: the full 7.4 surface
  (folder CRUD, member add and remove under 5.3's guards and 5.4's matrix,
  the personal label and color membership PATCH, R-CLEAN on every removal
  and leave, 8.9 ownership transfer, 8.11 counts inside the Folder object)
  behind shared zod schemas for every body and response; the notify
  module's send-or-log transport behind the ratified options.notifications
  sink, observed by AC-021 and AC-024; the ruled 7.0 edge mapping in the
  boot file, an over-limit or non-object body answering 400 with no side
  effects; and the settled 7.4 response shapes pinned by shared response
  schemas and a key-exact contract test against the mounted application.
  The full gate is green at 353 tests across 50 files, AC-011 to AC-024
  and AC-116 to AC-118 passing by number beside the P0 and P1 ranges.
- Package P1 of RFC 0001, authentication: hand-rolled Google OIDC on
  openid-client 6 per 11.6, with state, nonce, and PKCE validated single-use,
  ID token signature verification forced on (section 13 item 17), and no
  Google token persisted; the 10.1 sessions table (migrations 0001 and 0002)
  storing only sha256 digests of CSPRNG identifiers, with the 30-day rolling
  expiry checked and extended in one statement; CSRF as a token derived from
  the session token by HMAC, so the 11.6 binding needs no stored column; the
  idempotent provisioning transaction; timezone sync per 7.1 and 8.1 with the
  tzdb-alias rule; the 9.2 unverified-email page; /me, PATCH /me, and DELETE
  /me with the 8.10 stub the P1 row places in the auth module; a development
  login excluded from production builds; the shared contract surface (zod
  schemas, error envelope, the one IANA validator) and the 7.0 envelope
  helpers; and boot wiring that mounts the surface, scrubs database wrapper
  messages from 5xx logs, and refuses to start when no sign-in path is
  configured. The full gate is green with every criterion from AC-001 to
  AC-010 and AC-105 to AC-115 passing by number.
- Package P0 of RFC 0001, the first code: the `app/` package and toolchain
  (Node 24, TypeScript strict, ESM, Vite 8, Vitest 4, ESLint 9), CI in the
  11.11 step order with the postgres:18 leg, a boot file that applies
  migrations before /api/health reports ready, one hand-authored migration
  realizing every constraint and index of spec section 4 by name, the seed
  dataset, the PGlite or Postgres database seam, and acceptance tests AC-001
  to AC-004.

### Changed

- Merge rulings at the P3 merge, 2026-08-07. By the human owner, accepting all
  four recommendations of the endpoint shape review and transcribed onto
  frozen section 7: closing paragraphs on 7.7 and 7.8 settling that each of
  their mutations answers the affected TaskDetail, because neither a step nor
  a My Day entry is a resource this contract shapes or offers a GET for and
  each mutation moves more of the task than the row it touches, steps moving
  steps_done and steps_total and a pull moving pulled; two sentences on 7.0
  about shapes it already declares, that floating values ride the wire in
  their 4.11 formats, YYYY-MM-DD and HH:MM and never instants, and that
  TaskDetail's reminder carries both 4.8 columns with exactly one non-null
  because "{offset_minutes or time_of_day}" names a mode and not a key list;
  and 7.6's move refusal narrowed from "404 or 422" to 404, the recommendation
  the review ranked lowest and the owner took anyway, since a 422 for a folder
  the caller cannot see confirms the folder exists. Nothing went red on the
  narrowing: the surface already answered 404 from the same leak rule, and
  AC-029 admitted both, so the contract now says what the code did.
- Section 12 gains AC-124 by amendment on branch p3-tasks-core, 2026-08-07,
  riding P3's merge gate the way AC-116 to AC-118 rode P2's. The merge review
  found one defect in three places: the guards for 10.3's step, member, and
  custom-folder caps each counted outside the write the count admitted, so two
  callers arriving together at the limit both passed and the stored count went
  one past it. Two of the three were in code merged at P2, and the branch was
  held twice, once to repair them and once for this criterion. It exists
  because the repairs were otherwise proven only by a statement-order probe
  inside the implementing module, which is the implementer attesting to their
  own fix, the one arrangement this project calls its only source of
  independent truth. Routing it to P9's limits sweep was the close alternative
  and was declined: a sweep checks that limits exist, and what was missing is
  independent evidence for a fix already made. Recorded with it, the reading
  its test turns on: the criterion asserts the outcome rather than that a
  breach was attempted, because on the default backend the two transactions
  queue where on postgres:18 they overlap, and both satisfy it for the same
  reason, that the limit held and one caller was refused.
- 11.15's PGlite bullet is corrected against measurement, 2026-08-07. The
  bullet was true and incomplete in the way a hazard list cannot afford: it
  says PGlite is single-connection, which is a fact, and three sessions plus
  the Steward's own merge-review ruling read that as meaning concurrency races
  cannot be expressed locally, which is not. The Adversarial Test role
  measured it, reproducing the 51-step breach on the default backend at the
  domain level and through HTTP. One connection serializes statements, not
  handler logic, so interleaved handlers race normally; what genuinely needs a
  second connection is a second concurrent transaction. The Steward's ruling
  that this branch could repair a cap merged at P2 stands on its other three
  grounds, and the false one is withdrawn in the RFC row rather than left
  standing. Section 11 is normative and not frozen, so this was change control
  rather than an owner decision.
- Ratified at the P3 merge, the disclosed-extension shape. The Collaboration
  return fixed the two caps it was routed and found a third of the identical
  shape in createFolder by applying the recorded grounds to the rest of its
  own directory, disclosing it in a commit built to be dropped on its own. It
  is accepted, and with it the general rule: carrying a recorded ruling's own
  grounds to the identical defect inside your own paths is in scope when it
  arrives separately revertible. A different defect class, or another role's
  paths, is not, and the disclosure is what separates the two.
- Mid-P3 rulings, 2026-08-05, on branch p3-tasks-core so they merge with the
  package whose assertions they underwrite, the mid-P2 precedent. Three
  questions from the tester session's final block, none of them a frozen
  change and none of them changing a test.
  - **A second DELETE on a task answers 404**, as AC-042's adversarial case
    asserts. The apparent collision dissolves on reading: 7.0's idempotency
    sentence is about effect, not status, and a second DELETE that changes
    nothing is idempotent whatever it answers, while 8.3 speaks to the status
    directly and says operations on deleted rows return 404. Frozen section 7
    settles it twice over. It already contains a DELETE addressed by id that
    answers 404 on absence, 7.3's DELETE /connections/:userId, "204; 404 if no
    such connection", and where it wants a status on absence for a
    sub-resource toggle it says so outright, 7.8's my-day "200 even when
    absent" and 7.9's reminder "204, idempotent". The decisive ground is the
    leak rule: 204 for a task that existed and was deleted, beside 404 for an
    id that never existed, is an existence oracle, and 7.0 and AC-102 forbid
    exactly that. Avoiding the leak under a 204 policy would mean answering
    204 for every unknown id, including tasks in folders the caller cannot
    see, which contradicts "inaccessible always reads as 404".
  - **In a single-member folder the INV-5 forcing wins over the composite-FK
    422**, on POST /tasks. Frozen 7.6 lists both rules and the case where they
    meet is a caller naming a non-member assignee in a folder with one member.
    "Ignoring the input" is the plain reading, and section 3 settles it: INV-5
    names its enforcement as "create, move, unassign guard", so create and move
    are transactions that make the value right and only the unassign case is a
    guard that refuses. 7.6's own move rule shows the same pattern, an assignee
    who is not a member of the target being repaired rather than refused. The
    principle the contract draws is that repair applies where the right value
    is determined, which in a single-member folder it is, and refusal applies
    where it would be a guess, which is every folder with more than one member.
    Scope is POST only: PATCH keeps 422 for a non-member and 409 for a null in
    a single-member folder, which 7.6's PATCH bullet states and INV-5 calls the
    unassign guard. No criterion moves; AC-026 pins the null case to forcing
    already, and AC-033 stages a multi-member folder on purpose.
  - **Ratified, the reading inside AC-039**: abandoning a task does not delete
    the viewer's My Day entry. 5.1's abandon row lists its side effects and
    entry deletion is not among them, 8.2 selects pending rows so the task
    leaves the page by the status filter alone, and R-CLEAN deletes My Day
    entries explicitly wherever the contract means deletion, so the silence is
    a distinction the contract draws itself, the pattern the P2S merge used on
    user_settings.updated_at. It also has a consequence worth naming: AC-097
    has restore return an overdue assigned task to My Day immediately, and for
    a task that was pulled rather than automatic that works only if the entry
    survived, since 8.2 reads its added_on.
- The commit trailer names the model that ran the session, by owner ruling on
  the P3 tester session's note, 2026-08-05. Protocol section 7 fixed the
  trailer to one literal model string, accurate when written and false from
  the moment the model lineup changed, so a session could either misattribute
  itself or depart from the rule and had no third option. The sentence now
  points at the session rather than at a literal, the same open-reference fix
  made when section 12 outran the "AC-001 to AC-115" range that three team
  documents had written down. The address is unchanged and only the name is
  the session's own. History stays as written: the rule governs new commits,
  starting with the one that lands it.
- The pending_invite_email coverage gap is routed into the P5 row, 2026-08-05.
  Frozen 7.0 derives TaskCard.pending_invite_email from invites.task_id and no
  criterion in any range pins the derivation. P3's tester session found it and
  could go no further, that package creating no invite, so its files assert the
  key's presence and say so. P5 is the first package that can create one, so
  the gap is its tester session's, by an amendment appending to the P5 range if
  the existing numbers have no room. It is in the plan and not only in the
  suite README, because the session that should act on it opens against the
  plan.
- Kickoff rulings for package P3, 2026-08-05, landed on main ahead of the
  branch, the P2 precedent: a kickoff amends the plan, not the code, and
  `p3-tasks-core` is created by the package's first working session rather
  than by this one. The P3 row gains the traced session order that P1, P2,
  and P2S carry, five sessions each naming what it opens against, every
  named artifact verified present on main at 3306727. Three premises were
  checked before tracing and one was wrong: the package's frozen surfaces
  are 7.6, 7.7, and 7.8, not 7.5, which is the invite surface P5 delivers,
  and the only reach AC-025 to AC-044 make into invites is AC-042's
  task_id, a database cascade named in 5.1's delete row and present in
  migration 0000 since P0. The other two hold with one correction: the 7.0
  TaskCard and TaskDetail shapes are frozen and present, and
  `folderMemberUser` already carries the person shape TaskCard's assignee
  takes, but 11.3's middleware is a pair on main rather than a trio,
  session resolution and CSRF, with rate limiting at P9, which
  `auth/middleware.ts` and `routes/folders.ts` both already record. Two
  arms of frozen 7.6 are recorded as deferring with the computations they
  need rather than being half-built, the P1 row's stub precedent:
  recurrence_rule waits for P6's 4.11 validator, since 4.11 itself requires
  the subset revalidated server-side and a stored-but-unvalidated rule
  would be a wrong implementation rather than an absent one, and reminder
  waits for P7's 8.6 fire instant, which 4.8's NOT NULL fire_at column
  leaves no way around. At P3 both fall to 7.0's tolerated-unknown rule and
  become known when their owners' schemas declare them.
- The real 8.10 account deletion transaction is placed in P5, ruled at the
  P3 kickoff, 2026-08-05. The P1 row put the stub in the auth module until
  "the Collaboration packages" land the transaction and the P2 merge carried
  that forward without naming one; P3 and P5 are both Collaboration, so the
  placement was open, and an unplaced obligation lands twice or not at all.
  Steps 1 and 5, invalidating the user's pending sent invites and deleting
  their connection rows, are the invites and connections surfaces P5
  delivers and no earlier package owns. Every other step's machinery landed
  at P2: `transferOwnership` for step 2, `deleteFolder` for step 3, and
  `removeMembership` for step 4, whose R-CLEAN already unassigns tasks and
  deletes My Day entries. P3 puts rows into tables those sweeps already
  reach and adds no step to the transaction. No acceptance criterion covers
  steps 1 to 6 in any package, AC-009 and AC-112 pinning the confirm string
  and the session revocation the stub already satisfies, so an earlier
  landing would buy a revisit at P5 rather than coverage. What stays open
  until then is in the P5 row rather than in a session's memory: a deleted
  account's folders and memberships have survived since P2 and its tasks and
  My Day entries survive from P3. Section 8.10 is unchanged; this is a
  build-plan placement, not a specification change.
- Merge rulings at the P2S merge, 2026-08-05. By the human owner, pre-ruled on
  the shape review's routed finding: the malformed-body status turns on the
  content-type header rather than on whether the body parses, so identical
  unparseable bytes answer 400 under application/json and 422 under text/plain
  or under none at all. Verified at this merge against the running application
  on both /me and /me/settings, so it is uniform and it is pre-existing: it
  falls out of two P1 decisions, express.json parsing only matching content
  types, and the empty-path branch of the validation helper answering "A JSON
  object body is required", which that file's own comment anticipated. Option
  (a) accepted, no code change: frozen 7.0's 400 bullet gains the scoping
  sentence, that the bullet governs bodies presented as JSON, and that a
  request claiming no JSON content type presents nothing to parse whatever
  bytes it carries, so an endpoint needing a body answers 422 for the body it
  did not receive rather than 400 for one it could not read. Under the
  Steward's own change control, AC-118's sentence is clarified to match, "a
  body presented as JSON that does not parse" where it read "a body that does
  not parse as JSON". No test changes and the number keeps its meaning: every
  AC-118 raw-body probe sets application/json explicitly and always did, so the
  criterion tested the ruled reading already while its sentence, read
  literally, claimed a status the surface does not give. Ratified from
  disclosure, the token_hash-CHECK pattern: user_settings.updated_at moves on a
  writing PATCH and stays put on the empty subset. Frozen 4.10 gives the column
  its default and states no rule for when it moves, where the tasks table's own
  updated_at row states "touched on every mutation", so the silence is a
  distinction the frozen schema draws itself, and an empty subset that writes
  nothing is not a mutation. 4.10 is unchanged; no endpoint exposes the column,
  and the day one does, the rule becomes contract rather than staying a module
  decision. Carried forward, not merge-blocking: the suite README's coverage
  table still reads AC-119 to AC-123 as failing, written before the routes
  landed, the same lag the P2 rows carried until the next tester session
  refreshed them; and the 8.10 stub, the third private copy of the row and
  transaction adapters in domain/db.ts, and the sessions.user_id index all
  stand where the P2 merge left them.
- The acceptance-test ownership rule loses its fixed range, by owner ruling on
  branch p2s-settings, 2026-08-04. Protocol section 8, persona 11's Owns
  section, and the team roster all bounded acceptance tests at AC-001 to
  AC-115, a range the mid-P2 amendment had already outrun by three and the
  P2S amendment outran by eight. Read literally, the protocol sentence that
  stops an implementer editing a failing acceptance test covered none of
  AC-116 to AC-123, and persona 11's Owns section, by the team README the
  only statement of its ownership, claimed none of them either. All three now
  point at spec section 12's numbered criteria openly, every number it
  carries including those a later amendment appends, so an append-only
  section cannot outrun the rule that protects it a third time.
- Frozen 7.2 amended on branch p2s-settings, 2026-08-04, so it merges with
  its package: the human owner accepted option (a) of the opening session's
  escalation, and the subsection gains one appended sentence, PATCH
  /me/settings answers the GET /me/settings object. The silence was real and
  asymmetric. 7.2 named only 200 for its mutation, where 7.1 names PATCH
  /me's body by the P1 merge ruling and 7.4 names each of its mutations'
  bodies by the P2 shape review, so this was the one PATCH on the surface a
  client had to chase with a fetch, and an implementer filling the gap
  locally would have picked the shape by guess. The frozen bullets are
  unchanged and the sentence is appended as its own paragraph, the shape the
  P2 merge used for 7.4. No criterion is invalidated: the tester's files
  judged no PATCH body while the silence stood, and the assertion now lands
  in a scoped return to settings-harness.ts, which already holds one home
  for it.
- Section 12 gains AC-119 to AC-123 by amendment on branch p2s-settings,
  2026-08-04, so the criteria merge with the package that satisfies them:
  the Adversarial Test role's five proposed criteria for frozen 7.2,
  transcribed unchanged under their own Settings heading, appended from the
  next free number so no existing number moves. AC-119 pins GET /me/settings
  to exactly the three booleans at their 4.10 defaults, AC-120 pins any
  subset with absent fields unchanged and the new values readable from both
  7.2 and the /me settings key, AC-121 pins 422 naming the field on any
  non-boolean, AC-122 pins per-account isolation, and AC-123 pins frozen
  7.2's own no-data-changes sentence as row-for-row stillness outside
  user_settings. Recorded with them, two readings of the frozen text rather
  than changes to it, the my-membership pattern of the P2 merge: the empty
  subset is a subset, answering 200 and changing nothing, and null is a
  wrong-typed value rather than a clear, because 4.10's columns are NOT NULL
  booleans with defaults where 7.4's label and color are marked nullable by
  the frozen text itself. Housekeeping in the same pass: the section 12 row
  of the spec index, stale by three since the mid-P2 amendment, now reads
  AC-001 to AC-123.
- Merge rulings at the P2 merge, 2026-08-04. By the human owner: frozen
  7.4 gains the four response-shape sentences the shape review settled,
  transcribed at the merge: GET /folders answers the bare array, the
  detail's invite key is pending_invites carrying 7.4's five element
  fields, the members' user object is the TaskCard assignee person shape
  with no email, and each 7.4 mutation answers what a fresh GET would.
  Ratified from disclosure, the token_hash-CHECK pattern: the API
  engineer's any-subset reading of the my-membership PATCH (absent
  unchanged, null clears, a present value must be valid), grounded in
  section 7's own PATCH conventions elsewhere and the order AC-023
  requires, validate then delegate. Recorded by the Steward: section 13
  item 20, the folder list's deliberate absence from the capped lists,
  with its social bound and revisit trigger; and routes/README.md stays
  where it is, ruled the routes directory's shared wiring ledger, each
  role appending its own router's section and Platform annotating as
  executor. Carried forward, not merge-blocking: the 8.10 stub still
  holds only steps 7 and 8 until the Collaboration packages land the
  real transaction; domain/db.ts is the third private copy of the row
  and transaction adapters, consolidation flagged for P9; Security's
  account.ts type convergence waits at its P2S touch; the
  sessions.user_id index waits at Data on P9 evidence.
- Mid-P2 ruling, 2026-08-04, on branch p2-folders so it merges with its
  package: the notification observability seam. AC-024 counts a share-grant
  email that 11.8 keeps unsent under test and 10.5 keeps out of the logs, so
  11.10's construction seam gains options.notifications, an injected sink
  { send(message) } the notification module delivers to instead of logging
  when present; each message identifies its template and its recipient, the
  remaining keys the module's own; absent the sink, 11.8 is unchanged, and
  11.8 now points at the seam so the two sections cannot drift. Ratified
  over stdout capture (blocked by 10.5's whitelist on purpose) and an
  HTTP-level Resend double (contrary to 11.8's no-send rule). The harness
  assumed the seam in exactly one typed place, as options.dbClient once was
  before its P1 ratification.
- Section 12 gains AC-116 to AC-118 by mid-P2 amendment on the package
  branch, the Adversarial Test role's yes on the criteria-level pinning
  routed to its judgment at the P1 merge: AC-116 pins the GET and PATCH /me
  bodies to exactly the 7.1 object, AC-117 pins the 7.0 envelope with
  non-empty code and message on every 4xx of the mounted surface (presence,
  not exclusivity: a future structured error key beside message stays open),
  and AC-118 pins the amended 7.0 taxonomy, unparseable, non-object, and
  over-limit bodies answering 400 with no side effects, wrong-typed fields
  answering 422 naming the field, unknown fields ignored. Appended from the
  next free number, so the P2S settings criteria start at AC-119. AC-118
  rides the P2 merge gate that already holds the 400 mapping.
- The P2 row retraced for both mid-P2 rulings: the tester returns next for
  the AC-116 to AC-118 test files, and Platform's touch splits in two, an
  early session landing the notify module's send-or-log transport behind
  the ratified sink, the options.notifications parameter, and the ruled 7.0
  edge mapping, placed before the package because the Collaboration
  engineer's call sites invoke the module and cannot land before it exists,
  then the late boot wiring by request. The 04 shape review closes the
  branch carrying the tester's routed 7.4 observation (the GET /folders
  wrapper shape and the pending-invites key name). P2's acceptance now
  names AC-116 to AC-118 beside AC-011 to AC-024.
- Frozen 7.0 amended at the P2 kickoff, 2026-08-04: the human owner accepted
  verbatim the clarifying sentence offered at the P1 merge, so the 400 bullet
  now reads that a body not parsing as JSON, or parsing to something other
  than an object, is malformed, while on a parsed object unknown fields are
  tolerated and wrong types answer 422 naming the field. No criterion is
  invalidated: AC-009 already pins the 422 half, and the two code edges
  answering otherwise today remain the named deviation Platform lands at its
  next boot-file touch, which the P2 merge gate holds.
- RFC 0001's implementation plan gains row P2S, from the owner's 2026-08-04
  acceptance of the P1 merge escalation's recommendation on the unscheduled
  7.2 settings endpoints: tester-authored acceptance criteria arriving by
  section 12 amendment, then one small Security session implementing GET and
  PATCH /me/settings on branch p2s-settings, with the API and Contract role
  supplying the settings body schema and the pre-merge shape review. The row
  is slotted after P2's merge and before P8's integration window, which
  AC-095 ties to it, and places one routed P1 leftover where it lands:
  account.ts's local body type converges on the shared schema at Security's
  touch.
- The P2 row of RFC 0001's plan now carries its session order the way the P1
  row does: Adversarial Test first (AC-011 to AC-024, tests before
  implementation, plus the P1-routed judgment on criteria-level pinning of
  the /me shape, envelope, and status taxonomy), API and Contract's shared
  schemas for the 7.4 bodies, Collaboration and Permissions implementing the
  package, then Platform's boot wiring by request, the same boot-file touch
  landing the held 7.0 edge mapping, and API and Contract's endpoint shape
  review before the Steward merges. The row's Delivers now names that held
  mapping, so the merge gate that holds it is visible from the plan alone.
- Merge-review rulings at the P1 merge, 2026-08-03. By the human owner:
  frozen 7.1 now names PATCH /me's response body (the GET /me object,
  behavior unchanged), and the email collision across google_sub is parked
  as section 13 item 19 beside the dotted-variant question it mirrors.
  Ratified from session disclosures: Data's sessions_token_hash_format_check
  (transcription of 10.1's digest wording), Platform's 5xx log scrubbing and
  boot sign-in precondition (both 10.5 and operability wins inside its own
  file), and Security's HMAC-derived CSRF, which closes the 0003 migration
  question the 5e01e49 ruling left open. Recorded: section 13 items 17 and
  18 (openid-client and drizzle library defaults, each with an upgrade
  revisit trigger) and a fourth entry in 11.1's single-instance checklist
  (the in-memory pending-authorization store). Ruled on the shape review's
  findings: the 7.0 taxonomy reading extends to the two edges it found, a
  body over the parse limit is a body that did not parse (400, not 413) and
  a parsed body that is not a JSON object is malformed (400), while an
  object with bad fields stays 422; both edges answer otherwise today, a
  named deviation Platform lands at its next boot-file touch and the P2
  merge gate holds. Routed: the sessions.user_id index to the Data engineer
  pending P9's evidence; account.ts's local body type converging on the
  shared schema to Security's next touch; criteria-level pinning of the /me
  shape, envelope, and status taxonomy to the Adversarial Test role's
  judgment; and the unscheduled 7.2 settings endpoints to the human owner,
  since no RFC 0001 row claims them and P8's AC-095 will need them.
- Product design settled over four iterations, from a bullet list to a full
  technical specification: data model, invariants, state machines, query
  specifications, API surface, and 104 acceptance criteria.
- A 13-role agent team definition with a shared protocol, covering data,
  scheduling, collaboration, API, query, security, frontend, components, complex
  interaction, platform, adversarial testing, integration, and dispatch.
- Documentation architecture: a single living specification, numbered RFCs for
  changes, a human-facing runbook, and this changelog.
- Specification section 11 rewritten as normative architecture: one Node
  deployable (Vite React SPA plus Express API), Postgres 18, hand-rolled Google
  OIDC, an in-process reminder tick, Render hosting, with rejected alternatives
  recorded.
- Auth security acceptance criteria AC-105 to AC-115, raising the count from
  104 to 115; section 13 items 3, 4, and 11 resolved and item 15 added.
- The team definitions rebuilt against the chosen architecture; the RFC process
  and template, with RFC 0001 written in full; the design brief for the
  designer; the operator runbook written in full.
- Mid-P1 rulings of 2026-08-02, on branch `p1-auth`. The sessions identifier
  column, escalated by the Data session, is ruled as 10.1's fourth fixed
  fact: a token_hash text primary key holding the lowercase hex sha256
  digest of the cookie's CSPRNG token, landing as migration 0002 by the Data
  engineer before the Security session; the digest algorithm is the
  ruling's choice (the persona fixes only "stored hashed"), standard for
  high-entropy tokens and inside the persona's nothing-exotic rule. Any
  further columns (a stored CSRF binding, timestamps) stay the Security
  engineer's to request and Data's to transcribe. The Data session's NOT
  NULL disclosure is ratified into 10.1's text. The acceptance harness's
  timezone predicate was found weaker than the shared validator (Intl
  accepts ECMA-402 offset identifiers; verified on this Node), so the
  Adversarial Test role returns before the Security session: sign guard in
  the harness predicate, offset identifiers among AC-007's unparseable
  values, AC-113's contract case extended; 11.15 records the Intl oracle
  hazard. And the 7.0 status reading is settled as the suite already pins
  it (AC-009 answers 422 for wrong-typed fields): on a body that parses as
  JSON, field-level failures are 422 with the field named; 400 is reserved
  for bodies that do not parse. A clarifying sentence in frozen 7.0 is
  proposed to the human owner but not required, since the acceptance suite
  and the shared schemas already enforce the reading.
- Five P1 escalations from the Adversarial Test session ruled on 2026-07-31,
  amendments on branch `p1-auth` so they merge with the package. Two were the
  human owner's, both touching frozen section 7: GET /auth/google gains an
  optional tz query parameter (an IANA identifier carried to the callback;
  absent means UTC at provisioning and no sync on return; invalid is treated
  as absent, a recorded deviation from the 422 rule), and 7.1 now states that
  the auth endpoints mount under the /api/v1 base path. Three were the
  Steward's: 10.1 replaces the stale auth-library sentence with the sessions
  table's observable contract (named sessions, user_id ON DELETE CASCADE,
  expires_at reset to 30 days out by every authenticated request); 11.10
  records the createApp construction seam (synchronous, no I/O, injected
  DbClient and auth configuration, environment fallback); 9.2 gains the
  unverified-email page's normative copy. In support: 11.6 records the tz
  carrier, unconditional Secure, and the dev-login flag and build-exclusion
  semantics; 11.15 adds the tsc excluded-file emission hazard; 8.1 conditions
  the login sync on a carried tz and ignores tzdb aliases; the RFC 0001 P1
  row now names the P1 session order, adding the API and Contract role for
  the shared schemas its Owns section already covers. AC-007 and AC-113 are
  unblocked for the Adversarial Test role.
- At the P0 merge, spec 11.5 now records the sanctioned migrator's verified
  behavior, one transaction per run rather than per file, with the external
  fact and its revisit trigger as section 13 item 16; 11.1's second-instance
  checklist adds serializing the boot migration run; 11.10 scopes
  TEST_DATABASE_URL to test and database-script processes.
- Ownership gaps closed at the P0 merge: Vitest configuration and the
  repository root `.gitignore` and `.nvmrc` belong to Platform (10), and
  `app/index.html` belongs to the Frontend Architect (07). P0's placeholder
  client entry files stand as disclosed build anchors until P8 replaces them.
