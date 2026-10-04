import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const main = readFileSync(new URL('../../src/client/main.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/client/styles/collaboration-surfaces.css', import.meta.url), 'utf8')
const list = readFileSync(new URL('../../src/client/components/consultation/DiscussionList.tsx', import.meta.url), 'utf8')

describe('collaboration surface shell polish', () => {
  test('loads the collaboration surface stylesheet after tokens', () => {
    expect(main).toContain("import './styles/tokens.css'\nimport './styles/collaboration-surfaces.css'")
  })

  test('keeps Discussion and Team below desktop workspace tabs', () => {
    expect(css).toContain('@media (min-width: 48rem)')
    expect(css).toContain('[data-chat-dock][aria-label="Discussion"]')
    expect(css).toContain('top: var(--row-height)')
    expect(css).toContain('[data-slot="sheet-content"][data-side="right"]:has([aria-label="Sharing panel"])')
    expect(css).toContain('height: calc(100dvh - var(--row-height))')
  })

  test('keeps compact sidebar rows and gives full-page rows clear boundaries', () => {
    expect(list).toContain("docked ? '-mx-2 gap-[var(--space-row)]' : 'divide-y divide-border'")
    expect(list).toContain("!docked && 'overflow-hidden rounded-md border border-border'")
    expect(css).not.toContain('div:has(> div > [aria-label="Show threads"]) > ul')
  })
})
