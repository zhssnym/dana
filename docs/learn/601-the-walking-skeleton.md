# The walking skeleton, and why P0 looks like this

> Assumes [101](101-client-server-and-http.md) through
> [501](501-tests-the-gate-and-ci.md). This file is the synthesis: it explains
> the shape of the first package rather than a new mechanism.

## The problem

You have a specification, thirteen role personas, and a plan of eleven packages.
Where does the first line of code go?

The intuitive answer is to build the most valuable feature first. For a to-do
application that is obviously tasks: a table, an endpoint to create one, a form.
Something a person could use by the end of the week.

Follow that instinct and here is what happens. To create a task you need a
database, so you set one up — informally, because you are focused on tasks. To
serve the endpoint you need a server, so you write one, with configuration
hard-coded because you will fix that later. To see it you need a page, so you add
a build step that works on your machine. You have a working feature, and beneath
it, four pieces of infrastructure that were never designed, are not tested, and
exist in exactly one place: your laptop.

Now the second feature arrives, written by someone else, and every one of those
four improvisations is discovered to be load-bearing. The build breaks on a
different machine. The database was created by hand and cannot be recreated. And
the moment you first attempt to *deploy* is the moment you learn whether any of
it survives outside the room it was born in — which is the single most expensive
time to find out.

The deep problem is that the risky part of a system is not its features. It is
the seams: the places where the client meets the server, the server meets the
database, the source meets the built artifact, the machine you develop on meets
the machine that runs it. Feature-first work exercises every seam *last*.

## The general solution

Invert it. Build a **walking skeleton**: the thinnest possible implementation that
runs all the way through every layer, end to end, and actually executes.

It does nothing a user wants. It is not a prototype — it is production-shaped,
built to the standards the real system will hold, deployed the way the real
system will deploy. It is simply *empty*. One trivial path is wired through every
layer, and everything else is absent.

The payoff is that every architectural risk is confronted while the cost of being
wrong is at its lowest. From then on, each feature is added to a system that
already boots, already tests, already builds, already deploys. The seams are
proven; only the flesh is new.

It also changes what "done" means for later work. When the gate already exists,
a new feature that fails to lint, typecheck, test, or build simply does not land.
The standard is enforced by machinery from the first day rather than adopted
later by agreement.

## How Dana does it

P0 is the walking skeleton. The RFC's implementation plan describes it as "Repo
scaffold, CI, migrations implementing all of section 4, seed script,
/api/health", depending on nothing and blocking everything.

Trace the one path it wired. When you ask for `/api/health` and get back
`{"status":"ok","version":"0.1.0","commit":null,"secondsSinceLastPass":null}`,
this is what had to be true:

| Layer | Proven by | Taught in |
| - | - | - |
| Dependencies resolve reproducibly | [package.json](../../app/package.json), `package-lock.json` | [103](103-packages-and-the-lockfile.md) |
| TypeScript compiles under strict rules | six `tsconfig.*.json` | [104](104-typescript-and-the-build-step.md) |
| A Node process boots and survives | [src/server/index.ts](../../app/src/server/index.ts) | [102](102-node-and-the-server-process.md) |
| A database exists and is reachable | [db/client.ts](../../app/db/client.ts) | [201](201-what-a-database-is.md) |
| The schema applies from nothing | [db/migrations/0000_core_schema.sql](../../app/db/migrations/0000_core_schema.sql) | [202](202-migrations.md) |
| HTTP routing answers | [src/server/routes/health.ts](../../app/src/server/routes/health.ts) | [101](101-client-server-and-http.md) |
| The client builds and mounts | [src/client/main.tsx](../../app/src/client/main.tsx) | [104](104-typescript-and-the-build-step.md) |
| The gate runs on a clean machine | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | [501](501-tests-the-gate-and-ci.md) |

Every layer of Dana was exercised to produce one line of JSON. That is the entire
point of the package.

Two files show the discipline most clearly.

[main.tsx](../../app/src/client/main.tsx) renders `<p>Dana</p>` and says so in a
comment: a placeholder so the toolchain builds end to end from P0 on, with the
real client arriving in P8. It would have been easy to build a bit more. Building
a bit more would have meant the Frontend Architect inheriting someone else's
guesses.

[index.ts](../../app/src/server/index.ts) mounts a 404 handler for `/api` paths
with a comment reserving the position where the real `/api/v1` surface will
mount, *above* it. The shape of the future is left visible, unbuilt.

And P0 was not thin everywhere. It implemented **all** of section 4 — ten tables,
every constraint named — rather than just the tables health needed. That is
deliberate: the schema is the frozen part of the contract, section 4 is marked
frozen, and every later package depends on it. Getting it wrong later is
expensive in a way that getting a route wrong is not.

## Where Dana is unusual

**The skeleton was built by two role-scoped sessions in a fixed order**, and the
RFC says why: platform first (scaffold, tool config, CI, boot, health), then data
(migrations, migrator, seed, the client seam), *because migrations cannot run
before the scaffold that runs them exists*. The dependency order inside a single
package is written down in advance.

**The specification preceded the skeleton by months.** The usual advice is to
build a skeleton early and let the design emerge against it. Dana wrote the
contract first and the skeleton second, which is why P0 could implement a
complete ten-table schema on day one rather than discovering it.

The trade is real and worth naming honestly: the design has never met a user, and
the specification carries assumptions that only running code can test. What the
skeleton buys is that from now on those assumptions get tested against something
that boots.

## What breaks without it

Skip P0 and let P1 build auth directly. Auth needs a `users` table, so P1 creates
one shaped for sessions and Google identity — not the section 4 `users` with its
partial unique index on active email, its `deleted_at`, its timezone default.
Then P2 needs folders, which need users, and finds a table that half-matches the
spec. Now every later package negotiates with an improvisation nobody owns, and
the section 4 contract quietly becomes a document describing a system that does
not exist.

## Try it yourself

Read the skeleton as a diff, which is the form it was actually reviewed in:

```bash
git show e1a3d82 --stat
```

Twenty-nine files under `app/`, and the commit message beneath them naming what
was merged, who reviewed it, and which criteria passed. Then read the plan it was
built against — the P0 row of the implementation plan in
[docs/rfcs/0001-mvp.md](../rfcs/0001-mvp.md) — and check the delivery against the
promise, line by line. Scaffold, CI, migrations implementing all of section 4,
seed script, `/api/health`: all five are in the file list.

The habit worth forming is reading the diff *before* the code. It tells you the
shape of a change in thirty seconds, and shape is what makes the code legible
when you get to it.

Cost of a mistake: none. `git show` reads history and cannot alter it.

## Check yourself

P0 rendered `<p>Dana</p>` on the client but implemented the *entire* section 4
schema. Both are P0 decisions, and they point in opposite directions — one as thin
as possible, one as complete as possible. Explain the principle that makes both
correct.
