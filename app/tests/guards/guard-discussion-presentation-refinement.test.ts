import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../src/client/${path}`, import.meta.url), 'utf8')

const tabs = read('components/folder-tabs.tsx')
const workspaceTabs = read('shell/tabs.ts')
const workspaceTabStrip = read('shell/TabStrip.tsx')
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

  test('makes project and task Discussion sidebar-first', () => {
    expect(dockState).toContain("presentation: 'sidebar'")
    expect(dockState).not.toContain("projectEntry ? 'full' : 'sidebar'")
    expect(dockState).not.toContain('returnTo: projectEntry ? currentPath()')
    expect(taskSurface).toContain('discussionId: linked.id')
    expect(dock).toContain('aria-label="Open full screen"')
  })

  test('gives explicit expand sole ownership of full-page navigation', () => {
    expect(dock).toContain('commitActiveTabRoute(target)')
    expect(dock).toContain('void navigate(target)')
    expect(header).not.toContain("collaboration.presentation !== 'full'")
    expect(header).not.toContain('useActiveCollaboration')
    expect(header).not.toContain('useNavigate')
    expect(header).not.toContain('discussionPage = allPages.find')
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

  test('keeps the exact return route on the workspace tab and restores sidebar context', () => {
    expect(workspaceTabs).toContain('readonly returnTo: string | null')
    expect(dock).toContain('rememberDiscussionReturnTo')
    expect(dock).toContain('commitActiveTabRoute(target)')
    expect(dock).toContain('`${location.pathname}${location.search}${location.hash}`')
    expect(presentation).toContain('activeCollaboration()')
    expect(presentation).toContain('current.returnTo')
    expect(presentation).not.toContain('let returnTarget')
    expect(presentation).toContain('targetPath: string')
    expect(presentation).toContain('openChatDock({')
    expect(presentation).not.toContain('setActiveCollaboration(null)')
    expect(workspaceTabStrip).toContain("current.presentation !== 'full'")
    expect(workspaceTabStrip).toContain('activeCollaboration.returnTo !== route')
  })

  test('uses one active collaboration icon and hierarchical full-page tab title', () => {
    expect(workspaceTabStrip).toContain("`${identity.title} · Discussion`")
    expect(workspaceTabStrip).toContain('icon: MessagesSquare')
    expect(workspaceTabStrip).toContain("`${identity.title} · Team`")
    expect(workspaceTabStrip).toContain('icon: UsersRound')
    expect(workspaceTabStrip).toContain("collaboration?.presentation === 'full'")
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
