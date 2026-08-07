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
  file will meet: 873 of 878 tests across 108 files pass on PGlite, every
  P4 file green except two cases in AC-052 and three in AC-057, which are
  escalated as false reds (the fixtures contradict the criteria's own
  expected sequences) and are not waiting on any wiring.
