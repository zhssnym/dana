# `app/src/shared/` — what it is, who should own it, and how a contract change travels

Analysis for the CODEOWNERS and workflow split. Written for Hassan; sections 1,
4 and 5 are written so Imran can read them too.

Scope: the 27 files under `app/src/shared/`, how `app/src/client/` and
`app/src/server/` import from them, and what the freeze on spec sections 4 and 7
means in practice. Read-only analysis; nothing in `app/` was changed.

---

## 1. What `shared/` is, in plain words

### The problem it solves

Dana is one deployable but two programs. The server program writes JSON and
sends it. The browser program receives that JSON and draws it. They never call
each other's functions. They only ever exchange text over HTTP.

That means they have to agree, in advance, on what that text looks like. If the
server sends `{"due_date": "2026-09-01"}` and the browser reads `dueDate`, the
field renders blank. Nothing errors. No test fails unless someone wrote one
about that exact field. A user notices, weeks later, that dates are missing.

There are two ways to make the two sides agree.

**Write it down twice.** The server has its own idea of a task, the client has
its own idea of a task, and a human keeps them matching. This works until
somebody changes one and forgets the other. It always eventually fails, and it
fails silently, which is the worst kind.

**Write it down once, in a place both can read.** That place is `app/src/shared/`.

### What that gets you

Because both programs are TypeScript compiled by one `tsc` run, a shape written
once in `shared/` becomes two guarantees at once:

- The **compiler** can check that the server actually produces the shape and
  that the client actually reads the shape it was promised.
- The **running code** can check it too. Every response the client receives is
  parsed against the shared schema before anything draws it
  (`app/src/client/api/http.ts:164-170`). A response that does not match throws
  `ResponseShapeError` instead of quietly rendering `undefined`.

So one file edit fixes both sides, and disagreement becomes an error you can see
rather than a blank on a screen.

### What goes in it

Three kinds of thing, and Dana's folder has all three:

1. **Shapes.** "A task on a list carries these seventeen fields, and `due_date`
   is either a date string or null." Written as a zod schema plus the TypeScript
   type derived from it.
2. **Rules about values.** "A title is 1 to 300 characters." Written once, used
   by the server to refuse a bad request and by the client to grey out the Save
   button before the request is even sent.
3. **A small amount of real logic that both sides must perform identically.**
   Dana has exactly one of these: `parseRecurrenceRule` in
   `app/src/shared/recurrence.ts`, which reads a repeat rule like
   `FREQ=WEEKLY;BYDAY=MO` and says what it means. The client parses it to write
   "Every Monday" under the task. The server parses it to decide when to create
   the next one. If those two disagreed, the app would promise one schedule and
   deliver another.

### What must never go in it

**Anything that only works on a server.** `app/src/client/` compiles into the
browser bundle, so anything `shared/` imports gets shipped to every visitor's
browser. Database clients, file-system access, environment variables, secrets,
Node built-ins. Dana holds this line: no file in `shared/` imports anything
except `zod` and other `shared/` files (checked across all 18 source files).
`app/src/shared/recurrence.ts:13-14` states the rule explicitly — "No evaluation
lives here, and no dependency."

**Anything that is not actually a promise between the two sides.** This is the
subtler one, and Dana has a decided precedent for it. A session once proposed
moving the session and CSRF cookie names into `shared/` so both sides could
import one constant. It was declined, and the reason is recorded at
`docs/spec/11-architecture.md:62`: that directory is the API contract, and a
transport detail is not part of that contract. Each side transcribes the
specified name instead. The principle: `shared/` is for what the two sides
*promise each other*, not merely for what they *both happen to need*.

### What breaks if you get it wrong

- Put server-only code in it → it ships to the browser. Best case the bundle
  grows. Worst case a secret goes out with it.
- Put a shape in two places → the two drift, and the drift shows up as a blank
  field or a crash on a user's screen, not as a failing build.
- Put it in one place but only update one side → the compiler usually catches
  it. Section 3 says exactly when it does not.

### Inventory: what is actually in Dana's

18 source files, 9 test files. Grouped by what they do.

**Per-endpoint-family contracts.** Each file is one family of API section 7,
transcribed. Each holds request-body schemas (what the server will accept) and
response schemas (what it will send back).

| File | Lines | Covers |
| - | - | - |
| `tasks.ts` | 1120 | 7.6–7.8 — task create/edit/steps/reminders, plus the `TaskCard` and `TaskDetail` objects every list and every detail view is made of |
| `views.ts` | 699 | 7.10 — the nine list endpoints, their query parameters, their response envelopes, and the paging cursor |
| `workflows.ts` | 366 | 7.16 — the exportable/importable workflow file |
| `invites.ts` | 318 | 7.5 — invites sent, pending, accepted, declined |
| `folders.ts` | 240 | 7.4 — folders, membership, the `Folder` object |
| `events.ts` | 148 | 7.12 — the activity feed and the notification bell |
| `me.ts` | 130 | 7.1–7.2 — the account object and its settings |
| `bundle.ts` | 117 | 4.19 — the v2 settings bundle and saved views |
| `pages.ts` | 114 | 7.16 — a folder's or shelf's page of blocks |
| `comments.ts` | 92 | 7.14 — comment threads, replies, likes, attached files |
| `connections.ts` | 78 | 7.3 — the people roster |
| `covers.ts` | 76 | 7.19 — the cover picture on a built-in place page |
| `shelves.ts` | 65 | 7.16 — shelves |
| `trash.ts` | 57 | 7.13 — the Trash page's two lists |
| `sample.ts` | 25 | the sample-workspace endpoints |

**Cross-cutting primitives.** Used by several of the above, or by everything.

| File | Lines | Purpose |
| - | - | - |
| `error-envelope.ts` | 31 | The one shape every non-2xx answer carries: `{ error: { code, message } }`. No route may invent a variant |
| `timezone.ts` | 33 | The single IANA-timezone validator. Named by `docs/spec/11-architecture.md:198` as *the* validation for zones, because the underlying browser API is too tolerant in two specific ways this file closes |

**Shared behaviour.**

| File | Lines | Purpose |
| - | - | - |
| `recurrence.ts` | 306 | Parse and validate a repeat rule. The only file here that is logic rather than description. Its own header (`:4-11`) records that it lives here because one grammar must serve three callers that must never disagree |

**Tests.** Nine files (`*.test.ts`, 3560 lines total) sitting beside the modules
they check: `tasks`, `views`, `folders`, `invites`, `me`, `connections`,
`recurrence`, `timezone`, `workflows`. They assert that the schemas match the
frozen spec text — the key lists in them are transcribed from the spec by hand,
not read back off the schemas (`app/src/shared/tasks.test.ts:18-22`).

---

## 2. How it fits the architecture

Dana is one Node process. It serves the API and it serves the built React app.
One origin, no CORS. It is tempting to conclude that "shared" code is therefore
trivially easy — same repo, same compiler, just import across.

That is true of the *mechanics* and false of the *consequence*. The two programs
still run in different places at different times: the server runs now, on your
machine or Render; the client runs later, in a browser you do not control, quite
possibly on a version of the bundle cached before your last deploy. So the
agreement between them is a real agreement, not a function call. `shared/` is
what makes that agreement checkable.

Three concrete traces.

### Trace 1 — a limit defined once, enforced twice

`app/src/shared/tasks.ts:62` defines `TASK_TITLE_LIMIT = 300`. Line 65 builds a
zod string primitive `taskTitle` out of it, with a min of 1 and a max of that
constant.

- **Server side.** `taskTitle` is the `title` field of `postTasksBody`
  (`tasks.ts:339`). The route runs `postTasksBody.safeParse(req.body)`
  (`app/src/server/routes/tasks.ts:179`) and, on failure, hands the zod error to
  `sendValidationError`, which turns it into the 422 that spec 10.3 requires.
  This is the authoritative check. Nothing reaches the database around it.
- **Client side.** `app/src/client/components/task-surface.tsx:31` imports
  `TASK_TITLE_LIMIT` directly and uses it at `:241-242` to refuse an over-long
  title in the input box, before any request is sent.

The client check has no authority. Spec 7.11 is explicit about this: the client
list is "conveniences with no authority, each shadowed by a server rule", and
"any rule found only in the client and not in this section's server list is a
specification violation."

**What the shared constant buys:** the number 300 exists once. If the server
raised its limit to 500 and the client did not, the box would refuse text the
server would have accepted. If the client raised it and the server did not, a
user would type 400 characters, hit Save, and get a 422 they could have been
warned about. Neither can happen, because there is one number.

### Trace 2 — one response shape, two producers

`app/src/shared/tasks.ts:910-929` defines `taskCard`, the object every task list
row is made of.

The server produces it in **two independent places**, and this was known and
accepted in advance:

- `app/src/server/domain/tasks.ts:372` — `cardOf(detail)`, one task at a time.
- `app/src/server/views/cards.ts:213` — `cardFromRow(row)`, the projection
  behind every list endpoint. It cannot call the first one, because a list
  endpoint cannot run a per-task query per row.

`app/src/shared/views.ts:6-14` records why this matters: RFC 0001's P4 row named
the seam ahead of time, "so this package necessarily writes a second producer of
one frozen shape, and the shared schema is the contract that keeps the two
producers honest." Both functions declare a return type of `TaskCard`, so the
compiler holds them to the same shape.

The client reads it in 26 files (`grep -rln TaskCard app/src/client`), including
`views/filter.ts`, `views/grouping.ts`, `parts/presenters.ts` and every page.

**What would go wrong without it:** two server functions and twenty-six client
files would each carry their own idea of a task row. The realistic failure is
not a crash — it is that the detail dialog shows a field the list view silently
omits, on one endpoint out of nine, and nobody notices until a user asks why.

### Trace 3 — logic that must match

`parseRecurrenceRule` (`app/src/shared/recurrence.ts:168`) is imported by
`app/src/client/lib/task-concept.ts:49` and by
`app/src/server/time/recurrence.ts:45`. The client uses it to describe the
repeat in words. The server uses it to decide the next occurrence's date. Two
copies of this grammar would mean the app tells you "every Monday" and creates
the next one on Tuesday.

### Where the guarantee is enforced at runtime

`app/src/client/api/http.ts` is the only file in the client that calls `fetch`.
Every response goes through `parsed()` at `:164`, which runs `schema.safeParse`
and throws `ResponseShapeError` on a mismatch. Its header comment (`:19-25`)
states the intent plainly: "a response that does not satisfy one is a finding
rather than something to render around."

That is the practical payoff. Contract drift surfaces as a visible error state
on the page that drifted, not as a blank field somewhere else.

---

## 3. Who changes these files, and what breaks

### Who has changed them

44 commits touch `app/src/shared/`. By git author: **32 `zhssnym`, 12
`mranwafa`.**

The `mranwafa` commits are not what the author name suggests at first glance,
and the distinction matters for the ownership decision. They run 2026-08-14 to
2026-08-26 and are titled `S3`, `S5`, `S6`, `S7`, `S9`, `S12`, `P9 hardening` —
build-session names from the RFC 0005 packages. Several of them also touch
`app/src/server/` (17 commits) and `app/db/` (3 commits). So the author name
records *which machine the agent session ran on*, not that Imran hand-edited a
zod schema. **This is inference**, from the commit titles and from the fact that
those same commits contain backend work Imran could not have written.

What it does tell you, and this is not inference: **agent sessions working the
frontend packages have already edited `shared/` twelve times, and did so
deliberately, with a written justification each time.** Five files carry a
"boundary note" explaining the intrusion:

- `app/src/shared/shelves.ts:42-53` — "added by the S9 client arm on
  2026-08-24… **A boundary note, because this file is not the client arm's.**"
- `app/src/shared/bundle.ts:79-86`, `comments.ts:56-62`, `pages.ts:92-98`,
  `trash.ts:3-17` — the same, each naming the same gap.

All five are the *same change*: the backend package had published request-body
schemas and TypeScript interfaces but no zod schema for what a read answers, and
`api/http.ts` cannot parse a response without one. So the client arm added the
missing read schema and wrote down why, rather than declaring a private copy in
`src/client`. `shelves.ts:50-52` gives the reasoning: a private copy "would put
the contract in two places and let them drift."

**And where the agent judged the file too much someone else's, it did exactly
what a hard rule produces.** `app/src/client/api/mutations.ts:780-793`:

> **The response schema is declared here rather than in `src/shared/`**, and
> that is a boundary rather than a preference. […] `src/shared/workflows.ts`
> belongs to the API role, so this session declares what it needs to parse and
> leaves the move to the Steward.

That is the workaround, already in the repository, written by an agent obeying
the boundary. It is worth reading before deciding the rule, because it is
evidence about what a blanket prohibition actually produces here.

**Both behaviours broke the rule that was in force, in opposite directions.**
`docs/team/_shared-protocol.md` §3 said: "If your work requires any other change
outside your paths, stop and raise it to the Integration Steward with a precise
description of the change you need. **Do not make it yourself, and do not work
around it with a duplicate implementation.**" The five boundary notes made it
themselves. `mutations.ts:790` duplicated it. Nobody in either case did the third
thing, which was to stop and escalate — and the reason is worth naming, because
the new workflow will hit it too: **escalating cost a round trip and produced no
code, while both violations shipped.** A process that is slower than the
violation gets the violation. That is the design constraint for section 5.

### What breaks when a `shared/` file changes

This is the part that decides how dangerous frontend edits are, and the answer
is not uniform. It depends on which kind of change.

| Change | Server | Client | Caught by |
| - | - | - | - |
| **Add a required or nullable key to a response schema** (e.g. `taskCard`) | Both producers stop compiling until they supply it | Every place that *constructs* one stops compiling | **Compiler**, immediately |
| **Add an `.optional()` key to a response schema** | Compiles. Nothing obliges the server to send it | Compiles | **Nothing** until a page reads `undefined` |
| **Add an optional key to a request-body schema** (e.g. `patchTaskBody`) | Compiles. The route passes `parsed.data` straight into the domain function, which ignores what it does not read | Compiles | **Nothing.** The client sends it, the server answers 200, the field vanishes |
| **Tighten a limit or a regex** | New 422s | New refusals in forms | Tests, if a test covers that value |
| **Rename or retype an existing key** | Producers stop compiling | Readers stop compiling | **Compiler**, loudly, everywhere |
| **Add a new file with a new read schema** | Nothing | Nothing until imported | Nothing — and nothing needs to be |

Two rows need expanding.

**The silent-drop row is not hypothetical.** It has happened in this codebase,
and the record is in the file. `app/src/shared/tasks.ts:761-769`, under the
heading "the thing a schema cannot make anyone do, said once because its failure
is silent rather than loud":

> A route that parses one of them and does not act on the field answers its
> ordinary success with the field dropped, which is what the create did while
> the arm was deferred and is indistinguishable on the wire from a request that
> never carried a reminder. AC-149 exists because that failure was invisible for
> four packages; the PATCH arm has no criterion at all, so nothing but this
> sentence will notice it.

The mechanism is spec 7.0's own rule: unknown fields in a request body are
tolerated, not refused (`docs/spec/07-api.md:14`). Every schema here is a plain
`z.object`, and no file in `shared/` calls `.strict()` (checked). So a field the
schema names but no handler reads is accepted, stripped, and forgotten, with a
200 on the way out. The chain is visible in three lines:
`app/src/server/routes/tasks.ts:251` parses with the shared schema, `:256` passes
`parsed.data` on, and `app/src/server/domain/tasks.ts:797-802` takes it as
`PatchTaskBody` and reads only the fields it knows.

That is the single most dangerous edit a frontend agent could make here: it
looks like it worked. The request succeeds. Only the data never arrives.

**The "compiler catches it" rows are stronger than they look.** Commit `e3f84a1`
added two keys to `taskCard`. It touched 15 files, and its message records that
five client unit-test fixtures "build a whole TaskCard and stop compiling
without the two keys." That is a real measurement of the blast radius, and it is
reassuring: adding a non-optional field to a response shape cannot be done
halfway.

### The safety nets that exist today

1. **The compiler.** `tsc` covers client, server and shared in one run.
2. **The parse at the client's door.** `http.ts:164` means a server that stops
   sending a promised field produces a visible error state, not a blank.
3. **Four independent statements of the frozen key lists.** For `TaskCard`, the
   schema itself (`app/src/shared/tasks.ts:910`), plus three hand-transcribed
   key lists that assert key-*exactness* — an extra key fails as loudly as a
   missing one:
   - `app/src/shared/tasks.test.ts:24`
   - `app/src/server/http/tasks-contract.test.ts:140`
   - `app/tests/tasks-harness.ts:65`
4. **The acceptance suite deliberately does not import from `shared/`.**
   `app/tests/tasks-harness.ts:23-26`: the shapes are "restated rather than
   imported from app/src/shared/, by the standing Steward ruling that this suite
   measures that surface and cannot borrow its definition of correct." Same
   ruling at `app/tests/ac-116-me-shape.test.ts:9-12`.

Nets 3 and 4 are the important ones for this decision. They mean a change to a
frozen response shape **cannot pass the test suite silently** — three or four
files must be edited in agreement before the suite goes green. That is a real,
mechanical brake, and it is why a `shared/` change is less scary than it first
sounds. It is also why such a change is slow: it is four coordinated edits, and
knowing which four is knowledge the frontend side does not have.

### What the freeze on sections 4 and 7 means in practice

`docs/spec/00-index.md:38-41` marks sections 4 (data model) and 7 (API) FROZEN,
because "changing either invalidates acceptance criteria by construction."

In practice the freeze is **not** "never changes." Both sections have changed.
It is a rule about **who authorises the change**. `docs/spec/07-api.md:7`:

> Every one of them was ruled by the owner before it was written […] so the
> freeze's rule, that section 7 moves only on a human decision, holds through
> the fold.

`docs/spec/04-data-model.md:7` says the same for section 4. So the freeze is a
human-decision gate, not a lock. This is exactly the shape the new workflow
needs, and it already exists: a change to `shared/` is a change to section 7,
and section 7 moves when a person decides it moves.

---

## 4. Ownership recommendation

**Recommendation: `app/src/shared/` is Hassan's in CODEOWNERS. Not co-owned, not
split by directory. But the *review promise* is tiered, and one narrow class of
change gets a standing green light written into the frontend agent's
instructions.**

### Why Hassan owns it

**The build already decided this, in writing.** `docs/team/04-api-and-contract.md`
is the persona that owned this folder through the whole v2 build, and `CLAUDE.md`
says a persona's Owns section is the only statement of ownership in the project.
Its Owns list names `app/src/shared/**` — "the contract as code" — alongside spec
section 7 in full. Its Handoff section is the sentence to keep:

> `app/src/shared/` is the single artifact the client, the server, and the
> acceptance tests all import. It is the contract made executable; **a change
> there is a change to section 7 in disguise** and gets the same scrutiny.

Its Hard boundaries: "Never change a response shape after the freeze without an
amendment routed through the Steward to the human." Its Escalate-when: "a
genuine need arises to change a frozen response (**this is a human decision**)."

So the recommendation below is not a new rule. It is the existing rule with the
two names substituted: where the old workflow said "the API and Contract role"
and "the human", the new one says Hassan.

*(Note: `docs/team/` is deleted in the current working tree by another session's
in-progress restructure. I read these files out of the `HEAD` commit,
`git show HEAD:docs/team/04-api-and-contract.md`. They are still committed.)*

Three reasons this is also right on its own merits, in order of weight.

1. **Every file in it is a transcription of a frozen spec section.** Editing
   `shared/tasks.ts` *is* editing section 7. The spec already says section 7
   moves only on a human decision. Ownership by the person who holds technical
   authority (agreement §4, "Technical decisions") is that rule expressed in
   CODEOWNERS rather than a new rule invented for the occasion.
2. **The dangerous edit is invisible from the frontend.** The silent-drop case
   in section 3 succeeds, returns 200, and drops the data. A frontend agent has
   no way to detect it — it would have to read the server's domain module to
   know the field is unused. That is exactly the "outside my domain" case the
   agreement §5 routes to an issue.
3. **A real change lands in the server first, not in `shared/`.** Adding
   `section_block_id` to `TaskCard` (commit `e3f84a1`) required two server
   producers, a database column that already existed, and three test key lists.
   The `shared/` edit is the *smallest* part of that change, and doing it alone
   produces a build that does not compile.

### Why not co-ownership

Co-ownership in CODEOWNERS means either owner's approval is enough. That would
let a frontend PR that widens a request body merge on Imran's approval, which is
the one path that fails silently. The whole value of the file is that it is one
statement of a promise; two people who can each move it unilaterally is the
"written down twice" failure with extra steps.

### Why not a directory split (yet)

A split is defensible on the evidence — the five "read half" additions really
are a different kind of change from a request-body edit. But CODEOWNERS matches
**paths, not diffs**. To express "the client arm may add a read schema but not
touch a write body," the files would have to be physically separated, e.g.
`shared/contract/` and `shared/read/`. That is a restructure of 18 files and
roughly 107 import sites, which is a large, risky move to make for a process
problem that a one-line agent instruction solves. **Recommendation: do not split
now.** Revisit if the escalation path in section 5 turns out to be a bottleneck
in practice.

### The one standing exception

**A frontend PR may add a *new* read schema for a response the server already
sends, without opening an issue first**, provided it is purely additive: a new
`export const` and its inferred type, touching no existing schema, no request
body, and no field primitive.

Why this is safe, specifically:

- It changes nothing on the wire. The server already sends this shape.
- It cannot break the server. Nothing in `app/src/server/` imports it.
- If it is wrong, the client's own page throws `ResponseShapeError` on the next
  read. The blast radius is one screen, and the person who wrote it is the
  person who sees it.
- It has been done five times already (`shelves.ts`, `bundle.ts`, `comments.ts`,
  `pages.ts`, `trash.ts`) with no recorded harm.
- Blocking it produces `mutations.ts:790` — a contract shape living in
  `src/client`, invisible to the server, which is the outcome the folder exists
  to prevent.

Hassan still reviews the PR; CODEOWNERS makes him a required reviewer. The
exception is about not requiring an *issue and a wait* first, which is the part
that would push the agent to declare it privately instead.

### How to express it in CODEOWNERS

```
# CODEOWNERS
# Later matches win. Everything falls to Hassan unless claimed below.

*                           @zhssnym

# Frontend — Imran's area. Reviewed by Hassan before merge;
# Imran never pushes to main (agreement §5).
/app/src/client/            @mranwafa @zhssnym
/docs/design/               @mranwafa

# The contract between the two sides. Hassan's, always.
/app/src/shared/            @zhssnym

# Backend and data. Hassan's.
/app/src/server/            @zhssnym
/app/db/                    @zhssnym
/app/tests/                 @zhssnym

# The spec is the contract. Sections 4 and 7 are frozen
# and move only on a human decision.
/docs/spec/                 @zhssnym
/docs/rfcs/                 @zhssnym
```

Two notes on that block.

- Listing both handles on `/app/src/client/` makes it Imran's area while still
  requiring Hassan's review on a protected `main`. But be aware of what the
  setting actually does: if branch protection requires "review from Code
  Owners", *either* listed owner satisfies it. If you want Hassan's approval
  specifically on client PRs, list only `@zhssnym` there and let the agreement
  carry the fact that the directory is Imran's to work in. CODEOWNERS answers
  "who must approve", not "whose area is this"; the agreement answers the
  second.
- CODEOWNERS cannot express the standing exception. **Write it into the frontend
  agent's instruction file**, in words close to these: *"You may add a new read
  schema to `app/src/shared/` when the server already sends the shape and you
  need to parse it. Touch nothing already there. For anything else in that
  folder — a new field, a new filter, a changed limit — open an issue labelled
  `backend` and stop."*

---

## 5. The contract-change process

The path a change travels when the frontend needs something new from the
backend. Kept deliberately short, per agreement §6: documentation scales with
the size of the change.

### First, the question that sorts everything

**Does the server already have this fact?**

Almost every request lands in one of three buckets, and they cost wildly
different amounts. Sorting the request into a bucket is Hassan's first job and
takes about five minutes.

| Bucket | Example | Cost |
| - | - | - |
| **A — the data exists, the wire does not carry it** | The task's creator; the section it sits under | Small. One shared schema edit, the server producers, the key lists |
| **B — the data does not exist** | "Tasks need a priority" | A migration. Forward-only, no rollback. Real work |
| **C — a client concern in disguise** | A new sort order over data already sent | Zero backend. The frontend can do it alone |

Bucket C is worth naming because it is common and free, and because an agent
that does not know the bucket will open a backend issue for it.

### The smallest version — one new field

For a bucket-A single field, this is the whole process. Three steps, no
document, no RFC.

**1. Frontend opens an issue, labelled `backend`.** Five lines is enough:

```
Title: Task rows need the folder's colour

The sidebar draws a colour dot per folder, and the task list can't
match it because a task row doesn't say what colour its folder is.
Screen: the Today page, the dot left of each row.
What I need: the folder's colour on each task row.
Today I work around it by not drawing the dot in lists.
```

What makes this enough: it names the **screen**, the **fact needed**, and **what
is wrong today**. It does not name a field name, a type, or an endpoint — those
are Hassan's to choose (agreement §4). This is what the agreement means by
"understandable to a human without requiring technical knowledge."

**2. Hassan answers in the issue, then ships it in one PR.** The answer is one
of three sentences: *"Landed as `folder.color`, a nullable string"*; *"That
needs a migration, here is the cost"*; or *"That is already on the wire as X"* /
*"You can compute that client-side from Y."*

If it ships, one PR touches: the shared response schema, both server producers
if it is a `TaskCard` field, and the transcribed key lists that assert
key-exactness (section 3, net 3). Hassan runs the gate and merges to `main`.

**3. Frontend branches from `main` and draws it.** The type now exists, so the
compiler guides the work.

**Total: one issue, two PRs, no documents.** The frontend waits at exactly one
point — between step 2 merging and step 3 starting — because the field does not
exist to build against until then.

### When it is bigger

Scale up only on these triggers, and only by the step named:

| Trigger | Add |
| - | - |
| A new endpoint, or a new filter with real query cost | Hassan writes a short technical note in the issue before building: the shape, and what it costs. Not an RFC |
| A new column or table | Hassan says so and estimates. Imran decides whether it is worth it (agreement §3) |
| A new screen or a reworked flow | The agreement's own answer: a prototype plus a short `.md` of the decisions, from Imran, before anything is built |
| A change to an existing field's name, type or meaning | The heavy one. Additive replacement over two releases, never in place |

That last row deserves one sentence of "why", because it is the one people get
wrong. A user's browser may be running a bundle built before your deploy. If you
rename `due_date` to `due`, that browser asks for `due_date`, gets nothing, and
breaks — for as long as its cache lives. Adding is safe; renaming and removing
are not. This is the same reasoning the database migrations already follow
(expand-and-contract across two releases).

### What each side waits for

- **Frontend waits for**: the merge in step 2. Not the issue reply — the merge.
  Until the field exists on `main`, there is nothing to compile against.
- **Backend waits for**: a request that names a screen and a fact. An issue that
  says "add a priority field" with no screen and no behaviour is not enough to
  design against, and asking for more is not obstruction.
- **Both**: the agreement's 72-hour response norm applies to the issue reply,
  not to the code.

### The escape valve

The frontend agent's standing green light (section 4) covers the case where the
server *already sends* the fact and `shared/` merely has no schema for it. That
needs no issue and no wait. It is the case that came up five times during the v2
build, and if it required a round trip every time, the agent would go on
declaring private schemas in `src/client` — which it already did once, at
`mutations.ts:790`.

---

## 6. Duplication check

Searched for shapes, constants and enums that exist in both `client/` and
`server/`, and for things in `shared/` that only one side uses. Findings with
evidence, worst first.

### Finding 1 — the Trash view is defined twice, with no link between the copies

**Should be in `shared/` only. It is in both places.**

| Where | What |
| - | - |
| `app/src/shared/trash.ts:26-56` | `trashedTask`, `trashedFolder`, `getTrashResponse` (zod) |
| `app/src/server/domain/trash.ts:41-62` | `TrashedTask`, `TrashedFolder`, `TrashView` (interfaces) |

Same six field names on the task (`id`, `title`, `folder_id`, `folder_name`,
`deleted_at`, `is_owner`), same five on the folder. **The server does not import
`shared/trash.ts` at all** — zero references across `app/src/server`. The client
is the only importer (`app/src/client/api/queries.ts:42-43`).

So nothing connects the two. If the server's `trashView` drops `is_owner`, the
server compiles fine, and the failure appears at runtime in the browser as a
`ResponseShapeError` on the Trash page.

`app/src/shared/trash.ts:3-17` is candid that this is a restatement and explains
why it happened — the client could not import a server domain type, so it wrote
the shape out again. That reasoning is right about the direction; the fix is for
`domain/trash.ts` to import the shared type rather than declare its own.

**Fix (Hassan's, small):** delete the three interfaces from
`app/src/server/domain/trash.ts` and import `TrashedTask`, `TrashedFolder` and
`GetTrashResponse` from `shared/trash.js`. The compiler then enforces the shape
on the producing side, where it belongs.

### Finding 2 — the nine native view names are defined twice

**Should be in `shared/` only.**

| Where | What |
| - | - |
| `app/src/shared/bundle.ts:11-22` | `NATIVE_VIEWS` / `type NativeView` |
| `app/src/client/routes.ts:93-102` | `type NativeViewKey` |

Verified identical as sets: `desk, today, scheduled, assignments, important,
all, done, abandoned, anytime`. **`client/routes.ts` imports nothing from
`shared/`** — checked; its only imports are icons.

The shared list is not decorative: it is the enum inside
`patchSettingsBody.pinned_views` (`bundle.ts:39`), so it is what the server
accepts when someone changes their sidebar pins.

**The failure mode:** add a tenth native view. The server accepts it as a pin.
The client's union does not include it, and because the two lists are unrelated,
nothing fails to compile. The sidebar silently does not draw the new page, and
the settings screen silently cannot pin it.

**Fix:** `client/routes.ts` imports `NativeView` from `shared/bundle.js`. One
line changed, one type deleted.

### Finding 3 — a documented, deliberate restatement that should stay

`app/src/shared/bundle.ts:25-32` defines `DEFAULT_PINNED`;
`app/src/client/routes.ts:234-241` defines `DEFAULT_PINNED_KEYS`. Same six
values.

This one is **not** a defect, and `routes.ts:226-233` says why: the shared one is
the server's default *set*, the client one is the sidebar's *order*, and 9.1
fixes the order rather than 4.19. They agree today for a reason that could stop
being true.

Recording it here so nobody "fixes" it. If it is merged later, it should be
because the two facts were confirmed to be one fact, not because the lists
looked the same.

### Finding 4 — four response shapes live in `client/` that belong in `shared/`

Each is a real section-7 response with a zod schema in the client and a matching
object literal in a server route. Nothing links them.

| Endpoint | Client schema | Server literal |
| - | - | - |
| `POST /files` | `app/src/client/api/http.ts:292` — `{ id, bytes }` | `app/src/server/routes/files.ts:207` |
| `POST /me/avatar` | `app/src/client/api/http.ts:313` — `{ avatar_url }` | `app/src/server/routes/files.ts:296` |
| workflow import | `app/src/client/api/mutations.ts:790` — `{ folders: [{ id, name }] }` | `app/src/server/routes/workshop.ts:432` |
| folder ownership transfer | `app/src/client/api/mutations.ts:770` — `{ owner_id }` | `app/src/server/routes/workshop.ts:491` |

These are small and low-risk individually. They matter as a **pattern**: they are
the same gap the five "boundary note" files closed, still open in four places,
and the code says so — `mutations.ts:782-788` records the author flagging it and
leaving the move to someone else. **Nobody moved it.** That is the process
finding, more than the code finding: an escalation with no owner and no deadline
does not get actioned.

**Fix (Hassan's, small):** move the four schemas into the relevant `shared/`
files and have the four routes send the parsed type. Doing this makes each
route's return shape compiler-checked against the client's expectation.

### Finding 5 — `hexColor` is duplicated inside `shared/` itself

`app/src/shared/folders.ts:37-39` exports `hexColor`.
`app/src/shared/shelves.ts:20-24` writes the same regex `/^#[0-9A-Fa-f]{6}$/`
inline instead of importing it.

The messages already differ: "must be a hex color in #RRGGBB form" versus
"color: must be #RRGGBB". Harmless today, but it is two statements of one rule
in the folder whose entire purpose is that rules are stated once. Note also that
the `shelves.ts` messages carry the field-name prefix and the `folders.ts` ones
do not, which is a small drift from the convention `me.ts:8-11` sets — the 422
builder adds the prefix itself, so `shelves.ts` will render it twice.

**Fix:** `shelves.ts` imports `hexColor`. One line.

### Finding 6 — things in `shared/` that only one side uses

Three, and they are less clear-cut than they look.

**`timezone.ts` — no direct client importer.** Its three importers are all in
`app/src/server/` (`auth/dev-login.ts:26`, `auth/router.ts:49`,
`time/today.ts:23`). But it reaches the client anyway: `shared/views.ts:60`
imports `isIanaTimezone` to build `viewTz`, and the client imports `views.ts`.
So it is genuinely shared, just transitively. **It belongs where it is**, and
`docs/spec/11-architecture.md:198` names this file as *the* single IANA
validation for the whole application.

**`views.ts` carries two server-only helpers.** `takeCapped` (`views.ts:444`)
and `LIST_ROW_CAP` (`:404`) are imported only by `app/src/server/views/folder.ts:27`,
`app/src/server/views/lists.ts:36` and `app/src/server/views/cards.ts:36`.
`CappedSections` (`:425`) is `takeCapped`'s return type. No client importer.

This is list-truncation logic, not a contract shape. It sits in a file the
client imports, so it is compiled into the browser bundle unless the bundler
tree-shakes it out — which it very likely does, since nothing in the client
references it, but **I did not verify this against a built bundle.** Low
priority. If it moves, `app/src/server/views/` is the natural home;
`LIST_ROW_CAP` arguably stays in `shared/`, since a cap on response size is a
promise to the reader.

**Two cursor helpers used only by their own test.** `decodeCompletedCursor` and
`decodeSearchCursor` (`views.ts:303, 311`) have no importer outside
`app/src/shared/views.test.ts`. Only the encode halves are used, by the server.
This is consistent with the recorded ruling that cursors are opaque to the
client (commit `5c46f29`, "settle the cursor's opaqueness at P4's shape
review") — the client is *supposed* to pass a cursor back without reading it.
Keeping the decoders as the test's way of proving the encoding round-trips is
reasonable. Leave them; noted here so nobody deletes them as dead code without
reading why.

### Checked and clean

- **Status enum** (`pending`/`completed`/`abandoned`): no duplicated TypeScript
  union in the client. The literals appear in server SQL
  (`app/src/server/views/cards.ts:98,111`), which is a different medium, and
  once in a client adapter (`app/src/client/components/task-editing.tsx:56`)
  that maps two booleans to the wire value. Neither is a competing definition of
  the set.
- **Title and notes limits**: single definition, correctly imported by the
  client (`app/src/client/components/task-surface.tsx:31`). No hardcoded 300 or
  10000 anywhere in `client/` or `server/`.
- **`SettingsBundle`**: `bundle.ts` carries both an interface and a zod schema
  for the same shape — but it also carries a compile-time equality assertion at
  `:102-107` that fails the build if they diverge. **This is the pattern to
  copy** wherever a duplicate genuinely cannot be avoided.
- **No `shared/` file imports anything but `zod` and other `shared/` files.**
  The browser-safety rule holds across all 18 source files.

---

## What I could not verify

- **That the `mranwafa` commits reflect Imran's own edits rather than agent
  sessions run on his machine.** The commit titles (`S3`, `S5`, `S9`, `P9
  hardening`) and their backend content strongly suggest the latter, and the
  files' own comments say "the S9 client arm" and "the S12 client arm". But
  authorship is machine-level evidence, not intent-level. If the distinction
  matters to the ownership decision, Hassan knows the answer directly.
- **Whether `takeCapped` is tree-shaken out of the production browser bundle.**
  I did not build. Reasoning from "nothing in the client references it" says it
  should be, but that is inference.
- **Anything requiring the test suite.** I was asked not to run it, so every
  claim about what breaks is read from types, schemas, key-exact assertions in
  test source, and in one case from a commit message reporting a measurement
  (`e3f84a1`: five client fixtures stopped compiling). None of it is a run I
  performed.
- **Whether the four client-side response schemas in Finding 4 match their
  server literals exactly.** I compared field names by reading both, and they
  match, but no type connects them, so nothing proves they will keep matching.
- **Which GitHub branch-protection settings are in force.** The CODEOWNERS
  advice in section 4 assumes "require review from Code Owners" on `main`. I
  read `.github/` and found only `workflows/`; there is no CODEOWNERS file in
  the repository yet.
- **The working tree is mid-restructure and is not what `HEAD` says.** `docs/team/`,
  `docs/design/`, `docs/operator/`, `docs/parity/`, `dana-reports/` and others are
  deleted in the working tree but present in the `HEAD` commit, and `app/index.html`
  is modified. None of that is mine — another session appears to be working in this
  same checkout, which `CLAUDE.md` warns is possible. I read the persona and
  protocol files out of `HEAD` rather than from disk. **Worth confirming that
  deletion is intended before anyone commits on this branch.**
- **Whether `docs/team/` survives the restructure.** This report leans on
  `docs/team/04-api-and-contract.md` for the ownership finding. If those files are
  being retired, the sentence "a change there is a change to section 7 in
  disguise" should be carried forward into whatever replaces them, because it is
  the clearest statement of the rule anywhere in the repository.

## Open questions for Hassan

1. **Does the standing exception in section 4 go far enough?** It covers "add a
   read schema for a shape the server already sends." The next most common
   frontend want is probably a narrowing — a client-side type alias over an
   existing shared type — which does not touch `shared/` at all and needs no
   rule. But if there is a third case you expect to recur, name it now: an
   exception invented later, under deadline, is one nobody writes down.

2. **The four orphan schemas in Finding 4 were flagged in code and never
   actioned.** Whatever the new process is, it needs a place where "this belongs
   in `shared/` but is not mine to move" lands with an owner. An issue labelled
   `backend` is the obvious answer, and it only works if the frontend agent is
   told to open one rather than write a comment in the source. Should that be
   part of the agent's instructions?

3. **Do you want CODEOWNERS on `/app/src/client/` at all?** Listing Imran there
   is honest about whose area it is, but under "require review from Code Owners"
   it lets a client PR merge on his approval alone. Worth deciding explicitly
   rather than discovering.

4. **Findings 1, 2, 4 and 5 are four small PRs, all yours.** Finding 2 (the
   duplicated view names) is the one with a live failure mode and is a one-line
   fix. Worth doing before the split lands, so the frontend agent inherits a
   folder where "one definition, one place" is actually true — it is easier to
   ask an agent to respect a boundary that is not already leaking.

5. **`app/src/shared/tasks.ts` is 1120 lines and roughly 60% of it is prose.**
   That prose is genuinely load-bearing — several of this report's findings came
   out of it. But a frontend agent reading it to add one field pays for all of
   it. Is a short `app/src/shared/README.md` — what the folder is, what the rules
   are, which file covers which endpoint family — worth writing? It would be the
   natural home for the standing exception, where the agent will actually read
   it.
