# The acceptance suite

The numbered behaviors of spec section 12, AC-001 to AC-115, written by the
Adversarial Test role and by nobody else (protocol section 8). Implementers do
not edit these files; an acceptance test that seems wrong is an escalation, not
a patch.

Run one criterion by its number, which matches on the test name rather than the
file name:

```bash
npx vitest run -t "AC-105"
```

## Coverage

| Package | Criteria | State |
| - | - | - |
| P0 | AC-001 to AC-004 | Covered, passing |
| P1 | AC-005, AC-006, AC-008, AC-009, AC-010 | Covered, failing until P1 lands |
| P1 | AC-105 to AC-112, AC-114, AC-115 | Covered, failing until P1 lands |
| P1 | AC-007, AC-113 | **Held**, see below |
| P2 to P10 | AC-011 to AC-104 excluding the above | Not yet written |

## Held pending escalation

Two P1 criteria are deliberately unwritten. Both are blocked on a contract the
specification does not fix, and writing them now would freeze a guess into the
suite that the implementation would then be measured against.

**AC-007** (a returning login from a different timezone syncs `users.timezone`).
Section 7.1 says the value comes from "the login page's detected zone" and
section 8.1 says it "auto-syncs at login", but the frozen section 7 surface
carries no parameter, header, or cookie on `GET /auth/google` or its callback
that could carry it. The same gap holds back one assertion in AC-005, which
asserts INV-14's "valid IANA timezone" instead of a specific value. Resolving it
is a frozen-interface change: Integration Steward to the human owner.

**AC-113** (30-day expiry, rolling extension). Both halves are unobservable from
outside. Expiry needs a session row backdated past its expiry, and the rolling
extension needs the stored expiry read before and after a request; sessions are
the Security engineer's own table, outside the section 4 model by 10.1, so this
suite cannot know its shape. It needs either the table's observable shape or a
time seam, and the same escalation asks that the table's foreign key onto
`users(id)` be `ON DELETE CASCADE`, since the shared-database CI leg deletes
users during cleanup.

## The harness

`helpers.ts` is the P0 harness: the database seam, rejection matching by
constraint name, and user cleanup. `auth-harness.ts` adds what the P1 criteria
need, `http-client.ts` carries the transport, and `oidc-stub.ts` is the stub
identity provider. Each file's header explains its own decisions; three are
worth knowing before reading any test.

**The stub is the Adversarial Test role's, exclusively.** The Security
engineer's module passes against it unmodified and never edits it (personas 06
and 11). It refuses an authorization request that arrives without a PKCE
challenge, which is what stops AC-107 from being satisfiable by an
implementation that never sends one.

**Cookies are identified by property, never by name.** Spec 11.6 fixes that the
session cookie is httpOnly and the CSRF cookie is not, and fixes no names.

**The auth path base is probed.** Section 7.0 fixes the base path `/api/v1`
while 7.1 spells the endpoints `/auth/google`, so both are tried and the one
that redirects is used. This is recorded as an escalation so it is decided
rather than discovered; it is not blocking.

## What the tests need from outside `app/tests/`

One seam, escalated to the Integration Steward and not yet ratified.
`createApp` in `src/server/index.ts` takes no arguments and opens no database.
Spec 11.10 requires the acceptance suite to exercise section 7 over HTTP
against the real application in-process, and under the default PGlite backend
the suite's database is an in-memory handle that cannot be passed by connection
string, so the application has to receive the `DbClient` object. The harness
assumes:

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
}): Express | Promise<Express>
```

The harness also sets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_ISSUER_URL`, `APP_ORIGIN`, and `OIDC_ALLOW_INSECURE` before calling it,
so an implementation that reads its configuration from the environment is fed
either way. Only the database handle genuinely needs the parameter.

Four properties of the implementation follow from the tests and are worth
knowing before writing it rather than after:

- The issuer must be injectable. An implementation that hardcodes
  `https://accounts.google.com` cannot be tested at all.
- `Secure` must be set on the session cookie unconditionally, not derived from
  whether the request arrived over TLS. The suite speaks plain http, and in
  production TLS terminates at the host ahead of the process.
- `DANA_DEV_LOGIN` must be read per `createApp()` call rather than at module
  load, or AC-114's controls cannot vary it.
- The development login route must be absent from the compiled output, not
  merely guarded at runtime, because AC-114 sets `DANA_DEV_LOGIN=1` against the
  production build. Excluding its module from `tsconfig.build.json` is the
  mechanism available; that file is the Platform role's.
