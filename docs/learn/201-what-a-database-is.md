# What a database is, and why the rules live in it

> Assumes [101](101-client-server-and-http.md) through
> [104](104-typescript-and-the-build-step.md).

## The problem

The server holds the truth ([101](101-client-server-and-http.md)), but a server
is a process, and a process's memory dies with it ([102](102-node-and-the-server-process.md)).
Restart it and every task ever created is gone. So the truth must be written
somewhere that outlives the program.

The obvious answer — write it to a file — collapses under three pressures.

**Concurrency.** Two people share a folder. Both tick a task at the same instant.
Both read the file, both change their copy, both write it back; the second write
erases the first. Nothing detects this. Nothing can, because "read, modify, write"
is three separate acts with gaps in between.

**Finding things.** "Tasks in this folder, not yet done, due this week" means
reading the entire file and checking every task, every time. With a hundred tasks
that is instant. The cost grows with the size of the file, not with the size of
the answer, which is the wrong way round.

**Correctness.** Your spec says a completed task has a completion time. A file
cannot enforce that. Only the code writing the file can, which means *every* piece
of code that ever writes a task must remember to — including the bug you will
write in nine months, and the migration script you run once at midnight.

## The general solution

A **database** is a program dedicated to holding data safely and answering
questions about it. A **relational** database, the kind Dana uses, organises data
as **tables**: a table is a named collection of **rows** that all share the same
**columns**, each column holding one type of value. `tasks` is a table; one task
is a row; `title` is a column.

You talk to it in **SQL**, a language for describing *what* you want rather than
how to fetch it. The database decides how.

It answers the three pressures directly:

**Transactions.** A group of statements that either all take effect or none do,
and which appear to the rest of the world as a single instant. The lost update
above cannot happen, because the two writes cannot interleave.

**Indexes.** An extra structure the database maintains alongside a table so that
finding rows by particular columns does not require reading all of them. The cost
is that every write must update the index too, so indexes are chosen, not
sprinkled.

**Constraints.** Rules declared *on the table*, which the database enforces on
every write from every source, forever. This is the deep one. A constraint is not
a check your code performs; it is a fact about what rows are permitted to exist.
The main kinds:

- **Primary key** — this column identifies the row uniquely.
- **Foreign key** — this column must point at an existing row in another table.
  It also says what happens when that row goes: `CASCADE` deletes the dependents,
  `RESTRICT` refuses the delete, `SET NULL` empties the reference.
- **Unique** — no two rows may share this value.
- **Check** — an arbitrary condition every row must satisfy.
- **Not null** — this column must have a value.

## How Dana does it

Dana uses **Postgres**, and its entire schema is
[app/db/migrations/0000_core_schema.sql](../../app/db/migrations/0000_core_schema.sql):
ten tables — `users`, `connections`, `folders`, `folder_members`, `tasks`,
`steps`, `my_day_entries`, `reminders`, `invites`, `user_settings`. That file is
spec section 4 made executable.

The `tasks` table is where the philosophy is clearest. Look at these three, all
declared on the table itself:

```sql
CONSTRAINT tasks_due_time_requires_date_check
  CHECK (due_time IS NULL OR due_date IS NOT NULL),
CONSTRAINT tasks_completed_at_check
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'completed', 'abandoned'))
```

The first says a time of day is meaningless without a date. The second is the
sharpest: it uses equality between two *conditions* to say that being completed
and having a completion time are the same fact — you cannot have either without
the other, in either direction. The third says those three words are the only
statuses that will ever exist; a typo is rejected rather than stored.

Two more that are worth seeing because they express rules you would expect to
need application code for:

```sql
CREATE UNIQUE INDEX folders_one_default_per_owner_idx
  ON folders (owner_id) WHERE is_default;
```

A unique index with a `WHERE` clause — a **partial index**. It applies only to
rows where `is_default` is true, so each owner may have any number of folders but
at most one default. That is a business rule, enforced by a data structure.

```sql
CONSTRAINT tasks_assignee_membership_fkey
  FOREIGN KEY (folder_id, assignee_id)
  REFERENCES folder_members (folder_id, user_id) ON DELETE SET NULL (assignee_id)
```

A foreign key over *two* columns together, pointing at the membership table. It
makes "you can only assign a task to someone who is a member of that folder"
structurally impossible to violate, and when someone leaves the folder their
assignments empty out automatically rather than dangling.

The indexes below the table are chosen against real queries —
`tasks_folder_status_due_idx` for a folder's open tasks by date,
`tasks_done_pagination_idx` for paging through completed ones,
`tasks_search_trgm_idx` for text search over titles and notes.

Which database you get is decided by
[app/db/client.ts](../../app/db/client.ts): with no connection string it runs
**PGlite**, a full Postgres embedded in the process needing no installation —
which is why `npm test` works on a machine with no Docker. Set
`TEST_DATABASE_URL` and the same code talks to a real Postgres server. CI runs
both, and `CLAUDE.md` names the real `postgres:18` as the authority when they
disagree.

## Where Dana is unusual

**The constraints are the specification, not a copy of it.** Most projects
validate in application code and use the database as storage, with a few keys for
hygiene. Dana pushes every invariant it can down into the schema, and then
[app/tests/ac-001-constraint-catalog.test.ts](../../app/tests/ac-001-constraint-catalog.test.ts)
asserts each one is present **by name**. That is why every constraint in the file
carries an explicit name rather than letting Postgres generate one: the names are
part of the contract.

The reasoning follows from spec 10.2's single authorization chokepoint. A rule
enforced in one service function protects the paths that call it. A rule enforced
by the database protects every path that will ever exist, including the ones
written by a future session that never read the spec.

## What breaks without it

Remove `tasks_completed_at_check` and trust the code instead. A future package
adds a bulk "complete all" endpoint and sets `status` without setting
`completed_at`. Nothing fails; the write succeeds. Weeks later the completed-tasks
view, which sorts by `completed_at`, silently omits those tasks. They are not
lost, not deleted, and not visible — and the bug is in a table full of rows the
schema swore could not exist.

## Try it yourself

At `D:\dana\app`, with no dev server running — PGlite allows one connection at a
time (spec 11.15), so stop it first — ask the live database to prove its own
shape:

```bash
npx tsx db/verify.ts
```

It reads the database's catalogue and compares it against what section 4
requires, printing `catalog verified: 10 tables match (pglite)`. Then load
development data and look at it:

```bash
npx tsx db/seed.ts
```

[app/db/seed.ts](../../app/db/seed.ts) is worth reading either way: it is a
narrated tour of the schema, inserting a user, folders, tasks, steps, a reminder,
and an invite, so you can see what a filled Dana actually looks like as rows.

Cost of a mistake: nothing that leaves your machine. Everything here writes only
to the gitignored `.data/` directory, which you may delete at any time — see
[202](202-migrations.md) for what happens when you do.

## Check yourself

`folders_one_default_per_owner_idx` is a *unique index with a `WHERE` clause*
rather than a plain `UNIQUE` constraint on `owner_id`. Explain what would go
wrong with the plain version, and what a user would experience.
