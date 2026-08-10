# Wiring requests for the routers in this directory

The boot file (`src/server/index.ts`) belongs to the Platform engineer;
routers here are mounted by request, never by their authors (shared
protocol, section 3). This file is where those requests live, the same
convention as `src/server/auth/README.md` at P1. `health.ts` is Platform's
own and already mounted; entries below concern the rest.

Ownership, ruled at the P2 merge: this directory is shared by file, each
route file belonging to its route's owner, and this README is the shared
wiring ledger. Each role appends the section for its own router; the
Platform engineer, who executes the requests, may annotate or prune an
entry once it is fulfilled.

## folders router (P2, Collaboration and Permissions)

Requested wiring, one line in createApp, after the auth router's mount and
ahead of the `/api` catch-all:

```ts
import { createFoldersRouter } from './routes/folders.js'

app.use('/api/v1', createFoldersRouter({ dbClient: options.dbClient }))
```

Facts the wiring can rely on:

- The factory is synchronous, performs no I/O, and opens no database
  (11.10's createApp discipline carried through). With no dbClient, every
  data route answers the constructed-without-a-database 500, the auth
  router's convention, so route-presence probes still work.
- The router attaches its own session middleware and steps aside when the
  auth router's already ran on the request, so it is order-tolerant; the
  order above is still the one to prefer, because it resolves each
  request's session exactly once.
- The share-grant call site reaches the notify module through
  notifierOf(req.app), which createApp already attaches; no further
  wiring is needed for it.
- Mounting this router is what turns AC-011 to AC-024 green; nothing else
  is owed by the boot file for P2.

Fulfilled at fc6325f. Kept rather than pruned: the facts above still
describe the mounted router, and the next boot-file touch reads them.

## tasks router (P3, Collaboration and Permissions)

The 7.6, 7.7 and 7.8 surfaces: tasks, steps, and My Day membership.
Requested wiring, one line in createApp, beside the folders router's mount
and ahead of the `/api` catch-all:

```ts
import { createTasksRouter } from './routes/tasks.js'

app.use('/api/v1', createTasksRouter({ dbClient: options.dbClient }))
```

Facts the wiring can rely on:

- The factory is synchronous, performs no I/O, and opens no database, the
  same 11.10 discipline the folders router keeps. With no dbClient, every
  data route answers the constructed-without-a-database 500.
- It attaches its own session middleware and steps aside when another
  router's already ran on the request, so it is order-tolerant; after the
  auth router is still the order to prefer, because that resolves each
  request's session exactly once.
- It shares no path with the folders router (`/tasks`, `/tasks/:id/...`,
  `/steps/:id`), so the two mount in either order.
- It reaches no module the boot file does not already construct: no notify
  call site exists on this surface, because 5.3's share grant is the only
  outbound message P3 can cause and that call site is the folders router's.
- Mounting this router is what turns AC-025 to AC-044 green; nothing else is
  owed by the boot file for P3. Verified before the request was written, by
  mounting the two lines above locally and running the suite: 574 of 574
  tests across 79 files, the whole P3 range included, with the mount
  reverted before the commit so the tree this request describes is the tree
  the boot file will meet.

Fulfilled as requested, both lines verbatim, beside the folders mount. Every
fact above held: the factory took the same options, the paths met nothing the
folders router claims, and no further wiring was owed. The suite runs 579 of
579 on the PGlite leg, and the 11.11 release ritual passes against the real
boot path, health and an auth round trip and one CRUD cycle over this
surface.

## views router (P4, Query and Read-Path)

The 7.10 surface: the six view pages, the calendar, the folder page, and
search. Requested wiring, one line in createApp, beside the tasks router's
mount and ahead of the `/api` catch-all:

```ts
import { createViewsRouter } from './routes/views.js'

app.use('/api/v1', createViewsRouter({ dbClient: options.dbClient }))
```

Facts the wiring can rely on:

- The factory is synchronous, performs no I/O, and opens no database, the
  same 11.10 discipline the folders and tasks routers keep. With no
  dbClient, every route answers the constructed-without-a-database 500.
- It attaches its own session middleware and steps aside when another
  router's already ran on the request, so it is order-tolerant; after the
  auth router is still the order to prefer, because that resolves each
  request's session exactly once.
- Every endpoint on it is a GET, so it takes no CSRF link: 7.0 makes GETs
  safe and requires the token on mutations, and this package has none.
- It shares a path prefix with the folders router and no path with it.
  `GET /folders/:id/tasks` is 7.10's endpoint and this role's file by the
  P2 merge ruling that this directory is shared by file; the folders router
  claims `/folders`, `/folders/:id`, `/folders/:id/members` and
  `/folders/:id/my-membership`, none of which is `/folders/:id/tasks`.
  Express matches on the whole path, so the two never see each other's
  requests and mount in either order.
- It reaches no module the boot file does not already construct: no notify
  call site exists on a read surface.
- Mounting this router is what turns AC-045 to AC-058, AC-070 and AC-125 to
  AC-130 green. Verified before this request was written, by mounting the
  line above locally and running the whole suite, with the mount reverted
  before the commit so the tree this request describes is the tree the boot
  file will meet: 888 of 893 tests across 110 files pass on PGlite, every
  P4 file green except two cases in AC-052 and three in AC-057, which are
  escalated as false reds (both fixtures contradict their own criterion's
  expected sequence) and are not waiting on any wiring.

Fulfilled as requested, the line verbatim, beside the tasks mount. Every fact
above held: the factory took the same options, no path met one the folders
router claims, no CSRF link was owed on an all-GET surface, and no further
wiring was needed.

The measurement, which is this file's reason for saying more than "fulfilled".
The 888 of 893 above was taken against a mount its author could not commit,
because this boot file is Platform's, so on the committed tree every one of the
22 P4 files answered 404 and nobody had run that number. Mounted, the suite is
895 of 896 across 111 files on PGlite. The three tests the difference names are
AC-131's, added since; of the five reds that were escalated, four are repaired
and green. The fifth is still red and was misdiagnosed rather than repaired:
`AC-052: on the shared date the all-day row precedes the timed one` asserts
across every pending row on the page rather than across the shared date, and
Q3 sorts by due_date first, so the fixture's own later-dated all-day row sits
after the shared date's timed rows exactly as the criterion requires. It
contradicts the passing whole-sequence case in its own file, so it is a red in
the assertion and not in this router. Routed to the suite's owner; no wiring
is owed for it.

## invites and connections routers (P5, Collaboration and Permissions)

The 7.5 and 7.3 surfaces: invites with their five transitions and two lists,
and the roster with its one removal. Requested wiring, two lines in createApp,
beside the views router's mount and ahead of the `/api` catch-all:

```ts
import { createConnectionsRouter } from './routes/connections.js'
import { createInvitesRouter } from './routes/invites.js'

app.use('/api/v1', createInvitesRouter({ dbClient: options.dbClient }))
app.use('/api/v1', createConnectionsRouter({ dbClient: options.dbClient }))
```

Facts the wiring can rely on:

- Both factories are synchronous, perform no I/O, and open no database, the
  same 11.10 discipline the three merged routers keep. With no dbClient, every
  data route answers the constructed-without-a-database 500.
- Each attaches its own session middleware and steps aside when another
  router's already ran on the request, so they are order-tolerant; after the
  auth router is still the order to prefer, because that resolves each
  request's session exactly once.
- They share no path with each other or with the three merged routers
  (`/invites`, `/invites/sent`, `/invites/pending`, `/invites/:id/accept`,
  `/invites/:id/decline`, `/invites/:id/cancel`, `/invites/:id/resend`,
  `/connections`, `/connections/:userId`), so all five mount in any order.
  Express matches on the whole path, and nothing here is a prefix of
  `/folders`, `/tasks`, `/steps` or `/views`.
- Every mutation on them carries the CSRF link, and the two GETs do not, which
  is 7.0's split and the arrangement the folders router already uses.
- The invite and share-grant call sites reach the notify module through
  `notifierOf(req.app)`, which createApp already attaches; no further wiring is
  needed for them, as it was not for the P2 share grant.
- Mounting these two is what turns AC-059 to AC-069, AC-139, AC-140, AC-141
  and the acceptance-path arm of AC-124 green. It is not what turns AC-133 to
  AC-138 green: those need the separate call swap named below, which is the
  Security engineer's session, not this wiring.

Measured before this request was written, by mounting both lines locally and
running the whole suite with the account-deletion call swap in place, then
reverting both so the tree this request describes is the tree the boot file
will meet: 1025 of 1028 tests across 134 files pass on PGlite, against 949 of
1028 on the committed tree. The three that remain are two escalated criteria
and no wiring is owed for either; they are AC-060's leave-and-reinvite case
and two of AC-138's five, both recorded in this session's final block.

### Also owed, and not by the boot file: the 8.10 call swap

`src/server/domain/accountDeletion.ts` now carries steps 1 to 6 of the account
deletion transaction as `deleteAccountData(tx, userId)`. It opens no
transaction and touches neither the sessions table nor the user row, because
the seam `docs/team/README.md` fixes puts the DELETE /me route and steps 7 and
8 in the auth module. The swap is one line inside the transaction
`handleDeleteMe` already opens, ahead of the scrub:

```ts
import { deleteAccountData } from '../domain/accountDeletion.js'

await inTransaction(db, async (tx) => {
  await deleteAccountData(tx, userId)   // steps 1 to 6
  // the existing scrub (step 7) and session destruction (step 8) follow
})
```

That file is the Security engineer's, so this package does not make the edit;
the RFC 0001 P5 row already schedules the session for it. Verified in exactly
this shape during the measurement above: with the swap, AC-133 to AC-137 pass
whole and AC-138 passes but for the two cases escalated in this session's final
block. Until the swap lands, the function's only coverage is
`src/server/domain/accountDeletion.test.ts`, which drives it directly.
