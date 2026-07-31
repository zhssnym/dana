# Packages, dependencies, and the lockfile

> Assumes [101](101-client-server-and-http.md) and
> [102](102-node-and-the-server-process.md).

## The problem

On a static site, using someone else's code meant finding a `.js` file, saving it
next to your own, and adding a `<script>` tag. That works until it doesn't, and
it stops working for reasons that compound.

The file you saved has a version, but nothing records which one, so a year later
nobody can tell whether a bug is yours or came with the download. The library
itself depends on two other libraries, which you must find and save too, and
those have their own dependencies. When a security fix is published you have to
learn about it by accident. And when a second person clones your project, they
get whatever files happened to be committed, which may not be what you actually
ran.

Dana's server needs a web framework, a database driver, a logger, and a test
runner, each of which pulls in others. Doing that by hand is not a chore, it is
an impossibility.

## The general solution

A **package** is someone else's code, published under a name, at a version. A
**registry** is the public catalogue of them; for JavaScript that is npm. A
**package manager** is the program that reads what you asked for, works out the
full tree of everything those things need in turn, downloads it, and records the
result.

Three artifacts do the work, and they have distinct jobs that are easy to blur:

**The manifest** — `package.json` — is what you *declare*. It lists the packages
you directly want, at *ranges* rather than exact versions, because you want
compatible bug fixes without editing a file. It also names the project's
**scripts**: short names for the real commands, so the way to run the tests is
discoverable rather than folklore.

**The lockfile** — `package-lock.json` — is what you *got*. Every package in the
entire resolved tree, direct and indirect, pinned to one exact version with a
checksum. It is generated, enormous, and committed to git, because it is the only
thing that makes an install reproducible.

**The installed tree** — `node_modules/` — is the actual downloaded code. It is
never committed: it is large, machine-specific, and fully reconstructible from
the lockfile.

The distinction that matters day to day: `npm install` may *update* the lockfile
to satisfy the manifest's ranges, while `npm ci` deletes `node_modules` and
installs exactly what the lockfile says, failing if the two disagree. The first
is for when you are changing dependencies. The second is for CI and anyone who
wants the tree the last person actually tested.

One more split. **Dependencies** are needed by the running program.
**devDependencies** are needed only to develop and build it — test runners,
compilers, linters. The distinction lets a production install skip everything the
running program never touches.

## How Dana does it

[app/package.json](../../app/package.json) is short enough to read whole, and
worth reading as a description of the system:

The runtime dependencies name the architecture. `express` is the web framework
whose `get`/`use` calls you met in [101](101-client-server-and-http.md). `pg` is
the driver for a real Postgres server and `@electric-sql/pglite` is an embedded
Postgres that needs no installation; `drizzle-orm` sits over both. `pino` writes
the structured JSON log lines you saw at boot. `react` and `react-dom` build the
client.

The devDependencies name the workshop: `typescript`, `vite`, `vitest`, `eslint`,
`tsx`, `concurrently`. None of these exist in the deployed program.

The scripts are the project's public verbs, and the ones in `CLAUDE.md` are these
exact entries:

```json
"lint": "eslint .",
"typecheck": "tsc -p tsconfig.server.json && tsc -p tsconfig.client.json && tsc -p tsconfig.node.json",
"test": "vitest run",
"build": "vite build && tsc -p tsconfig.build.json"
```

`npm run dev` is worth a second look: it uses `concurrently` to run *two*
programs at once — `tsx watch src/server/index.ts` for the API, and `vite` for
the client — because in development those are separate processes even though
production is one.

Note also that `app/package.json` is read at runtime, not just at build time:
[health.ts](../../app/src/server/routes/health.ts) opens it to report the version
number in the response you got back. That is why the health endpoint said
`"version":"0.1.0"` — it is the `version` field of the manifest, and nothing else.

Finally, `.gitignore` excludes `node_modules/` and `.data/`, and `CLAUDE.md`
forbids committing `.env` files.

## Where Dana is unusual

**One package, no workspaces.** Larger projects often split into several packages
in one repository — a `server` package, a `client` package, a `shared` package —
managed as a workspace. Dana deliberately has a single `package.json` at `app/`
and draws its internal boundaries with *directories* instead:
`app/src/server/**`, `app/src/client/**`, `app/src/shared/**`. Ownership is
enforced by the team protocol rather than by package boundaries. For one
deployable built by role-scoped sessions, this removes a whole layer of tooling
that would otherwise need configuring for no gain.

## What breaks without it

Delete `package-lock.json` and keep only the manifest's version ranges. Your
machine installed `express` a month ago and has 5.2.1. CI installs today and gets
5.3.0, in which some behaviour you relied on has shifted. The tests fail in CI and
pass locally, and every instinct you have will send you hunting through your own
code — which is identical in both places. The lockfile exists so that "works on
my machine" is a statement about the same software.

## Try it yourself

At `D:\dana\app`, ask npm what verbs the project has:

```bash
npm run
```

It prints every script from the manifest — the same list you just read, which is
how you find a project's entry points without being told them.

Then do the thing that proves `node_modules` is disposable. Delete the whole
directory and rebuild it from the lockfile:

```bash
npm ci
```

Watch it recreate several hundred megabytes of code from a file in git. That is
the reproducibility claim, demonstrated rather than asserted.

Cost of a mistake: a few minutes. `node_modules` is gitignored and fully derived;
there is nothing in it to lose. Stop any running dev server first, since it is
executing from the directory you are deleting.

## Check yourself

`vitest` is a devDependency, `express` is a dependency. Explain the practical
consequence of that split for the program that actually runs in production, and
say which list `@types/express` belongs in and why.
