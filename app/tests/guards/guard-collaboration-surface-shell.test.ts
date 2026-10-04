import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const main = readFileSync(new URL('../../src/client/main.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/client/styles/collaboration-surfaces.css', import.meta.url), 'utf8')

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

  test('removes visual rules between Discussion rows', () => {
    expect(css).toContain('div:has(> div > [aria-label="Show threads"]) > ul')
    expect(css).toContain('gap: var(--space-row)')
    expect(css).toContain('border-top-width: 0')
    expect(css).toContain('border-bottom-width: 0')
    expect(css).toContain('[aria-label="Loading threads"] > div')
  })
})
