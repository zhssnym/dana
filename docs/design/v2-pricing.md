# The Lane 2 pricing session

Held 2026-08-24, Imran with Claude in Hassan's seat at Hassan's own word
("do it yourself with Claude"). This is the session the register scheduled on
2026-08-17 — the whole NEEDS BACKEND pile taken at once, each entry kept, cut
or deferred with a price on it — plus the systems-engineering review Imran
asked to ride with it: bugs in the pile's own logic, and functionality added
or removed where the optimal product demands it.

**Method.** Every price below is grounded in the actual spec — section 4's
ten tables, section 7's API surface, section 11's architecture — not in
memory of them. The unit is the **package**, RFC 0001's currency: one focused
build stretch with its migrations, endpoints, acceptance criteria and tests.
v1's whole application was eleven.

**The headline finding: the pile is not eighteen features. It is six
systems**, and pricing the entries one at a time — the way the register
necessarily accumulated them — hides that three of them share one substrate.
Priced as systems, the total shrinks and the architecture improves.

---

## Bugs found in the current logic

Numbered so the decisions below can cite them.

**BUG-1 — DES-224 was "blocking" on a question the schema already answers.**
The entry reasoned from folklore — "production's `due_at` carries a
timestamp" — but section 4 has no `due_at`: it has `due_date date` plus an
optional `due_time time`, and **`reminders` already has two modes** — an
offset when `due_time` exists, and a **`time_of_day`** when it does not,
with the scheduler polling `fire_at` either way. DES-178's day-level design
means every v2 reminder is simply the `time_of_day` mode, which the schema,
the state machine and the scheduler already support. The spec RFC narrows
the interface; the backend builds nothing. DES-224 is hereby **answered,
not priced**: a v2 reminder is "remind me at HH:MM on that day", one picker,
zero migration, and existing offset-mode rows keep firing for tasks that
still carry a `due_time`.

**BUG-2 — the pile prices two opposite ownership models without noticing.**
DES-130's own entry says it: the drawn folder page reads as *the folder's*
(one cover, one icon, one arrangement for every member), while the shipping
precedent (DES-086 `my-membership`) is *per-viewer*. The prototype makes it
worse silently: it stores page layout in the browser, so two members diverge
without either knowing. Every price in System C swings on this ruling —
per-viewer means per-member tables and a collaboration story where nobody
sees the same page; folder-owned means one page, member-editable, with the
event log saying who changed it. **Decision D1.**

**BUG-3 — comments were priced without their nervous system.** DES-129/134
carry four facts each, but a conversation feature with no notification is a
conversation that dies unless both people happen to be looking. DES-223
recorded the gap; the pricing consequence is stronger: comments,
conversation and notifications are **one system with one substrate** (see
System A) and must be bought together or deferred together.

**BUG-4 — the shelf page's storage key is a rename bug waiting to ship.**
A shelf is `folder_members.label` (a 1–40 char string); the shelf *page* is
keyed by that string. The prototype renames by rewriting every member label
and moving the page's stores — correct, but a backend that stores pages
keyed by a mutable string re-keys storage on every rename, in a transaction,
across tables. The optimal shape: a per-user `shelves` table (id, user_id,
name, page) with `folder_members.label` kept as the membership mechanism and
the API holding the two in step in one transaction — the id never moves, the
name is presentation. One record of belonging, one stable key for the page.

**BUG-5 — names are identifiers everywhere in the prototype.** Folders,
shelves and people are keyed by display name in the fixtures. Harmless in a
prototype, fatal in a port: production keys are uuids, and **saved views and
filters must serialize ids, never names** (a filter saved as "assignee:
Sara" breaks when Sara renames). This is a port-package rule, priced into
System F, and it belongs in RFC 0004's hazard list.

**BUG-6 — workflow import is an unvalidated file becoming server writes.**
DES-206's privacy rule (structure travels, people and time do not) is ruled;
what is not written anywhere is the server's guard: schema-validate the
file (zod, like every other input), enforce section 4's own length caps and
sane count caps (folders, sections, blocks per import), and never accept
ids, members, dates or states from the file. Priced into System E.

**BUG-7 — the single-instance tick is quietly collecting jobs.** Section
11's one production instance runs the 60-second reminder tick. Trash adds a
purge job; notifications add a delivery job. All three ride the same tick
fine — but the standing rule "a second instance must be flagged before it
happens" now has three reasons instead of one, and the RFC must say so where
the tick is specified.

**BUG-8 — the pin list and v1's visibility flags are two records of one
fact.** `user_settings` carries `show_important/all/done`; DES-170's pin
list generalizes them. The RFC maps the old keys onto the new pin set in one
migration rather than keeping both — otherwise a v1 setting and a v2 pin
disagree the first week.

---

## The systems, priced

### System A — the record substrate: events, trash, notifications
*(DES-199, DES-200, DES-216, DES-223 · answers v1's DES-076)*

One `events` table — actor, verb, subject kind and id, folder scope,
timestamp — written at the **10.2 authorization chokepoint**, which every
mutation already passes. That single seam gives history, Activity readouts
and a task's footer for free; a `notifications` table fans events out to
recipients (assignee changed → the assignee; comment → the thread's
participants) with a read bit; trash is `deleted_at` on tasks and folders
(users already have it — the pattern exists) with a purge on the tick and
restore endpoints. Retention: events 90 days rolling, trash 30 by ruling.
**Permissions**: events are visible to whoever can see their subject —
the 10.2 chokepoint answers that too, by reusing the same check on read.

- **Price: 2 packages** (schema + chokepoint hook + endpoints + tick jobs;
  the in-app bell/list surface adds a **small drawing session first**, since
  DES-223 is deliberately undrawn — half a design day, one screen).
- **Recommendation: BUILD** — it is the cheapest of the big systems per
  feature carried, and Systems C and D both lean on it.

### System B — object storage: covers, images, attachments, voice, avatars
*(DES-102, DES-105, DES-202, DES-204, parts of DES-129/130)*

One blob store behind one internal interface: upload endpoint with
rate-limit and per-user quota (recommend 1 GB to start), image downscaling
on the way in (the prototype already established that discipline at
DES-202), authenticated serving through the same 10.2 check, and
`users.avatar_url` — which **already exists in 4.1** — pointed at it for
uploaded portraits. Voice notes are files with a duration and waveform
attached; if files ship, voice is marginal. Provider is a deployment choice
(an S3-compatible store keeps the one-instance architecture clean; local
disk on the current host would die at the September migration).

- **Price: 1.5 packages** (interface + quota + downscale + serving + the
  attachment/link kinds of DES-105/161).
- **Recommendation: BUILD** — four drawn features stand on it.

### System C — the page model: identity, blocks, shelves, descriptions
*(DES-130, DES-132, DES-165–169, DES-173, DES-195, DES-207, DES-218/219)*

Folder identity columns (icon key, colour, cover ref, description), a
`page_blocks` table (folder or shelf page, ordered blocks: section,
paragraph, image ref), task→section assignment, per-user `shelves` (BUG-4's
shape), and page descriptions for native views in `user_settings`.
Concurrency: **last-write-wins per block with the standard 409 on stale
writes** — the spec already has conflict machinery, and CRDTs would be
buying a war Dana does not have. The event log (System A) records who moved
what, which is the collaboration answer at this scale.

- **Price: 2 packages**, conditional on **D1**. If D1 ruled per-viewer
  instead, add a package and lose the shared page — which is why D1 is a
  product ruling, not a technical one.
- **Recommendation: BUILD**, with D1 ruled **folder-owned** (below).

### System D — the conversation: comments, threads, likes
*(DES-129, DES-134, DES-142/143/146)*

`comments` (task or folder thread, author, body, one-level parent, file
refs) and `comment_likes`. Liveness for v2.0: **refetch-on-focus plus a
polite poll on an open thread** — no sockets, no SSE, no new architecture;
the single-instance constraint stays untouched. Real-time push is a
deferred line item, honestly labelled.

- **Price: 1.5 packages** (needs A for notifications, B for files/voice).
- **Recommendation: BUILD** — it is the vision's collaborative half — with
  liveness at poll level (**D3**).

### System E — the acts: duplicate, workflows, addresses
*(DES-197 server half, DES-198, DES-201, DES-206, DES-210)*

Deep-copy endpoints for task and folder implementing DES-198's copy rules
server-side; workflow import as create-from-structure under BUG-6's guards
(export stays client-side); `/tasks/:id` and shelf routes so Copy link is
an address the SPA resolves (the 10.2 not-found discipline already covers
permission-safe 404s).

- **Price: 1 package.**
- **Recommendation: BUILD.**

### System F — the person's bundle: preferences, pins, saved views, order
*(DES-113/121/138/170/171/179/180/189/205 + DES-153's second half)*

`user_settings` grows: density, clock, theme, task-open surface, pinned
views (migrating v1's three flags per BUG-8), sidebar order, shelf/folder
arrangement. Saved views as a `user_views` table serializing the DES-153
filter model **by ids** (BUG-5). All reads ride the existing settings
endpoints' shape.

- **Price: 1 package.**
- **Recommendation: BUILD** — cheap, and every session since F5 has been
  parking "a home on the account" items here.

### System G — the spec RFC *(DES-152, DES-178, B3, BUG-1's answer)*

Sections 1, 2, 6, 9.1, 9.3–9.5, 9.7 and about a dozen criteria for the
navigation; the due-date narrowing with reminders resolved as time-of-day
mode; 9.4's sentence; frozen 4 and 7 amended only where Lane 2 systems
above require (new tables are additive; no existing column changes shape).

- **Price: 0.5 package** (documentation and criteria work, gated on V10's
  verdicts landing first — the plan's own rule).
- **Recommendation: WRITE FIRST** — everything else cites it.

### The port itself *(RFC 0004 — not Lane 2, but the roadmap's spine)*

Rebuilding `app/src/client` to the approved v2 design against the section 7
API plus the systems above. v1's client was roughly five of eleven packages;
v2's surface is richer (boards, blocks, tabs, shelves, conversation).

- **Price: 4–5 packages**, sequenced per surface with the reference
  exports as the comparison instrument.

### System I — going live at Dana.so *(operational, with a deadline)*

The September facts are already on record: **the database expires
2026-09-12** and the web service must go always-on, both to be bought in
early September. Add the object store (System B's provider), backups
verified restorable, and the domain cutover. No code, real money, hard
dates — it belongs in the plan so the plan is honest.

- **Price: 0.5 package of operational work + the subscriptions.**

---

## Cut and deferred, with reasons

- **DES-098 tags** — DEFER. Undrawn by design; nothing depends on it; the
  filter and Important cover most tag use today.
- **DES-100 steps as first-class objects** — DEFER. The one part with pull
  (promote step to task) can ride System E later as one endpoint.
- **DES-101 check-item notes** — CUT for v2; steps already are the task's
  checklist, and two checklist systems in one card is a bug, not a feature.
- **Option B shared shelves ("Area")** — DEFER, standing by DES-195/196:
  inherited permission is the expensive part, and v2 ships without it.
- **Real-time push (SSE/WebSocket)** — DEFER with a name, so polling is a
  choice on the record rather than a ceiling nobody chose.
- **Mobile** — DEFER as its own design phase, explicitly: v2 goes live
  desktop-first at 1440, as v1 did. Saying it here keeps the launch honest.

## Added, because the optimum demanded it

- **ADD-1 — onboarding by starter workflow.** A fresh account's empty state
  offers a bundled workflow file ("Plan a trip", "Run a small team") through
  DES-206's own import — a real first-run experience for **zero new
  backend**. One small design pass; rides System E.
- **ADD-2 — the notifications drawing** (half a day) before System A's
  surface is built, keeping the lane discipline intact.
- **ADD-3 — RFC 0004 hazard list entries** for BUG-5 (ids never names) and
  the known DoneRow duplication from the plan's port notes.

---

## The decisions that are Imran's, with recommendations

| # | Decision | Recommendation |
| - | - | - |
| D1 | Whose is a folder's look and page — the folder's, or each viewer's? | **The folder's**: one page every member sees, any member edits, the event log says who; per-member label/colour stays per-viewer as today (BUG-2) |
| D2 | Ship the full build list (A–F) for v2.0, or trim further? | **Ship A–F** — 9 backend packages + 4–5 port + G; the systems share substrates, and trimming one strands its neighbours |
| D3 | Conversation liveness | **Poll on open surfaces**; push deferred by name |
| D4 | Voice notes with comments | **Yes** — marginal on System B |
| D5 | Storage quota to start | **1 GB per user**, revisit with real usage |
| D6 | The cut/defer list above | **As listed** |
| D7 | Desktop-first launch | **Yes**, mobile as its own later phase |

## The shape of the plan that follows

Once ruled: **V10's hour → the spec RFC (G) → RFC 0004** carrying the
systems in dependency order — schema/migrations first, then A, B in
parallel with C, then D, E, F, then the port packages surface by surface,
notifications' drawing and build inside A's stretch, ADD-1 riding E, System
I anchored to the September dates. Total honest estimate: **~14–15 packages
against v1's eleven**, which is proportionate — v2 is a bigger product than
v1 was.
