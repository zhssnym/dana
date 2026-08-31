# A2 — The server and the database

Analysis of `app/src/server/**`, `app/db/**`, `app/tsconfig.server.json` and
`app/scripts/**`, written for the workflow redesign on the `pipelines` branch.

Scope note: this is discovery only. Nothing in the application was changed, no
test leg was run, and every claim below comes from a file I opened. Where I am
inferring rather than observing I say so in the sentence.

Two documents constrain what I recommend. `agreement.md` section 5: a problem
found outside your own domain is reported as a GitHub issue, not fixed; a
CODEOWNERS file will define directories; Imran never pushes to `main`. And
spec section 11, which is the design this code is supposed to match.

---

## 1. What the backend is

### 1.1 The shape in one paragraph

One Node process. It builds one Express application in
`app/src/server/index.ts`, mounts a stack of routers under `/api/v1`, and (in
production, after a build) also serves the React bundle from the same origin.
There is no second service, no queue, no worker. The only thing running on a
timer is the reminder scheduler, and it lives inside this same process. All
data goes through Drizzle's `sql` template against Postgres — a real Postgres
18 in production, an embedded one (PGlite) in most tests. The switch between
those two is one file, `app/db/client.ts`.

### 1.2 The folders, and what each is responsible for

| Folder | Responsible for |
| - | - |
| `auth/` | Sign-in and identity. The Google OIDC handshake, the `sessions` table, the two cookies, the CSRF check, `/me`, `/me/settings`, and the development login. Also exports the three middlewares everything else builds on. |
| `routes/` | HTTP only. Parse the URL, validate the body against a shared schema, call a domain function, turn its answer into a status code and JSON. Fourteen router files, one per resource group. |
| `domain/` | The rules. Everything that decides whether something is allowed, and every SQL statement that writes. This is where "a task's assignee must be a member of its folder" lives. |
| `views/` | The read side. The eight list queries of spec section 6 (My Day, Planned, Done, search, the calendar), plus the one row projection they all share. Read-only; nothing here writes. |
| `time/` | Calendar and clock arithmetic. Recurrence rules, "what day is it in this person's timezone", when a reminder should fire. Deliberately a black box to its callers. |
| `http/` | The error envelope. `sendError` and `sendValidationError` — four functions, and every route answers through them. |
| `security/` | Rate limiting (`rate-limit.ts`) and the logging policy (`log.ts`). The log policy is a closed set of allowed fields, so task titles and email addresses have no parameter through which they could reach a log line. |
| `observability/` | The Express error handler, the Sentry seam, the Axiom log destination. |
| `notify/` | Outbound email. Four templates, a Resend transport in production, a log-only path everywhere else. |
| `scheduler/` | The 60-second tick and the pass it runs. |
| `files/` | `store.ts` — three functions (`put`, `get`, `remove`) over a directory on disk. Bytes only; the `files` table is the authority on who owns what. |
| `sample/` | The starter workspace a brand-new account is written at first sign-in. |

Two files sit at the top level rather than in a folder:

- `index.ts` — builds the app, sets the security headers, mounts every router
  in order, and (as `main()`) boots the process: load `.env`, check sign-in is
  configured, run migrations, listen, start the scheduler.
- `database.ts` — the two functions every SQL-touching module uses:
  `inTransaction(db, fn)` and `rowsOf(executor, sql)`. Nine lines of real code.

`app/db/` is separate from all of this and is covered in section 4.

### 1.3 One request, all the way through

Take `POST /api/v1/tasks` with a JSON body. Here is every step, in order.

**1. `app/src/server/index.ts:185` — security headers.** First middleware in
the chain, so it runs on every response including refusals. It sets
`Content-Security-Policy` and `Referrer-Policy` from the array at line 175.

**2. `index.ts:247` — body parsing.** `express.json({ limit: 3MB })`. A body
larger than that never reaches a handler; the parser answers 400 itself.

**3. `index.ts:255-267` — the non-object guard.** If the body parsed to an
array or a scalar rather than an object, answer 400 here. This exists because
`express.json` accepts arrays, and the API contract says a body that is not an
object is malformed.

**4. `index.ts:269` — `/api/health` is tried and does not match.**

**5. `index.ts:286` — the auth router is mounted at `/api/v1`.** Our request
enters it. Inside, at `auth/router.ts:188`, the router's first middleware is
`attachSession(db)` with no path, so **every** `/api/v1/*` request runs it,
not just the auth endpoints.

**6. `auth/middleware.ts:39` — `attachSession`.** Reads the `dana_session`
cookie. If absent, `next()` immediately — this middleware never refuses
anything. If present, it calls `resolveSession(db, token)` in
`auth/sessions.ts`, which hashes the token and looks up the row. On a hit it
stores `{ userId, token }` in a `WeakMap` keyed by the request object
(`middleware.ts:28`) and re-sets both cookies so the 30-day expiry rolls. The
WeakMap matters: there is no `req.user`, so a handler physically cannot read
the viewer without importing `sessionOf`.

**7. No auth route matches `/tasks`,** so Express leaves the auth router and
continues down `createApp`'s list.

**8. `index.ts:307` — the tasks router.** Its own `attachSession` block
(`routes/tasks.ts:156`) checks `sessionOf(req) !== undefined` first and steps
aside, because step 6 already ran. That block exists so the router can be
mounted alone in its unit test; in the real application it never does work.

**9. `routes/tasks.ts:171` — the route matches.** Four handlers in order:

- `requireSession` (`middleware.ts:63`) — no WeakMap entry, 401, stop.
- `requireCsrf` (`middleware.ts:80`) — recomputes the expected token from the
  session's own cookie token and compares it to the `X-CSRF-Token` header. Not
  cookie-against-header, which an attacker who can set cookies defeats.
  Mismatch, 403, stop.
- `mutationLimit` — the shared in-memory limiter, keyed by user id, 120
  mutations a minute (`security/rate-limit.ts:20`). Over, 429, stop.
- the handler.

**10. The handler.** `database(res)` returns the `Db` or answers 500 if the
app was built without one. `postTasksBody.safeParse(req.body)` runs the zod
schema from `app/src/shared/tasks.ts`; failure goes to `sendValidationError`,
which turns every failing field into one 422 message. Then it calls
`createTask(db, viewer(req), parsed.data)` and does nothing else but map the
result.

**11. `domain/tasks.ts:617` — `createTask`.** One transaction
(`inTransaction`, which is `database.ts`). Inside, in order:

  - resolve the folder: the body's `folder_id`, or the viewer's Inbox.
  - **`accessOf(tx, viewerId, folderId)`** (`domain/folders.ts:57`) — a SELECT
    that joins `folder_members` on the viewer. Null means either the folder
    does not exist or the viewer is not a member; both answer 404. This is the
    authorization check.
  - read the folder's member list once, and use it for both assignment rules:
    a one-member folder forces the assignee, and a named assignee must be a
    member.
  - if a section was named, check it belongs to this folder.
  - `INSERT INTO tasks ... RETURNING id`.
  - optionally write the reminder row, optionally insert the steps.
  - `recordEvent(...)` (`domain/events.ts:70`) — one mutation, one event row,
    plus notification rows for anyone who should hear about it.
  - re-read the task through `taskView` (`domain/tasks.ts:262`) and return it.

  Every refusal returns before the first write, so a request that fails on any
  rule writes none of itself.

**12. Back in the route,** a `switch` over the result kind: `folder_not_found`
→ 404, `assignee_not_member` → 422 naming the field, `created` → 201 with the
task.

**13. `index.ts:414` — the error handler.** Only reached if something threw.
It logs through the security logger (whitelisted fields only), reports to
Sentry, and answers a 500 envelope.

What is worth noticing from that walk: **the route file makes no decisions.**
It parses, it delegates, it maps an answer to a status code. All eleven rules
in step 11 are in `domain/`. That separation is real and it holds across the
surface — see section 5 for the one place it does not.

---

## 2. The authorization chokepoint

Spec 10.2 says: "every data query joins `folder_members` on the viewer, and
every mutation resolves the 5.4 matrix server-side before touching rows." Spec
11.1 goes further: "no code path touches the database without passing the 10.2
chokepoint middleware."

**The 11.1 sentence is not true as written, and it never could be.** There is
no authorization middleware. Nothing in Express can know whether a request is
allowed to touch folder X. What actually exists is two mechanisms, and only
one of them is unavoidable.

### 2.1 Mechanism one: the join is in the FROM clause (strong)

For tasks, this is genuinely hard to get wrong.

- `views/cards.ts:166` — `accessibleTasks(viewerId)` returns the whole `FROM`
  clause, membership join included. Every one of the eight list queries builds
  on it via `cardSource()` and `readCards()` (`cards.ts:197`, `:278`). A view
  query cannot be written without it because it is not a condition you add —
  it is the table expression you select from.
- `domain/tasks.ts:135` — `accessibleTask(executor, viewerId, taskId)`, same
  join for a single row. `:169` `lockedTask` is the same again with
  `FOR UPDATE`.
- `domain/tasks.ts:262` — `taskView`, the detail projection, carries its own
  copy of the join.
- `domain/folders.ts:57` — `accessOf(executor, viewerId, folderId)`, the same
  for folders.

I checked every file under `src/server` that names `tasks` or `folders` in
SQL. Nineteen files do. The ones that read without a membership join are all
one of three kinds, and each is fine:

- **viewer-keyed tables**, where the row *is* the viewer:
  `domain/bundle.ts`, `domain/shelves.ts`, `domain/covers.ts`,
  `domain/connections.ts`, `auth/settings.ts`. Every statement is
  `WHERE user_id = ${viewerId}`. There is no shape of request that reads
  someone else's row.
- **the scheduler's purge** (`scheduler/pass.ts`), which acts for the system
  rather than for a person and is not reachable over HTTP at all.
- **check-then-use functions**, covered next.

### 2.2 Mechanism two: check, then use (weaker, and this is the real answer)

Some domain functions take an id and no viewer at all, and rely on the caller
having already resolved access. Examples I opened:

- `domain/pages.ts:65` `pageView(db, home)` and `:80` `putPage(db, home, ...)`
  — no viewer in the read; the gate is two lines up in
  `routes/workshop.ts:112` and `:130` (`accessOf`), and for shelf pages at
  `:272` and `:290` (`shelfView`).
- `domain/events.ts:132` `listFolderEvents(db, folderId)` and `:149`
  `listSubjectEvents(...)` — gated at `routes/events.ts:85` and `:100-104`.
- `views/lists.ts:307` `folderUnscheduledIds(executor, folderId)` — gated by
  `accessibleTask` in `domain/task-order.ts:94`. The file says so in its own
  comment.
- `domain/folders.ts:373` `memberIdsOf`, `:393` `deleteFolderRow`, `:720`
  `runRClean` — second halves of a decision `routes/folders.ts` already made.

**I counted 25 of these gates written by hand inside route handlers**, across
six files (`conversation.ts`, `events.ts`, `folders.ts`, `views.ts`,
`workshop.ts`, and one in `tasks.ts`'s neighbours). Each is a line of the form
`if ((await accessOf(db, viewer(req), id)) === null) { 404 }`.

That is the honest shape of the chokepoint: **not one place, but one pattern
plus twenty-five hand-written instances.** Deleting one of those lines opens a
hole, and nothing in the type system or the query builder would object.

### 2.3 What actually catches a mistake

Three things, and they cover different failures:

1. **`tests/ac-236-structural-guard-sweep.test.ts`** — this is the good one.
   It walks the mounted Express router, collects every POST, PATCH, PUT and
   DELETE, and drives each one twice: with no session (must be 401) and with a
   session but no CSRF header (must be 403). It enumerates rather than
   samples, so **a new mutating route that forgets `requireSession` or
   `requireCsrf` fails the suite automatically.** The only exemption is the
   dev-login endpoint, filtered by name.

2. **`src/server/http/tasks-contract.test.ts:1829`** — the same sweep by hand
   for the tasks surface.

3. **Failing closed by accident.** Every router does
   `const viewer = (req) => sessionOf(req)?.userId ?? ''`. If `requireSession`
   were ever missing on a data route, `viewer(req)` returns an empty string,
   which goes into a query comparing against a `uuid` column and Postgres
   raises. The request answers 500, not somebody else's data. That is
   fail-closed, but it is luck rather than design, and I would not lean on it.

### 2.4 The gaps

Stated plainly, because this is the property protecting a repo with a second
person's agent in it:

- **AC-236 only covers mutations.** `MUTATING = ['post','patch','put','delete']`.
  A new **GET** route with no `requireSession` passes the whole suite. There is
  no read-side sweep.
- **Nothing structural checks authorization at all.** AC-236 checks
  *authentication* (is there a session) and *CSRF*. A route with
  `requireSession` and no `accessOf` call is a route where any signed-in
  person reads any folder, and no test in the suite would notice unless
  somebody wrote a criterion for that specific endpoint.
- **`domain/pages.ts` is the sharpest case.** Its two exported functions have
  no viewer parameter. If a new route called `pageView(db, { folderId, shelfId: null })`
  without the `accessOf` line above it, that route reads any folder's page.
  Nothing would fail.

**Recommendation, and it is the highest-value one in this document:** add a
read-side sweep beside AC-236 that walks every GET under `/api/v1` and asserts
401 with no session. It is a small file, it uses the machinery AC-236 already
has, and it closes half of the remaining gap mechanically. The other half
(authorization, not authentication) cannot be swept structurally — the closest
you can get is making the check impossible to skip, which means giving
`pageView`/`putPage` and `listFolderEvents`/`listSubjectEvents` a `viewerId`
parameter and putting the join inside them, the way `accessibleTask` does.

---

## 3. Standardization, ranked by how much it would actually help

I looked for: repeated code, the same job done two ways, domain logic in
routes, and leftovers from the v1→v2 port. Ranked by payoff.

### 3.1 The router preamble, copied thirteen times (biggest win)

Every router file opens with the same block. I counted the pieces:

- the "constructed without a database" 500 helper — **14 copies**
  (`auth/router.ts` plus all 13 route files).
- the `attachSession` step-aside block, `if (sessionOf(req) !== undefined)` —
  **13 copies**, at `bundle.ts:76`, `connections.ts:57`, `conversation.ts:67`,
  `cover-photos.ts:83`, `events.ts:65`, `files.ts:91`, `folders.ts:108`,
  `invites.ts:149`, `sample.ts:60`, `tasks.ts:157`, `trash.ts:81`,
  `views.ts:101`, `workshop.ts:81`.
- `const viewer = (req) => sessionOf(req)?.userId ?? ''` — **13 copies**.
- `const uuidParam = z.uuid()` — **9 copies**.

That is roughly 25 lines × 13 files of identical text before any route is
declared. One `createResourceRouter({ dbClient, rateLimits })` helper in
`src/server/http/` returning `{ router, db, viewer, parsedId, mutationLimit }`
would delete all of it and make every new router start the same way.

It matters more than it looks for the new workflow: **that preamble is where
the session gets attached.** Thirteen copies is thirteen chances for one to be
subtly different, and a reviewer reading a diff of a new router file has to
check the boilerplate by eye every time.

### 3.2 `parsedId` — the same job, three ways (do this with 3.1)

Same function, three conventions:

- module-level `function parsedId(...)`: `folders.ts:74`, `invites.ts:113`,
  `tasks.ts:85`, `trash.ts:52`
- a closure inside the factory: `bundle.ts:86`, `conversation.ts:77`,
  `workshop.ts:91`
- inline `uuidParam.safeParse(...)` with the 404 written out at the call site:
  `events.ts:133`, `files.ts:216`, `cover-photos.ts`, `connections.ts`

They all do the same thing (a non-uuid path segment is 404, never a 500 from a
cast error). One shared helper, one convention.

### 3.3 Three doors to the same database adapter

`src/server/database.ts` holds `inTransaction` and `rowsOf`. Three modules
re-export them:

- `domain/db.ts` — "Compatibility home for domain imports written before P9."
  **13 files import through it.**
- `time/executor.ts` — "Compatibility home for the scheduling engine's
  existing imports." 3 files import through it.
- `auth/provisioning.ts:26-27` — re-exports them too, and
  `auth/account.ts:21` and `auth/settings.ts:21` import `rowsOf` **from
  `provisioning.js`**. That one is genuinely confusing: a module about Google
  user provisioning is acting as the database adapter for two unrelated files.

Meanwhile `scheduler/pass.ts:50` and `auth/provisioning.ts:22` import from
`../database.js` directly. So four import paths to two functions.

Fix: point everything at `../database.js`, delete `domain/db.ts` and
`time/executor.ts`, remove the re-export from `provisioning.ts`. It is a
mechanical find-and-replace across 16 files and it removes a category of
"which import do I use" question forever.

### 3.4 Two settings surfaces over one table

`GET/PATCH /api/v1/me/settings` lives in `auth/settings.ts` and reads three
boolean columns. `GET/PATCH /api/v1/settings` lives in `routes/bundle.ts` and
reads the whole `user_settings` row including `pinned_views`. Both are
mounted, both are live, and `domain/bundle.ts:40` (`derivePins`) exists purely
to keep them consistent: when `pinned_views` is null, the pins are *derived*
from the three v1 flags.

This is a deliberate expand-and-contract that never contracted. It is
documented (`migrations/0004_pinned_views.sql` explains it well) and it is not
broken. But it is the single most confusing thing in the API for anyone new,
and it is exactly the kind of thing a frontend agent gets wrong: it will call
the endpoint it finds first.

Not urgent. Worth a note in whatever API reference Imran's agent reads.

### 3.5 A mount-order dependency that is load-bearing and undocumented

`createApp` mounts `createViewsRouter` at `index.ts:329` and
`createBundleRouter` at `index.ts:397`. The views router registers
`GET /views/tasks`, `/views/planned`, `/views/important`, `/views/all`,
`/views/done`, `/views/my-day`. The bundle router registers
`GET /views/:id` (a saved view).

`/views/:id` would match `/views/tasks`. It does not, only because views is
mounted first. If someone reorders those two `app.use` calls, six page
endpoints start answering 404 (the uuid parse in `bundle.ts`'s `parsedId`
fails) and the failure looks nothing like a routing problem.

The boot file's comments carefully explain why the *other* routers are
order-independent. This pair is not, and nothing says so. **One comment at
`index.ts:397` would fix it.** Also: `routes/views.ts` (read pages) and
`routes/bundle.ts` (saved views + settings + place covers) are two different
concepts sharing a URL prefix and near-identical filenames.

### 3.6 File naming is mixed

Multi-word filenames under `src/server` split two ways:

- camelCase: `domain/accountDeletion.ts`, `time/calendarDate.ts`,
  `time/reminderRecompute.ts`, `time/reminderTime.ts`, `time/seriesGuard.ts`,
  `views/myDay.ts`
- kebab-case: `auth/dev-login.ts`, `auth/timezone-sync.ts`,
  `domain/fractional-index.ts`, `domain/task-order.ts`,
  `observability/error-tracker.ts`, `observability/request-errors.ts`,
  `routes/cover-photos.ts`, `security/rate-limit.ts`

Note `domain/` contains both styles, and so does `auth/`. Cheap to fix, low
value on its own, but if you are going to pick one, pick it before the repo
gets a third contributor.

### 3.7 Domain logic in a route handler — one instance

`routes/sample.ts:104` is the only route file in the whole backend that
imports `sql` from Drizzle and runs a query:

```ts
const zone = await rowsOf(db, sql`SELECT timezone FROM users WHERE id = ${viewer(req)}::uuid`)
```

Everywhere else the rule holds perfectly. This one should move into
`sample/workspace.ts` or `domain/`. Small, but it is the precedent that
matters: right now "no SQL in `routes/`" is a rule you could enforce with a
lint rule, and one file stands between you and that.

### 3.8 A stale comment that will mislead somebody

`scheduler/pass.ts:36` says **"Two duties, and that is the ceiling."** The
file now performs four: reminders, session pruning, the 30-day Trash purge
(`:360-373`), and the 90-day events purge (`:376`). Spec 11.7 says five.

Nothing is broken. But that header is the first thing anyone reads before
touching the scheduler, and it currently tells them the file does half of what
it does.

### 3.9 Dead-ish code (there is very little)

I searched for `TODO`, `FIXME`, `HACK`, `@deprecated` across the backend:
**zero hits.** For a codebase this size that is unusual and worth saying.

What I did find:

- `security/log.ts:265` `logAuthEvent` — "Compatibility function for auth
  helpers that predate per-app injection." **One caller**,
  `auth/timezone-sync.ts:110`. Convert that one call and the function goes.
- `views/explain.ts` (475 lines) — a diagnostic tool that regenerates
  `views/EXPLAIN.md`, deliberately excluded from the production build in
  `tsconfig.build.json`. Not dead, but it looks dead, and the exclusion works
  only while nothing imports it. The tsconfig says so; keep it that way.

---

## 4. `app/db/` — does it need standardizing?

**Short answer: no. It is the tidiest part of the backend.** Five files, all
current, all doing their job. There are three specific things to fix and none
of them is structural.

### 4.1 Migration naming and the journal — consistent, yes

Eight files, `NNNN_snake_case.sql`, sequential with no gaps:

```
0000_core_schema  0001_sessions  0002_sessions_token_hash  0003_v2_expand
0004_pinned_views 0005_ruled_schema 0006_folder_cover_tiers 0007_sample_objects
```

`migrations/meta/_journal.json` has exactly eight entries, `idx` 0–7, tags
matching filenames one-for-one, and `when` values strictly increasing. That
last one is the property that matters: Drizzle treats a file as pending when
its `when` is greater than the last applied one, so a new migration with a
`when` that is not the largest silently never runs. It is currently correct,
and `db/migrate.ts` documents the rule in its own header.

One cosmetic inconsistency: entries 0–2 carry real millisecond timestamps
(`1785617584951`), entries 3–7 carry hand-rounded ones (`1787876400000`).
Harmless — the ordering is what is read — but worth knowing so nobody thinks
the round numbers are a bug.

Every migration is additive. There is not one `DROP` in the eight files. The
only in-place change is `0007`'s
`ALTER TABLE comments ALTER CONSTRAINT ... DEFERRABLE INITIALLY IMMEDIATE`,
which changes no column and no name. For a forward-only scheme with no down
migrations, that is exactly right.

### 4.2 `constraint-catalog.ts` — still doing its job, yes

It lists 22 tables. The eight migrations create 22 tables plus `sessions`,
which is excluded on purpose (spec 10.1 names it as the one exception, and
`verify.ts:56` filters it by name with the reason in a comment).

I checked whether the catalog kept up with the two most recent migrations. It
did:

- `folders_cover_one_source_check`, `folders_cover_preset_format_check`,
  `folders_cover_focal_y_range_check` from `0006` — all present, lines 117–119.
- `sample_objects` and `sample_objects_kind_check` from `0007` — present,
  lines 684, 687.
- `user_settings_pinned_views_array_check` from `0004` — present, line 369.

`verify.ts` diffs the live `pg_constraint` and `pg_index` against it and exits
nonzero on any difference, and AC-001 asserts the same thing in the suite. The
mechanism works.

**The one real gap:** `verify.ts`'s constraint query selects `conname`,
`contype`, `confdeltype`, the referenced table and the column lists. It does
**not** select `condeferrable`. So `0007`'s deferrability change — the thing
that makes moving a commented task between folders possible at all — is
recorded nowhere the catalog can check. A future migration could set that
constraint back to `NOT DEFERRABLE`, AC-001 would stay green, and task moves
would break in a way that looks like application code. Adding
`c.condeferrable` to the query and a `deferrable?: boolean` field to
`ExpectedForeignKey` is maybe twenty lines.

### 4.3 `seed.ts` — stale, and this is the drift you asked about

Two problems, both in the same file.

**The header claims more than the code does.** Line 5 says the dataset
"exercises every section 4 table." It seeds ten: `users`, `user_settings`,
`connections`, `folders`, `folder_members`, `tasks`, `steps`,
`my_day_entries`, `reminders`, `invites`. Those are the v1 tables. **Eleven v2
tables get no rows at all**: `events`, `notifications`, `files`, `comments`,
`comment_likes`, `comment_files`, `shelves`, `page_blocks`, `user_views`,
`user_page_covers`, `sample_objects`.

**The TRUNCATE list is stale too.** Line 62 truncates the same ten tables
`CASCADE`. Postgres's `TRUNCATE ... CASCADE` also truncates everything with a
foreign key into them, and every v2 table has one (to `users`, `folders` or
`comments`), so I believe the wipe is complete in practice — **but I did not
run it to confirm, and that is inference from the FK graph rather than
observation.** Either way the explicit list is a list of ten out of
twenty-two, and it reads as if somebody decided those were the tables that
matter.

Why it matters concretely: `npm run e2e:app` runs `tsx db/seed.ts` before
booting the server for the Playwright leg. So **no browser test starts from a
state that has a comment, a file, a page block, a shelf, an event or a saved
view** unless it creates one itself. That is a real limit on what the browser
leg can cover, and it is invisible unless you read this file.

Fix: either extend the seed to the v2 tables, or change the header to say what
it actually is (a v1 fixture) and change the TRUNCATE to name every table
explicitly so the next person adding a table has an obvious place to add it.

### 4.4 Anything risky in `client.ts` or `migrate.ts`?

`client.ts` is 80 lines and correct as far as I can see. The one thing to know
is at line 44: with no explicit `url`, it falls back to `TEST_DATABASE_URL`.
That is why `src/server/index.ts:490` deletes that variable before booting —
so a filled test variable cannot silently redirect `npm run dev` away from
`.data`. Both halves are commented. Fine.

`migrate.ts` is 10 lines of real code and its header carries the journal rule.
Fine.

**Verdict on the question as asked:** `app/db/` does not need
standardizing. It needs three small fixes — `condeferrable` in `verify.ts`,
an honest `seed.ts` header, a complete `TRUNCATE` list — and then it is done.

---

## 5. Where frontend work reaches into the backend

Enumerated from the code, roughly most-likely-first.

**1. A validation message.** Two homes, and an agent needs to know which.
Field rules live in `app/src/shared/*.ts` as zod schemas with `message:`
strings (e.g. `shared/tasks.ts`). Rules the schema cannot state — anything
that has to read a row — live in the route file as `fieldError(res, field, problem)`
(`routes/tasks.ts:97`) or `sendError(res, 422, 'validation_failed', ...)`.
Both end up in the same 422 sentence via `http/errors.ts`.

**2. A new field on a response.** This touches three files minimum: the type
and schema in `app/src/shared/<resource>.ts`, the SQL projection
(`views/cards.ts:135` `CARD_COLUMNS` and `cardFromRow` for list rows;
`domain/tasks.ts:262` `taskView` for the detail), and possibly the migration
if the column does not exist. Note there are deliberately **two** producers of
one shape — `taskView` one row at a time, `cards.ts` in bulk — and `cards.ts`
explains why at its head. Adding a field to one and not the other is a silent
inconsistency between the detail page and every list.

**3. A new list filter or query parameter.** `routes/views.ts` parses query
params (`zoneOf` at `:109`, `eventsQuery` in `routes/events.ts:78`), and the
predicate belongs in `views/lists.ts`, `views/search.ts` etc. as a `where`
passed to `readCards`.

**4. A new image or font host.** `src/server/index.ts:175-183`. Note the
precedent already set: when the cover-photo picker needed a third-party image
host, the answer was **not** to widen the CSP — it was
`routes/cover-photos.ts`, which proxies the search and streams the thumbnails
through this origin so `img-src 'self'` never moves. That file's header is
the best short explanation of the policy in the repo. The one widening that
did happen (`https://*.googleusercontent.com`) is a fixed host, the identity
provider the session already rests on.

**5. Static assets and the SPA fallback.** `index.ts:406-411` —
`express.static(clientDist)` plus `app.get('/{*splat}')` serving `index.html`.
Anything about routing a new client path, or serving a file the bundle needs,
lands here.

**6. Email copy.** `notify/templates.ts` — four templates, HTML plus a
plain-text alternative. Its header says outright that the words are Imran's
(RFC 0005 item 32) and the file is the transcription. This is a design surface
that happens to live in the backend.

**7. The sign-in page.** `auth/pages.ts` — a full HTML page with inline CSS,
served without the client bundle, transcribed from the v2 prototype. Same
situation: a design surface inside the most security-sensitive directory in
the repo.

**8. File type rules.** `domain/files.ts:45` `RASTER_MIMES`, `:36`
`MAX_IMAGE_EDGE`. Any "why can't I upload an SVG / a bigger picture" question
points here.

**9. Copy in error responses the UI shows.** e.g. the quota refusal at
`routes/files.ts:157`, the page-conflict toast at `routes/workshop.ts:145`.
Some of these are pinned verbatim by tests —
`tests/ac-233-storage-quota-refusal.test.ts:73` asserts the quota sentence
character-for-character, and `tests/e2e/ac-336-*.spec.ts:33` asserts the
conflict sentence. Changing the string turns the gate red, which is the system
working.

**10. A whole new endpoint.** Route file + shared schema + domain function +
mount line in `index.ts`. Four files, and it is never minor.

**One structural point that falls out of this list.** The intended CODEOWNERS
split is `app/src/server/` and `app/db/` to Hassan. But items 1, 2 and 3 above
all require editing **`app/src/shared/`**, which is in neither directory. That
folder is 7,575 lines of zod schemas and wire types imported by 36 server
files and 59 client files. It is the actual contract between the two halves,
and under the proposed split it has no owner. Decide who owns it before the
first frontend issue lands, or the first response-shape change will be a
merge conflict in the one place where a mistake breaks both sides at once.

---

## 6. What counts as a minor backend change

The point of these lists is that they can be applied without judgement. If a
change is not on the green list, it is not minor — file an issue. That default
is doing most of the work; the green list is deliberately short.

Two facts an agent should be told up front, because they change how the rules
feel:

- **The gate catches the mechanical failures.** `npm run lint && npm run typecheck
  && npm test && npm run build`, plus the Playwright leg. In particular
  `tests/ac-236-structural-guard-sweep.test.ts` enumerates every mutating
  route and fails if one is missing its session or CSRF check. So a green
  suite is real evidence — for the things it covers.
- **It does not catch authorization.** No test asserts that a route resolves
  folder membership. A change that silently reads someone else's data can pass
  the whole suite. That is why the red list below is written in terms of files
  rather than outcomes.

### 6.1 Always allowed

For each: what, where, and one sentence on why it is safe.

1. **Change the wording of a message inside an existing `sendError(...)`,
   `fieldError(...)` or `sendValidationError` path**, in `app/src/server/routes/*.ts`.
   *The number (422) and the code string (`'validation_failed'`) must not
   change* — the client branches on those, and only ever displays the sentence.

2. **Change the `message:` text of an existing zod rule** in
   `app/src/shared/*.ts`. *The rule itself — `min`, `max`, `regex`, `optional`
   — must not change*, because that is what the server accepts and rejects,
   and the limits are spec contract.

3. **Change the words in `app/src/server/notify/templates.ts`.** Subjects,
   headings, body copy, button labels. *Not the recipients, not the trigger,
   not the number of templates* — those decide who gets email, which is not a
   copy decision.

4. **Change presentation values in `app/src/server/auth/pages.ts`** — the
   inline CSS numbers and colours. *Not the copy* (spec 9.2 fixes it and
   `pages.test.ts` pins it), *and not one character of `escapeHtml` or the
   interpolation sites*, because that function is what stops a provider-supplied
   string becoming markup on your own origin. **If this carve-out feels too
   fine to trust an agent with, drop it and make the sign-in page issue-only.
   It changes about once a year.**

5. **Add or edit a code comment** anywhere in `app/src/server/`, including
   correcting a stale one. Comments are the cheapest thing in the repo to fix
   and the most expensive to have wrong.

6. **Add a test.** A new file under `app/tests/` or a new `test(...)` in an
   existing one that asserts current behaviour is additive; if it goes red, it
   found something, and that is a report either way.

7. **Fix a genuine TypeScript or ESLint error the gate is already reporting**,
   where the fix is local to one function and changes no SQL, no status code
   and no middleware chain. If the fix requires touching more than that, it is
   not this rule any more.

Everything else defaults to: **stop and write the issue.**

### 6.2 Always major — stop and file a report

A frontend agent may never edit these, whatever the reason and however small
the change looks.

**Never, category one: the database.**

1. `app/db/migrations/**` — any file, including a new one. *Migrations run at
   boot before the server accepts traffic; there is no down migration, so a
   wrong one is a restore, not an undo.*
2. `app/db/migrations/meta/_journal.json`. *A `when` value that is not the
   largest means the migration silently never runs, and nothing reports it.*
3. `app/db/constraint-catalog.ts`, `app/db/verify.ts`. *These are the
   description of the schema the suite checks reality against; editing them to
   match a change is how you make the check stop checking.*
4. `app/db/client.ts`. *One file decides which of the two databases every test
   and the production server talk to.*
5. `app/db/seed.ts`. *It truncates every table; it is also the fixture the
   whole browser leg starts from.*

**Never, category two: identity and safety.**

6. Anything under `app/src/server/auth/**` except the `pages.ts` carve-out
   above. *Sessions, cookies, the CSRF token, and the Google handshake all
   live here; there is no such thing as a small change to who is signed in.*
7. Anything under `app/src/server/security/**`. *`rate-limit.ts` is the only
   thing standing between the API and a loop, and `log.ts` is a closed list of
   fields that exists so a task title cannot reach a log line.*
8. `app/src/server/index.ts` lines 175–187, the `securityHeaders` array. *The
   CSP is what stops a script that is not yours running on your origin. If the
   frontend needs an outside image or API, the answer is a proxy route like
   `routes/cover-photos.ts`, not a wider policy — and that is an issue for
   Hassan, not an edit.*
9. `app/src/server/index.ts` `assertSignInIsPossible` (line 443) and the
   `main()` function below it. *That guard is what turns a mistyped
   environment variable into a cancelled deploy instead of a live site nobody
   can sign into.*

**Never, category three: the rules and the machinery.**

10. Anything under `app/src/server/domain/**`. *Every membership check and
    every write in the application is in this folder.*
11. `app/src/server/views/cards.ts`, specifically `accessibleTasks` (line 166)
    and `cardSource` (line 197). *That is the `FROM` clause every list query
    is built on; the membership join lives inside it, so changing it changes
    who can see what on eight pages at once.*
12. Any line in a route file of the form
    `if ((await accessOf(...)) === null)` or `accessibleTask(...)` or
    `shelfView(...)` — there are 25 of them. *Each one is the only thing
    stopping that endpoint from reading another person's data, and no test
    would notice if it went missing.*
13. The `requireSession, requireCsrf, mutationLimit` triplet on any route.
    *AC-236 will catch a missing one on a mutation. It will not catch a
    missing one on a GET.*
14. Anything under `app/src/server/scheduler/**`. *One 60-second loop sends
    every reminder, prunes sessions and purges Trash; it is the one thing in
    the process that has to still be working at 3am.*
15. Anything under `app/src/server/time/**`. *Recurrence and timezone
    arithmetic; wrong here means somebody's reminder fires on the wrong day
    and nothing errors.*
16. `app/src/server/domain/files.ts`, especially `RASTER_MIMES` (line 45).
    *Adding `image/svg+xml` because an icon would not upload is how a
    document that can run scripts gets served from your own origin.*
17. `app/scripts/run-suite.mjs`. *It exists to fail a test run that exited 0
    while part of it never ran; a change here can only make the gate less
    honest.*
18. `app/src/server/index.ts` router mount order (lines 269–411), and adding a
    new `app.use`. *`/views/:id` and `/views/tasks` coexist only because of
    the order these are written in.*
19. Any tsconfig, `package.json`, or `.github/workflows/ci.yml`. *These decide
    what gets compiled, what ships, and what the gate actually runs —
    `tsconfig.build.json` is what keeps the development login out of
    production.*

**And one rule that is not about a file.** If a change requires editing an
existing test so it passes, that is not a minor change — that is a change to
what "correct" means. File the issue.

---

## What I could not verify

- **I did not run anything.** No test leg, no `npm run typecheck`, no
  `db/verify.ts`, no seed. Every statement about behaviour is read from source.
  Per the brief, the suite is 4–25 minutes and was out of scope.
- **The seed's `TRUNCATE ... CASCADE` reaching all 22 tables** is my reading of
  the foreign-key graph across the eight migrations, not something I observed.
  It is very likely right and it is worth ten seconds to confirm.
- **`viewer(req)` returning `''` causing a Postgres uuid cast error** is
  inference from the column types plus how Drizzle parameterises. I did not
  make a request with a missing `requireSession` to see the 500.
- **AC-236's coverage.** I read the file header and the `MUTATING` constant and
  the first 70 lines; I did not read the whole sweep, so it is possible it
  handles GETs somewhere below in a way the constant does not suggest. I do
  not think so, but I did not read to the end.
- **`views/`, `time/` and `sample/` I mapped but did not read line by line.** My
  descriptions of them come from their module headers and their exported
  function signatures.
- **I did not read the client**, so my account of the collision surface is what
  the backend exposes, not what the client currently calls.
- **Nothing about whether spec section 7 is frozen in practice.** The spec says
  sections 4 and 7 are frozen and several code comments record the owner
  waiving that; I did not trace how that waiver process works, and it plainly
  matters for "can Imran's agent add an endpoint."

## Open questions for Hassan

1. **Who owns `app/src/shared/`?** It is the real contract between the two
   halves, 7,575 lines, imported by 36 server files and 59 client files, and
   the proposed CODEOWNERS split (`app/src/server/` + `app/db/`) leaves it
   unassigned. Three of the five most likely frontend changes require editing
   it. This needs an answer before the first issue lands.

2. **Who owns user-facing copy that lives in server files?** `notify/templates.ts`
   says outright that the words are Imran's. `auth/pages.ts` transcribes spec
   9.2 and a v2 prototype. Several route messages are pinned verbatim by
   acceptance tests. The agreement gives UI and UX to Imran; the directory
   gives these files to you. My green list splits it by line, which works but
   is fine-grained enough that an agent could get it wrong.

3. **Do you want the read-side sweep?** A GET equivalent of AC-236 is the
   single change that most improves the safety story for a repo with a second
   agent in it, and it reuses machinery that already exists. It closes the
   authentication half of the gap mechanically. The authorization half cannot
   be swept, and the only structural fix there is giving
   `domain/pages.ts` and `domain/events.ts`'s list functions a `viewerId`
   parameter so the check moves inside the query.

4. **Should the router preamble be extracted before or after the workflow
   change?** Thirteen copies of the block that attaches the session is a
   reviewing cost on every new router. Extracting it is a mechanical change
   across 13 files that touches no behaviour — but it is also a large diff to
   land while you are also changing how work arrives.

5. **Is the sign-in page carve-out worth it?** It is the one place I let a
   frontend agent into `auth/`. Making it issue-only costs almost nothing and
   makes the rule "never touch `auth/`", which is a rule that survives an
   agent trying to be helpful.

6. **`domain/db.ts` and `time/executor.ts` — delete now or later?** Both are
   pure re-export shims labelled "compatibility". Removing them is 16 import
   lines and no behaviour change, and it removes a permanent "which import do
   I use" question. Same for the `rowsOf` re-export in `auth/provisioning.ts`,
   which two unrelated auth files currently import through.
