import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { github, owner, repository } from '../help/github.mjs'
import { checkUpdates } from './check.mjs'
import { productionSha } from './run-utils.mjs'

if (process.env.UPDATES_AUTOPUBLISH !== 'true') {
  console.log('Automatic updates publishing is disabled.')
  process.exit(0)
}
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
const run = event.workflow_run
if (run?.event !== 'pull_request' || run.conclusion !== 'success' ||
  !run.head_branch?.startsWith('automation/updates-')) {
  console.log('Not a successful release history PR check.')
  process.exit(0)
}
if (!process.env.HELP_BOT_TOKEN) throw new Error('HELP_BOT_TOKEN is required for verified publishing')

const prs = await github('/repos/' + repository + '/pulls?state=open&head=' +
  encodeURIComponent(owner + ':' + run.head_branch) + '&per_page=10')
const pr = prs.find((item) => !item.draft)
if (!pr || !pr.body) throw new Error('No ready generated updates PR for this check run')
const bot = await github('/user', { useBot: true })
if (pr.user?.login !== bot.login) throw new Error('Release PR is not authored by the configured bot')
if (!run.pull_requests?.some((item) => item.number === pr.number && item.head?.sha === pr.head.sha)) {
  throw new Error('CI did not test the current PR head')
}
const marker = /<!-- dana-updates-source:([a-f0-9]{40}) -->/.exec(pr.body)
if (!marker || !run.head_branch.includes(marker[1].slice(0, 12))) {
  throw new Error('Production source attestation is missing')
}
const sourceSha = marker[1]
const live = await productionSha()
if (!live || spawnSync('git', ['merge-base', '--is-ancestor', sourceSha, live]).status !== 0) {
  throw new Error('Source commit is not verified as deployed; leaving the PR open')
}
const changed = await github('/repos/' + repository + '/pulls/' + pr.number + '/files?per_page=100')
if (changed.length !== 1 || changed[0].filename !== 'src/client/updates/feed.json' ||
  changed[0].status !== 'modified') {
  throw new Error('Generated release PR changes files outside the canonical updates feed')
}
async function feedFor(ref) {
  const file = await github('/repos/' + repository + '/contents/src/client/updates/feed.json?ref=' +
    encodeURIComponent(ref))
  if (file.encoding !== 'base64' || !file.content) throw new Error('Cannot inspect feed at ' + ref)
  return checkUpdates(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')))
}
const base = await feedFor('main')
const next = await feedFor(pr.head.sha)
const before = new Map(base.entries.map((item) => [item.id, JSON.stringify(item)]))
if (next.entries.length <= base.entries.length || next.entries.length > base.entries.length + 6 ||
  next.entries.some((item) => before.has(item.id) && before.get(item.id) !== JSON.stringify(item))) {
  throw new Error('Release PR changed existing announcements or added an unexpected number')
}
const added = next.entries.filter((item) => !before.has(item.id))
if (added.some((item) =>
  item.historical || spawnSync('git', ['merge-base', '--is-ancestor', item.commit, live]).status !== 0)) {
  throw new Error('Release PR contains an unverified or historical new announcement')
}
const merge = await github('/repos/' + repository + '/pulls/' + pr.number + '/merge', {
  method: 'PUT',
  useBot: true,
  body: {
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: 'docs(updates): publish deployed Dana changes',
  },
})
if (!merge.merged) throw new Error('GitHub did not merge the verified updates PR')
console.log('Merged verified updates PR #' + pr.number + '. The new feed becomes public with its production deploy.')
