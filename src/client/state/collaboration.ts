import type { Dispatch, SetStateAction } from 'react'

import {
  activeWorkspaceTabId,
  updateActiveCollaboration,
  useActiveCollaboration,
} from '../shell/tabs.js'
import type { CollaborationPresentation } from '../shell/tabs.js'

/*
 * Team is non-modal, so no Dialog returns focus. Keep its opener per workspace tab, so closing Team never
 * focuses a control from another tab.
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

/** React-state-shaped, so FolderPage keeps its control flow while the value lives on the workspace tab. */
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
    if (!closed) return
    if (restoreFocus) restoreTeamOpener(tabId)
    else teamOpeners.delete(tabId)
  }
  return [open, setOpen] as const
}

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
