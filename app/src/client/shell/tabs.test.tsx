import { describe, expect, it } from 'vitest'

import {
  activeCollaboration,
  activeWorkspaceTabId,
  openInNewTab,
  retarget,
  selectTab,
  setActiveCollaboration,
} from './tabs.js'

describe('workspace-tab collaboration state', () => {
  it('keeps Discussion and Team presentation state on the tab that owns it', () => {
    retarget('/app/folders/project-a?view=board#focus')
    setActiveCollaboration({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: '/app/folders/project-a?view=board#focus',
    })
    const tabA = activeWorkspaceTabId()
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: '/app/folders/project-a?view=board#focus',
    })

    openInNewTab('/app/folders/project-b')
    const tabB = activeWorkspaceTabId()
    expect(tabB).not.toBe(tabA)
    expect(activeCollaboration()).toBeNull()

    setActiveCollaboration({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
    retarget('/app/folders/project-b?member=member-b')

    expect(selectTab(tabA)).toBe('/app/folders/project-a?view=board#focus')
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: '/app/folders/project-a?view=board#focus',
    })

    expect(selectTab(tabB)).toBe('/app/folders/project-b?member=member-b')
    expect(activeCollaboration()).toEqual({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
  })
})
