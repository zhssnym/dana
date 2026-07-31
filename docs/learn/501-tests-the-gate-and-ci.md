# Tests, the gate, and continuous integration

> Assumes [101](101-client-server-and-http.md) through
> [202](202-migrations.md).

## The problem

Everything so far can be checked by hand exactly once. You run the server, you
curl the health endpoint, you see `{"status":"ok"}`, you believe it.

Then someone changes the boot sequence. Does health still answer? You would have
to remember to check. Multiply that by ten packages, thirteen role-scoped
sessions, and a spec with hundreds of numbered requirements, and "remember to
check" stops being a strategy. Nobody holds the whole system in their head, and
the sessions writing later packages will not have read every line of the earlier
ones.

There is a sharper version of the problem for Dana specifically. Spec section 4
says a task cannot be completed without a completion time, and
[201](201-what-a-database-is.md) showed the constraint that enforces it. But how
do you know that constraint is *actually in the database right now*, and not
merely in the file you believe was applied? A schema is only as good as its
presence.

And even with tests, they only help if they run. A test suite that passes on your
machine and is never run anywhere else fails silently the day your machine
differs from production — which, per [103](103-packages-and-the-lockfile.md), is
a thing that happens.

## The general solution

A **test** is code that exercises other code and asserts an expected outcome. A
**test runner** finds them, runs them, and reports. The value is not that tests
prove correctness; they cannot. The value is that a test written once is checked
forever, by everyone, including people who never knew it existed.

Tests come at different altitudes. A **unit test** checks one function in
isolation. An **integration test** checks pieces working together — a real
database, a real HTTP request. An **acceptance test** checks a stated requirement
of the specification, and is written to be traceable back to it.

Around the tests sits the **gate**: the fixed sequence of checks a change must
pass. Ordering it cheapest-first is deliberate, so the fast checks fail fast:

1. **Lint** — style and hazard rules.
2. **Typecheck** — coherence across the whole codebase ([104](104-typescript-and-the-build-step.md)).
3. **Test** — behaviour.
4. **Build** — does it actually produce shipping artifacts.

**Continuous integration** is a service that runs that gate automatically on
every push, on a clean machine, from nothing but what is in git. The clean
machine is the point: it cannot be contaminated by a file you forgot to commit or
a package you installed by hand months ago.

## How Dana does it

The runner is **Vitest**, configured in
[app/vitest.config.ts](../../app/vitest.config.ts). Running `npm test` right now
gives 45 tests across 5 files, all passing.

The acceptance suite is [app/tests/](../../app/tests/), one file per criterion,
named for it —
[ac-001-constraint-catalog.test.ts](../../app/tests/ac-001-constraint-catalog.test.ts),
[ac-002-task-column-invariants.test.ts](../../app/tests/ac-002-task-column-invariants.test.ts),
[ac-003-single-default-folder.test.ts](../../app/tests/ac-003-single-default-folder.test.ts),
[ac-004-connection-ordering.test.ts](../../app/tests/ac-004-connection-ordering.test.ts).
The naming is functional, not decorative: `CLAUDE.md` documents
`npx vitest run -t "AC-042"` for running one criterion by number.

AC-001 is the answer to the schema question above. It does not read the migration
file; it **queries the live database's catalogue** for every constraint and index
section 4 requires, by name. It asserts presence in the thing itself.

AC-003 is worth reading as a model of how these are written. It sets up an owner
with a default folder, then asserts a second default is rejected. But look at the
comment at the top: the other cases exist to close the ways a *wrong replacement*
could still pass —

- more non-default folders for the same owner must stay legal, so that swapping
  the partial index for a plain `UNIQUE (owner_id)` turns the suite red;
- a default folder for a *different* owner must stay legal, pinning the per-owner
  scope;
- promoting a folder by `UPDATE` must be as closed as inserting one.

That is the difference between a test that observes the current behaviour and a
test that pins the requirement. The first goes green for the wrong schema; the
second does not.

The same care runs through [app/tests/helpers.ts](../../app/tests/helpers.ts).
`expectRejectedBy(attempt, nameFragment)` asserts not merely that a statement
failed, but that it failed *by the named constraint* — because a doomed statement
can trip something else entirely and produce a green test for the wrong reason.
The helper even strips the wrapper error whose message quotes the full SQL, since
searching that text would match any rejection at all and make the check vacuous.

The gate lives in [.github/workflows/ci.yml](../../.github/workflows/ci.yml), and
its comment states that the order is normative — fixed by spec 11.11, and changing
it is an escalation rather than an edit:

```
npm ci → lint → typecheck → test (PGlite) → test (postgres:18) → build → Playwright
```

Two details deserve attention. The suite runs **twice**, against embedded PGlite
and against a real `postgres:18` service, because the seam in
[client.ts](../../app/db/client.ts) makes both possible and `CLAUDE.md` names the
real Postgres as the authority where they differ. And the final Playwright step
is conditional on a config file that does not exist yet — it activates by itself
when P8 lands, keeping the normative order in place from P0 onward rather than
being retrofitted.

## Where Dana is unusual

**Tests are traceable to a specification, and they are owned.** Most projects
write tests named after the code they cover. Dana names them after numbered
acceptance criteria, and the RFC's implementation plan assigns each package the
criteria it must satisfy — P0 was accountable for AC-001 to AC-004 and its merge
commit says so. Tests here are evidence for a contract rather than a safety net
for a module.

**The suite runs against two different databases on purpose.** Most projects test
against one. Dana accepts the extra CI time to buy fast local runs with no Docker
on this machine *and* production fidelity in CI, and writes down which one wins.

## What breaks without it

Remove AC-001 and keep the rest. A later migration, written to add a table,
accidentally drops the `tasks_completed_at_check` constraint — perhaps by
recreating the table without it. Every other test still passes, because they
exercise behaviour through code paths that happen to set both fields. The schema
has silently stopped enforcing a section 4 invariant, and nothing anywhere will
say so until the failure in [201](201-what-a-database-is.md) plays out with real
users' data.

## Try it yourself

At `D:\dana\app`, run the whole gate in CI's order, on your machine:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

That is the exact sequence from `CLAUDE.md`, and it is what a package must pass
before it can land. Then run a single criterion by number, the way the acceptance
suite is designed to be interrogated:

```bash
npx vitest run -t "AC-003"
```

Then go and read the same gate running on someone else's machine. Open the
repository's **Actions** tab on GitHub and look at the run for commit `e1a3d82`.
You will see the steps of [ci.yml](../../.github/workflows/ci.yml) as separate
entries, including the suite running twice — once on PGlite, once on
`postgres:18` — and the Playwright step skipping itself because no config file
exists yet.

Cost of a mistake: none. Every command here reads and reports; the tests use
their own throwaway databases rather than your `.data/`, and reading a CI run
changes nothing.

## Check yourself

AC-003 asserts that a *second* default folder is rejected, and separately that a
default folder for a different owner is *allowed*. The second assertion tests
something that already works. Why is it there, and what specific wrong
implementation does it catch?
