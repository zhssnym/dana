# Dana session log

Every agent session that has run, in the order it ran, one table per package.
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
| 18 | Merge review, and 9.1's folder colour dot, which nothing renders or asserts | 12 | Steward | Planned |
| 19 | Merge into main | 12 | Steward | Planned |