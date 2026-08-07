export const meta = {
  name: 'dana-unattended-body',
  description: 'Advance the body of a Dana package unattended: decide, work, verify, halt',
  whenToUse: 'When the operator is away and a package body is ready: its kickoff question ruled and transcribed, its merge review not yet due.',
  phases: [
    { title: 'Preflight', detail: 'refuse to start on an unsafe tree' },
    { title: 'Step 1', detail: 'decide, work, verify' },
    { title: 'Step 2', detail: 'decide, work, verify' },
    { title: 'Step 3', detail: 'decide, work, verify' },
    { title: 'Report', detail: 'what ran, what halted it, what the morning owes' },
  ],
}

const PKG = (args && args.package) || 'the package in flight'
const BRANCH = (args && args.branch) || 'the package branch'
const CAP = Math.min((args && args.steps) || 3, 6)

const CONTRACT = `You are working inside Dana, at D:\\dana. Read these before anything else, from disk:
docs/operator/co-lead.md, which is the coordinating role's contract, and
docs/operator/unattended.md, which narrows it for a run with no human present.
Then CLAUDE.md, docs/team/_shared-protocol.md, docs/rfcs/0001-mvp.md's implementation plan, and SESSION-LOG.md.
State comes from artifacts. Never from this prompt, never from a summary.

`

const PREFLIGHT = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    reason: { type: 'string' },
    branch: { type: 'string' },
    tip: { type: 'string' },
    suite: { type: 'string' },
    nextSession: { type: 'string' },
  },
  required: ['safe', 'reason', 'branch', 'tip', 'suite', 'nextSession'],
}

const DECISION = {
  type: 'object',
  properties: {
    halt: { type: 'boolean' },
    reason: { type: 'string' },
    label: { type: 'string' },
    persona: { type: 'string' },
    prompt: { type: 'string' },
  },
  required: ['halt', 'reason', 'label', 'persona', 'prompt'],
}

const VERDICT = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    boundaryClean: { type: 'boolean' },
    gate: { type: 'string' },
    countsReconcile: { type: 'boolean' },
    escalation: { type: 'boolean' },
    findings: { type: 'string' },
  },
  required: ['clean', 'boundaryClean', 'gate', 'countsReconcile', 'escalation', 'findings'],
}

phase('Preflight')

const pre = await agent(CONTRACT + `Preflight for an unattended run on ${PKG}, branch ${BRANCH}.

Establish, by running commands rather than by reading claims:
- git status: is the working tree clean? Uncommitted work is the operator's own hands, halt condition 6.
- git branch -a and git status -sb: does the branch exist and is it pushed and in sync? An unpushed branch is one CI has never seen.
- The gate from app/: npm run lint, npm run typecheck, npx vitest run. Record the counts.
- CI on the branch's tip, using the full path to gh.exe that CLAUDE.md records. Absence of a verdict is a halt, never a pass.
- Halt condition 5: does any acceptance test in app/tests/ attribute a decision to the human owner that the frozen specification does not carry? Check every test whose header cites an owner ruling against the section it names.
- The package's traced RFC row: which session comes next, and is it the merge review or a session needing an owner ruling?

Answer safe=false with a precise reason if any halt condition of unattended.md holds. Answer safe=true only if the tree is clean, the branch is pushed, the gate is green or red for reasons the row explains, CI has been read, no test cites an untranscribed ruling, and the next session is neither the merge review nor an owner decision. nextSession names the session the row puts next.`,
  { label: 'preflight', agentType: 'general-purpose', schema: PREFLIGHT })

log(`preflight: ${pre.safe ? 'safe' : 'HALT'} — ${pre.reason}`)
if (!pre.safe) return { halted: 'preflight', reason: pre.reason, steps: [] }

log(`${pre.branch} at ${pre.tip}, suite ${pre.suite}, next: ${pre.nextSession}`)

const steps = []
let last = pre.tip

for (let n = 1; n <= CAP; n++) {
  phase(`Step ${n}`)

  const decision = await agent(CONTRACT + `You are the orchestrator for step ${n} of an unattended run on ${PKG}, branch ${BRANCH}, currently at ${last}.

${steps.length ? `Earlier steps this run:\n${steps.map((s) => `- ${s.label}: ${s.verdict.findings}`).join('\n')}\n` : 'No step has run yet this run.\n'}
Derive the branch's real state yourself: git log, git status, and the gate from app/. Then decide the next session from the package's traced RFC row, adjusted by what the last step actually landed.

Halt, with halt=true and a reason, if any condition in unattended.md holds: the next session is the merge review or touches main, the next decision is the human owner's, the last step escalated, the tree is dirty, or the row's remaining sessions are done.

Otherwise write that one session's prompt in full, exactly as co-lead.md's skeleton requires: the persona and protocol reading order, the assignment in a sentence, the branch state you measured rather than recalled, every ruling that binds the session with its author named, the rules block, and the final-block requirement. Attribute every recommendation to its source. List options unpruned. Put no opinion of your own into it.

Return the prompt verbatim in the prompt field, the persona file in persona, and a short label like "04 shared schemas".`,
    { label: `decide-${n}`, agentType: 'general-purpose', schema: DECISION })

  if (decision.halt) {
    log(`step ${n}: HALT before working — ${decision.reason}`)
    steps.push({ step: n, label: 'halt', verdict: { findings: decision.reason } })
    break
  }

  log(`step ${n}: running ${decision.label} (${decision.persona})`)
  const block = await agent(decision.prompt, { label: decision.label, agentType: 'general-purpose' })

  const verdict = await agent(CONTRACT + `You are the verifier for step ${n} of an unattended run. You did not write this prompt and you decide nothing about what comes next. Your one job is to re-derive this session's claims from the repository.

The session was ${decision.label}, persona ${decision.persona}, on ${BRANCH}, which stood at ${last} before it ran.

Its final block, as returned:
---
${block}
---

Check, by running commands:
1. git status -sb and git log --oneline: is the branch where the block claims, pushed, in sync?
2. git diff --name-only ${last}..HEAD: did it write only inside the paths its persona's Owns section names? Read that persona file. A file outside is a finding whatever the block says.
3. The gate from app/: npm run lint, npm run typecheck, npx vitest run, and npm run build if compiled output was touched. Never transcribe a number the block reports.
4. Do the block's reported counts match what you just ran?
5. Does the block contain the heading ESCALATION, or route any finding to another role?

clean is true only if the boundary held, the gate is green or red for reasons the package's row explains, the counts reconcile, and there is no escalation. Put what you measured in findings, including the numbers, in two or three sentences.`,
    { label: `verify-${n}`, agentType: 'general-purpose', schema: VERDICT })

  steps.push({ step: n, label: decision.label, persona: decision.persona, verdict })
  log(`step ${n}: ${verdict.clean ? 'verified' : 'HALT'} — ${verdict.findings}`)

  if (!verdict.clean) break

  last = 'HEAD'
}

phase('Report')

const report = await agent(CONTRACT + `Write the record of this unattended run on ${PKG}, for the operator to read in the morning before anything merges.

Preflight: ${JSON.stringify(pre)}
Steps: ${JSON.stringify(steps)}

Derive the branch's current state yourself, then write, in plain prose and no filler:
- What ran, in order, and what each session landed.
- What stopped the run, and whether stopping was a halt condition doing its job or a failure.
- What the branch is now: tip, suite counts you measured, whether it is pushed, whether CI has a verdict.
- Exactly what the morning owes: which session is next, which decisions wait for the human owner, and anything that must be re-verified because this run's verifier could be wrong.

Write no files and change nothing.`,
  { label: 'report', agentType: 'general-purpose' })

return { package: PKG, branch: BRANCH, cap: CAP, steps, report }
