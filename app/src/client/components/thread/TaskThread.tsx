/*
A Task's Discussion tab (W-C): the task's comments as a thread, in the same
post list and composer as a folder's threads (`ThreadPosts`).

The read is `useThread(folder, task)`, the one `task-editing.tsx` already
holds for the card's Attachments block (one cache entry), polled every few
seconds while this tab is open (`useTaskThreadLive`). Who wrote
what is resolved off the roster the card already reads; what this viewer may
do is the folder row's gates (`lib/folder-authority.ts`), as everywhere else.
*/
import { useCallback, useMemo } from 'react'

import { usePostComment } from '../../api/mutations.js'
import { useTaskThreadLive } from '../../api/consultation.js'
import { useConnections, useFolders, useMe } from '../../api/queries.js'
import { folderGates } from '../../lib/folder-authority.js'
import type { ThreadAuthority } from '../../lib/thread.js'
import { ThreadPosts } from './ThreadPosts.js'

const NOTHING: ThreadAuthority = { moderate: false, mutateOwnComment: false, likeComment: false, createComment: false }

export function TaskThread({ taskId, folderId }: { readonly taskId: string; readonly folderId: string | null }): React.JSX.Element {
  const thread = useTaskThreadLive(folderId, taskId)
  const me = useMe()
  const connections = useConnections()
  const folders = useFolders()
  const post = usePostComment()

  const people = useMemo(() => {
    const map = new Map<string, { name: string; image?: string }>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) {
      map.set(viewer.id, { name: viewer.display_name, ...(viewer.avatar_url === null ? {} : { image: viewer.avatar_url }) })
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name === null || map.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      map.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return map
  }, [connections.data, me.data?.user])
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

  return (
    <ThreadPosts
      folderId={folderId}
      comments={thread.data?.comments}
      loading={folderId !== null && thread.isPending}
      failed={thread.isError}
      onRetry={() => void thread.refetch()}
      viewerId={me.data?.user.id ?? null}
      personOf={personOf}
      may={may}
      post={(body) => post.mutateAsync({ folderId: folderId ?? '', body, taskId })}
    />
  )
}
