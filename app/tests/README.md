# The test suite

A deliberately small core, cut on 2026-09-23 so the whole suite runs in about a
minute. **Add a test only for security, data loss, or a core smoke path. No
pinned counts** (route counts, allowlist sizes, file tallies): assert behaviour,
not the shape of the tree.

Run it from `app/`: `npx vitest run` (PGlite when `TEST_DATABASE_URL` is unset,
Postgres when it is set), or one criterion with `npx vitest run -t "AC-397"`.
The browser leg is `tests/e2e/` under Playwright and is not described here.

## What is kept

- **Security** (`criteria/`): `ac-397` authorization sweep (every id-bearing
  route refuses a stranger), `ac-236` session/CSRF sweep over every route,
  `guards/guard-list-visibility` (lists and search show a stranger nothing),
  `ac-195` file-serving scope, `ac-057` search scope, `ac-205` comment
  permissions, `ac-231` SVG refusal and polyglot re-encoding.
- **Data loss**: `ac-138` account deletion scrub, `ac-014` delete/trash/purge
  cascade, `guards/guard-account-deletion-sweep` (every FK on users is handled),
  `guards/guard-reclaim-reference-arms` (file reclaim spares every reference).
- **Core smoke**: `ac-025` task create, `ac-036` task complete, `ac-024` folder
  membership add, `ac-366` shelf privacy, `guards/guard-document-transaction`
  (page document commits atomically), `ac-825` workflow export/import round trip.
- **Pure logic** (colocated under `src/`): `shared/recurrence`,
  `server/time/recurrence`, `server/time/today` (zones and DST),
  `server/time/predicates` (My Day), `server/time/calendar-date`,
  `server/domain/fractional-index`.

## Support

`support/` holds the harnesses the kept files import and the Postgres-leg
setup `vitest.config.ts` loads. Delete a harness when nothing imports it.
