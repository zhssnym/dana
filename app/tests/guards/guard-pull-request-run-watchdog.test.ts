/*
The check that a pull request got a CI run at all, kept honest from both ends.

**Why this is a guard and not a criterion.** It pins nothing in spec section 12.
Whether a pull request has a workflow run is not a behaviour of Dana, it is a
property of the machinery that certifies Dana's behaviours, and `tests/README.md`
is explicit that a `guard-` file "exists to keep the suite itself honest rather
than to prove product behaviour". Taking an `ac-` number for it would claim a
criterion that does not exist.

**What it is guarding, and the order matters.**

1. **`on.pull_request` in `ci.yml` still carries no filter.** This is the
   precondition the whole mechanism rests on. `.github/workflows/pull-request-run-watchdog.yml`
   reads a missing run as a defect; a `paths`, `paths-ignore`, `types` or
   `branches` filter makes a missing run legitimate, and the check would then
   report a pull request the filter correctly skipped as unverified. That is
   crying wolf, which is exactly how a mechanism becomes one people skim past -
   the failure issue #248 is about. The script refuses to run in that state; this
   fails in the gate, before the branch is ever pushed.

   **The class is real and this repository has four of them.** Pull requests #54,
   #58, #144 and #151 have no run for their head, and every one is the
   `paths-ignore` list `on.pull_request` carried until 2026-09-04: `LICENSE`,
   `CLAUDE.md`, `docs/**`. They were kept out of the replay only by being open
   for less than the ten-minute grace (9m33s, 7m56s, 71s, 25s). A docs-only pull
   request of that era open for twenty minutes would have been a false positive.

2. **The predicate reads for the presence of a run, and reads a conclusion only
   to tell a silent absence of verification from a loud one**, and it counts
   only runs of `ci.yml`. The counting is load-bearing rather than tidy: the
   watchdog's own workflow triggers on `pull_request`, so without the filter
   every head would have a run of *something* and every verdict would be `ok` -
   the check would pass on the exact state it exists to catch.

   The conclusion half is narrow on purpose and the cases below pin both edges
   of it. A `failure` is loud and is somebody's to fix, so it is `ok` here; a
   `cancelled`, `skipped`, `action_required` or `stale` run is a grey icon
   GitHub mails nobody about, verified nothing, and is `inconclusive`. That
   distinction was missing until 2026-09-20 and the gap was not hypothetical:
   `CLAUDE.md` instructs cancelling a stuck run to free the runner and `ci.yml`
   carries `cancel-in-progress` for every pull request ref, so a head whose only
   run had been cancelled took a **green** `ci/pull-request-has-a-run` status
   beside its grey one, with nothing linted, typechecked, built or name-checked.

3. **The workflow runs on the self-hosted runner and has a schedule.** Those two
   lines are the whole of why it does not cry wolf every night and why it can
   catch anything at all. On the self-hosted runner it does not execute while the
   machine is off, so it says nothing about a night it slept through. And the
   schedule is the trigger that does not depend on the `pull_request` event,
   which is the event that failed: a workflow watching for a missing
   `pull_request` event cannot be woken only by `pull_request` events.

**What this cannot check**, said rather than left to be discovered: whether
GitHub actually creates a run. Nothing runnable here can. The predicate was
verified instead by replaying it over this repository's real history - 29,911
one-minute ticks from 2026-08-31 to 2026-09-20, every open pull request at every
tick against the runs that existed at that instant. It fired once, on #244, from
14:19Z, eleven minutes after it was opened and ten before a human noticed. It
fired on nothing else, including across the night runs 24, 26 and 31 sat queued
for eleven hours with the runner asleep.
*/
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CI_WORKFLOW_PATH,
  COMMENT_MARKER,
  DEFAULT_GRACE_MINUTES,
  classify,
  commentBody,
  headSince,
  minutesSince,
  modeRefusal,
  pullRequestTriggerFilters,
  statusFor,
} from '../../scripts/pull-request-run-watchdog.mjs'

const repositoryFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8')

const WATCHDOG_WORKFLOW_PATH = '.github/workflows/pull-request-run-watchdog.yml'

/** The run shape the classifier reads: a workflow path, an event, a status, a conclusion. */
const run = (
  path: string,
  event: string,
  status = 'completed',
  conclusion: string | null = null,
): { path: string; event: string; status: string; conclusion: string | null } => ({
  path,
  event,
  status,
  conclusion,
})

describe('the pull_request trigger ci.yml is read against', () => {
  it('carries no filter, which is what makes a missing run mean something', () => {
    expect(pullRequestTriggerFilters(repositoryFile(CI_WORKFLOW_PATH))).toEqual([])
  })

  it('names every filter key when one is added, so the refusal can say which', () => {
    const filtered = [
      'on:',
      '  push:',
      '    branches: [main]',
      '  pull_request:',
      '    types: [opened]',
      "    paths-ignore:",
      "      - 'docs/**'",
      '  workflow_dispatch:',
      '',
      'jobs:',
    ].join('\n')
    expect(pullRequestTriggerFilters(filtered)).toEqual(['types', 'paths-ignore'])
  })

  it('reads a comment between the trigger and its siblings as no filter', () => {
    const commented = [
      'on:',
      '  push:',
      '    branches: [main]',
      '  # No paths-ignore: every pull request gets the branch-name check.',
      '  pull_request:',
      '  workflow_dispatch:',
      '',
      'jobs:',
    ].join('\n')
    expect(pullRequestTriggerFilters(commented)).toEqual([])
  })

  /*
  A reader that guessed would answer "no filters" for a file it failed to
  understand, which is the silent false green this whole mechanism argues
  against. Both shapes below are legal YAML and neither is the one it reads.
  */
  it('throws rather than guessing at the inline form of on:', () => {
    expect(() => pullRequestTriggerFilters('on: [push, pull_request]\n\njobs:\n')).toThrow(/block form/)
  })

  it('throws rather than guessing at the inline form of pull_request:', () => {
    expect(() => pullRequestTriggerFilters('on:\n  pull_request: { types: [opened] }\n\njobs:\n')).toThrow(
      /block form/,
    )
  })

  it('throws when there is no pull_request trigger to read', () => {
    expect(() => pullRequestTriggerFilters('on:\n  push:\n    branches: [main]\n\njobs:\n')).toThrow(/pull_request/)
  })
})

describe('the verdict on one pull request', () => {
  const ci = CI_WORKFLOW_PATH
  const old = { ageMinutes: 30, graceMinutes: DEFAULT_GRACE_MINUTES }

  it('is missing when no run of any event exists for the head', () => {
    expect(classify({ runs: [], ...old })).toBe('missing')
  })

  it('is young while the head is newer than the grace, whatever the runs say', () => {
    expect(classify({ runs: [], ageMinutes: 3, graceMinutes: DEFAULT_GRACE_MINUTES })).toBe('young')
  })

  /*
  The property the whole mechanism rests on. A run created while the runner is
  asleep exists as a queued record from the instant the event fires - measured
  in this repository at eleven hours and twenty-seven minutes of waiting - so
  reading for the record rather than for a verdict is what tells "the runner is
  asleep" apart from "the event never fired".
  */
  it('is ok for a run that has not started, which is the asleep runner', () => {
    expect(classify({ runs: [run(ci, 'pull_request', 'queued')], ...old })).toBe('ok')
  })

  it('is ok for a completed run with no conclusion recorded either way', () => {
    expect(classify({ runs: [run(ci, 'pull_request')], ...old })).toBe('ok')
  })

  /*
  Load-bearing. This workflow triggers on pull_request too, so its own run sits
  on every head; counting it would make every verdict ok.
  */
  it('is missing when the only run for the head is this watchdog checking it', () => {
    expect(classify({ runs: [run(WATCHDOG_WORKFLOW_PATH, 'pull_request')], ...old })).toBe('missing')
  })

  it('is dispatch-only when the branch was verified by hand instead', () => {
    expect(classify({ runs: [run(ci, 'workflow_dispatch')], ...old })).toBe('dispatch-only')
    expect(classify({ runs: [run(ci, 'workflow_dispatch'), run(ci, 'pull_request')], ...old })).toBe('ok')
  })

  /*
  The case this classifier answered `ok` on until 2026-09-20, and it is the one
  the file exists to catch wearing a different hat: a run record exists, so the
  #248 defect is absent, and yet nothing was linted, typechecked, built or
  name-checked and nothing anywhere said so. A cancelled run is a grey neutral
  icon that GitHub mails no one about, so the pull request showed that beside a
  green status this file had posted.
  */
  it('is inconclusive when every pull_request run was cancelled', () => {
    expect(classify({ runs: [run(ci, 'pull_request', 'completed', 'cancelled')], ...old })).toBe('inconclusive')
  })

  it('is inconclusive for the other three quiet endings as well', () => {
    for (const conclusion of ['skipped', 'action_required', 'stale']) {
      expect(classify({ runs: [run(ci, 'pull_request', 'completed', conclusion)], ...old })).toBe('inconclusive')
    }
  })

  /*
  Every one of them, not any one of them. A head pushed to while a run was in
  flight carries a cancelled record beside a live one, which is the ordinary
  shape of working rather than a defect.
  */
  it('is ok when one pull_request run was cancelled and another reached a verdict', () => {
    expect(
      classify({
        runs: [run(ci, 'pull_request', 'completed', 'cancelled'), run(ci, 'pull_request', 'completed', 'failure')],
        ...old,
      }),
    ).toBe('ok')
    expect(
      classify({
        runs: [run(ci, 'pull_request', 'completed', 'cancelled'), run(ci, 'pull_request', 'in_progress')],
        ...old,
      }),
    ).toBe('ok')
  })

  /* A loud ending stays ok: a red run is mailed and is somebody else's to fix. */
  it('is ok for a conclusion that is loud', () => {
    for (const conclusion of ['failure', 'timed_out', 'success', 'neutral']) {
      expect(classify({ runs: [run(ci, 'pull_request', 'completed', conclusion)], ...old })).toBe('ok')
    }
  })

  /*
  A cancelled dispatch run is still dispatch-only rather than inconclusive. The
  conclusion is read on the pull_request runs, which are the ones the check job
  rides on; a dispatch run never carried the branch-name check or the merge ref
  and so has nothing of that to lose by being cancelled.
  */
  it('is dispatch-only when the only run is a cancelled dispatch', () => {
    expect(classify({ runs: [run(ci, 'workflow_dispatch', 'completed', 'cancelled')], ...old })).toBe('dispatch-only')
  })
})

describe('the commit status a verdict earns', () => {
  /*
  The defect this pins, plainly: every verdict that was not `missing` fell
  through to `success`, so a cancelled run took a green tick. `inconclusive` is
  red and says why in its own words rather than inheriting anybody's.
  */
  it('is never success for a head nothing verified', () => {
    expect(statusFor('missing').state).toBe('failure')
    expect(statusFor('inconclusive').state).toBe('failure')
  })

  it('is success only where a run reached a verdict, and claims nothing about it', () => {
    expect(statusFor('ok').state).toBe('success')
    expect(statusFor('dispatch-only').state).toBe('success')
    expect(statusFor('ok').description).toContain('says nothing about whether it passed')
  })

  /* Two failures share a state and differ in words, so the words must differ. */
  it('says which of the two failures it is', () => {
    expect(statusFor('missing').description).not.toBe(statusFor('inconclusive').description)
    expect(statusFor('inconclusive').description).toContain('cancelled or skipped')
  })

  /* GitHub truncates a status description past 140 characters. */
  it('fits in what GitHub will show', () => {
    for (const verdict of ['missing', 'inconclusive', 'ok', 'dispatch-only'] as const) {
      expect(statusFor(verdict).description.length).toBeLessThanOrEqual(140)
    }
  })
})

describe('the two flags that cannot be used together', () => {
  /*
  `--audit` reads state=all with grace 0 and age Infinity; `--write` posts a
  comment and a failing status. Together they post both on every closed and
  merged pull request whose head has no run - four of them in this repository
  on the day this was written, and one more each time a run record ages out. A
  comment on a merged pull request has no undo, which is why the refusal comes
  before the first network call rather than after a partial sweep.
  */
  it('is refused, and the message says which and why', () => {
    const refusal = modeRefusal({ audit: true, write: true })
    expect(refusal).toMatch(/--audit and --write cannot be used together/)
    expect(refusal).toMatch(/merged pull request/)
  })

  it('leaves each of them alone on its own', () => {
    expect(modeRefusal({ audit: true, write: false })).toBeUndefined()
    expect(modeRefusal({ audit: false, write: true })).toBeUndefined()
    expect(modeRefusal({ audit: false, write: false })).toBeUndefined()
  })

  /*
  The predicate above is pure and the flag parsing is not, so this drives the
  real command line. It is handed a repository and a token that would otherwise
  let it run: the refusal has to come before the usage check and before the
  first request, and an exit of 2 with that annotation is what shows it did.
  */
  it('exits 2 from the command line before it reads anything', () => {
    const script = fileURLToPath(new URL('../../scripts/pull-request-run-watchdog.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [script, '--audit', '--write'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REPOSITORY: 'zhssnym/dana', GITHUB_TOKEN: 'not-a-real-token' },
    })
    expect(result.status).toBe(2)
    expect(result.stdout).toContain('::error::--audit and --write cannot be used together')
  })
})

describe('how long a sha has been the head', () => {
  it('is the later of the pull request opening and the commit being made', () => {
    expect(headSince('2026-09-20T14:08:25Z', '2026-09-20T14:02:13Z').toISOString()).toBe('2026-09-20T14:08:25.000Z')
    expect(headSince('2026-09-20T14:08:25Z', '2026-09-20T14:48:25Z').toISOString()).toBe('2026-09-20T14:48:25.000Z')
  })

  it('never reports a negative age for a clock that disagrees', () => {
    const since = new Date('2026-09-20T14:08:25Z')
    expect(minutesSince(since, new Date('2026-09-20T14:00:00Z'))).toBe(0)
    expect(minutesSince(since, new Date('2026-09-20T14:18:25Z'))).toBe(10)
  })
})

describe('the comment left on a pull request with no run', () => {
  const body = commentBody({
    number: 244,
    headSha: '158768452f273bc239e722cac25a6a9aa16b4942',
    since: '2026-09-20T14:08:25.000Z',
    otherWorkflows: [],
    mergeable: null,
    mergeableState: 'unknown',
    runUrl: undefined,
  })

  /* The marker is the whole of the idempotency: one comment per head, ever. */
  it('carries a marker keyed by the head sha', () => {
    expect(body).toContain(`<!-- ${COMMENT_MARKER}:158768452f273bc239e722cac25a6a9aa16b4942 -->`)
  })

  it('says it is not the runner being asleep, which is what a reader will assume', () => {
    expect(body).toContain('not the runner being asleep')
  })

  /*
  Issue #248 asks for the branches this hits to be recorded and is explicit that
  a wrong cause written down is worse than none. The comment carries facts and
  says in terms that it is claiming nothing more.
  */
  it('records the facts and refuses the cause', () => {
    expect(body).toContain('asserted as nothing more than facts')
    expect(body).toContain('deliberately not guessed at')
  })
})

describe('the workflow that runs it', () => {
  const workflow = repositoryFile(WATCHDOG_WORKFLOW_PATH)

  /*
  It only executes while the machine is awake, which is why it can never report
  a sleeping runner as a missing event.
  */
  it('runs on the self-hosted runner', () => {
    expect(workflow).toContain('runs-on: [self-hosted, windows, x64]')
  })

  /*
  A workflow watching for a missing pull_request event cannot be woken only by
  pull_request events.
  */
  it('has a schedule, which is the trigger the failure cannot suppress', () => {
    expect(pullRequestTriggerFilters(workflow)).toEqual([])
    expect(workflow).toMatch(/^\s+- cron: '\*\/\d+ \* \* \* \*'$/m)
  })

  it('asks for the two writes it makes and no more', () => {
    expect(workflow).toContain('pull-requests: write')
    expect(workflow).toContain('statuses: write')
    expect(workflow).not.toContain('contents: write')
  })
})
