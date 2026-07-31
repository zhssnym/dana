# Migrations: schema as versioned code

> Assumes [201](201-what-a-database-is.md).

## The problem

The schema in [201](201-what-a-database-is.md) had to get into the database
somehow. Someone could type those `CREATE TABLE` statements by hand, once. That
works exactly once, and then never again.

Because the schema changes. P1 adds sessions. P3 changes how folders are shared.
Each change must reach three places that are never in the same state: your local
database, CI's fresh empty one, and production's, which is full of real people's
tasks and cannot be recreated.

Hand-typing into all three fails in ways worth naming. Nothing records what was
run, so nobody can tell whether production has a change or not. Nothing enforces
order, though order matters: a table cannot reference one that does not exist
yet. And production is not empty, so "just recreate it" is not available — the
change must be applied *to data already there*, without losing it.

There is a worse version. Your database's shape and your code's assumptions must
match. If they are maintained separately by hand, they drift, and the drift is
invisible until code that expects a column meets a database that lacks it.

## The general solution

Treat schema changes as **code**: numbered files, in git, applied in order,
recording what has been applied.

A **migration** is one file containing the statements for one change. The files
are ordered — usually by a number in the name. The database keeps its own record
of which have run. A **migrator** compares that record against the files on disk,
runs whatever is missing in order, and updates the record.

Three properties follow, and they are the whole value:

- **Reproducible.** An empty database plus every migration in order equals the
  current schema, always.
- **Incremental.** A database already at migration 4 runs only 5 and 6.
- **Shared.** The change arrives through git like any other code, reviewed the
  same way.

Each run should be a transaction, so a migration that fails halfway leaves the
database as it was rather than in some half-changed state nobody designed.

Two conventions differ between projects. Some write a **down migration** — a
reversal — beside each change. And some generate migrations automatically by
diffing a schema described in code. Both are common; Dana takes neither, for
reasons below.

## How Dana does it

Migrations are hand-written SQL in
[app/db/migrations/](../../app/db/migrations/), currently one:
[0000_core_schema.sql](../../app/db/migrations/0000_core_schema.sql). The
statements are separated by `--> statement-breakpoint` markers, which is how the
migrator knows where one ends. Applied state is tracked in
`migrations/meta/_journal.json` and in the database itself.

The migrator is reached through
[app/db/client.ts](../../app/db/client.ts), which exposes `runMigrations()` on
both database kinds, so the same call works against embedded PGlite and real
Postgres. [app/db/migrate.ts](../../app/db/migrate.ts) is the standalone script;
[verify.ts](../../app/db/verify.ts) checks the result; [seed.ts](../../app/db/seed.ts)
loads development data.

The part worth carrying with you is *when* they run. In
[app/src/server/index.ts](../../app/src/server/index.ts):

```ts
await dbClient.runMigrations()
logger.info({ database: dbClient.kind }, 'migrations applied')

const server = app.listen(port, ...)
```

Migrations apply **at boot, before the server accepts a request**. You saw both
log lines in order when the server started. That ordering is the safety property
from [102](102-node-and-the-server-process.md), viewed from the database side: a
broken migration means the process never listens, never reports healthy, fails
its deploy check, and the previous version keeps serving. No window exists in
which code and schema disagree.

The comment above it also flags the assumption honestly: the migrator takes no
lock, which is safe *exactly because* production is one instance with serial
deploys. Two instances booting at once would race.

## Where Dana is unusual

**Forward-only. There are no down migrations.** `CLAUDE.md` states it plainly:
recovery is a fix-forward migration or a restore from backup.

The reasoning is that reversals are a comfortable fiction. A migration that drops
a column has no true inverse — the reverse can recreate the column but not the
data that was in it. Down migrations get written, never tested, and are trusted
in exactly the moment when trust is most expensive. Dana declines the fiction and
keeps one direction that is always exercised.

The discipline this demands is **expand-and-contract**: a destructive change is
split across two releases. First add the new thing and write to both. Then, once
nothing reads the old thing, remove it. At every moment the database is
compatible with the code both before and after — which is what makes deploying
without downtime possible at all.

**Hand-written, not generated.** Many projects describe the schema in TypeScript
and let a tool emit the SQL. Dana writes the SQL. The reason is in
[201](201-what-a-database-is.md): AC-001 asserts constraints **by name**, and
generated names are a tool's business rather than the contract's. Hand-authoring
also keeps partial indexes and multi-column foreign keys — which generators
express awkwardly if at all — as ordinary, readable lines.

## What breaks without it

Drop migrations and apply schema changes by hand. A release adds a column and the
code that reads it. It works locally, because you ran the `ALTER TABLE` there
while developing. Production deploys, the code goes live, and every request
touching that table fails — the column was never added there, because adding it
was a thing you did once, in a terminal, weeks ago, and no record of it exists
anywhere.

## Try it yourself

This is the best drill in the set, because it demonstrates the central claim
directly: an empty database plus every migration equals the current schema.

At `D:\dana\app`, with no dev server running (PGlite is single-connection, spec
11.15), delete the entire local database directory:

```bash
rm -rf .data
```

Then rebuild it from nothing:

```bash
npx tsx db/migrate.ts
```

It prints `migrations applied (pglite)`. Confirm the result is the real schema
rather than an empty shell:

```bash
npx tsx db/verify.ts
```

Ten tables, every constraint, reconstructed from files in git. Note also that
`npm run dev` would have done the same thing on its own, since migrations run at
boot.

Cost of a mistake: you lose local development data and nothing else. `.data/` is
gitignored, holds only what `db/seed.ts` put there, and is rebuilt by the two
commands above in under a minute. This drill is safe here *precisely because*
`.data/` is disposable — the same instinct applied to a production database is
the opposite of safe, which is why [201](201-what-a-database-is.md) and this file
insist the schema be reconstructible rather than precious.

## Check yourself

Dana has no down migrations, and destructive changes are split expand-and-contract
across two releases. Take a concrete change — renaming `tasks.notes` to
`tasks.description` — and describe the two releases, saying what the code does
about the column in between.
