# Running the loop unattended

> **Audience:** the orchestrator agent that advances a Dana package while Hassan is
> away, and Hassan. Read `co-lead.md` first: it is the job, and this file does not
> repeat it. This is the procedure for doing that job with nobody watching, and it
> only ever narrows what `co-lead.md` permits.

An unattended run advances the body of a package. As of 2026-08-07, measured across
P0 to P3, thirteen of sixty-two decisions were Hassan's and eight of those were text
added to frozen section 7, clustering at the kickoff and the merge review. Treat
that as a reason the idea is worth trying and never as a guarantee: P4's own
mid-package change control ran between sessions 1 and 2, closed four section 6
silences, and routed three frozen section 7 questions to him, all in the body. The
body of a package is not decision-free. `SESSION-LOG.md` and `CHANGELOG.md` carry
the current shape; this paragraph is dated because it will go stale.

## The shape: strictly linear, one agent at a time

Exactly one sub-agent runs at any moment. Never two. Not two workers, not a worker
and a verifier, not two anything. The reason is mechanical rather than stylistic:
there is one clone of this repository and one checked-out branch, and two agents
writing to it will corrupt each other's reads. This has already happened once, when
a file moved between branches under a live session and that session saw a module
absent from disk while present in HEAD.

You are the main agent throughout. You are not one of the sub-agents and you never
become one. You think, you decide, you write prompts, you read what comes back, and
you adjust nothing in the repository. You write no product code, run no build
session's work yourself, and hand nothing to a sub-agent that you have not first
put in the chat.

## Three roles, and never the same agent for two

**You, the orchestrator.** Derive state from artifacts, decide which session comes
next, write its prompt, publish it, invoke it, read what returns, record it. You
never write code and you never judge your own reading of a block.

**The worker.** An ordinary build session: one persona, one assignment, fully
isolated, knowing nothing of this file, of you, or of any other session. It receives
your prompt exactly as written and answers with a final block.

**The verifier.** A separate sub-agent, fresh for each pass, that re-derives the
worker's claims from the repository by running commands, and answers clean or not
clean. It writes no prompt and decides nothing about what comes next.

The separation is the point. An orchestrator that both judges the last block and
writes the next prompt is grading its own reading, which protocol section 8 forbids
implementers and persona 12 forbids the Steward. When Hassan is present he is the
second reader. When he is not, the verifier is, or nobody is.

## Before the run: preconditions

Do all of this before invoking anything. If any of it fails, stop and write the
record. Stopping is a success.

**1. Read.** Everything `co-lead.md`'s First moves name, all eight, in full, and
then this file. Two are the easy ones to drop and this run depends on both.
`runbook.md`, whose section 11 is the authority on the decisions that reach Hassan,
whose section 3 grades which packages need the stronger model, and whose section 7
says what a tester's red is supposed to look like. And `prompting.md`, because you
write prompts for a living and on this run nobody reads one before a sub-agent does.
Read individual spec sections on demand, never all at once.

One instruction in the runbook is not yours. Section 6 says a session that died with
uncommitted work that compiles gets a `wip:` commit, and says in the same breath
that this is the one git write that stays in Hassan's own hands. You do not make it.
A dirty tree is halt condition 6 and nothing else.

**2. Measure the tree.** Run `git fetch --prune` first, because `git status -sb`
compares against whatever this clone last heard rather than against the remote. The
working tree must be clean, and the package branch must be the branch currently
checked out, exist on the remote, and be in sync with it. Name the package and its
branch in the record before step 1. If more than one package branch exists, stop and
say which ones: the fan-out phase runs up to three tracks at once and nothing in
this file says which of them a run is for. Uncommitted work is Hassan's own hands by
runbook section 6; an unpushed branch is one CI has never seen. Record
`git rev-list --count <branch>..main`, so a base main has moved past is found now
rather than at the merge.

**3. Measure the suite.** From `app/`, never from the repository root:
`npm run lint && npm run typecheck && npm test && npm run build`. That is four
commands in CI's order, and it is the gate protocol section 4 defines. Three of them
are not the gate. `npm run build` is `vite build` followed by a second `tsc` pass, a
stricter compile than the test run, so work that lints, typechecks, and tests green
can still fail it, and the production exclusion of the dev-login module is
observable nowhere else.

Record the counts, and record the failing tests **by name** rather than only as a
total. Tests come first in every package, so the body of a package is legitimately
red, and this paragraph is the only definition of an acceptable red in this file. A
red gate is acceptable when two things hold: every failing test names an acceptance
criterion the row assigns to a session that has not yet run, and every failure is an
assertion failure or missing behavior, a 404 or an absent module, rather than a
harness error. A suite that errors instead of failing is not a specification yet,
and it is not an acceptable red. Any other red stops the run.

**4. Read CI** on the branch's tip, with the full path to `gh.exe` that `CLAUDE.md`
records. List runs with `--json databaseId,headSha,headBranch,status,conclusion` and
match the sha yourself, because `--commit` returns nothing on this machine. A queued
or in-progress run is not a verdict: wait for it to conclude, up to fifteen minutes,
and stop if it has not. Absence of a verdict is a halt, never a pass.

Because the body of a package is red by design, record the baseline rather than the
colour: which leg failed, and which tests failed on the `postgres:18` leg
specifically. That leg is the production-fidelity authority, the local default is
PGlite, and the two have diverged twice in this build in ways no local run could
show.

**5. Check for a fabricated ruling.** Read the frozen sections as the branch carries
them and not as `main` does, because transcribing an owner's sentence onto a frozen
section before the merge is what a package in flight legitimately does, and reading
against `main` would halt every healthy run. Then require two things of every
acceptance-test header that cites an owner ruling or an authority: the sentence it
relies on exists in the section it names, and the ruling is recorded in
`CHANGELOG.md`'s Unreleased section with the owner named and the date. A citation
that fails either test is a fabricated ruling, and so is a claim about who holds an
authority that the document it cites does not carry. This has happened once, with
him present.

An instance already found, recorded, and assigned to a session does not clear this
condition. It stops the run just the same, and the record names the session the row
assigns to fix it. The harm is not that the header is untidy; it is that a later
session reads it and treats an invented ruling as settled.

**6. Find your position.** From the package's traced RFC row and the branch's own
commits. `SESSION-LOG.md` is context and never evidence: its own header says so, and
a planned row is not an assignment. Where the row and the branch disagree, the
branch wins and you say so in the record. If the row is not traced, the kickoff has
not run and the session order does not exist yet, so stop: deriving it yourself is a
Steward act. If the next session is the kickoff, the merge review, or anything
needing a decision reserved to Hassan, stop.

**7. Set the cap.** Three worker sessions, unless a previous unattended run on this
repository ended without a halt, in which case up to six. Only a sub-agent invoked
at step 6 counts against it; a pass that halts before step 6 does not. Set a
wall-clock end time as well, and do not start a step you do not believe can finish
before it.

**8. Open the journal.** Create the run journal at a fixed path outside the
repository and name that path at the top of your first output, so Hassan can open it
mid-run without asking anyone. The journal is defined below.

## The cycle

Repeat until you halt or the cap is reached. One pass of this cycle is one worker
session and nothing more.

### 1. Derive state, from artifacts and never from memory

`git log --oneline`, `git status -sb`, and the gate from `app/`, all four commands of
precondition 3. What is the branch tip? What do the counts read, and which tests are
failing by name? What did the previous pass actually land, as opposed to what its
block said it landed? Your own summary of the last step is not evidence.

### 2. Identify the next session

From the package's traced RFC row, and the branch's commits. The row is the plan;
the branch is the truth; where they disagree, the branch wins and you say so.

**A finding this run produced is never yours to route.** It ends the run under halt
condition 1, whatever the block calls it and however obvious its owner looks. The
only session you may invoke is one the row already carried before the run began.

### 3. Decide whether to continue at all

Run the halt list below. If any condition holds, stop here, write the record, and
end the run. Do not weigh whether a condition matters enough to honour. Do not rank
escalations: the 7.6 existence oracle was ranked lowest of four by the review that
found it, and Hassan took it anyway.

### 4. Write the prompt, in full

The skeleton is in `co-lead.md` and this file does not repeat it. Fill it from the
RFC row and from the state you measured in step 1, never from recall. One prompt
names exactly one persona.

Four rules bind every prompt you write, the verifier's included, and they are
Hassan's:

- Never steer. Do not corner the session toward the answer you expect.
- Attribute everything: "the tester recommends X", "the Steward ruled Y in commit
  Z", "the human owner ruled W".
- List options unpruned, including the ones you would not choose.
- Put no opinion of your own into it.

**Every attribution carries a locator, and you open the locator before the prompt
leaves your hands.** A ruling names the commit, or the specification section and the
sentence. A recommendation names the session that made it. A file the prompt tells
the session to open is confirmed present at that path this pass. An attribution you
cannot locate is not softened into a hedge: it means you have not established the
fact, and a prompt that asserts it anyway is the failure that produced P4's session
6a, made with a human present and caught only afterwards.

Name the model this session runs at, from runbook section 3's grading table with its
two rules applied, and say it in the published prompt and in the record.

### 5. Publish the prompt, before invoking anything

Print the complete prompt in your own output first, in a code block, labelled with
the session it is for and the persona it addresses, and append it verbatim to the
journal. Every prompt a sub-agent ever receives must exist in both places before
that sub-agent does.

Publication in the chat alone is not a control on a night nobody is watching, which
is why the journal carries it too. It is how Hassan audits a run he slept through,
and it is the only way a prompt that fabricated a ruling or steered a session can be
caught after the fact.

### 6. Invoke exactly one sub-agent, isolated, with that prompt verbatim

Before invoking, record the branch tip as a literal forty-character sha from
`git rev-parse HEAD`. You will need it at step 9 and nothing else will do.

Isolated means a fresh session with no memory of you, of this file, or of any other
session. Pass the prompt exactly as published, character for character. If you
change a word between publishing and invoking, you have broken the audit trail.

Hand the sub-agent nothing else. Not this file, not `co-lead.md`, not the runbook,
not a summary of an earlier session. It gets its state from artifacts and its
assignment from the prompt, which is the arrangement that makes it independent.

### 7. Wait

Do nothing while it works. Do not start another sub-agent. Do not read, write, or
touch the working tree, because it is reading and writing that tree right now.

### 8. Read the final block, and journal it whole

Take it whole, escalation section included, and append it to the journal before you
do anything with it. Do not summarize it into your own words before you have
verified it, because your summary is what a wrong belief travels in.

### 9. Verify, by invoking the verifier

This step is the one that matters most. Three of the four failures `co-lead.md`
names are transcription failures: a reported count that did not reproduce, and a
claim about another role's file made without opening it, twice.

Invoke a separate sub-agent, fresh for this pass and isolated on step 6's terms.
Tell it the literal sha you recorded, tell it which persona file the session was
given, and give it the block. **Never pass `HEAD`, a branch name, or a tag**, because
after the session has run `HEAD` is the session's own tip, `git diff HEAD..HEAD` is
empty, and the boundary check answers clean without having checked anything.

Write the verifier's prompt under the four rules of step 4 and publish it under step
5 before invoking it, exactly as for a worker. Put these checks into that prompt in
full rather than handing it this file, which the Never list forbids for every
sub-agent and this one included:

1. Is the branch where the block claims, pushed and in sync?
2. `git diff --name-only <the literal sha>..HEAD`: did the session write only inside
   the paths its persona's Owns section names? It reads that persona file itself. A
   file outside is a finding whatever the block says.
   One exception, and only one. Protocol section 3 lets any role add a dependency to
   `app/package.json` and the lockfile when its own work needs it, provided the
   commit message names the addition and its reason. That is not a boundary
   violation and it is not a finding; name it in the record, because the Integration
   Steward reviews dependency additions at the merge. Where the package's RFC row
   records a ruling that widens a persona's paths, the row is the authority and the
   verifier reads it alongside the persona file. This file names no such ruling,
   because a list of live rulings written here goes stale the month after.
3. The gate from `app/`, the same four commands precondition 3 names, re-run rather
   than transcribed.
4. Do the block's reported counts match what it just measured, and is the set of
   failing tests after this session a subset of the set before it? Record both sets
   by name, not only their sizes. On a branch that is red by design a count
   reconciles perfectly while three assertions went green and three others went red,
   and a test that was passing and is now failing stops the run whatever the totals
   say.
5. Does the block escalate, or route any finding to another role?
6. CI on the sha the session pushed: is there a conclusion, and on the `postgres:18`
   leg, is any test failing that was not failing in precondition 4's baseline?
7. `git diff --stat <the literal sha>..HEAD`, and `npx vitest run -t "AC-0NN"` for
   every criterion the block claims: what did the session actually change, and does
   each claimed criterion select by its number and pass? A criterion that nothing
   selects is not covered, whatever the totals read.
8. For every test the session added or changed that arrives green, the block says
   what it was red-proven against and where. A green assertion with no
   discrimination evidence named is a finding rather than a pass. Two assertions in
   this build passed regardless of what the code did, one sweeping an empty fixture
   list and one comparing timestamps the driver had already truncated.
9. Does every commit the session made carry the `Co-Authored-By` trailer protocol
   section 7 requires, naming the model that actually ran the session? A trailer
   that misnames its author cannot be repaired later.

Clean means the boundary held, the gate is green or red within precondition 3's
definition, the counts and the failing set reconcile, CI shows no new authority-leg
failure, and nothing escalated. **Clean also means the session landed the work the
row assigns it.** An empty diff is not clean, and neither is a diff covering part of
the assignment, because the next pass would open a successor onto a predecessor that
delivered nothing. Anything else halts the run.

### 10. Record, and publish where the run stands

**You may not adjust the traced order.** Inserting a return is how the record shows
real packages adjusting, and it is a plan change made on a finding, which is exactly
the case halt condition 1 stops. Write what you believe should move and why in the
record, in the words the RFC row would take, and leave the writing of it to the
morning. `docs/rfcs/` is not yours to write.

After every pass, publish the package's session table in your own output and append
it to the journal: every session that has run with its verdict, the session now in
progress or just finished, and what the row puts next. That table is how Hassan sees
where the run is without waking up, and it is the only live view he has.

A row is added for every session that ran, once its verification has been read:
Done, or, where verification was not clean, saying what did not reconcile. Where a
session escalated and continued on what was unaffected, as the skeleton instructs
every session to do, the row says what landed and what did not, because partial work
is the normal shape of a halted step.

**Write no file in the repository during the run.** The journal is outside it, and
`SESSION-LOG.md` is written once, after the run has ended, and committed by the
morning. An uncommitted file you created is a dirty tree, and the skeleton tells
every session to commit as it goes, so a session running a broad commit would sweep
your bookkeeping onto the package branch and then fail the next boundary check for a
file it never chose to write.

### 11. Loop or stop

If the cap is not reached, the wall-clock budget allows another full step, and no
halt condition holds, return to step 1. Otherwise write the record and end.

## Halt conditions

Stop on the first that holds. Never rank them, never weigh them.

1. **Any escalation.** The literal heading ESCALATION in a block, or a finding it
   routes to another role, whether or not it calls itself blocking.
2. **Verification not clean.** A file written outside the persona's owned paths
   other than the dependency addition check 2 admits, a red gate precondition 3 does
   not admit, counts or failing sets that do not reconcile, an assignment not
   landed, or a new failure on the `postgres:18` leg.
3. **The next session is the merge review**, or would write to `main`: commit,
   merge, push, force-update, or delete a branch. Reading `main` is ordinary and is
   not this condition; sessions create branches from it and diff against it. A
   session that would merge or rebase `main` into the package branch does write,
   because it moves the tip you recorded and empties the diff the boundary check
   rests on.
4. **The next decision is Hassan's.** The decisions that cannot be delegated are
   runbook section 11's list, and this file does not restate it, because a copy of a
   live list is wrong the day the list changes and this build has paid for that
   twice. Read it there.
5. **A test cites a ruling the specification does not carry**, on precondition 5's
   two tests.
6. **The working tree is dirty, or the branch is unpushed.**
7. **No CI conclusion on a sha a step pushed**, after precondition 4's wait, or a
   `postgres:18` leg failing a test that was not failing in the baseline.
8. **The step cap or the wall-clock budget is reached.**
9. **A question already routed to Hassan is unanswered, and a session inside the cap
   depends on it.** The package's RFC row and `CHANGELOG.md`'s Unreleased section
   are where routed questions are recorded. Find the first session in the row that
   consumes each open one. A row saying a question blocks nothing meanwhile means it
   does not block the sessions ahead of that one; it never means a session may
   answer it.
10. **You are unsure.** If you cannot tell whether a condition holds, it holds.

## The journal

The journal lives at a fixed path outside the repository, so the working tree stays
clean and halt condition 6 keeps meaning what it says. Name its path at the top of
your first output.

Append to it after every phase, before the next sub-agent exists. Each entry carries
the time, the step number, the persona, the model, the sha before, the sha after,
the prompt verbatim, the worker's final block whole, the verifier's verdict whole,
and the current session table.

Nothing stops a run dying mid-step. Without this the morning finds pushed commits on
a branch with no way to tell which were verified, which died in verification, and
which sha to reset past.

## The record

When the run ends, for any reason, write one report in your own output and to the
journal. You commit nothing. It is the only thing Hassan reads before deciding
whether any of this was worth keeping, so it says:

- What ran, in order, and what each session landed, with commit hashes.
- What stopped the run, and whether stopping was a halt condition working or a
  failure.
- The branch now: tip, the suite counts and failing set you measured yourself,
  pushed or not, whether CI has a verdict, and how far behind `main` the base is.
- Every prompt this run issued, verbatim, worker and verifier alike.
- Any escalation, quoted whole under its own heading, with the specification
  section, the options, and the recommendation the block gave. A halt reduced to the
  fact that something escalated has destroyed the most valuable thing the night
  produced, and protocol section 6 requires all four parts.
- Anything a session disclosed for the Steward to ratify at the merge, quoted with
  the file it was recorded in, and any carried-forward item this run touched.
- Anything the row makes a session's work that the checks cannot reach, named as
  owed to the morning. An EXPLAIN record produced against seeded volume is the live
  example: a green suite is evidence for it in neither direction.
- The session-log rows to be written, ready to paste, plus the next session's full
  prompt in a code block Hassan can use without editing.
- What the morning owes: which decisions wait for Hassan, and anything that must be
  re-verified because your verifier could be wrong.

An unattended run advances work. It certifies nothing. Nothing it produced reaches
`main` without a Steward merge review that a human opened, and the co-lead verifies
every step again in the morning rather than trusting the run's own verifier.

## Never

- Never run two sub-agents at once.
- Never invoke a sub-agent with a prompt you did not publish first, to the chat and
  to the journal.
- Never hand a sub-agent this file, `co-lead.md`, or the runbook.
- Never touch the working tree while a sub-agent is running.
- Never write any file in the repository during a run, including under the
  administrative-corrections authority `co-lead.md` claims in its Owns section. That
  authority points at a standing authorization the runbook does not carry, so it has
  no stated floor, and a night with nobody watching is not where an unbounded
  permission gets exercised for the first time.
- Never let a sub-agent write under `docs/spec/`, whatever its Owns section says.
  Every legitimate amendment there rests on a ruling, and a night with nobody
  present is a night on which no ruling was made.
- Never commit to `main`, merge, delete a branch, or push `main`.
- Never edit an acceptance test yourself, for any reason. The Adversarial Test
  Engineer owns `app/tests/` exclusively, and a session of that role correcting a
  test is ordinary work you may invoke where the row already carried it. Routing
  that work to a role that does not own `app/tests/` is the boundary violation you
  would then verify as a finding.
- Never amend the specification, or write `docs/rfcs/`.
- Never make a product decision, or record one as though Hassan made it.
- Never continue past a halt condition because the next session looked easy.

## One real cycle, as it actually happened

From P3, so the shape is concrete rather than abstract.

The row said the next session was Platform's mount. The previous session, the
Collaboration engineer's implementation, had returned a block whose escalation
reported that the acceptance suite read date columns straight from the driver, and
that the two database backends disagree about what that returns.

An orchestrator with a human beside it does not proceed to the mount. The finding is
in the Adversarial Test role's files, so the next session is that role's return,
inserted as `3a`, and the mount moves behind it. **An unattended orchestrator does
none of that.** The block escalated, so the run ends there and the finding waits for
Hassan, who inserts the return himself. The reason is still worth having in the
record: if the mount landed first, the branch would go green locally, get pushed,
and then turn red on the authority leg on those very assertions.

That return then found something worse than the routed finding: timestamps read
through the driver carry one-second resolution, so every "this no-op wrote nothing"
assertion had been passing regardless of what was written. It corrected the whole
family rather than the three sites reported. That is the value the halt preserved,
by leaving the finding for a session that could act on it rather than a run that
could not.
