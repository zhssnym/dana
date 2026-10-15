# #671: production-shaped migration rehearsal

**Release remains blocked until a real backup and isolated restore pass.** Green CI is not sufficient to merge #709 into `main`; that merge may trigger production migrations.

## Operator instructions

1. Open the [Dana production Postgres instance](https://dashboard.render.com/d/dpg-d9v0007lk1mc73epsj80-a) in Render → **Recovery** → **Create export**. Download the generated logical backup to secure off-Render storage, and verify it is present. Render retains dashboard exports for only seven days. This export is an additional rollback artifact; the script below also creates its own fresh logical backup.
2. Provision an **empty, disposable, separate PostgreSQL 18 instance**, not connected to the live app. It may incur charges. Do not restore into production or into a nonempty database.
3. On a trusted Linux workstation or isolated runner, check out the exact reviewed release commit, install Node 24, PostgreSQL 18 client utilities (including `pg_dump`, `pg_restore`, `psql`), and run `npm ci`.
4. Supply via a **secure local environment/secrets mechanism**, never in GitHub source, comments, shell history or CI logs:
   - `DANA_671_SOURCE_URL`: production connection URL, used only for read-only queries and `pg_dump`.
   - `DANA_671_REHEARSAL_URL`: separate, empty PostgreSQL 18 instance.
   - `DANA_671_ARTIFACT_DIR`: secure local directory outside the Git checkout.
   - `DANA_671_ACK=ISOLATED_REHEARSAL_ONLY`.
5. Run `bash db/release/671-rehearse.sh`. The script rejects same-host source and target, a nonempty target, missing acknowledgment, incompatible Postgres versions and a pre-migrated source. It creates a custom-format `pg_dump`, verifies its table of contents and SHA-256, restores only into the empty destination, computes before/after fingerprints of existing records, applies pending Drizzle migrations **only on the rehearsal database**, and checks Facet associations.
6. Review the preserved artifacts and pass/fail result. A green script confirms database-level invariants but **does not** establish app-level compatibility.

## Additional gates before merging #709

- Test original Page, Task, block, file and membership identities, old URL resolution, historical Purpose/Results and Discussions, Desk, Library, breadcrumbs, archive/recovery, profile Docs, Task views, permission boundaries and import/export against the migrated rehearsal copy.
- Test Facet rename/reorder and independent-Facet Trash/restore; legacy-backed Facets must remain protected from deletion.
- Separately restore the backup to another disposable instance to prove rollback/recovery, and document restoration duration and outcome.
- Confirm a recent **off-Render** backup, final CI on the exact merge head, the final code diff and operator signoff. Keep production dumps and production-row output out of GitHub.

Any altered fingerprint, nonzero Facet violation, missing backup, SQL error or uncertain content recovery **blocks deployment**. Never bypass guards by migrating production experimentally.

Supporting assertions: `671-facet-preservation-fingerprints.sql` and `671-facet-association-checks.sql`. Render documentation: https://render.com/docs/postgresql-backups.
