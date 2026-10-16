# #671 — Universal Page / Facet release rehearsal

Scope: [issue #671](https://github.com/zhssnym/dana/issues/671) / [integration PR #709](https://github.com/zhssnym/dana/pull/709), migrations **0092–0096**. This is a release gate, not an instruction to experiment on production.

## Required sequence

1. Record the exact commit to be released and check its full CI result. Confirm the target production database's current migration history ends at **0091** (or stop and re-plan if it does not). Check for newer work on `main`.
2. An authorized operator verifies a **fresh, restorable logical backup** of the production database, its creation time, source database identity, storage location and retention. Having automatic snapshots configured is *not* evidence that the particular backup restores. Do not print or commit credentials or customer data.
3. Restore the backup to an **isolated, non-production** database with its own credentials and no live app connections, integrations, webhooks or outgoing background jobs. Confirm the server, database name and migration version before proceeding. **Never point the application seed or automated test runner at the production database.**
4. Run [`db/release/671-facet-preservation-fingerprints.sql`](../../db/release/671-facet-preservation-fingerprints.sql) against the restored **0091** copy. Save the result privately alongside the release evidence, without exporting customer rows.
5. Apply precisely the pending **0092–0096** migration files using the application's normal Drizzle migration runner, **on the isolated copy only**. Record elapsed time, warnings, PostgreSQL errors and resulting migration journal. If migration fails, stop; do not partially rewrite or manually skip journal entries.
6. Run the same fingerprint SQL again. Each table's `row_count` and `content_digest` must match the baseline. This covers folders, tasks, blocks, receipts, files, membership, legacy Facets and profile Doc controls; only the newly added association columns are excluded.
7. Run [`db/release/671-facet-association-checks.sql`](../../db/release/671-facet-association-checks.sql). Every `violation_count` must equal **0**. Include archived/trashed Pages in the inventory, and verify every expected legacy Facet exists.
8. On the isolated app, exercise the exact Page and content IDs of a **sanitized sample** of Work root, Doc root/tab, nested Page, archived Page, trashed Page, profile Doc, Task, attachment, and imported/exported workflow. Check viewer vs Can edit vs Full control vs outsider access, deep links, Canvas/Board/Calendar, and a Facet Trash→restore cycle. Save only private test evidence.
9. Ensure the consolidated branch remains fully green (lint, typecheck, build, PostgreSQL tests and Playwright). **Green CI is not a substitute for steps 2–8.** Recheck compatibility with the latest `main`.
10. Approve promotion only when all evidence is reviewed. A destructive or ambiguous mismatch is a **release blocker**, even if all automated tests pass.

## Important constraints

- The migration is **forward-only** and additive. It must not replace existing Page IDs, Task IDs, blocks, files, links, profile-doc audience, or archive/Trash state.
- Newly created independent Facets may be moved to Facet Trash and restored. **Legacy-backed Facets remain protected from deletion** while older routes still address their content homes. This is an explicit incomplete part of full unification, not an error to work around by deleting a `folders` row.
- Discussion is a distinct collaboration surface, not a normal Facet. Profile Docs and Desk have separate access and default-Page rules that must be verified, not silently flattened.
- The footprint tests compare pre/post values of the *same restored copy*. The SQL files contain no mutations and no secrets. They are **not** evidence that production was backed up or that a backup restore ran.
- A failed rehearsal should be investigated in a **new isolated copy**. Do not attempt a production downgrade: release rollback requires the verified backup and an operational plan for application writes occurring after deployment.

## Release evidence to record

Branch commit SHA; pre-migration journal tail; backup timestamp and restore result; isolated database identifier; pre/post fingerprints; association-check output; compatibility checks; CI run URL; approved release decision. Never include the raw production connection string or user data in a GitHub issue.
