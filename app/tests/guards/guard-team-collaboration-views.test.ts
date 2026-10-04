import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const team = readFileSync(
  new URL('../../src/client/pages/FolderSharingPanel.tsx', import.meta.url),
  'utf8',
)
const collaboration = readFileSync(
  new URL('../../src/client/state/collaboration.ts', import.meta.url),
  'utf8',
)
const tabs = readFileSync(
  new URL('../../src/client/shell/tabs.ts', import.meta.url),
  'utf8',
)
const folderPage = readFileSync(
  new URL('../../src/client/pages/FolderPage.tsx', import.meta.url),
  'utf8',
)

describe('Team collaboration views', () => {
  test('keeps sidebar and full page as two presentations of one tab-owned Team surface', () => {
    expect(tabs).toContain("export type CollaborationPresentation = 'sidebar' | 'full'")
    expect(tabs).toContain('readonly collaboration: CollaborationState | null')
    expect(collaboration).toContain('export function useTeamPresentation(')
    expect(team).toContain('useTeamPresentation(folder.id)')
    expect(team).toContain("const viewLabel = fullPage ? 'Open in side panel' : 'Open full page'")
    expect(team).toContain("setView('full')")
    expect(team).toContain("setView('sidebar')")
    expect(team).toContain('<UsersRound')
    expect(team).toContain('max-w-4xl')
  })

  test('makes the Team sidebar resizable with the shared collaboration width preference', () => {
    expect(team).toContain('useChatDockWidth()')
    expect(team).toContain('dockWidthBounds(windowWidth)')
    expect(team).toContain('useReserveRightEdge(sidebarWidth, !fullPage)')
    expect(team).toContain('aria-label="Resize Team"')
    expect(team).toContain('setChatDockWidth(')
    expect(team).toContain('onDoubleClick={() => { setChatDockWidth(clamp(DOCK_DEFAULT_WIDTH)) }}')
  })

  test('uses browser-addressed Team focus mode inside the current workspace tab', () => {
    expect(team).toContain("const TEAM_VIEW_PARAM = 'team'")
    expect(team).toContain("const TEAM_FULL_VALUE = 'full'")
    expect(team).toContain('routeFullPage')
    expect(team).toContain("next.set(TEAM_VIEW_PARAM, TEAM_FULL_VALUE)")
    expect(team).toContain("next.delete(TEAM_VIEW_PARAM)")
    expect(team).toContain("top: desktopFull ? '2rem' : '0'")
    expect(team).toContain("left: desktopFull ? 'var(--sidebar-width)' : '0'")
  })

  test('keeps Team focus bookkeeping on the owning workspace tab', () => {
    expect(collaboration).toContain('const teamOpeners = new Map<string, HTMLElement>()')
    expect(collaboration).toContain('activeWorkspaceTabId()')
    expect(collaboration).toContain('rememberTeamOpener(tabId)')
    expect(collaboration).toContain('restoreTeamOpener(tabId)')
    expect(collaboration).not.toContain('export function openTeamPanel(')
  })

  test('keeps the project header entry and its existing teammate label transition', () => {
    expect(folderPage).toContain('aria-expanded={sharing}')
    expect(folderPage).toContain("{members.length <= 1 ? 'Add teammates' : 'Team'}")
  })
})
