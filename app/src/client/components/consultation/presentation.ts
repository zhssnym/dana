import type { NavigateFunction } from 'react-router'

import { paths } from '../../routes.js'
import { openChatDock } from '../../state/chat-dock.js'

/**
 * Move the one Discussion presentation from its full-screen page back beside
 * the Work. Navigation happens first so ChatDock's route follower never sees
 * the sidebar and the full-screen Discussion page mounted at the same time.
 */
export function moveDiscussionToSidebar(
  navigate: NavigateFunction,
  projectId: string,
  discussionId: string | null,
): void {
  void navigate(paths.folder(projectId), { replace: true })
  globalThis.requestAnimationFrame(() => {
    openChatDock({ folderId: projectId, discussionId })
  })
}
