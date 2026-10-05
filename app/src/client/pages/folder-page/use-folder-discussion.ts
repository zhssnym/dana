// The Discussion sidebar's state on the folder page: the dock and its threads.
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
  /*
  The Discussion sidebar (#546) shares the right edge with the sharing panel,
  so opening one closes the other. Its button sits beside Team: one
  collaboration surface, two entry points. It shows once the project has a
  teammate, and stays while any thread exists, so removing teammates never
  hides a conversation that already happened.
  */
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
