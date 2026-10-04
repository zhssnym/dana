import type { NavigateFunction } from 'react-router'

import { paths } from '../../routes.js'
import { openChatDock } from '../../state/chat-dock.js'

/**
 * Move the one Discussion presentation from its full-screen page back beside
 * the Work. Navigation happens first so ChatDock's route follower never sees
 * the sidebar and the full-screen Discussion page mounted at the same time.
 *
 * `targetPageId` differs from the project only for the rare project whose root
 * itself is the Discussion page; in that case a visible Work/Doc page is the
 * place the sidebar sits beside.
 */
export function moveDiscussionToSidebar(
  navigate: NavigateFunction,
  projectId: string,
  discussionId: string | null,
  targetPageId: string = projectId,
): void {
  void navigate(paths.folder(targetPageId), { replace: true })
  globalThis.requestAnimationFrame(() => {
    openChatDock({ folderId: projectId, discussionId })
  })
}
