# Dana session log

Every agent session that has run, in the order it ran, one table per package,
and one at the end for work that belongs to no package.
`CHANGELOG.md` records what the product became; this records how it was built.

**This is a record, not a source of truth.** Protocol section 2 names the five
sources project state comes from, and this file is not one of them: it is written
after the fact by the operator's coordinating session, from final blocks that
reach nobody else. Read it for context if you like. Never reason from it, never
treat a row as evidence that something landed, and never read a planned row as an
assignment. `git log`, the suite, `app/tests/`, the specification, and the active
RFC's implementation plan are what bind you.

A row whose Status reads Done was written after that session's final block had been
verified against the repository, and those rows are listed in the order they ran,
so a number out of sequence means that session moved. From P8 onward a package's
table also carries the sessions still ahead of it, marked Planned or Blocked in the
same column, so the whole shape of a package reads in one place instead of half of
it. Those rows are a forecast and they are the operator's, revised whenever a
session's findings revise the plan, which is often: eight of P8's rows were not
foreseen when its table opened. A planned row is never an assignment, and what a
session is told to do reaches it through its prompt and through the active RFC's
implementation plan rather than through here.

Inserted rows (`1a`, `3a`, `6b`) are sessions the plan did not foresee; they keep
their place rather than being renumbered, because the numbers are addresses. Mode
names the chat a session returned into, or the chat one is intended for while its
row is still a forecast, or Unattended where it ran as an isolated sub-agent with
no chat to return to. A run of consecutive Unattended rows is a grouped run: one
dispatching chat launched each as an isolated sub-agent in sequence, verifying each
before starting the next.

## P minus 4: product definition

| # | Task | Status |
| --- | --- | --- |
| 1 | Create a folder for dana: create `.gitignore`, `CLAUDE.md`, `README.md` | Done |
| 2 | Rewrite Imran's bullet pointed product idea as pdd v1 | Done |
| 3 | Rewrite v1 by hand into a structured pdd v2 | Done |
| 4 | Heavily debate every feature with critic AI persona and as a result create a pdd v3 | Done |
| 5 | Run an adversarial audit against v3 | Done |
| 6 | Fold every audit resolution into technical specification pdd v4 | Done |
| 7 | Assemble the dev team: create 13 job personas for ai and create a shared protocol  | Done |

## P minus 3: documentation architecture

| # | Task | Status |
| --- | --- | --- |
| 1 | Consolidate the drafts into one living `specification.md` | Done |
| 2 | Give every kind of document one home: `rfcs/`, `runbook.md` | Done |
| 3 | Delete the superseded drafts from the tree, keep them in git history | Done |
| 4 | Move the build order out of the spec and into RFC 0001 | Done |
| 5 | Renumber acceptance criteria and open questions to sections 12 and 13 | Done |
| 6 | Strip the `[ISSUE-NN]` and `[SPEC]` provenance tags | Done |

## P minus 2: the four generation jobs

| # | Task | Status |
| --- | --- | --- |
| 1 | Job 1: choose a teck stack and make section 11 normative | Done |
| 2 | Add the auth security criteria AC-105 to AC-115 | Done |
| 3 | Write a design brief for Imran so he can work on the UI and write the README | Done |
| 4 | Job 2: rebuild the team files and close the ownership gaps | Done |
| 5 | Job 3: write the RFC process and RFC 0001 in full | Done |
| 6 | Job 4: write the runbook and CLAUDE.md | Done |
| 7 | Record the amendments in the changelog | Done |

## P minus 1: execution readiness

| # | Task | Status |
| --- | --- | --- |
| 1 | Split the specification file into multiple files per numbered section | Done |
| 2 | Drop the version labels from the scope headings | Done |
| 3 | Rewrite the dev team job description so they are version free | Done |
| 4 | Add the learn folder and its tutor contract so I can learn along the way | Done |
| 5 | Make Imran to start working on the the design brief | Done |
| 5a | Use the design brief and create the product UI with ai, just as an example for Imran  | Done |
| 6 | Merge the generated `CLAUDE.md` with the hand-written one | Done |
| 7 | Decide which agent role pushes, and let the tutor flag hands-on work for me | Done |
| 8 | Grade which packages need the stronger model to avoid Claude usage limits on our 5x plan | Done |
| 9 | Start working on P0's first session in full | Done |
| 10 | Fix P0's owner: it spans Platform then Data, in that order | Done |

## P0: scaffold, migrations, and CI (`p0-scaffold`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 1 | Scaffold, toolchain, CI, boot file, /api/health | 10 | Implementers | Done |
| 2 | Section 4 migration `0000`, db seam, seed, AC-001 catalog + verifier | 01 | Implementers | Done |
| 3 | AC-001 to AC-004 and the shared harness | 11 | Testers | Done |
| 4 | Return: fix the tester's findings on the boot path | 10 | Implementers | Done |
| 5 | Review, record the merge decisions, merge to main | 12 | Steward | Done |

## P1: authentication and sessions (`p1-auth`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 1 | Wrote AC-005 to AC-115, 15 of 17, harness, OIDC stub | 11 | Testers | Done |
| 2 | Ruled the 5 escalations, amended the spec | 12 | Steward | Done |
| 3 | AC-007, AC-113, released the held assertions | 11 | Testers | Done |
| 4 | `createApp` seam, `.env.example`, build exclusion | 10 | Implementers | Done |
| 5 | Sessions migration `0001` | 01 | Implementers | Done |
| 6 | Shared zod schemas, envelope helpers | 04 | Implementers | Done |
| 7 | Ruled the sessions key, resequenced P1 | 12 | Steward | Done |
| 7a | Sign guard, AC-007 offsets, AC-113 fourth fact | 11 | Testers | Done |
| 8 | Migration `0002`, the `token_hash` key | 01 | Implementers | Done |
| 9 | The auth module itself | 06 | Implementers | Done |
| 10 | Boot wiring by request | 10 | Implementers | Done |
| 11 | Endpoint shape review | 04 | Implementers | Done |
| 12 | Review the whole branch, merge to main | 12 | Steward | Done |

## P2: folders and membership (`p2-folders`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: 7.0 sentence, row P2S, P2 trace | 12 | Steward | Done |
| 1 | AC-011 to AC-024, 87 tests | 11 | Testers | Done |
| 1a | Sink ruled, AC-116 to AC-118 appended, retraced | 12 | Steward | Done |
| 1b | The AC-116 to AC-118 files | 11 | Testers | Done |
| 2 | Shared 7.4 schemas | 04 | Implementers | Done |
| 3 | Notify module, sink, 400 mapping | 10 | Implementers | Done |
| 4 | The folders package | 03 | Implementers | Done |
| 5 | The mount, suite green | 10 | Implementers | Done |
| 6 | Shape review, four rulings | 04 | Implementers | Done |
| 6a | Email dropped, fallback hardened | 03 | Implementers | Done |
| 6b | Key-exact probe | 04 | Implementers | Done |
| 6c | Readers tightened | 11 | Testers | Done |
| 7 | Merge, 7.4 transcribed, item 20, ledger ruling | 12 | Steward | Done |

## P2S: the settings endpoints (`p2s-settings`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 1 | AC-119 to AC-123 authored, red tests | 11 | Testers | Done |
| 1a | Criteria landed, 7.2 sentence, retrace, protocol guard | 12 | Steward | Done |
| 1b | The ruled body asserted, README wording | 11 | Testers | Done |
| 2 | The PATCH body schema, the object it answers | 04 | Implementers | Done |
| 3 | The routes, the convergence, green in full | 06 | Implementers | Done |
| 4 | Shape review, the content-type finding | 04 | Implementers | Done |
| 5 | Merge: 7.0 scoped, AC-118 clarified, ratification | 12 | Steward | Done |

## P3: tasks core (`p3-tasks-core`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: trace, premise fixes, the 8.10 transaction placed in P5 | 12 | Steward | Done |
| 1 | AC-025 to AC-044, 122 tests, the P2S README refresh | 11 | Testers | Done |
| 1a | Second DELETE 404, INV-5 forcing, My Day reading, trailer fix | 12 | Steward | Done |
| 2 | Shared schemas: tasks.ts, TaskCard, TaskDetail | 04 | Implementers | Done |
| 3 | Tasks core: domain, routers, proof, wiring request | 03 | Implementers | Done |
| 3a | Temporal readers repaired, a false green closed | 11 | Testers | Done |
| 4 | The mount, the flip, live boot smoke, CI green on both legs | 10 | Implementers | Done |
| 5 | Shape review: the 7.7 and 7.8 response bodies settled | 04 | Implementers | Done |
| 6 | Merge review: held for the cap race, three findings routed | 12 | Steward | Done |
| 6a | The two routed caps put under locks, and a third found in createFolder | 03 | Implementers | Done |
| 6b | The settled bodies pinned, 7.6's narrowed refusal followed | 11 | Testers | Done |
| 6c | AC-124 appended, 11.15's PGlite bullet corrected, held for the test | 12 | Steward | Done |
| 6d | AC-124 asserted across all three caps | 11 | Testers | Done |
| 6e | Merged to main at d43434d | 12 | Steward | Done |

## P4: views and search (`p4-views`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: trace, two premises corrected, a borrowed Scheduling session | 12 | Steward | Done |
| 1 | AC-045 to AC-058 and AC-070, tests first, plus six criteria proposed | 11 | Testers | Done |
| 1a | Change control: six criteria numbered, four section 6 silences closed, three routed | 12 | Steward | Done |
| 1b | The three ruled silences transcribed onto frozen 7.0 and 7.10 | 12 | Steward | Done |
| 6a | The routed return, pulled forward: provenance, the numbers, the ruled shapes | 11 | Testers | Done |
| 2 | The date helpers of `src/server/time/**`, and Luxon 3 | 02 | Unattended | Done |
| 3 | The 7.10 envelopes, parameters, and cursor encoding | 04 | Unattended | Done |
| 4 | The views package, the EXPLAIN record, two fixtures escalated | 05 | Unattended | Done, escalated |
| 4a | Both fixtures ruled wrong, AC-131 numbered, item 21, four disclosures ratified | 12 | Steward | Done |
| 4b | The two repairs, AC-131's own file, the suite's timeout margin measured | 11 | Testers | Done |
| 5 | The mount, `explain.ts` out of the build, a global 30 second timeout | 10 | Implementers | Done |
| 4c | AC-052's second case, and the first green on both CI legs | 11 | Testers | Done |
| 6 | Shape review: no defect, the cursor settled, two sentences routed | 04 | Implementers | Done |
| 7 | Merge review: both rulings onto 7.10, held on a red leg | 12 | Steward | Held |
| 7a | `tz` onto frozen 7.8 by owner ruling, 4.7 confirmed untouched, the repair traced | 12 | Steward | Done |
| 7b | The harness carries `tz` on the pull, and AC-132 authored | 11 | Testers | Done |
| 7c | The pull dated from the carried `tz` through the same `today()` the view reads | 03 | Implementers | Done |
| 7d | `tz` carried into the contract probes | 04 | Implementers | Done |
| 8 | Merged at a52081f, AC-132 appended, green on both legs | 12 | Steward | Done |

## P5: sharing (`p5-sharing`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: trace, the 8.7 cap ruled, the 8.10 criteria routed | 12 | Steward | Done |
| 1 | AC-059 to AC-069, and AC-133 to AC-140 proposed | 11 | Unattended | Done |
| 1a | The invite transport retyped, a false green closed | 11 | Testers | Done |
| 2 | AC-133 to AC-140 numbered, the bare invite routed | 12 | Steward | Done, escalated |
| 3 | The bare invite answered 409 by owner ruling, AC-141 appended | 12 | Steward | Done |
| 4 | AC-141 asserted, the proposal wording retired | 11 | Testers | Done |
| 5 | The 7.5 and 7.3 shapes into `src/shared` | 04 | Unattended | Done |
| 6 | Suite timings and two Vitest 4 traps into `CLAUDE.md` | n/a | Co-lead | Done |
| 7 | The invites and connections package, and 8.10's steps 1 to 6 | 03 | Unattended | Done, escalated |
| 8 | AC-060's release case and AC-138's fixture repaired | 11 | Testers | Done |
| 9 | The 8.10 call swap, inside the transaction DELETE /me opens | 06 | Unattended | Done |
| 10 | Both routers mounted, the whole suite green | 10 | Unattended | Done |
| 11 | Shape review: four floors settled, the email asymmetry decided | 04 | Unattended | Done, escalated |
| 12 | Pre-merge: gate measured, verdict READY, held | 12 | Steward | Done, escalated |
| 13 | Five settlements transcribed into frozen 7.5, 7.3 and 7.1 | 12 | Steward | Done |
| 14 | Merged at 11d83fe, green on both legs on the merge commit itself | 12 | Steward | Done |

## P6: recurrence engine (`p6-recurrence`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: trace, the grammar placed by file, the cutoff escalated | 12 | Steward | Done, escalated |
| 1 | The cutoff ruled and transcribed, `actor.tz` bound in 8.5 | 12 | Steward | Done |
| 2 | AC-071 to AC-082, two absence criteria made to discriminate | 11 | Testers | Done, escalated |
| 3 | AC-142 and AC-143 numbered, UNTIL and the month zoom ruled | 12 | Steward | Done |
| 4 | Proposal wording retired, AC-082's week-start prose corrected | 11 | Testers | Done |
| 5 | The engine: grammar, iterator, generation, projection, G-SERIES | 02 | Implementers | Done, escalated |
| 6 | The grammar wired into 7.6's two write bodies | 04 | Unattended | Done |
| 7 | Generation in the winning branch, the guard ahead of restore | 03 | Unattended | Done, escalated |
| 8 | Q3C's virtual arm, fetched separately from the real rows | 05 | Unattended | Done, escalated |
| 9 | Both defects repaired, the count helper made to fail loudly | 11 | Testers | Done |
| 10 | Shape review: the envelope companions and the ghost pinned | 04 | Review | Done, escalated |
| 11 | Merge review: the bullet ruling, items 22 to 24, held | 12 | Steward | Done |
| 12 | Merged at 02f467f, green on both legs on the merge commit itself | 12 | Steward | Done |

## P7: reminders (`p7-reminders`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: trace, the fifth trigger given to Security, item 25 recorded | 12 | Steward | Done, escalated |
| 1 | The 7.9 response body ruled by the owner and transcribed | 12 | Steward | Done |
| 2 | AC-083 to AC-090, the DST claim split into arithmetic and policy | 11 | Testers | Done, escalated |
| 3 | The past-instant qualifier, AC-144 to AC-154, the scheduler seam | 12 | Steward | Done |
| 4 | Numbering retired, two stale 7.9 quotations refreshed, AC-154's test | 11 | Testers | Done, escalated |
| 4a | The `fired_at` clearing widened to both terminal states | 12 | Steward | Done |
| 5 | The engine: both DST rules by hand, the five-trigger callable | 02 | Implementers | Done, escalated |
| 5a | The `due_time` cascade ruled on both arms into 8.4 | 12 | Steward | Done, escalated |
| 5b | The mirror clause onto frozen 7.6 by owner ruling, AC-164 assigned | 12 | Steward | Done |
| 6 | The 7.9 bodies, and 7.6's last deferred arm | 04 | Unattended | Done, escalated |
| 7 | The reminder endpoint, four trigger call sites, the 8.4 cascade | 03 | Unattended | Done, escalated |
| 8 | The fifth trigger, at the login sync and PATCH /me | 06 | Unattended | Done, escalated |
| 9 | The 11.7 pass, Q11, Resend, heartbeat, session pruning | 10 | Unattended | Done, escalated |
| 9a | Two unreachable derived values, AC-086's fixture, AC-164's test | 11 | Testers | Done |
| 9b | The `fired_at` clearing asserted from both terminal states | 11 | Testers | Done |
| 10 | Shape review: 7.9 on the wire, and 8.5's copy defect found | 04 | Review | Done, escalated |
| 10a | The rule stated once in 8.6, AC-168 numbered, five writers measured | 12 | Steward | Done |
| 10b | AC-168 written red, the email counting scoped per actor | 11 | Testers | Done |
| 10c | The copy writes the state its instant earns, `at` threaded through | 02 | Implementers | Done |
| 11 | Merge review: four disclosures ratified, the fourth skip into 8.6, a retrace error corrected | 12 | Steward | Done |
| 12 | Merged at 2bda626, green on both legs on the merge commit itself | 12 | Steward | Done |

## P8: the web client (`p8-client`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: tests-first held, routes and addressing into 9.1, the Playwright seam split | 12 | Steward | Done |
| 1 | The Playwright runner and the Tailwind 4 toolchain, the fifth CI leg armed | 10 | Implementers | Done, escalated |
| 2 | AC-091 to AC-100 as browser specs, twelve criteria proposed, one self-repair | 11 | Testers | Done, escalated |
| 3 | The twelve numbered, three silences closed, eight controls named, items 26 and 27 | 12 | Steward | Done, escalated |
| 4 | Two files renumbered, provisional language retired, nine locator families to strings | 11 | Testers | Done, escalated |
| 4a | The page sections named as regions | 12 | Steward | Done |
| 5 | The shell: routing, the data layer, page states, PWA, the conventions ledger | 07 | Shell | Done, escalated |
| 6 | The component set, and a token file that says it is provisional | 08 | Unattended | Done |
| 7 | 9.3's form, 9.9's overlay and Q3C's grid | 09 | Unattended | Done |
| 8 | The four owed surfaces closed, a title kept out of the addressing namespace | 07 | Unattended | Done |
| 9 | The 10.6 PWA layer landed, the guard retired, the browser leg given room | 10 | Unattended | Done |
| 10 | AC-100's deploy made real on disk, eight fixture collisions repaired, a ninth found | 11 | Testers | Done, escalated |
| 11 | main merged down, seven conflicts kept both, section 12 reconciled to 168 by count | 12 | Unattended | Done |
| 12 | Seven carried items ruled, AC-169 to AC-172 numbered, item 28 recorded | 12 | Unattended | Done |
| 13 | AC-169 to AC-172 written, AC-162 rescoped to the new region, two confirms added | 11 | Testers | Done |
| 14 | The reminder write arm on both paths, the header named, the cookie guess dropped | 07 | Implementers | Done |
| 15 | Eleven server reads sequenced behind the writes they measure, four of them false greens | 11 | Testers | Done |
| 16 | The foundation transcribed whole, three components onto its vocabulary | 08 | Implementers | Done |
| 17 | The type scale onto pages, the landing copy ruled, the manifest colours | 07 | Implementers | Done, escalated |
| 18 | Merge review: main merged down, six items ruled, the colour dot ruled P8's and numbered AC-173 | 12 | Steward | Done, escalated |
| 19 | AC-173 written red, three cases, a positive control added when one compared vacuously | 11 | Testers | Done |
| 20 | The colour dot drawn from `my_color`, one file, `tokens.css` unmoved | 07 | Implementers | Done |
| 21 | Merge into main at 6de5dd7: the two readings ruled, Inbox included, the inline colour ratified | 12 | Steward | Done |

## P8D: the design port (`p8d-design`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 0 | Kickoff: 11.13 rewritten, item 30 held open with its reason, item 31's routing landed at P9, the dependency set ruled, mobile packaged as item 32, the human review made a precondition as item 33 | 12 | Steward | Done, escalated |
| 0a | Change control: the pages given two sessions, five non-ports named including the sidebar brand header nobody had noticed, the brand assets and the motion values assigned, item 32 ruled desktop-first, item 34 recorded, the findings return scheduled | 12 | Steward | Done |
| 1 | The foundation: the layout layer and the motion values, the seven components restyled, the vocabulary indexed for the four sessions after it, and the browser leg's false red diagnosed to a database seam rather than to load | 08 | Implementers | Done, escalated |
| 2 | Shell and layout: the fixed shell measured at 256 and 1120, the top bar keeping all three controls section 9 gives it, the locked mark and the approved icons. Reported red at 95 of 97 rather than green, the cause diagnosed to a clip in role 08's menu panel and routed | 07 | Implementers | Done, escalated |
| 2a | The six list pages and the four shared states, the skeleton and the contextual empty icon arriving without one page changing to get them, and row 4's three routed attributes applied to the toast region. Found the switch treatment inexpressible against a native checkbox and recorded it rather than working around it | 07 | Implementers | Done |
| 2b | The seven management and public pages, the switch applied to both its consumers, and the folder page held to 9.6's three sections against DES-062. Declined two things section 9 does not name and recorded both rather than skipping them quietly | 07 | Implementers | Done |
| 3 | The form, the calendar and the search overlay against his screens, on session 1's vocabulary, with the week start ruled Monday | 09 | Implementers | Superseded, never ran |
| 4 | Pulled forward ahead of 2a on the co-lead's routing, a red gate being a thing three sessions must not inherit. The clip fixed as a modifier rather than on the base class, which is what kept the top bar's own menu from silently dropping below the fold; two names minted, two reuses ratified; the gate back to 97 of 97. The P4 row 6a shape, where a later row runs early and keeps its address | 08 | Implementers | Done, escalated |
| 4a | Pulled ahead of 2b, the switch treatment 2a could not express blocking Settings on the same native checkbox: one treatment keyed on `:checked` replacing the unusable pair, an icon rule on the two heading classes, the truncation notice's register ratified as the weaker of two ratifications and said so, and the vocabulary index brought up to date. Reported one unreproduced failure on the Postgres leg rather than smoothing it over | 08 | Implementers | Done |
| 4b | Contingency: whatever names 2b and 3 find missing. Run only if asked for, recorded as skipped otherwise | 08 | Implementers | Superseded, never ran |
| 5 | The built pages reviewed against the running prototype. Required by spec 13 item 33 | owner | not a session | Superseded by the review of 2026-08-13 |
| 5a | The review's findings returned to the persona owning each surface | 07, 08, 09 | Implementers | Superseded, never ran |
| 6 | Merge review, then merge | 12 | Steward | Superseded, never ran |

**This package was stopped on 2026-08-13 and is not merging as built.** The owner opened
the designer's prototype beside the built client and rejected the result. Six sessions had
executed the row exactly as written and the row was wrong: RFC 0001 generalised a narrow
ruling about component provenance, twenty of the designer's `components/ui/` files against
our seven, into "his pages are read and never copied" for the whole package, on the ground
that his screens run on fixtures rather than our query layer. That ground argues against
copying his data wiring and not against taking his visual composition, and the difference
is the package. What shipped wears his colours, type and spacing over compositions that are
not his: his landing screen is 451 lines with a hero and a product preview, ours was a 24px
heading and a bullet list.

Two process facts are worth more than the rows above. **Nobody ran the prototype.** Not the
kickoff, not the audit, not one of the six sessions; every one of them read his files and
none of them opened his application, in a package whose entire subject was appearance. And
**every session did what it was told**: the failure is in the instruction, which the co-lead
wrote six times without challenging it. The rows stay because they are what happened.

The replacement is RFC 0002, below, on the same branch. The token, component and shell work
above is superseded by it; the documentation the package produced is not, and stands:
11.13's rewrite, section 13 items 32 to 34, and `CLAUDE.md`'s two measured machine traps.

## P8R: the UI replacement (`p8d-design`)

P8R is the identifier, kept as the co-lead named it: the row it replaces is P8D's, the
branch is the same, and a third letter would buy nothing a reader of two tables does not
already have. Row R0 has run. Rows R1 to R12 are RFC 0002's implementation plan, which
is the authority on them and which the RFC's own table carries in full with its
dependencies, its owners and its file boundaries; they are reproduced here in one line
each, as a forecast and the operator's, revised whenever a session's findings revise the
plan. They differ from the forecast R0 replaced in three ways, each traceable to what R0
measured: the copy sweep at R11 is new, R3 gains the role corrections beside the
relabelling, and every row now runs the prototype before it writes anything.

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| R0 | RFC 0002 authored as a Draft at `docs/rfcs/0002-client-ui-replacement.md`, with both applications run first: the section 9 delta, the calendar off 11.4, the dependencies approved, three criteria rewritten, AC-174 to AC-183 and items 35 to 37 numbered provisionally, items 27 and 30 closed | 12 | Steward | Done, three research claims corrected |
| R0a | RFC 0002 accepted by the owner on 2026-08-13, both open questions closed: the landing's em dash takes a comma, and item 33's visual review stands unwaived. All thirteen numbers final and none moved from provisional | 12 | Steward | Done |
| R1 | The thirteen criteria written red, taking the browser leg from 97 cases to 135. Corrected its own copy helper after measuring that `getByText` already refuses the split it was written to catch, and escalated ten controls section 9 does not name | 11 | Testers | Done, escalated |
| R2 | The dependencies with `@base-ui/react` pinned exactly, the designer's token file replacing ours, and his twenty primitives. Found the 1180px floor entering the built CSS from its own prose, Tailwind scanning markdown, and found his self-hosted font never loading in his own prototype | 08 | Implementers | Done, escalated |
| R3 | His seven presentational components, seven control names corrected against 9.1 and 9.5, the folder row rebuilt as a link, and 9.1's failed-read line restored over the toast string he used | 08 | Unattended | Done, escalated |
| R4 | `parts/presenters.ts` and its 54 unit tests: the due label, the overdue rule read through `todayInBrowserZone()` alone, and initials. None of his three client-side orderings ported, 7.11 forbidding a rule found only in the client | 07 | Unattended | Done |
| R4a | Inserted: eleven controls named into 9.1's table, 9.8's unreachable People invite list struck with AC-172's third clause, and 9.4 given the sentence that a row opens its task on any page and any status. Returned the RFC to Draft, all three amendments touching the delta | 12 | Steward | Done, escalated |
| R4b | The owner re-accepted all three amendments on 2026-08-13; the no-numbers-move claim confirmed by hashing the plan rather than by reading it | 12 | Unattended | Done |
| R4c | Four control names corrected against the amended table, two beyond the two it was sent for, both the same fault: an accessible name interpolating the object it acts on | 08 | Unattended | Done |
| R5 | His shell and sidebar on our router, the top bar retired on the owner's ruling: six criteria green, nothing regressed, the browser leg 103 to 109 | 07 | Unattended | Done, escalated |
| R6 | His six list screens on our view hooks through the presenters. Closed four and opened eleven, and reported the leg one worse than the run started rather than rounding it | 07 | Unattended | Done, escalated |
| R6a | Three one-line defects in `task-row.tsx` freeing all seven cases R6 routed, the leg 102 to 109. Proved three was the number by listing every label-addressed field against every `aria-label` in the file, and reported its own criterion AC-096 still red rather than claiming done | 08 | Implementers | Done, escalated |
| R6b | Ten cases corrected against the re-accepted text, each reported in the three-part form the co-lead required because the check that normally follows a tester was skipped: what it asserts, what it now addresses, why it fails today. Six closed, two opened with named owners | 11 | Unattended | Done, escalated |
| R7 | His task form, the largest file in the package: the sheet, the date picker, 9.3's dependency graph, steps, the invite row, the history block, the completion control. Eight closed, none opened | 09 | Unattended | Done |
| R8 | His search overlay, and the folder page as one open list with its filter and the sharing panel. Four closed, none opened | 09 | Unattended | Done |
| R9 | His calendar grid with the grid roles his prototype never had, and FullCalendar removed from the manifest, the lockfile and the tree | 09 | Unattended | Done |
| R10 | The landing with his copy and preview panel, the invite gate, and the folder dialogs. Seven closed, none opened, taking the leg to one red | 07 | Unattended | Done, escalated |
| R11 | The copy sweep, pinned at the one directory that owns it. Found an eleventh copy fault beyond the RFC's table of ten | 08 | Unattended | Done, escalated |
| R11a | The last red closed: 9.5's "Mark as not done" given back to the task row's completion checkbox, which 9.1's names table, 9.4's row elements, 9.3's confirming control and the designer's own measured Done screen had all already agreed on. The leg reaches 136 of 136 | 07 | Implementers | Done |
| R12 | The visual review, still a merge precondition under spec 13 item 33, then the findings returns, then the merge review | owner, then each surface's persona, then 12 | mixed | Ready |

## P9: hardening (`codex/p9-hardening`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 1 | Implemented the section 10.4 rate limits, the section 10.5 privacy-safe logging boundary, deletion counts, sanitized server and browser Sentry seams, AC-101 to AC-104 coverage, the shared task-limit constants, the shared database adapters, and the DES-029 comment correction. Verified 196 test files and 1,605 tests, lint, all three typechecks, the production build, and a zero-vulnerability npm audit; all work remained off `main` and production | 06, 10 | Implementers | Done, branch only |
| 2 | Created the Sentry organization and Dana project, the green Better Stack production-health monitor, the paused reminder-scheduler heartbeat, and the 30-day `dana-production-logs` Axiom dataset without exposing credentials. Production Sentry, heartbeat, and Axiom activation remain deliberately deferred to P10 | owner with 10 | Manual | In progress, activation deferred |
| 2a | Accepted and implemented RFC 0003 after Axiom Secure Syslog proved paid-only: Dana keeps structured stdout logs and can mirror the same privacy-approved events directly to Axiom through its official Pino transport when both scoped environment settings are present. Verified the final branch with 197 test files and 1,612 tests, lint, all three typechecks, the production build, and a zero-vulnerability production audit | 10 | Implementer | Done, branch only |
| 3 | Review the branch, obtain the owner decision, and only then merge and deploy | 12 | Steward | Planned |

## Outside the packages: infrastructure (`local-ci`)

| # | Session | Role | Mode | Status |
| --- | --- | --- | --- | --- |
| 1 | The runner and the collation ruled, `postgres:18` found never to have been a collation authority | 12 | Unattended | Done |
| 2 | Postgres 18 configured, the workflow moved onto the runner, the runner staged to its token | 10 | Unattended | Done |
| 3 | Merge review: the double-PGlite guard, the ceiling at 40, `lc_messages` pinned, merged at 3dc950f | 12 | Steward | Done, escalated |
