# P9 production observability checklist

This is the human half of P9. The code can prepare safe integrations, but it
cannot create accounts, accept billing, or copy private dashboard credentials.
Never commit or paste the values below into an issue, chat, screenshot, or log.

## 1. Sentry errors

1. Create one Sentry project for Dana.
2. In the Render `dana` web service, add `SENTRY_DSN` with the server DSN.
3. Add `VITE_SENTRY_DSN` with the browser DSN. This value is intentionally
   public, but it still belongs in Render configuration rather than source.
4. Optionally set `SENTRY_RELEASE` and `VITE_SENTRY_RELEASE` to the deployed git
   commit. Render already exposes the commit as `RENDER_GIT_COMMIT` to the
   server; the Vite value must exist at build time.
5. Redeploy only after the P9 branch is reviewed and merged.

Dana sends no default PII or breadcrumbs and replaces error messages with a
content-free error before capture. Method, route pattern, status, error class,
and code locations remain available for diagnosis.

## 2. Better Stack uptime and scheduler heartbeat

1. Create an HTTPS uptime monitor for `https://dana.so/api/health`.
2. Set the expected status to 200 and alert if it is unavailable.
3. Create a heartbeat that alerts after ten minutes without a ping.
4. Put its private URL in Render as `SCHEDULER_HEARTBEAT_URL`.
5. Confirm the health response includes `version`, `commit`, and
   `secondsSinceLastPass`, and confirm the heartbeat turns green after a
   successful scheduler pass.

The two monitors answer different questions: uptime proves the web process is
reachable; the heartbeat proves the reminder loop is still completing work.

## 3. Thirty-day log retention

1. Connect the Render service's stdout log stream to Better Stack Logs or
   Axiom.
2. Set retention to at least 30 days.
3. Confirm a Dana operational line is searchable in the external store.
4. Search the captured sample for a known test task title, note, step title,
   invite address, OAuth token, and session id. None may appear.

## 4. Completion evidence

- `/api/health` monitor is green.
- Scheduler heartbeat is green.
- A test server and browser error appear in Sentry.
- A production stdout line appears in the log store.
- The log store retains data for at least 30 days.
- No secret value is present in Git or screenshots.
