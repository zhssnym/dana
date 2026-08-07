# Running the loop unattended

> **Audience:** the orchestrator, worker, and verifier agents of an unattended run,
> and Hassan. Read `co-lead.md` first; it is the job. This file is the additional
> contract that applies when nobody is watching, and it only ever narrows what
> `co-lead.md` permits.

An unattended run advances a package while Hassan is asleep. It exists because the
loop's human-only decisions are not spread evenly through a package: measured across
P0 to P3, thirteen of sixty-two decisions were his, eight of those were text added to
frozen section 7, and they cluster at exactly two places, the kickoff and the merge
review. The body of a package between them is safe to run alone.

Nothing here weakens a rule. It adds a step cap, a halt list, and one separation that
the attended loop gets for free from Hassan reading the summaries.

## Three roles, never the same agent for two

**The orchestrator** derives state from artifacts, decides which session comes next
from the package's traced RFC row, and writes that session's prompt. It writes no
code, runs no test, and judges no block.

**The worker** is an ordinary build session: one persona, one assignment, isolated,
knowing nothing of this file or of any other session. It receives the prompt exactly
as the orchestrator wrote it and answers with a final block.

**The verifier** re-derives the worker's claims from the repository and reports clean
or not clean. It writes no prompt and decides nothing about what comes next.

The separation is the point. An orchestrator that both judges the last block and
writes the next one is grading its own reading, which is the arrangement protocol
section 8 forbids implementers and persona 12 forbids the Steward. Attended, Hassan
is the second reader. Unattended, the verifier is.

## What a run may cover

The **body** of a package: the sessions between its kickoff and its merge review.

Never the kickoff, because that is where a package's reserved question is raised and
reserved questions are Hassan's. Never the merge review, for three reasons the record
gives: it is where frozen-section transcription lands in two packages of five, it is
the only irreversible step, since it pushes `main` and deletes the branch, and it is
where the one recorded propagation happened, when a merge shipped with its
`postgres:18` authority leg unread because nothing turned "I could not check" into a
stop.

A run therefore starts only when the kickoff's reserved question is both **ruled and
transcribed into the specification**, and stops at the door of the merge review.

## Halt conditions

Halt on the first of these. Never rank them, never weigh whether one matters enough:
the 7.6 existence oracle was ranked lowest of four by the review that found it, and
the human owner took it anyway.

1. **Any escalation.** The literal heading ESCALATION in a worker's final block, or a
   finding it routes to another role, whether or not it calls itself blocking.
2. **Verification not clean.** A file written outside the persona's owned paths, a
   red gate, or reported counts that do not reconcile with a real run.
3. **The next session is the merge review**, or any session that would touch `main`.
4. **The next decision is Hassan's**: frozen specification sections 4 or 7, accepting
   an RFC, the release go or version number, a product conflict the Steward cannot
   settle, or an acceptance-criterion dispute at the specification level.
5. **A test cites a ruling the specification does not carry.** An acceptance test
   that attributes a decision to the human owner while the frozen text is silent is a
   guess wearing his signature. This has happened once, with him present.
6. **The working tree is dirty, or the branch is unpushed.** Uncommitted work is his
   hands by runbook section 6, and an unpushed branch is one CI has never seen.
7. **No CI verdict.** Absence of a reading is a halt, never a pass. Read it with the
   full path to `gh.exe` that `CLAUDE.md` records.
8. **The step cap is reached.** Three worker sessions for a first run, never more
   than six.

A halt is a success. The run stops, records why, and leaves the branch where the last
verified session left it.

## What the morning owes

Hassan reads the run's record before anything merges, and the co-lead verifies every
step again itself rather than trusting the run's own verifier. An unattended run
advances work; it does not certify it. Nothing an unattended run produced reaches
`main` without a Steward merge review that a human opened.
