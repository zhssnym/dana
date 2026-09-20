# The authentication module (spec 11.6)

`CODEOWNERS` at the repository root asks Hassan to review a change here, and
since 2026-09-04 that is all it does: there is one team and no area anyone may
not edit. `docs/workflow/backend.md` is how work on this module flows,
and `docs/workflow/hard-stops.md` is what stops it. The thirteen persona files
this line used to name were deleted at the workflow restructure (`a7886df`,
2026-09-01) and are in git history before that commit.

Implements sections 7.1, 7.2, 10.1, and 11.6 against the acceptance criteria
AC-005 to AC-010, AC-105 to AC-115, and AC-119 to AC-123.

P7 added one obligation from outside that list. 8.6's fifth recompute trigger is
the assignee's `users.timezone`, and both doors that move that column are here:
the callback's login sync and PATCH /me. AC-086 and AC-154 therefore read this
module as well as the reminders engine, which is why the P7 kickoff wrote the
trigger into the reminders seam of the build-era plan; nothing had named it
before that. That plan went with the personas, and the seam it fixed is this
module's, stated here.

## How this module is wired

**Mounted since `82ad14c`.** `createApp` in `app/src/server/index.ts` mounts the
router at `/api/v1`, ahead of the `/api` catch-all, passing its own `dbClient`
and `auth` straight through:

```ts
app.use('/api/v1', createAuthRouter({ dbClient: options.dbClient, auth: options.auth }))
```

That file is Hassan's, as is this module, so a change to the mount is an
ordinary edit rather than a request to another role. The wiring request this
section used to carry was fulfilled in that commit; what follows is what a
later reader needs to know about the arrangement.

`createAuthRouter` is synchronous, performs no I/O, and opens no database, so
it satisfies 11.10's construction seam. It reads `DANA_DEV_LOGIN` at call time,
which is where 11.6 requires the flag to be read. Both options may be absent:
routes that touch the database answer 500 when called without
`options.dbClient`, and the issuer is resolved lazily on the first request that
needs it, so a bare `createApp()` still builds and AC-114's route-presence
probe still works.

The module also exports the 11.3 middleware (`attachSession`, `requireSession`,
`requireCsrf`, `sessionOf`) from `./auth/index.js`. P2 onward mount their own
routers behind those three, in that order, and that order is a stable
interface: changing it changes every router mounted behind it.

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
| `router.ts` | The 7.1 and 7.2 endpoints, composed in the 11.3 order |
| `middleware.ts` | Session resolution, then CSRF on mutations; the exported interface |
| `oidc.ts` | Configuration resolution and lazy discovery, memoized on success only |
| `sessions.ts` | The 10.1 sessions table: create, resolve and roll, destroy, prune |
| `tokens.ts` | CSPRNG identifiers, the sha256 digest, the derived CSRF token |
| `cookies.ts` | The three cookies of 11.6 and their flags |
| `pending.ts` | The pending-authorization records of 11.6 |
| `provisioning.ts` | The 7.1 provisioning transaction, idempotent under `google_sub` |
| `timezone-sync.ts` | 8.1's zone sync: the alias predicate the shared validator lacks, and `writeTimezone`, which writes the column and then fires 8.6's fifth trigger. Both doors call it, so the order cannot be got right in one and wrong in the other |
| `account.ts` | `/me`, and the 8.10 deletion stub the P1 row places here |
| `pages.ts` | The 9.2 unverified-email page, the only page this module renders |
| `dev-login.ts` | Excluded from production builds; see 11.6 and 11.15 |

One file outside this directory belongs with this module:
`app/src/server/security/log.ts`, the beginning of 10.5's logging policy,
which P9 extended rather than replaced.

## Open items

**The Steward this heading used to name went with the personas** (`a7886df`,
2026-09-01). What is open below is Hassan's, and the channel for one is a
GitHub issue; `docs/workflow/backend.md` is the process.

- **AC-086's third case cannot pass beside AC-154's third case, and the fixture
  is why.** Raised at the P7 phase 3 session and escalated rather than fixed,
  under the build-era rule for "an acceptance criterion appears wrong"; the
  standing rule now is `docs/workflow/workflow.md`'s rule 6, which says the same
  thing. `AC-086: one login recomputes two due dates either
  side of a transition` builds its two reminders on due dates in 2010, so
  `planReminder` computes an instant sixteen years past and frozen 7.9's own
  qualifier writes them `skipped`, which the probe confirms. 8.6's ruling of
  2026-08-10 then puts them outside the timezone trigger, in the sentence
  AC-154's third case transcribes: "a skipped row is outside the timezone
  trigger too". The case said the two instants move; the ruling says they do
  not. No implementation satisfies both, and this module cannot resolve it
  without contradicting settled spec text or the engine it imports.
  Recommendation, verified against the engine before being written down: the
  case seeds the two rows back to `scheduled` before the login, with
  `setReminderState` from `tests/support/reminders-harness.ts`, which AC-154 already
  uses for the same reason. With that one line the recompute writes exactly the
  instants the case asserts, `2010-01-15T14:00:00Z` and `2010-07-15T13:00:00Z`,
  and the rows land back in `skipped` afterwards, which the case never reads.
  The historical dates stay, so section 13 item 25's fixture rule is untouched,
  and the property the case exists for, that each row resolves in the zone as it
  stood on its own due date rather than by one offset delta applied to all,
  survives intact. The two alternatives are worse: future due dates would break
  item 25, and deleting the case would lose a property nothing else covers.
- **openid-client does not verify the ID token signature in the code flow by
  default**, as OIDC Core 3.1.3.7 item 6 permits, which AC-106 forbids.
  `oidc.ts` switches on `enableNonRepudiationChecks`; verified against the
  installed version, a rogue-key token signed in without it. A
  library-versus-specification difference belongs in spec section 13, and
  `docs/spec/` is changed through an RFC rather than from a module README.
- **An email collision with a different `google_sub` was unruled and is ruled.**
  7.1 makes provisioning idempotent under `google_sub` only; a new subject
  claiming an email that already belongs to an active account hits
  `users_email_active_idx`. Imran ruled it on issue #17 on 2026-09-03: Dana
  never joins two accounts because their addresses look alike, so the refusal
  stands and now renders 9.2's claimed-email page instead of bouncing to the
  landing page unexplained. `provisioning.ts`'s `emailStanding` names the
  collision before the insert and the callback re-reads it after any
  provisioning fault, which covers the race. **Both sites call one predicate,
  `isEmailCollision`, and that is load-bearing rather than tidy:** the
  `!subjectKnown` half looks like it does nothing from either site alone,
  because the standing query already excludes the subject's own row, and
  deleting it passed the whole suite until AC-346 gained the case that only it
  decides, a returning subject whose address at Google has moved onto a live
  account. The Gmail dotted-variant half of
  the same issue is deferred by the same ruling and specified as current
  behaviour at 10.1: no normalisation of any kind, in either direction.
  AC-346.
- **In-memory pending authorizations are a fourth item for 11.1's
  single-instance checklist**, which today names three (rate limiting, the
  reminder tick, the boot migration run).
- **`sessions` has no index on `user_id`**, which the deletion path and the
  10.1 cascade both scan. One forward-only migration in `app/db` would add it,
  and it is worth one if a measurement agrees it matters.
- **Disclosed for ratification at the P2S merge, in the token_hash-CHECK
  pattern rather than as an escalation: `user_settings.updated_at` moves on a
  writing PATCH and not on the empty subset.** 4.10 gives the column a
  `now()` default and never says when it moves afterwards, no endpoint exposes
  it, and no criterion observes it, so this is a judgment inside an owned file
  rather than a spec question. It is recorded because it is the one behavior of
  these endpoints nothing outside `settings.test.ts` would catch changing.

## Two decisions worth knowing before changing anything

**The CSRF token is derived, not stored.** 11.6 requires it bound to the
session. It is `HMAC-SHA256(key = the session's own token, "dana.csrf.v1")`, so
the binding needs no column that the 10.1 sessions table does not have, and the
readable cookie cannot be turned back into the httpOnly one. Storing it instead
would need a migration in `app/db`; the ruling in `5e01e49` left that request
open and this makes it unnecessary.

**Pending authorizations live in process memory.** 11.6 fixes what the record
holds and never where it lives. They are keyed by an opaque identifier in an
httpOnly cookie, which is what binds a state to one browser (AC-105), removed
on use (single use), and swept on a ten-minute TTL. The cost is that an
authorization begun before a restart cannot complete, which costs one click on
a sign-in that had not finished. This rides on the single-instance assumption
11.1 already records for rate limiting and the reminder tick rather than adding
a new one; a second instance would need this moved alongside those two.
