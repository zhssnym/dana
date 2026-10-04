import type { NavigateFunction } from 'react-router'

import { openChatDock } from '../../state/chat-dock.js'
import {
  activeCollaboration,
  setActiveCollaboration,
  updateActiveCollaboration,
} from '../../shell/tabs.js'

/*
 * Expanding the sidebar into full screen leaves the Work/Task route. The exact
 * source path lives with the active workspace tab's Discussion state, rather
 * than in module-global memory, so two workspace tabs can never overwrite one
 * another's return context.
 */
export function rememberDiscussionReturnTo(projectId: string, path: string): void {
  updateActiveCollaboration((current) => {
    if (current?.kind !== 'discussion' || current.folderId !== projectId || current.returnTo === path) {
      return current
    }
    return { ...current, returnTo: path }
  })
}

export function discussionReturnTo(projectId: string): string | null {
  const current = activeCollaboration()
  return current?.kind === 'discussion' && current.folderId === projectId ? current.returnTo : null
}

/**
 * Leave full-screen Discussion completely and restore the saved source route.
 * The collaboration state clears after navigation has left the Discussion
 * surface so its route-seeding effect cannot immediately recreate it.
 */
export function leaveDiscussionFullScreen(
  navigate: NavigateFunction,
  targetPath: string,
): void {
  void navigate(targetPath, { replace: true })
  globalThis.requestAnimationFrame(() => {
    const current = activeCollaboration()
    if (current?.kind === 'discussion' && current.presentation === 'full') {
      setActiveCollaboration(null)
    }
  })
}

/**
 * Move the one Discussion presentation back beside the page it came from.
 * Navigation happens first so the sidebar and full-screen presentation are
 * never mounted at the same time. The target is a complete in-app path rather
 * than only a Folder id because Discussion may have been expanded beside a
 * Task or a particular Work/Doc page with its own query state.
 */
export function moveDiscussionToSidebar(
  navigate: NavigateFunction,
  projectId: string,
  discussionId: string | null,
  targetPath: string,
): void {
  void navigate(targetPath, { replace: true })
  globalThis.requestAnimationFrame(() => {
    openChatDock({ folderId: projectId, discussionId })
  })
}
