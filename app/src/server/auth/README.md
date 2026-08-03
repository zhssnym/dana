# The authentication module (spec 11.6)

Owned by the Security and Privacy engineer (`docs/team/06-security-and-privacy.md`).
Implements sections 7.1, 10.1, and 11.6 against the acceptance criteria AC-005
to AC-010 and AC-105 to AC-115.

## How this module is wired

**Mounted since `82ad14c`.** `createApp` in `app/src/server/index.ts` mounts the
router at `/api/v1`, ahead of the `/api` catch-all, passing its own `dbClient`
and `auth` straight through:

```ts
app.use('/api/v1', createAuthRouter({ dbClient: options.dbClient, auth: options.auth }))
```

That file is the Platform engineer's (persona 10, Owns), so changes to the
mount are a request to that role rather than an edit from here. The wiring
request this section used to carry was fulfilled in that commit; what follows
is what a later reader needs to know about the arrangement.

`createAuthRouter` is synchronous, performs no I/O, and opens no database, so
it satisfies 11.10's construction seam. It reads `DANA_DEV_LOGIN` at call time,
which is where 11.6 requires the flag to be read. Both options may be absent:
routes that touch the database answer 500 when called without
`options.dbClient`, and the issuer is resolved lazily on the first request that
needs it, so a bare `createApp()` still builds and AC-114's route-presence
probe still works.

The module also exports the 11.3 middleware (`attachSession`, `requireSession`,
`requireCsrf`, `sessionOf`) from `./auth/index.js`. P2 onward mount their own
routers behind those three, in that order; persona 06's Handoff calls the order
a stable interface.

**Still outstanding: the pruning call.** When the P7 scheduler lands, its pass
should call the pruning function, which is the second of 11.7's two duties:

```ts
import { pruneExpiredSessions } from './auth/index.js'
// inside the 60-second pass, after the reminder work:
await pruneExpiredSessions(dbClient.db)
```

Pruning is hygiene, not revocation (11.6): `resolveSession` already refuses an
expired row the pass has not reached, and logout and account deletion delete
rows themselves. Nothing breaks while this is unwired; rows merely accumulate.

## What is here

| File | What it owns |
| - | - |
| `router.ts` | The 7.1 endpoints, composed in the 11.3 order |
| `middleware.ts` | Session resolution, then CSRF on mutations; the exported interface |
| `oidc.ts` | Configuration resolution and lazy discovery, memoized on success only |
| `sessions.ts` | The 10.1 sessions table: create, resolve and roll, destroy, prune |
| `tokens.ts` | CSPRNG identifiers, the sha256 digest, the derived CSRF token |
| `cookies.ts` | The three cookies of 11.6 and their flags |
| `pending.ts` | The pending-authorization records of 11.6 |
| `provisioning.ts` | The 7.1 provisioning transaction, idempotent under `google_sub` |
| `timezone-sync.ts` | 8.1's alias rule, the one predicate the shared validator lacks |
| `account.ts` | `/me`, and the 8.10 deletion stub the P1 row places here |
| `pages.ts` | The 9.2 unverified-email page, the only page this module renders |
| `dev-login.ts` | Excluded from production builds; see 11.6 and 11.15 |

One file outside this directory belongs to the same role:
`app/src/server/security/log.ts`, the beginning of 10.5's logging policy,
which P9 extends rather than replaces.

## Open items for the Steward

- **openid-client does not verify the ID token signature in the code flow by
  default**, as OIDC Core 3.1.3.7 item 6 permits, which AC-106 forbids.
  `oidc.ts` switches on `enableNonRepudiationChecks`; verified against the
  installed version, a rogue-key token signed in without it. Protocol section 6
  routes a library-versus-specification difference to the Steward and asks for
  it in spec section 13, which is not this role's path to write.
- **An email collision with a different `google_sub` is unruled.** 7.1 makes
  provisioning idempotent under `google_sub` only; a new subject claiming an
  email that already belongs to an active account hits
  `users_email_active_idx`. The callback refuses cleanly rather than crashing,
  but which account should win is a product decision. Section 13 item 1 (the
  Gmail dotted-variant claim) is the same question from another angle.
- **In-memory pending authorizations are a fourth item for 11.1's
  single-instance checklist**, which today names three (rate limiting, the
  reminder tick, the boot migration run).
- **`sessions` has no index on `user_id`**, which the deletion path and the
  10.1 cascade both scan. `app/db` is the Data engineer's path; worth an 0003
  if P9's sweep agrees it matters.

## Two decisions worth knowing before changing anything

**The CSRF token is derived, not stored.** 11.6 requires it bound to the
session. It is `HMAC-SHA256(key = the session's own token, "dana.csrf.v1")`, so
the binding needs no column that the 10.1 sessions table does not have, and the
readable cookie cannot be turned back into the httpOnly one. Storing it instead
would need a migration in `app/db`, which is the Data engineer's path; the
Steward's ruling in `5e01e49` left that request open and this makes it
unnecessary.

**Pending authorizations live in process memory.** 11.6 fixes what the record
holds and never where it lives. They are keyed by an opaque identifier in an
httpOnly cookie, which is what binds a state to one browser (AC-105), removed
on use (single use), and swept on a ten-minute TTL. The cost is that an
authorization begun before a restart cannot complete, which costs one click on
a sign-in that had not finished. This rides on the single-instance assumption
11.1 already records for rate limiting and the reminder tick rather than adding
a new one; a second instance would need this moved alongside those two.
