# Routers

Rules for adding a router or a route that no single file shows. Every router is mounted
in `createApp` in `app/src/server/index.ts`.

## Adding a router

- **A router you add, you mount.** Nothing discovers routers. An unmounted one compiles
  and lints, and every request to it gets the `/api` catch-all's 404. Mount it in
  `createApp` with `app.use('/api/v1', createXRouter({ ... }))`, ahead of that catch-all.
- **Mount it directly on the application, never inside another router.** The AC-236
  (authentication) and AC-397 (authorization) sweeps walk the application's stack one
  level deep, so the routes of a nested router drop out of both and neither fails.
- **Start from `routerWithPreamble(options)` in `preamble.ts`.** It attaches the session
  and gives you `database(res)`, `viewer(req)` and `parsedId(res, raw)`.
- **Pass every uuid path parameter through `parsedId`.** It answers 404 for a value that
  is not a uuid. Skip it and that value reaches SQL as a cast error and answers 500.
  Neither sweep can see this, because both drive every path parameter as a valid uuid.
- **The factory runs inside `createApp`**, which spec 11.10 keeps synchronous and free of
  I/O. Take the database, limiters, security log and file store from its options, already
  built there.

## Each route

- The order is spec 11.3's: `requireSession`, then `requireCsrf` on mutations, then a
  rate limiter, then the handler. AC-236 drives every route with no session and every
  mutation with a session but no CSRF header, so a route that serves either request
  fails it.
- **Nothing checks the limiter.** Every mutation carries one from `options.rateLimits`,
  normally `optionalLimit(options.rateLimits?.generalMutations)`. Copy that.
- A route that takes an id needs its own `accessOf(...)` gate and an AC-397 row. See
  "Authorization" in `docs/troubleshooting.md`.
- Bodies go through `parseBody(schema, req, res, securityLog)` with a schema from
  `app/src/shared/`. See "Request fields" in `docs/troubleshooting.md`.

## Mount order

Express matches whole paths, so almost every mount is order-independent. Order matters
where an earlier router's `:param` segment matches a literal segment that a later router
registers for the same method at the same position. Inside one router, the same rule
means registering the literal route first.

- **`createViewsRouter` must stay ahead of `createBundleRouter`.** The bundle router's
  `GET /views/:id` matches `/views/my-day`, `/views/tasks` and the other one-segment view
  pages. Mounted first, it answers every one of them 404. Neither sweep notices: both
  routes still exist, and both still answer 401 without a session.
- **A route that parses its own body goes ahead of `express.json`.** The global JSON
  parser and the guard after it, which refuses any body that is not a JSON object, run
  before every `/api/v1` router. `createCspReportRouter` is mounted ahead of both because
  it parses report content types under its own size cap, and the Reporting API posts an
  array.
- Before adding a router with a one-segment `:param` under a prefix another router uses,
  check that pair by hand.
