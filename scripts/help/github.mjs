import { Buffer } from 'node:buffer'

const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is required')
if (!token) throw new Error('GITHUB_TOKEN is required')

export const repository = repo
export const owner = repo.split('/')[0]

export async function github(path, { method = 'GET', body, useBot = false } = {}) {
  const credential = useBot ? process.env.HELP_BOT_TOKEN : token
  if (!credential) throw new Error('HELP_BOT_TOKEN is required to create a CI-triggering documentation PR')
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + credential,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('GitHub ' + method + ' ' + path + ' returned ' + response.status)
  if (response.status === 204) return null
  return response.json()
}

const CHECK = 'Dana Help Audit'

export async function hasHelpCheck(sha) {
  const result = await github('/repos/' + repo + '/commits/' + sha +
    '/check-runs?check_name=' + encodeURIComponent(CHECK) + '&per_page=10')
  return result.check_runs?.some((run) => run.name === CHECK && run.status === 'completed') ?? false
}

export async function recordHelpCheck(sha, conclusion, summary) {
  await github('/repos/' + repo + '/check-runs', {
    method: 'POST',
    body: {
      name: CHECK,
      head_sha: sha,
      status: 'completed',
      conclusion,
      output: {
        title: conclusion === 'success' ? 'Help documentation checked' : 'Help documentation requires attention',
        summary: summary.slice(0, 25_000),
      },
    },
  })
}

export async function openHelpIssue(sha, reason, impacted) {
  return github('/repos/' + repo + '/issues', {
    method: 'POST',
    body: {
      title: 'Help articles need review for ' + sha.slice(0, 12),
      body: [
        'A deployed code change may affect Dana Help, but automation could not verify the correct instructions.',
        '',
        '**Deployed commit:** ' + sha,
        '**Related articles:** ' + (impacted.length ? impacted.join(', ') : 'Not mapped yet'),
        '',
        '**Reason:** ' + reason.slice(0, 1500),
        '',
        'Check the current implementation and tests before editing or publishing any article.',
        '',
        'Tracked by #678.',
      ].join('\n'),
      labels: ['documentation'],
    },
  })
}

export async function openHelpPullRequest(sha, edits, { verified, reason }) {
  const branch = 'automation/help-' + sha.slice(0, 12)
  const existing = await github('/repos/' + repo + '/pulls?state=all&head=' +
    encodeURIComponent(owner + ':' + branch) + '&per_page=20')
  if (existing.length) return existing[0]

  const main = await github('/repos/' + repo + '/git/ref/heads/main', { useBot: true })
  await github('/repos/' + repo + '/git/refs', {
    method: 'POST',
    useBot: true,
    body: { ref: 'refs/heads/' + branch, sha: main.object.sha },
  })
  for (const edit of edits) {
    const path = 'src/client/help/articles/' + edit.slug + '.md'
    let blobSha
    const lookup = await fetch('https://api.github.com/repos/' + repo + '/contents/' + path +
      '?ref=' + encodeURIComponent(branch), {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + process.env.HELP_BOT_TOKEN,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (lookup.ok) blobSha = (await lookup.json()).sha
    else if (lookup.status !== 404) throw new Error('Cannot inspect article ' + path + ': ' + lookup.status)
    await github('/repos/' + repo + '/contents/' + path, {
      method: 'PUT',
      useBot: true,
      body: {
        message: 'docs(help): keep ' + edit.slug + ' current',
        content: Buffer.from(edit.markdown, 'utf8').toString('base64'),
        branch,
        ...(blobSha ? { sha: blobSha } : {}),
      },
    })
  }
  return github('/repos/' + repo + '/pulls', {
    method: 'POST',
    useBot: true,
    body: {
      title: 'docs(help): update guides for ' + sha.slice(0, 12),
      head: branch,
      base: 'main',
      draft: !verified,
      body: [
        'Help maintenance for deployed commit ' + sha + '.',
        '',
        verified ? 'Static checks, source citations, changed tests, and a separate documentation review passed.' :
          'Review required. Automation could not establish full confidence.',
        '',
        'Changed articles: ' + edits.map((edit) => edit.slug).join(', '),
        '',
        'Verification: ' + reason.slice(0, 1500),
        '',
        '<!-- dana-help-verified:' + (verified ? 'yes' : 'no') + ':' + sha + ' -->',
        '',
        'Related: #678.',
      ].join('\n'),
    },
  })
}
