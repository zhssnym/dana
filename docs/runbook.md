# Dana runbook for rfcs/0001-mvp.md

> **Audience:** the human operator running agent sessions. This file is never loaded
> into an agent's context. It describes how to drive the build, not what to build.

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

After any time away, derive state from artifacts, exactly as the agents must:

```bash
git log --oneline -15
```

```bash
git branch --list --all
```

```bash
cd app && npm test
```

The branch list shows packages in flight (branches are named for packages, like
`p3-tasks-core`). The log shows what landed. The test run shows what is true. If you
want it computed for you, open a dispatcher session (section 5); its whole job is
turning those artifacts into "startable, blocked, assigned".

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

**What to do first, literally:** open the P0 implementer session (role 01). When it
finishes, the P0 tester session, then the Steward merge. Then P1's triple, and you
are running.

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

**Before opening, know three things**, and RFC 0001's plan table has all three in the
package's own row: which package, which persona owns it (its Owner column names the
file; that persona's Owns section is the authority), and which branch (its Branch
column, for example `p3-tasks-core`). Read the row, fill the blanks, open the session.

**Which assignment line is yours** is decided by where the package is in its triple:
tester, then implementer, then Steward, one package at a time, per section 3. P0 is
the one package that inverts the first two, and section 7 says why. Dispatcher and
Probe are optional sessions, opened only when you are unsure what is startable or
suspicious of a green result; neither is part of the triple.

**The opening prompt.** Copy this, fill the angle-bracket blanks, delete the
assignment lines that do not apply:

```text
You are the <role name> for Dana. Before doing anything else, read in this order:

1. docs/team/_shared-protocol.md, which binds you.
2. docs/team/<NN-role-file>.md, which is you. Follow its First moves.

Your assignment: <one of the lines below>.

Tester:      Write the acceptance tests for package <PN> of RFC 0001
             (docs/rfcs/0001-mvp.md) on branch <branch>. The implementation
             does not exist yet; your tests must fail for the right reasons.
Implementer: Implement package <PN> of RFC 0001 on branch <branch>. Its
             acceptance tests are already on the branch and failing; make
             them pass without editing them.
Steward:     Review branch <branch> for merge into main, per your persona.
Dispatcher:  Compute the startable set, the blocked set with reasons, and
             the assignments, from your five artifacts.
Probe:       Attack package <PN> beyond its numbered criteria; report every
             break with the spec section it violates. Write nothing outside
             app/tests/.

Rules for this session:
- Work only on branch <branch>; create it from main if it does not exist.
- Commit as you go, per protocol section 7.
- If you hit an escalation trigger (protocol section 6), stop and continue only
  on what is unaffected.
- End with a final block: branch state, which acceptance criteria pass, what
  remains, and any escalations under the heading ESCALATION.
```

**What never goes into a session:** a second persona (an agent with two personas has
no boundary); a summary of a previous session (state comes from artifacts, and
summaries are how wrong beliefs survive); this runbook (its header means it: it
describes you, not them); and secret values of any kind, which live in `.env` and
the platform dashboards.

**Two variations.** For P8 fidelity work, add one line: "The committed design
artifacts are in docs/design/; section 9 wins over any image on structure and copy."
For a resumed package, add one line: "Package <PN> is partially complete on
<branch>; derive its state from the branch diff and the failing tests, not from any
summary."

**Then let it read.** A session that starts writing before it has read its two files
is already off-protocol; say so once, and if it persists, close it and start over.
Sessions are cheap. Wrong premises are not.

**The very first session, filled in.** Every blank below came from RFC 0001's P0 row:
the Owner column gave the persona file, the Branch column gave the branch, and
section 7 gave the assignment line, because P0 is the one package that starts with
its implementer. Copy this one as it stands.

```text
You are the Data and Invariants Engineer for Dana. Before doing anything else,
read in this order:

1. docs/team/_shared-protocol.md, which binds you.
2. docs/team/01-data-and-invariants.md, which is you. Follow its First moves.

Your assignment: Implement package P0 of RFC 0001 (docs/rfcs/0001-mvp.md) on
branch p0-scaffold. P0 runs before its tests exist, because the harness they
need is part of what you are building; write no acceptance tests yourself.

Rules for this session:
- Work only on branch p0-scaffold; create it from main if it does not exist.
- Commit as you go, per protocol section 7, and push the branch.
- If you hit an escalation trigger (protocol section 6), stop and continue only
  on what is unaffected.
- End with a final block: branch state, which acceptance criteria pass, what
  remains, and any escalations under the heading ESCALATION.
```

The two sessions after it, in order: the tester (role 11, same branch, "write the
acceptance tests for package P0"), then the Steward (role 12, "review branch
p0-scaffold for merge into main"). From P1 onward that order flips back to tester
first, and every later package fills the same blanks from its own row.

## 6. Closing a session

Four steps, every time, in order:

1. **Read the final block before anything else.** An escalation you did not read is
   a decision you silently dropped. If the word ESCALATION appears, section 11 tells
   you what happens next.
2. **Run the gate yourself.** Do not take green on faith:

```bash
cd app && npm run lint && npm run typecheck && npm test && npm run build
```

3. **Check the boundary.** Compare what changed against the persona's Owns section:

```bash
git diff --stat main...HEAD
```

   Files outside the persona's paths (beyond sanctioned dependency additions) mean
   section 10, not a merge.
4. **Commit any leftovers.** If the session died with uncommitted work that
   compiles, commit it yourself with a `wip:` subject. This is the one git write
   this document asks of your own hands.

**Resuming a package after a session runs out of context** (P3 and P8 will): open a
fresh session, same persona, same branch, using the resumed-package variation from
section 5. Continuity lives in the branch: commits state facts (which criteria pass,
what remains), and micro-decisions worth keeping were recorded in their proper
artifact (a why-comment, a spec deviation, a section 13 note) precisely because the
next session will not read the old session's chat. A session running low should be
told to commit what compiles and end cleanly; facts in a commit message are not a
report, they are reproducible from the branch.

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
