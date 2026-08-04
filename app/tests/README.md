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
| P2S | AC-119 to AC-123 | Covered, failing until P2S lands the 7.2 endpoints |
| P3 to P10 | AC-025 to AC-104 | Not yet written |

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
NOT NULL booleans with defaults. The files fail today on the missing routes,
the same designed order as P2.

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
ruled PATCH response body is judged. Each file's header explains its own
decisions; five are worth knowing before reading any test.

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
