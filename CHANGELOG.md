# Changelog

Notable changes to Dana, per release. Curated for humans: not every commit appears
here, only things worth knowing about. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

Planning and design. No software has been released yet.

### Added

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

### Changed

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
- Package P0 of RFC 0001, the first code: the `app/` package and toolchain
  (Node 24, TypeScript strict, ESM, Vite 8, Vitest 4, ESLint 9), CI in the
  11.11 step order with the postgres:18 leg, a boot file that applies
  migrations before /api/health reports ready, one hand-authored migration
  realizing every constraint and index of spec section 4 by name, the seed
  dataset, the PGlite or Postgres database seam, and acceptance tests AC-001
  to AC-004.

### Changed

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
