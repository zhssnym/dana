import { useEffect } from 'react'

import { closeChatDock, useChatDock } from '../../state/chat-dock.js'
import { useDiscussions } from '../../api/consultation.js'
import type { DiscussionListPage } from '../../api/consultation.js'
import { isUnread } from '../../components/consultation/DiscussionList.js'

export function useFolderDiscussion(
  headId: string,
  viewerId: string | null,
  sharing: boolean,
): {
  readonly dockOpen: boolean
  readonly threadRows: readonly DiscussionListPage['discussions'][number][]
  readonly unreadThreads: boolean
} {
  /* The dock shares the right edge with the Team panel, so opening one closes the other. */
  const dock = useChatDock()
  const dockOpen = dock !== null
  const threads = useDiscussions(headId, 'all', '')
  const threadRows = threads.data?.pages.flatMap((batch) => batch.discussions) ?? []
  const unreadThreads = threadRows.some((discussion) => discussion.state === 'open' && isUnread(discussion, viewerId))
  useEffect(() => {
    if (sharing) closeChatDock()
  }, [sharing])
  return { dockOpen, threadRows, unreadThreads }
}
