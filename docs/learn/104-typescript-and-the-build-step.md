# TypeScript and the build step

> Assumes [101](101-client-server-and-http.md) through
> [103](103-packages-and-the-lockfile.md).

## The problem

Two problems, and they have the same shape.

**Nothing checks your JavaScript before it runs.** You write `task.titel` instead
of `task.title` and the language does not object; it hands you `undefined` and
carries on. The mistake surfaces later, somewhere else, as a blank field or a
crash with no obvious cause. On a static site this is survivable. In a system
where a task travels from a database through a server through a network to a
browser, a single misspelled field can be wrong in four places and detectable in
none.

**What you write is not what should ship.** The client is now dozens of files
that import each other. A browser fetching dozens of files one by one is slow,
and it cannot read the newer syntax or the type annotations at all. Meanwhile the
server's files need to become something Node can execute directly and fast, with
no compiler in the way.

## The general solution

**TypeScript** is JavaScript plus a description of the shapes your data has.
`version: string` says this field holds text. You add these descriptions to your
own code, and libraries ship their own so the checker knows what they return.

The critical thing to understand is that **types do not exist at runtime**. They
are erased. A separate program — the **type checker** — reads your code and your
annotations before anything runs and reports every place they disagree. Then the
annotations are stripped, and what executes is ordinary JavaScript. Types are not
a feature of the running program; they are a proof carried out beforehand,
against the whole codebase at once.

`strict` mode makes the checker demanding, most importantly about values that may
be absent: it forces you to state whether something can be missing and to handle
it when it can.

Alongside that sits a **linter**, which does not check types but style and
hazard: unused variables, forbidden patterns, rules the team agreed on. Types ask
"is this coherent?"; the linter asks "is this how we do things here?"

The **build** turns source into shipping artifacts, and the two halves want
different treatment. Client code is **bundled**: many files traced and combined
into a few, minified, and fingerprinted so browsers cache them safely. Server
code is merely **compiled**: types stripped, file structure kept, because Node
reads files from disk and there is nothing to optimise for network transfer.

In development you want neither, because both cost seconds you pay on every save.
So development uses tools that transform on the fly and reload instantly.

## How Dana does it

**Checking.** [app/eslint.config.ts](../../app/eslint.config.ts) configures the
linter. The type checker runs three times, once per environment, because the
three have genuinely different rules about what exists — server code may open
files, client code may touch the document, and neither should be able to reach
the other's globals:

```json
"typecheck": "tsc -p tsconfig.server.json && tsc -p tsconfig.client.json && tsc -p tsconfig.node.json"
```

They share [tsconfig.base.json](../../app/tsconfig.base.json), which is where
`strict` and `noUncheckedIndexedAccess` live. That second setting is worth
naming: it makes reading `array[0]` produce a value that *might be missing*,
forcing you to handle an empty array rather than discover it in production. It is
the reason `index.ts` checks `process.argv[1] !== undefined` before using it.

**Building.** `"build": "vite build && tsc -p tsconfig.build.json"` — Vite bundles
the client into `dist/client`, then `tsc` compiles the server into `dist`. Both
land under `dist/`, which is not committed.

That layout is what makes the last part of `createApp()` work. It looks for
`dist/client/index.html`, and serves the client only if it is there:

```ts
if (existsSync(clientIndex)) {
```

After a build, one process serves both API and client. Before a build, that block
is skipped and `npm run dev` serves the client from Vite instead. One file,
honestly handling both worlds.

**Developing.** `npm run dev` runs `tsx watch src/server/index.ts`, which executes
TypeScript directly and restarts on save, and `vite`, which serves the client and
replaces changed modules in the open browser without a reload.

**The seam this creates.** Because the server is compiled but the SQL files are
not, `dist/` contains no migrations. So
[app/db/client.ts](../../app/db/client.ts) resolves them from the *working
directory* instead of relative to itself:

```ts
const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')
```

[health.ts](../../app/src/server/routes/health.ts) reads `package.json` the same
way, and its comment says why: the source and compiled layouts place the module
at different depths, but every npm script starts from `app/`. This is a real
consequence of building, and the kind of thing that is invisible until the
compiled version behaves differently from the one you tested.

## Where Dana is unusual

**Six tsconfig files** is more than most projects carry. The split exists because
`app/` holds three environments plus a build variant in one package, and each
needs different assumptions about what globals exist. It is the cost of choosing
one package over workspaces in [103](103-packages-and-the-lockfile.md) — the
boundary has to be drawn somewhere, and here it is drawn in compiler
configuration.

## What breaks without it

Drop the type checker and keep the tests. A task's due date is a `string` in the
database layer and a `Date` object in the client. Nothing complains; the code
runs; dates render as `Invalid Date` for exactly the users whose tasks came from
the path you did not test. The checker's value is that it inspects *every* path
through the codebase, including the ones no test covers — which, in a system with
ten tables and a frozen API surface, is most of them.

## Try it yourself

At `D:\dana\app`, produce the shipping artifacts and then run them:

```bash
npm run build
```

Look inside `dist/` afterwards. You will find `dist/client` — bundled,
fingerprinted files no human wrote — and the compiled server beside it, still
recognisably your file layout with the types stripped. Seeing bundling and
compiling side by side makes the distinction concrete.

Then:

```bash
npm start
```

This runs the built server rather than the development one, so the `existsSync`
branch in `createApp()` now finds a client and one process serves both halves.
Open `http://localhost:3000` and you get the page; `/api/health` still answers
JSON. That is the production shape, on your laptop.

Delete `dist/` when you are done, or leave it; it is gitignored and rebuilt by
the next `npm run build`.

Cost of a mistake: none that persists. Everything this produces is derived output
outside git.

## Check yourself

Types are erased before the program runs. Given that, explain why `npm run
typecheck` is a separate step in CI at all, rather than something that could be
skipped as long as `npm test` passes.
