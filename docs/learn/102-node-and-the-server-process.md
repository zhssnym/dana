# Node and the server process

> Assumes [101](101-client-server-and-http.md).

## The problem

The server has to be a program that runs somewhere other than a browser. But the
language you know — JavaScript — you have only ever seen inside a browser, where
it exists to react to clicks and change a page that is already on screen. A
browser will not let a page open a database or listen on a port, and rightly so:
the pages you visit are written by strangers.

So either the server is written in some other language, or JavaScript needs
somewhere else to run.

There is a second, less obvious problem. A static site's JavaScript starts when
the page loads and dies when the tab closes. A server must do the opposite: start
once and stay alive indefinitely, doing nothing at all until a request arrives,
for months.

## The general solution

A **runtime** is a program that executes your code and decides what your code is
allowed to reach. The browser is one runtime; it offers a document to manipulate
and forbids the filesystem. **Node.js** is another: it runs the same JavaScript
language, offers files, network sockets, and the operating system, and offers no
document at all, because there is no screen.

What Node starts is a **process**: one running program, as the operating system
accounts for it, with its own memory and its own identity — a process id, the
`pid` you saw in the log lines. Processes matter here for three reasons.

**A process can be told to stop.** The operating system sends **signals**, and
two matter: `SIGTERM`, the polite "please finish and exit" a deployment sends,
and `SIGINT`, what Ctrl-C sends. A program that ignores them is killed mid-work.
A program that handles them gets to close things cleanly first — a **graceful
shutdown**.

**A process needs configuration it does not carry.** Database passwords and
similar cannot live in the source, because the source is in git and git is
shared. The standard answer is **environment variables**: named values the
operating system hands the process at startup, different in each place the
program runs. Locally they are commonly loaded from a `.env` file that is never
committed.

**A process can hold state that vanishes when it restarts.** Anything kept in the
program's own memory is gone on restart, and is invisible to any second copy of
the program. This is fine — until there are two copies.

## How Dana does it

Dana pins its runtime. [.nvmrc](../../.nvmrc) contains `24`, and
[app/package.json](../../app/package.json) declares `"engines": { "node": ">=24 <25" }`.
Your machine and CI therefore run the same Node, and a version mismatch is a
stated error rather than a mystery.

The whole life of the process is `main()` in
[app/src/server/index.ts](../../app/src/server/index.ts), and it is worth reading
in order, because the order is the point:

1. If a `.env` file exists, load it — local convenience, absent in production.
2. Delete `TEST_DATABASE_URL` from the environment, so a variable meant for tests
   can never quietly redirect a development server.
3. Open the database, then `await dbClient.runMigrations()`.
4. **Only then** `app.listen(port)`.

Step 4 after step 3 is a deliberate safety property, and the comment in the file
spells it out: because the server does not accept a single request until
migrations have committed, a failed migration means the server never reports
healthy, the deploy fails its check, and the previous version keeps serving. The
failure is contained at boot rather than discovered later by a user.

Then shutdown:

```ts
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

`shutdown` stops accepting connections, closes the database, and exits. Without
it, Ctrl-C would drop the database connection mid-flight.

Note also the `server.on('error', ...)` handler just above. A port collision does
not fail at `listen()`; it arrives moments later as an event. Without that
handler it surfaces as a raw crash — which is exactly what you would have seen
when a second Dana tried to claim port 3000 while one was already there.

## Where Dana is unusual

**Exactly one process, ever.** Most production web applications run several
copies behind a load balancer, so that traffic spreads and one crash is not an
outage. Dana runs exactly one, on purpose, and `CLAUDE.md` names the two features
that depend on it: rate limiting held in the process's own memory, and a
once-a-minute reminder tick running inside that same process. Both are correct
only while there is one copy. Two copies would double every reminder and give
each its own private rate limit.

This is a real trade, taken knowingly for a small application: it buys a great
deal of simplicity and costs redundancy. It is written down rather than assumed,
so that scaling out is a decision made in advance instead of a bug found after.

## What breaks without it

Remove the `SIGTERM` handler and deploys become lossy. A deployment stops the old
process by asking politely; a process that does not listen is killed outright a
few seconds later, in the middle of whatever request it was serving. The user
sees a connection that dies with no response and no error — the worst kind,
because nothing anywhere records that it happened.

## Try it yourself

Two small drills at `D:\dana\app`.

**Watch a graceful shutdown.** Run `npm run dev`, watch the two log lines appear
in order — `migrations applied`, then `dana listening` — and press Ctrl-C. That
is `SIGINT` reaching the handler at the bottom of `index.ts`.

**Cause a port collision on purpose.** With one server running, start a second in
another terminal. It will log `boot failed` with `EADDRINUSE: address already in
use :::3000`, because a port has exactly one listener. You have already seen this
happen by accident; doing it deliberately is how it stops being alarming. Find
the process holding the port with `netstat -ano | findstr :3000`.

**Change the port through configuration.** Copy [app/.env.example](../../app/.env.example)
to `app/.env`, set `PORT=3001`, and start again.

Cost of a mistake: `.env` is gitignored and never leaves your machine, so a wrong
value means a server that will not start or one listening somewhere unexpected —
visible in seconds and fixed by editing one line or deleting the file.

## Check yourself

The boot sequence runs migrations *before* it starts listening. Describe what a
user of the live site would experience if a deploy shipped a broken migration —
first as Dana is built, then in a version where `listen()` came first.
