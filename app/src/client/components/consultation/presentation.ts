import type { NavigateFunction } from 'react-router'

import { openChatDock } from '../../state/chat-dock.js'
import {
  activeCollaboration,
  commitActiveTabRoute,
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
 * Commit the exact route to the active workspace tab before asking the router
 * to draw it. TabStrip also reconciles route changes, but that happens in a
 * passive effect; presentation switches must not leave a stale Discussion URL
 * behind if the user changes workspace tabs immediately after the click.
 */
function commitReturnRoute(targetPath: string): void {
  commitActiveTabRoute(targetPath)
}

/**
 * Leave focused Discussion and restore the exact saved Work/Task route with the
 * same Discussion beside it. Full page is an explicit focus mode, so its Back
 * action returns to the sidebar context rather than closing collaboration.
 */
export function leaveDiscussionFullScreen(
  navigate: NavigateFunction,
  targetPath: string,
): void {
  const current = activeCollaboration()
  commitReturnRoute(targetPath)
  void navigate(targetPath, { replace: true })
  globalThis.requestAnimationFrame(() => {
    if (current?.kind !== 'discussion') return
    openChatDock({
      folderId: current.folderId,
      discussionId: current.discussionId,
      filter: current.filter,
    })
  })
}

/**
 * Move the one Discussion presentation back beside the page it came from.
 * The tab's address is committed synchronously, then navigation happens before
 * the sidebar opens so full-screen and sidebar presentations are never drawn
 * together. The target is a complete in-app path rather than only a Folder id
 * because Discussion may have been expanded beside a Task or a particular
 * Work/Doc page with its own query state.
 */
export function moveDiscussionToSidebar(
  navigate: NavigateFunction,
  projectId: string,
  discussionId: string | null,
  targetPath: string,
): void {
  commitReturnRoute(targetPath)
  void navigate(targetPath, { replace: true })
  globalThis.requestAnimationFrame(() => {
    openChatDock({ folderId: projectId, discussionId })
  })
}
