## 11. Architecture

**This section is normative.** It records the implementation stack, the constraint each choice imposes, and the alternatives rejected with their reasons, so a future change is an argument with a recorded decision rather than a silent replacement. Agents implement against it exactly as against every other section; changes go through an RFC. External facts cited here (platform limits, versions, prices) were verified on 2026-07-29; prices are context, never contract.

### 11.1 Shape

One deployable: a single Node process runs the Express API, serves the static landing page, and serves the built client. One origin serves everything, so there is no CORS surface. The client is a Vite-built React single-page application; the server renders nothing but the landing page and JSON.

Three structural rules, each load-bearing:

- **Single instance.** Exactly one instance runs in production. Rate limiting (10.4) is in-memory, the reminder tick (11.7) is in-process, the boot-time migration run (11.5) takes no lock, and the auth module's pending-authorization records (11.6) live in process memory; all four assume it. A second instance requires moving rate limits to a shared store, electing a single tick owner, serializing the migration run, and relocating the pending-authorization records beside the rate limits, and must be flagged before it happens, never discovered after.
- **The API of section 7 is the only mutation path.** All client data access is fetch calls to /api/v1. No server-side rendering of application data exists, and no code path touches the database without passing the 10.2 chokepoint middleware. This is why the SPA-plus-API shape was chosen: it makes the single chokepoint architectural rather than merely mandated.
- **Forward-only migrations** (11.5). There is no down migration; recovery from a bad migration is a fix-forward migration or a restore.

### 11.2 Runtime, language, repository

- Node 24 (Active LTS until 2028-04-30), pinned in `.nvmrc` and the package.json engines field. npm is the package manager. ESM throughout.
- TypeScript in strict mode plus noUncheckedIndexedAccess. No JavaScript source files.
- A single package rooted at `app/`; no workspaces. Ownership boundaries are directories: `app/src/server/**`, `app/src/client/**`, `app/src/shared/**` (zod schemas and API types used by both sides), `app/db/**` (schema, migrations, seed), `app/tests/**` (the acceptance suite, owned by the Adversarial Test role).

### 11.3 Server

- Express 5. Route modules mirror section 7's resource groups. Every data route passes, in order: session resolution, CSRF verification (mutations only), rate limiting, then the handler, which resolves membership scope per 10.2 before touching rows.
- Validation with zod 4; the schemas live in `app/src/shared/` and produce the 422 field errors of 10.3. The client reuses them as convenience validation only (7.11).
- Rate limiting with express-rate-limit, in-memory, keyed by authenticated user id, limits per 10.4. Counters reset on deploy; accepted.
- Logging with pino to stdout. All log emission goes through one policy module that whitelists fields, making the 10.5 never-log list (task titles, notes, step titles, invite email addresses, tokens, session identifiers) structurally absent rather than filtered.

### 11.4 Client

- Vite 8, React, React Router 7 in library mode only: no loaders, no actions, no framework mode. Data fetching belongs to the query layer alone.
- TanStack Query 5 implements the 8.3 policy: refetch on window focus and after each own mutation; no other invalidation strategy exists.
- Forms with react-hook-form 7 plus the shared zod schemas via @hookform/resolvers.
- Styling with Tailwind CSS 4 (CSS-first configuration through @tailwindcss/vite; there is no tailwind.config.js) and shadcn/ui components copied into `app/src/client/components/ui/`. Design tokens live in exactly one file, `app/src/client/styles/tokens.css`, as Tailwind @theme variables; it is the only place raw color, type, spacing, and radius values may appear, and it has one owner (the Component and Design System role).
- Calendar: FullCalendar 7 standard plugins (MIT) through the @fullcalendar/react entrypoints. v7 consolidated standard plugins into the framework package: dayGrid and timeGrid are imported from @fullcalendar/react subpaths, never from the standalone @fullcalendar/daygrid package, which is frozen at v6. Virtual instances from /views/planned/calendar render as ghost-classed events; the Q3C cell order (banners, then timed, then ghosts) is implemented with a custom eventOrder comparator. If the comparator cannot express the order exactly, the fallback is rendering ghosts in a separate per-cell overlay: the visible order is the contract, the mechanism is not.
- PWA: vite-plugin-pwa with the prompt-for-update registration flow (virtual:pwa-register with onNeedRefresh), satisfying 10.6's non-forcing update rule. Fallback if the plugin fights the 10.6 contract: a hand-written service worker under a hundred lines implementing precache, network-only API, and navigation fallback.

### 11.5 Database and migrations

- Postgres 18 in production, and the same major everywhere tests run: PGlite embeds Postgres 18 and CI pins the postgres:18 image. Section 4's reference dialect (Postgres 16) remains valid; nothing in the schema requires more than Postgres 15.
- Drizzle ORM is the query client. The twelve queries of section 6 are written as SQL through Drizzle's sql template so their ORDER BY clauses can be compared to the spec textually; CRUD may use the query builder.
- Migrations are hand-authored SQL files in `app/db/migrations/`, forward-only, with every constraint and index explicitly named (AC-001 asserts them by name). The Drizzle programmatic migrator applies pending migrations at server boot, before the health endpoint reports ready, and wraps each run in one transaction: all pending files commit or roll back together, which is strictly stronger than per-file atomicity (verified in the installed migrator; section 13 item 16).
- Deploy interplay: the host's zero-downtime deploy keeps the old instance serving until the new one passes its health check. Postgres DDL is transactional, so a failed migration rolls back, boot fails, the deploy is canceled, and the old version keeps running. Destructive changes (drops, renames) must be split expand-and-contract across two releases, because the old code runs against the new schema during the overlap window (roughly ninety seconds).

### 11.6 Authentication module

Hand-rolled Google OIDC on openid-client 6, implementing sections 7.1 and 10.1 exactly, with no auth framework. The reason is recorded: the libraries available when this section was first drafted are gone or unfit (Auth.js is in maintenance mode by its own 2025-09-26 announcement and v5 never left beta; Lucia and Arctic are deprecated by their author; Better Auth would own the users table shape and the provisioning transaction boundary that section 4 and AC-005/AC-006 fix). The scope that makes hand-rolling defensible: Google-only authorization code flow, no passwords, no resets, no MFA.

Requirements, each pinned by an acceptance criterion (AC-105 to AC-115):

- Authorization requests carry state, nonce, and a PKCE S256 challenge; the callback validates all three, single-use, and rejects on any mismatch. The pending-authorization record also carries the tz reported on GET /auth/google (7.1); tz never rides redirect_uri and is never composed into a redirect target.
- Sessions are rows in a sessions table (outside the section 4 core model; observable contract in 10.1), referenced by an opaque identifier in an httpOnly, Secure, SameSite=Lax cookie, with 30-day rolling expiry. Secure is set unconditionally, never derived from the request's own transport: TLS terminates ahead of the process (11.11), so the process always speaks plain HTTP and a derived flag would never be set. A fresh identifier is issued at every sign-in; no pre-authentication session identifier is ever promoted.
- CSRF uses the double-submit pattern so the frozen section 7 surface is untouched: a token bound to the session is set in a second, non-httpOnly cookie at sign-in, and every mutation must echo it in the X-CSRF-Token header; missing or mismatched answers 403 with no side effects.
- Auth endpoints never redirect off the application origin, whatever the request carries in parameters or Host headers.
- No Google access, refresh, or ID token is persisted once the callback transaction completes.
- The development-only login endpoint (DANA_DEV_LOGIN) must be absent from production builds, regardless of environment variables. Absent means excluded from the compiled output at build time, never a runtime guard (mechanism hazard in 11.15), and the flag is read at createApp() call time, never at module load. The endpoint provisions through the same transaction as the callback and takes an optional timezone field with the 7.1 tz parameter's semantics, absent meaning UTC.
- Expired session rows are pruned opportunistically by the scheduler pass (11.7). Pruning is hygiene, not revocation; revocation never waits for it.

### 11.7 Reminder scheduler

The 8.6 delivery loop runs in-process: a 60-second interval in the server, guarded against overlapping passes, executing the poll-classify-send-mark cycle in a transaction that claims due rows with SELECT ... FOR UPDATE SKIP LOCKED. Consequences, each intended:

- A missed tick self-heals: the poll is over fire_at <= now(), so the next pass picks up anything a missed one would have sent, inside the 6-hour stale window.
- The deploy overlap window can run two instances for about ninety seconds; SKIP LOCKED makes concurrent ticks contend safely instead of double-sending. A crash between send and mark can duplicate at most one batch; 8.6 accepts duplicates.
- Tick liveness is monitored separately from process liveness (11.12), because a dead interval inside a live server is invisible to an uptime check.
- The same pass prunes expired session rows, so 8.6's statement that the reminder loop is the only background execution stays true: one scheduled process, two duties.

The pass is a plain callable function and must stay one: if hosting ever moves somewhere without an always-on process, the replacement is an external per-minute trigger (Google Cloud Scheduler or equivalent) hitting an authenticated endpoint that runs one pass.

### 11.8 Email

Resend, one provider for the three templates (invite, share grant, reminder), behind a notification module that logs instead of sending in development and tests; the 11.10 construction seam's options.notifications sink, when injected, replaces that logging so the acceptance suite can observe sends. The 10.7 deliverability checklist applies unchanged. The free tier (3,000 emails per month, 100 per day, as of 2026-07) covers v1; the daily cap is the number to watch if reminder volume grows.

### 11.9 Recurrence and time

- The 4.11 RRULE subset is implemented by an in-repo iterator module, not a runtime library. Reason, recorded: rrule.js is unmaintained (last publish about three years ago) and models results as reinterpreted UTC Dates, which collides with Dana's floating dates. The iterator is differential-tested against rrule 2.8.1 as a development-only oracle; where they disagree, RFC 5545 adjudicates, never the oracle.
- Luxon 3 performs all IANA timezone math. Both DST rules of 8.6 are implemented explicitly in the fire-instant module because Luxon guarantees neither: for a nonexistent local time Luxon advances by the gap length (02:30 becomes 03:30) where 8.6 requires the first valid instant after the gap (03:00), so the module detects the gap and clamps; for an ambiguous local time Luxon's documentation declares the choice undefined, so the module selects the earlier instant itself. AC-083 to AC-086 pin both.

### 11.10 Testing infrastructure

- Vitest 4 runs unit and acceptance tests. The acceptance suite exercises section 7 over HTTP against the real Express app in-process.
- The suite reaches that application through one construction seam: createApp(options?) in app/src/server/index.ts, Platform's file. It is synchronous, performs no I/O, and opens no database. options.dbClient injects the app/db/client.ts handle, the only way a test's in-memory PGlite database can arrive; the boot path always passes its own. options.auth injects { issuerUrl, clientId, clientSecret, appOrigin, allowInsecureRequests } and wins over the environment variables that remain the production path (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ISSUER_URL, APP_ORIGIN, OIDC_ALLOW_INSECURE); the issuer is injectable because a module that hardcodes accounts.google.com cannot be tested at all. options.notifications injects a sink { send(message) }: when present, the 11.8 notification module delivers each outbound message to it instead of logging, which is what makes a send observable under test at all, since 11.8 forbids real sending there and 10.5 keeps recipient addresses out of the logs. Each delivered message identifies its template and its recipient; the remaining keys are the module's own. Absent the sink, 11.8 stands unchanged: log in development and tests, send in production. Routes that touch the database require options.dbClient and fail only when called without it, which lets database-free surfaces (health, route-presence probes) construct the application bare.
- The database under test is selected by one seam in `app/db/client.ts`: PGlite (embedded Postgres 18, in-process, no Docker, runs on Windows) by default, or any real Postgres via TEST_DATABASE_URL. The variable is scoped to test and database-script processes: a server entrypoint passes its connection string explicitly (DATABASE_URL) and clears TEST_DATABASE_URL from its environment before opening the seam. CI runs the full suite both ways: PGlite for parity with local runs, and a postgres:18 container as the production-fidelity authority. PGlite's pg_trgm ships in its main package (contrib import). PGlite is alpha-badged; the named fallback behind the same seam is the embedded-postgres npm package (real Postgres binaries, Windows x64, no Docker or admin rights).
- The AC-001 constraint catalog test asserts structured facts from pg_constraint and pg_index (constraint type, columns, on-delete targets, partial predicates, names), never deparsed SQL text, so the same test passes on every Postgres the suite runs against.
- Playwright drives end-to-end tests on Windows and in CI, using the seed dataset and the development login endpoint for sessions.

### 11.11 Hosting and delivery

- Render: one Starter web service plus one Render Postgres instance (cheapest paid tier), same region, deployed from GitHub on push to main. Production is exactly one instance (11.1). Combined cost as of 2026-07: about 13 to 14 USD per month.
- Render Postgres is paid from day one because the free tier expires after 30 days and has no recovery capability. The paid tier's point-in-time recovery (3-day window on the Hobby workspace) is the primary backup. The runbook's quarterly drill restores into a scratch instance, runs the constraint catalog test against it, and destroys it; a monthly pg_dump kept off-platform guards against account-level failure.
- CI is GitHub Actions: npm ci, lint, typecheck, test on PGlite, test on postgres:18, build, Playwright. Merges to main require green CI.
- Environments: production and local only, no standing staging. The release ritual is CI green, deploy, then the production smoke subset (health, auth round trip, one CRUD cycle). A throwaway Render service restored from point-in-time recovery substitutes for staging when a release warrants a rehearsal.
- Secrets: Render environment variables in production, GitHub Actions secrets in CI, a gitignored .env locally, and an `.env.example` naming every variable.

### 11.12 Observability

- Sentry (free tier) receives server and client errors; AC-104 proves the wiring.
- Better Stack (free tier): an uptime monitor on /api/health, and a heartbeat the scheduler pass pings after each successful cycle; heartbeat silence beyond 10 minutes alerts. /api/health also reports seconds since the last completed pass.
- Logs go to stdout. Render retains them 7 days on the Hobby workspace, which does not meet 10.5's 30-day retention, so a workspace log stream must drain them to an external store holding at least 30 days. The store is chosen at P9 (candidates to verify at that point: Axiom, Better Stack Logs); any syslog-compatible store satisfying 10.5 may substitute without amending this section.

### 11.13 Design artifacts

The design contract between the designer and implementing agents is repo-committed, matching the protocol rule that state lives in artifacts: `docs/design/brief.md` (the designer-facing brief), `docs/design/screens/*.png` (exported screens, phone and desktop), `docs/design/notes.md` (behavior notes), and the single tokens file of 11.4. Figma is the designer's private workshop; nothing builds against it directly. Section 9 always wins over an image on structure and copy.

### 11.14 Rejected alternatives

Recorded so future work argues with a decision instead of rediscovering it. Verification date for the external facts: 2026-07-29.

| Alternative | Rejected because |
| - | - |
| Next.js (App Router) | Server actions and RSC data paths are a second door past the section 7 contract and the 10.2 chokepoint; the framework is mid-churn (Turbopack default, middleware renamed proxy, async params), which is where agents invent; SSR has no consumer in a login-gated PWA |
| Vercel hosting | No always-on process for the 8.6 tick (Hobby cron is daily-only and the plan is non-commercial; Pro adds 20 USD/month); ephemeral instances break 10.4's in-memory rate limiting; honest total cost about triple Render, across three vendors |
| Railway | Close second: always-on and cheaper, but snapshot backups only, no point-in-time recovery |
| Fly.io | No free allowance for new accounts; managed Postgres from 38 USD/month; the cheap path is self-operated Postgres, which the project constraints exclude |
| Supabase | Free tier pauses after 7 idle days and has no automated backups; its native pattern (client-side data access behind RLS) is what 10.2 forbids; Pro costs more than this entire stack |
| Neon | Scale-to-zero is defeated by the one-minute poll, so its pricing works against exactly this workload |
| Auth.js (NextAuth) | Maintenance mode by its own 2025-09-26 announcement; v5 never left beta |
| Better Auth | Would own the users table shape and the provisioning transaction that section 4 and AC-005/AC-006 fix; weekly release cadence outruns agent training data; it is the designated fallback if hand-rolled auth is ever vetoed |
| Lucia, Arctic | Both deprecated by their author |
| Prisma | Schema DSL far from section 4's SQL; heavier runtime; worse fit for constraint-exact migration work |
| rrule.js at runtime | Unmaintained; its reinterpreted-UTC result model collides with floating dates; kept as a test oracle only |
| Serwist | Coupled to Next.js, which was rejected |
| GitHub Actions as the reminder trigger | Documented 5-minute floor, plus documented delays and dropped runs under load |
| Standing staging environment | Doubles hosting cost to serve zero users; CI against postgres:18 plus the production smoke subset covers it |
| pnpm, workspaces | Real virtues, but npm and a single package are what the protocol and personas assume, and nothing here ships separately |

### 11.15 Known hazards for implementers

Facts agents get wrong because training data lags the installed versions. Read before touching the area; when in doubt, open the installed package's documentation, not memory.

- FullCalendar 7 imports standard plugins from @fullcalendar/react subpath entrypoints; the standalone @fullcalendar/daygrid package is v6-only.
- Tailwind 4 is configured in CSS (@theme in tokens.css) through @tailwindcss/vite; there is no tailwind.config.js, and v3 configuration idioms are defects.
- React Router runs in library mode; importing loader, action, or framework-mode APIs is a defect.
- zod is v4; check its breaking changes against v3 idioms before writing schemas.
- Luxon's raw DST gap and ambiguity behavior must never be used directly for fire instants (11.9).
- Express 5 handles rejected promises in handlers natively; async wrapper hacks from Express 4 tutorials are noise.
- PGlite is real Postgres but single-connection; tests must not assume parallel connections against one instance.
- tsc compiles and emits a tsconfig-excluded file whenever any resolvable import references it, literal dynamic import() included. The dev-login exclusion of 11.6 therefore holds only when the loader uses a computed import specifier and treats the load failure in a production build as the route not existing (404).
- Intl.DateTimeFormat as an IANA oracle is tolerant beyond the tzdb: it accepts ECMA-402 offset identifiers (+05:30) that are not IANA names and would break the 11.9 zone math, and it matches names case-insensitively. Every IANA validation goes through the shared validator (app/src/shared/timezone.ts), whose sign guard closes the offset hole; an independent re-check, such as the acceptance harness's, must refuse leading signs the same way.
