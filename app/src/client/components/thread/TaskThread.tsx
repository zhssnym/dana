/*
A Task's Discussion tab (W-C): the task's comments as a thread, in the same
post list and composer as a folder's threads (`ThreadPosts`).

The read is `useThread(folder, task)`, the one `task-editing.tsx` already
holds for the card's Attachments block (one cache entry), polled every few
seconds while this tab is open (`useTaskThreadLive`). Who wrote
what is resolved off the roster the card already reads; what this viewer may
do is the folder row's gates (`lib/folder-authority.ts`), as everywhere else.

Read like a page's thread (r7): opening the tab, and every new post seen
while it is on screen, marks it read on the server (`PUT
/tasks/:id/thread/read`), which clears its bell rows. The previous mark is
where the reading starts, with "New" above the first post since. Chosen by
pointer, the tab puts the cursor in its reply box once it has landed at the
end, so typing never reaches the page's shortcuts.
*/
import { useCallback, useEffect, useMemo, useState } from 'react'

import { usePostComment } from '../../api/mutations.js'
import { useMarkTaskThreadRead, useTaskThreadLive } from '../../api/consultation.js'
import { useConnections, useFolder, useFolders, useMe } from '../../api/queries.js'
import { folderGates } from '../../lib/folder-authority.js'
import type { ThreadAuthority } from '../../lib/thread.js'
import { RosterTints } from '../default-avatar.js'
import { ThreadPosts } from './ThreadPosts.js'

const NOTHING: ThreadAuthority = { moderate: false, mutateOwnComment: false, likeComment: false, createComment: false }

export function TaskThread({ taskId, folderId }: { readonly taskId: string; readonly folderId: string | null }): React.JSX.Element {
  const thread = useTaskThreadLive(folderId, taskId)
  const me = useMe()
  const connections = useConnections()
  const folders = useFolders()
  const members = useFolder(folderId ?? '', folderId !== null).data?.members ?? []
  const post = usePostComment()
  const markRead = useMarkTaskThreadRead()

  /* The mark as it stood before this visit: undefined until the server says. */
  const [openAt, setOpenAt] = useState<string | null | undefined>(undefined)
  const comments = thread.data?.comments
  const newest = comments?.reduce<string>((latest, c) => (c.created_at > latest ? c.created_at : latest), '') ?? null
  useEffect(() => {
    if (newest === null) return
    let first = true
    const mark = (): void => {
      if (document.visibilityState !== 'visible') return
      void markRead(taskId).then((previous) => {
        if (first) setOpenAt((current) => (current === undefined ? previous : current))
        first = false
      })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => { document.removeEventListener('visibilitychange', mark) }
  }, [taskId, newest, markRead])

  const people = useMemo(() => {
    const map = new Map<string, { name: string; image?: string }>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) {
      map.set(viewer.id, { name: viewer.display_name, ...(viewer.avatar_url === null ? {} : { image: viewer.avatar_url }) })
    }
    for (const member of members) {
      const name = member.user.display_name
      if (name === null || map.has(member.user.id)) continue
      const image = member.user.avatar_url
      map.set(member.user.id, { name, ...(image === null ? {} : { image }) })
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name === null || map.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      map.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return map
  }, [connections.data, me.data?.user, members])
  const personOf = useCallback((id: string) => people.get(id) ?? { name: 'Someone' }, [people])

  const row = folders.data?.find((folder) => folder.id === folderId)
  const may = useMemo((): ThreadAuthority => {
    if (row === undefined) return NOTHING
    const gates = folderGates({ access: row.my_access, isOwner: row.is_owner, isDefault: row.is_default })
    return {
      moderate: gates.moderate,
      mutateOwnComment: gates.mutateOwnComment,
      likeComment: gates.likeComment,
      createComment: gates.createComment,
    }
  }, [row])

  /* A phone's keyboard is not opened uninvited. */
  const [pointer] = useState(() => globalThis.matchMedia?.('(pointer: fine)').matches ?? false)

  return (
    <RosterTints ids={members.map((member) => member.user.id)}>
      <ThreadPosts
        folderId={folderId}
        comments={comments}
        loading={folderId !== null && thread.isPending}
        failed={thread.isError}
        onRetry={() => void thread.refetch()}
        viewerId={me.data?.user.id ?? null}
        personOf={personOf}
        may={may}
        focusOnLand={pointer}
        {...(openAt === undefined ? {} : { openAt })}
        post={(body) => post.mutateAsync({ folderId: folderId ?? '', body, taskId })}
      />
    </RosterTints>
  )
}
