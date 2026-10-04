import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../src/client/${path}`, import.meta.url), 'utf8')

const tabs = read('components/folder-tabs.tsx')
const dock = read('components/chat-dock/ChatDock.tsx')
const fullScreen = read('components/consultation/ConsultationPanel.tsx')
const header = read('components/folder-head.tsx')
const task = read('components/task-card.tsx')

describe('Discussion presentation refinement', () => {
  test('keeps Discussion out of the horizontal page strip and add menu', () => {
    expect(tabs).toContain("tabs.filter((tab) => tab.kind !== 'discussion')")
    expect(tabs).toContain("return ['doc', 'work']")
    expect(tabs).not.toContain("['doc', 'work', 'discussion']")
  })

  test('keeps the project header active in full screen and exposes Sidebar view', () => {
    expect(header).toContain("routePage.kind === 'discussion'")
    expect(header).toContain('aria-pressed="true"')
    expect(header).toContain('moveDiscussionToSidebar')
    expect(fullScreen).toContain('Sidebar view')
    expect(fullScreen).toContain('moveDiscussionToSidebar')
  })

  test('keeps sidebar identity compact and removes new task discussion actions for solo work', () => {
    expect(dock).toContain('<MessagesSquare')
    expect(dock).toContain('collaborative &&')
    expect(task).toContain('(collaborative || hasDiscussion)')
    expect(task).toContain('collaborative && mayDraw(facts, "discussion.create")')
  })
})
