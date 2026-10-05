# Architecture

This file holds the stack facts that a developer cannot see quickly in the code.
Pitfalls, flaky tests and machine setup are in `docs/troubleshooting.md`.

## Stack

- One Node 24 process. It runs the Express 5 API under `/api/v1` and serves the built
  Vite/React SPA. One origin serves all of it, so there is no CORS surface.
- The landing page is a route of the SPA. At `/`, the server only redirects a signed-in
  visit to `/app`.
- Production is one Render web service and one Render Postgres 18 database. A merge to
  `main` deploys.
- Local development and tests use PGlite, which embeds Postgres 18 in the process.
- Uploaded files go to Cloudflare R2 in production, and to a disk directory in
  development and tests.
- Google sign-in uses openid-client directly, with no auth framework. Email goes through
  Resend. Errors go to Sentry. Logs go to stdout through pino, and also to Axiom when its
  two variables have values.
- Server libraries: zod 4, Drizzle ORM, express-rate-limit, Luxon, multer and sharp.
- Client libraries: React Router, TanStack Query, Tailwind CSS 4, shadcn/ui on
  @base-ui/react, BlockNote for page documents, lucide-react, vite-plugin-pwa.

### Why a single instance matters

Production runs exactly one instance. These parts are correct only under that rule:

- Rate limits keep their counters in process memory. A deploy resets them.
- The scheduler pass runs in the process every 60 seconds. It sends reminders and does
  every background sweep.
- Sign-in records (state, nonce, PKCE verifier) live in process memory for ten minutes.
- The Sentry throttle for CSP reports keeps its counts in process memory.
- The boot migration run takes no lock.

A second instance needs a shared store for the rate limits and the sign-in records, one
owner for the scheduler, and a serial migration run. Open an issue before you add one.

## Where things live

- `app/src/server/` is the API. `index.ts` holds `createApp`, the route mounts in order,
  and the boot.
- `app/src/server/domain/` holds the writes. `app/src/server/views/` holds the read
  queries. `app/src/server/routes/` holds the routers.
- `app/src/server/auth/`, `scheduler/`, `notify/`, `files/`, `time/`, `security/` and
  `observability/` each hold one concern.
- `app/src/client/` is the SPA. `api/http.ts` is the only HTTP caller.
  `styles/tokens.css` holds every design value. `components/ui/` holds the copied shadcn
  components.
- `app/src/shared/` holds the zod schemas and API types that both sides import.
- `app/db/` holds the engine seam (`client.ts`), the migrations, and the seed and verify
  scripts.
- `app/tests/` holds the acceptance tests, the browser tests (`e2e/`) and the harnesses
  (`support/`).

## Constraints that are not obvious

- **`createApp(options?)` performs no I/O.** It is synchronous and opens no database. A test
  gives it a database through `options.dbClient`. Routes that need a database fail only
  when a request reaches them without one.
- **Migrations run at boot.** The boot applies new migrations before it listens. A failed
  migration rolls back, the health check fails, and the old instance keeps the traffic.
- **Migrations are forward only.** There is no down migration. Recovery is a new
  migration or a restore. Name every constraint and index.
- **Split a destructive schema change across two releases.** In a deploy, the old code
  runs against the new schema for a short time. Drop or rename a column only after no
  released code reads it.
- **An empty `DATABASE_URL` in production starts on PGlite.** The boot writes an error
  line and tells Sentry, and `/api/health` reports `database: "pglite"`. It still starts.
- **Production refuses to start without durable file storage.** It needs all four R2
  variables or `DANA_FILES_DIR`. A partial R2 configuration fails in every environment.
- **Exactly one proxy stands in front of the process.** `createApp` sets `trust proxy` to
  `1`. A CDN in front of Render makes it `2`. Never set it to `true`.
- **`APP_ORIGIN` names the one canonical host.** Other hosts get a 301 for GET and HEAD
  and a 404 for other methods. `/api/health` is exempt, because Render checks it by its
  own hostname.
- **The scheduler pass is the only background work.** Keep it a plain callable,
  `createReminderPass` in `app/src/server/scheduler/index.ts`. Each sweep claims at most
  `SWEEP_BATCH` rows with `FOR UPDATE SKIP LOCKED`. Never move a sweep into a request
  handler.
- **Write the read queries in `app/src/server/views/` as SQL** through Drizzle's `sql`
  template, so their `ORDER BY` stays easy to read. CRUD can use the query builder.
- **Stored client state keeps ids, never display names.** A saved view or an order keyed
  by a name breaks at the first rename.
- **Prototypes are references, not code to port.** Build the feature against the real
  client, its query layer and `tokens.css`.

## Library traps

Agents often know older versions of these libraries. When in doubt, read the installed
package, not memory.

### Tailwind 4

- Configuration is CSS only: `@theme` in `app/src/client/styles/tokens.css`, through
  `@tailwindcss/vite`. There is no `tailwind.config.js`. A v3 configuration idiom is a
  defect.

### React Router

- The client uses library mode only (`BrowserRouter`, `Routes`, `Route`). Do not import
  loaders, actions or framework-mode APIs. Data fetches belong to TanStack Query.

### zod 4

- Check v3 idioms against the v4 changes that break v3 code before you write a schema. A custom
  message goes in `{ error: … }`.
- `z.object` strips unknown keys and the route answers 200. `parseBody` in
  `app/src/server/http/parse-body.ts` logs unknown top-level keys only. A nested unknown
  key disappears with no record.
- Request schemas are never `.strict()`. Old installed clients outlive a deploy, and
  strictness makes their writes fail. To refuse one field, declare it as
  `z.never({ error: … }).optional()`. That answers 422 and names the field.
- Stored document content is the exception. Rich content and post blocks refuse unknown
  keys with `.catchall(z.never())`, so a document always round-trips.
- A field that the schema declares and no route reads is invisible to every unknown-key
  check. Ship the field and the code that reads it in the same change.

### Express 5

- Express 5 catches rejected promises from async handlers. Do not add async wrappers
  from Express 4 tutorials.
- A wildcard route must have a name: `'/{*splat}'`, not `'*'`.

### Luxon and time zones

- Never use the raw Luxon result for a reminder fire instant. For a local time inside a
  DST gap, Luxon adds the gap length (02:30 becomes 03:30). Dana needs the first valid
  instant after the gap (03:00).
- For an ambiguous local time, Luxon makes no promise. Dana takes the earlier instant.
  `app/src/server/time/reminder-time.ts` holds both rules.
- No library implements these two rules, so no library can be a test oracle for them.
- DST fixtures use old transitions in zones with no recent rule change. The Node runtime
  and PGlite carry separate tzdb copies that change independently.
- `Intl.DateTimeFormat` accepts offsets such as `+05:30` and matches names without regard
  to case. Validate every IANA zone through `app/src/shared/timezone.ts`.

### PGlite

- PGlite has one connection. It serializes statements, not handler logic. Two requests
  in flight still interleave their awaits, so a read-then-write race can occur on PGlite.
- A second concurrent transaction is impossible on PGlite. A test that needs one must run
  on the Postgres leg.
- While `npm run dev` holds `.data` open, do not point the migrate, seed or verify
  scripts at it.

### Drizzle

- The migrator wraps each run, not each file, in one transaction. All new files commit
  or roll back together. Check this again after a drizzle-orm upgrade.
- A Drizzle statement error puts the SQL and its bound values in its message, and the
  stack starts with that message. Log only the error name and the stack frames, as
  `safeStack` in `app/src/server/security/log.ts` does.

### openid-client

- By default it skips the ID token signature check in the code flow.
  `app/src/server/auth/oidc.ts` turns on `enableNonRepudiationChecks`. After an upgrade,
  make sure that this switch still exists and still forces the check.

### TypeScript build

- tsc emits a file that the build config excludes when any import can reach it, a literal
  `import()` included. The dev-login loader in `app/src/server/auth/router.ts` uses a
  computed specifier and answers 404 when the load fails.
- The server reads `DANA_DEV_LOGIN` when `createApp` runs, never at module load.

### @base-ui/react and shadcn

- Dana pins `@base-ui/react` to one exact version. It supplies focus, the Escape key,
  typeahead and expanded state, which together are the accessibility contract.
- After an upgrade of it or of the shadcn components, run the browser tests before you
  merge. Report a changed role or accessible name as a result.
- `shadcn` is a copy-in generator. It is never a runtime import.

### fetch in the client

- A `fetch` outside `app/src/client/api/http.ts` sends no CSRF header and no `tz`
  parameter. The server then answers 403 or 422. `app/eslint.config.ts` forbids it.

## Rejected alternatives

- Next.js: server actions and RSC open a second data path past the API.
- Vercel, Neon, Supabase: no always-on process, or a free tier that pauses or scales to
  zero against the one-minute scheduler.
- Railway, Fly.io: no point-in-time recovery, or an expensive managed Postgres.
- An auth framework (Auth.js, Better Auth, Lucia): unmaintained, or it takes over the
  users table and the sign-up transaction.
- Prisma: its schema language is far from hand-written SQL migrations.
- rrule.js at runtime: unmaintained, and it treats floating dates as UTC.
- FullCalendar: the calendar cell order is the contract, so Dana draws its own grid.
- `.strict()` on request schemas: see the zod 4 traps above.
- GitHub Actions cron as the reminder trigger: a five-minute floor, and it drops runs.
- CRDTs for page blocks: last write wins, with a 409 on conflict.
- Real-time push for comments: refetch and poll keep the single instance intact.
- A Trash table: a `deleted_at` column on each row is the one pattern.
- A permanent pre-production environment: the Postgres test leg and a production smoke cover it.
- pnpm or workspaces: one npm package is simpler, and nothing ships separately.

## Tests

- Vitest runs unit and acceptance tests. Acceptance tests call the real Express app in
  the process over HTTP.
- `app/db/client.ts` selects the engine. With `TEST_DATABASE_URL` unset, tests use
  PGlite. With it set, tests use that Postgres. Print it before you trust a run.
- Postgres is the authoritative leg. It has a real pool, a real planner, and concurrent
  transactions. CI runs it.
- On the Postgres leg each Vitest worker gets its own database, with a fixed `C`
  sort order and `C.UTF-8` case rules. PGlite gives the same order.
- Assert a database rejection by SQLSTATE and constraint name, never by message text.
  Use `expectRejectedWith` in `app/tests/support/helpers.ts`.
- Playwright runs the browser tests against PGlite, with the seed data and the dev login.
- What the suite keeps, and the rule for a new test: `app/tests/README.md`.
