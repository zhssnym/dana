import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../src/client/${path}`, import.meta.url), 'utf8')

const tabs = read('components/folder-tabs.tsx')
const dock = read('components/chat-dock/ChatDock.tsx')
const fullScreen = read('components/consultation/ConsultationPanel.tsx')
const header = read('components/folder-head.tsx')
const presentation = read('components/consultation/presentation.ts')
const task = read('components/task-card.tsx')

describe('Discussion presentation refinement', () => {
  test('keeps Discussion out of the horizontal page strip and add menu', () => {
    expect(tabs).toContain("tabs.filter((tab) => tab.kind !== 'discussion')")
    expect(tabs).toContain("return ['doc', 'work']")
    expect(tabs).not.toContain("['doc', 'work', 'discussion']")
    expect(tabs).toContain('const discussionFullScreen =')
    expect(tabs).toContain("query.get('conversation') === 'open'")
    expect(tabs).toContain('if (discussionFullScreen) return null')
    expect(tabs).toContain('if (!rowEditable && tools === undefined) return null')
  })

  test('keeps the project header as the full-screen presentation control', () => {
    expect(header).toContain("routePage.kind === 'discussion' || discussionAsked")
    expect(header).toContain('aria-current="page"')
    expect(header).toContain('Sidebar view')
    expect(header).toContain('discussionReturnTo(projectId)')
    expect(header).toContain('moveDiscussionToSidebar')
    expect(fullScreen).not.toContain('Sidebar view')
  })

  test('returns from full screen to the exact sidebar page and thread', () => {
    expect(dock).toContain('rememberDiscussionReturnTo')
    expect(dock).toContain('`${location.pathname}${location.search}${location.hash}`')
    expect(presentation).toContain('interface DiscussionReturnTarget')
    expect(presentation).toContain('targetPath: string')
    expect(presentation).toContain('openChatDock({ folderId: projectId, discussionId })')
  })

  test('keeps sidebar identity compact and removes new task discussion actions for solo work', () => {
    expect(dock).toContain('<MessagesSquare')
    expect(dock).toContain('bg-popover')
    expect(dock).toContain('shadow-md')
    expect(dock).toContain('collaborative &&')
    expect(task).toContain('(collaborative || hasDiscussion)')
    expect(task).toContain('collaborative && mayDraw(facts, "discussion.create")')
  })
})
