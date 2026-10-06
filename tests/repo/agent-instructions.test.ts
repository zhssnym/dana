/*
The agent instructions stay loadable and their pointers stay true.

`AGENTS.md` at the repository root is the one instruction file for every agent.
Claude Code reads it only when no `CLAUDE.md` exists, so a stray `CLAUDE.md`
(from `/init`, say) silently switches it off. The only `CLAUDE.md` allowed is a
one-line `@AGENTS.md` import. Codex caps the file at 32 KiB; this keeps it well
under that.

Pointers rot silently too, so every backticked repository path in `AGENTS.md`
and `docs/troubleshooting.md` must exist. Only tokens starting with `src/`, `db/`, `tests/`,
`docs/`, `.claude/` or `.github/` are checked; placeholders (`<`), globs (`*`)
and commands (spaces) are skipped.
*/
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AGENTS = path.join(ROOT, 'AGENTS.md')
const CLAUDE = path.join(ROOT, 'CLAUDE.md')
const TROUBLESHOOTING = path.join(ROOT, 'docs/troubleshooting.md')

const CHECKED_PREFIXES = ['src/', 'db/', 'tests/', 'docs/', '.claude/', '.github/']

function repoPathsIn(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]!
    if (!CHECKED_PREFIXES.some((prefix) => token.startsWith(prefix))) continue
    if (/[<*\s]/.test(token)) continue
    found.add(token)
  }
  return [...found]
}

function missingPaths(file: string): string[] {
  return repoPathsIn(readFileSync(file, 'utf8')).filter((token) => !existsSync(path.join(ROOT, token)))
}

describe('agent instructions', () => {
  it('AGENTS.md exists and is under 16 KiB', () => {
    expect(existsSync(AGENTS)).toBe(true)
    expect(statSync(AGENTS).size).toBeLessThan(16 * 1024)
  })

  it('no root CLAUDE.md shadows AGENTS.md, unless it only imports it', () => {
    if (!existsSync(CLAUDE)) return
    expect(readFileSync(CLAUDE, 'utf8').trim()).toBe('@AGENTS.md')
  })

  it('every backticked repository path in AGENTS.md exists', () => {
    expect(missingPaths(AGENTS)).toEqual([])
  })

  it.skipIf(!existsSync(TROUBLESHOOTING))(
    'every backticked repository path in docs/troubleshooting.md exists',
    () => {
      expect(missingPaths(TROUBLESHOOTING)).toEqual([])
    },
  )
})
