import type { Dispatch, SetStateAction } from 'react'

import {
  activeWorkspaceTabId,
  updateActiveCollaboration,
  useActiveCollaboration,
} from '../shell/tabs.js'
import type { CollaborationPresentation } from '../shell/tabs.js'

/*
 * Team is a non-modal side surface, so it has no Dialog trigger primitive to
 * return focus to for us. Keep the opener with the workspace tab that owns the
 * Team presentation: switching tabs leaves it untouched, switching back keeps
 * the same close destination, and closing Team never focuses a control from an
 * unrelated tab.
 */
const teamOpeners = new Map<string, HTMLElement>()

function rememberTeamOpener(tabId: string): void {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (active instanceof HTMLElement) teamOpeners.set(tabId, active)
}

function closeStartedInsideTeam(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof Element)) return false
  const sheet = active.closest('[data-slot="sheet-content"]')
  return sheet?.querySelector('[aria-label="Sharing panel"]') !== null
}

function restoreTeamOpener(tabId: string): void {
  const opener = teamOpeners.get(tabId)
  teamOpeners.delete(tabId)
  if (opener?.isConnected === true) opener.focus()
}

/**
 * React-state-shaped adapter for Team's open flag. FolderPage can keep its
 * existing control flow while the value itself belongs to the active workspace
 * tab instead of the mounted route component.
 */
export function useTeamPanelState(folderId: string): readonly [boolean, Dispatch<SetStateAction<boolean>>] {
  const collaboration = useActiveCollaboration()
  const open = collaboration?.kind === 'team' && collaboration.folderId === folderId
  const setOpen: Dispatch<SetStateAction<boolean>> = (next) => {
    const resolved = typeof next === 'function' ? next(open) : next
    const tabId = activeWorkspaceTabId()
    if (resolved) {
      if (!open) rememberTeamOpener(tabId)
      updateActiveCollaboration((current) => {
        if (current?.kind === 'team' && current.folderId === folderId) return current
        return { kind: 'team', folderId, presentation: 'sidebar' }
      })
      return
    }
    const restoreFocus = closeStartedInsideTeam()
    let closed = false
    updateActiveCollaboration((current) => {
      if (current?.kind !== 'team' || current.folderId !== folderId) return current
      closed = true
      return null
    })
    if (closed && restoreFocus) restoreTeamOpener(tabId)
  }
  return [open, setOpen] as const
}

/** Team's sidebar/full presentation, on the same workspace-tab record. */
export function useTeamPresentation(
  folderId: string,
): readonly [CollaborationPresentation, (next: CollaborationPresentation) => void] {
  const collaboration = useActiveCollaboration()
  const view =
    collaboration?.kind === 'team' && collaboration.folderId === folderId
      ? collaboration.presentation
      : 'sidebar'
  const setView = (next: CollaborationPresentation): void => {
    updateActiveCollaboration((current) => {
      if (current?.kind !== 'team' || current.folderId !== folderId || current.presentation === next) return current
      return { ...current, presentation: next }
    })
  }
  return [view, setView] as const
}
