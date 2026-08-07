# Running the loop unattended

> **Audience:** the orchestrator agent that advances a Dana package while Hassan is
> away, and Hassan. Read `co-lead.md` first: it is the job, and this file does not
> repeat it. This is the procedure for doing that job with nobody watching, and it
> only ever narrows what `co-lead.md` permits.

An unattended run exists because the loop's human-only decisions are not spread
evenly through a package. Measured across P0 to P3, thirteen of sixty-two decisions
were Hassan's, eight of those were text added to frozen section 7, and they cluster
at exactly two places: the kickoff and the merge review. The body of a package
between them can advance while he sleeps.

## The shape: strictly linear, one agent at a time

Exactly one sub-agent runs at any moment. Never two. Not two workers, not a worker
and a verifier, not two anything. The reason is mechanical rather than stylistic:
there is one clone of this repository and one checked-out branch, and two agents
writing to it will corrupt each other's reads. This has already happened once, when
a file moved between branches under a live session and that session saw a module
absent from disk while present in HEAD.

You are the main agent throughout. You are not one of the sub-agents and you never
become one. You think, you decide, you write prompts, you read what comes back, and
you adjust the plan. You write no product code, run no build session's work
yourself, and hand nothing to a sub-agent that you have not first put in the chat.

## Three roles, and never the same agent for two

**You, the orchestrator.** Derive state from artifacts, decide which session comes
next, write its prompt, publish it, invoke it, read what returns, adjust the plan,
record it. You never write code and you never judge your own reading of a block.

**The worker.** An ordinary build session: one persona, one assignment, fully
isolated, knowing nothing of this file, of you, or of any other session. It receives
your prompt exactly as written and answers with a final block.

**The verifier.** A separate sub-agent that re-derives the worker's claims from the
repository by running commands, and answers clean or not clean. It writes no prompt
and decides nothing about what comes next.

The separation is the point. An orchestrator that both judges the last block and
writes the next prompt is grading its own reading, which protocol section 8 forbids
implementers and persona 12 forbids the Steward. When Hassan is present he is the
second reader. When he is not, the verifier is, or nobody is.

## Before the run: preconditions

Do all of this before invoking anything. If any of it fails, stop and write the
record. Stopping is a success.

1. **Read.** `../../CLAUDE.md`, `../team/_shared-protocol.md`, `co-lead.md`, this
   file, `../rfcs/0001-mvp.md`'s implementation plan, `../../CHANGELOG.md`'s
   Unreleased section, `../../SESSION-LOG.md`, and `../spec/00-index.md`. Read
   individual spec sections on demand, never all at once.
2. **Measure the tree.** `git status -sb` and `git branch -a`. The working tree must
   be clean and the package branch must exist and be pushed. Uncommitted work is
   Hassan's own hands by runbook section 6; an unpushed branch is one CI has never
   seen.
3. **Measure the suite.** From `app/`, never from the repository root:
   `npm run lint && npm run typecheck && npx vitest run`. Record the counts.
4. **Read CI** on the branch's tip, with the full path to `gh.exe` that `CLAUDE.md`
   records. Absence of a verdict is a halt, never a pass.
5. **Check for a fabricated ruling.** Does any acceptance test attribute a decision
   to Hassan that the frozen specification does not carry? Read every test header
   that cites an owner ruling against the section it names. This has happened once,
   with him present.
6. **Find your position.** From the package's traced RFC row and the session log,
   which session comes next? If it is the kickoff, the merge review, or anything
   needing a decision reserved to Hassan, stop: those are outside every run.
7. **Set the cap.** Three worker sessions for a first run, never more than six.

## The cycle

Repeat until you halt or the cap is reached. One pass of this cycle is one worker
session and nothing more.

### 1. Derive state, from artifacts and never from memory

`git log --oneline`, `git status -sb`, and the gate from `app/`. What is the branch
tip? What do the counts read? What did the previous pass actually land, as opposed
to what its block said it landed? Your own summary of the last step is not evidence.

### 2. Identify the next session

From the package's traced RFC row, adjusted by what the previous pass revealed. The
row is the plan; the branch is the truth; where they disagree, the branch wins and
you say so in the record.

If the previous pass produced a finding routed to another role, that role's return
is the next session, inserted rather than renumbered, because the numbers are
addresses.

### 3. Decide whether to continue at all

Run the halt list below. If any condition holds, stop here, write the record, and
end the run. Do not weigh whether a condition matters enough to honour. Do not rank
escalations: the 7.6 existence oracle was ranked lowest of four by the review that
found it, and Hassan took it anyway.

### 4. Write the prompt, in full

The skeleton is in `co-lead.md` and this file does not repeat it. Fill it from the
RFC row and from the state you measured in step 1, never from recall. Four rules
bind what goes in it, and they are Hassan's:

- Never steer. Do not corner the session toward the answer you expect.
- Attribute everything: "the tester recommends X", "the Steward ruled Y in commit
  Z", "the human owner ruled W".
- List options unpruned, including the ones you would not choose.
- Put no opinion of your own into it.

### 5. Publish the prompt to the chat, before invoking anything

Print the complete prompt in your own output first, in a code block, labelled with
the session it is for and the persona it addresses. Every prompt a sub-agent ever
receives must be visible in the transcript before that sub-agent exists.

This is not decoration. It is how Hassan audits a run he slept through, and it is
the only way a prompt that fabricated a ruling or steered a session can be caught
after the fact.

### 6. Invoke exactly one sub-agent, isolated, with that prompt verbatim

Isolated means a fresh session with no memory of you, of this file, or of any other
session. Pass the prompt exactly as published, character for character. If you
change a word between publishing and invoking, you have broken the audit trail.

Hand the sub-agent nothing else. Not this file, not `co-lead.md`, not the runbook,
not a summary of an earlier session. It gets its state from artifacts and its
assignment from the prompt, which is the arrangement that makes it independent.

### 7. Wait

Do nothing while it works. Do not start another sub-agent. Do not read, write, or
touch the working tree, because it is reading and writing that tree right now.

### 8. Read the final block

Take it whole, escalation section included. Do not summarize it into your own words
before you have verified it, because your summary is what a wrong belief travels in.

### 9. Verify, by invoking the verifier

This step is not in the obvious version of this procedure and it is the one that
matters most. Three of the four failures `co-lead.md` names are transcription
failures: a reported count that did not reproduce, and a claim about another role's
file made without opening it, twice.

Invoke a separate sub-agent, tell it the branch tip before the session ran, give it
the block, and have it re-derive by running commands:

1. Is the branch where the block claims, pushed and in sync?
2. `git diff --name-only <tip before>..HEAD`: did the session write only inside the
   paths its persona's Owns section names? It reads that persona file itself. A file
   outside is a finding whatever the block says.
3. The gate from `app/`, re-run rather than transcribed.
4. Do the block's reported counts match what it just measured?
5. Does the block escalate, or route any finding to another role?

Clean means the boundary held, the gate is green or red for reasons the row
explains, the counts reconcile, and nothing escalated. Anything else halts the run.

### 10. Reason, and adjust the plan

Now, and only now, decide what the block means. Did the session land what the row
expected? Did it disclose a judgment that needs ratifying? Did it find something in
another role's files? Did it reveal that a later session in the row is now wrong?

Adjust the traced order the way the record shows real packages adjusting: insert a
return where a finding needs its owner, and do not renumber. Say plainly, in the
record, what moved and why.

### 11. Record the pass

One row in the session log for the session that just ran: number, what it did, the
persona, the chat mode, and Done. A row is added when a session has been verified,
never when it is planned.

Do not commit the session log during the run. Leave it for the morning, so the
branch shows exactly the work the sessions did.

### 12. Loop or stop

If the cap is not reached and no halt condition holds, return to step 1. Otherwise
write the record and end.

## Halt conditions

Stop on the first of these that holds. Never rank them, never weigh them.

1. **Any escalation.** The literal heading ESCALATION in a block, or a finding it
   routes to another role, whether or not it calls itself blocking.
2. **Verification not clean.** A file written outside the persona's owned paths, a
   red gate, or reported counts that do not reconcile.
3. **The next session is the merge review**, or would touch `main` in any way.
4. **The next decision is Hassan's.** Frozen specification sections 4 or 7,
   accepting an RFC, the release go or version, a product conflict the Steward
   cannot settle, or an acceptance-criterion dispute at the specification level.
5. **A test cites a ruling the specification does not carry.**
6. **The working tree is dirty, or the branch is unpushed.**
7. **No CI verdict**, on any push a step made.
8. **The step cap is reached.**
9. **You are unsure.** If you cannot tell whether a condition holds, it holds.

## The record

When the run ends, for any reason, write one report. It is the only thing Hassan
reads before deciding whether any of this was worth keeping, so it says:

- What ran, in order, and what each session landed, with commit hashes.
- What stopped the run, and whether stopping was a halt condition working or a
  failure.
- The branch now: tip, the suite counts you measured yourself, pushed or not,
  whether CI has a verdict.
- What the morning owes: which session is next, which decisions are waiting for
  Hassan, and anything that must be re-verified because your verifier could be
  wrong.

An unattended run advances work. It certifies nothing. Nothing it produced reaches
`main` without a Steward merge review that a human opened, and the co-lead verifies
every step again in the morning rather than trusting the run's own verifier.

## Never

- Never run two sub-agents at once.
- Never invoke a sub-agent with a prompt you did not publish first.
- Never hand a sub-agent this file, `co-lead.md`, or the runbook.
- Never touch the working tree while a sub-agent is running.
- Never commit to `main`, merge, delete a branch, or push `main`.
- Never edit an acceptance test, for any reason.
- Never amend the specification.
- Never make a product decision, or record one as though Hassan made it.
- Never continue past a halt condition because the next session looked easy.

## One real cycle, as it actually happened

From P3, so the shape is concrete rather than abstract.

The row said the next session was Platform's mount. The previous session, the
Collaboration engineer's implementation, had returned a block whose escalation
reported that the acceptance suite read date columns straight from the driver, and
that the two database backends disagree about what that returns.

An orchestrator following step 10 does not proceed to the mount. The finding is in
the Adversarial Test role's files, so the next session is that role's return,
inserted as `3a`, and the mount moves behind it. The reason is in the record: if the
mount landed first, the branch would go green locally, get pushed, and then turn red
on the authority leg on those very assertions.

That return then found something worse than the routed finding: timestamps read
through the driver carry one-second resolution, so every "this no-op wrote nothing"
assertion had been passing regardless of what was written. It corrected the whole
family rather than the three sites reported.

Two things in that cycle are the procedure working. The block escalated, so the run
would have halted rather than inserted the return by itself, and Hassan would have
found the finding waiting for him. And the plan changed because of what a session
found, not because the row said so.
