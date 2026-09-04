# Wiring requests for the routers in this directory

**This file is a record, and the process it describes no longer exists (noted
2026-09-04).** It was the wiring ledger of the thirteen-persona build: routers
were mounted by request rather than by their authors, each role appended the
section for its own router, and a Platform engineer executed and annotated the
requests. Those personas and the shared protocol behind them were deleted at
the workflow restructure (`a7886df`, 2026-09-01) and are in git history before
that commit. Every request below was fulfilled; the entries are kept because
each records why a mount is where it is, and `bundle.ts`'s mount order is
load-bearing. **Who owns what today is `CODEOWNERS`, and how work flows is
`docs/workflow/backend/README.md`: a router you add, you mount.** Read every
role name below as the name of a session that has ended.

The boot file is `src/server/index.ts`, and `health.ts` was mounted first.

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

Fulfilled as requested, both lines verbatim, beside the views mount. Every fact
above held, each checked against the two route files rather than taken from the
request: both factories are synchronous and take the same options object, both
step aside when `sessionOf(req)` is already set, and the nine paths they claim
meet no whole path of the three routers above or of each other. The snippet
typechecked unaltered, across all three projects.

The measurement, which is this file's reason for saying more than "fulfilled".
On the committed tree, with the 8.10 call swap already landed at 7bc9339 but
these two lines absent, the suite was 975 of 1041 across 136 files. Mounted, it
is 1041 of 1041: the whole suite green, every one of the 66 reds retired and
nothing sent red. The three reds the request expected to remain are gone
because the suite's owner repaired both criteria at c76687b, after this request
was written.

One correction to the split this request drew, and it is the request's only
inexact sentence. It says mounting these two is not what turns AC-133 to AC-138
green. Four of those six were indeed the swap's alone, but AC-133 and AC-137
each kept one case that the swap could not reach, because they confirm the
outcome through `GET /invites/pending` and `GET /connections`. Those two cases
needed both changes, so neither the swap nor this mount could have shown them
green on its own.

### Also owed, and not by the boot file: the 8.10 call swap

*(The file this entry names was `src/server/domain/accountDeletion.ts` when
the request was written and is `account-deletion.ts` since issue #38's
filename pass. The entry below is left as it was written, being a record of
a request that was made and fulfilled.)*

`src/server/domain/accountDeletion.ts` now carries steps 1 to 6 of the account
deletion transaction as `deleteAccountData(tx, userId)`. It opens no
transaction and touches neither the sessions table nor the user row, because
the seam the build-era plan fixed (`docs/team/README.md`, deleted with the
personas at `a7886df` on 2026-09-01) puts the DELETE /me route and steps 7 and
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

Fulfilled at 7bc9339, in the shape above, one call inside the transaction
`handleDeleteMe` already opened. AC-134 to AC-136 and AC-138 went green whole
with it; AC-133 and AC-137 each kept one case that also needed the routers
mounted, because they read the outcome through `GET /invites/pending` and `GET
/connections`.

Annotated by the Integration Steward at the P5 merge, with the ownership
question this entry raised ruled so it does not recur. This ledger's annotation
right belongs to the Platform engineer "as its executor" (the P2 ruling above),
which fits every entry that asks the boot file for something. This one does not:
its executor was the Security engineer, whose owned paths are
`app/src/server/auth/**` and do not reach this file, so the one role that could
report the work was the one role that could not write it down, and the entry
would have gone on reading as an open request indefinitely. **Ruling: for a
ledger entry whose request is not the boot file's, the executing role reports
completion in its commit message and the Steward annotates the entry at merge.**
Platform's right over boot-file entries is unchanged.

## the 7.9 reminder endpoints (P7, Collaboration and Permissions)

**No wiring is owed for these, and that is the whole request.** PUT and DELETE
`/tasks/:id/reminder` are handlers on `createTasksRouter`, which the boot file
has mounted since fc6325f, so they went live with the code rather than with a
line in `createApp`. The entry stands anyway, because the RFC's P7 row and this
package's own working notes both describe the reminder endpoints as unmounted,
and a Platform session reading that and finding nothing here would go looking
for a request that does not exist. There is nothing to add to the boot file.

Facts it can rely on, each read off the router rather than assumed:

- The two paths are new and whole: `/tasks/:id/reminder`, on PUT and on DELETE.
  Express matches whole paths, so neither meets `/tasks/:id`,
  `/tasks/:id/my-day`, or anything the folders, views, invites and connections
  routers claim.
- Both are mutations and both carry the CSRF link, `requireSession` then
  `requireCsrf` then the handler, which is 11.3's order and what every other
  mutation on this router already does.
- The factory is unchanged: still synchronous, still no I/O, still answering
  the constructed-without-a-database 500 when `options.dbClient` is absent.
- They reach no module the boot file does not already construct. The 8.6
  computation comes from `src/server/time`, which opens nothing, and no notify
  call site exists on this surface: 8.6's one outbound message is the delivery
  loop's, and that is the scheduler pass rather than a route.

What the boot file does still owe this package is Platform's own and not this
entry's to request: the 11.7 scheduler pass at
`app/src/server/scheduler/index.ts`, which the acceptance suite reaches through
the seam that section ratified. Measured with these two endpoints live and that
module absent, so the split between the two sessions is on the record rather
than inferred at the merge. AC-146, AC-147, AC-148, AC-149 and AC-151 pass
whole. AC-152 passes but for its login-sync control, which is 8.6's fifth
recompute trigger and fires in the auth module rather than here. AC-090 passes
its two 7.9 clauses and fails its two delivery clauses, which is the straddle
the P7 row predicted for that number. AC-085 passes but for one case that is a
false red and is escalated to the suite's owner, along with the identical case
in AC-084; both are recorded in `ef68ac9` and in that session's final block.

Read and confirmed by the Platform session at `198a672`, which is the reason
this entry was written: the request the RFC's P7 row implies does not exist,
and a session going looking for it would have found nothing and invented one.
Checked against `tasks.ts` rather than taken from the paragraph above: both
handlers are registered on `createTasksRouter`, at `/tasks/:id/reminder` on PUT
and on DELETE, each behind `requireSession` then `requireCsrf`, and that factory
has been mounted since `fc6325f`. **Nothing was added to `createApp` for them,
and nothing was owed.**

What the boot file did owe, and now carries, is the other paragraph's: the
scheduler. `main()` starts the 11.7 interval after `listen`, hands it the
application's own notifier as the sink so one construction decides what every
outbound message does, reads `SCHEDULER_HEARTBEAT_URL` for 11.12's heartbeat,
and stops the interval ahead of `server.close()` on SIGTERM. The notifier itself
gained the 11.8 transport at the same construction call, which is inside
`createApp` and is the only change to that function this package makes.

The measurement, on this session's own scope rather than the whole suite, which
the coordinating session runs after it. Before: 15 of 38 failing across the six
criterion files that reach the pass plus this role's two unit files, every one of
the fifteen the same "no reminder scheduler module could be loaded" assertion,
except AC-085's escalated case. After: 1 of 38, that one case. Over the whole P7
range and its neighbours, `ac-08*`, `ac-09*`, `ac-14*` and `ac-15*`, 135 of 138
pass; the three are AC-084's and AC-085's twin false reds recorded above and
AC-086's third case, which the phase 3 session escalated in
`src/server/auth/README.md` and which no implementation can pass beside AC-154's
third case.

One request in another file was fulfilled by this session and is deliberately
not annotated by it: the pruning call that `src/server/auth/README.md` has
carried since P1. That file is the Security engineer's path, and the P5 ruling
above covers exactly this shape, an entry whose executor cannot write in the
file that holds it. Reported in `198a672`'s message; the Steward annotates it at
the merge.

## The 10.6 PWA layer (P8, Frontend Architect)

Not a router and not the boot file. It is in this ledger because this is where
requests to the Platform engineer live, and by the P5 ruling above a ledger
entry whose request is not the boot file's is reported by its executor and
annotated by the Steward at merge. What it asks for is `vite.config.ts`, which
is Platform's under protocol section 3, and it is the only thing standing
between the client that is committed and the four criteria measured below.

Requested: the `vite-plugin-pwa` plugin, already in `package.json` as a
devDependency (added with the client shell, named and reasoned in that commit),
plus one `publicDir` line. Verbatim, and measured in exactly this shape:

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Dana',
        short_name: 'Dana',
        display: 'standalone',
        start_url: '/app',
        scope: '/',
        theme_color: '#1f2933',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        clientsClaim: true,
        skipWaiting: false,
        directoryIndex: null,
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  publicDir: 'src/client/public',
  build: { outDir: 'dist/client' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
```

Six of those values are load-bearing, and each was measured rather than
chosen. The rest are the plugin's defaults spelled out.

- **`navigateFallbackAllowlist: [/^\/app(\/|$)/]`** is AC-160, which is 9.1's
  closing sentence: "Every /app path falls back to the cached shell per 10.6;
  / does not." A fallback registered at the origin catches `/` too, and an
  offline visitor who has been here once then lands on a signed-out
  application instead of the public page 9.2 wrote for them.
- **`directoryIndex: null`** is the other half of that same criterion, and it
  is the one that is invisible until it fails. Workbox defaults it to
  `'index.html'`, which makes a request for `/` match the precached
  `/index.html` through the precache route rather than through the navigation
  fallback, so the allowlist above is bypassed and `/` opens the shell offline
  anyway. Measured: with the default, AC-160's first case fails on its second
  assertion while every other criterion here still passes.
- **`clientsClaim: true`** is what makes the worker control the page that
  registered it, without waiting for a second navigation. Without it,
  `navigator.serviceWorker.controller` is null for the whole of a first visit,
  which is the precondition AC-091, AC-100 and AC-160 each assert before
  anything else; measured, all six of those cases failed on that one
  assertion with the plugin otherwise correctly configured.
- **`skipWaiting: false`** is 10.6's no-forced-reload rule and is the plugin's
  default for `registerType: 'prompt'`. It is spelled out because it sits
  beside `clientsClaim` and the pair reads as one decision: the first worker
  claims immediately, and every later one waits for the person. Claiming does
  not activate a waiting worker, so the two do not fight.
- **`injectRegister: null`** because the client registers the worker itself,
  in `src/client/pwa/registerServiceWorker.ts`. Left at its default the plugin
  injects a second registration into the built HTML, and the page then has two
  registrations for one worker with only one of them able to raise the update
  prompt.
- **`publicDir: 'src/client/public'`** is where the two manifest icons live.
  They are committed at `app/src/client/public/icon-192.png` and
  `icon-512.png`, inside this role's owned paths, which is the reason for the
  line: the alternative, Vite's default `app/public/`, is a directory no
  persona owns and would have needed a ruling of its own. **The two files are
  placeholders**, flat 192 and 512 squares in the theme colour, and they are
  design's to replace under 11.13; AC-163 fetches them and asserts the
  manifest lists both sizes, which they satisfy, and asserts nothing about
  what is drawn on them, which is the part that is still owed.

Facts the wiring can rely on:

- Nothing in `src/client` imports `virtual:pwa-register`, so the tree builds
  green with the plugin absent and builds green with it present. The reason
  and the recorded deviation from 11.4's parenthetical are in
  `src/client/pwa/registerServiceWorker.ts` and in `src/client/README.md`;
  the flow is 11.4's, the import is not, and the swap is that one file if the
  Steward rules the other way.
- The generated worker carries workbox's `SKIP_WAITING` message listener,
  which is what `applyUpdate` posts to. Verified in the built `sw.js`.
- No server change is owed. `createApp` already serves `dist/client`
  statically ahead of its SPA catch-all, so `sw.js`, `workbox-*.js`,
  `manifest.webmanifest` and both icons are served as files with their own
  content types, and `/api` stays ahead of the catch-all so no API path can
  reach the shell.

Measured before this request was written, by adding the block above locally
and running the four browser specs it concerns, then reverting `vite.config.ts`
so the tree this request describes is the tree Platform will meet. With the
block: **AC-091 3 of 3, AC-160 2 of 2, AC-163 2 of 2**. Without it, all seven
fail on the same first assertion, that no service worker controls the page.

AC-100 is the exception and it is not this wiring's to fix. Its one case fails
with the block in place, and the cause was measured rather than inferred:
`context.route()` does not intercept the browser's fetch of the service worker
script during `registration.update()`, so the spec's simulated new build never
happens, the script comes back byte-identical, and no update is found. Driven
instead by appending one comment to the built `dist/client/sw.js` and calling
`registration.update()`, every clause of AC-100 holds against this client: the
registration goes to `waiting`, the "Update available, reload" button appears,
the mark set on the document survives, and the URL does not change. Routed to
the Adversarial Test Engineer with that measurement and the recommendation
that the spec make the new build real on disk rather than on the wire.

Fulfilled as requested, every value verbatim, in `vite.config.ts`. Annotated by
the Platform engineer under the P2 ruling above, which gives this right to the
role that executes the request, and reported in the commit as well, which is
what the P5 ruling asks of an entry the boot file does not own; the two rulings
name different halves of one act here, because for once the executor and the
annotator are the same role.

The measurement, taken on this tree rather than copied from the request. Before
the block, on the committed tree, the whole browser leg ran 63 passed and 16
failed in CI. After it, the four specs this entry concerns run **AC-091 3 of 3,
AC-160 2 of 2, AC-163 2 of 2**, which is the request's own figure reproduced,
and the seven cases moved from red to green.
The whole browser leg moved with them, and CI rather than this machine is the
authority on that: 63 passed and 16 failed at `06b1ebe`, 70 passed and 9 failed
at `de479b6`, the same nine reds either way.

AC-100 stays red and its red moved, which is the part worth recording. Before
the block it failed on the precondition every PWA criterion shares, that no
service worker controlled the page. It now reaches its own sentence and fails
waiting twenty seconds for the "Update available, reload" control, which is
exactly what this entry predicts: `context.route()` never intercepted the
worker script, so no new build was ever offered and there was nothing for the
affordance to announce. The cause is the criterion's mechanism and not this
configuration, and it sits with the Adversarial Test Engineer where the entry
routed it.

Six values were checked against the installed plugin rather than trusted.
`directoryIndex` is typed `string | null` in workbox-build, so the `null` this
entry requires is expressible and not a cast. The build emits `sw.js`,
`workbox-*.js`, `manifest.webmanifest` and both icons into `dist/client`,
precaching 9 entries, and `createApp` serves all of them with no server change,
as the entry said it would.

## export router (7.22, data export, issue #77)

`GET /me/export`, one route, one file. Requested wiring, one line in
`createApp`, beside the bundle router's mount and ahead of the `/api`
catch-all:

```ts
import { createExportRouter } from './routes/export.js'

app.use(
  '/api/v1',
  createExportRouter({ dbClient: options.dbClient, rateLimits, securityLog }),
)
```

Facts the wiring can rely on, each read off the file rather than assumed:

- The factory is synchronous, performs no I/O, and opens no database, the
  same 11.10 discipline every router here keeps. With no `dbClient` the route
  answers the constructed-without-a-database 500, so a route-presence probe
  still builds the application.
- It goes through `routes/preamble.ts` like the rest of this directory, so it
  attaches its own session middleware and steps aside when another router's
  has already run: order-tolerant, and after the auth router is still the
  order to prefer.
- `/me/export` is a whole path no earlier router claims. The `/me` family is
  already split three ways — 7.1's account endpoints and 7.2's settings in
  `auth/router.ts`, 7.15's `/me/avatar` in `routes/files.ts` — and Express
  matches whole paths, so this mount is order-independent among all of them.
  It carries no `:param` segment, so it can shadow nothing.
- It is a GET, so 7.0 gives it no CSRF link. It carries `requireSession`,
  which AC-236's reading half asserts along with every other GET.
- **Two options rather than one, and both are new to this ledger.** It takes
  `securityLog` because 10.5 records one line per export, and `rateLimits`
  because 10.4 gives the route a limit of its own, five per hour per person —
  the first limit in this API on a read. Both are already constructed in
  `createApp` and handed to other routers; nothing new is built for this one.
- It reaches no module the boot file does not already construct. No notify
  call site exists on a read surface.
- Mounting it is what turns AC-390 to AC-393 green, and it moves AC-236's
  reading count by one, from 37 to 38, in the same change.

Fulfilled at the same commit that wrote this entry, the line verbatim, beside
the bundle mount.
