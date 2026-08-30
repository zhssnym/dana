# Dana: what was built before P9, what was built after, and why the pace changed

Written 2026-08-24. Every number here comes from the git history of
`github.com/zhssnym/dana` (661 commits, 2026-07-29 to 2026-08-24) and from
`SESSION-LOG.md`. Nothing is estimated except the lines marked "should have took".

**Note on method:** the audit clone was shallow and only held history from
2026-08-13 onward. It has been unshallowed, so the numbers below cover the whole
project, not just the recent part.

---

## The shape of it, in four lines

- **Project start → P9:** 2026-07-29 to 2026-08-14. 17 calendar days, ~16 worked. **534 commits, ~212 sessions.**
- **After P9:** 2026-08-15 to 2026-08-24. 10 calendar days but only **7 worked** (08-20, 21, 22 are empty). **127 commits, ~30 sessions.**
- Pre-P9 built **~128,000 lines** of app code and **31,000** lines of docs from nothing.
- Post-P9 built **8,400 lines** of app code — but also **55,000 lines of design prototype** and a full written contract first.

The premise "after P9 is very fast" is half right. The **v2 build** was fast (one
day). The **v2 design phase** before it was not fast at all (three solid days).
That trade is the whole answer, and it is at the bottom of this file.

---

# Until P9

### 1. Product definition, the specification, and the team
**thing done:** Product idea → four drafts → adversarial audit → one technical
specification split into 13 numbered sections. Plus 13 agent role personas, the
shared protocol, the RFC process, and RFC 0001 (the 11-package build plan).

**substantiality:** This is the foundation everything else is judged against.
~31,000 lines of documentation. Sections 4 (data model) and 7 (API) were frozen
here — meaning nothing may change them without a human signature. That freeze is
what made everything later either safe or expensive.

**time consumption 1 (should have):** ~15 sessions / 2 days.

**time consumption 2 (did take):** **31 sessions / 2.5 days** (07-29 09:43 →
07-31, before any code).

**what we did right/wrong:** Right — writing the contract before the code. Wrong —
it wasn't finished. It looked finished, but it had holes that only showed up when
code hit them, and every one of those holes cost 3 sessions later.

---

### 2. P0 — scaffold, migrations, CI
**thing done:** Node/TypeScript/Express/Vite package, the migrator, the database
seam (PGlite + real Postgres), CI on a self-hosted runner, `/api/health`, and
AC-001 (the constraint catalog that asserts every index and constraint by name).

**substantiality:** Small in lines (2,084), huge in leverage. Every later package
runs on this. The two-database-leg test setup built here is why v2 can be trusted
at all.

**time consumption 1 (should have):** 4 sessions.

**time consumption 2 (did take):** **5 sessions / ~18 hours.**

**what we did right/wrong:** Right, basically. Cheapest package in the project and
it paid for itself ten times over.

---

### 3. P1 — authentication and sessions
**thing done:** Google OIDC login, session tokens hashed at rest, the `createApp`
seam, migrations 0001 and 0002, shared zod schemas, envelope helpers.

**substantiality:** 10,724 lines total by the end of it. First real security
surface. AC-005 to AC-115 (the auth criteria) were written here.

**time consumption 1 (should have):** ~5 sessions.

**time consumption 2 (did take):** **13 sessions / 3 days 5 hours.**

**what we did right/wrong:** This is where the pattern started. Five escalations
had to be ruled by a steward session, the sessions key had to be re-decided
mid-package, and the whole package was resequenced. The spec wasn't specific
enough about auth, so the build had to finish writing it.

---

### 4. P2 + P2S — folders, membership, settings
**thing done:** Folder CRUD, membership, the notify module, the 400-error mapping,
and the settings PATCH endpoints.

**substantiality:** 17,183 lines cumulative. First multi-user surface —
permissions start mattering here.

**time consumption 1 (should have):** ~6 sessions combined.

**time consumption 2 (did take):** **20 sessions / ~1 day 4 hours.**

**what we did right/wrong:** Wrong shape. Five consecutive sessions worked on the
same feature — one wrote the schemas, one the notify module, one the folders
package, one mounted it, one reviewed the shape. Five handoffs, five cold starts,
one feature.

---

### 5. P3 — tasks core
**thing done:** The task domain: create, edit, state transitions, cascades,
idempotency. AC-025 to AC-044, 122 tests.

**substantiality:** 29,085 lines cumulative. This is the actual product — every
other package is arranged around tasks.

**time consumption 1 (should have):** ~6 sessions.

**time consumption 2 (did take):** **14 sessions / 2 days 2 hours.**

**what we did right/wrong:** Right — the merge review caught a race on the task
caps and held the merge until three separate fixes landed. That hold was correct
and worth the four extra sessions it cost.

---

### 6. P4 — views and search
**thing done:** The six list queries (Today, Planned, Important, All, Done),
calendar mode, cursor pagination, the Luxon date helpers, timezone handling.

**substantiality:** Read path for the whole app. Also where timezone correctness
got settled, which is not optional in a to-do app.

**time consumption 1 (should have):** ~7 sessions.

**time consumption 2 (did take):** **19 sessions / 23 hours.**

**what we did right/wrong:** Worst change-control tax in the project. Rows 1a, 1b,
4a, 7a, 7b, 7c, 7d — seven of nineteen sessions did no product work at all. They
existed because section 6 of the spec was silent in four places and section 7 was
frozen, so every fix needed a ruling and a transcription before a test could move.

---

### 7. P5 — sharing
**thing done:** Invites, connections, the account-deletion transaction (8.10),
invite transport, the shared folder permission model.

**substantiality:** 59,509 lines cumulative by P6. The hardest correctness surface
in v1 — deletion has to unwind sharing without orphaning anything.

**time consumption 1 (should have):** ~7 sessions.

**time consumption 2 (did take):** **16 sessions / 2 days 11 hours.**

**what we did right/wrong:** Right — a false green got caught here (tests passing
that weren't actually testing anything). Finding that early is worth a lot.

---

### 8. P6 — recurrence engine
**thing done:** The repeat grammar, the iterator, generation of future instances,
projection into views, DST handling.

**substantiality:** Self-contained but genuinely hard. Recurrence is where to-do
apps usually break.

**time consumption 1 (should have):** ~6 sessions.

**time consumption 2 (did take):** **13 sessions / 9 hours.**

**what we did right/wrong:** Right. Tightest package of the second half — clear
scope, no dependencies on undecided things, so it just ran.

---

### 9. P7 — reminders
**thing done:** The reminder scheduler, five trigger points, both DST rules by
hand, email delivery through Resend, the in-process 60-second tick.

**substantiality:** Touches everything — any write to a task can move a reminder.

**time consumption 1 (should have):** ~8 sessions.

**time consumption 2 (did take):** **21 sessions / 18 hours.**

**what we did right/wrong:** Wrong — the spec said what reminders do but not what
happens when a task's due time changes on each of the two paths. That one silence
cost rows 5a, 5b, 10a, 10b and 10c. Five sessions, one missing sentence.

---

### 10. P8 — the web client
**thing done:** React shell, routing, data layer, page states, PWA, the component
set, the task form, the calendar grid, the search overlay. Plus the Playwright
browser test leg.

**substantiality:** 88,521 lines cumulative. The entire user-facing product.

**time consumption 1 (should have):** ~12 sessions.

**time consumption 2 (did take):** **23 sessions / 21 hours.**

**what we did right/wrong:** Right on structure. The browser test leg built here
(97 cases) is what made the later UI replacement survivable.

---

### 11. P8D → P8R — the design port, and doing it again
**thing done:** P8D ported the approved design over 8 sessions. It was rejected
whole. P8R rebuilt it in 21 sessions, on the designer's actual components.

**substantiality:** 23,252 insertions and 4,809 deletions across this span. The
client got largely rewritten.

**time consumption 1 (should have):** ~15 sessions, once.

**time consumption 2 (did take):** **29 sessions / 1 day 7 hours** — 8 of them
thrown in the bin.

**what we did right/wrong:** The expensive one. **Not one of the 8 sessions ever
opened the designer's prototype** — they all read his files instead. In a package
about how things look. Every session did exactly what it was told; the instruction
was wrong. Cost: 8 wasted sessions plus 21 to redo it.

---

### 12. P9 — hardening
**thing done:** Rate limits, privacy-safe logging, Sentry, the Axiom log dataset,
deletion counts, zero-vulnerability audit.

**substantiality:** 196 test files, 1,605 tests green. This is the point the app
became shippable.

**time consumption 1 (should have):** 3 sessions.

**time consumption 2 (did take):** **4 sessions / ~16 hours** (08-14, one day).

**what we did right/wrong:** Right. Codex ran this lane in parallel and it landed
clean in a day.

---

**Until P9 totals:** 14 packages · **~212 sessions** · 534 commits · 17 calendar
days, ~16 worked · ~128,000 lines of app code · 183 acceptance criteria · 1,605
tests · from an empty folder to a shippable product.

---

# After P9

### 1. P10 — release and production operations
**thing done:** Deployed to production, activated Sentry + Axiom + uptime
heartbeat, ran a live smoke test, ran a full backup-and-restore drill, version
1.0.0 bookkeeping.

**substantiality:** Almost no code (14 lines). All of it operational. Two real
defects found that no test could ever catch: the email sender address was invalid
so every reminder was silently failing, and the uptime heartbeat was set to 1 day
instead of 1 minute — which would have hidden a dead scheduler for a full day.

**time consumption 1 (should have):** 4 sessions.

**time consumption 2 (did take):** **4 sessions / ~1 day** (08-16).

**what we did right/wrong:** Right — running a real smoke test against production
found what 1,605 automated tests could not. Never skip that step.

---

### 2. The v2 design phase — prototype and decisions
**thing done:** Forked a working prototype (`prototype-v2`) and designed the
entire v2 product in it: navigation, task row states, the task form, calendar,
secondary pages, colour, the tab strip, shelves, the conversation, notifications.
Sessions V0 through V10. Every decision recorded as DES-093 to DES-226.

**substantiality:** **156 files, 55,018 lines.** This is a running application,
not a set of mockups. Every design decision has a screen behind it that Imran
could click.

**time consumption 1 (should have):** ~11 sessions.

**time consumption 2 (did take):** **~11 sessions / 3 full days** (08-17 → 08-19,
72 commits).

**what we did right/wrong:** **This is the single most important thing in the
project and it is why the build day was fast.** It is also the direct answer to
the P8D disaster: this time the design was built as a real running app first, and
Imran walked every screen of it before a line of v2 server code existed.

---

### 3. The pricing session — cutting scope
**thing done:** Went through everything v2 could contain and cut it. Six backend
systems kept; tags, steps-as-objects, check-item notes, shared shelves, real-time
push, mobile, and email digests all deferred by name. Seven decisions ruled.

**substantiality:** Small in output, large in effect. This is what stopped v2 from
being a two-month project.

**time consumption 1 (should have):** 1 session.

**time consumption 2 (did take):** **1 session / a few hours** (08-19).

**what we did right/wrong:** Right, and we didn't do this in v1. Deciding what NOT
to build, in writing, before planning, is cheap and saves whole packages.

---

### 4. RFC 0005 and RFC 0004 — the contract and the work order
**thing done:** RFC 0005 = every specification change v2 needs, written out in
full: 7 new tables, 6 new endpoint families, rewritten UI sections, the role
matrix. RFC 0004 = the 15-package build plan with owners, dependencies and file
boundaries.

**substantiality:** 1,121 lines of RFC. Sections 4 and 7 are frozen, so this
needed Imran's signature — and it is **the only approval standing between there
and release**.

**time consumption 1 (should have):** 2 sessions.

**time consumption 2 (did take):** **2 sessions**, finished 08-24 06:56.

**what we did right/wrong:** Right, and this is the fix for everything that went
wrong in P1, P4 and P7. All the contract arguments were had *here*, once, in a
document — instead of 40 times, mid-build, as escalations.

---

### 5. S1 — every v2 acceptance criterion, written red
**thing done:** AC-184 to AC-213 across 30 files, plus a hand-built multipart
upload harness. All failing, and checked that each fails for the *right* reason.

**substantiality:** 2,210 lines of tests. Every implementing package now opens
with its target already on disk.

**time consumption 1 (should have):** 1 session.

**time consumption 2 (did take):** **1 session / 3.5 hours** (07:00 → 10:32).

**what we did right/wrong:** Right. In v1 each package wrote its own criteria,
which is why the log is full of renumbering sessions. Writing them all at once
removes that entirely.

---

### 6. S2 — the expand migration
**thing done:** `0003_v2_expand.sql`: nine new tables with every constraint and
index named, new columns on folders and tasks, settings expansion, Inbox renamed
to Desk in the data.

**substantiality:** 574 lines. The whole v2 data model in one forward-only
migration, no existing column reshaped.

**time consumption 1 (should have):** 1 session.

**time consumption 2 (did take):** **1 session / 1.3 hours.**

**what we did right/wrong:** Right — the constraint catalog (AC-001) was updated
in the same session, so the migration can't drift from its test.

---

### 7. S3 — events, notifications, trash
**thing done:** One event written per mutation at the single authorization
chokepoint, notification fan-out inside the same transaction, soft delete with a
30-day purge on the scheduler tick.

**substantiality:** 1,426 lines, 26 files. This is history, trash and
notifications — three product features off one mechanism.

**time consumption 1 (should have):** 2 sessions.

**time consumption 2 (did take):** **1 session / 1.2 hours.**

**what we did right/wrong:** Right — found a real collision (one endpoint being
asked to serve two different specs) and ruled it inside the session instead of
escalating out to a steward. In v1 that was 3 sessions.

---

### 8. S4 — object storage
**thing done:** File storage behind one interface, upload API with a 25 MB cap,
image decoding and downscaling, a format allowlist, a 1 GB per-user quota under a
row lock, authenticated serving, avatars.

**substantiality:** ~1,318 lines. Covers, images, attachments, voice notes and
avatars all ride on this.

**time consumption 1 (should have):** 2 sessions.

**time consumption 2 (did take):** **1 session / ~1 hour.**

**what we did right/wrong:** Right — the security review ran *inside* the session
(SVG rejected as a document pretending to be an image, filename sanitation, CSRF
before parsing). In v1 that would have been a separate session and a separate
merge hold.

---

### 9. S5 — pages, shelves, and the object acts
**thing done:** Block-based folder and shelf pages with conflict detection,
shelves, folder identity split, duplicate, workflow import, ownership transfer,
three kinds of search.

**substantiality:** ~1,813 lines. The biggest single surface in v2.

**time consumption 1 (should have):** 3 sessions.

**time consumption 2 (did take):** **1 session**, run in parallel with S6.

**what we did right/wrong:** Mostly right, one hygiene slip: 1,372 lines of this
package were committed under an S4-labelled commit, so per-package diff numbers
are misleading. Corrected with a git note rather than a rebase.

---

### 10. S6 — comments and the conversation
**thing done:** Comment threads on folders and tasks, exactly one reply level,
likes, author-or-owner deletion, notification fan-out to thread participants.

**substantiality:** 661 lines, 5 files. Criteria green on the first run.

**time consumption 1 (should have):** 2 sessions.

**time consumption 2 (did take):** **1 session**, in parallel with S5.

**what we did right/wrong:** Right. Clean scope, clear contract, nothing to argue
about — it just ran.

---

### 11. S7 — the person's bundle
**thing done:** Settings expansion, saved views stored by id (so a rename doesn't
break them), pins, arrangements, migration 0004.

**substantiality:** Certified at **1,659 of 1,659 tests green across the whole
suite** — the first fully green run since S1 planted its failing tests.

**time consumption 1 (should have):** 2 sessions.

**time consumption 2 (did take):** **1 session / ~30 minutes** (16:10 → 16:11
commits).

**what we did right/wrong:** Right — ruled the pin migration as a *derivation*
rather than a data migration, so no existing data had to move and no v1 criteria
broke.

---

**After P9 totals:** ~30 sessions · 127 commits · 7 worked days · 8,423 lines of
app code · 55,018 lines of design prototype · 6 backend systems · tests 1,605 →
1,659.

---

# So why was one slow and the other fast?

Five reasons, in order of how much they mattered.

**1. The contract was paid for up front, in one go.**
In v1 the specification was discovered *while* it was being implemented. The loop
was: session hits a gap → stops and escalates → steward rules it → renumbers the
criteria → transcribes onto a frozen section → tester re-runs everything it
touched. That's three sessions and zero product code, and roughly **a quarter of
v1's sessions were that loop**. P4 spent 7 of 19 sessions on it. P7 lost 5 to one
missing sentence.
RFC 0005 pre-paid all of it. Every argument happened once, in a document, before
S1 opened.

**2. One session now does a whole feature instead of one layer of it.**
v1 ran one role per session on purpose. P2 spent five sessions on one feature —
schemas, then module, then package, then mount, then review. v2 keeps all those
reviews but runs them as sub-agents *inside* one session. Same coverage, one
handoff instead of five.
Honest caveat: a v2 session is much longer and much more expensive than a v1
session. Counting sessions flatters v2. Counting days is fairer.

**3. The platform already existed.**
Migrator, auth, the authorization chokepoint, both database test legs, the browser
test leg, the harnesses, rate limits, logging, the release and restore procedure —
all built in v1, all reused untouched. v2 adds nine tables and six endpoint
families to an API that already works. **P0 through P2S alone — 38 sessions — were
spent building the machine that v2 now just uses.**

**4. The design was finished, and running, before any code.**
P8D burned 8 sessions and got binned because nobody opened the prototype. So for
v2 the prototype came *first* — 55,018 lines of it — and Imran walked every screen
before the build started. There is nothing left to discover during S8–S13 except
how to wire it.

**5. Scope was cut on purpose, in writing.**
The pricing session deferred seven whole features by name. v1 never did that, so
v1 kept discovering work.

### The trade, stated plainly

The work didn't disappear. It moved earlier and got done once, in a cheaper
medium.

| | Pre-P9 | Post-P9 |
| - | - | - |
| Thinking done before coding | Partial spec | Full spec + running prototype |
| Design prototype lines | ~0 | 55,018 |
| App code written | ~128,000 | 8,423 |
| Ratio of prep to code | low | ~6.5 : 1 |
| Sessions | ~212 | ~30 |
| Worked days | ~16 | 7 |

Three days of design + two sessions of contract writing bought a one-day backend
build. That is the entire mechanism.

### What this does not prove yet

All seven fast packages were **backend** packages built against a settled
contract — the easiest kind. The v2 client (S8–S13) has not started. In v1 the
client cost 52 sessions and failed catastrophically once. If the one-session-per-
package rate breaks anywhere, it breaks there.

Also: the browser-side criteria (AC-214 to AC-225) still aren't written, and they
are exactly what would catch a bad UI port. That debt is due before S9, not at
release.

---

# Current state, across branches

Everything below is **local only** — nothing after 1.0.0 has been pushed.
`origin/main` is still at 2026-08-16.

| Branch | Ahead of main | State |
| - | - | - |
| `main` | — | v1.0.0, in production, tag deliberately withheld |
| `design/v2-refresh` | +97 | The whole v2 design phase and prototype-v2 |
| `v2-build` | +115 | Integration branch — S0 through S7 merged |
| `s3-events` … `s7-bundle` | +103…+114 | Finished package branches, already merged into `v2-build` |
| `s8-foundation` | +116 | **Active right now** — the client foundation package |
| `claude/*`, `codex/*`, `p10-*` | +0/+1 | Finished or absorbed; safe to prune later |

**Open items that are not code:**
- The production database expires **2026-09-12** and is deleted unless upgraded.
- The web service is on a free plan that suspends while idle, which freezes the
  60-second reminder tick.
- A production database credential was exposed in a screenshot and is still valid;
  the September migration is the fix of record.
- S6 is logged "done pending CI"; CI is the authority and hasn't confirmed it.
