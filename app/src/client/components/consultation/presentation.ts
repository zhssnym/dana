import type { NavigateFunction } from 'react-router'

import { openChatDock } from '../../state/chat-dock.js'
import {
  activeCollaboration,
  commitActiveTabRoute,
  updateActiveCollaboration,
} from '../../shell/tabs.js'

// The return path lives in the active workspace tab, not module state, so two tabs
// cannot overwrite each other's return context.
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
 * TabStrip reconciles routes in a passive effect; commit now so a quick tab switch
 * does not keep a stale Discussion URL.
 */
function commitReturnRoute(targetPath: string): void {
  commitActiveTabRoute(targetPath)
}

/** Full page is a focus mode: Back returns to the sidebar beside the saved route. */
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

/** Navigate before the sidebar opens, so full-screen and sidebar never draw together. */
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
