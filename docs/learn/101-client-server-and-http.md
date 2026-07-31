# Client, server, and HTTP

## The problem

You have built static websites. You put HTML, CSS, and JavaScript files
somewhere, a browser fetched them, and the page appeared. Everything the visitor
saw was already sitting in those files before they arrived, and every visitor got
the same thing.

Dana cannot work that way. Two people share a folder of tasks. One of them ticks
a task off; the other must see it ticked. Nothing about that is expressible in
files that were written before either person showed up. Something has to hold the
current truth, somewhere neither person's laptop controls, and hand out the
right slice of it to whoever asks.

A second problem hides behind the first. If the truth lived in files the browser
downloads, then the browser holds the truth, and a browser is a machine you do
not control. Anyone could edit their copy and claim a task belongs to them. There
has to be a place where the rules are enforced rather than merely requested.

## The general solution

Split the world in two.

The **client** is the program in front of the person. In a web application it is
the browser, running your HTML, CSS, and JavaScript. It knows how to draw things
and how to notice clicks. It holds no authority.

The **server** is a program running on a machine you control, which never stops.
It holds the truth, enforces the rules, and answers questions about the truth. It
draws nothing.

They talk over **HTTP**, a request-and-response protocol. The client sends a
request; the server sends back exactly one response; the exchange is over. The
server does not call the client. This one-directional shape is why the model
scales to millions of clients: the server holds no obligation to anyone between
requests.

A request carries four things worth naming:

- A **method**, saying what kind of act this is. `GET` asks for something without
  changing it. `POST`, `PATCH`, and `DELETE` change things.
- A **path**, saying which thing: `/api/health`, `/api/v1/tasks`.
- Optional **headers**, small labelled facts about the request, such as who is
  asking.
- An optional **body**, the data being sent, for methods that change things.

A response carries a **status code** — a three-digit number classifying the
outcome, where `2xx` means it worked, `4xx` means the client asked wrongly, and
`5xx` means the server broke — and usually a body. For an API the body is
normally **JSON**: the same object-and-array notation you know from JavaScript,
written as text so that any program in any language can read it.

For any of this to happen the server must be reachable. A machine is found by
address, but one machine runs many programs, so each listening program claims a
numbered **port** on it. `localhost` is the name for "this very machine," and
`localhost:3000` means the program holding port 3000 here. A port is exclusive:
one listener at a time.

## How Dana does it

Dana's server is [app/src/server/index.ts](../../app/src/server/index.ts). Read
`createApp()` from the top and you are reading a list of routes, checked in
order:

- `app.use('/api/health', healthRouter)` sends anything under `/api/health` to
  [app/src/server/routes/health.ts](../../app/src/server/routes/health.ts).
- The next handler answers every other `/api` path with status 404 and a JSON
  body. Order matters: it sits after the real routes deliberately, so it only
  catches paths nothing else claimed.
- Below that, if a built client exists on disk, any remaining path returns the
  client's HTML.

The health route itself is the smallest complete example of the whole model:

```ts
healthRouter.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', version: pkg.version, ... })
})
```

`get` names the method, `'/'` the path, `status(200)` the outcome, `json(...)`
the body. That is a full HTTP exchange in four pieces.

The port is chosen at the bottom of the same file: `Number(process.env.PORT ?? 3000)`,
so Dana listens on 3000 unless told otherwise.

You can see the split with your own eyes. With the server running, ask it for
something it has:

```bash
curl http://localhost:3000/api/health
```

and then for something it does not:

```bash
curl http://localhost:3000/api/v1/nope
```

The second returns `{"error":{"code":"not_found","message":"Not found."}}` with
status 404 — an error shaped as data, deliberately, so the client can react to it
rather than merely display it.

## Where Dana is unusual

Two choices differ from what you will read elsewhere.

**One origin, one process.** Many projects run the API on one address and the
client on another. Dana serves both from a single program, which is why
`index.ts` both answers `/api` paths and hands out the client's HTML. The payoff
is stated in `CLAUDE.md`: there is no CORS surface — no cross-origin negotiation
to configure, because there is only one origin.

**The API is the only way in.** Spec section 11 forbids the server from rendering
application data into pages. A more common design lets the server build finished
HTML with your tasks already in it. Dana refuses, so that every read and write
passes the single authorization chokepoint in spec 10.2. The rule becomes
structural rather than something everyone has to remember.

## What breaks without it

Delete the server and put the tasks in the browser instead. Now every laptop
holds its own copy of the truth, and there is no answer to the question "who is
right?" when two copies disagree. Sharing a folder becomes impossible, because
sharing requires one authority both people defer to. That authority is the
server.

## Try it yourself

In a terminal at `D:\dana\app`, with `npm run dev` running in another one, ask
the server for the same thing three ways and watch what changes:

```bash
curl -i http://localhost:3000/api/health
```

`-i` prints the status line and headers above the body, so you can see the `200`
and the `content-type` you have only read about so far. Then ask for a path
nothing claims (`/api/v1/nope`) and one the client would serve (`/`), and compare
the three status codes.

Cost of a mistake: none. Every request here is a `GET`, which by definition
changes nothing, and the worst outcome is a connection refused because the server
is not running.

## Check yourself

Dana answers `/api/v1/nope` with a 404 and a JSON error body, rather than with
the client's HTML page. Why does the order of the handlers in `createApp()`
decide that, and what would a user see if the catch-all that serves the client
were moved above the `/api` handler?
