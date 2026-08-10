# Dana runbook for rfcs/0001-mvp.md

> **Audience:** the human lead, and the co-lead session he opens. This file is never
> loaded into a build session's context. It describes how to drive the build, not
> what to build.

## 1. What this is, and where everything else lives

This document is procedures for you, Hassan. It points at the documents that carry
the rules and duplicates none of them; if this file ever seems to disagree with one
of them, the pointed-at document wins, and the disagreement is a defect to fix here.

| Question | Lives in |
| - | - |
| What must Dana do | `spec/`, the single source of truth, one file per numbered section; `spec/00-index.md` is the map |
| How does the spec change | the preamble of `rfcs/0000-template.md`: the gate, numbering, statuses, the merge ritual for deltas |
| What is being built and in what order | RFC 0001's implementation plan, the only package-to-owner map |
| Who owns what | each persona's Owns section in `team/`, and nowhere else |
| What binds every agent | `team/_shared-protocol.md`: boundaries, definition of done, escalation, conventions |
| What the stack is and why | specification section 11, including the rejected alternatives |
| What Imran works from | `design/brief.md`; his outputs land in `design/` |
| How you learn along the way | `learn/`; its `000-how-this-works.md` is the tutor's contract, the ledger of what you have been taught, and the session prompt to open a tutor |

## 2. Finding out where the project stands

Your co-lead does this before it answers anything, and section 13 says where its
contract lives. When you want it yourself, derive it from artifacts exactly as the
agents must:

```bash
git log --oneline -15
git branch --list --all
cd app && npm test
```

The branch list shows packages in flight, since branches are named for packages.
The log shows what landed. The test run shows what is true. `SESSION-LOG.md` shows
which sessions produced it. If you want the reasoning done for you and no co-lead is
open, a dispatcher session (role 13) turns the same artifacts into "startable,
blocked, assigned".

Never trust a memory of where things stood, including your own.

## 3. The shape of the work

Five session types, each opened with the template in section 5:

- **Tester**: writes a package's acceptance tests, before any implementation exists.
- **Implementer**: makes those tests pass, forbidden from editing them.
- **Steward**: reviews and merges a finished branch; also opened on demand for any
  escalation.
- **Dispatcher**: computes what is startable. Optional; use it when you are unsure.
- **Probe**: attacks a package beyond its numbered criteria, when you are suspicious.

**The unit of progress is the triple: tester, then implementer, then Steward merge.**
One package, three sessions, in that order (P0 alone inverts tester and implementer;
section 7 says why).

**What to do first, literally:** open the P0 scaffold session (role 10). When it
finishes, the P0 migrations session (role 01) on the same branch, then the P0 tester
session, then the Steward merge. **P0 is the only package that takes two implementer
sessions**, because its deliverables span two owners: the scaffold, tool config, CI,
boot file, and health route are Platform's, and the migrations, seed, and database
seam are Data's. Platform goes first; migrations cannot run before the scaffold that
runs them exists. From P1 onward a package is one implementer, and the triple holds.

How many sessions at once, phase by phase for RFC 0001:

| Phase | Packages | Shape |
| - | - | - |
| Foundations | P0, then P1 | one session at a time; these set every convention |
| Backend core | P2, then P3 | serial, because role 03 owns both |
| Fan-out | P4, P5, P6, then P7 | up to three implementer tracks in parallel (roles 05, 03, 02), each track preceded by its tester; P7 follows P6 because role 02 owns both |
| Client | P8 | role 07 (shell and pages) first; roles 08 and 09 in parallel after; integration continues as backend packages land |
| Hardening and release | P9, then P10 | serial |

The P8 shell can start any time after P0 lands, as a second track alongside the
backend phases, since it depends only on the scaffold and the frozen contract. Its
component fidelity work additionally waits for Imran's committed screens (section 4).

Two rules cap the parallelism: never two sessions writing in the same path area
(ownership makes this structural, but you are the one who can accidentally open two
implementers for one package), and no more than three live working sessions,
because you are the merge queue, the escalation reader, and the only human.

### Which model each package needs

Two levels, because your access to the stronger model is limited and spending it
everywhere wastes it. **Hard** means the acceptance tests cannot fully catch a wrong
implementation, or the work sets conventions everything downstream inherits.
**Normal** means the specification is precise enough that a good model plus failing
tests converges, and a mistake shows up as a red test rather than as a silent defect.

| Package | Level | Why |
| - | - | - |
| P0 | **hard** | The one session with no prior art in the repository to imitate, and every convention it sets is inherited by all ten that follow. The 11.15 hazards land here first, and the database seam decides whether testing works at all |
| P1 | **hard** | Security code with no human reviewer. AC-105 to AC-115 test what they can, but a missing nonce check, a reused session identifier, or a subtly wrong PKCE exchange can pass a suite and still be a hole |
| P2 | normal | The permission matrix and CRUD are transcription from sections 5.4 and 7.4; R-CLEAN's edges are pinned by AC-016 to AC-021, including the double-add race |
| P3 | normal | The longest package, not the hardest: every rule is precisely specified. Budget for resumption (section 6) rather than for difficulty |
| P4 | normal | Orderings transcribe from section 6, and AC-070's property test is a real safety net under the partition |
| P5 | normal | The invite lifecycle is a state table and the acceptance transaction is ordered steps; the awkward cases are already enumerated in 8.7 |
| P6 | **hard** | The one algorithm this project chose to write rather than install: floating-date recurrence, UNTIL inclusivity, the G-SERIES guard, and projection that must never draw a series twice |
| P7 | **hard** | Daylight-saving gap and overlap resolution, five recompute triggers, and exactly-once delivery under races. Timezone arithmetic is where confident models are confidently wrong |
| P8 | **hard** for the calendar, task form, and search (role 09); normal for the shell and pages (07) and the component set (08) | FullCalendar 7's entrypoints and the cell-order comparator are flagged in 11.15 as needing a spike; the task form's dependency graph is a state machine. The rest is well-trodden React |
| P9 | normal | Rate limits, redaction, and the limits sweep are mechanical, and the authorization probe is the check |
| P10 | normal | Configuration, dashboards, and DNS, most of which is your own track in section 4 |

Two rules for the sessions around a package:

- **A tester inherits its package's level.** Writing acceptance tests for recurrence
  demands the same understanding as implementing it; a weak test suite on a hard
  package is worse than none, because it manufactures false confidence.
- **A Steward review runs at normal**, whatever the package, with one exception: when
  it is packaging a frozen-interface decision for you (section 11), the reasoning
  matters more than the review, so use the stronger model.

## 4. Your own track: work only you can do, on lead times

Everything in this section fails the same way: discovered at the moment it blocks,
with a lead time no session can compress. Start each item when its trigger fires,
not when its package needs it.

| Item | Needed by | Start no later than | Done when |
| - | - | - | - |
| Send Imran the design brief (`design/brief.md`) and agree the two review rounds | P8 fidelity work | the day P0 starts | he confirms scope and a first-pass date |
| Google OAuth client: Cloud project, consent screen (External, publish to production; openid, email, profile only, so no verification review), client id and secret, localhost redirect URI | P1 manual verification; production later | while P0 runs | id and secret in your local `.env`; sign-in round trip works once P1 lands |
| Domain registration | Resend DNS records, the production URL, the OAuth production redirect | while P0 runs (everything DNS hangs off it) | domain resolves at the registrar |
| GitHub branch protection: require green CI to merge into main | every merge from P0 onward | the day P0's CI lands | a red branch cannot be merged, even by you |
| Render account: web service plus Postgres 18 (paid tier from day one, spec 11.11), GitHub connected, environment variables set | first deploy; deploy problems surface early only if this exists early | when P1 merges | `/api/health` returns 200 at the Render URL |
| Resend account, domain authenticated: SPF, DKIM, DMARC records at your DNS; propagation can take up to 48 hours | P7 delivery | when P3 starts | Resend dashboard shows the domain verified; API key in Render and `.env` |
| Better Stack account: uptime monitor on `/api/health` plus one heartbeat (its URL is an environment variable the scheduler pass pings) | P7 delivery | when P6 starts | a test ping shows green in the dashboard |
| Sentry account and DSN | P9 (AC-104) | when P8 is underway | DSN in Render and `.env` |
| Log drain choice and account (spec 11.12: candidates Axiom, Better Stack Logs; must hold 30 days) | P9 | when P8 is underway | drain connected; a log line from production is visible in the store |
| Google account deletion policy text read (spec section 13, item 2) | P10 launch review | during P9 | you have confirmed nothing beyond 8.10 is mandated |

**The Imran loop, end to end.** He receives `design/brief.md` and nothing else; it is
self-contained. He works in his own Figma and returns three things per the brief: a
foundations page (tokens, folder swatches, app icon, theme colors), PNG exports per
screen at phone and desktop widths, and a short notes file. You commit them: PNGs to
`docs/design/screens/`, notes to `docs/design/notes.md`, and the foundations page
exported alongside them. Getting token values into code is then agent work: role 08
transcribes them into the tokens file during P8. Agents read `docs/design/` and never
write it. Round two is feedback on the built pages against his screens; disagreements
about structure or copy are not design questions, they go to the Steward, because
section 9 wins.

## 5. Opening a session

Every working session is a Claude Code session opened in the repository root. The
repository's `CLAUDE.md` loads automatically; everything else the agent needs is in
the repository, so you never paste documents, you name them. One session, one
persona, one assignment.

**Writing the prompt is your co-lead's job**, and the skeleton it fills lives in
`co-lead.md` rather than here, so that exactly one copy of it exists. What you
contribute is everything around the prompt: the right chat, the right model, and the
discipline below.

**Which chat.** Three per package, named for the branch: `<branch>-testers`,
`<branch>-implementers`, `<branch>-steward`. Every session of a package returns into
one of those three, and returning to a chat is normal. A specialist graded hard may
earn a fourth of its own. A package kickoff opens the new package's steward chat,
because a package boundary empties the working set.

**What never goes into a session:** a second persona (an agent with two personas has
no boundary); a summary of a previous session (state comes from artifacts, and
summaries are how wrong beliefs survive); this runbook or `co-lead.md` (they describe
the coordination around a session, not its scope); and secret values of any kind,
which live in `.env` and the platform dashboards.

**Then let it read.** A session that starts writing before it has read its two files
is already off-protocol; say so once, and if it persists, close it and start over.
Sessions are cheap. Wrong premises are not.

### Grouping consecutive sessions

A group is one prompt you paste once that runs several sessions back to back with
nobody in between. It buys round trips and costs the verification that would have
happened between them, so the rule is about which sessions may share a run, never
about how many.

**The key is the review relationship, not the chat name.** Two sessions may share a
run only when neither reviews, verifies, or tests the other's output. "Implementers"
is a chat and not a role: it hosts the API role's endpoint shape review directly
after the Collaboration role's package, and those two must never share a run,
because the review's whole value is that it reads the package cold. The same bar
excludes a tester from the group that implements what it tested, and excludes a
Steward review from the group it reviews. What passes the bar is a producer-consumer
chain running one way (shared schemas, then the code importing them, then the query
embedding it) and a Steward pair that rules and then transcribes.

**Prefer a fresh context per session inside the group.** The grouped prompt's parent
launches each session as its own isolated sub-agent, in sequence: it derives state
from the repository per protocol section 2, writes only inside its persona's paths,
commits, pushes, appends to the run's one report file, and ends. No context then
holds two personas, which is the rule above and the reason for it. Running the
personas inside a single context does work, and P5's last four sessions did exactly
that, but the recorded cost is that the Steward pass reviewing three same-context
phases was one line of reasoning agreeing with itself. Reach for it with a reason,
not by default.

**A hard package's algorithm session runs alone.** Section 3 grades every package,
and where the grade is hard, the session carrying the algorithm is grouped with
nothing. P6's engine is the case in point: the recurrence iterator is the one
algorithm this build writes rather than installs, and grouping it with the sessions
that consume it puts its first independent reader downstream of its own mistakes.

**What a group owes you:** one report file naming every problem and every escalation
by phase, a commit per phase so CI attributes a failure to the session that caused
it, and a full stop before anything irreversible, which always includes the merge.

## 6. Closing a session

**Read the final block before anything else.** An escalation you did not read is a
decision you silently dropped. If the word ESCALATION appears, section 11 tells you
what happens next.

**Then hand the block to your co-lead**, which verifies it against the repository
rather than believing it: branch state, the boundary diff against the persona's owned
paths, the full gate re-run, and the reported counts reconciled against real ones.
That checklist lives in `co-lead.md`, because that is the role performing it.

What stays in your own hands is one git write: if a session died with uncommitted
work that compiles, commit it yourself with a `wip:` subject.

**Resuming a package after a session runs out of context** (P8 will): open a fresh
session, same persona, same branch, and say that the package is partially complete
and its state comes from the branch diff and the failing tests, never from a summary.
Continuity lives in the branch. Commits state facts, and micro-decisions worth
keeping were recorded in their proper artifact, a why-comment, a spec deviation, a
section 13 note, precisely because the next session will not read the old session's
chat. A session running low should be told to commit what compiles and end cleanly.

## 7. Tests come first

For every package from P1 onward, the tester session runs before the implementer
exists, writes the package's numbered criteria as failing tests on the package
branch, and ends. The implementer then works on the same branch until the gate is
green, and never edits `app/tests/`.

The reason is anchoring: a tester who can read an implementation tests what the code
does; a tester who can only read the specification tests what the section says. The
order is what makes role 11's independence real rather than nominal.

**Check the red is the right red.** Before the implementer starts, the tester's
suite should fail on assertions and missing behavior (404s, missing modules), not on
a broken harness. A suite that errors instead of failing is not a specification yet.

**P0 inverts the order, once.** The scaffold the tester needs (Vitest, the database
seam, the harness entry) is itself part of P0, so P0 runs implementer first, tests
immediately after, and merges only when AC-001 to AC-004 pass.

**When an implementer disputes a test**, the protocol already rules: it never edits
the test; it escalates with both readings. The Steward settles it, or routes it to
you if the dispute is really about the specification (section 11).

## 8. The merge ritual

The Steward runs per package branch, at merge time, and on demand for escalations.
There is no scheduled Steward: main only changes at merges, so any other moment
reviews a moving target.

Open a Steward session with the template. What it checks is its persona's business
(match to claimed sections, boundary compliance, conflicts, the gate in CI order,
dependency-addition review); what you enforce around it:

- A branch merges only through a Steward session. You never merge by hand, and
  branch protection (section 4) means a red branch cannot merge at all.
- **Who pushes:** a working session pushes its own branch, because CI runs on push
  and an unpushed branch is a branch the gate has never seen. The Steward pushes
  `main` after it merges. Neither is your hands, and neither is optional: an
  unpushed merge is a release that only exists on this machine.
- Two branches touching adjacent seams merge one at a time, full suite between.
- The changelog entry lands before the merge, not after.
- A merge that would change the schema (section 4) or the API (section 7) does not
  happen on anyone's authority but yours, ever.

After the merge, delete the branch, and glance at the deploy: main deploys to
Render automatically, and `/api/health` should show the new version within minutes.

## 9. When something breaks

One triage question decides everything: **does the code disagree with the
specification, or does the specification disagree with reality?**

**Code disagrees with spec** (the numbered section says X, the running system does
Y). This is a bug, and the fix starts with a test, never with the fix:

1. Probe or tester session (role 11) writes the failing test on a branch named
   `fix-<slug>`, citing the violated section, and if the gap maps to an existing
   criterion, its number.
2. Implementer session (the persona owning the violated section) makes it pass on
   the same branch.
3. Steward merges.

Role 11 always writes the failing test, including for bugs you found yourself. An
implementer who writes the test that defines its own bug fix is grading its own
homework with extra steps.

**Spec disagrees with reality** (the section is wrong, unimplementable, or built on
a false external fact). This is never fixed by making the code diverge:

1. Steward session packages the problem: section, both readings, options,
   recommendation.
2. If the fix changes behavior, it is an RFC (the template preamble's gate decides;
   frozen interfaces make it your decision unconditionally). If it corrects a
   recorded external fact, it is a spec amendment with a section 13 update, and the
   Steward handles it.
3. Only after the spec changes does an implementer touch the code, on a branch,
   against the amended text.

## 10. When an agent goes wrong

Blocked agents are the protocol's problem and solve themselves by escalating. This
section is for the other kind: confidently wrong.

**Detection is mechanical, not intuitive:**

- Boundary violation: the section 6 diff command against the persona's Owns section.
- False green: your own gate run plus the tester's suite. The suite is the
  authority; an agent's claim that disagrees with it is simply false.
- Green suite, lingering doubt: open a probe session. That is what role 11's
  adversarial mandate is for, and it costs you one session to be sure.

**The response doctrine: kill and restart, never persuade.** An agent defending its
work in-context has its error in its premises, and argument feeds the premises back
to it. Close the session. Discard out-of-boundary edits by restoring those files
from main. Open a fresh session of the same persona against the branch; if the same
wrongness recurs, the problem is not the agent, it is an ambiguity, and it goes
through section 9's spec-disagrees path instead.

## 11. What reaches you, and how

Five things are yours and cannot be delegated down:

1. Changes to the frozen interfaces: specification sections 4 and 7.
2. Accepting or rejecting an RFC (the Steward records; you decide).
3. Releases: the go decision and the version number.
4. Product conflicts the Steward cannot settle (two packages needing incompatible
   things).
5. Acceptance-criterion disputes at the specification level.

Everything else stops at the Steward.

**The mechanism:** every session ends with a structured final block (the template
demands it), and escalations arrive there under the literal heading ESCALATION,
with the section, the options, and a recommendation. The Steward is the funnel:
other roles escalate to it; only its final blocks route decisions to you. The
companion rule from section 6 is what makes this reliable: never close a session
without reading its final block.

**When you want a new feature**, you are the author and the process is already
written: the preamble of `rfcs/0000-template.md`, starting with its gate. Open any
session to draft the RFC with you; the decisions that stay yours along the way are
acceptance, anything touching a frozen interface, and the target release.

## 12. Shipping, and the calendar

**The release ritual**, once P10's criteria are the only thing left:

1. Preconditions: every package merged, CI green on main, and the production smoke
   subset green (health, auth round trip, one CRUD cycle).
2. You pick the version. 1.0.0 first; after that, behavior additions bump the
   minor, fixes bump the patch, and the RFC that carried the change names its
   target release.
3. A Steward session does the bookkeeping in one pass: moves the changelog's
   Unreleased section under the version and date, flips the RFC's status per the
   template preamble (for later RFCs, folding the delta first; RFC 0001 has none),
   tags `v<version>`, pushes.
4. Watch the deploy, check `/api/health` reports the new version, run the smoke
   subset once more against production.

**The calendar.** Everything recurring, in one table; put these in your actual
calendar today:

| Ritual | Cadence | Time | Done when |
| - | - | - | - |
| Restore drill: PITR into a scratch instance, run the constraint catalog test against it, destroy it | quarterly | 30 to 60 minutes | catalog test green against the restored copy |
| Off-platform backup: `pg_dump` to your local disk, dated | monthly | 10 minutes | dump file exists and opens |
| Resend dashboard: bounces and complaints | monthly | 5 minutes | zero unexplained bounces |
| Better Stack alert | when it fires | varies | cause identified; monitor and heartbeat green again |
| Dependency updates | none scheduled in v1 | none | security advisories only; anything more is process the spec did not price |

The first restore drill is not optional and not symbolic: an untested backup is not
a backup, and the Platform persona's definition of done says the same thing to the
agent that sets it up.

## 13. The co-lead, and getting it back

Everything above tells you how to drive the build. This tells you who drives it with
you, and how to rebuild them.

**The co-lead is an AI session and a persona like any other.** Its contract is
`co-lead.md`, beside this file, written in the same format as the thirteen in
`team/`: mindset, mandate, owns, first moves, boundaries, escalation. The scope is
what differs. An implementer owns a set of paths; the co-lead owns the coordination
of the whole build. It verifies every final block against the repository, decides
what happens next, writes the prompt, and keeps `SESSION-LOG.md` current. It never
writes product code, never amends the specification, never rules on a product
question, and never speaks to a build session.

**The split between you and it never moves.** You open sessions, paste prompts,
carry final blocks back, and decide everything section 11 names. It reasons. You
move.

**To open one**, or to rebuild it after losing a chat or the machine it ran on: open
a fresh session in the repository root and paste the opener at the end of
`co-lead.md`. That file is the single copy of the contract, and this section
deliberately does not restate it: two copies of a job description is how the two
start disagreeing.

**What a good first reply looks like.** It should name the package in flight, the
branch tip, the suite counts it measured itself, anything it found that disagrees
with what is written down, and the prompt for the next session. If it asks you where
the build stands instead of telling you, it skipped its First moves; say so and
point it back at its contract.

**Why the contract carries no project state.** It says how to find out where the
build stands and never where the build stands, because a contract naming the current
package is wrong the day that package merges. This project has already paid for that
lesson twice: an ownership rule that hardcoded a criterion range, and a commit
trailer that named a model. Both went stale, both were repaired by pointing at the
authority instead of restating it. `co-lead.md` is written to the same rule and
should stay that way.
