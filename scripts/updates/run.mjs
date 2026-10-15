import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'

import { github, owner, repository } from '../help/github.mjs'
import { checkUpdates, currentUpdates } from './check.mjs'
import { classifyPR } from './select.mjs'

const BASELINE = 'a25621c4a52fd65a88335f5803e2dd2466bc5090'
const LIVE_URL = 'https://dana.so/api/v1/build'
const BOT = process.env.HELP_BOT_TOKEN
const SHA = /^[a-f0-9]{40}$/

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

export function isAncestor(ancestor, descendant) {
  if (!SHA.test(ancestor) || !SHA.test(descendant)) return false
  return spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant]).status === 0
}

export async function productionSha() {
  try {
    const response = await fetch(LIVE_URL, {
      headers: { 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return null
    const { commit } = await response.json()
    return SHA.test(commit ?? '') ? commit : null
  } catch {
    return null
  }
}

async function mergedPullRequests() {
  const results = []
  for (let page = 1; page <= 4; page++) {
    const prs = await github('/repos/' + repository +
      '/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=' + page)
    results.push(...prs.filter((pr) => pr.merged_at && SHA.test(pr.merge_commit_sha ?? '')))
    if (prs.length < 100) break
  }
  return results
}

async function fileChanges(pr) {
  if (pr.changed_files > 100) return []
  return github('/repos/' + repository + '/pulls/' + pr.number + '/files?per_page=100')
}

async function reviewIssue(pr, reason) {
  const title = "Review What's New copy for PR #" + pr.number
  const found = await github('/search/issues?q=' + encodeURIComponent(
    'repo:' + repository + ' is:issue in:title "' + title + '"'
  ) + '&per_page=10')
  if (found.items?.some((item) => item.title === title)) return
  await github('/repos/' + repository + '/issues', {
    method: 'POST',
    body: {
      title,
      body: [
        'This deployed, potentially user-facing change needs a clearer release note.',
        '',
        'PR: https://github.com/' + repository + '/pull/' + pr.number,
        'Reason: ' + reason,
        '',
        'Add a clear user-facing summary to the PR or mark it with updates:skip if no announcement is needed.',
        'The next release-note scan can retry after correction.',
        '',
        'Related: #679.',
      ].join('\n'),
    },
  })
}

async function createUpdatePR(feed, live, prs) {
  const branch = 'automation/updates-' + live.slice(0, 12) + '-' + String(prs[0])
  const existing = await github('/repos/' + repository + '/pulls?state=all&head=' +
    encodeURIComponent(owner + ':' + branch) + '&per_page=10')
  if (existing.length > 0) {
    console.log('A release-note PR already exists for this deployment: #' + existing[0].number)
    return
  }
  const main = await github('/repos/' + repository + '/git/ref/heads/main')
  if (main.object.sha !== git('rev-parse', 'HEAD')) {
    console.log('Main changed while preparing updates. The next run will use the new main.')
    return
  }
  const content = JSON.stringify(feed, null, 2) + '\n'
  await github('/repos/' + repository + '/git/refs', {
    method: 'POST', useBot: true,
    body: { ref: 'refs/heads/' + branch, sha: main.object.sha },
  })
  const path = 'src/client/updates/feed.json'
  const file = await github('/repos/' + repository + '/contents/' + path + '?ref=' + encodeURIComponent(branch), { useBot: true })
  await github('/repos/' + repository + '/contents/' + path, {
    method: 'PUT', useBot: true,
    body: {
      branch,
      sha: file.sha,
      message: 'docs(updates): record deployed user-facing changes',
      content: Buffer.from(content, 'utf8').toString('base64'),
    },
  })
  const pr = await github('/repos/' + repository + '/pulls', {
    method: 'POST', useBot: true,
    body: {
      title: 'docs(updates): publish verified deployed changes',
      head: branch,
      base: 'main',
      body: [
        'Publish user-facing changes that have reached production.',
        '',
        'Production code commit: ' + live,
        'Included PRs: ' + prs.map((number) => '#' + number).join(', '),
        'Only the release history JSON changed; CI validates its copy and links.',
        '',
        '<!-- dana-updates-source:' + live + ' -->',
        '',
        'Related: #679.',
      ].join('\n'),
    },
  })
  console.log("Prepared What's New PR #" + pr.number + '.')
}

async function main() {
  const current = currentUpdates()
  if (!isAncestor(BASELINE, git('rev-parse', 'HEAD'))) {
    throw new Error('Release-note baseline is not in current main history')
  }
  const live = await productionSha()
  if (!live || !isAncestor(BASELINE, live) || !isAncestor(live, git('rev-parse', 'HEAD'))) {
    console.log('A production build matching main is not yet confirmed. Will retry.')
    return
  }
  if (!BOT) {
    console.log('HELP_BOT_TOKEN is not configured. Release-note generation is paused.')
    return
  }
  const open = await github('/repos/' + repository + '/pulls?state=open&per_page=100')
  if (open.some((pr) => pr.head?.ref?.startsWith('automation/updates-'))) {
    console.log('An update PR is already awaiting CI or merge.')
    return
  }

  const previous = new Set(current.entries.map((item) => item.pr))
  const all = await mergedPullRequests()
  const deployed = all.filter((pr) =>
    !previous.has(pr.number) &&
    isAncestor(BASELINE, pr.merge_commit_sha) &&
    isAncestor(pr.merge_commit_sha, live)
  ).sort((a, b) => b.merged_at.localeCompare(a.merged_at))

  const publishedAt = new Date().toISOString().slice(0, 10)
  const added = []
  const review = []
  for (const pr of deployed.slice(0, 30)) {
    const changed = await fileChanges(pr)
    const candidate = classifyPR(pr, changed)
    if (candidate.status === 'skip') continue
    if (candidate.status === 'review') {
      review.push({ pr, reason: candidate.reason })
      continue
    }
    added.push({
      id: 'pr-' + pr.number,
      publishedAt,
      historical: false,
      kind: candidate.kind,
      title: candidate.title,
      summary: candidate.summary,
      pr: pr.number,
      commit: pr.merge_commit_sha,
    })
    if (added.length === 6) break
  }
  for (const item of review.slice(0, 3)) await reviewIssue(item.pr, item.reason)
  if (added.length === 0) {
    console.log('No confirmed, meaningful new user-facing changes need publication.')
    return
  }
  const next = checkUpdates({ version: 1, entries: [...added, ...current.entries] })
  await createUpdatePR(next, live, added.map((item) => item.pr))
}

await main()
