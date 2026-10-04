import type { Dispatch, SetStateAction } from 'react'

import {
  setActiveCollaboration,
  updateActiveCollaboration,
  useActiveCollaboration,
} from '../shell/tabs.js'
import type { CollaborationPresentation } from '../shell/tabs.js'

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
    if (resolved) {
      updateActiveCollaboration((current) => {
        if (current?.kind === 'team' && current.folderId === folderId) return current
        return { kind: 'team', folderId, presentation: 'sidebar' }
      })
      return
    }
    updateActiveCollaboration((current) =>
      current?.kind === 'team' && current.folderId === folderId ? null : current,
    )
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

/** Explicit helper for callers that need to replace another collaboration panel. */
export function openTeamPanel(folderId: string): void {
  setActiveCollaboration({ kind: 'team', folderId, presentation: 'sidebar' })
}
