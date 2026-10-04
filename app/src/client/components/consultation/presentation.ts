import type { NavigateFunction } from 'react-router'

import { openChatDock } from '../../state/chat-dock.js'

interface DiscussionReturnTarget {
  readonly projectId: string
  readonly path: string
}

/*
 * Expanding the sidebar into full screen leaves the Work/Task route. Keep that
 * presentation-only return target in memory so moving Discussion back to the
 * sidebar restores exactly what was beside it. A direct full-screen link has
 * no remembered target and uses the caller's safe fallback instead.
 */
let returnTarget: DiscussionReturnTarget | null = null

export function rememberDiscussionReturnTo(projectId: string, path: string): void {
  returnTarget = { projectId, path }
}

export function discussionReturnTo(projectId: string): string | null {
  return returnTarget?.projectId === projectId ? returnTarget.path : null
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
  returnTarget = null
  void navigate(targetPath, { replace: true })
  globalThis.requestAnimationFrame(() => {
    openChatDock({ folderId: projectId, discussionId })
  })
}
