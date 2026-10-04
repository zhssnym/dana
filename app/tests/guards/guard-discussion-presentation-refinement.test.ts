import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../src/client/${path}`, import.meta.url), 'utf8')

const tabs = read('components/folder-tabs.tsx')
const workspaceTabs = read('shell/tabs.ts')
const dockState = read('state/chat-dock.ts')
const dock = read('components/chat-dock/ChatDock.tsx')
const fullScreen = read('components/consultation/ConsultationPanel.tsx')
const header = read('components/folder-head.tsx')
const presentation = read('components/consultation/presentation.ts')
const task = read('components/task-card.tsx')
const taskSurface = read('components/task-surface.tsx')

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

  test('makes project Discussion full-screen-first without changing task sidebar entry points', () => {
    expect(dockState).toContain('next.discussionId === undefined')
    expect(dockState).toContain("const presentation = projectEntry ? 'full' : 'sidebar'")
    expect(dockState).toContain('returnTo: projectEntry ? currentPath()')
    expect(header).toContain("collaboration.presentation !== 'full'")
    expect(header).toContain("page.kind === 'discussion'")
    expect(header).toContain("params.set('conversation', 'open')")
    expect(taskSurface).toContain('discussionId: linked.id')
  })

  test('uses one Discussion context bar with navigation and an icon-only presentation switch', () => {
    expect(header).not.toContain('Sidebar view')
    expect(header).not.toContain('aria-current="page"')
    expect(fullScreen).toContain('data-discussion-context-bar')
    expect(fullScreen).toContain('Back to ${returnLabel}')
    expect(fullScreen).toContain('Open in side panel')
    expect(fullScreen).toContain('<PanelRight')
    expect(fullScreen).not.toContain('Sidebar view')
    expect(fullScreen).toContain('leaveDiscussionFullScreen')
    expect(fullScreen).toContain('moveDiscussionToSidebar')
  })

  test('keeps the exact return route on the workspace tab, not in module-global memory', () => {
    expect(workspaceTabs).toContain('readonly returnTo: string | null')
    expect(dock).toContain('rememberDiscussionReturnTo')
    expect(dock).toContain('`${location.pathname}${location.search}${location.hash}`')
    expect(presentation).toContain('activeCollaboration()')
    expect(presentation).toContain('current.returnTo')
    expect(presentation).not.toContain('let returnTarget')
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
