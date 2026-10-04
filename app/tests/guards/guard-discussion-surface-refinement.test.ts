import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../src/client/${path}`, import.meta.url), 'utf8')

const list = read('components/consultation/DiscussionList.tsx')
const dock = read('components/chat-dock/ChatDock.tsx')
const tabs = read('components/folder-tabs.tsx')

describe('Discussion surface refinement', () => {
  test('uses compact filters instead of a nested list card', () => {
    expect(list).toContain('aria-label="Show threads"')
    expect(list).toContain('rounded-md bg-muted p-0.5')
    expect(list).toContain("bg-background text-foreground shadow-sm")
    expect(list).toContain("variant=\"ghost\"")
    expect(list).toContain('<Plus className="size-4"')
    expect(list).toContain('New thread')
    expect(list).toContain("'flex flex-col divide-y divide-border'")
    expect(list).not.toContain('overflow-hidden rounded-md border border-border')
    expect(list).not.toContain("variant={docked ? 'ghost' : 'commit'}")
  })

  test('keeps full-screen Discussion free of the horizontal page strip', () => {
    expect(tabs).toContain("const activeStored = tabs.find((tab) => tab.id === activeId)")
    expect(tabs).toContain("if (activeStored?.kind === 'discussion') return null")
  })

  test('matches the Team sidebar shell depth without carding thread rows', () => {
    expect(dock).toContain('bg-popover bg-clip-padding text-popover-foreground shadow-md')
    expect(list).toContain("'cursor-pointer hover:bg-hover'")
  })
})
