import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  activeCollaboration,
  openInNewTab,
  retarget,
  selectTab,
  setActiveCollaboration,
  useTabs,
} from './tabs.js'

describe('workspace-tab collaboration state', () => {
  it('keeps Discussion and Team presentation state on the tab that owns it', () => {
    const { result } = renderHook(() => useTabs())

    act(() => {
      retarget('/app/folders/project-a')
      setActiveCollaboration({
        kind: 'discussion',
        folderId: 'project-a',
        discussionId: 'thread-a',
        filter: 'resolved',
        presentation: 'sidebar',
      })
    })
    const tabA = result.current.activeId
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'sidebar',
    })

    act(() => {
      openInNewTab('/app/folders/project-b')
    })
    const tabB = result.current.activeId
    expect(tabB).not.toBe(tabA)
    expect(activeCollaboration()).toBeNull()

    act(() => {
      setActiveCollaboration({
        kind: 'team',
        folderId: 'project-b',
        presentation: 'full',
      })
      retarget('/app/folders/project-b?member=member-b')
    })
    expect(result.current.tabs.find((tab) => tab.id === tabB)?.path).toBe(
      '/app/folders/project-b?member=member-b',
    )

    act(() => {
      selectTab(tabA)
    })
    expect(activeCollaboration()).toEqual({
      kind: 'discussion',
      folderId: 'project-a',
      discussionId: 'thread-a',
      filter: 'resolved',
      presentation: 'sidebar',
    })
    expect(result.current.tabs.find((tab) => tab.id === tabA)?.path).toBe('/app/folders/project-a')

    act(() => {
      selectTab(tabB)
    })
    expect(activeCollaboration()).toEqual({
      kind: 'team',
      folderId: 'project-b',
      presentation: 'full',
    })
    expect(result.current.tabs.find((tab) => tab.id === tabB)?.path).toBe(
      '/app/folders/project-b?member=member-b',
    )
  })
})
