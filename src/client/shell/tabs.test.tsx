import { describe, expect, it } from 'vitest'

import {
  activeCollaboration,
  activeWorkspaceTabId,
  closeTab,
  openInNewTab,
  retarget,
  selectTab,
  setActiveCollaboration,
} from './tabs.js'

describe('workspace-tab collaboration state', () => {
  it('keeps Discussion and Team presentation state on the tab that owns it', () => {
    const pathA = '/app/folders/project-a?view=board#focus'
    const pathB = '/app/folders/project-b?member=member-b'

    retarget(pathA)
    setActiveCollaboration({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: pathA,
    })
    const tabA = activeWorkspaceTabId()
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: pathA,
    })

    openInNewTab('/app/folders/project-b')
    const tabB = activeWorkspaceTabId()
    expect(tabB).not.toBe(tabA)
    expect(activeCollaboration()).toBeNull()
    /* Acknowledge the route returned by openInNewTab before ordinary query
       navigation, just as React Router/TabStrip do in the browser. */
    retarget('/app/folders/project-b')

    setActiveCollaboration({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
    retarget(pathB)

    expect(selectTab(tabA)).toBe(pathA)
    /* A passive effect from the tab we just left must not retarget tab A while
       its selected route is still in flight. */
    retarget(pathB)
    expect(activeWorkspaceTabId()).toBe(tabA)
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: pathA,
    })
    retarget(pathA)

    expect(selectTab(tabB)).toBe(pathB)
    retarget(pathA)
    expect(activeWorkspaceTabId()).toBe(tabB)
    expect(activeCollaboration()).toEqual({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
    retarget(pathB)

    /* Closing the active Team tab selects its neighbour without leaking Team
       into it; tab A resumes the exact Discussion state it owned. */
    expect(closeTab(tabB, '/app/today')).toBe(pathA)
    retarget(pathA)
    expect(activeWorkspaceTabId()).toBe(tabA)
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'full',
      returnTo: pathA,
    })
  })
})
