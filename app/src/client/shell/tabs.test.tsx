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
    retarget('/app/folders/project-a')
    setActiveCollaboration({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'sidebar',
    })
    const tabA = activeWorkspaceTabId()
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'sidebar',
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

    expect(selectTab(tabA)).toBe('/app/folders/project-a')
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'sidebar',
    })

    expect(selectTab(tabB)).toBe('/app/folders/project-b?member=member-b')
    expect(activeCollaboration()).toEqual({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
  })
})
