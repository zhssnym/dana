import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { github, owner, repository } from './github.mjs'

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
const run = event.workflow_run

if (process.env.HELP_AUTOPUBLISH !== 'true') {
  console.log('Automatic publication is disabled. Verified Help PRs remain open for review.')
  process.exit(0)
}
if (!process.env.HELP_BOT_TOKEN) throw new Error('HELP_BOT_TOKEN is required for automated merges')
if (run?.event !== 'pull_request' || run?.conclusion !== 'success' ||
  !run.head_branch?.startsWith('automation/help-')) {
  console.log('Not a successful Help automation PR CI run.')
  process.exit(0)
}

const candidates = await github('/repos/' + repository + '/pulls?state=open&head=' +
  encodeURIComponent(owner + ':' + run.head_branch) + '&per_page=10')
const pr = candidates.find((item) => !item.draft)
if (!pr || !pr.body) throw new Error('Expected a verified, ready Help PR for this CI run')

const author = await github('/user', { useBot: true })
if (pr.user?.login !== author.login) throw new Error('The PR author is not the configured Help bot')

const eventPR = run.pull_requests?.find((item) => item.number === pr.number)
if (!eventPR || eventPR.head?.sha !== pr.head?.sha) {
  throw new Error('CI did not test the current Help PR head')
}
const marker = /<!-- dana-help-verified:yes:([a-f0-9]{40}) -->/.exec(pr.body)
if (!marker || !run.head_branch.endsWith(marker[1].slice(0, 12))) {
  throw new Error('The verified deployed-source marker is missing or mismatched')
}
const sourceSha = marker[1]

const response = await github('/repos/' + repository + '/pulls/' + pr.number + '/files?per_page=100')
if (!Array.isArray(response) || response.length < 1 || response.length >= 100 ||
  response.some((file) => !/^src\/client\/help\/articles\/[a-z]+(?:-[a-z]+)*\.md$/.test(file.filename) ||
    !['added', 'modified'].includes(file.status))) {
  throw new Error('Help PR changes are outside the allowed article files')
}

const liveResponse = await fetch('https://dana.so/api/v1/build', {
  headers: { 'Cache-Control': 'no-cache' },
  cache: 'no-store',
  signal: AbortSignal.timeout(8_000),
})
if (!liveResponse.ok) throw new Error('Production build cannot be verified')
const live = (await liveResponse.json()).commit
if (!/^[a-f0-9]{40}$/.test(live)) throw new Error('Invalid production build identity')
const isDeployed = spawnSync('git', ['merge-base', '--is-ancestor', sourceSha, live]).status === 0
if (!isDeployed) throw new Error('The code described by the articles is not confirmed live')

const merged = await github('/repos/' + repository + '/pulls/' + pr.number + '/merge', {
  method: 'PUT', useBot: true,
  body: {
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: 'docs(help): verified deployed guidance (' + sourceSha.slice(0, 12) + ')',
  },
})
if (!merged.merged) throw new Error('GitHub did not merge the Help PR')
console.log('Merged verified Help PR #' + pr.number + '. The new articles become public after its own deployment.')
