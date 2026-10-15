import { spawnSync } from 'node:child_process'

const SHA = /^[a-f0-9]{40}$/

export function isAncestor(ancestor, descendant) {
  if (!SHA.test(ancestor) || !SHA.test(descendant)) return false
  return spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant]).status === 0
}

export async function productionSha() {
  try {
    const response = await fetch('https://dana.so/api/v1/build', {
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
