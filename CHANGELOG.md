# Changelog

Notable changes to Dana, per release. Curated for humans: not every commit appears
here, only things worth knowing about. Format follows Keep a Changelog; versions
follow Semantic Versioning.

## [Unreleased]

Planning and design. No software has been released yet.

### Added
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
