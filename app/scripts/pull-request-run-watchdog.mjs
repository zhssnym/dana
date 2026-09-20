/*
A pull request with no CI run at all, made loud.

**What this exists for.** Issue #248. Pull request #244 was opened at 14:08Z on
2026-09-20 and had no workflow run of any kind - not queued, not cancelled, not
failed, absent - and it sat looking mergeable for twenty minutes with zero
verification. Nothing on the page said so, because **the absence of a verdict
looks exactly like a passing one**: a red check gets looked at, and an empty
check list reads as "nothing to report". That was the third mechanism in one day
with the same consequence; the other two are understood and fixed (#242/#243,
and the correct `.claude/**` skip). This one is not, and the issue is explicit
that a wrong cause written down is worse than none.

So this file does not diagnose. It converts an absence into a presence: a red
commit status on the pull request's own head, a comment on the pull request, and
a non-zero exit from the workflow that runs it. **It reads for the presence of a
run and never for its conclusion.** A red CI run is already loud and is somebody
else's problem; the thing nobody can see is no run at all.

## The one thing that would make this cry wolf, and why it does not

CI here is a self-hosted runner on one Windows machine, started by a scheduled
task at logon, so there is no CI while that machine is off. A pushed branch
having no verdict *yet* is the normal overnight state and must never be reported
as this defect.

**It is not, because a run created while the runner is asleep still exists.**
GitHub creates the run record when the event fires and then looks for a runner;
with none online the run sits `queued`. Measured against this repository's own
history on 2026-09-20: run 24 was created 2026-09-02T19:44:53Z and started
2026-09-03T07:11:43Z, **eleven hours and twenty-seven minutes later**, and runs
26 and 31 carry gaps of eleven and six hours. Every one of them was a run record
for the whole of that wait. So the predicate here - *does a run record exist for
this head sha, whatever its status* - is true for an asleep runner and false only
when the event produced nothing.

There is a second, independent reason, and it is structural rather than
measured: the workflow that runs this file runs on the **same self-hosted
runner**, so while the machine is off this check does not execute at all. It
cannot report anything about a night it slept through, which is the correct
behaviour and not a gap.

## What it cannot see, said plainly

**It cannot catch its own pull request when the `pull_request` event is what
failed.** If an event never fires, it never fires for any workflow, this one
included. What covers that is the schedule in the workflow file, which does not
depend on the broken event, and the fact that the next pull request's event
re-checks every open pull request rather than only its own.

**It reads runs of `ci.yml` and nothing else**, matched by workflow path. That
is load-bearing rather than tidy: this file's own workflow triggers on
`pull_request`, so without the filter every head would have a run of *something*
and every verdict would be `ok`.

**It makes no claim about why.** Where a run is missing it reports the facts it
can see and stops: which other workflows did produce a run for that head, and
what GitHub says about the pull request's mergeability at that moment. Those two
are recorded because the issue asks for exactly that - "if this recurs, record
which branches it hits" - and because a second data point is worth more than any
guess. Neither is presented as a cause, and neither was chosen because anybody
believes it is one. They are the two facts about this moment that **stop being
recoverable once it passes**: the run list is retained, but which workflows had
fired by 14:19Z on a particular head is not, and `mergeable` is recomputed
continuously and keeps no history at all. Everything else about a flagged pull
request can be read back afterwards, so nothing else needs writing down here.

## The grace period, and the direction its error runs in

A head pushed seconds ago has no run for a few seconds, which is not this
defect. Nothing here is flagged until its head has been the head for
`--grace` minutes, default ten.

"Since when" is `max(pull request created_at, head commit committer date)`: the
earliest instant this sha could have been the head. A rebase or an amend sets the
committer date to the push, so for the shapes this project actually produces the
two agree closely. The residual error is a commit authored long before it was
pushed, where this reads the head as older than it is and would flag sooner than
the grace period intends - and that only matters if the run is *also* missing,
which is the defect itself. Reading it the other way, from `updated_at`, would
be bumped later by any comment and would delay a true flag instead. Flagging
early on a fault is recoverable; a delayed flag on a real one is the thing this
exists to prevent.

## The precondition it refuses to run without

`on.pull_request` in `ci.yml` carries no `types`, `paths`, `paths-ignore` or
`branches` filter, and that removal was deliberate (the branch-name check has to
see every pull request, #180). If one is ever added back, a pull request that
the filter legitimately skipped would have no run and this file would call it a
defect - crying wolf, which is precisely how a mechanism becomes one people
learn to skim past. So it reads that block and **refuses to run** rather than
reporting against a predicate that is no longer sound. That refusal is not a
veto on ever adding a filter; it is the requirement that whoever adds one deals
with this file in the same change.

The four historical pull requests whose head has no run - #54, #58, #144 and
#151, all between 2026-09-01 and 2026-09-04 - are that exact class: `on
.pull_request` carried a `paths-ignore` list until 2026-09-04, and each of those
four heads changed only files it named (`LICENSE`, `CLAUDE.md`, `docs/**`).
They are why the precondition is a refusal rather than a warning.
*/
import path from 'node:path'
import process from 'node:process'
import { appendFile, readFile } from 'node:fs/promises'
import { URL, fileURLToPath } from 'node:url'

/** The workflow whose runs count. Matched against a run's `path` field. */
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml'

/** The commit status context this file owns, and nothing else writes. */
export const STATUS_CONTEXT = 'ci/pull-request-has-a-run'

/** Hidden marker in a comment body, so the same head is never commented twice. */
export const COMMENT_MARKER = 'dana-pull-request-run-watchdog'

/** Minutes a head must have been the head before its emptiness means anything. */
export const DEFAULT_GRACE_MINUTES = 10

const API = 'https://api.github.com'

/**
 * The filter keys under `on: pull_request:` in a workflow file.
 *
 * Deliberately not a YAML parser: this reads one block whose shape is fixed and
 * throws on anything it does not recognise, because a reader that guesses would
 * report "no filters" for a file it failed to understand - which is the silent
 * false green this whole file exists to argue against.
 *
 * @param {string} yaml the text of a workflow file
 * @returns {string[]} the keys nested under `pull_request:`, empty when there are none
 */
export function pullRequestTriggerFilters(yaml) {
  const lines = yaml.split(/\r?\n/)
  const onAt = lines.findIndex((line) => /^on:\s*$/.test(line))
  if (onAt === -1) {
    const inline = lines.find((line) => /^on:\s*\S/.test(line))
    throw new Error(
      inline === undefined
        ? 'this reader found no `on:` key in the workflow file'
        : `this reader understands only the block form of \`on:\`, and found: ${inline.trim()}`,
    )
  }

  /** Lines belonging to the `on:` mapping: indented, to the first column-0 line. */
  const body = []
  for (const line of lines.slice(onAt + 1)) {
    if (line.trim() === '') continue
    if (!/^\s/.test(line)) break
    body.push(line)
  }

  const triggerAt = body.findIndex((line) => /^\s+pull_request:/.test(line))
  if (triggerAt === -1) {
    throw new Error('this reader found no `pull_request:` trigger under `on:`')
  }
  const trigger = body[triggerAt] ?? ''
  const after = trigger.slice(trigger.indexOf('pull_request:') + 'pull_request:'.length).trim()
  if (after !== '' && !after.startsWith('#')) {
    throw new Error(
      `this reader understands only the block form of \`pull_request:\`, and found: ${trigger.trim()}`,
    )
  }

  const indent = (trigger.match(/^\s*/) ?? [''])[0].length
  /** @type {string[]} */
  const filters = []
  for (const line of body.slice(triggerAt + 1)) {
    if (line.trim().startsWith('#')) continue
    const depth = (line.match(/^\s*/) ?? [''])[0].length
    if (depth <= indent) break
    const key = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*):/)
    if (key?.[1] !== undefined) filters.push(key[1])
  }
  return filters
}

/**
 * The earliest instant this sha can have been the pull request's head.
 *
 * @param {string} pullCreatedAt ISO 8601
 * @param {string} headCommittedAt ISO 8601
 * @returns {Date}
 */
export function headSince(pullCreatedAt, headCommittedAt) {
  const created = Date.parse(pullCreatedAt)
  const committed = Date.parse(headCommittedAt)
  return new Date(Math.max(Number.isNaN(created) ? 0 : created, Number.isNaN(committed) ? 0 : committed))
}

/**
 * One pull request's verdict.
 *
 * `runs` is every workflow run GitHub holds for this head sha, of every
 * workflow and every event. Nothing here reads a conclusion: a queued run, a
 * failed run and a cancelled run all mean a verdict exists or is coming, which
 * is the question.
 *
 * @param {{ runs: Array<{ path?: string, event?: string, status?: string }>, ageMinutes: number, graceMinutes: number }} input
 * @returns {'young' | 'ok' | 'dispatch-only' | 'missing'}
 */
export function classify({ runs, ageMinutes, graceMinutes }) {
  if (ageMinutes < graceMinutes) return 'young'
  const ci = runs.filter((run) => run.path === CI_WORKFLOW_PATH)
  if (ci.some((run) => run.event === 'pull_request')) return 'ok'
  if (ci.length > 0) return 'dispatch-only'
  return 'missing'
}

/** Minutes between two instants, floored at zero. */
export function minutesSince(since, now) {
  return Math.max(0, (now.getTime() - since.getTime()) / 60_000)
}

/**
 * The body of the comment left on a pull request with no run.
 *
 * @param {{ number: number, headSha: string, since: string, otherWorkflows: string[],
 *           mergeable: unknown, mergeableState: unknown, runUrl?: string }} input
 * @returns {string}
 */
export function commentBody({ number, headSha, since, otherWorkflows, mergeable, mergeableState, runUrl }) {
  return [
    `<!-- ${COMMENT_MARKER}:${headSha} -->`,
    `### No CI run exists for this pull request`,
    '',
    `\`${CI_WORKFLOW_PATH}\` has produced no workflow run for \`${headSha}\`, which has been`,
    `the head of #${number} since ${since}. Not queued, not cancelled, not failed - absent.`,
    '',
    '**This is not the runner being asleep.** A run created while the self-hosted runner is',
    'offline exists as a `queued` record from the moment the event fires; this head has no',
    'record of any status. It is also not a red run: this check never reads a conclusion.',
    '',
    '**What to do now.** Run `ci.yml` against the branch with `workflow_dispatch`, which',
    'queues immediately and runs all six steps against the branch rather than four against',
    'the merge ref. Do not merge on the strength of an empty check list.',
    '',
    '**Facts recorded for issue #248, and asserted as nothing more than facts:**',
    '',
    `- other workflows with a run for this head: ${otherWorkflows.length === 0 ? '_none_' : otherWorkflows.map((name) => `\`${name}\``).join(', ')}`,
    `- \`mergeable\`: \`${String(mergeable)}\`, \`mergeable_state\`: \`${String(mergeableState)}\``,
    '',
    'The cause of a missing run is not known and is deliberately not guessed at here.',
    'Issue #248 asks for the branches this hits to be recorded; that is what the two lines',
    'above are for.',
    ...(runUrl === undefined ? [] : ['', `[the run that wrote this](${runUrl})`]),
  ].join('\n')
}

/**
 * A GitHub REST call that fails loudly rather than returning something empty.
 *
 * `globalThis.fetch` rather than a bare `fetch` for the same reason gate.mjs
 * imports `process` from `node:process`: this project's eslint config declares
 * no node globals, so the bare spelling is `no-undef` even though node has had
 * it since 18.
 */
async function api(token, route, init = {}) {
  const response = await globalThis.fetch(route.startsWith('http') ? route : `${API}${route}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${init.method ?? 'GET'} ${route} answered ${response.status}: ${detail.slice(0, 400)}`)
  }
  return response.status === 204 ? null : response.json()
}

/** Every page of a list endpoint. */
async function all(token, route) {
  /** @type {any[]} */
  const items = []
  for (let page = 1; page <= 10; page += 1) {
    const joiner = route.includes('?') ? '&' : '?'
    const body = await api(token, `${route}${joiner}per_page=100&page=${page}`)
    const batch = Array.isArray(body) ? body : (body?.workflow_runs ?? [])
    items.push(...batch)
    if (batch.length < 100) break
  }
  return items
}

function annotate(level, message) {
  process.stdout.write(`::${level}::${message}\n`)
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? fallback : (argv[at + 1] ?? fallback)
  }

  const repo = flag('repo', process.env.GITHUB_REPOSITORY)
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const write = argv.includes('--write')
  const audit = argv.includes('--audit')
  const graceMinutes = Number(flag('grace', String(DEFAULT_GRACE_MINUTES)))

  if (repo === undefined || token === undefined) {
    process.stderr.write(
      'usage: node scripts/pull-request-run-watchdog.mjs [--repo owner/name] [--grace 10] [--write] [--audit]\n' +
        'GITHUB_REPOSITORY and GITHUB_TOKEN (or GH_TOKEN) must be set.\n',
    )
    process.exitCode = 2
    return
  }

  // A grace of NaN would compare false against every age and classify every
  // head the instant it appeared, which is the false positive this number
  // exists to prevent, arriving through the number itself.
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
    process.stderr.write(`--grace must be a number of minutes, and was ${JSON.stringify(flag('grace', ''))}\n`)
    process.exitCode = 2
    return
  }

  // The precondition. Read from the checkout rather than from the API, so that
  // a branch which adds a filter is refused by its own run rather than by the
  // next one.
  const ciPath = path.join(fileURLToPath(new URL('../../', import.meta.url)), CI_WORKFLOW_PATH)
  let filters
  try {
    filters = pullRequestTriggerFilters(await readFile(ciPath, 'utf8'))
  } catch (error) {
    annotate('error', `cannot read the pull_request trigger in ${CI_WORKFLOW_PATH}: ${String(error)}`)
    process.exitCode = 1
    return
  }
  if (filters.length > 0) {
    annotate(
      'error',
      `on.pull_request in ${CI_WORKFLOW_PATH} now carries ${filters.join(', ')}. ` +
        'This check reads a missing run as a defect, and a filter makes a missing run legitimate, ' +
        'so it would report a pull request the filter skipped as unverified. Teach this file about ' +
        'the filter, or take the filter out. Issue #248 carries the reasoning.',
    )
    process.exitCode = 1
    return
  }

  const now = new Date()
  const runUrl =
    process.env.GITHUB_RUN_ID === undefined
      ? undefined
      : `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`

  const pulls = await all(token, `/repos/${repo}/pulls?state=${audit ? 'all' : 'open'}&sort=created&direction=desc`)
  const lines = []
  let missing = 0
  let dispatchOnly = 0
  let refusedWrites = 0

  /*
  A write that is refused is a fault of this mechanism rather than of the pull
  request, and it must not take the rest of the run with it: one 403 on the
  first of five pull requests would otherwise leave the other four unexamined
  and unreported, which is the silence this file exists to end. So each write is
  attempted on its own, its refusal is annotated where it happened, and the run
  still goes red at the end.
  */
  const attempt = async (what, write_) => {
    try {
      await write_()
    } catch (error) {
      refusedWrites += 1
      annotate('error', `${what} was refused: ${String(error).replace(/\s+/g, ' ')}`)
    }
  }

  for (const pull of pulls) {
    const headSha = pull.head.sha
    const runs = await all(token, `/repos/${repo}/actions/runs?head_sha=${headSha}`)
    let since = new Date(Date.parse(pull.created_at))
    if (!audit) {
      const commit = await api(token, `/repos/${repo}/commits/${headSha}`).catch(() => null)
      since = headSince(pull.created_at, commit?.commit?.committer?.date ?? pull.created_at)
    }
    const ageMinutes = audit ? Number.POSITIVE_INFINITY : minutesSince(since, now)
    const verdict = classify({ runs, ageMinutes, graceMinutes: audit ? 0 : graceMinutes })
    const ciRuns = runs.filter((run) => run.path === CI_WORKFLOW_PATH)
    const otherWorkflows = [...new Set(runs.filter((run) => run.path !== CI_WORKFLOW_PATH).map((run) => run.name))]

    lines.push(
      `${verdict.padEnd(13)} #${String(pull.number).padEnd(5)} ${headSha.slice(0, 10)}  ${pull.head.ref}` +
        `  head since ${since.toISOString()}` +
        `  ci runs: ${ciRuns.length === 0 ? 'none' : ciRuns.map((run) => `${run.event}/${run.status}`).join(' ')}`,
    )

    if (verdict === 'dispatch-only') {
      dispatchOnly += 1
      annotate(
        'warning',
        `#${pull.number} (${pull.head.ref}) has a ci.yml run for ${headSha.slice(0, 10)} but none from the ` +
          'pull_request event. That is more verification than the check job gives, not less, and it is ' +
          'recorded here because issue #248 asks for the branches this happens on.',
      )
    }

    if (verdict === 'missing') {
      missing += 1
      const detail = await api(token, `/repos/${repo}/pulls/${pull.number}`).catch(() => null)
      annotate(
        'error',
        `#${pull.number} (${pull.head.ref}) has no ci.yml run for ${headSha.slice(0, 10)}, which has been its ` +
          `head since ${since.toISOString()}. Other workflows with a run for it: ` +
          `${otherWorkflows.length === 0 ? 'none' : otherWorkflows.join(', ')}. ` +
          `mergeable=${String(detail?.mergeable)} mergeable_state=${String(detail?.mergeable_state)}.`,
      )
      if (write) {
        await attempt(`the comment on #${pull.number}`, async () => {
          const comments = await all(token, `/repos/${repo}/issues/${pull.number}/comments`)
          const already = comments.some((comment) => comment.body?.includes(`${COMMENT_MARKER}:${headSha}`))
          if (already) return
          await api(token, `/repos/${repo}/issues/${pull.number}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              body: commentBody({
                number: pull.number,
                headSha,
                since: since.toISOString(),
                otherWorkflows,
                mergeable: detail?.mergeable,
                mergeableState: detail?.mergeable_state,
                runUrl,
              }),
            }),
          })
        })
      }
    }

    /*
    The status is posted only when it would change what the pull request shows.
    GitHub keeps every status ever posted against a sha and answers with the
    latest per context, and it caps them at a thousand per context per sha - a
    pull request left open for a week would reach that on its own at one tick
    every ten minutes, and the cap is reached silently. One read is cheaper than
    a write anyway.
    */
    if (write && verdict !== 'young') {
      const state = verdict === 'missing' ? 'failure' : 'success'
      await attempt(`the ${STATUS_CONTEXT} status on #${pull.number}`, async () => {
        const combined = await api(token, `/repos/${repo}/commits/${headSha}/status`).catch(() => null)
        const standing = combined?.statuses?.find((status) => status.context === STATUS_CONTEXT)
        if (standing?.state === state) return
        await api(token, `/repos/${repo}/statuses/${headSha}`, {
          method: 'POST',
          body: JSON.stringify({
            state,
            context: STATUS_CONTEXT,
            target_url: runUrl,
            description:
              verdict === 'missing'
                ? 'No ci.yml run exists for this head. Not queued, not failed - absent.'
                : 'ci.yml produced a run for this head. This says nothing about whether it passed.',
          }),
        })
      })
    }
  }

  const summary = [
    '```',
    `pull-request-run-watchdog  ${now.toISOString()}`,
    `repo         ${repo}`,
    `pull requests ${pulls.length}   grace ${audit ? 'n/a (audit)' : `${graceMinutes} min`}   writes ${write ? 'on' : 'off'}`,
    '',
    ...(lines.length === 0 ? ['no pull requests to read'] : lines),
    '',
    `missing ${missing}   dispatch-only ${dispatchOnly}   refused writes ${refusedWrites}`,
    '```',
  ].join('\n')

  process.stdout.write(`\n${summary}\n`)
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }

  // A refused write is red for the same reason a missing run is: a mechanism
  // that is not working and says nothing is the failure this file is about.
  process.exitCode = (missing > 0 && !audit) || refusedWrites > 0 ? 1 : 0
}

// The same entry guard gate.mjs and run-suite.mjs carry: the classifier and the
// trigger reader are worth importing on their own, and importing this file must
// not start calling GitHub to do it.
const entry = process.argv[1]
if (entry !== undefined && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    annotate('error', `the watchdog itself failed: ${String(error)}`)
    process.exitCode = 1
  })
}
